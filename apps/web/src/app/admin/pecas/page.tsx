'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import PedidosPecasAdmin from '@/components/admin/PedidosPecasAdmin';
import PecasConfiancaAdmin from '@/components/admin/PecasConfiancaAdmin';
import PecasShopAdmin from '@/components/admin/PecasShopAdmin';

interface Fornecedor {
  id: string;
  tipo: 'loja' | 'oficina';
  nome_fantasia: string;
  cidade: string;
  estado: string;
  ativa: boolean;
  cnpj: string | null;
  profile_id: string;
  email: string | null;
  created_at: string;
  ultimo_login: string | null;
}

interface Resumo {
  totalLojas: number;
  lojasAtivas: number;
  totalOficinasFornecedoras: number;
  oficinasFornecedorasAtivas: number;
  ativosUltimos7Dias: number;
  nuncaLogou: number;
  totalCotacoes: number;
  cotacoesRespondidas: number;
  pedidosConfirmados: number;
  pedidosEntregues: number;
  entreguesSemComissao: number;
  comissaoPendentePorMoeda: Record<string, number>;
  comissaoPagaPorMoeda: Record<string, number>;
}

export default function AdminPecasPage() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'loja' | 'oficina'>('todos');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/pecas-fornecedores');
      if (!res.ok) throw new Error('Erro ao buscar fornecedores de peças');
      const data = await res.json();
      setFornecedores(data.fornecedores);
      setResumo(data.resumo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Lote 1 de pecas (17/11): interruptor global da tela nova (placa, unidade, sem carro, "enviar a",
  // validade de 7 dias, telefone comercial). Desligado: so as contas de teste a veem. Ao ligar, as
  // cotacoes abertas ganham 7 dias a partir de agora (api/admin/pecas-v3). Com auditoria.
  const [v3Ativo, setV3Ativo] = useState<boolean | null>(null);
  const [salvandoV3, setSalvandoV3] = useState(false);
  const [erroV3, setErroV3] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/admin/pecas-v3', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => setV3Ativo(typeof j?.ativo === 'boolean' ? j.ativo : null)).catch(() => {});
  }, []);
  const alternarV3 = async () => {
    if (v3Ativo === null) return;
    if (!v3Ativo && !confirm('Ligar a tela nova de peças para TODOS? As cotações abertas passam a vencer em 7 dias a partir de agora.')) return;
    setSalvandoV3(true); setErroV3(null);
    const r = await fetch('/api/admin/pecas-v3', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !v3Ativo }) }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    setSalvandoV3(false);
    if (typeof j?.ativo === 'boolean') setV3Ativo(j.ativo);
    else setErroV3('Não foi possível salvar. Tente de novo.');
  };

  // Lote 4 de pecas (18/11): interruptor proprio da pagina publica das lojas (api/admin/lojas-pagina-publica).
  // Separado do lote 1: a pagina mostra avaliacoes a visitantes (precisa do texto legal novo + aviso de 30 dias).
  const [pubAtivo, setPubAtivo] = useState<boolean | null>(null);
  const [salvandoPub, setSalvandoPub] = useState(false);
  const [erroPub, setErroPub] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/admin/lojas-pagina-publica', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => setPubAtivo(typeof j?.ativo === 'boolean' ? j.ativo : null)).catch(() => {});
  }, []);
  const alternarPub = async () => {
    if (pubAtivo === null) return;
    if (!pubAtivo && !confirm('Ligar a página pública das lojas para TODAS? Visitantes passam a ver as lojas que ligaram a página e as avaliações delas (a partir de 3). Só depois do texto legal novo e do aviso de 30 dias.')) return;
    setSalvandoPub(true); setErroPub(null);
    const r = await fetch('/api/admin/lojas-pagina-publica', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !pubAtivo }) }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    setSalvandoPub(false);
    if (typeof j?.ativo === 'boolean') setPubAtivo(j.ativo);
    else setErroPub('Não foi possível salvar. Tente de novo.');
  };

  // 21/11 (migracao 113): botao "Pedir peca" no pedido do motorista - interruptor proprio + minimo de lojas
  // ao alcance (api/admin/pecas-botao-pedido). So vale com a tela nova (v3) valendo. Com auditoria.
  const [botao, setBotao] = useState<{ ativo: boolean; minLojas: number; lojasReaisPorPais: Record<string, number> } | null>(null);
  const [minDigitado, setMinDigitado] = useState('');
  const [salvandoBotao, setSalvandoBotao] = useState(false);
  const [erroBotao, setErroBotao] = useState<string | null>(null);
  const carregarBotao = () => fetch('/api/admin/pecas-botao-pedido', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (typeof j?.ativo === 'boolean') { setBotao(j); setMinDigitado(String(j.minLojas)); }
  }).catch(() => {});
  useEffect(() => { carregarBotao(); }, []);
  const salvarBotao = async (mudar: { ativo?: boolean; minLojas?: number }) => {
    setSalvandoBotao(true); setErroBotao(null);
    const r = await fetch('/api/admin/pecas-botao-pedido', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mudar) }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    setSalvandoBotao(false);
    if (typeof j?.ativo === 'boolean') await carregarBotao();
    else setErroBotao('Não foi possível salvar. Tente de novo.');
  };
  const salvarMinimo = () => {
    const n = Number(minDigitado);
    if (!Number.isInteger(n) || n < 0 || n > 50) { setErroBotao('O mínimo deve ser um número inteiro de 0 a 50.'); return; }
    salvarBotao({ minLojas: n });
  };

  // Loja nova nasce inativa: o admin confere o registro da empresa e ativa
  const [ocupado, setOcupado] = useState<string | null>(null);
  const alternarAtiva = async (f: Fornecedor) => {
    if (!confirm(`${f.ativa ? 'Desativar' : 'Ativar'} "${f.nome_fantasia}"?${f.ativa ? '' : ` Registro: ${f.cnpj || '-'}`}`)) return;
    setOcupado(f.id);
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.profile_id, ativo: !f.ativa }),
    });
    setOcupado(null);
    await fetchData();
  };

  const formatUltimoLogin = (iso: string | null) => {
    if (!iso) return { texto: 'Nunca logou', classe: 'text-red-400' };
    const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
    const texto = dias === 0 ? 'Hoje' : dias === 1 ? 'Ontem' : `Há ${dias} dias`;
    const classe = dias <= 7 ? 'text-emerald-400' : dias <= 30 ? 'text-amber-400' : 'text-red-400';
    return { texto, classe };
  };

  const linhas = fornecedores.filter((f) => filtro === 'todos' || f.tipo === filtro);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-64" />
        <div className="h-32 bg-slate-800 rounded-xl" />
        <div className="h-64 bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (error || !resumo) {
    return <div className="bg-red-900/20 border border-red-800 text-red-300 p-4 rounded-lg">{error}</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Portal de Peças</h1>
        <p className="text-slate-400 text-sm mt-1">Rastreabilidade de quem está usando o canal e se a comissão está de fato rendendo</p>
      </div>

      {/* Interruptor do lote 1 (tela nova de pecas) */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-white">Tela nova de peças (lote 1)</h2>
          <p className="text-sm text-slate-400 mt-1">
            {v3Ativo === null ? 'Carregando…' : v3Ativo
              ? 'Ligada para todos: placa, unidade, "sem carro", "enviar a", validade de 7 dias e telefone comercial.'
              : 'Desligada: só as contas de teste veem a tela nova; os demais veem a tela de hoje.'}
          </p>
          {/* lote 2: o resumo de 2 h respeita o interruptor por cotacao */}
          <p className="text-xs text-slate-500 mt-1">Ao desligar o global, os resumos de e-mail pendentes de contas reais ficam parados (não saem) até ligar de novo.</p>
          {erroV3 && <p role="alert" className="text-sm text-red-300 mt-1">{erroV3}</p>}
        </div>
        <button type="button" role="switch" aria-checked={v3Ativo === true} onClick={alternarV3} disabled={salvandoV3 || v3Ativo === null} data-testid="pecas-v3-interruptor"
          className={`inline-flex min-h-[44px] items-center rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50 ${v3Ativo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-600 hover:bg-slate-500'}`}>
          {salvandoV3 ? 'Salvando…' : v3Ativo ? 'Ligada — desligar' : 'Desligada — ligar'}
        </button>
      </div>

      {/* 21/11 (113): botao "Pedir peca" no pedido do motorista */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 flex flex-wrap items-center justify-between gap-4" data-testid="pecas-botao-pedido-bloco">
        <div className="min-w-0">
          <h2 className="font-semibold text-white">Botão Pedir peça no pedido do motorista</h2>
          <p className="text-sm text-slate-400 mt-1">
            {botao === null ? 'Carregando…' : botao.ativo
              ? `Ligado: oficinas reais veem o botão quando a tela nova de peças vale e há pelo menos ${botao.minLojas} loja(s) ativa(s) do país dela.`
              : 'Desligado: só as contas de teste veem o botão (com lojas de teste suficientes).'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Conta só lojas que seriam avisadas: ativas, do mesmo país da oficina, conta ativa e do mesmo tipo (teste/real). Sem a tela nova (lote 1) o botão nunca aparece.</p>
          {botao && (
            <p className="text-sm text-slate-300 mt-2" data-testid="pecas-botao-lojas-por-pais">
              Lojas ativas reais por país: {Object.keys(botao.lojasReaisPorPais).length
                ? Object.entries(botao.lojasReaisPorPais).sort(([a], [b]) => a.localeCompare(b)).map(([p, n], i) => (
                  <span key={p}>{i ? ', ' : ''}<span className={n >= botao.minLojas ? 'text-emerald-400' : 'text-amber-400'}>{`${p} ${n}`}</span></span>
                ))
                : 'nenhuma'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <label htmlFor="pecas-botao-min" className="text-sm text-slate-400">Mínimo de lojas (0–50)</label>
            <input id="pecas-botao-min" type="number" inputMode="numeric" min={0} max={50} step={1} value={minDigitado}
              onChange={(e) => setMinDigitado(e.target.value)} disabled={botao === null || salvandoBotao} data-testid="pecas-botao-min"
              className="w-20 min-h-[44px] rounded-lg bg-slate-900 border border-slate-600 px-3 text-white" />
            <button type="button" onClick={salvarMinimo} disabled={botao === null || salvandoBotao || minDigitado === String(botao?.minLojas)} data-testid="pecas-botao-min-salvar"
              className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold text-white bg-slate-600 hover:bg-slate-500 disabled:opacity-50">
              Salvar mínimo
            </button>
          </div>
          {erroBotao && <p role="alert" className="text-sm text-red-300 mt-1">{erroBotao}</p>}
        </div>
        <button type="button" role="switch" aria-checked={botao?.ativo === true} onClick={() => botao && salvarBotao({ ativo: !botao.ativo })} disabled={salvandoBotao || botao === null} data-testid="pecas-botao-pedido-interruptor"
          className={`inline-flex min-h-[44px] items-center rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50 ${botao?.ativo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-600 hover:bg-slate-500'}`}>
          {salvandoBotao ? 'Salvando…' : botao?.ativo ? 'Ligado — desligar' : 'Desligado — ligar'}
        </button>
      </div>

      {/* Interruptor do lote 4 (pagina publica das lojas) */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-white">Página pública das lojas (lote 4)</h2>
          <p className="text-sm text-slate-400 mt-1">
            {pubAtivo === null ? 'Carregando…' : pubAtivo
              ? 'Ligada: lojas que ligaram a página aparecem para visitantes (e no Google quando o perfil está completo).'
              : 'Desligada: só lojas de conta de teste têm página (sempre fora do Google).'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Ligar só depois do texto novo dos termos/privacidade e de 30 dias do aviso aos parceiros.</p>
          {erroPub && <p role="alert" className="text-sm text-red-300 mt-1">{erroPub}</p>}
        </div>
        <button type="button" role="switch" aria-checked={pubAtivo === true} onClick={alternarPub} disabled={salvandoPub || pubAtivo === null} data-testid="lojas-pagina-publica-interruptor"
          className={`inline-flex min-h-[44px] items-center rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50 ${pubAtivo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-600 hover:bg-slate-500'}`}>
          {salvandoPub ? 'Salvando…' : pubAtivo ? 'Ligada — desligar' : 'Desligada — ligar'}
        </button>
      </div>

      {/* Resumo de cadastro/atividade */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Lojas de peças</p>
          <p className="text-2xl font-bold text-white">{resumo.lojasAtivas} <span className="text-slate-500 text-base font-normal">/ {resumo.totalLojas} ativas</span></p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Oficinas fornecedoras</p>
          <p className="text-2xl font-bold text-white">{resumo.oficinasFornecedorasAtivas} <span className="text-slate-500 text-base font-normal">/ {resumo.totalOficinasFornecedoras} ativas</span></p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Logaram nos últimos 7 dias</p>
          <p className="text-2xl font-bold text-emerald-400">{resumo.ativosUltimos7Dias}</p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Nunca logaram</p>
          <p className="text-2xl font-bold text-red-400">{resumo.nuncaLogou}</p>
        </div>
      </div>

      {/* Uso do canal e comissao */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Cotações abertas</p>
          <p className="text-2xl font-bold text-white">{resumo.totalCotacoes} <span className="text-slate-500 text-base font-normal">({resumo.cotacoesRespondidas} respondidas)</span></p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Pedidos confirmados</p>
          <p className="text-2xl font-bold text-white">{resumo.pedidosConfirmados} <span className="text-slate-500 text-base font-normal">({resumo.pedidosEntregues} entregues)</span></p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Comissão pendente</p>
          <p className="text-2xl font-bold text-amber-400">
            {Object.keys(resumo.comissaoPendentePorMoeda).length === 0
              ? '—' // M5 (16/11): sem lancamento nao ha moeda (antes "R$ 0,00" para a Estonia)
              : Object.entries(resumo.comissaoPendentePorMoeda).map(([moeda, v]) => formatCurrency(v, moeda)).join(' + ')}
          </p>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-sm text-slate-400 mb-1">Comissão paga</p>
          <p className="text-2xl font-bold text-emerald-400">
            {Object.keys(resumo.comissaoPagaPorMoeda).length === 0
              ? '—' // M5 (16/11): sem lancamento nao ha moeda (antes "R$ 0,00" para a Estonia)
              : Object.entries(resumo.comissaoPagaPorMoeda).map(([moeda, v]) => formatCurrency(v, moeda)).join(' + ')}
          </p>
        </div>
      </div>

      {/* M5 (16/11): so pedidos cujo fornecedor tem taxa > 0 (com a regra isenta o alerta era falso) */}
      {resumo.entreguesSemComissao > 0 && (
        <div className="bg-amber-900/20 border border-amber-800 text-amber-300 p-4 rounded-lg text-sm">
          Há {resumo.entreguesSemComissao} pedido(s) entregue(s) com taxa acima de 0% e sem comissão lançada — vale investigar antes de decidir se o canal compensa.
        </div>
      )}

      {/* Tabela de fornecedores */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="font-semibold text-white">Fornecedores cadastrados</h2>
          <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
            {(['todos', 'loja', 'oficina'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filtro === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {f === 'todos' ? 'Todos' : f === 'loja' ? 'Lojas' : 'Oficinas'}
              </button>
            ))}
          </div>
        </div>
        {linhas.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-10">Nenhum fornecedor cadastrado ainda</p>
        ) : (
          <>
          {/* Celular: cartoes com o botao Ativar a vista */}
          <div className="md:hidden divide-y divide-slate-700">
            {[...linhas].sort((x, y) => Number(x.ativa) - Number(y.ativa)).map((f) => (
              <div key={`m-${f.tipo}-${f.id}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-semibold break-words">{f.nome_fantasia}</p>
                    <p className="text-xs text-slate-400">{f.tipo === 'loja' ? 'Loja de peças' : 'Oficina fornecedora'} · {f.cidade}, {f.estado}</p>
                    <p className="text-xs text-slate-400">Registro: {f.cnpj || '—'}</p>
                    <p className="text-xs text-slate-500 break-all">{f.email}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${f.ativa ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>{f.ativa ? 'Ativa' : 'Inativa'}</span>
                </div>
                {f.tipo === 'loja' && (
                  <button
                    onClick={() => alternarAtiva(f)}
                    disabled={ocupado === f.id}
                    className={`mt-3 w-full min-h-[44px] rounded-lg font-semibold disabled:opacity-50 ${f.ativa ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-600 text-white'}`}
                  >
                    {f.ativa ? 'Desativar' : 'Ativar'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-700">
                  <th className="text-left py-2.5 px-4 font-medium">Nome</th>
                  <th className="text-left py-2.5 px-4 font-medium">Tipo</th>
                  <th className="text-left py-2.5 px-4 font-medium">Local</th>
                  <th className="text-left py-2.5 px-4 font-medium">Status</th>
                  <th className="text-left py-2.5 px-4 font-medium">Cadastro</th>
                  <th className="text-left py-2.5 px-4 font-medium">Último login</th>
                  <th className="text-left py-2.5 px-4 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {linhas.map((f) => {
                  const login = formatUltimoLogin(f.ultimo_login);
                  return (
                    <tr key={`${f.tipo}-${f.id}`}>
                      <td className="py-2.5 px-4 text-white">{f.nome_fantasia}<p className="text-xs text-slate-500">{f.email}</p><p className="text-xs text-slate-500">Registro: {f.cnpj || '-'}</p></td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.tipo === 'loja' ? 'bg-orange-900/40 text-orange-300' : 'bg-sky-900/40 text-sky-300'}`}>
                          {f.tipo === 'loja' ? 'Loja de peças' : 'Oficina fornecedora'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">{f.cidade}, {f.estado}</td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.ativa ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                          {f.ativa ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">{new Date(f.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className={`py-2.5 px-4 font-medium ${login.classe}`}>{login.texto}</td>
                      <td className="py-2.5 px-4">
                        {f.tipo === 'loja' && (
                          <button
                            onClick={() => alternarAtiva(f)}
                            disabled={ocupado === f.id}
                            className={`font-medium disabled:opacity-50 ${f.ativa ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                          >
                            {f.ativa ? 'Desativar' : 'Ativar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <PedidosPecasAdmin />
      {/* lote 3 de pecas: entregas, avaliacoes e P-7 */}
      <PecasConfiancaAdmin />

      {/* lote 5 (20/11): Shop - interruptor e moderacao */}
      <PecasShopAdmin />
    </div>
  );
}
