// รุ่นที่รองรับการแก้ด้วย mask ใช้ร่วมกันทั้ง UI และ API
const MASK_MODELS = ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1-mini'];
export const supportsMaskedEdit = (id: string) => id.startsWith('openai:') && MASK_MODELS.includes(id.slice(7));
export type LocalEditMode = 'rough' | 'precise';
export const MAX_EDIT_PIXELS = 16_000_000;
// highlighted = ผู้ใช้ระบายชี้จุด (rough) · ไม่ระบาย = แก้จากคำสั่งที่พิมพ์อย่างเดียว (28 ต.ค. ผู้ใช้อยากแค่พิมพ์แล้วแก้ได้)
// areas = ตำแหน่งของแต่ละก้อนที่ระบาย (highlightAreas ใน local-edit-images.ts) — ระบาย 2 ที่ขึ้นไปเท่านั้นที่บอก AI เป็นคำ:
// 9 พ.ย. ผู้ใช้ระบายหิน 3 ก้อน "เอาหินออก" แต่แผ่นหินก้อนซ้ายยังอยู่ (AI วาดก้อนนั้นเหมือนเดิม) ผู้ใช้: ระบายแล้วต้องเปลี่ยน
// ระบายที่เดียว = พรอมต์เดิมทุกตัวอักษร
const areasLine = (areas: string[]) => areas.length < 2 ? ''
  : `The red paint covers ${areas.length} separate areas of the photo: ${areas.map((a) => `one ${a}`).join(', ')}. `
  + 'The user painted every one of them on purpose: apply the requested change in every painted area, to each object the paint points to. '
  + 'Never leave a painted object unchanged, even if it looks like a base, a stand, a prop, or part of the floor or background. '
  + 'Do not apply the change to objects that have no paint on them, even if they look similar. ';
export const LOCAL_EDIT_PROMPT = (instruction: string, product = false, mode: LocalEditMode = 'precise', highlighted = true, areas: string[] = []) =>
  (mode === 'rough' && !highlighted
    ? 'Image 1 is the original photograph and the sole source of appearance and detail. Find the object or area that the requested change below refers to and apply the change to that whole object, including its connected parts, handles and straps; leave everything else exactly as it is. If removing an object, reconstruct the revealed background and its affected contact shadows naturally. '
    : mode === 'rough'
    ? 'Image 1 is the clean original photograph and the sole source of appearance and detail. Image 2 is the same photograph with translucent red user highlights, provided ONLY to point to the target object or location. The highlights are approximate pointers, NOT edit boundaries, NOT the desired color, and NOT content to reproduce. '
    + areasLine(areas)
    + 'Identify the object indicated by the highlights and the requested change. Apply the change to the entire intended object, including its connected parts, handles and straps, even outside the highlights. Do not restrict the edit to brush strokes. Remove all annotation marks from the final image. If removing an object, reconstruct the revealed background and its affected contact shadows naturally. '
    : 'Edit only the area indicated by the transparent region of the mask in Image 1. ')
  + (product
    ? 'Keep the same product, shape, proportions, material, color, packaging, label, logo, legible text, props, background, camera perspective, lighting and photographic texture except for the specific requested change. '
    : 'Keep the same person, identity, face, pose, body proportions, clothing, accessories, background, camera perspective, lighting and photographic texture except for the specific requested change. ')
  + 'For a color-only change, change only the color of the indicated object: preserve its exact silhouette, dimensions, construction, seams, stitching, pattern, logo, hardware and material texture; do not replace it with a different design. Preserve overlapping hands and other foreground objects. '
  + 'Keep the full image framing and dimensions aligned with the source. Do not move, crop, zoom, relight or restyle the whole photograph. '
  + 'Make the edited area blend naturally into the surrounding original image. Do not add new text or watermarks. '
  + `Requested local change: ${instruction}`;
