'use client';
// SnapAds (เดิมชื่อ Looklet): เลือกนางแบบ + ชุด + ของเสริม + ฉาก -> AI สร้างรูป -> แต่งรูป (ฟรี) -> บันทึก
// การสร้างรูปเรียกผ่าน API ของเรา (app/api/*) ซึ่งถือ API key ไว้ หน้าเว็บไม่เห็น key
// การแต่งรูปใช้อัลกอริทึมใน lib/vision.js + lib/beauty.js ทำในเครื่อง ไม่เสียเงิน
import { useEffect, useRef, useState, type ReactNode } from 'react';
import AccessoryDialog from './AccessoryDialog';
import ImageViewer from './ImageViewer';
import LocalEditDialog, { type LocalEditRequest } from './LocalEditDialog';
import { SignOutButton } from './AuthForm';
import { PersonView } from './PersonView';
import { PoseView } from './PoseView';
import { ShotPlanView } from './ShotPlanView';
import { ShotChoiceDialog } from './ShotChoiceDialog';
import type { BackgroundMode, PhotoGoal, ShotProposal, StoredPosePlan } from '@/lib/photo-director';
import { generateSelectedShots } from '@/lib/shot-batch';
import { StyleView } from './StyleView';
import { PLATFORM_ASPECTS } from '@/lib/aspects';
import {
  IconBag, IconCompare, IconDownload, IconFrame, IconModel, IconPalette, IconPose, IconRetouch, IconScene, IconSearch, IconSettings,
  IconShirt, IconSparkle, IconZoom,
} from './icons';
import { AddCard, Card, ChipGroup, DeleteButton, PageSwitch, PendingCard, rangeFill, SaveImageDialog, Section, TokenUsage, useChosenSteps } from './ui';
import { useRetouchCanvas, type Amounts, type RetouchId } from './useRetouchCanvas';
import { FILM_DEFAULT, NO_FILM, type Film, type FilmLook } from '@/lib/film';
import { SKIN_MODEL } from '@/lib/skin';
import {
  api, canOpenImage, canvasJpeg, finishedCanvas, friendlyError, guessAccessory, inAppBrowser, isHeic, jpegBase64, loadImg, loadTools, openaiSize,
  saveImageFile, toWebImage, uploadImage,
} from '@/lib/browser';
import {
  ACCESSORIES, ACCESSORY_TYPES, ANGLES, DEFAULT_AI_MODEL, FACE_MOODS, FRAMINGS, GAZES, PLACEMENTS, LIGHT_SOURCES, MAX_ACCESSORIES, MODELS, OUTFITS,
  POSE_AUTO, POSE_MODES, POSE_PRESETS, POSES, PRESET_PARTS, PRESETS, PROPS, QUALITIES, QUALITIES_25, SCENES, SET_SHOTS, SKIN_TONES, defaultQuality, isGpt25,
  MAX_WEAR, WEAR_TABS, wearPart, type WearSlot,
  presetLightPrompt, presetPrompt, type AccessoryInfo, type Item, type LightSource, type PoseMode, type Preset,
} from '@/lib/catalog';

type Key = 'model' | 'outfit' | 'accessory' | 'pose' | 'scene';
const KIND = { model: 'models', outfit: 'outfits', accessory: 'accessories', pose: 'poses', scene: 'scenes' } as const;
const CATALOG: Record<Key, Item[]> = { model: MODELS, outfit: OUTFITS, accessory: ACCESSORIES, pose: POSES, scene: SCENES };

// อ้างถึงรายการด้วย id (ไม่ใช้ตำแหน่ง ลบ/เพิ่มแล้วไม่ต้องไล่แก้): รูป = src, ฉากแบบคำบรรยาย = ชื่อ
const idOf = (item: Item) => item.src ?? item.name;
const find = (list: Item[], id: string | null) => (id === null ? undefined : list.find((i) => idOf(i) === id));
// ท่าสำเร็จรูป (ไม่มีรูปท่า ให้ AI ตัววางแผนคิดท่าจากฉาก) — id = "preset:<id ใน POSE_PRESETS หรือ auto>" ไม่ชนกับรูป (src ขึ้นต้นด้วย /)
const PRESET_POSE = 'preset:';
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

// ใช้ภาพที่ไหน: ค่าเริ่มต้น IG · Facebook ฟีด 4:5 (ผู้ใช้ขอ 29 ต.ค. ลูกค้าส่วนใหญ่ลง IG) — AI ทำ 2:3 แล้ว server ตัดบนล่าง
const DEFAULT_ASPECT = '4:5';

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
type Result = { src: string; caption: string; set?: SetTag; finish?: FilmLook; refinedFrom?: string; editedFrom?: string; posePlan?: PosePlan };
type AiModel = { id: string; label: string };
const newSetId = () => crypto.randomUUID().slice(0, 13); // id ชุดภาพ (server รับแค่ตัวอักษร ตัวเลข - _)
type SetTag = { id: string; index: number }; // ชุดภาพหลายมุม (เหมือน SetTag ใน lib/storage.ts — ไฟล์นั้นใช้ฝั่ง server เท่านั้น)
// page = 'product' -> รูปจากหน้าสินค้า (components/Packshot.tsx) ไม่โชว์ในประวัติรูปของหน้านี้
type Stored = { src: string; name?: string; caption?: string; type?: string; set?: SetTag; finish?: FilmLook; refinedFrom?: string; editedFrom?: string; posePlan?: PosePlan; page?: string };
type Library = { results: Stored[]; uploads: Record<string, Stored[]> };

