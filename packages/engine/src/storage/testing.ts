// Test fixture: a small grant package shaped like WP-12's CRC-P package (§5.1), built from the
// public government documents in reference/crc-p/source. No client content (§10.3).
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FormMap, GrantManifest, GrantQuestions, GrantRules, RequirementRow } from "@gw/shared";
import { writeRequirementsTable } from "./tables";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const sourceDir = path.join(repoRoot, "reference", "crc-p", "source");

/** Package documents → the government originals they are copied from. */
const DOCUMENTS: Record<string, string> = {
  "guidelines.pdf": "crcp-r19-guidelines.pdf",
  "application-form.docx": "crcp-r19-sample-application.docx",
  "application-form.pdf": "crcp-r19-sample-application.pdf",
  "sample-grant-agreement.pdf": "crcp-r19-sample-grant-agreement.pdf",
  "partners-agreement-template.docx": "crcp-partners-agreement-template.docx",
  "financial-workbook.xlsx": "crcp-r19-financial-workbook.xlsx",
  "program-faq.pdf": "crc-program-faq.pdf",
};

/** Example rows from spec 01 §4b. */
export const FIXTURE_ROWS: RequirementRow[] = [
  {
    id: "MC-4a.2",
    wording: "justification for the funding amount requested",
    deliverable: "Application form",
    formField: "AF-I.4",
    itemsFromClient: "Budget and why this amount; board papers",
  },
  {
    id: "MC-4d.3",
    wording: "plans at the end of the project",
    deliverable: "Application form",
    formField: "AF-I.4",
    itemsFromClient: "Post-project commercialisation plan and funding; business plan",
  },
  {
    id: "EL-11.3",
    wording: "industry-led",
    deliverable: "Application form",
    formField: "AF-G.2",
    itemsFromClient: "Who identified and drives the project; lead SME's role",
  },
];

export async function writeFixturePackage(
  grantsDir: string,
  overrides: Partial<GrantManifest> = {},
): Promise<{ dir: string; manifest: GrantManifest }> {
  const manifest: GrantManifest = {
    id: "crcp-r19",
    name: "CRC-P Round 19",
    grant: "CRC-P",
    round: "19",
    version: "1.0.0",
    opened: "2026-03-01",
    closed: "2026-05-12",
    ...overrides,
  };
  const dir = path.join(grantsDir, manifest.id);
  await fs.mkdir(path.join(dir, "documents"), { recursive: true });
  for (const [name, original] of Object.entries(DOCUMENTS)) {
    await fs.copyFile(path.join(sourceDir, original), path.join(dir, "documents", name));
  }
  // Small public/synthetic text fixtures let WP-2 exercise every supported viewer format.
  await fs.writeFile(path.join(dir, "documents", "viewer-notes.md"), "# Viewer fixture\n\n- Markdown renders in-app.\n");
  await fs.writeFile(path.join(dir, "documents", "viewer-notes.txt"), "Plain text renders in-app.\n");
  await writeRequirementsTable(path.join(dir, "requirements-table.xlsx"), FIXTURE_ROWS);
  const formMap: FormMap = {
    packageId: manifest.id,
    fields: [
      {
        id: "AF-I.4",
        label: "Merit criterion 4",
        question: "Capacity, capability and resources to deliver the project",
        kind: "narrative",
        charLimit: 5000,
        anchor: { text: "Capacity, capability and resources to deliver the project", ordinal: 0 },
        rows: ["MC-4a.2", "MC-4d.3"],
        sharedBoxGroup: null,
      },
    ],
  };
  const questions: GrantQuestions = { packageId: manifest.id, questions: [] };
  const rules: GrantRules = { packageId: manifest.id, rules: [] };
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  await fs.writeFile(path.join(dir, "manifest.json"), json(manifest));
  await fs.writeFile(path.join(dir, "form-map.json"), json(formMap));
  await fs.writeFile(path.join(dir, "questions.json"), json(questions));
  await fs.writeFile(path.join(dir, "rules.json"), json(rules));
  return { dir, manifest };
}
