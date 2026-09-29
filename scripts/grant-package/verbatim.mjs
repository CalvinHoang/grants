// Verbatim check for requirement wording: a row's wording must appear in the government
// text exactly, after normalising only whitespace and the list and table markers the
// text extraction added (leading "- ", "# ", "| "). Characters, punctuation, quotes and
// case are compared as they are.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCES = {
  GL: 'crcp-r19-guidelines.txt',
  AF: 'crcp-r19-sample-application.txt',
};

export function normalise(s) {
  return s
    .split('\n')
    .map((l) => l.replace(/^\s*(?:#{1,6}\s+|-\s+|\|\s*)/, '').replace(/\s*\|\s*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadSources(textDir) {
  const out = {};
  for (const [k, f] of Object.entries(SOURCES)) {
    // The extraction joins table cells with " | " and paragraphs inside a cell with " / ".
    out[k] = normalise(readFileSync(join(textDir, f), 'utf8').replace(/ \| | \/ /g, '\n'));
  }
  return out;
}

export function isVerbatim(sources, source, text) {
  return sources[source].includes(normalise(text));
}
