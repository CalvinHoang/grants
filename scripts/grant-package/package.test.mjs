// WP-12 done-checks for the CRC-P Round 19 package, run in CI with the unit tests.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FormMap, GrantManifest, GrantQuestions, GrantRules, RequirementRow } from '@gw/shared';

import { build, OUT, SRC } from './build.mjs';
import { checkPackage, readTable } from './check.mjs';
import { anchorFor, findTextBlocks, readDocx } from './docx.mjs';
import { abnValid, evaluate, monthsBetween, parse } from './rules-lang.mjs';
import { isVerbatim, loadSources } from './verbatim.mjs';

const readJson = (f) => JSON.parse(readFileSync(join(OUT, f), 'utf8'));

describe('CRC-P Round 19 package (issue #15)', async () => {
  const results = await checkPackage();
  for (const r of results) {
    it(r.name, () => {
      expect(r.problems).toEqual([]);
    });
  }

  it('validates against the shared schemas', async () => {
    GrantManifest.parse(readJson('manifest.json'));
    const map = FormMap.parse(readJson('form-map.json'));
    expect(map.fields).toHaveLength(readJson('form-map.json').fields.length);
    // Nothing the package carries is dropped by the schema.
    expect(map).toEqual(readJson('form-map.json'));
    expect(GrantQuestions.parse(readJson('questions.json'))).toEqual(readJson('questions.json'));
    expect(GrantRules.parse(readJson('rules.json'))).toEqual(readJson('rules.json'));
    const { rows } = await readTable();
    for (const row of rows) RequirementRow.parse(row);
  });

  it('is exactly what build.mjs makes from the definitions', { timeout: 30000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crcp-r19-'));
    await build(dir);
    const files = (d) => readdirSync(d, { recursive: true }).filter((f) => f.includes('.')).sort();
    expect(files(dir)).toEqual(files(OUT));
    for (const f of files(OUT)) expect(readFileSync(join(dir, f)).equals(readFileSync(join(OUT, f))), f).toBe(true);
  });
});

describe('verbatim check', () => {
  const sources = loadSources(join(SRC, 'text'));
  it('accepts the guideline wording across list lines', () => {
    expect(isVerbatim(sources, 'GL', 'have an Australian Business Number (ABN)')).toBe(true);
    expect(isVerbatim(sources, 'GL', 'Eligible activities must directly relate to the project and must include at least one of the following:\nnew research\nproof of concept activities')).toBe(true);
  });
  it('rejects any change of wording or punctuation', () => {
    expect(isVerbatim(sources, 'GL', 'The remaining eligible project costs not covered by the grant amount must be covered by you and your partner\'s contributions.')).toBe(false);
    expect(isVerbatim(sources, 'GL', 'how your project will address an industry identified problem')).toBe(false);
    expect(isVerbatim(sources, 'GL', 'How your project will address an industry-identified problem')).toBe(false);
  });
});

describe('form anchors', async () => {
  const { paragraphs, blocks } = await readDocx(join(OUT, 'documents', 'application-form.docx'));
  it('reads the form as SuperDoc does: 500 top-level blocks, two of them tables', () => {
    expect(blocks).toHaveLength(500);
    expect(blocks.filter((b) => b.type === 'table')).toHaveLength(2);
  });
  it('counts findText matches as case-insensitive substrings', () => {
    expect(findTextBlocks(blocks, 'enter priority')).toHaveLength(4);
  });
  it('refuses a paragraph inside a table as an anchor', () => {
    const inTable = paragraphs.find((p) => blocks[p.block].type === 'table');
    expect(() => anchorFor(blocks, inTable)).toThrow(/inside a table/);
  });
});

describe('decision-model questions', () => {
  const qs = readJson('questions.json').questions;
  const q = (id) => qs.find((x) => x.id === id);
  it('asks exclusion rows as "the lead applicant is not"', () => {
    expect(q('Q-EL-12.1').template).toContain('The lead applicant is not \'a research organisation');
  });
  it('treats the two entity types as alternatives', () => {
    expect(q('Q-EL-04.1').anyOfGroup).toBe('EL-04');
    expect(q('Q-EL-04.2').anyOfGroup).toBe('EL-04');
  });
  it('ends each question with one full stop', () => {
    for (const x of qs.filter((y) => y.family === 'eligible')) expect(x.template).not.toMatch(/\.'\.$/);
  });
});

describe('rule language', () => {
  it('validates ABN checksums', () => {
    expect(abnValid('51 824 753 556')).toBe(true);
    expect(abnValid('51 824 753 557')).toBe(false);
    expect(abnValid('5182475355')).toBe(false);
  });
  it('counts a part month as a month', () => {
    expect(monthsBetween('2026-07-01', '2029-06-30')).toBe(36);
    expect(monthsBetween('2026-07-01', '2029-07-01')).toBe(36);
    expect(monthsBetween('2026-07-01', '2029-07-02')).toBe(37);
  });
  it('reports missing facts instead of failing', () => {
    expect(evaluate('headcount < 200', {})).toEqual({ result: 'missing', missing: ['headcount'] });
    expect(evaluate('not is_set(x) or x < 1', {})).toEqual({ result: 'pass' });
  });
  it('compares dates as dates and resolves item properties first', () => {
    expect(evaluate('all(ms, end <= end_date)', { end_date: '2029-06-30', ms: [{ end: '2029-06-30' }] }).result).toBe('pass');
  });
  it('treats a property other items have as missing, not as a top-level fact', () => {
    expect(evaluate('all(ms, end <= end_date)', { end_date: '2029-06-30', end: '2020-01-01', ms: [{ end: '2029-06-30' }, {}] }).result).toBe('missing');
  });
  it('rejects unknown functions', () => {
    expect(() => parse('eval(x)')).toThrow(/unknown function/);
  });
});
