// packshot.ts — ตัวเลือกของหน้าสินค้า (รูปสินค้าแบบ packshot) ใช้ได้ทั้งหน้าเว็บและ server
// ทุกตัวเลือกมี name/hint = ที่โชว์ในหน้าเว็บ (ไทย) + prompt = ที่ส่งให้ AI จริง (อังกฤษ) -> หน้าเว็บโชว์ตรงกับที่ส่งเสมอ
// หน้าเว็บส่งแค่ id ไป server (app/api/packshot) แล้ว server แปลงเป็นคำสั่งเอง ด้วยรายการในไฟล์นี้
// สไตล์ทั้งหมดถอดจากรูปตัวอย่าง 11 รูปที่ผู้ใช้ส่งมา 26 ต.ค. (IG แบรนด์กระเป๋าไทย mochryl.studio / parkemi_ / maison2.11 / isahthelabel):
//   รูปถ่ายจริงเงียบๆ สินค้าชิ้นเดียวกลางภาพ ที่ว่างเยอะ · แสงนุ่ม เงาจาง · สีหม่น คอนทราสต์ต่ำ · สีฉากเลือกให้เข้ากับสินค้า
//   กล้องอยู่ระดับเดียวกับสินค้า หรือมองตรงลงมา (แฟลตเลย์) · พร็อพไม่มีเลย หรือ still life เล็กๆ ที่สีรับกับสินค้า
// ยังไม่ได้ทดสอบเทียบกับรูปตัวอย่าง (ผู้ใช้ให้ข้ามการทดสอบ 26 ต.ค. จะลองเองบนเว็บทดสอบ)

// ---------- ประเภทสินค้า: AI ดูรูปตอนอัปโหลดแล้วเลือกให้ (lib/ai.ts describeProduct) ----------
// stand = วางบนฉากยังไง (มุมปกติ), flat = วางนอนยังไง (มุมมองตรงลงมา)
export type ProductType = { id: string; name: string; prompt: string; stand: string; flat: string };
export const PRODUCT_TYPES: ProductType[] = [
  { id: 'bag', name: 'กระเป๋าทรงแข็ง', prompt: 'a structured handbag',
    stand: 'The bag stands upright on its base, filled so it holds its shape, its handle standing up in its own natural curve.',
    flat: 'The bag lies flat on its back with its front facing up, its handle and any strap falling onto the surface in loose, natural curves.' },
  { id: 'soft-bag', name: 'กระเป๋าทรงนิ่ม', prompt: 'a soft, unstructured bag such as a pouch, hobo or drawstring bag',
    stand: 'The bag sits on its base and settles a little under its own weight, with soft natural folds in the leather; its handles and straps relax naturally.',
    flat: 'The bag lies flat on the surface with its front facing up, gathered and soft, its straps falling onto the surface in loose, natural curves.' },
  { id: 'tote', name: 'กระเป๋าโท้ท', prompt: 'a tote bag',
    stand: 'The tote stands upright on its base, filled so it holds its shape, its handles standing up in their own natural curve.',
    flat: 'The tote lies flat on its back with its front facing up, its handles falling onto the surface in loose, natural curves.' },
  { id: 'shoes', name: 'รองเท้า', prompt: 'a pair of shoes',
    stand: 'The pair stands side by side on the surface, one shoe slightly ahead of the other and turned a little, so both the side and the front show.',
    flat: 'The pair lies on the surface seen from above, side by side at slightly different angles, soles down.' },
  { id: 'small', name: 'กระเป๋าสตางค์/ชิ้นเล็ก', prompt: 'a small leather good such as a wallet, card holder or key holder',
    stand: 'It stands propped upright at a slight angle on the surface, its front facing the camera.',
    flat: 'It lies flat on the surface with its front facing up.' },
  { id: 'jewelry', name: 'เครื่องประดับ', prompt: 'a piece of jewelry',
    stand: 'It is placed on the surface so its shape and details show clearly; a necklace or bracelet is laid in a loose, graceful curve.',
    flat: 'It lies flat on the surface in a loose, graceful arrangement.' },
  { id: 'beauty', name: 'เครื่องสำอาง/ขวด', prompt: 'a beauty or fragrance product in a bottle, jar or tube',
    stand: 'It stands upright on its base, perfectly vertical, its label facing the camera.',
    flat: 'It lies on its side on the surface with its label facing up.' },
  { id: 'other', name: 'อื่นๆ', prompt: 'a product',
    stand: 'It rests naturally on the surface the way it is normally placed, its front facing the camera.',
    flat: 'It lies flat on the surface with its front facing up.' },
];
export const productType = (id: unknown) => PRODUCT_TYPES.find((t) => t.id === id) ?? PRODUCT_TYPES.at(-1)!;

