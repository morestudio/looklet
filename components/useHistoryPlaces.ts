'use client';
// a studio page's history strip <-> /gallery (TryOn, Packshot); place rules live in app/api/update and app/api/delete
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { api } from '@/lib/browser';

type Placed = { src: string; inGallery?: boolean };

export function useHistoryPlaces<R extends Placed>(
  results: R[],
  setResults: Dispatch<SetStateAction<R[]>>,
  setCurrent: Dispatch<SetStateAction<number | null>>,
  setStatus: (status: string) => void,
) {
  const latest = useRef(results); // read after awaits: results can grow at the front (new generation) meanwhile
  useEffect(() => { latest.current = results; }, [results]);
  const pending = useRef(new Map<string, Promise<unknown>>()); // in-flight bookmark request per src

  // optimistic; taps on the same image are ignored until its request settles (else update/delete can land out of order)
  async function toggleGallery(src: string) {
    if (pending.current.has(src)) return;
    const inGallery = Boolean(latest.current.find((r) => r.src === src)?.inGallery);
    const mark = (v: boolean) => setResults((list) => list.map((r) => (r.src === src ? { ...r, inGallery: v } : r)));
    mark(!inGallery);
    const request = api('/api/update', { src, inGallery: !inGallery });
    pending.current.set(src, request.catch(() => undefined));
    try {
      await request;
      setStatus('');
    } catch (err) {
      mark(inGallery);
      setStatus((inGallery ? 'เอาออกจากแกลลอรี่ไม่สำเร็จ: ' : 'บันทึกลงแกลลอรี่ไม่สำเร็จ: ') + (err as Error).message);
    } finally {
      pending.current.delete(src);
    }
  }

  // by src, not index · permanent = what RemoveImageDialog showed; the server answers 409 if its flags disagree
  async function removeFromHistory(src: string) {
    await pending.current.get(src); // a bookmark tap right before the confirm lands first
    const permanent = !latest.current.find((r) => r.src === src)?.inGallery;
    try {
      await api('/api/delete', { src, from: 'history', permanent });
    } catch (err) {
      return setStatus((permanent ? 'ลบไม่สำเร็จ: ' : 'เอาออกไม่สำเร็จ: ') + (err as Error).message);
    }
    const i = latest.current.findIndex((r) => r.src === src);
    if (i < 0) return;
    const left = latest.current.length - 1;
    setResults((list) => list.filter((r) => r.src !== src));
    setCurrent((c) => (c === i ? (left ? Math.min(i, left - 1) : null) : c !== null && c > i ? c - 1 : c));
  }

  return { toggleGallery, removeFromHistory };
}

// ← → step through the history strip in on-screen order (order = results indices as drawn, sets grouped); "รูปใหม่" (null) comes first
export function useHistoryKeys(order: number[], setCurrent: Dispatch<SetStateAction<number | null>>) {
  const latest = useRef(order);
  useEffect(() => { latest.current = order; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return; // Cmd/Alt+← = browser back
      if (document.querySelector('dialog[open]')) return; // a confirm/viewer dialog is on top
      if ((e.target as Element).closest?.('input, textarea, select')) return; // sliders, radios, text keep their arrows
      e.preventDefault(); // no native sideways scroll on top of ours
      const seq = [null, ...latest.current];
      setCurrent((c) => seq[Math.min(seq.length - 1, Math.max(0, seq.indexOf(c) + step))]);
      requestAnimationFrame(() => document.querySelector('.history .active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCurrent]);
}
