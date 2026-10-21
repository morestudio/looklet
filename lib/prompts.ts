// prompts.ts — คำสั่งที่ส่งให้ AI เจนรูป (ใช้ฝั่ง server เท่านั้น)
// สร้างคำสั่งตามสิ่งที่เลือก — รูปที่ส่งไปเรียงเป็น: 1 นางแบบ, (ชุด), (ของเสริม...), (ท่าโพสต์), (ฉาก)
// เขียนเป็นภาษาอังกฤษเพราะโมเดลเจนรูปเข้าใจแม่นกว่า
import type { PoseMode } from './catalog';

// ใช้เมื่อเลือก "แสงสี" — คำว่า photorealistic มักได้ผิวพลาสติกแบบ CG เลยบรรยายสิ่งที่กล้องจริงเห็นแทน
export const REALISM =
  'It must look like an unretouched photo of a real person taken with a real camera, not a CGI render or an AI image. '
  + 'Skin: real texture with visible pores and fine facial hair, a little natural unevenness and a subtle sheen; '
  + 'not sweaty or oily, no airbrushing, no beauty filter, no plastic or waxy skin. '
  + 'Hair: individual strands and a few flyaway hairs, not a smooth solid mass. '
  + 'Clothes: real fabric texture and weight, wrinkles and creases where the body bends, visible seams and stitching. '
  // เงา: เดิมสั่ง "dark contact shadows" + "not flat or evenly lit" ทุกรูป -> ในห้องแสงนุ่ม (ออฟฟิศ) AI ใส่เงาเข้มเกินของจริง
  // เทียบกับรูป iPhone จริง 20 ต.ค.: ของจริงเงาจางมาก หน้าต่างเกือบขาวจ้า -> ให้เงา/ความสว่างเป็นไปตามแสงในฉาก
  + 'Light: one consistent light setup falls on both the person and the surroundings: real shadows and highlights on the face, body '
  + 'and clothes with natural falloff; the person casts a shadow on the floor or nearby walls in the same direction and softness as '
  + 'the other shadows in the scene, with contact shadows where they touch the ground that are only as dark as the other contact '
  + 'shadows in the scene; nearby surfaces bounce a little of their color onto the skin and clothes. Shadows are only as dark and '
  + 'sharp as the scene\'s light would really make them: under soft, diffuse light they stay soft and faint. Very bright areas such '
  + 'as windows may clip to white as on a real camera, while white clothes keep their texture. '
  + 'Color: natural, slightly muted color like a real camera, true-to-life skin tones, subtle grain; '
  + 'not oversaturated, not over-sharpened, no glow.';

// ขนาดคนกับฉาก: สไตล์สั่ง "เต็มความสูงภาพ" AI ขยายคนแทนที่จะขยับกล้องเข้าใกล้ ฉากยังไกลเท่ารูปฉาก คนเลยดูตัวใหญ่ผิดธรรมชาติ
// (เจอ 20–21 ต.ค.: โซฟา/เก้าอี้ออฟฟิศดูเล็กกว่าตัวคน) -> บอกขนาดจริงของคนและของรอบตัว + ให้ขยับกล้องเข้าใกล้แทนการขยายคน
export const SCALE = 'Real-world scale: she is an adult about 1.65 to 1.70 m tall, and everything in the location keeps its true size next to '
  + 'her: doors about 2 m tall with the top of the frame well above her head, ceilings about 2.7 m high, the seats of chairs and sofas at '
  + 'about knee height, tables at about hip height and counters at about waist height. Never enlarge her against an unchanged background: '
  + 'if she has to look larger in the frame, the camera is closer to her, so the location is seen from that closer viewpoint, with fewer '
  + 'and larger background objects and natural perspective.';

// ของเสริม: AI ชอบวาดสินค้าใหม่ให้ "คล้ายๆ" ต้องสั่งให้เหมือนรูปสินค้าทุกรายละเอียด
export const ACCESSORY_RULES =
  'Add these accessories to the model exactly as they look in their product photos: same shape, proportions, '
  + 'color, material, texture, logos and hardware; do not redesign or simplify them. Wear or hold each one naturally '
  + 'where it belongs, at a realistic size relative to the body, lit by the same light as the rest of the photo with '
  + 'matching shadows. Ignore any people, hands, mannequins, packaging or background in the product photos.';

