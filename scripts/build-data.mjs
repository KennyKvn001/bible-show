// Builds public/bibles/<id>.json.gz for every entry in src/data/catalog.json.
// The output is committed so a fresh clone runs without this step; rerun it only to add or refresh translations.
// Sources (downloaded once into .cache/):
//   ebible      - BibleNLP/ebible corpus: verse-per-line text aligned to metadata/vref.txt (Original versification),
//                 mapped to English verse numbers with metadata/eng.vrs. Pinned to a commit whose extraction
//                 kept every verse; later corpus commits drop verses that fall outside Original numbering.
//                 An entry can set "commit" to take its file from another corpus commit.
//   open-bibles - seven1m/open-bibles OSIS/USFX/Zefania XML, parsed with src/lib/importers.ts
//   usfm        - one USFM file per book in a GitHub repo: "repo", "commit", and a "pattern" with {num}
//                 (Paratext book number: GEN=01, MAL=39, MAT=41) and {code} (USFM code)
// Usage: node --experimental-strip-types scripts/build-data.mjs
import { readFile, writeFile, mkdir, access, readdir, rm } from 'node:fs/promises';
import { gzipSync, constants } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeBibles, parseBible } from '../src/lib/importers.ts';
import { BOOK_CODES } from '../src/lib/books.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EBIBLE_COMMIT = '062b7b4e5b970493d1ef94f7b3bfce76052e7361';
const RAW = 'https://raw.githubusercontent.com';
const outDir = join(root, 'public', 'bibles');

/** Downloads `url` once into .cache/<cacheDir>/ and returns its text. */
async function fetchCached(cacheDir, url) {
  const local = join(root, '.cache', cacheDir, decodeURIComponent(url.split('/').slice(-2).join('_')));
  try {
    await access(local);
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await mkdir(dirname(local), { recursive: true });
    await writeFile(local, Buffer.from(await res.arrayBuffer()));
  }
  return (await readFile(local, 'utf8')).replace(/^﻿/, '');
}

const ebible = (path, commit = EBIBLE_COMMIT) =>
  fetchCached(`ebible-${commit.slice(0, 7)}`, `${RAW}/BibleNLP/ebible/${commit}/${path}`);

/** Parses eng.vrs mapping lines ("PSA 51:1-19 = PSA 51:3-21", English = Original) into Original -> English. */
function originalToEnglish(vrs) {
  const map = new Map();
  for (const line of vrs.split('\n')) {
    const m = /^(\w{3}) (\d+):(\d+)(?:-(\d+))? = (\w{3}) (\d+):(\d+)(?:-(\d+))?\s*$/.exec(line);
    if (!m) continue;
    const [, eb, ec, ev1, ev2 = ev1, ob, oc, ov1, ov2 = ov1] = m;
    if (ev2 - ev1 !== ov2 - ov1) throw new Error(`eng.vrs: uneven mapping ${line}`);
    for (let k = 0; k <= ov2 - ov1; k++) map.set(`${ob} ${oc}:${+ov1 + k}`, [eb, +ec, +ev1 + k]);
  }
  return map;
}

function fromCorpus(text, vref, toEnglish) {
  const lines = text.split('\n');
  const books = {};
  const mapped = [];
  const identity = [];
  for (let i = 0; i < vref.length; i++) {
    const m = /^(\w{3}) (\d+):(\d+)$/.exec(vref[i]);
    if (!m) continue;
    let verse = (lines[i] ?? '').trim();
    if (verse === '<range>') verse = '';
    const target = toEnglish.get(vref[i]);
    if (target) mapped.push([...target, verse]);
    else identity.push([m[1], +m[2], +m[3], verse]);
  }
  // Mapped verses claim their English slot first; verse 0 is a Psalm title, which the other sources leave out too.
  const put = ([book, c, v, verse], overwrite) => {
    if (!BOOK_CODES.includes(book) || v < 1) return;
    const verses = ((books[book] ??= [])[c - 1] ??= []);
    if (overwrite || !verses[v - 1]) verses[v - 1] = verse;
  };
  mapped.forEach((r) => put(r, true));
  identity.forEach((r) => put(r, false));
  return { books };
}

async function fromUsfmRepo(t) {
  const files = BOOK_CODES.map((code, i) =>
    t.pattern.replace('{num}', String(i < 39 ? i + 1 : i + 2).padStart(2, '0')).replace('{code}', code),
  );
  const texts = await Promise.all(
    files.map((f) => fetchCached(`${t.id}-${t.commit.slice(0, 7)}`, `${RAW}/${t.repo}/${t.commit}/${f.split('/').map(encodeURIComponent).join('/')}`)),
  );
  return mergeBibles(texts.map((text) => parseBible(text)));
}

/** Restores the space some sources lose after a comma or semicolon ("unique,afin"). */
const tidy = (s) => s.replace(/([,;])(?=\p{L})/gu, '$1 ');

const catalog = JSON.parse(await readFile(join(root, 'src', 'data', 'catalog.json'), 'utf8'));
const vref = (await ebible('metadata/vref.txt')).split('\n');
const toEnglish = originalToEnglish(await ebible('metadata/eng.vrs'));
await mkdir(outDir, { recursive: true });
// Drop files for translations that are no longer in the catalog (and uncompressed output from older versions).
const keep = new Set(catalog.map((t) => `${t.id}.json.gz`));
for (const f of await readdir(outDir)) if (!keep.has(f)) await rm(join(outDir, f));

for (const t of catalog) {
  const source = t.source ?? 'ebible';
  let data;
  if (source === 'ebible') data = fromCorpus(await ebible(`corpus/${t.file}.txt`, t.commit), vref, toEnglish);
  else if (source === 'open-bibles') data = parseBible(await fetchCached(source, `${RAW}/seven1m/open-bibles/master/${t.file}`));
  else if (source === 'usfm') data = await fromUsfmRepo(t);
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
  console.log(`${t.id.padEnd(11)} ${count} verses`);
}
