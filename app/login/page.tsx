import { LoginForm } from '@/components/AuthForm';

export const metadata = { title: 'เข้าสู่ระบบ — SnapAds' };

export default function Page() {
  return <main className="auth-page"><LoginForm /></main>;
}