export type PromptInput = {
  hasOutfit: boolean;
  hasSceneImage: boolean;
  sceneText?: string | null;
  extra?: string | null;
  look?: string | null; // แสง/เลนส์/มุมกล้อง/โทนสีของสไตล์ถ่ายภาพที่เลือก (presetPrompt ใน catalog) null = ไม่สั่ง
  fullBody?: boolean;
  accessories?: string[]; // คำบรรยายของเสริมแต่ละชิ้น เรียงตามรูปที่ส่ง
  hasPose?: boolean; // มีรูปท่าโพสต์ (ส่งต่อจากของเสริม ก่อนฉาก)
  autoPose?: boolean; // "AI เลือกท่าให้": ไม่มีรูปท่า ให้ AI จัดท่าเองให้สินค้าเด่น
  poseHints?: string[]; // ท่าที่ทำให้ของเสริมแต่ละชิ้นเด่น (show ใน ACCESSORY_TYPES) ใช้คู่กับ autoPose
  poseMode?: PoseMode; // เอาอะไรจากรูปท่าโพสต์ (POSE_MODES) ใช้คู่กับ hasPose
  framing?: string | null; // ระยะของสไตล์ถ่ายภาพ (framing ใน PRESETS) ใส่ในบรรทัดแรก
  gaze?: string | null; // การมอง (GAZES)
  props?: string[]; // พร็อพในมือ (PROPS)
  face?: string | null; // สีหน้าที่เลือก (FACE_MOODS) null = ไม่สั่ง
  faceFromRef?: boolean; // สีหน้าแบบ "อัตโนมัติ" + มีรูปท่าโพสต์ -> ลอกสีหน้าจากรูปท่า
  refLight?: string | null; // ลอกทั้งช็อต: แสงในรูปต้นแบบที่ AI อ่านมาแล้ว (describeLighting) — ใช้เมื่อไม่ได้ส่ง look
  sceneLight?: string | null; // แสงในรูปฉากที่อัปโหลด ที่ AI อ่านมาแล้ว (describeLighting)
  posePlan?: string | null; // ท่าสำเร็จรูป: ท่าที่ AI ตัววางแผนเขียนให้ (planPose) ใช้แทน autoPose เมื่อไม่มีรูปท่า
  // ระยะ/มุมกล้องที่ผู้ใช้เลือกเอง (ขั้นระยะ/มุมกล้อง ไม่ใช่ "ตามสไตล์"): สั่งย้ำท้ายคำสั่ง + ไม่ให้ลอกกรอบภาพ/มุมจากรูปท่าและรูปฉาก
  // ทดสอบ 21 ต.ค.: ใส่แค่ในบรรทัดแรก/ใน Camera: AI ยึดรูปท่าเต็มตัว (ท่าจับเท้า) และระดับสายตาของรูปฉาก ระยะ/มุมแทบไม่เปลี่ยน
  camera?: { framing: string | null; angle: string | null } | null;
};

