import { useState } from 'react';
import type { BibleData, Translation } from '../lib/bible.ts';
import { deleteImported, saveImported } from '../lib/idb.ts';
import { mergeBibles, parseBible } from '../lib/importers.ts';
import { forgetBible } from '../lib/library.ts';
import { Dialog } from './Dialog.tsx';

// File extensions left out of a file name used as the Bible's name ("eng-kjv.osis.xml" gives "eng kjv").
const EXTENSIONS = /(\.(xml|json|osis|usfx|zefania|usfm|sfm|txt))+$/i;

/** "1 verse", "31,102 verses" */
const count = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/**
 * Reads a file as text: UTF-16 or UTF-8 with a byte order mark, else UTF-8 if it is valid UTF-8, else Windows-1252,
 * which older USFM files often are. A USFM \ide line naming an encoding is not trusted: files converted to UTF-8 often
 * keep a stale "\ide CP-1252".
 */
async function readText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decode = (encoding: string, fatal = false) => new TextDecoder(encoding, { fatal }).decode(bytes).replace(/^\uFEFF/, '');
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decode('utf-16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decode('utf-16be');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return decode('utf-8');
  try {
    return decode('utf-8', true);
  } catch {
    return decode('windows-1252'); // not UTF-8
  }
}

/** The description after the book code on a USFM \id line: "Bibiliya Yera" in "\id GEN - Bibiliya Yera". */
const usfmTitle = (text: string) => /\\id\s+\S+[ \t]*(?:-[ \t]*)?([^\r\n]*)/.exec(text.slice(0, 4000))?.[1].trim() ?? '';

/** Why a file was skipped, short enough for a list: "no verses", "unrecognised file". */
function skipReason(message: string): string {
  if (message.startsWith('No verses')) return 'no verses';
  if (message.startsWith('Unrecognised file')) return 'unrecognised file';
  return message.replace(/\.$/, '').replace(/^\p{Lu}(?!\p{Lu})/u, (c) => c.toLowerCase());
}

/**
 * A short name from the full name, at most 6 characters: the initials of several words, keeping abbreviations and
 * numbers whole ("King James Version" gives "KJV", "Test LSG" gives "TLSG"), or else the start of the first word (one
 * word, or a first word too long to keep whole: "LSG1910 Test" gives "LSG191").
 */
function abbreviate(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  let out = '';
  for (const w of words.length > 1 ? words : []) {
    const part = /^[\p{Lu}\p{N}]+$/u.test(w) ? w : Array.from(w)[0];
    if (out.length + part.length > 6) break;
    out += part;
  }
  return (out || (words[0] ?? '').slice(0, 6)).toUpperCase();
}

interface Props {
  imported: Translation[];
  onClose: () => void;
  /** called after a save (with the new id) or a delete */
  onChanged: (selectId?: string) => void;
}

export function ImportDialog({ imported, onClose, onChanged }: Props) {
  const [parsed, setParsed] = useState<{ data: BibleData; verses: number; books: number } | null>(null);
  const [error, setError] = useState('');
  const [skipped, setSkipped] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [abbr, setAbbr] = useState('');
  const [language, setLanguage] = useState('Ikinyarwanda');
  const [langCode, setLangCode] = useState('rw');

  const onFiles = async (list: FileList | null) => {
    setParsed(null);
    setError('');
    setSkipped('');
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      // Several files are combined, e.g. a USFM Bible with one file per book. Files that cannot be read (such as front
      // matter without verses) are skipped and listed.
      const parts = [];
      const titles = new Set<string>();
      const skips = new Map<string, string[]>(); // reason -> file names
      let firstError = '';
      for (const file of files) {
        try {
          const text = await readText(file);
          parts.push(parseBible(text));
          titles.add(usfmTitle(text));
        } catch (e) {
          const message = (e as Error).message;
          firstError ||= `${file.name}: ${message}`;
          const reason = skipReason(message);
          skips.set(reason, [...(skips.get(reason) ?? []), file.name]);
        }
      }
      if (files.length > 1 && skips.size) {
        const reasons = Array.from(skips, ([reason, names]) => `${names.join(', ')} (${reason})`).join('; ');
        setSkipped(`Skipped ${count([...skips.values()].flat().length, 'file')}: ${reasons}`);
      }
      if (!parts.length) throw new Error(files.length > 1 ? 'No verses found in these files.' : firstError || 'No verses found.');
      const data = mergeBibles(parts);
      const verses = Object.values(data.books).flat(2).filter(Boolean).length;
      setParsed({ data, verses, books: Object.keys(data.books).length });
      if (!name) {
        // One file: its name. Several: the \id description they share, if it is short enough to be a name.
        const [title] = titles;
        if (files.length === 1) setName(files[0].name.replace(EXTENSIONS, '').replace(/[-_]/g, ' '));
        else if (titles.size === 1 && title && title.length <= 50) setName(title);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed) return;
    const id = `imported-${Date.now().toString(36)}`;
    const meta: Translation = {
      id,
      name: name.trim() || 'Imported Bible',
      abbr: abbr.trim() || abbreviate(name) || 'BIBLE',
      language: language.trim() || 'Other',
      langCode: langCode.trim() || 'und',
      license: 'Imported',
      imported: true,
    };
    setBusy(true);
    try {
      await saveImported(meta, parsed.data);
      onChanged(id);
      onClose();
    } catch (err) {
      setError(`Could not save: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Import a Bible" onClose={onClose}>
      <p className="hint">
        Load a Bible you are allowed to use, for example a Kinyarwanda translation your church has rights to. Supported files: USFM
        (select all the book files at once), Zefania XML, OSIS XML, USFX XML and JSON. Files stay in this browser and are
        never uploaded.
      </p>
      <form onSubmit={save} className="import-form">
        <label className="file">
          <input
            type="file"
            multiple
            accept=".usfm,.sfm,.txt,.xml,.json,.osis,.usfx,application/xml,application/json,text/xml,text/plain"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
        {busy && <p className="hint">Reading…</p>}
        {error && <p className="hint error">{error}</p>}
        {skipped && <p className="hint">{skipped}</p>}
        {parsed && (
          <>
            <p className="hint ok">
              Found {count(parsed.verses, 'verse')} in {count(parsed.books, 'book')}.
            </p>
            <label>
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bibiliya Yera" required />
            </label>
            <div className="row">
              <label>
                <span>Short name</span>
                <input value={abbr} onChange={(e) => setAbbr(e.target.value)} placeholder="BYSB" maxLength={10} />
              </label>
              <label>
                <span>Language</span>
                <input value={language} onChange={(e) => setLanguage(e.target.value)} />
              </label>
              <label>
                <span>Code</span>
                <input value={langCode} onChange={(e) => setLangCode(e.target.value)} maxLength={8} size={4} />
              </label>
            </div>
            <button className="primary" type="submit" disabled={busy}>Save to this browser</button>
          </>
        )}
      </form>

      {imported.length > 0 && (
        <>
          <h3>Imported in this browser</h3>
          <ul className="imported-list">
            {imported.map((t) => (
              <li key={t.id}>
                <span>
                  {t.name} <small>({t.abbr}, {t.language})</small>
                </span>
                <button
                  onClick={async () => {
                    if (!confirm(`Remove ${t.name} from this browser?`)) return;
                    await deleteImported(t.id);
                    forgetBible(t.id);
                    onChanged();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
