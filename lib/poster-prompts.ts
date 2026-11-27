// poster-prompts.ts — พรอมต์ภาพโปสเตอร์ (app/api/poster) · อังกฤษตั้งใจ (โมเดลรูปทำตามอังกฤษแม่นกว่า)
// ลำดับรูป: Image 1 = ตัวหลัก (สินค้า/อาหาร/คน) · Image 2 = รูปฉากของผู้ใช้ (ถ้ามี) · รูปสุดท้าย = แผนผัง (กราฟิกข้อความจริงบนพื้นขาว, ห้ามวาด)
// ต้องตรงกับลำดับที่ route ส่ง · ตัวหลักต้องไม่เปลี่ยน = ประโยคที่ 2 (แบบ PRODUCT_FIRST หน้าสินค้า: เรื่องสำคัญอยู่บนสุด)
import 'server-only';
import { areaWords, type PosterLook, type PosterScene, type Rect } from './poster';

// padded = แผนผังถูกเติมขอบให้เป็นสัดส่วนที่ AI ทำได้ แล้วจะตัดกลับ (editCanvas): บอกว่าขอบไหนจะถูกตัด
// แบบหลัก (ผู้ใช้ 23 พ.ย.: "tell AI to be an art director ... can move but keep the detail"): AI จัดวางเอง
//   Image 1..n = ตัวหลัก (ตัดพื้นหลังแล้วบนพื้นขาว หรือทั้งรูปเมื่อไม่ตัด) · Image n+1 = รูปฉากของผู้ใช้ (ถ้ามี) · รูปสุดท้าย = แผนผังกราฟิก
// layout = วางเองเป๊ะ (ภาพวางผัง) แบบ 23 พ.ย. ช่วงแรก: หน้าเว็บไม่ใช้แล้ว (EXACT_PLACEMENT ใน Poster.tsx) แต่ route ยังรับได้
//   Image 1 = ภาพวางผัง, Image 2..n+1 = ตัวหลักทีละชิ้น ซ้ายไปขวา, Image n+2 = กราฟิก
export function buildPosterPrompt(o: {
  scene: PosterScene | null; // null = ใช้รูปฉากของผู้ใช้
  areas: Rect[]; // ที่วางข้อความ (ชิ้นที่ชิดกันรวมเป็นที่เดียว) บอกเป็นคำ
  behind?: Rect[]; // ชิ้นที่อยู่หลังตัวหลัก (ชื่อตัวยักษ์ แบบ artist 27 พ.ย.) · ไม่มี = พรอมต์เดิมทุกคำ
  padded: 'top-bottom' | 'sides' | null;
  layout?: boolean;
  extra?: string; // สั่งเพิ่มเติมของผู้ใช้ (ตัดความยาวที่ route แล้ว)
  subjects?: number; // ตัวหลักกี่ชิ้น (หลายชิ้นต้องตัดพื้นหลัง)
  original?: boolean; // layout เท่านั้น: Image 2.. = รูปเดิมของผู้ใช้ (ไม่ตัด) แทนรูปตัดบนพื้นขาว (24 พ.ย. ทดลอง)
  design?: PosterDesign | null; // ฉาก 'ai-design': คำบนกราฟิก + สีหลัก ให้ AI ออกแบบพื้นหลังเอง
  cut?: boolean; // ตัวหลักตัดพื้นหลังแล้ว (บนพื้นขาว) · false = ทั้งรูป AI เลือกตัวหลักเอง
  hint?: Rect | null; // ที่ที่ผู้ใช้วางตัวหลักคร่าวๆ บนเวที (AI ทำตามแบบหลวมๆ หรือจัดให้ดีกว่า)
  look?: PosterLook; // สไตล์ภาพ (25 พ.ย.) · ไม่มี / photo = พรอมต์เดิมทุกคำ
  lookColor?: string; // print: สีหลักของกราฟิก (#rrggbb)
}) {
  // ขาวดำวินเทจ / ภาพวาดย้อนยุค: พรอมต์ของตัวเอง (ภาพวางผัง + ไม่ตัดพื้นหลัง) · อาร์ตไดเรกเตอร์ (ไม่ใช้แล้ว) ไม่รองรับ
  const director = !o.layout && (o.cut || (o.subjects ?? 1) > 1);
  if (o.look && o.look !== 'photo' && !director) return buildLookPrompt({ ...o, look: o.look });
  if (o.layout) return buildLayoutPrompt(o);
  // ตัดพื้นหลังแล้วแต่ไม่มีภาพวางผัง = อาร์ตไดเรกเตอร์ (EXACT_PLACEMENT = false) · ทั้งรูปเดียว (ไม่ตัดพื้นหลัง) = พรอมต์เดิม
  if (o.cut || (o.subjects ?? 1) > 1) return buildDirectorPrompt(o);
  return buildWholePrompt(o);
}

