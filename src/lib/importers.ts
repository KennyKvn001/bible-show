import type { BibleData } from './bible.ts';
import { BOOKS, BOOK_CODES, bookByCode, bookByOsis } from './books.ts';

/**
 * Parses USFM, Zefania XML, OSIS XML, USFX XML, or JSON Bible files into BibleData.
 * Uses a small tag tokenizer instead of DOMParser so it also runs in Node (scripts/build-data.mjs).
 */
export function parseBible(text: string): BibleData {
  const head = text.slice(0, 4000).replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return parseJson(JSON.parse(text));
  if (head.startsWith('\\') || /^\\(id|c|v) /m.test(head)) return parseUsfm(text);
  if (/<XMLBIBLE|<BIBLEBOOK/i.test(head) || /<BIBLEBOOK/.test(text.slice(0, 200000))) return parseZefania(text);
  if (/<osis[\s>]/.test(head) || /<osis[\s>]/.test(text.slice(0, 20000))) return parseOsis(text);
  if (/<usfx[\s>]/.test(text.slice(0, 20000))) return parseUsfx(text);
  throw new Error('Unrecognised file. Supported formats: USFM, Zefania XML, OSIS XML, USFX XML and JSON.');
}

/** Combines Bibles split over several files (for example one USFM file per book). Later files win on overlap. */
export function mergeBibles(parts: BibleData[]): BibleData {
  const out: BibleData = { books: {}, names: {} };
  for (const p of parts) {
    Object.assign(out.books, p.books);
    Object.assign(out.names!, p.names ?? {});
  }
  if (!Object.keys(out.names!).length) delete out.names;
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = decode(m[2] ?? m[3] ?? '');
  return out;
}

interface Token {
  close: boolean;
  selfClose: boolean;
  name: string;
  attrs: Record<string, string>;
  text?: string;
}

function* tokens(xml: string): Generator<Token> {
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (const m of xml.matchAll(re)) {
    if (m[6] !== undefined) yield { close: false, selfClose: false, name: '#text', attrs: {}, text: decode(m[6]) };
    else if (m[1] !== undefined) yield { close: false, selfClose: false, name: '#text', attrs: {}, text: m[1] };
    else if (m[3] !== undefined) yield { close: m[2] === '/', selfClose: m[5] === '/', name: m[3], attrs: m[2] ? {} : attrs(m[4]) };
  }
}

class Builder {
  books: Record<string, string[][]> = {};
  names: Record<string, string> = {};
  private buf = '';
  private target: [string, number, number] | null = null;

  start(book: string, chapter: number, verse: number) {
    this.end();
    if (!book || !chapter || !verse) return;
    this.target = [book, chapter, verse];
  }
  add(s: string) {
    if (this.target) this.buf += s;
  }
  end() {
    if (this.target) {
      const [book, c, v] = this.target;
      const text = this.buf.replace(/\s+/g, ' ').trim();
      const chapters = (this.books[book] ??= []);
      const verses = (chapters[c - 1] ??= []);
      verses[v - 1] = verses[v - 1] ? `${verses[v - 1]} ${text}` : text;
    }
    this.target = null;
    this.buf = '';
  }
  result(): BibleData {
    this.end();
    for (const chapters of Object.values(this.books)) {
      for (let c = 0; c < chapters.length; c++) chapters[c] = Array.from(chapters[c] ?? [], (s) => s ?? '');
    }
    if (!Object.keys(this.books).length) throw new Error('No verses found in this file.');
    return { books: this.books, names: Object.keys(this.names).length ? this.names : undefined };
  }
}

/** Runs the tokenizer, skipping text inside the given elements (notes, headings, cross references). */
function walk(xml: string, skip: Set<string>, onTag: (t: Token) => void, onText: (s: string) => void) {
  let depth = 0;
  for (const t of tokens(xml)) {
    if (t.name === '#text') {
      if (!depth) onText(t.text!);
      continue;
    }
    if (skip.has(t.name)) {
      if (!t.selfClose) depth += t.close ? -1 : 1;
      if (depth < 0) depth = 0;
      continue;
    }
    if (!depth) onTag(t);
  }
}

