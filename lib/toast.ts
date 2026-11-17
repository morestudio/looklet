// Toast store (browser, no React): any file calls toast.error / warn / ok / info / busy; components/Toaster.tsx draws them.
// Rule: a message leaves by itself only when missing it costs nothing. Errors (something failed) stay until closed with ×,
// pushed out by newer ones (TOAST_MAX) or the page changes; everything else leaves after TOAST_TTL, including warn = "do X
// first" (looks like an error, but answers the click the user just made; pressing again shows it again).
// No per-action keys (user's call 17 Nov): a later success doesn't clear an old error, because the screen already shows the
// success (the image appears, the file saves); keys and retry-clearing cost ~20 call sites and caused the blink bug.
// Not for dialogs: a modal <dialog> covers the page, so errors raised inside one are shown inside it.

export type ToastKind = 'error' | 'warn' | 'ok' | 'info' | 'busy';
export type Toast = { id: number; kind: ToastKind; text: string; sticky: boolean; leaving?: boolean };

export const TOAST_TTL = 6000; // one value for every timed kind (user's call 17 Nov); long enough to read a 90-char warning
export const TOAST_MAX = 3;

let items: Toast[] = [];
let nextId = 1;
const left = new Map<number, number>(); // ms until a timed toast leaves; kept out of `items` so a tick doesn't re-render
const listeners = new Set<() => void>();

function set(next: Toast[]) {
  items = next;
  for (const id of left.keys()) if (!next.some((t) => t.id === id && !t.leaving)) left.delete(id);
  listeners.forEach((l) => l());
}

const live = () => items.filter((t) => !t.leaving);

function show(kind: ToastKind, message: string): number | undefined {
  const text = message.trim();
  if (!text) return;
  const sticky = kind === 'error' || kind === 'busy';
  // the same message again (a retry that failed the same way, offline clicks): keep the one box, restart its timer
  const same = live().find((t) => t.kind === kind && t.text === text);
  if (same) {
    if (!sticky) left.set(same.id, TOAST_TTL);
    return same.id;
  }
  const toast: Toast = { id: nextId++, kind, text, sticky };
  let next = [...items, toast];
  // over the cap: the oldest timed one goes first (it was leaving anyway), then the oldest of all
  while (next.filter((t) => !t.leaving).length > TOAST_MAX) {
    const shown = next.filter((t) => !t.leaving && t !== toast);
    const drop = shown.find((t) => !t.sticky) ?? shown[0];
    next = next.filter((t) => t !== drop);
  }
  if (!sticky) left.set(toast.id, TOAST_TTL);
  set(next);
  return toast.id;
}

// fades out, then Toaster calls remove()
function dismiss(id: number | undefined) {
  if (items.some((t) => t.id === id && !t.leaving)) set(items.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
}

export const toast = {
  error: (text: string) => void show('error', text),
  warn: (text: string) => void show('warn', text),
  ok: (text: string) => void show('ok', text),
  info: (text: string) => void show('info', text),
  // "working…": stays until the returned function closes it (call it before showing the result)
  busy: (text: string) => { const id = show('busy', text); return () => dismiss(id); },
  dismiss,
  remove: (id: number) => { if (items.some((t) => t.id === id)) set(items.filter((t) => t.id !== id)); },
  clear: () => { if (items.length) set([]); },
  // Toaster calls this while nothing pauses the timers (pointer or focus on a toast, hidden tab, open modal dialog)
  tick(ms: number) {
    const due: number[] = [];
    for (const [id, rest] of left) {
      if (rest - ms <= 0) due.push(id); else left.set(id, rest - ms);
    }
    due.forEach(dismiss);
  },
};

export const getToasts = () => items;
export const subscribeToasts = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
