// poster-draw.ts — วาดโปสเตอร์ลง canvas (browser เท่านั้น): ตัวอย่างบนเวที · ไฟล์ดาวน์โหลด · แผนผังที่ส่งให้ AI · ตรวจพื้นใต้กราฟิก
// ตัวเดียวกันทุกที่ = เห็นอย่างไรได้อย่างนั้น · กราฟิกข้อความวาดด้วยฟอนต์จริง (6 สไตล์ไทยจาก Google Fonts) ไม่ให้ AI วาดตัวอักษร
import {
  aspectRatio,
  fitText,
  layoutFrame,
  paletteOf,
  resolvedEffectId,
  templateOf,
  zoneStats,
  type Align,
  type FieldId,
  type GraphicPlace,
  type PosterDoc,
  type PosterEffectId,
  type PosterPalette,
  type Rect,
  type SectionId,
  type ZoneCheck,
} from './poster';

type Ctx = CanvasRenderingContext2D;
export type Source = CanvasImageSource & { width: number; height: number };
export type PosterFontSpec = {
  display: string;
  body: string;
  displayWeight?: number;
  displayNoItalic?: boolean;
};
export type FontArg = string | PosterFontSpec;
const resolveFont = (arg: FontArg): PosterFontSpec => (typeof arg === 'string' ? { display: arg, body: arg } : arg);
const roleFont = (spec: PosterFontSpec, role: 'display' | 'body', weight: number, italic = false) =>
  role === 'display'
    ? {
        family: spec.display,
        weight: spec.displayWeight ?? weight,
        italic: spec.displayNoItalic ? false : italic,
      }
    : {
        family: spec.body,
        weight: Math.min(weight, 700),
        italic,
      };

type El = { w: number; h: number; draw: (ctx: Ctx, x: number, y: number) => void; id?: SectionId; kids?: Kid[] };
type Kid = { el: El; x: number; y: number };

export function makeCanvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  return cv;
}
// ขนาด canvas ตามสัดส่วนโปสเตอร์ (ด้านยาว = longSide)
export function posterSize(aspect: string, longSide: number) {
  const r = aspectRatio(aspect);
  return r >= 1 ? { w: longSide, h: Math.round(longSide / r) } : { w: Math.round(longSide * r), h: longSide };
}

// ---------- ภาพพื้น: ภาพจาก AI / ก่อนสร้าง = รูปฉากของผู้ใช้ หรือสีของการ์ดฉาก ----------
export type Backdrop = { image: Source } | { gradient: [string, string] };

// วาดรูปให้เต็มกรอบ ตัดส่วนเกิน (เหมือน object-fit: cover)
function drawCover(ctx: Ctx, img: Source, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s,
    sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function drawBackdrop(ctx: Ctx, W: number, H: number, b: Backdrop) {
  if ('image' in b) return drawCover(ctx, b.image, 0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, b.gradient[0]);
  g.addColorStop(1, b.gradient[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------- ตัวช่วยสี & มิติแสงเงา (ใช้ซ้ำได้ทั้งข้อความและรูปทรง · guide = ปิดเงาให้แผนผัง AI) ----------
function mixHex(a: string, b: string, t: number): string {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = n(a);
  const [r2, g2, b2] = n(b);
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(r1 + (r2 - r1) * t)}${ch(g1 + (g2 - g1) * t)}${ch(b1 + (b2 - b1) * t)}`;
}

function withShadow(c: Ctx, guide: boolean, blur: number, dy: number, draw: () => void, color = 'rgba(0,0,0,0.26)') {
  c.save();
  if (!guide) {
    c.shadowColor = color;
    c.shadowBlur = blur;
    c.shadowOffsetY = dy;
  }
  draw();
  c.restore();
}

function drawGlossyFill(
  c: Ctx,
  guide: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
  shapePath: () => void,
  pal: PosterPalette,
) {
  withShadow(
    c,
    guide,
    h * 0.26,
    h * 0.09,
    () => {
      shapePath();
      c.fillStyle = pal.accent;
      c.fill();
    },
    'rgba(0,0,0,0.22)',
  );
  if (guide) return;
  c.save();
  shapePath();
  c.clip();
  const topSheen = c.createLinearGradient(x, y, x, y + h * 0.55);
  topSheen.addColorStop(0, 'rgba(255,255,255,0.26)');
  topSheen.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = topSheen;
  c.fillRect(x, y, w, h * 0.55);
  c.fillStyle = 'rgba(0,0,0,0.14)';
  c.fillRect(x, y + h * 0.84, w, h * 0.16);
  c.restore();
}

// ---------- ข้อความกราฟิก ----------
const hasThai = (s: string) => /[฀-๿]/.test(s);
const setFont = (ctx: Ctx, family: string, size: number, weight: number, italic = false) => {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
};
const setSpacing = (ctx: Ctx, px: number) => {
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${px}px`;
};
type TextOpts = {
  family: string;
  weight: number;
  italic?: boolean;
  size: number;
  minSize?: number;
  maxWidth: number;
  maxHeight: number;
  maxLines: number;
  color: string;
  align: Align;
  outline?: string;
  effect?: PosterEffectId;
  pal?: PosterPalette;
  guide?: boolean;
  spacing?: number; // ช่องไฟ (เท่าของขนาดฟอนต์)
  squeeze?: number; // บีบแนวนอน (0.6 = แคบ 60%) ให้ได้ตัวแคบสูงแบบโปสเตอร์ดนตรี จาก Kanit ตัวเดิม (25 พ.ย.)
  upper?: boolean; // ตัวพิมพ์ใหญ่ (อังกฤษ) · ไทยไม่เปลี่ยน
};

function measureWith(ctx: Ctx, o: Pick<TextOpts, 'family' | 'weight' | 'italic' | 'spacing' | 'squeeze'>) {
  return (s: string, size: number) => {
    setFont(ctx, o.family, size, o.weight, o.italic);
    setSpacing(ctx, (o.spacing ?? 0) * size);
    return ctx.measureText(s).width * (o.squeeze ?? 1);
  };
}

function textEl(ctx: Ctx, raw: string, o: TextOpts): El | null {
  if (!raw.trim()) return null;
  const text = o.upper ? raw.toUpperCase() : raw;
  const squeeze = o.squeeze ?? 1;
  const eff = o.guide ? 'clean' : (o.effect ?? 'clean');
  const styled = eff !== 'clean';
  const lh = hasThai(text) ? 1.32 : 1.15; // สระบน/ล่างของไทยต้องการที่มากกว่า
  const tempFit = fitText(text.trim(), {
    maxWidth: o.maxWidth,
    maxHeight: o.maxHeight,
    maxLines: o.maxLines,
    size: o.size,
    minSize: o.minSize ?? o.size * 0.35,
    lineHeight: lh,
    measure: measureWith(ctx, o),
  });
  const padX = styled ? tempFit.size * 0.16 : 0;
  const padY = styled ? tempFit.size * (eff === 'tilt' ? 0.24 : 0.14) : 0;
  const fit = styled
    ? fitText(text.trim(), {
        maxWidth: Math.max(12, o.maxWidth - padX * 2),
        maxHeight: Math.max(12, o.maxHeight - padY * 2),
        maxLines: o.maxLines,
        size: o.size,
        minSize: o.minSize ?? o.size * 0.35,
        lineHeight: lh,
        measure: measureWith(ctx, o),
      })
    : tempFit;
  const s = fit.size;
  const lineH = s * lh;
  const w = fit.width + padX * 2;
  const h = fit.lines.length * lineH + padY * 2;
  const pal = o.pal;
  const lightFill = o.color.toUpperCase() === '#FFFFFF';
  return {
    w,
    h,
    draw(c, x, y) {
      c.save();
      if (eff === 'tilt') {
        c.translate(x + w / 2, y + h / 2);
        c.rotate(-0.055);
        c.translate(-(x + w / 2), -(y + h / 2));
      }
      setFont(c, o.family, s, o.weight, o.italic);
      setSpacing(c, (o.spacing ?? 0) * s);
      c.textBaseline = 'middle';
      c.textAlign = o.align;
      const ax = o.align === 'left' ? x + padX : o.align === 'right' ? x + w - padX : x + w / 2;

      fit.lines.forEach((line, i) => {
        const baseline = y + padY + (i + 0.5) * lineH;
        c.save();
        c.translate(ax, baseline);
        if (squeeze !== 1) c.scale(squeeze, 1);
        c.lineJoin = 'round';
        c.lineCap = 'round';

        if ((eff === 'sticker' || eff === 'tilt') && pal) {
          c.shadowColor = 'rgba(0,0,0,0.32)';
          c.shadowBlur = s * 0.14;
          c.shadowOffsetY = s * 0.07;
          if (!lightFill) {
            c.strokeStyle = '#FFFFFF';
            c.lineWidth = s * 0.2;
            c.strokeText(line, 0, 0);
          }
          c.strokeStyle = lightFill ? pal.ink : mixHex(pal.ink, o.color, 0.25);
          c.lineWidth = s * (lightFill ? 0.16 : 0.06);
          c.strokeText(line, 0, 0);
          c.shadowColor = 'transparent';
          c.fillStyle = o.color;
          c.fillText(line, 0, 0);
        } else if (eff === 'pop3d' && pal) {
          const depth = Math.max(3, Math.round(s * 0.09));
          c.strokeStyle = pal.ink;
          c.lineWidth = s * 0.12;
          c.fillStyle = pal.ink;
          for (let d = depth; d >= 1; d--) {
            const ox = d * 0.85;
            const oy = d * 1.1;
            if (d === depth) c.strokeText(line, ox, oy);
            c.fillText(line, ox, oy);
          }
          c.strokeStyle = lightFill ? pal.ink : '#FFFFFF';
          c.lineWidth = s * 0.15;
          c.strokeText(line, 0, 0);
          const g = c.createLinearGradient(0, -s * 0.55, 0, s * 0.55);
          if (lightFill) {
            g.addColorStop(0, '#FFFFFF');
            g.addColorStop(1, mixHex('#FFFFFF', pal.accent, 0.22));
          } else {
            g.addColorStop(0, mixHex(o.color, pal.accent, 0.22));
            g.addColorStop(1, o.color);
          }
          c.fillStyle = g;
          c.fillText(line, 0, 0);
        } else if (eff === 'metallic' && pal) {
          c.shadowColor = 'rgba(0,0,0,0.28)';
          c.shadowBlur = s * 0.12;
          c.shadowOffsetY = s * 0.06;
          if (!lightFill) {
            c.strokeStyle = '#FFFFFF';
            c.lineWidth = s * 0.15;
            c.strokeText(line, 0, 0);
          }
          c.strokeStyle = lightFill ? pal.ink : mixHex(pal.ink, pal.accent, 0.2);
          c.lineWidth = s * (lightFill ? 0.11 : 0.05);
          c.strokeText(line, 0, 0);
          c.shadowColor = 'transparent';
          const mg = c.createLinearGradient(0, -s * 0.58, 0, s * 0.58);
          if (lightFill) {
            mg.addColorStop(0, '#FFFFFF');
            mg.addColorStop(0.42, mixHex(pal.accent, '#FFFFFF', 0.55));
            mg.addColorStop(0.58, pal.accent);
            mg.addColorStop(1, mixHex(pal.accent, '#FFFFFF', 0.72));
          } else {
            mg.addColorStop(0, mixHex(pal.ink, pal.accent, 0.45));
            mg.addColorStop(0.45, pal.ink);
            mg.addColorStop(0.75, mixHex(pal.accent, pal.ink, 0.42));
            mg.addColorStop(1, pal.ink);
          }
          c.fillStyle = mg;
          c.fillText(line, 0, 0);
        } else if (eff === 'glow' && pal) {
          c.shadowColor = pal.accent;
          c.shadowBlur = s * 0.34;
          c.strokeStyle = mixHex(pal.accent, '#FFFFFF', 0.45);
          c.lineWidth = s * 0.055;
          c.strokeText(line, 0, 0);
          c.fillStyle = o.color;
          c.fillText(line, 0, 0);
        } else {
          if (o.outline) {
            c.strokeStyle = o.outline;
            c.lineWidth = s * 0.095;
            c.strokeText(line, 0, 0);
          }
          c.fillStyle = o.color;
          c.fillText(line, 0, 0);
        }
        c.restore();
      });
      setSpacing(c, 0);
      c.restore();
    },
  };
}

// kids = ชิ้นข้างใน + ตำแหน่ง (หาตำแหน่งตั้งต้นของแต่ละชิ้นในก้อน: leaves)
function stack(els: (El | null)[], gap: number, align: Align): El | null {
  const list = els.filter((e): e is El => !!e);
  if (!list.length) return null;
  const w = Math.max(...list.map((e) => e.w));
  const h = list.reduce((s, e) => s + e.h, 0) + gap * (list.length - 1);
  const kids: Kid[] = [];
  let top = 0;
  for (const e of list) {
    kids.push({ el: e, x: align === 'left' ? 0 : align === 'right' ? w - e.w : (w - e.w) / 2, y: top });
    top += e.h + gap;
  }
  return { w, h, kids, draw: (c, x, y) => kids.forEach((k) => k.el.draw(c, x + k.x, y + k.y)) };
}

function row(els: (El | null)[], gap: number): El | null {
  const list = els.filter((e): e is El => !!e);
  if (!list.length) return null;
  const w = list.reduce((s, e) => s + e.w, 0) + gap * (list.length - 1);
  const h = Math.max(...list.map((e) => e.h));
  const kids: Kid[] = [];
  let left = 0;
  for (const e of list) {
    kids.push({ el: e, x: left, y: (h - e.h) / 2 });
    left += e.w + gap;
  }
  return { w, h, kids, draw: (c, x, y) => kids.forEach((k) => k.el.draw(c, x + k.x, y + k.y)) };
}

// ชิ้นที่มี id ในก้อน + ตำแหน่ง (px ก่อนขยาย จากมุมบนซ้ายของก้อน)
function leaves(el: El, x = 0, y = 0, out: { id: SectionId; el: El; x: number; y: number }[] = []) {
  if (el.id) out.push({ id: el.id, el, x, y });
  else for (const k of el.kids ?? []) leaves(k.el, x + k.x, y + k.y, out);
  return out;
}

// ป้ายแคปซูล + ขีดประกาย 3 ขีดที่มุมบนทั้งสองข้าง
function pillEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  maxH: number,
  pal: PosterPalette,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 900, true);
  const spark = 0.78; // ที่ของขีดประกาย (เท่าของขนาดฟอนต์)
  const measure = measureWith(ctx, f);
  const start = maxH / (1.32 + spark);
  const fit = fitText(text.trim(), {
    maxWidth: maxW - start * (0.84 + spark * 2),
    maxHeight: start * 1.2,
    maxLines: 1,
    size: start,
    minSize: start * 0.3,
    lineHeight: 1,
    measure,
  });
  const size = fit.size;
  const pillW = fit.width + size * 0.84;
  const pillH = size * 1.32;
  return {
    w: pillW + size * spark * 2,
    h: pillH + size * spark,
    draw(c, x, y) {
      const px = x + size * spark,
        py = y + size * spark;
      // ขีดประกาย: แคปซูลสั้นสีเด่น ขอบหมึก แผ่ออกจากมุมบนของป้าย
      for (const [cx, angles] of [
        [px + size * 0.25, [-160, -125, -92]],
        [px + pillW - size * 0.25, [-20, -55, -88]],
      ] as const)
        for (const deg of angles) {
          const a = (deg * Math.PI) / 180;
          const d0 = size * 0.32,
            len = size * 0.42,
            t = size * 0.17;
          c.save();
          c.translate(cx + Math.cos(a) * (d0 + len / 2), py + Math.sin(a) * (d0 + len / 2));
          c.rotate(a);
          c.beginPath();
          c.roundRect(-len / 2, -t / 2, len, t, t / 2);
          c.fillStyle = pal.accent;
          c.fill();
          c.lineWidth = size * 0.05;
          c.strokeStyle = pal.ink;
          c.stroke();
          c.restore();
        }
      c.beginPath();
      c.roundRect(px, py, pillW, pillH, pillH / 2);
      c.fillStyle = pal.accent;
      c.fill();
      c.lineWidth = size * 0.075;
      c.strokeStyle = pal.ink;
      c.stroke();
      setFont(c, f.family, size, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fit.lines[0], px + pillW / 2, py + pillH / 2 + size * 0.04);
    },
  };
}

// ชื่องานตัวใหญ่ + คำรองเอียงสีเด่นทับมุมล่างขวา (แบบโปสเตอร์ Soul After Six)
function eventTitleEl(
  ctx: Ctx,
  title: string,
  accent: string,
  spec: PosterFontSpec,
  maxW: number,
  maxH: number,
  ink: string,
  pal: PosterPalette,
): El | null {
  if (!title.trim() && !accent.trim()) return null;
  const tf = roleFont(spec, 'display', 900);
  const tMeasure = measureWith(ctx, tf);
  const t = fitText(title.trim() || ' ', {
    maxWidth: maxW * 0.86,
    maxHeight: maxH / 1.1,
    maxLines: 1,
    size: maxH / 1.1,
    minSize: 10,
    lineHeight: 1,
    measure: tMeasure,
  });
  const aSize = t.size * 0.34;
  const af = roleFont(spec, 'body', 800, true);
  const aMeasure = measureWith(ctx, af);
  const a = fitText(accent.trim(), {
    maxWidth: maxW * 0.7,
    maxHeight: aSize * 1.2,
    maxLines: 1,
    size: aSize,
    minSize: aSize * 0.4,
    lineHeight: 1,
    measure: aMeasure,
  });
  const aw = accent.trim() ? a.width : 0;
  const tw = title.trim() ? t.width : 0;
  const w = Math.min(maxW, Math.max(tw, tw * 0.45 + aw));
  const h = t.size * 0.86 + (aw ? a.size * 0.5 : 0);
  return {
    w,
    h,
    draw(c, x, y) {
      const tx = x + (w - tw) / 2;
      if (tw) {
        setFont(c, tf.family, t.size, tf.weight, tf.italic);
        c.fillStyle = ink;
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
        c.fillText(t.lines[0], tx, y + t.size * 0.78);
      }
      if (aw) {
        setFont(c, af.family, a.size, af.weight, af.italic);
        c.fillStyle = pal.accent;
        c.textAlign = 'right';
        c.textBaseline = 'alphabetic';
        c.fillText(a.lines[0], Math.min(x + w, tx + tw + aw * 0.06), y + h - a.size * 0.12);
      }
    },
  };
}

// ป้ายดาว (โปรลดราคา) · ขอบขาวไดคัท + เงานุ่มสไตล์สติ๊กเกอร์
function badgeEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  d: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 900);
  const fit = fitText(text.trim(), {
    maxWidth: d * 0.66,
    maxHeight: d * 0.6,
    maxLines: 2,
    size: d * 0.3,
    minSize: d * 0.1,
    lineHeight: 1.1,
    measure: measureWith(ctx, f),
  });
  return {
    w: d,
    h: d,
    draw(c, x, y) {
      const cx = x + d / 2,
        cy = y + d / 2,
        points = 18;
      c.save();
      c.translate(cx, cy);
      c.rotate(-0.12);
      const starPath = () => {
        c.beginPath();
        for (let i = 0; i < points * 2; i++) {
          const r = (i % 2 ? 0.86 : 1) * (d / 2);
          const ang = (i * Math.PI) / points;
          if (i) c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          else c.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        c.closePath();
      };
      withShadow(c, guide, d * 0.1, d * 0.04, () => {
        starPath();
        if (!guide) {
          c.lineWidth = d * 0.055;
          c.strokeStyle = '#FFFFFF';
          c.stroke();
        }
        c.fillStyle = pal.accent;
        c.fill();
      });
      starPath();
      c.lineWidth = d * 0.02;
      c.strokeStyle = pal.ink;
      c.stroke();
      setFont(c, f.family, fit.size, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const lineH = fit.size * 1.1;
      fit.lines.forEach((line, i) => c.fillText(line, 0, (i - (fit.lines.length - 1) / 2) * lineH));
      c.restore();
    },
  };
}

// ริบบิ้นสั้น (NEW / ขายดี)
function ribbonEl(ctx: Ctx, text: string, spec: PosterFontSpec, size: number, pal: PosterPalette): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 800, true);
  const tw = measureWith(ctx, f)(text.trim(), size);
  const w = tw + size * 1.2,
    h = size * 1.45;
  return {
    w,
    h,
    draw(c, x, y) {
      const k = size * 0.32; // ปลายเฉียง
      c.beginPath();
      c.moveTo(x + k, y);
      c.lineTo(x + w, y);
      c.lineTo(x + w - k, y + h);
      c.lineTo(x, y + h);
      c.closePath();
      c.fillStyle = pal.accent;
      c.fill();
      setFont(c, f.family, size, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text.trim(), x + w / 2, y + h / 2 + size * 0.04);
    },
  };
}

// ราคาในวงกลม
function priceEl(ctx: Ctx, text: string, spec: PosterFontSpec, size: number, pal: PosterPalette): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 900);
  const tw = measureWith(ctx, f)(text.trim(), size);
  const d = Math.max(tw * 1.32, size * 2.1);
  return {
    w: d,
    h: d,
    draw(c, x, y) {
      c.beginPath();
      c.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
      c.fillStyle = pal.ink;
      c.fill();
      setFont(c, f.family, size, f.weight, f.italic);
      c.fillStyle = pal.paper;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text.trim(), x + d / 2, y + d / 2 + size * 0.04);
    },
  };
}

function ruleEl(width: number, gap: number, line: number, color: string): El {
  return {
    w: width,
    h: gap,
    draw(c, x, y) {
      c.fillStyle = color;
      c.fillRect(x, y + gap / 2 - line / 2, width, line);
    },
  };
}

// ---------- ของตกแต่งโปสเตอร์ดนตรี (ผู้ใช้ 25 พ.ย.: ตัวอย่าง Atlanta Jazz Festival) ----------
// ลูกศรเฉียงซ้อนสามชั้น (>>> หรือ <<<) ข้างวันที่/ป้ายสถานที่ ชี้เข้าหาข้อความ
function chevronsEl(h: number, color: string, dir: 'left' | 'right'): El {
  const a = h * 0.42,
    t = h * 0.2,
    step = t * 1.9,
    n = 3;
  const w = step * (n - 1) + t + a;
  const pts: [number, number][] = [
    [0, 0],
    [t, 0],
    [t + a, h / 2],
    [t, h],
    [0, h],
    [a, h / 2],
  ];
  return {
    w,
    h,
    draw(c, x, y) {
      c.save();
      c.fillStyle = color;
      for (let i = 0; i < n; i++) {
        c.globalAlpha = 0.45 + 0.55 * ((i + 1) / n); // ชั้นนอกจางกว่า
        c.beginPath();
        pts.forEach(([px, py], k) => {
          const X = dir === 'right' ? x + i * step + px : x + w - i * step - px;
          if (k) c.lineTo(X, y + py);
          else c.moveTo(X, y + py);
        });
        c.closePath();
        c.fill();
      }
      c.restore();
    },
  };
}

