import { useLayoutEffect, useRef } from 'react';
import type { LiveState } from '../lib/live.ts';

/**
 * Renders the projected slide. Fills its parent (which should have a 16:9 or full-window size) and shrinks the
 * text until it fits, so long passages never overflow on the stream.
 */
export function Screen({ state }: { state: LiveState }) {
  const { slide, blank, style } = state;
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const visible = slide && !blank;

  useLayoutEffect(() => {
    const el = box.current;
    const inner = content.current;
    if (!el || !inner) return;
    const fit = () => {
      const max = (el.clientHeight / (style.layout === 'lower' ? 9 : 7)) * (style.scale / 100);
      let lo = 6;
      let hi = Math.max(lo, max);
      inner.style.fontSize = `${hi}px`;
      if (inner.scrollHeight <= inner.clientHeight + 1 && inner.scrollWidth <= inner.clientWidth + 1) return;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        inner.style.fontSize = `${mid}px`;
        if (inner.scrollHeight <= inner.clientHeight + 1 && inner.scrollWidth <= inner.clientWidth + 1) lo = mid;
        else hi = mid;
      }
      inner.style.fontSize = `${lo}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [slide, blank, style.layout, style.scale, style.showReference, style.showVerseNumbers, style.font]);

  return (
    <div ref={box} className={`screen theme-${style.theme} layout-${style.layout} font-${style.font} align-${style.align}`}>
      <div className={`screen-panel${visible ? ' is-visible' : ''}`}>
        <div ref={content} className="screen-content">
          {visible && (
            <>
              {slide.parts.map((part, i) => (
                <div key={i} className="screen-part" lang={part.lang} dir={part.rtl ? 'rtl' : 'ltr'}>
                  {part.verses.map((v) => (
                    <span key={v.n}>
                      {style.showVerseNumbers && part.verses.length > 1 && <sup>{v.n}</sup>}
                      {v.text}{' '}
                    </span>
                  ))}
                  {slide.parts.length > 1 && <span className="screen-abbr">{part.abbr}</span>}
                </div>
              ))}
              {style.showReference && (
                <div className="screen-ref">
                  {slide.reference}
                  {slide.parts.length === 1 && <span className="screen-abbr"> · {slide.parts[0].abbr}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
