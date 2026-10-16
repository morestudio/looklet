// catalog.ts — รายการให้เลือกในห้องลองชุด
// เพิ่มรูปใหม่: ใส่ไฟล์ในโฟลเดอร์ public/images แล้วเพิ่มบรรทัดตรงนี้ (หรือกด "+ เพิ่มรูป" ในหน้าเว็บ)
//
// รูปที่ได้ผลดีที่สุด:
//   นางแบบ = เต็มตัว พื้นหลังเรียบ ชุดเรียบพอดีตัว เห็นหน้าชัด
//   ชุด    = ภาพสินค้าไม่มีคนใส่ บนพื้นขาว เห็นทั้งชุด
//   ของเสริม = ภาพสินค้าชิ้นเดียว บนพื้นขาวหรือพื้นใส เห็นทั้งชิ้น ไม่มีคนใส่
//   ท่าโพสต์ = คนเดียวเต็มตัว เห็นแขนขาชัด ไม่มีตัวอักษร/ไอคอนแอปทับ (แคปจากมือถือให้ตัดขอบแอปออกก่อน)
//   ฉาก    = ฉากว่างไม่มีคน แนวตั้ง เห็นพื้นตรงที่จะให้นางแบบยืน

// รายการให้กดเลือก: src = รูป, emoji/prompt = ฉากที่ไม่มีรูป, type = ประเภทของเสริม, uploaded = เพิ่มเองในหน้าเว็บ (ลบได้)
export type Item = { name: string; src?: string; emoji?: string; prompt?: string; type?: string; uploaded?: boolean };
export type AccessoryType = { id: string; name: string; prompt: string; show: string; face?: boolean };
export type AccessoryInfo = { name: string; type: string }; // ชื่อ + ประเภท (id) ของของเสริมหนึ่งชิ้น

// รูปใน public/images — เข้ารหัสชื่อไฟล์ไทยใน URL (React ใส่ URL รูปลง HTTP header ให้ browser โหลดล่วงหน้า header รับแต่ตัวอักษรอังกฤษ)
const img = (file: string) => '/images/' + encodeURIComponent(file);

export const MODELS: Item[] = [
  { name: 'นางแบบเอเชีย', src: img('หญิงสาวเอเชียในสตูดิโอสีขาว.png') },
  { name: 'นางแบบผิวเข้ม', src: img('แฟชั่นสตูดิโอหญิงสาวผิวเข้ม.png') },
  { name: 'นางแบบผมบลอนด์', src: img('แฟชั่นสตูดิโอเรียบหรูในชุดขาวและยีนส์.png') },
  { name: 'นางแบบผมรวบ ผิวขาว', src: img('แฟชั่นสตูดิโอสไตล์มินิมอลในชุดขาวและยีนส์.png') },
  { name: 'นางแบบผมรวบ ผิวแทน', src: img('แฟชั่นสตูดิโอเสื้อครอปและยีนส์ขาสั้น.png') },
];

export const OUTFITS: Item[] = [
  { name: 'เสื้อกีฬาชมพู + กระโปรงระบาย', src: img('ชุดสปอร์ตชมพูและกระโปรงระบายลูกไม้.png') },
  { name: 'เชิ้ตครีม + กางเกงเบจ', src: img('ชุดเสื้อเชิ้ตสีครีมกับกางเกงขายาวสีเบจ.png') },
  { name: 'เสื้อแขนพองขาว + ยีนส์ขาสั้น', src: img('ชุดเสื้อแขนพองสีขาวกับกางเกงยีนส์ขาสั้น.png') },
];

// ของเสริม: เครื่องประดับ/กระเป๋า/รองเท้า ใส่เพิ่มบนชุด เลือกได้หลายชิ้น — { name, src, type: id ใน ACCESSORY_TYPES }
export const ACCESSORIES: Item[] = [];
export const MAX_ACCESSORIES = 3; // รูปที่ส่งให้ AI ยิ่งเยอะ ยิ่งแพงและ AI ยิ่งใส่ไม่ครบ/ไม่ตรง (server เช็กค่านี้ด้วย)

