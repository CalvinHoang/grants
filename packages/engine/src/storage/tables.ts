// The two .xlsx tables (build spec §5.2): the requirements table (spec 01 §4b, copied from the grant
// package) and the digest table (spec 01 §5.1, generated). They are the source of truth for their
// contents and the advisor may edit them in Excel, so reading is tolerant of Excel's cell types and
// writing is atomic.
import { promises as fs } from "node:fs";
import ExcelJS from "exceljs";
import { DigestTableRow, LinkStatus, RequirementRow } from "@gw/shared";
import { writeFileAtomic } from "./atomic";

export const REQUIREMENTS_HEADERS = [
  "ID",
  "Exact guideline wording",
  "Deliverable",
  "Form field",
  "Items from client",
] as const;

export const DIGEST_HEADERS = [
  "Passage ID",
  "Source document",
  "Location",
  "Party",
  "Exact passage",
  "Requirement rows",
  "P(supports)",
  "Status",
  "Used in",
] as const;

/** Separator for the per-link lists in the digest table's Requirement rows, P(supports) and Status columns. */
export const LIST_SEPARATOR = "; ";

export class TableFormatError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(message);
    this.name = "TableFormatError";
  }
}

/** Text of a cell as the advisor sees it, whatever Excel stored (rich text, hyperlink, formula, number). */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("hyperlink" in value) return cellText(value.text as ExcelJS.CellValue);
    if ("formula" in value || "sharedFormula" in value) {
      return cellText((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    }
    if ("error" in value) return String(value.error);
  }
  return "";
}

async function loadWorkbook(file: string, bytes?: Uint8Array): Promise<ExcelJS.Workbook> {
  const data = bytes ?? (await fs.readFile(file));
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs' Buffer type predates Node's generic Buffer; the runtime value is what it expects.
    await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
  } catch {
    throw new TableFormatError(file, "The file is not a readable .xlsx workbook.");
  }
  return wb;
}

/** Reads the first worksheet: checks the header row, returns data rows as text cells (blank rows skipped). */
async function readSheet(
  file: string,
  headers: readonly string[],
  bytes?: Uint8Array,
): Promise<{ rowNumber: number; cells: string[] }[]> {
  const wb = await loadWorkbook(file, bytes);
  const ws = wb.worksheets[0];
  if (!ws) throw new TableFormatError(file, "The workbook has no worksheet.");
  const header = headers.map((_, i) => cellText(ws.getRow(1).getCell(i + 1).value).trim());
  headers.forEach((expected, i) => {
    if (header[i] !== expected) {
      throw new TableFormatError(file, `Column ${i + 1} must be headed "${expected}".`);
    }
  });
  const rows: { rowNumber: number; cells: string[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = headers.map((_, i) => cellText(row.getCell(i + 1).value));
    if (cells.every((c) => c.trim() === "")) return;
    rows.push({ rowNumber, cells });
  });
  return rows;
}

/**
 * Makes text survive the .xlsx round trip exactly (verbatim rule, §5.4). XML can't hold most control
 * characters (PDF and DOCX text carries \f and \v), XML parsers turn \r\n into \n, and readers decode `_xHHHH_` as a character, so
 * both are written in OOXML's own `_xHHHH_` escape, which exceljs and Excel decode on read.
 */
export function escapeCellText(text: string): string {
  return (
    text
      .replace(/_(x[0-9A-Fa-f]{4}_)/g, "_x005F_$1")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B-\u000D\u000E-\u001F\uFFFE\uFFFF]/g, (c) => `_x${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_`)
  );
}

/**
 * Writes a table's data rows. When the file already holds a valid table, only the data rows of its
 * first sheet are replaced, so what the advisor added in Excel (formatting, widths, filters, comments,
 * other sheets) is kept. Otherwise a fresh workbook is made. The write is atomic.
 */
async function writeTable(
  file: string,
  sheetName: string,
  headers: readonly string[],
  widths: number[],
  wrapColumns: number[],
  rows: string[][],
): Promise<Uint8Array> {
  let wb: ExcelJS.Workbook | null;
  let ws: ExcelJS.Worksheet | undefined;
  try {
    wb = await loadWorkbook(file);
    ws = wb.worksheets[0];
    const header = headers.map((_, i) => (ws ? cellText(ws.getRow(1).getCell(i + 1).value).trim() : ""));
    if (!ws || header.some((h, i) => h !== headers[i])) wb = null;
  } catch {
    wb = null; // Missing or unreadable: start fresh.
  }
  if (!wb || !ws) {
    wb = new ExcelJS.Workbook();
    wb.creator = "Grant Workbench";
    ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = headers.map((header, i) => ({ header, width: widths[i] ?? 20 }));
    ws.getRow(1).font = { bold: true };
    for (const c of wrapColumns) ws.getColumn(c).alignment = { wrapText: true, vertical: "top" };
  }
  // Overwrite data cells in place (row and column formatting stay), then blank any rows left over.
  const lastRow = ws.rowCount;
  rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    headers.forEach((_, c) => {
      row.getCell(c + 1).value = escapeCellText(r[c] ?? "");
    });
  });
  for (let n = rows.length + 2; n <= lastRow; n++) {
    const row = ws.getRow(n);
    headers.forEach((_, c) => {
      row.getCell(c + 1).value = null;
    });
  }
  const data = new Uint8Array(await wb.xlsx.writeBuffer());
  await writeFileAtomic(file, data);
  return data;
}

