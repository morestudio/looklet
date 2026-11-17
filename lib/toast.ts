// Toast store, no React. Callers use `toast`; components/Toaster.tsx draws it through `toastStore`.
// Errors stay until closed (×), pushed out by newer ones or the page changes; every other kind leaves after TOAST_TTL.
// No per-action keys: a later success doesn't clear an old error (the screen shows the success). See CLAUDE.md "Toasts".

export type ToastKind = 'error' | 'warn' | 'ok' | 'info' | 'busy';
export type Toast = { id: number; kind: ToastKind; text: string; leaving?: boolean };

export const TOAST_TTL = 6000;
export const TOAST_MAX = 3;

const stays = (kind: ToastKind) => kind === 'error' || kind === 'busy';

let items: Toast[] = [];
let nextId = 1;
const left = new Map<number, number>(); // ms until a timed toast leaves; outside `items` so a tick doesn't re-render
const listeners = new Set<() => void>();

function set(next: Toast[]) {
  items = next;
  for (const id of left.keys()) if (!next.some((t) => t.id === id && !t.leaving)) left.delete(id);
  listeners.forEach((l) => l());
}

function show(kind: ToastKind, message: string): number | undefined {
  const text = message.trim();
  if (!text) return;
  // same text again (offline retries): keep the one box. Not for busy: each busy note is closed by its own caller
  const same = kind !== 'busy' && items.find((t) => !t.leaving && t.kind === kind && t.text === text);
  if (same) {
    if (!stays(kind)) left.set(same.id, TOAST_TTL);
    return same.id;
  }
  const toast: Toast = { id: nextId++, kind, text };
  let next = [...items, toast];
  // over the cap: drop the oldest timed toast first, then the oldest of all. Busy notes don't count and are never
  // dropped: they close themselves, and a "working…" note must not push out an unread error
  const counted = (t: Toast) => !t.leaving && t.kind !== 'busy';
  while (next.filter(counted).length > TOAST_MAX) {
    const shown = next.filter((t) => counted(t) && t !== toast);
    const drop = shown.find((t) => !stays(t.kind)) ?? shown[0];
    if (!drop) break;
    next = next.filter((t) => t !== drop);
  }
  if (!stays(kind)) left.set(toast.id, TOAST_TTL);
  set(next);
  return toast.id;
}

// starts the fade-out; Toaster removes it when the fade ends
function dismiss(id: number | undefined) {
  if (items.some((t) => t.id === id && !t.leaving)) set(items.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
}

export const toast = {
  error: (text: string) => void show('error', text),
  /** "do X first": looks like an error, leaves like ok */
  warn: (text: string) => void show('warn', text),
  ok: (text: string) => void show('ok', text),
  info: (text: string) => void show('info', text),
  /** "working…": returns the function that closes it */
  busy: (text: string) => { const id = show('busy', text); return () => dismiss(id); },
};

// for components/Toaster.tsx (and the tests) only
export const toastStore = {
  get: () => items,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  stays: (t: Toast) => stays(t.kind),
  dismiss,
  remove: (id: number) => { if (items.some((t) => t.id === id)) set(items.filter((t) => t.id !== id)); },
  clear: () => { if (items.length) set([]); },
  // advance the timers by ms; Toaster calls it only while nothing holds them
  tick(ms: number) {
    const due: number[] = [];
    for (const [id, rest] of left) {
      if (rest - ms <= 0) due.push(id); else left.set(id, rest - ms);
    }
    due.forEach(dismiss);
  },
};
