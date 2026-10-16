import { ChangePasswordForm } from '@/components/AuthForm';

export const metadata = { title: 'เปลี่ยนรหัสผ่าน — ห้องลองชุด AI' };

export default function Page() {
  return <main className="auth-page"><ChangePasswordForm /></main>;
}
