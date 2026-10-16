// ai.ts — เรียก AI เจนรูป + ดูรูปของเสริม (ใช้ฝั่ง server เท่านั้น: อ่าน API key จาก .env หน้าเว็บไม่เคยเห็น key)
import 'server-only';
import { ACCESSORY_TYPES, type AccessoryInfo } from './catalog';

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
