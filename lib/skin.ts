// ปรับผิวรอบสอง: ใช้คำสั่งและโมเดลที่เทียบภาพแล้ว โดยไม่แก้คำสั่งสร้างรูปหลัก
import { GPT25_SIZES } from './catalog';
export const SKIN_MODEL = 'openai:gpt-image-2.5-sunburst';
// ขนาดรูปหลังปรับผิว = ขนาดใหญ่ของ GPT Image 2.5 (1664×2496 ~฿2.8, ~45 วินาที) เท่ากับรูปที่สร้างตอนนี้
export const SKIN_SIZES = GPT25_SIZES;
export const SKIN_PROMPT =
  'Edit only exposed skin of this finished photograph. Skin: preserve her identity, apparent adult age, facial geometry and natural complexion. '
  + 'Render untreated skin with subtle irregular pores that vary across the nose and cheeks, very fine peach fuzz, delicate natural under-eye creases, '
  + 'gentle uneven coloration and organically varying skin highlights. Give exposed arms and legs subtle natural surface texture and tonal variation '
  + 'rather than uniformly polished gradients. Keep all texture proportional to the full-body camera distance: understated at this framing, '
  + 'never oversized pores, gritty noise or exaggerated wrinkles. Preserve existing distinguishing marks without inventing prominent freckles, '
  + 'blemishes or mottling. No skin smoothing, beauty retouching, airbrushing, plastic or waxy skin. '
  + 'Preserve exactly the same recognizable person, facial structure, expression, pose, body proportions, natural complexion, hairstyle, makeup styling, '
  + 'clothes, graphics, room, framing, camera angle, lighting, exposure and background. Do not add noise or sharpen the entire photograph. '
  + 'Output one edited photo only, no labels.';
