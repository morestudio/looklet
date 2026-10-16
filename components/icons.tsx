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
