'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { formatDate, INTL_LOCALE } from '@/lib/utils';

// Lote 3 de pecas ("confianca", 17/11): pecas da tela do pedido v3 - recebi/problema, cancelar com motivo,
// avaliacao do fornecedor, depois do cancelamento (D-5), aviso/bloqueio do P-7, nota do fornecedor na
// oferta e listas de avaliacoes. So aparecem com a tela nova (interruptor) E em pedido v3: quem decide e
// a pagina; aqui nada consulta o interruptor. data-testid do contrato (Contrato_testids_lote3.md sec. 4).

export const PROBLEMAS = [['nao_entregou', 'naoEntregou'], ['peca_errada', 'pecaErrada'], ['avariada', 'avariada'], ['outro', 'outro']] as const;
export const MOTIVOS_COMPRADORA = ['comprei_outro', 'carro_saiu', 'erro_pedido', 'outro'] as const;
export const MOTIVOS_FORNECEDOR = ['sem_estoque', 'prazo', 'compradora_pediu', 'outro'] as const;
export const CONDICOES = [['nova', 'nova'], ['sobra_nova', 'sobraNova'], ['usada_propria', 'usadaPropria'], ['recondicionada', 'recondicionada']] as const;
const CHAVE_MOTIVO: Record<string, string> = { sem_estoque: 'semEstoque', prazo: 'prazo', compradora_pediu: 'compradoraPediu', comprei_outro: 'compreiOutro', carro_saiu: 'carroSaiu', erro_pedido: 'erroPedido', nao_entregou: 'naoEntregou', outro: 'outro' };
export const chaveMotivo = (m: string | null | undefined) => CHAVE_MOTIVO[m || 'outro'] || 'outro';
export const chaveProblema = (p: string | null | undefined) => (PROBLEMAS.find(([v]) => v === p)?.[1] || 'outro');
export const chaveCondicao = (c: string | null | undefined) => (CONDICOES.find(([v]) => v === c)?.[1] || 'nova');

export type PedidoV3 = {
  id: string; cotacao_id: string; resposta_id: string; status: string; created_at: string; v3?: boolean | null;
  recebido_em?: string | null; problema?: string | null; problema_texto?: string | null; cancelado_por?: string | null; cancelado_motivo?: string | null;
  cancelado_texto?: string | null; cancelado_em?: string | null; entregue_em?: string | null; pos_cancelamento?: string | null;
};
export type PendenteP7 = { id: string; cotacaoId: string; peca: string; fornecedorNome: string; estado: string; referencia: string; falta: 'retorno' | 'avaliacao'; bloqueia?: boolean };
export type DadosP7 = { bloqueado: boolean; desde: string | null; pedidos: PendenteP7[] };
export type ResumoFornecedor = { media: number | null; total: number; pct_peca_certa: number | null; pct_no_prazo: number | null; nao_entregou_n: number; entregues_n: number };

const postar = async (url: string, corpo: unknown, metodo = 'POST') => {
  const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  return { ok: !!r?.ok, status: r?.status || 0, d: d as any };
};

