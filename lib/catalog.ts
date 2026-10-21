// catalog.ts — รายการให้เลือกใน Looklet
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

// ---------- ท่าสำเร็จรูป: ไม่ต้องมีรูปท่า ให้ AI ตัววางแผนท่า (planPose ใน lib/ai.ts) ดูฉาก + ชุด + ของเสริม แล้วคิดท่าที่เข้ากับฉากนั้น ----------
// brief = โจทย์ที่ส่งให้ตัววางแผน (อังกฤษ) — ตัววางแผนเลือกเฟอร์นิเจอร์/ผนัง/บันไดจริงในฉากเอง แล้วเขียนท่าเป็นคำให้ AI สร้างรูป
// ทดสอบ 20 ต.ค. (สบายๆ ตามฉาก ในฉากออฟฟิศ): ได้ท่านั่งเอนพิงม้านั่งจริง ยืดขามาทางกล้อง ดูไม่ได้โพส ต่างจากลอกท่าจากรูปที่ได้ท่านางแบบ
// "AI เลือกให้" (id auto) = ตัววางแผนเลือกเองว่าแบบไหนเข้ากับฉากที่สุด
// moments = จังหวะของท่านั้นหลายแบบ route สุ่มมา 1 แบบทุกครั้งที่สร้าง (pickMoment) — brief อย่างเดียว AI ตัววางแผนหยิบตัวอย่างแรกใน brief
//   ไปใช้ซ้ำทุกรูป: 20 ต.ค. "ถ่ายเผลอ หัวเราะ" 3 รูปก้มหน้าทั้ง 3 ทัดผม 2 (brief เดิมยกตัวอย่าง "looking down, tucking her hair")
//   brief เลยเขียนกว้างๆ ไม่ยกตัวอย่าง ท่าที่เจาะจงอยู่ใน moments แทน
export type PosePreset = { id: string; name: string; hint: string; brief: string; moments: string[] };
export const POSE_PRESETS: PosePreset[] = [
  { id: 'relaxed', name: 'สบายๆ ตามฉาก', hint: 'ท่าผ่อนคลายแบบคนทั่วไป ใช้เฟอร์นิเจอร์ในฉาก',
    brief: 'A relaxed, natural, unposed moment of a real person, using the real furniture and surfaces of the place: relaxed shoulders, '
      + 'natural asymmetry, loose hands, a slight slouch is fine. Expression: a soft, genuine smile.',
    moments: [
      'leaning back into a seat or against a wall, one arm resting along the back or on the knee',
      'sitting sideways with one leg pulled up, the body turned a little away from the camera and the face turned back to it',
      'standing with the weight on one hip, hands resting loosely in pockets or holding one arm',
      'perched on the edge of something with the elbows on the knees, leaning slightly forward',
      'glancing back toward the camera after looking out of a window or off to the side',
    ] },
  { id: 'sit', name: 'นั่งชิล', hint: 'นั่งบนม้านั่ง เก้าอี้ บันได หรือขอบที่มีในฉาก',
    brief: 'Sitting casually on something that is really in the location; if there is nothing to sit on, sit naturally on a step or the ground. '
      + 'Expression: natural and easy.',
    moments: [
      'sitting back deep in the seat with the legs crossed at the knee',
      'sitting near the edge with the knees together, feet apart and both hands resting on the seat edge',
      'sitting sideways on the seat with one arm draped over the backrest',
      'sitting with one knee pulled up and an arm resting on it',
      'sitting low on steps or the ground with the legs stretched out and crossed at the ankles',
    ] },
  { id: 'lean', name: 'พิงผนัง / เสา', hint: 'พิงผนัง ขอบประตู เสา หรือราวที่มีในฉาก',
    brief: 'Leaning casually against something that is really in the location (a wall, door frame, pillar, railing, counter or table), '
      + 'weight on one leg. Expression: calm and confident.',
    moments: [
      'the back flat against the wall with one foot raised and resting flat against the wall behind her',
      'one shoulder against the wall with the arms loosely crossed',
      'leaning on a door frame or pillar with one hand raised and resting on it',
      'the hip leaning against the edge of a table, counter or railing, body turned three-quarters to the camera',
      'leaning back on both hands against a ledge or counter behind her',
    ] },
  { id: 'product', name: 'โชว์สินค้า', hint: 'ของเสริม (หรือจุดเด่นของชุด) เป็นพระเอกของรูป',
    brief: 'Showing the product naturally so it is the hero of the photo: the accessory (or, without one, the key detail of the outfit) '
      + 'is clearly in view and the hands interact with it. The pose stays natural, not stiff, and the outfit stays visible. Expression: a soft smile.',
    moments: [
      'standing, holding the accessory up in front of the body with both hands',
      'sitting, with the accessory on the lap or beside her and one hand resting on it',
      'standing three-quarters to the camera, wearing or carrying the accessory with one hand on it',
      'leaning against something, looking down at the accessory while adjusting it',
      'standing, holding the accessory slightly out toward the camera',
      'without an accessory: standing, one hand adjusting a sleeve, hem or collar of the outfit',
    ] },
  { id: 'fashion', name: 'ยืนแฟชั่นมั่นใจ', hint: 'ยืนแบบลุคบุ๊ก เห็นชุดทั้งตัวชัด',
    brief: 'A confident fashion stance for a lookbook: standing, shoulders open, the whole outfit and its silhouette clearly visible. '
      + 'Polished but not stiff. Expression: calm and confident.',
    moments: [
      'weight on one leg with one hand lightly on the hip, looking at the camera',
      'mid-step, walking toward the camera',
      'a three-quarter turn, looking back over the shoulder at the camera',
      'hands in the pockets with the chin slightly raised',
      'one leg crossed in front of the other, arms relaxed at the sides',
    ] },
  { id: 'laugh', name: 'ถ่ายเผลอ หัวเราะ', hint: 'จังหวะหัวเราะจริง แต่ละรูปไม่ซ้ำกัน',
    brief: 'A candid caught moment: she laughs genuinely, as if the friend taking the photo just made her laugh. '
      + 'Expression: a real laugh with crinkled eyes.',
    // แต่ละจังหวะบอกท่าตัวด้วย (นั่ง/ยืน/เดิน/พิง) ไม่งั้น AI ให้ท่าตัวแบบเดียวทุกรูป (เช็ก 20 ต.ค.: ไม่บอก = นั่งขอบม้านั่งทั้งหมด)
    moments: [
      'sitting back in a seat, laughing while looking straight at the camera, as if the friend taking the photo just said something funny',
      'standing, laughing with the head tipped back and the chin raised a little',
      'standing and turning to the side, laughing with someone just outside the frame',
      'sitting and leaning forward while laughing, one hand resting on the knee or a table',
      'walking, laughing mid-step while turning back to look at the camera',
      'leaning against a wall or furniture, laughing while holding or adjusting the accessory, eyes on the camera',
      'sitting sideways, laughing with the head dipped down and turned a little away',
    ] },
];
// สุ่มจังหวะของท่า 1 แบบ (ทุกครั้งที่สร้างได้ท่าไม่ซ้ำ)
export const pickMoment = (p: PosePreset) => p.moments[Math.floor(Math.random() * p.moments.length)];
export const POSE_AUTO = { id: 'auto', name: 'AI เลือกให้', hint: 'AI ดูฉาก ชุด ของเสริม แล้วเลือกแบบที่เข้ากันที่สุดให้' };

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

