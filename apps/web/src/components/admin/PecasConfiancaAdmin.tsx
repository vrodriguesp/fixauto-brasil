'use client';

import { useEffect, useState } from 'react';

// Lote 3 de pecas ("confianca", 17/11) no /admin/pecas: oficinas bloqueadas pelo P-7, pedidos com problema /
// "nao entregou" (casos por fornecedor em 90 dias - D-4: o admin decide a partir de 3), "marcar recebido"
// (a pendencia so some com a avaliacao), cancelar como admin e avaliacoes denunciadas/ocultas (ocultar com
// motivo). Tudo com auditoria nas rotas /api/admin/pedido-peca e /api/admin/avaliacao-fornecedor.

type Linha = { id: string; status: string; criadoEm: string; peca: string; compradora: string; fornecedor: string; fornecedorChave: string; problema: string | null; problemaTexto: string | null; canceladoPor: string | null; canceladoMotivo: string | null; recebidoEm: string | null; entregueEm: string | null };
type Dados = { problemas: Linha[]; semRetorno: Linha[]; naoEntregouPorFornecedor: Record<string, number>; bloqueadas: { id: string; nome: string }[] };
type Avaliacao = { id: string; nota: number; comentario: string | null; resposta: string | null; oculta: boolean; oculta_motivo: string | null; denunciada_em: string | null; denuncia_motivo: string | null; autora: string; fornecedor: string };

const PROBLEMA: Record<string, string> = { nao_entregou: 'não entregou', peca_errada: 'peça errada', avariada: 'avariada', outro: 'outro problema' };
const MOTIVO: Record<string, string> = { sem_estoque: 'sem estoque', prazo: 'não consegue no prazo', compradora_pediu: 'a compradora pediu', nao_entregou: 'não entregou', outro: 'outro' };
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '-');

