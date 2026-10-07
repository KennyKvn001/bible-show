import { useEffect, useState } from 'react';
import { readLive, subscribeCommands, subscribeLive } from '../lib/live.ts';
import { Screen } from './Screen.tsx';

/** Full-window output for screen sharing or window capture. Follows the presenter in the same browser. */
export function OutputView() {
  const [state, setState] = useState(readLive);
  useEffect(() => subscribeLive(setState), []);
  // Cancel live in the presenter closes this window. Browsers only allow it for windows a script opened,
  // which is how the presenter opens it; a tab opened by hand just goes blank.
  useEffect(() => subscribeCommands((command) => command === 'close' && window.close()), []);
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
