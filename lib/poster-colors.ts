// poster-colors.ts — สีของฉัน: สีที่ผู้ใช้เลือกเองในหน้าโปสเตอร์ เก็บไว้ใช้ซ้ำ (ผู้ใช้ 24 พ.ย.: "I want the color that chose to save")
// เก็บใน localStorage ของเครื่องนี้ (ยังไม่ผูกกับบัญชี) · เรียงเก่า -> ใหม่ (ใหม่สุดอยู่ติดวงสีรุ้ง) · เกิน COLORS_MAX ตัดสีเก่าสุดทิ้ง
// เลือกสีที่มีอยู่แล้วซ้ำ = อยู่ที่เดิม (สีไม่กระโดดใต้นิ้ว) · โหมดส่วนตัว/บล็อก storage = ใช้ได้เฉพาะในหน้านี้
import { useSyncExternalStore } from 'react';
import { CUSTOM_COLOR } from './poster';

export const COLORS_KEY = 'lolo:poster-colors';
export const COLORS_MAX = 8;
const EMPTY: string[] = [];
let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (cache) return cache;
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLORS_KEY) ?? '[]');
    cache = Array.isArray(v)
      ? [
          ...new Set(
            v.filter((c): c is string => typeof c === 'string' && CUSTOM_COLOR.test(c)).map((c) => c.toLowerCase()),
          ),
        ].slice(-COLORS_MAX)
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: string[]) {
  cache = list;
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify(list));
  } catch {
    // เก็บไม่ได้ (โหมดส่วนตัว) = จำไว้แค่ในหน้านี้
  }
  listeners.forEach((l) => l());
}

export function rememberColor(color: string) {
  const c = color.toLowerCase();
  if (!CUSTOM_COLOR.test(c)) return;
  const list = read();
  if (!list.includes(c)) write([...list, c].slice(-COLORS_MAX));
}

export function forgetColor(color: string) {
  write(read().filter((c) => c !== color.toLowerCase()));
}

function subscribe(l: () => void) {
  listeners.add(l);
  // อีกแท็บเปลี่ยน -> อ่านใหม่
  const onStorage = (e: StorageEvent) => {
    if (e.key !== COLORS_KEY) return;
    cache = null;
    l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

export const useSavedColors = () => useSyncExternalStore(subscribe, read, () => EMPTY);
