import AdminPage from '@/components/AdminPage';

export const metadata = { title: 'แอดมิน — SnapAds' };

// เฉพาะ superadmin: proxy.ts ส่งคนอื่นกลับหน้าแรก และ app/api/admin เช็กซ้ำ
export default function Page() {
  return <AdminPage />;
}
