/** Verse text indexed as books[USFM code][chapter - 1][verse - 1]. Empty strings are missing verses. */
export type BookText = string[][];

export interface BibleData {
  books: Record<string, BookText>;
  /** Book names in the translation's own language, when the source provides them. */
  names?: Record<string, string>;
}

export interface Translation {
  id: string;
  abbr: string;
  name: string;
  language: string;
  langCode: string;
  license: string;
  rtl?: boolean;
  /** true for Bibles the user imported into this browser */
  imported?: boolean;
}

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
  /** last verse of a range (inclusive); equals verse for a single verse */
  verseEnd: number;
}
