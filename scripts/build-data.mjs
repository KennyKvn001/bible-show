// Builds public/bibles/<id>.json.gz for every entry in src/data/catalog.json.
// The output is committed so a fresh clone runs without this step; rerun it only to add or refresh translations.
// Sources (downloaded once into .cache/, every one pinned to a commit):
//   ebible      - BibleNLP/ebible corpus: verse-per-line text aligned to metadata/vref.txt. Two snapshots are combined:
//                 EBIBLE_OWN keeps each translation's own verse labels and splits, but drops labels missing from vref
//                 (Malachi 4, Joel 3, ...); EBIBLE_ORIGINAL converts every verse to Original versification, which keeps
//                 them all but joins verses that Original counts as one. Original numbers are mapped to English with
//                 metadata/eng.vrs. A few verses missing from both (2 Corinthians 13:14) come from wldeh/bible-api when
//                 the entry names a "wldeh" version, after checking that version has the same text around them.
//   open-bibles - seven1m/open-bibles OSIS/USFX/Zefania XML, parsed with src/lib/importers.ts
//   usfm        - one USFM file per book in a GitHub repo: "repo", "commit", and a "pattern" with {num}
//                 (Paratext book number: GEN=01, MAL=39, MAT=41) and {code} (USFM code). "fixes" lists source typos
//                 to correct, as {CODE: [[from, to], ...]}.
// Usage: node --experimental-strip-types scripts/build-data.mjs
import { readFile, writeFile, mkdir, access, readdir, rm } from 'node:fs/promises';
import { gzipSync, constants } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeBibles, parseBible } from '../src/lib/importers.ts';
import { BOOKS, BOOK_CODES } from '../src/lib/books.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EBIBLE_OWN = 'c531ff2da02843ded6d09afbe29a197ab844981f';
const EBIBLE_ORIGINAL = '062b7b4e5b970493d1ef94f7b3bfce76052e7361';
const OPEN_BIBLES = 'f257a3559025c3f873b48a75019f53a9354ed7de';
const WLDEH = '1d6987e268fcadb1e96ceb487e3d365a5e837f4a';
const RAW = 'https://raw.githubusercontent.com';
const outDir = join(root, 'public', 'bibles');
// English verses that many translations leave out or move to a footnote; an empty slot here is expected.
const VARIANTS = new Set(('MAT 17:21,MAT 18:11,MAT 23:14,MRK 7:16,MRK 9:44,MRK 9:46,MRK 11:26,MRK 15:28,LUK 17:36,' +
  'LUK 23:17,JHN 5:4,ACT 8:37,ACT 15:34,ACT 24:7,ACT 28:29,ROM 16:24,3JN 1:15,REV 12:18').split(','));

/** Downloads `url` once into .cache/<cacheDir>/ and returns its text, or null for a 404 when `optional` is set. */
async function fetchCached(cacheDir, url, optional = false) {
  const local = join(root, '.cache', cacheDir, decodeURIComponent(url.split('/').slice(-2).join('_')));
  try {
    await access(local);
  } catch {
    const res = await fetch(url);
    if (optional && res.status === 404) return null;
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await mkdir(dirname(local), { recursive: true });
    await writeFile(local, Buffer.from(await res.arrayBuffer()));
  }
  return (await readFile(local, 'utf8')).replace(/^\uFEFF/, '');
}

const ebible = (path, commit) => fetchCached(`ebible-${commit.slice(0, 7)}`, `${RAW}/BibleNLP/ebible/${commit}/${path}`);

const vref = (await ebible('metadata/vref.txt', EBIBLE_ORIGINAL)).split('\n');
const vrs = await ebible('metadata/eng.vrs', EBIBLE_ORIGINAL);
// Book names in each translation's language; wldeh/bible-api names its book folders after them.
const bookNames = JSON.parse(await readFile(join(root, 'src', 'data', 'book-names.json'), 'utf8'));

