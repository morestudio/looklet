'use client';
// Looklet: เลือกนางแบบ + ชุด + ของเสริม + ฉาก -> AI สร้างรูป -> แต่งรูป (ฟรี) -> บันทึก
// การสร้างรูปเรียกผ่าน API ของเรา (app/api/*) ซึ่งถือ API key ไว้ หน้าเว็บไม่เห็น key
// การแต่งรูปใช้อัลกอริทึมใน lib/vision.js + lib/beauty.js ทำในเครื่อง ไม่เสียเงิน
import { useEffect, useRef, useState, type ReactNode } from 'react';
import AccessoryDialog from './AccessoryDialog';
import { signOut } from './AuthForm';
import {
  IconBag, IconCompare, IconDownload, IconModel, IconPose, IconRetouch, IconScene, IconSearch, IconSettings, IconShirt, IconSparkle, IconZoom,
} from './icons';
import { AddCard, Card, ChipGroup, DeleteButton, PendingCard, Section } from './ui';
import { useRetouchCanvas, type Amounts, type RetouchId } from './useRetouchCanvas';
import { authEnabled } from '@/lib/auth';
import { FILM_DEFAULT, NO_FILM, type Film, type FilmLook } from '@/lib/film';
import { api, geminiAspect, guessAccessory, isHeic, jpegBase64, loadTools, openaiSize, toWebImage, uploadImage } from '@/lib/browser';
import {
  ACCESSORIES, ACCESSORY_TYPES, ASPECTS, FACE_MOODS, GAZES, LIGHT_SOURCES, MAX_ACCESSORIES, MODELS, OUTFITS, POSE_MODES, POSES, PRESET_PARTS,
  PRESETS, PROPS, SCENES, SET_SHOTS, SKIN_TONES, presetLightPrompt, presetPrompt, type AccessoryInfo, type Item, type LightSource, type PoseMode,
} from '@/lib/catalog';

type Key = 'model' | 'outfit' | 'accessory' | 'pose' | 'scene';
const KIND = { model: 'models', outfit: 'outfits', accessory: 'accessories', pose: 'poses', scene: 'scenes' } as const;
const CATALOG: Record<Key, Item[]> = { model: MODELS, outfit: OUTFITS, accessory: ACCESSORIES, pose: POSES, scene: SCENES };

// อ้างถึงรายการด้วย id (ไม่ใช้ตำแหน่ง ลบ/เพิ่มแล้วไม่ต้องไล่แก้): รูป = src, ฉากแบบคำบรรยาย = ชื่อ
const idOf = (item: Item) => item.src ?? item.name;
const find = (list: Item[], id: string | null) => (id === null ? undefined : list.find((i) => idOf(i) === id));
// ท่าโพสต์ "AI เลือกท่าให้" (ไม่มีรูปท่า ให้ AI จัดท่าเองให้สินค้าเด่น) — id ไม่ชนกับรูป (src ขึ้นต้นด้วย /) หรือชื่อภาษาไทย
const AI_POSE = 'ai';
// ของเสริมรูปเก่าที่ไม่มีประเภท -> ถือเป็น "อื่นๆ"
const accessoryType = (a: Item) => ACCESSORY_TYPES.find((t) => t.id === a.type) ?? ACCESSORY_TYPES.find((t) => t.id === 'other')!;

// ใส่หน้าจริงจากรูปนางแบบหลัง AI สร้างรูป (ปิด = false: ได้แค่รูปจาก AI ล้วน)
// ปิดไว้ (15 ต.ค.): มีตัวเลือกท่า/มุมกล้อง/ระยะ/การมองมากขึ้น หน้าในรูปใหม่หัน/ไกล/เล็กต่างจากรูปนางแบบ หน้าที่แปะไม่เข้ากับตัว
// (14 ต.ค. เคยลองปิดแล้วรูปดูแปลกกว่า ตอนนั้นยังไม่มีตัวเลือกพวกนี้) — เปิดใหม่ = true, realFace + pasteRealFace ยังอยู่ครบ
const REAL_FACE = false;

const NO_RETOUCH: Amounts = { eye: 0, slim: 0, acne: 0, smooth: 0, white: 0 };
const AUTO: Amounts = { eye: 30, slim: 25, acne: 50, smooth: 35, white: 30 }; // "แต่งอัตโนมัติ": ค่ากลางๆ ดูเป็นธรรมชาติ
const SLIDERS: [RetouchId, string][] = [['eye', 'ตาโต'], ['slim', 'หน้าเรียว'], ['acne', 'ลบสิว/จุดด่าง'], ['smooth', 'หน้าเนียน'], ['white', 'ผิวขาว']];
// ให้ดูเป็นรูปถ่ายจริง (lib/film.ts): ใส่ให้ทุกรูปที่สร้างอัตโนมัติตามค่า FILM_DEFAULT
const FILM_SLIDERS: ['grain' | 'soften', string][] = [['grain', 'เกรนฟิล์ม'], ['soften', 'ลดความคม']];
// ลุคภาพ: อัตโนมัติ = ตามที่รูปนั้นสร้างมา (Phone candid -> มือถือ, อื่นๆ -> ฟิล์ม) เก็บไว้กับรูป (finish)
const FINISH_LOOKS = [
  { id: 'auto', name: 'อัตโนมัติ', hint: 'รูปจากสไตล์ Phone candid ได้ลุคมือถือ รูปอื่นได้ลุคฟิล์ม' },
  { id: 'film', name: 'ฟิล์ม', hint: 'ลดความคม + เกรนฟิล์ม แบบรูปนิตยสาร' },
  { id: 'phone', name: 'มือถือ', hint: 'คมแบบมือถือ สีจืดลง ดำ/ขาวชัดขึ้น noise เบาๆ ในเงา (จูนจากรูป iPhone จริง)' },
  { id: 'off', name: 'ไม่ใส่', hint: 'รูปจาก AI ล้วน' },
] as const;
type FinishChoice = (typeof FINISH_LOOKS)[number]['id'];

