'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';

type Modo = 'isento' | 'fixa' | 'desempenho';

interface Global {
  comissao_servicos_modo: Modo;
  comissao_servicos_taxa: number;
  comissao_pecas_modo: Modo;
  comissao_pecas_taxa: number;
  updated_at?: string;
}

interface Linha {
  oficina_id: string;
  oficina: {
    id: string;
    nome_fantasia: string;
    cidade: string;
    estado: string;
    pais: string | null;
    ativa: boolean;
    parceiro_fundador: boolean;
    parceiro_fundador_desde: string | null;
  };
  individual: { taxa: number | null; ate: string | null; motivo: string | null; vigente: boolean } | null;
  taxa_calculada: number | null;
  efetiva: { taxa: number; origem: 'individual' | 'global' };
  total_pendente: number;
  total_pago: number;
}

const MODO_LABEL: Record<Modo, string> = {
  isento: 'Sem comissão (fase de fundadores)',
  fixa: 'Taxa fixa para todos',
  desempenho: 'Por desempenho (5–15%)',
};

const pct = (t: number) => `${(t * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const paraTaxa = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 10000 : NaN;
};
const dataBR = (iso: string) => formatDate(iso + (iso.length === 10 ? 'T12:00:00' : ''));

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

const input = 'bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full';
const botao = 'bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors';

export default function AdminComissoesPage() {
  const [global, setGlobal] = useState<Global | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'fundadoras' | 'individual'>('todas');

  // Formulario da regra global
  const [gServModo, setGServModo] = useState<Modo>('isento');
  const [gServTaxa, setGServTaxa] = useState('10');
  const [gPecModo, setGPecModo] = useState<Modo>('isento');
  const [gPecTaxa, setGPecTaxa] = useState('3');
  const [gMotivo, setGMotivo] = useState('');

  // Oferta para fundadoras
  const [oTaxa, setOTaxa] = useState('0');
  const [oAte, setOAte] = useState('');
  const [oMotivo, setOMotivo] = useState('');

  // Edicao da taxa individual (uma oficina por vez)
  const [editando, setEditando] = useState<string | null>(null);
  const [iTaxa, setITaxa] = useState('');
  const [iAte, setIAte] = useState('');
  const [iMotivo, setIMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/comissao');
      if (!res.ok) throw new Error('Erro ao buscar comissões');
      const data = await res.json();
      setGlobal(data.global);
      setLinhas(data.oficinas);
      setGServModo(data.global.comissao_servicos_modo);
      setGServTaxa(String(data.global.comissao_servicos_taxa * 100));
      setGPecModo(data.global.comissao_pecas_modo);
      setGPecTaxa(String(data.global.comissao_pecas_taxa * 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const enviar = async (body: Record<string, unknown>, ok: string) => {
    setSalvando(true);
    setMsg(null);
    const res = await fetch('/api/admin/comissao', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const r = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) {
      setMsg(r.error || 'Erro ao salvar');
      return false;
    }
    setMsg(typeof ok === 'string' ? ok.replace('{n}', String(r.oficinas ?? '')) : ok);
    await carregar();
    return true;
  };

  const salvarGlobal = () => {
    const servicos_taxa = paraTaxa(gServTaxa);
    const pecas_taxa = paraTaxa(gPecTaxa);
    if (!Number.isFinite(servicos_taxa) || !Number.isFinite(pecas_taxa)) return setMsg('Taxa inválida');
    enviar(
      { acao: 'global', servicos_modo: gServModo, servicos_taxa, pecas_modo: gPecModo, pecas_taxa, motivo: gMotivo },
      'Regra global salva. Vale para toda oficina sem taxa individual.'
    ).then((ok) => ok && setGMotivo(''));
  };

  const aplicarOferta = () => {
    const taxa = paraTaxa(oTaxa);
    if (!Number.isFinite(taxa)) return setMsg('Taxa inválida');
    const n = linhas.filter((l) => l.oficina.parceiro_fundador).length;
    if (!confirm(`Aplicar ${pct(taxa)}${oAte ? ` até ${dataBR(oAte)}` : ' sem prazo'} às ${n} oficina(s) fundadora(s)? Substitui a taxa individual que elas tiverem.`)) return;
    enviar({ acao: 'oferta_fundadores', taxa, ate: oAte || null, motivo: oMotivo }, 'Oferta aplicada a {n} oficina(s) fundadora(s).');
  };

  const abrirEdicao = (l: Linha) => {
    setEditando(l.oficina_id);
    setITaxa(l.individual?.taxa != null ? String(l.individual.taxa * 100) : '');
    setIAte(l.individual?.ate || '');
    setIMotivo(l.individual?.motivo || '');
  };

  const salvarIndividual = async (oficinaId: string) => {
    const taxa = paraTaxa(iTaxa);
    if (!Number.isFinite(taxa)) return setMsg('Taxa inválida');
    if (await enviar({ acao: 'individual', oficina_id: oficinaId, taxa, ate: iAte || null, motivo: iMotivo }, 'Taxa individual salva.')) setEditando(null);
  };

  const removerIndividual = async (oficinaId: string) => {
    if (!confirm('Remover a taxa individual? A oficina volta a seguir a regra global.')) return;
    if (await enviar({ acao: 'individual', oficina_id: oficinaId, taxa: null }, 'Taxa individual removida.')) setEditando(null);
  };

  const alternarFundador = (l: Linha) => {
    const valor = !l.oficina.parceiro_fundador;
    if (!confirm(valor ? `Marcar ${l.oficina.nome_fantasia} como parceira fundadora?` : `Tirar o selo de fundadora de ${l.oficina.nome_fantasia}?`)) return;
    enviar({ acao: 'fundador', oficina_id: l.oficina_id, valor }, valor ? 'Marcada como parceira fundadora.' : 'Selo de fundadora removido.');
  };

  const visiveis = useMemo(
    () => linhas.filter((l) =>
      filtro === 'fundadoras' ? l.oficina.parceiro_fundador : filtro === 'individual' ? !!l.individual : true
    ),
    [linhas, filtro]
  );
  const nFundadoras = linhas.filter((l) => l.oficina.parceiro_fundador).length;
  const nIndividual = linhas.filter((l) => l.individual?.vigente).length;

  if (loading && !global) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-48" />
        <div className="h-64 bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (error || !global) {
    return <div className="bg-red-900/20 border border-red-800 text-red-300 p-4 rounded-lg">{error}</div>;
  }

  const descreverGlobal = (modo: Modo, taxa: number) =>
    modo === 'isento' ? 'Sem comissão (0%)' : modo === 'fixa' ? `Taxa fixa ${pct(taxa)}` : 'Por desempenho (5–15%)';

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold text-white mb-2">Comissões</h1>
      <p className="text-slate-400 text-sm mb-6">
        Hoje vale para as oficinas: <strong className="text-white">{descreverGlobal(global.comissao_servicos_modo, global.comissao_servicos_taxa)}</strong>
        {' · '}peças: <strong className="text-white">{descreverGlobal(global.comissao_pecas_modo, global.comissao_pecas_taxa)}</strong>
        {' · '}{nIndividual} oficina(s) com taxa individual · {nFundadoras} fundadora(s)
      </p>

      {/* Como a taxa e decidida */}
      <div className="grid md:grid-cols-[1fr_auto_1fr] items-stretch gap-3 mb-8">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-amber-300 text-xs font-semibold uppercase tracking-wide">1º · Taxa individual</p>
          <p className="text-slate-300 text-sm mt-1">Definida por você para uma oficina (oferta, acordo). <strong className="text-white">Vale sobre a global</strong> até a data de término.</p>
        </div>
        <div className="hidden md:flex items-center text-slate-500 text-sm">senão →</div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide">2º · Regra global</p>
          <p className="text-slate-300 text-sm mt-1">Vale para toda oficina sem taxa individual (ou com a individual vencida).</p>
        </div>
      </div>

      {msg && <div className="bg-slate-800 border border-slate-600 text-slate-200 text-sm px-4 py-3 rounded-lg mb-6">{msg}</div>}

      <div className="grid lg:grid-cols-2 gap-4 mb-8">
        {/* Regra global */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="text-white font-semibold">Regra global</h2>
          <div className="grid sm:grid-cols-[1fr_110px] gap-3">
            <Campo label="Serviços das oficinas">
              <select className={input} value={gServModo} onChange={(e) => setGServModo(e.target.value as Modo)}>
                {Object.entries(MODO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="Taxa (%)">
              <input className={input} value={gServTaxa} onChange={(e) => setGServTaxa(e.target.value)} disabled={gServModo !== 'fixa'} inputMode="decimal" />
            </Campo>
            <Campo label="Venda de peças">
              <select className={input} value={gPecModo} onChange={(e) => setGPecModo(e.target.value as Modo)}>
                {Object.entries(MODO_LABEL).map(([k, v]) => <option key={k} value={k}>{k === 'desempenho' ? 'Por desempenho (1–3%)' : v}</option>)}
              </select>
            </Campo>
            <Campo label="Taxa (%)">
              <input className={input} value={gPecTaxa} onChange={(e) => setGPecTaxa(e.target.value)} disabled={gPecModo !== 'fixa'} inputMode="decimal" />
            </Campo>
          </div>
          <Campo label="Motivo (fica no histórico)">
            <input className={input} value={gMotivo} onChange={(e) => setGMotivo(e.target.value)} placeholder="Ex.: fim da fase de fundadores" />
          </Campo>
          <p className="text-xs text-slate-500">
            O site promete 0% na fase de fundadores e 30 dias de aviso antes de qualquer mudança. Avise as oficinas antes de sair de &quot;Sem comissão&quot;.
          </p>
          <button className={botao} onClick={salvarGlobal} disabled={salvando}>Salvar regra global</button>
        </div>

        {/* Oferta para fundadoras */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="text-white font-semibold">⭐ Oferta para parceiras fundadoras</h2>
          <p className="text-slate-400 text-sm">
            Dá a mesma taxa individual a todas as {nFundadoras} oficina(s) com o selo de fundadora. Ex.: 0% por 12 meses depois que a regra global passar a cobrar.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo label="Taxa (%)">
              <input className={input} value={oTaxa} onChange={(e) => setOTaxa(e.target.value)} inputMode="decimal" />
            </Campo>
            <Campo label="Válida até (vazio = sem prazo)">
              <input type="date" className={input} value={oAte} onChange={(e) => setOAte(e.target.value)} />
            </Campo>
          </div>
          <Campo label="Motivo">
            <input className={input} value={oMotivo} onChange={(e) => setOMotivo(e.target.value)} placeholder="Ex.: Oferta de lançamento para fundadoras" />
          </Campo>
          <button className={botao} onClick={aplicarOferta} disabled={salvando || nFundadoras === 0}>
            Aplicar às {nFundadoras} fundadora(s)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {([
          ['todas', `Todas (${linhas.length})`],
          ['fundadoras', `⭐ Fundadoras (${nFundadoras})`],
          ['individual', `Com taxa individual (${linhas.filter((l) => l.individual).length})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={`text-sm px-3 py-1.5 rounded-full border ${filtro === k ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <p className="text-slate-400">{linhas.length === 0 ? 'Nenhuma oficina cadastrada ainda.' : 'Nenhuma oficina neste filtro.'}</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-700 text-xs font-medium text-slate-400 uppercase tracking-wider">
                <th className="text-left px-5 py-3">Oficina</th>
                <th className="text-left px-5 py-3">Taxa que vale hoje</th>
                <th className="text-left px-5 py-3">Taxa individual</th>
                <th className="text-right px-5 py-3">Pendente</th>
                <th className="text-right px-5 py-3">Pago</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {visiveis.map((l) => {
                const moeda = currencyForCountry(l.oficina.pais);
                const vencida = l.individual && !l.individual.vigente;
                return (
                  <tr key={l.oficina_id} className="align-top hover:bg-slate-700/30">
                    <td className="px-5 py-4">
                      <p className="text-white font-medium text-sm">{l.oficina.nome_fantasia}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{l.oficina.cidade}, {l.oficina.estado}{!l.oficina.ativa && ' · inativa'}</p>
                      <button
                        onClick={() => alternarFundador(l)}
                        disabled={salvando}
                        className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                          l.oficina.parceiro_fundador
                            ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300'
                            : 'border-slate-600 text-slate-500 hover:text-slate-300'
                        }`}
                        title={l.oficina.parceiro_fundador && l.oficina.parceiro_fundador_desde ? `Fundadora desde ${formatDate(l.oficina.parceiro_fundador_desde)}` : 'Clique para marcar como fundadora'}
                      >
                        {l.oficina.parceiro_fundador ? '⭐ Fundadora' : '☆ Marcar fundadora'}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-white font-semibold text-lg">{pct(l.efetiva.taxa)}</p>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          l.efetiva.origem === 'individual' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
                        }`}
                      >
                        {l.efetiva.origem === 'individual' ? 'Individual' : `Global · ${global.comissao_servicos_modo === 'isento' ? 'sem comissão' : global.comissao_servicos_modo === 'fixa' ? 'fixa' : 'desempenho'}`}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm">
                      {editando === l.oficina_id ? (
                        <div className="space-y-2 w-64">
                          <div className="grid grid-cols-2 gap-2">
                            <input className={input} value={iTaxa} onChange={(e) => setITaxa(e.target.value)} placeholder="% ex.: 0" inputMode="decimal" />
                            <input type="date" className={input} value={iAte} onChange={(e) => setIAte(e.target.value)} title="Válida até (vazio = sem prazo)" />
                          </div>
                          <input className={input} value={iMotivo} onChange={(e) => setIMotivo(e.target.value)} placeholder="Motivo (ex.: acordo de parceria)" />
                          <div className="flex gap-2">
                            <button className={botao} onClick={() => salvarIndividual(l.oficina_id)} disabled={salvando || iTaxa === ''}>Salvar</button>
                            {l.individual && (
                              <button className="text-red-400 hover:text-red-300 text-sm" onClick={() => removerIndividual(l.oficina_id)} disabled={salvando}>Remover</button>
                            )}
                            <button className="text-slate-400 hover:text-white text-sm" onClick={() => setEditando(null)}>Cancelar</button>
                          </div>
                        </div>
                      ) : l.individual ? (
                        <div>
                          <p className={vencida ? 'text-slate-500 line-through' : 'text-white'}>
                            {l.individual.taxa != null ? pct(l.individual.taxa) : '—'}
                          </p>
                          <p className="text-xs text-slate-400">
                            {l.individual.ate ? `${vencida ? 'venceu em' : 'até'} ${dataBR(l.individual.ate)}` : 'sem prazo'}
                            {l.individual.motivo && ` · ${l.individual.motivo}`}
                          </p>
                          <button className="text-blue-400 hover:text-blue-300 text-xs mt-1" onClick={() => abrirEdicao(l)}>Editar</button>
                        </div>
                      ) : (
                        <button className="text-blue-400 hover:text-blue-300 text-xs" onClick={() => abrirEdicao(l)}>+ Definir taxa individual</button>
                      )}
                    </td>
                    <td className={`px-5 py-4 text-right text-sm ${l.total_pendente > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {formatCurrency(l.total_pendente, moeda)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-emerald-400">{formatCurrency(l.total_pago, moeda)}</td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/admin/oficinas/${l.oficina_id}`} className="text-blue-400 hover:text-blue-300 text-sm">Detalhes</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500 mt-6">
        Toda alteração nesta página fica registrada em <Link href="/admin/auditoria" className="text-blue-400 hover:underline">Histórico do admin</Link>.
      </p>
    </div>
  );
}
