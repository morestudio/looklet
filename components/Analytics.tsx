'use client';
// Google Analytics 4 loader (root layout). Events: lib/analytics.ts · setup and reports: docs/analytics.md
// Production host only (or NEXT_PUBLIC_GA_DEBUG=1); no consent banner (owner's decision 16 Nov), ads/signals off, no PII.
import Script from 'next/script';
import { useEffect, useSyncExternalStore } from 'react';
import { GA_DEBUG, GA_ID, gaEnabled, markConfigured, takeLogin, track } from '@/lib/analytics';

const never = () => () => {}; // host and env don't change while the page is open
export default function Analytics() {
  const on = useSyncExternalStore(never, gaEnabled, () => false); // server render: off (hostname is browser-only)

  useEffect(() => {
    if (!on) return;
    if (!window.gtag) { // once per page load (dev StrictMode runs effects twice)
      window.dataLayer = window.dataLayer || [];
      // gtag.js reads `arguments` objects from dataLayer, not arrays
      // eslint-disable-next-line prefer-rest-params
      window.gtag = function gtag() { window.dataLayer!.push(arguments); };
      window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
      window.gtag('js', new Date());
    }
    let cancelled = false;
    // plain fetch, not api(): api() sends a 401 to /login, which would loop on the login page itself
    // timeout: a hung /api/me would never configure, and the queued events would never leave
    fetch('/api/me', { signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((me: { role?: string; aid?: string } | null) => {
        if (cancelled) return;
        if (me?.role) window.gtag!('set', 'user_properties', { role: me.role });
        window.gtag!('config', GA_ID, {
          ...(me?.aid ? { user_id: me.aid } : {}),
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
          ...(GA_DEBUG ? { debug_mode: true } : {}),
        });
        markConfigured();
        const method = takeLogin();
        if (method) track('login', { method });
      });
    return () => { cancelled = true; };
  }, [on]);

  return on ? <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" /> : null;
}
