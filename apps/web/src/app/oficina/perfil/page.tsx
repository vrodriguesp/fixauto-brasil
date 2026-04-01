'use client';

import { useAuth } from '@/lib/auth-context';
import { TIPOS_SERVICO, ESTADOS_BRASIL } from '@fixauto/shared';

export default function PerfilOficinaPage() {
  const { user, oficina } = useAuth();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Perfil da Oficina</h1>

      {/* Workshop info */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados da oficina</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome fantasia</label>
            <input type="text" className="input-field" defaultValue={oficina?.nome_fantasia || ''} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
            <input type="text" className="input-field" defaultValue={oficina?.cnpj || ''} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereco</label>
            <input type="text" className="input-field" defaultValue={oficina?.endereco || ''} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input type="text" className="input-field" defaultValue={oficina?.cidade || ''} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select className="input-field" defaultValue={oficina?.estado || ''}>
                {ESTADOS_BRASIL.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
              <input type="text" className="input-field" defaultValue={oficina?.cep || ''} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Raio de atendimento (km)
            </label>
            <input type="number" className="input-field" defaultValue={oficina?.raio_atendimento_km || 30} />
          </div>
        </div>
      </div>

      {/* Specialties */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Especialidades</h2>
        <div className="grid grid-cols-2 gap-3">
          {TIPOS_SERVICO.map((t) => {
            const isSelected = oficina?.especialidades?.includes(t.value) || false;
            return (
              <label
                key={t.value}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  defaultChecked={isSelected}
                  className="w-4 h-4 text-primary-600 rounded"
                />
                <span className="text-lg">{t.icon}</span>
                <span className="text-sm font-medium text-gray-900">{t.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Personal info */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados pessoais</h2>
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
      </div>

      <div className="flex justify-end">
        <button className="btn-primary">Salvar Alteracoes</button>
      </div>
    </div>
  );
}
