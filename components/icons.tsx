// icons.tsx — ไอคอนเส้น (stroke) ขนาด 24 ใช้สีตามตัวอักษร (currentColor)
import type { ReactNode } from 'react';

function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconModel = () => <Svg><circle cx="12" cy="7" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></Svg>;
export const IconShirt = () => <Svg><path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 1.7-2.1 3-4 3S8.5 4.7 8 3z" /></Svg>;
export const IconBag = () => <Svg><path d="M5 8h14l-1 13H6L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Svg>;
export const IconPose = () => <Svg><circle cx="12" cy="4.5" r="2" /><path d="M12 7v7m0 0-3 7m3-7 3 7M6 10l6-2 6 2" /></Svg>;
export const IconScene = () => <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m3 16 5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.5" /></Svg>;
// ระยะ = กรอบครอปภาพ, มุมกล้อง = มุมองศา
export const IconFrame = () => <Svg><path d="M7 3v14h14" /><path d="M3 7h14v14" /></Svg>;
// มือ = ลากเลื่อนรูปตอนซูม (components/ImageViewer.tsx)
export const IconHand = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-7.5a1.5 1.5 0 0 1 3 0V12m0-6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.5 15a1.5 1.5 0 0 1 2.3-1.9L8 15.5" /></Svg>
);
export const IconPlace = () => <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.6" /><path d="M8.5 11v5m-2 0h4" /></Svg>;
export const IconAngle = () => <Svg><path d="M4 20 19 6" /><path d="M4 20h16" /><path d="M11 20a7 7 0 0 0-2-4.9" /></Svg>;
export const IconSettings = () => (
  <Svg><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></Svg>
);
export const IconRetouch = () => (
  <Svg><path d="M4 20 14 10" /><path d="m15 3 1 2 2 1-2 1-1 2-1-2-2-1 2-1z" /><path d="m19 11 .5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" /></Svg>
);
export const IconDownload = () => <Svg size={18}><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></Svg>;
export const IconSearch = () => <Svg size={18}><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></Svg>;
export const IconZoom = () => <Svg size={18}><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5M11 8v6M8 11h6" /></Svg>;
export const IconCompare = () => <Svg size={18}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 3v18" /></Svg>;
export const IconSparkle = () => <Svg size={18}><path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /><path d="m19 15 .7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" /></Svg>;
// หน้าสินค้า: สไตล์ = จานสี, ช็อตต้นแบบ = สำเนา, พร็อพ = ใบไม้
export const IconPalette = () => (
  <Svg><path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.2-1-1.6-1-2.6 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></Svg>
);
export const IconCopy = () => <Svg><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>;
export const IconLeaf = () => <Svg><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 19 13 11" /></Svg>;
