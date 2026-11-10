'use client';
// past image -> panel (Go list items 3, 4), shared by both pages: opening a generated image loads its stored recipe into the
// panel; the setup in progress (draft) is set aside and comes back on รูปใหม่; changing a choice on a past image starts a new
// draft from it, asking first ("เริ่มจากรูปนี้?") when the draft has unsaved picks.
// Render-time state adjustment: every branch changes the state it checks, so no loop.
import { useEffect, useRef, useState } from 'react';
import { recipeKey } from '@/lib/recipe';

export type LoadedRecipe<R, S> = { recipe: R; missing: S[] };

export function useRecipeSync<R, S extends string, X>(o: {
  recipe: R; // panel choices, stored form
  shownSrc: string | null; // generated image on the stage; null = the setup in progress
  shown: LoadedRecipe<R, S> | null; // its stored recipe after the page's readRecipe (memoize it)
  steps: readonly S[];
  chosen: ReadonlySet<S>; // useChosenSteps
  ready: boolean; // page defaults are in (models, library); nothing loads before
  apply: (r: R, touched: S[]) => void; // panel <- recipe
  keep: () => X; // page state set aside with the draft
  restore: (x: X) => void;
  revalidate: (r: R) => R; // draft coming back: same checks as a past image (uploads deleted meanwhile)
  close: () => void; // show the setup in progress
  onStart?: (from: R) => void; // a new draft started from the shown image
}) {
  const [draft, setDraft] = useState<{ recipe: R; chosen: S[]; extra: X } | null>(null);
  const [viewKey, setViewKey] = useState<string | null>(null); // panel key when the shown image was opened; differs -> a choice changed
  const [syncedSrc, setSyncedSrc] = useState<string | null>(null); // shown image the panel was last synced to
  const [cleanKey, setCleanKey] = useState<string | null>(null); // draft key at page open / last generate; differs = unsaved picks
  const [pageStart, setPageStart] = useState<R | null>(null); // panel at page open
  const [confirmStart, setConfirmStart] = useState(false);
  const liveKey = recipeKey(o.recipe);
  const liveKeyRef = useRef(liveKey); // read when a generation finishes (its closure holds the sent key)
  useEffect(() => { liveKeyRef.current = liveKey; });

  const loadShown = () => o.apply(o.shown!.recipe, o.steps.filter((k) => !o.shown!.missing.includes(k)));
  const startFromShown = () => { o.onStart?.(o.shown!.recipe); setDraft(null); setViewKey(null); setSyncedSrc(null); o.close(); };
  if (cleanKey === null && o.ready) { setCleanKey(liveKey); setPageStart(o.recipe); }
  if (cleanKey !== null && o.shownSrc !== syncedSrc) { // clicked before ready -> loads right after
    setSyncedSrc(o.shownSrc);
    if (o.shown) {
      if (!draft) setDraft({ recipe: o.recipe, chosen: [...o.chosen], extra: o.keep() });
      loadShown();
      setViewKey(recipeKey(o.shown.recipe));
    } else {
      let key = liveKey;
      if (draft) { const back = o.revalidate(draft.recipe); o.apply(back, draft.chosen); o.restore(draft.extra); setDraft(null); key = recipeKey(back); }
      setViewKey(o.shownSrc ? key : null); // image without recipe: panel keeps the draft
    }
  } else if (viewKey !== null && liveKey !== viewKey && !confirmStart) {
    // a choice changed while viewing: no recipe -> back to the (changed) draft; recipe -> new draft from it
    if (!o.shown) { setViewKey(null); setSyncedSrc(null); o.close(); }
    else if (draft && recipeKey(draft.recipe) !== cleanKey) setConfirmStart(true);
    else startFromShown();
  }

  return {
    liveKey,
    draft,
    pageStart,
    // generation finished with the key it was sent with: true = panel unchanged since, open the new image
    // draft here = when it was sent: sent from a past image (draft set aside) doesn't save the draft's picks
    finished: (sentKey: string) => { if (!draft) setCleanKey(sentKey); return liveKeyRef.current === sentKey; },
    // "เริ่มจากรูปนี้?" dialog; cancel re-keys from today's lists, else it reopens after a delete
    confirm: confirmStart ? {
      cancel: () => { setConfirmStart(false); if (o.shown) { loadShown(); setViewKey(recipeKey(o.shown.recipe)); } },
      accept: () => { setConfirmStart(false); if (o.shown) startFromShown(); },
    } : null,
    // panel <- r as a fresh setup (model page "ล้าง")
    reset: (r: R) => { o.apply(r, []); setDraft(null); setViewKey(null); setSyncedSrc(null); o.close(); setCleanKey(recipeKey(r)); },
  };
}
