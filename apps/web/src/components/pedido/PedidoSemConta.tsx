'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter as useRouterNext } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, rota } from '@/i18n/navigation';
import { routing, hrefNoIdioma, mercadoDe } from '@/i18n/routing';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { exemploPlaca } from '@/lib/exemplos';
import { textoErroApi } from '@/lib/erro-api';
import { rotuloTipoMotorista } from '@/lib/utils';
import FipeAutocomplete from '@/components/forms/FipeAutocomplete';
import { registrarEventoMeta } from '@/components/Analytics';
import EnderecoAutocomplete from '@/components/forms/EnderecoAutocomplete';
import CampoTelefone from '@/components/forms/CampoTelefone';
import { placaValida, anoDoCarroValido } from '@/lib/validar-carro';
import { gravarFotosPedido, lerFotosPedido, apagarFotosPedido } from '@/lib/rascunho-pedido-fotos';
import {
  TIPOS_SERVICO, iconeTipoMotorista, listaServicos, servicosComuns, SERVICOS_COMUNS_MAX, URGENCIA_PADRAO,
} from '@fixauto/shared';

// Pedido de orcamento SEM cadastro e SEM senha (dono 06/11 e 12/11; regras em
// lib/pedido-sem-conta.ts), em etapas de UMA pergunta por tela (dono 19/11, Proposta_pedido_em_
// etapas_2026-11-19 sec. 14/15, opcao A): 1 Teenus -> 2 "Mis autol viga on?" (caixa de texto +
// chips dos problemas comuns; "Naita koiki" abre a lista inteira numa tela propria) -> 3 Fotod ->
// 4 Auto -> 5 Asukoht (com mapa) -> 6 Kontakt -> codigo do e-mail. Sem tela de urgencia (fica
// "media"). Cada tela cabe sem rolar a 390x844 e 360x640 (CSS em globals.css, body.pagina-pedido).
// O pedido so vai para as oficinas depois da confirmacao pelo e-mail - o botao do e-mail OU o
// codigo de 6 digitos digitado aqui - e quem confirma entra na conta (nova ou ja existente).
// O app faz o mesmo em apps/mobile/app/pedido.tsx (mesmas constantes de @fixauto/shared).
const FUNIL = 'pedido_site';
const contar = (etapa: string) => {
  try { fetch('/api/funil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ funil: FUNIL, etapa }), keepalive: true }).catch(() => {}); } catch { /* nunca atrapalha o pedido */ }
};
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// numero do celular: prefixo + ao menos 6 digitos ("+372 5123 4567")
const TELEFONE_OK = (v: string) => v.replace(/\D/g, '').length >= 8;
// erros de digitacao mais comuns no dominio (gmail.con, hotmial.com...)
const DOMINIOS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'mail.ru', 'yandex.ru', 'live.com', 'mail.ee', 'hot.ee', 'online.ee'];
function sugestaoEmail(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  const dom = m[2];
  if (DOMINIOS.includes(dom)) return null;
  const dist = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const perto = DOMINIOS.find((x) => dist(dom, x) <= 2);
  return perto ? `${m[1]}@${perto}` : null;
}

// 'lista' = tela "Naita koiki" (lista inteira do tipo), sub-tela do grupo 2 (mesmo numero na barra)
type Etapa = 'servico' | 'detalhe' | 'lista' | 'fotos' | 'carro' | 'local' | 'contato' | 'codigo' | 'enviado';
// ordem das entradas do historico (voltar do celular = um passo atras, inclusive da sub-tela da lista)
const ORDEM: Etapa[] = ['servico', 'detalhe', 'lista', 'fotos', 'carro', 'local', 'contato', 'codigo'];
// grupo da barra de progresso "Samm n/6" (0 = sem barra)
const GRUPO: Record<Etapa, number> = { servico: 1, detalhe: 2, lista: 2, fotos: 3, carro: 4, local: 5, contato: 6, codigo: 0, enviado: 0 };
const GRUPOS = 6;
// passos contados no funil ao entrar (uma vez por pedido); 'lista' conta como detalhe_ver_todos ao abrir
const CONTAR_AO_ENTRAR: Partial<Record<Etapa, string>> = { detalhe: 'detalhe', fotos: 'fotos', carro: 'carro', local: 'local', contato: 'contato' };

// Trocar de idioma no meio do pedido (dono 06/11: "mudei para ingles e voltou a pagina").
// O formulario vai num rascunho no aparelho (localStorage, vale 24 h) e as fotos no
// IndexedDB (lib/rascunho-pedido-fotos): no Android o Chrome fecha a aba ao abrir a
// galeria/camera e a pagina volta do zero (emulador, dono 10/11); com sessionStorage
// o pedido inteiro se perdia.
const RASCUNHO = 'bipfix_pedido_rascunho';
const FUNIL_CONTADOS = 'bipfix_pedido_funil'; // passos ja contados no funil deste pedido (aba)
const lerRascunho = () => localStorage.getItem(RASCUNHO) || sessionStorage.getItem(RASCUNHO); // sessionStorage: rascunho de antes de 10/11
const memoria: { fotos: { file: File; preview: string }[] } = { fotos: [] };
const FOTOS_MAX = 6;
// tela pequena (360x640 ou mais baixa): 4 chips em vez de 6, para o passo 2 caber sem rolar
const COMPACTO = '(max-height: 700px), (max-width: 379px)';
// "usar minha localizacao" que falhou: motivo (GeolocationPositionError.code 1/2/3) -> aviso e evento do funil
// (local_gps_negado continua sendo so a recusa, como antes; sem navigator.geolocation = indisponivel, sem evento)
type FalhaLocal = 'negado' | 'indisponivel' | 'tempo';
const EVENTO_FALHA_LOCAL: Record<FalhaLocal, string> = { negado: 'local_gps_negado', indisponivel: 'local_gps_indisponivel', tempo: 'local_gps_timeout' };
const AVISO_FALHA_LOCAL: Record<FalhaLocal, 'localErroNegado' | 'localErroIndisponivel' | 'localErroTempo'> = { negado: 'localErroNegado', indisponivel: 'localErroIndisponivel', tempo: 'localErroTempo' };

// ?tema= do link do anuncio (Google Ads, dono 25/11): dica curta no alto do passo 2 (chave em pedidoSemConta)
const DICA_TEMA: Record<string, 'temaUlevaatus' | 'temaHooldus'> = { ulevaatus: 'temaUlevaatus', hooldus: 'temaHooldus' };

// servicoInicial: ?servico= valido (ja conferido em pedido/page.tsx) -> abre direto no passo 2 com o
// tipo escolhido (o Tagasi volta aos cartoes para trocar); sem ele, tudo como antes.
export default function PedidoSemConta({ servicoInicial = '', tema = '' }: { servicoInicial?: string; tema?: string }) {
  const t = useTranslations('pedidoSemConta');
  // so as chaves proprias (tema=constructor/__proto__ nao vira dica)
  const dicaTema = Object.prototype.hasOwnProperty.call(DICA_TEMA, tema) ? DICA_TEMA[tema] : null;
  const tn = useTranslations('clienteNovaSolicitacao');
  const tc = useTranslations('constants');
  const te = useTranslations('erros');
  const locale = useLocale();
  const router = useRouter();
  const routerNext = useRouterNext();
  const { isLoggedIn, loading: carregandoLogin } = useAuth();

  const [etapa, setEtapa] = useState<Etapa>(servicoInicial ? 'detalhe' : 'servico');
  // servico
  const [tipo, setTipo] = useState(servicoInicial);
  const [servicos, setServicos] = useState<string[]>([]);
  const [descricao, setDescricao] = useState('');
  const [fotos, setFotos] = useState<{ file: File; preview: string }[]>(() => memoria.fotos);
  // "Jatka ilma fotota": a tela de fotos nao reaparece "vazia" como erro ao voltar
  const [fotosPuladas, setFotosPuladas] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);
  const adicionarFotos = (e: ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files || []).slice(0, FOTOS_MAX - fotos.length);
    if (fs.length) { contar('foto'); setFotosPuladas(false); }
    setFotos((x) => [...x, ...fs.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    e.target.value = '';
  };
  // "Edasi" tocado com algo faltando (dono 19/11, "clear evidence of all mandatory fields"): CADA campo em
  // falta fica com borda vermelha e o aviso logo abaixo (aria-invalid/aria-describedby), o foco vai ao primeiro,
  // a barra repete o primeiro aviso; o aviso de um campo some assim que ele e corrigido (derivado ao vivo).
  // Obrigatorios levam * no rotulo (+ "(kohustuslik)" para leitores de tela); opcionais "(valikuline)".
  const [mostrarFaltas, setMostrarFaltas] = useState(false);
  const focar = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  };
  // carro
  const [carro, setCarro] = useState({ tipo: 'cars', marca: '', modelo: '', ano: '', codigo: '' });
  const [placa, setPlaca] = useState('');
  // local
  const [endereco, setEndereco] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [pais, setPais] = useState<string | null>(null);
  // contato
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  // e-mail e sempre o canal; o celular so com a caixa marcada (dono 13/11: as pessoas
  // desistiam diante do telefone, mesmo opcional)
  const [querSms, setQuerSms] = useState(false);
  const [termos, setTermos] = useState(false);
  const [site, setSite] = useState(''); // campo invisivel (robo)
  // envio / codigo
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [pendente, setPendente] = useState<{ id: string; email: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState('');
  const [corrigindo, setCorrigindo] = useState(false);
  const [emailNovo, setEmailNovo] = useState('');
  const [esperaReenvio, setEsperaReenvio] = useState(0);
  const [enviadoSemLogin, setEnviadoSemLogin] = useState(false);
  // confirmado pelo botao do e-mail (ou expirou) enquanto esta tela esperava o codigo
  const [jaConfirmou, setJaConfirmou] = useState(false);
  // funil: passos e "digitou/marcou" contam uma vez por pedido nesta aba (sessionStorage, apagado com o
  // rascunho): voltar/avancar entre os passos ou recarregar nao conta de novo (antes cada volta inflava o funil)
  const contado = useRef<Record<string, boolean>>({});
  const contarUmaVez = (etapa: string) => {
    if (contado.current[etapa]) return;
    let lista: string[] = [];
    try { lista = JSON.parse(sessionStorage.getItem(FUNIL_CONTADOS) || '[]'); } catch { /* sem armazenamento: so a memoria */ }
    contado.current[etapa] = true;
    if (Array.isArray(lista) && lista.includes(etapa)) return;
    try { sessionStorage.setItem(FUNIL_CONTADOS, JSON.stringify([...(Array.isArray(lista) ? lista : []), etapa])); } catch { /* ignora */ }
    contar(etapa);
  };
  // tela pequena: menos chips (ver COMPACTO)
  const [compacto, setCompacto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(COMPACTO);
    const ler = () => setCompacto(mq.matches);
    ler();
    mq.addEventListener('change', ler);
    return () => mq.removeEventListener('change', ler);
  }, []);

  // quem ja esta logado usa o pedido normal (mesmos passos, sem contato/codigo)
  const pulandoPassos = useRef(false);
  // estado da entrada do historico: o Next regrava o history.state sem os nossos campos quando busca
  // a pagina de novo ao voltar (cache vencido); vale entao o guardado no popstate (TopoAoNavegar)
  const estadoDaEntrada = () => { const s = window.history.state; if (s?.pedidoEtapa) return s; const w = window as any; return Date.now() - (w.__bipfixVoltou || 0) < 5000 ? w.__bipfixVoltouEstado : null; };
  useEffect(() => {
    // pre-selecionado pelo link e ainda sem nada escrito/marcado = tambem e o inicio do pedido
    const noInicio = etapa === 'servico' || (!!servicoInicial && etapa === 'detalhe' && !descricao.trim() && servicos.length === 0);
    if (!carregandoLogin && isLoggedIn && noInicio && !pendente) {
      limparRascunho();
      // "voltar" caiu num passo de um pedido ja enviado (cada passo e uma entrada do historico):
      // pula todos os passos de uma vez ate a 1a entrada do pedido. Antes ia ao inicio a partir
      // de cada passo e cada "voltar" seguinte caia no passo anterior - 5 voltas ao inicio e 5
      // "abriu" no funil (anuncio RU, 18/11).
      const pilha = Number(estadoDaEntrada()?.pedidoPilha) || 0;
      if (pilha > 0) {
        pulandoPassos.current = true;
        window.history.go(-pilha);
        setTimeout(() => { if (pulandoPassos.current) { pulandoPassos.current = false; router.replace('/cliente/dashboard'); } }, 1500);
        return;
      }
      // chegou pelo "voltar" depois de pedir (ja logado): vai ao inicio, nao abre outro pedido (dono 08/11)
      const voltou = Date.now() - ((window as any).__bipfixVoltou || 0) < 5000 || (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'back_forward';
      router.replace(voltou ? '/cliente/dashboard' : '/cliente/nova-solicitacao');
    }
  }, [carregandoLogin, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // rascunho: volta o que a pessoa ja tinha feito (troca de idioma ou recarregar)
  const [rascunhoLido, setRascunhoLido] = useState(false);
  const etapaRestaurada = useRef<Etapa | null>(null);
  const fotosVoltando = useRef(false); // lendo as fotos do aparelho: nao apagar antes de voltarem
  useEffect(() => {
    let tinha = false;
    let usouPre = !!servicoInicial; // o link decidiu o passo (sem rascunho com tipo: esse vence, ou e recarga)
    try {
      const r = JSON.parse(lerRascunho() || 'null');
      if (r && Date.now() - (r.em || 0) < 24 * 3600 * 1000) {
        tinha = true;
        // rascunho sem tipo (so abriu o formulario antes) nao tira a pre-selecao do link; com tipo, vale o rascunho
        const manterPre = !!servicoInicial && !r.tipo;
        if (r.tipo) usouPre = false;
        if (!manterPre) setTipo(r.tipo || '');
        setServicos(Array.isArray(r.servicos) ? r.servicos : []); setDescricao(r.descricao || ''); setFotosPuladas(!!r.fotosPuladas);
        if (r.carro) setCarro(r.carro);
        setPlaca(r.placa || ''); setEndereco(r.endereco || ''); setCoords(r.coords || null); setPais(r.pais || null);
        setNome(r.nome || ''); setEmail(r.email || ''); setQuerSms(!!r.querSms); setTelefone(r.querSms ? r.telefone || '' : ''); setTermos(!!r.termos);
        if (r.pendente?.id && r.pendente?.email) setPendente({ id: r.pendente.id, email: r.pendente.email });
        // codigo so com o pedido pendente guardado; senao volta ao contato. Rascunho de antes de 19/11
        // (passo 'detalhe' com tudo junto) continua valido: 'detalhe' existe no fluxo novo.
        const e: Etapa = r.etapa === 'codigo' && !r.pendente ? 'contato' : ORDEM.includes(r.etapa) ? r.etapa : 'servico';
        if (e !== 'enviado' && !manterPre) { etapaRestaurada.current = e; setEtapa(e); }
        // a pagina recarregou (nao foi troca de idioma): as fotos voltam do aparelho
        if (r.qtdFotos && !memoria.fotos.length) {
          fotosVoltando.current = true;
          lerFotosPedido().then((fs) => {
            fotosVoltando.current = false;
            if (fs.length) setFotos((x) => x.length ? x : fs.map((file) => ({ file, preview: URL.createObjectURL(file) })));
          });
        }
      }
    } catch { /* sem armazenamento: comeca do zero */ }
    // entrada do historico que ja e um passo do pedido = voltou a ele, nao abriu de novo
    if (!tinha && !estadoDaEntrada()?.pedidoEtapa) contar('abriu');
    // chegou com o servico ja escolhido pelo link (anuncio): conta 'servico_prefill' (uma vez por pedido)
    // em vez de 'servico', que segue sendo "tocou num cartao", e a chegada ao passo 2. Como o 'abriu',
    // nao conta quando a entrada do historico ja e um passo (voltou a ela depois de enviar, por exemplo).
    if (usouPre && !estadoDaEntrada()?.pedidoEtapa) { contarUmaVez('servico_prefill'); contarUmaVez('detalhe'); }
    setRascunhoLido(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rascunhoLido) return;
    memoria.fotos = fotos;
    try {
      localStorage.setItem(RASCUNHO, JSON.stringify({ em: Date.now(), etapa, tipo, servicos, descricao, fotosPuladas, carro, placa, endereco, coords, pais, nome, email, querSms, telefone, termos, pendente, qtdFotos: fotos.length }));
    } catch { /* ignora */ }
  }, [rascunhoLido, etapa, tipo, servicos, descricao, fotosPuladas, carro, placa, endereco, coords, pais, nome, email, querSms, telefone, termos, pendente, fotos]);
  useEffect(() => {
    if (!rascunhoLido || fotosVoltando.current) return;
    if (fotos.length) gravarFotosPedido(fotos.map((f) => f.file)); else apagarFotosPedido();
  }, [rascunhoLido, fotos]);
  const limparRascunho = () => {
    memoria.fotos = [];
    try { localStorage.removeItem(RASCUNHO); sessionStorage.removeItem(RASCUNHO); sessionStorage.removeItem(FUNIL_CONTADOS); } catch { /* ignora */ }
    contado.current = {};
    apagarFotosPedido();
  };
  // links de idioma (cabecalho/rodape) nesta pagina: troca sem recarregar, para
  // as fotos (so na memoria) nao se perderem
  useEffect(() => {
    const aoClicar = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as HTMLElement | null)?.closest?.('a[hreflang]') as HTMLAnchorElement | null;
      if (!a) return;
      const destino = a.getAttribute('href') || '';
      const novo = routing.locales.find((l) => hrefNoIdioma(l, '/pedido') === destino);
      if (!novo || novo === locale) return;
      ev.preventDefault();
      document.documentElement.lang = a.getAttribute('hreflang') || novo;
      routerNext.replace(destino, { scroll: false });
    };
    document.addEventListener('click', aoClicar, true);
    return () => document.removeEventListener('click', aoClicar, true);
  }, [locale, routerNext]);
  // botao "voltar" do celular/navegador volta UM passo, sem perder nada (dono 12/11): antes os
  // passos nao entravam no historico e o voltar saia do pedido. Cada passo novo vira uma entrada
  // (o Next copia o estado interno dele - app-router.js); o Tagasi da tela usa o mesmo historico.
  const doHistorico = useRef(false);
  const etapaAnterior = useRef<Etapa | null>(null);
  const empilhados = useRef(0);
  useEffect(() => {
    if (!rascunhoLido) return;
    const ant = etapaAnterior.current; etapaAnterior.current = etapa;
    if (doHistorico.current) { doHistorico.current = false; return; }
    if (etapa === 'enviado') return;
    const est = { ...window.history.state, pedidoEtapa: etapa };
    // pedidoPilha: quantos passos deste pedido ficam abaixo desta entrada (o efeito "ja logado" pula todos)
    if (ant && ORDEM.indexOf(etapa) > ORDEM.indexOf(ant)) { window.history.pushState({ ...est, pedidoPilha: (Number(est.pedidoPilha) || 0) + 1 }, ''); empilhados.current++; }
    else window.history.replaceState(est, '');
  }, [etapa, rascunhoLido]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const voltou = (ev: PopStateEvent) => {
      // chegou a 1a entrada do pedido pulando os passos (ja logado): vai ao inicio, sem outro pedido
      if (pulandoPassos.current) { pulandoPassos.current = false; router.replace('/cliente/dashboard'); return; }
      const e = ev.state?.pedidoEtapa as Etapa | undefined;
      if (!e || !ORDEM.includes(e)) return;
      empilhados.current = Math.max(0, empilhados.current - 1);
      doHistorico.current = true;
      setEtapa(e);
    };
    window.addEventListener('popstate', voltou);
    return () => window.removeEventListener('popstate', voltou);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const voltarPara = (e: Etapa) => {
    if (empilhados.current > 0 && window.history.state?.pedidoEtapa === etapa) window.history.back();
    else setEtapa(e);
  };
  // passo novo comeca no alto (o anterior era mais comprido: a pessoa via so o rodape - teste do dono 06/11)
  const primeiraEtapa = useRef(true);
  useEffect(() => {
    setMostrarFaltas(false);
    // o passo que voltou do rascunho (pagina recarregada) ja foi contado antes
    if (etapaRestaurada.current === etapa) etapaRestaurada.current = null;
    // passo 2 aberto pelo link (?servico=): contado no efeito do rascunho, que sabe se e chegada nova
    else if (primeiraEtapa.current && servicoInicial) { /* nada */ }
    else if (CONTAR_AO_ENTRAR[etapa]) contarUmaVez(CONTAR_AO_ENTRAR[etapa]!);
    if (primeiraEtapa.current) { primeiraEtapa.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [etapa]);
  // tela curta/pequena: globals.css encolhe o cabecalho desta pagina
  useEffect(() => {
    document.body.classList.add('pagina-pedido');
    return () => document.body.classList.remove('pagina-pedido');
  }, []);
  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const i = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(i);
  }, [esperaReenvio]);
  // posicao do aparelho SO quando a pessoa toca em "Kasuta minu asukohta" (dono 16/11, parecer do
  // Fable): o pedido de localizacao ao entrar no passo, sem contexto, e o que mais leva a recusa
  // (Chrome). Antes (10/11) era pedido automaticamente ao abrir o passo. Recusou ou falhou: nada
  // muda, o campo continua e o botao some (nao pergunta de novo); o texto digitado - endereco,
  // linnaosa ou so "Tallinn" - vira coordenada no envio (resolverLocal).
  // 21/11 (computador): a falha diz o motivo (GeolocationPositionError.code 1/2/3) e conta no funil
  // separado - no PC sem Wi-Fi/com a localizacao do Windows desligada o Chrome da
  // POSITION_UNAVAILABLE mesmo com a permissao dada; depois de qualquer falha o foco vai ao campo.
  const [localizando, setLocalizando] = useState(false);
  const [localFalha, setLocalFalha] = useState<FalhaLocal | null>(null);
  const [posAparelho, setPosAparelho] = useState<{ lat: number; lon: number } | null>(null);
  const falhouLocal = (tipo: FalhaLocal, contarFunil = true) => {
    setLocalizando(false);
    setLocalFalha(tipo);
    if (contarFunil) contar(EVENTO_FALHA_LOCAL[tipo]);
    // depois do render (o botao some e o aviso entra): o campo ja recebe o texto
    setTimeout(() => document.getElementById('pedido-endereco')?.focus({ preventScroll: true }), 0);
  };
  // computador (sem toque): o campo vem focado e "usar minha localizacao" vira link secundario
  // com a dica do celular. Comeca falso (como o servidor) e e lido ao montar - o passo do local
  // nunca e o 1o render, entao nao ha troca visivel; no celular a tela fica como antes.
  const [computador, setComputador] = useState(false);
  useEffect(() => {
    const toque = window.matchMedia('(pointer: coarse)');
    const algumToque = window.matchMedia('(any-pointer: coarse)');
    const ler = () => setComputador(!toque.matches && !algumToque.matches && !(navigator.maxTouchPoints > 0));
    ler();
    toque.addEventListener('change', ler);
    algumToque.addEventListener('change', ler);
    return () => { toque.removeEventListener('change', ler); algumToque.removeEventListener('change', ler); };
  }, []);
  useEffect(() => {
    if (etapa === 'local' && computador) document.getElementById('pedido-endereco')?.focus({ preventScroll: true });
  }, [etapa, computador]);
  const usarMinhaLocalizacao = () => {
    if (localizando || localFalha) return;
    if (!navigator.geolocation) { falhouLocal('indisponivel', false); return; }
    setLocalizando(true);
    contar('local_gps');
    navigator.geolocation.getCurrentPosition(async (p) => {
      const c = { lat: p.coords.latitude, lon: p.coords.longitude };
      setPosAparelho(c);
      const r = await fetch(`/api/geocode?lat=${c.lat}&lon=${c.lon}&idioma=${locale}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => ({})) : {};
      // campo preenchido com a rua/linnaosa/linn da posicao (a pessoa pode corrigir); sem nome, as coordenadas
      const rotulo = [[d.rua, d.numero].filter(Boolean).join(' '), d.bairro, d.cidade].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
      setEndereco(rotulo || `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`);
      setCoords(c);
      if (d.paisCodigo) setPais(d.paisCodigo);
      setLocalizando(false);
    }, (e) => falhouLocal(e?.code === 1 ? 'negado' : e?.code === 3 ? 'tempo' : 'indisponivel'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 });
  };
  // mapa estatico com o pino (Geoapify pelo servidor, /api/mapa-estatico): so depois de haver
  // coordenada (sugestao escolhida ou "minha localizacao"); sem chave/falha a imagem some
  const [mapaFalhou, setMapaFalhou] = useState(false);
  useEffect(() => { setMapaFalhou(false); }, [coords]);

  const tipoConfig = TIPOS_SERVICO.find((x) => x.value === tipo);
  const NS: Record<string, string> = { revisao: 'servicosRevisao', mecanica: 'servicosMecanica', eletrica: 'servicosEletrica', pneu: 'servicosPneu' };
  const lista = listaServicos(tipo);
  const rotuloServico = (v: string) => (NS[tipo] ? tc(`${NS[tipo]}.${v}`) : v);
  // chips: rotulo curto (constants.servicosCurto) dos mais pedidos; os ja marcados ficam sempre a vista
  const rotuloCurto = (v: string) => (tc.has(`servicosCurto.${v}`) ? tc(`servicosCurto.${v}`) : rotuloServico(v));
  const comuns = servicosComuns(tipo);
  // com a dica do tema (?tema=) 2 chips a menos, para o passo 2 continuar cabendo sem rolar
  const limiteChips = (compacto ? 4 : SERVICOS_COMUNS_MAX) - (dicaTema ? 2 : 0);
  const chips = comuns.filter((v, i) => i < limiteChips || servicos.includes(v));
  const temLista = lista.length > 0;
  // tipos de dano/vidro: "Mis juhtus?" + "kirjelda kahju"; outro/ei tea: a pergunta generica
  const ehDano = tipo === 'colisao' || tipo === 'funilaria' || tipo === 'vidros';
  const EXEMPLO: Record<string, string> = { revisao: 'exemploRevisao', mecanica: 'exemploMecanica', eletrica: 'exemploEletrica', pneu: 'exemploPneu', vidros: 'exemploVidro', colisao: 'exemploFoto', funilaria: 'exemploFoto' };
  const exemplo = EXEMPLO[tipo] ? t(EXEMPLO[tipo]) : tn('placeholderDescribeIssue');
  const alternarServico = (v: string) => {
    if (!servicos.includes(v)) contarUmaVez('detalhe_escolheu_lista');
    setServicos((x) => x.includes(v) ? x.filter((y) => y !== v) : [...x, v]);
  };
  // regra do dono (12/11): tipo + escrever o que precisa OU marcar da lista; a foto ajuda mas nao substitui o texto
  const servicoOk = !!tipo && (descricao.trim().length > 0 || servicos.length > 0);
  // placa e ano conferidos aqui, com o aviso ao lado do campo (item 53). Ano OPCIONAL desde 16/11
  // (dono, parecer do Fable): basta marca + modelo; ano escrito tem de ser valido.
  const carroDados = !!(carro.marca && carro.modelo);
  const anoOk = anoDoCarroValido(carro.ano);
  const carroOk = carroDados && placaValida(placa) && anoOk;
  const contatoOk = nome.trim().length > 0 && EMAIL_OK.test(email.trim()) && (!querSms || TELEFONE_OK(telefone)) && termos;
  const sugestao = sugestaoEmail(email);
  // o que falta em cada passo (aviso + campo que recebe o foco)
  // diz SO o que falta: "marca, modelo e ano" com marca e modelo ja escolhidos confundia (Clarity 12/11)
  // [aviso, campo, motivo] - o motivo vai ao funil (edasi_bloqueado_carro_marca/_modelo/_ano/_placa)
  const faltaCarro: [string, string, string] = !carro.marca ? [t('faltaMarca'), 'cbbe3-101', 'marca'] : !carro.modelo ? [t('faltaModelo'), 'cbbe3-102', 'modelo']
    : !anoOk ? [te('ANO_INVALIDO'), 'cbbe3-103', 'ano'] : [te('PLACA_INVALIDA'), 'pedido-placa', 'placa'];
  const faltaContato: [string, string] = !nome.trim() ? [t('faltaNome'), 'pedido-nome'] : !EMAIL_OK.test(email.trim()) ? [t('faltaEmail'), 'pedido-email']
    : querSms && !TELEFONE_OK(telefone) ? [t('faltaTelefone'), 'pedido-telefone'] : [t('faltaTermos'), 'pedido-termos'];
  // corrigiu: o aviso some. No carro, pelo motivo (16/11): antes dependia de carroOk, que nao muda ao
  // escolher a marca (ainda falta o modelo) - o aviso "kirjuta mark" ficava parado com a marca escolhida
  // contato pelo campo que falta (Fable B3): escrever o nome tira o "kirjuta oma nimi" na hora
  // linha acima do Edasi no passo 2: o que falta (cinza) ou o que ja basta (verde)
  const statusDetalhe: { texto: string; tom: 'neutro' | 'ok' } = servicos.length > 0 ? { texto: t('detalheStatusLista', { n: servicos.length }), tom: 'ok' }
    : descricao.trim() ? { texto: t('detalheStatusTexto'), tom: 'ok' }
    : { texto: temLista ? t('detalheStatusVazio') : t('detalheStatusVazioTexto'), tom: 'neutro' };
  const faltaDetalhe = temLista ? t('faltaDescricaoLista') : t('faltaDescricao');
  // tudo o que falta no passo atual, por campo (id -> aviso), na ordem da tela
  const faltasPasso = (): Record<string, string> => {
    const f: Record<string, string> = {};
    if (etapa === 'detalhe' || etapa === 'lista') { if (!servicoOk) f['pedido-descricao'] = faltaDetalhe; }
    else if (etapa === 'carro') { if (!carro.marca) f['cbbe3-101'] = t('faltaMarca'); if (!carro.modelo) f['cbbe3-102'] = t('faltaModelo'); if (!anoOk) f['cbbe3-103'] = te('ANO_INVALIDO'); if (!placaValida(placa)) f['pedido-placa'] = te('PLACA_INVALIDA'); }
    else if (etapa === 'local') { if (endereco.trim().length <= 2) f['pedido-endereco'] = t('faltaEndereco'); }
    else if (etapa === 'contato') { if (!nome.trim()) f['pedido-nome'] = t('faltaNome'); if (!EMAIL_OK.test(email.trim())) f['pedido-email'] = t('faltaEmail'); if (querSms && !TELEFONE_OK(telefone)) f['pedido-telefone'] = t('faltaTelefone'); if (!termos) f['pedido-termos'] = t('faltaTermos'); }
    return f;
  };
  const faltas = mostrarFaltas ? faltasPasso() : {};
  // barra: com UM campo em falta repete o aviso dele; com varios, "preenche os campos marcados a vermelho" (mesmo texto do app)
  const faltando = Object.keys(faltas).length > 1 ? t('faltaCampos') : Object.values(faltas)[0] || '';
  const erroDe = (id: string) => faltas[id] || null;
  const classeErro = (id: string) => (faltas[id] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : '');
  const Aviso = ({ id }: { id: string }) => (faltas[id] ? <p id={`${id}-erro`} role="alert" className="mt-1 text-sm text-red-700" data-testid={`${id}-erro`}>{faltas[id]}</p> : null);
  const Obrig = () => <><span className="text-red-600" aria-hidden="true"> *</span><span className="sr-only"> {t('obrigatorio')}</span></>;
  const Opcional = () => <span className="font-normal text-gray-500"> ({t('opcional')})</span>;

  const descricaoFinal = () => servicos.length > 0
    ? `${tn('servicesPrefix')} ${servicos.map(rotuloServico).join(', ')}${descricao.trim() ? '. ' + descricao.trim() : ''}`
    : (descricao.trim() || tn('defaultServiceDescription'));

  // sem posicao do aparelho: o endereco digitado vira coordenada (nunca um ponto fixo)
  const resolverLocal = async () => {
    if (coords) return { ...coords, pais };
    // mercado da Estonia: so lugares da Estonia (21/11; as sugestoes tambem)
    const soEE = mercadoDe(locale).pais === 'EE' ? '&pais=ee' : '';
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(endereco)}${soEE}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => ({})) : {};
    if (typeof d.latitude === 'number' && typeof d.longitude === 'number') return { lat: d.latitude, lon: d.longitude, pais: d.paisCodigo || pais };
    return null;
  };

  const enviar = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    try {
      const local = await resolverLocal();
      if (!local) { setErro(tn('erroLocalizacao')); setEtapa('local'); return; }
      const form = new FormData();
      form.append('dados', JSON.stringify({
        origem: 'site', site, idioma: locale, nome: nome.trim(), email: email.trim(), querSms, telefone: querSms ? telefone.trim() : '', aceitouTermos: termos,
        tipo, descricao: descricaoFinal(), urgencia: URGENCIA_PADRAO, endereco, latitude: local.lat, longitude: local.lon, pais: local.pais,
        veiculo: { tipo: carro.tipo, marca: carro.marca, modelo: carro.modelo, ano: carro.ano, codigo: carro.codigo || null, placa: placa.trim() || null },
      }));
      for (const f of fotos) form.append('fotos', f.file);
      const res = await fetch('/api/pedido-sem-conta', { method: 'POST', body: form }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) { setErro(textoErroApi(te, res?.status || 500, d)); return; }
      if (d.solicitacaoId) { limparRascunho(); router.replace(`/cliente/orcamentos/${d.solicitacaoId}`); return; } // ja estava logado
      setPendente({ id: d.pendenteId, email: d.email });
      setEsperaReenvio(30); setCodigo(''); setAviso('');
      setEtapa('codigo');
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    if (!pendente || codigo.length !== 6 || enviando) return;
    setEnviando(true); setErro('');
    try {
      const res = await fetch('/api/pedido-sem-conta/confirmar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pendente.id, codigo }),
      }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      // 5 codigos errados: volta ao contato (dados mantidos) para enviar de novo, com codigo novo
      if (d.codigo === 'CODIGO_TENTATIVAS') { setPendente(null); setEtapa('contato'); setErro(te('CODIGO_TENTATIVAS')); return; }
      // ja confirmado pelo botao do e-mail (aqui ou noutro aparelho) ou passou das 24 h
      if (res?.status === 410) { limparRascunho(); setJaConfirmou(true); return; }
      if (!res || !res.ok) { setErro(textoErroApi(te, res?.status || 500, d)); return; }
      registrarEventoMeta('Lead');
      limparRascunho();
      // o codigo provou o e-mail: entra na conta (nova ou ja existente) e abre o pedido;
      // quem ainda nao tem senha passa antes pela tela "crie a sua senha" (pode pular)
      const destino = `/cliente/orcamentos/${d.solicitacaoId}`;
      const sessao = d.tokenHash ? await supabase.auth.verifyOtp({ token_hash: d.tokenHash, type: 'email' }).catch(() => null) : null;
      if (sessao && !sessao.error) {
        router.replace(d.senhaDefinida === false ? rota('/criar-senha', undefined, { voltar: destino }) : destino);
        router.refresh();
        return;
      }
      // login falhou (raro): o pedido ja foi, a pessoa entra com um codigo pela tela de login
      setEnviadoSemLogin(true);
      setEtapa('enviado');
    } finally {
      setEnviando(false);
    }
  };

  const reenviar = async (comEmail?: string) => {
    if (!pendente || esperaReenvio > 0 || enviando) return;
    setEnviando(true); setErro(''); setAviso('');
    try {
      const res = await fetch('/api/pedido-sem-conta/reenviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pendente.id, email: comEmail }),
      }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (res?.status === 410) { limparRascunho(); setJaConfirmou(true); return; }
      if (!res || !res.ok) { setErro(textoErroApi(te, res?.status || 500, d)); return; }
      setPendente({ ...pendente, email: d.email || pendente.email });
      if (comEmail) setEmail(comEmail);
      setCorrigindo(false); setCodigo(''); setEsperaReenvio(30);
      setAviso(t('codigoReenviado', { email: d.email || pendente.email }));
    } finally {
      setEnviando(false);
    }
  };

  const grupo = GRUPO[etapa];
  // no celular os botoes ficam presos no rodape da tela: "Edasi" ficava abaixo da dobra
  // (y=876 numa tela de 780) e a pessoa achava que estava travada (Clarity, dono 10/11)
  // "Edasi" sempre clicavel (so trava enquanto envia): faltando algo, diz o que e e leva ao campo
  // status (passo 2): linha cinza/verde acima dos botoes; com aviso vermelho, so o aviso (nunca os dois)
  // secundario: o botao principal com a cara de "Jatka ilma fotota" (fotos sao opcionais)
  const Navegar = ({ voltar, avancar, ok, rotulo, falta, campo, motivo, status, secundario }: { voltar?: Etapa; avancar: () => void; ok: boolean; rotulo?: string; falta: string; campo: string; motivo?: string; status?: { texto: string; tom: 'neutro' | 'ok' }; secundario?: boolean }) => (
    <div className="flex flex-wrap justify-between mt-5 gap-3 sticky bottom-0 z-10 -mx-4 px-4 py-3 bg-white/95 backdrop-blur border-t border-gray-100 rounded-b-xl sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none sm:border-0" data-testid="navegar">
      {faltando && <p role="alert" className="w-full text-sm text-red-700 font-medium" data-testid="falta-aviso">{faltando}</p>}
      {!faltando && status && <p role="status" data-testid="status-passo" data-tom={status.tom} className={`w-full text-sm ${status.tom === 'ok' ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{status.texto}</p>}
      {voltar ? <button type="button" onClick={() => voltarPara(voltar)} className="btn-secondary">{tn('back')}</button> : <span />}
      <button type="button" onClick={() => { if (ok) { setMostrarFaltas(false); avancar(); return; } setMostrarFaltas(true); void falta; contar(`edasi_bloqueado_${etapa === 'lista' ? 'detalhe' : etapa}`); if (motivo) contar(`edasi_bloqueado_${etapa}_${motivo}`); focar(campo); }}
        disabled={enviando} aria-busy={enviando} data-testid="edasi" className={`${secundario ? 'btn-secondary border-primary-300 text-primary-800' : 'btn-primary'} flex-1 disabled:opacity-50`}>{rotulo || tn('next')}</button>
    </div>
  );

  if (etapa === 'codigo' && jaConfirmou) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center" data-testid="pedido-ja-confirmado">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('jaConfirmouTitulo')}</h1>
        <p className="text-gray-600 mb-6">{t('jaConfirmouTexto')}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={rota('/login', undefined, { codigo: '1' })} className="btn-primary inline-block">{t('entrar')}</Link>
          <a href={hrefNoIdioma(locale, '/pedido')} className="btn-secondary inline-block">{t('retomarNovo')}</a>
        </div>
      </div>
    );
  }

  if (etapa === 'enviado' && enviadoSemLogin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center" data-testid="pedido-enviado">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('enviadoTitulo')}</h1>
        <p className="text-gray-600 mb-6">{t('enviadoTexto', { email: pendente?.email || email })}</p>
        {/* a tela de login ja abre em "receber um codigo por e-mail" */}
        <Link href={rota('/login', undefined, { codigo: '1' })} className="btn-primary inline-block">{t('enviadoEntrar')}</Link>
      </div>
    );
  }

  // linha do tipo escolhido no alto dos passos 2 (icone + nome)
  const linhaTipo = <p className="text-sm text-gray-500" data-testid="detalhe-tipo">{tipoConfig ? iconeTipoMotorista(tipoConfig.value, tipoConfig.icon) : ''} {rotuloTipoMotorista(tc, tipo)}</p>;

  return (
    <div className="pedido-pagina max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6" data-grupo={grupo} data-etapa={etapa}>
      <h1 className="pedido-titulo text-lg leading-tight sm:text-2xl sm:leading-normal font-bold text-gray-900">{t('titulo')}</h1>
      {/* "umbes 2 minutit" so na 1a tela (poupa altura nas outras) */}
      {etapa === 'servico' ? <p className="pedido-subtitulo text-sm sm:text-base text-gray-600 mt-0.5 mb-4">{t('subtitulo')}</p> : <div className="mb-3" />}

      {grupo > 0 && (
        <div className="pedido-progresso flex items-center gap-2 mb-4" aria-label={t('passoDe', { n: grupo, total: GRUPOS })} data-testid="progresso">
          {Array.from({ length: GRUPOS }, (_, i) => <div key={i} className={`flex-1 h-2 rounded-full ${i < grupo ? 'bg-primary-600' : 'bg-gray-200'}`} />)}
          <span className="text-sm text-gray-500 ml-2 whitespace-nowrap">{t('passoDe', { n: grupo, total: GRUPOS })}</span>
        </div>
      )}

      <div className="card p-4 sm:p-6">
        {/* 1) so o tipo: um toque e ja vai para a pagina seguinte (guiado, pedido do dono 06/11) */}
        {etapa === 'servico' && (
          <div data-testid="passo-servico">
            {/* "o tipo principal": quem precisa de varias coisas escreve as outras no passo 2 (rascunho 15/11) */}
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('servicoTitulo')}</h2>
            <p className="pedido-ajuda text-sm text-gray-700 mb-3">{t('servicoAjuda')}</p>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {TIPOS_SERVICO.map((s) => (
                <button key={s.value} type="button" aria-pressed={tipo === s.value}
                  onClick={() => { if (s.value !== tipo) setServicos([]); contarUmaVez('servico'); setTipo(s.value); setEtapa('detalhe'); }}
                  className={`min-w-0 p-3 sm:p-4 rounded-lg border-2 text-left transition-all ${tipo === s.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className="text-xl sm:text-2xl">{iconeTipoMotorista(s.value, s.icon)}</span>
                  {/* palavra longa (RU "Техобслуживание") nao invade o cartao do lado a 360 px */}
                  <p className="font-medium text-gray-900 mt-1 sm:mt-2 hyphens-auto [overflow-wrap:anywhere]">{rotuloTipoMotorista(tc, s.value)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2) "Mis autol viga on?" (opcao A, dono 19/11): rotulo visivel FORA da caixa (NN/g), a caixa de
            texto onde se escreve ali mesmo e, embaixo, os problemas mais pedidos do tipo como chips (toque
            = marcado com check); "Naita koiki" abre a lista inteira. Basta escrever OU marcar (servicoOk).
            Tipos sem lista (colisao, lataria, vidros, outro): so a caixa. */}
        {etapa === 'detalhe' && (
          <div data-testid="passo-detalhe">
            {linhaTipo}
            {dicaTema && <p className="text-sm text-primary-900 bg-primary-50 border border-primary-200 rounded-md px-3 py-2 mt-1 mb-2" data-testid="tema-dica">{t(dicaTema)}</p>}
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{ehDano ? t('detalheTituloFoto') : t('detalheTitulo')}</h2>
            <label htmlFor="pedido-descricao" className="block text-sm font-medium text-gray-700 mb-1">{ehDano ? t('detalheRotuloFoto') : t('detalheRotuloTexto')}<Obrig /></label>
            <textarea id="pedido-descricao" className={`input-field pedido-caixa ${temLista ? 'min-h-[104px]' : 'min-h-[140px]'} ${classeErro('pedido-descricao')}`} maxLength={1800} value={descricao} aria-invalid={!!erroDe('pedido-descricao')} aria-required
              aria-describedby={erroDe('pedido-descricao') ? 'pedido-descricao-aviso' : undefined}
              onChange={(e) => { setDescricao(e.target.value); if (e.target.value.trim()) contarUmaVez('detalhe_escreveu'); }}
              placeholder={exemplo} />
            {erroDe('pedido-descricao') && <p role="alert" id="pedido-descricao-aviso" data-testid="falta-aviso-topo" className="text-sm text-red-700 font-medium mt-1">{faltas['pedido-descricao']}</p>}
            {temLista && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">{t('detalheOuEscolha')}</p>
                <div className="flex flex-wrap gap-2" data-testid="chips-servicos">
                  {chips.map((v) => {
                    const marcado = servicos.includes(v);
                    return (
                      <button key={v} type="button" aria-pressed={marcado} data-testid="chip-servico" data-valor={v} onClick={() => alternarServico(v)}
                        className={`min-h-[44px] px-3.5 py-2 rounded-full border-2 text-sm font-medium transition-colors ${marcado ? 'border-primary-600 bg-primary-50 text-primary-800' : 'border-gray-300 bg-white text-gray-800 hover:border-primary-400'}`}>
                        {marcado ? '✓ ' : ''}{rotuloCurto(v)}
                      </button>
                    );
                  })}
                </div>
                {/* os marcados que nao estao entre os chips (vieram da lista inteira) */}
                {servicos.some((v) => !chips.includes(v)) && (
                  <p className="text-sm text-primary-800 mt-2" data-testid="chips-extra">✓ {servicos.filter((v) => !chips.includes(v)).map(rotuloServico).join(', ')}</p>
                )}
                {lista.length > chips.length && (
                  <button type="button" onClick={() => { contarUmaVez('detalhe_ver_todos'); setEtapa('lista'); }} className="block mx-auto mt-2 min-h-[44px] text-sm font-medium text-primary-700 underline" data-testid="ver-mais">
                    {t('verTodos', { n: lista.length })}
                  </button>
                )}
              </div>
            )}
            <Navegar voltar="servico" ok={servicoOk} avancar={() => setEtapa('fotos')} falta={faltaDetalhe} campo="pedido-descricao" status={statusDetalhe} />
          </div>
        )}

        {/* 2b) "Naita koiki": a lista inteira do tipo com caixas de marcar, tela propria (volta com Tagasi, o
            marcado fica). So a lista rola (dentro da caixa), a pagina nao - a barra Tagasi/Edasi fica a vista. */}
        {etapa === 'lista' && (
          <div data-testid="passo-lista">
            {linhaTipo}
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('listaTitulo')}</h2>
            <div id="lista-servicos" tabIndex={-1} className="pedido-lista-rolavel space-y-2 overflow-y-auto -mx-1 px-1 outline-none" data-testid="lista-servicos">
              {lista.map((sv) => (
                <label key={sv.value} className={`flex items-center gap-3 px-3 py-2 min-h-[44px] rounded-lg border-2 cursor-pointer ${servicos.includes(sv.value) ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={servicos.includes(sv.value)} className="w-4 h-4" onChange={() => alternarServico(sv.value)} />
                  <span className="text-sm text-gray-900">{rotuloServico(sv.value)}</span>
                </label>
              ))}
            </div>
            {erroDe('pedido-descricao') && <p role="alert" data-testid="lista-servicos-erro" className="text-sm text-red-700 font-medium mt-2">{faltas['pedido-descricao']}</p>}
            <Navegar voltar="detalhe" ok={servicoOk} avancar={() => setEtapa('fotos')} falta={faltaDetalhe} campo="lista-servicos" status={statusDetalhe} />
          </div>
        )}

        {/* 3) Fotod (opcionais): camera e galeria separadas (dono 10/11: com um so botao o Chrome novo do
            Android abre direto a galeria, sem a opcao de tirar foto). Sem fotos o botao principal e
            "Jatka ilma fotota"; a foto nunca substitui a descricao (o passo 2 ja exigiu texto ou chip). */}
        {etapa === 'fotos' && (
          <div data-testid="passo-fotos">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('fotosTitulo')}<Opcional /></h2>
            <p className="pedido-ajuda text-sm text-gray-700 mb-4">{t('fotosTexto')}</p>
            <input ref={inputCamera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={adicionarFotos} />
            <input ref={inputFoto} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={adicionarFotos} />
            {fotos.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-3" data-testid="fotos-miniaturas">
                {fotos.map((f, i) => (
                  <div key={f.preview} className="relative aspect-square rounded-lg overflow-hidden">
                    <img src={f.preview} alt={tn('photoAlt', { n: i + 1 })} className="w-full h-full object-cover" />
                    <button type="button" aria-label={t('removerFoto')} onClick={() => setFotos((x) => x.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-sm">×</button>
                  </div>
                ))}
              </div>
            )}
            {fotos.length < FOTOS_MAX && (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => inputCamera.current?.click()} data-testid="foto-camera"
                  className="min-h-[64px] border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-800 hover:border-primary-400"><span className="block text-2xl" aria-hidden="true">📷</span>{t('tirarFoto')}</button>
                <button type="button" onClick={() => inputFoto.current?.click()} data-testid="foto-galeria"
                  className="min-h-[64px] border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-800 hover:border-primary-400"><span className="block text-2xl" aria-hidden="true">🖼️</span>{t('escolherGaleria')}</button>
              </div>
            )}
            <p className="pedido-ajuda text-xs text-gray-500 mt-3">{t('fotosAjuda')}</p>
            <Navegar voltar="detalhe" ok avancar={() => { if (!fotos.length) { setFotosPuladas(true); contarUmaVez('fotos_pulou'); } setEtapa('carro'); }}
              rotulo={fotos.length ? undefined : t('semFotos')} secundario={!fotos.length} falta="" campo="foto-galeria" />
          </div>
        )}

        {/* 4) Auto: o passo fica montado (so escondido): o seletor de marca/modelo guarda a
            escolha dentro dele e, desmontado, voltava vazio ao ir e voltar (teste 06/11) */}
        {(
          <div data-testid="passo-carro" hidden={etapa !== 'carro'}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('carroTitulo')}</h2>
            <p className="pedido-ajuda hidden sm:block text-sm text-gray-500 mb-4">{t('carroDica')}</p>
            <div className="pedido-carro">
              <FipeAutocomplete limparForaDoCatalogo anoOpcional atalhosMarca obrigatorios value={{ tipo: carro.tipo, marca: carro.marca, modelo: carro.modelo, ano: carro.ano }}
                erroMarca={erroDe('cbbe3-101')} erroModelo={erroDe('cbbe3-102')}
                // ano invalido: o aviso aparece com os 4 digitos (ou ao tocar Edasi), nao a cada digito
                erroAno={!anoOk && (carro.ano.length >= 4 || !!erroDe('cbbe3-103')) ? te('ANO_INVALIDO') : null}
                onChange={(f) => setCarro({ tipo: f.tipo, marca: f.marca, modelo: f.modelo, ano: f.ano, codigo: f.codigo || '' })} />
              {/* placa opcional: diz o que ela da a oficina (Fable 16/11) */}
              <div className="pedido-placa mt-4">
                <label htmlFor="pedido-placa" className="block text-sm font-medium text-gray-700 mb-1">{t('placaRotulo')}</label>
                <input id="pedido-placa" className={`input-field ${placaValida(placa) ? '' : 'border-red-500 focus:border-red-500 focus:ring-red-500'}`} maxLength={10} aria-invalid={!placaValida(placa)} aria-describedby="pedido-placa-ajuda" placeholder={exemploPlaca(locale)} value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
                {!placaValida(placa) && <p role="alert" className="mt-1 text-sm text-red-700" data-testid="placa-invalida">{te('PLACA_INVALIDA')}</p>}
              </div>
              {/* no celular esta linha fica sob a dupla ano + placa (grade em globals.css) */}
              <p id="pedido-placa-ajuda" className="pedido-ajuda pedido-placa-ajuda text-xs text-gray-500 mt-1">{t('placaAjuda')}</p>
            </div>
            <Navegar voltar="fotos" ok={carroOk} avancar={() => setEtapa('local')} falta={faltaCarro[0]} campo={faltaCarro[1]} motivo={faltaCarro[2]} />
          </div>
        )}

        {/* 5) Asukoht: basta a zona (dono 19/11, v3) - linha destacada diz que o endereco exato nao e preciso;
            localizacao so pelo botao (Fable 16/11); mapa estatico com o pino depois de haver coordenada */}
        {etapa === 'local' && (
          <div data-testid="passo-local">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('localTitulo')}</h2>
            <p id="pedido-endereco-ajuda" className="text-sm text-primary-900 bg-primary-50 border-l-4 border-primary-400 rounded-r-lg px-3 py-2 mb-3" data-testid="local-claro">{t('localAjuda')}</p>
            <label htmlFor="pedido-endereco" className="block text-sm font-medium text-gray-700 mb-1">{t('localRotulo')}<Obrig /></label>
            {/* escreveu: a coordenada passa a ser a do texto (no envio); a de uma sugestao/do aparelho valia para o texto anterior */}
            <EnderecoAutocomplete id="pedido-endereco" soDoPais value={endereco} onChange={(v) => { setEndereco(v); setCoords(null); }} placeholder={t('localPlaceholder')} perto={coords || posAparelho} required
              className={`input-field ${classeErro('pedido-endereco')}`} erroId={erroDe('pedido-endereco') ? 'pedido-endereco-erro' : null}
              onSelect={(s) => { setEndereco(s.rotulo); setCoords({ lat: s.latitude, lon: s.longitude }); if (s.paisCodigo) setPais(s.paisCodigo); }} />
            <Aviso id="pedido-endereco" />
            {localFalha ? (
              <p role="status" className="mt-3 text-sm text-gray-600" data-testid="localizacao-negada" data-falha={localFalha}>{t(AVISO_FALHA_LOCAL[localFalha])}</p>
            ) : computador ? (
              // computador: link de texto secundario + dica (no PC sem Wi-Fi/GPS a posicao costuma falhar)
              <p className="mt-2 text-sm text-gray-500" data-testid="local-gps-secundario">
                <button type="button" onClick={usarMinhaLocalizacao} disabled={localizando} aria-busy={localizando} aria-describedby="pedido-gps-dica" data-testid="usar-localizacao"
                  className="text-primary-700 underline underline-offset-2 hover:text-primary-900 disabled:opacity-60">
                  {localizando ? t('localProcurando') : t('localUsarMinha')}
                </button>
                <span aria-hidden="true"> · </span><span id="pedido-gps-dica">{t('localDicaCelular')}</span>
              </p>
            ) : (
              <button type="button" onClick={usarMinhaLocalizacao} disabled={localizando} aria-busy={localizando} data-testid="usar-localizacao"
                className="mt-3 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:border-primary-400 disabled:opacity-60">
                <svg aria-hidden="true" className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {localizando ? t('localProcurando') : t('localUsarMinha')}
              </button>
            )}
            {coords && !mapaFalhou && (
              <div className="pedido-mapa mt-3 rounded-lg overflow-hidden border border-gray-200 bg-gray-100" data-testid="mapa-estatico">
                <img src={`/api/mapa-estatico?lat=${coords.lat.toFixed(4)}&lon=${coords.lon.toFixed(4)}`} alt={t('mapaAlt')} className="w-full h-36 object-cover" onError={() => setMapaFalhou(true)} />
              </div>
            )}
            {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
            <Navegar voltar="carro" ok={endereco.trim().length > 2} avancar={() => { setErro(''); setEtapa('contato'); }} falta={t('faltaEndereco')} campo="pedido-endereco" />
          </div>
        )}

        {etapa === 'contato' && (
          <div data-testid="passo-contato">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('contatoTitulo')}</h2>
            <p className="pedido-ajuda text-sm text-gray-500 mb-4">{t('contatoTexto')}</p>
            {(
              <div className="space-y-3">
                <div>
                  <label htmlFor="pedido-nome" className="block text-sm font-medium text-gray-700 mb-1">{t('nome')}<Obrig /></label>
                  <input id="pedido-nome" className={`input-field ${classeErro('pedido-nome')}`} autoComplete="name" maxLength={100} value={nome} aria-required aria-invalid={!!erroDe('pedido-nome')} aria-describedby={erroDe('pedido-nome') ? 'pedido-nome-erro' : undefined} onChange={(e) => { setNome(e.target.value); contarUmaVez('contato_digitou'); }} />
                  <Aviso id="pedido-nome" />
                </div>
                <div>
                  <label htmlFor="pedido-email" className="block text-sm font-medium text-gray-700 mb-1">{t('email')}<Obrig /></label>
                  <input id="pedido-email" type="email" inputMode="email" className={`input-field ${classeErro('pedido-email')}`} autoComplete="email" maxLength={254} value={email} aria-required aria-invalid={!!erroDe('pedido-email')} aria-describedby={erroDe('pedido-email') ? 'pedido-email-erro' : undefined} onChange={(e) => { setEmail(e.target.value); contarUmaVez('contato_digitou'); }} />
                  <Aviso id="pedido-email" />
                  {sugestao && (
                    <button type="button" onClick={() => setEmail(sugestao)} className="mt-1 text-sm text-amber-800 underline" data-testid="sugestao-email">{t('voceQuisDizer', { email: sugestao })}</button>
                  )}
                </div>
                {/* celular so para quem quer SMS (dono 13/11): desmarcado, o campo nem aparece e nada e enviado */}
                <div className="rounded-lg border border-gray-200 p-2.5 sm:p-3">
                  <label className="flex items-start gap-2 text-sm text-gray-800">
                    <input id="pedido-quer-sms" type="checkbox" checked={querSms} className="w-4 h-4 mt-0.5" data-testid="quer-sms"
                      onChange={(e) => { setQuerSms(e.target.checked); if (e.target.checked) contarUmaVez('contato_sms_opt'); else setTelefone(''); }} />
                    <span>{t('querSms')}<Opcional /></span>
                  </label>
                  {querSms && (
                    <div className="mt-2 sm:mt-3">
                      <label htmlFor="pedido-telefone" className="block text-sm font-medium text-gray-700 mb-1">{t('telefone')}<Obrig /></label>
                      <CampoTelefone id="pedido-telefone" value={telefone} onChange={setTelefone} required erroId={erroDe('pedido-telefone') ? 'pedido-telefone-erro' : null} />
                      <Aviso id="pedido-telefone" />
                      <p className="pedido-ajuda text-xs text-gray-500 mt-1">{t('telefoneDica')}</p>
                      <p className="flex items-start gap-1.5 text-xs text-gray-600 mt-2" data-testid="sms-privacidade">
                        <svg aria-hidden="true" className="w-4 h-4 shrink-0 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <span>{t('smsPrivacidade')}</span>
                      </p>
                    </div>
                  )}
                </div>
                {/* campo invisivel para robos (pessoas nao veem nem preenchem) */}
                <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                  <label htmlFor="pedido-site">Website</label>
                  <input id="pedido-site" tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
                </div>
                <label className={`flex items-start gap-2 text-sm text-gray-700 pt-1 ${erroDe('pedido-termos') ? 'rounded-lg -mx-2 px-2 py-1 border border-red-500' : ''}`}>
                  <input id="pedido-termos" type="checkbox" checked={termos} onChange={(e) => setTermos(e.target.checked)} className="w-4 h-4 mt-0.5" data-testid="aceito-termos" aria-required aria-invalid={!!erroDe('pedido-termos')} aria-describedby={erroDe('pedido-termos') ? 'pedido-termos-erro' : undefined} />
                  <span><Obrig />{' '}
                    {t.rich('aceitoTermos', {
                      termos: (c) => <Link href="/termos" target="_blank" className="text-primary-700 underline">{c}</Link>,
                      privacidade: (c) => <Link href="/privacidade" target="_blank" className="text-primary-700 underline">{c}</Link>,
                    })}
                  </span>
                </label>
                <Aviso id="pedido-termos" />
                {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
                <Navegar voltar="local" ok={contatoOk} avancar={() => enviar()} rotulo={enviando ? t('enviando') : t('enviarPedido')} falta={faltaContato[0]} campo={faltaContato[1]} />
              </div>
            )}
          </div>
        )}

        {etapa === 'codigo' && pendente && (
          <div data-testid="passo-codigo">
            <div className="text-center mb-2" aria-hidden="true">
              <svg className="w-12 h-12 mx-auto text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1 text-center">{t('codigoTitulo')}</h2>
            <p className="text-sm text-gray-700 mb-2 text-center">{t('codigoTexto', { email: pendente.email })}</p>
            <p className="text-sm font-medium text-gray-900 mb-5 text-center">{t('codigoBotaoEmail')}</p>
            <label htmlFor="pedido-codigo" className="block text-sm font-medium text-gray-700 mb-1">{t('codigoCampo')}</label>
            <input id="pedido-codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
              className="input-field text-center text-2xl tracking-[0.5em] font-semibold" value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
            {aviso && <p role="status" className="mt-2 text-sm text-green-700">{aviso}</p>}
            <button type="button" onClick={confirmar} disabled={codigo.length !== 6 || enviando} className="btn-success w-full mt-4 disabled:opacity-50" data-testid="confirmar-codigo">
              {enviando ? t('enviando') : t('confirmarEnviar')}
            </button>
            <p className="text-xs text-gray-500 mt-3">{t('codigoSpam')}</p>
            <div className="mt-4 flex flex-col gap-1">
              <button type="button" onClick={() => reenviar()} disabled={esperaReenvio > 0 || enviando} className="min-h-[44px] text-sm text-primary-700 underline disabled:text-gray-400 disabled:no-underline text-left">
                {esperaReenvio > 0 ? t('reenviarEm', { s: esperaReenvio }) : t('reenviarCodigo')}
              </button>
              {!corrigindo && (
                <button type="button" onClick={() => { setCorrigindo(true); setEmailNovo(pendente.email); }} className="min-h-[44px] text-sm text-primary-700 underline text-left" data-testid="corrigir-email">{t('emailErrado')}</button>
              )}
              {corrigindo && (
                <div className="rounded-lg bg-gray-50 p-3 mt-1">
                  <label htmlFor="pedido-email-novo" className="block text-sm font-medium text-gray-700 mb-1">{t('emailCorreto')}</label>
                  <input id="pedido-email-novo" type="email" className="input-field" value={emailNovo} onChange={(e) => setEmailNovo(e.target.value)} />
                  {sugestaoEmail(emailNovo) && <button type="button" onClick={() => setEmailNovo(sugestaoEmail(emailNovo)!)} className="mt-1 text-sm text-amber-800 underline">{t('voceQuisDizer', { email: sugestaoEmail(emailNovo)! })}</button>}
                  <button type="button" onClick={() => reenviar(emailNovo.trim())} disabled={!EMAIL_OK.test(emailNovo.trim()) || esperaReenvio > 0 || enviando} className="btn-primary w-full mt-2 disabled:opacity-50">{t('enviarParaEsteEmail')}</button>
                </div>
              )}
            </div>
            {/* transparencia: com este e-mail nasce um acesso BipFix (sem senha; a pessoa cria depois
                se quiser) - aqui e nao no passo contato, onde as pessoas desistiam (Fable 13/11) */}
            <p className="text-xs text-gray-500 mt-4" data-testid="acesso-texto">{t('acessoTexto')}</p>
          </div>
        )}
      </div>

      {etapa === 'servico' && (
        <p className="pedido-rodape text-center text-sm text-gray-600 mt-5">{t('jaTemConta')} <Link href="/login" className="text-primary-700 underline">{t('entrar')}</Link></p>
      )}
    </div>
  );
}
