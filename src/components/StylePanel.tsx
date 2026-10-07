import type { DisplayStyle, Theme } from '../lib/live.ts';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green screen' },
  { id: 'transparent', label: 'Transparent' },
];

export function StylePanel({ style, onChange }: { style: DisplayStyle; onChange: (s: DisplayStyle) => void }) {
  const set = <K extends keyof DisplayStyle>(key: K, value: DisplayStyle[K]) => onChange({ ...style, [key]: value });
  return (
    <details className="style-panel" open>
      <summary>Output style</summary>
      <div className="style-grid">
        <label>
          <span>Background</span>
          <select value={style.theme} onChange={(e) => set('theme', e.target.value as Theme)}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Layout</span>
          <select value={style.layout} onChange={(e) => set('layout', e.target.value as DisplayStyle['layout'])}>
            <option value="full">Full screen</option>
            <option value="lower">Lower third</option>
          </select>
        </label>
        <label>
          <span>Font</span>
          <select value={style.font} onChange={(e) => set('font', e.target.value as DisplayStyle['font'])}>
            <option value="sans">Sans serif</option>
            <option value="serif">Serif</option>
          </select>
        </label>
        <label>
          <span>Align</span>
          <select value={style.align} onChange={(e) => set('align', e.target.value as DisplayStyle['align'])}>
            <option value="center">Center</option>
            <option value="left">Left</option>
          </select>
        </label>
        <label className="wide">
          <span>Text size {style.scale}%</span>
          <input type="range" min={50} max={160} step={10} value={style.scale} onChange={(e) => set('scale', Number(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={style.showReference} onChange={(e) => set('showReference', e.target.checked)} />
          Show reference
        </label>
        <label className="check">
          <input type="checkbox" checked={style.showVerseNumbers} onChange={(e) => set('showVerseNumbers', e.target.checked)} />
          Verse numbers
        </label>
      </div>
    </details>
  );
}
