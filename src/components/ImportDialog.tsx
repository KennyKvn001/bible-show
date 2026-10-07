import { useState } from 'react';
import type { BibleData, Translation } from '../lib/bible.ts';
import { deleteImported, saveImported } from '../lib/idb.ts';
import { mergeBibles, parseBible } from '../lib/importers.ts';
import { forgetBible } from '../lib/library.ts';
import { Dialog } from './Dialog.tsx';

interface Props {
  imported: Translation[];
  onClose: () => void;
  /** called after a save (with the new id) or a delete */
  onChanged: (selectId?: string) => void;
}

export function ImportDialog({ imported, onClose, onChanged }: Props) {
  const [parsed, setParsed] = useState<{ data: BibleData; verses: number; books: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [abbr, setAbbr] = useState('');
  const [language, setLanguage] = useState('Ikinyarwanda');
  const [langCode, setLangCode] = useState('rw');

  const onFiles = async (list: FileList | null) => {
    setParsed(null);
    setError('');
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      // Several files are combined, e.g. a USFM Bible with one file per book. Files without verses are skipped.
      const parts = [];
      let firstError = '';
      for (const file of files) {
        try {
          parts.push(parseBible(await file.text()));
        } catch (e) {
          firstError ||= `${file.name}: ${(e as Error).message}`;
        }
      }
      if (!parts.length) throw new Error(firstError || 'No verses found.');
      const data = mergeBibles(parts);
      const verses = Object.values(data.books).flat(2).filter(Boolean).length;
      setParsed({ data, verses, books: Object.keys(data.books).length });
      if (!name) setName(files.length === 1 ? files[0].name.replace(/\.(xml|json|osis|usfx|zefania|usfm|sfm|txt)+$/i, '').replace(/[-_]/g, ' ') : '');
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
      abbr: abbr.trim() || name.trim().slice(0, 6).toUpperCase() || 'BIBLE',
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
        {parsed && (
          <>
            <p className="hint ok">
              Found {parsed.verses.toLocaleString()} verses in {parsed.books} books.
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