// ---------- ฉาก: {color} = สีฉาก (BACKDROP_COLORS), {variant} = สุ่มของจาก variants ต่อรูป (ไม่สุ่ม = ได้ของเดิมทุกรูป) ----------
// color = สีเริ่มต้นของฉากนั้น (จากรูปตัวอย่าง) ฉากที่ไม่มี {color} เปลี่ยนสีไม่ได้ (ผ้าดำ ปูน ขอบบัวขาว)
// ฉากที่เป็นพื้นอย่างเดียว (ปูน/ผ้าดำ) ไม่เขียนว่า "เต็มภาพ" — มุมมองตรงลงมา lib/packshot-prompts.ts บอกเองว่าพื้นเต็มภาพ
export type ProductSet = { id: string; name: string; hint: string; prompt: string; color?: string; variants?: string[] };
export const SETS: ProductSet[] = [
  { id: 'pastel', name: 'พาสเทลสองโทน', hint: 'ผนังกับพื้นสีพาสเทลคนละโทน ตัดกันเป็นเส้นตรง', color: 'a pale lilac grey',
    prompt: 'a seamless studio set made of two flat pastel planes: a painted wall in {color} behind, meeting a floor surface in a slightly deeper, '
      + 'cooler pastel tone at a crisp straight horizontal line a little below the middle of the frame; the floor runs toward the camera and '
      + 'falls slightly out of focus in the foreground' },
  { id: 'table', name: 'โต๊ะขาว + ผนังปูน', hint: 'โต๊ะสีขาวด้าน ผนังปูนฉาบ (ใช้กับ still life)', color: 'a warm greige',
    prompt: 'a matte white tabletop against a plaster wall in {color}; the back edge of the table meets the wall in a straight horizontal line behind the product' },
  { id: 'plywood', name: 'โต๊ะไม้ดิบ', hint: 'โต๊ะไม้อัดเห็นลายไม้ ผนังสีอ่อน แบบโต๊ะทำงานช่าง', color: 'a pale blue grey',
    prompt: 'a raw plywood tabletop with visible wood grain, small marks and worn edges, against a painted wall in {color}; the back edge of the '
      + 'table meets the wall behind the product' },
  { id: 'plinth', name: 'แท่นประติมากรรม', hint: 'วางบนของแปลกตาเป็นแท่น เช่น โคมกระดาษจีบ บล็อกหิน', color: 'a pale warm grey',
    // เดิมมี "a simple round wooden stool" ออกมาเป็นเก้าอี้ ผู้ใช้เลือกแท่นแต่ได้เก้าอี้ (28 ต.ค.) -> แทนด้วยแท่นปูน + ห้ามเฟอร์นิเจอร์
    prompt: 'the product balanced on top of {variant} used as a sculptural plinth (a pedestal-like object, never a chair, stool or other furniture), '
      + 'centered in the frame, against a plain painted wall in {color}',
    variants: [
      'a tall cone-shaped pleated paper lampshade', 'a rough-cut travertine block', 'a neat stack of large art books',
      'a fluted white plaster column', 'a smooth white plaster cylinder pedestal',
    ] },
  { id: 'ledge', name: 'ขอบบัวสีขาว', hint: 'ขอบบัวปูนสีขาวแบบเตาผิง ผนังขาว ขาวทั้งภาพ',
    prompt: 'a white painted architectural ledge with classic moulding below it, like a mantelpiece, against a plain white wall; white on white, high key' },
  { id: 'cove', name: 'ฉากกระดาษไร้รอยต่อ', hint: 'ฉากกระดาษโค้งต่อพื้น ไม่เห็นเส้นขอบ', color: 'a light cool grey',
    prompt: 'a seamless paper backdrop in {color} curving smoothly from the wall into the floor (an infinity cove), with no visible horizon line' },
  { id: 'linen', name: 'ผ้าปูที่นอน', hint: 'ผ้าฝ้ายยับๆ เป็นทั้งพื้นและฉากหลัง', color: 'an off-white with a faint cool tint',
    prompt: 'a crumpled cotton bedsheet in {color} with soft natural creases and folds, draped to form both the floor and the backdrop' },
  { id: 'concrete', name: 'พื้นปูนขัดมัน', hint: 'พื้นปูนสีเทา เห็นเนื้อปูน (เหมาะกับมองตรงลงมา)',
    prompt: 'a smooth grey polished concrete floor with subtle mottling, fine pores and faint trowel marks' },
  { id: 'plaster', name: 'ปูนฉาบมีคราบ', hint: 'ปูนสีขาวนวล มีคราบสีเหลืองทราย แบบวาบิซาบิ',
    prompt: 'a limewash plaster surface in pale off-white with soft ochre and sand-colored stains and brush marks' },
  { id: 'dark-fabric', name: 'ผ้าสีดำ', hint: 'ผ้าหนัง/ซาตินสีดำยับๆ เงาวาวตามรอยพับ',
    prompt: 'crumpled black leather or satin fabric with deep folds catching soft highlights' },
];
export const colorable = (s: ProductSet) => s.prompt.includes('{color}');
export const pickOne = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

// สีฉาก (ฉากที่มี {color}): set = ตามฉาก, match = AI เลือกสีที่เข้ากับสินค้า (รูปตัวอย่างทำแบบนี้ทุกรูป: กระเป๋าน้ำตาลบนฉากม่วงอ่อน)
export type BackdropColor = { id: string; name: string; swatch?: string; prompt: string };
export const BACKDROP_COLORS: BackdropColor[] = [
  { id: 'set', name: 'ตามฉาก', prompt: '' },
  { id: 'match', name: 'AI เลือกให้เข้ากับสินค้า',
    prompt: "a soft, muted color chosen to complement the product's own color, a gentle contrast that is never the same color as the product" },
  { id: 'greige', name: 'เทาอมเบจ', swatch: '#d9d2c7', prompt: 'a warm greige' },
  { id: 'lilac', name: 'ม่วงเทาอ่อน', swatch: '#dcd8e2', prompt: 'a pale lilac grey' },
  { id: 'periwinkle', name: 'ฟ้าอมม่วง', swatch: '#c3cbe3', prompt: 'a pale periwinkle blue' },
  { id: 'blue-grey', name: 'ฟ้าเทา', swatch: '#cfd8dc', prompt: 'a pale blue grey' },
  { id: 'sage', name: 'เขียวเสจ', swatch: '#c9d1bf', prompt: 'a soft sage green' },
  { id: 'butter', name: 'เหลืองเนย', swatch: '#ece3c4', prompt: 'a pale butter yellow' },
  { id: 'blush', name: 'ชมพูอ่อน', swatch: '#e8d3cf', prompt: 'a pale blush pink' },
  { id: 'white', name: 'ขาว', swatch: '#ffffff', prompt: 'pure neutral white' },
  { id: 'light-grey', name: 'เทาอ่อน', swatch: '#e4e5e7', prompt: 'a neutral light grey' },
  { id: 'cream', name: 'ครีม', swatch: '#eee7da', prompt: 'a pale cream' },
  { id: 'charcoal', name: 'เทาเข้ม', swatch: '#3a3a3c', prompt: 'a deep charcoal grey' },
];