// ขั้นตอน (เมนูซ้าย): แต่ละขั้นมีแผงเลือก (ซ้าย) รูปอยู่ขวาตลอด (ไม่มีแผงขวาแล้ว 28 ต.ค.)
type StepKey = 'model' | 'outfit' | 'accessory' | 'pose' | 'scene' | 'settings' | 'view' | 'output' | 'retouch';
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
  { key: 'retouch', label: 'แต่งรูป', title: 'แต่งรูป', Icon: IconRetouch },
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
  // สิ่งที่เลือกอยู่: outfit(ทั้งชุด)/top/bottom/shoes/pose/scene = null คือ "ของเดิม", accessory = หลายชิ้นได้
  const [pick, setPick] = useState({
    model: idOf(MODELS[0]), outfit: null as string | null, accessory: [] as string[], pose: null as string | null, scene: null as string | null,
    top: null as string | null, bottom: null as string | null, shoes: null as string | null,
  });
  const [outfitTab, setOutfitTab] = useState<WearSlot>('top'); // แท็บในขั้นเสื้อผ้า
  const [tone, setTone] = useState<string | null>(null); // สีผิว null = สีเดิม
  const [amounts, setAmounts] = useState(NO_RETOUCH);
  const [finish, setFinish] = useState<FinishChoice>('auto');
  const [film, setFilm] = useState<Film>(FILM_DEFAULT); // ค่าสไลเดอร์ของแต่ละลุค (look ใน state นี้ไม่ใช้ ใช้ finish แทน)
  const [results, setResults] = useState<Result[]>([]); // รูปที่สร้างแล้ว ใหม่สุดอยู่หน้า
  const [current, setCurrent] = useState<number | null>(null); // กำลังแสดง: null = รูปนางแบบ (ตัวอย่าง), ตัวเลข = results[current]
  const [zoomed, setZoomed] = useState(false);
  const [original, setOriginal] = useState(false); // กดค้าง "ดูก่อนแต่ง"
  const [status, setStatus] = useState('');
  const [retouchStatus, setRetouchStatus] = useState(''); // ข้อความในกล่องแต่งรูป
  const [busy, setBusy] = useState<string | null>(null);
  // ชุดภาพที่กำลังสร้างมุมที่เหลือ: รูปหลักโชว์แล้ว ดูได้ระหว่างรอ (ไม่บังรูป) ประวัติรูปโชว์ช่องรอ left ช่อง
  const [pendingSet, setPendingSet] = useState<{ id: string; left: number } | null>(null);
  const [aiModels, setAiModels] = useState<AiModel[] | null>(null); // null = กำลังโหลด
  const [aiModel, setAiModel] = useState('');
  const [presetId, setPresetId] = useState(PRESETS[0].id); // สไตล์ถ่ายภาพ (แสง + เลนส์ + โทนสี + ระยะ/มุมเริ่มต้น)
  const [framingId, setFramingId] = useState('auto'); // ระยะ (FRAMINGS) 'auto' = ตามสไตล์
  const [angleId, setAngleId] = useState('auto'); // มุมกล้อง (ANGLES) 'auto' = ตามสไตล์
  const [placementId, setPlacementId] = useState('auto'); // ตำแหน่งในภาพ (PLACEMENTS) 'auto' = สุ่มต่อรูป
  const [quality, setQuality] = useState('medium');
  const [extra, setExtra] = useState('');
  const [harmonize, setHarmonize] = useState(false);
  const [poseModeChoice, setPoseMode] = useState<PoseMode>('pose'); // เอาอะไรจากรูปท่าโพสต์ (ใช้เมื่อ FIXED_POSE_MODE = null)
  const poseMode = FIXED_POSE_MODE ?? poseModeChoice;
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('explore');
  const [photoGoal, setPhotoGoal] = useState<PhotoGoal>('lifestyle');
  const [autoRepair, setAutoRepair] = useState(true);
  const [shotChoice, setShotChoice] = useState<{
    proposal: ShotProposal; references: { src: string; name: string }[]; choose: (ids: string[]) => void;
  } | null>(null);
  const [lightChoice, setLightSource] = useState<LightSource>('ref'); // ลอกทั้งช็อต: แสงจากรูปต้นแบบ หรือจากสไตล์ถ่ายภาพ
  const lightSource: LightSource = FIXED_POSE_MODE ? 'ref' : lightChoice; // ไม่มีปุ่มเลือก = แสงจากรูปท่าเสมอ
  const [faceMood, setFaceMood] = useState('auto'); // สีหน้า (FACE_MOODS)
  const [gazeId, setGazeId] = useState(''); // การมอง ('' = ไม่กำหนด)
  const [aspect, setAspect] = useState(DEFAULT_ASPECT); // ใช้ภาพที่ไหน (PLATFORM_ASPECTS)
  const [heldProps, setHeldProps] = useState<string[]>([]); // พร็อพในมือ (id ใน PROPS)
  // ของเสริมที่ AI กำลังดูว่าเป็นอะไร (URL รูปชั่วคราว) ขึ้นเป็นการ์ดรอในรายการ
  const [analyzing, setAnalyzing] = useState<string[]>([]);
  // รูปที่กำลังเก็บขึ้น server (ทุกขั้น) ขึ้นการ์ดรอจนเก็บเสร็จ — เดิมไม่มีการ์ด รูปหายไปหลายวินาทีบนเน็ตมือถือ ผู้ใช้นึกว่ารูปหาย (22 ต.ค.)
  const [saving, setSaving] = useState<{ key: Key; url: string }[]>([]);
  const [saveSrc, setSaveSrc] = useState<string | null>(null); // ดาวน์โหลดไม่ได้ (browser ในแอป) -> โชว์รูปให้กดค้างบันทึก
  // ดูรูปเต็มจอ + ซูม (temp = blob URL ต้องคืนตอนปิด) — เปิดมาแบบพอดีจอเสมอ กดในหน้าต่างถึงจะซูม (29 ต.ค. ผู้ใช้ขอ)
  const [viewer, setViewer] = useState<{ src: string; alt: string; temp: boolean } | null>(null);
  // หน้าต่างของเสริม: add = AI ดูไม่ออก ให้เลือกประเภทเอง, edit = แก้ชิ้นที่เพิ่มไว้แล้ว
  const [dialog, setDialog] = useState<{ mode: 'add'; file: File; url: string } | { mode: 'edit'; item: Item } | null>(null);
  const [localEdit, setLocalEdit] = useState<{ src: string; caption: string } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
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
  // ลอกทั้งช็อตจากรูปท่า: มุมกล้อง/ระยะ/การมอง/แสงเอาจากรูป (ไม่ใช้สไตล์ถ่ายภาพกับการมอง), + ฉาก = ไม่ใช้ฉากที่เลือก
  const shot = Boolean(pose) && poseMode !== 'pose';
  const shotScene = Boolean(pose) && poseMode === 'shot-scene';
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
        setResults(lib.results.filter((r) => r.page !== 'product').map((r) => ({ src: r.src, caption: r.caption || 'รูปที่สร้างไว้', set: r.set, finish: r.finish, refinedFrom: r.refinedFrom, editedFrom: r.editedFrom, posePlan: r.posePlan })));
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
          setQuality(defaultQuality(id));
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
    setPick((p) => ({ ...p, [key]: id }));
    if (key === 'model') setCurrent(null); // เปลี่ยนนางแบบ -> โชว์รูปนางแบบคนใหม่เป็นตัวอย่าง
  }

  // ของเสริม: กดแล้วสลับเลือก/ไม่เลือก, null = ไม่ใส่สักชิ้น
  function toggleAccessory(id: string | null) {
    if (id !== null && !pick.accessory.includes(id) && pick.accessory.length >= accLimit) {
      return setStatus(accLimit < MAX_ACCESSORIES
        ? `เสื้อผ้าและของเสริมรวมกันใส่ได้ไม่เกิน ${MAX_WEAR} ชิ้นต่อรูป — เอาของเสริมหรือเสื้อผ้าบางชิ้นออกก่อน`
        : `ของเสริมเลือกได้ไม่เกิน ${MAX_ACCESSORIES} ชิ้นต่อรูป — กดชิ้นที่เลือกอยู่เพื่อเอาออกก่อน`);
    }
    setStatus('');
    setPick((p) => ({
      ...p,
      accessory: id === null ? [] : p.accessory.includes(id) ? p.accessory.filter((x) => x !== id) : [...p.accessory, id],
    }));
  }

  // ขั้นเสื้อผ้า: เลือกชิ้นในช่องนั้น (null = ของเดิม) · รวมกับของเสริมแล้วเกิน MAX_WEAR = ไม่ให้เลือก
  function wear(slot: WearSlot, id: string | null) {
    const after = { outfit: pick.outfit, top: pick.top, bottom: pick.bottom, shoes: pick.shoes, ...wearPatch(slot, id) };
    if (id && [after.outfit, after.top, after.bottom, after.shoes].filter(Boolean).length + pick.accessory.length > MAX_WEAR) {
      return setStatus(`เสื้อผ้าและของเสริมรวมกันใส่ได้ไม่เกิน ${MAX_WEAR} ชิ้นต่อรูป — เอาของเสริมออกก่อน`);
    }
    setStatus('');
    setPick((p) => ({ ...p, ...wearPatch(slot, id) }));
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
    if (key === 'outfit') setPick((p) => ({ ...p, ...wearPatch(type === 'top' || type === 'bottom' ? type : 'set', src) }));
    else if (key === 'accessory' && type === 'shoes') setPick((p) => ({ ...p, shoes: src }));
    else if (key === 'accessory') setPick((p) => (p.accessory.length < accLimit ? { ...p, accessory: [...p.accessory, src] } : p));
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
    if (info.type === 'shoes') setPick((p) => ({ ...p, accessory: p.accessory.filter((x) => x !== idOf(d.item)) }));
  }

  async function deleteUpload(key: Key, item: Item) {
    if (!confirm(`ลบ "${item.name}"? (ย้ายไปถังขยะ)`)) return;
    try {
      if (!item.src!.startsWith('blob:')) await api('/api/delete', { src: item.src });
    } catch (err) {
      return setStatus('ลบไม่สำเร็จ: ' + (err as Error).message);
    }
    const id = idOf(item);
    setLists((l) => ({ ...l, [key]: l[key].filter((i) => i !== item) }));
    // ตัวที่เลือกอยู่ถูกลบ -> กลับไปค่าเริ่มต้น
    setPick((p) => {
      if (key === 'accessory') return { ...p, accessory: p.accessory.filter((x) => x !== id), shoes: p.shoes === id ? null : p.shoes };
      if (key === 'outfit') return { ...p, outfit: p.outfit === id ? null : p.outfit, top: p.top === id ? null : p.top, bottom: p.bottom === id ? null : p.bottom };
      if (p[key] !== id) return p;
      return { ...p, [key]: key === 'model' ? idOf(MODELS[0]) : null };
    });
  }

  async function deleteResult(i: number) {
    if (!confirm('ลบรูปที่สร้างนี้? (ย้ายไปถังขยะ)')) return;
    try {
      await api('/api/delete', { src: results[i].src });
    } catch (err) {
      return setStatus('ลบไม่สำเร็จ: ' + (err as Error).message);
    }
    const left = results.length - 1;
    setResults((r) => r.filter((_, j) => j !== i));
    setCurrent((c) => (c === i ? (left ? Math.min(i, left - 1) : null) : c !== null && c > i ? c - 1 : c));
  }

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
    setBusy(isDirector ? 'AI กำลังคิด 3 ไอเดียให้เลือก...'
      : set ? `AI กำลังสร้างรูปหลักของชุด (1/${SET_SHOTS.length})...`
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
        scene_text: shotScene ? null : scene?.prompt ?? null,
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
          return { src: result.src, caption: shotCaption, finish: body.finish, posePlan: result.posePlan };
        }, (result) => {
          setResults((r) => [result, ...r]);
          setCurrent(0);
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
      const made: Result[] = [{ src: out.src, caption: set ? setCaption(0) : caption, set: setTag(0), finish: body.finish, posePlan: out.posePlan ?? undefined }]; // server เซฟไว้ใน results/ แล้ว
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
      setCurrent(0);
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
          setResults((r) => [{ src, caption: setCaption(j + 1), set: setTag(j + 1), finish: body.finish }, ...r]);
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
        src: source.src, caption: source.caption, size: openaiSize(img.width, img.height),
      });
      setResults((r) => [refined, ...r]);
      setCurrent(0);
      setAmounts(NO_RETOUCH);
      setTone(null);
      setFinish('auto');
      setZoomed(false);
      setOriginal(false);
      setRetouchStatus('');
      goStep(STEPS.findIndex((s) => s.key === 'retouch'));
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
  const { chosen, mark } = useChosenSteps(cur.key);
  const stepReady = chosen.has(cur.key) && (cur.key !== 'model' || Boolean(pick.model)); // ปุ่มถัดไปพื้นหินขอบหมึก = ผู้ใช้เลือกในขั้นนี้แล้ว
  const retouched = tone !== null || Object.values(amounts).some((v) => v > 0);
  const displaySrc = shown?.src ?? model.src!;
  const skinOriginal = shown?.refinedFrom && results.some((r) => r.src === shown.refinedFrom) ? shown.refinedFrom : null;
  const canRefineSkin = Boolean(shown && aiModels?.some((m) => m.id === SKIN_MODEL));
  const compare = cur.key === 'retouch' && !zoomed; // ขั้นแต่งรูป: ก่อน/หลังแต่งคู่กัน (ซูมหน้าอยู่ = ดูแค่หลังแต่ง)

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
    retouch: retouched,
  };
  // ขั้นที่ไม่ใช้ (แบบหน้าสินค้า): ลอกทั้งช็อต = มุมมองตามรูปต้นแบบ · ลอกทั้งช็อต + ฉาก = ฉากด้วย
  // แสงจากรูปต้นแบบ = สไตล์ถ่ายภาพไม่ใช้ · เมนูเป็นสีเทา กดไม่ได้ (บอกเหตุผลตอนชี้) "ถัดไป" ข้ามไป
  const unusedWhy: Partial<Record<StepKey, string>> = {
    ...(shotScene ? { scene: 'ใช้ฉากจากรูปท่าโพสต์' } : {}),
    ...(shot && !shotPresetLight ? { settings: 'ใช้แสงและโทนสีจากรูปท่าโพสต์' } : {}),
    ...(shot ? { view: 'ระยะ มุมกล้อง และตำแหน่งตามรูปท่าโพสต์' } : {}),
  };
  const nextStep = STEPS.findIndex((s, i) => i > step && !unusedWhy[s.key]);

  // ---------- แผงเลือก (ซ้าย) ----------
  const q = query.trim().toLowerCase();
  const visible = (key: Key) => lists[key].filter((i) => (!q || i.name.toLowerCase().includes(q)) && (
    filter === 'all' || (filter === 'catalog' && !i.uploaded) || (filter === 'uploaded' && Boolean(i.uploaded))
    || (key === 'accessory' && accessoryType(i).id === filter)));
  const showSpecial = filter === 'all' && !q; // การ์ด "ชุดเดิม" / "ไม่ใส่" / "AI เลือกท่าให้" โชว์เฉพาะตอนไม่ได้กรอง
  const uploadedCard = (key: Key, item: Item, active: boolean, onClick: () => void, zoom = false) => (
    <Card key={idOf(item)} item={item} active={active} onClick={onClick} zoom={zoom}
      onDelete={item.uploaded ? () => void deleteUpload(key, item) : undefined} />
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
            <span className={'wear-thumb' + (item ? '' : ' empty')}>{item && <img src={item.src} alt="" />}</span>
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
          onDelete={a.uploaded ? () => void deleteUpload('accessory', a) : undefined}
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
          <ChipGroup options={[{ id: 'explore', name: 'สำรวจมุมใหม่' }, { id: 'keep', name: 'คงมุมฉากเดิม' }]} value={backgroundMode} onChange={(v) => setBackgroundMode(v as BackgroundMode)} />
          <p className="muted-text">{backgroundMode === 'explore' ? 'เปลี่ยนมุมกล้องได้ เช่น มุมสูงเหนือเตียง ส่วนที่มองไม่เห็นในรูปฉากจะให้ AI คาดคะเน' : 'ใช้มุมกล้องและตำแหน่งเฟอร์นิเจอร์ตามรูปฉาก จัดท่าภายในพื้นที่ที่เห็น'}</p>
          <p className="sub">เป้าหมายของภาพ</p>
          <ChipGroup options={[{ id: 'lifestyle', name: 'ไลฟ์สไตล์' }, { id: 'outfit', name: 'โชว์ชุดชัด' }, { id: 'editorial', name: 'แฟชั่นสร้างสรรค์' }]} value={photoGoal} onChange={(v) => setPhotoGoal(v as PhotoGoal)} />
          <label><input type="checkbox" checked={autoRepair} onChange={(e) => setAutoRepair(e.target.checked)} /> แก้ภาพอัตโนมัติได้ 1 ครั้งเมื่อพบปัญหาร้ายแรง (หน้า ชุด มือ/แขนขา หรือส่วนที่ต้องเห็นหลุดกรอบ)</label>
          <p className="muted-text">การแก้ภาพใช้โควตาสร้างรูปเพิ่ม และเก็บภาพแรกไว้ด้วย · AI จัดท่า ระยะ มุมกล้อง และตำแหน่งให้ทั้งหมด</p>
        </div> : posePreset && <p className="muted-text">AI ดูรูปฉาก ชุด และของเสริม แล้วคิดท่าที่เข้ากับฉากนั้นให้</p>}
        {shown?.posePlan && <ShotPlanView plan={shown.posePlan} />}
      </Section>}
      {MOOD_PICKER && <Section title="สีหน้า">
        <ChipGroup options={FACE_MOODS} value={isDirector ? 'auto' : faceMood} disabled={isDirector} onChange={setFaceMood} />
        <p className="muted-text">{mood.hint}</p>
      </Section>}
      <Section title={POSE_PRESET_PICKER ? 'ใช้รูปท่าของฉัน' : 'รูปท่าโพสต์'} note="อัปโหลด หรือเลือกจากตัวอย่าง">
        {/* วิธีใช้รูปท่าอยู่เหนือรายการรูปเสมอ (ยังไม่เลือกรูป = กดไม่ได้) รายการรูปไม่กระโดดตอนกดเลือก */}
        {!fixedMode ? <>
          <p className="sub">ใช้รูปท่าแบบไหน</p>
          <ChipGroup options={[...POSE_MODES]} value={poseMode} disabled={!pose} onChange={(v) => setPoseMode(v as PoseMode)} />
          <p className="muted-text">{pose ? POSE_MODES.find((m) => m.id === poseMode)!.hint : 'เลือกรูปท่าด้านล่างก่อน'}</p>
        </> : fixedMode.id === 'shot-scene'
          ? <p className="muted-text">AI ลอกทั้งช็อตจากรูปท่า: ท่า มุมกล้อง ระยะ การมอง แสง โทนสี และฉาก แล้วใส่นางแบบ ชุด และของเสริมที่คุณเลือก · ไม่เลือกรูป = ท่าเดิมของนางแบบ</p>
          : <p className="muted-text">{fixedMode.hint}</p>}
        {shot && !fixedMode && <>
          <p className="sub">แสง</p>
          <ChipGroup options={[...LIGHT_SOURCES]} value={lightSource} onChange={(v) => setLightSource(v as LightSource)} />
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
      special: <Card item={{ name: 'ฉากเดิม' }} active={!scene} onClick={() => select('scene', null)} />,
      note: shotScene && 'ใช้ฉากจากรูปท่าโพสต์อยู่ (ลอกทั้งช็อต + ฉาก) ฉากที่เลือกตรงนี้จะไม่ถูกใช้',
      muted: shotScene,
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
          {card('auto', framingValue === 'auto', shot || isDirector, () => setFramingId('auto'), <PersonView framing={presetFraming(preset)} />, isDirector ? 'AI เลือกระยะให้' : 'ตามสไตล์', isDirector ? 'เลือกกรอบภาพให้เข้ากับท่าและรายละเอียดชุด' : `${preset.name}: ${preset.framing.label}`)}
          {FRAMINGS.map((f) => card(f.id, framingValue === f.id, shot || isDirector, () => setFramingId(f.id), <PersonView framing={f.id} />, f.name, f.hint))}
        </div>
      </Section>
      <Section title="มุมกล้อง">
        <div className="options view-options">
          {card('auto', angleValue === 'auto', shot || isDirector, () => setAngleId('auto'), <PersonView angle={presetAngle(preset)} />, isDirector && backgroundMode === 'keep' ? 'ตามมุมฉากเดิม' : isDirector ? 'AI เลือกมุมให้' : 'ตามสไตล์', isDirector ? 'เลือกมุมกล้องร่วมกับท่าและการใช้พื้นที่' : `${preset.name}: ${preset.angle.label}`)}
          {ANGLES.map((a) => card(a.id, angleValue === a.id, shot || isDirector, () => setAngleId(a.id), <PersonView angle={a.id} />, a.name, a.hint))}
        </div>
      </Section>
      <Section title="ตำแหน่งในภาพ">
        {!shot && keepsPlace && <p className="note">ท่าเดิม + ฉากเดิม (เปลี่ยนแค่ชุด): คนอยู่ที่เดิมในรูปนางแบบ เลือกท่าหรือฉากใหม่ก่อนถึงจะย้ายตำแหน่งได้</p>}
        <div className="options view-options">
          {card('auto', !placementChoice, shot || keepsPlace || isDirector, () => setPlacementId('auto'), <PersonView placement="auto" />, 'อัตโนมัติ', isDirector ? 'AI เลือกตำแหน่งให้เหมาะกับฉากและท่า' : 'สุ่มซ้าย / ขวา / กลาง ให้แต่ละรูป ได้ภาพหลากหลาย')}
          {PLACEMENTS.map((p) => card(p.id, placementChoice?.id === p.id, shot || keepsPlace || isDirector, () => setPlacementId(p.id), <PersonView placement={p.id} />, p.name, p.hint))}
        </div>
      </Section>
    </>;
  } else if (cur.key === 'output') {
    // ตั้งค่า (29 ต.ค. แบบหน้าสินค้า): ใช้ภาพที่ไหน -> สั่งเพิ่มเติม -> ขั้นสูง -> ปุ่มสร้างรูปท้ายเส้นทาง
    // ใช้ภาพที่ไหน: เลือกตามที่จะโพสต์แทนตัวเลขสัดส่วน (lib/aspects.ts) 4:5 / 9:16 server ทำ 2:3 แล้วตัด
    panel = <>
      <Section title="ใช้ภาพที่ไหน" note={`สัดส่วน ${aspect}`}>
        <div className="options aspect-options">{PLATFORM_ASPECTS.map((a) => <button key={a.id} type="button" aria-pressed={aspect === a.id}
          className={'option aspect-option' + (aspect === a.id ? ' active' : '')} onClick={() => setAspect(a.id)}>
          <span className="aspect-slot" aria-hidden="true"><i className="aspect-frame" style={{ aspectRatio: a.id.replace(':', ' / ') }} /></span>
          <span><b>{a.name}</b><small>{a.use} · {a.id}</small></span>
        </button>)}</div>
      </Section>
      <Section title="สั่งเพิ่มเติม">
        {isDirector && <p className="muted-text">AI จัดท่าและองค์ประกอบให้ทั้งหมด เปลี่ยนจากโหมด AI ในขั้นท่าโพสต์หากต้องการสั่งเอง</p>}
        <textarea className="text-input" disabled={isDirector} value={isDirector ? '' : extra} onChange={(e) => setExtra(e.target.value)} placeholder={isDirector ? 'AI จัดท่าและองค์ประกอบให้อัตโนมัติ' : 'เช่น ให้ยิ้ม, ใส่รองเท้าผ้าใบสีขาว'} />
      </Section>
      <details className="advanced">
        <summary>ขั้นสูง <small>คุณภาพ · การมอง · พร็อพ · ปรับแสงรอบสอง</small></summary>
        {/* เลือกโมเดลไม่ได้แล้ว (27 ต.ค. เปิดให้ลูกค้าทดลอง): ใช้ DEFAULT_AI_MODEL เสมอ server บังคับซ้ำ (lib/route.ts) */}
        {aiModels?.length === 0 && <p className="note">ยังไม่มี API key ในไฟล์ .env</p>}
        {aiModel.startsWith('openai:') && (
          <Section title="คุณภาพ" note={isGpt25(aiModel) ? 'สูงขึ้น = เนื้อผ้า/ผิวสมจริงขึ้น แต่ช้าและแพงขึ้น' : undefined}>
            <ChipGroup options={isGpt25(aiModel) ? QUALITIES_25 : QUALITIES} value={quality} onChange={setQuality} />
          </Section>
        )}
        <Section title="การมอง" note={isDirector ? 'AI เลือกให้ หน้าและสายตาหลากหลาย' : shot ? 'ใช้จากรูปต้นแบบ' : 'อัตโนมัติ = สุ่มมุมหน้าและสายตาต่อรูป'}>
          <ChipGroup options={[{ id: '', name: 'อัตโนมัติ' }, ...GAZES]} value={shot || isDirector ? '' : gazeId} disabled={shot || isDirector} onChange={setGazeId} />
        </Section>
        <Section title="พร็อพในมือ" note={isDirector ? 'AI จัดท่าและการใช้สิ่งของในฉากให้' : 'เลือกได้หลายอย่าง'}>
          <div className="chips">
            {PROPS.map((p) => (
              <button key={p.id} type="button" disabled={isDirector} className={'chip' + (!isDirector && heldProps.includes(p.id) ? ' active' : '')}
                onClick={() => setHeldProps((h) => (h.includes(p.id) ? h.filter((x) => x !== p.id) : [...h, p.id]))}>
                {p.name}
              </button>
            ))}
          </div>
        </Section>
        <label className="check">
          <input type="checkbox" checked={harmonize} onChange={(e) => setHarmonize(e.target.checked)} />
          <span>ปรับแสงรอบสอง ให้กลมกลืนกับฉากขึ้นอีก<small>AI จะเกลี่ยแสง เงา และสีอีกรอบ (เสียเงิน 2 เท่า ใช้เวลานานขึ้น)</small></span>
        </label>
      </details>
      {/* ปุ่มสร้างรูปท้ายเส้นทาง (ขั้นตั้งค่าเป็นขั้นสุดท้ายก่อนแต่งรูป): 2 ปุ่มคู่กัน */}
      <div className="gen-row">
        <button className="btn btn-primary gen-btn" disabled={busy !== null || !aiModels?.length} onClick={() => void generate()}>{busy !== null ? 'กำลังทำงาน...' : isDirector ? 'คิด 3 ไอเดียให้เลือก' : 'สร้างรูป'}</button>
        <button className="btn btn-secondary gen-btn set-btn" disabled={!SET_SHOOT || busy !== null || !aiModels?.length} onClick={() => void generate(true)}
          title={SET_SHOOT ? `${SET_SHOTS.map((s) => s.name).join(' · ')} — ค่า AI ${SET_SHOTS.length} เท่า` : 'ยังไม่เปิดให้ใช้'}>
          ชุดภาพ {SET_SHOTS.length} มุม<small>{SET_SHOOT ? `ค่า AI ${SET_SHOTS.length} เท่า` : 'เร็วๆ นี้'}</small>
        </button>
      </div>
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
              disabled={shot && !shotPresetLight} onClick={() => setPresetId(p.id)}>
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
  } else {
    panel = <>
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
  }

  // ---------- ประวัติรูป: รูปในชุดภาพเดียวกันอยู่ในกรอบเดียว เรียงตามมุม (SET_SHOTS) ----------
  const thumb = (i: number, label?: string) => (
    <div className="deletable" key={results[i].src}>
      <button className={current === i ? 'active' : ''} title={results[i].caption} onClick={() => setCurrent(i)}>
        <img src={results[i].src} alt={results[i].caption} />
      </button>
      <DeleteButton onClick={() => void deleteResult(i)} />
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
          <TokenUsage />
          <SignOutButton />
        </div>
      </header>

      <div className="workspace">
        <nav className="rail" aria-label="ขั้นตอน">
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

        <aside className="panel" onClickCapture={mark} onInputCapture={mark}>
          <div className="panel-head">
            <span className="num">{step + 1}</span>
            <h2>{cur.title}</h2>
            {cur.key === 'accessory' && <span className="hint">เลือกแล้ว {accs.length}/{accLimit} ชิ้น</span>}
          </div>
          {panel}
          {nextStep >= 0 && (
            <button className={'btn next ' + (stepReady ? 'btn-ready' : 'btn-secondary')} onClick={() => goStep(nextStep)}>ถัดไป: {STEPS[nextStep].label} →</button>
          )}
        </aside>

        <section className="stage">
          <div className={'frame' + (busy !== null && !pendingSet ? ' busy' : '') + (compare ? ' compare' : '')} ref={frameRef}>
            {compare && <figure className="zoomable" title="กดเพื่อดูเต็มจอและซูม" onClick={() => void openViewer(true)}>
              <img src={skinOriginal ?? displaySrc} alt={skinOriginal ? 'ต้นฉบับก่อนปรับผิว' : 'ก่อนแต่ง'} /><figcaption>{skinOriginal ? 'ต้นฉบับก่อนปรับผิว' : 'ก่อนแต่ง'}</figcaption>
            </figure>}
            <figure className="zoomable" title="กดเพื่อดูเต็มจอและซูม" onClick={() => void openViewer(false)}>
              <canvas ref={canvasRef} />{compare && <figcaption>{skinOriginal ? 'ปรับผิวแล้ว' : 'หลังแต่ง'}</figcaption>}
            </figure>
            {/* ข้อความจากเครื่องมือแต่งรูป (กำลังโหลด / หาหน้าไม่เจอ / แนะนำให้ซูม) ลอยขอบล่างรูป ไม่ดันปุ่มด้านล่าง */}
            {retouchStatus && <div className="frame-hint" role="status">{retouchStatus}</div>}
            <div className="overlay"><div className="spinner" /><div>{busy}</div></div>
          </div>
          <div className="stage-tools">
            <div className="caption" title={shown?.caption}>{shown ? shown.caption : `ตัวอย่าง: ${model.name} (ยังไม่ได้สร้าง)`}</div>
            {shown?.posePlan?.review && <button className="btn btn-secondary tool" onClick={() => setStep(STEPS.findIndex((s) => s.key === 'pose'))}>
              {shown.posePlan.review.status === 'passed' ? 'ผ่านการตรวจด้วย AI · ดูแผนภาพ' : 'ควรตรวจภาพก่อนใช้ · ดูรายละเอียด'}
            </button>}
            <button className="btn btn-secondary tool" onClick={save}><IconDownload /> ดาวน์โหลด</button>
            {shown && <button className="btn btn-secondary tool" disabled={busy !== null}
              onClick={() => setLocalEdit({ src: shown.src, caption: shown.caption })}><IconRetouch /> แก้เฉพาะจุด</button>}
            {shown?.editedFrom && <button className="btn btn-secondary tool" disabled={busy !== null || !results.some((r) => r.src === shown.editedFrom)}
              onClick={() => setCurrent(results.findIndex((r) => r.src === shown.editedFrom))}>ดูต้นฉบับ</button>}
            {shown && <button className="btn btn-secondary tool" disabled={busy !== null || !canRefineSkin}
              title="ใช้ AI เพิ่ม 1 ครั้ง ~฿2.8 ได้รูปใหม่ 1664×2496" onClick={() => void refineSkin()}>
              <IconSparkle /> ปรับผิวสมจริง
            </button>}
            <button className={'btn btn-secondary tool' + (zoomed ? ' on' : '')} onClick={() => { setZoomed((z) => !z); setRetouchStatus(''); }}>
              <IconZoom /> {zoomed ? 'ดูทั้งรูป' : 'ซูมหน้า'}
            </button>
            <button className="btn btn-secondary tool"
              onPointerDown={() => setOriginal(true)} onPointerUp={() => setOriginal(false)} onPointerLeave={() => setOriginal(false)}>
              <IconCompare /> กดค้างดูก่อนแต่ง
            </button>
          </div>
          <div className="history-head">รูปที่สร้างแล้ว <span>{results.length}</span></div>
          <div className="history">
            {historyItems}
            {!results.length && <p className="muted-text">ยังไม่มี เลือกของแต่ละขั้นแล้วกด &quot;สร้างรูป&quot; ในขั้นตั้งค่า</p>}
          </div>
        </section>

      </div>

      {shotChoice && <ShotChoiceDialog proposal={shotChoice.proposal} references={shotChoice.references} onChoose={shotChoice.choose} />}
      {localEdit && <LocalEditDialog src={localEdit.src} models={aiModels ?? []} initialModel={aiModel} onClose={() => setLocalEdit(null)} onEdit={editLocalArea} />}
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
