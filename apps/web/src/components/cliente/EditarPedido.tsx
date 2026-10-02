'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { cleanDescricao } from '@/lib/utils';

interface Veiculo { id: string; fipe_marca: string; fipe_modelo: string; fipe_ano: string; placa?: string | null }

// Marcas internas do inicio da descricao ([TIPO:...]) ficam ao editar o texto
const marcas = (d?: string | null) => ((d || '').match(/^(\s*\[[A-Z]+:[^\]]+\]\s*)+/) || [''])[0];

// Completar/editar o pedido depois de criado: dados do carro (o acidente pode
// ter sido registrado sem eles) e a descricao. O carro fica nos veiculos dele.
export default function EditarPedido({ solicitacaoId, descricao, veiculo, aoSalvar }: {
  solicitacaoId: string;
  descricao: string | null;
  veiculo: Veiculo | null;
  aoSalvar: () => void;
}) {
  const t = useTranslations('editarPedido');
  const incompleto = !veiculo?.fipe_marca;
  const [aberto, setAberto] = useState(false);
  const [marca, setMarca] = useState(veiculo?.fipe_marca || '');
  const [modelo, setModelo] = useState(veiculo?.fipe_modelo || '');
  const [ano, setAno] = useState(veiculo?.fipe_ano && veiculo.fipe_ano !== '-' ? veiculo.fipe_ano : '');
  const [placa, setPlaca] = useState(veiculo?.placa || '');
  const [texto, setTexto] = useState(cleanDescricao(descricao));
  const [estado, setEstado] = useState<'' | 'salvando' | 'erro'>('');

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado('salvando');
    if (veiculo) {
      const { error } = await supabase.from('veiculos').update({
        fipe_marca: marca.trim(), fipe_modelo: modelo.trim(), fipe_ano: ano.trim() || '-', placa: placa.trim() || null,
      }).eq('id', veiculo.id);
      if (error) { setEstado('erro'); return; }
    }
    const { error } = await supabase.from('solicitacoes')
      .update({ descricao: `${marcas(descricao)}${texto.trim()}`.trim() }).eq('id', solicitacaoId);
    if (error) { setEstado('erro'); return; }
    setEstado('');
    setAberto(false);
    aoSalvar();
  };

  if (!aberto) {
    return incompleto ? (
      <button type="button" onClick={() => setAberto(true)} className="w-full text-left bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <span className="block font-medium text-amber-900">{t('completarCarro')}</span>
        <span className="block text-sm text-amber-800 mt-0.5">{t('completarCarroDica')}</span>
      </button>
    ) : (
      <button type="button" onClick={() => setAberto(true)} className="text-sm font-medium text-primary-700 py-2 mb-4">
        {t('editar')}
      </button>
    );
  }

  return (
    <form onSubmit={salvar} className="card mb-6 space-y-3">
      <h2 className="font-semibold text-gray-900">{t('editar')}</h2>
      {veiculo && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ep-marca" className="block text-sm font-medium text-gray-700 mb-1">{t('marca')}</label>
            <input id="ep-marca" className="input-field" value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={60} />
          </div>
          <div>
            <label htmlFor="ep-modelo" className="block text-sm font-medium text-gray-700 mb-1">{t('modelo')}</label>
            <input id="ep-modelo" className="input-field" value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label htmlFor="ep-ano" className="block text-sm font-medium text-gray-700 mb-1">{t('ano')}</label>
            <input id="ep-ano" className="input-field" inputMode="numeric" value={ano} onChange={(e) => setAno(e.target.value)} maxLength={4} />
          </div>
          <div>
            <label htmlFor="ep-placa" className="block text-sm font-medium text-gray-700 mb-1">{t('placa')}</label>
            <input id="ep-placa" className="input-field uppercase" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} maxLength={15} />
          </div>
        </div>
      )}
      <div>
        <label htmlFor="ep-desc" className="block text-sm font-medium text-gray-700 mb-1">{t('descricao')}</label>
        <textarea id="ep-desc" className="input-field min-h-[90px]" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} />
      </div>
      {estado === 'erro' && <p className="text-sm text-red-700" role="alert">{t('erro')}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAberto(false)} className="btn-secondary">{t('cancelar')}</button>
        <button type="submit" disabled={estado === 'salvando'} className="btn-primary">{t('salvar')}</button>
      </div>
    </form>
  );
}
