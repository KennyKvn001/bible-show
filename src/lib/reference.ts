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

/**
 * A book name as compared: normalized, with one space after a leading number and its suffix dropped, so "1cor" is
 * "1 cor", "4. Mose" and "4.Mose" are "4 mose", and "4-я Царств" is "4 царств".
 */
const bookKey = (s: string) => normalize(s).replace(/^(\d+)(?:-\p{L}{1,3}(?=\s))?\s*(?=\S)/u, '$1 ');

/**
 * Finds a book by name, abbreviation, USFM code, or a translation's own book names. The translation's own names win:
 * in Igbo "Jọn" (normalized "jon") is John, not the English abbreviation for Jonah.
 */
export function findBook(query: string, localNames?: Record<string, string>): string | undefined {
  const q = bookKey(query);
  if (!q) return undefined;
  const compact = q.replace(/\s/g, '');
  const candidates = BOOKS.map((b) => ({
    code: b.code,
    local: localNames?.[b.code] ? [bookKey(localNames[b.code])] : [],
    names: [b.name, b.code, ...b.aliases].map(bookKey),
  }));
  const exact = (n: string) => n === q || n.replace(/\s/g, '') === compact;
  const prefix = (n: string) => n.length > 2 && n.replace(/\s/g, '').startsWith(compact);
  // Exact matches before prefixes, and in each the translation's own names before the other names.
  for (const test of [exact, prefix]) {
    for (const c of candidates) if (c.local.some(test)) return c.code;
    for (const c of candidates) if (c.names.some(test)) return c.code;
  }
  return undefined;
}

/**
 * Parses references such as "John 3:16", "jn 3 16-18", "1 Cor 13", "Yohana 3:16", "Ps 23.1", "4. Mose 6:24".
 * A reference without a verse selects verse 1 of the chapter.
 */
export function parseReference(input: string, localNames?: Record<string, string>): VerseRef | null {
  // A book name may start with a number, which may have a dot or a suffix: "1 Cor", "4. Mose", "4-я Царств".
  const m = /^\s*((?:\d+(?:\.|-\p{L}+)?\s*)?[^\d\s][^\d]*?)\s*(\d+)(?:\s*[:.,\s]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/u.exec(input);
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
