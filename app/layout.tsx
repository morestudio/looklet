import type { Metadata } from 'next';
import { Geist, IBM_Plex_Sans_Thai, Instrument_Serif } from 'next/font/google';
import './globals.css';

// ฟอนต์ตาม design system Atelier: Geist (ละติน + ตัวเลข) · IBM Plex Sans Thai (ไทย) · Instrument Serif (โลโก้ / หัวข้อใหญ่ ไม่ใช้ตัวหนา)
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const thai = IBM_Plex_Sans_Thai({ subsets: ['thai'], weight: ['400', '500', '600', '700'], variable: '--font-plex-thai' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'SnapAds',
  description: 'เลือกนางแบบ ชุด ของเสริม และฉาก ให้ AI สร้างรูป แล้วแต่งรูปต่อได้ในเครื่อง',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="th" className={`${geist.variable} ${thai.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