// ---- requirements table ----------------------------------------------------------------------

/** Reads the table from `file`, or from `bytes` already read from it. */
export async function readRequirementsTable(file: string, bytes?: Uint8Array): Promise<RequirementRow[]> {
  const rows = await readSheet(file, REQUIREMENTS_HEADERS, bytes);
  const seen = new Set<string>();
  return rows.map(({ rowNumber, cells }) => {
    const [id = "", wording = "", deliverable = "", formField = "", itemsFromClient = ""] = cells;
    // Wording is kept exactly as written (verbatim guideline text); only the ID is trimmed.
    const parsed = RequirementRow.safeParse({ id: id.trim(), wording, deliverable, formField, itemsFromClient });
    if (!parsed.success) {
      const column = parsed.error.issues[0]?.path[0] === "id" ? "ID" : "Exact guideline wording";
      throw new TableFormatError(file, `Row ${rowNumber}: ${column} is missing or not valid.`);
    }
    if (seen.has(parsed.data.id)) throw new TableFormatError(file, `Row ${rowNumber}: ID ${parsed.data.id} appears twice.`);
    seen.add(parsed.data.id);
    return parsed.data;
  });
}

/** Writes the whole table atomically. Returns the bytes written (for change detection). */
export async function writeRequirementsTable(file: string, rows: readonly RequirementRow[]): Promise<Uint8Array> {
  return writeTable(
    file,
    "Requirements",
    REQUIREMENTS_HEADERS,
    [12, 70, 20, 16, 50],
    [2, 5],
    rows.map((r) => [r.id, r.wording, r.deliverable, r.formField, r.itemsFromClient]),
  );
}

// ---- digest table ----------------------------------------------------------------------------

function splitList(cell: string): string[] {
  return cell
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export async function readDigestTable(file: string, bytes?: Uint8Array): Promise<DigestTableRow[]> {
  const rows = await readSheet(file, DIGEST_HEADERS, bytes);
  return rows.map(({ rowNumber, cells }) => {
    const [passageId = "", sourceDocument = "", location = "", party = "", passage = "", rowsCell = "", pCell = "", statusCell = "", usedIn = ""] =
      cells;
    const rowIds = splitList(rowsCell);
    const pList = splitList(pCell);
    const statusList = splitList(statusCell);
    const fail = (what: string): never => {
      throw new TableFormatError(file, `Row ${rowNumber}: ${what}.`);
    };
    if (pList.length > rowIds.length || statusList.length > rowIds.length) {
      fail("P(supports) and Status need one entry per requirement row");
    }
    const pSupports = rowIds.map((_, i) => {
      const raw = pList[i];
      if (raw === undefined || raw === "" || raw === "-") return null;
      const n = Number(raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : raw);
      return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fail(`P(supports) "${raw}" is not a probability`);
    });
    const statuses = rowIds.map((_, i) => {
      // A row the advisor typed in by hand, without a status, is an advisor-added link.
      const raw = (statusList[i] ?? "advisor-added").toLowerCase().replace(/ by advisor$/, "").replace(/\s+/g, "-");
      const normal = raw === "added" ? "advisor-added" : raw;
      const s = LinkStatus.safeParse(normal);
      return s.success ? s.data : fail(`Status "${statusList[i]}" is not one of ${LinkStatus.options.join(", ")}`);
    });
    const parsed = DigestTableRow.safeParse({
      passageId: passageId.trim(),
      sourceDocument,
      location,
      party,
      passage,
      rowIds,
      pSupports,
      statuses,
      usedIn,
    });
    if (!parsed.success) fail(`${String(parsed.error.issues[0]?.path[0] ?? "a cell")} is not valid`);
    return parsed.data as DigestTableRow;
  });
}

export async function writeDigestTable(file: string, rows: readonly DigestTableRow[]): Promise<Uint8Array> {
  return writeTable(
    file,
    "Digest",
    DIGEST_HEADERS,
    [10, 30, 16, 22, 80, 22, 14, 22, 20],
    [5],
    rows.map((r) => [
      r.passageId,
      r.sourceDocument,
      r.location,
      r.party,
      r.passage,
      r.rowIds.join(LIST_SEPARATOR),
      r.pSupports.map((p) => (p === null ? "-" : String(p))).join(LIST_SEPARATOR),
      r.statuses.join(LIST_SEPARATOR),
      r.usedIn,
    ]),
  );
}
