'use client';
// /gallery: results in the gallery (meta.inGallery), newest added first
// raw stored file; lib/film.ts finish not applied
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IconBookmark, IconEdit, IconHeart, IconInfo, IconTrash } from './icons';
import { SignOutButton } from './AuthForm';
import ImageViewer from './ImageViewer';
import { api, thumbSrc } from '@/lib/browser';
import { DeleteButton, GalleryLink, PageSwitch, RemoveImageDialog, TokenUsage, useMe } from './ui';

type Result = {
  src: string; created: number; caption?: string; page?: 'product'; editedFrom?: string; refinedFrom?: string; favorite?: boolean; productPhotos?: string[];
  inGallery?: boolean; addedToGalleryAt?: number; inHistory?: boolean;
  recipe?: { pick?: Record<string, unknown> }; stylePlan?: { name: string; th: string }; posePlan?: { name: string; th: string };
};
type Filter = 'all' | 'model' | 'product';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'ทั้งหมด' }, { id: 'model', label: 'นางแบบ' }, { id: 'product', label: 'สินค้า' }];
const pageOf = (r: Result): Exclude<Filter, 'all'> => (r.page === 'product' ? 'product' : 'model');
const pageName = (r: Result) => (pageOf(r) === 'product' ? 'สินค้า' : 'นางแบบ');
const when = (sec: number) => new Date(sec * 1000).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
// recipe.pick keys of both pages (lib/tryon-recipe.ts, lib/packshot-recipe.ts) -> step label; ids that aren't paths (pose presets, text scenes) skipped
// product = group id = its first photo's URL (lib/product-groups.ts); productPhotos (every photo sent) replaces it when stored
const PICK_LABELS: Record<string, string> = {
  model: 'นางแบบ', outfit: 'ชุด', top: 'เสื้อ', bottom: 'ท่อนล่าง', shoes: 'รองเท้า', accessory: 'ของเสริม', pose: 'ท่าโพสต์', scene: 'ฉาก',
  product: 'สินค้า', ref: 'แรงบันดาลใจ', prop: 'พร็อพ',
};
const inputsOf = (r: Result) => Object.entries({ ...r.recipe?.pick, ...(r.productPhotos && { product: r.productPhotos }) }).flatMap(([k, v]) => (Array.isArray(v) ? v : [v])
  .filter((src): src is string => typeof src === 'string' && src.startsWith('/') && k in PICK_LABELS).map((src) => ({ label: PICK_LABELS[k], src })));