// ---------- พร็อพ: brief = แนวทาง, moments = รายละเอียดที่สุ่ม 1 อย่างต่อรูป ----------
// บทเรียนจากท่าสำเร็จรูป (POSE_PRESETS 20 ต.ค.): ใส่ตัวอย่างไว้ใน brief แล้ว AI ทำแบบเดิมทุกรูป -> ตัวอย่างอยู่ใน moments เท่านั้น
// AI ตัววางแผน (lib/ai.ts planStyling) ดูรูปสินค้า + ฉาก แล้วเขียนพร็อพจริงให้ (สีรับกับสินค้า ขนาดจริง ตำแหน่ง)
export type PropStyle = { id: string; name: string; hint: string; brief: string; moments: string[] };
export const NO_PROPS = 'none';
export const AUTO_PROPS = 'auto';
export const PROP_STYLES: PropStyle[] = [
  { id: NO_PROPS, name: 'ไม่มีพร็อพ', hint: 'สินค้าชิ้นเดียวกับฉากเปล่า', brief: '', moments: [] },
  // ---- ธรรมชาติ ----
  { id: 'leaves', name: 'ใบไม้ & กิ่งไม้', hint: 'ใบปาล์ม มอนสเตอร่า กิ่งมะกอก หญ้าแห้ง',
    brief: 'Real fresh or dried foliage placed loosely beside or behind the product, natural and unarranged-looking.',
    moments: [
      'one large palm leaf lying behind the product', 'a monstera leaf at one side casting a soft shadow', 'a small olive branch lying on the surface',
      'a sprig of eucalyptus in a slim clear glass', 'a few stems of dried pampas grass in a low vase',
    ] },
  { id: 'flower', name: 'ดอกไม้ & กลีบดอก', hint: 'ดอกไม้ก้านเดียว กลีบดอกร่วง หรือช่อเล็กๆ',
    brief: 'Real flowers kept sparse and elegant beside the product: a single stem in a glass, a few loose petals or one small, low arrangement.',
    moments: [
      'a white poppy with long curving stems and closed buds in a cut-crystal glass', 'a single tulip bending over the rim of a tall thin glass',
      'one ranunculus in a short clear tumbler', 'a small branch of blossom in a slim glass bottle', 'a few loose rose petals scattered in front of the product',
      'a small low posy of garden flowers in a short ceramic cup',
    ] },
  { id: 'fruit', name: 'ผลไม้สด & ซิตรัส', hint: 'เลมอน ส้ม ลูกแพร์ เชอร์รี่ ทั้งลูกหรือผ่าครึ่ง',
    brief: 'A playful editorial fruit still life on the surface around the product: a few pieces of real fruit or citrus whose colors echo '
      + 'or complement the product, loosely scattered at different distances, with one imperfect, lived-in detail.',
    moments: [
      'a pear with one bite taken out of it, lying on its side', 'a few berries crushed, leaving a small juice smear on the surface',
      'a few pieces of fruit on a small vintage silver plate at one edge of the frame', 'a fruit cut in half, cut side up',
      'a small fluted metal tart tin holding a few berries', 'a pair of cherries on their stems, one fallen on its side',
      'a lemon cut in half, cut side up, next to a whole lemon with a leaf', 'a few orange slices fanned out on the surface',
    ] },
  { id: 'stone', name: 'หินธรรมชาติ & ทราเวอร์ทีน', hint: 'แผ่นทราเวอร์ทีน หินกรวดเรียบ หินดิบ',
    brief: 'Natural stone used sculpturally beside or under the product, quiet and smaller than the product.',
    moments: [
      'two smooth river pebbles of different sizes, one stacked on the other', 'a small rough-cut travertine block on one side',
      'a scatter of small pale pebbles in front of the product', 'one large flat stone under one corner of the frame',
      'the product standing on a low travertine slab with visible pores',
    ] },
  { id: 'beach', name: 'ทราย & เปลือกหอย', hint: 'ทรายละเอียด เปลือกหอย ไม้ลอยน้ำ',
    brief: 'A sunny beach mood: a little fine pale sand on the surface with a few shells or weathered driftwood beside the product.',
    moments: [
      'a small drift of fine sand with a finger-drawn curve through it', 'two white scallop shells, one upside down', 'a piece of sun-bleached driftwood',
      'a dried starfish at the edge of the frame', 'a few small pebbles half-buried in sand',
    ] },
  { id: 'rattan', name: 'ไม้ & หวายสาน', hint: 'เก้าอี้ไม้ ตะกร้าสาน ถาดไม้ไผ่',
    brief: 'Natural wood and woven fiber near or under the product, warm and handmade.',
    moments: [
      'the product sitting on a small low wooden stool', 'a woven rattan basket at one side', 'a round woven bamboo tray under the product',
      'a hand-carved wooden bowl', 'a loose coil of jute rope',
    ] },
  // ---- วัสดุ & กราฟิก ----
  { id: 'fabric', name: 'ผ้าลินิน & ผ้าพริ้ว', hint: 'ผ้าลินินพาด ผ้าฝ้ายพับ ซาตินนุ่ม',
    brief: 'A piece of soft fabric draped loosely under, behind or beside the product, in a color that complements it.',
    moments: [
      'a length of silk pooled loosely beside the product', 'a linen napkin folded once with a soft crease in front of the product',
      'a satin ribbon trailing across the surface in a loose curve', 'a crumpled piece of sheer organza behind one side of the product',
      'natural linen draped behind the product in soft folds', 'a folded cotton cloth with a crisp crease under one side of the product',
    ] },
  { id: 'ceramics', name: 'เซรามิก & แจกันปั้นมือ', hint: 'แจกัน ชาม ถ้วยเซรามิกทำมือ',
    brief: 'Handmade ceramics with visible glaze and slightly irregular, hand-thrown shapes, placed beside the product.',
    moments: [
      'a small matte stoneware vase with an uneven rim', 'a shallow glazed bowl, empty', 'a handleless ceramic cup with drips of glaze',
      'two small vases of different heights and tones', 'a speckled ceramic dish holding a single pebble',
    ] },
  { id: 'metal', name: 'ถาดเงิน & สแตนเลส', hint: 'ถาดโลหะขัดเงา จานเงิน ช้อนทรงประติมากรรม',
    brief: 'Polished metal with soft, controlled reflections beside or under the product, cool and editorial.',
    moments: [
      'the product standing on a polished silver tray with rounded corners', 'a small stainless-steel dish beside the product',
      'a sculptural silver spoon lying on the surface', 'a brushed-steel plate at one edge of the frame', 'a shallow silver bowl softly reflecting the set',
    ] },
  { id: 'mirror', name: 'กระจก & เงาสะท้อน', hint: 'กระจกกลม แผ่นกระจกเอียง ถาดกระจก',
    brief: 'Mirrors that play with reflection near the product, each showing a physically believable reflection of the set.',
    moments: [
      'a small round mirror propped up behind the product', 'the product standing on a mirrored tray with its reflection below it',
      'an angled mirror panel at one side', 'a round hand mirror lying face up on the surface',
    ] },
  { id: 'water', name: 'น้ำ & แก้วใส', hint: 'หยดน้ำ ระลอกน้ำ บล็อกแก้วใส แก้วน้ำ',
    brief: 'Clean water and clear glass around the product that catch the light: fresh, pure and minimal.',
    moments: [
      'a few water droplets on the surface around the product', 'a shallow clear glass dish of water with soft ripples beside the product',
      'a clear glass block refracting the light', 'a glass of water with a few tiny bubbles', 'a small clear glass sphere',
    ] },
  { id: 'geometric', name: 'ทรงเรขาคณิต', hint: 'ลูกบาศก์ ทรงกลม ซุ้มโค้ง บล็อกอะคริลิก',
    brief: 'A few clean sculptural geometric forms in plaster, stone-like resin or clear acrylic, arranged as a minimal composition beside or behind the product.',
    moments: [
      'a plaster cube and a sphere of different sizes', 'a small half-arch standing behind one side', 'a clear acrylic block catching the light',
      'a cylinder lying on its side', 'two stacked rectangular blocks in two tones',
    ] },
  { id: 'paper', name: 'กระดาษ & งานศิลป์', hint: 'กระดาษสีพับ การ์ดโค้ง กระดาษทำมือ',
    brief: 'A playful graphic composition of colored or handmade paper around or behind the product, with crisp shadows and no text.',
    moments: [
      'a sheet of colored paper curved into a soft wave behind the product', 'a few paper strips folded into zigzags',
      'a torn edge of textured handmade paper under one side of the product', 'two curved cards in contrasting colors', 'a paper circle leaning at one side',
    ] },
  // ---- ไลฟ์สไตล์ ----
  { id: 'cafe', name: 'มุมคาเฟ่', hint: 'แก้วกาแฟ ครัวซองต์ ก้อนน้ำตาล ช้อน',
    brief: 'A relaxed café-table morning around the product: a few real coffee and food items, casual but tidy, with no branded cups or packaging.',
    moments: [
      'a cup of black coffee on a saucer with a small spoon', 'a croissant on a small plate with a few flakes around it', 'two sugar cubes beside a cup',
      'a glass of iced latte with condensation', 'a half-eaten pastry on a folded paper napkin',
    ] },
  { id: 'desk', name: 'โต๊ะทำงานประจำวัน', hint: 'แล็ปท็อปปิด สมุด ปากกา หูฟัง',
    brief: 'An everyday work desk around the product, arranged neatly as if just arrived at the office; everything unbranded, screens closed.',
    moments: [
      'a closed silver laptop at one side', 'a notebook with a pen lying on it', 'a pair of over-ear headphones',
      'a cup of coffee and a pair of glasses', 'a small potted plant at the back corner',
    ] },
  { id: 'travel', name: 'ของเดินทาง', hint: 'แว่นกันแดด แผนที่พับ หมวกสาน กล้องฟิล์ม',
    brief: 'A few travel objects around the product as if packing for a trip; no tickets, passports or documents.',
    moments: [
      'a pair of tortoiseshell sunglasses, folded', 'a folded paper map', 'a woven straw hat at the edge of the frame',
      'a vintage film camera', 'a small leather luggage tag',
    ] },
  { id: 'outdoor', name: 'เอาท์ดอร์ & แคมป์', hint: 'คาราบิเนอร์ เชือกขด แก้วแคมป์ปิ้ง ลูกสน',
    brief: 'A few rugged outdoor and camping objects placed around the product, as if ready for a hike.',
    moments: [
      'a metal carabiner lying on the surface', 'a coiled climbing rope in a muted color', 'an enamel camping mug with a chipped rim',
      'two pine cones and a few pine needles', 'a brass compass with its lid open',
    ] },
  { id: 'sport', name: 'กีฬา & เวลเนส', hint: 'บล็อกโยคะ เสื่อม้วน ผ้าขนหนู ขวดน้ำเรียบ',
    brief: 'An active wellness moment: a few sport and fitness objects beside the product, clean and energetic.',
    moments: [
      'a cork yoga block', 'a rolled exercise mat', 'a folded gym towel', 'a plain stainless-steel water bottle', 'a skipping rope loosely coiled',
    ] },
  { id: 'spa', name: 'สปา & ห้องน้ำ', hint: 'ผ้าขนหนูม้วน จานสบู่ ฟองน้ำ แปรงไม้',
    brief: 'A calm spa or bathroom moment: soft towels and natural bath objects beside the product, clean and fresh, with no other bottles.',
    moments: [
      'a rolled white waffle towel', 'a bar of soap on a small stone dish', 'a natural sea sponge', 'a wooden body brush', 'a eucalyptus sprig',
    ] },
  { id: 'gift', name: 'กล่องของขวัญ & ริบบิ้น', hint: 'กล่องห่อกระดาษเรียบ ริบบิ้นซาติน',
    brief: 'A festive gifting moment: a few gift boxes wrapped in plain paper, satin ribbon and small seasonal touches beside the product; no tags or cards.',
    moments: [
      'a small box wrapped in plain kraft paper tied with a satin ribbon', 'a loose satin ribbon curling across the surface',
      'a few dried orange slices and a cinnamon stick', 'a gift box with its lid slightly open and tissue paper inside', 'a small sprig of pine',
    ] },
  // ---- แฟชั่น & งานคราฟต์ ----
  { id: 'accessories', name: 'แอคเซสซอรี่แฟชั่น', hint: 'ผ้าพันคอไหม แว่นกันแดด สร้อยมุก ลิปสติก',
    brief: 'A few fashion accessories styled casually beside the product as on a dressing table.',
    moments: [
      'a silk scarf loosely knotted', 'a pair of sunglasses', 'a strand of pearls in a loose curve', 'a gold lipstick tube with its cap off',
      'a pair of gold hoop earrings',
    ] },
  { id: 'books', name: 'หนังสือ & นิตยสาร', hint: 'หนังสือปกเรียบซ้อนกัน นิตยสารคว่ำ',
    brief: 'A few books or magazines with plain covers beside the product.',
    moments: [
      'a short stack of three cloth-bound art books in muted colors', 'an open magazine lying face down with its pages slightly fanned',
      'a single hardcover book lying at one edge of the frame', 'two books leaning against each other',
    ] },
  { id: 'atelier', name: 'โต๊ะช่าง', hint: 'เครื่องมือช่างวางไว้เหมือนเพิ่งวางมือ',
    brief: "A few real tools from a leather maker's or designer's desk placed around the product as if just put down, low and spread out, "
      + 'with one flower stem in a glass on the far side.',
    moments: [
      'a flat paint brush resting on a small black slate', 'a cloth tape measure loosely uncoiled at the edge of the frame',
      'a polished steel pebble catching the light', 'a small stack of leather swatches', 'a pencil lying on a folded sketch on paper',
    ] },
];
// กลุ่มในขั้นพร็อพ (หน้าเว็บ) — ทุก id ใน PROP_STYLES ยกเว้นไม่มีพร็อพ ต้องอยู่ในกลุ่มใดกลุ่มหนึ่ง
export const PROP_GROUPS = [
  { name: 'ธรรมชาติ', ids: ['leaves', 'flower', 'fruit', 'stone', 'beach', 'rattan'] },
  { name: 'วัสดุ & กราฟิก', ids: ['fabric', 'ceramics', 'metal', 'mirror', 'water', 'geometric', 'paper'] },
  { name: 'ไลฟ์สไตล์', ids: ['cafe', 'desk', 'travel', 'outdoor', 'sport', 'spa', 'gift'] },
  { name: 'แฟชั่น & งานคราฟต์', ids: ['accessories', 'books', 'atelier'] },
];
export const propStyle = (id: unknown) => PROP_STYLES.find((p) => p.id === id);
// "AI เลือกให้": ตัววางแผนเลือกแนวพร็อพเองจากรายการนี้ (ไม่รวม "ไม่มีพร็อพ")
export const AUTO_PROP_STYLE = { id: AUTO_PROPS, name: 'AI เลือกให้', hint: 'AI ดูสินค้ากับฉาก แล้วเลือกแนวพร็อพที่เข้ากันที่สุด' };