export const numero1 = (n: number, locale: string) => Number(n).toLocaleString(INTL_LOCALE[locale] || locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** resumo pela funcao do banco (so agregados; vazio para quem nao pode ver) */
export async function lerResumo(tipo: 'loja' | 'oficina', id: string): Promise<ResumoFornecedor | null> {
  const { data, error } = await supabase.rpc('fornecedor_resumo', { p_tipo: tipo, p_id: id });
  if (error) return null;
  const l = Array.isArray(data) ? data[0] : data;
  return l ? { media: l.media == null ? null : Number(l.media), total: Number(l.total) || 0, pct_peca_certa: l.pct_peca_certa == null ? null : Number(l.pct_peca_certa), pct_no_prazo: l.pct_no_prazo == null ? null : Number(l.pct_no_prazo), nao_entregou_n: Number(l.nao_entregou_n) || 0, entregues_n: Number(l.entregues_n) || 0 } : null;
}

const botaoSec = 'px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const botaoPri = 'btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50';

// ---------------- recebi / problema ----------------
export function RecebiProblema({ pedidoId, aoTerminar }: { pedidoId: string; aoTerminar: () => void }) {
  const t = useTranslations('pecas');
  const [aberto, setAberto] = useState(false);
  const [prob, setProb] = useState('');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  const recebi = async () => {
    setSalvando(true); setErro(false);
    const r = await postar('/api/pedido-peca/recebido', { pedidoId });
    setSalvando(false);
    if (!r.ok) { setErro(true); return; }
    aoTerminar();
  };
  const enviar = async () => {
    if (!prob) return;
    setSalvando(true); setErro(false);
    const r = await postar('/api/pedido-peca/problema', { pedidoId, problema: prob, ...(texto.trim() ? { texto: texto.trim() } : {}) });
    setSalvando(false);
    if (!r.ok) { setErro(true); return; }
    setAberto(false);
    aoTerminar();
  };
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <p className="text-sm font-medium text-gray-900">{t('recebeuPeca')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="pedido-recebi" disabled={salvando} onClick={recebi} className={botaoPri}>✓ {t('recebi')}</button>
        <button type="button" data-testid="pedido-problema" disabled={salvando} onClick={() => setAberto((a) => !a)} className={botaoSec}>{t('problema')}</button>
      </div>
      {aberto && (
        <div className="space-y-2 pt-1">
          <fieldset className="flex flex-col gap-1.5">
            {PROBLEMAS.map(([v, k]) => (
              <label key={v} className="inline-flex items-center gap-2 text-sm text-gray-800">
                <input type="radio" name={`problema-${pedidoId}`} data-testid={`problema-motivo-${v}`} checked={prob === v} onChange={() => setProb(v)} />
                {t(`problemas.${k}`)}
              </label>
            ))}
          </fieldset>
          <textarea data-testid="problema-texto" className="input-field" rows={2} maxLength={300} placeholder={t('problemaTexto')} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button type="button" data-testid="problema-enviar" disabled={salvando || !prob} onClick={enviar} className={botaoPri}>{t('problemaEnviar')}</button>
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-red-700">{t('erroAcao')}</p>}
    </div>
  );
}

// ---------------- cancelar com motivo ----------------
export function CancelarPedidoV3({ pedidoId, lado, aoTerminar }: { pedidoId: string; lado: 'compradora' | 'fornecedor'; aoTerminar: () => void }) {
  const t = useTranslations('pecas');
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  const motivos = lado === 'compradora' ? MOTIVOS_COMPRADORA : MOTIVOS_FORNECEDOR;
  const enviar = async () => {
    if (!motivo) return;
    setSalvando(true); setErro(false);
    const r = await postar('/api/pedido-peca/cancelar', { pedidoId, motivo, ...(texto.trim() ? { texto: texto.trim() } : {}) });
    setSalvando(false);
    if (!r.ok) { setErro(true); return; }
    setAberto(false);
    aoTerminar();
  };
  return (
    <div className="mt-2">
      <button type="button" data-testid="pedido-cancelar" onClick={() => setAberto((a) => !a)} className="px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50">✕ {t('cancelarPedidoPeca')}</button>
      {aberto && (
        <div className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <fieldset className="flex flex-col gap-1.5">
            {motivos.map((v) => (
              <label key={v} className="inline-flex items-center gap-2 text-sm text-gray-800">
                <input type="radio" name={`cancelar-${pedidoId}`} data-testid={`cancelar-motivo-${v}`} checked={motivo === v} onChange={() => setMotivo(v)} />
                {t(`motivosCancelamento.${chaveMotivo(v)}`)}
              </label>
            ))}
          </fieldset>
          <textarea data-testid="cancelar-texto" className="input-field" rows={2} maxLength={200} placeholder={t('cancelarTexto')} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button type="button" data-testid="cancelar-enviar" disabled={salvando || !motivo} onClick={enviar} className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{t('cancelarEnviar')}</button>
          {erro && <p role="alert" className="text-sm text-red-700">{t('erroAcao')}</p>}
        </div>
      )}
    </div>
  );
}

export function CanceladoInfo({ pedido }: { pedido: PedidoV3 }) {
  const t = useTranslations('pecas');
  const quem = pedido.cancelado_por === 'fornecedor' ? 'fornecedor' : pedido.cancelado_por === 'admin' ? 'admin' : 'compradora';
  return (
    <p data-testid="pedido-cancelado-info" className="mt-2 text-sm text-gray-700">
      {t('canceladoPor', { quem: t(`canceladoPorQuem.${quem}`), motivo: pedido.cancelado_motivo ? t(`motivosCancelamento.${chaveMotivo(pedido.cancelado_motivo)}`) : '-' })}
      {pedido.cancelado_texto ? ` - ${pedido.cancelado_texto}` : ''}
    </p>
  );
}

// ---------------- avaliacao ----------------
export function AvaliarForm({ pedidoId, aoEnviar, aoFechar }: { pedidoId: string; aoEnviar: () => void; aoFechar: () => void }) {
  const t = useTranslations('pecas');
  const [nota, setNota] = useState(0);
  const [pecaCerta, setPecaCerta] = useState<boolean | null>(null);
  const [noPrazo, setNoPrazo] = useState<boolean | null>(null);
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async () => {
    if (!nota) return;
    setSalvando(true); setErro(null);
    const r = await postar('/api/avaliacao-fornecedor', { pedidoId, nota, ...(pecaCerta !== null ? { pecaCerta } : {}), ...(noPrazo !== null ? { noPrazo } : {}), ...(comentario.trim() ? { comentario: comentario.trim() } : {}) });
    setSalvando(false);
    if (!r.ok && r.d?.codigo !== 'JA_AVALIADO') { setErro(r.d?.codigo === 'CONTATO_NO_TEXTO' ? t('avaliacao.contatoNoTexto') : t('avaliacao.erro')); return; }
    aoEnviar();
  };
  const simNao = (nome: string, valor: boolean | null, set: (v: boolean) => void, rotulo: string) => (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-800">
      <legend className="sr-only">{rotulo}</legend>
      <span className="font-medium">{rotulo}</span>
      <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${nome}-${pedidoId}`} data-testid={`avaliar-${nome}-sim`} checked={valor === true} onChange={() => set(true)} />{t('avaliacao.sim')}</label>
      <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${nome}-${pedidoId}`} data-testid={`avaliar-${nome}-nao`} checked={valor === false} onChange={() => set(false)} />{t('avaliacao.nao')}</label>
    </fieldset>
  );
  return (
    <div data-testid="avaliar-form" data-pedido={pedidoId} id={`avaliar-${pedidoId}`} className="mt-3 rounded-lg border border-primary-200 bg-primary-50/50 p-3 space-y-3 scroll-mt-24">
      <p className="text-sm font-semibold text-gray-900">{t('avaliacao.titulo')}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={t('avaliacao.titulo')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" data-testid={`avaliar-nota-${n}`} role="radio" aria-checked={nota === n} aria-label={t('avaliacao.estrelas', { n })}
            onClick={() => setNota(n)} className={`text-2xl leading-none min-w-[36px] min-h-[36px] ${n <= nota ? 'text-amber-500' : 'text-gray-300'}`}>★</button>
        ))}
      </div>
      {simNao('peca-certa', pecaCerta, setPecaCerta, t('avaliacao.pecaCerta'))}
      {simNao('no-prazo', noPrazo, setNoPrazo, t('avaliacao.noPrazo'))}
      <textarea data-testid="avaliar-comentario" className="input-field" rows={2} maxLength={300} placeholder={t('avaliacao.comentario')} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      {erro && <p role="alert" data-testid="avaliar-erro" className="text-sm text-red-700">{erro}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" data-testid="avaliar-fechar" onClick={aoFechar} className={botaoSec}>{t('avaliacao.depois')}</button>
        <button type="button" data-testid="avaliar-enviar" disabled={salvando || !nota} onClick={enviar} className={botaoPri}>{t('avaliacao.enviar')}</button>
      </div>
    </div>
  );
}

// ---------------- depois do cancelamento (D-5) ----------------
// semOutrasOfertas: nenhuma oferta valida sobrou (todas com pedido cancelado) -> "Reabrir" nao leva a nada, so "Pedir de novo"
export function PosCancelamento({ pedidoId, vencida, semOutrasOfertas = false, aoReaberta, aoPedirDeNovo }: { pedidoId: string; vencida: boolean; semOutrasOfertas?: boolean; aoReaberta: () => void; aoPedirDeNovo: () => void }) {
  const t = useTranslations('pecas');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  const reabrir = async () => {
    setSalvando(true); setErro(false);
    const r = await postar('/api/pedido-peca/depois-do-cancelamento', { pedidoId, escolha: 'reabrir' });
    setSalvando(false);
    if (!r.ok) { setErro(true); return; }
    aoReaberta();
  };
  const nova = async () => {
    setSalvando(true); setErro(false);
    const r = await postar('/api/pedido-peca/depois-do-cancelamento', { pedidoId, escolha: 'nova_cotacao' });
    setSalvando(false);
    if (!r.ok) { setErro(true); return; }
    aoPedirDeNovo();
  };
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-sm font-medium text-gray-900">{t('posCancelamento.titulo')}</p>
      {vencida && <p data-testid="pos-cancelamento-vencida" className="text-sm text-gray-600">{t('posCancelamento.vencida')}</p>}
      <div className="flex flex-wrap gap-2">
        {!vencida && !semOutrasOfertas && <button type="button" data-testid="pos-cancelamento-reabrir" disabled={salvando} onClick={reabrir} className={botaoPri}>↻ {t('posCancelamento.reabrir')}</button>}
        <button type="button" data-testid="pos-cancelamento-nova" disabled={salvando} onClick={nova} className={botaoSec}>{t('posCancelamento.nova')}</button>
      </div>
      {erro && <p role="alert" className="text-sm text-red-700">{t('erroAcao')}</p>}
    </div>
  );
}

