'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatCurrency } from '@/lib/utils';
import { numeroDaQuantidade } from '@/lib/pecas-formato';
import { ivaDaOferta, semIva, totalDaOferta, IVA_PADRAO_PAIS } from '@/lib/pecas-iva';

// Lote 2 de pecas (17/11): pecas do lado do FORNECEDOR (loja em /loja/cotacoes e oficina na aba
// "Vender"), so com o interruptor: botao "Nao tenho" no cartao e, no formulario de resposta,
// quantidade ofertada, "peca usada" (regime de margem) e a previa do total com o IVA.

// aliquota no formato da lingua (0 tambem: numeroDaQuantidade trata 0 como 1)
const pctTexto = (pct: number, locale: string) => (pct ? numeroDaQuantidade(pct, locale) : '0');

type PerfilFiscal = { iva_registrado?: boolean | null; iva_pct?: number | null; regime_margem_usadas?: boolean | null } | null | undefined;

/** quantidade ofertada para gravar: NULL quando igual a pedida (ou vazia); nunca acima da pedida */
export function quantidadeOfertadaParaGravar(texto: string, pedida: number): number | null {
  const n = Number(String(texto || '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const q = Math.round(Math.min(n, Number(pedida)) * 100) / 100;
  return q >= Number(pedida) ? null : q;
}

/** campos da oferta do lote 2 (quantidade_ofertada + retrato do IVA) */
export function camposOfertaV3(texto: string, pedida: number, perfil: PerfilFiscal, usada: boolean) {
  return { quantidade_ofertada: quantidadeOfertadaParaGravar(texto, pedida), ...ivaDaOferta(perfil, usada) };
}

export function NaoTenhoCartao({ aoConfirmar }: { aoConfirmar: (motivo: string | null) => Promise<boolean> }) {
  const t = useTranslations('pecas');
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} data-testid="cotacao-nao-tenho"
        className="text-xs font-medium text-gray-600 hover:text-gray-900 underline whitespace-nowrap">{t('naoTenho')}</button>
    );
  }
  return (
    <div className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <label className="block text-xs font-medium text-gray-700">
        {t('naoTenhoMotivo')}
        <select data-testid="cotacao-nao-tenho-motivo" className="input-field !py-1.5 mt-1" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          <option value="">—</option>
          <option value="sem_estoque">{t('naoTenhoMotivos.semEstoque')}</option>
          <option value="nao_trabalho">{t('naoTenhoMotivos.naoTrabalho')}</option>
          <option value="outro">{t('naoTenhoMotivos.outro')}</option>
        </select>
      </label>
      {erro && <p role="alert" className="text-xs text-red-700">{t('respostaErro')}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => { setAberto(false); setErro(false); }} className="btn-secondary !py-1.5 !px-3 text-sm">✕</button>
        <button type="button" disabled={salvando} data-testid="cotacao-nao-tenho-confirmar" className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50"
          onClick={async () => { setSalvando(true); setErro(false); const ok = await aoConfirmar(motivo || null); setSalvando(false); if (!ok) setErro(true); }}>
          {t('naoTenhoConfirmar')}
        </button>
      </div>
    </div>
  );
}

export function CamposRespostaV3({ quantidadePedida, unidade, quantidade, setQuantidade, usada, setUsada, preco, perfil, moeda }: {
  quantidadePedida: number; unidade?: string | null; quantidade: string; setQuantidade: (v: string) => void;
  usada: boolean; setUsada: (v: boolean) => void; preco: string; perfil: PerfilFiscal; moeda: string;
}) {
  const t = useTranslations('pecas');
  const locale = useLocale();
  const precoN = Number(String(preco || '').replace(',', '.'));
  const qtd = quantidadeOfertadaParaGravar(quantidade, quantidadePedida) ?? Number(quantidadePedida);
  const iva = ivaDaOferta(perfil, usada);
  const total = Number.isFinite(precoN) && precoN > 0 ? totalDaOferta(precoN, qtd) : null;
  const rotuloUnidade = t(`unidades.${unidade || 'un'}`);
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="resposta-quantidade">{t('quantidadeOfertada')} ({rotuloUnidade})</label>
        <input id="resposta-quantidade" data-testid="resposta-quantidade" type="text" inputMode="decimal" className="input-field !py-1.5 !w-28" value={quantidade}
          onChange={(e) => setQuantidade(e.target.value.replace(/[^\d.,]/g, ''))} />
      </div>
      {!!perfil?.regime_margem_usadas && !!perfil?.iva_registrado && (
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" data-testid="resposta-usada" checked={usada} onChange={(e) => setUsada(e.target.checked)} />
          {t('pecaUsada')}
        </label>
      )}
      {total != null && (
        <p data-testid="resposta-iva-previa" className="text-xs text-gray-600">
          {formatCurrency(precoN, moeda, locale)} × {numeroDaQuantidade(qtd, locale)} {rotuloUnidade} = <strong>{formatCurrency(total, moeda, locale)}</strong>
          {' · '}
          {iva.iva_modo === 'registrado' && iva.iva_pct != null
            ? t('semIva', { valor: formatCurrency(semIva(total, iva.iva_pct), moeda, locale), pct: pctTexto(iva.iva_pct, locale) })
            : iva.iva_modo === 'nao_registrado' ? t('ivaNaoAplicavel') : iva.iva_modo === 'margem' ? t('ivaMargem') : t('ivaCompletePerfil')}
        </p>
      )}
    </div>
  );
}

