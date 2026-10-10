'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { supabase } from '@/lib/supabase';
import { Link, useRouter } from '@/i18n/navigation';
import { calcDistance, cleanDescricao, rotuloTipoPedido, INTL_LOCALE } from '@/lib/utils';
import { TIPOS_SERVICO } from '@fixauto/shared';
import TutorialBanner from '@/components/tutorial/TutorialBanner';
import PerfilCompleto from '@/components/oficina/PerfilCompleto';
import ProcurarPedido from '@/components/oficina/ProcurarPedido';

// Caixa de pedidos: pagina inicial da oficina (auditoria do painel 10/10,
// docs/AUDITORIA_PAINEL_OFICINA_2026-10-10.md, secao C). Foco do produto:
// receber pedidos e mandar orcamento. Ordem = acidente > urgencia alta >
// quem espera ha mais tempo; contador verde/ambar/vermelho com icone e texto.

type Aba = 'responder' | 'respondidos' | 'encerrados';
const ABAS: Aba[] = ['responder', 'respondidos', 'encerrados'];
const MIN = 60e3, H = 60 * MIN;

const ehAcidente = (s: any) => !!s.emergencia_id || /\[TIPO:/.test(s.descricao || '');
const iconeTipo = (tipo: string) => TIPOS_SERVICO.find((x) => x.value === tipo)?.icon || '🔧';

export default function PedidosOficinaPage() {
  const t = useTranslations('oficinaPedidos');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const { oficina, funcionario } = useAuth();
  const router = useRouter();
  // mecanico nao orca: a pagina dele e Hoje (os carros dele)
  useEffect(() => { if (funcionario?.cargo === 'mecanico') router.replace('/oficina/hoje'); }, [funcionario, router]);
  const { solicitacoes, loading, refresh } = useSolicitacoes({ nearby: true });
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [agora, setAgora] = useState(() => Date.now());
  const [aba, setAbaState] = useState<Aba>('responder');
  const [carregou, setCarregou] = useState(false);

  useEffect(() => { const i = setInterval(() => setAgora(Date.now()), MIN); return () => clearInterval(i); }, []);
  // aba no endereco (?aba=respondidos): voltar ao pedido cai na mesma aba
  useEffect(() => { const a = new URLSearchParams(window.location.search).get('aba') as Aba; if (ABAS.includes(a)) setAbaState(a); }, []);
  const setAba = (a: Aba) => {
    setAbaState(a);
    try { const u = new URL(window.location.href); if (a === 'responder') u.searchParams.delete('aba'); else u.searchParams.set('aba', a); window.history.replaceState(window.history.state, '', u.toString()); } catch { /* so a aba */ }
  };
  useEffect(() => { if (!loading) setCarregou(true); }, [loading]);

  const carregarVistos = async () => {
    if (!oficina) return;
    const { data } = await supabase.from('pedido_vistos').select('solicitacao_id').eq('oficina_id', oficina.id);
    setVistos(new Set((data || []).map((v: any) => v.solicitacao_id)));
  };
  useEffect(() => { carregarVistos(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [oficina?.id]);

  // tempo real (migracao 060): pedido novo, orcamento enviado/aceito mudam a lista sem recarregar
  useEffect(() => {
    if (!oficina) return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const recarregar = () => { if (espera) clearTimeout(espera); espera = setTimeout(() => { refresh(); carregarVistos(); }, 600); };
    const canal = supabase.channel(`pedidos-oficina-${oficina.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos' }, recarregar)
      .subscribe();
    return () => { if (espera) clearTimeout(espera); supabase.removeChannel(canal); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oficina?.id]);

  const hojeYmd = new Date(agora).toISOString().slice(0, 10);
  const grupos = useMemo(() => {
    const g: Record<Aba, any[]> = { responder: [], respondidos: [], encerrados: [] };
    if (!oficina) return g;
    for (const s of solicitacoes as any[]) {
      const meu = (s.orcamentos || []).find((o: any) => o.oficina_id === oficina.id);
      const aberto = ['aberta', 'em_orcamento'].includes(s.status);
      if (!meu) { if (aberto) g.responder.push({ s }); continue; }
      const vencido = meu.status === 'expirado' || (meu.validade && meu.validade < hojeYmd && ['enviado', 'visualizado'].includes(meu.status));
      if (meu.status === 'aceito' && s.status !== 'concluida') g.respondidos.push({ s, meu, estado: 'aceito' });
      else if (meu.status === 'aceito') g.encerrados.push({ s, meu, estado: 'entregue' });
      else if (meu.status === 'recusado') g.encerrados.push({ s, meu, estado: 'recusado' });
      else if (vencido) g.encerrados.push({ s, meu, estado: 'expirado' });
      else if (!aberto) g.encerrados.push({ s, meu, estado: 'perdido' });
      else g.respondidos.push({ s, meu, estado: meu.status === 'visualizado' ? 'visto' : 'enviado' });
    }
    // para responder: acidente > urgencia alta > maior espera; pedido com mais de 48 h vai para o fim
    const peso = (s: any) => (agora - Date.parse(s.created_at) > 48 * H ? 3 : ehAcidente(s) ? 0 : s.urgencia === 'alta' ? 1 : 2);
    g.responder.sort((a, b) => peso(a.s) - peso(b.s) || Date.parse(a.s.created_at) - Date.parse(b.s.created_at));
    g.respondidos.sort((a, b) => (a.estado === 'aceito' ? 0 : 1) - (b.estado === 'aceito' ? 0 : 1) || Date.parse(b.meu.created_at) - Date.parse(a.meu.created_at));
    g.encerrados.sort((a, b) => Date.parse(b.meu.created_at) - Date.parse(a.meu.created_at));
    return g;
  }, [solicitacoes, oficina, agora, hojeYmd]);

  const duracao = (ms: number) => {
    const m = Math.max(0, Math.floor(ms / MIN));
    if (m < 60) return t('min', { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return m % 60 ? t('horasMin', { h, m: m % 60 }) : t('horas', { h });
    const d = Math.floor(h / 24);
    return h % 24 ? t('diasHoras', { d, h: h % 24 }) : t('dias', { d });
  };
  const contador = (s: any) => {
    const ms = agora - Date.parse(s.created_at);
    if (ms > 48 * H) return { cls: 'bg-gray-100 text-gray-700', icone: '⏱', txt: duracao(ms), dica: t('pedidoAntigo') };
    if (ms > 4 * H) return { cls: 'bg-red-100 text-red-800', icone: '⚠', txt: duracao(ms), dica: t('esperandoMuito', { tempo: duracao(ms) }) };
    if (ms > H) return { cls: 'bg-amber-100 text-amber-900', icone: '⏱', txt: duracao(ms), dica: t('esperandoHa', { tempo: duracao(ms) }) };
    return { cls: 'bg-emerald-100 text-emerald-800', icone: '⏱', txt: duracao(ms), dica: t('chegouHa', { tempo: duracao(ms) }) };
  };
  const fmtDia = useMemo(() => new Intl.DateTimeFormat(intl, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }), [intl]);
  const carroDe = (s: any) => { const v = s.veiculo; return v ? [v.fipe_marca, v.fipe_modelo, v.fipe_ano].filter(Boolean).join(' ') : ''; };
  const distancia = (s: any) => (oficina?.latitude != null && s.latitude != null ? calcDistance(s.latitude, s.longitude, oficina.latitude, oficina.longitude) : null);

  const lista = grupos[aba];
  const algumVermelho = grupos.responder.some(({ s }) => { const ms = agora - Date.parse(s.created_at); return ms > 4 * H && ms <= 48 * H; });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-8">
      <TutorialBanner href="/oficina/aprender" storageKey="bipfix_tutorial_banner_oficina" />
      <PerfilCompleto compacto />
      {(oficina as { ativa?: boolean } | null)?.ativa === false && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('cadastroEmAnalise')}</p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
        <Link href="/oficina/checkin" className="btn-secondary !py-2 text-sm whitespace-nowrap">{t('carroSemPedido')}</Link>
      </div>
      <p className="text-gray-600 mb-5">{t('incentivo')}</p>
      <ProcurarPedido compacto />

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 mb-5" role="tablist" aria-label={t('titulo')}>
        {ABAS.map((a) => (
          <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)}
            className={`min-h-[44px] rounded-lg px-2 text-sm font-medium leading-tight ${aba === a ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>
            {t(`aba_${a}`)}{a !== 'encerrados' && grupos[a].length > 0 && (
              <span className={`ml-1.5 inline-block min-w-[1.5rem] rounded-full px-1.5 text-xs font-semibold ${a === 'responder' && algumVermelho ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-800'}`}>{grupos[a].length}</span>
            )}
          </button>
        ))}
      </div>

      {!carregou ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : lista.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-4xl mb-3" aria-hidden="true">{aba === 'responder' ? '📭' : '🗂️'}</p>
          <p className="text-gray-700 mb-4">{t(`vazio_${aba}`)}</p>
          {aba === 'responder' && <button type="button" onClick={() => setAba('respondidos')} className="btn-secondary">{t('verRespondidos')}</button>}
        </div>
      ) : (
        <ul className="space-y-3">
          {lista.map(({ s, meu, estado }: any) => {
            const acidente = ehAcidente(s);
            const novo = aba === 'responder' && !vistos.has(s.id);
            const c = aba === 'responder' ? contador(s) : null;
            const vermelho = c?.cls.includes('red');
            const dist = distancia(s);
            const fotos = (s.fotos || []).length;
            const slot = meu?.disponibilidade?.find((d: any) => d.id === meu.disponibilidade_escolhida_id);
            return (
              <li key={s.id} className={`card !p-4 ${acidente || vermelho ? 'border-l-4 !border-l-red-500' : ''}`} data-testid="pedido-cartao">
                <Link href={`/oficina/pedidos/${s.id}`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <p className={`min-w-0 text-base ${novo ? 'font-bold' : 'font-medium'} text-gray-900`}>
                      {acidente && <span className="mr-1.5 inline-block rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold uppercase text-white">🚨 {t('acidente')}</span>}
                      <span aria-hidden="true">{iconeTipo(s.tipo)} </span>{rotuloTipoPedido(tc, s.tipo, s.descricao)}{carroDe(s) ? ` · ${carroDe(s)}` : ''}
                      {s.numero && <span className="ml-1.5 text-sm font-normal text-gray-500">{tc('numeroPedido', { n: s.numero })}</span>}
                    </p>
                    {c && (
                      <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold ${c.cls}`} title={c.dica} aria-label={c.dica} data-testid="contador">
                        <span aria-hidden="true">{c.icone} </span>{c.txt}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">{cleanDescricao(s.descricao)}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {[fotos ? t('fotos', { n: fotos }) : t('semFotos'), dist != null ? `${dist.toFixed(1)} km` : null, s.pagamento_reparo && s.pagamento_reparo !== 'proprio' ? `🛡 ${t('seguro')}` : null, novo ? `● ${t('novo')}` : null].filter(Boolean).join(' · ')}
                  </p>
                  {estado && (
                    <p className={`mt-2 text-sm font-medium ${estado === 'aceito' ? 'text-emerald-700' : estado === 'perdido' || estado === 'recusado' ? 'text-gray-600' : estado === 'expirado' ? 'text-amber-800' : 'text-gray-700'}`}>
                      {estado === 'aceito' ? `✔ ${t('clienteAceitou')}${slot ? ` — ${t('chegaEm', { dia: fmtDia.format(new Date(`${slot.data_checkin}T12:00:00Z`)), periodo: t(slot.turno === 'tarde' ? 'tarde' : 'manha') })}` : ''}`
                        : estado === 'entregue' ? `✔ ${t('servicoEntregue')}`
                        : estado === 'recusado' ? t('clienteRecusou')
                        : estado === 'expirado' ? t('orcamentoVenceu')
                        : estado === 'perdido' ? t('outraOficina')
                        : `✔ ${t('respondidoEm', { tempo: duracao(Date.parse(meu.created_at) - Date.parse(s.created_at)) })} · ${estado === 'visto' ? t('clienteViu') : t('clienteNaoDecidiu')}`}
                    </p>
                  )}
                </Link>
                {aba === 'responder' && (
                  <Link href={`/oficina/orcamento/${s.id}`} className="btn-primary mt-3 flex min-h-[48px] w-full items-center justify-center sm:w-auto sm:inline-flex sm:px-6" data-testid="fazer-orcamento">
                    {t('fazerOrcamento')} ›
                  </Link>
                )}
                {aba === 'respondidos' && estado === 'aceito' && (
                  <Link href="/oficina/hoje" className="btn-secondary mt-3 inline-flex min-h-[44px] items-center">{t('verEmHoje')} ›</Link>
                )}
                {aba === 'encerrados' && ['recusado', 'expirado'].includes(estado) && ['aberta', 'em_orcamento'].includes(s.status) && (
                  <Link href={`/oficina/orcamento/${s.id}`} className="btn-secondary mt-3 inline-flex min-h-[44px] items-center">{t('novoOrcamento')} ›</Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