export function buildPrompt({
  hasOutfit, hasSceneImage, sceneText, extra, look, fullBody = true, accessories = [], hasPose = false, autoPose = false, poseHints = [],
  poseMode = 'pose', framing = null, gaze = null, props = [], face = null, faceFromRef = false, refLight = null, sceneLight = null,
  posePlan = null, camera = null,
}: PromptInput) {
  // ลอกทั้งช็อต: มุมกล้อง/ระยะ/การมอง/แสง/โทนสีเอาจากรูปต้นแบบ -> ไม่ใช้ framing/look ของสไตล์ถ่ายภาพ (คำสั่งจะขัดกัน)
  const shot = hasPose && poseMode !== 'pose';
  const shotScene = hasPose && poseMode === 'shot-scene';
  let first: string;
  if (shot) {
    first = 'Create one fashion photograph.';
  } else if (framing) {
    first = `Create one fashion photograph, ${framing}.`;
  } else if (!fullBody) { // ต้องบอกตั้งแต่บรรทัดแรก ไม่งั้น AI ยึดรูปนางแบบเต็มตัวแล้วออกมาเต็มตัวเหมือนเดิม
    first = 'Create one close-up fashion photograph, framed from the waist up with the legs and feet out of frame.';
  } else {
    first = look ? 'Create one full-body fashion photograph.' : 'Create one photorealistic full-body fashion photograph.';
  }
  // เปลี่ยนท่า -> ห้ามสั่ง "ท่าเดิม" ไม่งั้นคำสั่งขัดกันเอง, แค่หันหน้า/ถือพร็อพ -> ท่าคล้ายเดิม ขยับเฉพาะที่สั่ง
  const smallPoseChange = !shot && (gaze || props.length);
  const lines = [
    first,
    hasPose || autoPose || posePlan
      ? 'Image 1 is the model. Keep the same person: identical face, facial features, hairstyle and body shape.'
      : smallPoseChange
        ? 'Image 1 is the model. Keep the same person: identical face, facial features, hairstyle and body shape, '
          + 'and a similar pose, changed only as described below.'
        : 'Image 1 is the model. Keep the same person: identical face, facial features, hairstyle, body shape and pose.',
  ];
  if (look || shot) {
    // สั่งให้ทำผิวใหม่เฉยๆ AI จะวาดหน้าใหม่ทั้งหน้าจนเป็นคนอื่น ต้องบอกว่าเปลี่ยนได้แค่ผิวกับแสง
    lines.push(
      'The face must stay recognizably the same person: same face shape, eye shape, eyelids, eyebrows, nose, lips, '
      + 'jawline, cheek fullness and age. Only the skin surface and the lighting may look different from image 1: '
      + 'do not copy its airbrushed skin or flat lighting, but never change the facial structure.');
  }
  let n = 2;
  if (hasOutfit) {
    lines.push(`Image ${n} shows an outfit worn by someone else: dress the model in exactly this outfit `
      + `(same garments, colors, patterns and fit). Ignore the face, body and background of image ${n}. `
      + 'Completely replace the clothes the model wears in image 1: none of the original garments '
      + '(for example shorts under a skirt) may remain visible.');
    n += 1;
  } else {
    lines.push('Keep the outfit the model is wearing in image 1.');
  }
  if (accessories.length) {
    for (const what of accessories) {
      lines.push(`Image ${n} is a product photo of ${what}.`);
      n += 1;
    }
    lines.push(ACCESSORY_RULES);
  }
  if (hasPose) {
    // รูปท่ามักเป็นรูปแฟชั่นที่มีแว่น/กระเป๋า/ชุดของคนอื่น ต้องบอกชัดว่าเอาอะไร ไม่งั้น AI ลอกของติดมาด้วย
    if (!shot) {
      lines.push(`Image ${n} is only a pose reference: pose the model exactly like the person in image ${n} `
        + '(stance, weight shift, leg and foot position, arm and hand placement, torso turn, head tilt and gaze direction). '
        + `Copy only the pose. Do not copy anything else from image ${n}: not the face, hair, body shape, clothes, `
        + 'accessories such as sunglasses, jewelry or bags, or the background.'
        + (camera ? ` Copy only the body pose, not how image ${n} is framed or the height and angle of its camera.` : ''));
    } else {
      // เลือกสีหน้าเอง -> ไม่ลอกสีหน้า, เลือกแสงของสไตล์ถ่ายภาพ (look) -> ไม่ลอกแสง/โทนสี (คำสั่งจะขัดกัน)
      const copy = ['its pose', 'camera angle and height', 'lens and framing', 'how large the person is and where they stand in the frame',
        'gaze direction', ...(face ? [] : ['expression']), ...(look ? [] : ['lighting and color grading'])];
      lines.push(`Image ${n} is a reference photo for the whole shot: recreate ${copy.slice(0, -1).join(', ')}, and ${copy.at(-1)}. `
        + `Use only the shot from image ${n}: do not copy that person's face, hair, body shape, clothes or accessories.`
        + (shotScene
          ? ` Place the model in the same location as image ${n}: same background, setting, time of day${look ? '' : ' and light'}.`
          : ` Do not copy the background of image ${n}.`)
        + (look ? ` Use the lighting described below instead of the lighting of image ${n}.` : ''));
      // สั่งแค่ "recreate its lighting" AI ทำแสงนุ่ม/มืดลงเสมอ -> ส่งคำบรรยายแสงจริงที่ AI อ่านจากรูปต้นแบบมาด้วย (ทดสอบ 19 ต.ค.)
      if (!look && refLight) {
        lines.push(`Lighting exactly like image ${n}: ${refLight} Match this lighting closely; do not make it softer, dimmer or flatter than in image ${n}.`);
      }
    }
    // หน้าตรงแปะบนตัว: รูปนางแบบมักหันหน้าตรงกล้อง AI เลยวาดหน้าตรงบนตัวที่หัน/เอียง ดูไม่เป็นธรรมชาติ
    // ต้องบอกตรงๆ ว่าห้ามลอกมุมหน้าจากรูปนางแบบ (ทดสอบ 19 ต.ค.: ใส่บรรทัดนี้แล้วมุมหัว/หน้าเป็นธรรมชาติทันที)
    lines.push(`Image 1 may show the model facing the camera straight on; do not copy that head angle. Turn and tilt her head exactly like `
      + `the person in image ${n}, and show her face naturally from that angle as seen by the camera, with natural foreshortening and `
      + 'the neck and shoulders connecting naturally to the head. It must not look like a front-facing face placed on a turned or tilted body.');
    if (faceFromRef && !face) {
      lines.push(`Expression: copy the facial expression of the person in image ${n} (how much she smiles, how open the mouth is and `
        + 'the mood of the eyes), not the expression in image 1.');
    }
    // เสื้อผ้าคนในรูปท่าติดมา: ทดสอบ 19 ต.ค. ชายกระโปรงลูกไม้ยาวในรูปท่าที่ตกลงพื้นข้างสุนัข AI นึกว่าเป็นของในฉาก โผล่มาทุกรอบ
    // บอกกว้างๆ ว่าห้ามติดมายังไม่พอ ต้องบอกว่าส่วนที่ห้อยลงพื้น/เฟอร์นิเจอร์ก็เป็นเสื้อผ้า ไม่ใช่ของในฉาก
    lines.push(`None of the clothing, fabric or accessories of the person in image ${n} (for example a dress, lace or straps) `
      + `may appear anywhere in the image. Any part of that person's clothing that drapes onto the furniture or hangs down to the floor `
      + '(for example the hem of a long dress beside an animal or a chair) belongs to her outfit, not to the location: leave it out completely.');
    // ท่าต้องตรงเป๊ะ: ฉากที่เลือกไม่มีที่นั่ง/ที่พิง AI มักเปลี่ยนเป็นท่ายืน -> สั่งให้เติมของที่เข้ากับฉากแทน (ไม่ต้องเหมือนในรูปท่า)
    // ต้องเป็นของชนิดเดียวกัน: ทดสอบ 15 ต.ค. ท่านั่งโซฟาแขนพาดพนัก ในสตูดิโอโล่ง AI ให้นั่งพื้นแทน แขนเลยลอยพาดอากาศ
    lines.push('The pose must match exactly, including whether the person is standing, walking, sitting, leaning or crouching; '
      + 'never switch to a different or easier pose. If the pose relies on something to sit on, lean against or hold '
      + '(such as a chair, sofa, armchair, steps, ledge, wall, door or railing) and the location has nothing suitable, add one that belongs '
      + 'naturally in the location, matching its style, materials, colors, scale, perspective and lighting, '
      + 'with real contact and shadows where the body touches it. '
      + `Use the same kind of support as in image ${n}, with the same seat height and the same parts the body rests on `
      + '(for example a backrest, or armrests for arms draped over them): never sit on the floor instead, '
      + 'and never leave an arm or leg resting on empty air. In a studio, a set piece placed on the backdrop belongs naturally. '
      + `It does not have to look like the one in image ${n}.`);
    // รูปท่ามักแคปจากมือถือ (IG/Pinterest) ติดแถบแอป ชื่อบัญชี ปุ่มไลก์มาด้วย
    lines.push(`Image ${n} may be a phone screenshot: ignore any app interface, text, icons or buttons in it.`);
    n += 1;
  } else if (posePlan) {
    // ท่าที่วางแผนจากฉากจริง (ท่าสำเร็จรูป) — รูปนางแบบมักยืนตรงหน้าตรงในสตูดิโอ ต้องบอกว่าห้ามลอกท่า/มุมหัว/สีหน้าจากรูปนั้น
    lines.push(`Pose and body language, planned for this location: ${posePlan} `
      + 'Image 1 may show the model in a straight studio pose facing the camera; do not copy her pose, head angle or expression from image 1. '
      + 'Keep the face clearly visible: hands must not cover the eyes, nose or mouth.');
  } else if (autoPose) {
    // ให้ AI คิดท่าเอง แต่บอกไอเดียตามของที่ใส่ (แว่น -> จับแว่น, กระเป๋า -> ถือขึ้นมา) ไม่งั้นมักยืนตรงเฉยๆ
    // ให้เลือกแค่ 1–2 อย่าง: ใส่ของ 3 ชิ้นแล้วสั่งทำทุกท่าพร้อมกัน มือไม่พอ ท่าจะดูฝืน
    // ห้ามมือบังหน้า: ขั้นใส่หน้าจริงแปะทั้งกรอบหน้า มือที่บังอยู่จะหายไป
    const hints = [...new Set(poseHints)];
    lines.push('Choose a new, natural and confident fashion pose that shows off the products, '
      + "with the outfit's fit, silhouette and details clearly visible."
      + (hints.length ? ` Interact with the accessories naturally, using one or two of these ideas that work well together: ${hints.join('; ')}.` : '')
      + ' Keep the face clearly visible: hands must not cover the eyes, nose or mouth.');
  }
  const newScene = shotScene || hasSceneImage || sceneText;
  if (shotScene) {
    // ฉากมาจากรูปต้นแบบ (บอกไว้แล้วด้านบน)
  } else if (hasSceneImage) {
    lines.push(`Image ${n} is the location: place the model in this scene. Ignore any people in image ${n}.`);
    // แสงในรูปฉากจริง: ไม่บอก AI ใส่แสง/เงาแบบช่างภาพเอง (เทียบกับรูป iPhone จริง 20 ต.ค. ห้องแสงนุ่ม แต่ AI ใส่เงาเข้ม)
    if (sceneLight) {
      lines.push(`The light in image ${n}: ${sceneLight} Light the model with this same light so she belongs in the scene; `
        + 'do not add stronger, darker or sharper shadows than this light would make.');
    }
  } else if (sceneText) {
    lines.push(`Place the model in this location: ${sceneText}.`);
  } else {
    lines.push('Keep the original background of image 1.');
  }
  if (newScene) {
    // ถ้าไม่สั่งชัดๆ AI มักเก็บแสงสตูดิโอจากรูปนางแบบไว้ ผลจะดูเหมือนตัดแปะ
    // เลือกมุมกล้องเอง: ไม่สั่งให้ตรงระดับสายตาของรูปฉาก (ไม่งั้นมุมไม่เปลี่ยน) ให้วาดฉากเดิมจากตำแหน่งกล้องใหม่แทน
    // ระยะใกล้ไม่เห็นเท้า: ไม่สั่งเงาที่เท้า
    lines.push(
      'It must look like a single real photo taken on location, not a cut-out pasted onto a background: '
      + 'do not keep the studio lighting of image 1. Relight the model to match the scene '
      + '(light direction, color temperature, brightness and contrast), '
      + (fullBody ? 'add natural contact shadows where the feet touch the ground and soft shadows cast away from the light, '
        : 'add soft shadows cast away from the light, ')
      + (camera?.angle
        ? 'show the location from the chosen camera position, re-creating its perspective for that camera height and angle, and match its '
          + 'scale, depth of field, sharpness, color grading and grain. '
        : 'and match the camera perspective, eye level, scale, depth of field, sharpness, color grading and grain of the scene. ')
      + SCALE + " Keep the model's natural skin tone, only as affected by the scene lighting.");
  }
  if (shot) lines.push(REALISM, ...(look ? [look] : [])); // ลอกทั้งช็อต: look = แค่แสง/โทนสีของสไตล์ (presetLightPrompt) ถ้าเลือก
  else if (look) lines.push(REALISM, look);
  // สีหน้าที่เลือก: ต้องบอกว่าไม่เอาสีหน้าจากรูปนางแบบ ไม่งั้น AI ยึดรอยยิ้มในรูปนางแบบ
  if (face) lines.push(face, posePlan ? 'This expression replaces any expression in the pose plan.' : 'Do not keep the expression of image 1.');
  if (!shot && gaze) lines.push(gaze);
  if (props.length) lines.push(`Props: the model is ${props.join(' and ')}.`);
  if (fullBody && !shot) lines.push('Show the full body from head to feet.'); // ชุดถ่ายใกล้ (เน้นสินค้า) fullBody = false
  if (camera && !shot && (camera.framing || camera.angle)) {
    lines.push('Camera and framing chosen for this photo, more important than the framing or camera of any reference image '
      + '(the pose photo, the model photo or the location photo): '
      + [camera.framing && `frame it as ${camera.framing}`, camera.angle && `with the ${camera.angle}`].filter(Boolean).join(', ') + '.');
  }
  if (extra) lines.push('Additional instruction: ' + extra);
  return lines.join(' ');
}