/** eng.vrs: verse counts of English chapters, and mapping lines ("PSA 51:1-19 = PSA 51:3-21", English = Original). */
const englishLength = {};
const toEnglish = new Map();
for (const line of vrs.split('\n')) {
  const counts = /^(\w{3}) ((?:\d+:\d+\s*)+)$/.exec(line);
  if (counts) englishLength[counts[1]] = counts[2].trim().split(/\s+/).map((cv) => +cv.split(':')[1]);
  const m = /^(\w{3}) (\d+):(\d+)(?:-(\d+))? = (\w{3}) (\d+):(\d+)(?:-(\d+))?\s*$/.exec(line);
  if (!m) continue;
  const [, eb, ec, ev1, ev2 = ev1, ob, oc, ov1, ov2 = ov1] = m;
  if (ev2 - ev1 !== ov2 - ov1) throw new Error(`eng.vrs: uneven mapping ${line}`);
  for (let k = 0; k <= ov2 - ov1; k++) toEnglish.set(`${ob} ${oc}:${+ov1 + k}`, `${eb} ${ec}:${+ev1 + k}`);
}

const parseRef = (ref) => {
  const [, book, c, v] = /^(\w{3}) (\d+):(\d+)$/.exec(ref);
  return [book, +c, +v];
};
/** For comparing texts from different sources only; stored text keeps its own spacing (French no-break spaces). */
const norm = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

/** One corpus file as ref -> text, plus the refs marked <range> (text joined into the verse before). */
function readCorpus(text) {
  const lines = text.split('\n');
  const verses = new Map();
  const ranges = new Set();
  vref.forEach((ref, i) => {
    const s = (lines[i] ?? '').trim();
    if (s === '<range>') ranges.add(ref);
    else if (s && ref) verses.set(ref, s);
  });
  return { verses, ranges };
}

/** Moves Original-numbered verses to English numbers. Two verses landing on one English verse are joined in order. */
function toEnglishVerses(original) {
  const out = new Map();
  for (const [ref, s] of original.verses) {
    const to = toEnglish.get(ref) ?? ref;
    out.set(to, out.has(to) ? `${out.get(to)} ${s}` : s);
  }
  return { verses: out, ranges: new Set([...original.ranges].map((r) => toEnglish.get(r) ?? r)) };
}

/** True when `ref` is past the end of its English chapter, i.e. the translation numbers that chapter another way. */
function beyondEnglish(ref) {
  const [book, c, v] = parseRef(ref);
  return Boolean(englishLength[book]) && v > (englishLength[book][c - 1] ?? 0);
}

/**
 * Combines the two corpus snapshots into English-numbered verses.
 * Translations labelled in English take their own snapshot and fill what it dropped from the Original one; where the
 * Original one joined a verse to the next ("...this commotion. When he had thus spoken..."), the extra text becomes
 * that next verse. Translations labelled another way (Lingala follows Hebrew numbering) use the Original snapshot.
 */
function fromCorpus(own, original) {
  const mapped = toEnglishVerses(original);
  if ([...own.verses.keys()].some(beyondEnglish)) return mapped;
  const verses = new Map(own.verses);
  for (const [ref, s] of mapped.verses) if (!verses.has(ref)) verses.set(ref, s);
  for (const [ref, s] of mapped.verses) {
    const mine = own.verses.get(ref);
    if (!mine || mine === s || !s.startsWith(mine)) continue;
    const [book, c, v] = parseRef(ref);
    const next = `${book} ${c}:${v + 1}`;
    if (!verses.has(next) && v + 1 <= englishLength[book][c - 1]) verses.set(next, s.slice(mine.length).trim());
  }
  return { verses, ranges: new Set([...own.ranges, ...mapped.ranges]) };
}

/** English verses with no text that are not joined into a neighbour or a known textual variant. */
function gaps({ verses, ranges }) {
  const out = [];
  for (const book of BOOK_CODES) {
    englishLength[book].forEach((n, i) => {
      for (let v = 1; v <= n; v++) {
        const ref = `${book} ${i + 1}:${v}`;
        if (!verses.has(ref) && !ranges.has(ref) && !VARIANTS.has(ref)) out.push(ref);
      }
    });
  }
  return out;
}

