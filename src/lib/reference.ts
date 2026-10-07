import type { VerseRef } from './bible.ts';
import { BOOKS } from './books.ts';

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’ʼ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Finds a book by name, abbreviation, USFM code, or a translation's own book names. */
export function findBook(query: string, localNames?: Record<string, string>): string | undefined {
  const q = normalize(query).replace(/^([123])\s*/, '$1 ');
  if (!q) return undefined;
  const compact = q.replace(/\s/g, '');
  const candidates = BOOKS.map((b) => ({
    code: b.code,
    names: [b.name, b.code, ...b.aliases, localNames?.[b.code] ?? ''].filter(Boolean).map(normalize),
  }));
  for (const c of candidates) if (c.names.some((n) => n === q || n.replace(/\s/g, '') === compact)) return c.code;
  for (const c of candidates) if (c.names.some((n) => n.length > 2 && n.replace(/\s/g, '').startsWith(compact))) return c.code;
  return undefined;
}

/**
 * Parses references such as "John 3:16", "jn 3 16-18", "1 Cor 13", "Yohana 3:16", "Ps 23.1".
 * A reference without a verse selects verse 1 of the chapter.
 */
export function parseReference(input: string, localNames?: Record<string, string>): VerseRef | null {
  const m = /^\s*([1-3]?\s*[^\d\s][^\d]*?)\s*(\d+)(?:\s*[:.,\s]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/.exec(input);
  if (!m) return null;
  const book = findBook(m[1], localNames);
  if (!book) return null;
  const chapter = Number(m[2]);
  const verse = m[3] ? Number(m[3]) : 1;
  const verseEnd = m[4] ? Math.max(verse, Number(m[4])) : verse;
  return { book, chapter, verse, verseEnd };
}

export function formatReference(ref: VerseRef, bookName: string): string {
  const range = ref.verseEnd > ref.verse ? `${ref.verse}-${ref.verseEnd}` : `${ref.verse}`;
  return `${bookName} ${ref.chapter}:${range}`;
}
