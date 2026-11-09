'use client';
// /gallery: all results (page model + product), newest first
// raw stored file; lib/film.ts finish not applied
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SignOutButton } from './AuthForm';
import ImageViewer from './ImageViewer';
import { api } from '@/lib/browser';
import { ConfirmDialog, DeleteButton, GalleryLink, PageSwitch, TokenUsage } from './ui';

type Result = { src: string; created: number; caption?: string; page?: 'product' };
type Filter = 'all' | 'model' | 'product';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'ทั้งหมด' }, { id: 'model', label: 'นางแบบ' }, { id: 'product', label: 'สินค้า' }];
const pageOf = (r: Result): Exclude<Filter, 'all'> => (r.page === 'product' ? 'product' : 'model');
const thumb = (src: string) => (src.startsWith('/api/files/') ? `${src}?w=800` : src); // ?w=800 -> 800px JPEG, ~300px card at 2x
const when = (sec: number) => new Date(sec * 1000).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

export default function Gallery() {
  const [results, setResults] = useState<Result[] | null>(null); // null = loading
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Result | null>(null);
  const [deleting, setDeleting] = useState<Result | null>(null); // pending ConfirmDialog

  useEffect(() => {
    fetch('/api/library?only=results')
      .then((r) => (r.ok ? (r.json() as Promise<{ results: Result[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((lib) => setResults([...lib.results].sort((a, b) => b.created - a.created)))
      .catch(() => { setResults([]); setError('โหลดรูปไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง'); });
  }, []);

  const count = (f: Filter) => (results ?? []).filter((r) => f === 'all' || pageOf(r) === f).length;
  const shown = (results ?? []).filter((r) => filter === 'all' || pageOf(r) === filter);
  const modelLink = <Link href="/">นางแบบ</Link>, productLink = <Link href="/product">สินค้า</Link>;

  // /api/delete moves the file to trash
  async function remove(r: Result) {
    try {
      await api('/api/delete', { src: r.src });
    } catch (err) {
      return setError('ลบไม่สำเร็จ: ' + (err as Error).message);
    }
    setError('');
    setResults((list) => list && list.filter((x) => x.src !== r.src));
  }

  return <div className="gallery-page">
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
    <main className="gallery-main">
      <nav className="chips" aria-label="กรองรูป">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={'chip' + (filter === f.id ? ' active' : '')} aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}>{f.label}{results && ` ${count(f.id)}`}</button>
        ))}
      </nav>
      {results === null
        ? <p className="gallery-empty">กำลังโหลดรูป...</p>
        : !shown.length
          ? <p className="gallery-empty">ยังไม่มีรูป · สร้างรูปได้ที่หน้า {filter === 'model' ? modelLink : filter === 'product' ? productLink : <>{modelLink} หรือ {productLink}</>}</p>
          : <div className="gallery-grid">
            {shown.map((r) => (
              <div className="deletable" key={r.src}>
                <button type="button" className="gallery-card" title={r.caption} onClick={() => setOpen(r)}>
                  <span className="gallery-thumb"><img src={thumb(r.src)} alt={r.caption ?? 'รูปที่สร้าง'} loading="lazy" /></span>
                  <span className="gallery-info"><b>{pageOf(r) === 'product' ? 'สินค้า' : 'นางแบบ'}</b>{when(r.created)}</span>
                </button>
                <DeleteButton onClick={() => setDeleting(r)} />
              </div>
            ))}
          </div>}
    </main>
    {deleting && <ConfirmDialog title="ลบรูปนี้?" body="รูปจะถูกย้ายไปถังขยะ" cancel="ยกเลิก" confirm="ลบ"
      onCancel={() => setDeleting(null)}
      onConfirm={() => { setDeleting(null); void remove(deleting); }} />}
    {open && <ImageViewer key={open.src} src={open.src} alt={open.caption ?? 'รูปที่สร้าง'} onClose={() => setOpen(null)} />}
  </div>;
}
