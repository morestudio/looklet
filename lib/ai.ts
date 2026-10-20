// ai.ts — เรียก AI เจนรูป + ดูรูปของเสริม (ใช้ฝั่ง server เท่านั้น: อ่าน API key จาก .env หน้าเว็บไม่เคยเห็น key)
import 'server-only';
import { ACCESSORY_TYPES, POSE_PRESETS, type AccessoryInfo } from './catalog';

// โมเดลที่ให้เลือก — ราคา Gemini ประมาณจากหน้า pricing ของ Google (ต.ค. 2026)
const AI_MODELS = [
  { id: 'gemini:gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image (แนะนำ ~1.5–5 บาท/รูป)', key: 'GEMINI_API_KEY' },
  { id: 'gemini:gemini-3.1-flash-lite-image', label: 'Gemini 3.1 Flash Lite Image (ถูกสุด ~1 บาท/รูป)', key: 'GEMINI_API_KEY' },
  { id: 'gemini:gemini-3-pro-image', label: 'Gemini 3 Pro Image (ดีสุด ~4.5–8 บาท/รูป)', key: 'GEMINI_API_KEY' },
  { id: 'openai:gpt-image-2.5-sunburst', label: 'OpenAI gpt-image-2.5-sunburst', key: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-image-2.5-flare', label: 'OpenAI gpt-image-2.5-flare', key: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-image-2', label: 'OpenAI gpt-image-2', key: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-image-1.5', label: 'OpenAI gpt-image-1.5', key: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-image-1-mini', label: 'OpenAI gpt-image-1-mini (ถูก แต่หน้ามักเปลี่ยน)', key: 'OPENAI_API_KEY' },
];

// เฉพาะเจ้าที่มี key ใน .env
export const availableModels = () => AI_MODELS.filter((m) => process.env[m.key]).map(({ id, label }) => ({ id, label }));

export type Img = { data: string; mime: string }; // data = base64

// ข้อความ error ที่ส่งกลับไปให้หน้าเว็บแสดงได้ตรงๆ
export class ApiError extends Error {}

async function post(url: string, init: RequestInit, who: string, timeout = 300_000) {
  const res = await fetch(url, { ...init, method: 'POST', signal: AbortSignal.timeout(timeout) });
  if (!res.ok) {
    const msg = await res.json().then((d) => d?.error?.message ?? '', () => '');
    throw new ApiError(`${who} ตอบกลับ ${res.status}: ${msg}`);
  }
  return res.json();
}

type GeminiPart = { thought?: boolean; inlineData?: { data: string; mimeType?: string }; inline_data?: { data: string; mime_type?: string } };

async function callGemini(model: string, images: Img[], prompt: string, aspect: string): Promise<Img> {
  const d = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } }))] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
    }),
  }, 'Gemini');
  const block = d.promptFeedback?.blockReason;
  if (block) throw new ApiError(`Gemini ไม่ยอมประมวลผลรูปนี้ (${block})`);
  const cand = d.candidates?.[0] ?? {};
  const parts: GeminiPart[] = cand.content?.parts ?? [];
  const last = parts.filter((p) => !p.thought && (p.inlineData || p.inline_data)).at(-1); // รูปสุดท้ายที่ไม่ใช่ภาพร่างตอนคิด
  if (!last) throw new ApiError(`Gemini ไม่ได้ส่งรูปกลับมา (finishReason: ${cand.finishReason})`);
  return {
    data: last.inlineData?.data ?? last.inline_data!.data,
    mime: last.inlineData?.mimeType || last.inline_data?.mime_type || 'image/png',
  };
}

async function callOpenAI(model: string, images: Img[], prompt: string, size: string, quality: string, fidelity: string | null = 'high'): Promise<Img> {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('quality', quality);
  form.append('n', '1');
  // ให้ AI เก็บรายละเอียดรูปแรก (นางแบบ) ละเอียดขึ้น หน้าเพี้ยนน้อยลง แลกกับค่ารูป input ที่แพงขึ้นนิดหน่อย
  if (fidelity) form.append('input_fidelity', fidelity);
  images.forEach((img, i) => {
    form.append('image[]', new Blob([Buffer.from(img.data, 'base64')], { type: img.mime }), `image${i + 1}.${img.mime.split('/').at(-1)}`);
  });
  try {
    const d = await post('https://api.openai.com/v1/images/edits', {
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
      body: form,
    }, 'OpenAI');
    return { data: d.data[0].b64_json, mime: 'image/png' };
  } catch (e) {
    if (fidelity && e instanceof ApiError && e.message.includes('input_fidelity')) { // บางโมเดลไม่รับค่านี้ -> ส่งใหม่แบบไม่ใส่
      console.log(`${model} ไม่รับ input_fidelity ส่งใหม่แบบไม่ใส่`);
      return callOpenAI(model, images, prompt, size, quality, null);
    }
    throw e;
  }
}