// ประเภทของเสริม: prompt = บอก AI ว่าคืออะไร ใส่ตรงไหน, show = ท่าที่ทำให้ของชิ้นนี้เด่น (ใช้ตอน "AI เลือกท่าให้")
// face = ใส่บนหน้า -> ไม่ใส่หน้าจริงจากรูปนางแบบ (แปะทั้งกรอบหน้า แว่น/ปีกหมวกจะหายไป)
export const ACCESSORY_TYPES: AccessoryType[] = [
  { id: 'bag', name: 'กระเป๋า', prompt: 'a bag, carried naturally on the shoulder, across the body or in the hand',
    show: 'holding the bag up in front of the body or at the hip so it is clearly visible' },
  { id: 'shoes', name: 'รองเท้า', prompt: 'a pair of shoes, worn on both feet in place of the current shoes',
    show: 'one foot stepped forward and slightly turned so the shoes are clearly visible' },
  { id: 'hat', name: 'หมวก', face: true, prompt: 'a hat, worn on the head', show: 'one hand lightly touching the brim of the hat' },
  { id: 'glasses', name: 'แว่นตา', face: true, prompt: 'glasses or sunglasses, worn on the face',
    show: 'one hand lightly touching or adjusting the frame of the glasses' },
  { id: 'earrings', name: 'ต่างหู', prompt: 'earrings, worn on both ears in place of any current earrings',
    show: 'head turned slightly with the hair tucked behind one ear so the earring is clearly visible' },
  { id: 'necklace', name: 'สร้อยคอ', prompt: 'a necklace, worn around the neck', show: 'fingers lightly touching the necklace' },
  { id: 'wrist', name: 'นาฬิกา/กำไล', prompt: 'a watch or bracelet, worn on one wrist',
    show: 'the arm with the watch or bracelet raised or resting on the hip so the wrist is clearly visible' },
  { id: 'belt', name: 'เข็มขัด', prompt: 'a belt, worn at the waist', show: 'one hand resting on the hip next to the belt' },
  { id: 'other', name: 'อื่นๆ', prompt: 'an accessory, worn or carried where it is normally used',
    show: 'holding or touching the accessory so it is clearly visible' },
];

// ท่าโพสต์: ส่งรูปให้ AI ดู (lib/prompts.ts สั่งไม่ให้เอาหน้า/ชุด/ของจากรูปนี้มา) — จะเอาอะไรจากรูปเลือกได้ที่ POSE_MODES
// ถ้าเปิดใส่หน้าจริง (REAL_FACE ใน components/TryOn.tsx): ท่าที่หันหน้าต่างจากรูปนางแบบมาก จะใส่ไม่ได้แล้วใช้หน้าจาก AI แทน
// รูปท่าแคปจาก IG ตัดแถบแอป/ตัวนับ/ไอคอนออกแล้ว — ชื่อขึ้นต้นด้วย ยืน/เดิน/พิง/นั่ง ค้นในหน้าเว็บได้
export const POSES: Item[] = [
  // ยืน
  { name: 'ยืนเฉียง มือล้วงกระเป๋า', src: '/images/poses/pose-01.jpg' },
  { name: 'ถือกระเป๋าโชว์ ก้มมอง', src: '/images/poses/pose-03.jpg' },
  { name: 'ยืนยกมือข้างหนึ่ง สะพายกระเป๋า', src: '/images/poses/pose-04.jpg' },
  { name: 'ยืนก้มหน้า มือเท้าเอว', src: '/images/poses/pose-05.jpg' },
  { name: 'ยืนหันหลัง ถือตะกร้า', src: '/images/poses/pose-06.jpg' },
  { name: 'ยืนบนโขดหิน มือบังแดด', src: '/images/poses/pose-07.jpg' },
  // เดิน
  { name: 'เดินกลางก้าว ถือกระเป๋า', src: '/images/poses/pose-02.jpg' },
  { name: 'เดินถือตะกร้า', src: '/images/poses/pose-08.jpg' },
  { name: 'ก้าวเดิน มุมต่ำ เห็นขา', src: '/images/poses/pose-09.jpg' },
  // พิง
  { name: 'พิงประตู ถือดอกไม้', src: '/images/poses/pose-10.jpg' },
  { name: 'พิงเสา ไขว้ขา ถือกระเป๋า', src: '/images/poses/pose-11.jpg' },
  { name: 'เกาะเสา เตะขาไปข้างหลัง', src: '/images/poses/pose-12.jpg' },
  { name: 'ยืนจับเท้าข้างหนึ่ง พิงผนัง', src: '/images/poses/pose-13.jpg' },
  // นั่ง (ฉากไม่มีที่นั่ง AI จะเติมที่นั่งที่เข้ากับฉากให้ — ดู lib/prompts.ts)
  { name: 'นั่งขอบหิน ไขว่ห้าง ถือกระเป๋า', src: '/images/poses/pose-14.jpg' },
  { name: 'นั่งโซฟา แขนพาดพนัก', src: '/images/poses/pose-15.jpg' },
  { name: 'นั่งบันได ขาไขว้', src: '/images/poses/pose-16.jpg' },
  { name: 'นั่งพิงผนัง มือเท้าสะโพก หันมอง', src: '/images/poses/pose-17.jpg' },
  { name: 'นั่งเก้าอี้ ยกแก้วดื่ม', src: '/images/poses/pose-18.jpg' },
  { name: 'นั่งเอนเก้าอี้ เงยหน้ารับแดด', src: '/images/poses/pose-19.jpg' },
  // อื่นๆ
  { name: 'เซลฟี่กระจก ถือแก้วกาแฟ', src: '/images/poses/pose-20.jpg' },
];