// ดาวประกายสี่แฉก
// ข้อความโค้ง (ผู้ใช้ 26 พ.ย.: แบบ Curve ของ Canva ในงานสเต็ก): วาดทีละกลุ่มอักษรไปตามส่วนโค้ง บรรทัดเดียว
// ไทย: พยัญชนะ + สระบน/ล่าง + วรรณยุกต์เป็นกลุ่มเดียว (Intl.Segmenter grapheme) ไม่แยกกัน · ตำแหน่งจากความกว้างสะสม (ระยะชิดเท่าเดิม)
// bend = มุมรวมของส่วนโค้ง (องศา) บวก = โค้งขึ้น ∩ ลบ = โค้งลง ∪ · วาดขอบทุกตัวก่อนแล้วจึงเติมสี (ขอบตัวข้างๆ ไม่ทับตัวอักษร)
// ข้อความหนึ่งบรรทัดวัดตามหมึกจริง (actualBoundingBox) ไม่ใช่ความสูงบรรทัด: วางตัวโตชิดกันแน่น/ชิดขอบได้พอดี (ผู้ใช้ 27 พ.ย. แบบ artist)
// w/asc/desc = กรอบหมึก (หลังบีบ) · draw(c, x, base) = หมึกเริ่มที่ x เส้นฐานที่ base
type Ink = { w: number; asc: number; desc: number; draw: (c: Ctx, x: number, base: number, color: string) => void };
function inkText(
  ctx: Ctx,
  str: string,
  o: { family: string; weight: number; size: number; spacing?: number; squeeze?: number },
): Ink {
  const sq = o.squeeze ?? 1;
  const set = (c: Ctx) => {
    setFont(c, o.family, o.size, o.weight);
    setSpacing(c, (o.spacing ?? 0) * o.size);
  };
  set(ctx);
  const m = ctx.measureText(str);
  const L = m.actualBoundingBoxLeft,
    R = m.actualBoundingBoxRight;
  return {
    w: (L + R) * sq,
    asc: m.actualBoundingBoxAscent,
    desc: m.actualBoundingBoxDescent,
    draw(c, x, base, color) {
      c.save();
      set(c);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillStyle = color;
      c.translate(x, base);
      if (sq !== 1) c.scale(sq, 1);
      c.fillText(str, L, 0);
      c.restore();
    },
  };
}

const graphemes =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
function curvedTextEl(
  ctx: Ctx,
  raw: string,
  o: {
    family: string;
    weight: number;
    size: number;
    minSize: number;
    maxWidth: number;
    color: string;
    outline?: string;
    bend: number;
  },
): El | null {
  const text = raw.trim();
  if (!text) return null;
  const measure = (str: string, sz: number) => {
    setFont(ctx, o.family, sz, o.weight);
    setSpacing(ctx, 0);
    return ctx.measureText(str).width;
  };
  const theta = (Math.abs(o.bend) * Math.PI) / 180;
  const chord = (arc: number) => (theta ? 2 * (arc / theta) * Math.sin(theta / 2) : arc);
  let size = o.size;
  while (size > o.minSize && chord(measure(text, size)) > o.maxWidth) size *= 0.95;
  const arc = measure(text, size);
  const clusters = graphemes ? [...graphemes.segment(text)].map((g) => g.segment) : [...text];
  const centres: number[] = [];
  let prefix = '';
  for (const cl of clusters) {
    const a = measure(prefix, size);
    prefix += cl;
    centres.push((a + measure(prefix, size)) / 2);
  }
  const lh = (hasThai(text) ? 1.32 : 1.15) * size;
  const R = theta ? arc / theta : 0;
  const sag = theta ? R * (1 - Math.cos(theta / 2)) : 0;
  const w = chord(arc) + size * 0.2;
  const h = lh + sag;
  const up = o.bend >= 0;
  return {
    w,
    h,
    draw(c, x, y) {
      c.save();
      setFont(c, o.family, size, o.weight);
      setSpacing(c, 0);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      const cx = x + w / 2;
      const at = (i: number) => {
        const a = theta ? (centres[i] - arc / 2) / R : 0;
        const drop = theta ? R * (1 - Math.cos(a)) : 0;
        return {
          px: cx + (theta ? R * Math.sin(a) : centres[i] - arc / 2),
          py: up ? y + lh / 2 + drop : y + lh / 2 + sag - drop,
          rot: up ? a : -a,
        };
      };
      for (const pass of o.outline ? (['stroke', 'fill'] as const) : (['fill'] as const)) {
        clusters.forEach((cl, i) => {
          const { px, py, rot } = at(i);
          c.save();
          c.translate(px, py);
          c.rotate(rot);
          if (pass === 'stroke') {
            c.strokeStyle = o.outline!;
            c.lineWidth = size * 0.12;
            c.strokeText(cl, 0, 0);
          } else {
            c.fillStyle = o.color;
            c.fillText(cl, 0, 0);
          }
          c.restore();
        });
      }
      c.restore();
    },
  };
}

function sparkleEl(d: number, color: string): El {
  return {
    w: d,
    h: d,
    draw(c, x, y) {
      const cx = x + d / 2,
        cy = y + d / 2,
        r = d / 2,
        k = r * 0.16;
      c.save();
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(cx, cy - r);
      c.quadraticCurveTo(cx + k, cy - k, cx + r, cy);
      c.quadraticCurveTo(cx + k, cy + k, cx, cy + r);
      c.quadraticCurveTo(cx - k, cy + k, cx - r, cy);
      c.quadraticCurveTo(cx - k, cy - k, cx, cy - r);
      c.fill();
      c.restore();
    },
  };
}

// แผ่นป้ายพื้นทึบรอบข้อความ · minW = กว้างอย่างน้อย (แถบเต็มกว้าง) · line = เส้นกรอบด้านใน (แบบงานพิมพ์)
// fill = null: ไม่วาดแผ่น (แผนผังที่ส่งให้ AI) ขนาดเท่าเดิม
function plateEl(
  inner: El | null,
  fill: string | null,
  line: string | null,
  padX: number,
  padY: number,
  minW = 0,
): El | null {
  if (!inner) return null;
  const w = Math.max(minW, inner.w + padX * 2),
    h = inner.h + padY * 2;
  return {
    w,
    h,
    draw(c, x, y) {
      c.save();
      if (fill) {
        c.fillStyle = fill;
        c.fillRect(x, y, w, h);
      }
      if (fill && line) {
        const lw = Math.max(1, h * 0.022);
        c.strokeStyle = line;
        c.lineWidth = lw;
        c.strokeRect(x + lw * 2, y + lw * 2, w - lw * 4, h - lw * 4);
      }
      c.restore();
      inner.draw(c, x + (w - inner.w) / 2, y + padY);
    },
  };
}

// เส้นจุดในกรอบหัวแหลม (คั่นแนวเพลงกับชื่องาน)
function dottedRuleEl(width: number, h: number, color: string): El {
  return {
    w: width,
    h,
    draw(c, x, y) {
      const cy = y + h / 2,
        hh = h * 0.34,
        r = Math.max(0.8, h * 0.075);
      c.save();
      c.strokeStyle = color;
      c.fillStyle = color;
      c.lineWidth = Math.max(1, h * 0.06);
      c.beginPath();
      c.moveTo(x, cy);
      c.lineTo(x + hh * 1.6, cy - hh);
      c.lineTo(x + width - hh * 1.6, cy - hh);
      c.lineTo(x + width, cy);
      c.lineTo(x + width - hh * 1.6, cy + hh);
      c.lineTo(x + hh * 1.6, cy + hh);
      c.closePath();
      c.stroke();
      for (let px = x + hh * 2.4; px <= x + width - hh * 2.4; px += r * 3.4) {
        c.beginPath();
        c.arc(px, cy, r, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    },
  };
}

// ป้ายแท็กสี่เหลี่ยมมนมีมิติเงา+ไฮไลต์ (ซื้อ 1 แถม 1 / ลด 30% / ราคาพิเศษ)
function tagPillEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  pal: PosterPalette,
  italic = true,
  role: 'display' | 'body' = 'display',
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, role, 900, italic);
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(10, maxW - size * 0.9),
    maxHeight: size * 1.4,
    maxLines: 1,
    size,
    minSize: size * 0.35,
    lineHeight: 1,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const w = fit.width + s * 0.95;
  const h = s * 1.48;
  return {
    w,
    h,
    draw(c, x, y) {
      const pillPath = () => {
        c.beginPath();
        c.roundRect(x, y, w, h, h / 2);
      };
      drawGlossyFill(c, guide, x, y, w, h, pillPath, pal);
      pillPath();
      c.lineWidth = Math.max(1, s * 0.06);
      c.strokeStyle = pal.ink;
      c.stroke();
      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fit.lines[0], x + w / 2, y + h / 2 + s * 0.03);
    },
  };
}

// ราคาเดิมขีดฆ่า + ราคาพิเศษเด่น (template: bundle, steakhouse)
function slashPriceEl(
  ctx: Ctx,
  oldPrice: string,
  price: string,
  spec: PosterFontSpec,
  maxW: number,
  maxH: number,
  ink: string,
  pal: PosterPalette,
): El | null {
  const op = oldPrice.trim();
  const np = price.trim();
  if (!op && !np) return null;
  const baseSize = Math.min(maxH * 0.54, maxW * 0.2);
  const pill = np ? tagPillEl(ctx, np, spec, op ? maxW * 0.65 : maxW, baseSize, pal, false) : null;
  let oldEl: El | null = null;
  if (op) {
    const oldSize = baseSize * 0.56;
    const bf = roleFont(spec, 'body', 600);
    const ow = measureWith(ctx, bf)(op, oldSize);
    const oh = oldSize * 1.2;
    oldEl = {
      w: ow + oldSize * 0.24,
      h: oh,
      draw(c, x, y) {
        c.save();
        setFont(c, bf.family, oldSize, bf.weight, bf.italic);
        c.globalAlpha = 0.72;
        c.fillStyle = ink;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(op, x + (ow + oldSize * 0.24) / 2, y + oh / 2);
        c.globalAlpha = 1;
        c.beginPath();
        c.moveTo(x, y + oh * 0.72);
        c.lineTo(x + ow + oldSize * 0.24, y + oh * 0.28);
        c.lineWidth = Math.max(1.5, oldSize * 0.11);
        c.strokeStyle = pal.accent;
        c.stroke();
        c.restore();
      },
    };
  }
  return row([oldEl, pill], baseSize * 0.34);
}

// แถวจุดเด่น + ไอคอนติ๊กถูกในวงกลม (template: callout)
function bulletEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  ink: string,
  pal: PosterPalette,
): El | null {
  if (!text.trim()) return null;
  const bf = roleFont(spec, 'body', 600);
  const d = size * 1.25;
  const gap = size * 0.45;
  const txt = textEl(ctx, text, {
    family: bf.family,
    weight: bf.weight,
    size,
    maxWidth: Math.max(20, maxW - d - gap),
    maxHeight: size * 2.9,
    maxLines: 2,
    color: ink,
    align: 'left',
  });
  if (!txt) return null;
  const check: El = {
    w: d,
    h: d,
    draw(c, x, y) {
      const r = d / 2;
      c.beginPath();
      c.arc(x + r, y + r, r, 0, Math.PI * 2);
      c.fillStyle = pal.accent;
      c.fill();
      c.beginPath();
      c.moveTo(x + d * 0.28, y + d * 0.52);
      c.lineTo(x + d * 0.44, y + d * 0.68);
      c.lineTo(x + d * 0.74, y + d * 0.34);
      c.lineWidth = Math.max(1.5, d * 0.14);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = pal.accentInk;
      c.stroke();
    },
  };
  return row([check, txt], gap);
}

// แถบโปรด้านล่างเต็มกรอบ (template: marketplace, beforeafter, doublecover)
function bannerStripEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  maxH: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 800);
  const start = maxH * 0.52;
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(20, maxW - start * 1.4),
    maxHeight: start * 1.2,
    maxLines: 1,
    size: start,
    minSize: start * 0.32,
    lineHeight: 1,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const h = Math.max(s * 1.85, maxH * 0.72);
  return {
    w: maxW,
    h,
    draw(c, x, y) {
      drawGlossyFill(
        c,
        guide,
        x,
        y,
        maxW,
        h,
        () => {
          c.beginPath();
          c.roundRect(x, y, maxW, h, h * 0.28);
        },
        pal,
      );
      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fit.lines[0], x + maxW / 2, y + h / 2 + s * 0.02);
    },
  };
}

// ป้ายวงกลม 2 ชั้น "เริ่มต้น ฿35.-" (template: priceburst)
function priceStampEl(
  ctx: Ctx,
  topLabel: string,
  price: string,
  spec: PosterFontSpec,
  d: number,
  pal: PosterPalette,
): El | null {
  const np = price.trim();
  const tp = topLabel.trim();
  if (!np && !tp) return null;
  const pf = roleFont(spec, 'display', 900);
  const bf = roleFont(spec, 'body', 700);
  const pFit = fitText(np || tp, {
    maxWidth: d * 0.72,
    maxHeight: d * 0.42,
    maxLines: 1,
    size: d * 0.34,
    minSize: d * 0.12,
    lineHeight: 1,
    measure: measureWith(ctx, pf),
  });
  const tSize = Math.min(d * 0.14, pFit.size * 0.48);
  const tFit =
    tp && np
      ? fitText(tp, {
          maxWidth: d * 0.6,
          maxHeight: tSize * 1.2,
          maxLines: 1,
          size: tSize,
          minSize: d * 0.08,
          lineHeight: 1,
          measure: measureWith(ctx, bf),
        })
      : null;
  return {
    w: d,
    h: d,
    draw(c, x, y) {
      const cx = x + d / 2;
      const cy = y + d / 2;
      c.beginPath();
      c.arc(cx, cy, d / 2, 0, Math.PI * 2);
      c.fillStyle = pal.accent;
      c.fill();
      c.lineWidth = Math.max(1.5, d * 0.025);
      c.strokeStyle = pal.ink;
      c.stroke();
      c.save();
      c.beginPath();
      c.arc(cx, cy, d * 0.43, 0, Math.PI * 2);
      c.setLineDash([d * 0.03, d * 0.03]);
      c.lineWidth = Math.max(1, d * 0.015);
      c.strokeStyle = pal.accentInk;
      c.stroke();
      c.restore();
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (tFit) {
        setFont(c, bf.family, tFit.size, bf.weight, bf.italic);
        c.fillText(tFit.lines[0], cx, cy - pFit.size * 0.56);
      }
      setFont(c, pf.family, pFit.size, pf.weight, pf.italic);
      c.fillText(pFit.lines[0], cx, cy + (tFit ? tFit.size * 0.55 : 0));
    },
  };
}

// แถวเมนู + เส้นจุดไข่ปลา + ป้ายราคาขวา (template: menulist)
function menuRowEl(
  ctx: Ctx,
  item: string,
  price: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  ink: string,
  pal: PosterPalette,
): El | null {
  const it = item.trim();
  const pr = price.trim();
  if (!it && !pr) return null;
  const pf = roleFont(spec, 'display', 800);
  const bf = roleFont(spec, 'body', 600);
  const pFit = pr
    ? fitText(pr, {
        maxWidth: maxW * 0.34,
        maxHeight: size * 1.4,
        maxLines: 1,
        size: size * 0.96,
        minSize: size * 0.5,
        lineHeight: 1,
        measure: measureWith(ctx, pf),
      })
    : null;
  const pPadX = pFit ? pFit.size * 0.62 : 0;
  const pillW = pFit ? pFit.width + pPadX : 0;
  const pillH = pFit ? pFit.size * 1.55 : 0;
  const nameFit = it
    ? fitText(it, {
        maxWidth: Math.max(20, maxW - pillW - size * 0.8),
        maxHeight: size * 1.5,
        maxLines: 1,
        size,
        minSize: size * 0.45,
        lineHeight: 1.2,
        measure: measureWith(ctx, bf),
      })
    : null;
  const h = Math.max(pillH, (nameFit?.size ?? size) * 1.45);
  return {
    w: maxW,
    h,
    draw(c, x, y) {
      const midY = y + h / 2;
      if (nameFit) {
        setFont(c, bf.family, nameFit.size, bf.weight, bf.italic);
        c.fillStyle = ink;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(nameFit.lines[0], x, midY);
      }
      const lineX0 = x + (nameFit ? nameFit.width + size * 0.4 : 0);
      const lineX1 = x + maxW - (pillW ? pillW + size * 0.4 : 0);
      if (lineX1 - lineX0 > size * 0.5 && nameFit && pFit) {
        c.save();
        c.beginPath();
        c.setLineDash([size * 0.1, size * 0.22]);
        c.lineCap = 'round';
        c.lineWidth = Math.max(1, size * 0.08);
        c.strokeStyle = ink;
        c.globalAlpha = 0.35;
        c.moveTo(lineX0, midY + size * 0.12);
        c.lineTo(lineX1, midY + size * 0.12);
        c.stroke();
        c.restore();
      }
      if (pFit) {
        const px = x + maxW - pillW;
        const py = midY - pillH / 2;
        c.beginPath();
        c.roundRect(px, py, pillW, pillH, pillH / 2);
        c.fillStyle = pal.accent;
        c.fill();
        setFont(c, pf.family, pFit.size, pf.weight, pf.italic);
        c.fillStyle = pal.accentInk;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(pFit.lines[0], px + pillW / 2, midY + pFit.size * 0.03);
      }
    },
  };
}

// ป้ายชื่อและราคาของแต่ละตัวเลือก ย้ายทั้งป้ายได้
function optionPriceEl(
  ctx: Ctx,
  name: string,
  amount: string,
  spec: PosterFontSpec,
  width: number,
  unit: number,
  pal: PosterPalette,
): El | null {
  const pad = Math.min(unit * 0.023, width * 0.1);
  const bf = roleFont(spec, 'body', 600);
  const pf = roleFont(spec, 'display', 900);
  const maxWidth = Math.max(1, width - pad * 2);
  const nameText = textEl(ctx, name, {
    family: bf.family,
    weight: bf.weight,
    color: pal.ink,
    align: 'center',
    maxWidth,
    size: unit * 0.043,
    maxHeight: unit * 0.085,
    maxLines: 2,
  });
  const priceText = textEl(ctx, amount, {
    family: pf.family,
    weight: pf.weight,
    color: pal.ink,
    align: 'center',
    maxWidth,
    size: unit * 0.08,
    maxHeight: unit * 0.1,
    maxLines: 1,
  });
  const content = stack([nameText, priceText], unit * 0.004, 'center');
  if (!content) return null;
  const height = Math.max(unit * 0.185, content.h + pad * 2);
  return {
    w: width,
    h: height,
    draw(c, x, y) {
      c.save();
      c.beginPath();
      c.roundRect(x, y, width, height, pad * 0.65);
      c.fillStyle = pal.paper;
      c.fill();
      c.lineWidth = Math.min(unit * 0.0025, pad * 0.2);
      c.strokeStyle = pal.ink;
      c.globalAlpha = 0.35;
      c.stroke();
      c.globalAlpha = 1;
      c.clip();
      c.fillStyle = pal.accent;
      c.fillRect(x, y, width, pad * 0.3);
      content.draw(c, x + (width - content.w) / 2, y + (height - content.h) / 2);
      c.restore();
    },
  };
}

// แถวชิปแอปเดลิเวอรีคั่นด้วย "·" (template: delivery)
function chipsRowEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  align: Align,
  pal: PosterPalette,
): El | null {
  const parts = text
    .split(/[·,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const padX = size * 0.85;
  const chipH = size * 1.75;
  const gap = size * 0.36;
  const bf = roleFont(spec, 'body', 700);
  const m = measureWith(ctx, bf);
  const chips = parts.map((label) => {
    const tw = Math.min(maxW * 0.9, m(label, size));
    return { label, w: Math.min(maxW, tw + padX) };
  });
  const rows: { items: typeof chips; w: number }[] = [];
  let cur: typeof chips = [];
  let curW = 0;
  for (const ch of chips) {
    const add = (cur.length ? gap : 0) + ch.w;
    if (cur.length && curW + add > maxW) {
      rows.push({ items: cur, w: curW });
      cur = [ch];
      curW = ch.w;
    } else {
      cur.push(ch);
      curW += add;
    }
  }
  if (cur.length) rows.push({ items: cur, w: curW });
  const h = rows.length * chipH + (rows.length - 1) * gap;
  return {
    w: Math.min(maxW, Math.max(...rows.map((r) => r.w))),
    h,
    draw(c, x, y) {
      const boxW = Math.min(maxW, Math.max(...rows.map((r) => r.w)));
      let ry = y;
      for (const r of rows) {
        let rx = align === 'left' ? x : align === 'right' ? x + boxW - r.w : x + (boxW - r.w) / 2;
        for (const ch of r.items) {
          c.beginPath();
          c.roundRect(rx, ry, ch.w, chipH, chipH / 2);
          c.fillStyle = pal.paper;
          c.fill();
          c.lineWidth = Math.max(1, size * 0.08);
          c.strokeStyle = pal.accent;
          c.stroke();
          setFont(c, bf.family, size, bf.weight, bf.italic);
          c.fillStyle = pal.ink;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(ch.label, rx + ch.w / 2, ry + chipH / 2 + size * 0.03, ch.w - padX * 0.5);
          rx += ch.w + gap;
        }
        ry += chipH + gap;
      }
    },
  };
}

// ตัวเลขแคมเปญยักษ์มีเงากราฟิก 3D (templates: flash, buffet, payday, countdown, spec, gift)
function flashHeroEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  maxH: number,
  pal: PosterPalette,
  effect: PosterEffectId = 'pop3d',
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 900, true);
  const fit = fitText(text.trim(), {
    maxWidth: maxW * 0.88,
    maxHeight: maxH * 0.88,
    maxLines: 1,
    size: maxH * 0.82,
    minSize: 14,
    lineHeight: 1,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const eff = guide ? 'clean' : effect === 'clean' ? 'pop3d' : effect;
  const w = fit.width + s * 0.34;
  const h = s * 1.18;
  return {
    w,
    h,
    draw(c, x, y) {
      const cx = x + w / 2;
      const cy = y + h / 2 + s * 0.03;
      c.save();
      setFont(c, f.family, s, f.weight, f.italic);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineCap = 'round';

      if (eff === 'pop3d' || eff === 'tilt') {
        const steps = Math.max(4, Math.round(s * 0.095));
        c.strokeStyle = pal.ink;
        c.fillStyle = pal.ink;
        c.lineWidth = Math.max(2, s * 0.09);
        for (let k = steps; k >= 1; k--) {
          const ox = k * 0.85;
          const oy = k * 1.15;
          if (k === steps) c.strokeText(fit.lines[0], cx + ox, cy + oy);
          c.fillText(fit.lines[0], cx + ox, cy + oy);
        }
        c.strokeStyle = '#FFFFFF';
        c.lineWidth = Math.max(2, s * 0.11);
        c.strokeText(fit.lines[0], cx, cy);
        c.strokeStyle = pal.ink;
        c.lineWidth = Math.max(1.5, s * 0.05);
        c.strokeText(fit.lines[0], cx, cy);
        const fg = c.createLinearGradient(cx, cy - s * 0.5, cx, cy + s * 0.5);
        fg.addColorStop(0, mixHex(pal.accent, '#FFFFFF', 0.36));
        fg.addColorStop(0.55, pal.accent);
        fg.addColorStop(1, mixHex(pal.accent, pal.ink, 0.12));
        c.fillStyle = fg;
        c.fillText(fit.lines[0], cx, cy);
      } else if (eff === 'metallic') {
        c.shadowColor = 'rgba(0,0,0,0.3)';
        c.shadowBlur = s * 0.12;
        c.shadowOffsetY = s * 0.06;
        c.strokeStyle = pal.ink;
        c.lineWidth = Math.max(2, s * 0.1);
        c.strokeText(fit.lines[0], cx, cy);
        c.shadowColor = 'transparent';
        const mg = c.createLinearGradient(cx, cy - s * 0.55, cx, cy + s * 0.55);
        mg.addColorStop(0, '#FFFFFF');
        mg.addColorStop(0.45, mixHex(pal.accent, '#FFFFFF', 0.5));
        mg.addColorStop(0.58, pal.accent);
        mg.addColorStop(1, mixHex(pal.accent, '#FFFFFF', 0.65));
        c.fillStyle = mg;
        c.fillText(fit.lines[0], cx, cy);
      } else if (eff === 'glow') {
        c.shadowColor = pal.accent;
        c.shadowBlur = s * 0.34;
        c.strokeStyle = pal.ink;
        c.lineWidth = Math.max(2, s * 0.07);
        c.strokeText(fit.lines[0], cx, cy);
        c.fillStyle = mixHex(pal.accent, '#FFFFFF', 0.35);
        c.fillText(fit.lines[0], cx, cy);
      } else {
        const off = s * 0.07;
        c.fillStyle = pal.ink;
        c.fillText(fit.lines[0], cx + off, cy + off);
        c.lineWidth = Math.max(2, s * 0.065);
        c.strokeStyle = pal.ink;
        c.strokeText(fit.lines[0], cx, cy);
        c.fillStyle = pal.accent;
        c.fillText(fit.lines[0], cx, cy);
      }
      c.restore();
    },
  };
}

// การ์ดคูปองมีรอยปรุฉีกตรงกลาง (template: coupon)
function couponCardEl(
  ctx: Ctx,
  amount: string,
  code: string,
  spec: PosterFontSpec,
  maxW: number,
  maxH: number,
  pal: PosterPalette,
): El | null {
  const am = amount.trim();
  const cd = code.trim();
  if (!am && !cd) return null;
  const h = Math.min(maxH, maxW * 0.34);
  const w = Math.min(maxW, h * 3.5);
  const split = cd ? w * 0.54 : w;
  const notch = h * 0.14;
  const af = roleFont(spec, 'display', 900);
  const cf = roleFont(spec, 'body', 700);
  const aFit = fitText(am || cd, {
    maxWidth: split * 0.82,
    maxHeight: h * 0.66,
    maxLines: 1,
    size: h * 0.44,
    minSize: 10,
    lineHeight: 1,
    measure: measureWith(ctx, af),
  });
  const cFit = cd
    ? fitText(cd, {
        maxWidth: (w - split) * 0.82,
        maxHeight: h * 0.46,
        maxLines: 1,
        size: h * 0.3,
        minSize: 9,
        lineHeight: 1,
        measure: measureWith(ctx, cf),
      })
    : null;
  return {
    w,
    h,
    draw(c, x, y) {
      const r = h * 0.16;
      const ticketPath = () => {
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + split - notch, y);
        c.arc(x + split, y, notch, Math.PI, 0, true);
        c.lineTo(x + w - r, y);
        c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r);
        c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + split + notch, y + h);
        c.arc(x + split, y + h, notch, 0, Math.PI, true);
        c.lineTo(x + r, y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
      };
      c.save();
      ticketPath();
      c.fillStyle = pal.paper;
      c.fill();
      c.clip();
      c.fillStyle = pal.accent;
      c.fillRect(x, y, split, h);
      if (cd) {
        c.beginPath();
        c.setLineDash([h * 0.08, h * 0.08]);
        c.lineWidth = Math.max(1.5, h * 0.03);
        c.strokeStyle = pal.ink;
        c.moveTo(x + split, y + notch * 1.15);
        c.lineTo(x + split, y + h - notch * 1.15);
        c.stroke();
        c.setLineDash([]);
      }
      c.restore();
      ticketPath();
      c.lineWidth = Math.max(1.5, h * 0.035);
      c.strokeStyle = pal.ink;
      c.stroke();

      c.textAlign = 'center';
      c.textBaseline = 'middle';
      setFont(c, af.family, aFit.size, af.weight, af.italic);
      c.fillStyle = pal.accentInk;
      c.fillText(aFit.lines[0], x + split / 2, y + h / 2 + aFit.size * 0.03);

      if (cFit) {
        const cx = x + split + (w - split) / 2;
        const lbl = h * 0.14;
        setFont(c, cf.family, lbl, cf.weight, cf.italic);
        c.fillStyle = pal.accent;
        c.fillText('CODE', cx, y + h * 0.31);
        setFont(c, cf.family, cFit.size, cf.weight, cf.italic);
        c.fillStyle = pal.ink;
        c.fillText(cFit.lines[0], cx, y + h * 0.64);
      }
    },
  };
}