// ไม่ตัดพื้นหลัง: ส่งทั้งรูป AI เลือกตัวหลักเอง (พรอมต์ตามที่ใช้ก่อน 23 พ.ย. 17:20 · ผู้ใช้เลือกเวอร์ชันนี้ "best for now")
// ลำดับรูป: Image 1 = รูปตัวหลัก · Image 2 = รูปฉากของผู้ใช้ (ถ้ามี) · รูปสุดท้าย = แผนผัง
function buildWholePrompt(o: {
  scene: PosterScene | null;
  areas: Rect[];
  behind?: Rect[];
  padded: 'top-bottom' | 'sides' | null;
  extra?: string;
  design?: PosterDesign | null;
}) {
  const isStage = o.scene?.kind === 'stage';
  const plan = o.scene ? 2 : 3;
  // ที่วางข้อความเป็นคำด้วย (ชิ้นที่ย้ายแยกกัน = หลายที่ 23 พ.ย.)
  const many = o.areas.length > 1;
  return [
    // ฉากสำเร็จรูป: 'graphic' = พื้นหลังกราฟิก, 'stage' = ฉากถ่ายสินค้า/อาหารสมจริง · รูปฉากของผู้ใช้ = ภาพจริงแบบเดิม
    o.scene
      ? isStage
        ? `Create a commercial social media photograph: the subject from Image 1 photographed in ${o.scene.prompt}.`
        : o.scene.kind === 'design'
          ? `Create a social media poster image: the subject from Image 1 as a real photograph on ${sceneText(o.scene, o.design, false)}.`
          : `Create a social media poster image: the subject from Image 1 as a real photograph on a designed graphic background: ${o.scene.prompt}.`
      : 'Create a photograph for a social media poster showing the subject from Image 1 in the place shown in Image 2.',
    'Most important: the subject stays exactly as in Image 1: the same shape, proportions, parts and their counts, colors, materials, finish, and every printed label, logo and letter; only its placement may change (where it stands in the scene, how it is turned and how it rests).',
    perfectLine('The photo in Image 1', false),
    ...(o.scene
      ? []
      : [
          // ป้ายของร้านในรูปฉากของผู้ใช้เอง = ส่วนหนึ่งของสถานที่ เก็บไว้ (ผู้ใช้ 23 พ.ย.: ป้าย "Repeat" ของร้านหายไป)
          "Image 2 is the setting: keep its surfaces, colors, materials and light, and the place's own signs and lettering exactly as they are, extend it naturally where the frame needs more of it, and use it only as the place, never copying any people from it.",
        ]),
    // ฉากไม่ล็อกพื้นวางของ (ผู้ใช้ 23 พ.ย.): AI เลือกพื้นที่เข้ากับสถานที่ + ของ · คนไม่มีโต๊ะ/เคาน์เตอร์ข้างหน้า
    // (เดิม "อาหารวางบนเคาน์เตอร์สแตนเลส" ทำให้ภาพคนสองคนมีเคาน์เตอร์ + อาหารโผล่มา)
    o.scene && !isStage ? GRAPHIC_GROUND : REAL_GROUND,
    // แผนผัง = กราฟิกข้อความจริง (ผู้ใช้ 23 พ.ย.: ให้ AI เห็นกราฟิก จัดภาพให้เข้ากัน) · ทดสอบ 2 ภาพ: ไม่ลอกตัวอักษรเลย
    `Image ${plan} is a layout plan of the final poster: it shows the poster's text graphic exactly where and how large it will be laid over the photo later${many ? ':' : ','} ${wordsFor(o.areas)}. It is a guide only: never draw any of its letters, words, numbers or colors, and never draw its white background.`,
    ...behindLine(o.behind),
    // ตัวหนังสือทับตัวหลักได้ (ผู้ใช้ 23 พ.ย. แบบโปสเตอร์ Soul After Six) · ทดสอบ: คนใหญ่เต็มเฟรม หน้าไม่โดนตัวหนังสือ (มือยังโดน)
    "The subject is the poster's hero: large and clearly visible, filling the frame like a real event or magazine poster, and it may continue behind the text, which will sit on top of it.",
    "Only less important parts of the subject may be under the text: a person's lower body, legs or clothing, or a plain side of a product or the edge of a plate; faces, heads, hair, hands and any printed label or logo stay completely clear of the text.",
    'Compose the photo around the text so the finished poster looks designed: under and around the letters keep the photo calm, with no other objects, people, props, strong patterns or bright highlights, and in tones that keep the text easy to read.',
    o.scene
      ? isStage
        ? STAGE_LIGHT
        : o.scene.kind === 'design'
          ? designLight(false, false)
          : GRAPHIC_LIGHT
      : "Light the subject to match the setting's light direction, softness and color temperature, with a real contact shadow where it rests, so it belongs in the scene.",
    // สั่งเพิ่มเติม (ผู้ใช้ 23 พ.ย.): ก่อนกฎห้ามมีตัวหนังสือ กฎนั้นจึงยังชนะ (AI เขียนภาษาไทยเพี้ยน)
    ...extraLine(o.extra),
    o.scene
      ? `No text anywhere in the image: no letters, numbers, words, logos, signs, labels, watermarks or captions; the text in Image ${plan} is added later by the designer.`
      : `No new text anywhere in the image: no added letters, numbers, words, logos, signs, labels, watermarks or captions; only the place's own signs from Image 2 stay as they are; the text in Image ${plan} is added later by the designer.`,
    // ผู้ใช้ทดสอบ 20 พ.ย.: รูปไก่ทอด (น่าจะเป็นภาพแคปจากเมนู) มีชื่อเมนูซ้อนอยู่ AI ลอกมาไว้ในภาพ เพราะเดิมยกเว้น "ตัวหนังสือบนตัวหลัก" กว้างเกินไป
    'Only text physically printed on the subject itself (a product label or packaging) stays; captions, prices, stickers or any text laid over the photo in Image 1 as graphics are not part of the subject and must not appear.',
    'The subject is photorealistic, with natural colors and a clean commercial look.',
    ...(o.padded
      ? [
          `The ${o.padded === 'sides' ? 'left and right' : 'top and bottom'} margins of the layout plan will be cropped away; simply continue the scene there.`,
        ]
      : []),
  ].join(' ');
}

