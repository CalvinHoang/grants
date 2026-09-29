// Builds the CRC-P Round 19 grant package (spec 05 §5.1) into grants/crcp-r19/ from
// the definitions in ./crcp-r19/ and the government originals in reference/crc-p/source/.
// Run: node tools/grant-package/build.mjs   then   node tools/grant-package/check.mjs
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import { anchorFor, locate, readDocx } from './docx.mjs';
import { loadSources, isVerbatim } from './verbatim.mjs';
import { LANGUAGE, parse } from './rules-lang.mjs';
import { criteria, rows } from './crcp-r19/requirements.mjs';
import { fields } from './crcp-r19/form-fields.mjs';
import { texts, glossary, templates, recipes, otherQuestions } from './crcp-r19/questions.mjs';
import { facts, rules } from './crcp-r19/rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const SRC = join(ROOT, 'reference', 'crc-p', 'source');
export const OUT = join(ROOT, 'grants', 'crcp-r19');
let outDir = OUT;

export const PACKAGE = {
  id: 'crcp-r19',
  name: 'CRC-P Round 19',
  grant: 'CRC-P',
  round: '19',
  version: '1.0.0',
  opened: '2026-03-18',
  closed: '2026-05-12T17:00:00+10:00',
};

// Package name → original in reference/crc-p/source/
export const DOCUMENTS = {
  'guidelines.pdf': 'crcp-r19-guidelines.pdf',
  'application-form.docx': 'crcp-r19-sample-application.docx',
  'application-form.pdf': 'crcp-r19-sample-application.pdf',
  'sample-grant-agreement.pdf': 'crcp-r19-sample-grant-agreement.pdf',
  'partners-agreement-template.docx': 'crcp-partners-agreement-template.docx',
  'financial-workbook.xlsx': 'crcp-r19-financial-workbook.xlsx',
  'program-faq.pdf': 'crc-program-faq.pdf',
};

export const TABLE_COLUMNS = ['ID', 'Exact guideline wording', 'Deliverable', 'Form field', 'Items from client'];

const Zip = JSZip;
const FIXED_DATE = new Date('2026-09-27T00:00:00Z');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const json = (o) => `${JSON.stringify(o, null, 2)}\n`;
// Word bookmark names: letters, digits and underscores, starting with a letter, ≤ 40 chars.
const bookmarkName = (id) => `GW_${id.replace(/[^A-Za-z0-9]/g, '_')}`;

function fail(msg) { throw new Error(msg); }

async function buildFormMap() {
  const docx = join(outDir, 'documents', 'application-form.docx');
  const { paragraphs, blocks } = await readDocx(docx);
  let cursor = 0;
  const out = [];
  for (const f of fields) {
    const start = locate(paragraphs, f.anchor, cursor) ?? fail(`${f.id}: anchor not found after paragraph ${cursor}: ${f.anchor}`);
    const [afterText, nth] = Array.isArray(f.answerAfter) ? f.answerAfter : [f.answerAfter ?? f.anchor, 1];
    let after = { ordinal: start.ordinal - 1 };
    for (let i = 0; i < nth; i++) {
      after = locate(paragraphs, afterText, after.ordinal + 1) ?? fail(`${f.id}: answerAfter not found: ${afterText}`);
    }
    cursor = after.ordinal + 1;
    const question = paragraphs
      .slice(start.ordinal, after.ordinal + 1)
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join('\n');
    const answers = rows.filter((r) => r.fields.includes(f.id)).map((r) => r.id);
    const parts = f.parts?.map((p) => (typeof p === 'string' ? { label: p } : p));
    out.push({
      id: f.id,
      label: f.label,
      question,
      kind: f.kind,
      charLimit: f.charLimit ?? null,
      anchor: anchorFor(blocks, after),
      rows: answers,
      sharedBoxGroup: f.shareGroup ?? null,
      questionAnchor: anchorFor(blocks, start),
      position: { block: after.block, paragraph: after.ordinal },
      bookmark: bookmarkName(f.id),
      ...(f.input ? { input: f.input } : {}),
      ...(f.repeat ? { repeat: { per: f.repeat, min: f.repeatMin ?? (f.repeat === 'partner' ? 3 : 1), max: f.repeatMax ?? null } } : {}),
      ...(parts ? { parts } : {}),
      ...(f.options ? { options: f.options } : {}),
      ...(f.fixedValue ? { fixedValue: f.fixedValue } : {}),
      ...(f.condition ? { condition: f.condition } : {}),
    });
  }
  if (new Set(out.map((f) => f.bookmark)).size !== out.length) fail('bookmark names collide');
  return {
    packageId: PACKAGE.id,
    version: PACKAGE.version,
    document: { path: 'documents/application-form.docx', sha256: sha256(await readFile(docx)), blocks: blocks.length },
    anchorRule: 'anchor is the block the answer box goes after; questionAnchor is the question\'s first block. Find either with SuperDoc blocks.findText({ text }) and take matches[ordinal] (findText is a case-insensitive substring match over top-level blocks, in document order). The block\'s text, trimmed, equals the anchor text. position.block is SuperDoc\'s top-level block ordinal and position.paragraph the w:p ordinal in word/document.xml, as fallbacks.',
    charCounting: 'Characters including spaces, as the portal counts them.',
    conditionRule: 'A field with a condition is asked only when the condition field has that answer. When the condition field is data, a Run fills it first and drafts the field if the answer matches. When it is confirm (blank until the advisor answers), the field waits: it is listed under Issues with its condition and is drafted with Draft once the advisor has answered.',
    sharedBoxGroups: [
      { id: 'AF-F.4', charLimit: 1000, fields: ['AF-F.4b', 'AF-F.4c'], note: 'One portal box per partner: "Your partner involvement response is limited to 1000 characters including spaces"' },
      ...[1, 2, 3, 4].map((n) => ({ id: `AF-I.${n}`, charLimit: 5000, fields: [`AF-I.${n}`], note: `All MC-${n} rows share this one box` })),
    ],
    fields: out,
  };
}