// ---------- แสง ----------
export type Choice = { id: string; name: string; hint: string; prompt: string };
export const PRODUCT_LIGHTS: Choice[] = [
  { id: 'window', name: 'แสงหน้าต่าง', hint: 'แสงธรรมชาติจากหน้าต่างด้านข้าง เงานุ่ม',
    prompt: 'Soft natural daylight from a large window to the left; gentle, soft-edged shadows fall to the right and slightly behind the product, '
      + 'with soft gradients of light across the wall and surface.' },
  { id: 'softbox', name: 'ไฟสตูดิโอนุ่ม', hint: 'ไฟดวงใหญ่นุ่มมาก สว่างทั่ว เงาจาง',
    prompt: 'One very large, soft, diffuse studio light from the front-left wraps the product evenly with soft fill, so the shadows are faint and '
      + 'soft, with a very soft contact shadow under the product.' },
  { id: 'highkey', name: 'สว่างโปร่ง (ไฮคีย์)', hint: 'สว่างทั้งภาพ แทบไม่มีเงา อมฟ้านิดๆ',
    prompt: 'Very soft, bright, high-key light from all around, like a white room on an overcast day: almost no shadows except a faint, soft '
      + 'contact shadow under the product.' },
  { id: 'overhead', name: 'แสงจากด้านบน', hint: 'แสงฟ้าครึ้มจากด้านบน เงาสั้นรอบสินค้า (เหมาะกับแฟลตเลย์)',
    prompt: 'Soft, even overhead daylight like a bright overcast sky through a skylight; short, soft shadows hug the edges of the product.' },
  { id: 'flash', name: 'แฟลชตรง', hint: 'แฟลชติดกล้อง ไฮไลต์วาว เงาคมด้านหลัง',
    prompt: 'A direct on-camera flash: crisp bright highlights and glossy reflections on the product, a hard-edged dark shadow just behind and '
      + 'below it, and darker falloff toward the edges of the frame.' },
];

