'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';

// Pecas lote 5 (20/11, migracao 105): promocoes da loja para o Shop das oficinas (D-11: sem limite de produto,
// 3 em destaque, ate 30 dias; P-14 teto tecnico de 50 ativas - os gatilhos do banco garantem). Visibilidade
// "oficinas" (promocao publica fica fora do lote 5). A loja grava pela RLS (so a propria, ativa).

type Promo = { id: string; titulo: string; descricao: string | null; preco: number; unidade: string; preco_anterior: number | null; destaque: boolean; valido_de: string; valido_ate: string; oculta: boolean; oculta_motivo: string | null; item_id: string | null };
const UNIDADES = ['un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa'];
const dataMais = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
const VAZIO = { titulo: '', descricao: '', preco: '', unidade: 'un', preco_anterior: '', destaque: false, ate: dataMais(30), item_id: '' };

export default function PromocoesLoja() {
  const t = useTranslations('pecasL5');
  const tp = useTranslations('pecas');
  const locale = useLocale();
  const { loja } = useAuth();
  const moeda = currencyForCountry(loja?.pais || 'EE');
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [itens, setItens] = useState<{ id: string; nome: string; preco: number; unidade: string | null }[]>([]);
  const [form, setForm] = useState(VAZIO);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    if (!loja) return;
    const [{ data: ps }, { data: is }] = await Promise.all([
      supabase.from('promocoes_pecas').select('id, titulo, descricao, preco, unidade, preco_anterior, destaque, valido_de, valido_ate, oculta, oculta_motivo, item_id').eq('loja_id', loja.id).order('created_at', { ascending: false }),
      supabase.from('pecas_catalogo').select('id, nome, preco, unidade').eq('loja_id', loja.id).eq('ativo', true).order('nome'),
    ]);
    setPromos((ps as Promo[]) || []);
    setItens((is as any[]) || []);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loja]);

  const agora = Date.now();
  const ativas = (promos || []).filter((p) => !p.oculta && Date.parse(p.valido_ate) > agora);
  const destaques = ativas.filter((p) => p.destaque).length;

  const codigoErro = (msg: string | undefined) => (/50/.test(msg || '') ? 'limite' : /destaque/.test(msg || '') ? 'destaques' : 'geral');

  const salvar = async () => {
    if (!loja) return;
    const preco = Number(form.preco.replace(',', '.'));
    const anterior = form.preco_anterior.trim() ? Number(form.preco_anterior.replace(',', '.')) : null;
    const ate = new Date(`${form.ate}T23:59:00`);
    const max = Date.now() + 30 * 86400000;
    if (!form.titulo.trim() || !(preco > 0) || (anterior !== null && !(anterior > preco)) || !(ate.getTime() > Date.now()) || ate.getTime() > max) { setErro('dados'); return; }
    setSalvando(true); setErro(null);
    const { error } = await supabase.from('promocoes_pecas').insert({
      loja_id: loja.id, titulo: form.titulo.trim(), descricao: form.descricao.trim() || null, preco, unidade: form.unidade,
      preco_anterior: anterior, destaque: form.destaque, valido_de: new Date().toISOString(), valido_ate: ate.toISOString(),
      item_id: form.item_id || null, visibilidade: 'oficinas',
    });
    setSalvando(false);
    if (error) { setErro(codigoErro(error.message)); return; }
    setForm({ ...VAZIO, ate: dataMais(30) }); setAberto(false);
    await carregar();
  };

  const alternarDestaque = async (p: Promo) => {
    setErro(null);
    const { error } = await supabase.from('promocoes_pecas').update({ destaque: !p.destaque }).eq('id', p.id);
    if (error) setErro(codigoErro(error.message));
    await carregar();
  };
  const encerrar = async (p: Promo) => {
    await supabase.from('promocoes_pecas').update({ valido_ate: new Date().toISOString() }).eq('id', p.id);
    await carregar();
  };
  const apagar = async (p: Promo) => {
    if (!confirm(t('confirmarApagar', { titulo: p.titulo }))) return;
    await supabase.from('promocoes_pecas').delete().eq('id', p.id);
    await carregar();
  };
  const usarItem = (id: string) => {
    const it = itens.find((i) => i.id === id);
    setForm((f) => ({ ...f, item_id: id, titulo: it && !f.titulo ? it.nome : f.titulo, unidade: it?.unidade || f.unidade, preco_anterior: it && !f.preco_anterior ? String(it.preco) : f.preco_anterior }));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{t('promocoesTitulo')}</h1>
          <p className="text-gray-600 mt-1">{t('promocoesSubtitulo')}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/loja/catalogo" className="btn-secondary text-sm">{t('voltarCatalogo')}</Link>
          <button type="button" data-testid="promo-nova" onClick={() => { setAberto(true); setErro(null); }} className="btn-primary text-sm">{t('novaPromocao')}</button>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-6" data-testid="promo-contador">{t('contadorPromocoes', { ativas: ativas.length, max: 50, destaques, maxDestaques: 3 })}</p>

      {erro && <p role="alert" data-testid="promo-erro" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{t(`erroPromo.${erro}`)}</p>}

      {aberto && (
        <div className="card mb-6" data-testid="promo-form">
          <div className="grid sm:grid-cols-2 gap-4">
            {itens.length > 0 && (
              <div className="sm:col-span-2">
                <label htmlFor="p5p-item" className="block text-sm font-medium text-gray-700 mb-1">{t('itemDoCatalogo')}</label>
                <select id="p5p-item" data-testid="promo-item" className="input-field" value={form.item_id} onChange={(e) => usarItem(e.target.value)}>
                  <option value="">{t('semItem')}</option>
                  {itens.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="p5p-titulo" className="block text-sm font-medium text-gray-700 mb-1">{t('tituloPromo')}</label>
              <input id="p5p-titulo" data-testid="promo-titulo" className="input-field" maxLength={120} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="p5p-desc" className="block text-sm font-medium text-gray-700 mb-1">{t('descricaoPromo')}</label>
              <textarea id="p5p-desc" data-testid="promo-descricao" className="input-field" rows={2} maxLength={600} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div>
              <label htmlFor="p5p-preco" className="block text-sm font-medium text-gray-700 mb-1">{t('precoPromo')}</label>
              <input id="p5p-preco" data-testid="promo-preco" inputMode="decimal" className="input-field" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} />
            </div>
            <div>
              <label htmlFor="p5p-unidade" className="block text-sm font-medium text-gray-700 mb-1">{tp('unidade')}</label>
              <select id="p5p-unidade" data-testid="promo-unidade" className="input-field" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })}>
                {UNIDADES.map((u) => <option key={u} value={u}>{tp(`unidadesNome.${u}`)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="p5p-anterior" className="block text-sm font-medium text-gray-700 mb-1">{t('precoAnterior')}</label>
              <input id="p5p-anterior" data-testid="promo-preco-anterior" inputMode="decimal" className="input-field" value={form.preco_anterior} onChange={(e) => setForm({ ...form, preco_anterior: e.target.value })} />
            </div>
            <div>
              <label htmlFor="p5p-ate" className="block text-sm font-medium text-gray-700 mb-1">{t('validaAteRotulo')}</label>
              <input id="p5p-ate" data-testid="promo-ate" type="date" className="input-field" min={dataMais(0)} max={dataMais(30)} value={form.ate} onChange={(e) => setForm({ ...form, ate: e.target.value })} />
            </div>
            <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" data-testid="promo-destaque" checked={form.destaque} onChange={(e) => setForm({ ...form, destaque: e.target.checked })} />
              {t('destacar')}
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-3">{t('promoRegras')}</p>
          <div className="flex justify-end gap-3 mt-4">
            <button type="button" className="btn-secondary" onClick={() => setAberto(false)}>{t('cancelar')}</button>
            <button type="button" data-testid="promo-salvar" className="btn-primary disabled:opacity-50" disabled={salvando} onClick={salvar}>{salvando ? t('enviando') : t('salvarPromo')}</button>
          </div>
        </div>
      )}

      {promos === null ? (
        <div className="animate-pulse h-32 bg-gray-200 rounded-xl" />
      ) : promos.length === 0 ? (
        <div className="card text-center py-10 text-gray-500" data-testid="promo-vazio">{t('semPromocoes')}</div>
      ) : (
        <ul className="space-y-3">
          {promos.map((p) => {
            const ativa = !p.oculta && Date.parse(p.valido_ate) > agora;
            return (
              <li key={p.id} data-testid="promo-linha" data-id={p.id} className={`card flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${ativa ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 break-words">
                    {p.destaque && ativa && <span data-testid="promo-selo-destaque" className="mr-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 align-middle">{t('destaque')}</span>}
                    {p.titulo}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatCurrency(Number(p.preco), moeda, locale)} / {tp(`unidades.${UNIDADES.includes(p.unidade) ? p.unidade : 'un'}`)}
                    {p.preco_anterior != null && <span className="ml-2 line-through text-gray-400">{formatCurrency(Number(p.preco_anterior), moeda, locale)}</span>}
                    {' · '}{ativa ? t('validaAte', { data: new Date(p.valido_ate).toLocaleDateString(locale) }) : t('encerrada')}
                  </p>
                  {p.oculta && <p className="text-xs text-red-700" data-testid="promo-oculta">{t('ocultoPeloAdmin', { motivo: p.oculta_motivo || '-' })}</p>}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {ativa && <button type="button" data-testid="promo-alternar-destaque" onClick={() => alternarDestaque(p)} className="btn-secondary text-xs !py-1 !px-2">{p.destaque ? t('tirarDestaque') : t('destacar')}</button>}
                  {ativa && <button type="button" data-testid="promo-encerrar" onClick={() => encerrar(p)} className="btn-secondary text-xs !py-1 !px-2">{t('encerrar')}</button>}
                  {!p.oculta && <button type="button" data-testid="promo-apagar" onClick={() => apagar(p)} className="btn-secondary text-xs !py-1 !px-2">{t('apagar')}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
