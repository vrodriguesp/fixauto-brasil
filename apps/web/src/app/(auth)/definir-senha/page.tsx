'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export default function DefinirSenhaPage() {
  const router = useRouter();
  const { user, funcionario, refreshProfile } = useAuth();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (novaSenha.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);

    // Update password via Supabase auth
    const { error: authError } = await supabase.auth.updateUser({
      password: novaSenha,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Mark primeiro_login as false (funcionario)
    if (funcionario) {
      await fetch('/api/funcionarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: funcionario.id, primeiro_login: false }),
      });
    }

    // Clear primeiro_login from user_metadata (auto-created accounts)
    await supabase.auth.updateUser({
      data: { primeiro_login: false },
    });

    await refreshProfile();
    setLoading(false);

    // Redirect based on user type
    const tipo = user?.tipo;
    if (tipo === 'oficina' && funcionario) {
      router.replace('/oficina/veiculos-em-servico');
    } else if (tipo === 'oficina') {
      router.replace('/oficina/dashboard');
    } else {
      router.replace('/cliente/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-emerald-600 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">BF</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Defina sua senha</h1>
          <p className="text-gray-600 mt-2">
            Bem-vindo ao BipFix! Escolha uma nova senha para sua conta.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <input
              type="password"
              className="input-field"
              placeholder="Mínimo 6 caracteres"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
            <input
              type="password"
              className="input-field"
              placeholder="Repita a senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !novaSenha || !confirmarSenha}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Definir senha e entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
