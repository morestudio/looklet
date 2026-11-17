'use client';
// Draws lib/toast.ts (one instance, root layout). Layout and look: .toasts in app/globals.css.
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { toastStore, type Toast, type ToastKind } from '@/lib/toast';

const NONE: Toast[] = [];
const STEP = 200; // timer resolution, ms
const FADE = 200; // fade-out, ms; passed to the CSS as --toast-fade

// a modal <dialog> covers the toasts: don't let one expire unseen behind it
const modalOpen = () => { try { return !!document.querySelector('dialog:modal'); } catch { return false; } };

function Mark({ kind }: { kind: ToastKind }) {
  if (kind === 'busy') return <span className="toast-spin" aria-hidden />;
  if (kind === 'info') return null;
  return (
    <svg className="toast-mark" viewBox="0 0 20 20" width="20" height="20" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d={kind === 'ok' ? 'm6.3 10.3 2.5 2.5 4.9-5.2' : 'M10 5.6v5.2M10 14.2v.1'} fill="none" stroke="var(--on-primary)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Toaster() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.get, () => NONE);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => () => toastStore.clear(), [pathname]); // another page: old messages are about something else

  const timed = items.some((t) => !t.leaving && !toastStore.stays(t));
  useEffect(() => {
    if (!timed) return;
    // hover / focus on a toast holds the timers. Checked live each tick: closing with × removes the focused button
    // without a blur React can see, so a flag set from focus/blur events would stay on and stop every timer
    const held = () => { const el = box.current; return !!el && (!!el.querySelector('.toast:hover') || el.contains(document.activeElement)); };
    const id = setInterval(() => { if (!held() && !document.hidden && !modalOpen()) toastStore.tick(STEP); }, STEP);
    return () => clearInterval(id);
  }, [timed]);

  useEffect(() => {
    const leaving = items.filter((t) => t.leaving);
    if (!leaving.length) return;
    const id = setTimeout(() => leaving.forEach((t) => toastStore.remove(t.id)), FADE);
    return () => clearTimeout(id);
  }, [items]);

  return (
    <div className="toasts" ref={box} style={{ '--toast-fade': `${FADE}ms` } as CSSProperties}>
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}${t.leaving ? ' leaving' : ''}`} role={t.kind === 'error' || t.kind === 'warn' ? 'alert' : 'status'}>
          <Mark kind={t.kind} />
          <p>{t.text}</p>
          <button type="button" className="toast-x" aria-label="ปิดข้อความ" onClick={() => toastStore.dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