// เอาอะไรจากรูปท่าโพสต์: shot = ท่า + มุมกล้อง + ระยะ + การมอง + แสง/โทนสี (ล็อกตัวเลือกกล้องกับแสงสี), shot-scene = รวมฉากในรูปด้วย
export const POSE_MODES = [
  { id: 'pose', name: 'ลอกแค่ท่า', hint: 'เอาแค่ท่าทาง มุมกล้อง แสง และฉากใช้ตามที่เลือก' },
  { id: 'shot', name: 'ลอกทั้งช็อต', hint: 'ท่า + มุมกล้อง + ระยะ + การมอง + แสงและโทนสีตามรูปต้นแบบ ฉากใช้ตามที่เลือก' },
  { id: 'shot-scene', name: 'ลอกทั้งช็อต + ฉาก', hint: 'เหมือนลอกทั้งช็อต แต่เอาฉากในรูปต้นแบบมาด้วย ไม่ใช้ฉากที่เลือก' },
] as const;
export type PoseMode = (typeof POSE_MODES)[number]['id'];

// ---------- ตัวเลือกเพิ่มเติม (ขั้นสูง): ไม่เลือก = ไม่สั่ง ----------
// ใช้เมื่อไม่ได้ "ลอกทั้งช็อต" — prompt ส่งต่อท้ายคำสั่งให้ AI
export type Choice = { id: string; name: string; prompt: string };

export const GAZES: Choice[] = [
  { id: 'camera', name: 'มองกล้อง', prompt: 'Gaze: the model looks straight into the camera.' },
  { id: 'away', name: 'มองไปทางอื่น (ถ่ายเผลอ)', prompt: 'Gaze: a candid moment: the model looks away from the camera, off to the side, '
    + 'with a relaxed natural expression, as if not posing.' },
];

// พร็อพในมือ (เลือกได้หลายอย่าง)
export const PROPS: Choice[] = [
  { id: 'coffee', name: 'กาแฟ', prompt: 'holding an iced coffee' },
  { id: 'flowers', name: 'ดอกไม้', prompt: 'holding a small bouquet of flowers' },
  { id: 'phone', name: 'มือถือ', prompt: 'holding a smartphone' },
  { id: 'pastry', name: 'ขนม', prompt: 'holding a croissant' },
];

// สัดส่วนภาพ (ไม่เลือก = ตามรูปนางแบบ) — OpenAI ทำได้แค่ 2:3 / 3:2 / 1:1 แนวตั้งทุกแบบจะได้ 2:3
export const ASPECTS = [
  { id: '4:5', name: '4:5 (ฟีด IG)' },
  { id: '9:16', name: '9:16 (สตอรี่)' },
  { id: '2:3', name: '2:3' },
];

