// Google Analytics 4 (browser only). Setup + reports: docs/analytics.md
// Never send PII: no email, invite code (it is a login password), customer label, image src/path or prompt text.
// Params are English ids, booleans or numbers only (GA caps values at 100 chars; Thai names would split one choice into many rows).

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';
const GA_HOST = 'lolostyleshot.vercel.app'; // production only: localhost and Vercel previews stay out of the data
export const GA_DEBUG = process.env.NEXT_PUBLIC_GA_DEBUG === '1'; // local testing: load anywhere, events show in GA DebugView

export type AnalyticsEvent =
  | 'login'
  | 'sign_up'
  | 'step_done'
  | 'step_view'
  | 'upload'
  | 'generate_start'
  | 'generate_success'
  | 'generate_error'
  | 'quota_blocked'
  | 'image_kept'
  | 'gallery_remove'
  | 'local_edit'
  | 'creative_ideas';
export type Params = Record<string, string | number | boolean>;
export type StudioPage = 'model' | 'product';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const gaEnabled = () =>
  typeof window !== 'undefined' && Boolean(GA_ID) && (GA_DEBUG || location.hostname === GA_HOST);

// events fired before gtag('config') (it waits for /api/me) would reach no stream -> hold them until configured
let configured = false;
const queue: [AnalyticsEvent, Params][] = [];
const QUEUE_MAX = 50; // config never came (Analytics not mounted): don't grow forever

// debug_mode per event: the property ignores it in gtag('config') (components/Analytics.tsx)
const send = (name: AnalyticsEvent, params: Params) =>
  window.gtag?.('event', name, GA_DEBUG ? { ...params, debug_mode: true } : params);

export function track(name: AnalyticsEvent, params: Params = {}) {
  try {
    if (!gaEnabled()) return;
    if (!configured || !window.gtag) return void (queue.length < QUEUE_MAX && queue.push([name, params]));
    send(name, params);
  } catch {
    /* analytics must never break the app */
  }
}

export function markConfigured() {
  configured = true;
  for (const [name, params] of queue.splice(0)) send(name, params);
}

// funnel step: the first real choice in a step, once per step per full page load (useChosenSteps in components/ui.tsx)
const stepsDone = new Set<string>();
export function trackStepDone(page: StudioPage, step: string) {
  if (stepsDone.has(page + ':' + step)) return;
  stepsDone.add(page + ':' + step);
  track('step_done', { page, step });
}

// login happens on /login right before a full page load (no user_id yet, hit may be cut off): fire it on the next page instead
const LOGIN_FLAG = 'lolo:ga-login';
export function noteLogin(method: 'invite_code' | 'password') {
  try {
    sessionStorage.setItem(LOGIN_FLAG, method);
  } catch {
    /* private mode */
  }
}
export function takeLogin(): string | null {
  try {
    const method = sessionStorage.getItem(LOGIN_FLAG);
    sessionStorage.removeItem(LOGIN_FLAG);
    return method;
  } catch {
    return null;
  }
}

// where a picked image came from: built-in sample (public/images) or the user's own upload
export const itemSource = (src: string | undefined | null) =>
  !src ? 'none' : src.startsWith('/images/') ? 'sample' : 'upload';

// short reason ids for generate_error: api() (lib/browser.ts) attaches the HTTP status and the server's reason to its errors
export function errorReason(err: unknown): string {
  const { status, reason } = (err ?? {}) as { status?: number; reason?: string }; // reason: lib/fail-reason.ts, from the server
  if (reason === 'safety') return 'safety';
  if (status === 403 || status === 429) return 'quota';
  if (status === 413) return 'too_large';
  if (status === 504) return 'timeout';
  if (status === 502) return 'provider'; // AI provider error (lib/route.ts ApiError)
  if (status && status >= 400 && status < 500) return 'invalid';
  if (status) return 'server';
  return 'client'; // no HTTP answer: network down, or a browser-side step failed (image resize, canvas)
}

// stopwatch for duration_s: const elapsed = stopwatch(); ... elapsed() -> whole seconds
export function stopwatch() {
  const start = performance.now();
  return () => Math.round((performance.now() - start) / 1000);
}

// North Star de-dup: first = this browser never kept this image before and it wasn't already in the gallery.
// Kept srcs live in localStorage so a reload doesn't count the same image again (it did until 19 Nov);
// another browser or cleared site data counts it once more. The srcs stay on the device, never sent to GA.
const KEPT_KEY = 'lolo:ga-kept';
const KEPT_MAX = 500; // newest only
const kept = new Set<string>(); // this page load; also covers private mode, where localStorage throws
function storedKept(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEPT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
export function firstKeep(src: string, inGallery = false) {
  const stored = storedKept();
  const seen = kept.has(src) || stored.includes(src);
  kept.add(src);
  if (!stored.includes(src)) {
    try {
      localStorage.setItem(KEPT_KEY, JSON.stringify([...stored, src].slice(-KEPT_MAX)));
    } catch {
      /* private mode / full storage: this page load still de-dups */
    }
  }
  return !seen && !inGallery;
}

// the North Star event, one place for both studio pages: download / share sheet / in-app long-press save / gallery bookmark
export function trackKept(
  page: StudioPage,
  image: { src: string; inGallery?: boolean; editedFrom?: string },
  via: 'download' | 'share' | 'inapp' | 'gallery',
) {
  // via gallery: the image has just been bookmarked, so its own inGallery flag doesn't make it a repeat
  track('image_kept', {
    page,
    via,
    edited: Boolean(image.editedFrom),
    first: firstKeep(image.src, via !== 'gallery' && image.inGallery),
  });
}
