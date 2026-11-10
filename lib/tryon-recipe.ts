// model page (components/TryOn.tsx) recipe: steps 1–8 choices saved with each generated image (meta.recipe, lib/recipe.ts)
import { PLATFORM_ASPECTS } from './aspects';
import {
  ANGLES, FACE_MOODS, FRAMINGS, GAZES, LIGHT_SOURCES, MODELS, PLACEMENTS, POSE_MODES, PRESETS, PROPS, defaultQuality, qualitiesFor,
  type Item, type LightSource, type PoseMode,
} from './catalog';
import type { BackgroundMode, PhotoGoal } from './photo-director';
import { oneOf } from './recipe';

export type PickKey = 'model' | 'outfit' | 'accessory' | 'pose' | 'scene';
export type StepKey = 'model' | 'outfit' | 'accessory' | 'pose' | 'scene' | 'settings' | 'view' | 'output';
// อ้างถึงรายการด้วย id (ไม่ใช้ตำแหน่ง ลบ/เพิ่มแล้วไม่ต้องไล่แก้): รูป = src, ฉากแบบคำบรรยาย = ชื่อ
export const idOf = (item: Item) => item.src ?? item.name;
// ท่าสำเร็จรูป (ไม่มีรูปท่า ให้ AI ตัววางแผนคิดท่าจากฉาก) — id = "preset:<id ใน POSE_PRESETS หรือ auto>" ไม่ชนกับรูป (src ขึ้นต้นด้วย /)
export const PRESET_POSE = 'preset:';
// ใช้ภาพที่ไหน: ค่าเริ่มต้น IG · Facebook ฟีด 4:5 (ผู้ใช้ขอ 29 ต.ค. ลูกค้าส่วนใหญ่ลง IG) — AI ทำ 2:3 แล้ว server ตัดบนล่าง
export const DEFAULT_ASPECT = '4:5';

type Pick = { model: string; outfit: string | null; accessory: string[]; pose: string | null; scene: string | null; top: string | null; bottom: string | null; shoes: string | null };
export type Recipe = {
  pick: Pick; preset: string; framing: string; angle: string; placement: string; poseMode: PoseMode; light: LightSource; mood: string;
  aspect: string; quality: string; extra: string; harmonize: boolean; gaze: string; props: string[]; background: BackgroundMode; goal: PhotoGoal; autoRepair: boolean;
};
export const START: Recipe = {
  pick: { model: idOf(MODELS[0]), outfit: null, accessory: [], pose: null, scene: null, top: null, bottom: null, shoes: null },
  preset: PRESETS[0].id, framing: 'auto', angle: 'auto', placement: 'auto', poseMode: 'pose', light: 'ref', mood: 'auto',
  aspect: DEFAULT_ASPECT, quality: 'medium', extra: '', harmonize: false, gaze: '', props: [], background: 'explore', goal: 'lifestyle', autoRepair: true,
};
// stored recipe -> valid Recipe; an id no longer in the lists (deleted upload) -> null, its step listed in missing (doll shows "+")
// model: quality must be one the current model offers
export function readRecipe(raw: Partial<Recipe>, lists: Record<PickKey, Item[]>, model: string): { recipe: Recipe; missing: StepKey[] } {
  const r = raw as Record<string, unknown>;
  const p = (r.pick && typeof r.pick === 'object' ? r.pick : {}) as Record<string, unknown>;
  const missing = new Set<StepKey>();
  const has = (key: PickKey, id: unknown) => typeof id === 'string' && lists[key].some((i) => idOf(i) === id);
  const ref = (key: PickKey, id: unknown, step: StepKey) => {
    if (id === null || id === undefined) return null;
    if (has(key, id)) return id as string;
    missing.add(step);
    return null;
  };
  const accessory = (Array.isArray(p.accessory) ? p.accessory : []).filter((id) => has('accessory', id) || void missing.add('accessory')) as string[];
  const recipe: Recipe = {
    pick: {
      model: has('model', p.model) ? p.model as string : START.pick.model, // required: deleted -> first model (as deleteUpload)
      outfit: ref('outfit', p.outfit, 'outfit'), accessory,
      pose: typeof p.pose === 'string' && p.pose.startsWith(PRESET_POSE) ? p.pose : ref('pose', p.pose, 'pose'),
      scene: ref('scene', p.scene, 'scene'), top: ref('outfit', p.top, 'outfit'), bottom: ref('outfit', p.bottom, 'outfit'), shoes: ref('accessory', p.shoes, 'outfit'),
    },
    preset: oneOf(r.preset, PRESETS.map((x) => x.id), START.preset),
    framing: oneOf(r.framing, ['auto', ...FRAMINGS.map((x) => x.id)], 'auto'),
    angle: oneOf(r.angle, ['auto', ...ANGLES.map((x) => x.id)], 'auto'),
    placement: oneOf(r.placement, ['auto', ...PLACEMENTS.map((x) => x.id)], 'auto'),
    poseMode: oneOf<PoseMode>(r.poseMode, POSE_MODES.map((m) => m.id), START.poseMode),
    light: oneOf<LightSource>(r.light, LIGHT_SOURCES.map((l) => l.id), START.light),
    mood: oneOf(r.mood, FACE_MOODS.map((m) => m.id), 'auto'),
    aspect: oneOf<string>(r.aspect, PLATFORM_ASPECTS.map((a) => a.id), DEFAULT_ASPECT),
    quality: oneOf(r.quality, qualitiesFor(model).map((q) => q.id), defaultQuality(model)),
    extra: typeof r.extra === 'string' ? r.extra : '',
    harmonize: r.harmonize === true,
    gaze: oneOf(r.gaze, ['', ...GAZES.map((g) => g.id)], ''),
    props: (Array.isArray(r.props) ? r.props : []).filter((id) => PROPS.some((x) => x.id === id)) as string[],
    background: oneOf<BackgroundMode>(r.background, ['explore', 'keep'], 'explore'),
    goal: oneOf<PhotoGoal>(r.goal, ['lifestyle', 'outfit', 'editorial'], 'lifestyle'),
    autoRepair: r.autoRepair !== false,
  };
  return { recipe, missing: [...missing] };
}
