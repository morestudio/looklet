// ชนิดข้อมูลกลางของรูปผลลัพธ์ที่ใช้ร่วมกันระหว่างฝั่ง server (lib/storage.ts) และหน้าเว็บ (TryOn, Packshot, Gallery)

export type SetTag = { id: string; index: number };
export type StylePlan = { name: string; th: string };

export type ResultBase<R = Record<string, unknown>> = {
  src: string;
  caption: string;
  set?: SetTag;
  editedFrom?: string;
  recipe?: Partial<R>;
  inGallery?: boolean;
};

export type StoredResultBase<R = Record<string, unknown>> = {
  src: string;
  name?: string;
  caption?: string;
  type?: string;
  set?: SetTag;
  page?: string;
  editedFrom?: string;
  recipe?: Partial<R>;
  inGallery?: boolean;
  inHistory?: boolean;
};