// ฉาก: มี src = ส่งรูปฉากให้ AI ดู, มี prompt = บอก AI เป็นคำบรรยาย (ภาษาอังกฤษ AI เข้าใจแม่นกว่า)
export const SCENES: Item[] = [
  { name: 'ถนนยุโรป', src: img('ถนนยุโรปเงียบสงบสู่โดมคลาสสิก.png') },
  { name: 'สตูดิโอพื้นขาว', emoji: '📸', prompt: 'a photo studio with an off-white seamless paper backdrop curving into the floor, light falling off slightly toward the edges, and a soft shadow on the floor under the model' },
  { name: 'ชายหาด', emoji: '🏖️', prompt: 'a sunny tropical beach with white sand and turquoise sea at golden hour' },
  { name: 'ถนนกลางคืน', emoji: '🌃', prompt: 'a stylish city street at night with neon signs and wet reflective pavement' },
  { name: 'คาเฟ่', emoji: '☕', prompt: 'a cozy minimalist cafe interior with warm natural daylight' },
  { name: 'สวนดอกไม้', emoji: '🌸', prompt: 'a blooming flower garden in spring with soft sunlight' },
  { name: 'รันเวย์', emoji: '✨', prompt: 'a high-end fashion show runway with spotlights and an audience' },
];

// ---------- ชุดถ่ายภาพ (preset): แสง + เลนส์ + มุมกล้อง + ระยะ + โทนสี ที่เข้ากันเป็นชุดเดียว ----------
// แต่ละส่วนมี label = ที่โชว์ในหน้าเว็บ, prompt = ที่ส่งให้ AI จริง (ภาษาอังกฤษ) -> หน้าเว็บโชว์ตรงกับที่ส่งเสมอ
// แยกตัวเลือกแสง/กล้อง/ระยะเองเคยขัดกัน (แสงบอกเลนส์ สไตล์ภาพบอกเลนส์อีกที) AI ต้องเลือกครึ่งๆ กลางๆ รูปเลยดูปลอม
// แสง: บอก "แสงมาจากไหน ตกบนหน้า/ตัว/ฉากยังไง เงาไปทางไหน" ดูจากรูปตัวอย่างของ notamodel.studio
// framing ใส่ในบรรทัดแรกของคำสั่ง (ไม่งั้น AI ยึดระยะจากรูปนางแบบ), fullBody = เห็นทั้งตัว (lib/prompts.ts สั่งเพิ่มท้ายคำสั่ง)
export type PresetPart = { label: string; prompt: string };
export type Preset = {
  id: string; name: string; hint: string; fullBody: boolean;
  light: PresetPart; lens: PresetPart; angle: PresetPart; framing: PresetPart; color: PresetPart;
};
// ลำดับที่โชว์ในหน้าเว็บ
export const PRESET_PARTS = [
  { key: 'light', name: 'แสง' }, { key: 'lens', name: 'เลนส์' }, { key: 'angle', name: 'มุมกล้อง' },
  { key: 'framing', name: 'ระยะ' }, { key: 'color', name: 'โทนสี' },
] as const;

