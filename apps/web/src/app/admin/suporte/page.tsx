'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { timeAgo } from '@/lib/utils';
import { Presenca } from '@/components/admin/Presenca';

// Chat de suporte (dono 03/11): conversas com oficinas, lojas, clientes e
// visitantes. A mensagem da pessoa aparece traduzida para o portugues (com
// "ver original"); a resposta vai traduzida para a lingua dela quando a
// traducao esta no modo automatico. No modo manual (dono 03/11) o admin toca
// "Traduzir" na mensagem recebida e marca, a cada resposta, se ela vai traduzida. Com esta pagina (ou qualquer outra do admin) aberta,
// o admin conta como "online" e nao sai a mensagem automatica.
// Visual (dono 03/11 "parece feinha", sugestao do Fable): caixa de entrada escura
// como o resto do admin, lista | conversa no computador e uma de cada vez no celular.
// 19/11 (dono): o admin tambem COMECA uma conversa com uma oficina/loja/cliente
// ("Nova conversa" aqui, "Escrever a oficina" nas telas da oficina/pedido/usuarios ->
// ?profile=<id>) e ve "online agora / visto ha X" de quem tem conta (migracao 101).
// 20/11 (dono, recomendacao Fable): "Arquivar" tira da lista Ativas sem apagar nada (volta
// sozinha quando a pessoa escreve ou o admin responde); "Excluir" so aparece na conversa SEM
// nenhuma mensagem (ex.: "Nova conversa" aberta por engano). Aba "Arquivadas" (?arquivadas=1).

interface Conversa { id: string; idioma: string; pagina: string | null; ultima: string; naoLidas: number; nome: string; email: string; tipo: string; profileId: string | null; codigo: number | null; vistoEm: string | null; arquivadaEm: string | null; vazia: boolean; previa: { autor: string; texto: string } | null }
interface ContaBusca { id: string; nome: string; email: string; tipo: string; codigo: number | null; idioma: string; ativo: boolean; empresa: string | null }
interface Msg { id: string; autor: 'usuario' | 'admin' | 'auto'; texto: string; traducao: string | null; origem: string | null; created_at: string }
type Aviso = { tom: 'alerta' | 'info' | 'erro'; texto: string };

// nome da lingua no cabecalho/rodape; na lista so o codigo (bandeira em emoji nao aparece no Windows)
const IDIOMA: Record<string, string> = { et: 'estoniano', ru: 'russo', en: 'inglês', it: 'italiano', 'pt-PT': 'português (PT)', pt: 'português' };
// "traduzido do russo": origem do DeepL (RU, ET, EN-GB...) -> lingua do site
const DE_ORIGEM: Record<string, string> = { RU: 'russo', ET: 'estoniano', EN: 'inglês', IT: 'italiano', PT: 'português', UK: 'ucraniano', FI: 'finlandês', DE: 'alemão', LV: 'letão', LT: 'lituano' };
const TIPO: Record<string, string> = { oficina: 'Oficina', loja_pecas: 'Loja', cliente: 'Cliente', visitante: 'Visitante' };
const COR: Record<string, string> = {
  oficina: 'bg-blue-500/20 text-blue-300', loja_pecas: 'bg-purple-500/20 text-purple-300',
  cliente: 'bg-emerald-500/20 text-emerald-300', visitante: 'bg-slate-600 text-slate-200',
};
const TOM: Record<Aviso['tom'], string> = {
  alerta: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  erro: 'border-red-500/30 bg-red-500/10 text-red-300',
};
const chip = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium';