// พื้นรองข้อความทีละบรรทัดสไตล์ TikTok / UGC (template: review)
function highlightTextEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  maxH: number,
  size: number,
  align: Align,
  pal: PosterPalette,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 800);
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(20, maxW - size * 1.1),
    maxHeight: maxH,
    maxLines: 2,
    size,
    minSize: size * 0.4,
    lineHeight: 1.45,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const padX = s * 0.72;
  const barH = s * 1.42;
  const gap = s * 0.22;
  const measure = measureWith(ctx, f);
  const bars = fit.lines.map((line) => ({ line, w: Math.min(maxW, measure(line, s) + padX) }));
  const w = Math.max(...bars.map((b) => b.w));
  const h = bars.length * barH + (bars.length - 1) * gap;
  return {
    w,
    h,
    draw(c, x, y) {
      let by = y;
      for (const b of bars) {
        const bx = align === 'left' ? x : align === 'right' ? x + w - b.w : x + (w - b.w) / 2;
        c.beginPath();
        c.roundRect(bx, by, b.w, barH, barH * 0.28);
        c.fillStyle = pal.paper;
        c.fill();
        setFont(c, f.family, s, f.weight, f.italic);
        c.fillStyle = pal.ink;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(b.line, bx + b.w / 2, by + barH / 2 + s * 0.03);
        by += barH + gap;
      }
    },
  };
}

// ป้ายขอบสีเด่น (วันที่แคมเปญ / เรตติ้ง / แถบติดต่อ)
function outlinePillEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  pal: PosterPalette,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'body', 700);
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(20, maxW - size * 1.1),
    maxHeight: size * 1.5,
    maxLines: 1,
    size,
    minSize: size * 0.45,
    lineHeight: 1,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const w = fit.width + s * 1.15;
  const h = s * 1.72;
  return {
    w,
    h,
    draw(c, x, y) {
      c.beginPath();
      c.roundRect(x, y, w, h, h / 2);
      c.fillStyle = pal.paper;
      c.fill();
      c.lineWidth = Math.max(1.2, s * 0.08);
      c.strokeStyle = pal.accent;
      c.stroke();
      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fit.lines[0], x + w / 2, y + h / 2 + s * 0.03);
    },
  };
}

// ตราประทับแนวตั้งสไตล์ญี่ปุ่น (template: izakaya) · หมุนทั้งคำ + ขอบขาวสติ๊กเกอร์ + เงาลอย
function verticalSealEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxH: number,
  size: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 800);
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(30, maxH - size * 1.1),
    maxHeight: size * 1.4,
    maxLines: 1,
    size,
    minSize: size * 0.45,
    lineHeight: 1,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const bw = s * 2.05;
  const bh = Math.min(maxH, fit.width + s * 1.25);
  const pad = s * 0.22;
  const w = bw + pad * 2;
  const h = bh + pad * 2;
  return {
    w,
    h,
    draw(c, x, y) {
      c.save();
      c.translate(x + w / 2, y + h / 2);
      c.rotate(-0.04);
      const bx = -bw / 2;
      const by = -bh / 2;
      const r = s * 0.24;
      const outerPath = () => {
        c.beginPath();
        c.roundRect(bx, by, bw, bh, r);
      };
      withShadow(c, guide, s * 0.28, s * 0.12, () => {
        outerPath();
        if (!guide) {
          c.lineWidth = s * 0.16;
          c.strokeStyle = '#FFFFFF';
          c.stroke();
        }
        c.fillStyle = pal.accent;
        c.fill();
      });
      c.beginPath();
      c.roundRect(bx + s * 0.16, by + s * 0.16, bw - s * 0.32, bh - s * 0.32, r * 0.55);
      c.lineWidth = Math.max(1.2, s * 0.075);
      c.strokeStyle = pal.accentInk;
      c.stroke();
      for (const barY of [by + s * 0.32, by + bh - s * 0.32]) {
        c.beginPath();
        c.moveTo(bx + s * 0.34, barY);
        c.lineTo(bx + bw - s * 0.34, barY);
        c.lineWidth = Math.max(1, s * 0.05);
        c.stroke();
      }
      c.rotate(-Math.PI / 2);
      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fit.lines[0], 0, 0);
      c.restore();
    },
  };
}

// ป้ายหัวข้อกรอบคู่สเต๊กเฮาส์ + ลายข้าวหลามตัด + เงา (template: steakhouse)
function framedHeaderEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'body', 700);
  const fit = fitText(text.trim().toUpperCase(), {
    maxWidth: Math.max(20, maxW - size * 2.2),
    maxHeight: size * 1.4,
    maxLines: 1,
    size,
    minSize: size * 0.45,
    lineHeight: 1,
    measure: measureWith(ctx, { ...f, spacing: 0.08 }),
  });
  const s = fit.size;
  const w = Math.min(maxW, fit.width + s * 2.5);
  const boxH = s * 1.85;
  const ruleGap = s * 0.55;
  const h = boxH + ruleGap;
  return {
    w,
    h,
    draw(c, x, y) {
      withShadow(c, guide, s * 0.25, s * 0.1, () => {
        c.beginPath();
        c.roundRect(x, y, w, boxH, s * 0.14);
        c.fillStyle = pal.ink;
        c.fill();
      });
      c.beginPath();
      c.roundRect(x, y, w, boxH, s * 0.14);
      c.lineWidth = Math.max(1.2, s * 0.07);
      c.strokeStyle = pal.accent;
      c.stroke();
      c.beginPath();
      c.roundRect(x + s * 0.18, y + s * 0.18, w - s * 0.36, boxH - s * 0.36, s * 0.06);
      c.lineWidth = Math.max(0.8, s * 0.035);
      c.strokeStyle = pal.accent;
      c.stroke();
      for (const dx of [x + s * 0.52, x + w - s * 0.52]) {
        const dy = y + boxH / 2;
        const dr = s * 0.16;
        c.beginPath();
        c.moveTo(dx, dy - dr);
        c.lineTo(dx + dr, dy);
        c.lineTo(dx, dy + dr);
        c.lineTo(dx - dr, dy);
        c.closePath();
        c.fillStyle = pal.accent;
        c.fill();
      }
      setFont(c, f.family, s, f.weight, f.italic);
      setSpacing(c, s * 0.08);
      c.fillStyle = pal.paper;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fit.lines[0], x + w / 2, y + boxH / 2 + s * 0.03);
      setSpacing(c, 0);
      // เส้นประดับพร้อมเพชรกลาง + ประกายเล็กใต้กรอบ
      const ry = y + boxH + ruleGap * 0.6;
      const rw = w * 0.72;
      const rx0 = x + (w - rw) / 2;
      c.beginPath();
      c.moveTo(rx0, ry);
      c.lineTo(rx0 + rw, ry);
      c.lineWidth = Math.max(1, s * 0.05);
      c.strokeStyle = pal.accent;
      c.stroke();
      const dr = s * 0.19;
      const mx = x + w / 2;
      c.beginPath();
      c.moveTo(mx, ry - dr);
      c.lineTo(mx + dr, ry);
      c.lineTo(mx, ry + dr);
      c.lineTo(mx - dr, ry);
      c.closePath();
      c.fillStyle = pal.accent;
      c.fill();
      if (!guide) {
        const sd = s * 0.34;
        sparkleEl(sd, pal.accent).draw(c, rx0 - sd * 1.2, ry - sd / 2);
        sparkleEl(sd, pal.accent).draw(c, rx0 + rw + sd * 0.2, ry - sd / 2);
      }
    },
  };
}

// ตราขอบหยักคาเฟ่/เบเกอรี + ขอบขาวไดคัท + เส้นประด้านใน (template: bakery)
function scallopSealEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  d: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 800, true);
  const fit = fitText(text.trim(), {
    maxWidth: d * 0.66,
    maxHeight: d * 0.56,
    maxLines: 2,
    size: d * 0.23,
    minSize: d * 0.1,
    lineHeight: 1.15,
    measure: measureWith(ctx, f),
  });
  return {
    w: d,
    h: d,
    draw(c, x, y) {
      const cx = x + d / 2;
      const cy = y + d / 2;
      const lobes = 14;
      const steps = lobes * 8;
      c.save();
      c.translate(cx, cy);
      c.rotate(-0.08);
      const sealPath = () => {
        c.beginPath();
        for (let i = 0; i <= steps; i++) {
          const ang = (i / steps) * Math.PI * 2;
          const r = (d / 2) * (0.89 + 0.09 * Math.abs(Math.sin((lobes * ang) / 2)));
          const px = Math.cos(ang) * r;
          const py = Math.sin(ang) * r;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
      };
      withShadow(c, guide, d * 0.1, d * 0.04, () => {
        sealPath();
        if (!guide) {
          c.lineWidth = d * 0.055;
          c.strokeStyle = '#FFFFFF';
          c.stroke();
        }
        c.fillStyle = pal.accent;
        c.fill();
      });
      sealPath();
      c.lineWidth = Math.max(1.2, d * 0.02);
      c.strokeStyle = pal.ink;
      c.stroke();
      c.beginPath();
      c.arc(0, 0, d * 0.36, 0, Math.PI * 2);
      c.setLineDash([d * 0.024, d * 0.024]);
      c.lineWidth = Math.max(1, d * 0.015);
      c.strokeStyle = pal.accentInk;
      c.stroke();
      c.setLineDash([]);
      setFont(c, f.family, fit.size, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const lh = fit.size * 1.15;
      fit.lines.forEach((line, i) => c.fillText(line, 0, (i - (fit.lines.length - 1) / 2) * lh));
      c.restore();
    },
  };
}

// หัวข้อบนปื้นรอยแปรงพู่กันสาดสีสไตล์เอเจนซี่ (template: boba)
function brushTitleEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  maxH: number,
  size: number,
  align: Align,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 900);
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(20, maxW - size * 1.1),
    maxHeight: maxH,
    maxLines: 2,
    size,
    minSize: size * 0.4,
    lineHeight: 1.38,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const lh = s * 1.38;
  const measure = measureWith(ctx, f);
  const padX = s * 1.05;
  const lines = fit.lines.map((line) => ({ line, w: Math.min(maxW, measure(line, s) + padX) }));
  const w = Math.max(...lines.map((l) => l.w));
  const h = lines.length * lh;
  const strokePath = (c: Ctx, bx: number, top: number, bw: number, bh: number, seed: number) => {
    const tip = Math.min(s * 0.28, bw * 0.08);
    const x0 = bx + tip * 0.7;
    const x1 = bx + bw - tip * 0.7;
    const midY = top + bh / 2;
    const n = 7;
    c.beginPath();
    c.moveTo(x0, top + bh * 0.08);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const jitter = Math.sin((i + seed * 2) * 1.9) * bh * 0.045;
      c.lineTo(x0 + (x1 - x0) * t, top + bh * 0.05 + jitter);
    }
    // ปลายแปรงแตกฝั่งขวา
    c.lineTo(x1 + tip, top + bh * 0.22);
    c.lineTo(x1 + tip * 0.3, top + bh * 0.42);
    c.lineTo(x1 + tip * 0.9, midY + bh * 0.04);
    c.lineTo(x1 + tip * 0.15, top + bh * 0.74);
    c.lineTo(x1 + tip * 0.75, top + bh * 0.9);
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const jitter = Math.cos((i + seed * 3) * 2.1) * bh * 0.045;
      c.lineTo(x0 + (x1 - x0) * t, top + bh * 0.94 + jitter);
    }
    // ปลายแปรงแตกฝั่งซ้าย
    c.lineTo(x0 - tip * 0.9, top + bh * 0.8);
    c.lineTo(x0 - tip * 0.25, top + bh * 0.56);
    c.lineTo(x0 - tip, top + bh * 0.34);
    c.lineTo(x0 - tip * 0.3, top + bh * 0.16);
    c.closePath();
  };
  return {
    w,
    h,
    draw(c, x, y) {
      lines.forEach((item, idx) => {
        const bx = align === 'left' ? x : align === 'right' ? x + w - item.w : x + (w - item.w) / 2;
        const cy = y + (idx + 0.5) * lh;
        const bh = s * 1.14;
        const top = cy - bh * 0.5;
        withShadow(
          c,
          guide,
          s * 0.18,
          s * 0.08,
          () => {
            strokePath(c, bx, top, item.w, bh, idx + 1);
            c.fillStyle = pal.accent;
            c.fill();
          },
          'rgba(0,0,0,0.22)',
        );
        if (!guide) {
          c.save();
          strokePath(c, bx, top, item.w, bh, idx + 1);
          c.clip();
          const sheen = c.createLinearGradient(bx, top, bx, top + bh);
          sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
          sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
          sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
          c.fillStyle = sheen;
          c.fillRect(bx, top, item.w, bh);
          c.restore();
        }
        setFont(c, f.family, s, f.weight, f.italic);
        c.fillStyle = pal.accentInk;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(item.line, bx + item.w / 2, cy);
      });
    },
  };
}

// ริบบิ้นพับ 3 มิติพร้อมหางพับหลังและประกาย (templates: buffet, grandopen, payday)
function pennantEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 900, true);
  const tailOut = size * 0.55;
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(20, maxW - size * 1.8 - tailOut * 2),
    maxHeight: size * 1.35,
    maxLines: 1,
    size,
    minSize: size * 0.4,
    lineHeight: 1,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const mainW = Math.min(maxW - tailOut * 1.8, fit.width + s * 1.9);
  const mainH = s * 1.56;
  const drop = s * 0.28;
  const foldIn = s * 0.34;
  const w = Math.min(maxW, mainW + tailOut * 1.6);
  const h = mainH + drop;
  return {
    w,
    h,
    draw(c, x, y) {
      const mx = x + (w - mainW) / 2;
      const tailW = (w - mainW) / 2 + foldIn;
      const backCol = guide ? pal.accent : mixHex(pal.accent, pal.ink, 0.28);
      const creaseCol = guide ? pal.ink : mixHex(pal.accent, pal.ink, 0.56);

      // หางริบบิ้นด้านหลังซ้าย/ขวา
      if (!guide) {
        const drawTail = (leftSide: boolean) => {
          const tx = leftSide ? x : x + w;
          const ix = leftSide ? mx + foldIn : mx + mainW - foldIn;
          const dir = leftSide ? 1 : -1;
          c.beginPath();
          c.moveTo(ix, y + drop);
          c.lineTo(tx, y + drop);
          c.lineTo(tx + dir * tailW * 0.24, y + drop + mainH / 2);
          c.lineTo(tx, y + drop + mainH);
          c.lineTo(ix, y + drop + mainH);
          c.closePath();
          c.fillStyle = backCol;
          c.fill();
          c.lineWidth = Math.max(1, s * 0.05);
          c.strokeStyle = pal.ink;
          c.stroke();

          // เงารอยพับใต้แผ่นหน้า
          const fx = leftSide ? mx : mx + mainW;
          c.beginPath();
          c.moveTo(fx, y + mainH);
          c.lineTo(ix, y + mainH);
          c.lineTo(ix, y + drop + mainH);
          c.closePath();
          c.fillStyle = creaseCol;
          c.fill();
        };
        drawTail(true);
        drawTail(false);
      }

      // แผ่นริบบิ้นหน้ามีมิติเงา+ไฮไลต์
      const frontPath = () => {
        c.beginPath();
        c.roundRect(mx, y, mainW, mainH, s * 0.14);
      };
      drawGlossyFill(c, guide, mx, y, mainW, mainH, frontPath, pal);
      frontPath();
      c.lineWidth = Math.max(1.2, s * 0.06);
      c.strokeStyle = pal.ink;
      c.stroke();

      if (!guide) {
        c.save();
        c.beginPath();
        c.roundRect(mx + s * 0.12, y + s * 0.12, mainW - s * 0.24, mainH - s * 0.24, s * 0.08);
        c.setLineDash([s * 0.14, s * 0.1]);
        c.lineWidth = Math.max(0.8, s * 0.035);
        c.strokeStyle = pal.accentInk;
        c.globalAlpha = 0.55;
        c.stroke();
        c.restore();

        const sd = s * 0.44;
        sparkleEl(sd, pal.accent).draw(c, mx - sd * 0.45, y - sd * 0.25);
        sparkleEl(sd, pal.accent).draw(c, mx + mainW - sd * 0.55, y - sd * 0.25);
      }

      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fit.lines[0], mx + mainW / 2, y + mainH / 2 + s * 0.03);
    },
  };
}

// วงกลมจุดเด่น/ท็อปปิ้ง 3 ชิ้น + ขอบขาวไดคัท + เงานุ่ม (templates: boba, nutrition)
function statCircleEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  d: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 800);
  const fit = fitText(text.trim(), {
    maxWidth: d * 0.72,
    maxHeight: d * 0.62,
    maxLines: 2,
    size: d * 0.21,
    minSize: d * 0.09,
    lineHeight: 1.15,
    measure: measureWith(ctx, f),
  });
  return {
    w: d,
    h: d,
    draw(c, x, y) {
      const cx = x + d / 2;
      const cy = y + d / 2;
      const r = d * 0.47;
      withShadow(c, guide, d * 0.1, d * 0.04, () => {
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        if (!guide) {
          c.lineWidth = d * 0.055;
          c.strokeStyle = '#FFFFFF';
          c.stroke();
        }
        c.fillStyle = pal.paper;
        c.fill();
      });
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.lineWidth = Math.max(1.4, d * 0.038);
      c.strokeStyle = pal.accent;
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
      c.lineWidth = Math.max(0.8, d * 0.015);
      c.strokeStyle = pal.ink;
      c.stroke();
      setFont(c, f.family, fit.size, f.weight, f.italic);
      c.fillStyle = pal.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const lh = fit.size * 1.15;
      fit.lines.forEach((line, i) => c.fillText(line, cx, cy + (i - (fit.lines.length - 1) / 2) * lh));
    },
  };
}

// ตราโล่รับรอง / การันตี + ขอบขาวไดคัท + เงา (templates: halal, guarantee)
function shieldSealEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 800);
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(24, maxW - size * 1.5),
    maxHeight: size * 2.2,
    maxLines: 2,
    size,
    minSize: size * 0.45,
    lineHeight: 1.12,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const w = Math.min(maxW, Math.max(fit.width + s * 1.8, s * 4.4));
  const h = Math.max(s * 3.1, fit.lines.length * s * 1.15 + s * 1.7);
  return {
    w,
    h,
    draw(c, x, y) {
      const mx = x + w / 2;
      const shieldPath = () => {
        c.beginPath();
        c.moveTo(x + s * 0.25, y);
        c.lineTo(x + w - s * 0.25, y);
        c.lineTo(x + w, y + h * 0.62);
        c.quadraticCurveTo(x + w * 0.85, y + h * 0.86, mx, y + h);
        c.quadraticCurveTo(x + w * 0.15, y + h * 0.86, x, y + h * 0.62);
        c.closePath();
      };
      withShadow(c, guide, s * 0.28, s * 0.12, () => {
        shieldPath();
        if (!guide) {
          c.lineWidth = s * 0.16;
          c.strokeStyle = '#FFFFFF';
          c.stroke();
        }
        c.fillStyle = pal.accent;
        c.fill();
      });
      if (!guide) {
        c.save();
        shieldPath();
        c.clip();
        const sh = c.createLinearGradient(x, y, x, y + h * 0.5);
        sh.addColorStop(0, 'rgba(255,255,255,0.24)');
        sh.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = sh;
        c.fillRect(x, y, w, h * 0.5);
        c.restore();
      }
      shieldPath();
      c.lineWidth = Math.max(1.4, s * 0.08);
      c.strokeStyle = pal.ink;
      c.stroke();
      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const lh = s * 1.12;
      fit.lines.forEach((line, i) => c.fillText(line, mx, y + h * 0.46 + (i - (fit.lines.length - 1) / 2) * lh));
    },
  };
}

// ป้ายมุมเฉียง Shopee/Lazada + ไฮไลต์มันเงา (template: doublecover)
function cornerSashEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 900, true);
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(20, maxW - size * 1.2),
    maxHeight: size * 1.3,
    maxLines: 1,
    size,
    minSize: size * 0.45,
    lineHeight: 1,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const w = Math.min(maxW, fit.width + s * 1.4);
  const h = s * 1.75;
  const slant = s * 0.35;
  return {
    w,
    h,
    draw(c, x, y) {
      const sashPath = () => {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + w, y);
        c.lineTo(x + w - slant, y + h);
        c.lineTo(x, y + h);
        c.closePath();
      };
      drawGlossyFill(c, guide, x, y, w, h, sashPath, pal);
      sashPath();
      c.lineWidth = Math.max(1, s * 0.07);
      c.strokeStyle = pal.ink;
      c.stroke();
      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fit.lines[0], x + (w - slant * 0.3) / 2, y + h / 2 + s * 0.03);
    },
  };
}

