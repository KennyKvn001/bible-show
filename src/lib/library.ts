import catalog from '../data/catalog.json';
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
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old to open the Bible texts. Please update it.');
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/** Built-in texts ship as gzipped JSON in public/bibles (see scripts/build-data.mjs). */
async function fetchBuiltIn(t: Translation): Promise<BibleData> {
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.BASE_URL}bibles/${t.id}.json.gz`);
  } catch {
    throw new Error(`Could not download ${t.name}. Check your internet connection and try again.`);
  }
  if (!res.ok) throw new Error(`Could not load ${t.name} (HTTP ${res.status}).`);
  const bytes = await res.arrayBuffer();
  // Some servers already decompress .gz files on the way (Content-Encoding: gzip), so only unzip real gzip data.
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  const text = head[0] === 0x1f && head[1] === 0x8b ? await gunzip(bytes) : new TextDecoder().decode(bytes);
  if (!text.trimStart().startsWith('{')) {
    throw new Error(`The Bible text for ${t.name} is missing from this site. Run "npm run data" and build again.`);
  }
  return JSON.parse(text) as BibleData;
}

export function loadBible(t: Translation): Promise<BibleData> {
  let p = cache.get(t.id);
  if (!p) {
    p = t.imported
      ? getImported(t.id).then((d) => {
          if (!d) throw new Error(`${t.name} is no longer in this browser.`);
          return d;
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
