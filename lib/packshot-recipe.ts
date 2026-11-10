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
export const PRESET = 'preset'; // ทุกขั้น: 'preset' = ตามฉาก (ค่าที่ฉากที่เลือกจับคู่ให้)
export const idOf = (item: Item) => item.src ?? item.name;

type Size = { width: string; height: string; depth: string };
export type Recipe = {
  pick: Record<PickKey, string | null>; shotType: ShotType; idea: string; facts: string; concept: CreativeConcept | null;
  detailTarget: string; feature: string; scaleRef: string; handPose: string; dimensions: Size; referenceSize: Omit<Size, 'height'>; extraAngles: string[];
  scene: string; color: string; props: string; propText: string; angle: string; turn: Turn | null; framing: string; refMode: RefMode;
  aspect: string; quality: string; extra: string;
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
  const ids = (key: PickKey) => (key === 'product' ? groups.map((g) => g.id) : lists[key].map(idOf));
  const ref = (key: PickKey, id: unknown, step: StepKey) => {
    if (id === null || id === undefined) return null;
    if (typeof id === 'string' && ids(key).includes(id)) return id;
    missing.add(step);
    return null;
  };
  const size = (v: unknown) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return { width: text(o.width), height: text(o.height), depth: text(o.depth) };
  };
  const concept = r.concept ? readCreativeConcept(r.concept) : null;
  if (r.concept && !concept) missing.add('creative');
  const recipe: Recipe = {
    pick: { product: ref('product', p.product, 'product'), ref: ref('ref', p.ref, 'creative'), scene: ref('scene', p.scene, 'set'), prop: ref('prop', p.prop, 'props') },
    shotType: oneOf<ShotType>(r.shotType, SHOT_TYPES.map((t) => t.id), 'clean'),
    idea: text(r.idea), facts: text(r.facts), concept,
    detailTarget: oneOf(r.detailTarget, DETAIL_TARGETS.map((x) => x.id), 'texture'),
    feature: text(r.feature),
    scaleRef: oneOf(r.scaleRef, SCALE_REFERENCES.map((x) => x.id), 'hand'),
    handPose: oneOf(r.handPose, HAND_POSES.map((x) => x.id), 'hold'),
    dimensions: size(r.dimensions),
    referenceSize: (({ width, depth }) => ({ width, depth }))(size(r.referenceSize)),
    extraAngles: (Array.isArray(r.extraAngles) ? r.extraAngles : []).filter((id) => PRODUCT_SET_SHOTS.some((x) => x.id === id)) as string[],
    scene: oneOf(r.scene, [PRESET, ...SETS.map((x) => x.id)], PRESET),
    color: oneOf(r.color, BACKDROP_COLORS.map((x) => x.id), 'white'),
    props: oneOf(r.props, [NO_PROPS, ...PROP_STYLES.map((x) => x.id)], NO_PROPS),
    propText: text(r.propText),
    angle: oneOf(r.angle, [PRESET, CUSTOM_ANGLE, ...PRODUCT_ANGLES.map((x) => x.id)], PRESET),
    turn: r.turn ? readTurn(r.turn) : null,
    framing: oneOf(r.framing, [PRESET, ...PRODUCT_FRAMINGS.map((x) => x.id)], PRESET),
    refMode: oneOf<RefMode>(r.refMode, REF_MODES.map((m) => m.id), 'shot'),
    aspect: oneOf<string>(r.aspect, PRODUCT_ASPECTS.map((a) => a.id), '1:1'),
    quality: typeof r.quality === 'string' ? r.quality : 'high',
    extra: text(r.extra),
  };
  return { recipe, missing: [...missing] };
}
