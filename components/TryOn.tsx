'use client';
// SnapAds (เดิมชื่อ Looklet): เลือกนางแบบ + ชุด + ของเสริม + ฉาก -> AI สร้างรูป -> แต่งรูป (ฟรี) -> บันทึก
// การสร้างรูปเรียกผ่าน API ของเรา (app/api/*) ซึ่งถือ API key ไว้ หน้าเว็บไม่เห็น key
// การแต่งรูปใช้อัลกอริทึมใน lib/vision.js + lib/beauty.js ทำในเครื่อง ไม่เสียเงิน
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AccessoryDialog from './AccessoryDialog';
import ImageViewer from './ImageViewer';
import LocalEditDialog, { type LocalEditRequest } from './LocalEditDialog';
import { SignOutButton } from './AuthForm';
import { PaperDoll, type DollChip, type DollSlot } from './PaperDoll';
import { PersonView } from './PersonView';
import { PoseView } from './PoseView';
import { ShotPlanView } from './ShotPlanView';
import { ShotChoiceDialog } from './ShotChoiceDialog';
import type { BackgroundMode, PhotoGoal, ShotProposal, StoredPosePlan } from '@/lib/photo-director';
import { generateSelectedShots } from '@/lib/shot-batch';
import { StyleView } from './StyleView';
import { PLATFORM_ASPECTS } from '@/lib/aspects';
import {
  IconBag, IconCompare, IconDownload, IconEdit, IconFrame, IconModel, IconPalette, IconPose, IconReset, IconRetouch, IconScene, IconSearch, IconSettings,
  IconShirt, IconSparkle, IconZoom,
} from './icons';
import { AddCard, Card, ChipGroup, ConfirmDialog, DeleteButton, GalleryLink, PageSwitch, PendingCard, rangeFill, GalleryToggle, RemoveImageDialog, SaveImageDialog, Section, TokenUsage, useChosenSteps } from './ui';
import { useHistoryPlaces } from './useHistoryPlaces';
import { useRecipeSync } from './useRecipeSync';
import { useRetouchCanvas, type Amounts, type RetouchId } from './useRetouchCanvas';
import { FILM_DEFAULT, NO_FILM, type Film, type FilmLook } from '@/lib/film';
import { DEFAULT_ASPECT, PRESET_POSE, START, idOf, readRecipe, type PickKey as Key, type Recipe, type StepKey } from '@/lib/tryon-recipe';
import { SKIN_MODEL } from '@/lib/skin';
import {
  api, canOpenImage, canvasJpeg, finishedCanvas, friendlyError, guessAccessory, inAppBrowser, isHeic, jpegBase64, loadImg, loadTools, openaiSize,
  saveImageFile, thumbSrc, toWebImage, uploadImage,
} from '@/lib/browser';
import {
  ACCESSORIES, ACCESSORY_TYPES, ANGLES, DEFAULT_AI_MODEL, FACE_MOODS, FRAMINGS, GAZES, PLACEMENTS, LIGHT_SOURCES, MAX_ACCESSORIES, MODELS, OUTFITS,
  POSE_AUTO, POSE_MODES, POSE_PRESETS, POSES, PRESET_PARTS, PRESETS, PROPS, SCENES, SET_SHOTS, SKIN_TONES, defaultQuality, isGpt25, qualitiesFor,
  MAX_WEAR, WEAR_TABS, wearPart, type WearSlot,
  presetLightPrompt, presetPrompt, type AccessoryInfo, type Item, type LightSource, type PoseMode, type Preset,
} from '@/lib/catalog';

const KIND = { model: 'models', outfit: 'outfits', accessory: 'accessories', pose: 'poses', scene: 'scenes' } as const;
const CATALOG: Record<Key, Item[]> = { model: MODELS, outfit: OUTFITS, accessory: ACCESSORIES, pose: POSES, scene: SCENES };

const find = (list: Item[], id: string | null) => (id === null ? undefined : list.find((i) => idOf(i) === id));
const POSE_CHOICES = [POSE_AUTO, ...POSE_PRESETS];
// ของเสริมรูปเก่าที่ไม่มีประเภท -> ถือเป็น "อื่นๆ"
const accessoryType = (a: Item) => ACCESSORY_TYPES.find((t) => t.id === a.type) ?? ACCESSORY_TYPES.find((t) => t.id === 'other')!;

// ใส่หน้าจริงจากรูปนางแบบหลัง AI สร้างรูป (ปิด = false: ได้แค่รูปจาก AI ล้วน)
// ปิดไว้ (15 ต.ค.): มีตัวเลือกท่า/มุมกล้อง/ระยะ/การมองมากขึ้น หน้าในรูปใหม่หัน/ไกล/เล็กต่างจากรูปนางแบบ หน้าที่แปะไม่เข้ากับตัว
// (14 ต.ค. เคยลองปิดแล้วรูปดูแปลกกว่า ตอนนั้นยังไม่มีตัวเลือกพวกนี้) — เปิดใหม่ = true, realFace + pasteRealFace ยังอยู่ครบ
const REAL_FACE = false;

// ตัวเลือกสีหน้าในขั้นท่าโพสต์ (FACE_MOODS) — ซ่อนไว้ก่อน (29 ต.ค. ผู้ใช้ขอ): สีหน้าเป็น "อัตโนมัติ" เสมอ
// (ตามรูปท่า / ท่าสำเร็จรูป) โค้ดและ prompt ยังอยู่ครบ เปิดใหม่ = true
const MOOD_PICKER = false;

// รูปท่าโพสต์ใช้แบบไหน (POSE_MODES): null = ผู้ใช้เลือกเอง (ปุ่ม ลอกแค่ท่า / ลอกทั้งช็อต / ลอกทั้งช็อต + ฉาก และปุ่มแสง LIGHT_SOURCES)
// id = ใช้แบบนั้นเสมอ ไม่มีปุ่ม แสงจากรูปท่า ('ref') · ขั้นที่ไม่ใช้เป็นสีเทา (unusedWhy) ทั้งสองแบบ
// 29 ต.ค. 'pose' (ซ่อนลอกทั้งช็อต) · 3 พ.ย. null (เปิดคืน) · 5 พ.ย. 'shot-scene' (ผู้ใช้ขอ: เลือกแค่รูปท่า แล้วลอกทั้งช็อต + ฉากให้อัตโนมัติ)
const FIXED_POSE_MODE: PoseMode | null = 'shot-scene';
// เลือกรูปท่าแล้ว (FIXED_POSE_MODE 'shot-scene'): ขั้นฉากหลังยังเลือกได้ (6 พ.ย. ผู้ใช้ขอ) — ไม่เลือกฉาก = ฉากจากรูปท่า (ทำงานเหมือนเดิมทุกอย่าง)
// เลือกฉาก (รูปถ่าย) = 'shot-room': server ถ่ายฉากนั้นใหม่ให้มุมกล้อง/ระยะ/แสงเหมือนรูปท่าก่อน แล้วลอกทั้งช็อตลงฉากนั้น (สร้าง 2 รูป)

// ท่าสำเร็จรูปในขั้นท่าโพสต์ (ท่าเดิม + POSE_PRESETS + AI จัดท่าและมุมกล้อง) — ซ่อนไว้ 5 พ.ย. (ผู้ใช้ขอ): ขั้นนี้เลือกแค่รูปท่าโพสต์
// ไม่เลือกรูป = ท่าเดิม (การ์ด "ท่าเดิม" ในรายการรูปแบบ ชุดเดิม/ฉากเดิม) · ค่าท่าสำเร็จรูปที่ค้างอยู่ถูกข้าม · โค้ด UI/API/planner ยังอยู่ครบ เปิดใหม่ = true
const POSE_PRESET_PICKER = false;

// ชุดภาพ 4 มุม (SET_SHOTS) — ปุ่มเป็นสีเทากดไม่ได้ไว้ก่อน บอก "เร็วๆ นี้" (29 ต.ค. ผู้ใช้ขอ) · โค้ดสร้างชุดภาพยังอยู่ครบ เปิดใหม่ = true
const SET_SHOOT = false;

// การ์ด "ตามสไตล์" ในขั้นมุมมอง: วาดระยะ/มุมที่สไตล์นั้นใช้ (เดาจากชื่อไทยของสไตล์ ใช้แค่รูปประกอบ ไม่ได้ส่งให้ AI)
const presetFraming = (p: Preset) => (p.fullBody ? 'full' : 'waist');
const presetAngle = (p: Preset) => {
  const label = p.angle.label;
  return /ต่ำ/.test(label) ? 'low' : /ก้ม/.test(label) ? 'high' : /เฉียง/.test(label) ? 'side' : /สายตา/.test(label) ? 'eye' : 'chest';
};

const NO_RETOUCH: Amounts = { eye: 0, slim: 0, acne: 0, smooth: 0, white: 0 };
const AUTO: Amounts = { eye: 30, slim: 25, acne: 50, smooth: 35, white: 30 }; // "แต่งอัตโนมัติ": ค่ากลางๆ ดูเป็นธรรมชาติ
const SLIDERS: [RetouchId, string][] = [['eye', 'ตาโต'], ['slim', 'หน้าเรียว'], ['acne', 'ลบสิว/จุดด่าง'], ['smooth', 'หน้าเนียน'], ['white', 'ผิวขาว']];
// ให้ดูเป็นรูปถ่ายจริง (lib/film.ts): ใส่ให้ทุกรูปที่สร้างอัตโนมัติตามค่า FILM_DEFAULT
const FILM_SLIDERS: ['grain' | 'soften', string][] = [['grain', 'เกรนฟิล์ม'], ['soften', 'ลดความคม']];
// ลุคภาพ: อัตโนมัติ = ตามที่รูปนั้นสร้างมา (Phone candid -> มือถือ, อื่นๆ -> ฟิล์ม) เก็บไว้กับรูป (finish)
const FINISH_LOOKS = [
  { id: 'auto', name: 'อัตโนมัติ', hint: 'รูปปรับผิวไม่ใส่ลุค · Phone candid ได้ลุคมือถือ · รูปอื่นได้ลุคฟิล์ม' },
  { id: 'film', name: 'ฟิล์ม', hint: 'ลดความคม + เกรนฟิล์ม แบบรูปนิตยสาร' },
  { id: 'phone', name: 'มือถือ', hint: 'คมแบบมือถือ สีจืดลง ดำ/ขาวชัดขึ้น noise เบาๆ ในเงา (จูนจากรูป iPhone จริง)' },
  { id: 'off', name: 'ไม่ใส่', hint: 'รูปจาก AI ล้วน' },
] as const;
type FinishChoice = (typeof FINISH_LOOKS)[number]['id'];

type PosePlan = StoredPosePlan;
// set = อยู่ในชุดภาพหลายมุม, finish = ลุคที่เหมาะกับรูปนี้, posePlan = ท่าที่ AI คิดให้
type Result = { src: string; caption: string; set?: SetTag; finish?: FilmLook; refinedFrom?: string; editedFrom?: string; posePlan?: PosePlan; recipe?: Partial<Recipe>; inGallery?: boolean };
type AiModel = { id: string; label: string };
const newSetId = () => crypto.randomUUID().slice(0, 13); // id ชุดภาพ (server รับแค่ตัวอักษร ตัวเลข - _)
type SetTag = { id: string; index: number }; // ชุดภาพหลายมุม (เหมือน SetTag ใน lib/storage.ts — ไฟล์นั้นใช้ฝั่ง server เท่านั้น)
// page = 'product' -> รูปจากหน้าสินค้า (components/Packshot.tsx) ไม่โชว์ในประวัติรูปของหน้านี้
type Stored = { src: string; name?: string; caption?: string; type?: string; set?: SetTag; finish?: FilmLook; refinedFrom?: string; editedFrom?: string; posePlan?: PosePlan; page?: string; recipe?: Partial<Recipe>; inGallery?: boolean; inHistory?: boolean };
type Library = { results: Stored[]; uploads: Record<string, Stored[]> };

// ขั้นตอน (เมนูซ้าย): แต่ละขั้นมีแผงเลือก (ซ้าย) รูปอยู่ขวาตลอด (ไม่มีแผงขวาแล้ว 28 ต.ค.)
const STEPS: { key: StepKey; label: string; title: string; Icon: () => ReactNode }[] = [
  { key: 'model', label: 'นางแบบ', title: 'เลือกนางแบบ', Icon: IconModel },
  { key: 'outfit', label: 'เสื้อผ้า', title: 'เลือกเสื้อผ้า', Icon: IconShirt },
  { key: 'accessory', label: 'ของเสริม', title: 'ของเสริม', Icon: IconBag },
  { key: 'pose', label: 'ท่าโพสต์', title: 'ท่าโพสต์', Icon: IconPose },
  { key: 'scene', label: 'ฉากหลัง', title: 'ฉากหลัง', Icon: IconScene },
  { key: 'settings', label: 'สไตล์ถ่ายภาพ', title: 'เลือกสไตล์ถ่ายภาพ', Icon: IconPalette },
  // มุมมอง = ระยะ + มุมกล้อง + ตำแหน่ง รวมเป็นขั้นเดียว (29 ต.ค.) การ์ดมีภาพวาด (PersonView) · อยู่หลังสไตล์ (การ์ด "ตามสไตล์" ใช้สไตล์ที่เลือก)
  // ระยะ/มุมกล้องแยกจากสไตล์ถ่ายภาพ (สำคัญกับสินค้า: รองเท้าต้องเต็มตัว เสื้อครึ่งตัว) ไม่เลือก = ตามสไตล์
  // ตำแหน่ง: ไม่สั่ง AI วางกลางภาพเกือบทุกรูป (ทดสอบ 21 ต.ค.) อัตโนมัติ = สุ่มซ้าย/ขวา/กลางต่อรูป
  { key: 'view', label: 'มุมมอง', title: 'เลือกมุมมอง', Icon: IconFrame },
  // ตั้งค่า (แบบหน้าสินค้า 29 ต.ค.): ใช้ภาพที่ไหน + สั่งเพิ่มเติม + ขั้นสูง + ปุ่มสร้างรูปท้ายเส้นทาง
  { key: 'output', label: 'ตั้งค่า', title: 'ตั้งค่า', Icon: IconSettings },
];
// ตัวกรองในแผงเลือก (ของเสริมกรองตามประเภทแทน)
const SOURCE_FILTERS = [{ id: 'all', name: 'ทั้งหมด' }, { id: 'catalog', name: 'ตัวอย่าง' }, { id: 'uploaded', name: 'อัปโหลดเอง' }];

