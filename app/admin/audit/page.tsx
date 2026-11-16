import AuditPage from '@/components/AuditPage';

export const metadata = { title: 'ตรวจงาน — Lolo' };

// เฉพาะ superadmin: proxy.ts ส่งคนอื่นกลับหน้าแรก และ app/api/admin/audit เช็กซ้ำ
export default function Page() {
  return <AuditPage />;
}