// Perfil fiscal de quem vende pecas (loja e oficina que vende; so o dono). Registro no IVA e
// informacao publica (fica em lojas_pecas/oficinas). Sugestao da aliquota pelo pais (editavel).
export type ValorFiscal = { registrado: boolean | null; pct: string; margem: boolean };
export const fiscalDoPerfil = (p: PerfilFiscal): ValorFiscal => ({ registrado: p?.iva_registrado ?? null, pct: p?.iva_pct != null ? String(Number(p.iva_pct)) : '', margem: !!p?.regime_margem_usadas });
/** colunas para o UPDATE do perfil; null = nunca preenchido (nao grava nada) */
export function colunasFiscais(v: ValorFiscal): { iva_registrado: boolean; iva_pct: number | null; regime_margem_usadas: boolean } | null {
  if (v.registrado === null) return null;
  const pct = Number(String(v.pct).replace(',', '.'));
  if (v.registrado && (!Number.isFinite(pct) || pct < 0 || pct > 100 || String(v.pct).trim() === '')) return { iva_registrado: false, iva_pct: null, regime_margem_usadas: false };
  return { iva_registrado: v.registrado, iva_pct: v.registrado ? Math.round(pct * 100) / 100 : null, regime_margem_usadas: v.registrado ? v.margem : false };
}

export function PerfilFiscalCampos({ valor, aoMudar, pais }: { valor: ValorFiscal; aoMudar: (v: ValorFiscal) => void; pais?: string | null }) {
  const t = useTranslations('pecas');
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-gray-800">
        <input type="checkbox" data-testid="perfil-iva-registrado" checked={valor.registrado === true}
          onChange={(e) => aoMudar({ ...valor, registrado: e.target.checked, pct: e.target.checked && !valor.pct ? String(IVA_PADRAO_PAIS[(pais || '').toUpperCase()] ?? '') : valor.pct })} />
        {t('ivaRegistrado')}
      </label>
      {valor.registrado === true && (
        <>
          <div>
            <label htmlFor="perfil-iva-pct" className="block text-sm font-medium text-gray-700 mb-1">{t('ivaPct')}</label>
            <input id="perfil-iva-pct" data-testid="perfil-iva-pct" type="text" inputMode="decimal" maxLength={6} className="input-field !w-28" value={valor.pct}
              onChange={(e) => aoMudar({ ...valor, pct: e.target.value.replace(/[^\d.,]/g, '') })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" data-testid="perfil-regime-margem" checked={valor.margem} onChange={(e) => aoMudar({ ...valor, margem: e.target.checked })} />
            {t('regimeMargem')}
          </label>
        </>
      )}
    </div>
  );
}

/** linhas da oferta para a compradora: total na quantidade ofertada, IVA e "oferta parcial" */
export function textoIvaOferta(t: (k: string, v?: Record<string, string | number>) => string, r: { iva_modo?: string | null; iva_pct?: number | null }, total: number, moeda: string, locale: string): string | null {
  if (r.iva_modo === 'registrado' && r.iva_pct != null) return t('semIva', { valor: formatCurrency(semIva(total, Number(r.iva_pct)), moeda, locale), pct: pctTexto(Number(r.iva_pct), locale) });
  if (r.iva_modo === 'nao_registrado') return t('ivaNaoAplicavel');
  if (r.iva_modo === 'margem') return t('ivaMargem');
  return null;
}