/** A wldeh/bible-api chapter as verse number -> text (its files sometimes repeat the chapter), or null if missing. */
async function wldehChapter(t, book, c) {
  const version = t.wldeh;
  const name = version.startsWith('en-') ? BOOKS.find((b) => b.code === book)?.name : bookNames[t.id]?.[book];
  if (!name) return null;
  const folder = name.toLowerCase().replace(/\s+/g, '');
  const url = `${RAW}/wldeh/bible-api/${WLDEH}/bibles/${version}/books/${encodeURIComponent(folder)}/chapters/${c}.json`;
  const text = await fetchCached(`wldeh-${WLDEH.slice(0, 7)}/${version}/${folder}`, url, true);
  if (!text) return null;
  const out = new Map();
  for (const { verse, text: s } of JSON.parse(text).data ?? []) {
    // A footnote is sometimes glued to the end of the verse: "...be with all of you.13:14 Texts vary in ...".
    if (!out.has(+verse)) out.set(+verse, norm(String(s)).replace(/(?<=[.!?”’»)\]])\s*\d+:\d+\s.*$/u, ''));
  }
  return out;
}

/**
 * Text that looks like a whole verse: no cross-reference residue ("2.10 Sal. 50.14"), and ending a sentence, since
 * wldeh sometimes keeps only the first line of a poetic verse.
 */
const clean = (s) => Boolean(s) && !/\d[.:]\d/.test(s) && /[.!?。！？؟।”’»)\]]$/u.test(s);

/** The first words of a wldeh verse, before any reference residue, to find where that verse starts inside ours. */
function opening(s) {
  const head = s.split(/\d/)[0].trim();
  const words = head.split(' ');
  if (words.length >= 3) return words.slice(0, 6).join(' ');
  return head.length >= 8 ? head.slice(0, 12) : null;
}

/**
 * Uses wldeh/bible-api to (1) fill an empty English verse, when wldeh has the same text on both sides of it;
 * (2) split an empty verse off the one before, when wldeh's text of that verse is the start of ours (Lingala joins
 * Acts 19:41 to 19:40); and (3) split verses joined at the end of a chapter, when wldeh's chapter is longer and the
 * extra verses' openings appear in order inside our last verse (RV1909 joins Jonah 2:10-11 and Job 39:30-38).
 */
async function supplement(t, data, missing) {
  const notes = [];
  const chapters = new Set();
  for (const ref of missing) {
    const [book, c] = parseRef(ref);
    chapters.add(`${book} ${c}`);
    if (c < englishLength[book].length) chapters.add(`${book} ${c + 1}`);
  }
  for (const key of chapters) {
    const [book, c] = [key.slice(0, 3), +key.slice(4)];
    const theirs = await wldehChapter(t, book, c);
    if (!theirs) continue;
    const ours = ((data.books[book] ??= [])[c - 1] ??= []);
    const same = (v) => !ours[v - 1] || theirs.get(v) === norm(ours[v - 1]);
    for (const ref of missing.filter((r) => r.startsWith(`${key}:`))) {
      const v = parseRef(ref)[2];
      const s = theirs.get(v);
      const before = ours[v - 2] ?? '';
      const head = theirs.get(v - 1);
      if (clean(s) && (ours[v - 2] || ours[v]) && same(v - 1) && same(v + 1) && !ours.includes(s)) {
        ours[v - 1] = s;
        notes.push(`filled ${ref}`);
      } else if (clean(head) && !s && norm(before).startsWith(`${head} `) && norm(before).length - head.length > 10) {
        let at = head.length;
        while (at < before.length && norm(before.slice(0, at)) !== head) at++;
        ours[v - 2] = before.slice(0, at).trim();
        ours[v - 1] = before.slice(at).trim();
        notes.push(`split ${ref} off ${v - 1}`);
      }
    }
    let last = ours.length;
    while (last && !ours[last - 1]) last--;
    const extra = [...theirs.keys()].filter((v) => v > last).sort((a, b) => a - b);
    if (!last || !extra.length || extra[0] !== last + 1) continue;
    const parts = [];
    let rest = ours[last - 1];
    for (const v of extra) {
      const start = opening(theirs.get(v));
      const at = start ? rest.indexOf(` ${start}`) : -1;
      if (at < 1) break;
      parts.push(rest.slice(0, at).trim());
      rest = rest.slice(at + 1);
    }
    if (parts.length !== extra.length) continue;
    ours.splice(last - 1, ours.length, ...parts, rest);
    notes.push(`split ${key}:${last} into ${last}-${last + parts.length}`);
  }
  return notes;
}

