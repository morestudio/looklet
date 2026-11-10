// product page (components/Packshot.tsx) recipe: every step's choices saved with each generated image (meta.recipe, lib/recipe.ts)
import type { Item } from './catalog';
import { readCreativeConcept, type CreativeConcept } from './creative';
import {
  BACKDROP_COLORS, CUSTOM_ANGLE, DETAIL_TARGETS, HAND_POSES, NO_PROPS, PRODUCT_ANGLES, PRODUCT_ASPECTS, PRODUCT_FRAMINGS, PRODUCT_SET_SHOTS,
  PROP_STYLES, REF_MODES, SCALE_REFERENCES, SETS, SHOT_TYPES, type RefMode, type ShotType,
} from './packshot';
import { productGroups, type ProductGroup, type ProductPhoto } from './product-groups';
import { oneOf } from './recipe';
import { readTurn, type Turn } from './turntable';

export type PickKey = 'product' | 'ref' | 'scene' | 'prop';
export type StepKey = 'creative' | 'hand' | 'shot' | 'product' | 'ref' | 'set' | 'props' | 'angle' | 'framing' | 'settings';
// ช็อตต้นแบบ (ปิด 27 ต.ค.): ซ้ำกับภาพแรงบันดาลใจของ Creative Packshot และ "ใช้รูปฉากของฉัน" ในขั้นฉากและพื้น
// แถมลอกทั้งช็อตแล้วขั้นอื่นใช้ไม่ได้ครึ่งเมนู · เปิดคืน = true (โค้ด UI/API ยังอยู่ครบ)
export const REF_SHOT = false;
export const PRESET = 'preset'; // ทุกขั้น: 'preset' = ตามฉาก (ค่าที่ฉากที่เลือกจับคู่ให้)
export const idOf = (item: Item) => item.src ?? item.name;

// ขั้นที่ประเภทภาพนี้ใช้ · เมนูแสดงครบทุกขั้นเสมอ (ขั้นที่ไม่ใช้เป็นสีเทา) จะได้ไม่ขยับ/เปลี่ยนเลขตอนเปลี่ยนประเภทภาพ
export function stepUsed(key: StepKey, type: ShotType) {
  if (type === 'creative') return ['product', 'shot', 'creative', 'settings'].includes(key);
  if (type === 'handshot') return ['product', 'shot', 'hand', 'settings'].includes(key); // ฉาก แสง มุม ระยะ = อัตโนมัติตามท่าถือ
  if (key === 'creative' || key === 'hand') return false;
  if (key === 'ref' || key === 'props') return type === 'styled';
  if (key === 'angle') return type !== 'multi';
  if (key === 'framing') return type === 'styled' || type === 'scale';
  return true;
}

type Size = { width: string; height: string; depth: string };
export type Recipe = {
  pick: Record<PickKey, string | null>; shotType: ShotType; idea: string; facts: string; concept: CreativeConcept | null;
  detailTarget: string; feature: string; scaleRef: string; handPose: string; dimensions: Size; referenceSize: Omit<Size, 'height'>; extraAngles: string[];
  scene: string; color: string; props: string; propText: string; angle: string; turn: Turn | null; framing: string; refMode: RefMode;
  aspect: string; quality: string; extra: string;
};
// which shot types read each pick: inspiration (ref) = Creative, or Custom's ref shot when REF_SHOT; own scene / prop photo = Custom
export const pickUsed = (key: PickKey, type: ShotType) =>
  key === 'product' || (key === 'ref' ? type === 'creative' || (REF_SHOT && type === 'styled') : type === 'styled');