// ---------- มุมกล้อง: flat = มองตรงลงมา (สินค้าวางนอน ใช้ flat ของ PRODUCT_TYPES) ----------
// ผู้ใช้ทดสอบ 26 ต.ค. (กระเป๋าควิลท์ รูปสินค้าหน้าตรงพื้นขาว): เลือก "ด้านข้าง" แต่ได้หน้าตรงแบนเหมือนรูปที่อัปโหลดทุกรูป
// คำสั่งเดิมบอกแค่ตำแหน่งกล้อง ("at a right angle to its side") AI ยึดมุมของรูปสินค้าแทน
// -> บอกว่าหมุนสินค้าไปเท่าไร + กล้องเห็นอะไร/ไม่เห็นอะไร (บทเรียนเดียวกับระยะ/มุมของหน้านางแบบ: บอกเป็นภาพที่เห็น AI ทำตามได้ดีกว่า)
// หน้าตรงก็หันนิดๆ + กล้องสูงกว่าเล็กน้อย ให้เห็นความหนา ไม่แบนเหมือนรูปตัดพื้นวางบนฉาก
export type AngleChoice = Choice & { flat?: boolean };
export const PRODUCT_ANGLES: AngleChoice[] = [
  { id: 'front', name: 'หน้าตรง', hint: 'ด้านหน้าตรง เห็นทรงสินค้าชัด',
    prompt: 'the camera a little above the middle of the product, looking slightly down at its front, with the front facing directly toward the camera, '
      + 'so the front faces the camera while the top edge shows in perspective and the product clearly looks '
      + 'three-dimensional, not like a flat cut-out' },
  { id: 'three-quarter', name: 'เฉียง 3/4', hint: 'หมุนสินค้าราว 45 องศา เห็นด้านหน้ากับด้านข้างเต็มๆ',
    prompt: 'the product turned about 45 degrees away from the camera, so its front and one whole side panel are both clearly visible, the front '
      + 'receding in perspective toward its far edge, with the camera a little above the product' },
  { id: 'back', name: 'ด้านหลัง', hint: 'หมุน 180° ให้เห็นด้านหลังจริงของสินค้า',
    prompt: 'the product rotated 180 degrees, its back facing the camera directly, with the front completely hidden' },
  { id: 'bottom', name: 'ด้านล่าง', hint: 'พลิกให้เห็นฐานหรือพื้นรองเท้า',
    prompt: 'the product carefully turned over so its bottom or sole faces the camera, showing the underside clearly' },
  { id: 'side', name: 'ด้านข้าง', hint: 'หมุน 90 องศา เห็นแต่ด้านข้าง โชว์ทรงและความหนา',
    prompt: 'the product turned a full 90 degrees, so the camera looks straight at its narrow side: the front is not visible at all, any handle '
      + 'or strap is seen edge-on, and the side silhouette and depth of the product fill the view' },
  { id: 'above', name: 'สูงนิดๆ มองลง', hint: 'กล้องสูงกว่าสินค้า เห็นด้านบนของสินค้าและพื้นด้านหน้า',
    prompt: 'the camera about 25 degrees above the product, looking down at its front, so its top (the opening, flap or top edge) and the '
      + 'surface in front of it are visible' },
  { id: 'high', name: 'มุมสูง', hint: 'มองลงแรงๆ ราว 60 องศา เห็นด้านบนเป็นหลัก',
    prompt: 'the camera high above the product, looking down at about 60 degrees, so we see mostly its top with the front foreshortened below it' },
  { id: 'top', name: 'มองตรงลงมา (แฟลตเลย์)', hint: 'สินค้าวางนอน ถ่ายจากด้านบนตรงๆ', flat: true,
    prompt: 'the camera directly overhead, looking straight down at the surface, a true flat lay' },
  { id: 'low', name: 'มุมต่ำ', hint: 'กล้องต่ำเกือบติดพื้น สินค้าดูยิ่งใหญ่',
    prompt: 'the camera low, just above the surface, looking slightly up at the product, turned a little so its depth shows, so it looks monumental' },
];