export default function PecasConfiancaAdmin() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    const [r1, r2] = await Promise.all([
      fetch('/api/admin/pedido-peca', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/admin/avaliacao-fornecedor', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (r1) setDados(r1);
    if (r2?.avaliacoes) setAvaliacoes(r2.avaliacoes);
  };
  useEffect(() => { carregar(); }, []);

  const acaoPedido = async (id: string, acao: { recebido?: true; cancelar?: true }, pergunta: string) => {
    if (!confirm(pergunta)) return;
    setOcupado(id); setErro(null);
    const r = await fetch('/api/admin/pedido-peca', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...acao }) }).catch(() => null);
    setOcupado(null);
    if (!r?.ok) setErro('Não foi possível salvar. Tente de novo.');
    await carregar();
  };
  const ocultar = async (a: Avaliacao) => {
    const motivo = a.oculta ? (prompt('Motivo para mostrar de novo (opcional):') ?? null) : prompt('Motivo para ocultar (aparece para o fornecedor):');
    if (motivo === null || (!a.oculta && !motivo.trim())) return;
    setOcupado(a.id); setErro(null);
    const r = await fetch('/api/admin/avaliacao-fornecedor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, oculta: !a.oculta, motivo }) }).catch(() => null);
    setOcupado(null);
    if (!r?.ok) setErro('Não foi possível salvar. Tente de novo.');
    await carregar();
  };

  const caixa = 'bg-slate-800 rounded-xl border border-slate-700 p-5';
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Confiança (lote 3): entregas, avaliações e bloqueio por avaliação pendente</h2>
      {erro && <p role="alert" className="text-sm text-red-300">{erro}</p>}

      <div className={caixa} data-testid="admin-p7-bloqueadas">
        <h3 className="font-semibold text-white">Oficinas bloqueadas pelo P-7 (avaliação pendente)</h3>
        {!dados ? <p className="text-sm text-slate-400 mt-2">Carregando…</p> : dados.bloqueadas.length === 0 ? <p className="text-sm text-slate-400 mt-2">Nenhuma.</p> : (
          <ul className="mt-2 space-y-1 text-sm text-slate-200">{dados.bloqueadas.map((b) => <li key={b.id}>{b.nome}</li>)}</ul>
        )}
      </div>

      <div className={caixa} data-testid="admin-pedidos-problema">
        <h3 className="font-semibold text-white">Pedidos com problema, "não entregou" ou cancelados pelo fornecedor (90 dias)</h3>
        {!dados ? <p className="text-sm text-slate-400 mt-2">Carregando…</p> : dados.problemas.length === 0 ? <p className="text-sm text-slate-400 mt-2">Nenhum.</p> : (
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {dados.problemas.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-slate-700 pb-2">
                <span className="min-w-0 break-words">
                  <strong>{p.peca}</strong> · {p.compradora} → {p.fornecedor}
                  {p.problema && ` · ${PROBLEMA[p.problema] || p.problema}`}{p.problemaTexto ? ` ("${p.problemaTexto}")` : ''}
                  {p.canceladoPor && ` · cancelado (${p.canceladoPor}: ${MOTIVO[p.canceladoMotivo || ''] || p.canceladoMotivo || '-'})`}
                  {(dados.naoEntregouPorFornecedor[p.fornecedorChave] || 0) >= 1 && <span className={`ml-1 ${(dados.naoEntregouPorFornecedor[p.fornecedorChave] || 0) >= 3 ? 'text-red-300 font-semibold' : 'text-slate-400'}`}>· {dados.naoEntregouPorFornecedor[p.fornecedorChave]}× não entregou em 90 dias</span>}
                  <span className="text-slate-500"> · {data(p.criadoEm)}</span>
                </span>
                {p.status !== 'cancelado' && (
                  <button type="button" disabled={ocupado === p.id} onClick={() => acaoPedido(p.id, { cancelar: true }, `Cancelar "${p.peca}" como admin? (não gera pendência de avaliação)`)}
                    className="self-start rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-500 disabled:opacity-50">Cancelar como admin</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={caixa}>
        <h3 className="font-semibold text-white">Pedidos sem retorno da compradora</h3>
        <p className="text-xs text-slate-500 mt-1">"Marcar recebido" grava a entrega; a avaliação continua obrigatória.</p>
        {!dados ? <p className="text-sm text-slate-400 mt-2">Carregando…</p> : dados.semRetorno.length === 0 ? <p className="text-sm text-slate-400 mt-2">Nenhum.</p> : (
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {dados.semRetorno.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-slate-700 pb-2">
                <span className="min-w-0 break-words"><strong>{p.peca}</strong> · {p.compradora} → {p.fornecedor} · {p.status}{p.entregueEm ? ` em ${data(p.entregueEm)}` : ''}</span>
                <span className="flex gap-2 self-start">
                  <button type="button" data-testid="admin-pedido-recebido" disabled={ocupado === p.id} onClick={() => acaoPedido(p.id, { recebido: true }, `Marcar "${p.peca}" como recebido?`)}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">Marcar recebido</button>
                  {p.status === 'confirmado' && (
                    <button type="button" disabled={ocupado === p.id} onClick={() => acaoPedido(p.id, { cancelar: true }, `Cancelar "${p.peca}" como admin?`)}
                      className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-500 disabled:opacity-50">Cancelar</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={caixa}>
        <h3 className="font-semibold text-white">Avaliações denunciadas ou ocultas</h3>
        {avaliacoes.length === 0 ? <p className="text-sm text-slate-400 mt-2">Nenhuma.</p> : (
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {avaliacoes.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-slate-700 pb-2">
                <span className="min-w-0 break-words">
                  {a.nota}/5 · {a.autora} → {a.fornecedor}{a.comentario ? ` · "${a.comentario}"` : ''}
                  {a.denunciada_em && <span className="text-amber-300"> · revisão pedida {data(a.denunciada_em)}{a.denuncia_motivo ? `: ${a.denuncia_motivo}` : ''}</span>}
                  {a.oculta && <span className="text-red-300"> · OCULTA ({a.oculta_motivo || '-'})</span>}
                </span>
                <button type="button" data-testid="admin-avaliacao-ocultar" disabled={ocupado === a.id} onClick={() => ocultar(a)}
                  className="self-start rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-500 disabled:opacity-50">{a.oculta ? 'Mostrar de novo' : 'Ocultar'}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
