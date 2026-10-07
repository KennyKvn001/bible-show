// Presenter -> output window sync. BroadcastChannel delivers updates instantly between tabs and windows of
// the same browser; localStorage keeps the last state so an output window opened later starts in sync.

export interface SlidePart {
  abbr: string;
  lang: string;
  rtl?: boolean;
  verses: { n: number; text: string }[];
}

export interface Slide {
  reference: string;
  parts: SlidePart[];
}

export type Theme = 'dark' | 'light' | 'blue' | 'green' | 'transparent';

export interface DisplayStyle {
  theme: Theme;
  layout: 'full' | 'lower';
  font: 'sans' | 'serif';
  align: 'center' | 'left';
  /** maximum text size, as a percentage of the default */
  scale: number;
  showReference: boolean;
  showVerseNumbers: boolean;
}

export interface LiveState {
  slide: Slide | null;
  blank: boolean;
  style: DisplayStyle;
}

export const DEFAULT_STYLE: DisplayStyle = {
  theme: 'dark',
  layout: 'full',
  font: 'sans',
  align: 'center',
  scale: 100,
  showReference: true,
  showVerseNumbers: true,
};

const KEY = 'bible-show:live';
const COMMAND_KEY = 'bible-show:command';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bible-show') : null;

export function readLive(): LiveState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LiveState | null;
    if (s) return { ...s, style: { ...DEFAULT_STYLE, ...s.style } };
  } catch {
    /* storage unavailable */
  }
  return { slide: null, blank: false, style: DEFAULT_STYLE };
}

export function publishLive(state: LiveState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable; the channel still works */
  }
  channel?.postMessage(state);
}

export function subscribeLive(fn: (s: LiveState) => void): () => void {
  const onMessage = (e: MessageEvent<LiveState | { command: string }>) => {
    if (!('command' in e.data)) fn(e.data);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn(readLive());
  };
  channel?.addEventListener('message', onMessage);
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
  };
}

export type Command = 'close';

/** Tells output windows to act, e.g. close themselves when live is cancelled. */
export function sendCommand(command: Command) {
  channel?.postMessage({ command });
  try {
    // A changing value so the storage event fires every time.
    localStorage.setItem(COMMAND_KEY, JSON.stringify({ command, at: Date.now() }));
  } catch {
    /* storage unavailable; the channel still works */
  }
}

export function subscribeCommands(fn: (command: Command) => void): () => void {
  const onMessage = (e: MessageEvent<{ command?: Command }>) => {
    if (e.data && 'command' in e.data && e.data.command) fn(e.data.command);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== COMMAND_KEY || !e.newValue) return;
    try {
      fn((JSON.parse(e.newValue) as { command: Command }).command);
    } catch {
      /* ignore malformed values */
    }
  };
  channel?.addEventListener('message', onMessage);
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
  };
}
