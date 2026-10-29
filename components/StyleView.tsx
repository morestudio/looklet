'use client';
// StyleView.tsx — ภาพวาดตัวอย่างสไตล์ถ่ายภาพ (หน้านางแบบ ขั้นสไตล์ถ่ายภาพ) ให้เห็นความต่างโดยไม่ต้องจินตนาการ
// ใช้แทนรูปตัวอย่างจริง (ลองสร้าง 9 รูปแล้วผู้ใช้ไม่ชอบ 29 ต.ค.) · หุ่นคนตัวเดียวกับขั้นมุมมอง (PersonView)
// ต่างกันที่ ฉาก · ไฟ (มาจากไหน แข็ง/นุ่ม) · เงา (คม/ฟุ้ง) · โทนสี (ทับทั้งภาพแบบ multiply)
import { useId, type ReactNode } from 'react';
import { Person } from './PersonView';

const INK = '#77776f', LABEL = '#b8b8ae', WHITE = '#ffffff';
const stroke = { stroke: INK, strokeWidth: 1.2 } as const;
const grade = (color: string, opacity: number) => <rect width="240" height="150" fill={color} opacity={opacity} style={{ mixBlendMode: 'multiply' }} />;

// ไฟสตูดิโอ: แผงซอฟต์บ็อกซ์บนขาตั้ง หันไปทางขวา
const Softbox = ({ x, y }: { x: number; y: number }) => <g transform={`translate(${x} ${y})`}>
  <path d="M13 38 V92 M13 92 L4 100 M13 92 L22 100" {...stroke} fill="none" />
  <path d="M0 4 L8 0 V38 L0 34Z" fill="#e9e8e2" {...stroke} />
  <rect x="8" y="-4" width="20" height="46" rx="2" fill={WHITE} {...stroke} />
  <rect x="12" y="1" width="12" height="36" rx="1" fill="none" stroke={LABEL} strokeWidth="1" />
</g>;
const Sun = ({ x, y, r = 9, color = '#f6cf6a' }: { x: number; y: number; r?: number; color?: string }) => <g>
  <path d={[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
    const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
    return `M${x + c * (r + 4)} ${y + s * (r + 4)} L${x + c * (r + 9)} ${y + s * (r + 9)}`;
  }).join(' ')} stroke={color} strokeWidth="2" strokeLinecap="round" />
  <circle cx={x} cy={y} r={r} fill={color} />
</g>;
const Windows = ({ x, y, cols, rows, fill }: { x: number; y: number; cols: number; rows: number; fill: string }) => <g fill={fill}>
  {Array.from({ length: cols * rows }, (_, i) => <rect key={i} x={x + (i % cols) * 12} y={y + Math.floor(i / cols) * 16} width="7" height="10" rx="1" />)}
</g>;

