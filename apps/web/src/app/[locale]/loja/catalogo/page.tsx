'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import type { PecaCatalogo } from '@fixauto/shared';
import { Link } from '@/i18n/navigation';
import { usePecasV3 } from '@/hooks/use-pecas-v3';

// lote 5 de pecas (20/11, migracao 105): com a tela nova (usePecasV3: global v3 ou conta de teste) o item ganha
// codigo, especificacao, unidade, embalagem, condicao e "quem ve" (interno = so a loja; oficinas = entra no Shop
// quando o Shop for ligado). Sem a tela nova: o formulario e a lista de hoje, iguais (so o aviso de erro e novo).
type ItemV3 = PecaCatalogo & { codigo?: string | null; especificacao?: string | null; unidade?: string | null; embalagem?: string | null; condicao?: string | null; visibilidade?: string | null; oculto?: boolean | null; oculto_motivo?: string | null };
const UNIDADES = ['un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa'];
const CONDICOES = ['nova', 'usada', 'recondicionada'];
const EXTRA_VAZIO = { codigo: '', especificacao: '', unidade: 'un', embalagem: '', condicao: 'nova', visibilidade: 'interno' };

export default function LojaCatalogoPage() {
  const t = useTranslations('lojaCatalogo');
  const t5 = useTranslations('pecasL5');
  const tp = useTranslations('pecas');
  const v3 = usePecasV3();
  const [erroSalvar, setErroSalvar] = useState(false);
  const [extra, setExtra] = useState(EXTRA_VAZIO);
  const locale = useLocale();
  const { loja } = useAuth();
  const [pecas, setPecas] = useState<ItemV3[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: '', descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', preco: '', quantidade_estoque: '1',
  });

  const fetchPecas = async () => {
    if (!loja) return;
    setLoading(true);
    const { data } = await supabase
      .from('pecas_catalogo')
      .select('*')
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false });
    setPecas((data as ItemV3[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPecas(); }, [loja]);

  const handleAdd = async () => {
    if (!loja || !form.nome || !form.preco) return;
    setSaving(true);
    setErroSalvar(false);
    const { error } = await supabase.from('pecas_catalogo').insert({
      loja_id: loja.id,
      nome: form.nome,
      descricao: form.descricao || null,
      fipe_marca: form.fipe_marca || null,
      fipe_modelo: form.fipe_modelo || null,
      fipe_ano: form.fipe_ano || null,
      preco: parseFloat(form.preco),
      quantidade_estoque: parseInt(form.quantidade_estoque) || 0,
      ...(v3 ? { codigo: extra.codigo.trim() || null, especificacao: extra.especificacao.trim() || null, unidade: extra.unidade, embalagem: extra.embalagem.trim() || null, condicao: extra.condicao, visibilidade: extra.visibilidade } : {}),
    });
    // recusado pelo banco (preco 0, texto longo demais - CHECK da 105): o formulario fica aberto com o aviso
    if (error) { setErroSalvar(true); setSaving(false); return; }
    setExtra(EXTRA_VAZIO);
    setForm({ nome: '', descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', preco: '', quantidade_estoque: '1' });
    setShowForm(false);
    setSaving(false);
    await fetchPecas();
  };

  const handleToggleAtivo = async (peca: PecaCatalogo) => {
    await supabase.from('pecas_catalogo').update({ ativo: !peca.ativo }).eq('id', peca.id);
    await fetchPecas();
  };

  const mudarVisibilidade = async (peca: ItemV3) => {
    await supabase.from('pecas_catalogo').update({ visibilidade: peca.visibilidade === 'interno' ? 'oficinas' : 'interno' }).eq('id', peca.id);
    await fetchPecas();
  };

  const handleDelete = async (peca: PecaCatalogo) => {
    if (!confirm(t('confirmRemove', { nome: peca.nome }))) return;
    await supabase.from('pecas_catalogo').delete().eq('id', peca.id);
    await fetchPecas();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('pageTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('pageSubtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {v3 && <Link href="/loja/promocoes" data-testid="link-promocoes" className="btn-secondary">{t5('promocoesTitulo')}</Link>}
          <button onClick={() => setShowForm(true)} className="btn-primary">{t('addButton')}</button>
        </div>
      </div>
      {v3 && <p className="text-sm text-gray-600 mb-6" data-testid="catalogo-v3-aviso">{t5('catalogoAviso')}</p>}

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">{t('formTitle')}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="c50c4-1" className="block text-sm font-medium text-gray-700 mb-1">{t('labelNome')}</label>
              <input id="c50c4-1" type="text" className="input-field" placeholder={t('placeholderNome')} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="c50c4-2" className="block text-sm font-medium text-gray-700 mb-1">{t('labelDescricao')}</label>
              <input id="c50c4-2" type="text" className="input-field" placeholder={t('placeholderDescricao')} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c50c4-3" className="block text-sm font-medium text-gray-700 mb-1">{t('labelMarca')}</label>
              <input id="c50c4-3" type="text" className="input-field" placeholder={t('placeholderMarca')} value={form.fipe_marca} onChange={(e) => setForm({ ...form, fipe_marca: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c50c4-4" className="block text-sm font-medium text-gray-700 mb-1">{t('labelModelo')}</label>
              <input id="c50c4-4" type="text" className="input-field" placeholder={t('placeholderModelo')} value={form.fipe_modelo} onChange={(e) => setForm({ ...form, fipe_modelo: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c50c4-5" className="block text-sm font-medium text-gray-700 mb-1">{t('labelAno')}</label>
              <input id="c50c4-5" type="text" className="input-field" placeholder={t('placeholderAno')} value={form.fipe_ano} onChange={(e) => setForm({ ...form, fipe_ano: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c50c4-6" className="block text-sm font-medium text-gray-700 mb-1">{t('labelPreco')}</label>
              <input id="c50c4-6" type="number" step="0.01" className="input-field" placeholder={t('placeholderPreco')} value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c50c4-7" className="block text-sm font-medium text-gray-700 mb-1">{t('labelQuantidade')}</label>
              <input id="c50c4-7" type="number" className="input-field" value={form.quantidade_estoque} onChange={(e) => setForm({ ...form, quantidade_estoque: e.target.value })} />
            </div>
          </div>
          {v3 && (
            <div className="grid sm:grid-cols-2 gap-4 mt-4" data-testid="catalogo-campos-v3">
              <div>
                <label htmlFor="p5c-codigo" className="block text-sm font-medium text-gray-700 mb-1">{t5('codigo')}</label>
                <input id="p5c-codigo" data-testid="catalogo-codigo" type="text" maxLength={60} className="input-field" value={extra.codigo} onChange={(e) => setExtra({ ...extra, codigo: e.target.value })} />
              </div>
              <div>
                <label htmlFor="p5c-espec" className="block text-sm font-medium text-gray-700 mb-1">{t5('especificacao')}</label>
                <input id="p5c-espec" data-testid="catalogo-especificacao" type="text" maxLength={200} className="input-field" value={extra.especificacao} onChange={(e) => setExtra({ ...extra, especificacao: e.target.value })} />
              </div>
              <div>
                <label htmlFor="p5c-unidade" className="block text-sm font-medium text-gray-700 mb-1">{tp('unidade')}</label>
                <select id="p5c-unidade" data-testid="catalogo-unidade" className="input-field" value={extra.unidade} onChange={(e) => setExtra({ ...extra, unidade: e.target.value })}>
                  {UNIDADES.map((u) => <option key={u} value={u}>{tp(`unidadesNome.${u}`)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="p5c-embalagem" className="block text-sm font-medium text-gray-700 mb-1">{t5('embalagem')}</label>
                <input id="p5c-embalagem" data-testid="catalogo-embalagem" type="text" maxLength={40} className="input-field" placeholder={t5('embalagemExemplo')} value={extra.embalagem} onChange={(e) => setExtra({ ...extra, embalagem: e.target.value })} />
              </div>
              <div>
                <label htmlFor="p5c-condicao" className="block text-sm font-medium text-gray-700 mb-1">{t5('condicaoRotulo')}</label>
                <select id="p5c-condicao" data-testid="catalogo-condicao" className="input-field" value={extra.condicao} onChange={(e) => setExtra({ ...extra, condicao: e.target.value })}>
                  {CONDICOES.map((c) => <option key={c} value={c}>{t5(`condicao.${c}`)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="p5c-vis" className="block text-sm font-medium text-gray-700 mb-1">{t5('quemVe')}</label>
                <select id="p5c-vis" data-testid="catalogo-visibilidade" className="input-field" value={extra.visibilidade} onChange={(e) => setExtra({ ...extra, visibilidade: e.target.value })}>
                  <option value="interno">{t5('visibilidade.interno')}</option>
                  <option value="oficinas">{t5('visibilidade.oficinas')}</option>
                </select>
              </div>
            </div>
          )}
          {erroSalvar && <p role="alert" data-testid="catalogo-erro" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{t5('erroSalvarItem')}</p>}
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t('cancelButton')}</button>
            <button onClick={handleAdd} disabled={saving || !form.nome || !form.preco} className="btn-primary disabled:opacity-50">
              {saving ? t('savingButton') : t('addConfirmButton')}
            </button>
          </div>
        </div>
      )}

      {pecas.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">{t('emptyState')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pecas.map((peca) => (
            <div key={peca.id} className={`card flex items-center justify-between gap-4 ${!peca.ativo ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{peca.nome}</p>
                {(peca.fipe_marca || peca.fipe_modelo) && (
                  <p className="text-sm text-gray-500">{peca.fipe_marca} {peca.fipe_modelo} {peca.fipe_ano}</p>
                )}
                <p className="text-sm text-gray-600 mt-1">{t('estoqueInfo', { preco: formatCurrency(peca.preco, currencyForCountry(loja?.pais), locale), quantidade: peca.quantidade_estoque })}</p>
                {v3 && (
                  <p className="text-xs text-gray-500 mt-1" data-testid="catalogo-item-v3">
                    {[peca.codigo, peca.especificacao, peca.embalagem, peca.condicao ? t5(`condicao.${peca.condicao}`) : null, tp(`unidades.${UNIDADES.includes(String(peca.unidade)) ? peca.unidade : 'un'}`)].filter(Boolean).join(' · ')}
                    {' · '}<span data-testid="catalogo-item-visibilidade">{t5(`visibilidade.${peca.visibilidade === 'oficinas' || peca.visibilidade === 'publico' ? 'oficinas' : 'interno'}`)}</span>
                  </p>
                )}
                {v3 && peca.oculto && <p className="text-xs text-red-700 mt-1" data-testid="catalogo-item-oculto">{t5('ocultoPeloAdmin', { motivo: peca.oculto_motivo || '-' })}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {v3 && (
                  <button onClick={() => mudarVisibilidade(peca)} data-testid="catalogo-mudar-visibilidade" className="px-3 py-1 text-xs rounded-lg font-medium bg-blue-50 text-blue-800">
                    {peca.visibilidade === 'interno' ? t5('mostrarOficinas') : t5('soEu')}
                  </button>
                )}
                <button onClick={() => handleToggleAtivo(peca)} className={`px-3 py-1 text-xs rounded-lg font-medium ${peca.ativo ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                  {peca.ativo ? t('desativarButton') : t('ativarButton')}
                </button>
                <button onClick={() => handleDelete(peca)} className="p-1 text-gray-400 hover:text-red-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