// ---------------- P-7: aviso amarelo / bloqueio vermelho ----------------
// podeAvaliar: so a dona avalia (D-6); a equipe ve a lista e uma linha dizendo isso, sem o botao
export function BannerP7({ dados, aoAvaliar, podeAvaliar = true }: { dados: DadosP7 | null; aoAvaliar: (p: PendenteP7) => void; podeAvaliar?: boolean }) {
  const t = useTranslations('pecas');
  const locale = useLocale();
  if (!dados || !dados.pedidos.length) return null;
  const bloqueado = dados.bloqueado;
  // prazo do aviso: 3 dias depois da referencia mais antiga
  const prazo = dados.pedidos.map((p) => Date.parse(p.referencia) + 3 * 86400000).sort((a, b) => a - b)[0];
  return (
    <div data-testid={bloqueado ? 'p7-bloqueio' : 'p7-aviso'} role={bloqueado ? 'alert' : 'status'}
      className={`mb-6 rounded-xl border p-4 ${bloqueado ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
      <p className={`text-sm font-semibold ${bloqueado ? 'text-red-800' : 'text-amber-900'}`}>
        {bloqueado ? t('p7.bloqueio') : t('p7.aviso', { data: formatDate(new Date(prazo).toISOString(), locale) })}
      </p>
      <ul className="mt-2 space-y-2">
        {dados.pedidos.map((p) => (
          <li key={p.id} data-testid={`p7-pedido-${p.id}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-800">
            <span className="min-w-0 break-words">{t('p7.linha', { peca: p.peca, fornecedor: p.fornecedorNome, data: formatDate(p.referencia, locale) })}</span>
            {podeAvaliar && <button type="button" data-testid={`p7-avaliar-${p.id}`} onClick={() => aoAvaliar(p)} className={`flex-shrink-0 ${botaoPri}`}>{t('p7.avaliar')}</button>}
          </li>
        ))}
      </ul>
      {!podeAvaliar && <p data-testid="p7-so-dona" className="mt-3 text-sm text-gray-700">{t('p7.soDona')}</p>}
    </div>
  );
}

