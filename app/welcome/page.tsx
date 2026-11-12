import Welcome from '@/components/Welcome';

export const metadata = { title: 'Welcome — Lolo' };

// ฟอนต์มาจาก layout: Instrument Serif ตัวปกติ (29 ต.ค. ผู้ใช้ขอแทนลายมือ Great Vibes / Charm) · ชื่อภาษาไทยใช้ IBM Plex Sans Thai แทน (ไม่ใช้ serif กับภาษาไทย)
// หลังเข้าด้วยโค้ดเชิญ (components/AuthForm.tsx) — ต้องเข้าสู่ระบบแล้ว (proxy.ts)
export default function Page() {
  return <Welcome />;
}