// ชุดภาพหลายมุม: รูปที่ 2 เป็นต้นไป — รูปที่ส่งเรียงเป็น: 1 รูปหลักของชุด, 2 นางแบบ, (ชุด), (ของเสริม...)
// รูปหลักมีคน ชุด ฉาก แสงครบแล้ว ให้ AI ลอกทุกอย่างจากรูปนั้น เปลี่ยนแค่มุมกล้อง/ระยะ/ท่า
// ไม่ใส่ REALISM/แสงของสไตล์ถ่ายภาพซ้ำ: สั่งทำผิว/แสงใหม่แล้วหน้าเพี้ยนจากรูปหลัก (เหมือนรอบสองของ harmonize)
export type SetPromptInput = {
  framing: string; angle: string; fullBody: boolean; hasOutfit: boolean; accessories?: string[]; extra?: string | null;
};

export function buildSetPrompt({ framing, angle, fullBody, hasOutfit, accessories = [], extra }: SetPromptInput) {
  const lines = [
    `Create one fashion photograph, ${framing}.`,
    'Image 1 is a photo from the same photo shoot. Keep everything from image 1 the same: the same person (face, hairstyle, '
      + 'body shape and skin), the same outfit and accessories, the same location and background, the same light direction, '
      + 'color grading, lens look and image quality.',
    'Image 2 shows the same model: use it to keep the face identical.',
  ];
  let n = 3;
  if (hasOutfit) {
    lines.push(`Image ${n} is the outfit: use it to keep the garments accurate, including parts that are not visible in image 1. `
      + `Ignore the face, body and background of image ${n}.`);
    n += 1;
  }
  if (accessories.length) {
    for (const what of accessories) {
      lines.push(`Image ${n} is a product photo of ${what}.`);
      n += 1;
    }
    lines.push(ACCESSORY_RULES);
  }
  lines.push(`Only the camera angle, framing and pose change. ${angle} Choose a natural, relaxed fashion pose that suits this angle.`);
  lines.push('It must look like the next frame from the same real photo shoot, not a new composite. '
    + 'Keep the existing skin texture; do not smooth it.');
  if (fullBody) lines.push('Show the full body from head to feet.');
  if (extra) lines.push('Additional instruction: ' + extra);
  return lines.join(' ');
}

// รอบสอง (ไม่บังคับ): ให้ AI ดูรูปที่ได้อีกรอบแล้วเกลี่ยแสง/เงา/สีให้เป็นรูปเดียวกัน
export const HARMONIZE_PROMPT =
  'This photo may look like a composite. Make it look like one natural photograph taken by a single camera: '
  + 'relight the person so the light direction, color temperature and brightness match the background, '
  + 'add realistic contact shadows under the feet and soft cast shadows, blend the edges and hair naturally, '
  + 'and match color grading, contrast, sharpness, depth of field and grain across the whole image. '
  + "Do not change the person's face, identity, hairstyle, outfit, pose, or the background layout.";

// รอบสองไม่ใส่ REALISM ซ้ำ: สั่งทำผิวใหม่อีกรอบแล้วหน้าเพี้ยนสะสม (รูปผิวมัน/หน้าตอบ 6 ต.ค.)
export function harmonizePrompt(look?: string | null) {
  return look ? [HARMONIZE_PROMPT, 'Keep the existing skin texture; do not smooth it.', look].join(' ') : HARMONIZE_PROMPT;
}