// ---------------- nota do fornecedor na oferta + lista publica ----------------
export function NotaOferta({ resumo, aoVer }: { resumo: ResumoFornecedor | null | undefined; aoVer: () => void }) {
  const t = useTranslations('pecas');
  const locale = useLocale();
  if (!resumo) return null;
  return (
    <p className="text-xs text-gray-600 mt-0.5 flex flex-wrap items-center gap-x-2">
      {resumo.media != null ? (
        <span data-testid="oferta-nota" className="font-medium text-amber-700">
          {t('notaFornecedor', { media: numero1(resumo.media, locale), total: resumo.total })}
          {resumo.pct_no_prazo != null && ` · ${t('noPrazoPct', { pct: Math.round(resumo.pct_no_prazo) })}`}
        </span>
      ) : (
        <span data-testid="oferta-nota-nova">{t('novoNoBipfix', { n: resumo.entregues_n })}</span>
      )}
      {resumo.total > 0 && <button type="button" data-testid="oferta-ver-avaliacoes" onClick={aoVer} className="text-primary-700 underline">{t('verAvaliacoes')}</button>}
    </p>
  );
}

type ItemAvaliacao = { id: string; nota: number; comentario: string | null; resposta: string | null; criado_em: string; oculta?: boolean; oculta_motivo?: string | null; denunciada_em?: string | null; oficina?: { nome_fantasia: string | null } | null };

