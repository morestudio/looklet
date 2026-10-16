// prompts.ts — คำสั่งที่ส่งให้ AI เจนรูป (ใช้ฝั่ง server เท่านั้น)
// สร้างคำสั่งตามสิ่งที่เลือก — รูปที่ส่งไปเรียงเป็น: 1 นางแบบ, (ชุด), (ของเสริม...), (ท่าโพสต์), (ฉาก)
// เขียนเป็นภาษาอังกฤษเพราะโมเดลเจนรูปเข้าใจแม่นกว่า
import type { PoseMode } from './catalog';

// ใช้เมื่อเลือก "แสงสี" — คำว่า photorealistic มักได้ผิวพลาสติกแบบ CG เลยบรรยายสิ่งที่กล้องจริงเห็นแทน
export const REALISM =
  'It must look like an unretouched photo of a real person from a professional shoot, not a CGI render or an AI image. '
  + 'Skin: real texture with visible pores and fine facial hair, a little natural unevenness and a subtle sheen; '
  + 'not sweaty or oily, no airbrushing, no beauty filter, no plastic or waxy skin. '
  + 'Hair: individual strands and a few flyaway hairs, not a smooth solid mass. '
  + 'Clothes: real fabric texture and weight, wrinkles and creases where the body bends, visible seams and stitching. '
  + 'Light: one consistent light setup from a clear direction falls on both the person and the surroundings: real shadows and '
  + 'highlights on the face, body and clothes with natural falloff; the person casts a shadow on the floor or nearby walls in '
  + 'the same direction and softness as the other shadows in the scene, with dark contact shadows where they touch the ground; '
  + 'nearby surfaces bounce a little of their color onto the skin and clothes. Not flat or evenly lit, no blown-out white areas. '
  + 'Color: natural, slightly muted color like a real camera, true-to-life skin tones, subtle grain; '
  + 'not oversaturated, not over-sharpened, no glow.';

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
  look?: string | null; // แสง/เลนส์/มุมกล้อง/โทนสีของชุดถ่ายภาพที่เลือก (presetPrompt ใน catalog) null = ไม่สั่ง
  fullBody?: boolean;
  accessories?: string[]; // คำบรรยายของเสริมแต่ละชิ้น เรียงตามรูปที่ส่ง
  hasPose?: boolean; // มีรูปท่าโพสต์ (ส่งต่อจากของเสริม ก่อนฉาก)
  autoPose?: boolean; // "AI เลือกท่าให้": ไม่มีรูปท่า ให้ AI จัดท่าเองให้สินค้าเด่น
  poseHints?: string[]; // ท่าที่ทำให้ของเสริมแต่ละชิ้นเด่น (show ใน ACCESSORY_TYPES) ใช้คู่กับ autoPose
  poseMode?: PoseMode; // เอาอะไรจากรูปท่าโพสต์ (POSE_MODES) ใช้คู่กับ hasPose
  framing?: string | null; // ระยะของชุดถ่ายภาพ (framing ใน PRESETS) ใส่ในบรรทัดแรก
  gaze?: string | null; // การมอง (GAZES)
  props?: string[]; // พร็อพในมือ (PROPS)
};

export function buildPrompt({
  hasOutfit, hasSceneImage, sceneText, extra, look, fullBody = true, accessories = [], hasPose = false, autoPose = false, poseHints = [],
  poseMode = 'pose', framing = null, gaze = null, props = [],
}: PromptInput) {
  // ลอกทั้งช็อต: มุมกล้อง/ระยะ/การมอง/แสง/โทนสีเอาจากรูปต้นแบบ -> ไม่ใช้ framing/look ของชุดถ่ายภาพ (คำสั่งจะขัดกัน)
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
    hasPose || autoPose
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
        + 'accessories such as sunglasses, jewelry or bags, or the background.');
    } else {
      lines.push(`Image ${n} is a reference photo for the whole shot: recreate its pose, camera angle and height, lens and framing, `
        + 'how large the person is and where they stand in the frame, gaze direction, expression, lighting and color grading. '
        + `Use only the shot from image ${n}: do not copy that person's face, hair, body shape, clothes or accessories.`
        + (shotScene
          ? ` Place the model in the same location as image ${n}: same background, setting, time of day and light.`
          : ` Do not copy the background of image ${n}.`));
    }
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
  } else if (sceneText) {
    lines.push(`Place the model in this location: ${sceneText}.`);
  } else {
    lines.push('Keep the original background of image 1.');
  }
  if (newScene) {
    // ถ้าไม่สั่งชัดๆ AI มักเก็บแสงสตูดิโอจากรูปนางแบบไว้ ผลจะดูเหมือนตัดแปะ
    lines.push(
      'It must look like a single real photo taken on location, not a cut-out pasted onto a background: '
      + 'do not keep the studio lighting of image 1. Relight the model to match the scene '
      + '(light direction, color temperature, brightness and contrast), '
      + 'add natural contact shadows where the feet touch the ground and soft shadows cast away from the light, '
      + 'and match the camera perspective, eye level, scale, depth of field, sharpness, color grading and grain of the scene. '
      + "Keep the model's natural skin tone, only as affected by the scene lighting.");
  }
  if (shot) lines.push(REALISM); // แสง/โทนสีเอาจากรูปต้นแบบ ไม่ใส่ look
  else if (look) lines.push(REALISM, look);
  if (!shot && gaze) lines.push(gaze);
  if (props.length) lines.push(`Props: the model is ${props.join(' and ')}.`);
  if (fullBody && !shot) lines.push('Show the full body from head to feet.'); // ชุดถ่ายใกล้ (เน้นสินค้า) fullBody = false
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
