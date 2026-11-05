// Uses existing stored references; writes a local example, never deploys or modifies the originals.
// node --env-file=.env --env-file=.env.local scripts/demo-photo-director.mjs [--plan-only]
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { appLoader } from './lib/load-app.mjs';

// This example is explicitly approved for OpenAI only; disable the app's optional Gemini fallback.
const load = appLoader({ env: { ...process.env, GEMINI_API_KEY: '' } });
const { directPhoto, generateImage, reviewShot } = load('lib/ai.ts');
const { directorRequest, selectedShot, shotInstruction } = load('lib/photo-director.ts');
const { deliverDirectedImage } = load('lib/directed-delivery.ts');
const { buildPrompt, cropLine } = load('lib/prompts.ts');
const { cropTo, servable } = load('lib/images.ts');
const { DEFAULT_AI_MODEL, GPT25_SIZES } = load('lib/catalog.ts');
const folder = new URL(process.argv.includes('--fresh') ? '../output/photo-director-final/' : '../output/photo-director/', import.meta.url);
await fs.mkdir(folder, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function stored(key, name) {
  const { data, error } = await db.storage.from('images').download(key);
  if (error) throw new Error(`Cannot load ${name}: ${error.message}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(new URL(name, folder), bytes);
  return { data: (await sharp(bytes).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer()).toString('base64'), mime: 'image/jpeg' };
}
const personBytes = await fs.readFile(new URL('../public/images/นางแบบผมยาวริมทะเล.jpg', import.meta.url));
const person = { data: (await sharp(personBytes).resize({ height: 1024, withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer()).toString('base64'), mime: 'image/jpeg' };
const outfit = await stored('uploads/outfits/20261102-031505-cb592d.jpg', 'outfit.jpg');
const location = await stored('uploads/scenes/20261102-031728-a8d340.webp', 'bedroom.webp');
const input = { person, outfit, location, locationIsModelPhoto: false, locationText: null, accessories: [], backgroundMode: 'explore', goal: 'lifestyle', aspect: '4:5', framing: null, angle: null, placement: null, expression: null, gaze: null, props: [], extra: null, previous: [] };
console.log('Planning three shots from the original model, pajamas and bedroom…');
let director;
try { director = JSON.parse(await fs.readFile(new URL('plan.json', folder), 'utf8')); } catch { /* first run */ }
director ??= await directPhoto(input);
if (!director) throw new Error('No valid shot plan; no image generation was attempted.');
await fs.writeFile(new URL('plan.json', folder), JSON.stringify(director, null, 2));
const chosen = selectedShot(director);
console.log(JSON.stringify({ chosen: chosen.title, reason: chosen.reasonThai, candidates: director.candidates.map((c) => ({ title: c.title, feasible: c.feasible, score: c.score, interaction: c.interaction, camera: c.cameraAngle })) }, null, 2));
if (process.argv.includes('--plan-only')) process.exit(0);
const prompt = buildPrompt({ wear: { outfit: true }, hasSceneImage: true, posePlan: shotInstruction(director), directed: director.backgroundMode, framing: chosen.framing, camera: { framing: chosen.framing, angle: chosen.cameraAngle }, placement: chosen.placement, crop: cropLine(input.aspect, false) });
await fs.writeFile(new URL('prompt.txt', folder), prompt);
const options = { aspect: input.aspect, size: GPT25_SIZES['1024x1536'], quality: 'high' };
const images = directorRequest(input).images;
let calls = 0, tokens = 0;
async function render(refs, instruction) {
  const generated = await generateImage(DEFAULT_AI_MODEL, refs, instruction, options);
  calls++; tokens += generated.tokens;
  return servable(await cropTo(generated, input.aspect));
}
console.log('Generating the selected shot…');
let initial;
try {
  const bytes = await fs.readFile(new URL('initial.png', folder));
  initial = { data: bytes.toString('base64'), mime: 'image/png' };
} catch {
  initial = await render(images, prompt);
  await fs.writeFile(new URL('initial.png', folder), await sharp(Buffer.from(initial.data, 'base64')).png().toBuffer());
}
let index = 0;
const delivery = await deliverDirectedImage(initial, { name: chosen.title, th: chosen.reasonThai, director }, true, {
  review: (image) => { console.log('Checking the finished crop against the originals…'); return reviewShot(input, director, image); },
  canRepair: async () => true,
  repair: (image, correction) => { console.log('Making one targeted correction…'); return render([...images, image], `${prompt} Image ${images.length + 1} is a failed draft, not a new reference. Fix only: ${correction}. Original references remain authoritative.`); },
  save: async (image, plan) => {
    const file = `attempt-${++index}.jpg`;
    await fs.writeFile(new URL(file, folder), await sharp(Buffer.from(image.data, 'base64')).jpeg({ quality: 97 }).toBuffer());
    await fs.writeFile(new URL(file + '.json', folder), JSON.stringify(plan, null, 2));
    return file;
  },
});
await fs.copyFile(new URL(delivery.src, folder), new URL('selected.jpg', folder));
await fs.writeFile(new URL('delivery.json', folder), JSON.stringify({ ...delivery, calls, tokens }, null, 2));
console.log(JSON.stringify({ file: new URL('selected.jpg', folder).pathname, calls, tokens, review: delivery.posePlan.review }, null, 2));
