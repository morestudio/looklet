'use client';
// Draws the toasts of lib/toast.ts (one instance, root layout). Top centre under the top bar; on phones below the step rail.
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getToasts, subscribeToasts, toast, type Toast, type ToastKind } from '@/lib/toast';

const NONE: Toast[] = [];
const STEP = 200; // ms between timer ticks
const FADE = 200; // matches toast-out in globals.css

// a modal <dialog> (image viewer, local edit…) covers the toasts: don't let one expire unseen behind it
const modalOpen = () => { try { return !!document.querySelector('dialog:modal'); } catch { return false; } };

// paper card for every kind; a filled disc says which: clay "!" (error / warn), the app's ink ✓ (ok)
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
  const items = useSyncExternalStore(subscribeToasts, getToasts, () => NONE);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // another page: its messages are about something else
  useEffect(() => () => toast.clear(), [pathname]);

  const timed = items.some((t) => !t.sticky && !t.leaving);
  useEffect(() => {
    if (!timed) return;
    // pointer or keyboard focus on a toast: timers wait. Read live on every tick, not tracked with focus/blur events: closing a
    // toast with × removes the focused button, no blur reaches React, and a tracked flag would stop every timer for good
    const held = () => { const el = box.current; return !!el && (!!el.querySelector('.toast:hover') || el.contains(document.activeElement)); };
    const id = setInterval(() => { if (!held() && !document.hidden && !modalOpen()) toast.tick(STEP); }, STEP);
    return () => clearInterval(id);
  }, [timed]);

  // fade out, then drop
  useEffect(() => {
    const leaving = items.filter((t) => t.leaving);
    if (!leaving.length) return;
    const id = setTimeout(() => leaving.forEach((t) => toast.remove(t.id)), FADE);
    return () => clearTimeout(id);
  }, [items]);

  return (
    <div className="toasts" ref={box}>
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}${t.leaving ? ' leaving' : ''}`} role={t.kind === 'error' || t.kind === 'warn' ? 'alert' : 'status'}>
          <Mark kind={t.kind} />
          <p>{t.text}</p>
          <button type="button" className="toast-x" aria-label="ปิดข้อความ" onClick={() => toast.dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
