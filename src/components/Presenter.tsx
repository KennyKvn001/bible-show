import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BibleData, Translation, VerseRef } from '../lib/bible.ts';
import { BOOKS, bookByCode } from '../lib/books.ts';
import { listImported } from '../lib/idb.ts';
import { BUILT_IN, loadBible } from '../lib/library.ts';
import { publishLive, readLive, type DisplayStyle, type LiveState, type Slide } from '../lib/live.ts';
import { formatReference, normalize, parseReference } from '../lib/reference.ts';
import { ImportDialog } from './ImportDialog.tsx';
import { Screen } from './Screen.tsx';
import { StylePanel } from './StylePanel.tsx';
import { TranslationsDialog } from './TranslationsDialog.tsx';

interface Prefs {
  primary: string;
  secondary: string;
  book: string;
  chapter: number;
  verse: number;
}

const PREFS_KEY = 'bible-show:prefs';
const DEFAULT_PREFS: Prefs = { primary: 'engwebp', secondary: '', book: 'JHN', chapter: 3, verse: 16 };

function readPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

function useBible(t: Translation | undefined) {
  const [state, setState] = useState<{ id?: string; data?: BibleData; error?: string }>({});
  useEffect(() => {
    if (!t) return;
    let alive = true;
    loadBible(t).then(
      (data) => alive && setState({ id: t.id, data }),
      (e: Error) => alive && setState({ id: t.id, error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [t]);
  return state.id === t?.id ? state : {};
}

const bookName = (code: string, data?: BibleData) => data?.names?.[code] ?? bookByCode(code)?.name ?? code;

function chapterCount(data: BibleData | undefined, code: string) {
  return data?.books[code]?.length ?? 0;
}

function buildSlide(ref: VerseRef, sources: { t: Translation; data?: BibleData }[]): Slide | null {
  const parts = sources
    .filter((s): s is { t: Translation; data: BibleData } => Boolean(s.data))
    .map(({ t, data }) => {
      const verses = [];
      const chapter = data.books[ref.book]?.[ref.chapter - 1] ?? [];
      for (let n = ref.verse; n <= ref.verseEnd; n++) if (chapter[n - 1]) verses.push({ n, text: chapter[n - 1] });
      return { abbr: t.abbr, lang: t.langCode, rtl: t.rtl, verses };
    })
    .filter((p) => p.verses.length);
  if (!parts.length) return null;
  return { reference: formatReference(ref, bookName(ref.book, sources[0].data)), parts };
}

export function Presenter() {
  const [imported, setImported] = useState<Translation[]>([]);
  const [prefs, setPrefs] = useState(readPrefs);
  const [sel, setSel] = useState<VerseRef>(() => ({ book: prefs.book, chapter: prefs.chapter, verse: prefs.verse, verseEnd: prefs.verse }));
  const [live, setLive] = useState<LiveState>(readLive);
  const [refInput, setRefInput] = useState('');
  const [refError, setRefError] = useState('');
  const [tab, setTab] = useState<'browse' | 'search'>('browse');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<'book' | 'chapter'>('chapter');
  const [dialog, setDialog] = useState<'' | 'import' | 'translations'>('');
  const refBox = useRef<HTMLInputElement>(null);
  const verseList = useRef<HTMLOListElement>(null);

  const refreshImported = useCallback(() => listImported().then(setImported).catch(() => setImported([])), []);
  useEffect(() => {
    refreshImported();
  }, [refreshImported]);

  const all = useMemo(() => [...imported, ...BUILT_IN], [imported]);
  const primaryT = all.find((t) => t.id === prefs.primary) ?? BUILT_IN[0];
  const secondaryT = prefs.secondary ? all.find((t) => t.id === prefs.secondary) : undefined;
  const primary = useBible(primaryT);
  const secondary = useBible(secondaryT);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, book: sel.book, chapter: sel.chapter, verse: sel.verse }));
    } catch {
      /* storage unavailable */
    }
  }, [prefs, sel]);

  useEffect(() => publishLive(live), [live]);

  const sources = useMemo(
    () => [{ t: primaryT, data: primary.data }, ...(secondaryT ? [{ t: secondaryT, data: secondary.data }] : [])],
    [primaryT, primary.data, secondaryT, secondary.data],
  );
  const preview = useMemo(() => buildSlide(sel, sources), [sel, sources]);

  const chapterVerses = primary.data?.books[sel.book]?.[sel.chapter - 1] ?? [];

  const goLive = useCallback((ref: VerseRef = sel) => {
    const slide = buildSlide(ref, sources);
    if (slide) setLive((l) => ({ ...l, slide, blank: false }));
  }, [sel, sources]);

  /** Moves the selection by one block of the same size, crossing chapter and book boundaries. */
  const step = useCallback(
    (dir: 1 | -1) => {
      const data = primary.data;
      if (!data) return;
      const size = sel.verseEnd - sel.verse + 1;
      let { book, chapter } = sel;
      let verse = sel.verse + dir * size;
      const count = (b: string, c: number) => data.books[b]?.[c - 1]?.length ?? 0;
      if (verse > count(book, chapter)) {
        const bi = BOOKS.findIndex((b) => b.code === book);
        if (chapter < chapterCount(data, book)) chapter++;
        else if (bi < BOOKS.length - 1) [book, chapter] = [BOOKS[bi + 1].code, 1];
        else return;
        verse = 1;
      } else if (verse < 1) {
        const bi = BOOKS.findIndex((b) => b.code === book);
        if (chapter > 1) chapter--;
        else if (bi > 0) [book, chapter] = [BOOKS[bi - 1].code, chapterCount(data, BOOKS[bi - 1].code)];
        else return;
        verse = Math.max(1, count(book, chapter) - size + 1);
      }
      const next = { book, chapter, verse, verseEnd: Math.min(verse + size - 1, Math.max(verse, count(book, chapter))) };
      setSel(next);
      goLive(next);
    },
    [primary.data, sel, goLive],
  );

  const setBlank = (blank: boolean) => setLive((l) => ({ ...l, blank }));
  const clear = () => setLive((l) => ({ ...l, slide: null, blank: false }));
  const setStyle = (style: DisplayStyle) => setLive((l) => ({ ...l, style }));

  // Keep the selected verse in view when the verse column scrolls on its own (not on phones, where the page scrolls).
  useEffect(() => {
    const item = verseList.current?.querySelector<HTMLElement>('.is-selected');
    const panel = verseList.current?.closest<HTMLElement>('.panel');
    if (!item || !panel || panel.scrollHeight <= panel.clientHeight) return;
    const top = item.offsetTop; // .panel is the offset parent
    if (top < panel.scrollTop + 40) panel.scrollTop = top - 40;
    else if (top + item.offsetHeight > panel.scrollTop + panel.clientHeight - 40) panel.scrollTop = top + item.offsetHeight - panel.clientHeight + 40;
  }, [sel, primary.data]);

  // Presenter keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown' || k === ' ') step(1);
      else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') step(-1);
      else if (k === 'Enter') goLive();
      else if (k === 'b' || k === 'B' || k === '.') setLive((l) => ({ ...l, blank: !l.blank }));
      else if (k === 'Escape') clear();
      else if (k === '/') refBox.current?.focus();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, goLive]);

  const submitReference = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = parseReference(refInput, primary.data?.names);
    if (!ref) {
      setRefError('Try a reference like John 3:16, Ps 23 or Rom 8:28-30.');
      return;
    }
    const chapters = chapterCount(primary.data, ref.book);
    if (primary.data && (ref.chapter < 1 || ref.chapter > chapters)) {
      setRefError(`${bookName(ref.book, primary.data)} has ${chapters} chapters.`);
      return;
    }
    const verses = primary.data?.books[ref.book]?.[ref.chapter - 1]?.length ?? ref.verseEnd;
    const clamped = { ...ref, verse: Math.min(ref.verse, verses), verseEnd: Math.min(ref.verseEnd, verses) };
    setRefError('');
    setSel(clamped);
    setPicking('chapter');
    setTab('browse');
    refBox.current?.blur();
    verseList.current?.focus();
  };

  const results = useMemo(() => {
    const q = normalize(query);
    if (q.length < 3 || !primary.data) return [];
    const out: VerseRef[] = [];
    for (const b of BOOKS) {
      const chapters = primary.data.books[b.code] ?? [];
      for (let c = 0; c < chapters.length && out.length < 300; c++) {
        chapters[c].forEach((text, v) => {
          if (out.length < 300 && text && normalize(text).includes(q)) out.push({ book: b.code, chapter: c + 1, verse: v + 1, verseEnd: v + 1 });
        });
      }
    }
    return out;
  }, [query, primary.data]);

  const onVerseClick = (n: number, e: React.MouseEvent) => {
    if (e.shiftKey && sel.book && n !== sel.verse) setSel({ ...sel, verse: Math.min(sel.verse, n), verseEnd: Math.max(sel.verse, n) });
    else setSel({ ...sel, verse: n, verseEnd: n });
  };

  const openOutput = () => {
    window.open(`${location.pathname}${location.search}#/output`, 'bible-show-output', 'popup,width=1280,height=720');
  };

  const translationSelect = (value: string, onChange: (id: string) => void, allowNone: boolean) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">None</option>}
      {imported.length > 0 && (
        <optgroup label="Imported">
          {imported.map((t) => (
            <option key={t.id} value={t.id}>
              {t.language} · {t.abbr}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Built in">
        {BUILT_IN.map((t) => (
          <option key={t.id} value={t.id}>
            {t.language} · {t.abbr}
          </option>
        ))}
      </optgroup>
    </select>
  );

  const loadingError = primary.error ?? secondary.error;
  const onAir = Boolean(live.slide && !live.blank);

  return (
    <div className="presenter">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>✦</span> Bible Show
        </div>
        <label className="field-inline">
          <span>Translation</span>
          {translationSelect(prefs.primary, (primary) => setPrefs({ ...prefs, primary }), false)}
        </label>
        <label className="field-inline">
          <span>Second</span>
          {translationSelect(prefs.secondary, (secondary) => setPrefs({ ...prefs, secondary }), true)}
        </label>
        <div className="topbar-actions">
          <button onClick={() => setDialog('import')}>Import Bible</button>
          <button className="primary" onClick={openOutput}>Open output window</button>
        </div>
      </header>

      {loadingError && <div className="banner error">{loadingError}</div>}

      <main className="columns">
        <section className="panel nav-panel">
          <form onSubmit={submitReference} className="ref-form">
            <input
              ref={refBox}
              value={refInput}
              onChange={(e) => {
                setRefInput(e.target.value);
                setRefError('');
              }}
              placeholder="Go to… e.g. John 3:16  ( / )"
              aria-label="Bible reference"
              autoFocus={window.matchMedia('(pointer: fine)').matches}
            />
            <button type="submit">Go</button>
          </form>
          {refError && <p className="hint error">{refError}</p>}

          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'browse'} onClick={() => setTab('browse')}>Browse</button>
            <button role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')}>Search</button>
          </div>

          {tab === 'browse' ? (
            <div className="browser">
              <div className="crumbs">
                <button className={picking === 'book' ? 'active' : ''} onClick={() => setPicking('book')}>
                  {bookName(sel.book, primary.data)}
                </button>
                <button className={picking === 'chapter' ? 'active' : ''} onClick={() => setPicking('chapter')}>
                  Chapter {sel.chapter}
                </button>
              </div>
              {picking === 'book' ? (
                <div className="book-grid">
                  {BOOKS.filter((b) => !primary.data || primary.data.books[b.code]).map((b, i) => (
                    <button
                      key={b.code}
                      className={`${b.code === sel.book ? 'active' : ''} ${i < 39 ? 'ot' : 'nt'}`}
                      title={bookName(b.code, primary.data)}
                      onClick={() => {
                        setSel({ book: b.code, chapter: 1, verse: 1, verseEnd: 1 });
                        setPicking('chapter');
                      }}
                    >
                      {bookName(b.code, primary.data)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="chapter-grid">
                  {Array.from({ length: chapterCount(primary.data, sel.book) }, (_, i) => (
                    <button
                      key={i}
                      className={i + 1 === sel.chapter ? 'active' : ''}
                      onClick={() => setSel({ ...sel, chapter: i + 1, verse: 1, verseEnd: 1 })}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="search">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${primaryT.abbr}…`} aria-label="Search words" />
              <p className="hint">
                {query.trim().length < 3 ? 'Type at least 3 letters.' : `${results.length}${results.length === 300 ? '+' : ''} verses`}
              </p>
              <ul className="results">
                {results.map((r) => (
                  <li key={`${r.book}${r.chapter}:${r.verse}`}>
                    <button
                      onClick={() => setSel(r)}
                      onDoubleClick={() => {
                        setSel(r);
                        goLive(r);
                      }}
                    >
                      <strong>{formatReference(r, bookName(r.book, primary.data))}</strong>
                      <span dir={primaryT.rtl ? 'rtl' : undefined}>{primary.data?.books[r.book][r.chapter - 1][r.verse - 1]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="panel text-panel">
          <h2>
            {bookName(sel.book, primary.data)} {sel.chapter}
            <small> · {primaryT.abbr}</small>
          </h2>
          {!primary.data && !primary.error && <p className="hint">Loading {primaryT.name}…</p>}
          <ol ref={verseList} className="verses" tabIndex={-1} dir={primaryT.rtl ? 'rtl' : undefined} lang={primaryT.langCode}>
            {chapterVerses.map((text, i) =>
              text ? (
                <li
                  key={i}
                  className={i + 1 >= sel.verse && i + 1 <= sel.verseEnd ? 'is-selected' : ''}
                  onClick={(e) => onVerseClick(i + 1, e)}
                  onDoubleClick={() => goLive({ ...sel, verse: i + 1, verseEnd: i + 1 })}
                >
                  <span className="vnum">{i + 1}</span>
                  {text}
                </li>
              ) : null,
            )}
          </ol>
          <p className="hint keys">
            Click to preview · Shift‑click for a range · Double‑click or Enter to go live · ↑ ↓ previous / next · B blank · Esc clear
          </p>
        </section>

        <section className="panel live-panel">
          <div className="monitor-label">
            Preview <span>{preview?.reference}</span>
          </div>
          <div className="monitor">
            <Screen state={{ slide: preview, blank: false, style: live.style }} />
          </div>
          <div className="controls">
            <button className="go-live" onClick={() => goLive()} disabled={!preview}>
              Go live ⏎
            </button>
          </div>

          <div className="monitor-label">
            <span className={`on-air${onAir ? ' is-on' : ''}`}>{onAir ? 'Live' : live.blank ? 'Blanked' : 'Off'}</span>
            <span>{live.slide?.reference}</span>
          </div>
          <div className="monitor">
            <Screen state={live} />
          </div>
          <div className="controls">
            <button onClick={() => step(-1)} title="Previous (↑)">◀ Prev</button>
            <button onClick={() => step(1)} title="Next (↓)">Next ▶</button>
            <button className={live.blank ? 'active' : ''} onClick={() => setBlank(!live.blank)} title="Blank (B)">
              {live.blank ? 'Unblank' : 'Blank'}
            </button>
            <button onClick={clear} title="Clear (Esc)">Clear</button>
          </div>

          <StylePanel style={live.style} onChange={setStyle} />
        </section>
      </main>

      <footer className="footer">
        <button className="link" onClick={() => setDialog('translations')}>Translations &amp; licenses</button>
        <span>
          For OBS or Zoom: open the output window, then share that window or add it as a Window Capture.
        </span>
      </footer>

      {dialog === 'import' && (
        <ImportDialog
          imported={imported}
          onClose={() => setDialog('')}
          onChanged={async (selectId) => {
            await refreshImported();
            if (selectId) setPrefs((p) => ({ ...p, primary: selectId }));
            else if (!(await listImported()).some((t) => t.id === prefs.primary) && !BUILT_IN.some((t) => t.id === prefs.primary)) {
              setPrefs((p) => ({ ...p, primary: BUILT_IN[0].id }));
            }
          }}
        />
      )}
      {dialog === 'translations' && <TranslationsDialog imported={imported} onClose={() => setDialog('')} />}
    </div>
  );
}