export default function Gallery() {
  const [results, setResults] = useState<Result[] | null>(null); // null = loading
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [favOnly, setFavOnly] = useState(false); // on top of the page filter
  const [open, setOpen] = useState<Result | null>(null);
  const [removing, setRemoving] = useState<Result | null>(null); // pending ConfirmDialog
  const [infoSrc, setInfoSrc] = useState<string | null>(null); // image shown in the info panel
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set()); // input pictures deleted since (404)
  const me = useMe();
  const router = useRouter();
  const showRaw = me === null || me.role !== 'customer'; // raw meta for team / superadmin; null = no auth (local tool)

  useEffect(() => {
    fetch('/api/library?only=results')
      .then((r) => (r.ok ? (r.json() as Promise<{ results: Result[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((lib) => setResults(lib.results.filter((r) => r.inGallery).sort((a, b) => (b.addedToGalleryAt ?? 0) - (a.addedToGalleryAt ?? 0))))
      .catch(() => { setResults([]); setError('โหลดรูปไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง'); });
  }, []);
  useEffect(() => {
    if (!infoSrc) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setInfoSrc(null); }; // open dialogs handle their own Esc
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [infoSrc]);

  const info = results?.find((r) => r.src === infoSrc) ?? null; // live entry: ♡ changes show in the panel, deleted = closed
  const pick = (f: Filter, fav: boolean) => (results ?? []).filter((r) => (f === 'all' || pageOf(r) === f) && (!fav || r.favorite));
  const shown = pick(filter, favOnly);
  const modelLink = <Link href="/">นางแบบ</Link>, productLink = <Link href="/product">สินค้า</Link>;

  // ♡ shown at once, put back if saving fails (meta.favorite, /api/update)
  async function toggleFav(r: Result) {
    const set = (favorite: boolean) => setResults((list) => list && list.map((x) => (x.src === r.src ? { ...x, favorite } : x)));
    set(!r.favorite);
    try {
      await api('/api/update', { src: r.src, favorite: !r.favorite });
      setError('');
    } catch (err) {
      set(Boolean(r.favorite));
      setError('บันทึกรูปที่ชอบไม่สำเร็จ: ' + (err as Error).message);
    }
  }

  const favButton = (r: Result) => (
    <button type="button" className={'gallery-fav' + (r.favorite ? ' on' : '')} aria-pressed={Boolean(r.favorite)}
      title={r.favorite ? 'เอาออกจากที่ชอบ' : 'เพิ่มในที่ชอบ'} aria-label="ที่ชอบ"
      onClick={() => void toggleFav(r)}><IconHeart filled={r.favorite} /></button>
  );

  // permanent = what RemoveImageDialog showed (not in history); the server answers 409 if its flags disagree
  async function removeFromGallery(r: Result) {
    const permanent = r.inHistory === false;
    try {
      await api('/api/delete', { src: r.src, from: 'gallery', permanent });
    } catch (err) {
      return setError((permanent ? 'ลบไม่สำเร็จ: ' : 'เอาออกจากแกลลอรี่ไม่สำเร็จ: ') + (err as Error).message);
    }
    setError('');
    setResults((list) => list && list.filter((x) => x.src !== r.src));
  }

  // studio pages list history only (?image= looks there): put it back there first
  async function openInStudio(r: Result) {
    if (r.inHistory === false) {
      try {
        await api('/api/update', { src: r.src, inHistory: true });
      } catch (err) {
        return setError('เปิดรูปนี้ไม่สำเร็จ: ' + (err as Error).message);
      }
    }
    router.push((pageOf(r) === 'product' ? '/product' : '/') + '?image=' + encodeURIComponent(r.src));
  }

  return <div className="app gallery-page">
    <header className="topbar">
      <div className="brand">SnapAds <span className="beta">Beta</span></div>
      <PageSwitch current="gallery" />
      <div className="status" role="status">{error}</div>
      <div className="top-actions">
        <GalleryLink active />
        <TokenUsage />
        <SignOutButton />
      </div>
    </header>
    <div className={'workspace gallery-workspace' + (info ? ' editing' : '')}>
    <main className="gallery-main">
      {/* same two-group filter row as the audit page */}
      <nav className="audit-filters" aria-label="กรองรูป">
        <div className="chips">{FILTERS.map((f) => (
          <button key={f.id} type="button" className={'chip' + (filter === f.id ? ' active' : '')} aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}>{f.label}{results && ` ${pick(f.id, favOnly).length}`}</button>
        ))}</div>
        <label className="check gallery-fav-filter">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
          <IconHeart filled />เฉพาะที่ชอบ{results && ` (${pick(filter, true).length})`}
        </label>
      </nav>
      {results === null
        ? <p className="gallery-empty">กำลังโหลดรูป...</p>
        : !shown.length
          ? <p className="gallery-empty">{favOnly ? <>ยังไม่มีรูปที่ชอบ · กด <IconHeart /> ที่มุมรูปในแกลลอรี่</>
            : <>ยังไม่มีรูปในแกลลอรี่ · กด <IconBookmark /> บนรูปที่สร้างแล้วในหน้า {filter === 'model' ? modelLink : filter === 'product' ? productLink : <>{modelLink} หรือ {productLink}</>} เพื่อเก็บไว้ที่นี่</>}</p>
          : <div className="gallery-grid">
            {shown.map((r) => (
              <div className="deletable" key={r.src}>
                <button type="button" className="gallery-card" title={r.caption} onClick={() => setOpen(r)}>
                  <span className="gallery-thumb"><img src={thumbSrc(r.src)} alt={r.caption ?? 'รูปที่สร้าง'} loading="lazy" /></span>
                  <span className="gallery-info"><b>{pageName(r)}</b>{when(r.created)}</span>
                </button>
                {favButton(r)}
                <button type="button" className="gallery-info-btn" title="ข้อมูลรูปนี้" aria-label="ข้อมูลรูปนี้" aria-pressed={infoSrc === r.src}
                  onClick={() => setInfoSrc(r.src)}><IconInfo /></button>
                <DeleteButton onClick={() => setRemoving(r)}><IconTrash /></DeleteButton>
              </div>
            ))}
          </div>}
    </main>
    {/* same panel as แต่งรูป (TryOn edit-panel): slides in from the right */}
    <aside className="panel edit-panel" aria-label="ข้อมูลรูป" inert={!info}>
      <div className="panel-head">
        <h2>ข้อมูลรูป</h2>
        {info && <>
          <button type="button" className="edit-close gallery-edit" title={`เปิดในหน้า${pageName(info)}`} aria-label={`เปิดในหน้า${pageName(info)}`}
            onClick={() => void openInStudio(info)}><IconEdit /></button>
          {favButton(info)}
        </>}
        <button type="button" className="edit-close" aria-label="ปิดแผงข้อมูลรูป" onClick={() => setInfoSrc(null)}>✕</button>
      </div>
      {info && <>
        <button type="button" className="gallery-panel-img" title="ดูรูปเต็ม" onClick={() => setOpen(info)}>
          <img src={thumbSrc(info.src)} alt={info.caption ?? 'รูปที่สร้าง'} />
        </button>
        <dl className="audit-facts">
          <dt>หน้า</dt><dd>{pageName(info)}</dd>
          <dt>สร้างเมื่อ</dt><dd>{when(info.created)}</dd>
          {(info.editedFrom || info.refinedFrom) && <><dt>แก้ด้วย</dt><dd>{info.editedFrom ? 'แก้เฉพาะจุด' : 'ปรับผิวสมจริง'}</dd></>}
          {info.caption && <><dt>ตั้งค่า</dt><dd>{info.caption.split(' · ').join('\n')}</dd></>}
          {(info.stylePlan ?? info.posePlan) && <><dt>AI คิดให้</dt><dd>{(info.stylePlan ?? info.posePlan)!.th}</dd></>}
        </dl>
        {inputsOf(info).length > 0 ? <section className="audit-section">
          <h3>รูปที่ใช้สร้าง</h3>
          <div className="audit-inputs">{inputsOf(info).map((i) => <figure key={i.label + i.src}>
            {gone.has(i.src) ? <div className="audit-noimg">ถูกลบแล้ว</div>
              : <img src={thumbSrc(i.src)} alt={i.label} loading="lazy" onError={() => setGone((g) => new Set(g).add(i.src))} />}
            <figcaption>{i.label}</figcaption>
          </figure>)}</div>
        </section> : !info.recipe && <p className="muted-text">รูปนี้สร้างก่อนมีการเก็บการตั้งค่า</p>}
        {showRaw && <details className="audit-raw"><summary>ข้อมูลทั้งหมด (JSON)</summary><pre>{JSON.stringify(info, null, 2)}</pre></details>}
      </>}
    </aside>
    </div>
    {removing && <RemoveImageDialog from="gallery" inOtherPlace={removing.inHistory !== false} pageName={pageName(removing)}
      onCancel={() => setRemoving(null)}
      onConfirm={() => { setRemoving(null); void removeFromGallery(removing); }} />}
    {open && <ImageViewer key={open.src} src={open.src} alt={open.caption ?? 'รูปที่สร้าง'} onClose={() => setOpen(null)} />}
  </div>;
}