// แถววิธีใช้มีตัวเลขขั้นตอน 1-2-3 (template: steps3)
function stepRowEl(
  ctx: Ctx,
  num: string,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  ink: string,
  pal: PosterPalette,
): El | null {
  if (!text.trim()) return null;
  const bf = roleFont(spec, 'body', 600);
  const df = roleFont(spec, 'display', 900);
  const d = size * 1.48;
  const gap = size * 0.45;
  const txt = textEl(ctx, text, {
    family: bf.family,
    weight: bf.weight,
    size,
    maxWidth: Math.max(20, maxW - d - gap),
    maxHeight: size * 2.8,
    maxLines: 2,
    color: ink,
    align: 'left',
  });
  if (!txt) return null;
  const badge: El = {
    w: d,
    h: d,
    draw(c, x, y) {
      const r = d / 2;
      c.beginPath();
      c.arc(x + r, y + r, r, 0, Math.PI * 2);
      c.fillStyle = pal.accent;
      c.fill();
      c.lineWidth = Math.max(1, d * 0.07);
      c.strokeStyle = pal.ink;
      c.stroke();
      setFont(c, df.family, d * 0.56, df.weight, df.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(num, x + r, y + r + d * 0.03);
    },
  };
  return row([badge, txt], gap);
}

// กล่องสเปกตัดมุมเทค 2 บรรทัด: คำแรกตัวโต (200W) + คำอธิบาย (template: specsgrid)
function specTileEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  u: number,
  pal: PosterPalette,
): El | null {
  const clean = text.trim();
  if (!clean) return null;
  const sp = clean.indexOf(' ');
  const top = sp > 0 ? clean.slice(0, sp) : clean;
  const bot = sp > 0 ? clean.slice(sp + 1).trim() : '';
  const tf = roleFont(spec, 'display', 900);
  const bf = roleFont(spec, 'body', 600);
  const topFit = fitText(top, {
    maxWidth: Math.max(20, maxW - u * 0.03),
    maxHeight: u * 0.065,
    maxLines: 1,
    size: u * 0.056,
    minSize: u * 0.022,
    lineHeight: 1,
    measure: measureWith(ctx, tf),
  });
  const botFit = bot
    ? fitText(bot, {
        maxWidth: Math.max(20, maxW - u * 0.03),
        maxHeight: u * 0.042,
        maxLines: 1,
        size: u * 0.026,
        minSize: u * 0.015,
        lineHeight: 1,
        measure: measureWith(ctx, bf),
      })
    : null;
  const w = maxW;
  const h = topFit.size * 1.25 + (botFit ? botFit.size * 1.45 : 0) + u * 0.032;
  const cut = Math.min(u * 0.026, h * 0.24);
  return {
    w,
    h,
    draw(c, x, y) {
      const chamf = () => {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + w - cut, y);
        c.lineTo(x + w, y + cut);
        c.lineTo(x + w, y + h);
        c.lineTo(x + cut, y + h);
        c.lineTo(x, y + h - cut);
        c.closePath();
      };
      c.save();
      chamf();
      c.fillStyle = pal.paper;
      c.fill();
      c.clip();
      c.fillStyle = pal.accent;
      c.fillRect(x, y, w, Math.max(4, u * 0.011));
      c.restore();
      chamf();
      c.lineWidth = Math.max(1.2, u * 0.004);
      c.strokeStyle = pal.accent;
      c.stroke();

      c.textAlign = 'center';
      c.textBaseline = 'middle';
      setFont(c, tf.family, topFit.size, tf.weight, tf.italic);
      c.fillStyle = pal.ink;
      const topY = botFit ? y + h * 0.44 : y + h * 0.54;
      c.fillText(topFit.lines[0], x + w / 2, topY);
      if (botFit) {
        setFont(c, bf.family, botFit.size, bf.weight, bf.italic);
        c.fillStyle = pal.accent;
        c.fillText(botFit.lines[0], x + w / 2, y + h * 0.78);
      }
    },
  };
}

// ป้ายห้อยราคาเจาะรูพร้อมเชือก + เงา + เอียงธรรมชาติ (template: hangtag)
function hangTagEl(
  ctx: Ctx,
  kicker: string,
  price: string,
  spec: PosterFontSpec,
  maxW: number,
  u: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  const pr = price.trim();
  const kk = kicker.trim();
  if (!pr && !kk) return null;
  const tw = Math.min(maxW * 0.84, u * 0.34);
  const pf = roleFont(spec, 'display', 900);
  const bf = roleFont(spec, 'body', 700);
  const pFit = fitText(pr || kk, {
    maxWidth: tw * 0.82,
    maxHeight: u * 0.085,
    maxLines: 1,
    size: u * 0.068,
    minSize: u * 0.025,
    lineHeight: 1,
    measure: measureWith(ctx, pf),
  });
  const kFit =
    kk && pr
      ? fitText(kk.toUpperCase(), {
          maxWidth: tw * 0.75,
          maxHeight: u * 0.032,
          maxLines: 1,
          size: u * 0.024,
          minSize: u * 0.014,
          lineHeight: 1,
          measure: measureWith(ctx, bf),
        })
      : null;
  const th = tw * 1.18;
  const strH = tw * 0.16;
  const pad = tw * 0.08;
  const w = tw + pad * 2;
  const h = th + strH + pad;
  const bevel = tw * 0.22;
  return {
    w,
    h,
    draw(c, x, y) {
      const tx = x + pad;
      const ty = y + strH;
      const holeR = tw * 0.07;
      const holeX = tx + tw / 2;
      const holeY = ty + bevel * 0.88;
      c.save();
      c.translate(holeX, holeY);
      c.rotate(-0.06);
      c.translate(-holeX, -holeY);

      c.beginPath();
      c.moveTo(holeX, holeY);
      c.bezierCurveTo(holeX - tw * 0.12, y, holeX + tw * 0.14, y, holeX, holeY - tw * 0.02);
      c.lineWidth = Math.max(1.5, u * 0.0045);
      c.strokeStyle = pal.ink;
      c.stroke();

      const tagPath = () => {
        c.beginPath();
        c.moveTo(tx + bevel, ty);
        c.lineTo(tx + tw - bevel, ty);
        c.lineTo(tx + tw, ty + bevel);
        c.lineTo(tx + tw, ty + th - tw * 0.08);
        c.quadraticCurveTo(tx + tw, ty + th, tx + tw - tw * 0.08, ty + th);
        c.lineTo(tx + tw * 0.08, ty + th);
        c.quadraticCurveTo(tx, ty + th, tx, ty + th - tw * 0.08);
        c.lineTo(tx, ty + bevel);
        c.closePath();
      };
      withShadow(c, guide, tw * 0.12, tw * 0.05, () => {
        tagPath();
        c.fillStyle = pal.paper;
        c.fill();
      });
      c.save();
      tagPath();
      c.clip();
      c.fillStyle = pal.accent;
      c.fillRect(tx, ty, tw, th * 0.42);
      c.restore();
      tagPath();
      c.lineWidth = Math.max(1.5, u * 0.004);
      c.strokeStyle = pal.ink;
      c.stroke();

      c.beginPath();
      c.arc(holeX, holeY, holeR, 0, Math.PI * 2);
      c.fillStyle = '#FFFFFF';
      c.fill();
      c.stroke();

      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (kFit) {
        setFont(c, bf.family, kFit.size, bf.weight, bf.italic);
        c.fillStyle = pal.accentInk;
        c.fillText(kFit.lines[0], tx + tw / 2, ty + th * 0.31);
      }
      setFont(c, pf.family, pFit.size, pf.weight, pf.italic);
      c.fillStyle = pal.ink;
      c.fillText(pFit.lines[0], tx + tw / 2, ty + th * 0.72);
      c.restore();
    },
  };
}

// บับเบิลคำพูดมีเงาสติ๊กเกอร์ + หางชี้ด้านล่าง (template: speech)
function speechBubbleEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  maxH: number,
  size: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 800);
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(24, maxW - size * 1.6),
    maxHeight: Math.max(24, maxH - size * 1.4),
    maxLines: 2,
    size,
    minSize: size * 0.42,
    lineHeight: 1.25,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const lh = s * 1.25;
  const padX = s * 1.2;
  const padY = s * 0.55;
  const tailH = s * 0.46;
  const sh = s * 0.16;
  const bw = Math.min(maxW - sh, fit.width + padX);
  const boxH = fit.lines.length * lh + padY * 2;
  const w = bw + sh;
  const h = boxH + tailH + sh;
  return {
    w,
    h,
    draw(c, x, y) {
      const r = Math.min(s * 0.55, boxH * 0.42);
      const tx = Math.min(bw * 0.32, r + s * 0.8);
      const bubblePath = (ox: number, oy: number) => {
        c.beginPath();
        c.moveTo(ox + r, oy);
        c.lineTo(ox + bw - r, oy);
        c.quadraticCurveTo(ox + bw, oy, ox + bw, oy + r);
        c.lineTo(ox + bw, oy + boxH - r);
        c.quadraticCurveTo(ox + bw, oy + boxH, ox + bw - r, oy + boxH);
        c.lineTo(ox + tx + s * 0.55, oy + boxH);
        c.lineTo(ox + tx - s * 0.1, oy + boxH + tailH);
        c.lineTo(ox + tx + s * 0.05, oy + boxH);
        c.lineTo(ox + r, oy + boxH);
        c.quadraticCurveTo(ox, oy + boxH, ox, oy + boxH - r);
        c.lineTo(ox, oy + r);
        c.quadraticCurveTo(ox, oy, ox + r, oy);
        c.closePath();
      };
      withShadow(c, guide, s * 0.16, s * 0.08, () => {
        bubblePath(x + sh, y + sh);
        c.fillStyle = pal.accent;
        c.fill();
      });
      bubblePath(x, y);
      c.fillStyle = pal.paper;
      c.fill();
      c.lineWidth = Math.max(1.5, s * 0.08);
      c.strokeStyle = pal.ink;
      c.stroke();

      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fit.lines.forEach((line, i) =>
        c.fillText(line, x + bw / 2, y + boxH / 2 + (i - (fit.lines.length - 1) / 2) * lh),
      );
    },
  };
}

// ป้ายราคาเซ็ตแยกซ้าย-ขวามีมิติเงา+ไฮไลต์ (template: setmeal)
function comboPlaqueEl(
  ctx: Ctx,
  oldPrice: string,
  price: string,
  spec: PosterFontSpec,
  maxW: number,
  u: number,
  pal: PosterPalette,
  guide = false,
): El | null {
  const np = price.trim();
  const op = oldPrice.trim();
  if (!np && !op) return null;
  const pf = roleFont(spec, 'display', 900);
  const bf = roleFont(spec, 'body', 600);
  const pFit = fitText(np || op, {
    maxWidth: maxW * (op ? 0.48 : 0.78),
    maxHeight: u * 0.08,
    maxLines: 1,
    size: u * 0.064,
    minSize: u * 0.025,
    lineHeight: 1,
    measure: measureWith(ctx, pf),
  });
  const oFit =
    op && np
      ? fitText(op, {
          maxWidth: maxW * 0.34,
          maxHeight: u * 0.055,
          maxLines: 1,
          size: pFit.size * 0.62,
          minSize: u * 0.02,
          lineHeight: 1,
          measure: measureWith(ctx, bf),
        })
      : null;
  const padX = pFit.size * 0.55;
  const lw = pFit.width + padX * 1.7;
  const rw = oFit ? oFit.width + padX * 1.6 : 0;
  const w = Math.min(maxW, lw + rw);
  const h = pFit.size * 1.56;
  const r = h * 0.24;
  return {
    w,
    h,
    draw(c, x, y) {
      const boxPath = () => {
        c.beginPath();
        c.roundRect(x, y, w, h, r);
      };
      withShadow(c, guide, h * 0.24, h * 0.08, () => {
        boxPath();
        c.fillStyle = pal.paper;
        c.fill();
      });
      c.save();
      boxPath();
      c.clip();
      c.fillStyle = pal.accent;
      c.fillRect(x, y, lw, h);
      if (!guide) {
        const sheen = c.createLinearGradient(x, y, x, y + h * 0.52);
        sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = sheen;
        c.fillRect(x, y, w, h * 0.52);
      }
      c.restore();
      boxPath();
      c.lineWidth = Math.max(1.5, u * 0.004);
      c.strokeStyle = pal.ink;
      c.stroke();

      setFont(c, pf.family, pFit.size, pf.weight, pf.italic);
      c.fillStyle = pal.accentInk;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(pFit.lines[0], x + lw / 2, y + h / 2 + pFit.size * 0.03);

      if (oFit) {
        const cx = x + lw + rw / 2;
        const cy = y + h / 2;
        setFont(c, bf.family, oFit.size, bf.weight, bf.italic);
        c.fillStyle = pal.ink;
        c.globalAlpha = 0.72;
        c.fillText(oFit.lines[0], cx, cy);
        c.globalAlpha = 1;
        c.beginPath();
        c.moveTo(cx - oFit.width * 0.58, cy + oFit.size * 0.25);
        c.lineTo(cx + oFit.width * 0.58, cy - oFit.size * 0.25);
        c.lineWidth = Math.max(1.5, oFit.size * 0.11);
        c.strokeStyle = pal.accent;
        c.stroke();
      }
    },
  };
}

// หัวข้อการ์ดมีแถบสีเน้นด้านซ้ายสำหรับบริการ/จัดเลี้ยง (template: catering)
function accentBarHeaderEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  pal: PosterPalette,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'display', 700);
  const barW = Math.max(5, size * 0.24);
  const padX = size * 0.55;
  const padY = size * 0.34;
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(24, maxW - barW - padX * 2),
    maxHeight: size * 2.9,
    maxLines: 2,
    size,
    minSize: size * 0.42,
    lineHeight: 1.32,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const lh = s * 1.32;
  const w = Math.min(maxW, fit.width + barW + padX * 2);
  const h = fit.lines.length * lh + padY * 2;
  return {
    w,
    h,
    draw(c, x, y) {
      c.save();
      c.beginPath();
      c.roundRect(x, y, w, h, s * 0.18);
      c.fillStyle = pal.paper;
      c.fill();
      c.clip();
      c.fillStyle = pal.accent;
      c.fillRect(x, y, barW, h);
      c.restore();
      c.beginPath();
      c.roundRect(x, y, w, h, s * 0.18);
      c.lineWidth = Math.max(1, s * 0.05);
      c.strokeStyle = pal.accent;
      c.stroke();
      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.ink;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      fit.lines.forEach((line, i) => c.fillText(line, x + barW + padX * 0.85, y + padY + (i + 0.5) * lh));
    },
  };
}

// แถบเวลาเข้มตัดมุมสไตล์ดิจิทัล/เร่งด่วน (template: countdown)
function urgencyBarEl(
  ctx: Ctx,
  text: string,
  spec: PosterFontSpec,
  maxW: number,
  size: number,
  pal: PosterPalette,
): El | null {
  if (!text.trim()) return null;
  const f = roleFont(spec, 'body', 700);
  const fit = fitText(text.trim(), {
    maxWidth: Math.max(20, maxW - size * 1.5),
    maxHeight: size * 1.5,
    maxLines: 1,
    size,
    minSize: size * 0.45,
    lineHeight: 1,
    measure: measureWith(ctx, f),
  });
  const s = fit.size;
  const cut = s * 0.42;
  const w = Math.min(maxW, fit.width + s * 1.7);
  const h = s * 1.76;
  return {
    w,
    h,
    draw(c, x, y) {
      c.beginPath();
      c.moveTo(x + cut, y);
      c.lineTo(x + w, y);
      c.lineTo(x + w - cut, y + h);
      c.lineTo(x, y + h);
      c.closePath();
      c.fillStyle = pal.ink;
      c.fill();
      c.lineWidth = Math.max(1.2, s * 0.08);
      c.strokeStyle = pal.accent;
      c.stroke();
      setFont(c, f.family, s, f.weight, f.italic);
      c.fillStyle = pal.accent;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fit.lines[0], x + w / 2, y + h / 2 + s * 0.03);
    },
  };
}

// กรอบมุมเรขาคณิตแบบลักชัวรี (template: editorial, ไม่วาดในแผนผังส่ง AI)
function drawCornerBrackets(ctx: Ctx, W: number, H: number, pal: PosterPalette) {
  const u = Math.min(W, H);
  const m = u * 0.04;
  const arm = u * 0.095;
  ctx.save();
  ctx.lineWidth = Math.max(1.5, u * 0.0045);
  ctx.strokeStyle = pal.accent;
  ctx.lineCap = 'square';
  for (const [cx, cy, dx, dy] of [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * arm);
    ctx.stroke();
  }
  ctx.restore();
}

function printedSignEl(
  ctx: Ctx,
  value: string,
  font: PosterFontSpec,
  maxW: number,
  maxH: number,
  size: number,
  align: Align,
  pal: PosterPalette,
  kind: 'name' | 'price',
): El | null {
  const price = kind === 'price';
  const padding = Math.min(size * 0.23, maxW * 0.08);
  const offset = padding * 0.48;
  const label = textEl(ctx, value, {
    ...roleFont(font, 'display', 700),
    size,
    maxWidth: Math.max(1, maxW - padding * 2 - offset),
    maxHeight: Math.max(1, maxH - padding * 1.5 - offset),
    maxLines: price ? 1 : 2,
    color: price ? pal.paper : pal.ink,
    align,
  });
  if (!label) return null;

  const width = label.w + padding * 2;
  const height = label.h + padding * 1.5;
  return {
    w: width + offset,
    h: height + offset,
    draw(c, x, y) {
      c.fillStyle = pal.accent;
      c.fillRect(x + offset, y + offset, width, height);
      c.fillStyle = price ? pal.ink : pal.paper;
      c.fillRect(x, y, width, height);
      if (!price) {
        const line = Math.max(1, padding * 0.12);
        c.lineWidth = line;
        c.strokeStyle = pal.ink;
        c.strokeRect(x + line / 2, y + line / 2, width - line, height - line);
      }
      label.draw(c, x + padding, y + padding * 0.75);
    },
  };
}

// ---------- แต่ละแบบ = ชิ้นที่ย้ายได้ (sections ของแบบ) + วิธีเรียงเป็นก้อนตอนเริ่ม ----------
// build(maxW, align, ink) = วาดชิ้นนั้นในความกว้าง maxW (px ก่อนขยาย) · maxW ในชิ้น = กว้างตอนอยู่ในก้อน (ตำแหน่งเริ่ม)
type Part = {
  id: SectionId;
  maxW: number;
  align: Align;
  build: (maxW: number, align: Align, ink: string) => El | null;
};

