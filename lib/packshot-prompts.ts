// packshot-prompts.ts — คำสั่งที่ส่งให้ AI สร้างรูปสินค้า (หน้าสินค้า, app/api/packshot) ใช้ฝั่ง server เท่านั้น
// รูปที่ส่งเรียงเป็น: 1 สินค้า, (ช็อตต้นแบบ), (รูปฉาก), (รูปพร็อพของฉัน) — ชุดภาพมุมที่ 2 เป็นต้นไป: 1 รูปแรกของชุด, 2 สินค้า
// ลำดับรูปต้องตรงกับ "Image n" ในคำสั่ง เปลี่ยนอย่างหนึ่งต้องเปลี่ยนอีกอย่าง (route ทำรายการ inputs ตามลำดับนี้)
// เขียนเป็นภาษาอังกฤษเพราะโมเดลเจนรูปเข้าใจแม่นกว่า
import 'server-only';
import type { RefMode } from './packshot';

// สินค้าต้องเหมือนรูปสินค้าทุกรายละเอียด: AI ชอบวาดของ "คล้ายๆ" ใหม่ (บทเรียนเดียวกับ ACCESSORY_RULES ของหน้านางแบบ)
// รูปตัวอย่างโชว์รายละเอียดชัด: ผิวหนังเม็ด/เรียบ ฝีเข็มสีตัด สีขอบหนัง อะไหล่ทอง โลโก้ปั๊มนูน ตัวอักษรปั๊มทองเล็กๆ
const fidelity = (n: number) => `Image ${n} is the product photo. Reproduce this exact product, not a similar one: the same silhouette and `
  + 'proportions, the same color, the same leather grain or material texture (pebbled or smooth exactly as in the photo), the same stitching '
  + 'color and spacing, edge paint, hardware shape and finish, and any embossed, printed or foil logo or lettering in the same place and size. '
  + 'Keep exactly the handles, straps, pockets and hardware it has, no more and no fewer, and do not add, remove or redesign any logo or text. '
  + `Use only the product itself from Image ${n}: ignore its background, surface, lighting, hands, mannequin and packaging.`
  // รูปสินค้าส่วนใหญ่ถ่ายหน้าตรงพื้นขาว: ไม่บอก = AI ยึดมุมนั้นแล้ววางรูปแบนๆ บนฉาก ไม่ว่าเลือกมุมไหน (ผู้ใช้ทดสอบ 26 ต.ค.)
  + ` Image ${n} shows the product from one viewpoint only: use it for the product's design and details, never for the camera angle. `
  + 'Treat the product as a real three-dimensional object, turn it on the set and photograph it fresh from the camera position described here, '
  + 'showing its real depth (side panels, base, thickness and the far side of any handle or strap in perspective). '
  + `Never paste or copy the flat view of Image ${n}.`;

// ให้ดูเป็นรูปถ่ายจริง (แบบ REALISM ของหน้านางแบบ แต่เป็นเรื่องของวางบนฉาก): น้ำหนัก เงาสัมผัสพื้น ผิวฉากจริง สีหม่น
export const PRODUCT_REALISM =
  'It must look like an unretouched photo by a professional still-life photographer with a real camera, not a CGI render or an AI image. '
  + 'The product rests on the surface with real weight, and a long shoulder strap is never left hanging in the air. '
  + 'A soft contact shadow sits where it touches the surface, and every shadow matches the light of the set in direction and softness. '
  + 'Surfaces have real texture: paper fibers, wood grain, plaster, concrete or fabric weave. Leather shows its real grain and a gentle, '
  + 'natural sheen, not plastic gloss. Everything keeps its true real-world size next to the product. '
  + 'Not oversaturated, not over-sharpened, no glow, no invented reflections, nothing floating.';

