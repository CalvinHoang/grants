// Reads a DOCX the way the form anchors need it:
// - paragraphs: every w:p in word/document.xml in document order (tables included), with
//   `ordinal` (from 0) and `block`, the top-level body block it belongs to;
// - blocks: the top-level body blocks (a paragraph, or a whole table), in order, with their
//   flattened text. This is the unit SuperDoc's blocks.list and blocks.findText work in
//   (a table is one block), so block ordinals here equal SuperDoc's.
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m));

export async function readDocx(path) {
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file('word/document.xml').async('string');
  const body = xml.slice(xml.indexOf('<w:body>'), xml.lastIndexOf('</w:body>'));
  const paragraphs = [];
  const blocks = [];
  const open = [];
  let tableDepth = 0;
  let inText = false;
  const re = /<(\/?)w:(p|t|tab|tbl)\b[^>]*?(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(body));) {
    const [, close, tag, selfClose, text] = m;
    if (text !== undefined) {
      if (inText && open.length) open[open.length - 1].text += decode(text);
      continue;
    }
    if (tag === 'tbl') {
      if (close) tableDepth -= 1;
      else if (!selfClose) {
        if (tableDepth === 0 && open.length === 0) blocks.push({ ordinal: blocks.length, type: 'table', paragraphs: [] });
        tableDepth += 1;
      }
    } else if (tag === 'p') {
      if (close) { open.pop(); continue; }
      if (tableDepth === 0 && open.length === 0) blocks.push({ ordinal: blocks.length, type: 'paragraph', paragraphs: [] });
      const p = { ordinal: paragraphs.length, block: blocks.length - 1, text: '' };
      paragraphs.push(p);
      blocks[blocks.length - 1].paragraphs.push(p);
      if (!selfClose) open.push(p);
    } else if (tag === 't') {
      inText = !close && !selfClose;
    } else if (tag === 'tab' && !close && open.length) {
      open[open.length - 1].text += '\t';
    }
  }
  for (const b of blocks) b.text = b.paragraphs.map((p) => p.text).join('');
  return { paragraphs, blocks };
}

// A paragraph matches an anchor when its text, trimmed of leading and trailing whitespace,
// equals the anchor text exactly.
export const anchorKey = (text) => text.trim();

export function locate(paragraphs, text, fromOrdinal) {
  const key = anchorKey(text);
  return paragraphs.find((p) => p.ordinal >= fromOrdinal && anchorKey(p.text) === key) ?? null;
}

// SuperDoc blocks.findText: blocks whose flattened text contains the query, case-insensitive,
// no whitespace or Unicode normalisation. Returns the matching block ordinals in order.
export function findTextBlocks(blocks, query) {
  const q = query.toLowerCase();
  return blocks.filter((b) => b.text.toLowerCase().includes(q)).map((b) => b.ordinal);
}

// The form-map anchor for a paragraph: { text, ordinal } where `ordinal` is the index of the
// paragraph's block among blocks.findText(text) matches. Paragraphs inside a table can't be
// anchors (the whole table is one block).
export function anchorFor(blocks, paragraph) {
  const block = blocks[paragraph.block];
  if (block.type !== 'paragraph') throw new Error(`paragraph ${paragraph.ordinal} is inside a table`);
  const text = anchorKey(paragraph.text);
  const ordinal = findTextBlocks(blocks, text).indexOf(block.ordinal);
  if (ordinal < 0) throw new Error(`block ${block.ordinal} not found by its own text`);
  return { text, ordinal };
}
