// Writes src/data/book-names.json: book names in each built-in translation's own language.
// Most names come from wldeh/bible-api (the "book" field of each book's first chapter). Its book folders are named,
// not numbered, so each folder is matched to a USFM code by comparing its first verse and chapter count with our
// own copy of the same translation. Names already inside a translation's source (USFM \toc2, Zefania bname) are
// used as they are, and two languages without a source there are listed below.
// Usage: node scripts/book-names.mjs   (needs git and network; run after `npm run data`)
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WLDEH_COMMIT = 'main';
const RAW = `https://raw.githubusercontent.com/wldeh/bible-api/${WLDEH_COMMIT}`;

// translation id -> wldeh version with the same text
const WLDEH = {
  swhonen: 'swh-onen',
  yor: 'yo-oycb',
  ibo: 'ig-biuo',
  hausa: 'ha-bsrk',
  lin: 'ln-smnb',
  lug: 'lg-olcb',
  kik: 'ki-kgnk',
  sna: 'sn-bdrsc',
  nya: 'ny-tccl',
  twi: 'tw-wakna',
  rv1909: 'es-rv09',
  luther1912: 'de-luther1912',
  arbnav: 'arb-kehm',
  hin2017: 'hi-IN-irvhin',
};

const CODES = ('GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM ' +
  'EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH ' +
  '2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV').split(' ');

const MANUAL = {
  // Standard Brazilian Portuguese book names.
  porbrbsl: ['Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio', 'Josué', 'Juízes', 'Rute', '1 Samuel', '2 Samuel',
    '1 Reis', '2 Reis', '1 Crônicas', '2 Crônicas', 'Esdras', 'Neemias', 'Ester', 'Jó', 'Salmos', 'Provérbios', 'Eclesiastes',
    'Cânticos', 'Isaías', 'Jeremias', 'Lamentações', 'Ezequiel', 'Daniel', 'Oseias', 'Joel', 'Amós', 'Obadias', 'Jonas',
    'Miqueias', 'Naum', 'Habacuque', 'Sofonias', 'Ageu', 'Zacarias', 'Malaquias', 'Mateus', 'Marcos', 'Lucas', 'João', 'Atos',
    'Romanos', '1 Coríntios', '2 Coríntios', 'Gálatas', 'Efésios', 'Filipenses', 'Colossenses', '1 Tessalonicenses',
    '2 Tessalonicenses', '1 Timóteo', '2 Timóteo', 'Tito', 'Filemom', 'Hebreus', 'Tiago', '1 Pedro', '2 Pedro', '1 João',
    '2 João', '3 João', 'Judas', 'Apocalipse'],
  // Somali names as listed by wordproject.org's Somali Bible (Kitaabka Quduuska Ah).
  som: ['Bilowgii', 'Baxniintii', 'Laawiyiintii', 'Tirintii', 'Sharciga Kunoqoshadiisa', 'Yashuuca', 'Xaakinnada', 'Ruud',
    "1 Samuu'eel", "2 Samuu'eel", '1 Boqorradii', '2 Boqorradii', '1 Taariikhdii', '2 Taariikhdii', 'Cesraa', 'Nexemyaah',
    'Esteer', 'Ayuub', 'Sabuurradii', 'Maahmaahyadii', 'Wacdiyahii', 'Gabaygii Sulaymaan', 'Ishacyaah', 'Yeremyaah',
    'Baroorashadii Yeremyaah', 'Yexesqeel', 'Daanyeel', 'Hoosheeca', "Yoo'eel", 'Caamoos', 'Cobadyaah', 'Yoonis', 'Miikaah',
    'Naxuum', 'Xabaquuq', 'Sefanyaah', 'Xaggay', 'Sekaryaah', 'Malaakii', 'Matayos', 'Markos', 'Luukos', 'Yooxanaa',
    'Falimaha Rasuullada', 'Rooma', '1 Korintos', '2 Korintos', 'Galatiya', 'Efesos', 'Filiboy', 'Kolosay', '1 Tesaloniika',
    '2 Tesaloniika', '1 Timoteyos', '2 Timoteyos', 'Tiitos', 'Filemon', 'Cibraaniyada', 'Yacquub', '1 Butros', '2 Butros',
    '1 Yooxanaa', '2 Yooxanaa', '3 Yooxanaa', 'Yuudas', 'Muujintii'],
};