export type GenerateOptions = { aspect: string; size: string; quality: string };

// modelId = "<เจ้า>:<โมเดล>" จาก availableModels()
export function generateImage(modelId: string, images: Img[], prompt: string, opt: GenerateOptions) {
  const [provider, model] = [modelId.slice(0, modelId.indexOf(':')), modelId.slice(modelId.indexOf(':') + 1)];
  return provider === 'gemini'
    ? callGemini(model, images, prompt, opt.aspect)
    : callOpenAI(model, images, prompt, opt.size, opt.quality);
}

// ---------- ดูรูปของเสริมตอนอัปโหลด: บอกประเภท + ตั้งชื่อไทย (หน้าเว็บให้ผู้ใช้ยืนยัน/แก้ได้) ----------
// ใช้โมเดลอ่านรูปตัวเล็ก ไม่ถึงสตางค์ต่อรูป — มี Gemini key ใช้ Gemini ก่อน (ถูกกว่า) พังหรือไม่มีค่อยใช้ OpenAI
// gemini-flash-lite-latest = ชื่อที่ชี้ไปตัวล่าสุดเสมอ Google เลิกรุ่นเก่าแล้วไม่ต้องตามแก้
const DESCRIBE_PROMPT = 'This is a product photo of a fashion accessory. Reply in JSON.\n'
  + '"type": the one type id that fits best:\n'
  + ACCESSORY_TYPES.map((t) => `- ${t.id}: ${t.prompt}`).join('\n')
  + '\n"name": a short Thai product name of at most 6 words with color, material and style, '
  + 'for example "กระเป๋าสะพายหนังดำ สายโซ่ทอง".';
const TYPE_IDS = ACCESSORY_TYPES.map((t) => t.id);

async function describeWithGemini(img: Img) {
  const d = await post('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent', {
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: DESCRIBE_PROMPT }, { inline_data: { mime_type: img.mime, data: img.data } }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { type: { type: 'STRING', enum: TYPE_IDS }, name: { type: 'STRING' } }, required: ['type', 'name'] },
      },
    }),
  }, 'Gemini', 30_000);
  return (d.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
}

async function describeWithOpenAI(img: Img) {
  const d = await post('https://api.openai.com/v1/chat/completions', {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: [
        { type: 'text', text: DESCRIBE_PROMPT },
        { type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } },
      ] }],
      response_format: { type: 'json_schema', json_schema: { name: 'accessory', strict: true, schema: {
        type: 'object', properties: { type: { type: 'string', enum: TYPE_IDS }, name: { type: 'string' } },
        required: ['type', 'name'], additionalProperties: false,
      } } },
    }),
  }, 'OpenAI', 30_000);
  return d.choices?.[0]?.message?.content ?? '';
}

// ไม่มี key / AI ตอบไม่ได้ / ตอบผิดรูปแบบ = null (หน้าเว็บให้ผู้ใช้เลือกเอง)
export async function describeAccessory(img: Img): Promise<AccessoryInfo | null> {
  const tries = [process.env.GEMINI_API_KEY && describeWithGemini, process.env.OPENAI_API_KEY && describeWithOpenAI];
  for (const describe of tries) {
    if (!describe) continue;
    try {
      const g = JSON.parse(await describe(img));
      if (TYPE_IDS.includes(g.type) && typeof g.name === 'string' && g.name.trim()) return { type: g.type, name: g.name.trim().slice(0, 80) };
    } catch (e) {
      console.error('ดูรูปของเสริมไม่สำเร็จ', (e as Error).message);
    }
  }
  return null;
}

