import { SignupForm } from '@/components/AuthForm';

export const metadata = { title: 'สมัครใช้งาน — Lolo' };

export default function Page() {
  return (
    <main className="auth-page">
      <SignupForm />
    </main>
  );
}