// The quoted wording goes into the question as one line; a closing full stop is added only
// when the statement doesn't already end in one.
function templateFor(r) {
  const quoted = `'${r.wording.replace(/\n/g, ' ')}'`;
  if (r.family === 'compelling') return templates.compelling.replace('\'{row}\'', quoted);
  const statement = (r.statement ?? '{row}').replace('{row}', quoted);
  const t = templates.eligible.replace('{statement}', statement);
  return /[.!?]'$/.test(t) ? t : `${t}.`;
}

function buildQuestions() {
  const perRow = rows
    .filter((r) => r.family === 'compelling' || r.family === 'eligible')
    .map((r) => ({
      id: `Q-${r.id}`,
      rowId: r.id,
      kind: 'probability',
      template: templateFor(r),
      stateRecipe: recipes[r.family](r),
      family: r.family,
      askedWhen: 'assess: each pass of every field the row is answered in',
      fields: r.fields,
      ...(r.anyOf ? { anyOfGroup: r.anyOf } : {}),
    }));
  const eligibleFields = [...new Set(rows.filter((r) => r.family === 'eligible').flatMap((r) => r.fields))];
  const others = otherQuestions.map((q) => ({
    id: q.id,
    rowId: null,
    kind: q.kind,
    template: q.prompt,
    stateRecipe: q.state.map((s) => (s.fields === 'eligible-rows' ? { ...s, fields: eligibleFields } : s)),
    ...(q.options ? { options: q.options.map((o) => o.value) } : {}),
    family: q.family,
    askedWhen: q.askedWhen,
    ...(q.options?.some((o) => o.meaning || o.perPartner) ? { optionDetails: q.options.map(({ value, meaning, next, perPartner }) => ({ value, ...(meaning ? { meaning } : {}), ...(next ? { next } : {}), ...(perPartner ? { meaning: 'one option per partner of this type, named' } : {}) })) } : {}),
    ...(q.suggestFloor ? { suggestFloor: q.suggestFloor } : {}),
  }));
  return {
    packageId: PACKAGE.id,
    version: PACKAGE.version,
    stateParts: {
      criterion: 'criterion heading and points (verbatim)',
      subcriterion: 'the full sub-criterion wording and points (verbatim)',
      row: 'the requirement row\'s verbatim wording, with its context sentence if it has one',
      rows: 'every requirement row of the given family',
      text: 'a verbatim text from `texts`, by key',
      glossary: 'a verbatim Glossary definition from `glossary`, by term',
      draft: 'the current text of the given fields',
      fields: 'other form fields, as drafted or filled',
      passages: 'digest passages for the row: `cited` by the draft, or all `linked` (confirmed)',
      reference: 'the matching answer from the reference application, if one was picked',
      project_scale: 'grant amount requested and project duration',
      rule_results: 'results of the code-checked rules (rules.json)',
      gap_context: 'the row\'s scores, the weak/fix explanation, and whether re-search found anything new',
      document: 'the document text (first ~28K tokens)',
      passage: 'one passage\'s exact text',
    },
    trimOrder: 'When the state is over the decider role\'s limit, drop parts with trim 1, then trim 2. Parts without trim are never dropped (spec 05 §7.5). Thresholds are set per decision model and question kind in models.json (spec 05 §8), not here.',
    criteria: criteria.map((c) => ({ id: c.id, field: c.field, points: c.points, ref: c.ref, heading: c.heading, subcriteria: c.subcriteria })),
    texts,
    glossary,
    questions: [...perRow, ...others],
  };
}