export const PRESETS: Preset[] = [
  { id: 'studio', name: 'Studio lookbook', hint: 'เต็มตัว ฉากสตูดิโอ ไฟนุ่ม เหมาะกับฉากสตูดิโอหรือฉากเดิม', fullBody: true,
    light: { label: 'ซอฟต์บ็อกซ์ใหญ่ ไฟนุ่ม เงาบางๆ', prompt:
      'One very large softbox high and slightly to the front-left as the key light with soft fill, so shadows are soft but present: '
      + 'under the jaw and on the neck, along the side of the body and in the folds of the clothes. '
      + 'The backdrop is bright but not blown out and falls off slightly toward the top corners; a soft, diffuse shadow pools on '
      + 'the floor under and behind the person. Hair shows soft glossy highlights, skin has a natural sheen on the shoulders '
      + 'and collarbones.' },
    lens: { label: '85mm f/8 ชัดทั้งตัว', prompt: 'shot on a full-frame camera with an 85mm lens at f/8, the whole person sharp' },
    angle: { label: 'ระดับอก มองตรง', prompt: 'camera at chest height, straight on' },
    framing: { label: 'เต็มตัว หัวจรดเท้า', prompt: 'framed full body from head to feet, filling most of the frame height' },
    color: { label: 'โทนกลาง ขาวอมฟ้าเล็กน้อย', prompt: 'Neutral, slightly cool white balance, low contrast, clean colors.' } },
  { id: 'closeup', name: 'Product close-up', hint: 'ครึ่งตัว เน้นเนื้อผ้าและสินค้าให้ชัด', fullBody: false,
    light: { label: 'ซอฟต์บ็อกซ์ด้านหน้า + แผ่นสะท้อน + ไฟขอบหลัง', prompt:
      'One large softbox from the front-side as the key light, a white reflector filling the shadow side, and a soft rim light '
      + 'from behind separating the person from the background. Fabric weave, stitching, buttons and materials are crisp and readable; '
      + 'shiny surfaces show real softbox reflections.' },
    lens: { label: '100mm f/8 รายละเอียดคม', prompt: 'shot on a full-frame camera with a 100mm lens at f/8' },
    angle: { label: 'ระดับอก มองตรง', prompt: 'camera at chest height, straight on' },
    framing: { label: 'เอวขึ้นไป ชุด/สินค้าเต็มเฟรม', prompt: 'framed from the waist up so the outfit and any product fill the frame, with the legs out of frame' },
    color: { label: 'สีสินค้าตรงจริง โทนกลาง', prompt: 'Clean neutral color with true-to-life product colors.' } },
  { id: 'street', name: 'Outdoor street', hint: 'แดดจริงกลางแจ้ง เงาคม เหมาะกับฉากถนน/นอกอาคาร', fullBody: true,
    light: { label: 'แดดจริง เงาคม ตามทิศเดียวกับฉาก', prompt:
      'Real direct sunlight, high and to one side: hard light with crisp, dark-edged shadows; highlights on the cheekbones, nose, '
      + 'forearms and tops of the shoulders; eye sockets and under the chin slightly shadowed. The person casts a sharp shadow on the '
      + 'ground in exactly the same direction and length as the shadows of poles, trees and buildings around them. Shadows are slightly '
      + 'blue from the sky, and bright pavement bounces warm light up under the face and clothes. White clothes keep their texture '
      + 'without blowing out.' },
    lens: { label: '35mm ชัดทั้งภาพ', prompt: 'shot on a full-frame camera with a 35mm lens, everything in focus' },
    angle: { label: 'ระดับสายตา', prompt: "camera at the model's eye level" },
    framing: { label: 'เต็มตัว เห็นฉากรอบตัว', prompt: 'framed full body from head to feet with some of the street visible around the model' },
    color: { label: 'แดดอุ่น คอนทราสต์ธรรมชาติ', prompt: 'Warm daylight white balance, natural contrast.' } },
  { id: 'indoor', name: 'Indoor lifestyle', hint: 'แสงหน้าต่างในบ้าน/คาเฟ่ อบอุ่น เหมาะกับฉากในอาคาร', fullBody: true,
    light: { label: 'แสงหน้าต่างข้างเดียว + โคมไฟอุ่น', prompt:
      'The main light is soft daylight from a large window on one side, with warm lamps in the room as secondary light. The window side '
      + 'of the face and body is brighter and the far side falls into gentle shadow; the same light falls across the walls, floor and '
      + 'furniture, creating soft shadows and gradients through the room. The colors of the room (wood, walls, floor) bounce onto the '
      + 'skin and clothes.' },
    lens: { label: '50mm f/2.8 หลังเบลอเล็กน้อย', prompt: 'shot on a full-frame camera with a 50mm lens at f/2.8, the background slightly out of focus' },
    angle: { label: 'ระดับสายตา', prompt: "camera at the model's eye level" },
    framing: { label: 'เต็มตัว หัวจรดเท้า', prompt: 'framed full body from head to feet' },
    color: { label: 'อุ่น สีสดแต่เป็นธรรมชาติ', prompt: 'Warm, rich but natural colors, mixed daylight and tungsten white balance.' } },
];

// รวมส่วนของชุดถ่ายภาพเป็นคำสั่งต่อท้าย (framing ไม่อยู่ในนี้ ใส่บรรทัดแรกแยก)
export const presetPrompt = (p: Preset) =>
  `Camera: ${p.lens.prompt}, ${p.angle.prompt}. Lighting: ${p.light.prompt} Color: ${p.color.prompt}`;

export const SKIN_TONES = [
  { name: 'ขาวอมชมพู', color: '#f3d3c3' },
  { name: 'ขาวเหลือง', color: '#eccdaf' },
  { name: 'สองสี', color: '#d6a67f' },
  { name: 'แทน', color: '#ae7752' },
  { name: 'น้ำตาล', color: '#7b4d33' },
  { name: 'เข้ม', color: '#4a2c1f' },
];
