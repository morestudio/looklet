'use client';
// Welcome.tsx — หน้าต้อนรับหลังเข้าด้วยโค้ดเชิญ: มินิมอล มีแค่ลายมือค่อยๆ เขียน "Welcome" ตามด้วยชื่อลูกค้า แล้วเข้าสตูดิโอเอง
// "เขียน" ด้วย CSS (globals.css .welcome): ชั้นเส้นปากกากับชั้นหมึก เผยจากซ้ายไปขวาด้วย mask ขอบนุ่ม หมึกตามหลังปากกานิดหน่อย
// แตะ / คลิก / Enter = ข้าม · ผู้ที่ตั้งลดการเคลื่อนไหวเห็นข้อความทันที แล้วเข้าสตูดิโอตามเวลาเดิม
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useMe } from './ui';

const WELCOME_MS = 2600; // เวลาเขียนคำว่า Welcome
const GAP_MS = 350; // เว้นก่อนเขียนชื่อ
const HOLD_MS = 1400; // เขียนเสร็จแล้วค้างไว้ให้อ่าน
const FADE_MS = 500; // จางออกก่อนเข้าสตูดิโอ (เท่ากับ transition ใน CSS)
const nameMs = (name: string) => Math.min(2600, Math.max(1000, [...name].length * 120)); // ชื่อยาว = เขียนนานขึ้น

function Ink({ text, className, delay, duration }: { text: string; className: string; delay: number; duration: number }) {
  const timing = { '--wl-delay': `${delay}ms`, '--wl-dur': `${duration}ms` } as CSSProperties;
  return <span className={'wl-ink ' + className} style={timing} aria-hidden="true">
    <span className="wl-pen">{text}</span><span className="wl-fill">{text}</span>
  </span>;
}

export default function Welcome() {
  const router = useRouter();
  const enter = useCallback(() => router.push('/'), [router]); // เข้าสตูดิโอ (session ตั้งไว้แล้วตอนเข้าด้วยโค้ด)
  const me = useMe();
  const name = me?.role === 'customer' ? me.label?.trim() ?? '' : '';
  const [fontsReady, setFontsReady] = useState(false);
  const [waited, setWaited] = useState(false); // ไม่รู้ชื่อภายในเวลานี้ (เช่นในเครื่องไม่มี login) -> เขียนแค่ Welcome
  const [leaving, setLeaving] = useState(false);
  const writing = fontsReady && (me !== null || waited); // รอฟอนต์ลายมือ + ชื่อ ก่อนเริ่มเขียน ไม่ให้เปลี่ยนฟอนต์กลางทาง
  const total = WELCOME_MS + (name ? GAP_MS + nameMs(name) : 0) + HOLD_MS;

  useEffect(() => {
    let gone = false;
    document.fonts.ready.then(() => { if (!gone) setFontsReady(true); });
    const timer = setTimeout(() => setWaited(true), 1200);
    return () => { gone = true; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!writing) return;
    const fade = setTimeout(() => setLeaving(true), total);
    const go = setTimeout(enter, total + FADE_MS);
    return () => { clearTimeout(fade); clearTimeout(go); };
  }, [writing, total, enter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') enter(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enter]);

  return <main className={'welcome' + (writing ? ' writing' : '') + (leaving ? ' leaving' : '')} onClick={enter}>
    <h1 className="sr-only">Welcome{name ? ` ${name}` : ''}</h1>
    <Ink text="Welcome" className="wl-welcome" delay={0} duration={WELCOME_MS} />
    {name && <Ink text={name} className="wl-name" delay={WELCOME_MS + GAP_MS} duration={nameMs(name)} />}
    <Link className="sr-only" href="/" prefetch={false}>เข้าสตูดิโอ</Link>
  </main>;
}