function buildRules() {
  const checked = rules.filter((r) => r.check);
  for (const r of checked) parse(r.check);
  return {
    packageId: PACKAGE.id,
    version: PACKAGE.version,
    language: LANGUAGE,
    facts,
    rules: checked.map(({ id, fields: fs, check, ...rest }) => ({ id, field: fs[0], check, fields: fs, ...rest })),
    notChecked: rules.filter((r) => !r.check).map((r) => ({ id: r.id, rows: r.rows, fields: r.fields, reason: r.note })),
  };
}

async function buildTable(path) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Grant Workbench';
  wb.created = FIXED_DATE;
  wb.modified = wb.created;
  const ws = wb.addWorksheet('Requirements', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: TABLE_COLUMNS[0], key: 'id', width: 12 },
    { header: TABLE_COLUMNS[1], key: 'wording', width: 80 },
    { header: TABLE_COLUMNS[2], key: 'deliverable', width: 18 },
    { header: TABLE_COLUMNS[3], key: 'fields', width: 22 },
    { header: TABLE_COLUMNS[4], key: 'items', width: 60 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({ id: r.id, wording: r.wording, deliverable: r.deliverable, fields: r.fields.join(', '), items: r.items });
  }
  ws.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });
  // Re-zip with fixed entry dates so the same definitions always give the same bytes.
  const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
  const fixed = new Zip();
  for (const name of Object.keys(zip.files).sort()) {
    const entry = zip.files[name];
    if (!entry.dir) fixed.file(name, await entry.async('nodebuffer'), { date: FIXED_DATE, createFolders: false });
  }
  await writeFile(path, await fixed.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'DOS' }));
}

export async function build(dir = OUT) {
  outDir = dir;
  // Wording is verified before anything is written.
  const sources = loadSources(join(SRC, 'text'));
  for (const r of rows) {
    if (!isVerbatim(sources, r.source, r.wording)) fail(`${r.id}: wording not found verbatim in ${r.source}: ${r.wording}`);
    if (r.context && !isVerbatim(sources, r.source, r.context)) fail(`${r.id}: context not found verbatim: ${r.context}`);
  }

  await mkdir(join(outDir, 'documents'), { recursive: true });
  for (const [to, from] of Object.entries(DOCUMENTS)) await copyFile(join(SRC, from), join(outDir, 'documents', to));

  await buildTable(join(outDir, 'requirements-table.xlsx'));
  await writeFile(join(outDir, 'form-map.json'), json(await buildFormMap()));
  await writeFile(join(outDir, 'questions.json'), json(buildQuestions()));
  await writeFile(join(outDir, 'rules.json'), json(buildRules()));

  const files = [];
  for (const f of [...Object.keys(DOCUMENTS).map((d) => `documents/${d}`), 'requirements-table.xlsx', 'form-map.json', 'questions.json', 'rules.json']) {
    const buf = await readFile(join(outDir, f));
    files.push({ path: f, bytes: buf.length, sha256: sha256(buf) });
  }
  await writeFile(join(outDir, 'manifest.json'), json({ ...PACKAGE, files }));
  console.log(`built ${relative(ROOT, outDir)}: ${rows.length} requirement rows, ${fields.length} fields, ${rules.length} rules`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().catch((e) => { console.error(e.message); process.exit(1); });
}