type Result = { src: string; caption: string; set?: SetTag; finish?: FilmLook }; // set = อยู่ในชุดภาพหลายมุม, finish = ลุคที่เหมาะกับรูปนี้
type AiModel = { id: string; label: string };
const newSetId = () => crypto.randomUUID().slice(0, 13); // id ชุดภาพ (server รับแค่ตัวอักษร ตัวเลข - _)
type SetTag = { id: string; index: number }; // ชุดภาพหลายมุม (เหมือน SetTag ใน lib/storage.ts — ไฟล์นั้นใช้ฝั่ง server เท่านั้น)
type Stored = { src: string; name?: string; caption?: string; type?: string; set?: SetTag; finish?: FilmLook };
type Library = { results: Stored[]; uploads: Record<string, Stored[]> };

// ขั้นตอน (เมนูซ้าย): แต่ละขั้นมีแผงเลือก (ซ้าย) + แผงปรับแต่ง (ขวา) รูปอยู่ตรงกลางตลอด
type StepKey = 'model' | 'outfit' | 'accessory' | 'pose' | 'scene' | 'settings' | 'retouch';
const STEPS: { key: StepKey; label: string; title: string; Icon: () => ReactNode }[] = [
  { key: 'model', label: 'นางแบบ', title: 'เลือกนางแบบ', Icon: IconModel },
  { key: 'outfit', label: 'เสื้อผ้า', title: 'เลือกเสื้อผ้า', Icon: IconShirt },
  { key: 'accessory', label: 'ของเสริม', title: 'ของเสริม', Icon: IconBag },
  { key: 'pose', label: 'ท่าโพสต์', title: 'ท่าโพสต์', Icon: IconPose },
  { key: 'scene', label: 'ฉากหลัง', title: 'ฉากหลัง', Icon: IconScene },
  { key: 'settings', label: 'สไตล์ถ่ายภาพ', title: 'เลือกสไตล์ถ่ายภาพ', Icon: IconSettings },
  { key: 'retouch', label: 'แต่งรูป', title: 'แต่งรูป', Icon: IconRetouch },
];
// ตัวกรองในแผงเลือก (ของเสริมกรองตามประเภทแทน)
const SOURCE_FILTERS = [{ id: 'all', name: 'ทั้งหมด' }, { id: 'catalog', name: 'ตัวอย่าง' }, { id: 'uploaded', name: 'อัปโหลดเอง' }];
// คุณภาพ (OpenAI): GPT Image 2.5 มีระดับ xhigh/max เพิ่ม และ high ของ 2.5 ได้รายละเอียดพอๆ กับ medium ของรุ่นก่อน
// ค่าเริ่มต้นของ 2.5 = high: ทดสอบ 19 ต.ค. (สตูดิโอ + คาเฟ่) หน้า/ชุด/ท่าเหมือนกันทุกระดับ, medium ผ้าเรียบลื่นเหมือนผ้าปลอม,
// high เริ่มเห็นเนื้อผ้าในราคา ~฿1.8 (max ลายทอชัดสุดแต่ ~฿5.9 และช้ากว่า 3 เท่า เลือกเองได้)
// ราคาในวงเล็บ = ที่จ่ายจริงตอนทดสอบ (1024×1536, รูปเข้า 2 รูป)
const QUALITIES = [{ id: 'low', name: 'ต่ำ (ถูก)' }, { id: 'medium', name: 'กลาง' }, { id: 'high', name: 'สูง (แพง)' }];
const QUALITIES_25 = [
  { id: 'medium', name: 'กลาง ~฿0.8' }, { id: 'high', name: 'สูง ~฿1.8' }, { id: 'xhigh', name: 'สูงมาก ~฿2.9' }, { id: 'max', name: 'สูงสุด ~฿5.9' },
];
const isGpt25 = (modelId: string) => modelId.startsWith('openai:gpt-image-2.5');
const defaultQuality = (modelId: string) => (isGpt25(modelId) ? 'high' : 'medium');
// "Gemini 3.1 Flash Image (แนะนำ ~1.5–5 บาท/รูป)" -> ชื่อ + รายละเอียดในวงเล็บ
const splitLabel = (label: string) => {
  const m = label.match(/^(.*?)\s*\((.*)\)$/);
  return m ? [m[1], m[2]] : [label, ''];
};