// AI เป็นอาร์ตไดเรกเตอร์: เลือกที่วาง ขนาด มุมกล้องเอง ให้เข้ากับฉากและกราฟิก · ตัวหลักย้าย/หมุน/ย่อขยายได้ แต่รายละเอียดเหมือนเดิม
// (ภาพวางผังทำให้ AI ลอกตามผัง: พิซซ่าที่ถ่ายจากด้านบนตั้งเป็นล้อข้างสลัด ทั้งที่บอกให้วางราบ 23 พ.ย.)
function buildDirectorPrompt(o: {
  scene: PosterScene | null;
  areas: Rect[];
  behind?: Rect[];
  padded: 'top-bottom' | 'sides' | null;
  extra?: string;
  subjects?: number;
  cut?: boolean;
  hint?: Rect | null;
  design?: PosterDesign | null;
}) {
  const isStage = o.scene?.kind === 'stage';
  const n = Math.max(1, Math.round(o.subjects ?? 1));
  const group = n > 1;
  const cut = group || !!o.cut;
  const count = COUNT[n] ?? String(n);
  const setting = n + 1; // รูปฉากของผู้ใช้ (ถ้ามี)
  const plan = o.scene ? n + 1 : n + 2;
  const subjectsFrom = group ? `the ${count} subjects from ${imageList(1, n)}` : 'the subject from Image 1';
  const them = group ? 'the subjects' : 'the subject';
  const many = o.areas.length > 1;
  return [
    // ฉากสำเร็จรูป: 'graphic' = พื้นหลังกราฟิก, 'stage' = ฉากถ่ายสินค้า/อาหารสมจริง · รูปฉากของผู้ใช้ = ภาพจริง
    o.scene
      ? isStage
        ? `Act as an experienced art director and photographer: create a commercial social media photograph of ${subjectsFrom} photographed in ${o.scene.prompt}.`
        : o.scene.kind === 'design'
          ? `Act as an experienced art director: create a social media poster image with ${subjectsFrom} as ${group ? 'real photographs' : 'a real photograph'} on ${sceneText(o.scene, o.design, group)}.`
          : `Act as an experienced art director: create a social media poster image with ${subjectsFrom} as ${group ? 'real photographs' : 'a real photograph'} on a designed graphic background: ${o.scene.prompt}.`
      : `Act as an experienced art director and photographer: create a photograph for a social media poster showing ${subjectsFrom} in the place shown in Image ${setting}.`,
    group
      ? `Most important: every subject stays exactly as in its own photo (${imageList(1, n)}, one subject each): the same shape, proportions, parts and their counts, colors, materials, finish, and every printed label, logo and letter.`
      : 'Most important: the subject stays exactly as in Image 1: the same shape, proportions, parts and their counts, colors, materials, finish, and every printed label, logo and letter.',
    perfectLine(group ? 'The subject photos' : cut ? 'The subject photo' : 'The photo in Image 1', group),
    // อาร์ตไดเรกเตอร์จัดวางเอง: ย้าย/หมุน/เปลี่ยนมุม/ย่อขยายได้ (ของที่ถ่ายจากด้านบน = วางราบ) · คนคงท่า
    group
      ? `As the art director, arrange the ${count} subjects into one natural, well-styled shot that fits the background and the text perfectly, as a professional photographer would on set: one shared camera angle and perspective for all of them (turn or re-angle any subject photographed from another angle; a dish seen from straight above lies flat on the table, seen from the shot's angle), each at its real-life size next to the others, resting on the same surface, grouped closely and overlapping where that looks natural; every detail stays as in its photo, and people keep their pose.`
      : "As the art director, decide where the subject goes, how large it is and from which camera angle it is seen, so it fits the background and the text perfectly: it may be moved, turned, re-angled and resized (a dish photographed from straight above can lie flat on the table, seen from the shot's angle), but every detail stays as in its photo, and a person keeps their pose.",
    // ที่ที่ผู้ใช้วางบนเวที = ไอเดียคร่าวๆ
    ...(o.hint
      ? [
          `The user's rough idea for where ${them} go: ${areaWords(o.hint)}; follow it loosely where it works, or improve it.`,
        ]
      : []),
    ...(group
      ? [`Keep the ${count} subjects separate: never merge them, make them look alike, duplicate one or leave one out.`]
      : []),
    // ตัดพื้นหลังในเบราว์เซอร์อาจหยาบ (ผู้ใช้ 23 พ.ย.: ขาหายเพราะตัวหนังสือทับขา) -> ให้ต่อส่วนที่ขาดเอง · พื้นขาวไม่ใช่ของตัวหลัก
    ...(cut
      ? [
          group
            ? 'The subjects are cut out of their photos onto white, and the cut-outs may be rough: if parts of a subject are missing or cut off at the edge of its cut-out (legs, feet, hands, the bottom of a product), complete them naturally, continuing past the frame edge if needed; the white is not part of any subject.'
            : 'The subject is cut out of its photo onto white, and the cut-out may be rough: if parts of it are missing or cut off at the edge of the cut-out (legs, feet, hands, the bottom of a product), complete them naturally, continuing past the frame edge if needed; the white is not part of the subject.',
          leftoverLine(group),
        ]
      : []),
    ...(o.scene
      ? []
      : [
          // ป้ายของร้านในรูปฉากของผู้ใช้เอง = ส่วนหนึ่งของสถานที่ เก็บไว้ (ผู้ใช้ 23 พ.ย.: ป้าย "Repeat" ของร้านหายไป)
          `Image ${setting} is the setting: keep its surfaces, colors, materials and light, and the place's own signs and lettering exactly as they are, extend it naturally where the frame needs more of it, and use it only as the place, never copying any people from it.`,
        ]),
    // ฉากไม่ล็อกพื้นวางของ (ผู้ใช้ 23 พ.ย.): AI เลือกพื้นที่เข้ากับสถานที่ + ของ · คนไม่มีโต๊ะ/เคาน์เตอร์ข้างหน้า
    o.scene && !isStage ? (group ? GRAPHIC_GROUND_MANY : GRAPHIC_GROUND) : group ? REAL_GROUND_MANY : REAL_GROUND,
    // แผนผัง = กราฟิกข้อความจริง (ผู้ใช้ 23 พ.ย.: ให้ AI เห็นกราฟิก จัดภาพให้เข้ากัน) · ทดสอบ 2 ภาพ: ไม่ลอกตัวอักษรเลย
    `Image ${plan} is a layout plan of the final poster: it shows the poster's text graphic exactly where and how large it will be laid over the photo later${many ? ':' : ','} ${wordsFor(o.areas)}. It is a guide only: never draw any of its letters, words, numbers or colors, and never draw its white background.`,
    ...behindLine(o.behind),
    // ตัวหนังสือทับตัวหลักได้ (ผู้ใช้ 23 พ.ย. แบบโปสเตอร์ Soul After Six) · ทดสอบ: คนใหญ่เต็มเฟรม หน้าไม่โดนตัวหนังสือ (มือยังโดน)
    group
      ? "The subjects are the poster's hero: large and clearly visible, filling the frame like a real event or magazine poster, and they may continue behind the text, which will sit on top of them."
      : "The subject is the poster's hero: large and clearly visible, filling the frame like a real event or magazine poster, and it may continue behind the text, which will sit on top of it.",
    `Only less important parts of ${them} may be under the text: a person's lower body, legs or clothing, or a plain side of a product or the edge of a plate; faces, heads, hair, hands and any printed label or logo stay completely clear of the text.`,
    'Compose the photo around the text so the finished poster looks designed: under and around the letters keep the photo calm, with no other objects, people, props, strong patterns or bright highlights, and in tones that keep the text easy to read.',
    o.scene?.kind === 'design' ? designLight(group, cut) : lightLine(o.scene, group, cut),
    // สั่งเพิ่มเติม (ผู้ใช้ 23 พ.ย.): ก่อนกฎห้ามมีตัวหนังสือ กฎนั้นจึงยังชนะ (AI เขียนภาษาไทยเพี้ยน)
    ...extraLine(o.extra),
    o.scene
      ? `No text anywhere in the image: no letters, numbers, words, logos, signs, labels, watermarks or captions; the text in Image ${plan} is added later by the designer.`
      : `No new text anywhere in the image: no added letters, numbers, words, logos, signs, labels, watermarks or captions; only the place's own signs from Image ${setting} stay as they are; the text in Image ${plan} is added later by the designer.`,
    // ผู้ใช้ทดสอบ 20 พ.ย.: รูปไก่ทอด (น่าจะเป็นภาพแคปจากเมนู) มีชื่อเมนูซ้อนอยู่ AI ลอกมาไว้ในภาพ
    group
      ? 'Only text physically printed on the subjects themselves (a product label or packaging) stays; captions, prices, stickers or any text laid over the original photos as graphics are not part of the subjects and must not appear.'
      : 'Only text physically printed on the subject itself (a product label or packaging) stays; captions, prices, stickers or any text laid over the photo in Image 1 as graphics are not part of the subject and must not appear.',
    `${group ? 'The subjects are' : 'The subject is'} photorealistic, with natural colors and a clean commercial look.`,
    ...(o.padded
      ? [
          `The ${o.padded === 'sides' ? 'left and right' : 'top and bottom'} margins of the layout plan will be cropped away; simply continue the scene there.`,
        ]
      : []),
  ].join(' ');
}

