// Checks the built CRC-P Round 19 package (grants/crcp-r19/) against the government
// originals. This is WP-12's done-check (issue #15):
//   - every requirement row's wording matches the government text exactly;
//   - an anchor is found in the government DOCX for 100% of the fields in form-map.json.
// plus cross-references between the package files and the rule language.
// Schema validation against @gw/shared runs in package.test.mjs.
//
// Run: node scripts/grant-package/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

import { DOCUMENTS, OUT, SRC, TABLE_COLUMNS } from './build.mjs';
import { anchorKey, findTextBlocks, readDocx } from './docx.mjs';
import { evaluate, parse } from './rules-lang.mjs';
import { isVerbatim, loadSources, normalise } from './verbatim.mjs';
import { validFacts, failingFacts } from './fixtures.mjs';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(join(OUT, f), 'utf8'));

export async function readTable() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(OUT, 'requirements-table.xlsx'));
  const ws = wb.worksheets[0];
  const header = ws.getRow(1).values.slice(1);
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const [id, wording, deliverable, formField, itemsFromClient] = row.values.slice(1).map((v) => (v == null ? '' : String(v)));
    rows.push({ id, wording, deliverable, formField, itemsFromClient });
  });
  return { sheet: ws.name, header, rows };
}

export async function checkPackage() {
  const results = [];
  const check = (name, problems, detail = '') => results.push({ name, pass: problems.length === 0, problems, detail });

  const manifest = readJson('manifest.json');
  const formMap = readJson('form-map.json');
  const questions = readJson('questions.json');
  const rulesFile = readJson('rules.json');
  const table = await readTable();
  const sources = loadSources(join(SRC, 'text'));
  const fieldIds = new Set(formMap.fields.map((f) => f.id));
  const rowIds = new Set(table.rows.map((r) => r.id));

  // Manifest and documents
  {
    const problems = [];
    for (const f of manifest.files) {
      const buf = readFileSync(join(OUT, f.path));
      if (sha256(buf) !== f.sha256 || buf.length !== f.bytes) problems.push(`${f.path}: size or hash differs from manifest`);
    }
    for (const [to, from] of Object.entries(DOCUMENTS)) {
      if (sha256(readFileSync(join(OUT, 'documents', to))) !== sha256(readFileSync(join(SRC, from)))) problems.push(`documents/${to} is not byte-identical to ${from}`);
      if (!manifest.files.some((f) => f.path === `documents/${to}`)) problems.push(`documents/${to} missing from manifest`);
    }
    check('manifest: every file present with matching SHA-256; documents byte-identical to the originals', problems, `${manifest.files.length} files`);
  }

  // Requirements table: exact columns, verbatim wording
  {
    const problems = [];
    if (JSON.stringify(table.header) !== JSON.stringify(TABLE_COLUMNS)) problems.push(`columns are ${JSON.stringify(table.header)}`);
    const seen = new Set();
    for (const r of table.rows) {
      if (seen.has(r.id)) problems.push(`${r.id}: duplicate ID`);
      seen.add(r.id);
      for (const [k, v] of Object.entries(r)) if (!v.trim()) problems.push(`${r.id}: empty ${k}`);
      for (const f of r.formField.split(', ')) if (!fieldIds.has(f)) problems.push(`${r.id}: form field ${f} not in form-map.json`);
    }
    check('requirements table: exactly the five spec 01 §4b columns, unique IDs, no empty cells, form fields exist', problems, `${table.rows.length} rows`);

    const wordingProblems = [];
    const bySource = { GL: 0, AF: 0 };
    for (const r of table.rows) {
      const src = isVerbatim(sources, 'GL', r.wording) ? 'GL' : isVerbatim(sources, 'AF', r.wording) ? 'AF' : null;
      if (!src) wordingProblems.push(`${r.id}: not found verbatim: ${r.wording.slice(0, 80)}`);
      else bySource[src] += 1;
    }
    check('requirement wording matches the government text exactly (whitespace and extraction list markers normalised only)', wordingProblems,
      `${bySource.GL} rows from the guidelines, ${bySource.AF} from the application form's own questions and declarations`);
  }

  // Form map: anchors resolve in the government DOCX
  {
    const { paragraphs, blocks } = await readDocx(join(OUT, 'documents', 'application-form.docx'));
    const problems = [];
    const resolve = (a) => {
      const ord = findTextBlocks(blocks, a.text)[a.ordinal];
      return ord === undefined ? null : blocks[ord];
    };
    let found = 0;
    let prevEnd = -1;
    for (const f of formMap.fields) {
      const a = resolve(f.anchor);
      const q = resolve(f.questionAnchor);
      const ok = a && q && anchorKey(a.text) === f.anchor.text && anchorKey(q.text) === f.questionAnchor.text
        && a.ordinal === f.position.block && q.ordinal <= a.ordinal && q.ordinal > prevEnd;
      if (!ok) { problems.push(`${f.id}: anchor not resolved to its block`); continue; }
      prevEnd = a.ordinal;
      const para = paragraphs[f.position.paragraph];
      if (para.block !== a.ordinal) problems.push(`${f.id}: position.paragraph ${para.ordinal} is not in block ${a.ordinal}`);
      const qPara = q.paragraphs[0];
      const question = paragraphs.slice(qPara.ordinal, para.ordinal + 1).map((p) => p.text.trim()).filter(Boolean).join('\n');
      if (question !== f.question) problems.push(`${f.id}: question is not the DOCX text between its anchors`);
      found += 1;
    }
    check('form map: anchor and question anchor found in the government DOCX for every field, in document order', problems,
      `${found}/${formMap.fields.length} fields (${blocks.length} blocks); SuperDoc itself: verify-superdoc.mjs`);

    const other = [];
    const bookmarks = new Set();
    for (const f of formMap.fields) {
      if (bookmarks.has(f.bookmark)) other.push(`${f.id}: bookmark ${f.bookmark} repeats`);
      bookmarks.add(f.bookmark);
      for (const r of f.rows) if (!rowIds.has(r)) other.push(`${f.id}: row ${r} not in the requirements table`);
      const stated = [...f.question.matchAll(/limited to (\d+) characters/g)].map((m) => Number(m[1]));
      const group = formMap.sharedBoxGroups.find((g) => g.fields.includes(f.id) && g.fields.length > 1);
      if (f.charLimit !== null && !stated.includes(f.charLimit)) other.push(`${f.id}: charLimit ${f.charLimit} not stated in its question`);
      if (f.charLimit === null && !f.parts && !group && stated.length) other.push(`${f.id}: question states a limit (${stated}) but charLimit is null`);
      for (const p of f.parts ?? []) if (p.charLimit && !stated.includes(p.charLimit)) other.push(`${f.id}: part "${p.label}" limit ${p.charLimit} not stated`);
      if (group && !stated.includes(group.charLimit) && f.id === group.fields.at(-1)) other.push(`${group.id}: group limit not stated`);
      if (f.condition && !fieldIds.has(f.condition.field)) other.push(`${f.id}: condition on unknown field`);
    }
    for (const g of formMap.sharedBoxGroups) for (const id of g.fields) if (!fieldIds.has(id)) other.push(`${g.id}: unknown field ${id}`);
    for (const r of table.rows) if (!formMap.fields.some((f) => f.rows.includes(r.id))) other.push(`${r.id}: no field answers it`);
    check('form map: character limits match the form text, bookmarks unique, rows and groups resolve', other);
  }

  // Questions
  {
    const problems = [];
    const byRow = new Map(table.rows.map((r) => [r.id, r]));
    const crit = new Map(questions.criteria.map((c) => [c.id, c]));
    const subs = new Map(questions.criteria.flatMap((c) => c.subcriteria.map((s) => [s.id, s])));
    for (const c of questions.criteria) {
      if (!isVerbatim(sources, 'GL', c.heading)) problems.push(`${c.id}: heading not verbatim`);
      for (const s of c.subcriteria) if (!isVerbatim(sources, 'GL', s.wording)) problems.push(`${s.id}: sub-criterion not verbatim`);
      if (c.subcriteria.reduce((n, s) => n + s.points, 0) !== c.points) problems.push(`${c.id}: sub-criterion points don't add up`);
    }
    for (const [k, t] of Object.entries(questions.texts)) if (!isVerbatim(sources, t.source, t.text)) problems.push(`text ${k}: not verbatim`);
    for (const [term, def] of Object.entries(questions.glossary)) if (!isVerbatim(sources, 'GL', `${term}\n${def}`)) problems.push(`glossary ${term}: not verbatim`);
    const count = { compelling: 0, eligible: 0 };
    for (const q of questions.questions) {
      if (q.rowId) {
        const row = byRow.get(q.rowId);
        if (!row) { problems.push(`${q.id}: row ${q.rowId} not in the table`); continue; }
        if (!normalise(q.template).includes(normalise(row.wording))) problems.push(`${q.id}: template doesn't carry the row wording`);
        count[q.family] += 1;
      }
      for (const p of q.stateRecipe) {
        if (typeof p === 'string') continue;
        if (p.type === 'criterion' && p.id && !crit.has(p.id)) problems.push(`${q.id}: unknown criterion ${p.id}`);
        if (p.type === 'subcriterion' && !subs.has(p.id)) problems.push(`${q.id}: unknown sub-criterion ${p.id}`);
        if (p.type === 'text' && !questions.texts[p.key]) problems.push(`${q.id}: unknown text ${p.key}`);
        if (p.type === 'glossary' && !questions.glossary[p.term]) problems.push(`${q.id}: unknown glossary term ${p.term}`);
        for (const f of p.fields ?? []) if (!fieldIds.has(f)) problems.push(`${q.id}: unknown field ${f}`);
      }
    }
    if (count.compelling !== 30) problems.push(`${count.compelling} P(compelling) questions, spec 02 has 30`);
    if (count.eligible !== 15) problems.push(`${count.eligible} P(eligible) questions, spec 02 has 15`);
    for (const id of ['GAP', 'DG-1', 'DG-2', 'DG-3', 'DG-4', 'OV-C', 'OV-E']) if (!questions.questions.some((q) => q.id === id)) problems.push(`missing ${id}`);
    check('questions: 30 compelling + 15 eligible + gap, digest and overall; verbatim state texts; recipes resolve', problems, `${questions.questions.length} questions`);
  }

  // Rules
  {
    const problems = [];
    const factNames = new Set(Object.keys(rulesFile.facts));
    const itemProps = new Set(Object.values(rulesFile.facts).flatMap((f) => Object.keys(f.item ?? {})).concat(['value']));
    const names = (n, out = []) => {
      if (!n || typeof n !== 'object') return out;
      if (n.k === 'name') out.push(n.name);
      for (const v of Object.values(n)) for (const x of Array.isArray(v) ? v : [v]) names(x, out);
      return out;
    };
    for (const r of rulesFile.rules) {
      let ast;
      try { ast = parse(r.check); } catch (e) { problems.push(`${r.id}: ${e.message}`); continue; }
      for (const n of names(ast)) if (!factNames.has(n) && !itemProps.has(n)) problems.push(`${r.id}: unknown fact ${n}`);
      for (const f of r.fields) if (!fieldIds.has(f)) problems.push(`${r.id}: unknown field ${f}`);
      for (const row of r.rows) if (!rowIds.has(row)) problems.push(`${r.id}: unknown row ${row}`);
      if (!r.inScope) continue;
      const pass = evaluate(r.check, validFacts);
      if (pass.result !== 'pass') problems.push(`${r.id}: ${pass.result} on the valid synthetic project`);
    }
    for (const [id, facts] of Object.entries(failingFacts)) {
      const r = rulesFile.rules.find((x) => x.id === id);
      if (evaluate(r.check, facts).result !== 'fail') problems.push(`${id}: doesn't fail on its failing case`);
    }
    for (const f of Object.values(rulesFile.facts)) if (f.field && !fieldIds.has(f.field)) problems.push(`fact on unknown field ${f.field}`);
    const ruleRows = new Set([...rulesFile.rules, ...rulesFile.notChecked].flatMap((r) => r.rows));
    // Every eligibility row is decided by a question, a rule, or the advisor's declaration (EL-16, EL-18).
    const asked = new Set(questions.questions.map((q) => q.rowId).filter(Boolean));
    for (const r of table.rows) {
      if (!r.id.startsWith('EL-') || /^EL-1[68]\./.test(r.id)) continue;
      if (!asked.has(r.id) && !ruleRows.has(r.id)) problems.push(`${r.id}: eligibility row with no question and no rule`);
    }
    check('rules: every check parses, reads only declared facts, passes a valid synthetic project and fails its failing cases', problems,
      `${rulesFile.rules.length} rules (${rulesFile.rules.filter((r) => r.inScope).length} in scope), ${rulesFile.notChecked.length} not checkable by code`);
  }

  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await checkPackage();
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    for (const p of r.problems.slice(0, 20)) console.log(`      ${p}`);
  }
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