export default function TryOn() {
  const [lists, setLists] = useState(CATALOG);
  // สิ่งที่เลือกอยู่: outfit/pose/scene = null คือ "ของเดิม", accessory = หลายชิ้นได้
  const [pick, setPick] = useState({
    model: idOf(MODELS[0]), outfit: null as string | null, accessory: [] as string[], pose: null as string | null, scene: null as string | null,
  });
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
  const [presetId, setPresetId] = useState(PRESETS[0].id); // สไตล์ถ่ายภาพ (แสง + เลนส์ + มุม + ระยะ + โทนสี)
  const [quality, setQuality] = useState('medium');
  const [extra, setExtra] = useState('');
  const [harmonize, setHarmonize] = useState(false);
  const [poseMode, setPoseMode] = useState<PoseMode>('pose'); // เอาอะไรจากรูปท่าโพสต์
  const [lightSource, setLightSource] = useState<LightSource>('ref'); // ลอกทั้งช็อต: แสงจากรูปต้นแบบ หรือจากสไตล์ถ่ายภาพ
  const [faceMood, setFaceMood] = useState('auto'); // สีหน้า (FACE_MOODS)
  const [gazeId, setGazeId] = useState(''); // การมอง ('' = ไม่กำหนด)
  const [aspect, setAspect] = useState(''); // '' = ตามรูปนางแบบ
  const [heldProps, setHeldProps] = useState<string[]>([]); // พร็อพในมือ (id ใน PROPS)
  // ของเสริมที่ AI กำลังดูว่าเป็นอะไร (URL รูปชั่วคราว) ขึ้นเป็นการ์ดรอในรายการ
  const [analyzing, setAnalyzing] = useState<string[]>([]);
  // หน้าต่างของเสริม: add = AI ดูไม่ออก ให้เลือกประเภทเอง, edit = แก้ชิ้นที่เพิ่มไว้แล้ว
  const [dialog, setDialog] = useState<{ mode: 'add'; file: File; url: string } | { mode: 'edit'; item: Item } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0); // อยู่ขั้นไหน (ตำแหน่งใน STEPS)
  const [query, setQuery] = useState(''); // ค้นหาตามชื่อในแผงเลือก
  const [filter, setFilter] = useState('all'); // ตัวกรองในแผงเลือก (SOURCE_FILTERS หรือ id ประเภทของเสริม)

  const model = find(lists.model, pick.model) ?? lists.model[0];
  const outfit = find(lists.outfit, pick.outfit);
  const aiPose = pick.pose === AI_POSE;
  const pose = aiPose ? undefined : find(lists.pose, pick.pose);
  const scene = find(lists.scene, pick.scene);
  // ลอกทั้งช็อตจากรูปท่า: มุมกล้อง/ระยะ/การมอง/แสงเอาจากรูป (ไม่ใช้สไตล์ถ่ายภาพกับการมอง), + ฉาก = ไม่ใช้ฉากที่เลือก
  const shot = Boolean(pose) && poseMode !== 'pose';
  const shotScene = Boolean(pose) && poseMode === 'shot-scene';
  const shotPresetLight = shot && lightSource === 'preset'; // ลอกทั้งช็อตแต่ใช้แสง/โทนสีของสไตล์ถ่ายภาพ
  const mood = FACE_MOODS.find((m) => m.id === faceMood) ?? FACE_MOODS[0];
  const moodName = mood.id !== 'auto' ? mood.name : pose ? 'สีหน้าตามรูปท่า' : null; // null = ตามรูปนางแบบ ไม่ต้องบอก
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const gaze = shot ? undefined : GAZES.find((c) => c.id === gazeId);
  const propChoices = PROPS.filter((p) => heldProps.includes(p.id));
  const accs = pick.accessory.map((id) => find(lists.accessory, id)).filter((a): a is Item => a !== undefined);
  const shown = current === null ? null : results[current];
  const finishLook: FilmLook = finish === 'auto' ? shown?.finish ?? 'film' : finish; // รูปเก่าที่ไม่ได้เก็บลุคไว้ = ฟิล์ม

  const { canvasRef, fullRef, prepare } = useRetouchCanvas(
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
        setResults(lib.results.map((r) => ({ src: r.src, caption: r.caption || 'รูปที่สร้างไว้', set: r.set, finish: r.finish })));
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
        if (list.length) chooseModel(list[0].id);
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
  function chooseModel(id: string) {
    setAiModel(id);
    setQuality(defaultQuality(id));
  }

  function select(key: Exclude<Key, 'accessory'>, id: string | null) {
    setPick((p) => ({ ...p, [key]: id }));
    if (key === 'model') setCurrent(null); // เปลี่ยนนางแบบ -> โชว์รูปนางแบบคนใหม่เป็นตัวอย่าง
  }

  // ของเสริม: กดแล้วสลับเลือก/ไม่เลือก, null = ไม่ใส่สักชิ้น
  function toggleAccessory(id: string | null) {
    if (id !== null && !pick.accessory.includes(id) && pick.accessory.length >= MAX_ACCESSORIES) {
      return setStatus(`ของเสริมเลือกได้ไม่เกิน ${MAX_ACCESSORIES} ชิ้นต่อรูป — กดชิ้นที่เลือกอยู่เพื่อเอาออกก่อน`);
    }
    setStatus('');
    setPick((p) => ({
      ...p,
      accessory: id === null ? [] : p.accessory.includes(id) ? p.accessory.filter((x) => x !== id) : [...p.accessory, id],
    }));
  }

  // อัปโหลดแล้วเซฟไว้ใน images/uploads/ แล้วเลือกให้เลย
  async function addUpload(key: Key, file: File, name: string, type?: string) {
    let src: string;
    try {
      ({ src } = await api('/api/upload', { kind: KIND[key], name, type, ...(await uploadImage(file)) }));
    } catch (err) {
      src = URL.createObjectURL(file); // เซฟไม่ได้ -> ใช้ชั่วคราวไปก่อน
      setStatus(`เก็บรูปไม่สำเร็จ (${(err as Error).message}) รูปนี้จะหายเมื่อ refresh`);
    }
    setLists((l) => ({ ...l, [key]: [...l[key], { name, src, type, uploaded: true }] }));
    // ของเสริม: ไม่ใช้ toggleAccessory เพราะระหว่างรอ AI ผู้ใช้อาจเลือก/เอาออกชิ้นอื่นไปแล้ว ต้องนับจากค่าล่าสุด
    // เลือกครบแล้ว -> เพิ่มเข้ารายการเฉยๆ ไม่เลือกให้
    if (key === 'accessory') setPick((p) => (p.accessory.length < MAX_ACCESSORIES ? { ...p, accessory: [...p.accessory, src] } : p));
    else select(key, src);
  }

  // HEIC (รูปจาก iPhone) แปลงเป็น JPEG ก่อน ไม่งั้น browser ส่วนใหญ่เปิดรูปไม่ได้ ย่อ/ส่งให้ AI ไม่ได้
  async function onFile(key: Key, picked: File) {
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
    if (key !== 'accessory') return void addUpload(key, file, file.name.replace(/\.[^.]+$/, ''));
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
  }

  async function onDialogDone(info: AccessoryInfo | null) {
    const d = dialog;
    setDialog(null);
    if (!d) return;
    if (d.mode === 'add') {
      URL.revokeObjectURL(d.url);
      if (info) await addUpload('accessory', d.file, info.name, info.type);
      return;
    }
    if (!info) return;
    try {
      if (!d.item.src!.startsWith('blob:')) await api('/api/update', { src: d.item.src, ...info });
    } catch (err) {
      return setStatus('แก้ไม่สำเร็จ: ' + (err as Error).message);
    }
    setLists((l) => ({ ...l, accessory: l.accessory.map((a) => (a === d.item ? { ...a, ...info } : a)) }));
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
      if (key === 'accessory') return { ...p, accessory: p.accessory.filter((x) => x !== id) };
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
    if (!outfit && !accs.length && !pose && !aiPose && !scene) return setStatus('เลือกชุด ของเสริม ท่าโพสต์ หรือฉาก อย่างน้อย 1 อย่างก่อน');
    const choice = aiModels?.find((m) => m.id === aiModel);
    if (!choice) return;
    setStatus('');
    const modeName = POSE_MODES.find((m) => m.id === poseMode)!.name;
    const caption = [
      model.name,
      (outfit?.name ?? 'ชุดเดิม') + accs.map((a) => ' + ' + a.name).join(''),
      ...(pose ? ['ท่า' + pose.name + (shot ? ` (${modeName})` : '')] : aiPose ? ['ท่าที่ AI เลือก'] : []),
      shotScene ? 'ฉากจากรูปต้นแบบ' : scene?.name ?? 'ฉากเดิม',
      shot ? (shotPresetLight ? 'แสง ' + preset.name : 'แสงจากรูปต้นแบบ') : preset.name,
      ...(moodName ? [moodName] : []),
      ...(gaze ? [gaze.name] : []),
      ...(propChoices.length ? ['ถือ' + propChoices.map((p) => p.name).join('/')] : []),
    ].join(' · ') + ` — ${choice.label}${choice.id.startsWith('openai:') ? ` (${quality})` : ''}${harmonize ? ' + ปรับแสงรอบสอง' : ''}`;
    const setCaption = (i: number) => `ชุดภาพ ${i + 1}/${SET_SHOTS.length} ${SET_SHOTS[i].name} · ${caption}`;
    setBusy(set ? `AI กำลังสร้างรูปหลักของชุด (1/${SET_SHOTS.length})...`
      : harmonize ? 'AI กำลังสร้างรูปและปรับแสงรอบสอง... (ประมาณ 30–90 วินาที)'
        : choice.id.startsWith('openai:') && ['xhigh', 'max'].includes(quality) ? 'AI กำลังสร้างรูปแบบละเอียดสูง... (ประมาณ 1–2 นาที)'
          : 'AI กำลังสร้างรูป... (ประมาณ 10–60 วินาที)');
    try {
      // ย่อรูปทุกรูปก่อน (ได้ขนาดจริงที่ส่งไว้ทำ log ด้วย)
      const person = await jpegBase64(model.src!);
      const outfitImg = outfit ? await jpegBase64(outfit.src!) : null;
      const accImgs = await Promise.all(accs.map((a) => jpegBase64(a.src!)));
      const poseImg = pose ? await jpegBase64(pose.src!) : null;
      const sceneImg = !shotScene && scene?.src ? await jpegBase64(scene.src) : null;
      // ที่มาของแต่ละรูป: server เก็บลง log ว่าส่งรูปไหนไปเป็น Image อะไร (ไม่ได้ส่งให้ AI)
      const ref = (item: Item | undefined, img: { w: number; h: number } | null) => (item && img ? { name: item.name, src: item.src, w: img.w, h: img.h } : null);
      const body = {
        model: choice.id,
        person: person.data,
        outfit: outfitImg?.data ?? null,
        accessories: accs.map((a, i) => ({ data: accImgs[i].data, what: accessoryType(a).prompt, show: accessoryType(a).show })),
        pose: poseImg?.data ?? null,
        auto_pose: aiPose,
        pose_mode: poseMode,
        scene_image: sceneImg?.data ?? null,
        scene_text: shotScene ? null : scene?.prompt ?? null,
        refs: {
          person: ref(model, person), outfit: ref(outfit, outfitImg),
          accessories: accs.map((a, i) => ({ ...ref(a, accImgs[i]), type: accessoryType(a).name })),
          pose: ref(pose, poseImg),
          scene: sceneImg ? ref(scene, sceneImg) : scene && !shotScene ? { name: scene.name } : null, // ฉากแบบคำบรรยาย: ส่งแค่ชื่อ
          // ชื่อตัวเลือกภาษาไทย ไว้ทำ log ให้อ่านง่าย (คำสั่งจริงที่ส่ง AI อยู่ใน prompt)
          choices: {
            poseMode: pose ? POSE_MODES.find((m) => m.id === poseMode)!.name : aiPose ? 'AI เลือกท่าให้' : 'ท่าเดิม',
            preset: shot ? (shotPresetLight ? `แสง ${preset.name} · กล้องจากรูปท่าโพสต์` : 'ใช้แสงและกล้องจากรูปท่าโพสต์') : preset.name,
            ...(shot && !shotPresetLight ? {} : Object.fromEntries(PRESET_PARTS
              .filter(({ key }) => !shot || key === 'light' || key === 'color').map(({ key }) => [key, preset[key].label]))),
            face: moodName ?? 'ตามรูปนางแบบ',
            lightSource: shot ? LIGHT_SOURCES.find((l) => l.id === lightSource)!.name : null,
            gaze: gaze?.name ?? null,
            props: propChoices.map((p) => p.name), aspect: aspect || 'ตามรูปนางแบบ', harmonize,
          },
        },
        // เลือกสัดส่วนเอง: OpenAI ได้แค่ 2:3 / 3:2 / 1:1 แนวตั้งทุกแบบเลยส่ง 1024x1536
        aspect: aspect || geminiAspect(person.w, person.h),
        size: aspect ? '1024x1536' : openaiSize(person.w, person.h),
        quality,
        extra: extra.trim(),
        // ลอกทั้งช็อต: แสง/กล้องเอาจากรูปต้นแบบ (server ให้ AI อ่านแสงให้) หรือใช้แค่แสง/โทนสีของสไตล์ที่เลือก
        look: shot ? (shotPresetLight ? presetLightPrompt(preset) : null) : presetPrompt(preset),
        light_from_ref: shot && !shotPresetLight,
        face: mood.prompt || null,
        // ลุคที่เหมาะกับรูปนี้ (เก็บกับรูป ขั้นแต่งรูป "อัตโนมัติ" ใช้ค่านี้): ใช้สไตล์ Phone candid -> มือถือ
        finish: ((!shot || shotPresetLight) && preset.id === 'phone' ? 'phone' : 'film') as FilmLook,
        face_from_ref: mood.id === 'auto' && Boolean(pose),
        // ชุดภาพ: รูปหลักเต็มตัวหน้าตรงเสมอ (ระยะของสไตล์ถ่ายภาพไม่ใช้ รูปใกล้มีในชุดแล้ว)
        full_body: set ? SET_SHOTS[0].fullBody : preset.fullBody,
        framing: shot ? null : set ? SET_SHOTS[0].framing : preset.framing.prompt,
        gaze: gaze?.prompt ?? null,
        props: propChoices.map((p) => p.prompt),
        harmonize,
      };
      const setId = set ? newSetId() : null;
      const setTag = (i: number) => (setId ? { id: setId, index: i } : undefined);
      const out = await api('/api/generate', { ...body, caption: set ? setCaption(0) : caption, set: setTag(0) });
      const made: Result[] = [{ src: out.src, caption: set ? setCaption(0) : caption, set: setTag(0), finish: body.finish }]; // server เซฟไว้ใน results/ แล้ว
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
          setStatus(`ชุดภาพได้ ${SET_SHOTS.length - failed.length}/${SET_SHOTS.length} รูป — สร้างไม่สำเร็จ ${failed.length} รูป: ${(failed[0].reason as Error).message}`);
        }
      }
    } catch (err) {
      setStatus('สร้างรูปไม่สำเร็จ: ' + (err as Error).message);
    } finally {
      setBusy(null);
      setPendingSet(null);
    }
  }

  function save() {
    const full = fullRef.current;
    if (!full?.width) return;
    const a = document.createElement('a');
    a.href = full.toDataURL('image/jpeg', 0.92); // บันทึกทั้งรูปเสมอ แม้กำลังซูมหน้าอยู่
    a.download = `tryon-${Date.now()}.jpg`;
    a.click();
  }


  function goStep(i: number) {
    setStep(i);
    setQuery('');
    setFilter('all');
  }

  const cur = STEPS[step];
  const outfitName = outfit?.name ?? 'ชุดเดิม';
  const poseName = aiPose ? 'AI เลือกท่าให้' : pose?.name ?? 'ท่าเดิม';
  const sceneName = shotScene ? 'ฉากจากรูปต้นแบบ' : scene?.name ?? 'ฉากเดิม';
  const accNames = accs.map((a) => a.name);
  const aiLabel = splitLabel(aiModels?.find((m) => m.id === aiModel)?.label ?? 'ยังไม่มีโมเดล AI')[0];
  const retouched = tone !== null || Object.values(amounts).some((v) => v > 0);
  const displaySrc = shown?.src ?? model.src!;
  const compare = cur.key === 'retouch' && !zoomed; // ขั้นแต่งรูป: ก่อน/หลังแต่งคู่กัน (ซูมหน้าอยู่ = ดูแค่หลังแต่ง)

  // ค่าที่เลือกของแต่ละขั้น (หัวแผง + สรุป) และขั้นไหนเปลี่ยนจากค่าเริ่มต้นแล้ว (จุดแดงบนเมนูซ้าย)
  const stepValue: Record<StepKey, string> = {
    model: model.name,
    outfit: outfitName,
    accessory: accNames.join(', ') || 'ไม่ใส่',
    pose: poseName + (shot ? ` (${POSE_MODES.find((m) => m.id === poseMode)!.name})` : '') + (mood.id !== 'auto' ? ' · ' + mood.name : ''),
    scene: sceneName,
    settings: [shot ? (shotPresetLight ? 'แสง ' + preset.name : 'ตามรูปต้นแบบ') : preset.name, aiLabel, ASPECTS.find((a) => a.id === aspect)?.name, gaze?.name,
      ...propChoices.map((p) => 'ถือ' + p.name)].filter(Boolean).join(' · '),
    retouch: retouched ? 'แต่งแล้ว' : 'ยังไม่แต่ง',
  };
  const stepDone: Record<StepKey, boolean> = {
    model: true,
    outfit: Boolean(outfit),
    accessory: accs.length > 0,
    pose: Boolean(pose || aiPose || mood.id !== 'auto'),
    scene: Boolean(scene) || shotScene,
    settings: Boolean(presetId !== PRESETS[0].id || aspect || gaze || propChoices.length || extra.trim() || harmonize),
    retouch: retouched,
  };

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
    ...ACCESSORY_TYPES.filter((t) => lists.accessory.some((a) => accessoryType(a).id === t.id)).map((t) => ({ id: t.id, name: t.name })),
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
        <AddCard onFile={(f) => onFile(key, f)} />
      </div>
    </>
  );

  let panel: ReactNode;
  if (cur.key === 'model') {
    panel = picker('model', 'models', visible('model').map((m) => uploadedCard('model', m, idOf(m) === pick.model, () => select('model', idOf(m)), true)));
  } else if (cur.key === 'outfit') {
    panel = picker('outfit', 'outfits', visible('outfit').map((o) => uploadedCard('outfit', o, idOf(o) === pick.outfit, () => select('outfit', idOf(o)))), {
      special: <Card item={{ name: 'ชุดเดิม' }} active={!outfit} onClick={() => select('outfit', null)} />,
    });
  } else if (cur.key === 'accessory') {
    panel = picker('accessory', 'accessories', <>
      {visible('accessory').map((a) => (
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
    panel = picker('pose', 'poses', visible('pose').map((p) => uploadedCard('pose', p, idOf(p) === pick.pose, () => select('pose', idOf(p)))), {
      special: <>
        <Card item={{ name: 'ท่าเดิม' }} active={!pose && !aiPose} onClick={() => select('pose', null)} />
        <Card item={{ name: 'AI เลือกท่าให้', emoji: '✨' }} active={aiPose} onClick={() => select('pose', AI_POSE)} />
      </>,
    });
  } else if (cur.key === 'scene') {
    panel = picker('scene', 'scenes', visible('scene').map((s) => uploadedCard('scene', s, idOf(s) === pick.scene, () => select('scene', idOf(s)))), {
      special: <Card item={{ name: 'ฉากเดิม' }} active={!scene} onClick={() => select('scene', null)} />,
      note: shotScene && 'ใช้ฉากจากรูปท่าโพสต์อยู่ (ลอกทั้งช็อต + ฉาก) ฉากที่เลือกตรงนี้จะไม่ถูกใช้',
      muted: shotScene,
    });
  } else if (cur.key === 'settings') {
    panel = <>
      <div className="split-scroll">
        {shot && (
          <p className="note">{shotPresetLight
            ? 'ลอกทั้งช็อตจากรูปท่าโพสต์อยู่: ใช้แค่แสงและโทนสีของสไตล์ที่เลือก มุมกล้องและระยะตามรูปต้นแบบ'
            : 'ลอกทั้งช็อตจากรูปท่าโพสต์อยู่: แสงและกล้องตามรูปต้นแบบ — อยากใช้แสงของสไตล์ด้านล่าง เลือก "ใช้แสงของสไตล์ถ่ายภาพ" ในขั้นท่าโพสต์'}</p>
        )}
        <Section title="สไตล์ถ่ายภาพ">
          <div className="options">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={'option' + (preset.id === p.id ? ' active' : '')} disabled={shot && !shotPresetLight} onClick={() => setPresetId(p.id)}>
                <b>{p.name}</b><small>{p.hint}</small>
              </button>
            ))}
          </div>
        </Section>
      </div>
      {/* รายละเอียดอยู่นอกส่วนที่เลื่อน: เลื่อนรายการสไตล์ได้ กล่องนี้อยู่กับที่ตลอด */}
      {(!shot || shotPresetLight) && (
        // วาดรายละเอียดทุกสไตล์ซ้อนกันในช่องเดียว โชว์แค่อันที่เลือก -> กล่องสูงเท่าอันที่ยาวสุดเสมอ เปลี่ยนสไตล์แล้วไม่กระโดด
        <div className="preset-detail">
          {PRESETS.map((p) => (
            <div key={p.id} className={p.id === preset.id ? '' : 'stack-hidden'} aria-hidden={p.id !== preset.id}>
              <Section title={`ใน ${p.name} มีอะไรบ้าง`}>
                <dl className="preset-parts">
                  {PRESET_PARTS.map(({ key, name }) => <div key={key}><dt>{name}</dt><dd>{p[key].label}</dd></div>)}
                </dl>
              </Section>
            </div>
          ))}
        </div>
      )}
    </>;
  } else {
    panel = <>
      <Section title="รีทัช" note="ปรับได้ทันที ไม่เสียเงิน">
        <div className="sliders">
          {SLIDERS.map(([id, label]) => (
            <div className="slider" key={id}>
              <label htmlFor={id}>{label} <output>{amounts[id]}</output></label>
              <input type="range" id={id} min={0} max={100} value={amounts[id]}
                onChange={(e) => setAmounts((a) => ({ ...a, [id]: +e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="retouch-actions">
          <button className="btn btn-secondary" onClick={() => setAmounts(AUTO)}><IconSparkle /> แต่งอัตโนมัติ</button>
          <button className="btn btn-tertiary" onClick={() => { setAmounts(NO_RETOUCH); setTone(null); setFinish('auto'); setFilm(FILM_DEFAULT); }}>รีเซ็ต</button>
        </div>
      </Section>
      <Section title="ให้ดูเป็นรูปถ่ายจริง" note="ใส่ให้ทุกรูปอัตโนมัติ">
        <ChipGroup options={[...FINISH_LOOKS]} value={finish} onChange={(v) => setFinish(v as FinishChoice)} />
        <p className="muted-text">{FINISH_LOOKS.find((f) => f.id === finish)!.hint}{finish === 'auto' && shown ? ` · รูปนี้: ${finishLook === 'phone' ? 'มือถือ' : 'ฟิล์ม'}` : ''}</p>
        <div className="sliders">
          {finishLook === 'film' && FILM_SLIDERS.map(([id, label]) => (
            <div className="slider" key={id}>
              <label htmlFor={id}>{label} <output>{film[id]}</output></label>
              <input type="range" id={id} min={0} max={100} value={film[id]}
                onChange={(e) => setFilm((f) => ({ ...f, [id]: +e.target.value }))} />
            </div>
          ))}
          {finishLook === 'phone' && (
            <div className="slider">
              <label htmlFor="phone">ความแรงลุคมือถือ <output>{film.phone}</output></label>
              <input type="range" id="phone" min={0} max={100} value={film.phone} onChange={(e) => setFilm((f) => ({ ...f, phone: +e.target.value }))} />
            </div>
          )}
        </div>
        <p className="muted-text">ดาวน์โหลดได้รูปที่ใส่ลุคแล้ว · กดค้าง &quot;ดูก่อนแต่ง&quot; = รูปจาก AI ล้วน</p>
      </Section>
    </>;
  }

  // ---------- แผงปรับแต่ง (ขวา) ----------
  const tips = (items: string[]) => <ul className="tips">{items.map((t) => <li key={t}>{t}</li>)}</ul>;
  let inspector: ReactNode;
  if (cur.key === 'model') {
    inspector = <>
      <Section title="นางแบบที่เลือก"><p className="big">{model.name}</p></Section>
      <Section title="รูปแบบไหนได้ผลดี">
        {tips(['เต็มตัว เห็นตั้งแต่หัวถึงเท้า', 'พื้นหลังเรียบ แสงสว่างทั่ว', 'หน้าตรง เห็นหน้าชัด ไม่ใส่แว่นดำ', 'ใส่ชุดเรียบพอดีตัว คนเดียวในรูป'])}
      </Section>
    </>;
  } else if (cur.key === 'outfit') {
    inspector = <>
      <Section title="ชุดที่เลือก"><p className="big">{outfitName}</p></Section>
      <Section title="รูปแบบไหนได้ผลดี">{tips(['ภาพสินค้าไม่มีคนใส่', 'พื้นขาวหรือพื้นเรียบ', 'เห็นทั้งชุด ไม่ตัดขอบ'])}</Section>
    </>;
  } else if (cur.key === 'accessory') {
    inspector = <>
      <Section title="ของเสริมที่เลือก" note={`${accs.length}/${MAX_ACCESSORIES}`}>
        {accs.length ? accs.map((a) => (
          <div className="sel-row" key={idOf(a)}>
            <img src={a.src} alt="" />
            <div>
              <b>{a.name}</b>
              <button className="acc-type" title="แก้ชื่อ/ประเภท" onClick={() => setDialog({ mode: 'edit', item: a })}>{accessoryType(a).name} ✎</button>
            </div>
            <button className="icon-btn" title="เอาออก" aria-label="เอาออก" onClick={() => toggleAccessory(idOf(a))}>×</button>
          </div>
        )) : <p className="muted-text">ยังไม่ได้เลือก กดการ์ดทางซ้ายเพื่อเลือก</p>}
      </Section>
      <Section title="เพิ่มของเสริม">
        {tips(['อัปโหลดรูปสินค้าชิ้นเดียว พื้นขาวหรือพื้นใส', 'AI ดูรูปแล้วตั้งชื่อ + เลือกประเภทให้', 'ประเภทไม่ถูก กด ✎ เพื่อแก้'])}
      </Section>
    </>;
  } else if (cur.key === 'pose') {
    inspector = <>
      {pose && (
        <Section title="ใช้รูปท่าแบบไหน">
          <ChipGroup options={[...POSE_MODES]} value={poseMode} onChange={(v) => setPoseMode(v as PoseMode)} />
          <p className="muted-text">{POSE_MODES.find((m) => m.id === poseMode)!.hint}</p>
        </Section>
      )}
      {shot && (
        <Section title="แสง">
          <ChipGroup options={[...LIGHT_SOURCES]} value={lightSource} onChange={(v) => setLightSource(v as LightSource)} />
          <p className="muted-text">{LIGHT_SOURCES.find((l) => l.id === lightSource)!.hint}</p>
        </Section>
      )}
      <Section title="สีหน้า">
        <ChipGroup options={FACE_MOODS} value={faceMood} onChange={setFaceMood} />
        <p className="muted-text">{mood.hint}</p>
      </Section>
      {aiPose && (
        <Section title="AI เลือกท่าให้">
          <p className="muted-text">AI จัดท่าให้สินค้าเด่นเอง ตามของเสริมที่เลือก เช่น ใส่แว่นอาจแตะแว่น ใส่กระเป๋าอาจยกกระเป๋าขึ้นโชว์</p>
        </Section>
      )}
      {!pose && !aiPose && (
        <Section title="รูปแบบไหนได้ผลดี">
          {tips(['คนเดียวเต็มตัว เห็นแขนขาชัด', 'ไม่มีตัวอักษร/ไอคอนแอปทับ', 'แคปจากมือถือ ตัดขอบแอปออกก่อน'])}
        </Section>
      )}
    </>;
  } else if (cur.key === 'scene') {
    inspector = <>
      <Section title="ฉากที่เลือก"><p className="big">{sceneName}</p></Section>
      <Section title="รูปแบบไหนได้ผลดี">
        {tips(['ฉากว่าง ไม่มีคน', 'แนวตั้ง', 'เห็นพื้นตรงที่จะให้นางแบบยืน', 'แสงในฉากเข้ากับสไตล์ถ่ายภาพที่จะเลือกในขั้นถัดไป'])}
      </Section>
    </>;
  } else if (cur.key === 'settings') {
    inspector = <>
      <button className="btn btn-primary gen-btn" disabled={busy !== null || !aiModels?.length} onClick={() => void generate()}>สร้างรูป</button>
      <button className="btn btn-secondary gen-btn set-btn" disabled={busy !== null || !aiModels?.length} onClick={() => void generate(true)}>
        ชุดภาพ {SET_SHOTS.length} มุม<small>{SET_SHOTS.map((s) => s.name).join(' · ')} — ค่า AI {SET_SHOTS.length} เท่า</small>
      </button>
      <details className="advanced">
        <summary>ขั้นสูง <small>โมเดล AI · สัดส่วน · การมอง · พร็อพ · สั่งเพิ่ม</small></summary>
        <Section title="โมเดล AI">
          <div className="options">
            {(aiModels ?? []).map((m) => {
              const [name, detail] = splitLabel(m.label);
              return (
                <button key={m.id} type="button" className={'option' + (aiModel === m.id ? ' active' : '')} onClick={() => chooseModel(m.id)}>
                  <b>{name}</b>{detail && <small>{detail}</small>}
                </button>
              );
            })}
            {aiModels?.length === 0 && <p className="note">ยังไม่มี API key ในไฟล์ .env</p>}
          </div>
        </Section>
        {aiModel.startsWith('openai:') && (
          <Section title="คุณภาพ (OpenAI)" note={isGpt25(aiModel) ? 'สูงขึ้น = เนื้อผ้า/ผิวสมจริงขึ้น แต่ช้าและแพงขึ้น' : undefined}>
            <ChipGroup options={isGpt25(aiModel) ? QUALITIES_25 : QUALITIES} value={quality} onChange={setQuality} />
          </Section>
        )}
        <Section title="สัดส่วนภาพ" note={aspect && aspect !== '2:3' && aiModel.startsWith('openai:') ? 'OpenAI ได้แค่ 2:3' : undefined}>
          <ChipGroup value={aspect} onChange={setAspect} options={[
            { id: '', name: 'ตามรูปนางแบบ' },
            ...ASPECTS.map((a) => ({ id: a.id, name: <><i className="ratio" style={{ aspectRatio: a.id.replace(':', ' / ') }} />{a.name}</> })),
          ]} />
        </Section>
        <Section title="การมอง" note={shot ? 'ใช้จากรูปต้นแบบ' : undefined}>
          <ChipGroup options={[{ id: '', name: 'ไม่กำหนด' }, ...GAZES]} value={shot ? '' : gazeId} disabled={shot} onChange={setGazeId} />
        </Section>
        <Section title="พร็อพในมือ" note="เลือกได้หลายอย่าง">
          <div className="chips">
            {PROPS.map((p) => (
              <button key={p.id} type="button" className={'chip' + (heldProps.includes(p.id) ? ' active' : '')}
                onClick={() => setHeldProps((h) => (h.includes(p.id) ? h.filter((x) => x !== p.id) : [...h, p.id]))}>
                {p.name}
              </button>
            ))}
          </div>
        </Section>
        <Section title="สั่งเพิ่มเติม">
          <textarea className="text-input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="เช่น ให้ยิ้ม, ใส่รองเท้าผ้าใบสีขาว" />
        </Section>
        <label className="check">
          <input type="checkbox" checked={harmonize} onChange={(e) => setHarmonize(e.target.checked)} />
          <span>ปรับแสงรอบสอง ให้กลมกลืนกับฉากขึ้นอีก<small>AI จะเกลี่ยแสง เงา และสีอีกรอบ (เสียเงิน 2 เท่า ใช้เวลานานขึ้น)</small></span>
        </label>
      </details>
    </>;
  } else {
    inspector = <>
      <Section title="สีผิว">
        <div className="chips">
          <button className={'chip' + (tone === null ? ' active' : '')} onClick={() => setTone(null)}>สีเดิม</button>
          {SKIN_TONES.map((t) => (
            <button key={t.color} className={'swatch' + (tone === t.color ? ' active' : '')} style={{ background: t.color }}
              title={t.name} aria-label={t.name} onClick={() => setTone(t.color)} />
          ))}
        </div>
      </Section>
      <Section title="ตัวช่วย">
        <div className="retouch-actions">
          <button className={'btn btn-secondary' + (zoomed ? ' on' : '')} onClick={() => { setZoomed((z) => !z); setRetouchStatus(''); }}>
            <IconZoom /> {zoomed ? 'ดูทั้งรูป' : 'ซูมหน้า'}
          </button>
          <button className="btn btn-secondary" onClick={save}><IconDownload /> ดาวน์โหลด</button>
        </div>
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
        <div className="brand">Looklet <span className="beta">Beta</span></div>
        <div className="status" role="status" title={status}>
          {status && <>{status}<button className="status-x" aria-label="ปิดข้อความ" onClick={() => setStatus('')}>×</button></>}
        </div>
        <div className="top-actions">
          {authEnabled && <button className="btn btn-tertiary" onClick={() => void signOut()}>ออกจากระบบ</button>}
          <button className="btn btn-secondary" onClick={save}><IconDownload /> <span className="hide-sm">ดาวน์โหลด</span></button>
          <button className="btn btn-secondary" disabled={busy !== null || !aiModels?.length} title={SET_SHOTS.map((s) => s.name).join(' · ')}
            onClick={() => void generate(true)}>
            ชุดภาพ {SET_SHOTS.length} มุม
          </button>
          <button className="btn btn-primary" disabled={busy !== null || !aiModels?.length} onClick={() => void generate()}>
            {busy !== null ? 'กำลังสร้าง...' : 'สร้างรูป'}
          </button>
        </div>
      </header>

      <div className="workspace">
        <nav className="rail" aria-label="ขั้นตอน">
          {STEPS.map((s, i) => (
            <button key={s.key} className={'rail-btn' + (step === i ? ' active' : '')} onClick={() => goStep(i)} aria-current={step === i ? 'step' : undefined}>
              <span className="n">{i + 1}</span>
              <s.Icon />
              <span>{s.label}</span>
              {stepDone[s.key] && s.key !== 'model' && <i className="dot" />}
            </button>
          ))}
        </nav>

        <aside className={'panel' + (cur.key === 'settings' ? ' split' : '')}>
          <div className="panel-head">
            <span className="num">{step + 1}</span>
            <h2>{cur.title}</h2>
            {cur.key === 'accessory' && <span className="hint">เลือกได้ {MAX_ACCESSORIES} ชิ้น</span>}
          </div>
          {panel}
          {step < STEPS.length - 1 && (
            <button className="btn btn-secondary next" onClick={() => goStep(step + 1)}>ถัดไป: {STEPS[step + 1].label} →</button>
          )}
        </aside>

        <section className="stage">
          <div className={'frame' + (busy !== null && !pendingSet ? ' busy' : '') + (compare ? ' compare' : '')} ref={frameRef}>
            {compare && <figure><img src={displaySrc} alt="ก่อนแต่ง" /><figcaption>ก่อนแต่ง</figcaption></figure>}
            <figure><canvas ref={canvasRef} />{compare && <figcaption>หลังแต่ง</figcaption>}</figure>
            {/* ข้อความจากเครื่องมือแต่งรูป (กำลังโหลด / หาหน้าไม่เจอ / แนะนำให้ซูม) ลอยขอบล่างรูป ไม่ดันปุ่มด้านล่าง */}
            {retouchStatus && <div className="frame-hint" role="status">{retouchStatus}</div>}
            <div className="overlay"><div className="spinner" /><div>{busy}</div></div>
          </div>
          <div className="stage-tools">
            <div className="caption" title={shown?.caption}>{shown ? shown.caption : `ตัวอย่าง: ${model.name} (ยังไม่ได้สร้าง)`}</div>
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
            {!results.length && <p className="muted-text">ยังไม่มี เลือกของแต่ละขั้นแล้วกด &quot;สร้างรูป&quot; มุมขวาบน</p>}
          </div>
        </section>

        <aside className="inspector">
          {inspector}
          {cur.key !== 'retouch' && (
            <div className="summary">
              <p className="sub">สรุปที่เลือก</p>
              {STEPS.slice(0, 6).map((s, i) => (
                <button key={s.key} className="sum-row" onClick={() => goStep(i)}>
                  <span>{s.label}</span><b>{stepValue[s.key] || '—'}</b>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

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