function parseZefania(xml: string): BibleData {
  const b = new Builder();
  let book = '';
  let chapter = 0;
  walk(xml, new Set(['CAPTION', 'NOTE', 'REMARK', 'XREF', 'INFORMATION', 'PROLOG', 'MEDIA']), (t) => {
    if (t.name === 'BIBLEBOOK' && !t.close) {
      b.end();
      book = BOOK_CODES[Number(t.attrs.bnumber) - 1] ?? '';
      if (book && t.attrs.bname) b.names[book] = t.attrs.bname;
    } else if (t.name === 'CHAPTER' && !t.close) {
      b.end();
      chapter = Number(t.attrs.cnumber);
    } else if (t.name === 'VERS') {
      if (t.close) b.end();
      else b.start(book, chapter, Number(t.attrs.vnumber));
    } else if (t.name === 'BR') b.add(' ');
  }, (s) => b.add(s));
  return b.result();
}

function parseOsis(xml: string): BibleData {
  const b = new Builder();
  const ref = (id: string) => {
    const [osis, c, v] = id.split(/\s/)[0].split('.');
    return { book: bookByOsis(osis)?.code ?? '', c: Number(c), v: Number(v) };
  };
  walk(xml, new Set(['note', 'title', 'header', 'reference', 'catchWord', 'rdg']), (t) => {
    if (t.name === 'verse') {
      if (t.close || t.attrs.eID) b.end();
      else if (t.attrs.osisID) {
        const r = ref(t.attrs.osisID);
        b.start(r.book, r.c, r.v);
      }
    } else if (t.name === 'chapter' && (t.close || t.attrs.eID)) b.end();
    else if (t.name === 'div' && t.attrs.type === 'book') b.end();
    else if ((t.name === 'lb' || t.name === 'l') && !t.close) b.add(' ');
  }, (s) => b.add(s));
  return b.result();
}

function parseUsfx(xml: string): BibleData {
  const b = new Builder();
  let book = '';
  let chapter = 0;
  let captureName = false;
  walk(xml, new Set(['f', 'x', 'fig', 'rem', 'ref', 'toc', 'id', 'ide', 's', 'mt', 'ms', 'r', 'd', 'periph', 'w:note']), (t) => {
    if (t.name === 'book' && !t.close) {
      b.end();
      book = bookByCode(t.attrs.id ?? '')?.code ?? '';
    } else if (t.name === 'h' && !t.close) {
      captureName = true;
    } else if (t.name === 'h' && t.close) {
      captureName = false;
    } else if (t.name === 'c') {
      b.end();
      chapter = Number(t.attrs.id);
    } else if (t.name === 'v') {
      b.start(book, chapter, parseInt(t.attrs.id, 10));
    } else if (t.name === 've') b.end();
  }, (s) => {
    if (captureName) {
      if (book && s.trim()) b.names[book] = s.trim();
      return;
    }
    b.add(s);
  });
  return b.result();
}

// USFM paragraph markers whose line holds headings, titles, references or introductions rather than verse text.
const USFM_SKIP_LINE = /^(id|ide|h\d*|toca?\d*|mte?\d*|ms\d*|mr|sr?\d*|r|d|sp|rem|sts|restore|cl|cd|imte?\d*|is\d*|ipi?|imi?|ipq|imq|ipr|iq\d*|ib|ili\d*|iot|io\d*|iex|ie|lit|qa|periph|usfm)$/;
// Notes and other spans whose whole content is left out, up to their closing marker.
const USFM_SKIP_SPAN = /^(f|fe|ef|x|ex|fig|va|vp|ca|rq|cat)$/;
// Inline character styles: their text is kept and they do not start a new word.
const USFM_CHAR = /^(add|addpn|bd|bdit|bk|dc|em|it|jmp|k|lik|liv\d*|nd|no|ord|pn|png|qac|qs|qt|rb|sc|sig|sls|sup|tl|w|wa|wg|wh|wj)$/;