const iniciais = (nome: string) => {
  const p = (nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dia = (d: string) => {
  const x = new Date(d); const hoje = new Date(); const ontem = new Date(Date.now() - 86400000);
  if (x.toDateString() === hoje.toDateString()) return 'hoje';
  if (x.toDateString() === ontem.toDateString()) return 'ontem';
  return x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
const nomeOrigem = (o: string | null) => (o ? DE_ORIGEM[o.split('-')[0].toUpperCase()] || o : '?');

function Avatar({ c, tamanho = 'h-10 w-10' }: { c: Conversa; tamanho?: string }) {
  return <span className={`${tamanho} flex shrink-0 items-center justify-center rounded-full text-sm font-semibold ${COR[c.tipo] || COR.visitante}`} aria-hidden="true">{iniciais(c.nome)}</span>;
}

function IconeChat({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

export default function SuporteAdminPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Carregando...</div>}>
      <SuporteAdmin />
    </Suspense>
  );
}

function SuporteAdmin() {
  const busca = useSearchParams();
  const router = useRouter();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  // aba Arquivadas (no endereco: sobrevive ao F5)
  const verArquivadas = busca?.get('arquivadas') === '1';
  const [totalArquivadas, setTotalArquivadas] = useState(0);
  const [mexendo, setMexendo] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [traducao, setTraducao] = useState(true);
  const [modoAberto, setModoAberto] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [traduzirResposta, setTraduzirResposta] = useState(true);
  const [traduzindo, setTraduzindo] = useState<string | null>(null);
  // aviso no topo da lista (depois de arquivar/excluir a conversa fecha)
  const [avisoLista, setAvisoLista] = useState('');
  useEffect(() => { if (!avisoLista) return; const t = setTimeout(() => setAvisoLista(''), 6000); return () => clearTimeout(t); }, [avisoLista]);
  const [verOriginal, setVerOriginal] = useState<Record<string, boolean>>({});
  // nova conversa comecada pelo admin (dono 19/11): caixa de busca de contas
  const [novaAberta, setNovaAberta] = useState(false);
  const [novaBusca, setNovaBusca] = useState('');
  const [novaContas, setNovaContas] = useState<ContaBusca[] | null>(null);
  const [iniciando, setIniciando] = useState<string | null>(null);
  // a caixa "traduzir esta resposta" volta a marcada em cada conversa aberta;
  // a conversa anterior nao pisca enquanto a nova carrega
  // (o rascunho tambem: nao manda para B o que foi escrito para A)
  const abertaRef = useRef<string | null>(null);
  useEffect(() => { abertaRef.current = aberta; setTraduzirResposta(true); setMsgs(null); setVerOriginal({}); setAvisos([]); setTexto(''); }, [aberta]);
  const fimRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const abaRef = useRef(verArquivadas);
  abaRef.current = verArquivadas;
  const carregarLista = useCallback(async () => {
    const aba = verArquivadas;
    const r = await fetch(`/api/admin/suporte${aba ? '?arquivadas=1' : ''}`).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    // resposta atrasada da outra aba: ignora
    if (aba !== abaRef.current) return;
    setConversas(d.conversas || []); setTraducao(!!d.traducao); setTotalArquivadas(d.totalArquivadas || 0); setCarregado(true);
  }, [verArquivadas]);
  const irParaAba = (arq: boolean) => {
    if (arq === verArquivadas) return;
    setCarregado(false); setConversas([]); setAberta(null);
    router.replace(arq ? '/admin/suporte?arquivadas=1' : '/admin/suporte');
  };
  const carregarConversa = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/suporte/${id}`).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    // resposta atrasada da conversa anterior: ignora
    if (id === abertaRef.current) setMsgs(d.mensagens || []);
  }, []);

  useEffect(() => { carregarLista(); const i = setInterval(carregarLista, 10000); return () => clearInterval(i); }, [carregarLista]);

  // comecar (ou abrir) a conversa de uma conta: a mesma conversa do balao do site (uma por conta)
  const iniciarCom = useCallback(async (profileId: string) => {
    setIniciando(profileId);
    const r = await fetch('/api/admin/suporte/iniciar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId }) }).catch(() => null);
    setIniciando(null);
    const d = r?.ok ? await r.json() : null;
    if (!d?.conversaId) { setAvisos([{ tom: 'erro', texto: 'Não foi possível abrir a conversa com esta conta.' }]); return; }
    setNovaAberta(false); setNovaBusca(''); setNovaContas(null);
    // a conversa (nova ou desarquivada) esta em Ativas
    if (abaRef.current) { router.replace('/admin/suporte'); setCarregado(false); setConversas([]); } else await carregarLista();
    setAberta(d.conversaId);
    if (d.desarquivada) setTimeout(() => setAvisos([{ tom: 'info', texto: 'Esta conversa estava arquivada e voltou para Ativas.' }]), 0);
  }, [carregarLista, router]);
  // ?profile=<id> vindo de "Escrever a oficina" (oficina, pedido, usuarios): abre direto
  const profileParam = busca?.get('profile') || null;
  useEffect(() => {
    if (!profileParam) return;
    iniciarCom(profileParam);
    router.replace('/admin/suporte');
  }, [profileParam, iniciarCom, router]);
  // busca de contas para a nova conversa (nome, e-mail, oficina/loja, nº do cliente)
  useEffect(() => {
    if (!novaAberta) return;
    const q = novaBusca.trim();
    if (q.length < 2) { setNovaContas(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/admin/suporte/iniciar?q=${encodeURIComponent(q)}`).catch(() => null);
      if (r?.ok) setNovaContas((await r.json()).contas || []);
    }, 300);
    return () => clearTimeout(t);
  }, [novaAberta, novaBusca]);
  useEffect(() => {
    if (!aberta) return;
    carregarConversa(aberta);
    const i = setInterval(() => carregarConversa(aberta), 4000);
    return () => clearInterval(i);
  }, [aberta, carregarConversa]);
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length, aberta]);
  // campo cresce com o texto (ate max-h-40)
  useEffect(() => {
    const c = campoRef.current; if (!c) return;
    c.style.height = 'auto'; c.style.height = `${c.scrollHeight}px`;
  }, [texto, aberta]);

  async function mudarTraducao(novo: boolean) {
    if (novo === traducao) return;
    // muda na hora; volta se o servidor recusar
    setTraducao(novo);
    const r = await fetch('/api/admin/suporte', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traducao: novo }) }).catch(() => null);
    if (!r?.ok) { setTraducao(!novo); setAvisos([{ tom: 'erro', texto: 'Não foi possível mudar a tradução.' }]); }
  }

  async function responder() {
    const cAtual = conversas.find((c) => c.id === aberta);
    const linguaOutra = !!cAtual && !cAtual.idioma.startsWith('pt');
    if (!aberta || !texto.trim() || enviando) return;
    setEnviando(true); setAvisos([]);
    const r = await fetch(`/api/admin/suporte/${aberta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, traduzir: linguaOutra && traduzirResposta }) }).catch(() => null);
    setEnviando(false);
    if (!r?.ok) { setAvisos([{ tom: 'erro', texto: 'Não foi possível enviar.' }]); return; }
    const d = await r.json();
    setTexto('');
    const novos: Aviso[] = [];
    if (d.semTraducao) novos.push({ tom: 'alerta', texto: 'Atenção: a mensagem foi SEM tradução (DeepL sem resposta ou limite do dia).' });
    if (d.porEmail) novos.push({ tom: 'info', texto: 'A pessoa não está com o chat aberto: a resposta foi também por e-mail.' });
    setAvisos(novos);
    carregarConversa(aberta); carregarLista();
  }

  // arquivar / desarquivar (dados ficam) e excluir (so conversa sem nenhuma mensagem)
  async function arquivar(arq: boolean) {
    if (!aberta || mexendo) return;
    setMexendo(true); setAvisos([]);
    const r = await fetch(`/api/admin/suporte/${aberta}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: arq ? 'arquivar' : 'desarquivar' }) }).catch(() => null);
    setMexendo(false);
    if (!r?.ok) { setAvisos([{ tom: 'erro', texto: arq ? 'Não foi possível arquivar.' : 'Não foi possível desarquivar.' }]); return; }
    const id = aberta;
    setConversas((cs) => cs.filter((c) => c.id !== id));
    setTotalArquivadas((n) => Math.max(0, n + (arq ? 1 : -1)));
    setAberta(null);
    setAvisoLista(arq ? 'Conversa arquivada. Ela volta para Ativas se a pessoa escrever.' : 'Conversa de volta em Ativas.');
    carregarLista();
  }
  async function excluir() {
    if (!aberta || mexendo) return;
    if (!window.confirm('Excluir esta conversa vazia? Não há mensagens.')) return;
    setMexendo(true); setAvisos([]);
    const r = await fetch(`/api/admin/suporte/${aberta}`, { method: 'DELETE' }).catch(() => null);
    setMexendo(false);
    if (r?.status === 409) { setAvisos([{ tom: 'alerta', texto: 'A conversa já tem mensagens — use Arquivar.' }]); carregarLista(); carregarConversa(aberta); return; }
    if (!r?.ok && r?.status !== 404) { setAvisos([{ tom: 'erro', texto: 'Não foi possível excluir.' }]); return; }
    const id = aberta;
    setConversas((cs) => cs.filter((c) => c.id !== id));
    setAberta(null);
    setAvisoLista('Conversa vazia excluída.');
    carregarLista();
  }

  // modo manual: traduz uma mensagem recebida para o portugues (fica guardada nela)
  async function traduzirRecebida(mensagemId: string) {
    if (!aberta) return;
    setTraduzindo(mensagemId); setAvisos([]);
    const r = await fetch(`/api/admin/suporte/${aberta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'traduzir', mensagemId }) }).catch(() => null);
    setTraduzindo(null);
    if (!r?.ok) { setAvisos([{ tom: 'erro', texto: 'Não foi possível traduzir agora (DeepL sem resposta ou limite do dia).' }]); return; }
    carregarConversa(aberta);
  }

  const conv = conversas.find((c) => c.id === aberta);
  // outra lingua que nao o portugues: oferece traduzir a resposta (modo manual)
  const linguaOutra = !!conv && !conv.idioma.startsWith('pt');
  const porResponder = verArquivadas ? 0 : conversas.filter((c) => c.naoLidas > 0).length;
  // excluir: so sem nenhuma mensagem (a lista diz; a tela aberta confirma com as mensagens carregadas)
  const podeExcluir = !!conv && conv.vazia && msgs !== null && msgs.length === 0;

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] overflow-hidden rounded-xl border border-slate-700 bg-slate-800 sm:h-[calc(100dvh-6.5rem)] md:h-[calc(100dvh-4rem)]">
      {/* ---------- lista */}
      <section className={`min-h-0 w-full flex-col border-slate-700 md:flex md:w-80 md:shrink-0 md:border-r lg:w-[360px] ${aberta ? 'hidden' : 'flex'}`} aria-label="Conversas">
        <div className="border-b border-slate-700 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="font-semibold text-white">Suporte</h1>
              {porResponder > 0 && <p className="text-xs text-slate-400">{porResponder} por responder</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => { setNovaAberta((v) => !v); setNovaBusca(''); setNovaContas(null); }} aria-expanded={novaAberta} data-testid="suporte-nova-conversa"
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-primary-600 px-2 py-1 text-xs font-medium text-white hover:bg-primary-500">
                + Nova conversa
              </button>
              <button type="button" onClick={() => setModoAberto((v) => !v)} aria-expanded={modoAberto}
                className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700">
                Tradução: {traducao ? 'Automática' : 'Manual'}
                <svg className={`h-3 w-3 transition-transform ${modoAberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
          </div>
          {/* nova conversa (dono 19/11): escolher a oficina/loja/cliente; a mensagem vai pela conversa normal */}
          {novaAberta && (
            <div className="mt-3 rounded-lg border border-slate-600 bg-slate-900 p-2" data-testid="suporte-nova-caixa">
              <input type="search" value={novaBusca} onChange={(e) => setNovaBusca(e.target.value)} autoFocus aria-label="Escrever a quem?" data-testid="suporte-nova-busca"
                placeholder="Oficina, loja, cliente, e-mail ou nº do cliente" className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500" />
              {novaContas && (
                <ul className="mt-2 max-h-56 divide-y divide-slate-700/70 overflow-y-auto">
                  {novaContas.length === 0 && <li className="px-2 py-2 text-xs text-slate-500">Nenhuma conta encontrada</li>}
                  {novaContas.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => iniciarCom(c.id)} disabled={iniciando === c.id} data-testid="suporte-nova-conta"
                        className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-slate-800 disabled:opacity-50">
                        <span className={`${chip} ${COR[c.tipo] || COR.visitante}`}>{TIPO[c.tipo] || c.tipo}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-white">{c.empresa || c.nome}{c.empresa ? <span className="text-slate-400"> · {c.nome}</span> : ''}</span>
                          <span className="block truncate text-xs text-slate-400">{c.codigo != null ? `nº ${c.codigo} · ` : ''}{c.email}{!c.ativo ? ' · desativada' : ''}</span>
                        </span>
                        <span className={`${chip} bg-slate-700 uppercase text-slate-300`}>{c.idioma}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 px-1 text-[11px] text-slate-500">A pessoa vê a mensagem no botão de chat do site; sem o chat aberto, recebe também por e-mail na língua dela.</p>
            </div>
          )}
          {/* o modo fica escondido: muda pouco; os radios continuam (testes e teclado) */}
          <fieldset className={`mt-3 ${modoAberto ? '' : 'hidden'}`}>
            <legend className="sr-only">Tradução (DeepL)</legend>
            <div className="flex rounded-lg bg-slate-900 p-1">
              {[{ v: true, rotulo: 'Automática', id: 'suporte-traducao-auto' }, { v: false, rotulo: 'Manual', id: 'suporte-traducao-manual' }].map((o) => (
                <label key={o.id} className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center text-sm focus-within:ring-2 focus-within:ring-primary-500 ${traducao === o.v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  <input type="radio" name="modo-traducao" checked={traducao === o.v} onChange={() => mudarTraducao(o.v)} className="sr-only" data-testid={o.id} />
                  {o.rotulo}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {traducao
                ? 'Tudo traduzido: você lê em português e a pessoa recebe na língua dela.'
                : 'Você toca "Traduzir" na mensagem recebida e marca quando a resposta vai traduzida.'}
            </p>
          </fieldset>
          {/* Ativas | Arquivadas (dono 20/11) */}
          <div className="mt-3 flex gap-1 rounded-lg bg-slate-900 p-1 text-sm" role="tablist" aria-label="Filtro das conversas">
            <button type="button" role="tab" aria-selected={!verArquivadas} onClick={() => irParaAba(false)} data-testid="suporte-aba-ativas"
              className={`flex-1 rounded-md px-3 py-1.5 ${!verArquivadas ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Ativas</button>
            <button type="button" role="tab" aria-selected={verArquivadas} onClick={() => irParaAba(true)} data-testid="suporte-aba-arquivadas"
              className={`flex-1 rounded-md px-3 py-1.5 ${verArquivadas ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Arquivadas{totalArquivadas > 0 ? ` (${totalArquivadas})` : ''}</button>
          </div>
          {avisoLista && <p role="status" className="mt-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300" data-testid="suporte-aviso-lista">{avisoLista}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!carregado ? (
            <div aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="mx-3 my-2 h-16 animate-pulse rounded-lg bg-slate-700/50" />)}</div>
          ) : conversas.length === 0 && verArquivadas ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <IconeChat className="h-10 w-10 text-slate-600" />
              <p className="text-slate-400">Nenhuma conversa arquivada.</p>
            </div>
          ) : conversas.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <IconeChat className="h-10 w-10 text-slate-600" />
              <p className="text-slate-400">Nenhuma conversa ainda</p>
              <p className="text-xs text-slate-500">Quando alguém escrever pelo botão de chat do site, aparece aqui.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-700/70">
              {conversas.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setAberta(c.id)} data-testid="suporte-conversa" aria-current={aberta === c.id ? 'true' : undefined}
                    className={`flex w-full gap-3 border-l-2 px-4 py-3 text-left ${aberta === c.id ? 'border-primary-500 bg-slate-700/60' : 'border-transparent hover:bg-slate-700/40'}`}>
                    <Avatar c={c} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-white ${c.naoLidas > 0 ? 'font-semibold' : 'font-medium'}`}>{c.nome}</span>
                        <span className="shrink-0 text-xs text-slate-500">{timeAgo(c.ultima, 'pt')}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className={`${chip} ${COR[c.tipo] || COR.visitante}`}>{TIPO[c.tipo] || c.tipo}</span>
                        <span className={`${chip} bg-slate-700 uppercase text-slate-300`}>{c.idioma}</span>
                        {c.profileId && <Presenca vistoEm={c.vistoEm} curto />}
                        {c.arquivadaEm && <span className={`${chip} bg-slate-700/60 text-slate-400`} data-testid="suporte-chip-arquivada">arquivada {timeAgo(c.arquivadaEm, 'pt')}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="line-clamp-1 flex-1 text-sm text-slate-400">{c.previa ? `${c.previa.autor === 'usuario' ? '' : 'Você: '}${c.previa.texto}` : ''}</p>
                        {c.naoLidas > 0 && <span className="min-w-[1.25rem] rounded-full bg-primary-500 px-1.5 text-center text-xs font-bold text-white" aria-label={`${c.naoLidas} não lidas`}>{c.naoLidas}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- conversa */}
      {aberta && conv ? (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`Conversa com ${conv.nome}`}>
          <header className="flex items-start gap-3 border-b border-slate-700 px-4 py-3">
            <button type="button" onClick={() => setAberta(null)} aria-label="Voltar"
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-700 md:hidden">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <Avatar c={conv} tamanho="h-9 w-9 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate font-semibold text-white">{conv.nome}</p>
                <span className={`${chip} ${COR[conv.tipo] || COR.visitante}`}>{TIPO[conv.tipo] || conv.tipo}</span>
                <span className={`${chip} bg-slate-700 text-slate-300`}>{IDIOMA[conv.idioma] || conv.idioma}</span>
                {conv.pagina && <span className={`${chip} max-w-[12rem] truncate bg-slate-700/60 text-slate-400`} title={conv.pagina}>em {conv.pagina}</span>}
              </div>
              <p className="truncate text-xs text-slate-400">{conv.codigo != null && <span data-testid="suporte-codigo">nº {conv.codigo} · </span>}{conv.email}</p>
              {/* "online agora / visto ha X" de quem tem conta (dono 19/11); visitante nao manda sinal */}
              {conv.profileId && <Presenca vistoEm={conv.vistoEm} className="mt-0.5" />}
              {conv.tipo === 'visitante' && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                  E-mail não verificado — não passe dados de conta
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                {podeExcluir && (
                  <button type="button" onClick={excluir} disabled={mexendo} data-testid="suporte-excluir" title="Só conversa sem nenhuma mensagem"
                    className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50">Excluir</button>
                )}
                {conv.arquivadaEm ? (
                  <button type="button" onClick={() => arquivar(false)} disabled={mexendo} data-testid="suporte-desarquivar"
                    className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50">Desarquivar</button>
                ) : (
                  <button type="button" onClick={() => arquivar(true)} disabled={mexendo} data-testid="suporte-arquivar" title="Some da lista; o histórico fica e volta se a pessoa escrever"
                    className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50">Arquivar</button>
                )}
              </div>
            <span className="hidden shrink-0 items-center gap-1.5 text-xs text-slate-400 sm:flex" title="Com o admin aberto você aparece online e a mensagem automática não sai.">
              <span className="h-2 w-2 rounded-full bg-green-400" aria-hidden="true" /> você está online
            </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-900/60 px-4 py-4">
            {msgs === null ? (
              <div aria-busy="true" className="space-y-3">
                {['w-2/3', 'ml-auto w-1/2', 'w-1/2', 'ml-auto w-2/3'].map((w, i) => <div key={i} className={`h-10 animate-pulse rounded-2xl bg-slate-700/50 ${w}`} />)}
              </div>
            ) : msgs.length === 0 ? (
              <p className="pt-10 text-center text-sm text-slate-500">Sem mensagens ainda — escreva abaixo; {conv.nome} vê no botão de chat do site.</p>
            ) : msgs.map((m, i) => {
              const novoDia = i === 0 || dia(msgs[i - 1].created_at) !== dia(m.created_at);
              const separador = novoDia && (
                <div className="flex justify-center py-1"><span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] text-slate-500">{dia(m.created_at)}</span></div>
              );
              if (m.autor === 'auto') {
                return (
                  <div key={m.id}>
                    {separador}
                    <div className="mx-auto max-w-[90%] rounded-lg border border-dashed border-slate-600 px-3 py-1.5 text-center text-xs text-slate-400">
                      <p className="font-medium">Resposta automática enviada (você estava offline) · {hora(m.created_at)}</p>
                      <p className="mt-0.5 whitespace-pre-wrap italic">{m.texto}</p>
                    </div>
                  </div>
                );
              }
              const minha = m.autor === 'admin';
              const original = !!verOriginal[m.id];
              // usuario: corpo em portugues (traducao); admin: corpo como escreveu, "ver o que foi enviado" mostra a versao traduzida
              const corpo = minha ? (original && m.traducao ? m.traducao : m.texto) : (m.traducao && !original ? m.traducao : m.texto);
              return (
                <div key={m.id}>
                  {separador}
                  <div className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${minha ? 'rounded-br-md bg-primary-600 text-white' : 'rounded-bl-md bg-slate-700 text-slate-100'}`}>
                      <p className="whitespace-pre-wrap break-words">{corpo}</p>
                      <p className={`mt-1 flex flex-wrap items-center gap-x-1 text-[11px] ${minha ? 'justify-end text-primary-200' : 'text-slate-400'}`}>
                        <span>{hora(m.created_at)}</span>
                        {m.traducao && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{minha ? `enviado em ${IDIOMA[conv.idioma] || conv.idioma}` : `traduzido do ${nomeOrigem(m.origem)}`}</span>
                            <span aria-hidden="true">·</span>
                            <button type="button" onClick={() => setVerOriginal((v) => ({ ...v, [m.id]: !v[m.id] }))} data-testid="suporte-ver-original"
                              className={`underline ${minha ? 'hover:text-white' : 'text-primary-300 hover:text-primary-200'}`}>
                              {minha ? (original ? 'ver o que você escreveu' : 'ver o que foi enviado') : (original ? 'ver tradução' : 'ver original')}
                            </button>
                          </>
                        )}
                        {!minha && !m.traducao && !m.origem && linguaOutra && (
                          <>
                            <span aria-hidden="true">·</span>
                            <button type="button" onClick={() => traduzirRecebida(m.id)} disabled={traduzindo === m.id} data-testid="suporte-traduzir-msg"
                              className="text-primary-300 underline hover:text-primary-200 disabled:opacity-50">{traduzindo === m.id ? 'Traduzindo…' : 'Traduzir para português'}</button>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={fimRef} />
          </div>

          <div className="border-t border-slate-700 bg-slate-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {avisos.map((a, i) => (
              <div key={i} role="status" className={`mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${TOM[a.tom]}`}>
                <p className="flex-1">{a.texto}</p>
                <button type="button" onClick={() => setAvisos((v) => v.filter((_, k) => k !== i))} aria-label="Fechar aviso" className="-my-0.5 px-1 opacity-70 hover:opacity-100">×</button>
              </div>
            ))}
            {linguaOutra && (
              <div className="mb-2 min-h-[1rem] text-xs">
                {traducao ? (
                  <p className="text-slate-400">A resposta vai traduzida para {IDIOMA[conv.idioma] || conv.idioma} (automático).</p>
                ) : (
                  <label className="flex items-center gap-2 text-slate-300">
                    <input type="checkbox" checked={traduzirResposta} onChange={(e) => setTraduzirResposta(e.target.checked)} className="h-4 w-4 rounded border-slate-500 bg-slate-700 accent-primary-500" data-testid="suporte-traduzir-resposta" />
                    Traduzir esta resposta para {IDIOMA[conv.idioma] || conv.idioma}
                  </label>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea ref={campoRef} value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} maxLength={2000} aria-label="Resposta" data-testid="suporte-resposta"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(); } }}
                placeholder={linguaOutra && (traducao || traduzirResposta) ? 'Escreva em português ou inglês: vai traduzido' : 'Escreva a resposta'}
                className="max-h-40 min-h-[44px] w-full flex-1 resize-none rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40" />
              <button type="button" onClick={responder} disabled={enviando || !texto.trim()} aria-label="Enviar"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-40">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
              </button>
            </div>
            <p className="mt-1 hidden text-[11px] text-slate-500 sm:block">Enter envia · Shift+Enter nova linha</p>
          </div>
        </section>
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center gap-2 text-center md:flex">
          <IconeChat className="h-10 w-10 text-slate-600" />
          <p className="text-sm text-slate-400">Escolha uma conversa à esquerda</p>
        </div>
      )}
    </div>
  );
}