// what choosing a shot type resets; also readRecipe's fallbacks for these fields
export function shotTypeDefaults(type: ShotType): Pick<Recipe, 'scene' | 'color' | 'props' | 'angle' | 'framing' | 'aspect'> {
  return {
    scene: type === 'styled' ? 'table' : PRESET, color: type === 'styled' ? 'match' : 'white', props: NO_PROPS, angle: PRESET,
    framing: type === 'detail' ? 'detail' : type === 'scale' ? 'medium' : PRESET,
    aspect: type === 'styled' || type === 'creative' || type === 'handshot' ? '4:5' : '1:1',
  };
}
export const START: Recipe = {
  pick: { product: null, ref: null, scene: null, prop: null }, shotType: 'clean', idea: '', facts: '', concept: null,
  detailTarget: 'texture', feature: '', scaleRef: 'hand', handPose: 'hold',
  dimensions: { width: '', height: '', depth: '' }, referenceSize: { width: '', depth: '' }, extraAngles: [],
  ...shotTypeDefaults('clean'), propText: '', turn: null, refMode: 'shot', quality: 'high', extra: '',
};
const text = (v: unknown) => (typeof v === 'string' ? v : '');
// creative ideas are bound to the product's photos + the inputs they were planned from (changed inputs = ideas no longer valid)
export const creativeScopeOf = (group: ProductGroup | undefined, idea: string, facts: string, inspirationSrc: string | undefined) =>
  JSON.stringify([group?.id, group?.main?.src, group?.photos.map((p) => p.src), idea, facts, inspirationSrc]);
// stored recipe -> valid Recipe; an id no longer in the lists (deleted product/upload) -> null, its step listed in missing
export function readRecipe(raw: Partial<Recipe>, lists: Record<PickKey, ProductPhoto[]>, groups = productGroups(lists.product)): { recipe: Recipe; missing: StepKey[] } {
  const r = raw as Record<string, unknown>;
  const p = (r.pick && typeof r.pick === 'object' ? r.pick : {}) as Record<string, unknown>;
  const missing = new Set<StepKey>();
  const shotType = oneOf<ShotType>(r.shotType, SHOT_TYPES.map((t) => t.id), START.shotType);
  const d = shotTypeDefaults(shotType);
  const ids = (key: PickKey) => (key === 'product' ? groups.map((g) => g.id) : lists[key].map(idOf));
  // a pick the shot type doesn't use is dropped quietly (state keeps stale ids across shot types)
  const ref = (key: PickKey, id: unknown, step: StepKey) => {
    if (id === null || id === undefined || !pickUsed(key, shotType)) return null;
    if (typeof id === 'string' && ids(key).includes(id)) return id;
    missing.add(step);
    return null;
  };
  const size = (v: unknown) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return { width: text(o.width), height: text(o.height), depth: text(o.depth) };
  };
  const concept = r.concept && shotType === 'creative' ? readCreativeConcept(r.concept) : null;
  if (r.concept && shotType === 'creative' && !concept) missing.add('creative');
  const recipe: Recipe = {
    pick: { product: ref('product', p.product, 'product'), ref: ref('ref', p.ref, 'creative'), scene: ref('scene', p.scene, 'set'), prop: ref('prop', p.prop, 'props') },
    shotType,
    idea: text(r.idea), facts: text(r.facts), concept,
    detailTarget: oneOf(r.detailTarget, DETAIL_TARGETS.map((x) => x.id), START.detailTarget),
    feature: text(r.feature),
    scaleRef: oneOf(r.scaleRef, SCALE_REFERENCES.map((x) => x.id), START.scaleRef),
    handPose: oneOf(r.handPose, HAND_POSES.map((x) => x.id), START.handPose),
    dimensions: size(r.dimensions),
    referenceSize: (({ width, depth }) => ({ width, depth }))(size(r.referenceSize)),
    extraAngles: (Array.isArray(r.extraAngles) ? r.extraAngles : []).filter((id) => PRODUCT_SET_SHOTS.some((x) => x.id === id)) as string[],
    scene: oneOf(r.scene, [PRESET, ...SETS.map((x) => x.id)], d.scene),
    color: oneOf(r.color, BACKDROP_COLORS.map((x) => x.id), d.color),
    props: oneOf(r.props, [NO_PROPS, ...PROP_STYLES.map((x) => x.id)], d.props),
    propText: text(r.propText),
    angle: oneOf(r.angle, [PRESET, CUSTOM_ANGLE, ...PRODUCT_ANGLES.map((x) => x.id)], d.angle),
    turn: r.turn ? readTurn(r.turn) : null,
    framing: oneOf(r.framing, [PRESET, ...PRODUCT_FRAMINGS.map((x) => x.id)], d.framing),
    refMode: oneOf<RefMode>(r.refMode, REF_MODES.map((m) => m.id), START.refMode),
    aspect: oneOf<string>(r.aspect, PRODUCT_ASPECTS.map((a) => a.id), d.aspect),
    quality: typeof r.quality === 'string' ? r.quality : START.quality,
    extra: text(r.extra),
  };
  return { recipe, missing: [...missing] };
}