async function lerAvaliacoes(tipo: 'loja' | 'oficina', id: string, incluirOcultas = false): Promise<ItemAvaliacao[]> {
  let q = supabase.from('fornecedores_avaliacoes').select('id, nota, comentario, resposta, criado_em, oculta, oculta_motivo, denunciada_em, oficina:oficinas(nome_fantasia)')
    .eq('fornecedor_tipo', tipo).eq('fornecedor_id', id).order('criado_em', { ascending: false }).limit(100);
  if (!incluirOcultas) q = q.eq('oculta', false);
  const { data } = await q;
  return ((data as any[]) || []) as ItemAvaliacao[];
}

function Estrelas({ nota }: { nota: number }) {
  return <span className="text-amber-500" aria-label={`${nota}/5`}>{'★'.repeat(nota)}<span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - nota))}</span></span>;
}

export function ModalAvaliacoes({ tipo, id, nome, aoFechar }: { tipo: 'loja' | 'oficina'; id: string; nome: string; aoFechar: () => void }) {
  const t = useTranslations('pecas');
  const locale = useLocale();
  const [itens, setItens] = useState<ItemAvaliacao[] | null>(null);
  useEffect(() => { lerAvaliacoes(tipo, id).then(setItens); }, [tipo, id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);
  // a lista so aparece (com o testid) depois de carregada: nada de "vazio" por meio segundo
  if (itens === null) return <div className="fixed inset-0 z-50 bg-black/40" aria-busy="true" onClick={aoFechar} />;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={aoFechar}>
      <div data-testid="avaliacoes-lista" role="dialog" aria-modal="true" aria-label={t('verAvaliacoes')} onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="font-semibold text-gray-900 break-words">{nome}</h2>
          <button type="button" onClick={aoFechar} className="text-sm text-gray-600 underline flex-shrink-0">{t('fechar')}</button>
        </div>
        {itens === null ? <div className="animate-pulse h-16 bg-gray-200 rounded-lg" /> : itens.length === 0 ? (
          <p className="text-sm text-gray-500">{t('semAvaliacoes')}</p>
        ) : (
          <ul className="space-y-3">
            {itens.map((a) => (
              <li key={a.id} data-testid="avaliacao-item" className="rounded-lg border border-gray-200 p-3 text-sm">
                <p className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-gray-900">{a.oficina?.nome_fantasia || '-'}</span><Estrelas nota={a.nota} /></p>
                <p className="text-xs text-gray-400">{formatDate(a.criado_em, locale)}</p>
                {a.comentario && <p className="mt-1 text-gray-700 break-words">{a.comentario}</p>}
                {a.resposta && <p className="mt-2 rounded bg-gray-50 p-2 text-gray-700 break-words"><span className="font-medium">{t('respostaFornecedor')}:</span> {a.resposta}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** lista do PROPRIO fornecedor (loja em /loja/avaliacoes, oficina na aba Vender): responder 1x e pedir revisao */
export function AvaliacoesDoFornecedor({ tipo, id, testidItem = 'avaliacao-item', testidVazio, podeAgir = true, aoMudar }: { tipo: 'loja' | 'oficina'; id: string; testidItem?: string; testidVazio?: string; podeAgir?: boolean; aoMudar?: () => void }) {
  const t = useTranslations('pecas');
  const locale = useLocale();
  const [itens, setItens] = useState<ItemAvaliacao[] | null>(null);
  const carregar = () => lerAvaliacoes(tipo, id, true).then(setItens);
  useEffect(() => { carregar(); }, [tipo, id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (itens === null) return <div className="animate-pulse h-16 bg-gray-200 rounded-lg" />;
  if (!itens.length) return testidVazio ? <p data-testid={testidVazio} className="text-sm text-gray-500">{t('lojaAvaliacoes.vazio')}</p> : <p className="text-sm text-gray-500">{t('semAvaliacoes')}</p>;
  return (
    <ul className="space-y-3">
      {itens.map((a) => (
        <ItemDoFornecedor key={a.id} a={a} testid={testidItem} locale={locale} podeAgir={podeAgir} aoMudar={() => { carregar(); aoMudar?.(); }} t={t} />
      ))}
    </ul>
  );
}

function ItemDoFornecedor({ a, testid, locale, podeAgir, aoMudar, t }: { a: ItemAvaliacao; testid: string; locale: string; podeAgir: boolean; aoMudar: () => void; t: ReturnType<typeof useTranslations> }) {
  const [modo, setModo] = useState<'' | 'responder' | 'denunciar'>('');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [denunciada, setDenunciada] = useState(!!a.denunciada_em);
  const enviar = async () => {
    setSalvando(true); setErro(null);
    const r = modo === 'responder'
      ? await postar('/api/avaliacao-fornecedor/resposta', { avaliacaoId: a.id, texto: texto.trim() })
      : await postar('/api/avaliacao-fornecedor/denunciar', { avaliacaoId: a.id, motivo: texto.trim() });
    setSalvando(false);
    if (!r.ok) { setErro(r.d?.codigo === 'CONTATO_NO_TEXTO' ? t('avaliacao.contatoNoTexto') : t('erroAcao')); return; }
    if (modo === 'denunciar') setDenunciada(true);
    setModo(''); setTexto('');
    aoMudar();
  };
  return (
    <li data-testid={testid} className="rounded-lg border border-gray-200 p-3 text-sm">
      <p className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-gray-900">{a.oficina?.nome_fantasia || '-'}</span><Estrelas nota={a.nota} /></p>
      <p className="text-xs text-gray-400">{formatDate(a.criado_em, locale)}</p>
      {a.comentario && <p className="mt-1 text-gray-700 break-words">{a.comentario}</p>}
      {a.oculta && a.oculta_motivo && <p className="mt-1 text-xs text-gray-500">({a.oculta_motivo})</p>}
      {a.resposta && <p className="mt-2 rounded bg-gray-50 p-2 text-gray-700 break-words"><span className="font-medium">{t('respostaFornecedor')}:</span> {a.resposta}</p>}
      {denunciada && <p className="mt-1 text-xs text-gray-500">{t('denunciada')}</p>}
      {podeAgir && <div className="mt-2 flex flex-wrap gap-3">
        {!a.resposta && <button type="button" data-testid="avaliacao-responder" onClick={() => { setModo(modo === 'responder' ? '' : 'responder'); setTexto(''); }} className="text-xs font-medium text-primary-700 underline">{t('responderAvaliacao')}</button>}
        {!denunciada && <button type="button" data-testid="avaliacao-denunciar" onClick={() => { setModo(modo === 'denunciar' ? '' : 'denunciar'); setTexto(''); }} className="text-xs font-medium text-gray-600 underline">{t('denunciarAvaliacao')}</button>}
      </div>}
      {modo && (
        <div className="mt-2 space-y-2">
          <textarea data-testid={modo === 'responder' ? 'avaliacao-resposta-texto' : 'avaliacao-denuncia-motivo'} className="input-field" rows={2} maxLength={300}
            placeholder={modo === 'responder' ? t('respostaTexto') : t('denunciaMotivo')} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button type="button" data-testid={modo === 'responder' ? 'avaliacao-resposta-enviar' : 'avaliacao-denuncia-enviar'} disabled={salvando || (modo === 'responder' && !texto.trim())} onClick={enviar} className={botaoPri}>
            {modo === 'responder' ? t('respostaEnviar') : t('denunciaEnviar')}
          </button>
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        </div>
      )}
    </li>
  );
}

/** "Sua nota como fornecedora" (ou o resumo da loja): ★ media (total) ou "novo" */
export function ResumoProprio({ resumo, testid }: { resumo: ResumoFornecedor | null; testid: string }) {
  const t = useTranslations('pecas');
  const locale = useLocale();
  if (!resumo) return null;
  return (
    <p data-testid={testid} className="text-sm text-gray-800">
      {resumo.media != null
        ? <>{t('notaFornecedor', { media: numero1(resumo.media, locale), total: resumo.total })}{resumo.pct_no_prazo != null && ` · ${t('noPrazoPct', { pct: Math.round(resumo.pct_no_prazo) })}`}</>
        : t('novoNoBipfix', { n: resumo.entregues_n })}
    </p>
  );
}