// แสง: ฉากถ่ายสินค้า/รูปฉากจริง = แสงเข้ากับฉาก + เงาสัมผัส · พื้นหลังกราฟิก = คงแสงภาพถ่าย เงานุ่มบนงานออกแบบ
// หลายชิ้น = แสงชุดเดียวกัน (ไม่ใช่รูปหลายรูปแปะรวมกัน) · ตัดพื้นหลัง = ห้ามเห็นขอบตัด
function lightLine(scene: PosterScene | null, group: boolean, cut: boolean) {
  const edge = cut ? ', and no cut-out edge shows' : '';
  if (scene && scene.kind !== 'stage')
    return group
      ? `The background is a flat, clean illustration, not a photo of a real place; the subjects keep their photographic look, with the same light on all of them and a soft shadow on the design under each, so they look photographed together${edge}.`
      : `${GRAPHIC_LIGHT.slice(0, -1)}${edge}.`;
  const place = scene ? "the scene's" : "the setting's";
  return group
    ? `Light the subjects together to match ${place} light direction, softness and color temperature, each with a real contact shadow where it rests or stands, so they look photographed together in the scene${edge}.`
    : scene
      ? `${STAGE_LIGHT.slice(0, -1)}${edge}.`
      : `Light the subject to match the setting's light direction, softness and color temperature, with a real contact shadow where it rests, so it belongs in the scene${edge}.`;
}

// ของ/คนยืนบนอะไร: ฉากจริง/ฉากถ่ายสินค้า = พื้นที่เข้ากับสถานที่ · พื้นหลังกราฟิก = เส้น/รูปทรงพื้นของงานออกแบบ
const REAL_GROUND =
  'If the subject is a product or food, it rests on a surface that belongs in this place and suits the subject; if the subject is a person or people, they stand or sit naturally in the setting with nothing in front of them.';
const GRAPHIC_GROUND =
  'If the subject is a product or food, it stands on a simple ground shape or line that belongs to the design; if the subject is a person or people, they stand in front of the design with nothing in front of them.';
// พื้นหลังกราฟิก: ไม่ต้องจัดแสงให้เข้ากับห้องจริง · ตัวหลักคงความเป็นภาพถ่าย มีเงานุ่มบนงานออกแบบ
const GRAPHIC_LIGHT =
  'The background is a flat, clean illustration, not a photo of a real place; the subject keeps its own photographic light and colors, with a soft shadow on the design so it sits in it.';
const STAGE_LIGHT =
  "Light the subject to match the scene's light direction, softness and color temperature, with a real contact shadow where it rests, so it looks authentically photographed in the setting.";

// รูปตัวหลักไม่สมบูรณ์ (ผู้ใช้ 23 พ.ย.: "if the input image is not perfect, AI can adjust it so that it is perfect"):
// เช่น รูปเล็ก/เบลอ/แตก แสงแบน ภาพม็อกอัป ฝุ่น รอยบุบ ขอบตัดหยาบ -> ให้ออกมาเหมือนภาพถ่ายสินค้ามืออาชีพ
// แต่หน้าตาสินค้าเหมือนเดิม (ทรง สี โลโก้ ตัวอักษร) · คนหน้าและสีผิวเดิม · ต่อจากประโยค "Most important" (ไม่เรียก AI เพิ่ม)
// ผลข้างเคียงที่ต้องดู: ตัวหนังสือเล็กบนฉลาก (ภาษาไทย) อาจเพี้ยนเพราะ AI วาดใหม่มากขึ้น
const perfectLine = (photos: string, group: boolean) =>
  `${photos} may be imperfect (small, blurry, compressed, flat or uneven light, a color cast, a mockup render, dust, smudges, dents or wrinkles, rough cut-out edges): show ${group ? 'every subject' : 'the subject'} as it would look in a perfect professional photograph, sharp and clean, with real materials, natural reflections and highlights, crisp printing, and food freshly made and appetizing; ${group ? "each subject's" : 'its'} design stays exactly the same (shape, proportions, colors, and every logo and letter), and people keep their own faces and skin tone.`;

// ---------- AI ออกแบบพื้นหลังเอง (ผู้ใช้ 24 พ.ย. ทดลอง: ตัวอย่างโปสเตอร์ชานม/สมูทตี้/ชาบรรจุแก้ว) ----------
// พื้นหลังโฆษณาที่ออกแบบจาก: ตัวหลักคืออะไร (AI ดูจากรูป ไม่เรียก AI เพิ่ม) + คำบนกราฟิก (ธีม ไม่ใช่ให้เขียน) + สีหลักของกราฟิก
// ผสมรูปทรงกราฟิก (วงกลม/รัศมี/แสงฟุ้ง) กับของจริงลอย/กระเซ็น (เม็ดไข่มุก ผลไม้ น้ำแข็ง) แบบโฆษณาโซเชียลไทย
export type PosterDesign = { words: string[]; color: string };
// brief = คำบรรยายพื้นหลังที่ออกแบบ (ใช้ได้ทุกแบบคำขอ) · designLine = ประโยคของภาพวางผัง (แทนที่พื้นชั่วคราว)
function designBrief(d: PosterDesign | null, group: boolean) {
  const words = d?.words.filter((w) => w.trim()).map((w) => `"${w.trim()}"`) ?? [];
  return [
    'an eye-catching advertising background that an art director designs for this exact product and message, like a professional Thai social media ad: ',
    `base it on what ${group ? 'the subjects are' : 'the subject is'} (for a drink, its own ingredients and garnishes flying around it, such as tapioca pearls, fruit pieces, ice cubes and splashes; for food, its fresh ingredients; for any other product, elements and props that suggest what it is for)`,
    words.length
      ? `, on what the poster says (${words.join(', ')}: use the meaning only for the mood and theme, never write these words)`
      : '',
    d?.color
      ? `, and on its main color ${d.color} with one or two colors that go well with it`
      : ', and on a main color that suits the subject',
    `; mix bold graphic shapes (a big circle or burst behind ${group ? 'the subjects' : 'the subject'}, rays, soft glows, color blocks) with photographic elements, with depth and a sense of motion; decorative elements may frame ${group ? 'the subjects' : 'the subject'} and fly around ${group ? 'them' : 'it'} but never cover ${group ? 'them' : 'it'}`,
    // ทดสอบ 24 พ.ย.: พื้นเหลืองเดียวกับป้าย/แถบเหลืองของกราฟิก -> ป้ายจมหาย -> ใต้กราฟิกใช้เฉดอ่อนกว่า/เข้มกว่า
    '; where the text graphic will sit, use a clearly lighter or deeper shade than its own colored shapes (badges, bands, frames), so they still stand out',
  ].join('');
}
function designLine(d: PosterDesign | null, group: boolean) {
  return `The background in Image 1 is only a plain placeholder: replace it completely with ${designBrief(d, group)}; ${group ? 'the subjects stay real photographs' : 'the subject stays a real photograph'} on top of it.`;
}
// แสงของพื้นหลังที่ออกแบบ · ไม่ได้ตัดพื้นหลัง (ส่งทั้งรูป) = ไม่ต้องพูดถึงขอบตัด
const designLight = (group: boolean, cut: boolean) => {
  const line = group ? DESIGN_LIGHT_MANY : DESIGN_LIGHT;
  return cut ? line : line.replace(', and no cut-out edge shows', '');
};
// ฉากสำเร็จรูป = คำของฉาก · AI ออกแบบให้ = brief จากสินค้า คำ สี
const sceneText = (scene: PosterScene, d: PosterDesign | null | undefined, group: boolean) =>
  scene.kind === 'design' ? designBrief(d ?? null, group) : scene.prompt;