async function fromUsfmRepo(t) {
  const texts = await Promise.all(
    BOOK_CODES.map(async (code, i) => {
      const file = t.pattern.replace('{num}', String(i < 39 ? i + 1 : i + 2).padStart(2, '0')).replace('{code}', code);
      const url = `${RAW}/${t.repo}/${t.commit}/${file.split('/').map(encodeURIComponent).join('/')}`;
      let text = await fetchCached(`${t.id}-${t.commit.slice(0, 7)}`, url);
      for (const [from, to] of t.fixes?.[code] ?? []) {
        if (!text.includes(from)) throw new Error(`${t.id}: fix for ${code} no longer matches ${JSON.stringify(from)}`);
        text = text.replace(from, to);
      }
      return text;
    }),
  );
  return mergeBibles(texts.map((text) => parseBible(text, { strict: true })));
}

/** Restores the space some sources lose after a comma or semicolon ("unique,afin"). */
const tidy = (s) => s.replace(/([,;])(?=\p{L})/gu, '$1 ');

const catalog = JSON.parse(await readFile(join(root, 'src', 'data', 'catalog.json'), 'utf8'));
await mkdir(outDir, { recursive: true });
// Drop files for translations that are no longer in the catalog (and uncompressed output from older versions).
const keep = new Set(catalog.map((t) => `${t.id}.json.gz`));
for (const f of await readdir(outDir)) if (!keep.has(f)) await rm(join(outDir, f));

for (const t of catalog) {
  const source = t.source ?? 'ebible';
  let data;
  const notes = [];
  if (source === 'ebible') {
    const own = readCorpus(await ebible(`corpus/${t.file}.txt`, EBIBLE_OWN));
    const original = readCorpus(await ebible(`corpus/${t.file}.txt`, EBIBLE_ORIGINAL));
    const english = fromCorpus(own, original);
    data = { books: {} };
    for (const [ref, s] of english.verses) {
      const [book, c, v] = parseRef(ref);
      // Verse 0 is a Psalm title, which the other sources leave out too.
      if (BOOK_CODES.includes(book) && v >= 1) ((data.books[book] ??= [])[c - 1] ??= [])[v - 1] = s;
    }
    let missing = gaps(english);
    if (t.wldeh) {
      notes.push(...(await supplement(t, data, missing)));
      missing = missing.filter((ref) => {
        const [book, c, v] = parseRef(ref);
        return !data.books[book]?.[c - 1]?.[v - 1];
      });
    }
    if (missing.length) notes.push(`no text for ${missing.join(', ')}`);
  } else if (source === 'open-bibles') {
    data = parseBible(await fetchCached(`open-bibles-${OPEN_BIBLES.slice(0, 7)}`, `${RAW}/seven1m/open-bibles/${OPEN_BIBLES}/${t.file}`));
  } else if (source === 'usfm') data = await fromUsfmRepo(t);
  else throw new Error(`${t.id}: unknown source ${source}`);

  const books = {};
  let count = 0;
  for (const code of BOOK_CODES) {
    const chapters = data.books[code];
    if (!chapters) throw new Error(`${t.id}: ${code} is missing`);
    books[code] = Array.from(chapters, (verses, c) => {
      const out = Array.from(verses ?? [], (s) => tidy(s ?? ''));
      while (out.length && !out.at(-1)) out.pop();
      if (!out.length) throw new Error(`${t.id}: ${code} ${c + 1} has no verses`);
      count += out.filter(Boolean).length;
      return out;
    });
  }
  // A whole Bible has about 31,000 verses; far fewer means the source file is truncated.
  if (count < 30000) throw new Error(`${t.id}: only ${count} verses, the source looks incomplete`);
  // Node writes a zero mtime; the OS byte is fixed too, so unchanged text gives the same bytes on every platform.
  const gz = gzipSync(JSON.stringify({ books, names: data.names }), { level: constants.Z_BEST_COMPRESSION });
  gz[9] = 0xff;
  await writeFile(join(outDir, `${t.id}.json.gz`), gz);
  console.log(`${t.id.padEnd(11)} ${count} verses${notes.length ? `; ${notes.join('; ')}` : ''}`);
}