// ---------- อ่านแสงในรูปต้นแบบ (ลอกทั้งช็อต): บรรยายเป็นคำให้โมเดลเจนรูป ----------
// สั่งแค่ "recreate its lighting" แล้ว AI ทำแสงนุ่ม/มืดลงเสมอ — คำบรรยายแบบช่างภาพ (แสงมาจากไหน แข็ง/นุ่ม เงาตกตรงไหน) ได้แสงตรงกว่า
// โมเดลอ่านรูปตัวเล็ก ไม่ถึงสตางค์ต่อรูป เหมือน describeAccessory — พัง/ไม่มี key = null (ใช้คำสั่ง "recreate its lighting" อย่างเดียว)
const LIGHT_PROMPT = 'You are a photography lighting expert. Describe only the lighting of this photo so another photographer can recreate it exactly, '
  + 'in 3 to 5 short, concrete English sentences: the main light source and where it comes from (for example a direct on-camera flash, '
  + 'a window on the left, overhead sun), whether it is hard or soft, where the shadows fall and how dark and sharp-edged they are, '
  + 'how highlights look on skin, the overall exposure, the white balance and the color grading. '
  + 'Do not describe the people, their clothes, pose or body, or the objects in the scene. Reply with the description only.';

async function lightWithGemini(img: Img) {
  const d = await post('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent', {
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({ contents: [{ parts: [{ text: LIGHT_PROMPT }, { inline_data: { mime_type: img.mime, data: img.data } }] }] }),
  }, 'Gemini', 30_000);
  return (d.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
}

async function lightWithOpenAI(img: Img) {
  const d = await post('https://api.openai.com/v1/chat/completions', {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: [
        { type: 'text', text: LIGHT_PROMPT },
        { type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } },
      ] }],
    }),
  }, 'OpenAI', 30_000);
  return d.choices?.[0]?.message?.content ?? '';
}

export async function describeLighting(img: Img): Promise<string | null> {
  const tries = [process.env.GEMINI_API_KEY && lightWithGemini, process.env.OPENAI_API_KEY && lightWithOpenAI];
  for (const describe of tries) {
    if (!describe) continue;
    try {
      const text = (await describe(img)).replace(/\s+/g, ' ').trim();
      if (text.length > 40) return text.slice(0, 900);
    } catch (e) {
      console.error('อ่านแสงในรูปต้นแบบไม่สำเร็จ', (e as Error).message);
    }
  }
  return null;
}

// ---------- วางแผนท่า (ท่าสำเร็จรูป POSE_PRESETS): AI ตัวเล็กดูฉาก + ชุด + ของเสริม แล้วเขียนท่าที่เข้ากับฉากนั้นเป็นคำ ----------
// ไม่ต้องมีรูปท่า — ทดสอบ 20 ต.ค. ได้ท่าที่ใช้เฟอร์นิเจอร์จริงในฉากและดูไม่ได้โพส ~9 วินาที ไม่ถึง 5 สตางค์ต่อครั้ง
// ใช้ GPT-6 Luna (ผู้ใช้เลือก 20 ต.ค. — รับรูป + JSON ได้ ~5 วินาที ราว ฿0.02 ต่อครั้ง) พัง/ไม่มี key -> Gemini Flash -> null
// (null = route ใช้คำสั่ง "AI เลือกท่าให้" แบบเดิมแทน ยังได้รูป)
export type PosePlan = { preset: string | null; en: string; th: string };
export type PlanInput = {
  location: Img | null; // รูปฉากที่อัปโหลด หรือรูปนางแบบ (ฉากเดิม = พื้นหลังของรูปนางแบบ)
  locationIsModelPhoto: boolean;
  locationText: string | null; // ฉากแบบคำบรรยาย (ไม่มีรูป)
  outfit: Img | null;
  accessories: { img: Img; what: string }[];
  preset: string; // id ใน POSE_PRESETS หรือ 'auto'
  moment?: string | null; // จังหวะของท่าที่สุ่มมา (pickMoment) ให้แต่ละรูปได้ท่าไม่ซ้ำ
};

