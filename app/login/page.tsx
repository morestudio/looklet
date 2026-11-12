import { LoginForm } from '@/components/AuthForm';

export const metadata = { title: 'เข้าสู่ระบบ — Lolo' };

export default function Page() {
  return <main className="auth-page"><LoginForm /></main>;
}