export function StyleView({ id }: { id: string }) {
  const uid = 'sv' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ref = (name: string) => `url(#${uid}${name})`;
  const figure = (props: Partial<Parameters<typeof Person>[0]> = {}) => <Person x={120} top={30} h={88} {...props} />;
  // เงาฟุ้ง (ไฟนุ่ม) / เงาคม (แดด แฟลช)
  const softShadow = (x = 126, rx = 30) => <ellipse cx={x} cy={119} rx={rx} ry={6} fill="#000" opacity=".16" filter={ref('soft')} />;
  // ขอบเรืองรอบตัว (ย้อนแสง / ไฟขอบ): หุ่นตัวเดียวกันแต่ทาสีเดียวแล้วเบลอ วางไว้ข้างหลัง
  const rim = (filter: string, props: Partial<Parameters<typeof Person>[0]> = {}) => <g filter={ref(filter)}>{figure(props)}</g>;

  let art: ReactNode;
  switch (id) {
    case 'studio': // ฉากกระดาษขาวโค้ง ซอฟต์บ็อกซ์ซ้าย แผ่นสะท้อนขวา เงาจาง
      art = <>
        <rect width="240" height="150" fill="#f8f8f6" />
        <path d="M0 98 Q120 90 240 98 V150 H0Z" fill="#ecece8" />
        <path d="M44 22 L112 48 L112 112 L44 70Z" fill={WHITE} opacity=".55" filter={ref('soft')} />
        <Softbox x={14} y={20} />
        <path d="M204 48 L216 44 L216 112 L204 116Z" fill={WHITE} {...stroke} />
        {softShadow()}{figure()}
      </>;
      break;
    case 'closeup': // ครึ่งตัว ไฟหน้า + แผ่นสะท้อน + ไฟขอบหลัง (ขอบตัวสว่าง)
      art = <>
        <rect width="240" height="150" fill="#ecebe8" />
        <Softbox x={-6} y={30} />
        <circle cx="214" cy="20" r="18" fill={ref('glow')} />
        <path d="M208 14 L220 10 L222 24 L210 28Z" fill="#e9e8e2" {...stroke} /><path d="M216 26 V60" {...stroke} />
        {rim('rimWhite', { top: 8, h: 280 })}{figure({ top: 8, h: 280 })}
        <path d="M200 96 L222 90 L222 150 L200 150Z" fill={WHITE} {...stroke} />
      </>;
      break;
    case 'street': // ท้องฟ้า ตึก แดดจัดมุมขวาบน เงาคมยาวลงซ้าย โทนอุ่น
      art = <>
        <rect width="240" height="110" fill={ref('sky')} />
        <rect x="58" y="62" width="40" height="46" fill="#e9e2d6" /><rect x="146" y="56" width="36" height="52" fill="#e5dccd" />
        <path d="M0 18 H46 V108 H0Z" fill="#e8d5b8" {...stroke} /><Windows x={6} y={28} cols={3} rows={5} fill="#cdb89a" />
        <path d="M188 30 H240 V108 H188Z" fill="#dcc6a6" {...stroke} /><Windows x={196} y={40} cols={4} rows={4} fill="#c2aa86" />
        <rect y="108" width="240" height="42" fill="#d9d1c3" />
        <path d="M0 124 H240 M40 108 L28 150 M110 108 L106 150 M180 108 L190 150" stroke="#cbc2b2" strokeWidth="1" />
        <Sun x={214} y={16} />
        <path d="M113 119 L127 119 L78 148 L58 148Z" fill="#000" opacity=".3" />
        {figure()}
        {grade('#ffd9a0', 0.22)}
      </>;
      break;
    case 'indoor': // ผนังอุ่น พื้นไม้ หน้าต่างซ้ายส่องเป็นลำ โคมไฟอุ่นขวาบน
      art = <>
        <rect width="240" height="150" fill="#efe3d3" />
        <rect y="106" width="240" height="44" fill="#d9c09e" />
        <path d="M0 120 H240 M0 136 H240" stroke="#c9ad86" strokeWidth="1" />
        <rect x="14" y="16" width="48" height="66" rx="2" fill="#fbf9f4" {...stroke} /><path d="M38 16 V82 M14 49 H62" {...stroke} />
        <path d="M62 18 L62 82 L176 150 L220 150 L118 18Z" fill={WHITE} opacity=".42" filter={ref('soft')} />
        <path d="M196 0 V24" {...stroke} />
        <circle cx="196" cy="38" r="30" fill={ref('warm')} />
        <path d="M186 34 L206 34 L200 23 L192 23Z" fill="#e2bf86" {...stroke} />
        <path d="M24 104 h16 l-2 14 h-12Z" fill="#e7d8c2" {...stroke} />
        <path d="M32 104 C26 92 20 88 16 86 M32 104 C33 92 38 84 44 82" stroke="#8fa77a" strokeWidth="2" fill="none" />
        {softShadow(140, 30)}{figure({ x: 132 })}
        {grade('#ffcf91', 0.24)}
      </>;
      break;
    case 'flash': // ฉากมืด แฟลชตรงหน้า: คนสว่างจัด เงาคมสีดำบนผนังด้านหลัง ขอบภาพมืด
      art = <>
        <rect width="240" height="150" fill="#3b3b41" />
        <rect y="110" width="240" height="40" fill="#2e2e33" />
        <ellipse cx="120" cy="70" rx="48" ry="62" fill={ref('glow')} opacity=".35" />
        <g filter={ref('sil')} opacity=".6" transform="translate(11 -3)">{figure()}</g>
        {figure()}
        <rect width="240" height="150" fill={ref('vig')} />
        <circle cx="26" cy="124" r="12" fill={WHITE} {...stroke} />
        <path d="M28 114 L20 126 H26 L23 135 L33 121 H27Z" fill="#f2c94c" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
        <path d="M44 116 L52 112 M45 124 H54 M44 132 L52 136" stroke="#f2c94c" strokeWidth="2" strokeLinecap="round" />
      </>;
      break;
    case 'golden': // แดดเย็นต่ำด้านหลัง ทะเล ทราย ขอบตัวเรืองทอง เงายาวเข้าหากล้อง โทนทอง
      art = <>
        <rect width="240" height="92" fill={ref('dusk')} />
        <rect y="88" width="240" height="22" fill="#e9a283" />
        <path d="M20 96 H70 M110 100 H190 M150 94 H220" stroke="#ffd9a8" strokeWidth="1.5" />
        <rect y="108" width="240" height="42" fill="#edcb98" />
        <circle cx="148" cy="86" r="62" fill={ref('sun')} />
        <circle cx="148" cy="88" r="13" fill="#fff0bf" />
        <path d="M114 119 L126 119 L104 150 L76 150Z" fill="#8a5a3c" opacity=".25" />
        {rim('rimGold')}{rim('rimGold')}{figure()}
        {grade('#ffb46b', 0.3)}
      </>;
      break;
    case 'phone': // ถ่ายมือถือลงไอจี: ภาพอยู่ในจอมือถือ กรอบไอจี ฉากเอียงนิดๆ แบบถ่ายเร็วๆ
      art = <>
        <rect width="240" height="150" fill="#eeece7" />
        <rect x="76" y="3" width="88" height="144" rx="13" fill="#2f2f33" />
        <rect x="80" y="9" width="80" height="132" rx="8" fill="#fbfaf7" />
        <circle cx="89" cy="17" r="4" fill="#e9b0a0" /><rect x="96" y="15" width="30" height="4" rx="2" fill={LABEL} />
        <clipPath id={`${uid}clip`}><rect x="80" y="25" width="80" height="92" /></clipPath>
        <g clipPath={ref('clip')}>
          <g transform="rotate(-4 120 70)">
            <rect x="60" y="10" width="120" height="120" fill="#efe6da" />
            <rect x="60" y="92" width="120" height="40" fill="#dcc9ae" />
            <rect x="132" y="34" width="24" height="34" rx="2" fill="#fbf9f4" stroke={INK} strokeWidth="1" />
            <Person x={112} top={38} h={56} />
          </g>
        </g>
        <path d="M86 126 c-2-3 -6-1 -4 2 l4 4 4-4 c2-3 -2-5 -4-2Z" fill="#ef5b6c" />
        <path d="M98 123 h8 v6 h-5 l-3 2Z" fill="none" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
        <path d="M112 123 l9 3 -9 3 2-3Z" fill="none" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
        <rect x="86" y="134" width="44" height="3" rx="1.5" fill={LABEL} />
      </>;
      break;
    case 'night': // กลางคืน ป้ายนีออน ไฟถนนเป็นโบเก้ พื้นเปียกสะท้อนไฟ คนโทนเย็น ขอบอุ่น
      art = <>
        <rect width="240" height="150" fill={ref('night')} />
        <path d="M0 26 H40 V108 H0Z M196 18 H240 V108 H196Z" fill="#262b45" />
        <rect y="108" width="240" height="42" fill="#20243a" />
        {rim('rimWarm')}{figure()}
        {grade('#8d97c9', 0.5)}
        <g filter={ref('blur')}>
          <rect x="10" y="34" width="26" height="12" rx="3" fill="none" stroke="#ff5fa2" strokeWidth="2.5" />
          <rect x="204" y="30" width="26" height="20" rx="3" fill="none" stroke="#5fd4ff" strokeWidth="2.5" />
          <circle cx="62" cy="58" r="7" fill="#ffcf7a" opacity=".55" /><circle cx="84" cy="40" r="5" fill="#ff8fb8" opacity=".5" />
          <circle cx="168" cy="50" r="8" fill="#ffcf7a" opacity=".5" /><circle cx="186" cy="74" r="5" fill="#7fdcff" opacity=".5" />
          <path d="M23 112 V150 M217 112 V150" stroke="#ff5fa2" strokeWidth="3" opacity=".45" />
          <path d="M210 112 V146" stroke="#5fd4ff" strokeWidth="3" opacity=".45" />
        </g>
        <rect x="10" y="34" width="26" height="12" rx="3" fill="none" stroke="#ffd1e4" strokeWidth="1" />
        <rect x="204" y="30" width="26" height="20" rx="3" fill="none" stroke="#d4f4ff" strokeWidth="1" />
      </>;
      break;
    default: // signature: ผนังครีม พื้นไม้อ่อน ขอบผนังด้านหน้า ซอฟต์บ็อกซ์ใหญ่ เงาบางๆ คนเฉียงนิดๆ
      art = <>
        <rect width="240" height="150" fill="#f4efe6" />
        <rect y="104" width="240" height="46" fill="#e9dcc7" />
        <path d="M0 118 H214 M0 133 H214 M70 104 L62 150 M150 104 L156 150" stroke="#dccbb0" strokeWidth="1" />
        <path d="M46 20 L118 46 L118 112 L46 72Z" fill={WHITE} opacity=".6" filter={ref('soft')} />
        <Softbox x={16} y={18} />
        <rect x="212" width="28" height="150" fill="#ece5d9" /><path d="M212 0 V150" stroke="#ddd3c2" />
        {softShadow(136, 28)}{figure({ x: 128, turn: true })}
      </>;
  }
  return <svg className="scene-preview" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${uid}glow`}><stop offset="0" stopColor={WHITE} stopOpacity=".95" /><stop offset="1" stopColor={WHITE} stopOpacity="0" /></radialGradient>
      <radialGradient id={`${uid}warm`}><stop offset="0" stopColor="#ffd58a" stopOpacity=".85" /><stop offset="1" stopColor="#ffd58a" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${uid}sun`}><stop offset="0" stopColor="#fff2c4" stopOpacity=".95" /><stop offset="1" stopColor="#ffd9a0" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${uid}vig`} r=".75"><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" /></radialGradient>
      <linearGradient id={`${uid}sky`} x2="0" y2="1"><stop offset="0" stopColor="#b9d6ee" /><stop offset="1" stopColor="#edf3f8" /></linearGradient>
      <linearGradient id={`${uid}dusk`} x2="0" y2="1"><stop offset="0" stopColor="#ef9f78" /><stop offset="1" stopColor="#fcd8a2" /></linearGradient>
      <linearGradient id={`${uid}night`} x2="0" y2="1"><stop offset="0" stopColor="#151b33" /><stop offset="1" stopColor="#2b2447" /></linearGradient>
      <filter id={`${uid}soft`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" /></filter>
      <filter id={`${uid}blur`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2" /></filter>
      <filter id={`${uid}sil`}><feFlood floodColor="#000" /><feComposite operator="in" in2="SourceAlpha" /></filter>
      {[['rimGold', '#ffcf6e', 2.4], ['rimWhite', WHITE, 1.6], ['rimWarm', '#ffb86b', 2]].map(([name, color, blur]) => (
        <filter key={name} id={`${uid}${name}`} x="-20%" y="-10%" width="140%" height="120%">
          <feFlood floodColor={color as string} /><feComposite operator="in" in2="SourceAlpha" /><feGaussianBlur stdDeviation={blur} />
        </filter>
      ))}
    </defs>
    {art}
  </svg>;
}