// รองเท้าอยู่ในรายการของเสริม (type shoes) แต่เลือกในขั้นเสื้อผ้า แท็บรองเท้า — ขั้นของเสริมไม่โชว์
const isShoes = (i: Item) => i.type === 'shoes';
// เปลี่ยนช่องเสื้อผ้า: ทั้งชุด = ล้างเสื้อ/ท่อนล่าง, เสื้อหรือท่อนล่าง = ล้างทั้งชุด (คำสั่ง AI จะขัดกัน) · รองเท้าแยกอิสระ
const wearPatch = (slot: WearSlot, id: string | null) => slot === 'set' ? { outfit: id, ...(id ? { top: null, bottom: null } : {}) }
  : slot === 'shoes' ? { shoes: id }
    : slot === 'top' ? { top: id, ...(id ? { outfit: null } : {}) } : { bottom: id, ...(id ? { outfit: null } : {}) };

export default function TryOn() {
  const [lists, setLists] = useState(CATALOG);
  // every step's choice lives here (lib/tryon-recipe.ts); a new option is added to Recipe, not as its own useState
  const [choices, setChoices] = useState<Recipe>(START);
  const update = (patch: Partial<Recipe> | ((r: Recipe) => Partial<Recipe>)) => setChoices((r) => ({ ...r, ...(typeof patch === 'function' ? patch(r) : patch) }));
  const {
    pick, // outfit(ทั้งชุด)/top/bottom/shoes/pose/scene = null คือ "ของเดิม", accessory = หลายชิ้นได้
    preset: presetId, // สไตล์ถ่ายภาพ (แสง + เลนส์ + โทนสี + ระยะ/มุมเริ่มต้น)
    framing: framingId, angle: angleId, // FRAMINGS / ANGLES, 'auto' = ตามสไตล์
    placement: placementId, // PLACEMENTS, 'auto' = สุ่มต่อรูป
    poseMode: poseModeChoice, // เอาอะไรจากรูปท่าโพสต์ (ใช้เมื่อ FIXED_POSE_MODE = null)
    light: lightChoice, // ลอกทั้งช็อต: แสงจากรูปต้นแบบ หรือจากสไตล์ถ่ายภาพ
    mood: faceMood, gaze: gazeId, // FACE_MOODS / GAZES ('' = ไม่กำหนด)
    aspect, quality, extra, harmonize, props: heldProps, background: backgroundMode, goal: photoGoal, autoRepair,
  } = choices;
  const [outfitTab, setOutfitTab] = useState<WearSlot>('top'); // แท็บในขั้นเสื้อผ้า
  const [tone, setTone] = useState<string | null>(null); // สีผิว null = สีเดิม
  const [amounts, setAmounts] = useState(NO_RETOUCH);
  const [finish, setFinish] = useState<FinishChoice>('auto');
  const [film, setFilm] = useState<Film>(FILM_DEFAULT); // ค่าสไลเดอร์ของแต่ละลุค (look ใน state นี้ไม่ใช้ ใช้ finish แทน)
  const [results, setResults] = useState<Result[]>([]); // รูปที่สร้างแล้ว ใหม่สุดอยู่หน้า
  const [current, setCurrent] = useState<number | null>(null); // กำลังแสดง: null = รูปนางแบบ (ตัวอย่าง), ตัวเลข = results[current]
  const [zoomed, setZoomed] = useState(false);
  const [editing, setEditing] = useState(false); // edit mode: edit panel instead of rail + left panel (Go list items 1, 6, 7)
  const [base, setBase] = useState<Recipe | null>(null); // recipe of the past image the current draft started from (set aside with the draft)
  const [confirmReset, setConfirmReset] = useState(false); // "ล้างตัวเลือก?" dialog before startOver
  const [original, setOriginal] = useState(false); // กดค้าง "ดูก่อนแต่ง"
  const [status, setStatus] = useState('');
  const [retouchStatus, setRetouchStatus] = useState(''); // ข้อความในกล่องแต่งรูป
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false); // generate() running: spinner on the "รูปใหม่" tile
  // ชุดภาพที่กำลังสร้างมุมที่เหลือ: รูปหลักโชว์แล้ว ดูได้ระหว่างรอ (ไม่บังรูป) ประวัติรูปโชว์ช่องรอ left ช่อง
  const [pendingSet, setPendingSet] = useState<{ id: string; left: number } | null>(null);
  const [aiModels, setAiModels] = useState<AiModel[] | null>(null); // null = กำลังโหลด
  const [aiModel, setAiModel] = useState('');
  const [shotChoice, setShotChoice] = useState<{
    proposal: ShotProposal; references: { src: string; name: string }[]; choose: (ids: string[]) => void;
  } | null>(null);
  const lightSource: LightSource = FIXED_POSE_MODE ? 'ref' : lightChoice; // ไม่มีปุ่มเลือก = แสงจากรูปท่าเสมอ
  // ของเสริมที่ AI กำลังดูว่าเป็นอะไร (URL รูปชั่วคราว) ขึ้นเป็นการ์ดรอในรายการ
  const [analyzing, setAnalyzing] = useState<string[]>([]);
  // รูปที่กำลังเก็บขึ้น server (ทุกขั้น) ขึ้นการ์ดรอจนเก็บเสร็จ — เดิมไม่มีการ์ด รูปหายไปหลายวินาทีบนเน็ตมือถือ ผู้ใช้นึกว่ารูปหาย (22 ต.ค.)
  const [saving, setSaving] = useState<{ key: Key; url: string }[]>([]);
  const [removingSrc, setRemovingSrc] = useState<string | null>(null); // pending ConfirmDialog
  const [deletingUpload, setDeletingUpload] = useState<{ key: Key; item: Item } | null>(null); // pending ConfirmDialog
  const [saveSrc, setSaveSrc] = useState<string | null>(null); // ดาวน์โหลดไม่ได้ (browser ในแอป) -> โชว์รูปให้กดค้างบันทึก
  // ดูรูปเต็มจอ + ซูม (temp = blob URL ต้องคืนตอนปิด) — เปิดมาแบบพอดีจอเสมอ กดในหน้าต่างถึงจะซูม (29 ต.ค. ผู้ใช้ขอ)
  const [viewer, setViewer] = useState<{ src: string; alt: string; temp: boolean } | null>(null);
  // หน้าต่างของเสริม: add = AI ดูไม่ออก ให้เลือกประเภทเอง, edit = แก้ชิ้นที่เพิ่มไว้แล้ว
  const [dialog, setDialog] = useState<{ mode: 'add'; file: File; url: string } | { mode: 'edit'; item: Item } | null>(null);
  const [localEdit, setLocalEdit] = useState<{ src: string; caption: string } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const newTileRef = useRef<HTMLButtonElement>(null); // "รูปใหม่" history tile: gets focus after "ล้าง"
  const editCloseRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const [step, setStep] = useState(0); // อยู่ขั้นไหน (ตำแหน่งใน STEPS)
  const [query, setQuery] = useState(''); // ค้นหาตามชื่อในแผงเลือก
  const [filter, setFilter] = useState('all'); // ตัวกรองในแผงเลือก (SOURCE_FILTERS หรือ id ประเภทของเสริม)

  const model = find(lists.model, pick.model) ?? lists.model[0];
  const outfit = find(lists.outfit, pick.outfit); // ทั้งชุด
  const top = find(lists.outfit, pick.top), bottom = find(lists.outfit, pick.bottom), shoes = find(lists.accessory, pick.shoes);
  const wornCount = [outfit, top, bottom, shoes].filter(Boolean).length;
  const accLimit = Math.max(0, Math.min(MAX_ACCESSORIES, MAX_WEAR - wornCount)); // ของเสริมเหลือได้กี่ชิ้น (รวมกับเสื้อผ้าไม่เกิน MAX_WEAR)
  const posePreset = POSE_PRESET_PICKER && pick.pose?.startsWith(PRESET_POSE) ? POSE_CHOICES.find((p) => PRESET_POSE + p.id === pick.pose) : undefined;
  const isDirector = posePreset?.id === POSE_AUTO.id;
  const pose = posePreset ? undefined : find(lists.pose, pick.pose);
  const scene = find(lists.scene, pick.scene);
  // เลือกรูปท่า + เลือกฉาก (รูปถ่าย) ในขั้นฉากหลัง = ลอกทั้งช็อตลงฉากที่เลือก ('shot-room') · ไม่เลือกฉาก = ลอกทั้งช็อต + ฉาก เหมือนเดิม
  const poseMode: PoseMode = FIXED_POSE_MODE === 'shot-scene' && scene?.src ? 'shot-room' : FIXED_POSE_MODE ?? poseModeChoice;
  // ลอกทั้งช็อตจากรูปท่า: มุมกล้อง/ระยะ/การมอง/แสงเอาจากรูป (ไม่ใช้สไตล์ถ่ายภาพกับการมอง), + ฉาก = ไม่ใช้ฉากที่เลือก
  const shot = Boolean(pose) && poseMode !== 'pose';
  const shotScene = Boolean(pose) && poseMode === 'shot-scene';
  const shotRoom = Boolean(pose) && poseMode === 'shot-room'; // ลอกทั้งช็อตลงฉากที่เลือก
  const sceneWithPose = Boolean(pose) && FIXED_POSE_MODE === 'shot-scene'; // มีรูปท่า: การ์ด "ไม่เลือกฉาก" = ฉากจากรูปท่า
  const shotPresetLight = shot && lightSource === 'preset'; // ลอกทั้งช็อตแต่ใช้แสง/โทนสีของสไตล์ถ่ายภาพ
  const mood = FACE_MOODS.find((m) => m.id === (isDirector ? 'auto' : faceMood)) ?? FACE_MOODS[0];
  const moodName = mood.id !== 'auto' ? mood.name : pose ? 'สีหน้าตามรูปท่า' : null; // null = ตามรูปนางแบบ ไม่ต้องบอก
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  // ลอกทั้งช็อต = มุม/ระยะตามรูปต้นแบบ ไม่ใช้ที่เลือก
  // ใช้รูปท่าโพสต์ + ระยะใกล้ (เข่า/ครึ่งตัว/ใกล้) ได้: ส่วนของท่าที่อยู่นอกกรอบ (ขา/เท้า) ถูกตัดออก — ไม่เลือก = ตามสไตล์ (เต็มตัว)
  const framingChoice = shot || isDirector ? undefined : FRAMINGS.find((f) => f.id === framingId);
  const angleChoice = shot || isDirector ? undefined : ANGLES.find((a) => a.id === angleId);
  // ท่าเดิม + ฉากเดิม (เปลี่ยนแค่ชุด) = คนอยู่ที่เดิม server ไม่สั่งตำแหน่ง (lib/prompts.ts)
  const keepsPlace = !pose && !posePreset && !scene;
  const placementChoice = shot || keepsPlace || isDirector ? undefined : PLACEMENTS.find((p) => p.id === placementId);
  const gaze = shot || isDirector ? undefined : GAZES.find((c) => c.id === gazeId);
  const propChoices = isDirector ? [] : PROPS.filter((p) => heldProps.includes(p.id));
  const accs = pick.accessory.map((id) => find(lists.accessory, id)).filter((a): a is Item => a !== undefined);
  const shown = current === null ? null : results[current];
  const finishLook: FilmLook = finish === 'auto' ? shown?.finish ?? 'film' : finish; // รูปเก่าที่ไม่ได้เก็บลุคไว้ = ฟิล์ม

  const { canvasRef, fullRef, fullSrcRef, prepare } = useRetouchCanvas(
    { src: shown?.src ?? model.src!, tone, amounts, zoomed, original, film: shown ? { ...film, look: finishLook } : NO_FILM }, // ใส่เฉพาะรูปที่สร้าง ไม่ใส่รูปนางแบบตัวอย่าง
    setRetouchStatus,
  );

  // เปิดหน้าเว็บ -> ดึงรูปที่เคยสร้าง/เคยเพิ่มไว้กลับมา (รูปที่เพิ่มเองต่อท้ายรายการใน catalog เก่าสุดก่อน)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/library')
      .then((r) => (r.ok ? (r.json() as Promise<Library>) : null))
      .then((lib) => {
        if (!lib || cancelled) return;
        const past = lib.results.filter((r) => r.page !== 'product' && r.inHistory !== false).map((r) => ({ src: r.src, caption: r.caption || 'รูปที่สร้างไว้', set: r.set, finish: r.finish, refinedFrom: r.refinedFrom, editedFrom: r.editedFrom, posePlan: r.posePlan, recipe: r.recipe, inGallery: r.inGallery }));
        setResults(past);
        const at = past.findIndex((r) => r.src === new URLSearchParams(location.search).get('image')); // ✎ on /gallery
        if (at >= 0) setCurrent(at);
        const uploaded = (key: Key) => [...(lib.uploads[KIND[key]] ?? [])].reverse()
          .map((u): Item => ({ name: u.name ?? 'รูปที่เพิ่ม', src: u.src, type: u.type, uploaded: true }));
        setLists({
          model: [...MODELS, ...uploaded('model')],
          outfit: [...OUTFITS, ...uploaded('outfit')],
          accessory: [...ACCESSORIES, ...uploaded('accessory')],
          pose: [...POSES, ...uploaded('pose')],
          scene: [...SCENES, ...uploaded('scene')],
        });
      })
      .catch((err) => console.error('โหลดคลังรูปไม่สำเร็จ', err));
    return () => { cancelled = true; };
  }, []);

  // รายชื่อโมเดล AI (มีเฉพาะเจ้าที่มี key ใน .env)
  useEffect(() => {
    fetch('/api/models')
      .then((r) => (r.ok ? (r.json() as Promise<AiModel[]>) : []))
      .catch(() => [] as AiModel[])
      .then((list) => {
        setAiModels(list);
        // ค่าเริ่มต้น GPT Image 2.5 Sunburst (คุณภาพ high) — ไม่มี key OpenAI ใช้ตัวแรกที่มี
        if (list.length) { // มีโมเดลเดียว (DEFAULT_AI_MODEL) เลือกเองไม่ได้แล้ว · คุณภาพเริ่มต้นตามโมเดล
          const id = (list.find((m) => m.id === DEFAULT_AI_MODEL) ?? list[0]).id;
          setAiModel(id);
          update({ quality: defaultQuality(id) });
        }
        else setStatus('สร้างรูปไม่ได้: ต้องมี API key ในไฟล์ .env (แก้แล้วรีสตาร์ท npm run dev)');
      });
  }, []);

  // โหลดเครื่องมือแต่งรูปล่วงหน้า (หลังหน้าเว็บขึ้นแล้ว) ตอนแตะสไลเดอร์จะได้ใช้ได้ทันที
  useEffect(() => {
    const id = setTimeout(() => {
      loadTools(setRetouchStatus).catch((err) => setRetouchStatus('โหลดเครื่องมือแต่งรูปไม่สำเร็จ: ' + err.message));
    }, 500);
    return () => clearTimeout(id);
  }, []);

  // เปลี่ยนโมเดล AI -> คุณภาพกลับเป็นค่าเริ่มต้นของโมเดลนั้น (ระดับที่รุ่นหนึ่งมี อีกรุ่นอาจไม่มี)
  function select(key: Exclude<Key, 'accessory'>, id: string | null) {
    update((r) => ({ pick: { ...r.pick, [key]: id } })); // stage switches to the paper doll via the recipe change check (below useChosenSteps)
  }

  // panel <- recipe (steps = touched steps for useChosenSteps: "+" vs keep cards on the paper doll)
  function applyRecipe(r: Recipe, steps: StepKey[]) {
    setChoices(r);
    setChosen(new Set(steps));
  }

  // ของเสริม: กดแล้วสลับเลือก/ไม่เลือก, null = ไม่ใส่สักชิ้น
  function toggleAccessory(id: string | null) {
    if (id !== null && !pick.accessory.includes(id) && pick.accessory.length >= accLimit) {
      return setStatus(accLimit < MAX_ACCESSORIES
        ? `เสื้อผ้าและของเสริมรวมกันใส่ได้ไม่เกิน ${MAX_WEAR} ชิ้นต่อรูป — เอาของเสริมหรือเสื้อผ้าบางชิ้นออกก่อน`
        : `ของเสริมเลือกได้ไม่เกิน ${MAX_ACCESSORIES} ชิ้นต่อรูป — กดชิ้นที่เลือกอยู่เพื่อเอาออกก่อน`);
    }
    setStatus('');
    update(({ pick: p }) => ({ pick: {
      ...p,
      accessory: id === null ? [] : p.accessory.includes(id) ? p.accessory.filter((x) => x !== id) : [...p.accessory, id],
    } }));
  }

  // ขั้นเสื้อผ้า: เลือกชิ้นในช่องนั้น (null = ของเดิม) · รวมกับของเสริมแล้วเกิน MAX_WEAR = ไม่ให้เลือก
  function wear(slot: WearSlot, id: string | null) {
    const after = { outfit: pick.outfit, top: pick.top, bottom: pick.bottom, shoes: pick.shoes, ...wearPatch(slot, id) };
    if (id && [after.outfit, after.top, after.bottom, after.shoes].filter(Boolean).length + pick.accessory.length > MAX_WEAR) {
      return setStatus(`เสื้อผ้าและของเสริมรวมกันใส่ได้ไม่เกิน ${MAX_WEAR} ชิ้นต่อรูป — เอาของเสริมออกก่อน`);
    }
    setStatus('');
    update((r) => ({ pick: { ...r.pick, ...wearPatch(slot, id) } }));
  }

  // อัปโหลดแล้วเซฟไว้ใน images/uploads/ แล้วเลือกให้เลย
  async function addUpload(key: Key, file: File, name: string, type?: string) {
    let src: string;
    const preview = URL.createObjectURL(file);
    setSaving((s) => [...s, { key, url: preview }]);
    try {
      ({ src } = await api('/api/upload', { kind: KIND[key], name, type, ...(await uploadImage(file)) }));
    } catch (err) {
      src = URL.createObjectURL(file); // เซฟไม่ได้ -> ใช้ชั่วคราวไปก่อน
      setStatus(`เก็บรูปไม่สำเร็จ (${(err as Error).message}) รูปนี้จะหายเมื่อ refresh — ลองเพิ่มใหม่อีกครั้ง`);
    } finally {
      setSaving((s) => s.filter((x) => x.url !== preview));
      URL.revokeObjectURL(preview);
    }
    setLists((l) => ({ ...l, [key]: [...l[key], { name, src, type, uploaded: true }] }));
    // ของเสริม: ไม่ใช้ toggleAccessory เพราะระหว่างรอ AI ผู้ใช้อาจเลือก/เอาออกชิ้นอื่นไปแล้ว ต้องนับจากค่าล่าสุด
    // เลือกครบแล้ว -> เพิ่มเข้ารายการเฉยๆ ไม่เลือกให้
    // เสื้อผ้า: เลือกในช่องตามส่วนของรูป (type) · รองเท้า (ของเสริมประเภท shoes) ไปช่องรองเท้า ไม่นับเป็นของเสริม
    if (key === 'outfit') update((r) => ({ pick: { ...r.pick, ...wearPatch(type === 'top' || type === 'bottom' ? type : 'set', src) } }));
    else if (key === 'accessory' && type === 'shoes') update((r) => ({ pick: { ...r.pick, shoes: src } }));
    else if (key === 'accessory') update((r) => (r.pick.accessory.length < accLimit ? { pick: { ...r.pick, accessory: [...r.pick.accessory, src] } } : {}));
    else select(key, src);
  }

  // HEIC (รูปจาก iPhone) แปลงเป็น JPEG ก่อน ไม่งั้น browser ส่วนใหญ่เปิดรูปไม่ได้ ย่อ/ส่งให้ AI ไม่ได้
  // slot = แท็บในขั้นเสื้อผ้าที่กดเพิ่มรูป (เสื้อ / ท่อนล่าง / ทั้งชุด เก็บเป็นรูปเสื้อผ้า, รองเท้า เก็บเป็นของเสริมประเภท shoes)
  async function onFile(key: Key, picked: File, slot?: WearSlot) {
    let file = picked;
    if (isHeic(picked)) {
      setStatus('กำลังแปลงรูป HEIC เป็น JPG...');
      try {
        file = await toWebImage(picked);
        setStatus('');
      } catch (err) {
        console.error('แปลงรูป HEIC ไม่สำเร็จ', err);
        return setStatus('เปิดรูป HEIC นี้ไม่ได้ — ลองส่งออกเป็น JPG จากแอปรูปภาพก่อน แล้วอัปโหลดใหม่');
      }
    }
    if (!(await canOpenImage(file))) return setStatus('เปิดรูปนี้ไม่ได้ (ชนิดไฟล์ไม่รองรับ) — ลองใช้รูป JPG หรือ PNG');
    const name = file.name.replace(/\.[^.]+$/, '');
    if (slot === 'shoes') return void addUpload('accessory', file, name, 'shoes');
    if (key === 'outfit') return void addUpload('outfit', file, name, slot === 'top' || slot === 'bottom' ? slot : undefined);
    if (key !== 'accessory') return void addUpload(key, file, name);
    void addAccessory(file);
  }

  // ของเสริม: ให้ AI ดูว่าเป็นอะไร + ตั้งชื่อ แล้วเพิ่มให้เลย ไม่ต้องกดยืนยัน
  // AI ดูไม่ออก -> เปิดหน้าต่างให้เลือกประเภทเอง, AI ทายผิด -> กดประเภทใต้การ์ดเพื่อแก้
  async function addAccessory(file: File) {
    const url = URL.createObjectURL(file);
    setAnalyzing((a) => [...a, url]);
    const guess = await guessAccessory(url);
    setAnalyzing((a) => a.filter((u) => u !== url));
    if (!guess) return setDialog({ mode: 'add', file, url });
    URL.revokeObjectURL(url);
    await addUpload('accessory', file, guess.name, guess.type);
    if (guess.type === 'shoes') setStatus('รูปนี้เป็นรองเท้า — อยู่ในขั้นเสื้อผ้า แท็บรองเท้า และเลือกให้แล้ว');
  }

  async function onDialogDone(info: AccessoryInfo | null) {
    const d = dialog;
    setDialog(null);
    if (!d) return;
    if (d.mode === 'add') {
      URL.revokeObjectURL(d.url);
      if (info) await addUpload('accessory', d.file, info.name, info.type);
      if (info?.type === 'shoes') setStatus('รูปนี้เป็นรองเท้า — อยู่ในขั้นเสื้อผ้า แท็บรองเท้า และเลือกให้แล้ว');
      return;
    }
    if (!info) return;
    try {
      if (!d.item.src!.startsWith('blob:')) await api('/api/update', { src: d.item.src, ...info });
    } catch (err) {
      return setStatus('แก้ไม่สำเร็จ: ' + (err as Error).message);
    }
    setLists((l) => ({ ...l, accessory: l.accessory.map((a) => (a === d.item ? { ...a, ...info } : a)) }));
    // แก้เป็นรองเท้า -> ย้ายไปช่องรองเท้าในขั้นเสื้อผ้า (ไม่เป็นของเสริมที่เลือกอยู่แล้ว)
    if (info.type === 'shoes') update((r) => ({ pick: { ...r.pick, accessory: r.pick.accessory.filter((x) => x !== idOf(d.item)) } }));
  }

  async function deleteUpload(key: Key, item: Item) {
    try {
      if (!item.src!.startsWith('blob:')) await api('/api/delete', { src: item.src });
    } catch (err) {
      return setStatus('ลบไม่สำเร็จ: ' + (err as Error).message);
    }
    const id = idOf(item);
    setLists((l) => ({ ...l, [key]: l[key].filter((i) => i !== item) }));
    // ตัวที่เลือกอยู่ถูกลบ -> กลับไปค่าเริ่มต้น
    update(({ pick: p }) => {
      if (key === 'accessory') return { pick: { ...p, accessory: p.accessory.filter((x) => x !== id), shoes: p.shoes === id ? null : p.shoes } };
      if (key === 'outfit') return { pick: { ...p, outfit: p.outfit === id ? null : p.outfit, top: p.top === id ? null : p.top, bottom: p.bottom === id ? null : p.bottom } };
      if (p[key] !== id) return {};
      return { pick: { ...p, [key]: key === 'model' ? idOf(MODELS[0]) : null } };
    });
  }

  const { toggleGallery, removeFromHistory } = useHistoryPlaces(results, setResults, setCurrent, setStatus);

  // ใส่หน้าจริงจากรูปนางแบบแทนหน้าที่ AI วาดใหม่ แล้วเซฟเป็นรูปใหม่ (รูปจาก AI ยังอยู่ไว้เทียบ)
  // ทำไม่ได้ (หาหน้าไม่เจอ / หน้าหันคนละมุม) -> บอกเหตุผล แล้วใช้รูปจาก AI ตามเดิม
  async function realFace(modelSrc: string, aiSrc: string, caption: string): Promise<Result | null> {
    try {
      const t = await loadTools(setRetouchStatus);
      const res = await t.pasteRealFace(modelSrc, aiSrc);
      if (!res.image) {
        setStatus(`ใส่หน้าจริงไม่ได้: ${res.error} — ใช้หน้าจาก AI แทน`);
        return null;
      }
      const cv = document.createElement('canvas');
      cv.width = res.image.width;
      cv.height = res.image.height;
      cv.getContext('2d')!.putImageData(res.image, 0, 0);
      const realCaption = caption + ' + หน้าจริง';
      const { src } = await api('/api/save-result', { data: cv.toDataURL('image/png').split(',')[1], mime: 'image/png', caption: realCaption });
      return { src, caption: realCaption };
    } catch (err) {
      console.error('ใส่หน้าจริงไม่สำเร็จ', err);
      setStatus(`ใส่หน้าจริงไม่สำเร็จ: ${(err as Error).message} — ใช้หน้าจาก AI แทน`);
      return null;
    }
  }

  // set = ชุดภาพ 4 มุม (SET_SHOTS): รูปหลักสร้างตามที่เลือก แล้วส่งรูปหลักเป็นต้นแบบให้อีก 3 มุมพร้อมกัน
  async function generate(set = false) {
    if (!wornCount && !accs.length && !pose && !posePreset && !scene) return setStatus('เลือกเสื้อผ้า ของเสริม ท่าโพสต์ หรือฉาก อย่างน้อย 1 อย่างก่อน');
    if (wornCount + accs.length > MAX_WEAR) return setStatus(`เสื้อผ้าและของเสริมรวมกันใส่ได้ไม่เกิน ${MAX_WEAR} ชิ้นต่อรูป — เอาบางชิ้นออกก่อน`);
    const choice = aiModels?.find((m) => m.id === aiModel);
    if (!choice) return;
    const platform = PLATFORM_ASPECTS.find((a) => a.id === aspect) ?? PLATFORM_ASPECTS.find((a) => a.id === DEFAULT_ASPECT)!;
    setStatus('');
    const modeName = POSE_MODES.find((m) => m.id === poseMode)!.name;
    const caption = [
      model.name,
      ([outfit, top, bottom, shoes].filter((w): w is Item => Boolean(w)).map((w) => w.name).join(' + ') || 'ชุดเดิม') + accs.map((a) => ' + ' + a.name).join(''),
      ...(pose ? ['ท่า' + pose.name + (shot ? ` (${modeName})` : '')] : posePreset ? ['ท่า AI: ' + posePreset.name] : []),
      shotScene ? 'ฉากจากรูปต้นแบบ' : scene?.name ?? 'ฉากเดิม',
      shot ? (shotPresetLight ? 'แสง ' + preset.name : 'แสงจากรูปต้นแบบ') : preset.name,
      ...(framingChoice && !set ? [framingChoice.name] : []),
      ...(angleChoice && !set && !(isDirector && backgroundMode === 'keep') ? [angleChoice.name] : []),
      ...(placementChoice ? ['ตำแหน่ง' + placementChoice.name] : []),
      ...(moodName ? [moodName] : []),
      ...(gaze ? [gaze.name] : []),
      ...(propChoices.length ? ['ถือ' + propChoices.map((p) => p.name).join('/')] : []),
      ...(harmonize ? ['ปรับแสงรอบสอง'] : []),
      `สัดส่วน ${platform.id}`,
    ].join(' · '); // user's choices + ratio only, no AI vendor/model name (Go list item 12)
    const setCaption = (i: number) => `ชุดภาพ ${i + 1}/${SET_SHOTS.length} ${SET_SHOTS[i].name} · ${caption}`;
    setGenerating(true);
    setBusy(isDirector ? 'AI กำลังคิด 3 ไอเดียให้เลือก...'
      : set ? `AI กำลังสร้างรูปหลักของชุด (1/${SET_SHOTS.length})...`
      : shotRoom ? 'AI กำลังถ่ายฉากที่คุณเลือกใหม่ตามรูปท่า แล้วใส่นางแบบ... (ประมาณ 1–2 นาที)'
      : harmonize ? 'AI กำลังสร้างรูปและปรับแสงรอบสอง... (ประมาณ 30–90 วินาที)'
        : choice.id.startsWith('openai:') && ['xhigh', 'max'].includes(quality) ? 'AI กำลังสร้างรูปแบบละเอียดสูง... (ประมาณ 1–2 นาที)'
          : 'AI กำลังสร้างรูป... (ประมาณ 10–60 วินาที)');
    try {
      // ย่อรูปทุกรูปก่อน (ได้ขนาดจริงที่ส่งไว้ทำ log ด้วย)
      const person = await jpegBase64(model.src!);
      const outfitImg = outfit ? await jpegBase64(outfit.src!) : null;
      const [topImg, bottomImg, shoesImg] = await Promise.all([top, bottom, shoes].map((w) => (w ? jpegBase64(w.src!) : null)));
      const accImgs = await Promise.all(accs.map((a) => jpegBase64(a.src!)));
      const poseImg = pose ? await jpegBase64(pose.src!) : null;
      const sceneImg = !shotScene && scene?.src ? await jpegBase64(scene.src) : null;
      // ที่มาของแต่ละรูป: server เก็บลง log ว่าส่งรูปไหนไปเป็น Image อะไร (ไม่ได้ส่งให้ AI)
      const ref = (item: Item | undefined, img: { w: number; h: number } | null) => (item && img ? { name: item.name, src: item.src, w: img.w, h: img.h } : null);
      const body = {
        model: choice.id,
        person: person.data,
        outfit: outfitImg?.data ?? null, // ทั้งชุด
        top: topImg?.data ?? null, bottom: bottomImg?.data ?? null, shoes: shoesImg?.data ?? null, // แยกชิ้น
        accessories: accs.map((a, i) => ({ data: accImgs[i].data, what: accessoryType(a).prompt, show: accessoryType(a).show })),
        pose: poseImg?.data ?? null,
        pose_preset: posePreset?.id ?? null, // server ให้ AI ตัววางแผนคิดท่าจากฉาก
        background_mode: backgroundMode,
        photo_goal: photoGoal,
        auto_repair: autoRepair,
        previous_shots: isDirector ? results.filter((r) => r.posePlan?.director).slice(0, 6)
          .map((r) => r.posePlan!.director!.candidates.find((c) => c.id === r.posePlan!.director!.selectedId)!.interaction.slice(0, 400)) : [],
        pose_mode: poseMode,
        scene_image: sceneImg?.data ?? null,
        scene_text: shotScene || shotRoom ? null : scene?.prompt ?? null,
        refs: {
          person: ref(model, person), outfit: ref(outfit, outfitImg),
          top: ref(top, topImg), bottom: ref(bottom, bottomImg), shoes: ref(shoes, shoesImg),
          accessories: accs.map((a, i) => ({ ...ref(a, accImgs[i]), type: accessoryType(a).name })),
          pose: ref(pose, poseImg),
          scene: sceneImg ? ref(scene, sceneImg) : scene && !shotScene ? { name: scene.name } : null, // ฉากแบบคำบรรยาย: ส่งแค่ชื่อ
          // ชื่อตัวเลือกภาษาไทย ไว้ทำ log ให้อ่านง่าย (คำสั่งจริงที่ส่ง AI อยู่ใน prompt)
          choices: {
            poseMode: pose ? POSE_MODES.find((m) => m.id === poseMode)!.name : posePreset ? 'ท่าสำเร็จรูป: ' + posePreset.name : 'ท่าเดิม',
            preset: isDirector ? `แสง ${preset.name} · กล้องตามแผน AI` : shot ? (shotPresetLight ? `แสง ${preset.name} · กล้องจากรูปท่าโพสต์` : 'ใช้แสงและกล้องจากรูปท่าโพสต์') : preset.name,
            ...(shot && !shotPresetLight ? {} : Object.fromEntries(PRESET_PARTS
              .filter(({ key }) => preset[key] && (!(shot || isDirector) || key === 'light' || key === 'color')).map(({ key }) => [key, preset[key]!.label]))),
            ...(shot || set ? {} : {
              framing: framingChoice ? framingChoice.name : isDirector ? 'AI เลือกระยะให้' : 'ตามสไตล์: ' + preset.framing.label,
              angle: isDirector && backgroundMode === 'keep' ? 'ตามมุมฉากเดิม' : angleChoice ? angleChoice.name : isDirector ? 'AI เลือกมุมให้' : 'ตามสไตล์: ' + preset.angle.label,
            }),
            face: moodName ?? 'ตามรูปนางแบบ',
            lightSource: shot ? LIGHT_SOURCES.find((l) => l.id === lightSource)!.name : null,
            gaze: gaze?.name ?? null,
            props: propChoices.map((p) => p.name), aspect: platform.name, harmonize,
          },
        },
        // ใช้ภาพที่ไหน: server เลือกขนาดตามแนวภาพเอง และตัด 4:5 / 9:16 จาก 2:3 (OpenAI ทำตรงๆ ไม่ได้)
        aspect,
        quality,
        extra: isDirector ? '' : extra.trim(),
        // ลอกทั้งช็อต: แสง/กล้องเอาจากรูปต้นแบบ (server ให้ AI อ่านแสงให้) หรือใช้แค่แสง/โทนสีของสไตล์ที่เลือก
        // มุมกล้องที่เลือกแทนมุมของสไตล์ (ชุดภาพใช้มุมของแต่ละรูปในชุดเอง)
        look: isDirector ? presetLightPrompt(preset) : shot ? (shotPresetLight ? presetLightPrompt(preset) : null) : presetPrompt(preset, set ? undefined : angleChoice?.prompt),
        light_from_ref: shot && !shotPresetLight,
        face: mood.prompt || null,
        // ลุคที่เหมาะกับรูปนี้ (เก็บกับรูป ขั้นแต่งรูป "อัตโนมัติ" ใช้ค่านี้): ใช้สไตล์ Phone candid -> มือถือ
        finish: ((!shot || shotPresetLight) && preset.id === 'phone' ? 'phone' : 'film') as FilmLook,
        face_from_ref: mood.id === 'auto' && Boolean(pose),
        // ชุดภาพ: รูปหลักเต็มตัวหน้าตรงเสมอ (ระยะของสไตล์ถ่ายภาพไม่ใช้ รูปใกล้มีในชุดแล้ว)
        full_body: set ? SET_SHOTS[0].fullBody : framingChoice?.fullBody ?? preset.fullBody,
        framing: shot ? null : set ? SET_SHOTS[0].framing : framingChoice?.prompt ?? preset.framing.prompt,
        // เลือกระยะ/มุมเอง (ไม่ใช่ตามสไตล์): server สั่งย้ำท้ายคำสั่งว่าสำคัญกว่ากรอบภาพ/มุมกล้องของรูปท่าและรูปฉาก
        camera_framing: set ? null : framingChoice?.prompt ?? null,
        camera_angle: set || (isDirector && backgroundMode === 'keep') ? null : angleChoice?.prompt ?? null,
        placement: placementChoice?.id ?? null, // null = อัตโนมัติ (server สุ่ม)
        gaze: gaze?.prompt ?? null,
        props: propChoices.map((p) => p.prompt),
        harmonize,
        recipe, // stored with the image (lib/recipe.ts)
      };
      // finished image: open it, unless the user changed choices while waiting (opening it would load its recipe over them)
      const sentKey = liveKey;
      const showMade = (count = 1) => {
        if (!sync.finished(sentKey)) {
          setCurrent((c) => (c === null ? c : c + count)); // list grew at the front: keep the same image on the stage
          setStatus('สร้างรูปเสร็จแล้ว อยู่ในแถวรูปที่สร้างแล้ว');
          return;
        }
        setCurrent(0);
        setBase(null); // draft is now an image, no longer "based on" a past one
      };
      const setId = set ? newSetId() : null;
      const setTag = (i: number) => (setId ? { id: setId, index: i } : undefined);
      if (isDirector && !set) {
        const { proposal } = await api<{ proposal: ShotProposal }>('/api/generate', { ...body, plan_only: true });
        setBusy('เลือกไอเดียภาพที่ต้องการสร้าง');
        const selected = await new Promise<string[]>((resolve) => setShotChoice({
          proposal,
          references: [model, outfit, scene].filter((r): r is Item => Boolean(r?.src)).map((r) => ({ src: r.src!, name: r.name })),
          choose: (ids) => { setShotChoice(null); resolve(ids); },
        }));
        if (!selected.length) { setStatus('ยกเลิกแล้ว ยังไม่ได้สร้างรูป'); return; }
        const batch = await generateSelectedShots(selected, async (id, index) => {
          const title = proposal.plan.candidates.find((c) => c.id === id)!.title;
          setBusy(`AI กำลังสร้างและตรวจรูป ${index + 1}/${selected.length} · ${title}`);
          const shotCaption = `${title} · ${caption}`;
          const result = await api<{ src: string; posePlan: PosePlan }>('/api/generate', {
            ...body, shot_proposal: proposal.token, shot_id: id, caption: shotCaption,
          });
          return { src: result.src, caption: shotCaption, finish: body.finish, posePlan: result.posePlan, recipe };
        }, (result) => {
          setResults((r) => [result, ...r]);
          showMade();
          prepare(result.src).catch((err) => setRetouchStatus(`เตรียมแต่งรูปไม่สำเร็จ: ${err.message}`));
        });
        const needsReview = batch.results.filter((r) => r.posePlan.review?.status !== 'passed').length;
        // ไอเดียที่ไม่สำเร็จไม่หยุดไอเดียอื่น (lib/shot-batch.ts) -> บอกชื่อไอเดียที่พังพร้อมเหตุผล
        const titleOf = (id: string) => proposal.plan.candidates.find((c) => c.id === id)?.title ?? id;
        const failedText = batch.errors.map((e) => `${titleOf(e.id)}: ${friendlyError(e.message)}`).join(' · ');
        setStatus(batch.errors.length
          ? `สร้างได้ ${batch.results.length}/${selected.length} รูป${batch.results.length ? ' (เก็บไว้ในคลังแล้ว)' : ''} · ไม่สำเร็จ ${failedText}`
          : `สร้างครบ ${batch.results.length} รูป${needsReview ? ` · ${needsReview} รูปควรตรวจภาพก่อนใช้` : ' · ผ่านการตรวจด้วย AI'}`);
        if (batch.results.length) frameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      const out = await api<{ src: string; posePlan: PosePlan | null }>('/api/generate', { ...body, caption: set ? setCaption(0) : caption, set: setTag(0) });
      const made: Result[] = [{ src: out.src, caption: set ? setCaption(0) : caption, set: setTag(0), finish: body.finish, posePlan: out.posePlan ?? undefined, recipe }]; // server เซฟไว้ใน results/ แล้ว
      if (out.posePlan) setStatus(out.posePlan.review
        ? `${out.posePlan.name} · ${out.posePlan.review.summaryThai}${out.posePlan.repairError ? ' · ' + out.posePlan.repairError : ''}`
        : `ท่าที่ AI คิดให้ (${out.posePlan.name}): ${out.posePlan.th}`);
      // ใส่หน้าจริง (เมื่อเปิด REAL_FACE): ถ้า AI หันหน้าคนละมุม realFace จะข้ามไปใช้หน้าจาก AI เอง
      // ยกเว้นมีของบนหน้า (แว่น/หมวก): แปะหน้าจริงทับแล้วของจะหายไป
      const onFace = [...new Set(accs.map(accessoryType).filter((t) => t.face).map((t) => t.name))].join('/');
      if (!REAL_FACE || set) {
        // ปิดอยู่ / ชุดภาพ (หลายมุม หน้าหันต่างกัน) -> ใช้รูปจาก AI ตามเดิม
      } else if (onFace) {
        setStatus(`ใส่${onFace}อยู่บนหน้า เลยใช้หน้าจาก AI (ถ้าใส่หน้าจริง ${onFace}จะหายไป)`);
      } else {
        setBusy('กำลังใส่หน้าจริงจากรูปนางแบบ...');
        const real = await realFace(model.src!, out.src, caption);
        if (real) made.unshift(real);
      }
      setResults((r) => [...made, ...r]);
      showMade(made.length);
      // เตรียมไว้ก่อน แตะสไลเดอร์แล้วจะไม่ต้องรอ
      prepare(made[0].src).catch((err) => setRetouchStatus(`เตรียมแต่งรูปไม่สำเร็จ: ${err.message} — ลองเลื่อนสไลเดอร์อีกครั้ง`));
      frameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); // จอแคบ: เลื่อนมาให้เห็นรูปที่ได้
      if (setId) {
        // มุมที่เหลือ: ส่งรูปหลักไปเป็นรูปแรก ไม่ส่งรูปท่า/ฉาก (server ใช้ buildSetPrompt) — เสร็จรูปไหนขึ้นประวัติรูปนั้นเลย พังบางรูปยังเก็บรูปที่ได้
        setPendingSet({ id: setId, left: SET_SHOTS.length - 1 });
        setBusy(`AI กำลังสร้างอีก ${SET_SHOTS.length - 1} มุมพร้อมกัน...`);
        const hero = await jpegBase64(out.src);
        const rest = await Promise.allSettled(SET_SHOTS.slice(1).map((s, j) => api('/api/generate', {
          ...body,
          set_ref: hero.data,
          set_shot: { name: s.name, framing: s.framing, angle: s.angle, full_body: s.fullBody },
          refs: { ...body.refs, set_ref: { name: setCaption(0), src: out.src, w: hero.w, h: hero.h } },
          caption: setCaption(j + 1),
          set: setTag(j + 1),
        }).then(({ src }) => {
          setResults((r) => [{ src, caption: setCaption(j + 1), set: setTag(j + 1), finish: body.finish, recipe }, ...r]);
          setCurrent((c) => (c === null ? c : c + 1)); // เพิ่มหน้ารายการ -> รูปที่ดูอยู่เลื่อนไป 1 ช่อง
        }).finally(() => setPendingSet((p) => p && { ...p, left: p.left - 1 }))));
        const failed = rest.filter((x) => x.status === 'rejected');
        if (failed.length) {
          setStatus(`ชุดภาพได้ ${SET_SHOTS.length - failed.length}/${SET_SHOTS.length} รูป — สร้างไม่สำเร็จ ${failed.length} รูป: ${friendlyError((failed[0].reason as Error).message)}`);
        }
      }
    } catch (err) {
      setStatus('สร้างรูปไม่สำเร็จ: ' + friendlyError((err as Error).message));
    } finally {
      setBusy(null);
      setPendingSet(null);
      setGenerating(false);
    }
  }

  // ปรับผิวจากไฟล์ AI ต้นฉบับ ไม่ส่งภาพที่ผ่านสไลเดอร์/ฟิล์มกลับไปให้ AI
  async function refineSkin() {
    if (!shown || busy !== null || !aiModels?.some((m) => m.id === SKIN_MODEL)) return;
    const source = shown;
    setBusy('AI กำลังปรับผิวให้สมจริง...');
    setStatus('');
    try {
      const img = await loadImg(source.src);
      const refined = await api<Result>('/api/refine-skin', {
        src: source.src, caption: source.caption, size: openaiSize(img.width, img.height), recipe: source.recipe,
      });
      setResults((r) => [refined, ...r]);
      setCurrent(0);
      setAmounts(NO_RETOUCH);
      setTone(null);
      setFinish('auto');
      setZoomed(false);
      setOriginal(false);
      setRetouchStatus('');
      setEditing(true); // see the refined skin next to the original
      setStatus('ปรับผิวแล้ว เก็บรูปต้นฉบับและรูปใหม่ไว้ในคลังให้เทียบกัน');
    } catch (err) {
      setStatus('ปรับผิวไม่สำเร็จ: ' + (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function editLocalArea(request: LocalEditRequest) {
    if (!localEdit || busy !== null) throw new Error('เลือกรูปที่ต้องการแก้ก่อน');
    const source = localEdit;
    setBusy('AI กำลังแก้เฉพาะจุด...');
    try {
      const result = await api<Result>('/api/local-edit', { ...request, src: source.src });
      setResults((r) => [result, ...r]);
      setCurrent(0);
      setAmounts(NO_RETOUCH); setTone(null); setFinish('auto');
      setZoomed(false); setOriginal(false); setRetouchStatus('');
      setLocalEdit(null);
      setStatus('แก้เฉพาะจุดแล้ว เก็บรูปใหม่และต้นฉบับไว้ในคลัง');
    } finally { setBusy(null); }
  }

  // ดาวน์โหลดรูปที่กำลังดู (ทั้งรูปเสมอ แม้กำลังซูมหน้าอยู่) — ถ้าแต่งรูปพัง ใช้ไฟล์รูป + ลุคฟิล์มแทน
  // รูปที่กำลังดูแบบเต็มขนาด (แต่งรูป + ลุคฟิล์มแล้ว) — กล่องแต่งรูปยังไม่ได้วาดรูปนี้ -> วาดจากไฟล์รูปเอง
  async function currentCanvas() {
    const src = shown?.src ?? model.src!;
    const full = fullRef.current;
    return full?.width && fullSrcRef.current === src ? full : finishedCanvas(src, shown ? { ...film, look: finishLook } : NO_FILM);
  }

  function outputBlob(canvas: HTMLCanvasElement, quality = 0.92) {
    return shown?.editedFrom
      ? new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('บันทึก PNG ไม่สำเร็จ')), 'image/png'))
      : canvasJpeg(canvas, quality);
  }

  // กดรูปบนเวที -> ดูเต็มจอแบบพอดีจอ: ฝั่ง "ก่อนแต่ง" = ไฟล์ AI ต้นฉบับ, รูปหลัก = ตามที่เห็น (แต่งแล้ว + ลุคฟิล์ม) ทั้งรูปแม้กำลังซูมหน้าอยู่
  async function openViewer(before: boolean) {
    try {
      if (before) return setViewer({ src: skinOriginal ?? displaySrc, alt: skinOriginal ? 'ต้นฉบับก่อนปรับผิว' : 'ก่อนแต่ง', temp: false });
      const url = URL.createObjectURL(await outputBlob(await currentCanvas(), 0.95));
      setViewer({ src: url, alt: 'รูปที่กำลังดู', temp: true });
    } catch (err) {
      setStatus('เปิดรูปไม่สำเร็จ: ' + (err as Error).message);
    }
  }

  async function save() {
    try {
      const cv = await currentCanvas();
      if (inAppBrowser()) return setSaveSrc(cv.toDataURL(shown?.editedFrom ? 'image/png' : 'image/jpeg', 0.92));
      await saveImageFile(await outputBlob(cv), `snapads-${Date.now()}.${shown?.editedFrom ? 'png' : 'jpg'}`);
    } catch (err) {
      console.error('ดาวน์โหลดไม่สำเร็จ', err);
      setStatus('ดาวน์โหลดไม่สำเร็จ: ' + (err as Error).message);
    }
  }


  function goStep(i: number) {
    setStep(i);
    setQuery('');
    setFilter('all');
  }

  const cur = STEPS[step];
  const { chosen, mark, setChosen } = useChosenSteps(cur.key);

  // edit panel focus: open -> its close button, close -> back to แต่งรูป (the button that had focus unmounts); Esc closes
  useEffect(() => {
    if (editing) editCloseRef.current?.focus();
    else if (wasEditing.current) editBtnRef.current?.focus();
    wasEditing.current = editing;
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setEditing(false); // open dialogs handle their own Esc
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);
  // ---------- past image <-> panel (components/useRecipeSync.ts) ----------
  const recipe = choices; // stored / compared form
  const allSteps = STEPS.map((s) => s.key);
  const shownRecipe = useMemo(() => (shown?.recipe ? readRecipe(shown.recipe, lists, aiModel) : null), [shown, lists, aiModel]);
  const sync = useRecipeSync({
    recipe, shownSrc: shown?.src ?? null, shown: shownRecipe, steps: allSteps, chosen,
    ready: aiModels !== null, // quality is set when models load
    apply: applyRecipe, keep: () => base, restore: setBase, onStart: setBase, close: () => setCurrent(null),
    revalidate: (r) => readRecipe(r, lists, aiModel).recipe, // missing upload = empty, model = first
  });
  const liveKey = sync.liveKey;
  const missingNames = (shownRecipe?.missing ?? []).map((k) => STEPS.find((s) => s.key === k)?.label).filter(Boolean);
  // "ล้าง" in the paper doll label = the "รูปใหม่" tile on a freshly opened page: page-open picks, no past-image base, same step
  const startOver = () => {
    sync.reset(sync.pageStart ?? recipe);
    setBase(null); setOutfitTab('top'); setStatus('');
    newTileRef.current?.focus(); // the ล้าง button unmounts (base -> null); keep keyboard focus on the page
  };
  const draftBase = sync.draft ? sync.draft.extra : base; // shown on the "รูปใหม่" tile
  const changed = base && current === null ? { // paper doll highlights what differs from the past image
    model: base.pick.model !== pick.model, accessory: JSON.stringify(base.pick.accessory) !== JSON.stringify(pick.accessory),
    set: base.pick.outfit !== pick.outfit, top: base.pick.top !== pick.top, bottom: base.pick.bottom !== pick.bottom, shoes: base.pick.shoes !== pick.shoes,
    pose: base.pick.pose !== pick.pose, scene: base.pick.scene !== pick.scene, style: base.preset !== presetId,
    view: base.framing !== framingId || base.angle !== angleId || base.placement !== placementId, aspect: base.aspect !== aspect,
  } : null;
  const stepReady = chosen.has(cur.key) && (cur.key !== 'model' || Boolean(pick.model)); // ปุ่มถัดไปพื้นหินขอบหมึก = ผู้ใช้เลือกในขั้นนี้แล้ว
  const retouched = tone !== null || Object.values(amounts).some((v) => v > 0);
  const displaySrc = shown?.src ?? model.src!;
  const skinOriginal = shown?.refinedFrom && results.some((r) => r.src === shown.refinedFrom) ? shown.refinedFrom : null;
  const canRefineSkin = Boolean(shown && aiModels?.some((m) => m.id === SKIN_MODEL));
  // edit mode (Go list items 1, 6, 7): opened from a generated image only; leaves when the stage has none
  if (editing && !shown) setEditing(false);
  const compare = editing && !zoomed; // แก้ไข: ก่อน/หลังแต่งคู่กัน (ซูมหน้าอยู่ = ดูแค่หลังแต่ง)
  // item 8: "after" frame stays empty until the user adjusts something (the auto film look alone doesn't count)
  const edited = retouched || finish !== 'auto' || JSON.stringify(film) !== JSON.stringify(FILM_DEFAULT);
  const awaiting = compare && !skinOriginal && !edited; // placeholder in the after frame

  // ขั้นไหนเปลี่ยนจากค่าเริ่มต้นแล้ว (จุดสีเหลืองหม่นบนเมนูซ้าย)
  const stepDone: Record<StepKey, boolean> = {
    model: true,
    outfit: wornCount > 0,
    accessory: accs.length > 0,
    pose: Boolean(pose || posePreset || mood.id !== 'auto'),
    scene: Boolean(scene) || shotScene,
    view: Boolean(framingChoice || angleChoice || placementChoice),
    output: Boolean(aspect !== DEFAULT_ASPECT || gaze || propChoices.length || extra.trim() || harmonize),
    settings: presetId !== PRESETS[0].id,
  };
  // ขั้นที่ไม่ใช้ (แบบหน้าสินค้า): ลอกทั้งช็อต = มุมมองตามรูปต้นแบบ · ลอกทั้งช็อต + ฉาก = ฉากด้วย
  // แสงจากรูปต้นแบบ = สไตล์ถ่ายภาพไม่ใช้ · เมนูเป็นสีเทา กดไม่ได้ (บอกเหตุผลตอนชี้) "ถัดไป" ข้ามไป
  const unusedWhy: Partial<Record<StepKey, string>> = {
    ...(shotScene && !FIXED_POSE_MODE ? { scene: 'ใช้ฉากจากรูปท่าโพสต์' } : {}),
    ...(shot && !shotPresetLight ? { settings: 'ใช้แสงและโทนสีจากรูปท่าโพสต์' } : {}),
    ...(shot ? { view: 'ระยะ มุมกล้อง และตำแหน่งตามรูปท่าโพสต์' } : {}),
  };
  const nextStep = STEPS.findIndex((s, i) => i > step && !unusedWhy[s.key]);
  const barNext = nextStep; // sticky bar (Go list item 5): step 8 is the last step -> generate only
  const genLabel = busy !== null ? 'กำลังสร้างรูป…' : isDirector ? 'คิด 3 ไอเดียให้เลือก' : 'สร้างรูปทันที';

  // ---------- paper doll (stage before the first image) ----------
  // null pick: "+" until the step is touched (useChosenSteps), then the keep card (เสื้อเดิม / ไม่ใส่ / ท่าเดิม / ฉากเดิม)
  const toStep = (key: StepKey, tab?: WearSlot) => () => {
    if (tab) setOutfitTab(tab);
    goStep(STEPS.findIndex((s) => s.key === key));
  };
  const keepIf = (key: StepKey, text: string) => (chosen.has(key) ? text : undefined);
  const wearSlot = (id: WearSlot, item: Item | undefined): DollSlot => {
    const tab = WEAR_TABS.find((t) => t.id === id)!;
    return { id, label: tab.name, item, keep: keepIf('outfit', tab.keep), fit: 'contain', changed: changed?.[id], onClick: toStep('outfit', id) };
  };
  const accSlots: DollSlot[] = accs.length
    ? accs.map((a) => ({ id: idOf(a), label: 'ของเสริม', item: a, fit: 'contain', changed: changed?.accessory, onClick: toStep('accessory') }))
    : [{ id: 'accessory', label: 'ของเสริม', keep: keepIf('accessory', 'ไม่ใส่'), changed: changed?.accessory, onClick: toStep('accessory') }];
  const poseItem = pose ?? (posePreset ? { name: posePreset.name } : null);
  const dollLeft: [DollSlot[], DollSlot[], DollSlot[], DollSlot[]] = [
    [{ id: 'model', label: 'นางแบบ', item: model, changed: changed?.model, onClick: toStep('model') }],
    [],
    [{ id: 'pose', label: 'ท่าโพสต์', item: poseItem, keep: keepIf('pose', 'ท่าเดิม'), changed: changed?.pose, onClick: toStep('pose') }],
    [],
  ];
  const dollRight: [DollSlot[], DollSlot[], DollSlot[], DollSlot[]] = [
    accSlots,
    [outfit ? wearSlot('set', outfit) : wearSlot('top', top)],
    outfit ? [] : [wearSlot('bottom', bottom)],
    [wearSlot('shoes', shoes)],
  ];
  const dollScene: DollSlot = {
    id: 'scene', label: 'ฉากหลัง', item: shotScene ? { name: 'ฉากจากรูปท่า' } : scene, keep: keepIf('scene', 'ฉากเดิม'), changed: changed?.scene,
    onClick: shotScene && !FIXED_POSE_MODE ? toStep('pose') : toStep('scene'),
  };
  const dollChips: DollChip[] = [
    { id: 'style', label: 'สไตล์', value: shot && !shotPresetLight ? 'ตามรูปท่าโพสต์' : preset.name, changed: changed?.style, onClick: toStep(shot && !shotPresetLight ? 'pose' : 'settings') },
    {
      id: 'view', label: 'มุมมอง', value: shot ? 'ตามรูปท่าโพสต์' : [framingChoice?.name, angleChoice?.name].filter(Boolean).join(' · ') || 'ตามสไตล์',
      changed: changed?.view, onClick: toStep(shot ? 'pose' : 'view'),
    },
    { id: 'aspect', label: 'สัดส่วน:', value: aspect, changed: changed?.aspect, onClick: toStep('output') },
  ];

  // ---------- แผงเลือก (ซ้าย) ----------
  const q = query.trim().toLowerCase();
  const visible = (key: Key) => lists[key].filter((i) => (!q || i.name.toLowerCase().includes(q)) && (
    filter === 'all' || (filter === 'catalog' && !i.uploaded) || (filter === 'uploaded' && Boolean(i.uploaded))
    || (key === 'accessory' && accessoryType(i).id === filter)));
  const showSpecial = filter === 'all' && !q; // การ์ด "ชุดเดิม" / "ไม่ใส่" / "AI เลือกท่าให้" โชว์เฉพาะตอนไม่ได้กรอง
  const uploadedCard = (key: Key, item: Item, active: boolean, onClick: () => void, zoom = false) => (
    <Card key={idOf(item)} item={item} active={active} onClick={onClick} zoom={zoom}
      onDelete={item.uploaded ? () => setDeletingUpload({ key, item }) : undefined} />
  );
  const accTypeFilters = [
    { id: 'all', name: 'ทั้งหมด' },
    ...ACCESSORY_TYPES.filter((t) => t.id !== 'shoes' && lists.accessory.some((a) => accessoryType(a).id === t.id)).map((t) => ({ id: t.id, name: t.name })),
  ];
  const picker = (key: Key, kind: string, cards: ReactNode, { special, filters = SOURCE_FILTERS, note, muted = false }: {
    special?: ReactNode; filters?: { id: string; name: string }[]; note?: ReactNode; muted?: boolean;
  } = {}) => (
    <>
      <label className="search">
        <IconSearch />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`ค้นหา${cur.label}...`} />
      </label>
      <ChipGroup options={filters} value={filter} onChange={setFilter} />
      {note && <p className="note">{note}</p>}
      <div className={'grid ' + kind + (muted ? ' muted' : '')}>
        {showSpecial && special}
        {cards}
        {saving.filter((x) => x.key === key).map((x) => <PendingCard key={x.url} src={x.url} label="กำลังเก็บรูป..." />)}
        <AddCard onFile={(f) => onFile(key, f)} />
      </div>
    </>
  );

  let panel: ReactNode;
  if (cur.key === 'model') {
    panel = picker('model', 'models', visible('model').map((m) => uploadedCard('model', m, idOf(m) === pick.model, () => select('model', idOf(m)), true)));
  } else if (cur.key === 'outfit') {
    // เสื้อผ้าแยกชิ้น (29 ต.ค.): ช่องสรุป เสื้อ / ท่อนล่าง / รองเท้า (กดเพื่อไปแท็บนั้น) -> แท็บ -> ตารางของแท็บ (เดิม + ตัวอย่าง + ของที่อัปโหลด)
    // แท็บเสื้อ/ท่อนล่างมีรูปทั้งชุดด้วย (เอาแค่ส่วนนั้นจากรูป) · รองเท้ามาจากของเสริมประเภท shoes
    const tab = WEAR_TABS.find((t) => t.id === outfitTab) ?? WEAR_TABS[0];
    const chosenId = { top: pick.top, bottom: pick.bottom, shoes: pick.shoes, set: pick.outfit }[tab.id];
    const listKey: Key = tab.id === 'shoes' ? 'accessory' : 'outfit';
    const items = (tab.id === 'shoes' ? lists.accessory.filter(isShoes)
      : lists.outfit.filter((o) => wearPart(o) === tab.id || (tab.id !== 'set' && wearPart(o) === 'set')))
      .filter((i) => !q || i.name.toLowerCase().includes(q));
    const worn = { top: top ?? outfit, bottom: bottom ?? outfit, shoes };
    panel = <>
      <div className="wear-summary" aria-label="ชุดที่ใส่">
        {(['top', 'bottom', 'shoes'] as const).map((slot) => {
          const item = worn[slot];
          const goTab: WearSlot = slot !== 'shoes' && outfit ? 'set' : slot;
          return <button key={slot} type="button" className={'wear-slot' + (outfitTab === goTab ? ' active' : '')} onClick={() => { setOutfitTab(goTab); setQuery(''); }}>
            <span className={'wear-thumb' + (item ? '' : ' empty')}>{item && <img src={thumbSrc(item.src)} alt="" />}</span>
            <b>{WEAR_TABS.find((t) => t.id === slot)!.name}</b>
            <small>{item ? (item === outfit && slot !== 'shoes' ? 'ทั้งชุด' : item.name) : 'เดิม'}</small>
          </button>;
        })}
      </div>
      <ChipGroup options={WEAR_TABS} value={tab.id} onChange={(v) => { setOutfitTab(v as WearSlot); setQuery(''); }} />
      <label className="search">
        <IconSearch />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`ค้นหา${tab.name}...`} />
      </label>
      <p className="muted-text wear-hint">{tab.hint}</p>
      <div className={'grid ' + (tab.id === 'shoes' ? 'accessories' : 'outfits')}>
        {!q && <Card item={{ name: tab.keep }} active={!chosenId} onClick={() => wear(tab.id, null)} />}
        {items.map((o) => uploadedCard(listKey, o, idOf(o) === chosenId, () => wear(tab.id, idOf(o))))}
        {saving.filter((x) => x.key === listKey).map((x) => <PendingCard key={x.url} src={x.url} label="กำลังเก็บรูป..." />)}
        <AddCard onFile={(f) => onFile('outfit', f, tab.id)} />
      </div>
    </>;
  } else if (cur.key === 'accessory') {
    panel = picker('accessory', 'accessories', <>
      {visible('accessory').filter((a) => !isShoes(a)).map((a) => (
        <Card key={idOf(a)} item={a} active={pick.accessory.includes(idOf(a))} onClick={() => toggleAccessory(idOf(a))}
          onDelete={a.uploaded ? () => setDeletingUpload({ key: 'accessory', item: a }) : undefined}
          footer={a.uploaded && (
            <button className="acc-type" title="แก้ชื่อ/ประเภท" onClick={() => setDialog({ mode: 'edit', item: a })}>
              {accessoryType(a).name} ✎
            </button>
          )} />
      ))}
      {analyzing.map((url) => <PendingCard key={url} src={url} />)}
    </>, {
      special: <Card item={{ name: 'ไม่ใส่' }} active={!accs.length} onClick={() => toggleAccessory(null)} />,
      filters: accTypeFilters,
    });
  } else if (cur.key === 'pose') {
    // 2 ส่วน: ท่าสำเร็จรูป (AI คิดท่าจากฉาก ไม่ต้องมีรูป, ซ่อนอยู่ POSE_PRESET_PICKER) / ใช้รูปท่าของฉัน (อัปโหลด หรือรูปตัวอย่าง)
    const fixedMode = FIXED_POSE_MODE && POSE_MODES.find((m) => m.id === FIXED_POSE_MODE)!;
    panel = <>
      {POSE_PRESET_PICKER && <Section title="ท่าสำเร็จรูป">
        {/* การ์ดมีภาพวาดท่า (PoseView) แบบการ์ดมุมมอง/สไตล์ถ่ายภาพ (29 ต.ค.) */}
        <div className="options view-options pose-presets">
          <button type="button" className={'option view-option' + (!pose && !posePreset ? ' active' : '')} aria-pressed={!pose && !posePreset} onClick={() => select('pose', null)}>
            <PoseView id="keep" /><b>ท่าเดิม</b><small>ท่าเดียวกับรูปนางแบบ</small>
          </button>
          {POSE_CHOICES.map((p) => (
            <button key={p.id} type="button" className={'option view-option' + (posePreset?.id === p.id ? ' active' : '')} aria-pressed={posePreset?.id === p.id}
              onClick={() => select('pose', PRESET_POSE + p.id)}>
              <PoseView id={p.id} /><b>{p.name}</b><small>{p.hint}</small>
            </button>
          ))}
        </div>
        {isDirector ? <div className="director-settings">
          <p className="muted-text">AI ดูนางแบบ ชุด และฉาก คิด 3 ไอเดียให้เลือก สร้างเฉพาะไอเดียที่คุณเลือก แล้วตรวจภาพให้</p>
          <p className="sub">ใช้ฉากแบบไหน</p>
          <ChipGroup options={[{ id: 'explore', name: 'สำรวจมุมใหม่' }, { id: 'keep', name: 'คงมุมฉากเดิม' }]} value={backgroundMode} onChange={(v) => update({ background: v as BackgroundMode })} />
          <p className="muted-text">{backgroundMode === 'explore' ? 'เปลี่ยนมุมกล้องได้ เช่น มุมสูงเหนือเตียง ส่วนที่มองไม่เห็นในรูปฉากจะให้ AI คาดคะเน' : 'ใช้มุมกล้องและตำแหน่งเฟอร์นิเจอร์ตามรูปฉาก จัดท่าภายในพื้นที่ที่เห็น'}</p>
          <p className="sub">เป้าหมายของภาพ</p>
          <ChipGroup options={[{ id: 'lifestyle', name: 'ไลฟ์สไตล์' }, { id: 'outfit', name: 'โชว์ชุดชัด' }, { id: 'editorial', name: 'แฟชั่นสร้างสรรค์' }]} value={photoGoal} onChange={(v) => update({ goal: v as PhotoGoal })} />
          <label><input type="checkbox" checked={autoRepair} onChange={(e) => update({ autoRepair: e.target.checked })} /> แก้ภาพอัตโนมัติได้ 1 ครั้งเมื่อพบปัญหาร้ายแรง (หน้า ชุด มือ/แขนขา หรือส่วนที่ต้องเห็นหลุดกรอบ)</label>
          <p className="muted-text">การแก้ภาพใช้โควตาสร้างรูปเพิ่ม และเก็บภาพแรกไว้ด้วย · AI จัดท่า ระยะ มุมกล้อง และตำแหน่งให้ทั้งหมด</p>
        </div> : posePreset && <p className="muted-text">AI ดูรูปฉาก ชุด และของเสริม แล้วคิดท่าที่เข้ากับฉากนั้นให้</p>}
        {shown?.posePlan && <ShotPlanView plan={shown.posePlan} />}
      </Section>}
      {MOOD_PICKER && <Section title="สีหน้า">
        <ChipGroup options={FACE_MOODS} value={isDirector ? 'auto' : faceMood} disabled={isDirector} onChange={(v) => update({ mood: v })} />
        <p className="muted-text">{mood.hint}</p>
      </Section>}
      <Section title={POSE_PRESET_PICKER ? 'ใช้รูปท่าของฉัน' : 'รูปท่าโพสต์'} note="อัปโหลด หรือเลือกจากตัวอย่าง">
        {/* วิธีใช้รูปท่าอยู่เหนือรายการรูปเสมอ (ยังไม่เลือกรูป = กดไม่ได้) รายการรูปไม่กระโดดตอนกดเลือก */}
        {!fixedMode ? <>
          <p className="sub">ใช้รูปท่าแบบไหน</p>
          <ChipGroup options={[...POSE_MODES]} value={poseMode} disabled={!pose} onChange={(v) => update({ poseMode: v as PoseMode })} />
          <p className="muted-text">{pose ? POSE_MODES.find((m) => m.id === poseMode)!.hint : 'เลือกรูปท่าด้านล่างก่อน'}</p>
        </> : fixedMode.id === 'shot-scene'
          ? <p className="muted-text">{shotRoom
            ? 'AI ลอกท่า มุมกล้อง ระยะ การมอง แสง และโทนสีจากรูปท่า แล้วใส่นางแบบ ชุด และของเสริมที่คุณเลือกลงในฉากที่เลือกไว้ในขั้นฉากหลัง · ไม่เลือกรูป = ท่าเดิมของนางแบบ'
            : 'AI ลอกทั้งช็อตจากรูปท่า: ท่า มุมกล้อง ระยะ การมอง แสง โทนสี และฉาก แล้วใส่นางแบบ ชุด และของเสริมที่คุณเลือก · ไม่เลือกรูป = ท่าเดิมของนางแบบ · อยากใช้ฉากของคุณเอง เลือกได้ในขั้นฉากหลัง'}</p>
          : <p className="muted-text">{fixedMode.hint}</p>}
        {shot && !fixedMode && <>
          <p className="sub">แสง</p>
          <ChipGroup options={[...LIGHT_SOURCES]} value={lightSource} onChange={(v) => update({ light: v as LightSource })} />
          <p className="muted-text">{LIGHT_SOURCES.find((l) => l.id === lightSource)!.hint}</p>
        </>}
        {/* ไม่มีท่าสำเร็จรูป = การ์ด "ท่าเดิม" อยู่หน้ารายการรูปแบบ ชุดเดิม/ฉากเดิม ใช้ยกเลิกรูปท่าที่เลือกไว้ */}
        {picker('pose', 'poses', visible('pose').map((p) => uploadedCard('pose', p, idOf(p) === pick.pose, () => select('pose', idOf(p)))), POSE_PRESET_PICKER ? {} : {
          special: <Card item={{ name: 'ท่าเดิม' }} active={!pose} onClick={() => select('pose', null)} />,
        })}
      </Section>
    </>;
  } else if (cur.key === 'scene') {
    panel = picker('scene', 'scenes', visible('scene').map((s) => uploadedCard('scene', s, idOf(s) === pick.scene, () => select('scene', idOf(s)))), {
      special: <Card item={{ name: sceneWithPose ? 'ฉากจากรูปท่า' : 'ฉากเดิม' }} active={!scene} onClick={() => select('scene', null)} />,
      note: shotScene && !FIXED_POSE_MODE ? 'ใช้ฉากจากรูปท่าโพสต์อยู่ (ลอกทั้งช็อต + ฉาก) ฉากที่เลือกตรงนี้จะไม่ถูกใช้'
        : sceneWithPose && 'มีรูปท่าโพสต์อยู่: ไม่เลือก = ใช้ฉากจากรูปท่า · เลือกฉาก = AI ถ่ายฉากนี้ใหม่ให้มุมกล้องและแสงเหมือนรูปท่าก่อน แล้วใส่นางแบบ (สร้าง 2 รูป ใช้โทเคนประมาณ 1.6 เท่า รอนานขึ้น) · ได้ผลดีเมื่อรูปฉากถ่ายจากมุมใกล้เคียงรูปท่า และมีที่แบบเดียวกัน (เตียง เก้าอี้ โซฟา)',
      muted: shotScene && !FIXED_POSE_MODE,
    });
  } else if (cur.key === 'view') {
    // 3 ส่วน การ์ดมีภาพวาดเหมือนขั้นมุมกล้อง/ระยะของหน้าสินค้า · "ตามสไตล์" วาดระยะ/มุมที่สไตล์ที่เลือกใช้
    const card = (key: string, active: boolean, disabled: boolean, choose: () => void, art: ReactNode, title: string, hint: string) => (
      <button key={key} type="button" className={'option view-option' + (active ? ' active' : '')} aria-pressed={active} disabled={disabled} onClick={choose}>
        {art}<b>{title}</b><small>{hint}</small>
      </button>
    );
    const framingValue = framingChoice?.id ?? 'auto', angleValue = angleChoice?.id ?? 'auto'; // เลือกไว้แต่ใช้ไม่ได้ = ตามสไตล์
    panel = <>
      {isDirector && <p className="note">AI จะจัดท่า ระยะ มุมกล้อง และตำแหน่งให้ทั้งหมด หากต้องการเลือกเอง ให้เปลี่ยนจากโหมด AI ในขั้นท่าโพสต์</p>}
      {shot && <p className="note">ลอกทั้งช็อตจากรูปท่าโพสต์อยู่: ระยะ มุมกล้อง และตำแหน่งตามรูปต้นแบบ ที่เลือกตรงนี้จะไม่ถูกใช้</p>}
      <Section title="ระยะ">
        <div className="options view-options">
          {card('auto', framingValue === 'auto', shot || isDirector, () => update({ framing: 'auto' }), <PersonView framing={presetFraming(preset)} />, isDirector ? 'AI เลือกระยะให้' : 'ตามสไตล์', isDirector ? 'เลือกกรอบภาพให้เข้ากับท่าและรายละเอียดชุด' : `${preset.name}: ${preset.framing.label}`)}
          {FRAMINGS.map((f) => card(f.id, framingValue === f.id, shot || isDirector, () => update({ framing: f.id }), <PersonView framing={f.id} />, f.name, f.hint))}
        </div>
      </Section>
      <Section title="มุมกล้อง">
        <div className="options view-options">
          {card('auto', angleValue === 'auto', shot || isDirector, () => update({ angle: 'auto' }), <PersonView angle={presetAngle(preset)} />, isDirector && backgroundMode === 'keep' ? 'ตามมุมฉากเดิม' : isDirector ? 'AI เลือกมุมให้' : 'ตามสไตล์', isDirector ? 'เลือกมุมกล้องร่วมกับท่าและการใช้พื้นที่' : `${preset.name}: ${preset.angle.label}`)}
          {ANGLES.map((a) => card(a.id, angleValue === a.id, shot || isDirector, () => update({ angle: a.id }), <PersonView angle={a.id} />, a.name, a.hint))}
        </div>
      </Section>
      <Section title="ตำแหน่งในภาพ">
        {!shot && keepsPlace && <p className="note">ท่าเดิม + ฉากเดิม (เปลี่ยนแค่ชุด): คนอยู่ที่เดิมในรูปนางแบบ เลือกท่าหรือฉากใหม่ก่อนถึงจะย้ายตำแหน่งได้</p>}
        <div className="options view-options">
          {card('auto', !placementChoice, shot || keepsPlace || isDirector, () => update({ placement: 'auto' }), <PersonView placement="auto" />, 'อัตโนมัติ', isDirector ? 'AI เลือกตำแหน่งให้เหมาะกับฉากและท่า' : 'สุ่มซ้าย / ขวา / กลาง ให้แต่ละรูป ได้ภาพหลากหลาย')}
          {PLACEMENTS.map((p) => card(p.id, placementChoice?.id === p.id, shot || keepsPlace || isDirector, () => update({ placement: p.id }), <PersonView placement={p.id} />, p.name, p.hint))}
        </div>
      </Section>
    </>;
  } else if (cur.key === 'output') {
    // ตั้งค่า (29 ต.ค. แบบหน้าสินค้า): ใช้ภาพที่ไหน -> สั่งเพิ่มเติม -> ขั้นสูง -> ปุ่มสร้างรูปท้ายเส้นทาง
    // ใช้ภาพที่ไหน: เลือกตามที่จะโพสต์แทนตัวเลขสัดส่วน (lib/aspects.ts) 4:5 / 9:16 server ทำ 2:3 แล้วตัด
    panel = <>
      <Section title="ใช้ภาพที่ไหน" note={`สัดส่วน ${aspect}`}>
        <div className="options aspect-options">{PLATFORM_ASPECTS.map((a) => <button key={a.id} type="button" aria-pressed={aspect === a.id}
          className={'option aspect-option' + (aspect === a.id ? ' active' : '')} onClick={() => update({ aspect: a.id })}>
          <span className="aspect-slot" aria-hidden="true"><i className="aspect-frame" style={{ aspectRatio: a.id.replace(':', ' / ') }} /></span>
          <span><b>{a.name}</b><small>{a.use} · {a.id}</small></span>
        </button>)}</div>
      </Section>
      <Section title="สั่งเพิ่มเติม">
        {isDirector && <p className="muted-text">AI จัดท่าและองค์ประกอบให้ทั้งหมด เปลี่ยนจากโหมด AI ในขั้นท่าโพสต์หากต้องการสั่งเอง</p>}
        <textarea className="text-input" disabled={isDirector} value={isDirector ? '' : extra} maxLength={1000} onChange={(e) => update({ extra: e.target.value })} placeholder={isDirector ? 'AI จัดท่าและองค์ประกอบให้อัตโนมัติ' : 'เช่น ให้ยิ้ม, ใส่รองเท้าผ้าใบสีขาว'} />
      </Section>
      <details className="advanced">
        <summary>ขั้นสูง <small>คุณภาพ · การมอง · พร็อพ · ปรับแสงรอบสอง</small></summary>
        {/* เลือกโมเดลไม่ได้แล้ว (27 ต.ค. เปิดให้ลูกค้าทดลอง): ใช้ DEFAULT_AI_MODEL เสมอ server บังคับซ้ำ (lib/route.ts) */}
        {aiModels?.length === 0 && <p className="note">ยังไม่มี API key ในไฟล์ .env</p>}
        {aiModel.startsWith('openai:') && (
          <Section title="คุณภาพ" note={isGpt25(aiModel) ? 'สูงขึ้น = เนื้อผ้า/ผิวสมจริงขึ้น แต่ช้าและแพงขึ้น' : undefined}>
            <ChipGroup options={qualitiesFor(aiModel)} value={quality} onChange={(v) => update({ quality: v })} />
          </Section>
        )}
        <Section title="การมอง" note={isDirector ? 'AI เลือกให้ หน้าและสายตาหลากหลาย' : shot ? 'ใช้จากรูปต้นแบบ' : 'อัตโนมัติ = สุ่มมุมหน้าและสายตาต่อรูป'}>
          <ChipGroup options={[{ id: '', name: 'อัตโนมัติ' }, ...GAZES]} value={shot || isDirector ? '' : gazeId} disabled={shot || isDirector} onChange={(v) => update({ gaze: v })} />
        </Section>
        <Section title="พร็อพในมือ" note={isDirector ? 'AI จัดท่าและการใช้สิ่งของในฉากให้' : 'เลือกได้หลายอย่าง'}>
          <div className="chips">
            {PROPS.map((p) => (
              <button key={p.id} type="button" disabled={isDirector} className={'chip' + (!isDirector && heldProps.includes(p.id) ? ' active' : '')}
                onClick={() => update((r) => ({ props: r.props.includes(p.id) ? r.props.filter((x) => x !== p.id) : [...r.props, p.id] }))}>
                {p.name}
              </button>
            ))}
          </div>
        </Section>
        <label className="check">
          <input type="checkbox" checked={harmonize} onChange={(e) => update({ harmonize: e.target.checked })} />
          <span>ปรับแสงรอบสอง ให้กลมกลืนกับฉากขึ้นอีก<small>AI จะเกลี่ยแสง เงา และสีอีกรอบ (เสียเงิน 2 เท่า ใช้เวลานานขึ้น)</small></span>
        </label>
      </details>
      {/* generate lives in the sticky bar; only the set button here, hidden until SET_SHOOT (Go list item 11) */}
      {SET_SHOOT && <div className="gen-row single">
        <button className="btn btn-secondary gen-btn set-btn" disabled={busy !== null || !aiModels?.length} onClick={() => void generate(true)}
          title={`${SET_SHOTS.map((s) => s.name).join(' · ')} — ค่า AI ${SET_SHOTS.length} เท่า`}>
          ชุดภาพ {SET_SHOTS.length} มุม<small>ค่า AI {SET_SHOTS.length} เท่า</small>
        </button>
      </div>}
    </>;
  } else if (cur.key === 'settings') {
    // การ์ดมีภาพวาด (StyleView): ฉาก ไฟ เงา โทนสีของแต่ละสไตล์ ให้เห็นความต่างโดยไม่ต้องจินตนาการ (29 ต.ค.)
    // รายละเอียดของสไตล์ที่เลือกอยู่ใต้การ์ด (ไม่ปักไว้ล่างแผงแล้ว การ์ดได้ที่เต็มแผง)
    panel = <>
      {shot && (
        <p className="note">{shotPresetLight
          ? 'ลอกทั้งช็อตจากรูปท่าโพสต์อยู่: ใช้แค่แสงและโทนสีของสไตล์ที่เลือก มุมกล้องและระยะตามรูปต้นแบบ'
          : 'ลอกทั้งช็อตจากรูปท่าโพสต์อยู่: แสงและกล้องตามรูปต้นแบบ — อยากใช้แสงของสไตล์ด้านล่าง เลือก "ใช้แสงของสไตล์ถ่ายภาพ" ในขั้นท่าโพสต์'}</p>
      )}
      <Section title="สไตล์ถ่ายภาพ">
        <div className="options view-options">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className={'option view-option' + (preset.id === p.id ? ' active' : '')} aria-pressed={preset.id === p.id}
              disabled={shot && !shotPresetLight} onClick={() => update({ preset: p.id })}>
              <StyleView id={p.id} /><b>{p.name}</b><small>{p.hint}</small>
            </button>
          ))}
        </div>
      </Section>
      {(!shot || shotPresetLight) && (
        <Section title={`ใน ${preset.name} มีอะไรบ้าง`}>
          <dl className="preset-parts">
            {PRESET_PARTS.map(({ key, name }) => preset[key] && <div key={key}><dt>{name}</dt><dd>{preset[key].label}</dd></div>)}
          </dl>
          <p className="muted-text">ระยะและมุมกล้องเลือกต่อได้ในขั้นมุมมอง (ไม่เลือก = {preset.framing.label} · {preset.angle.label})</p>
        </Section>
      )}
    </>;
  }
  // edit panel content = production step-9 panel unchanged (Go list item 7)
  const editPanel = <>
    <Section title="ผิวสมจริงด้วย AI" note="ใช้ AI เพิ่ม 1 ครั้ง ~฿2.8">
      <p className="muted-text">เพิ่มรายละเอียดผิวจากรูปที่สร้างไว้ ได้รูปใหญ่ขึ้น 1664×2496 หน้าละเอียดขึ้น (~45 วินาที) เก็บต้นฉบับและรูปใหม่แยกกัน</p>
      <button className="btn btn-secondary" disabled={busy !== null || !canRefineSkin} onClick={() => void refineSkin()}>
        <IconSparkle /> ปรับผิวสมจริง
      </button>
      {!shown && <p className="muted-text">เลือกรูปที่สร้างแล้วจากคลังก่อน</p>}
      {shown && !canRefineSkin && <p className="muted-text">ต้องตั้งค่า OpenAI API key ก่อนใช้การปรับผิว</p>}
      {shown?.refinedFrom && <p className="muted-text">รูปนี้ปรับผิวแล้ว · ปิดลุคฟิล์มอัตโนมัติเพื่อคงรายละเอียดผิว</p>}
    </Section>
    <Section title="รีทัช" note="ปรับได้ทันที ไม่เสียเงิน">
      <div className="sliders">
        {SLIDERS.map(([id, label]) => (
          <div className="slider" key={id}>
            <label htmlFor={id}>{label} <output>{amounts[id]}</output></label>
            <input type="range" id={id} min={0} max={100} value={amounts[id]} style={rangeFill(amounts[id], 0, 100)}
              onChange={(e) => setAmounts((a) => ({ ...a, [id]: +e.target.value }))} />
          </div>
        ))}
      </div>
      <p className="sub">สีผิว</p>
      <div className="chips">
        <button className={'chip' + (tone === null ? ' active' : '')} onClick={() => setTone(null)}>สีเดิม</button>
        {SKIN_TONES.map((t) => (
          <button key={t.color} className={'swatch' + (tone === t.color ? ' active' : '')} style={{ background: t.color }}
            title={t.name} aria-label={t.name} onClick={() => setTone(t.color)} />
        ))}
      </div>
      <div className="retouch-actions">
        <button className="btn btn-secondary" onClick={() => setAmounts(AUTO)}><IconSparkle /> แต่งอัตโนมัติ</button>
        <button className="btn btn-tertiary" onClick={() => { setAmounts(NO_RETOUCH); setTone(null); setFinish('auto'); setFilm(FILM_DEFAULT); }}>รีเซ็ต</button>
      </div>
    </Section>
    <Section title="ให้ดูเป็นรูปถ่ายจริง" note={shown?.refinedFrom ? 'รูปปรับผิวเริ่มต้นไม่ใส่ลุค' : 'ใส่ให้ทุกรูปอัตโนมัติ'}>
      <ChipGroup options={[...FINISH_LOOKS]} value={finish} onChange={(v) => setFinish(v as FinishChoice)} />
      <p className="muted-text">{FINISH_LOOKS.find((f) => f.id === finish)!.hint}{finish === 'auto' && shown ? ` · รูปนี้: ${finishLook === 'off' ? 'ไม่ใส่ลุค' : finishLook === 'phone' ? 'มือถือ' : 'ฟิล์ม'}` : ''}</p>
      <div className="sliders">
        {finishLook === 'film' && FILM_SLIDERS.map(([id, label]) => (
          <div className="slider" key={id}>
            <label htmlFor={id}>{label} <output>{film[id]}</output></label>
            <input type="range" id={id} min={0} max={100} value={film[id]} style={rangeFill(film[id], 0, 100)}
              onChange={(e) => setFilm((f) => ({ ...f, [id]: +e.target.value }))} />
          </div>
        ))}
        {finishLook === 'phone' && (
          <div className="slider">
            <label htmlFor="phone">ความแรงลุคมือถือ <output>{film.phone}</output></label>
            <input type="range" id="phone" min={0} max={100} value={film.phone} style={rangeFill(film.phone, 0, 100)} onChange={(e) => setFilm((f) => ({ ...f, phone: +e.target.value }))} />
          </div>
        )}
      </div>
      <p className="muted-text">ดาวน์โหลดได้รูปที่ใส่ลุคแล้ว · กดค้าง &quot;ดูก่อนแต่ง&quot; = รูปจาก AI ล้วน</p>
    </Section>
  </>;

  // ---------- ประวัติรูป: รูปในชุดภาพเดียวกันอยู่ในกรอบเดียว เรียงตามมุม (SET_SHOTS) ----------
  const thumb = (i: number, label?: string) => (
    <div className="deletable" key={results[i].src}>
      <button className={current === i ? 'active' : ''} title={results[i].caption} onClick={() => setCurrent(i)}>
        <img src={thumbSrc(results[i].src)} alt={results[i].caption} loading="lazy" decoding="async" />
      </button>
      <DeleteButton onClick={() => setRemovingSrc(results[i].src)} />
      <GalleryToggle inGallery={Boolean(results[i].inGallery)} onClick={() => void toggleGallery(results[i].src)} />
      {label && <span className="set-label">{label}</span>}
    </div>
  );
  const historyItems: ReactNode[] = [];
  const seenSets = new Set<string>();
  results.forEach((r, i) => {
    if (!r.set) return void historyItems.push(thumb(i));
    const id = r.set.id;
    if (seenSets.has(id)) return; // กลุ่มนี้วาดไปแล้วตอนเจอรูปแรกของชุด
    seenSets.add(id);
    const members = results.map((x, j) => ({ x, j })).filter(({ x }) => x.set?.id === id).sort((a, b) => a.x.set!.index - b.x.set!.index);
    const left = pendingSet?.id === id ? pendingSet.left : 0;
    historyItems.push(
      <div className="set-group" key={'set-' + id}>
        <div className="set-head">ชุดภาพ <span>{left ? 'กำลังสร้าง...' : `${members.length}/${SET_SHOTS.length} มุม`}</span></div>
        <div className="set-items">
          {members.map(({ x, j }) => thumb(j, SET_SHOTS[x.set!.index]?.name))}
          {Array.from({ length: left }, (_, k) => <div className="set-pending" key={k}><div className="spinner" /></div>)}
        </div>
      </div>,
    );
  });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">SnapAds <span className="beta">Beta</span></div>
        <PageSwitch current="model" />
        <div className="status" role="status" title={status}>
          {status && <>{status}<button className="status-x" aria-label="ปิดข้อความ" onClick={() => setStatus('')}>×</button></>}
        </div>
        <div className="top-actions">
          {/* สร้างรูปอยู่ท้ายเส้นทาง (ขั้นสไตล์ถ่ายภาพ) · ดาวน์โหลดอยู่ใต้รูป (28 ต.ค.) */}
          <GalleryLink />
          <TokenUsage />
          <SignOutButton />
        </div>
      </header>

      <div className={'workspace' + (editing ? ' editing' : '')}>
        <nav className="rail" aria-label="ขั้นตอน" inert={editing}>
          {STEPS.map((s, i) => (
            <button key={s.key} className={'rail-btn' + (step === i ? ' active' : '')} onClick={() => goStep(i)} aria-current={step === i ? 'step' : undefined}
              disabled={Boolean(unusedWhy[s.key])} title={unusedWhy[s.key]}>
              <span className="n">{i + 1}</span>
              <s.Icon />
              <span>{s.label}</span>
              {!unusedWhy[s.key] && stepDone[s.key] && s.key !== 'model' && <i className="dot" />}
            </button>
          ))}
        </nav>

        <aside className="panel has-bar" onClickCapture={mark} onInputCapture={mark} inert={editing}>
          <div className="panel-body">
          <div className="panel-head">
            <span className="num">{step + 1}</span>
            <h2>{cur.title}</h2>
            {cur.key === 'accessory' && <span className="hint">เลือกแล้ว {accs.length}/{accLimit} ชิ้น</span>}
          </div>
          {shownRecipe && <p className="note">
            <b>ตั้งค่าของรูปนี้</b> ถูกโหลดมาให้แล้ว · เปลี่ยนตัวเลือกแล้วกดสร้างรูปทันที จะได้รูปใหม่ รูปเดิมไม่หาย ·{' '}
            {missingNames.length > 0 && <>ถูกลบไปแล้ว: {missingNames.join(', ')} ·{' '}</>}
            <button type="button" className="link-btn" onClick={() => setCurrent(null)}>กลับไปรูปใหม่ที่ทำค้างไว้</button>
          </p>}
          {panel}
          </div>
          <div className="sticky-bar">
            {barNext >= 0 && <button className={'btn bar-next ' + (stepReady ? 'btn-ready' : 'btn-secondary')} disabled={busy !== null}
              onClick={() => goStep(barNext)}>ถัดไป: {STEPS[barNext].label} →</button>}
            <button className="btn btn-primary" disabled={busy !== null || !aiModels?.length} onClick={() => void generate()}>{genLabel}</button>
          </div>
        </aside>

        <section className="stage">
          <div className={'frame' + (busy !== null && !pendingSet ? ' busy' : '') + (compare ? ' compare' : '')} ref={frameRef}>
            {/* no generated image shown -> paper doll; canvas unmounts, src change on next result redraws it */}
            {shown ? <>
              {compare && <figure className="zoomable" title="กดเพื่อดูเต็มจอและซูม" onClick={() => void openViewer(true)}>
                <img src={skinOriginal ?? displaySrc} alt={skinOriginal ? 'ต้นฉบับก่อนปรับผิว' : 'ก่อนแต่ง'} /><figcaption>{skinOriginal ? 'ต้นฉบับก่อนปรับผิว' : 'ก่อนแต่ง'}</figcaption>
              </figure>}
              {/* item 8: until something is adjusted the "after" frame is empty; canvas stays mounted (useRetouchCanvas draws into it) */}
              <figure className={'zoomable' + (awaiting ? ' awaiting' : '')} title={awaiting ? undefined : 'กดเพื่อดูเต็มจอและซูม'}
                onClick={awaiting ? undefined : () => void openViewer(false)}>
                <canvas ref={canvasRef} />{compare && <figcaption>{skinOriginal ? 'ปรับผิวแล้ว' : 'หลังแต่ง'}</figcaption>}
                {awaiting && <div className="after-empty"><b>ยังไม่มีการปรับ</b><span>ปรับรีทัชหรือกดปรับผิวสมจริงในแผงแต่งรูป ผลจะขึ้นที่นี่</span></div>}
              </figure>
              {/* item 6: on the stage background, generated images only */}
              {!editing && <button type="button" ref={editBtnRef} className="btn btn-primary edit-btn" onClick={() => setEditing(true)}><IconEdit /> แต่งรูป</button>}
              {/* ข้อความจากเครื่องมือแต่งรูป (กำลังโหลด / หาหน้าไม่เจอ / แนะนำให้ซูม) ลอยขอบล่างรูป ไม่ดันปุ่มด้านล่าง */}
              {retouchStatus && <div className="frame-hint" role="status">{retouchStatus}</div>}
            </> : <PaperDoll left={dollLeft} right={dollRight} scene={dollScene} chips={dollChips} label={base ? 'พร้อมสร้าง · ปรับจากรูปที่เดิม' : 'พร้อมสร้าง'}
              action={base && <button type="button" className="link-btn" disabled={generating} onClick={() => setConfirmReset(true)}><IconReset /><span>ล้าง</span></button>} />}
            <div className="overlay"><div className="spinner" /><div>{busy}</div></div>
          </div>
          <div className="stage-tools">
            <div className="caption" title={shown?.caption}>{shown ? shown.caption : 'ดาวน์โหลด ซูม และเปรียบเทียบ ใช้ได้หลังสร้างรูปแรก'}</div>
            {shown?.posePlan?.review && <button className="btn btn-secondary tool" onClick={() => setStep(STEPS.findIndex((s) => s.key === 'pose'))}>
              {shown.posePlan.review.status === 'passed' ? 'ผ่านการตรวจด้วย AI · ดูแผนภาพ' : 'ควรตรวจภาพก่อนใช้ · ดูรายละเอียด'}
            </button>}
            <button className="btn btn-secondary tool" onClick={save} disabled={!shown}><IconDownload /> ดาวน์โหลด</button>
            {shown && <button className="btn btn-secondary tool" disabled={busy !== null}
              onClick={() => setLocalEdit({ src: shown.src, caption: shown.caption })}><IconRetouch /> แก้เฉพาะจุด</button>}
            {shown?.editedFrom && <button className="btn btn-secondary tool" disabled={busy !== null || !results.some((r) => r.src === shown.editedFrom)}
              onClick={() => setCurrent(results.findIndex((r) => r.src === shown.editedFrom))}>ดูต้นฉบับ</button>}
            {shown && <button className="btn btn-secondary tool" disabled={busy !== null || !canRefineSkin}
              title="ใช้ AI เพิ่ม 1 ครั้ง ~฿2.8 ได้รูปใหม่ 1664×2496" onClick={() => void refineSkin()}>
              <IconSparkle /> ปรับผิวสมจริง
            </button>}
            <button className={'btn btn-secondary tool' + (zoomed ? ' on' : '')} disabled={!shown} onClick={() => { setZoomed((z) => !z); setRetouchStatus(''); }}>
              <IconZoom /> {zoomed ? 'ดูทั้งรูป' : 'ซูมหน้า'}
            </button>
            <button className="btn btn-secondary tool" disabled={!shown}
              onPointerDown={() => setOriginal(true)} onPointerUp={() => setOriginal(false)} onPointerLeave={() => setOriginal(false)}>
              <IconCompare /> กดค้างดูก่อนแต่ง
            </button>
          </div>
          <div className="history-head">รูปที่สร้างแล้ว <span>{results.length}</span></div>
          <div className="history">
            {/* "รูปใหม่" = the setup in progress (paper doll); first tile, always there */}
            <button type="button" ref={newTileRef} className={'new-tile' + (current === null ? ' active' : '')} onClick={() => setCurrent(null)}
              aria-pressed={current === null} title="รูปใหม่ที่ทำค้างไว้">
              {generating
                ? <><div className="spinner" aria-hidden="true" /><span>กำลังสร้าง</span></>
                : <><span className="new-plus" aria-hidden="true">+</span><span>รูปใหม่</span>{draftBase && <small>ปรับจากรูปเดิม</small>}</>}
            </button>
            {historyItems}
            {!results.length && <p className="muted-text">ยังไม่มี เลือกของแต่ละขั้นแล้วกด &quot;สร้างรูปทันที&quot;</p>}
          </div>
        </section>

        {/* item 7: production step-9 panel, header without the number + close; slides in from the right */}
        <aside className="panel edit-panel" aria-label="แต่งรูป" inert={!editing}>
          <div className="panel-head">
            <h2>แต่งรูป</h2>
            <button type="button" ref={editCloseRef} className="edit-close" aria-label="ปิดแผงแต่งรูป" onClick={() => setEditing(false)}>✕</button>
          </div>
          {shown && editPanel}
        </aside>
      </div>

      {shotChoice && <ShotChoiceDialog proposal={shotChoice.proposal} references={shotChoice.references} onChoose={shotChoice.choose} />}
      {localEdit && <LocalEditDialog src={localEdit.src} models={aiModels ?? []} initialModel={aiModel} onClose={() => setLocalEdit(null)} onEdit={editLocalArea} />}
      {sync.confirm && <ConfirmDialog title="เริ่มจากรูปนี้?" body="ตัวเลือกที่เลือกไว้แต่ยังไม่ได้สร้างรูปจะถูกแทนที่ด้วยการตั้งค่าของรูปนี้"
        cancel="ยกเลิก" confirm="เริ่มจากรูปนี้" onCancel={sync.confirm.cancel} onConfirm={sync.confirm.accept} />}
      {deletingUpload && <ConfirmDialog title={`ลบ "${deletingUpload.item.name}"?`} body="รูปจะถูกย้ายไปถังขยะ" cancel="ยกเลิก" confirm="ลบ"
        onCancel={() => setDeletingUpload(null)}
        onConfirm={() => { setDeletingUpload(null); void deleteUpload(deletingUpload.key, deletingUpload.item); }} />}
      {removingSrc && <RemoveImageDialog from="history" inOtherPlace={Boolean(results.find((r) => r.src === removingSrc)?.inGallery)}
        onCancel={() => setRemovingSrc(null)}
        onConfirm={() => { setRemovingSrc(null); void removeFromHistory(removingSrc); }} />}
      {confirmReset && <ConfirmDialog title="ล้างตัวเลือกทั้งหมด?"
        body="ตัวเลือกทุกขั้นจะกลับเป็นค่าเริ่มต้น รูปที่สร้างไว้แล้วไม่หาย"
        cancel="ยกเลิก" confirm="ล้าง"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { setConfirmReset(false); startOver(); }} />}
      {saveSrc && <SaveImageDialog src={saveSrc} onClose={() => setSaveSrc(null)} />}
      {viewer && <ImageViewer key={viewer.src} src={viewer.src} alt={viewer.alt} onClose={() => {
        if (viewer.temp) URL.revokeObjectURL(viewer.src);
        setViewer(null);
      }} />}
      {dialog && (dialog.mode === 'add' ? (
        <AccessoryDialog key={dialog.url} mode="add" preview={dialog.url} initial={{ name: '', type: null }}
          onDone={(info) => void onDialogDone(info)} />
      ) : (
        <AccessoryDialog key={dialog.item.src} mode="edit" preview={dialog.item.src!}
          initial={{ name: dialog.item.name, type: accessoryType(dialog.item).id }} onDone={(info) => void onDialogDone(info)} />
      ))}
    </div>
  );
}
