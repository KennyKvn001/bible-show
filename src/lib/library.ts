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

export function loadBible(t: Translation): Promise<BibleData> {
  let p = cache.get(t.id);
  if (!p) {
    p = t.imported
      ? getImported(t.id).then((d) => {
          if (!d) throw new Error(`${t.name} is no longer in this browser.`);
          return d;
        })
      : fetch(`${import.meta.env.BASE_URL}bibles/${t.id}.json`).then((r) => {
          if (!r.ok) throw new Error(`Could not load ${t.name} (HTTP ${r.status}).`);
          return r.json() as Promise<BibleData>;
        });
    p.catch(() => cache.delete(t.id));
    cache.set(t.id, p);
  }
  return p;
}

export function forgetBible(id: string) {
  cache.delete(id);
}