// สีหน้า: auto = ท่าสำเร็จรูป -> สีหน้าตาม brief ของท่านั้น (อยู่ในท่าที่ AI วางแผน), รูปท่าโพสต์ -> ลอกสีหน้าจากรูปนั้น,
//   ท่าเดิม -> ตามรูปนางแบบ (ไม่สั่ง) · เลือกแบบอื่น = ใช้แทนสีหน้าในท่าสำเร็จรูป
// คำที่ใช้ได้ผลจากการทดสอบ 19 ต.ค.: "นิ่ง" เฉยๆ หน้าแข็งไม่มีอารมณ์, "อบอุ่น" AI กลับไปยิ้มกว้างแบบรูปนางแบบ
//   ที่ได้ผล = "no big smile; lips softly parted; real life in the eyes" — prompts.ts สั่งเพิ่มว่าไม่ต้องลอกสีหน้าจากรูปนางแบบ
export const FACE_MOODS: (Choice & { hint: string })[] = [
  { id: 'auto', name: 'อัตโนมัติ', hint: 'ท่าสำเร็จรูป = สีหน้าตามท่านั้น (เช่น หัวเราะ ยิ้มบางๆ) · รูปท่าโพสต์ = ลอกสีหน้าจากรูปนั้น · ท่าเดิม = ตามรูปนางแบบ', prompt: '' },
  { id: 'calm', name: 'นิ่ง มั่นใจ', hint: 'ไม่ยิ้มกว้าง ปากเผยอ สายตามีชีวิต',
    prompt: 'Expression: no big smile; lips softly parted; a calm, confident gaze into the lens with real life in the eyes, not blank.' },
  { id: 'soft', name: 'ยิ้มบางๆ', hint: 'ยิ้มมุมปาก ตาอบอุ่น',
    prompt: 'Expression: a soft, natural half-smile with relaxed lips and warm, lively eyes.' },
  { id: 'bright', name: 'ยิ้มสดใส', hint: 'ยิ้มเห็นฟันนิดๆ ดูมีความสุข',
    prompt: 'Expression: a bright, natural smile showing a little of the teeth, with happy, lively eyes.' },
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

// ---------- สไตล์ถ่ายภาพ (preset): แสง + เลนส์ + มุมกล้อง + ระยะ + โทนสี ที่เข้ากันเป็นชุดเดียว ----------
// แต่ละส่วนมี label = ที่โชว์ในหน้าเว็บ, prompt = ที่ส่งให้ AI จริง (ภาษาอังกฤษ) -> หน้าเว็บโชว์ตรงกับที่ส่งเสมอ
// แยกตัวเลือกแสง/กล้อง/ระยะเองเคยขัดกัน (แสงบอกเลนส์ สไตล์ภาพบอกเลนส์อีกที) AI ต้องเลือกครึ่งๆ กลางๆ รูปเลยดูปลอม
// แสง: บอก "แสงมาจากไหน ตกบนหน้า/ตัว/ฉากยังไง เงาไปทางไหน" ดูจากรูปตัวอย่างของ notamodel.studio
// framing ใส่ในบรรทัดแรกของคำสั่ง (ไม่งั้น AI ยึดระยะจากรูปนางแบบ), fullBody = เห็นทั้งตัว (lib/prompts.ts สั่งเพิ่มท้ายคำสั่ง)
export type PresetPart = { label: string; prompt: string };
// scene = คำสั่งเรื่องฉากเพิ่ม (มีเฉพาะบางสไตล์ เช่น Looklet signature ทำฉากให้มินิมอล) ต่อท้ายคำสั่งสไตล์ ไม่ใช้ตอนลอกทั้งช็อต
export type Preset = {
  id: string; name: string; hint: string; fullBody: boolean;
  light: PresetPart; lens: PresetPart; angle: PresetPart; framing: PresetPart; color: PresetPart; scene?: PresetPart;
};
// ลำดับที่โชว์ในหน้าเว็บ
export const PRESET_PARTS = [
  { key: 'light', name: 'แสง' }, { key: 'lens', name: 'เลนส์' }, { key: 'angle', name: 'มุมกล้อง' },
  { key: 'framing', name: 'ระยะ' }, { key: 'color', name: 'โทนสี' }, { key: 'scene', name: 'ฉาก' },
] as const;

// ไฟซอฟต์บ็อกซ์ / เลนส์ / โทนสีของ Studio lookbook — Looklet signature ใช้ชุดเดียวกัน
const SOFTBOX_LIGHT: PresetPart = { label: 'ซอฟต์บ็อกซ์ใหญ่ ไฟนุ่ม เงาบางๆ', prompt:
  'One very large softbox high and slightly to the front-left as the key light with soft fill, so shadows are soft but present: '
  + 'under the jaw and on the neck, along the side of the body and in the folds of the clothes. '
  + 'The backdrop is bright but not blown out and falls off slightly toward the top corners; a soft, diffuse shadow pools on '
  + 'the floor under and behind the person. Hair shows soft glossy highlights, skin has a natural sheen on the shoulders '
  + 'and collarbones.' };
const LENS_85: PresetPart = { label: '85mm f/8 ชัดทั้งตัว', prompt: 'shot on a full-frame camera with an 85mm lens at f/8, the whole person sharp' };
const NEUTRAL_COLOR: PresetPart = { label: 'โทนกลาง ขาวอมฟ้าเล็กน้อย', prompt: 'Neutral, slightly cool white balance, low contrast, clean colors.' };

export const PRESETS: Preset[] = [
  // ฟีลประจำของ Looklet (ค่าเริ่มต้น = ตัวแรก): ทดสอบ 21 ต.ค. กับรูปตัวอย่างที่ผู้ใช้เลือก (ยืนจับเท้า พิงผนัง ห้องมินิมอล)
  // แสง/เลนส์/โทนสีของ Studio lookbook ให้สีกลางๆ อมเย็นนิดๆ ตรงรูปตัวอย่างโดยไม่ต้องเกรดสีเพิ่ม (แสงอุ่นแบบเดิมออกมาเหลือง/สว่างเกิน)
  // + ระยะ 3/4 ของภาพ มีขอบผนังด้านหน้า + ฉากมินิมอล (ฉากที่รกจะถูกเก็บให้เรียบ เห็นผลชัดกับฉากถนน/ร้าน)
  { id: 'signature', name: 'Looklet signature', hint: 'ฟีลของ Looklet: ฉากมินิมอลโทนครีม ไฟนุ่ม สีกลางๆ เต็มตัว ใช้ได้กับทุกฉาก', fullBody: true,
    light: SOFTBOX_LIGHT, lens: LENS_85,
    angle: { label: 'ระดับอก เฉียงข้างนิดๆ', prompt: 'camera at chest height, level, seen from slightly to the side' },
    framing: { label: 'เต็มตัว ราว 3/4 ของภาพ มีขอบผนังด้านหน้า', prompt: 'framed full body from head to feet, the person filling about '
      + 'three quarters of the frame height, with the edge of a wall, column or doorway in the foreground on one side and the space '
      + 'continuing behind' },
    color: NEUTRAL_COLOR,
    scene: { label: 'มินิมอลมาก ผนังขาวครีม พื้นไม้อ่อน/หิน ไม่มีของรก ชุดเป็นสีหลักของภาพ', prompt:
      'Looklet signature setting, super minimal: keep only the essence of the location and show it as an almost empty, calm space. '
      + 'The frame contains only clean, plain surfaces (smooth warm off-white plaster walls, a pale stone or light oak floor, at most one '
      + 'simple window or doorway) and at most one or two simple pieces of furniture, in warm neutral tones (cream, beige, light oak, '
      + 'travertine, white boucle). No decor, plants, shelves, objects, clutter, cables, signs, text, logos or other people. Generous calm '
      + 'empty space around her; the outfit is the main color in the frame.' } },
  { id: 'studio', name: 'Studio lookbook', hint: 'เต็มตัว ฉากสตูดิโอ ไฟนุ่ม เหมาะกับฉากสตูดิโอหรือฉากเดิม', fullBody: true,
    light: SOFTBOX_LIGHT, lens: LENS_85,
    angle: { label: 'ระดับอก มองตรง', prompt: 'camera at chest height, straight on' },
    framing: { label: 'เต็มตัว หัวจรดเท้า', prompt: 'framed full body from head to feet, filling most of the frame height' },
    color: NEUTRAL_COLOR },
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
  { id: 'flash', name: 'Flash editorial', hint: 'แฟลชตรงแบบนิตยสาร เงาคมหลังตัว ฉากมืดกว่าคน', fullBody: true,
    light: { label: 'แฟลชติดกล้อง แสงแข็งตรงหน้า เงาคมด้านหลัง', prompt:
      'A direct on-camera flash: hard frontal light, bright skin with crisp specular highlights on the forehead, nose and cheekbones, '
      + 'and a sharp-edged dark shadow cast right behind the person onto the wall or floor, offset slightly to one side. '
      + 'The flash falls off quickly, so the background is noticeably darker than the person.' },
    lens: { label: '35mm ชัดทั้งภาพ', prompt: 'shot on a full-frame camera with a 35mm lens, everything in focus' },
    angle: { label: 'ต่ำกว่าระดับสายตาเล็กน้อย', prompt: "camera slightly below the model's eye level" },
    framing: { label: 'เต็มตัว หัวจรดเท้า', prompt: 'framed full body from head to feet, filling most of the frame height' },
    color: { label: 'คอนทราสต์จัด สีสด ขอบภาพมืดนิดๆ', prompt: 'Punchy contrast, saturated colors, slight vignette.' } },
  { id: 'golden', name: 'Golden hour', hint: 'แดดเย็นย้อนแสง ขอบผมเรืองทอง เหมาะกับฉากกลางแจ้ง ทะเล สวน', fullBody: true,
    light: { label: 'แดดเย็นย้อนหลัง ขอบตัวเรืองทอง', prompt:
      'The low sun just before sunset is behind the person and slightly to one side: a warm golden rim light outlines the hair, '
      + 'shoulders and arms, while the front of the face and body is lit by soft light bounced from the surroundings, so it is not dark. '
      + 'Long, soft shadows stretch across the ground toward the camera, with a little natural haze and lens flare from the sun.' },
    lens: { label: '85mm f/2 หลังเบลอนุ่ม', prompt: 'shot on a full-frame camera with an 85mm lens at f/2, the background softly out of focus' },
    angle: { label: 'ระดับสายตา', prompt: "camera at the model's eye level" },
    framing: { label: 'เต็มตัว หัวจรดเท้า', prompt: 'framed full body from head to feet' },
    color: { label: 'โทนทองอุ่น คอนทราสต์นุ่ม', prompt: 'Warm golden tones, soft contrast, slightly lifted shadows.' } },
  // เขียนใหม่ 20 ต.ค. จากการเทียบกับรูป iPhone จริงในฉากเดียวกัน: มือถือจริงถ่ายใกล้ เลนส์กว้าง ก้มกล้องนิดๆ จัดเฟรมไม่เป๊ะ
  // แสงในอาคารแบนๆ เงาจาง สีจืดกว่า — แบบเดิม ("ใช้แสงที่มีในฉาก") AI ยังจัดเฟรมสวยตรงกลาง กล้องตรง เงาเข้ม เหมือนช่างภาพถ่าย
  // fullBody = false: ให้ตัดปลายเท้าได้แบบรูปมือถือจริง (ไม่สั่ง "เห็นทั้งตัวหัวจรดเท้า")
  { id: 'phone', name: 'Phone candid (IG)', hint: 'เหมือนเพื่อนถ่ายด้วยมือถือ ลงไอจี ดูเป็นกันเอง ใช้ได้ทุกฉาก (ได้ลุคมือถือในขั้นแต่งรูป)', fullBody: false,
    light: { label: 'แสงที่มีในฉาก ไม่มีแฟลช/ไฟเสริม เงาจาง', prompt:
      'Only the light that is already at the location, with no flash and no extra lighting equipment. Indoors this usually means flat '
      + 'overhead ceiling light mixed with daylight from the windows: soft, low-contrast light with faint shadows. Outdoors it is the real '
      + 'daylight of the place. The light on the person matches the place exactly, and bright windows may be close to blown out.' },
    lens: { label: 'กล้องหลักมือถือ ~26mm ระยะใกล้ ชัดทั้งภาพ', prompt: 'taken on a smartphone main camera (about 26mm wide angle) from close range, '
      + 'everything in focus, with the slight wide-angle perspective of a phone: parts of the body closer to the camera look a little larger' },
    angle: { label: 'ระดับอก ก้มกล้องลงนิดๆ', prompt: 'phone held by a friend at chest height and tilted slightly down, so vertical lines lean in slightly' },
    framing: { label: 'จัดเฟรมสบายๆ แบบถ่ายเร็วๆ', prompt: 'framed casually like a quick snapshot, showing most or all of the body: '
      + 'the person slightly off-center with uneven space around them, and the feet may be cut off by the bottom edge' },
    color: { label: 'สีมือถือธรรมชาติ จืดๆ ไม่อุ่น', prompt: 'Natural iPhone colors as posted without filters: neutral white balance, muted true-to-life colors, '
      + 'bright exposure and phone-style sharpening; not warm, not saturated, no film look.' } },
  { id: 'night', name: 'Night city', hint: 'กลางคืน ไฟถนน/นีออนตกกระทบตัว เหมาะกับฉากถนนกลางคืน', fullBody: true,
    light: { label: 'ไฟถนน/ป้ายนีออน + แฟลชอ่อนๆ', prompt:
      'Night: the person is lit by the lights of the location (street lamps, shop windows and neon signs), with colored light '
      + 'falling on the skin and clothes from the side and deep shadows between the lights, plus a weak on-camera fill flash so the '
      + 'face and outfit stay readable. Wet or shiny surfaces reflect the lights.' },
    lens: { label: '35mm f/1.8 ไฟหลังเป็นโบเก้', prompt: 'shot on a full-frame camera with a 35mm lens at f/1.8, the background lights blurred into soft bokeh' },
    angle: { label: 'ระดับสายตา', prompt: "camera at the model's eye level" },
    framing: { label: 'เต็มตัว หัวจรดเท้า', prompt: 'framed full body from head to feet' },
    color: { label: 'เงาฟ้าเย็น ไฟอุ่น เกรนกลางคืน', prompt: 'Rich night colors with cool blue shadows and warm highlights, fine high-ISO grain.' } },
];

// ---------- ชุดภาพ 4 มุม: กดครั้งเดียวได้หลายรูปเหมือนถ่ายช็อตเดียวกัน ----------
// รูปแรก (หน้าตรง) สร้างตามที่เลือกทุกอย่าง แล้วส่งรูปนั้นไปเป็นต้นแบบให้รูปที่เหลือ (คน ชุด ฉาก แสง ตรงกันทั้งชุด)
// framing = ระยะ (แทนระยะของสไตล์ถ่ายภาพ), angle = มุมกล้อง + ท่า สำหรับรูปที่ 2 เป็นต้นไป (รูปแรกใช้ท่าที่เลือกไว้)
export type SetShot = { id: string; name: string; fullBody: boolean; framing: string; angle: string };
export const SET_SHOTS: SetShot[] = [
  { id: 'front', name: 'หน้าตรง', fullBody: true, framing: 'framed full body from head to feet, filling most of the frame height',
    angle: "Camera angle: straight on at the model's chest height, the model facing the camera." },
  { id: 'three-quarter', name: 'เฉียง 3/4', fullBody: true, framing: 'framed full body from head to feet, filling most of the frame height',
    angle: 'Camera angle: a three-quarter view: the body is turned about 45 degrees away from the camera, the face turned back toward the camera.' },
  { id: 'back', name: 'ด้านหลัง', fullBody: true, framing: 'framed full body from head to feet, filling most of the frame height',
    angle: "Camera angle: from behind and slightly to one side, so the back of the outfit is clearly visible; the model looks back over the shoulder so part of the face shows." },
  { id: 'detail', name: 'ใกล้ เอวขึ้นไป', fullBody: false,
    framing: 'framed from the waist up so the outfit details and any accessories fill the frame, with the legs out of frame',
    angle: 'Camera angle: close, at chest height, straight on, focused on the fabric, details and accessories.' },
];

// รวมส่วนของสไตล์ถ่ายภาพเป็นคำสั่งต่อท้าย (framing ไม่อยู่ในนี้ ใส่บรรทัดแรกแยก)
export const presetPrompt = (p: Preset) =>
  `Camera: ${p.lens.prompt}, ${p.angle.prompt}. Lighting: ${p.light.prompt} Color: ${p.color.prompt}` + (p.scene ? ' ' + p.scene.prompt : '');
// ลอกทั้งช็อตแต่เลือกใช้แสงของสไตล์ถ่ายภาพ: เอาแค่แสง + โทนสี (เลนส์/มุม/ระยะยังตามรูปต้นแบบ)
export const presetLightPrompt = (p: Preset) => `Lighting: ${p.light.prompt} Color: ${p.color.prompt}`;

// แสงตอนลอกทั้งช็อต: ref = ให้ AI อ่านแสงในรูปต้นแบบแล้วบรรยายเป็นคำให้ (lib/ai.ts describeLighting), preset = ใช้แสงของสไตล์ถ่ายภาพ
// ทดสอบ 19 ต.ค.: สั่งแค่ "recreate its lighting" AI ทำแสงนุ่มลงเสมอ พอบรรยายแสงจริงๆ (แฟลชตรง เงาคมด้านหลัง) แสงตรงรูปต้นแบบขึ้นชัด
export const LIGHT_SOURCES = [
  { id: 'ref', name: 'ลอกจากรูปต้นแบบ', hint: 'AI อ่านแสงในรูปต้นแบบแล้วบรรยายให้ละเอียด (ใช้เวลาเพิ่ม 2–5 วินาที ไม่ถึงสตางค์)' },
  { id: 'preset', name: 'ใช้แสงของสไตล์ถ่ายภาพ', hint: 'เลือกสไตล์ในขั้นถัดไป ใช้แค่แสงและโทนสี มุมกล้อง/ระยะยังตามรูปต้นแบบ' },
] as const;
export type LightSource = (typeof LIGHT_SOURCES)[number]['id'];

export const SKIN_TONES = [
  { name: 'ขาวอมชมพู', color: '#f3d3c3' },
  { name: 'ขาวเหลือง', color: '#eccdaf' },
  { name: 'สองสี', color: '#d6a67f' },
  { name: 'แทน', color: '#ae7752' },
  { name: 'น้ำตาล', color: '#7b4d33' },
  { name: 'เข้ม', color: '#4a2c1f' },
];