export type PackshotInput = {
  detail?: boolean;
  scale?: string | null;
  what: string; // ประเภทสินค้า (PRODUCT_TYPES prompt)
  place: string; // วางยังไง: stand หรือ flat ของประเภทนั้น
  flat: boolean; // มองตรงลงมา (แฟลตเลย์)
  refMode: RefMode | null; // มีช็อตต้นแบบ (รูปที่ 2) = เอาอะไรจากรูปนั้น
  hasSetImage: boolean; // มีรูปฉากที่อัปโหลด (รูปต่อจากช็อตต้นแบบ)
  hasPropImage?: boolean; // มีรูปพร็อพของฉัน (รูปต่อจากรูปฉาก)
  set: string | null; // ฉากแบบคำบรรยาย (เติมสี/ของแล้ว) null = ใช้ฉากจากรูป
  props: string | null; // พร็อพ: ที่ AI ตัววางแผนเขียน หรือ brief ของแนวพร็อพ (วางแผนไม่สำเร็จ) null = ไม่มีพร็อพ
  light: string | null; // แสงของสไตล์/ที่เลือก null = ใช้แสงจากช็อตต้นแบบ
  refLight?: string | null; // แสงในช็อตต้นแบบที่ AI อ่านมา (describeLighting)
  sceneLight?: string | null; // แสงในรูปฉากที่ AI อ่านมา
  lens: string;
  angle: string; // มุมกล้อง (PRODUCT_ANGLES prompt)
  framing: string; // ระยะ (PRODUCT_FRAMINGS prompt)
  grade: string | null; // โทนสีของสไตล์ null = ตามช็อตต้นแบบ
  crop?: string | null; // สัดส่วนสุดท้ายที่ server จะตัด (OpenAI ทำ 4:5 / 9:16 ไม่ได้) null = ไม่ตัด
  extra?: string | null;
};

// รูปต้นแบบมักแคปจาก IG: มีตัวนับ 1/2 ไอคอน ตัวอักษรทับ -> บอกให้ไม่สนใจ
const IGNORE_UI = 'Ignore any app interface, text, numbers or icons on it.';

export function buildPackshotPrompt(p: PackshotInput) {
  const ref = p.refMode; // รูปที่ 2 = ช็อตต้นแบบ (ถ้ามี)
  const shot = ref === 'shot';
  const setImage = p.hasSetImage && ref !== 'shot' && ref !== 'set-light' ? (ref ? 3 : 2) : null; // ฉากมาจากช็อตต้นแบบแล้ว ไม่ใช้รูปฉาก
  const propImage = p.hasPropImage && !shot && !p.scale ? 2 + (ref ? 1 : 0) + (setImage ? 1 : 0) : null;
  const out: string[] = [];
  out.push(shot
    ? `A professional still-life product photograph of ${p.what} from Image 1 for a fashion brand's Instagram feed, recreating the shot in Image 2.`
    : `A professional still-life product photograph of ${p.what} from Image 1 for a fashion brand's Instagram feed: ${p.framing}, `
      // มีพร็อพ: จัดกลุ่มสินค้า + พร็อพไว้กลางภาพ (เดิมสินค้าอยู่กลาง พร็อพเลยถูกดันไปชิดขอบจนโดนตัด)
      + (p.props && !p.scale ? 'the product and its props composed together as one balanced group in the middle of the frame.' : 'the product centered horizontally.'));
  out.push(fidelity(1));
  if (ref === 'shot') {
    out.push('Image 2 is a reference photo by another brand. Recreate its shot with our product in place of the product shown in it: the same '
      + 'set, surfaces and colors, the same props in the same places, the same camera height, angle, lens and framing, and the same light and '
      + 'color grading. The product in Image 2 is not ours: do not copy its shape, color, material, hardware or logo, only its position in the '
      + `frame, adjusted to our product's true size. ${IGNORE_UI}`);
  } else if (ref === 'set-light') {
    out.push('Image 2 is a reference photo by another brand: build the same set (surfaces, walls, colors and materials) with the same light and '
      + 'color grading, but use the camera, framing and props described here. Do not copy the product shown in Image 2, and do not copy its '
      + `props unless they are described here. ${IGNORE_UI}`);
  } else if (ref === 'light') {
    out.push('Image 2 is a reference photo by another brand: copy only its light and color grading (where the light comes from, how soft it '
      + `is, how the shadows fall, the exposure and the color). Do not copy its product, set, props or framing. ${IGNORE_UI}`);
  }
  if (!shot) out.push(p.place);
  if (setImage) {
    out.push(`Image ${setImage} is the set: place the product into this exact place, keeping its surfaces, walls, objects and colors; `
      + 'the product rests on a real surface in it at its true size. Match the surface plane, horizon, vanishing points and camera perspective of this place. '
      + 'Anchor it with a natural contact shadow and any physically appropriate reflections, matching the direction, softness and color of the scene light; never paste a flat cut-out onto the scene.');
  } else if (p.set && ref !== 'set-light' && !shot) {
    out.push(`Set: ${p.set}.` + (p.flat ? ' Seen from directly above, the surface fills the whole frame.' : ''));
  }
  if (!shot) {
    out.push(p.scale ? `Size reference: ${p.scale}. The product remains fully visible; natural holding contact is allowed. No other props.` : p.props
      ? `Props: ${p.props} Style it as one cohesive, intentional still life arranged by a professional prop stylist: the props are real objects at `
        + 'their true size, grouped close around the product at different depths and heights, every one fully inside the frame and none cut off by its edges. '
        + 'They never cover the product\'s front, logo, hardware or handle; the product stays the clear hero, larger and sharper than any prop. '
        + `${propImage ? "Apart from the user's own prop, props" : 'Props'} carry no logos, labels or readable text.`
      : 'No props: nothing in the frame except the set and the product.');
    if (propImage && p.props) {
      out.push(`Image ${propImage} is the user's own prop: include this exact object, keeping its shape, color, material, finish and any print `
        + 'exactly as shown, at its true real-world size. Use only the object itself from it: ignore its background, surface and lighting.');
    }
    out.push(`Camera: ${p.lens}, ${p.angle}.`);
  }
  if (p.light) out.push(`Lighting: ${p.light}`);
  else if (p.refLight) out.push(`Lighting, as in the reference photo: ${p.refLight}`);
  // รูปฉากที่อัปโหลด: แสงบนสินค้าต้องเป็นแสงของห้องนั้น (บทเรียน sceneLight ของหน้านางแบบ: ไม่บอก = AI ใส่เงาแรงที่ห้องจริงไม่มี)
  if (setImage && p.sceneLight) out.push(`The light in the set photo: ${p.sceneLight} Light the product with this same light so it looks photographed in that place.`);
  if (p.grade) out.push(`Color: ${p.grade}`);
  out.push(p.scale ? PRODUCT_REALISM.replace('The product rests on the surface with real weight, and a long shoulder strap is never left hanging in the air.', 'The product has real weight and is naturally supported by the hand, person or surface; straps obey gravity.') : PRODUCT_REALISM);
  if (p.crop) {
    out.push(`The photo will be cropped to ${p.crop}: keep ${p.detail ? 'the selected detail' : 'the product, its shadow and all props'} well inside the middle of the frame, `
      + 'away from the edges that will be cut.');
  }
  if (p.extra?.trim()) out.push(`Also: ${p.extra.trim().slice(0, 400)}`);
  // ย้ำมุม/ระยะเป็นบรรทัดสุดท้าย: บทเรียน camera ของหน้านางแบบ (21 ต.ค.) ไม่ย้ำ = AI ยึดกรอบภาพ/มุมของรูปที่ส่งไปแทน
  if (!shot) out.push(`Most important: ${p.angle}, with ${p.framing}.`);
  return out.join(' ');
}

