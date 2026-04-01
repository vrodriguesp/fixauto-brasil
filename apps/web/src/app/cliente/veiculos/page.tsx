'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase';
import { mockVeiculos } from '@/lib/mock-data';
import { useVeiculos } from '@/hooks/use-veiculos';
import type { Veiculo } from '@fixauto/shared';
import FipeAutocomplete from '@/components/forms/FipeAutocomplete';

export default function VeiculosPageWrapper() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-8"><p>Carregando...</p></div>}>
      <VeiculosPage />
    </Suspense>
  );
}

function VeiculosPage() {
  const searchParams = useSearchParams();
  const autoOpen = searchParams.get('add') === 'true';
  const hook = useVeiculos();
  const [localVeiculos, setLocalVeiculos] = useState<Veiculo[]>(mockVeiculos);
  const veiculos = isSupabaseConfigured ? hook.veiculos : localVeiculos;
  const [showForm, setShowForm] = useState(autoOpen);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fipe_tipo: 'cars',
    fipe_marca: '',
    fipe_modelo: '',
    fipe_ano: '',
    fipe_codigo: '',
    fipe_valor: '',
    placa: '',
    cor: '',
    apelido: '',
  });

  const resetForm = () => {
    setFormData({ fipe_tipo: 'cars', fipe_marca: '', fipe_modelo: '', fipe_ano: '', fipe_codigo: '', fipe_valor: '', placa: '', cor: '', apelido: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!formData.fipe_marca || !formData.fipe_modelo || !formData.fipe_ano) return;

    if (isSupabaseConfigured) {
      if (editingId) {
        await hook.update(editingId, formData);
      } else {
        await hook.add({
          ...formData,
          fipe_codigo: formData.fipe_codigo || null,
          fipe_valor: formData.fipe_valor || null,
          placa: formData.placa || null,
          cor: formData.cor || null,
          apelido: formData.apelido || null,
        });
      }
    } else {
      if (editingId) {
        setLocalVeiculos(localVeiculos.map((v) => v.id === editingId ? { ...v, ...formData } : v));
      } else {
        const newVeiculo: Veiculo = {
          id: `v-${Date.now()}`,
          profile_id: '11111111-1111-1111-1111-111111111111',
          ...formData,
          fipe_codigo: formData.fipe_codigo || null,
          fipe_valor: formData.fipe_valor || null,
          placa: formData.placa || null,
          cor: formData.cor || null,
          apelido: formData.apelido || null,
          created_at: new Date().toISOString(),
        };
        setLocalVeiculos([...localVeiculos, newVeiculo]);
      }
    }
    resetForm();
  };

  const handleEdit = (v: Veiculo) => {
    setFormData({
      fipe_tipo: v.fipe_tipo,
      fipe_marca: v.fipe_marca,
      fipe_modelo: v.fipe_modelo,
      fipe_ano: v.fipe_ano,
      fipe_codigo: v.fipe_codigo || '',
      fipe_valor: v.fipe_valor || '',
      placa: v.placa || '',
      cor: v.cor || '',
      apelido: v.apelido || '',
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (isSupabaseConfigured) {
      await hook.remove(id);
    } else {
      setLocalVeiculos(localVeiculos.filter((v) => v.id !== id));
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Veiculos</h1>
          <p className="text-gray-600 mt-1">Gerencie os veiculos cadastrados</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary">
            + Adicionar Veiculo
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            {editingId ? 'Editar Veiculo' : 'Novo Veiculo'}
          </h2>

          <FipeAutocomplete
            value={{
              tipo: formData.fipe_tipo,
              marca: formData.fipe_marca,
              modelo: formData.fipe_modelo,
              ano: formData.fipe_ano,
            }}
            onChange={(fipe) => {
              setFormData({
                ...formData,
                fipe_tipo: fipe.tipo,
                fipe_marca: fipe.marca,
                fipe_modelo: fipe.modelo,
                fipe_ano: fipe.ano,
                fipe_codigo: fipe.codigo || '',
                fipe_valor: fipe.valor || '',
              });
            }}
          />

          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Placa (opcional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="ABC-1234"
                value={formData.placa}
                onChange={(e) => setFormData({ ...formData, placa: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor (opcional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="Prata"
                value={formData.cor}
                onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apelido (opcional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="Meu carro"
                value={formData.apelido}
                onChange={(e) => setFormData({ ...formData, apelido: e.target.value })}
              />
            </div>
          </div>

          {formData.fipe_valor && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-green-800">
                Valor FIPE: <strong>{formData.fipe_valor}</strong>
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={resetForm} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} className="btn-primary">
              {editingId ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      {/* Vehicle list */}
      <div className="space-y-4">
        {veiculos.length === 0 ? (
          <div className="card text-center py-12">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <p className="text-gray-500">Nenhum veiculo cadastrado</p>
          </div>
        ) : (
          veiculos.map((v) => (
            <div key={v.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {v.apelido && <span className="text-primary-600">{v.apelido} - </span>}
                    {v.fipe_marca} {v.fipe_modelo}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Ano: {v.fipe_ano} {v.cor && `| Cor: ${v.cor}`} {v.placa && `| Placa: ${v.placa}`}
                  </p>
                  {v.fipe_valor && (
                    <p className="text-sm text-green-600 mt-1">Valor FIPE: {v.fipe_valor}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(v)}
                    className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(v.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
