export interface Book {
  /** USFM code, e.g. "JHN" */
  code: string;
  /** OSIS id, e.g. "John" */
  osis: string;
  name: string;
  /** Extra names and abbreviations accepted by the reference parser (lowercase, no dots). */
  aliases: string[];
}

// [usfm, osis, English name, aliases...]
const RAW: string[][] = [
  ['GEN', 'Gen', 'Genesis', 'gen', 'ge', 'gn', 'itangiriro', 'genese', 'génesis', 'mwanzo'],
  ['EXO', 'Exod', 'Exodus', 'exo', 'ex', 'exod', 'kuva', 'exode', 'éxodo', 'kutoka'],
  ['LEV', 'Lev', 'Leviticus', 'lev', 'le', 'lv', 'abalewi', 'levitique', 'levítico', 'mambo ya walawi', 'walawi'],
  ['NUM', 'Num', 'Numbers', 'num', 'nu', 'nm', 'kubara', 'nombres', 'números', 'hesabu'],
  ['DEU', 'Deut', 'Deuteronomy', 'deut', 'deu', 'dt', 'gutegeka kwa kabiri', 'gutegeka', 'deuteronome', 'deuteronomio', 'kumbukumbu la torati'],
  ['JOS', 'Josh', 'Joshua', 'josh', 'jos', 'yosuwa', 'josue', 'josué', 'yoshua'],
  ['JDG', 'Judg', 'Judges', 'judg', 'jdg', 'jg', 'abacamanza', 'juges', 'jueces', 'waamuzi'],
  ['RUT', 'Ruth', 'Ruth', 'ru', 'rut', 'rusi', 'ruthu'],
  ['1SA', '1Sam', '1 Samuel', '1sam', '1sa', '1 sam', '1 samweli', '1samweli', '1 samuel'],
  ['2SA', '2Sam', '2 Samuel', '2sam', '2sa', '2 sam', '2 samweli', '2samweli', '2 samuel'],
  ['1KI', '1Kgs', '1 Kings', '1kgs', '1ki', '1 kgs', '1 kings', '1 abami', '1 rois', '1 reyes', '1 wafalme'],
  ['2KI', '2Kgs', '2 Kings', '2kgs', '2ki', '2 kgs', '2 kings', '2 abami', '2 rois', '2 reyes', '2 wafalme'],
  ['1CH', '1Chr', '1 Chronicles', '1chr', '1ch', '1 chr', '1 ibyo ku ngoma', '1 ngoma', '1 chroniques', '1 crónicas', '1 mambo ya nyakati'],
  ['2CH', '2Chr', '2 Chronicles', '2chr', '2ch', '2 chr', '2 ibyo ku ngoma', '2 ngoma', '2 chroniques', '2 crónicas', '2 mambo ya nyakati'],
  ['EZR', 'Ezra', 'Ezra', 'ezr', 'esdras', 'esdra', 'ezira'],
  ['NEH', 'Neh', 'Nehemiah', 'neh', 'ne', 'nehemiya', 'nehemie', 'nehemías', 'nehemia'],
  ['EST', 'Esth', 'Esther', 'esth', 'est', 'esiteri', 'ester', 'esta'],
  ['JOB', 'Job', 'Job', 'jb', 'yobu', 'ayubu'],
  ['PSA', 'Ps', 'Psalms', 'psalm', 'ps', 'psa', 'pss', 'zaburi', 'psaumes', 'salmos', 'salmo'],
  ['PRO', 'Prov', 'Proverbs', 'prov', 'pro', 'pr', 'imigani', 'proverbes', 'proverbios', 'mithali'],
  ['ECC', 'Eccl', 'Ecclesiastes', 'eccl', 'ecc', 'ec', 'umubwiriza', 'ecclesiaste', 'eclesiastés', 'mhubiri'],
  ['SNG', 'Song', 'Song of Songs', 'song of solomon', 'song', 'sos', 'sng', 'indirimbo', 'indirimbo ya salomo', 'cantique des cantiques', 'cantares', 'wimbo ulio bora'],
  ['ISA', 'Isa', 'Isaiah', 'isa', 'is', 'yesaya', 'esaie', 'ésaïe', 'isaías', 'isaya'],
  ['JER', 'Jer', 'Jeremiah', 'jer', 'je', 'yeremiya', 'jeremie', 'jérémie', 'jeremías', 'yeremia'],
  ['LAM', 'Lam', 'Lamentations', 'lam', 'la', 'amaganya', 'lamentaciones', 'maombolezo'],
  ['EZK', 'Ezek', 'Ezekiel', 'ezek', 'ezk', 'eze', 'ezekiyeli', 'ezechiel', 'ézéchiel', 'ezequiel', 'ezekieli'],
  ['DAN', 'Dan', 'Daniel', 'dan', 'da', 'dn', 'danieli', 'daniyeli'],
  ['HOS', 'Hos', 'Hosea', 'hos', 'ho', 'hoseya', 'osee', 'osée', 'oseas'],
  ['JOL', 'Joel', 'Joel', 'jl', 'yoweli', 'joël', 'yoeli'],
  ['AMO', 'Amos', 'Amos', 'am', 'amo', 'amosi', 'amós'],
  ['OBA', 'Obad', 'Obadiah', 'obad', 'ob', 'oba', 'obadiya', 'abdias', 'obadia'],
  ['JON', 'Jonah', 'Jonah', 'jon', 'jnh', 'yona', 'jonas', 'yonathani'],
  ['MIC', 'Mic', 'Micah', 'mic', 'mi', 'mika', 'michee', 'michée', 'miqueas'],
  ['NAM', 'Nah', 'Nahum', 'nah', 'na', 'nahumu', 'nahúm'],
  ['HAB', 'Hab', 'Habakkuk', 'hab', 'habakuki', 'habacuc', 'habakuk'],
  ['ZEP', 'Zeph', 'Zephaniah', 'zeph', 'zep', 'zefaniya', 'sophonie', 'sofonías', 'sefania'],
  ['HAG', 'Hag', 'Haggai', 'hag', 'hagayi', 'aggee', 'aggée', 'hageo', 'hagai'],
  ['ZEC', 'Zech', 'Zechariah', 'zech', 'zec', 'zekariya', 'zacharie', 'zacarías', 'zekaria'],
  ['MAL', 'Mal', 'Malachi', 'mal', 'malaki', 'malachie', 'malaquías'],
  ['MAT', 'Matt', 'Matthew', 'matt', 'mat', 'mt', 'matayo', 'matthieu', 'mateo', 'mathayo'],
  ['MRK', 'Mark', 'Mark', 'mrk', 'mk', 'mar', 'mr', 'mariko', 'marc', 'marcos', 'marko'],
  ['LUK', 'Luke', 'Luke', 'luk', 'lk', 'lu', 'luka', 'luc', 'lucas'],
  ['JHN', 'John', 'John', 'jhn', 'jn', 'joh', 'yohana', 'jean', 'juan', 'yohane'],
  ['ACT', 'Acts', 'Acts', 'act', 'ac', 'ibyakozwe', 'ibyakozwe nintumwa', 'actes', 'hechos', 'matendo'],
  ['ROM', 'Rom', 'Romans', 'rom', 'ro', 'rm', 'abaroma', 'romains', 'romanos', 'warumi'],
  ['1CO', '1Cor', '1 Corinthians', '1cor', '1co', '1 cor', '1 abakorinto', '1 corinthiens', '1 corintios', '1 wakorintho'],
  ['2CO', '2Cor', '2 Corinthians', '2cor', '2co', '2 cor', '2 abakorinto', '2 corinthiens', '2 corintios', '2 wakorintho'],
  ['GAL', 'Gal', 'Galatians', 'gal', 'ga', 'abagalatiya', 'galates', 'gálatas', 'wagalatia'],
  ['EPH', 'Eph', 'Ephesians', 'eph', 'abefeso', 'ephesiens', 'éphésiens', 'efesios', 'waefeso'],
  ['PHP', 'Phil', 'Philippians', 'phil', 'php', 'abafilipi', 'philippiens', 'filipenses', 'wafilipi'],
  ['COL', 'Col', 'Colossians', 'col', 'abakolosayi', 'colossiens', 'colosenses', 'wakolosai'],
  ['1TH', '1Thess', '1 Thessalonians', '1thess', '1th', '1 thess', '1 abatesalonike', '1 thessaloniciens', '1 tesalonicenses', '1 wathesalonike'],
  ['2TH', '2Thess', '2 Thessalonians', '2thess', '2th', '2 thess', '2 abatesalonike', '2 thessaloniciens', '2 tesalonicenses', '2 wathesalonike'],
  ['1TI', '1Tim', '1 Timothy', '1tim', '1ti', '1 tim', '1 timoteyo', '1 timothee', '1 timothée', '1 timoteo', '1 timotheo'],
  ['2TI', '2Tim', '2 Timothy', '2tim', '2ti', '2 tim', '2 timoteyo', '2 timothee', '2 timothée', '2 timoteo', '2 timotheo'],
  ['TIT', 'Titus', 'Titus', 'tit', 'ti', 'tito', 'tite'],
  ['PHM', 'Phlm', 'Philemon', 'phlm', 'phm', 'filemoni', 'philémon', 'filemón'],
  ['HEB', 'Heb', 'Hebrews', 'heb', 'abaheburayo', 'hebreux', 'hébreux', 'hebreos', 'waebrania'],
  ['JAS', 'Jas', 'James', 'jas', 'jm', 'yakobo', 'jacques', 'santiago'],
  ['1PE', '1Pet', '1 Peter', '1pet', '1pe', '1 pet', '1 petero', '1 pierre', '1 pedro'],
  ['2PE', '2Pet', '2 Peter', '2pet', '2pe', '2 pet', '2 petero', '2 pierre', '2 pedro'],
  ['1JN', '1John', '1 John', '1john', '1jn', '1 jn', '1 yohana', '1 jean', '1 juan', '1 yohane'],
  ['2JN', '2John', '2 John', '2john', '2jn', '2 jn', '2 yohana', '2 jean', '2 juan', '2 yohane'],
  ['3JN', '3John', '3 John', '3john', '3jn', '3 jn', '3 yohana', '3 jean', '3 juan', '3 yohane'],
  ['JUD', 'Jude', 'Jude', 'jud', 'yuda', 'judas', 'yuda'],
  ['REV', 'Rev', 'Revelation', 'rev', 're', 'rv', 'revelations', 'ibyahishuwe', 'apocalypse', 'apocalipsis', 'ufunuo'],
];

export const BOOKS: Book[] = RAW.map(([code, osis, name, ...aliases]) => ({ code, osis, name, aliases }));

export const BOOK_CODES = BOOKS.map((b) => b.code);

const byCode = new Map(BOOKS.map((b) => [b.code, b]));
const byOsis = new Map(BOOKS.map((b) => [b.osis.toLowerCase(), b]));

export function bookByCode(code: string): Book | undefined {
  return byCode.get(code.toUpperCase());
}

export function bookByOsis(osis: string): Book | undefined {
  return byOsis.get(osis.toLowerCase());
}

export const isOldTestament = (code: string) => BOOK_CODES.indexOf(code) < 39;
