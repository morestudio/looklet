import { Charm, Great_Vibes } from 'next/font/google';
import Welcome from '@/components/Welcome';

export const metadata = { title: 'Welcome — Looklet' };

// ลายมือใช้เฉพาะหน้าต้อนรับ (ทั้งเว็บยังใช้ Inter + Noto Sans Thai ตาม layout)
// Welcome = ตัวเขียนลายมือแบบ calligraphy · ชื่อลูกค้า = Charm (ลายปากกาไทย มีตัวละตินด้วย ชื่อร้านมักเป็นภาษาไทย)
const script = Great_Vibes({ subsets: ['latin'], weight: '400', variable: '--font-script' });
const hand = Charm({ subsets: ['thai', 'latin'], weight: '400', variable: '--font-hand' });

// หลังเข้าด้วยโค้ดเชิญ (components/AuthForm.tsx) — ต้องเข้าสู่ระบบแล้ว (proxy.ts)
export default function Page() {
  return <div className={`${script.variable} ${hand.variable}`}><Welcome /></div>;
}