const DESIGN_LIGHT =
  "The background is a designed advertising scene, not a real place; the subject keeps its photographic look, lit to match the design's main light and colors, with a soft shadow so it sits in it, and no cut-out edge shows.";
const DESIGN_LIGHT_MANY =
  "The background is a designed advertising scene, not a real place; the subjects keep their photographic look, with the same light on all of them matching the design's main light and colors and a soft shadow under each, so they look photographed together, and no cut-out edge shows.";

// พื้นหลังเดิมที่ตัดไม่ออก (ผู้ใช้ 24 พ.ย.: ในห่วงหิ้วขวดน้ำยังเป็นห้องเดิม สีเข้ม+แสงส้ม AI วาดห่วงทึบตาม · ขอบล่างมีเศษข้อมือเป็นบล็อก
// + ลายน้ำ "230zg29395") -> บอกว่าไม่ใช่ตัวหลัก: รู/ห่วงต้องเห็นฉากใหม่ทะลุ เศษที่เหลือเอาออก · ต่อจากประโยค "cut-out may be rough"
const leftoverLine = (group: boolean) =>
  `The ${group ? 'cut-outs' : 'cut-out'} may also still hold bits of the original photo's background: seen through holes and loops (a bottle's carry loop, a bag or cup handle, the gap between an arm and the body) or as patches and stray fragments along the edges, plus any watermark or code stamped on the photo; none of these are part of ${group ? 'any subject' : 'the subject'}: show the new background through every hole and loop, and leave the rest out.`;

// จบด้วยจุด (ประโยคไม่ติดกับกฎถัดไป และแยกประโยคใน log ได้)
const extraLine = (extra?: string) => {
  const t = extra?.trim();
  return t ? [`Additional instruction from the user: ${t}${/[.!?]$/.test(t) ? '' : '.'}`] : [];
};

// ชิ้นหลังตัวหลัก (ผู้ใช้ 27 พ.ย. ชื่อศิลปินตัวยักษ์หลังตัวคน แบบ artist): ตัวหลักบังได้ ศีรษะด้วย · หน้าเว็บตัดคนจากภาพมาวาดทับเอง
// พื้นตรงนั้นต้องเรียบ ตัวอักษรถึงอ่านออกรอบตัวคน · ไม่มีชิ้นแบบนี้ = ไม่มีประโยคนี้
const behindLine = (behind?: Rect[]) =>
  behind?.length
    ? [
        `The big ${behind.length > 1 ? 'words' : 'word'} of the layout plan ${wordsFor(behind)} will be printed on the backdrop behind the subject: the subject stands in front of ${behind.length > 1 ? 'them' : 'it'} and may overlap ${behind.length > 1 ? 'them' : 'it'}, head and face included; keep the backdrop there plain and even, with no objects, other people, patterns or bright highlights.`,
      ]
    : [];

const wordsFor = (areas: Rect[]) =>
  areas.length > 1
    ? areas.map((a, i) => `${i === areas.length - 1 ? 'and ' : ''}${areaWords(a)}`).join(areas.length > 2 ? '; ' : ' ')
    : areaWords(areas[0]);

