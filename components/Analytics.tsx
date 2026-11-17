'use client';
// Google Analytics 4 loader (root layout). Events: lib/analytics.ts · setup and reports: docs/analytics.md
// Production host only (or NEXT_PUBLIC_GA_DEBUG=1); no consent banner (owner's decision 16 Nov), ads/signals off, no PII.
import Script from 'next/script';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { GA_ID, gaEnabled, markConfigured, takeLogin, track } from '@/lib/analytics';
import { loadMe } from '@/lib/browser';

const never = () => () => {}; // host and env don't change while the page is open
export default function Analytics() {
  const on = useSyncExternalStore(never, gaEnabled, () => false); // server render: off (hostname is browser-only)
  const [ready, setReady] = useState(false); // user_id/role queued: only then load gtag.js

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
    // shared /api/me request (loadMe: plain fetch with a timeout, so a hung request can't keep the queued events from leaving)
    loadMe()
      .then((me) => {
        if (cancelled) return;
        // the property's tag configures itself when gtag.js loads (gtm.init) and ignores gtag('config') params
        // (ignoreDupeGtagConfigCalls), so user_id and role go through 'set'; queued before the script loads, every
        // event carries them except that automatic first page_view (checked in headless Chrome, 16 Nov)
        if (me?.aid) window.gtag!('set', { user_id: me.aid });
        if (me?.role) window.gtag!('set', 'user_properties', { role: me.role });
        window.gtag!('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
        markConfigured();
        const method = takeLogin();
        if (method) track('login', { method });
        setReady(true);
      });
    return () => { cancelled = true; };
  }, [on]);

  return on && ready ? <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" /> : null;
}