// กรอบของทั้งก้อน = layoutFrame(place) (กว้าง w/size สูงตามแบบแถบ/คอลัมน์) · ขนาดตัวอักษรอิงกรอบนี้ทุกชิ้น
// guide = แผนผังที่ส่งให้ AI: ของตกแต่งของกราฟิกดนตรีไม่วาด (ขนาด/ตำแหน่งเท่าเดิม) · ดู planImage
function templateParts(ctx: Ctx, doc: PosterDoc, fontArg: FontArg, W: number, H: number, guide = false) {
  const font = resolveFont(fontArg);
  const tpl = templateOf(doc.template);
  const pal = paletteOf(doc.palette);
  const frame = layoutFrame(doc.place, doc.aspect);
  const u = Math.min(W, H);
  const pad = u * 0.012;
  const maxW = Math.max(1, frame.w * W - pad * 2),
    maxH = Math.max(1, frame.h * H - pad * 2);
  const wide = frame.wide;
  const align = doc.place.align;
  const effect = resolvedEffectId(doc);
  const t = (id: FieldId) => (doc.texts[id] ?? '').trim();
  const text =
    (id: FieldId, o: Omit<TextOpts, 'family' | 'color' | 'align' | 'maxWidth'> & { role?: 'display' | 'body' }) =>
    (mw: number, a: Align, ink: string) => {
      const { role = id === 'title' ? 'display' : 'body', weight, italic, effect: explicitEffect, ...rest } = o;
      const rf = roleFont(font, role, weight, italic);
      return textEl(ctx, t(id), {
        family: rf.family,
        weight: rf.weight,
        italic: rf.italic,
        color: ink,
        align: a,
        maxWidth: mw,
        effect: explicitEffect ?? (role === 'display' && id === 'title' ? effect : 'clean'),
        pal,
        guide,
        ...rest,
      });
    };
  const part = (id: SectionId, mw: number, build: Part['build'], a: Align = align): Part => ({
    id,
    maxW: mw,
    align: a,
    build: (w, al, ink) => {
      const el = build(w, al, ink);
      return el && { ...el, id };
    },
  });

  let parts: Part[];
  let arrange: (els: (El | null)[]) => El | null;
  let customStart: Partial<Record<SectionId, GraphicPlace>> | undefined;
  if (tpl.id === 'pill') {
    parts = [
      part('title', maxW, (mw) => pillEl(ctx, t('title'), font, mw, maxH * 0.64, pal)),
      part('sub', maxW * 0.92, text('sub', { weight: 600, size: u * 0.048, maxHeight: maxH * 0.3, maxLines: 2 })),
    ];
    arrange = (els) => stack(els, u * 0.018, 'center');
  } else if (tpl.id === 'event') {
    parts = [
      part('kicker', maxW, text('kicker', { weight: 600, size: u * 0.046, maxHeight: maxH * 0.24, maxLines: 2 })),
      part('title', maxW, (mw, _a, ink) => eventTitleEl(ctx, t('title'), t('accent'), font, mw, maxH * 0.5, ink, pal)),
      part('date', maxW, text('date', { weight: 700, size: u * 0.058, maxHeight: maxH * 0.16, maxLines: 1 })),
    ];
    arrange = (els) => stack(els, u * 0.012, align);
  } else if (tpl.id === 'artist') {
    // ศิลปิน ชื่อยักษ์หลังตัว (ผู้ใช้ 27 พ.ย. จากโปสเตอร์ Atom live at Thirdpark, A4 แนวตั้ง) · ตำแหน่ง/ขนาดวัดจากงานนั้น
    // ชื่อตัวยักษ์ (title อยู่หลังตัวหลัก: tpl.behind) สองบรรทัดคำเดิม บรรทัดบนชิดขวา บรรทัดล่างชิดซ้าย
    // · ล่างซ้าย: ชื่อเล็ก + ชื่อเต็มตัวจิ๋วเหนือตัวพิมพ์เล็ก / งาน / เส้น / วันที่ตัวโต + วัน + เดือนปี · ล่างขวา: คอลัมน์ช่องทาง
    // ตัวอักษรสีเดียว (เข้ม/ขาวตามพื้น) · แผนผังให้ AI วาดเหมือนกัน (ไม่มีของตกแต่ง)
    const k = Math.min(1, H / (W * 1.414)); // A4 แนวตั้งหรือสูงกว่า = เต็มขนาด · ภาพเตี้ยกว่า = ย่อทั้งชุด
    const z = W * k;
    const disp = (w: number) => roleFont(font, 'display', w);
    const body = (w: number) => roleFont(font, 'body', w);
    // ขนาดที่พอดีกว้าง mw (ไม่เกิน size)
    const fitSize = (str: string, f: { family: string; weight: number }, size: number, mw: number) =>
      Math.min(size, (size * mw) / Math.max(1, inkText(ctx, str, { ...f, size }).w));
    // ชื่อตัวยักษ์: กว้างบรรทัดละ 86% ของกรอบ (เหลื่อมกัน 14%) · บีบแนวนอนนิดให้ตัวสูงแบบตัวหนาของงานจริง · ชื่อสั้นไม่สูงเกิน
    const giant: Part['build'] = (mw, _a, ink) => {
      const word = t('title').toUpperCase();
      if (!word) return null;
      const f = { ...disp(800), spacing: -0.03, squeeze: 0.81 };
      const probe = inkText(ctx, word, { ...f, size: 100 });
      const size = Math.min((100 * mw * 0.865) / probe.w, (100 * z * 0.27) / Math.max(1, probe.asc));
      const g = inkText(ctx, word, { ...f, size });
      const lh = g.asc + g.desc,
        gap = z * 0.045;
      return {
        w: mw,
        h: lh * 2 + gap,
        draw(c, x, y) {
          g.draw(c, x + mw - g.w, y + g.asc, ink);
          g.draw(c, x, y + lh + gap + g.asc, ink);
        },
      };
    };
    // ชื่อเล็ก (ตามที่พิมพ์) + ชื่อเต็มตัวจิ๋ว ชิดขวาของชื่อ: วางในช่องเหนือตัวพิมพ์เล็กท้ายชื่อ (Atom: เหนือ "om") ถ้าไม่พอวางเหนือชื่อ
    const nameBlock: Part['build'] = (mw, _a, ink) => {
      const name = t('title'),
        full = t('sub');
      if (!name && !full) return null;
      const nf = disp(600),
        tf = body(400);
      const ns = name ? fitSize(name, nf, z * 0.11, mw) : 0;
      const n = name ? inkText(ctx, name, { ...nf, size: ns }) : null;
      const th = full ? inkText(ctx, full, { ...tf, size: fitSize(full, tf, z * 0.019, mw) }) : null;
      if (!n || !th) {
        const one = (n ?? th)!;
        return { w: one.w, h: one.asc + one.desc, draw: (c, x, y) => one.draw(c, x, y + one.asc, ink) };
      }
      const tail = name.match(/[acemnorsuvwxz]+$/)?.[0] ?? '';
      const tailW = tail ? inkText(ctx, tail, { ...nf, size: ns }).w : 0;
      const xH = inkText(ctx, 'x', { ...nf, size: ns }).asc;
      const gap = z * 0.005;
      // เส้นฐานชื่อ = 0 · เส้นฐานชื่อเต็ม: หมึกล่างอยู่เหนือตัวพิมพ์เล็กท้ายชื่อ หรือเหนือทั้งชื่อ
      const tb = th.w <= tailW ? -xH - gap - th.desc : -n.asc - gap - th.desc;
      const top = Math.min(-n.asc, tb - th.asc),
        bottom = Math.max(n.desc, tb + th.desc);
      const w = Math.max(n.w, th.w);
      return {
        w,
        h: bottom - top,
        draw(c, x, y) {
          n.draw(c, x, y - top, ink);
          th.draw(c, x + n.w - th.w < x ? x : x + n.w - th.w, y - top + tb, ink);
        },
      };
    };
    // วันที่ตัวโต + วัน (บน) + เดือนปี (ล่าง ปรับขนาดให้กว้างเท่าบรรทัดวัน) · สองบรรทัดสูงรวมเท่าตัวเลข (เว้นกลาง 15%)
    const dateRow: Part['build'] = (mw, _a, ink) => {
      const day = t('date'),
        d1 = t('bullet1'),
        d2 = t('bullet2');
      if (!day && !d1 && !d2) return null;
      const bf = body(600);
      const build = (scale: number) => {
        const big = day ? inkText(ctx, day, { ...disp(700), size: z * 0.16 * scale, spacing: -0.02 }) : null;
        const cap = big ? big.asc : z * 0.095 * scale;
        let s1 = z * 0.05 * scale,
          s2 = s1;
        if (d1 && d2)
          s2 =
            s1 *
            Math.min(
              1.35,
              Math.max(0.85, inkText(ctx, d1, { ...bf, size: s1 }).w / inkText(ctx, d2, { ...bf, size: s1 }).w),
            );
        const asc = (str: string, size: number) => (str ? inkText(ctx, str, { ...bf, size }).asc : 0);
        const need = asc(d1, s1) + asc(d2, s2);
        if (d1 && d2 && need > cap * 0.85) {
          s1 *= (cap * 0.85) / need;
          s2 *= (cap * 0.85) / need;
        }
        const a = d1 ? inkText(ctx, d1, { ...bf, size: s1 }) : null;
        const b = d2 ? inkText(ctx, d2, { ...bf, size: s2 }) : null;
        const gap = big && (a || b) ? z * 0.035 * scale : 0;
        const w = (big?.w ?? 0) + gap + Math.max(a?.w ?? 0, b?.w ?? 0);
        const h = Math.max(cap, (a?.asc ?? 0) + (b?.asc ?? 0) + (a && b ? cap * 0.15 : 0));
        return {
          w,
          h,
          draw(c: Ctx, x: number, y: number) {
            big?.draw(c, x, y + h, ink);
            const lx = x + (big?.w ?? 0) + gap;
            if (a) a.draw(c, lx, y + a.asc, ink);
            if (b) b.draw(c, lx, y + h, ink);
          },
        };
      };
      const first = build(1);
      return first.w <= mw ? first : build(mw / first.w);
    };
    // คอลัมน์ช่องทาง ชิดซ้ายในกรอบแคบ: ตัวเล็ก / ชื่อร้าน / เบอร์ / ตัวเล็ก
    const small = (id: FieldId) =>
      text(id, {
        role: 'body',
        weight: 500,
        size: z * 0.022,
        minSize: z * 0.014,
        maxHeight: z * 0.08,
        maxLines: 2,
        spacing: 0.02,
      });
    const mid = (id: FieldId) =>
      text(id, { role: 'body', weight: 600, size: z * 0.031, minSize: z * 0.018, maxHeight: z * 0.09, maxLines: 2 });
    const column: Part['build'] = (mw, a, ink) =>
      stack(
        [small('price1')(mw, a, ink), mid('footer')(mw, a, ink), mid('price')(mw, a, ink), small('price2')(mw, a, ink)],
        z * 0.012,
        'left',
      );
    const kicker = text('kicker', {
      role: 'body',
      weight: 500,
      size: z * 0.057,
      minSize: z * 0.02,
      maxHeight: z * 0.08,
      maxLines: 1,
    });
    const rule: Part['build'] = (mw, _a, ink) => ruleEl(mw, z * 0.012, Math.max(1, z * 0.0035), ink);
    const L = 0.035,
      R = 0.975;
    const span = { title: R - L, sub: 0.5, kicker: 0.56, rule: 0.54, date: 0.56, footer: 0.2 };
    parts = [
      part('title', span.title * W, giant, 'left'),
      part('sub', span.sub * W, nameBlock, 'left'),
      part('kicker', span.kicker * W, kicker, 'left'),
      part('rule', span.rule * W, rule, 'left'),
      part('date', span.date * W, dateRow, 'left'),
      part('footer', span.footer * W, column, 'left'),
    ];
    // ตำแหน่งเริ่ม: ชื่อยักษ์จากขอบบน · ก้อนล่างซ้ายเรียงขึ้นจากขอบล่าง · คอลัมน์ขวาชิดขอบล่าง (ช่องว่างวัดจากงานจริง)
    const hOf = (id: keyof typeof span) => parts.find((p) => p.id === id)!.build(span[id] * W, 'left', pal.ink)?.h ?? 0;
    const at = (id: keyof typeof span, x: number, cy: number): GraphicPlace => ({
      x: x + span[id] / 2,
      y: cy / H,
      w: span[id],
      size: 1,
      align: 'left',
    });
    const hDate = hOf('date'),
      hRule = z * 0.012,
      hKick = hOf('kicker'),
      hSub = hOf('sub'),
      hFoot = hOf('footer'),
      hTitle = hOf('title');
    const base = H - z * 0.05;
    const yRule = base - hDate - z * 0.03 - hRule / 2;
    const yKick = yRule - hRule / 2 - z * 0.012 - hKick / 2;
    customStart = {
      title: at('title', L, z * 0.106 + hTitle / 2),
      sub: at('sub', L, yKick - hKick / 2 - z * 0.01 - hSub / 2),
      kicker: at('kicker', L, yKick),
      rule: at('rule', L, yRule),
      date: at('date', L, base - hDate / 2),
      footer: at('footer', R - span.footer, H - z * 0.04 - hFoot / 2),
    };
    arrange = (els) => stack(els, z * 0.012, 'left');
  } else if (tpl.id === 'bigprice') {
    // เมนูเด่น ราคาตัวโต (ผู้ใช้ 26 พ.ย. จากงาน Canva ของผู้ใช้ แนวตั้ง พื้นดำ) · ตำแหน่ง/ขนาดวัดจากงานนั้น (สูงราว 2.2 เท่าของกว้าง)
    // โลโก้วงกลมสีหลักชิดขอบบน · ชื่อเมนูครีมขอบดำ เงาเข้ม เอียงนิด · ราคาตัวโตทับชื่อ (".-" ตัวเล็กมุมล่าง)
    // · แถบพู่กันสีหลักเอียงพร้อมคำลายมือ · เวลาเปิด 2 บรรทัด · ช่องทางตัวเล็กขอบล่าง
    // ภาพเตี้ยกว่า Story (4:5, 1:1) = ย่อทั้งชุดตามส่วน ไม่ให้ชิ้นทับกัน · แผนผังให้ AI (guide): ไม่มีวงกลม/แถบพู่กัน/เงา
    const cream = '#F6E6C9';
    const onDark = (ink: string) => ink.toUpperCase() === '#FFFFFF';
    const disp = (w: number) => roleFont(font, 'display', w);
    const body = (w: number) => roleFont(font, 'body', w);
    const k = Math.min(1, H / (W * 1.78)); // Story 9:16 = เต็มขนาด
    const z = u * k;
    // เงาเข้มใต้ตัวขอบดำ (สติ๊กเกอร์) + เอียง
    const sticker = (el: El | null, deg = 0): El | null =>
      el && {
        ...el,
        draw(c, x, y) {
          c.save();
          c.translate(x + el.w / 2, y + el.h / 2);
          if (!guide && deg) c.rotate((deg * Math.PI) / 180);
          withShadow(c, guide, z * 0.035, z * 0.015, () => el.draw(c, -el.w / 2, -el.h / 2), 'rgba(0,0,0,0.5)');
          c.restore();
        },
      };
    // แถบพู่กัน: ขอบบน/ล่างขรุขระ + เส้นแห้งเลยปลาย (สุ่มแบบมีเมล็ด = เหมือนเดิมทุกครั้ง)
    const brush = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => {
      let seed = 11;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const x0 = x + w * 0.07,
        x1 = x + w * 0.93;
      c.save();
      c.fillStyle = color;
      c.strokeStyle = color;
      // ตัวแถบ: ขอบบน/ล่างขรุขระเล็กๆ แบบขนแปรง ไม่ใช่ฟันเลื่อย
      c.beginPath();
      const steps = 70;
      for (let i = 0; i <= steps; i++) {
        const px = x0 + ((x1 - x0) * i) / steps,
          py = y + h * 0.1 + (rnd() - 0.5) * h * 0.05 + Math.sin(i * 0.9) * h * 0.012;
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      for (let i = steps; i >= 0; i--)
        c.lineTo(x0 + ((x1 - x0) * i) / steps, y + h * 0.9 + (rnd() - 0.5) * h * 0.05 + Math.cos(i * 0.8) * h * 0.012);
      c.closePath();
      c.fill();
      // ปลายแปรงแตกเป็นเส้น: เส้นบางหนาไม่เท่ากัน ยาวไม่เท่ากัน ออกจากตัวแถบทั้งสองข้าง
      c.lineCap = 'round';
      for (const side of [-1, 1]) {
        for (let n = 0; n < 22; n++) {
          const sy = y + h * (0.1 + rnd() * 0.8);
          const len = w * (0.04 + rnd() * 0.16);
          const start = side < 0 ? x0 + w * 0.05 : x1 - w * 0.05;
          c.globalAlpha = 0.6 + rnd() * 0.4;
          c.lineWidth = h * (0.02 + rnd() * 0.08);
          c.beginPath();
          c.moveTo(start, sy);
          c.lineTo(start + side * (w * 0.05 + len), sy + (rnd() - 0.5) * h * 0.06);
          c.stroke();
        }
      }
      c.restore();
    };
    const size = {
      logo: z * 0.075,
      title: z * 0.24,
      price: z * 0.3,
      suffix: z * 0.12,
      brush: z * 0.15,
      sub: z * 0.085,
      date: z * 0.072,
      footer: z * 0.042,
    };
    const logoD = z * 0.31;
    parts = [
      // โลโก้: วงกลมสีหลัก ครึ่งล่างโผล่จากขอบบน
      part('badge', W * 0.4, (mw) => {
        const d = Math.min(mw, logoD),
          vis = d * 0.62;
        const txt = textEl(ctx, t('badge'), {
          ...disp(400),
          size: size.logo,
          minSize: size.logo * 0.4,
          maxWidth: d * 0.78,
          maxHeight: size.logo * 1.4,
          maxLines: 1,
          color: guide ? pal.ink : cream,
          align: 'center',
          guide,
        });
        if (!txt) return null;
        const cy = vis - d / 2;
        return {
          w: d,
          h: vis,
          draw(c, x, y) {
            if (!guide) {
              c.save();
              c.fillStyle = pal.accent;
              c.beginPath();
              c.arc(x + d / 2, y + cy, d / 2, 0, Math.PI * 2);
              c.fill();
              c.restore();
            }
            txt.draw(c, x + (d - txt.w) / 2, y + cy + d * 0.17 - txt.h / 2);
          },
        };
      }),
      part('title', W * 0.92, (mw) =>
        sticker(
          // ชื่อเมนูโค้งขึ้นแบบงาน Canva (Curve) + เอียงนิด
          curvedTextEl(ctx, t('title'), {
            family: body(700).family,
            weight: body(700).weight,
            size: size.title,
            minSize: size.title * 0.35,
            maxWidth: mw,
            color: guide ? pal.ink : cream,
            ...(guide ? {} : { outline: '#111111' }),
            bend: 24,
          }),
          -4,
        ),
      ),
      // ราคา: ตัวเลขใหญ่ + ".-" ตัวเล็กชิดล่างขวา
      part('price', W * 0.8, (mw) => {
        const raw = t('price');
        const m = raw.match(/^(.*?)(\.-|\.–)$/);
        const main = m ? m[1] : raw,
          suffix = m ? m[2] : '';
        const opts = (s: number) => ({
          ...body(700),
          size: s,
          minSize: s * 0.35,
          maxLines: 1,
          color: guide ? pal.ink : cream,
          align: 'left' as Align,
          ...(guide ? {} : { outline: '#111111' }),
          guide,
        });
        const big = textEl(ctx, main, { ...opts(size.price), maxWidth: mw * 0.8, maxHeight: size.price * 1.15 });
        const small = suffix
          ? textEl(ctx, suffix, { ...opts(size.suffix), maxWidth: mw * 0.25, maxHeight: size.suffix * 1.15 })
          : null;
        if (!big) return null;
        const w = big.w + (small ? small.w * 0.92 : 0);
        return sticker({
          w,
          h: big.h,
          draw(c, x, y) {
            big.draw(c, x, y);
            if (small) small.draw(c, x + big.w - small.w * 0.04, y + big.h * 0.6 - small.h / 2);
          },
        });
      }),
      // แถบพู่กันสีหลัก เอียง -7° + คำลายมือสีครีม
      part('kicker', W, (mw) => {
        // คำลายมือโค้งขึ้นเล็กน้อยตามแถบพู่กัน
        const txt = curvedTextEl(ctx, t('kicker'), {
          family: disp(400).family,
          weight: disp(400).weight,
          size: size.brush,
          minSize: size.brush * 0.4,
          maxWidth: mw * 0.74,
          color: guide ? pal.ink : cream,
          bend: 12,
        });
        if (!txt) return null;
        const w = mw,
          h = txt.h * 1.3;
        return {
          w,
          h,
          draw(c, x, y) {
            c.save();
            c.translate(x + w / 2, y + h / 2);
            if (!guide) {
              c.rotate((-7 * Math.PI) / 180);
              brush(c, -w / 2, -h / 2, w, h, pal.accent);
            }
            txt.draw(c, -txt.w / 2, -txt.h / 2);
            c.restore();
          },
        };
      }),
      part('sub', W * 0.9, (mw, a, ink) =>
        textEl(ctx, t('sub'), {
          ...body(400),
          size: size.sub,
          minSize: size.sub * 0.5,
          maxWidth: mw,
          maxHeight: size.sub * 1.32,
          maxLines: 1,
          color: guide || !onDark(ink) ? pal.ink : cream,
          align: a,
          guide,
        }),
      ),
      part('date', W * 0.9, (mw, a, ink) =>
        textEl(ctx, t('date'), {
          ...body(400),
          size: size.date,
          minSize: size.date * 0.5,
          maxWidth: mw,
          maxHeight: size.date * 1.32,
          maxLines: 1,
          color: guide || !onDark(ink) ? pal.ink : cream,
          align: a,
          guide,
        }),
      ),
      part('footer', W * 0.9, (mw, a, ink) =>
        textEl(ctx, t('footer'), {
          ...body(400),
          size: size.footer,
          minSize: size.footer * 0.5,
          maxWidth: mw,
          maxHeight: size.footer * 1.32,
          maxLines: 1,
          color: guide ? pal.ink : ink,
          align: a,
          upper: true,
          spacing: 0.04,
          guide,
        }),
      ),
    ];
    const fr = (v: number) => v / H;
    const at = (y: number, w = 0.9): GraphicPlace => ({ x: 0.5, y, w, size: 1, align: 'center' });
    customStart = {
      badge: at(fr((logoD * 0.62) / 2), 0.4),
      title: at(0.194, 0.92),
      price: at(0.31, 0.8),
      kicker: at(0.72, 1),
      sub: at(0.854),
      date: at(0.904),
      footer: at(1 - fr(size.footer * 0.9)),
    };
    arrange = (els) => stack(els, z * 0.014, 'center');
  } else if (tpl.id === 'promo') {
    // โปร 1 แถม 1 + ป้ายราคา (ผู้ใช้ 26 พ.ย. จากงาน Canva ของผู้ใช้ 1080×1080) · ตำแหน่ง/ขนาดวัดจากงานนั้น
    // สี: ตัวขาวบนพื้นสีหลัก (ink ตามพื้น) · ตัวเลขสีทอง · ป้ายของแถม + ข้อความในวงกลม = สีคู่ตรงข้ามเข้มของสีหลัก (แดง -> เขียวเข้ม)
    // · ราคา = สีหลัก (สว่างไปบนวงกลมขาว = เข้มขึ้น) · แผนผังที่ส่งให้ AI (guide): ไม่มีวงกลม/ป้าย/ดาว เหลือตัวอักษร
    const onDark = (ink: string) => ink.toUpperCase() === '#FFFFFF';
    const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lum = (h: string) => {
      const [r, g, b] = hexRgb(h).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // สีคู่ตรงข้ามโทนเข้ม (หมุนวงสี 150°) แบบแดงคู่เขียวคริสต์มาส
    const complement = (() => {
      const [r, g, b] = hexRgb(pal.accent);
      const mx = Math.max(r, g, b),
        mn = Math.min(r, g, b);
      let h = 0;
      if (mx !== mn) {
        const d = mx - mn;
        h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
      }
      const sat = mx === mn ? 0 : 0.55,
        l = 0.28,
        hue = (((h + 150) % 360) + 360) % 360;
      const c = (1 - Math.abs(2 * l - 1)) * sat,
        x = c * (1 - Math.abs(((hue / 60) % 2) - 1)),
        m = l - c / 2;
      const [r1, g1, b1] =
        hue < 60
          ? [c, x, 0]
          : hue < 120
            ? [x, c, 0]
            : hue < 180
              ? [0, c, x]
              : hue < 240
                ? [0, x, c]
                : hue < 300
                  ? [x, 0, c]
                  : [c, 0, x];
      return (
        '#' +
        [r1, g1, b1]
          .map((v) =>
            Math.round((v + m) * 255)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
      );
    })();
    const gold = '#F9C74F';
    const priceColor = lum(pal.accent) > 0.4 ? mixHex(pal.accent, '#000000', 0.4) : pal.accent;
    const disp = (w: number) => roleFont(font, 'display', w);
    const body = (w: number) => roleFont(font, 'body', w);
    const lh = (s: string) => (hasThai(s) ? 1.32 : 1.15);
    const size = {
      kicker: u * 0.06,
      small: u * 0.092,
      num: u * 0.215,
      big: u * 0.2,
      tag: u * 0.04,
      sub: u * 0.044,
      price: u * 0.09,
      title: u * 0.054,
      footer: u * 0.034,
    };
    const disc = u * 0.26;
    parts = [
      part('kicker', W * 0.86, (mw, a, ink) =>
        textEl(ctx, t('kicker'), {
          ...body(500),
          size: size.kicker,
          maxWidth: mw,
          maxHeight: size.kicker * 1.32,
          maxLines: 1,
          color: ink,
          align: a,
          guide,
        }),
      ),
      // ข้อเสนอ: คำเล็กสองบรรทัด (ชิดขวา) · ตัวเลขสีทอง · คำใหญ่
      part('badge', W * 0.8, (mw, _a, ink) => {
        const small = (id: FieldId) =>
          textEl(ctx, t(id), {
            ...disp(500),
            size: size.small,
            minSize: size.small * 0.5,
            maxWidth: mw * 0.26,
            maxHeight: size.small * 1.15,
            maxLines: 1,
            color: ink,
            align: 'right',
            upper: true,
            squeeze: 0.86,
            guide,
          });
        const col = stack([small('bullet1'), small('bullet2')], -size.small * 0.18, 'right');
        const num = textEl(ctx, t('accent'), {
          ...disp(500),
          size: size.num,
          minSize: size.num * 0.5,
          maxWidth: mw * 0.22,
          maxHeight: size.num * 1.15,
          maxLines: 1,
          color: onDark(ink) || guide ? gold : mixHex(gold, '#000000', 0.25),
          align: 'center',
          squeeze: 0.86,
          guide,
        });
        const big = textEl(ctx, t('badge'), {
          ...disp(500),
          size: size.big,
          minSize: size.big * 0.4,
          maxWidth: mw * 0.62,
          maxHeight: size.big * 1.15,
          maxLines: 1,
          color: ink,
          align: 'left',
          upper: true,
          squeeze: 0.86,
          guide,
        });
        return row([col, num, big], u * 0.012);
      }),
      // ป้ายของแถม: แคปซูลสีคู่ตรงข้าม ตัวขาว ตัวห่าง
      part('bullet3', W * 0.3, (mw) => {
        const txt = textEl(ctx, t('bullet3'), {
          ...disp(700),
          size: size.tag,
          minSize: size.tag * 0.5,
          maxWidth: Math.max(1, mw - u * 0.06),
          maxHeight: size.tag * 1.3,
          maxLines: 1,
          color: guide ? pal.ink : '#FFFFFF',
          align: 'center',
          upper: true,
          spacing: 0.08,
          guide,
        });
        if (!txt) return null;
        const w = txt.w + u * 0.06,
          h = txt.h + u * 0.012;
        return {
          w,
          h,
          draw(c, x, y) {
            c.save();
            c.translate(x + w / 2, y + h / 2);
            if (!guide) c.rotate((-12 * Math.PI) / 180); // เอียงแบบป้ายแปะ (งาน Canva)
            if (!guide) {
              c.fillStyle = complement;
              c.beginPath();
              c.roundRect(-w / 2, -h / 2, w, h, h / 2);
              c.fill();
            }
            txt.draw(c, -txt.w / 2, -txt.h / 2);
            c.restore();
          },
        };
      }),
      // วงกลมราคา: ขาว มีเงานุ่ม · ข้อความเล็กสีคู่ตรงข้าม · ราคาสีหลัก
      part('price', W * 0.3, (mw) => {
        const d = Math.min(mw, disc);
        const inner = d * 0.78;
        const sub = textEl(ctx, t('sub'), {
          ...body(500),
          size: size.sub,
          minSize: size.sub * 0.5,
          maxWidth: inner,
          maxHeight: size.sub * 1.32 * 2,
          maxLines: 2,
          color: complement,
          align: 'center',
          guide,
        });
        const price = textEl(ctx, t('price'), {
          ...body(500),
          size: size.price,
          minSize: size.price * 0.4,
          maxWidth: inner,
          maxHeight: size.price * 1.2,
          maxLines: 1,
          color: priceColor,
          align: 'center',
          guide,
        });
        const content = stack([sub, price], -u * 0.004, 'center');
        if (!content) return null;
        return {
          w: d,
          h: d,
          draw(c, x, y) {
            if (!guide)
              withShadow(c, guide, d * 0.12, d * 0.03, () => {
                c.fillStyle = '#FFFFFF';
                c.beginPath();
                c.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
                c.fill();
              });
            c.save();
            c.translate(x + d / 2, y + d / 2);
            if (!guide) c.rotate((8 * Math.PI) / 180); // ข้อความในวงกลมเอียงนิดแบบงาน Canva
            content.draw(c, -content.w / 2, -content.h / 2);
            c.restore();
          },
        };
      }),
      part('title', W * 0.52, (mw, a, ink) =>
        textEl(ctx, t('title'), {
          ...body(500),
          size: size.title,
          minSize: size.title * 0.5,
          maxWidth: mw,
          maxHeight: size.title * 1.32 * 2,
          maxLines: 2,
          color: ink,
          align: a,
          guide,
        }),
      ),
      part('footer', W * 0.52, (mw, a, ink) =>
        textEl(ctx, t('footer'), {
          ...body(400),
          size: size.footer,
          maxWidth: mw,
          maxHeight: size.footer * 1.32,
          maxLines: 1,
          color: ink,
          align: a,
          guide,
        }),
      ),
      // แถวดาวขอบล่าง (ดอกจัน 6 แฉก)
      part('rule', W * 0.96, (mw, _a, ink) => {
        const h = u * 0.032,
          n = Math.max(6, Math.round(mw / (u * 0.052)));
        return {
          w: mw,
          h,
          draw(c, x, y) {
            if (guide) return;
            c.save();
            c.strokeStyle = ink;
            c.lineWidth = Math.max(1, h * 0.06);
            c.lineCap = 'round';
            for (let i = 0; i < n; i++) {
              const cx = x + (mw / n) * (i + 0.5),
                cy = y + h / 2,
                r = h / 2;
              c.beginPath();
              for (let k = 0; k < 4; k++) {
                const ang = (k * Math.PI) / 4 + Math.PI / 2;
                c.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
                c.lineTo(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r);
              }
              c.stroke();
            }
            c.restore();
          },
        };
      }),
    ];
    // ตำแหน่งเริ่มตามงาน Canva (1:1) · สัดส่วนอื่นใช้สัดส่วนเดิมของความสูง
    const left = (w: number): GraphicPlace => ({ x: 0.083 + w / 2, y: 0, w, size: 1, align: 'left' });
    customStart = {
      kicker: { x: 0.5, y: 0.13, w: 0.86, size: 1, align: 'center' },
      badge: { x: 0.5, y: 0.268, w: 0.8, size: 1, align: 'center' },
      bullet3: { x: 0.2, y: 0.44, w: 0.3, size: 1, align: 'center' },
      price: { x: 0.764, y: 0.505, w: 0.3, size: 1, align: 'center' },
      title: { ...left(0.52), y: 0.795 },
      footer: { ...left(0.52), y: 0.9 },
      rule: { x: 0.5, y: 0.963, w: 0.96, size: 1, align: 'center' },
    };
    void lh;
    arrange = (els) => stack(els, u * 0.014, 'center');
  } else if (tpl.id === 'concert') {
    const onDark = (ink: string) => ink.toUpperCase() === '#FFFFFF';
    const plate = (ink: string): { fill: string | null; text: string } =>
      guide
        ? { fill: null, text: pal.ink }
        : onDark(ink)
          ? { fill: pal.paper, text: pal.ink }
          : { fill: pal.ink, text: pal.paper };
    const deco = (el: El): El => (guide ? { ...el, draw: () => {} } : el);
    const flank = (h: number) => chevronsEl(h, pal.accent, 'right').w + h * 0.7 + u * 0.024;
    const lh = (id: FieldId) => (hasThai(t(id)) ? 1.32 : 1.15);
    const size = { date: u * 0.085, sub: u * 0.046, kicker: u * 0.036, title: u * 0.14, footer: u * 0.028 };
    const pad = { sub: u * 0.004, title: u * 0.006 };
    const ruleH = u * 0.03;
    const df8 = roleFont(font, 'display', 800);
    const df9 = roleFont(font, 'display', 900);
    const bf7 = roleFont(font, 'body', 700);
    const bf6 = roleFont(font, 'body', 600);
    parts = [
      part('date', W * 0.9, (mw) => {
        const txt = textEl(ctx, t('date'), {
          outline: pal.ink,
          family: df8.family,
          weight: df8.weight,
          size: size.date,
          minSize: size.date * 0.35,
          maxWidth: Math.max(1, mw - flank(size.date * 0.66) * 2),
          maxHeight: size.date * 1.32,
          maxLines: 1,
          color: pal.accent,
          align: 'center',
          squeeze: 0.74,
          upper: true,
        });
        if (!txt) return null;
        const d = txt.h * 0.5;
        return row(
          [
            deco(chevronsEl(d, pal.accent, 'right')),
            deco(sparkleEl(d * 0.7, pal.accent)),
            txt,
            deco(sparkleEl(d * 0.7, pal.accent)),
            deco(chevronsEl(d, pal.accent, 'left')),
          ],
          u * 0.012,
        );
      }),
      part('sub', W * 0.9, (mw, _a, ink) => {
        const p = plate(ink);
        const padX = u * 0.022;
        const txt = textEl(ctx, t('sub'), {
          family: bf7.family,
          weight: bf7.weight,
          size: size.sub,
          minSize: size.sub * 0.4,
          maxWidth: Math.max(1, mw - padX * 2 - flank(size.sub) * 2),
          maxHeight: size.sub * 1.32,
          maxLines: 1,
          color: p.text,
          align: 'center',
          squeeze: 0.8,
          upper: true,
        });
        const pl = plateEl(txt, p.fill, null, padX, pad.sub);
        return (
          pl &&
          row(
            [deco(chevronsEl(pl.h * 0.62, pal.accent, 'right')), pl, deco(chevronsEl(pl.h * 0.62, pal.accent, 'left'))],
            u * 0.014,
          )
        );
      }),
      part('kicker', W * 0.9, (mw, a, ink) =>
        textEl(ctx, t('kicker'), {
          family: bf7.family,
          weight: bf7.weight,
          size: size.kicker,
          minSize: size.kicker * 0.4,
          maxWidth: mw,
          maxHeight: size.kicker * 1.32,
          maxLines: 1,
          color: onDark(ink) ? pal.accent : pal.ink,
          align: a,
          squeeze: 0.82,
          upper: true,
          spacing: 0.02,
        }),
      ),
      part('rule', W * 0.9, (mw) => deco(dottedRuleEl(Math.min(mw, u * 0.72), ruleH, pal.accent))),
      part('title', W * 0.94, (mw, _a, ink) => {
        const p = plate(ink);
        const padX = u * 0.02;
        const txt = textEl(ctx, t('title'), {
          family: df9.family,
          weight: df9.weight,
          size: size.title,
          minSize: size.title * 0.3,
          maxWidth: Math.max(1, mw - padX * 2),
          maxHeight: size.title * 1.32,
          maxLines: 1,
          color: p.text,
          align: 'center',
          squeeze: 0.66,
          upper: true,
        });
        return plateEl(txt, p.fill, p.text, padX, pad.title, mw);
      }),
      part('footer', W * 0.9, (mw, a, ink) =>
        textEl(ctx, t('footer'), {
          family: bf6.family,
          weight: bf6.weight,
          size: size.footer,
          maxWidth: mw,
          maxHeight: size.footer * 1.32 * 2,
          maxLines: 2,
          color: ink,
          align: a,
          squeeze: 0.86,
          upper: true,
          spacing: 0.02,
        }),
      ),
    ];
    const heights: [SectionId, number][] = [
      ['footer', size.footer * lh('footer')],
      ['title', size.title * lh('title') + pad.title * 2],
      ['rule', ruleH],
      ['kicker', size.kicker * lh('kicker')],
      ['sub', size.sub * lh('sub') + pad.sub * 2],
      ['date', size.date * lh('date')],
    ];
    const widths: Partial<Record<SectionId, number>> = { title: 0.94 };
    customStart = {};
    let bottom = H * 0.975;
    for (const [id, h] of heights) {
      if (doc.hidden?.includes(id) || (id !== 'rule' && !t(id as FieldId))) continue;
      customStart[id] = { x: 0.5, y: (bottom - h / 2) / H, w: widths[id] ?? 0.9, size: 1, align: 'center' };
      bottom -= h + u * 0.014;
    }
    arrange = (els) => stack(els, u * 0.012, 'center');
  } else if (tpl.id === 'gig') {
    const line = (
      id: FieldId,
      o: Omit<TextOpts, 'family' | 'maxWidth' | 'align' | 'color'> & { role?: 'display' | 'body' },
      color?: string,
    ) =>
      part(id, W * 0.9, (mw, a, ink) => {
        const { role = id === 'title' ? 'display' : 'body', weight, italic, ...rest } = o;
        const rf = roleFont(font, role, weight, italic);
        return textEl(ctx, t(id), {
          family: rf.family,
          weight: rf.weight,
          italic: rf.italic,
          maxWidth: mw,
          align: a,
          color: color ?? ink,
          ...rest,
        });
      });
    const titleSize = u * 0.17,
      subSize = u * 0.07,
      placeSize = u * 0.044,
      dateSize = u * 0.056,
      footSize = u * 0.034;
    parts = [
      line('title', {
        weight: 800,
        size: titleSize,
        minSize: u * 0.05,
        maxHeight: titleSize * 1.32,
        maxLines: 1,
        squeeze: 0.6,
        upper: true,
      }),
      line(
        'sub',
        { weight: 700, size: subSize, maxHeight: H * 0.08, maxLines: 1, spacing: 0.05, upper: true },
        pal.accent,
      ),
      line('kicker', { weight: 700, size: placeSize, maxHeight: H * 0.08, maxLines: 2, squeeze: 0.8, upper: true }),
      line('date', { weight: 500, size: dateSize, maxHeight: H * 0.07, maxLines: 1, squeeze: 0.92 }),
      line('footer', {
        weight: 600,
        size: footSize,
        maxHeight: H * 0.06,
        maxLines: 2,
        squeeze: 0.86,
        spacing: 0.03,
        upper: true,
      }),
    ];
    const m = 0.03,
      g = 0.006,
      th = (titleSize * 1.15) / H,
      sh = (subSize * 1.15) / H,
      fh = (footSize * 1.32) / H,
      dh = (dateSize * 1.32) / H,
      kh = (placeSize * 1.32) / H;
    const at = (y: number): GraphicPlace => ({ x: 0.5, y, w: 0.9, size: 1, align });
    customStart = {
      title: at(m + th / 2),
      sub: at(m + th + g + sh / 2),
      footer: at(1 - m - fh / 2),
      date: at(1 - m - fh - g - dh / 2),
      kicker: at(1 - m - fh - dh - g * 2 - kh / 2),
    };
    arrange = (els) => stack(els, u * 0.012, align);
  } else if (tpl.id === 'sale' && wide) {
    const d = Math.min(maxH, maxW * 0.34);
    const colW = maxW - d - u * 0.03;
    parts = [
      part('badge', d, (mw) => badgeEl(ctx, t('badge'), font, Math.min(d, mw), pal, guide)),
      part('title', colW, text('title', { weight: 800, size: u * 0.075, maxHeight: maxH * 0.62, maxLines: 2 }), 'left'),
      part('sub', colW, text('sub', { weight: 500, size: u * 0.038, maxHeight: maxH * 0.3, maxLines: 2 }), 'left'),
    ];
    arrange = ([badge, ...col]) => row([badge, stack(col, u * 0.01, 'left')], u * 0.03);
  } else if (tpl.id === 'sale') {
    const d = Math.min(maxW * 0.66, maxH * 0.4);
    parts = [
      part('badge', d, (mw) => badgeEl(ctx, t('badge'), font, Math.min(d, mw), pal, guide)),
      part('title', maxW, text('title', { weight: 800, size: u * 0.075, maxHeight: maxH * 0.3, maxLines: 3 })),
      part('sub', maxW, text('sub', { weight: 500, size: u * 0.038, maxHeight: maxH * 0.2, maxLines: 3 })),
    ];
    arrange = (els) => stack(els, u * 0.016, align);
  } else if (tpl.id === 'menu') {
    parts = [
      part('kicker', maxW, () => ribbonEl(ctx, t('kicker'), font, u * (wide ? 0.034 : 0.04), pal)),
      part(
        'title',
        maxW,
        text('title', {
          weight: 800,
          size: u * 0.085,
          maxHeight: maxH * (wide ? 0.42 : 0.4),
          maxLines: wide ? 1 : 3,
        }),
      ),
      part('price', maxW, () => priceEl(ctx, t('price'), font, u * (wide ? 0.042 : 0.05), pal)),
    ];
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'market-print') {
    const gap = u * 0.017;
    const priceW = wide ? maxW * 0.29 : maxW;
    const titleW = wide ? maxW - priceW - gap : maxW;
    parts = [
      part('kicker', maxW, text('kicker', { weight: 700, size: u * 0.037, maxHeight: maxH * 0.2, maxLines: 1 })),
      part('title', titleW, (mw, a) =>
        printedSignEl(ctx, t('title'), font, mw, maxH * 0.59, u * (wide ? 0.104 : 0.086), a, pal, 'name'),
      ),
      part('price', priceW, (mw) =>
        printedSignEl(ctx, t('price'), font, mw, maxH * 0.45, u * 0.081, 'center', pal, 'price'),
      ),
      part('sub', maxW, text('sub', { weight: 600, size: u * 0.037, maxHeight: maxH * 0.22, maxLines: 2 })),
    ];
    arrange = (els) => {
      const find = (id: SectionId) => els.find((el) => el?.id === id) ?? null;
      const signs = [find('title'), find('price')];
      const main = wide ? row(signs, gap) : stack(signs, gap, align);
      return stack([find('kicker'), main, find('sub')], gap, align);
    };
  } else if (tpl.id === 'bogo') {
    const gap = u * 0.024;
    const offerW = wide ? maxW * 0.56 : maxW;
    const detailW = wide ? maxW - offerW - gap : maxW;
    const detailAlign = wide ? 'left' : align;
    parts = [
      part('badge', offerW, (mw) => tagPillEl(ctx, t('badge'), font, mw, u * (wide ? 0.105 : 0.085), pal)),
      part(
        'title',
        detailW,
        text('title', { weight: 800, size: u * 0.055, maxHeight: maxH * 0.42, maxLines: 2 }),
        detailAlign,
      ),
      part('date', detailW, (mw) => outlinePillEl(ctx, t('date'), font, mw, u * 0.034, pal), detailAlign),
    ];
    arrange = ([badge, ...details]) =>
      wide ? row([badge, stack(details, gap * 0.35, 'left')], gap) : stack([badge, ...details], gap * 0.65, align);
  } else if (tpl.id === 'launch') {
    parts = [
      part('kicker', maxW, (mw) => tagPillEl(ctx, t('kicker'), font, mw, u * 0.034, pal, false)),
      part(
        'title',
        maxW,
        text('title', { weight: 900, size: u * (wide ? 0.116 : 0.09), maxHeight: maxH * 0.56, maxLines: 2 }),
      ),
      part('footer', maxW, (mw) => outlinePillEl(ctx, t('footer'), font, mw, u * 0.037, pal)),
    ];
    arrange = (els) => stack(els, u * 0.012, align);
  } else if (tpl.id === 'compare' || tpl.id === 'tiers') {
    const gap = u * 0.018;
    const count = tpl.id === 'tiers' ? 3 : 2;
    const cardW = wide ? (maxW - gap * (count - 1)) / count : maxW;
    parts = [
      part('title', maxW, text('title', { weight: 800, size: u * 0.058, maxHeight: maxH * 0.23, maxLines: 2 })),
      part('bullet1', cardW, (mw) => optionPriceEl(ctx, t('bullet1'), t('price1'), font, mw, u, pal)),
      part('bullet2', cardW, (mw) => optionPriceEl(ctx, t('bullet2'), t('price2'), font, mw, u, pal)),
    ];
    if (count === 3) {
      parts.push(
        part('bullet3', cardW, (mw) => optionPriceEl(ctx, t('bullet3'), t('price3'), font, mw, u, pal)),
        part('footer', maxW, (mw) => outlinePillEl(ctx, t('footer'), font, mw, u * 0.028, pal)),
      );
    }
    arrange = ([title, ...rest]) => {
      const cards = rest.slice(0, count);
      return stack([title, wide ? row(cards, gap) : stack(cards, gap, align), rest[count] ?? null], gap, align);
    };
  } else if (tpl.id === 'spec') {
    parts = [
      part('title', maxW, text('title', { weight: 800, size: u * 0.067, maxHeight: maxH * 0.3, maxLines: 2 })),
      part('badge', maxW, (mw) => flashHeroEl(ctx, t('badge'), font, mw, u * (wide ? 0.14 : 0.19), pal, effect, guide)),
      part('sub', maxW, (mw) => outlinePillEl(ctx, t('sub'), font, mw, u * 0.034, pal)),
    ];
    arrange = (els) => stack(els, u * 0.018, align);
  } else if (tpl.id === 'paired') {
    parts = [
      part('title', W * 0.86, text('title', { weight: 900, size: u * 0.092, maxHeight: H * 0.16, maxLines: 2 })),
      part('bullet1', W * 0.42, (mw) => tagPillEl(ctx, t('bullet1'), font, mw, u * 0.041, pal, false)),
      part('bullet2', W * 0.42, (mw) => outlinePillEl(ctx, t('bullet2'), font, mw, u * 0.041, pal)),
    ];
    customStart = {
      title: { x: 0.5, y: 0.105, w: 0.86, size: 1, align },
      bullet1: { x: 0.25, y: 0.875, w: 0.42, size: 1, align: 'center' },
      bullet2: { x: 0.75, y: 0.875, w: 0.42, size: 1, align: 'center' },
    };
    arrange = (els) => stack(els, u * 0.016, align);
  } else if (tpl.id === 'shipping') {
    const stampW = Math.min(maxW * (wide ? 0.3 : 0.67), maxH * (wide ? 0.85 : 0.46), u * 0.23);
    const gap = u * 0.024;
    const detailW = wide ? maxW - stampW - gap : maxW;
    const detailAlign = wide ? 'left' : align;
    parts = [
      part('price', stampW, (mw) => priceStampEl(ctx, t('kicker'), t('price'), font, Math.min(stampW, mw), pal)),
      part(
        'title',
        detailW,
        text('title', { weight: 800, size: u * 0.067, maxHeight: maxH * 0.46, maxLines: 2 }),
        detailAlign,
      ),
      part('footer', detailW, (mw) => bannerStripEl(ctx, t('footer'), font, mw, u * 0.084, pal), detailAlign),
    ];
    arrange = ([stamp, ...details]) =>
      wide ? row([stamp, stack(details, gap * 0.46, 'left')], gap) : stack([stamp, ...details], gap * 0.65, align);
  } else if (tpl.id === 'pack') {
    parts = [
      part('badge', W * 0.26, (mw) => bannerStripEl(ctx, t('badge'), font, mw, u * 0.136, pal)),
      part('title', W * 0.59, text('title', { weight: 900, size: u * 0.074, maxHeight: H * 0.12, maxLines: 2 })),
      part('footer', W * 0.6, (mw) => outlinePillEl(ctx, t('footer'), font, mw, u * 0.046, pal)),
    ];
    customStart = {
      badge: { x: 0.19, y: 0.102, w: 0.26, size: 1, align: 'center' },
      title: { x: 0.635, y: 0.102, w: 0.59, size: 1, align },
      footer: { x: 0.5, y: 0.903, w: 0.6, size: 1, align: 'center' },
    };
    arrange = (els) => stack(els, u * 0.016, align);
  } else if (tpl.id === 'orbit') {
    parts = [
      part('title', W * 0.86, text('title', { weight: 800, size: u * 0.088, maxHeight: H * 0.15, maxLines: 2 })),
      part('bullet1', W * 0.34, (mw) => outlinePillEl(ctx, t('bullet1'), font, mw, u * 0.039, pal)),
      part('bullet2', W * 0.34, (mw) => outlinePillEl(ctx, t('bullet2'), font, mw, u * 0.039, pal)),
      part('bullet3', W * 0.5, (mw) => tagPillEl(ctx, t('bullet3'), font, mw, u * 0.04, pal, false)),
    ];
    customStart = {
      title: { x: 0.5, y: 0.105, w: 0.86, size: 1, align },
      bullet1: { x: 0.205, y: 0.43, w: 0.34, size: 1, align: 'left' },
      bullet2: { x: 0.795, y: 0.6, w: 0.34, size: 1, align: 'right' },
      bullet3: { x: 0.5, y: 0.88, w: 0.5, size: 1, align: 'center' },
    };
    arrange = (els) => stack(els, u * 0.016, align);
  } else if (tpl.id === 'hook') {
    const df9 = roleFont(font, 'display', 900);
    parts = [
      part('title', maxW, (mw, a, ink) =>
        textEl(ctx, t('title'), {
          family: df9.family,
          weight: df9.weight,
          size: u * (wide ? 0.109 : 0.084),
          maxWidth: mw,
          maxHeight: maxH * 0.69,
          maxLines: 3,
          color: ink,
          outline: ink === '#FFFFFF' ? pal.ink : pal.paper,
          align: a,
        }),
      ),
      part('sub', maxW, text('sub', { weight: 600, size: u * 0.047, maxHeight: maxH * 0.18, maxLines: 1 })),
    ];
    arrange = (els) => stack(els, u * 0.009, align);
  } else if (tpl.id === 'gift') {
    const gap = u * 0.018;
    const badgeW = wide ? maxW * 0.43 : maxW;
    const detailW = wide ? maxW - badgeW - gap : maxW;
    const detailAlign = wide ? 'left' : align;
    parts = [
      part('badge', badgeW, (mw) => flashHeroEl(ctx, t('badge'), font, mw, u * 0.16, pal, effect, guide)),
      part(
        'title',
        detailW,
        (mw, a) => highlightTextEl(ctx, t('title'), font, mw, maxH * 0.48, u * 0.058, a, pal),
        detailAlign,
      ),
      part(
        'sub',
        detailW,
        text('sub', { weight: 600, size: u * 0.038, maxHeight: maxH * 0.26, maxLines: 2 }),
        detailAlign,
      ),
    ];
    arrange = ([badge, ...details]) =>
      wide ? row([badge, stack(details, gap * 0.45, 'left')], gap) : stack([badge, ...details], gap * 0.65, align);
  } else if (tpl.id === 'bundle' && wide) {
    const colW = maxW * 0.58;
    const priceW = maxW - colW - u * 0.03;
    parts = [
      part('badge', colW, (mw) => tagPillEl(ctx, t('badge'), font, mw, u * 0.038, pal), 'left'),
      part('title', colW, text('title', { weight: 800, size: u * 0.068, maxHeight: maxH * 0.42, maxLines: 2 }), 'left'),
      part('price', priceW, (mw, _a, ink) =>
        slashPriceEl(ctx, t('oldPrice'), t('price'), font, mw, maxH * 0.72, ink, pal),
      ),
      part('sub', colW, text('sub', { weight: 500, size: u * 0.035, maxHeight: maxH * 0.24, maxLines: 2 }), 'left'),
    ];
    arrange = ([badge, title, price, sub]) => row([stack([badge, title, sub], u * 0.01, 'left'), price], u * 0.03);
  } else if (tpl.id === 'bundle') {
    parts = [
      part('badge', maxW, (mw) => tagPillEl(ctx, t('badge'), font, mw, u * 0.04, pal)),
      part('title', maxW, text('title', { weight: 800, size: u * 0.072, maxHeight: maxH * 0.26, maxLines: 3 })),
      part('price', maxW, (mw, _a, ink) =>
        slashPriceEl(ctx, t('oldPrice'), t('price'), font, mw, maxH * 0.28, ink, pal),
      ),
      part('sub', maxW, text('sub', { weight: 500, size: u * 0.036, maxHeight: maxH * 0.18, maxLines: 3 })),
    ];
    arrange = (els) => stack(els, u * 0.016, align);
  } else if (tpl.id === 'callout') {
    const colAlign: Align = wide ? 'left' : align;
    const bSize = u * (wide ? 0.032 : 0.035);
    parts = [
      part('kicker', maxW, () => ribbonEl(ctx, t('kicker'), font, u * 0.034, pal), colAlign),
      part(
        'title',
        maxW,
        text('title', { weight: 800, size: u * (wide ? 0.064 : 0.07), maxHeight: maxH * 0.28, maxLines: 2 }),
        colAlign,
      ),
      part('bullet1', maxW, (mw, _a, ink) => bulletEl(ctx, t('bullet1'), font, mw, bSize, ink, pal), 'left'),
      part('bullet2', maxW, (mw, _a, ink) => bulletEl(ctx, t('bullet2'), font, mw, bSize, ink, pal), 'left'),
      part('bullet3', maxW, (mw, _a, ink) => bulletEl(ctx, t('bullet3'), font, mw, bSize, ink, pal), 'left'),
      part('price', maxW, (mw) => tagPillEl(ctx, t('price'), font, mw, u * 0.044, pal, false), colAlign),
    ];
    arrange = (els) => stack(els, u * 0.016, colAlign);
  } else if (tpl.id === 'marketplace') {
    const bW = W * 0.34;
    const tW = W * 0.56;
    const fW = W * 0.92;
    parts = [
      part('badge', bW, (mw) => tagPillEl(ctx, t('badge'), font, mw, u * 0.046, pal, true, 'display', guide), 'left'),
      part('title', tW, text('title', { weight: 800, size: u * 0.052, maxHeight: H * 0.12, maxLines: 2 }), 'right'),
      part('footer', fW, (mw) => bannerStripEl(ctx, t('footer'), font, mw, H * 0.085, pal, guide), 'center'),
    ];
    customStart = {
      badge: { x: 0.21, y: 0.085, w: 0.34, size: 1, align: 'left' },
      title: { x: 0.68, y: 0.085, w: 0.56, size: 1, align: 'right' },
      footer: { x: 0.5, y: 0.925, w: 0.92, size: 1, align: 'center' },
    };
    arrange = (els) => stack(els, u * 0.02, 'center');
  } else if (tpl.id === 'priceburst' && wide) {
    const d = Math.min(maxH, maxW * 0.32);
    const colW = maxW - d - u * 0.03;
    parts = [
      part('kicker', colW, () => ribbonEl(ctx, t('kicker'), font, u * 0.03, pal), 'left'),
      part('title', colW, text('title', { weight: 800, size: u * 0.068, maxHeight: maxH * 0.44, maxLines: 2 }), 'left'),
      part('price', d, (mw) => priceStampEl(ctx, t('oldPrice'), t('price'), font, Math.min(d, mw), pal)),
      part('sub', colW, text('sub', { weight: 500, size: u * 0.035, maxHeight: maxH * 0.24, maxLines: 2 }), 'left'),
    ];
    arrange = ([kicker, title, price, sub]) => row([stack([kicker, title, sub], u * 0.01, 'left'), price], u * 0.03);
  } else if (tpl.id === 'priceburst') {
    const d = Math.min(maxW * 0.64, maxH * 0.38);
    parts = [
      part('kicker', maxW, () => ribbonEl(ctx, t('kicker'), font, u * 0.034, pal)),
      part('title', maxW, text('title', { weight: 800, size: u * 0.072, maxHeight: maxH * 0.24, maxLines: 3 })),
      part('price', d, (mw) => priceStampEl(ctx, t('oldPrice'), t('price'), font, Math.min(d, mw), pal)),
      part('sub', maxW, text('sub', { weight: 500, size: u * 0.036, maxHeight: maxH * 0.16, maxLines: 2 })),
    ];
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'menulist') {
    const rowSize = u * (wide ? 0.031 : 0.034);
    parts = [
      part(
        'title',
        maxW,
        text('title', { weight: 800, size: u * (wide ? 0.058 : 0.068), maxHeight: maxH * 0.2, maxLines: 1 }),
      ),
      part(
        'bullet1',
        maxW,
        (mw, _a, ink) => menuRowEl(ctx, t('bullet1'), t('price1'), font, mw, rowSize, ink, pal),
        'left',
      ),
      part(
        'bullet2',
        maxW,
        (mw, _a, ink) => menuRowEl(ctx, t('bullet2'), t('price2'), font, mw, rowSize, ink, pal),
        'left',
      ),
      part(
        'bullet3',
        maxW,
        (mw, _a, ink) => menuRowEl(ctx, t('bullet3'), t('price3'), font, mw, rowSize, ink, pal),
        'left',
      ),
      part('footer', maxW, (mw) => outlinePillEl(ctx, t('footer'), font, mw, u * 0.026, pal)),
    ];
    arrange = (els) => stack(els, u * 0.015, wide ? 'left' : align);
  } else if (tpl.id === 'delivery') {
    parts = [
      part('badge', maxW, (mw) => tagPillEl(ctx, t('badge'), font, mw, u * 0.038, pal)),
      part(
        'title',
        maxW,
        text('title', { weight: 800, size: u * (wide ? 0.064 : 0.072), maxHeight: maxH * 0.28, maxLines: 2 }),
      ),
      part('sub', maxW, (mw) => chipsRowEl(ctx, t('sub'), font, mw, u * 0.026, align, pal)),
      part('footer', maxW, (mw) => outlinePillEl(ctx, t('footer'), font, mw, u * 0.026, pal)),
    ];
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'flash' && wide) {
    const heroW = maxW * 0.4;
    const colW = maxW - heroW - u * 0.03;
    parts = [
      part('kicker', colW, () => ribbonEl(ctx, t('kicker'), font, u * 0.03, pal), 'left'),
      part('badge', heroW, (mw) => flashHeroEl(ctx, t('badge'), font, mw, maxH * 0.85, pal, effect, guide)),
      part('title', colW, text('title', { weight: 800, size: u * 0.064, maxHeight: maxH * 0.42, maxLines: 2 }), 'left'),
      part('date', colW, (mw) => outlinePillEl(ctx, t('date'), font, mw, u * 0.026, pal), 'left'),
    ];
    arrange = ([kicker, badge, title, date]) => row([badge, stack([kicker, title, date], u * 0.01, 'left')], u * 0.03);
  } else if (tpl.id === 'flash') {
    parts = [
      part('kicker', maxW, () => ribbonEl(ctx, t('kicker'), font, u * 0.034, pal)),
      part('badge', maxW, (mw) => flashHeroEl(ctx, t('badge'), font, mw, maxH * 0.34, pal, effect, guide)),
      part('title', maxW, text('title', { weight: 800, size: u * 0.066, maxHeight: maxH * 0.24, maxLines: 2 })),
      part('date', maxW, (mw) => outlinePillEl(ctx, t('date'), font, mw, u * 0.028, pal)),
    ];
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'coupon') {
    parts = [
      part(
        'title',
        maxW,
        text('title', { weight: 800, size: u * (wide ? 0.056 : 0.064), maxHeight: maxH * 0.22, maxLines: 2 }),
      ),
      part('badge', maxW, (mw) =>
        couponCardEl(ctx, t('badge'), t('accent'), font, mw, maxH * (wide ? 0.46 : 0.32), pal),
      ),
      part('sub', maxW, text('sub', { weight: 500, size: u * 0.034, maxHeight: maxH * 0.18, maxLines: 2 })),
    ];
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'review') {
    parts = [
      part('kicker', maxW, (mw) => outlinePillEl(ctx, t('kicker'), font, mw, u * 0.028, pal)),
      part('title', maxW, (mw) => highlightTextEl(ctx, t('title'), font, mw, maxH * 0.48, u * 0.058, align, pal)),
      part('sub', maxW, text('sub', { weight: 600, size: u * 0.038, maxHeight: maxH * 0.24, maxLines: 2 })),
    ];
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'izakaya') {
    parts = [
      part('badge', W * 0.17, () => verticalSealEl(ctx, t('badge'), font, H * 0.28, u * 0.036, pal, guide)),
      part(
        'title',
        W * 0.72,
        text('title', { weight: 900, size: u * 0.088, maxHeight: H * 0.16, maxLines: 2 }),
        'right',
      ),
      part(
        'price',
        W * 0.36,
        (mw) => tagPillEl(ctx, t('price'), font, mw, u * 0.048, pal, false, 'display', guide),
        'right',
      ),
      part('sub', W * 0.54, text('sub', { weight: 600, size: u * 0.036, maxHeight: H * 0.1, maxLines: 2 }), 'left'),
    ];
    customStart = {
      badge: { x: 0.11, y: 0.165, w: 0.17, size: 1, align: 'center' },
      title: { x: 0.59, y: 0.125, w: 0.72, size: 1, align: 'right' },
      sub: { x: 0.31, y: 0.905, w: 0.54, size: 1, align: 'left' },
      price: { x: 0.77, y: 0.905, w: 0.36, size: 1, align: 'right' },
    };
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'steakhouse') {
    const df9 = roleFont(font, 'display', 900);
    parts = [
      part('kicker', maxW, (mw) => framedHeaderEl(ctx, t('kicker'), font, mw, u * 0.031, pal, guide)),
      part('title', maxW, (mw, a, ink) =>
        textEl(ctx, t('title'), {
          family: df9.family,
          weight: df9.weight,
          size: u * (wide ? 0.078 : 0.072),
          maxWidth: mw,
          maxHeight: maxH * 0.34,
          maxLines: 2,
          color: ink,
          outline: ink === '#FFFFFF' ? pal.ink : undefined,
          effect,
          pal,
          guide,
          align: a,
        }),
      ),
      part('price', maxW, (mw, _a, ink) =>
        slashPriceEl(ctx, t('oldPrice'), t('price'), font, mw, maxH * 0.24, ink, pal),
      ),
      part('sub', maxW, text('sub', { weight: 500, size: u * 0.035, maxHeight: maxH * 0.16, maxLines: 2 })),
    ];
    arrange = (els) => stack(els, u * 0.011, align);
  } else if (tpl.id === 'bakery' && wide) {
    const d = Math.min(maxH * 0.88, maxW * 0.28);
    const colW = maxW - d - u * 0.03;
    parts = [
      part('badge', d, (mw) => scallopSealEl(ctx, t('badge'), font, Math.min(d, mw), pal, guide)),
      part('title', colW, text('title', { weight: 700, size: u * 0.068, maxHeight: maxH * 0.44, maxLines: 2 }), 'left'),
      part('price', colW, (mw) => outlinePillEl(ctx, t('price'), font, mw, u * 0.036, pal), 'left'),
      part('sub', colW, text('sub', { weight: 500, size: u * 0.034, maxHeight: maxH * 0.22, maxLines: 2 }), 'left'),
    ];
    arrange = ([badge, title, price, sub]) =>
      row([badge, stack([title, row([price], 0), sub], u * 0.01, 'left')], u * 0.03);
  } else if (tpl.id === 'bakery') {
    const d = Math.min(maxW * 0.56, maxH * 0.34);
    parts = [
      part('badge', d, (mw) => scallopSealEl(ctx, t('badge'), font, Math.min(d, mw), pal, guide)),
      part('title', maxW, text('title', { weight: 700, size: u * 0.072, maxHeight: maxH * 0.26, maxLines: 3 })),
      part('price', maxW, (mw) => outlinePillEl(ctx, t('price'), font, mw, u * 0.038, pal)),
      part('sub', maxW, text('sub', { weight: 500, size: u * 0.035, maxHeight: maxH * 0.18, maxLines: 2 })),
    ];
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'boba' || tpl.id === 'nutrition') {
    const gap = u * 0.016;
    const d = wide ? Math.min(u * 0.165, (maxW - gap * 2) / 3) : Math.min(u * 0.145, maxW * 0.42);
    parts = [
      part('title', maxW, (mw, a, ink) =>
        tpl.id === 'boba'
          ? brushTitleEl(ctx, t('title'), font, mw, maxH * 0.34, u * 0.064, a, pal, guide)
          : text('title', { weight: 800, size: u * 0.064, maxHeight: maxH * 0.28, maxLines: 2 })(mw, a, ink),
      ),
      part('bullet1', d, (mw) => statCircleEl(ctx, t('bullet1'), font, Math.min(d, mw), pal, guide)),
      part('bullet2', d, (mw) => statCircleEl(ctx, t('bullet2'), font, Math.min(d, mw), pal, guide)),
      part('bullet3', d, (mw) => statCircleEl(ctx, t('bullet3'), font, Math.min(d, mw), pal, guide)),
      tpl.id === 'boba'
        ? part('price', maxW, (mw) => tagPillEl(ctx, t('price'), font, mw, u * 0.04, pal, false, 'display', guide))
        : part('sub', maxW, text('sub', { weight: 600, size: u * 0.036, maxHeight: maxH * 0.18, maxLines: 2 })),
    ];
    arrange = ([title, b1, b2, b3, tail]) =>
      stack(
        [title, wide ? row([b1, b2, b3], gap) : stack([row([b1, b2], gap), b3], gap * 0.7, align), tail],
        u * 0.014,
        align,
      );
  } else if (tpl.id === 'buffet') {
    parts = [
      part('kicker', maxW, (mw) => pennantEl(ctx, t('kicker'), font, mw, u * 0.038, pal, guide)),
      part('price', maxW, (mw) =>
        flashHeroEl(ctx, t('price'), font, mw, maxH * (wide ? 0.38 : 0.28), pal, effect, guide),
      ),
      part('badge', maxW, (mw) => outlinePillEl(ctx, t('badge'), font, mw, u * 0.032, pal)),
      part('footer', maxW, text('footer', { weight: 700, size: u * 0.036, maxHeight: maxH * 0.16, maxLines: 1 })),
    ];
    arrange = (els) => stack(els, u * 0.012, align);
  } else if (tpl.id === 'setmeal') {
    parts = [
      part('kicker', maxW, () => ribbonEl(ctx, t('kicker'), font, u * 0.033, pal)),
      part(
        'title',
        maxW,
        text('title', { weight: 800, size: u * (wide ? 0.064 : 0.068), maxHeight: maxH * 0.28, maxLines: 2 }),
      ),
      part('price', maxW, (mw) => comboPlaqueEl(ctx, t('oldPrice'), t('price'), font, mw, u, pal, guide)),
      part('date', maxW, (mw) => outlinePillEl(ctx, t('date'), font, mw, u * 0.028, pal)),
    ];
    arrange = (els) => stack(els, u * 0.012, align);
  } else if (tpl.id === 'grandopen') {
    parts = [
      part('kicker', maxW, (mw) => pennantEl(ctx, t('kicker'), font, mw, u * 0.036, pal, guide)),
      part(
        'title',
        maxW,
        text('title', { weight: 900, size: u * (wide ? 0.074 : 0.072), maxHeight: maxH * 0.32, maxLines: 2 }),
      ),
      part('badge', maxW, (mw) => outlinePillEl(ctx, t('badge'), font, mw, u * 0.034, pal)),
      part('footer', maxW, text('footer', { weight: 600, size: u * 0.034, maxHeight: maxH * 0.16, maxLines: 1 })),
    ];
    arrange = (els) => stack(els, u * 0.012, align);
  } else if (tpl.id === 'catering') {
    const gap = u * 0.016;
    parts = [
      part('title', maxW, (mw) => accentBarHeaderEl(ctx, t('title'), font, mw, u * (wide ? 0.052 : 0.056), pal)),
      part('bullet1', maxW * 0.48, (mw) => outlinePillEl(ctx, t('bullet1'), font, mw, u * 0.03, pal)),
      part('bullet2', maxW * 0.48, (mw) => outlinePillEl(ctx, t('bullet2'), font, mw, u * 0.03, pal)),
      part('price', maxW, (mw) => tagPillEl(ctx, t('price'), font, mw, u * 0.042, pal, false, 'display', guide)),
      part('footer', maxW, text('footer', { weight: 600, size: u * 0.033, maxHeight: maxH * 0.16, maxLines: 1 })),
    ];
    arrange = ([title, b1, b2, price, footer]) =>
      stack(
        [title, wide ? row([b1, b2, price], gap) : stack([row([b1, b2], gap), price], gap * 0.7, align), footer],
        gap * 0.75,
        align,
      );
  } else if (tpl.id === 'halal' && wide) {
    const colW = maxW * 0.62;
    const sealW = maxW - colW - u * 0.03;
    parts = [
      part('badge', sealW, (mw) => shieldSealEl(ctx, t('badge'), font, mw, u * 0.032, pal, guide)),
      part('title', colW, text('title', { weight: 800, size: u * 0.066, maxHeight: maxH * 0.42, maxLines: 2 }), 'left'),
      part('price', colW, (mw) => tagPillEl(ctx, t('price'), font, mw, u * 0.04, pal, false, 'display', guide), 'left'),
      part(
        'footer',
        colW,
        text('footer', { weight: 600, size: u * 0.032, maxHeight: maxH * 0.2, maxLines: 1 }),
        'left',
      ),
    ];
    arrange = ([badge, title, price, footer]) =>
      row([badge, stack([title, row([price], 0), footer], u * 0.01, 'left')], u * 0.03);
  } else if (tpl.id === 'halal') {
    parts = [
      part('badge', maxW, (mw) => shieldSealEl(ctx, t('badge'), font, mw * 0.72, u * 0.032, pal, guide)),
      part('title', maxW, text('title', { weight: 800, size: u * 0.07, maxHeight: maxH * 0.28, maxLines: 3 })),
      part('price', maxW, (mw) => tagPillEl(ctx, t('price'), font, mw, u * 0.042, pal, false, 'display', guide)),
      part('footer', maxW, text('footer', { weight: 600, size: u * 0.034, maxHeight: maxH * 0.18, maxLines: 2 })),
    ];
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'payday' && wide) {
    const heroW = maxW * 0.42;
    const colW = maxW - heroW - u * 0.03;
    parts = [
      part('kicker', colW, (mw) => pennantEl(ctx, t('kicker'), font, mw, u * 0.032, pal, guide), 'left'),
      part('badge', heroW, (mw) => flashHeroEl(ctx, t('badge'), font, mw, maxH * 0.84, pal, effect, guide)),
      part('title', colW, text('title', { weight: 800, size: u * 0.062, maxHeight: maxH * 0.4, maxLines: 2 }), 'left'),
      part('date', colW, (mw) => outlinePillEl(ctx, t('date'), font, mw, u * 0.028, pal), 'left'),
    ];
    arrange = ([kicker, badge, title, date]) => row([badge, stack([kicker, title, date], u * 0.01, 'left')], u * 0.03);
  } else if (tpl.id === 'payday') {
    parts = [
      part('kicker', maxW, (mw) => pennantEl(ctx, t('kicker'), font, mw, u * 0.034, pal, guide)),
      part('badge', maxW, (mw) => flashHeroEl(ctx, t('badge'), font, mw, maxH * 0.34, pal, effect, guide)),
      part('title', maxW, text('title', { weight: 800, size: u * 0.066, maxHeight: maxH * 0.24, maxLines: 2 })),
      part('date', maxW, (mw) => outlinePillEl(ctx, t('date'), font, mw, u * 0.028, pal)),
    ];
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'doublecover') {
    parts = [
      part('badge', W * 0.36, (mw) => cornerSashEl(ctx, t('badge'), font, mw, u * 0.044, pal, guide), 'left'),
      part('kicker', W * 0.42, (mw) => outlinePillEl(ctx, t('kicker'), font, mw, u * 0.034, pal), 'right'),
      part('footer', W * 0.48, (mw) => bannerStripEl(ctx, t('footer'), font, mw, H * 0.08, pal, guide), 'left'),
      part(
        'price',
        W * 0.36,
        (mw) => tagPillEl(ctx, t('price'), font, mw, u * 0.048, pal, false, 'display', guide),
        'right',
      ),
    ];
    customStart = {
      badge: { x: 0.21, y: 0.078, w: 0.36, size: 1, align: 'left' },
      kicker: { x: 0.76, y: 0.078, w: 0.42, size: 1, align: 'right' },
      footer: { x: 0.28, y: 0.922, w: 0.48, size: 1, align: 'left' },
      price: { x: 0.78, y: 0.922, w: 0.36, size: 1, align: 'right' },
    };
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'beforeafter') {
    parts = [
      part('title', W * 0.88, text('title', { weight: 900, size: u * 0.078, maxHeight: H * 0.14, maxLines: 2 })),
      part('bullet1', W * 0.36, (mw) =>
        bannerStripEl(ctx, t('bullet1'), font, mw, H * 0.068, { ...pal, accent: pal.ink, accentInk: pal.paper }, guide),
      ),
      part('bullet2', W * 0.36, (mw) => bannerStripEl(ctx, t('bullet2'), font, mw, H * 0.068, pal, guide)),
      part('sub', W * 0.88, text('sub', { weight: 600, size: u * 0.034, maxHeight: H * 0.08, maxLines: 1 })),
    ];
    customStart = {
      title: { x: 0.5, y: 0.095, w: 0.88, size: 1, align: 'center' },
      bullet1: { x: 0.24, y: 0.825, w: 0.36, size: 1, align: 'center' },
      bullet2: { x: 0.76, y: 0.825, w: 0.36, size: 1, align: 'center' },
      sub: { x: 0.5, y: 0.935, w: 0.88, size: 1, align: 'center' },
    };
    arrange = (els) => stack(els, u * 0.014, align);
  } else if (tpl.id === 'steps3') {
    const colAlign: Align = wide ? 'left' : align;
    const sSize = u * (wide ? 0.032 : 0.035);
    parts = [
      part(
        'title',
        maxW,
        text('title', { weight: 800, size: u * (wide ? 0.064 : 0.068), maxHeight: maxH * 0.24, maxLines: 2 }),
        colAlign,
      ),
      part('bullet1', maxW, (mw, _a, ink) => stepRowEl(ctx, '1', t('bullet1'), font, mw, sSize, ink, pal), 'left'),
      part('bullet2', maxW, (mw, _a, ink) => stepRowEl(ctx, '2', t('bullet2'), font, mw, sSize, ink, pal), 'left'),
      part('bullet3', maxW, (mw, _a, ink) => stepRowEl(ctx, '3', t('bullet3'), font, mw, sSize, ink, pal), 'left'),
      part('sub', maxW, text('sub', { weight: 500, size: u * 0.032, maxHeight: maxH * 0.16, maxLines: 2 }), colAlign),
    ];
    arrange = (els) => stack(els, u * 0.015, colAlign);
  } else if (tpl.id === 'specsgrid') {
    const gap = u * 0.016;
    const tileW = wide ? (maxW - gap * 2) / 3 : maxW;
    parts = [
      part('title', maxW, text('title', { weight: 800, size: u * 0.06, maxHeight: maxH * 0.24, maxLines: 2 })),
      part('bullet1', tileW, (mw) => specTileEl(ctx, t('bullet1'), font, mw, u, pal)),
      part('bullet2', tileW, (mw) => specTileEl(ctx, t('bullet2'), font, mw, u, pal)),
      part('bullet3', tileW, (mw) => specTileEl(ctx, t('bullet3'), font, mw, u, pal)),
      part('footer', maxW, (mw) => tagPillEl(ctx, t('footer'), font, mw, u * 0.036, pal, false, 'display', guide)),
    ];
    arrange = ([title, b1, b2, b3, footer]) =>
      stack([title, wide ? row([b1, b2, b3], gap) : stack([b1, b2, b3], gap * 0.7, align), footer], u * 0.014, align);
  } else if (tpl.id === 'hangtag' && wide) {
    const tagW = Math.min(maxW * 0.34, u * 0.3);
    const colW = maxW - tagW - u * 0.03;
    parts = [
      part('price', tagW, (mw) => hangTagEl(ctx, t('kicker'), t('price'), font, mw, u, pal, guide)),
      part('title', colW, text('title', { weight: 800, size: u * 0.068, maxHeight: maxH * 0.54, maxLines: 2 }), 'left'),
      part('sub', colW, text('sub', { weight: 600, size: u * 0.036, maxHeight: maxH * 0.28, maxLines: 2 }), 'left'),
    ];
    arrange = ([tag, ...col]) => row([tag, stack(col, u * 0.012, 'left')], u * 0.03);
  } else if (tpl.id === 'hangtag') {
    parts = [
      part('price', maxW, (mw) => hangTagEl(ctx, t('kicker'), t('price'), font, mw, u, pal, guide)),
      part('title', maxW, text('title', { weight: 800, size: u * 0.07, maxHeight: maxH * 0.3, maxLines: 3 })),
      part('sub', maxW, text('sub', { weight: 600, size: u * 0.036, maxHeight: maxH * 0.2, maxLines: 2 })),
    ];
    arrange = (els) => stack(els, u * 0.016, align);
  } else if (tpl.id === 'guarantee') {
    const colAlign: Align = wide ? 'left' : align;
    const bSize = u * (wide ? 0.031 : 0.034);
    parts = [
      part('badge', maxW, (mw) => shieldSealEl(ctx, t('badge'), font, mw * 0.56, u * 0.03, pal, guide), colAlign),
      part(
        'title',
        maxW,
        text('title', { weight: 800, size: u * (wide ? 0.06 : 0.064), maxHeight: maxH * 0.26, maxLines: 2 }),
        colAlign,
      ),
      part('bullet1', maxW, (mw, _a, ink) => bulletEl(ctx, t('bullet1'), font, mw, bSize, ink, pal), 'left'),
      part('bullet2', maxW, (mw, _a, ink) => bulletEl(ctx, t('bullet2'), font, mw, bSize, ink, pal), 'left'),
      part('footer', maxW, (mw) => outlinePillEl(ctx, t('footer'), font, mw, u * 0.026, pal), colAlign),
    ];
    arrange = ([badge, title, b1, b2, footer]) =>
      wide
        ? row([badge, stack([title, b1, b2, footer], u * 0.01, 'left')], u * 0.025)
        : stack([badge, title, b1, b2, footer], u * 0.014, colAlign);
  } else if (tpl.id === 'speech') {
    parts = [
      part('title', maxW, (mw) => speechBubbleEl(ctx, t('title'), font, mw, maxH * 0.44, u * 0.056, pal, guide)),
      part('sub', maxW, text('sub', { weight: 800, size: u * 0.05, maxHeight: maxH * 0.22, maxLines: 2 })),
      part('footer', maxW, (mw) => tagPillEl(ctx, t('footer'), font, mw, u * 0.034, pal, false, 'display', guide)),
    ];
    arrange = (els) => stack(els, u * 0.012, align);
  } else if (tpl.id === 'countdown') {
    parts = [
      part('badge', maxW, (mw) => tagPillEl(ctx, t('badge'), font, mw, u * 0.036, pal, true, 'display', guide)),
      part(
        'title',
        maxW,
        text('title', { weight: 800, size: u * (wide ? 0.068 : 0.072), maxHeight: maxH * 0.26, maxLines: 2 }),
      ),
      part('price', maxW, (mw) =>
        flashHeroEl(ctx, t('price'), font, mw, maxH * (wide ? 0.34 : 0.26), pal, effect, guide),
      ),
      part('date', maxW, (mw) => urgencyBarEl(ctx, t('date'), font, mw, u * 0.028, pal)),
    ];
    arrange = (els) => stack(els, u * 0.012, align);
  } else if (tpl.id === 'editorial') {
    parts = [
      part(
        'title',
        W * 0.84,
        text('title', { weight: 400, size: u * 0.088, maxHeight: H * 0.14, maxLines: 2, spacing: 0.08, upper: true }),
      ),
      part('rule', W * 0.2, (mw, _a, ink) => ruleEl(Math.min(mw, u * 0.18), u * 0.028, Math.max(1, u * 0.003), ink)),
      part(
        'sub',
        W * 0.82,
        text('sub', { weight: 400, size: u * 0.038, maxHeight: H * 0.08, maxLines: 2, spacing: 0.03 }),
      ),
      part(
        'footer',
        W * 0.72,
        text('footer', { weight: 600, size: u * 0.026, maxHeight: H * 0.06, maxLines: 1, spacing: 0.12, upper: true }),
      ),
    ];
    customStart = {
      title: { x: 0.5, y: 0.115, w: 0.84, size: 1, align: 'center' },
      rule: { x: 0.5, y: 0.185, w: 0.2, size: 1, align: 'center' },
      sub: { x: 0.5, y: 0.23, w: 0.82, size: 1, align: 'center' },
      footer: { x: 0.5, y: 0.915, w: 0.72, size: 1, align: 'center' },
    };
    arrange = (els) => stack(els, u * 0.01, 'center');
  } else {
    parts = [
      part(
        'title',
        maxW,
        text('title', { weight: 300, size: u * 0.085, maxHeight: maxH * 0.55, maxLines: 2, spacing: 0.06 }),
      ),
      part('rule', maxW, (mw, _a, ink) => ruleEl(Math.min(mw, u * 0.16), u * 0.035, Math.max(1, u * 0.003), ink)),
      part(
        'sub',
        maxW,
        text('sub', { weight: 400, size: u * 0.036, maxHeight: maxH * 0.25, maxLines: 2, spacing: 0.02 }),
      ),
    ];
    arrange = (els) => stack(els, u * 0.004, align);
  }
  return { parts, arrange, customStart, pad, maxW, maxH, pal };
}

type Laid = {
  id: SectionId;
  el: El;
  scale: number;
  bx: number; // px บนโปสเตอร์ (หลังดันกลับเข้าโปสเตอร์)
  by: number;
  bw: number;
  bh: number;
  place: GraphicPlace; // ตำแหน่งที่ตรงกับที่เห็น
  raw: { x: number; y: number }; // ก่อนดันกลับเข้าโปสเตอร์ (px)
  behind: boolean; // อยู่หลังตัวหลัก (tpl.behind)
};

// ทุกชิ้น: ตำแหน่งของชิ้นเอง (doc.items) หรือตำแหน่งในก้อนตามแบบ · inks = สีตัวอักษรต่อชิ้น (ไม่มี = สีของชุดสี)
// ตำแหน่งไม่ขึ้นกับสี: วัดก่อน ตรวจพื้นใต้แต่ละชิ้น แล้ววาดใหม่ด้วยสีจริง
function layoutGraphic(
  ctx: Ctx,
  W: number,
  H: number,
  doc: PosterDoc,
  family: FontArg,
  inks: Partial<Record<SectionId, string>> | null,
  guide = false,
): Laid[] {
  const tp = templateParts(ctx, doc, family, W, H, guide);
  const { arrange, customStart, pad, maxW, maxH, pal } = tp;
  // ชิ้นที่ลบ (ผู้ใช้ 25 พ.ย.): ไม่วาด ไม่นับเป็นที่ของข้อความ · ชิ้นที่ยังเรียงตามแบบอยู่จะเรียงใหม่ปิดช่องว่าง
  const hidden = new Set(doc.hidden ?? []);
  const parts = tp.parts.filter((p) => !hidden.has(p.id));
  const back = new Set(templateOf(doc.template).behind ?? []);
  const inkOf = (id: SectionId) => inks?.[id] ?? pal.ink;
  const keep = (v: number, size: number, max: number) =>
    size >= max ? (max - size) / 2 : Math.min(max - size, Math.max(0, v));

  // ตำแหน่งในก้อน (เหมือนก่อนแยกชิ้น): ใช้กับชิ้นที่ยังไม่มีตำแหน่งของตัวเอง
  const start: Partial<Record<SectionId, GraphicPlace>> = customStart ? { ...customStart } : {};
  if (!customStart && parts.some((p) => !doc.items[p.id])) {
    const block = arrange(parts.map((p) => p.build(p.maxW, p.align, inkOf(p.id))));
    if (block) {
      const place = doc.place;
      const scale = Math.min(1, maxW / block.w, maxH / block.h) * place.size;
      const bw = block.w * scale,
        bh = block.h * scale;
      const left = place.x * W - (place.w * W) / 2,
        inset = pad * place.size;
      const bx = keep(
        place.align === 'left'
          ? left + inset
          : place.align === 'right'
            ? left + place.w * W - inset - bw
            : place.x * W - bw / 2,
        bw,
        W,
      );
      const by = keep(place.y * H - bh / 2, bh, H);
      for (const leaf of leaves(block)) {
        const p = parts.find((x) => x.id === leaf.id)!;
        const lx = bx + leaf.x * scale,
          ly = by + leaf.y * scale,
          lw = leaf.el.w * scale;
        const w = (p.maxW * scale) / W;
        const x = p.align === 'left' ? lx / W + w / 2 : p.align === 'right' ? (lx + lw) / W - w / 2 : (lx + lw / 2) / W;
        start[leaf.id] = { x, y: (ly + (leaf.el.h * scale) / 2) / H, w, size: scale, align: p.align };
      }
    }
  }

  const out: Laid[] = [];
  for (const p of parts) {
    const place = doc.items[p.id] ?? start[p.id];
    if (!place) continue;
    const el = p.build((place.w / place.size) * W, place.align, inkOf(p.id));
    if (!el) continue;
    const scale = place.size,
      bw = el.w * scale,
      bh = el.h * scale;
    const left = place.x * W - (place.w * W) / 2;
    const rawX =
      place.align === 'left' ? left : place.align === 'right' ? left + place.w * W - bw : place.x * W - bw / 2;
    const rawY = place.y * H - bh / 2;
    const bx = keep(rawX, bw, W),
      by = keep(rawY, bh, H);
    out.push({
      id: p.id,
      el,
      scale,
      bx,
      by,
      bw,
      bh,
      place: { ...place, x: place.x + (bx - rawX) / W, y: place.y + (by - rawY) / H },
      raw: { x: rawX, y: rawY },
      behind: back.has(p.id),
    });
  }
  return out;
}

const measureCtx = () => makeCanvas(1, 1).getContext('2d')!;

// แต่ละชิ้น (สัดส่วน 0..1): bounds = ตัวชิ้น (ส่งให้ AI เว้นที่ + ตรวจพื้น) · place = ตำแหน่งที่ตรงกับที่เห็น
// · box = กรอบที่จับปรับได้ (กว้างตามกรอบตัดบรรทัด ตัดส่วนที่เลยโปสเตอร์ สูงตามตัวชิ้น) · raw = ก่อนดันกลับเข้าโปสเตอร์
// · behind = อยู่หลังตัวหลัก (ไม่ใช่ที่ว่างที่ AI ต้องเว้น ดู tpl.behind)
export type GraphicItem = { id: SectionId; place: GraphicPlace; bounds: Rect; box: Rect; raw: Rect; behind: boolean };
export function graphicItems(doc: PosterDoc, family: FontArg): GraphicItem[] {
  const { w, h } = posterSize(doc.aspect, 1000);
  return layoutGraphic(measureCtx(), w, h, doc, family, null).map((g) => {
    const bounds = { x: g.bx / w, y: g.by / h, w: g.bw / w, h: g.bh / h };
    const p = g.place;
    const l = Math.max(0, Math.min(bounds.x, p.x - p.w / 2)),
      r = Math.min(1, Math.max(bounds.x + bounds.w, p.x + p.w / 2));
    return {
      id: g.id,
      place: p,
      bounds,
      box: { x: l, y: bounds.y, w: r - l, h: bounds.h },
      raw: { ...bounds, x: g.raw.x / w, y: g.raw.y / h },
      behind: g.behind,
    };
  });
}

// ทั้งกราฟิก (ทุกชิ้นรวมกัน) · ไม่มีคำเลย = null
export function graphicBounds(doc: PosterDoc, family: FontArg): Rect | null {
  const items = graphicItems(doc, family);
  if (!items.length) return null;
  const x = Math.min(...items.map((i) => i.bounds.x)),
    y = Math.min(...items.map((i) => i.bounds.y));
  return {
    x,
    y,
    w: Math.max(...items.map((i) => i.bounds.x + i.bounds.w)) - x,
    h: Math.max(...items.map((i) => i.bounds.y + i.bounds.h)) - y,
  };
}

// ขยับชิ้นแรก: ทุกชิ้นได้ตำแหน่งของตัวเองจากที่เห็นอยู่ แล้วแยกกันตั้งแต่นั้น (แก้คำชิ้นหนึ่งไม่ดันชิ้นอื่น)
export function separateItems(doc: PosterDoc, family: FontArg): PosterDoc['items'] {
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return Object.fromEntries(
    graphicItems(doc, family).map((i) => [
      i.id,
      { ...i.place, x: r(i.place.x), y: r(i.place.y), w: r(i.place.w), size: r(i.place.size) },
    ]),
  );
}

// วาดกราฟิกทับภาพ · checks = ผลตรวจพื้นใต้แต่ละชิ้น -> สีตัวอักษร (เข้ม/ขาว) · ไม่มีพื้นรองหลังกราฟิก (ผู้ใช้ 20 พ.ย.)
// layer: 'back' = เฉพาะชิ้นหลังตัวหลัก · 'front' = ที่เหลือ · ไม่ระบุ = ทั้งหมด (แผนผังให้ AI)
export type Checks = Partial<Record<SectionId, ZoneCheck>>;
export function drawGraphic(
  ctx: Ctx,
  W: number,
  H: number,
  doc: PosterDoc,
  family: FontArg,
  checks: Checks | null,
  guide = false,
  layer?: 'back' | 'front',
) {
  if (layer === 'back' && !templateOf(doc.template).behind?.length) return;
  if (layer !== 'back' && doc.template === 'marketplace') {
    const u = Math.min(W, H);
    const inset = u * 0.018;
    const pal = paletteOf(doc.palette);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(inset, inset, W - inset * 2, H - inset * 2, u * 0.025);
    ctx.lineWidth = Math.max(2, u * 0.012);
    ctx.strokeStyle = pal.accent;
    ctx.stroke();
    ctx.restore();
  }
  if (layer !== 'back' && doc.template === 'editorial' && !guide) {
    drawCornerBrackets(ctx, W, H, paletteOf(doc.palette));
  }
  const inks = Object.fromEntries(
    Object.entries(checks ?? {}).flatMap(([id, c]) => (c?.ink === 'light' ? [[id, '#FFFFFF']] : [])),
  ) as Partial<Record<SectionId, string>>;
  for (const g of layoutGraphic(ctx, W, H, doc, family, inks, guide)) {
    if (layer && g.behind !== (layer === 'back')) continue;
    ctx.save();
    ctx.translate(g.bx, g.by);
    ctx.scale(g.scale, g.scale);
    g.el.draw(ctx, 0, 0);
    ctx.restore();
  }
}

// กรอบเลือก + ที่จับ (มุม = ขนาด, ข้าง = ความกว้าง) บนเวทีเท่านั้น · px = ขนาดที่จับเป็นพิกเซลของ canvas
// others = ชิ้นอื่นที่ไม่ได้เลือก: เส้นบางๆ ให้รู้ว่าแตะแยกได้ · sides = false: ไม่มีที่จับข้าง (ตัวหลัก: ปรับแค่ขนาด)
// corners = false: กรอบอย่างเดียว ไม่มีที่จับ (เลือกหลายชิ้นด้วยการลากกรอบ 24 พ.ย.: ย้ายพร้อมกันได้ ปรับขนาดไม่ได้)
export type Handles = { box: Rect; px: number; others: Rect[]; sides?: boolean; corners?: boolean };
function drawHandles(ctx: Ctx, W: number, H: number, { box, px, others, sides = true, corners = true }: Handles) {
  const rect = (r: Rect) => [r.x * W, r.y * H, r.w * W, r.h * H] as const;
  ctx.save();
  ctx.setLineDash([px * 0.35, px * 0.3]);
  for (const r of others) {
    ctx.lineWidth = px * 0.22;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.strokeRect(...rect(r));
    ctx.lineWidth = px * 0.1;
    ctx.strokeStyle = 'rgba(20,20,20,0.7)';
    ctx.strokeRect(...rect(r));
  }
  ctx.setLineDash([]);
  const [x, y, w, h] = rect(box);
  ctx.lineWidth = px * 0.34;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = px * 0.14;
  ctx.strokeStyle = '#141414';
  ctx.strokeRect(x, y, w, h);
  const square = (cx: number, cy: number, sw: number, sh: number) => {
    ctx.beginPath();
    ctx.roundRect(cx - sw / 2, cy - sh / 2, sw, sh, Math.min(sw, sh) / 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = px * 0.14;
    ctx.strokeStyle = '#141414';
    ctx.stroke();
  };
  if (corners)
    for (const [cx, cy] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ])
      square(cx, cy, px, px);
  if (corners && sides) for (const cx of [x, x + w]) square(cx, y + h / 2, px * 0.55, Math.min(px * 1.6, h * 0.8));
  ctx.restore();
}

// ---------- ทั้งโปสเตอร์ ----------
// preview.subjects = ตัวหลักที่ตัดแล้ว ณ ที่ที่ผู้ใช้วาง เรียงจากหลังไปหน้า (ก่อนสร้างภาพ: AI จะสร้างฉากรอบตัวหลักตรงนั้น)
// preview.handles = กรอบเลือกชิ้นที่เลือก + ที่จับ, others = ชิ้นอื่น (เวทีเท่านั้น ไม่อยู่ในไฟล์ดาวน์โหลด)
// preview.marquee = กรอบที่กำลังลากเพื่อเลือกหลายชิ้น (เวทีเท่านั้น)
// ชิ้นหลังตัวหลัก (tpl.behind, ผู้ใช้ 27 พ.ย.): วาดก่อนตัวหลักที่วางไว้ · ภาพที่สร้างแล้ว: front = คนที่ตัดจากภาพ AI (ขนาดเท่าภาพ
// โปร่งใสรอบตัว วาดแบบเดียวกับภาพ) วาดทับชิ้นเหล่านั้น · back: false = ยังไม่วาดชิ้นหลังตัว (กำลังตัดคน ไม่ให้ชื่อทับหน้าแวบหนึ่ง)
export type Placed = { image: Source; rect: Rect };
const drawPlaced = (ctx: Ctx, W: number, H: number, p: Placed) =>
  ctx.drawImage(p.image, p.rect.x * W, p.rect.y * H, p.rect.w * W, p.rect.h * H);
export function renderPoster(
  ctx: Ctx,
  W: number,
  H: number,
  doc: PosterDoc,
  backdrop: Backdrop,
  family: FontArg,
  checks: Checks | null,
  preview?: {
    subjects?: Placed[];
    handles?: Handles | null;
    marquee?: { rect: Rect; px: number } | null;
    front?: Source | null;
    back?: boolean;
  },
) {
  ctx.clearRect(0, 0, W, H);
  drawBackdrop(ctx, W, H, backdrop);
  if (preview?.back !== false) drawGraphic(ctx, W, H, doc, family, checks, false, 'back');
  for (const p of preview?.subjects ?? []) drawPlaced(ctx, W, H, p);
  if (preview?.front) drawCover(ctx, preview.front, 0, 0, W, H);
  drawGraphic(ctx, W, H, doc, family, checks, false, 'front');
  if (preview?.handles) drawHandles(ctx, W, H, preview.handles);
  if (preview?.marquee) drawMarquee(ctx, W, H, preview.marquee.rect, preview.marquee.px);
}

// กรอบลากเลือก: พื้นจางๆ + เส้นประหมึกบนขาว (เห็นได้ทั้งบนพื้นมืดและสว่าง)
function drawMarquee(ctx: Ctx, W: number, H: number, r: Rect, px: number) {
  const box = [r.x * W, r.y * H, r.w * W, r.h * H] as const;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(...box);
  ctx.lineWidth = px * 0.26;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeRect(...box);
  ctx.setLineDash([px * 0.4, px * 0.3]);
  ctx.lineWidth = px * 0.12;
  ctx.strokeStyle = '#141414';
  ctx.strokeRect(...box);
  ctx.restore();
}

// ภาพวางผังที่ส่งให้ AI (ไม่มีตัวหนังสือ): ฉาก (รูปฉากของผู้ใช้ หรือสีของการ์ดฉากเป็นพื้นชั่วคราว) + ตัวหลักที่ตัดแล้ว ณ ที่ที่ผู้ใช้วาง
// AI สร้างทั้งภาพใหม่จากผังนี้ โดยคงตำแหน่ง + ขนาดตัวหลัก (ทดสอบ 29 ต.ค.: บอกขนาดเป็นคำ/รูปไกด์ AI ไม่ทำตาม · ภาพวางผังทำตาม)
// subjects เรียงจากหลังไปหน้า (ชิ้นหลังสุดวาดทับ = อยู่หน้า เหมือนบนเวที)
export function layoutImage(aspect: string, backdrop: Backdrop, subjects: Placed[], longSide = 1024) {
  const { w, h } = posterSize(aspect, longSide);
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d')!;
  drawBackdrop(ctx, w, h, backdrop);
  for (const p of subjects) drawPlaced(ctx, w, h, p);
  return cv.toDataURL('image/jpeg', 0.9).split(',')[1];
}

// ตัวหลักที่ตัดแล้วบนพื้นขาว (รายละเอียดเต็มให้ AI · ในภาพวางผังอาจเล็ก)
export function onWhite(image: Source, maxSide = 1024) {
  const s = Math.min(1, maxSide / Math.max(image.width, image.height));
  const cv = makeCanvas(image.width * s, image.height * s);
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(image, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.92).split(',')[1];
}

// ตรวจพื้นใต้แต่ละชิ้น: วาดภาพพื้นลงรูปเล็กครั้งเดียว แล้วดูความสว่าง/ความยุ่งต่อกรอบ (ไม่เรียก AI)
export function checkAreas<K extends string>(
  backdrop: Backdrop,
  aspect: string,
  rects: Partial<Record<K, Rect>>,
  sampleWidth = 240,
): Partial<Record<K, ZoneCheck>> {
  const { w, h } = posterSize(aspect, sampleWidth);
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  drawBackdrop(ctx, cv.width, cv.height, backdrop);
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
  return Object.fromEntries(
    (Object.entries(rects) as [K, Rect][]).map(([id, r]) => [id, zoneStats(data, cv.width, cv.height, r)]),
  ) as Partial<Record<K, ZoneCheck>>;
}

// แผนผังที่ส่งให้ AI (สัดส่วนโปสเตอร์ ด้านยาว 1024) = กราฟิกข้อความจริงบนพื้นขาว (ผู้ใช้ 23 พ.ย.: ให้ AI เห็นกราฟิกแล้วจัดภาพให้เข้ากัน
// แทนกรอบสีฟ้า) · พรอมต์บอกว่าห้ามวาดตัวอักษร/พื้นขาว (lib/poster-prompts.ts) · ทดสอบ 2 ภาพ: ไม่ลอกตัวอักษรเลย
export function planImage(doc: PosterDoc, family: FontArg, longSide = 1024) {
  const { w, h } = posterSize(doc.aspect, longSide);
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d')!;
  drawBackdrop(ctx, w, h, { gradient: ['#FFFFFF', '#FFFFFF'] });
  // guide: ตัวหนังสือที่เดิม ไม่มีแผ่นป้าย/ของตกแต่งของกราฟิกดนตรี (AI ลอกรูปทรงที่เห็น 25 พ.ย.) · ที่เว้นให้ข้อความยังเท่าเดิม
  drawGraphic(ctx, w, h, doc, family, null, true);
  return cv.toDataURL('image/png').split(',')[1];
}