// ชุดภาพสินค้า มุมที่ 2 เป็นต้นไป: รูปที่ 1 = รูปแรกของชุด (ฉาก/พร็อพ/แสงที่ต้องเหมือนเดิม), รูปที่ 2 = รูปสินค้า (รายละเอียดสินค้า)
export type PackshotSetInput = { what: string; place: string; flat: boolean; lens: string; angle: string; framing: string; crop?: string | null; extra?: string | null };

export function buildPackshotSetPrompt(p: PackshotSetInput) {
  const out = [
    `Image 1 is the first photo of a product shoot of ${p.what}. Create another photo from the same shoot, as if the photographer only moved `
      + 'the camera: the same product on the same set, with the same props in the same places, the same light and the same color grading.',
    `New camera: ${p.lens}, ${p.angle}. Framing: ${p.framing}.`,
    p.place,
    fidelity(2) + ' The product must look exactly like it does in Image 1 and Image 2.',
    PRODUCT_REALISM,
  ];
  if (p.crop) out.push(`The photo will be cropped to ${p.crop}: keep the product and its shadow well inside the middle of the frame.`);
  if (p.extra?.trim()) out.push(`Also: ${p.extra.trim().slice(0, 400)}`);
  out.push(`Most important: ${p.angle}, with ${p.framing}.`);
  return out.join(' ');
}

// ใช้แผนกำกับภาพชุดเดียว ไม่เติมฉาก/แสง/เลนส์จาก preset ซ้ำจนคำสั่งขัดกัน
export function buildCreativePackshotPrompt(p: { what: string; concept: string; crop?: string | null; extra?: string | null }) {
  return [
    `Create one creative editorial still-life product photograph of ${p.what} from Image 1.`,
    fidelity(1),
    `Selected art direction: ${p.concept}`,
    PRODUCT_REALISM,
    'Follow this art direction as one coordinated scene. Keep the product the hero and its existing label legible. Do not add ingredient, scent or benefit claims, new lettering or graphic overlays.',
    p.crop ? `The result will be cropped to ${p.crop}. Keep the product and important composition inside the safe center area.` : '',
    p.extra?.trim() ? `Additional user direction: ${p.extra.trim().slice(0, 400)}` : '',
  ].filter(Boolean).join(' ');
}
