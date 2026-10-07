// Builds public/bibles/<id>.json for every entry in src/data/catalog.json.
// Sources (downloaded once into .cache/):
//   ebible      - BibleNLP/ebible corpus: verse-per-line text aligned to metadata/vref.txt
//   open-bibles - seven1m/open-bibles OSIS/USFX/Zefania XML, parsed with src/lib/importers.ts
// Usage: node --experimental-strip-types scripts/build-data.mjs
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBible } from '../src/lib/importers.ts';
import { BOOK_CODES } from '../src/lib/books.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = {
  ebible: 'https://raw.githubusercontent.com/BibleNLP/ebible/main',
  'open-bibles': 'https://raw.githubusercontent.com/seven1m/open-bibles/master',
};
const outDir = join(root, 'public', 'bibles');

async function fetchCached(source, path) {
  const local = join(root, '.cache', source, path.replaceAll('/', '_'));
  try {
    await access(local);
  } catch {
    const res = await fetch(`${SOURCES[source]}/${path}`);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    await mkdir(dirname(local), { recursive: true });
    await writeFile(local, Buffer.from(await res.arrayBuffer()));
  }
  return (await readFile(local, 'utf8')).replace(/^\uFEFF/, '');
}

function fromCorpus(text, vref) {
  const lines = text.split('\n');
  const books = {};
  for (let i = 0; i < vref.length; i++) {
    const m = /^(\w{3}) (\d+):(\d+)$/.exec(vref[i]);
    if (!m || !BOOK_CODES.includes(m[1])) continue;
    let verse = (lines[i] ?? '').trim();
    if (verse === '<range>') verse = '';
    const chapters = (books[m[1]] ??= []);
    (chapters[m[2] - 1] ??= [])[m[3] - 1] = verse;
  }
  return { books };
}

const catalog = JSON.parse(await readFile(join(root, 'src', 'data', 'catalog.json'), 'utf8'));
const vref = (await fetchCached('ebible', 'metadata/vref.txt')).split('\n');
await mkdir(outDir, { recursive: true });

for (const t of catalog) {
  const source = t.source ?? 'ebible';
  const text = await fetchCached(source, source === 'ebible' ? `corpus/${t.file}.txt` : t.file);
  const data = source === 'ebible' ? fromCorpus(text, vref) : parseBible(text);
  const books = {};
  let count = 0;
  for (const code of BOOK_CODES) {
    const chapters = data.books[code];
    if (!chapters) continue;
    books[code] = Array.from(chapters, (verses) => {
      const out = Array.from(verses ?? [], (s) => s ?? '');
      while (out.length && !out.at(-1)) out.pop();
      count += out.filter(Boolean).length;
      return out;
    });
  }
  if (count < 7000) throw new Error(`${t.id}: only ${count} verses, source is probably empty`);
  await writeFile(join(outDir, `${t.id}.json`), JSON.stringify({ books, names: data.names }));
  console.log(`${t.id.padEnd(11)} ${count} verses`);
}
