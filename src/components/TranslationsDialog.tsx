import type { Translation } from '../lib/bible.ts';
import { BUILT_IN } from '../lib/library.ts';
import { Dialog } from './Dialog.tsx';

export function TranslationsDialog({ imported, onClose }: { imported: Translation[]; onClose: () => void }) {
  return (
    <Dialog title="Translations & licenses" onClose={onClose}>
      <p className="hint">
        Built-in texts come from the <a href="https://github.com/BibleNLP/ebible" target="_blank" rel="noreferrer">eBible corpus</a>,{' '}
        <a href="https://github.com/seven1m/open-bibles" target="_blank" rel="noreferrer">open-bibles</a> and the{' '}
        <a href="https://github.com/BibleCorps/FRA-B-LSG1910-PD-UBS" target="_blank" rel="noreferrer">UBS Louis Segond</a>. Each one is
        public domain or freely licensed; Creative Commons texts are shown unchanged with credit to the rights holder.
      </p>
      <table className="license-table">
        <thead>
          <tr>
            <th>Language</th>
            <th>Translation</th>
            <th>License</th>
          </tr>
        </thead>
        <tbody>
          {imported.map((t) => (
            <tr key={t.id}>
              <td>{t.language}</td>
              <td>{t.name} ({t.abbr})</td>
              <td>Imported into this browser</td>
            </tr>
          ))}
          {BUILT_IN.map((t) => (
            <tr key={t.id}>
              <td>{t.language}</td>
              <td dir="auto">{t.name} ({t.abbr})</td>
              <td>{t.license}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