// ตัวหลักวางไว้แล้ว: AI สร้างฉากรอบตัวหลัก คงตำแหน่ง + ขนาดตามภาพวางผัง (ทดสอบ 29 ต.ค. หน้านางแบบ: บอกขนาดเป็นคำ/รูปไกด์
// GPT ไม่ทำตาม · ภาพวางผัง + "คงผัง" ทำตาม) · ผู้ใช้เลือกที่วางเอง จึงไม่มีกฎ "หน้าห้ามโดนตัวหนังสือ"
// subjects = จำนวนตัวหลัก (หลายรูป 23 พ.ย.): Image 2.. = ตัวหลักทีละชิ้นบนพื้นขาว เรียงซ้ายไปขวาตามภาพวางผัง · แผนผัง = รูปถัดไป
// ตัวหลักชิ้นเดียว = ประโยคเดิมทุกคำ
const COUNT = ['', 'one', 'two', 'three', 'four'];
const imageList = (from: number, to: number) => {
  const n = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return n.length > 1 ? `Images ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : `Image ${from}`;
};
const REAL_GROUND_MANY =
  'Each subject that is a product or food rests on a surface that belongs in this place and suits it; each person stands or sits naturally in the setting with nothing in front of them.';
const GRAPHIC_GROUND_MANY =
  'Each subject that is a product or food stands on a simple ground shape or line that belongs to the design; each person stands in front of the design with nothing in front of them.';

// original = Image 2.. เป็นรูปเดิมของผู้ใช้ (ไม่ตัด) แทนรูปตัดบนพื้นขาว (ไอเดียผู้ใช้ 24 พ.ย.: ส่งภาพวางผัง + รูปเดิม ให้ AI ดูจากรูปเดิม)
// รูปเดิมเห็นว่าในห่วง/ช่องคือพื้นหลัง (ขวดน้ำ: ในห่วงหิ้วเห็นชั้นวางร้าน) · ภาพวางผังบอกแค่ที่วาง + ส่วนไหนคือตัวหลัก
function buildLayoutPrompt(o: {
  scene: PosterScene | null;
  areas: Rect[];
  behind?: Rect[];
  padded: 'top-bottom' | 'sides' | null;
  extra?: string;
  subjects?: number;
  original?: boolean;
  design?: PosterDesign | null;
}) {
  const isStage = o.scene?.kind === 'stage';
  const designed = o.scene?.kind === 'design'; // AI ออกแบบพื้นหลังเอง (24 พ.ย. ทดลอง)
  const many = o.areas.length > 1;
  const n = Math.max(1, Math.round(o.subjects ?? 1));
  const group = n > 1;
  const count = COUNT[n] ?? String(n);
  const plan = n + 2; // แผนผังกราฟิกอยู่หลังตัวหลักทุกชิ้น
  const originals = imageList(2, n + 1);
  return [
    group
      ? `Create ${o.scene ? (isStage ? 'a commercial social media photograph' : 'a social media poster image') : 'a photograph for a social media poster'} from the layout in Image 1: it shows roughly where the ${count} subjects go and how much of the frame they fill together.`
      : `Create ${o.scene ? (isStage ? 'a commercial social media photograph' : 'a social media poster image') : 'a photograph for a social media poster'} from the layout in Image 1: the subject is already placed where it belongs and at the size it must have.`,
    o.original
      ? group
        ? `Most important: every subject stays exactly as in its original photo: ${originals} are the original photos the subjects of Image 1 were cut out of, one each, from left to right: the same shape, proportions, parts and their counts, colors, materials, finish, and every printed label, logo and letter.`
        : 'Most important: the subject stays exactly as in Image 2, the original photo it was cut out of: the same shape, proportions, parts and their counts, colors, materials, finish, and every printed label, logo and letter; and it keeps its position and scale from Image 1 (where its head or top is and how big it is): do not move, enlarge or shrink it.'
      : group
        ? `Most important: every subject stays exactly as in its own detail image: ${originals} show the subjects of Image 1 one by one in full detail, from left to right: the same shape, proportions, parts and their counts, colors, materials, finish, and every printed label, logo and letter.`
        : 'Most important: the subject stays exactly as in Image 2, which shows the same subject in full detail: the same shape, proportions, parts and their counts, colors, materials, finish, and every printed label, logo and letter; and it keeps its position and scale from Image 1 (where its head or top is and how big it is): do not move, enlarge or shrink it.',
    perfectLine(group ? 'The subject photos' : 'The subject photo', group),
    // มุมกล้องเดียวกันทั้งภาพ (ผู้ใช้ 23 พ.ย.: พิซซ่าถ่ายจากด้านบน วางตั้งในภาพวางผัง -> AI ทำพิซซ่าตั้งเป็นล้อข้างสลัด เพราะห้ามหมุน)
    // หลายชิ้น: ภาพวางผัง = ที่คร่าวๆ ของทั้งกลุ่ม AI จัดวางเป็นช็อตสวยเอง (ขนาดจริงเทียบกัน วางบนพื้นเดียวกัน ซ้อนกันได้) · คนคงที่/ท่าเดิม
    group
      ? "Arrange the subjects in that space into one natural, well-styled shot, as a professional photographer would on set: one shared camera angle and perspective for all of them (turn or re-angle any subject photographed from another angle; a dish seen from straight above lies flat on the table, seen from the shot's angle), each at its real-life size next to the others, resting on the same surface, grouped closely and overlapping where that looks natural; people keep the position, scale and pose shown in Image 1."
      : "If it is a product or food photographed from another angle than this shot (for example a dish seen from straight above), show it from this shot's camera angle, resting naturally in the same place and at the same size; a person keeps their pose.",
    // หลายชิ้น: ห้ามรวมเป็นชิ้นเดียว/ทำให้เหมือนกัน/หายไปชิ้นหนึ่ง
    ...(group
      ? [`Keep the ${count} subjects separate: never merge them, make them look alike, duplicate one or leave one out.`]
      : []),
    // ตัดพื้นหลังในเบราว์เซอร์อาจหยาบ (ผู้ใช้ 23 พ.ย.: ขาหายเพราะตัวหนังสือทับขา -> AI วาดครึ่งตัวตาม) -> ให้ต่อส่วนที่ขาดเอง
    ...(o.original
      ? [
          // รูปเดิม: ภาพวางผังบอกว่าส่วนไหนคือตัวหลัก · หน้าตาจริงดูจากรูปเดิม · พื้นหลัง/ของอื่น/ลายน้ำในรูปเดิมไม่เอา
          `${group ? `${originals} show` : 'Image 2 shows'} the ${group ? 'subjects' : 'subject'} in ${group ? 'their' : 'its'} original surroundings: Image 1 shows which part of ${group ? 'each photo is the subject' : 'that photo is the subject'}; use ${group ? 'the original photos' : 'Image 2'} for how ${group ? 'each subject' : 'it'} really looks, and never take ${group ? 'their' : 'its'} background, other objects, people, text or watermark.`,
          `The ${group ? 'cut-outs' : 'cut-out'} in Image 1 may be rough: where parts are missing at the edges (legs, feet, hands, the bottom of a product), complete them as ${group ? 'the original photos show' : 'Image 2 shows'} them, continuing past the frame edge if needed; where ${group ? 'a cut-out' : 'it'} still holds bits of the original background, seen through holes and loops (a bottle's carry loop, a bag or cup handle, the gap between an arm and the body) or as fragments along the edges, ${group ? 'the original photos show' : 'Image 2 shows'} they are background: show the new background through every hole and loop and leave the fragments out.`,
        ]
      : [
          group
            ? 'The cut-outs may be rough: if parts of a subject are missing or cut off at the edge of its cut-out (legs, feet, hands, the bottom of a product), complete them naturally, continuing past the frame edge if needed.'
            : 'The cut-out may be rough: if parts of the subject are missing or cut off at the edge of the cut-out (legs, feet, hands, the bottom of a product), complete them naturally, continuing past the frame edge if needed.',
          leftoverLine(group),
        ]),
    o.scene
      ? designed
        ? designLine(o.design ?? null, group)
        : isStage
          ? `The background in Image 1 is only a plain placeholder: replace it completely with ${o.scene.prompt}; integrate ${group ? 'the subjects naturally as real photographs' : 'the subject naturally as a real photograph'} in this scene.`
          : `The background in Image 1 is only a plain placeholder: replace it completely with a designed graphic background: ${o.scene.prompt}; ${group ? 'the subjects stay real photographs' : 'the subject stays a real photograph'} on top of it.`
      : `The background in Image 1 is the real place: keep its surfaces, colors, materials and light, and the place's own signs and lettering exactly as they are, extend it naturally where the frame needs more of it, and apart from ${group ? 'the subjects' : 'the subject'} leave out any other people.`,
    o.scene && !isStage ? (group ? GRAPHIC_GROUND_MANY : GRAPHIC_GROUND) : group ? REAL_GROUND_MANY : REAL_GROUND,
    `Image ${plan} is a layout plan of the final poster: it shows the poster's text graphic exactly where and how large it will be laid over the photo later${many ? ':' : ','} ${wordsFor(o.areas)}. It is a guide only: never draw any of its letters, words, numbers or colors, and never draw its white background.`,
    ...behindLine(o.behind),
    `${group ? 'The subjects' : 'The subject'} may continue behind the text, which will sit on top of it; under and around the letters keep the photo calm, with no other objects, people, props, strong patterns or bright highlights, and in tones that keep the text easy to read.`,
    // หลายชิ้น = แสงชุดเดียวกัน (ไม่ใช่รูปหลายรูปแปะรวมกัน)
    group
      ? o.scene
        ? designed
          ? DESIGN_LIGHT_MANY
          : isStage
            ? "Relight the subjects together to match the scene's light direction, softness and color temperature, each with a real contact shadow where it rests or stands, so they look photographed together in the scene and no cut-out edge shows."
            : 'The background is a flat, clean illustration, not a photo of a real place; the subjects keep their photographic look, with the same light on all of them and a soft shadow on the design under each, so they look photographed together, and no cut-out edge shows.'
        : "Relight the subjects together to match the setting's light direction, softness and color temperature, each with a real contact shadow where it rests or stands, so they look photographed together in the scene and no cut-out edge shows."
      : o.scene
        ? designed
          ? DESIGN_LIGHT
          : isStage
            ? "Relight the subject to match the scene's light direction, softness and color temperature, with a real contact shadow where it rests or stands, so it belongs naturally in the scene and no cut-out edge shows."
            : `${GRAPHIC_LIGHT.slice(0, -1)}, and no cut-out edge shows.`
        : "Relight the subject to match the setting's light direction, softness and color temperature, with a real contact shadow where it rests or stands, so it belongs in the scene and no cut-out edge shows.",
    ...extraLine(o.extra),
    o.scene
      ? `No text anywhere in the image: no letters, numbers, words, logos, signs, labels, watermarks or captions; the text in Image ${plan} is added later by the designer.`
      : `No new text anywhere in the image: no added letters, numbers, words, logos, signs, labels, watermarks or captions; only the place's own signs in Image 1 stay as they are; the text in Image ${plan} is added later by the designer.`,
    group
      ? 'Only text physically printed on the subjects themselves (a product label or packaging) stays; captions, prices, stickers or any text that was laid over the original photos as graphics are not part of the subjects and must not appear.'
      : 'Only text physically printed on the subject itself (a product label or packaging) stays; captions, prices, stickers or any text that was laid over the original photo as graphics are not part of the subject and must not appear.',
    `${group ? 'The subjects are' : 'The subject is'} photorealistic, with natural colors and a clean commercial look.`,
    ...(o.padded
      ? [
          `The ${o.padded === 'sides' ? 'left and right' : 'top and bottom'} margins of Image 1 and Image ${plan} will be cropped away; simply continue the scene there.`,
        ]
      : []),
  ].join(' ');
}