function parseUsfm(usfm: string): BibleData {
  const b = new Builder();
  let book = '';
  let chapter = 0;
  for (const line of usfm.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    let skipLine = false;
    let span = '';
    let inWord = false;
    let pending: 'id' | 'c' | 'v' | 'name' | '' = '';
    for (const m of line.matchAll(/\\(\+?)([a-z]+\d*)(\*?)|([^\\]+)/g)) {
      if (m[4] !== undefined) {
        let text = m[4];
        if (pending === 'id') {
          b.end();
          book = bookByCode(text.trim().slice(0, 3))?.code ?? '';
          chapter = 0;
          skipLine = true;
        } else if (pending === 'c') {
          b.end();
          chapter = parseInt(text, 10) || 0;
        } else if (pending === 'v') {
          const v = /^\s*(\d+)\S*\s?([\s\S]*)$/.exec(text);
          b.start(book, chapter, v ? Number(v[1]) : 0);
          text = v ? v[2] : '';
        } else if (pending === 'name') {
          if (book && text.trim()) b.names[book] = text.trim();
        }
        pending = '';
        if (skipLine || span) continue;
        if (inWord) text = text.split('|')[0];
        b.add(text);
        continue;
      }
      const [, , name, close] = m;
      if (span) {
        if (close && name === span) span = '';
        continue;
      }
      if (USFM_SKIP_SPAN.test(name)) {
        if (!close) span = name;
      } else if (name === 'id') {
        pending = 'id';
      } else if (name === 'c') {
        pending = 'c';
        skipLine = false;
      } else if (name === 'v') {
        pending = 'v';
        skipLine = false;
      } else if (name === 'toc2' || (name === 'h' && book && !b.names[book])) {
        pending = 'name';
        skipLine = true;
      } else if (USFM_SKIP_LINE.test(name)) {
        b.add(' ');
        skipLine = true;
      } else if (name === 'w') {
        inWord = !close;
      } else if (!close && !USFM_CHAR.test(name)) {
        b.add(' ');
      }
    }
    b.add(' ');
  }
  return b.result();
}

type JsonBook = { abbrev?: string; name?: string; book?: string; chapters: (string[] | { verses: string[] })[] };

function parseJson(data: unknown): BibleData {
  // Native format: { books: { GEN: [[...]] }, names?: {...} }
  if (data && typeof data === 'object' && 'books' in data && !Array.isArray((data as { books: unknown }).books)) {
    return data as BibleData;
  }
  // Array of 66 books in canonical order: [{ name, chapters: [[verse, ...], ...] }]
  const list = (Array.isArray(data) ? data : (data as { books?: unknown }).books) as JsonBook[] | undefined;
  if (Array.isArray(list) && list.length && Array.isArray(list[0]?.chapters)) {
    const out: BibleData = { books: {}, names: {} };
    list.slice(0, 66).forEach((bk, i) => {
      const code = BOOK_CODES[i];
      out.books[code] = bk.chapters.map((c) => (Array.isArray(c) ? c : c.verses).map((v) => String(v ?? '').trim()));
      if (bk.name) out.names![code] = bk.name;
    });
    return out;
  }
  // Flat verse list: [{ book: 1 | "JHN" | "John", chapter, verse, text }]
  const verses = (Array.isArray(data) ? data : (data as { verses?: unknown }).verses) as
    | { book?: number | string; book_id?: number | string; book_name?: string; chapter: number; verse: number; text: string }[]
    | undefined;
  if (Array.isArray(verses) && verses.length && 'text' in verses[0]) {
    const b = new Builder();
    for (const v of verses) {
      const raw = v.book ?? v.book_id ?? v.book_name ?? '';
      const code =
        typeof raw === 'number' || /^\d+$/.test(String(raw))
          ? BOOK_CODES[Number(raw) - 1]
          : (bookByCode(String(raw)) ?? BOOKS.find((x) => x.name.toLowerCase() === String(raw).toLowerCase()))?.code;
      if (!code) continue;
      if (v.book_name) b.names[code] = v.book_name;
      b.start(code, Number(v.chapter), Number(v.verse));
      b.add(v.text);
    }
    return b.result();
  }
  throw new Error('Unrecognised JSON layout.');
}