const loadBible = async (id) => JSON.parse(gunzipSync(await readFile(join(root, 'public', 'bibles', `${id}.json.gz`))));

async function cached(url) {
  const local = join(root, '.cache', 'wldeh', decodeURIComponent(url.slice(RAW.length + 1)).replaceAll('/', '_'));
  try {
    await access(local);
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await mkdir(dirname(local), { recursive: true });
    await writeFile(local, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(await readFile(local, 'utf8'));
}

/** Lists book folders and their chapter counts from a blobless, sparse clone (no file contents downloaded). */
function listBooks() {
  const repo = join(root, '.cache', 'wldeh-repo');
  try {
    execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { stdio: 'ignore' });
  } catch {
    execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', '--depth', '1', '--branch', WLDEH_COMMIT,
      'https://github.com/wldeh/bible-api.git', repo], { stdio: 'inherit' });
  }
  const out = execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', 'HEAD', 'bibles/'], {
    maxBuffer: 1 << 30,
  }).toString();
  const books = new Map();
  for (const line of out.split('\n')) {
    const m = /^bibles\/([^/]+)\/books\/([^/]+)\/chapters\/(\d+)\.json$/.exec(line);
    if (!m) continue;
    const key = `${m[1]}/${m[2]}`;
    books.set(key, Math.max(books.get(key) ?? 0, Number(m[3])));
  }
  return books;
}

const words = (s) => new Set(s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean));
/** Share of the wldeh words found in our text (wldeh sometimes keeps only the first line of a poetic verse). */
function similarity(theirs, ours) {
  const A = words(theirs);
  const B = words(ours);
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(1, A.size);
}

async function mapInBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

const folders = listBooks();
const result = {};

for (const [id, version] of Object.entries(WLDEH)) {
  const ours = await loadBible(id);
  const entries = [...folders].filter(([key]) => key.startsWith(`${version}/`));
  const found = await mapInBatches(entries, 8, async ([key, chapters]) => {
    const folder = key.slice(version.length + 1);
    const json = await cached(`${RAW}/bibles/${version}/books/${encodeURIComponent(folder)}/chapters/1.json`);
    const verses = (json.data ?? []).slice(0, 3);
    return { folder, chapters, name: String(verses[0]?.book ?? '').trim(), text: verses.map((v) => v.text).join(' ') };
  });
  // Score every folder against every book, then assign the best pairs first so similar openings
  // (2 John / 3 John) go to the book that fits each one best.
  const pairs = [];
  for (const f of found) {
    for (const code of CODES) {
      const verse = (ours.books[code]?.[0] ?? []).slice(0, 4).join(' ');
      pairs.push({ f, code, score: similarity(f.text, verse) + (ours.books[code]?.length === f.chapters ? 0.2 : 0) });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const names = {};
  const used = new Set();
  for (const { f, code, score } of pairs) {
    if (names[code] || used.has(f.folder) || score < 0.5) continue;
    names[code] = f.name;
    used.add(f.folder);
  }
  for (const f of found) if (!used.has(f.folder)) console.warn(`${id}: no match for ${f.folder} (${f.name})`);
  const missing = CODES.filter((c) => !names[c]);
  if (missing.length) throw new Error(`${id}: no name for ${missing.join(' ')}`);
  result[id] = Object.fromEntries(CODES.map((c) => [c, names[c]]));
  console.log(`${id.padEnd(11)} ${names.GEN} … ${names.JHN} … ${names.REV}`);
}

for (const [id, list] of Object.entries(MANUAL)) result[id] = Object.fromEntries(CODES.map((c, i) => [c, list[i]]));

// Translations whose source already carries names (Louis Segond USFM, Synodal Zefania, Chinese USFX).
for (const id of ['lsg', 'synodal', 'cuvs']) {
  const { names } = await loadBible(id);
  if (!names || CODES.some((c) => !names[c])) throw new Error(`${id}: source has no complete book names`);
  result[id] = Object.fromEntries(CODES.map((c) => [c, names[c]]));
}

const catalog = JSON.parse(await readFile(join(root, 'src', 'data', 'catalog.json'), 'utf8'));
const ordered = Object.fromEntries(catalog.filter((t) => result[t.id]).map((t) => [t.id, result[t.id]]));
await writeFile(join(root, 'src', 'data', 'book-names.json'), `${JSON.stringify(ordered, null, 1)}\n`);
console.log(`wrote book names for ${Object.keys(ordered).length} translations`);