// ---------- สไตล์ภาพ: ขาวดำวินเทจ / ภาพวาดย้อนยุค (ผู้ใช้ 25 พ.ย. จากโปสเตอร์ตัวอย่าง Nina Simone / Atlanta Jazz) ----------
// ทดสอบด้วยสคริปต์ก่อนสร้าง (25 พ.ย. งาน Soul 4:5 ของผู้ใช้, ภาพละ ~6,200 โทเคน): ทั้งสองแบบคนยังจำได้ แต่งตัว/ท่าเดิม
// ขาวดำ = ภาพถ่ายจริงยุค 60 (คลับแจ๊สเมื่อเป็นงานดนตรี) · ภาพวาด = วาดตัวหลักใหม่แบบงานสกรีน สีหลักของกราฟิก + ดำ + ครีม
// ภาพวางผัง: Image 1 = ภาพวางผัง, Image 2.. = รูปเดิม/รูปตัดทีละชิ้น, ถัดไป = แผนผังกราฟิก (ลำดับเดียวกับ buildLayoutPrompt)
// ไม่ตัดพื้นหลัง: Image 1 = รูปตัวหลัก, Image 2 = รูปฉากของผู้ใช้ (ถ้ามี), ถัดไป = แผนผัง (ลำดับเดียวกับ buildWholePrompt)
const LOOK_KEEP =
  'the same people with the same faces and facial features, expressions, hairstyles, facial hair, glasses or sunglasses, hats, clothing and its patterns, accessories and pose (or, for a product or food, the same shape, proportions, parts and every printed label, logo and letter)';
