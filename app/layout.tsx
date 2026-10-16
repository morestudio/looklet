import type { Metadata } from 'next';
import { Inter, Noto_Sans_Thai } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const thai = Noto_Sans_Thai({ subsets: ['thai'], variable: '--font-thai' });

export const metadata: Metadata = {
  title: 'ห้องลองชุด AI',
  description: 'เลือกนางแบบ ชุด ของเสริม และฉาก ให้ AI สร้างรูป แล้วแต่งรูปต่อได้ในเครื่อง',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="th" className={`${inter.variable} ${thai.variable}`}>
      <body>{children}</body>
    </html>
  );
}