// ---------- ระยะ: lens = เลนส์เฉพาะระยะนี้ (ไม่ใส่ = LENS) ----------
// withProps: ใช้แทน prompt เมื่อมีพร็อพ — สินค้าเล็กลงให้ทั้งกลุ่มอยู่ในภาพ (ทดสอบ 27 ต.ค.: สินค้า 60% พร็อพโดนตัดที่ขอบภาพ)
export type FramingChoice = Choice & { lens?: string; withProps?: string };
export const LENS = 'shot on a full-frame camera with a 70mm lens at f/8, natural perspective with no wide-angle distortion, the whole product sharp';
export const PRODUCT_FRAMINGS: FramingChoice[] = [
  { id: 'wide', name: 'กว้าง ที่ว่างเยอะ', hint: 'สินค้าราว 40% ของความกว้าง เห็นฉากรอบๆ เยอะ',
    prompt: 'the product small in the frame, about 40 percent of the frame width, with generous empty space of the set around it' },
  { id: 'medium', name: 'กลาง', hint: 'สินค้าราว 60% ของความกว้าง',
    prompt: 'the product about 60 percent of the frame width, with some space of the set around it',
    withProps: 'the product about 50 percent of the frame width, its props grouped close around it, with a clear margin of the set on every side of the group' },
  { id: 'close', name: 'ใกล้ เต็มภาพ', hint: 'สินค้าเกือบเต็มภาพ ยังเห็นทั้งชิ้น',
    prompt: 'the product filling most of the frame, about 85 percent of the frame width, its whole silhouette still inside the frame',
    withProps: 'the product filling most of the frame, about 75 percent of the frame width, its whole silhouette inside the frame, its props grouped close behind and beside it' },
  // ทดสอบ 26 ต.ค.: "only part of the product fills the frame" ได้ทั้งใบเต็มภาพ -> บอกว่าเห็นแค่ราว 1/3 ที่เหลือล้นขอบภาพ
  { id: 'detail', name: 'ใกล้มาก ดูรายละเอียด', hint: 'เห็นแค่บางส่วน: ผิวหนัง ฝีเข็ม อะไหล่ โลโก้',
    prompt: 'a close-up crop of one area of the product: the frame shows only about a third of it, such as its clasp or hardware with the '
      + 'material and stitching around it, and the rest of the product runs out past the edges of the frame',
    lens: 'shot on a full-frame camera with a 100mm macro lens at f/4, the nearest details razor sharp and the rest falling softly out of focus' },
];

// ---------- โทนสี (ไม่ได้แยกเป็นขั้น อยู่ในสไตล์) ----------
const MUTED = 'Muted, low-contrast, true-to-life colors with a neutral to slightly cool white balance and fine film grain.';
const DAYLIGHT = 'Natural daylight colors, soft contrast, a neutral to slightly warm white balance and fine film grain.';
const AIRY = 'Bright, airy, low-contrast colors with a slightly cool white balance; whites stay clean but keep their texture.';
const FLASH = 'Crisp contrast with deep blacks and true colors, a slightly raw flash look with fine grain.';

// ---------- สไตล์สำเร็จรูป: 1 สไตล์ = ฉาก + พร็อพ + แสง + มุม + ระยะ + โทนสี จากรูปตัวอย่าง 1 รูป ----------
// ทุกขั้น "ตามสไตล์" = ใช้ส่วนนั้นของสไตล์ที่เลือก เลือกเองแล้วใช้แทน (เหมือนระยะ/มุมกล้องของหน้านางแบบ) — ตัวแรก = ค่าเริ่มต้น
export type ProductPreset = { id: string; name: string; hint: string; set: string; props: string; light: string; angle: string; framing: string; grade: string };
export const PRODUCT_PRESETS: ProductPreset[] = [
  { id: 'clean', name: 'Clean studio', hint: 'พื้นขาว แสงนุ่ม สีสินค้าตรง เห็นรายละเอียดชัด',
    set: 'cove', props: NO_PROPS, light: 'softbox', angle: 'front', framing: 'close', grade: 'Neutral white balance, accurate product colors, clean whites, no film grain or color cast.' },
  { id: 'pastel', name: 'พาสเทลสองโทน', hint: 'ฉากสองสีพาสเทล ไฟนุ่ม ที่ว่างเยอะ มินิมอลสุด',
    set: 'pastel', props: NO_PROPS, light: 'softbox', angle: 'front', framing: 'wide', grade: MUTED },
  { id: 'still-life', name: 'Still life ผลไม้', hint: 'โต๊ะขาว ผลไม้สีรับกับสินค้า แสงหน้าต่าง ขี้เล่น',
    set: 'table', props: 'fruit', light: 'window', angle: 'three-quarter', framing: 'medium', grade: DAYLIGHT },
  { id: 'atelier', name: 'โต๊ะช่าง', hint: 'โต๊ะไม้ดิบ เครื่องมือช่าง ดอกไม้ในแก้ว เล่าเรื่องงานคราฟต์',
    set: 'plywood', props: 'atelier', light: 'window', angle: 'front', framing: 'wide', grade: DAYLIGHT },
  { id: 'plinth', name: 'บนแท่นประติมากรรม', hint: 'วางบนของแปลกตาเป็นแท่น ผนังเรียบ ดูเป็นงานศิลป์',
    set: 'plinth', props: NO_PROPS, light: 'softbox', angle: 'front', framing: 'medium', grade: MUTED },
  { id: 'ledge', name: 'ขอบบัวสีขาว', hint: 'ขาวทั้งภาพ สว่างโปร่ง เฉียง 3/4 เห็นทรง',
    set: 'ledge', props: NO_PROPS, light: 'highkey', angle: 'three-quarter', framing: 'medium', grade: AIRY },
  { id: 'cove', name: 'ฉากเทาไร้รอยต่อ', hint: 'ฉากกระดาษเทาอ่อน ไฟสตูดิโอนุ่ม สะอาดตา',
    set: 'cove', props: NO_PROPS, light: 'softbox', angle: 'above', framing: 'medium', grade: MUTED },
  { id: 'linen', name: 'ผ้าปูที่นอน', hint: 'ผ้าฝ้ายยับเป็นพื้นและฉากหลัง แสงนุ่มอมฟ้า',
    set: 'linen', props: NO_PROPS, light: 'highkey', angle: 'front', framing: 'medium', grade: AIRY },
  { id: 'flatlay', name: 'แฟลตเลย์ปูน', hint: 'วางนอนบนพื้นปูน ถ่ายจากด้านบนตรงๆ',
    set: 'concrete', props: NO_PROPS, light: 'overhead', angle: 'top', framing: 'medium', grade: MUTED },
  { id: 'flash', name: 'ผ้าดำ แฟลช', hint: 'ผ้าดำยับ แฟลชตรง วาวๆ ดูแฟชั่นจัด',
    set: 'dark-fabric', props: NO_PROPS, light: 'flash', angle: 'high', framing: 'medium', grade: FLASH },
];
export const productPreset = (id: unknown) => PRODUCT_PRESETS.find((p) => p.id === id) ?? PRODUCT_PRESETS[0];
// Custom Packshot ไม่มีขั้นเลือกสไตล์แล้ว (27 ต.ค.): ฉากที่เลือกพาสไตล์ที่คู่กันมาเอง (โทนสี + พร็อพ/มุม/ระยะเริ่มต้น)
const SCENE_PRESETS: Record<string, string> = {
  pastel: 'pastel', table: 'still-life', plywood: 'atelier', plinth: 'plinth', ledge: 'ledge', cove: 'cove',
  linen: 'linen', concrete: 'flatlay', plaster: 'plinth', 'dark-fabric': 'flash',
};
export const scenePreset = (setId: string) => productPreset(SCENE_PRESETS[setId] ?? 'still-life');