function buildLookPrompt(o: {
  look: Exclude<PosterLook, 'photo'>;
  lookColor?: string;
  scene: PosterScene | null;
  areas: Rect[];
  behind?: Rect[];
  padded: 'top-bottom' | 'sides' | null;
  layout?: boolean;
  extra?: string;
  subjects?: number;
  original?: boolean;
  design?: PosterDesign | null;
}) {
  const bw = o.look === 'bw';
  const layout = !!o.layout;
  const n = layout ? Math.max(1, Math.round(o.subjects ?? 1)) : 1;
  const group = n > 1;
  const count = COUNT[n] ?? String(n);
  const it = group ? 'the subjects' : 'the subject';
  const It = group ? 'The subjects' : 'The subject';
  const color = o.lookColor ?? '#E8823A';
  const plan = layout ? n + 2 : o.scene ? 2 : 3;
  const originals = imageList(2, n + 1);
  // ตัวหลักดูจากรูปไหน
  const ref = layout
    ? group
      ? `its own ${o.original ? 'original photo' : 'detail image'} (${originals}, one each, from left to right)`
      : `Image 2, ${o.original ? 'the original photo it was cut out of' : 'which shows the same subject in full detail'}`
    : 'Image 1';
  const keepPlace = layout
    ? group
      ? ''
      : '; and it keeps its position and scale from Image 1 (where its head or top is and how big it is): do not move, enlarge or shrink it'
    : '; only its placement may change';
  const words = o.design?.words.length ? `"${o.design.words.join(' / ')}"` : null;
  const meaning = words ? ` (${words}: use the meaning only for the mood and theme, never write these words)` : '';
  const placeholder = layout
    ? 'The background in Image 1 is only a plain placeholder: replace it completely with'
    : 'The setting is';
  const backdrop = !o.scene
    ? layout
      ? `The background in Image 1 is the real place: keep its layout, surfaces, furniture and the place's own signs and lettering, extend it naturally where the frame needs more of it, and apart from ${it} leave out any other people; ${bw ? 'it becomes part of the same black-and-white photograph' : 'redraw it in the same print style'}.`
      : `Image 2 is the setting: keep its layout, surfaces, furniture and the place's own signs and lettering, extend it naturally where the frame needs more of it, never copy any people from it, and ${bw ? 'make it part of the same black-and-white photograph' : 'redraw it in the same print style'}.`
    : o.scene.kind === 'design'
      ? bw
        ? `${placeholder} a real place that suits what ${it} ${group ? 'are' : 'is'} and what the poster says${meaning}, photographed in the same black-and-white style: for live music, an intimate club stage at night with a vintage microphone on a stand beside the performers (never in front of a face), a spotlight from above, haze in the air, and an audience at small tables softly out of focus in the dark behind; for food or a product, a fitting real setting with depth.`
        : `${placeholder} a designed poster backdrop in the same print style, based on what ${it} ${group ? 'are' : 'is'} and what the poster says${meaning}: a big half-sun or circle with radiating rays behind ${it}, symbols of the theme around ${group ? 'them' : 'it'} (music notes, stars and sparkles for music; fresh ingredients or fitting objects for food and products), and leaves and geometric ornaments framing ${group ? 'them' : 'it'}, never covering a face or a label.`
      : bw
        ? `${placeholder} ${o.scene.prompt}, in black and white.`
        : `${placeholder} ${o.scene.prompt}, drawn in the same print style.`;
  return [
    layout
      ? `Create a ${bw ? 'vintage black-and-white poster image' : 'vintage screen-printed poster illustration'} from the layout in Image 1: ${group ? `it shows roughly where the ${count} subjects go and how much of the frame they fill together.` : 'the subject is already placed where it belongs and at the size it must have.'}`
      : `Create a ${bw ? 'vintage black-and-white poster image' : 'vintage screen-printed poster illustration'} showing the subject from Image 1.`,
    bw
      ? `Most important: ${group ? 'every subject stays exactly as in' : 'the subject stays exactly as in'} ${ref}: ${LOOK_KEEP}${keepPlace}. Only ${group ? 'their' : 'its'} colors change: the whole image is black and white.`
      : `Most important: ${group ? 'every subject is redrawn as an illustration but stays clearly the same as in' : 'the subject is redrawn as an illustration but stays clearly the same as in'} ${ref}: instantly recognisable, ${LOOK_KEEP}${keepPlace}.`,
    ...(bw
      ? [perfectLine(group ? 'The subject photos' : layout ? 'The subject photo' : 'The photo in Image 1', group)]
      : []),
    ...(group
      ? [
          "Arrange the subjects in that space into one natural, well-styled shot: one shared viewpoint for all of them (a dish seen from straight above lies flat on the table, seen from the shot's angle), each at its real-life size next to the others, resting on the same surface, grouped closely and overlapping where that looks natural; people keep the position, scale and pose shown in Image 1.",
          `Keep the ${count} subjects separate: never merge them, make them look alike, duplicate one or leave one out.`,
        ]
      : []),
    ...(layout
      ? o.original
        ? [
            `${group ? `${originals} show` : 'Image 2 shows'} ${it} in ${group ? 'their' : 'its'} original surroundings: Image 1 shows which part of ${group ? 'each photo is the subject' : 'that photo is the subject'}; use ${group ? 'the original photos' : 'Image 2'} for how ${group ? 'each subject' : 'it'} really looks, and never take ${group ? 'their' : 'its'} background, other objects, people, text or watermark.`,
            `The ${group ? 'cut-outs' : 'cut-out'} in Image 1 may be rough: where parts are missing at the edges (legs, feet, hands, the bottom of a product), complete them as ${group ? 'the original photos show' : 'Image 2 shows'} them, continuing past the frame edge if needed; bits of the original background seen through holes and loops or as fragments along the edges are background: leave them out.`,
          ]
        : [
            `The ${group ? 'cut-outs' : 'cut-out'} may be rough: if parts are missing or cut off at the edge (legs, feet, hands, the bottom of a product), complete them naturally, continuing past the frame edge if needed.`,
            leftoverLine(group),
          ]
      : []),
    backdrop,
    bw
      ? `The whole image is one authentic black-and-white film photograph from the late 1950s or 1960s, like a classic photo of that era: deep rich blacks, silvery highlights, soft detail in the shadows, visible fine film grain, a gentle vignette and a slightly faded paper tone; no color anywhere, ${it} included.`
      : `Illustration style for the whole poster: a retro 1970s screen-printed poster, bold flat shapes with confident ink outlines, halftone-dot shading and fine hatching, printed in a limited palette of ${color} with black and warm cream (plus darker and lighter tints of ${color}), with slightly worn paper and print texture across the whole image.`,
    bw
      ? `Light ${it} with the setting's own light (a spotlight and soft haze where that fits) so ${group ? 'they' : 'it'} truly belong${group ? '' : 's'} there, with natural shadows and no cut-out edge showing.`
      : `Shade ${it} in the same print style as the backdrop, lit by the backdrop's main light, so everything looks drawn and printed together; no photographic parts remain and no cut-out edge shows.`,
    `Image ${plan} is a layout plan of the final poster: it shows the poster's text graphic exactly where and how large it will be laid over the image later${o.areas.length > 1 ? ':' : ','} ${wordsFor(o.areas)}. It is a guide only: never draw any of its letters, words, numbers or colors, and never draw its white background.`,
    ...behindLine(o.behind),
    `${It} may continue behind the text, which will sit on top of ${group ? 'them' : 'it'}; faces, heads, hands and any printed label stay clear of the text, and under and around the letters keep the ${bw ? 'image calm, with no other objects, people, props, strong patterns or bright highlights' : 'design calm: a plain area with no ornaments, symbols, strong patterns or empty banners, boxes or frames for the text (the designer adds those)'}, in tones that keep the text easy to read.`,
    ...extraLine(o.extra),
    o.scene
      ? `No text anywhere in the image: no letters, numbers, words, logos, signs, labels, watermarks or captions; the text in Image ${plan} is added later by the designer.`
      : `No new text anywhere in the image: no added letters, numbers, words, logos, signs, labels, watermarks or captions; only the place's own signs stay; the text in Image ${plan} is added later by the designer.`,
    `Only text physically printed on ${group ? 'the subjects themselves' : 'the subject itself'} (a product label or packaging) stays; captions, prices, stickers or any text that was laid over the ${group ? 'original photos' : 'original photo'} as graphics must not appear.`,
    ...(bw ? [] : ['Symbols such as music notes and stars are not text and are welcome.']),
    ...(o.padded
      ? [
          `The ${o.padded === 'sides' ? 'left and right' : 'top and bottom'} margins of ${layout ? `Image 1 and Image ${plan}` : 'the layout plan'} will be cropped away; simply continue the scene there.`,
        ]
      : []),
  ].join(' ');
}
