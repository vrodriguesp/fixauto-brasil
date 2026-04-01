'use client';

import { useAuth } from '@/lib/auth-context';

export default function PerfilClientePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Meu Perfil</h1>

      <div className="card">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-primary-700 font-bold text-2xl">
              {user?.nome?.charAt(0) || 'U'}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{user?.nome}</h2>
            <p className="text-gray-500">Cliente</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input type="text" className="input-field" defaultValue={user?.nome || ''} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className="input-field" defaultValue={user?.email || ''} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <input type="tel" className="input-field" defaultValue={user?.telefone || ''} />
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button className="btn-primary">Salvar Alteracoes</button>
        </div>
      </div>
    </div>
  );
}
