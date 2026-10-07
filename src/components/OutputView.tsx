import { useEffect, useState } from 'react';
import { readLive, subscribeLive } from '../lib/live.ts';
import { Screen } from './Screen.tsx';

/** Full-window output for screen sharing or window capture. Follows the presenter in the same browser. */
export function OutputView() {
  const [state, setState] = useState(readLive);
  useEffect(() => subscribeLive(setState), []);
  useEffect(() => {
    document.title = 'Bible Show · Output';
    document.documentElement.classList.add('output-page');
    if (state.style.theme === 'transparent') document.documentElement.classList.add('transparent');
    else document.documentElement.classList.remove('transparent');
  }, [state.style.theme]);
  return (
    <div className="output" onDoubleClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()}>
      <Screen state={state} />
    </div>
  );
}