// ---------- ช็อตต้นแบบ: อัปโหลดรูปสินค้าของแบรนด์อื่นที่ชอบ แล้วเอาบางส่วนมาใช้กับสินค้าเรา (เหมือนรูปท่าโพสต์ของหน้านางแบบ) ----------
export const REF_MODES = [
  { id: 'shot', name: 'ลอกทั้งช็อต', hint: 'ฉาก พร็อพ แสง มุมกล้อง และระยะ ตามรูปต้นแบบทั้งหมด เปลี่ยนแค่สินค้า' },
  { id: 'set-light', name: 'ลอกฉาก + แสง', hint: 'ฉากและแสงตามรูปต้นแบบ · พร็อพ มุมกล้อง ระยะ ตามที่เลือก' },
  { id: 'light', name: 'ลอกแค่แสง/โทนสี', hint: 'เอาแค่แสงและโทนสีจากรูปต้นแบบ อย่างอื่นตามที่เลือก' },
] as const;
export type RefMode = (typeof REF_MODES)[number]['id'];

// ---------- ชุดภาพสินค้า: รูปแรกตามที่เลือก แล้วสร้างมุมอื่นจากรูปแรก (ฉาก/แสงเดียวกัน แบบ carousel ของรูปตัวอย่าง #7 -> #8) ----------
// มุมที่ซ้ำกับรูปแรกถูกข้าม เอา 3 มุมแรกที่เหลือ (lib/packshot-prompts.ts ใช้ angle/framing ตาม id ในรายการด้านบน)
export type SetShot = { id: string; name: string; angle: string; framing: string };
export const PRODUCT_SET_SHOTS: SetShot[] = [
  { id: 'front', name: 'Front', angle: 'front', framing: 'close' },
  { id: 'back', name: 'Back', angle: 'back', framing: 'close' },
  { id: 'side', name: 'Side', angle: 'side', framing: 'close' },
  { id: 'three-quarter', name: '45°', angle: 'three-quarter', framing: 'close' },
  { id: 'top', name: 'Top', angle: 'top', framing: 'close' },
  { id: 'bottom', name: 'Bottom', angle: 'bottom', framing: 'close' },
];
export const SET_SIZE = 4;
export const setShotsAfter = (heroAngle: string) => PRODUCT_SET_SHOTS.slice(0, SET_SIZE).filter((s) => s.id !== heroAngle);

