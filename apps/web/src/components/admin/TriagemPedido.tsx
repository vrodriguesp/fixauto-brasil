'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TIPOS_SERVICO } from '@fixauto/shared';
import { formatDateTime } from '@/lib/utils';

// Triagem do pedido no admin (Lote 2, migracao 085; rascunho aprovado 15/11, secao "Triagem").
// 1) mudar o tipo: so grava (nenhuma oficina e avisada); 2) "Ver quem seria avisado" -> "Confirmar e avisar N"
// (a lista que voce ve e a que sai; no maximo 50, as mais proximas); 3) ou enviar para oficinas escolhidas.
// Sem window.confirm: toda confirmacao acontece aqui na pagina.

const STATUS_TRIAGEM = ['aberta', 'em_orcamento'];
export const rotuloTipo = (v?: string | null) => {
  const t = TIPOS_SERVICO.find((x) => x.value === v);
  return t ? `${t.icon} ${t.label}` : v || '—';
};
const nomesTipos = (esp: string[] = []) => (esp.length ? esp.map((e) => TIPOS_SERVICO.find((x) => x.value === e)?.label || e).join(', ') : 'todos os tipos');
const km = (v: number | null | undefined) => (v == null ? 'sem local' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`);
const MOTIVO_JA: Record<string, string> = { aviso: 'recebeu o aviso', orcamento: 'já orçou', dispensa: 'sem interesse', convite: 'convidada' };
const ESTADO: Record<string, { txt: string; cls: string }> = {
  avisada: { txt: 'já recebeu', cls: 'bg-slate-600/40 text-slate-200' },
  orcou: { txt: 'já orçou', cls: 'bg-emerald-500/20 text-emerald-300' },
  convidada: { txt: 'já convidada', cls: 'bg-blue-500/20 text-blue-300' },
  dispensou: { txt: 'sem interesse', cls: 'bg-amber-500/20 text-amber-300' },
};
const PULADA: Record<string, string> = { ja_orcou: 'já orçou', dispensou: 'sem interesse', ja_convidada: 'já convidada', ja_recebeu: 'já recebeu' };

type Preview = {
  tipo: string; bloqueado?: string; teto: number; total: number; foraDoTeto: number;
  seriam: { oficina_id: string; nome: string; cidade: string | null; especialidades: string[]; km: number | null; conta_teste: boolean }[];
  jaReceberam: { oficina_id: string; nome: string; motivo: string }[];
};
type LinhaOficina = {
  oficina_id: string; nome: string; cidade: string | null; especialidades: string[]; km: number | null;
  compativel: boolean; dentroDoRaio: boolean; conta_teste: boolean; mesmaConta: boolean; estado: string;
};

async function jsonDe(res: Response) { return res.json().catch(() => ({})); }

export default function TriagemPedido({ solicitacao, historico, aoMudar }: { solicitacao: any; historico: any[]; aoMudar: () => Promise<void> | void }) {
  const aberto = STATUS_TRIAGEM.includes(solicitacao.status);
  const acidente = !!solicitacao.emergencia_id;
  const base = `/api/admin/solicitacoes/${solicitacao.id}`;

  // ---------- 1) tipo ----------
  const [tipo, setTipo] = useState<string>(solicitacao.tipo);
  const [confirmandoTipo, setConfirmandoTipo] = useState(false);
  const [salvandoTipo, setSalvandoTipo] = useState(false);
  const [msgTipo, setMsgTipo] = useState<{ ok: boolean; txt: string } | null>(null);
  useEffect(() => { setTipo(solicitacao.tipo); }, [solicitacao.tipo]);
  const bloqueioTipo = acidente
    ? 'Pedido de acidente: o tipo vem do fluxo do acidente e não pode ser mudado.'
    : !aberto ? 'Só um pedido aberto ou em orçamento pode mudar de tipo.' : null;
  const salvarTipo = async () => {
    setSalvandoTipo(true); setMsgTipo(null);
    const res = await fetch(`${base}/tipo`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo }) });
    const r = await jsonDe(res);
    setSalvandoTipo(false); setConfirmandoTipo(false);
    if (!res.ok) { setMsgTipo({ ok: false, txt: r.error || 'Erro ao salvar o tipo.' }); return; }
    setMsgTipo({ ok: true, txt: `Salvo. Nenhuma oficina foi avisada.${r.acessoMantido ? ` ${r.acessoMantido} ${r.acessoMantido === 1 ? 'oficina que já tinha recebido continua' : 'oficinas que já tinham recebido continuam'} vendo o pedido.` : ''}${r.aviso ? ` ${r.aviso}` : ''}` });
    setPreview(null); setMsgAviso(null);
    await aoMudar();
  };
  const mudancas = historico.filter((h) => h.acao === 'mudar_tipo');

  // ---------- 2) avisar as oficinas do tipo ----------
  const [preview, setPreview] = useState<Preview | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [msgAviso, setMsgAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const verQuem = async () => {
    setCarregandoPreview(true); setMsgAviso(null);
    const res = await fetch(`${base}/avisar`, { cache: 'no-store' });
    const r = await jsonDe(res);
    setCarregandoPreview(false);
    if (!res.ok) { setPreview(null); setMsgAviso({ ok: false, txt: r.error || 'Erro ao calcular.' }); return; }
    setPreview(r);
  };
  const confirmarAviso = async () => {
    if (!preview) return;
    setEnviandoAviso(true); setMsgAviso(null);
    const res = await fetch(`${base}/avisar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ esperados: preview.seriam.map((o) => o.oficina_id) }) });
    const r = await jsonDe(res);
    setEnviandoAviso(false);
    if (res.status === 409 && r.seriam) { setPreview(r); setMsgAviso({ ok: false, txt: 'A lista mudou desde que você viu. Confira a lista nova abaixo antes de confirmar.' }); return; }
    if (!res.ok) { setMsgAviso({ ok: false, txt: r.error || 'Erro ao avisar.' }); return; }
    setPreview(null);
    setMsgAviso({ ok: true, txt: r.avisadas ? `Avisadas ${r.avisadas} ${r.avisadas === 1 ? 'oficina' : 'oficinas'}: ${(r.oficinas || []).map((o: any) => o.nome).join(', ')}.${r.foraDoTeto ? ` ${r.foraDoTeto} ficaram de fora pelo limite; veja de novo para avisar as próximas.` : ''}` : 'Nenhuma oficina nova para avisar.' });
    await aoMudar();
  };

  // ---------- 3) oficinas escolhidas ----------
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<{ pais: string; paisGravado: boolean; total: number; limite: number; oficinas: LinhaOficina[] } | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [escolhidas, setEscolhidas] = useState<Map<string, string>>(new Map());
  const [confirmandoConvite, setConfirmandoConvite] = useState(false);
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  const [msgConvite, setMsgConvite] = useState<{ ok: boolean; txt: string } | null>(null);
  const pedidoBusca = useRef(0);
  const carregarLista = useCallback(async (q: string) => {
    const n = ++pedidoBusca.current;
    setCarregandoLista(true);
    const res = await fetch(`${base}/oficinas?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
    const r = await jsonDe(res);
    if (n !== pedidoBusca.current) return; // resposta de uma busca antiga
    setCarregandoLista(false);
    setLista(res.ok ? r : null);
  }, [base]);
  useEffect(() => { const t = setTimeout(() => carregarLista(busca), busca ? 300 : 0); return () => clearTimeout(t); }, [busca, carregarLista]);
  const alternar = (o: LinhaOficina) => setEscolhidas((m) => { const n = new Map(m); if (n.has(o.oficina_id)) n.delete(o.oficina_id); else n.set(o.oficina_id, o.nome); return n; });
  const enviarConvites = async () => {
    setEnviandoConvite(true); setMsgConvite(null);
    const res = await fetch(`${base}/convidar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oficinaIds: Array.from(escolhidas.keys()) }) });
    const r = await jsonDe(res);
    setEnviandoConvite(false); setConfirmandoConvite(false);
    if (!res.ok) { setMsgConvite({ ok: false, txt: r.error || 'Erro ao enviar.' }); return; }
    const puladas = (r.puladas || []).map((p: any) => `${p.nome} (${PULADA[p.motivo] || p.motivo})`).join(', ');
    const acesso = (r.acessoSemAviso || []).map((o: any) => o.nome).join(', ');
    setMsgConvite({ ok: true, txt: `${r.convidadas ? `Enviado para ${r.convidadas}: ${(r.oficinas || []).map((o: any) => o.nome).join(', ')}.` : 'Nenhum envio novo.'}${acesso ? ` Acesso liberado sem novo aviso (já tinham recebido o aviso): ${acesso}.` : ''}${puladas ? ` Não enviado (já tinham o pedido): ${puladas}.` : ''}` });
    setEscolhidas(new Map());
    await carregarLista(busca);
    await aoMudar();
  };

  const card = 'bg-slate-800 border border-slate-700 rounded-xl p-4';
  const msg = (m: { ok: boolean; txt: string } | null, id: string) => m && (
    <p role={m.ok ? 'status' : 'alert'} data-testid={id} className={`text-sm mt-3 ${m.ok ? 'text-emerald-400' : 'text-amber-300'}`}>{m.txt}</p>
  );

  return (
    <section className="mb-8 space-y-4" data-testid="triagem" aria-label="Triagem do pedido">
      <p className="text-slate-400 text-xs uppercase tracking-wide">Triagem do pedido</p>

      {/* 1) Tipo do pedido */}
      <div className={card} data-testid="triagem-tipo">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block">
            <span className="text-slate-400 text-xs uppercase tracking-wide">Tipo do pedido</span>
            <select value={tipo} onChange={(e) => { setTipo(e.target.value); setConfirmandoTipo(false); setMsgTipo(null); }} disabled={!!bloqueioTipo || salvandoTipo}
              className="mt-1 block bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 min-w-[220px] disabled:opacity-50" data-testid="tipo-select">
              {TIPOS_SERVICO.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => { setConfirmandoTipo(true); setMsgTipo(null); }} disabled={!!bloqueioTipo || tipo === solicitacao.tipo || salvandoTipo || confirmandoTipo}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg" data-testid="salvar-tipo">
            Salvar tipo
          </button>
        </div>
        {bloqueioTipo && <p className="text-slate-400 text-xs mt-2">{bloqueioTipo}</p>}
        {confirmandoTipo && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" data-testid="confirmar-tipo-caixa">
            <p className="text-sm text-amber-100">Mudar o tipo de <b>{rotuloTipo(solicitacao.tipo)}</b> para <b>{rotuloTipo(tipo)}</b>? Nenhuma oficina é avisada. Quem já recebeu o pedido continua vendo.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={salvarTipo} disabled={salvandoTipo} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg" data-testid="confirmar-tipo">
                {salvandoTipo ? 'Salvando...' : 'Confirmar mudança'}
              </button>
              <button type="button" onClick={() => setConfirmandoTipo(false)} disabled={salvandoTipo} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">Cancelar</button>
            </div>
          </div>
        )}
        {msg(msgTipo, 'msg-tipo')}
        {mudancas.length > 0 && (
          <ul className="mt-3 space-y-1" data-testid="historico-tipo">
            {mudancas.map((h) => (
              <li key={h.id} className="text-xs text-slate-400">
                Histórico: {rotuloTipo(h.antes?.tipo)} → {rotuloTipo(h.depois?.tipo)} · {h.admin?.nome || h.admin?.email || 'admin'} (admin) · {formatDateTime(h.created_at)}
                {Array.isArray(h.depois?.acesso_mantido) && h.depois.acesso_mantido.length > 0 && ` · acesso mantido para ${h.depois.acesso_mantido.length}`}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2) Avisar as oficinas do tipo */}
      <div className={card} data-testid="triagem-avisar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-white font-medium text-sm">Avisar oficinas do novo tipo</p>
          <button type="button" onClick={verQuem} disabled={carregandoPreview || enviandoAviso || acidente || !aberto}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg" data-testid="ver-quem">
            {carregandoPreview ? 'Calculando...' : 'Ver quem seria avisado'}
          </button>
        </div>
        <p className="text-slate-400 text-xs mt-1">Mesma regra de área e especialidade do aviso automático. Quem já recebeu este pedido não recebe de novo. No máximo 50 por vez, as mais próximas primeiro.</p>
        {(acidente || !aberto) && <p className="text-slate-400 text-xs mt-2">{acidente ? 'Pedido de acidente: os avisos são do fluxo do acidente.' : 'Só um pedido aberto ou em orçamento recebe aviso novo.'}</p>}
        {preview && (
          <div className="mt-3 rounded-lg bg-slate-900/60 border border-slate-700 p-3 text-sm text-slate-200" data-testid="preview-aviso">
            {preview.bloqueado ? <p>{preview.bloqueado}</p> : (
              <>
                {preview.foraDoTeto > 0 && (
                  <p role="alert" className="mb-2 rounded border border-amber-500/50 bg-amber-500/15 p-2 text-amber-200" data-testid="aviso-teto">
                    Atenção: {preview.total} oficinas combinam com este pedido. Por segurança, só as {preview.teto} mais próximas serão avisadas agora; {preview.foraDoTeto} {preview.foraDoTeto === 1 ? 'fica' : 'ficam'} de fora (veja de novo depois para avisar as próximas).
                  </p>
                )}
                {preview.seriam.length === 0 ? <p data-testid="preview-vazio">Nenhuma oficina nova para avisar com o tipo <b>{rotuloTipo(preview.tipo)}</b>.</p> : (
                  <>
                    <p>Seriam avisadas <b data-testid="preview-n">{preview.seriam.length}</b> {preview.seriam.length === 1 ? 'oficina' : 'oficinas'} de <b>{rotuloTipo(preview.tipo)}</b> na área do pedido:</p>
                    <ul className="mt-1 max-h-64 overflow-y-auto list-disc pl-5 space-y-0.5" data-testid="preview-lista">
                      {preview.seriam.map((o) => (
                        <li key={o.oficina_id} data-oficina={o.oficina_id}>
                          {o.conta_teste && <span className="mr-1 rounded bg-fuchsia-500/20 px-1 text-[11px] font-semibold text-fuchsia-300">[TESTE]</span>}
                          {o.nome}<span className="text-slate-400"> · {nomesTipos(o.especialidades)} · {km(o.km)}{o.cidade ? ` · ${o.cidade}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {preview.jaReceberam.length > 0 && (
                  <p className="mt-2 text-slate-400" data-testid="preview-ja">Já receberam este pedido antes (não recebem de novo): {preview.jaReceberam.map((j) => `${j.nome} (${MOTIVO_JA[j.motivo] || j.motivo})`).join(', ')}.</p>
                )}
              </>
            )}
          </div>
        )}
        {preview && !preview.bloqueado && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-400">Nada é enviado até você confirmar.</span>
            <button type="button" onClick={confirmarAviso} disabled={enviandoAviso || preview.seriam.length === 0}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg" data-testid="confirmar-aviso">
              {enviandoAviso ? 'Avisando...' : `Confirmar e avisar ${preview.seriam.length} ${preview.seriam.length === 1 ? 'oficina' : 'oficinas'}`}
            </button>
          </div>
        )}
        {msg(msgAviso, 'msg-aviso')}
      </div>

      {/* 3) Oficinas escolhidas */}
      <div className={card} data-testid="triagem-convidar">
        <p className="text-white font-medium text-sm">Ou: enviar para oficinas escolhidas (sem mudar o tipo)</p>
        <p className="text-slate-400 text-xs mt-1">
          Só oficinas ativas do país do pedido ({lista?.pais || '…'}{lista && !lista.paisGravado ? ', o pedido não tem país gravado: usando EE' : ''}), da mais perto para a mais longe.
        </p>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar oficina… (nome, cidade ou endereço)" aria-label="Procurar oficina"
          disabled={!aberto} className="mt-2 w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-50" data-testid="busca-oficina" />
        {!aberto && <p className="text-slate-400 text-xs mt-2">Só um pedido aberto ou em orçamento pode ser enviado a oficinas.</p>}
        {carregandoLista && !lista && <p className="text-slate-400 text-sm mt-3">Carregando...</p>}
        {lista && (
          <>
            {lista.oficinas.length === 0 ? <p className="text-slate-400 text-sm mt-3" data-testid="lista-vazia">Nenhuma oficina encontrada.</p> : (
              <ul className={`mt-3 max-h-80 overflow-y-auto divide-y divide-slate-700/60 ${carregandoLista ? 'opacity-60' : ''}`} data-testid="lista-oficinas">
                {lista.oficinas.map((o) => {
                  const est = ESTADO[o.estado];
                  const bloqueada = !aberto || !!est || !o.mesmaConta;
                  return (
                    <li key={o.oficina_id} data-oficina={o.oficina_id} data-estado={o.estado}>
                      <label className={`flex items-start gap-3 py-2 ${bloqueada ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input type="checkbox" className="mt-1 h-4 w-4" checked={escolhidas.has(o.oficina_id)} disabled={bloqueada && !escolhidas.has(o.oficina_id)} onChange={() => alternar(o)} />
                        <span className="text-sm text-white min-w-0">
                          {o.conta_teste && <span className="mr-1 rounded bg-fuchsia-500/20 px-1 text-[11px] font-semibold text-fuchsia-300">[TESTE]</span>}
                          {o.nome}
                          <span className="text-slate-400"> · {nomesTipos(o.especialidades)} · {km(o.km)}{o.cidade ? ` · ${o.cidade}` : ''}</span>
                          {!o.compativel && <span className="ml-1.5 text-amber-400" data-testid="sem-tipo">não tem este tipo</span>}
                          {o.compativel && !o.dentroDoRaio && <span className="ml-1.5 text-slate-400">fora do raio dela</span>}
                          {est && <span className={`ml-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${est.cls}`}>{est.txt}</span>}
                          {!o.mesmaConta && <span className="ml-1.5 text-fuchsia-300">{o.conta_teste ? 'conta de teste: pedido real' : 'conta real: pedido de teste'}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {lista.total > lista.oficinas.length && <p className="text-xs text-slate-500 mt-1">Mostrando as {lista.oficinas.length} mais próximas de {lista.total}. Procure pelo nome para achar outras.</p>}
          </>
        )}
        {confirmandoConvite && escolhidas.size > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" data-testid="confirmar-convite-caixa">
            <p className="text-sm text-amber-100">Enviar este pedido para: <b>{Array.from(escolhidas.values()).join(', ')}</b>? Cada uma recebe um aviso e um e-mail, passa a ver o pedido e pode mandar orçamento.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={enviarConvites} disabled={enviandoConvite} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg" data-testid="confirmar-convite">
                {enviandoConvite ? 'Enviando...' : 'Sim, enviar'}
              </button>
              <button type="button" onClick={() => setConfirmandoConvite(false)} disabled={enviandoConvite} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">Voltar</button>
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400">As escolhidas passam a ver o pedido e podem mandar orçamento.{escolhidas.size > 20 ? ' No máximo 20 por vez.' : ''}</span>
          <button type="button" onClick={() => { setConfirmandoConvite(true); setMsgConvite(null); }} disabled={!aberto || escolhidas.size === 0 || escolhidas.size > 20 || confirmandoConvite || enviandoConvite}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg" data-testid="enviar-escolhidas">
            Confirmar e enviar para {escolhidas.size}
          </button>
        </div>
        {msg(msgConvite, 'msg-convite')}
      </div>
    </section>
  );
}
