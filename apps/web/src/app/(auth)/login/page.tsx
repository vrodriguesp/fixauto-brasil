'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Preencha email e senha');
      return;
    }
    setError('');
    setLoading(true);

    const { error: authError } = await signIn(email, password);
    setLoading(false);

    if (authError) {
      setError(authError);
      return;
    }

    router.refresh();
    router.push('/');
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Entrar</h1>
          <p className="text-gray-600 mt-2">Acesse sua conta FixAuto</p>
        </div>

        <div className="card">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                type="password"
                className="input-field"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-6">
            Não tem conta?{' '}
            <Link href="/cadastro" className="text-primary-600 font-medium hover:text-primary-700">
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