// ประเภทภาพกำหนดตัวเลือกที่เข้ากัน ทั้งหน้าเว็บและ API ใช้ชุดเดียวกัน
export const SHOT_TYPES = [
  { id: 'creative', name: 'Creative Packshot', hint: 'AI คิด 3 ไอเดียภาพ (ฉาก พร็อพ แสง) จากสินค้า ไอเดียของคุณ หรือภาพแรงบันดาลใจ', usage: 'Editorial / Social / Campaign' },
  { id: 'clean', name: 'Clean Packshot', hint: 'สินค้าเดี่ยว พื้นขาว / พื้นเรียบ เห็นทรงชัด', usage: 'Product Listing / Marketplace' },
  { id: 'multi', name: 'Multi-angle Packshot', hint: 'Front / Back / Side / 45° เป็นชุด ฉากและแสงเดียวกัน', usage: 'PDP / แสดงสินค้าครบทุกมุม' },
  { id: 'detail', name: 'Detail / Close-up', hint: 'ซูมวัสดุ โลโก้ ตะเข็บ ซิป หรืออะไหล่', usage: 'PDP / แสดงคุณภาพและฟีเจอร์' },
  { id: 'scale', name: 'Scale / Size Reference', hint: 'เทียบขนาดกับมือ คน หรือวัตถุที่รู้ขนาด', usage: 'PDP / ช่วยเข้าใจขนาดจริง' },
  { id: 'styled', name: 'Custom Packshot', hint: 'เลือกฉาก พร็อพ มุมกล้อง และระยะเองทีละส่วน', usage: 'PDP / Social / Campaign' },
] as const;
export type ShotType = (typeof SHOT_TYPES)[number]['id'];
export const DETAIL_TARGETS: Choice[] = [
  { id: 'texture', name: 'วัสดุ / Texture', hint: 'เห็นเนื้อวัสดุและผิวสัมผัส', prompt: 'material texture and surface grain' },
  { id: 'logo', name: 'Logo', hint: 'โลโก้และตัวอักษรตามสินค้าจริง', prompt: 'the existing logo and lettering, copied exactly from the source' },
  { id: 'stitching', name: 'Stitching', hint: 'ตะเข็บและงานเย็บ', prompt: 'stitching, seams and edge finishing' },
  { id: 'zipper', name: 'Zipper', hint: 'ซิปและตัวดึงซิป', prompt: 'the existing zipper and zipper pull' },
  { id: 'hardware', name: 'Hardware', hint: 'ตัวล็อก ห่วง และอะไหล่', prompt: 'the existing clasp, rings and hardware' },
  { id: 'feature', name: 'จุดอื่นๆ', hint: 'ระบุฟีเจอร์ที่ต้องการด้านล่าง', prompt: 'the specific feature described by the user' },
];
export const SCALE_REFERENCES: Choice[] = [
  { id: 'hand', name: 'ถือในมือ', hint: 'มือผู้ใหญ่ถือสินค้า เห็นสัดส่วนชัด', prompt: 'one anatomically natural adult hand holding the product, with realistic hand proportions' },
  { id: 'person', name: 'คนถือ / สวมใส่', hint: 'เห็นสินค้าเทียบกับคน', prompt: 'an adult person naturally holding or wearing the product, with realistic human proportions' },
  { id: 'paper', name: 'กระดาษ A4', hint: '21 × 29.7 ซม.', prompt: 'one flat A4 sheet measuring exactly 21 by 29.7 cm, beside the product on the same plane' },
  { id: 'laptop', name: 'Laptop', hint: 'ระบุขนาดเครื่องจริงด้านล่าง', prompt: 'a laptop beside the product on the same surface, using the reference dimensions supplied by the user' },
];
export const plainShot = (id: unknown) => id === 'clean' || id === 'multi';
// มุมที่เสนอให้เลือกตามจุดประสงค์ของภาพ ไม่มีมุมสูงที่ความหมายซ้ำกัน
export const automaticProductAngle = (id: unknown) => id === 'detail' || id === 'scale';
export function shotAngles(id: unknown): AngleChoice[] {
  const ids = id === 'styled' ? ['front', 'three-quarter', 'side', 'above', 'top', 'low']
    : ['front', 'three-quarter', 'side', 'back', 'top', 'bottom'];
  return ids.map((key) => {
    const angle = PRODUCT_ANGLES.find((a) => a.id === key)!;
    return { ...angle, name: key === 'three-quarter' ? '45°' : key === 'top' ? (id === 'styled' ? 'Flat lay' : 'ด้านบน')
      : key === 'above' ? 'มองลงเล็กน้อย' : angle.name };
  });
}
// ใช้ร่วมกันในหน้าจอและ API เพื่อไม่ให้ค่ามุมเก่าทับโหมดอัตโนมัติ
export function resolveProductAngle(shot: unknown, requested: unknown, presetAngle: string, target?: unknown, reference?: unknown): AngleChoice {
  if (shot === 'detail') {
    const detail = DETAIL_TARGETS.find((d) => d.id === target) ?? DETAIL_TARGETS[0];
    return { id: 'auto', name: 'อัตโนมัติตามจุดที่เลือก', hint: `จัดมุมเพื่อให้เห็น ${detail.name} ชัดที่สุด`,
      prompt: `choose the camera orientation specifically for ${detail.prompt}: face a logo or flat marking straight on so it is readable without perspective distortion; use a slight oblique view for a zipper, stitching, texture or hardware to reveal its depth; for another feature use the supplied feature description and source photos to select the clearest view. The selected detail determines the angle, not the source photo's overall viewpoint` };
  }
  if (shot === 'scale') {
    const scale = SCALE_REFERENCES.find((r) => r.id === reference) ?? SCALE_REFERENCES[0];
    return { id: 'auto', name: 'อัตโนมัติตามวิธีเทียบขนาด', hint: `จัดสินค้าและ${scale.name}ให้อยู่ระยะเดียวกัน`,
      flat: scale.id === 'paper',
      prompt: scale.id === 'paper'
        ? 'the camera directly overhead, with the product and the A4 sheet beside each other on the same plane, both completely visible, without foreshortening or forced perspective'
        : `the camera level with the middle of the product, looking straight on with minimal perspective distortion; keep the product and ${scale.id === 'laptop' ? 'laptop' : 'holding hand or person'} at the same distance from the camera so their relative sizes are honest. Do not use a low angle, wide-angle exaggeration or forced perspective` };
  }
  const choices = shotAngles(shot);
  const fallback = choices.find((a) => a.id === presetAngle) ?? choices.find((a) => a.id === 'above') ?? choices[0];
  return shot === 'multi' ? choices[0] : choices.find((a) => a.id === requested) ?? (shot === 'styled' ? fallback : choices[0]);
}
export const shotFramings = (id: unknown) => PRODUCT_FRAMINGS.filter((f) => id === 'detail' ? f.id === 'detail' : id === 'styled' || f.id !== 'detail');
export const automaticProductSet = (id: unknown) => id === 'detail' || id === 'scale';
export const shotSets = (id: unknown, reference?: unknown) => SETS.filter((s) => id === 'styled'
  || s.id === (id === 'scale' && (reference === 'paper' || reference === 'laptop') ? 'table' : 'cove'));
export const sceneLightId = (id: string) => ({ table: 'window', plywood: 'window', linen: 'highkey', ledge: 'highkey', concrete: 'overhead', plaster: 'window', 'dark-fabric': 'flash' }[id] ?? 'softbox');
export function sceneColors(shot: unknown, scene: ProductSet): BackdropColor[] {
  if (shot === 'detail' || !colorable(scene)) return [];
  const palette = shot !== 'styled' ? ['white', 'light-grey', 'cream']
    : scene.id === 'linen' ? ['white', 'cream', 'greige', 'blush']
    : scene.id === 'plywood' ? ['white', 'cream', 'blue-grey', 'sage']
    : scene.id === 'table' || scene.id === 'plinth' ? ['white', 'cream', 'greige', 'sage']
    : ['white', 'light-grey', 'cream', 'lilac', 'blue-grey', 'blush'];
  const ids = shot === 'styled' ? ['match', 'set', ...palette] : palette;
  return ids.map((id) => BACKDROP_COLORS.find((c) => c.id === id)!);
}
// รวมกฎฉาก สี และแสงให้หน้าจอกับ API ได้คู่เดียวกันเสมอ
export function resolveProductBackground(shot: unknown, preset: ProductPreset, sceneId: unknown, colorId: unknown, lightId: unknown, reference?: unknown) {
  const choices = shotSets(shot, reference);
  const fallback = choices.find((s) => s.id === preset.set) ?? choices[0];
  const set = automaticProductSet(shot) ? choices[0] : choices.find((s) => s.id === sceneId) ?? fallback;
  const colors = sceneColors(shot, set);
  const color = colors.find((c) => c.id === colorId) ?? colors[0] ?? BACKDROP_COLORS[0];
  const defaultLight = shot === 'styled' && set.id === preset.set && (sceneId == null || sceneId === 'preset')
    ? preset.light : shot === 'detail' || shot === 'scale' ? 'softbox' : sceneLightId(set.id);
  const light = PRODUCT_LIGHTS.find((l) => l.id === lightId) ?? PRODUCT_LIGHTS.find((l) => l.id === defaultLight)!;
  return { set, color, light, colors, automatic: automaticProductSet(shot) };
}

// ---------- สัดส่วนภาพ: 4:5 = ฟีด IG (รูปตัวอย่างเกือบทั้งหมด) ----------
// OpenAI ทำได้แค่ 2:3 / 1:1 / 3:2 -> server ทำขนาดใกล้สุดแล้วตัดตรงกลางให้ได้สัดส่วนนี้ (lib/images.ts cropTo)
// หน้าเว็บเลือกตาม "ใช้ภาพที่ไหน" (ปรับ 28 ต.ค.): name = ที่ที่จะโพสต์ use = ใช้ทำอะไร · เรียงตามที่ใช้บ่อย
// รายการเดียวกับหน้านางแบบ (lib/aspects.ts)
export { PLATFORM_ASPECTS as PRODUCT_ASPECTS, isPlatformAspect as isProductAspect } from './aspects';