function planRequest({ location, locationIsModelPhoto, locationText, outfit, accessories, preset, moment }: PlanInput) {
  const images: Img[] = [];
  const said: string[] = [];
  if (location) {
    images.push(location);
    said.push(locationIsModelPhoto
      ? `Image ${images.length} shows the model; the location is the background of this photo (ignore her current pose).`
      : `Image ${images.length} is the location.`);
  } else if (locationText) {
    said.push(`The location: ${locationText}.`);
  }
  if (outfit) {
    images.push(outfit);
    said.push(`Image ${images.length} is her outfit.`);
  }
  for (const a of accessories) {
    images.push(a.img);
    said.push(`Image ${images.length} is ${a.what}, which she has with her.`);
  }
  const auto = preset === 'auto';
  const brief = auto
    ? 'First choose which of these pose types suits this location, outfit and accessories best, then plan it: '
      + POSE_PRESETS.map((p) => `"${p.id}": ${p.brief}`).join(' ')
    : POSE_PRESETS.find((p) => p.id === preset)!.brief;
  const text = 'You are a photographer directing one real-life photo of one young woman. ' + said.join(' ')
    + ` Pose brief: ${brief}` + (moment ? ` The moment for this photo (follow it): ${moment}.` : '')
    // ไม่บอก -> AI ตัววางแผนให้นั่งขอบม้านั่งเกือบทุกรูป (เช็ก 20 ต.ค. ถ่ายเผลอ หัวเราะ 4 ครั้ง นั่งขอบหน้าม้านั่งทั้ง 4)
    // แต่สั่ง "อย่านั่ง" ตรงๆ กลายเป็นยืนทั้ง 4 -> ท่าตัวอยู่ใน moments แล้ว บรรทัดนี้ใช้เฉพาะตอนจังหวะไม่ได้บอก
    + ' If the moment does not say where her body is, choose the position (standing, walking, leaning or sitting) that fits it best, '
    + 'and do not default to sitting on the edge of a seat.'
    + ' Plan ONE posture for this exact location: use the real furniture, surfaces and open space that are there, '
    + 'with believable weight and balance. Her face and the outfit must stay clearly visible'
    + (accessories.length ? ', and the accessories are handled naturally' : '') + '. Plan her gaze and expression too. '
    + 'Reply in JSON: ' + (auto ? '"preset" = the id of the pose type you chose; ' : '')
    + '"pose_en" = 3 to 5 concrete English sentences (where she is in the scene, what she sits or leans on or how she stands or moves, '
    + 'legs, arms and hands, torso, head, gaze, expression); "pose_th" = the same idea in 1 to 2 short Thai sentences.';
  return { images, text, auto };
}

async function planWithGemini(req: ReturnType<typeof planRequest>) {
  const props: Record<string, unknown> = { pose_en: { type: 'STRING' }, pose_th: { type: 'STRING' } };
  if (req.auto) props.preset = { type: 'STRING', enum: POSE_PRESETS.map((p) => p.id) };
  const d = await post('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: req.text }, ...req.images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } }))] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: props, required: Object.keys(props) } },
    }),
  }, 'Gemini', 45_000);
  return (d.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
}

async function planWithOpenAI(req: ReturnType<typeof planRequest>) {
  const props: Record<string, unknown> = { pose_en: { type: 'string' }, pose_th: { type: 'string' } };
  if (req.auto) props.preset = { type: 'string', enum: POSE_PRESETS.map((p) => p.id) };
  const d = await post('https://api.openai.com/v1/chat/completions', {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: 'gpt-6-luna',
      messages: [{ role: 'user', content: [
        { type: 'text', text: req.text },
        ...req.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } })),
      ] }],
      response_format: { type: 'json_schema', json_schema: { name: 'pose', strict: true, schema: {
        type: 'object', properties: props, required: Object.keys(props), additionalProperties: false,
      } } },
    }),
  }, 'OpenAI', 45_000);
  return d.choices?.[0]?.message?.content ?? '';
}

export async function planPose(input: PlanInput): Promise<PosePlan | null> {
  const req = planRequest(input);
  const tries = [process.env.OPENAI_API_KEY && planWithOpenAI, process.env.GEMINI_API_KEY && planWithGemini];
  for (const plan of tries) {
    if (!plan) continue;
    try {
      const g = JSON.parse(await plan(req));
      if (typeof g.pose_en === 'string' && g.pose_en.trim().length > 40) {
        const preset = req.auto ? (POSE_PRESETS.some((p) => p.id === g.preset) ? g.preset : null) : input.preset;
        return { preset, en: g.pose_en.trim().slice(0, 1200), th: String(g.pose_th ?? '').trim().slice(0, 400) };
      }
    } catch (e) {
      console.error('วางแผนท่าไม่สำเร็จ', (e as Error).message);
    }
  }
  return null;
}
