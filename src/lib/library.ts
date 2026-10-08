import bookNames from '../data/book-names.json';
import catalog from '../data/catalog.json';
import languageBookNames from '../data/language-book-names.json';
import type { BibleData, Translation } from './bible.ts';
import { getImported } from './idb.ts';

export const BUILT_IN: Translation[] = catalog.map(({ id, abbr, name, language, langCode, license, ...rest }) => ({
  id,
  abbr,
  name,
  language,
  langCode,
  license,
  rtl: 'rtl' in rest ? Boolean(rest.rtl) : undefined,
}));

const cache = new Map<string, Promise<BibleData>>();

async function gunzip(bytes: ArrayBuffer): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    // Older browsers (e.g. Safari before 16.4): load a small inflate library only when needed.
    const { gunzipSync, strFromU8 } = await import('fflate');
    return strFromU8(gunzipSync(new Uint8Array(bytes)));
  }
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/** Built-in texts ship as gzipped JSON in public/bibles (see scripts/build-data.mjs). */
async function fetchBuiltIn(t: Translation): Promise<BibleData> {
  let text: string;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}bibles/${t.id}.json.gz`);
    if (res.status === 404) throw new Error('missing');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    // Some servers already decompress .gz files on the way (Content-Encoding: gzip), so only unzip real gzip data.
    const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
    text = head[0] === 0x1f && head[1] === 0x8b ? await gunzip(bytes) : new TextDecoder().decode(bytes);
  } catch (e) {
    if ((e as Error).message === 'missing') throw new Error(`${t.name} could not be found on this site.`);
    throw new Error(`Could not load ${t.name}. Check your internet connection and try again.`);
  }
  // A server that answers every path with the app page means the Bible files were not deployed.
  if (!text.trimStart().startsWith('{')) throw new Error(`${t.name} could not be found on this site.`);
  try {
    const data = JSON.parse(text) as BibleData;
    // Book names in the translation's own language (src/data/book-names.json, from scripts/book-names.mjs).
    const names = (bookNames as Record<string, Record<string, string>>)[t.id];
    return names ? { ...data, names } : data;
  } catch {
    throw new Error(`Could not read ${t.name}. Try again.`);
  }
}

/**
 * Book names for an imported Bible: the names in its own file, and for books the file doesn't name, the usual names
 * in its language (Kinyarwanda names as listed on bibiliya.com, Bibiliya Yera).
 */
function withLanguageNames(t: Translation, data: BibleData): BibleData {
  const lang = t.langCode.toLowerCase().split(/[-_]/)[0];
  const names = (languageBookNames as Record<string, Record<string, string>>)[lang === 'kin' ? 'rw' : lang];
  return names ? { ...data, names: { ...names, ...data.names } } : data;
}

export function loadBible(t: Translation): Promise<BibleData> {
  let p = cache.get(t.id);
  if (!p) {
    p = t.imported
      ? getImported(t.id).then((d) => {
          if (!d) throw new Error(`${t.name} is no longer in this browser.`);
          return withLanguageNames(t, d);
        })
      : fetchBuiltIn(t);
    p.catch(() => cache.delete(t.id));
    cache.set(t.id, p);
  }
  return p;
}

export function forgetBible(id: string) {
  cache.delete(id);
}
