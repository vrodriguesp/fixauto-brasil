'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter as useRouterNext } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, rota } from '@/i18n/navigation';
import { routing, hrefNoIdioma } from '@/i18n/routing';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { exemploPlaca } from '@/lib/exemplos';
import { textoErroApi } from '@/lib/erro-api';
import FipeAutocomplete from '@/components/forms/FipeAutocomplete';
import { registrarEventoMeta } from '@/components/Analytics';
import EnderecoAutocomplete from '@/components/forms/EnderecoAutocomplete';
import CampoTelefone from '@/components/forms/CampoTelefone';
import { placaValida, anoDoCarroValido } from '@/lib/validar-carro';
import { gravarFotosPedido, lerFotosPedido, apagarFotosPedido } from '@/lib/rascunho-pedido-fotos';
import {
  TIPOS_SERVICO, URGENCIAS,
  SERVICOS_REVISAO, SERVICOS_MECANICA, SERVICOS_ELETRICA, SERVICOS_PNEU,
} from '@fixauto/shared';

// Pedido de orcamento SEM cadastro e SEM senha (dono 06/11 e 12/11; regras em
// lib/pedido-sem-conta.ts). Mesmo pedido do /cliente/nova-solicitacao (servico,
// carro, local), mais nome e e-mail no fim (telefone so se a pessoa quiser SMS, dono
// 13/11); o pedido so vai para as oficinas depois da confirmacao pelo e-mail - o
// botao do e-mail OU o codigo de 6 digitos digitado aqui - e quem confirma entra na
// conta (nova ou ja existente). O app faz o mesmo em apps/mobile/app/pedido.tsx.
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

type Etapa = 'servico' | 'detalhe' | 'carro' | 'local' | 'contato' | 'codigo' | 'enviado';

// Trocar de idioma no meio do pedido (dono 06/11: "mudei para ingles e voltou a pagina").
// O formulario vai num rascunho no aparelho (localStorage, vale 24 h) e as fotos no
// IndexedDB (lib/rascunho-pedido-fotos): no Android o Chrome fecha a aba ao abrir a
// galeria/camera e a pagina volta do zero (emulador, dono 10/11); com sessionStorage
// o pedido inteiro se perdia.
const RASCUNHO = 'bipfix_pedido_rascunho';
const lerRascunho = () => localStorage.getItem(RASCUNHO) || sessionStorage.getItem(RASCUNHO); // sessionStorage: rascunho de antes de 10/11
const memoria: { fotos: { file: File; preview: string }[] } = { fotos: [] };
const LISTA_CURTA = 6; // "ver mais": a lista inteira so quando a pessoa pede

export default function PedidoSemConta() {
  const t = useTranslations('pedidoSemConta');
  const tn = useTranslations('clienteNovaSolicitacao');
  const tc = useTranslations('constants');
  const te = useTranslations('erros');
  const locale = useLocale();
  const router = useRouter();
  const routerNext = useRouterNext();
  const { isLoggedIn, loading: carregandoLogin } = useAuth();

  const [etapa, setEtapa] = useState<Etapa>('servico');
  // servico
  const [tipo, setTipo] = useState('');
  const [servicos, setServicos] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [descricao, setDescricao] = useState('');
  const [urgencia, setUrgencia] = useState('media');
  const [fotos, setFotos] = useState<{ file: File; preview: string }[]>(() => memoria.fotos);
  const [listaAberta, setListaAberta] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);
  const adicionarFotos = (e: ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files || []).slice(0, 6 - fotos.length);
    if (fs.length) contar('foto');
    setFotos((x) => [...x, ...fs.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    e.target.value = '';
  };
  // "Edasi" tocado com algo faltando: o aviso fica ao lado do botao e o foco vai ao campo
  // (Clarity 12/11: o botao so ficava palido, sem dizer o que faltava, e a pessoa desistia)
  const [faltando, setFaltando] = useState('');
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
  // funil do passo contato: digitou algo / marcou SMS (uma vez por visita)
  const contado = useRef<Record<string, boolean>>({});
  const contarUmaVez = (etapa: string) => { if (!contado.current[etapa]) { contado.current[etapa] = true; contar(etapa); } };

  // quem ja esta logado usa o pedido normal (mesmos passos, sem contato/codigo)
  useEffect(() => {
    // chegou pelo "voltar" depois de pedir (ja logado): vai ao inicio, nao abre outro pedido (dono 08/11)
    if (!carregandoLogin && isLoggedIn && etapa === 'servico' && !pendente) { const voltou = Date.now() - ((window as any).__bipfixVoltou || 0) < 5000 || (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'back_forward'; limparRascunho(); router.replace(voltou ? '/cliente/dashboard' : '/cliente/nova-solicitacao'); }
  }, [carregandoLogin, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // rascunho: volta o que a pessoa ja tinha feito (troca de idioma ou recarregar)
  const [rascunhoLido, setRascunhoLido] = useState(false);
  const etapaRestaurada = useRef<Etapa | null>(null);
  const fotosVoltando = useRef(false); // lendo as fotos do aparelho: nao apagar antes de voltarem
  useEffect(() => {
    let tinha = false;
    try {
      const r = JSON.parse(lerRascunho() || 'null');
      if (r && Date.now() - (r.em || 0) < 24 * 3600 * 1000) {
        tinha = true;
        setTipo(r.tipo || ''); setServicos(Array.isArray(r.servicos) ? r.servicos : []); setDescricao(r.descricao || ''); setUrgencia(r.urgencia || 'media');
        if (r.carro) setCarro(r.carro);
        setPlaca(r.placa || ''); setEndereco(r.endereco || ''); setCoords(r.coords || null); setPais(r.pais || null);
        setNome(r.nome || ''); setEmail(r.email || ''); setQuerSms(!!r.querSms); setTelefone(r.querSms ? r.telefone || '' : ''); setTermos(!!r.termos);
        if (r.pendente?.id && r.pendente?.email) setPendente({ id: r.pendente.id, email: r.pendente.email });
        // codigo so com o pedido pendente guardado; senao volta ao contato
        const e: Etapa = r.etapa === 'codigo' && !r.pendente ? 'contato' : r.etapa;
        if (e && e !== 'enviado') { etapaRestaurada.current = e; setEtapa(e); }
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
    if (!tinha) contar('abriu');
    setRascunhoLido(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rascunhoLido) return;
    memoria.fotos = fotos;
    try {
      localStorage.setItem(RASCUNHO, JSON.stringify({ em: Date.now(), etapa, tipo, servicos, descricao, urgencia, carro, placa, endereco, coords, pais, nome, email, querSms, telefone, termos, pendente, qtdFotos: fotos.length }));
    } catch { /* ignora */ }
  }, [rascunhoLido, etapa, tipo, servicos, descricao, urgencia, carro, placa, endereco, coords, pais, nome, email, querSms, telefone, termos, pendente, fotos]);
  useEffect(() => {
    if (!rascunhoLido || fotosVoltando.current) return;
    if (fotos.length) gravarFotosPedido(fotos.map((f) => f.file)); else apagarFotosPedido();
  }, [rascunhoLido, fotos]);
  const limparRascunho = () => {
    memoria.fotos = [];
    try { localStorage.removeItem(RASCUNHO); sessionStorage.removeItem(RASCUNHO); } catch { /* ignora */ }
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
  const ORDEM: Etapa[] = ['servico', 'detalhe', 'carro', 'local', 'contato', 'codigo'];
  const doHistorico = useRef(false);
  const etapaAnterior = useRef<Etapa | null>(null);
  const empilhados = useRef(0);
  useEffect(() => {
    if (!rascunhoLido) return;
    const ant = etapaAnterior.current; etapaAnterior.current = etapa;
    if (doHistorico.current) { doHistorico.current = false; return; }
    if (etapa === 'enviado') return;
    const est = { ...window.history.state, pedidoEtapa: etapa };
    if (ant && ORDEM.indexOf(etapa) > ORDEM.indexOf(ant)) { window.history.pushState(est, ''); empilhados.current++; }
    else window.history.replaceState(est, '');
  }, [etapa, rascunhoLido]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const voltou = (ev: PopStateEvent) => {
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
    setFaltando('');
    // o passo que voltou do rascunho (pagina recarregada) ja foi contado antes
    if (etapaRestaurada.current === etapa) etapaRestaurada.current = null;
    else if (['detalhe', 'carro', 'local', 'contato'].includes(etapa)) contar(etapa);
    if (primeiraEtapa.current) { primeiraEtapa.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [etapa]);
  // tela curta (celular deitado): globals.css encolhe o cabecalho desta pagina
  useEffect(() => {
    document.body.classList.add('pagina-pedido');
    return () => document.body.classList.remove('pagina-pedido');
  }, []);
  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const i = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(i);
  }, [esperaReenvio]);
  // posicao do aparelho (se permitida): aproxima as sugestoes de endereco e evita digitar.
  // So no passo do endereco (dono 10/11: o pedido de localizacao ao abrir a pagina, antes de
  // qualquer toque, assusta quem chega pelo anuncio). Nunca bloqueia: roda em segundo plano,
  // o campo continua editavel e sem permissao/sinal o endereco digitado vira coordenada no envio.
  const localPedido = useRef(false);
  useEffect(() => {
    if (etapa !== 'local' || localPedido.current || coords || !navigator.geolocation) return;
    localPedido.current = true;
    navigator.geolocation.getCurrentPosition(async (p) => {
      const c = { lat: p.coords.latitude, lon: p.coords.longitude };
      setCoords((atual) => atual || c);
      const r = await fetch(`/api/geocode?lat=${c.lat}&lon=${c.lon}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => ({})) : {};
      if (d.paisCodigo) setPais((x) => x || d.paisCodigo);
    }, () => {}, { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 });
  }, [etapa]); // eslint-disable-line react-hooks/exhaustive-deps

  const tipoConfig = TIPOS_SERVICO.find((x) => x.value === tipo);
  const NS: Record<string, string> = { revisao: 'servicosRevisao', mecanica: 'servicosMecanica', eletrica: 'servicosEletrica', pneu: 'servicosPneu' };
  const lista = tipo === 'revisao' ? SERVICOS_REVISAO : tipo === 'mecanica' ? SERVICOS_MECANICA : tipo === 'eletrica' ? SERVICOS_ELETRICA : tipo === 'pneu' ? SERVICOS_PNEU : [];
  const rotuloServico = (v: string) => (NS[tipo] ? tc(`${NS[tipo]}.${v}`) : v);
  // busca sem acento e sem maiusculas ('rehvi' acha 'Rehvide vahetus')
  const semAcento = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const listaFiltrada = lista.filter((sv) => semAcento(rotuloServico(sv.value)).includes(semAcento(busca.trim())));
  const listaCurta = !listaAberta && !busca.trim() && listaFiltrada.length > LISTA_CURTA;
  const listaVisivel = listaCurta ? listaFiltrada.filter((sv, i) => i < LISTA_CURTA || servicos.includes(sv.value)) : listaFiltrada;
  // escreveu o que precisa OU marcou algum servico da lista OU mandou foto (12/11: para
  // colisao/lataria/outro nao ha lista e a foto e o que a pessoa mais toca - vale como descricao)
  // regra do dono (12/11): tipo + escrever o que precisa OU marcar da lista; a foto ajuda mas nao substitui o texto
  const servicoOk = !!tipo && (descricao.trim().length > 0 || servicos.length > 0);
  // placa e ano conferidos aqui, com o aviso ao lado do campo (item 53)
  const carroDados = !!(carro.marca && carro.modelo && carro.ano);
  const carroOk = carroDados && placaValida(placa) && anoDoCarroValido(carro.ano);
  const contatoOk = nome.trim().length > 0 && EMAIL_OK.test(email.trim()) && (!querSms || TELEFONE_OK(telefone)) && termos;
  const sugestao = sugestaoEmail(email);
  // o que falta em cada passo (aviso + campo que recebe o foco)
  // diz SO o que falta: "marca, modelo e ano" com marca e modelo ja escolhidos confundia (Clarity 12/11)
  const faltaCarro: [string, string] = !carroDados ? (!carro.marca ? [t('faltaMarca'), 'cbbe3-101'] : !carro.modelo ? [t('faltaModelo'), 'cbbe3-102'] : [t('faltaAno'), 'cbbe3-103']) :[t('faltaCarroConferir'), anoDoCarroValido(carro.ano) ? 'pedido-placa' : 'cbbe3-103'];
  const faltaContato: [string, string] = !nome.trim() ? [t('faltaNome'), 'pedido-nome'] : !EMAIL_OK.test(email.trim()) ? [t('faltaEmail'), 'pedido-email']
    : querSms && !TELEFONE_OK(telefone) ? [t('faltaTelefone'), 'pedido-telefone'] : [t('faltaTermos'), 'pedido-termos'];
  useEffect(() => { setFaltando(''); }, [servicoOk, carroOk, endereco, contatoOk]); // corrigiu: o aviso some

  const descricaoFinal = () => servicos.length > 0
    ? `${tn('servicesPrefix')} ${servicos.map(rotuloServico).join(', ')}${descricao.trim() ? '. ' + descricao.trim() : ''}`
    : (descricao.trim() || tn('defaultServiceDescription'));

  // sem posicao do aparelho: o endereco digitado vira coordenada (nunca um ponto fixo)
  const resolverLocal = async () => {
    if (coords) return { ...coords, pais };
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(endereco)}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
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
        tipo, descricao: descricaoFinal(), urgencia, endereco, latitude: local.lat, longitude: local.lon, pais: local.pais,
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

  const passos: Etapa[] = ['servico', 'detalhe', 'carro', 'local', 'contato'];
  const indice = passos.indexOf(etapa);
  // no celular os botoes ficam presos no rodape da tela: "Edasi" ficava abaixo da dobra
  // (y=876 numa tela de 780) e a pessoa achava que estava travada (Clarity, dono 10/11)
  // "Edasi" sempre clicavel (so trava enquanto envia): faltando algo, diz o que e e leva ao campo
  const Navegar = ({ voltar, avancar, ok, rotulo, falta, campo }: { voltar?: Etapa; avancar: () => void; ok: boolean; rotulo?: string; falta: string; campo: string }) => (
    <div className="flex flex-wrap justify-between mt-6 gap-3 sticky bottom-0 z-10 -mx-6 px-6 py-3 bg-white/95 backdrop-blur border-t border-gray-100 rounded-b-xl sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none sm:border-0" data-testid="navegar">
      {faltando && <p role="alert" className="w-full text-sm text-red-700" data-testid="falta-aviso">{faltando}</p>}
      {voltar ? <button type="button" onClick={() => voltarPara(voltar)} className="btn-secondary">{tn('back')}</button> : <span />}
      <button type="button" onClick={() => { if (ok) { setFaltando(''); avancar(); return; } setFaltando(falta); contar(`edasi_bloqueado_${etapa}`); focar(campo); }}
        disabled={enviando} aria-busy={enviando} className="btn-primary disabled:opacity-50">{rotulo || tn('next')}</button>
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

  return (
    <div className="pedido-pagina max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="pedido-titulo text-2xl font-bold text-gray-900">{t('titulo')}</h1>
      <p className="pedido-subtitulo text-gray-600 mt-1 mb-6">{t('subtitulo')}</p>

      {indice >= 0 && (
        <div className="pedido-progresso flex items-center gap-2 mb-6" aria-label={t('passoDe', { n: indice + 1, total: passos.length })}>
          {passos.map((p, i) => <div key={p} className={`flex-1 h-2 rounded-full ${i <= indice ? 'bg-primary-600' : 'bg-gray-200'}`} />)}
          <span className="text-sm text-gray-500 ml-2">{indice + 1}/{passos.length}</span>
        </div>
      )}

      <div className="card">
        {/* 1) so o tipo: um toque e ja vai para a pagina seguinte (guiado, pedido do dono 06/11) */}
        {etapa === 'servico' && (
          <div data-testid="passo-servico">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{tn('step2Title')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {TIPOS_SERVICO.map((s) => (
                <button key={s.value} type="button" aria-pressed={tipo === s.value}
                  onClick={() => { if (s.value !== tipo) { setServicos([]); setBusca(''); setListaAberta(false); } contar('servico'); setTipo(s.value); setEtapa('detalhe'); }}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${tipo === s.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className="text-2xl">{s.icon}</span>
                  <p className="font-medium text-gray-900 mt-2">{tc(`tiposServico.${s.value}`)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2) o que precisa: escreve com as proprias palavras OU procura na lista do tipo */}
        {etapa === 'detalhe' && (
          <div data-testid="passo-detalhe">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{tipoConfig?.icon} {tc(`tiposServico.${tipo}`)}</h2>
            <p className="text-sm text-gray-500 mb-4">{lista.length > 0 ? t('detalheTexto') : tn('placeholderDescribeIssue')}</p>
            <label htmlFor="pedido-descricao" className="block text-sm font-medium text-gray-700 mb-1">{tn('describeProblem')}</label>
            <textarea id="pedido-descricao" className="input-field min-h-[100px]" maxLength={1800} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder={tn('placeholderDescribeIssue')} />
            {lista.length > 0 && (
              <div className="mt-5">
                <label htmlFor="pedido-busca" className="block text-sm font-medium text-gray-700 mb-1">{tn('step3ServiceTitle')}</label>
                <input id="pedido-busca" type="search" className="input-field" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('buscarServico')} />
                <div className="space-y-2 mt-2" data-testid="lista-servicos">
                  {listaVisivel.map((sv) => (
                    <label key={sv.value} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer ${servicos.includes(sv.value) ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
                      <input type="checkbox" checked={servicos.includes(sv.value)} onChange={() => setServicos((x) => x.includes(sv.value) ? x.filter((y) => y !== sv.value) : [...x, sv.value])} className="w-4 h-4" />
                      <span className="text-sm text-gray-900">{rotuloServico(sv.value)}</span>
                    </label>
                  ))}
                  {listaFiltrada.length === 0 && <p className="text-sm text-gray-500 py-2">{t('semResultadoBusca')}</p>}
                  {listaFiltrada.length > LISTA_CURTA && !busca.trim() && (
                    <button type="button" onClick={() => setListaAberta((x) => !x)} className="w-full min-h-[44px] text-sm font-medium text-primary-700 underline" data-testid="ver-mais">
                      {listaCurta ? t('verTodos', { n: listaFiltrada.length }) : t('verMenos')}
                    </button>
                  )}
                </div>
              </div>
            )}
            <p className="text-sm font-medium text-gray-700 mt-5 mb-2">{t('fotosTitulo')}</p>
            {/* camera e galeria separadas (dono 10/11): com um so botao o Chrome novo do Android
                abre direto a galeria, sem a opcao de tirar foto */}
            <input ref={inputCamera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={adicionarFotos} />
            <input ref={inputFoto} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={adicionarFotos} />
            {fotos.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {fotos.map((f, i) => (
                  <div key={f.preview} className="relative aspect-square rounded-lg overflow-hidden">
                    <img src={f.preview} alt={tn('photoAlt', { n: i + 1 })} className="w-full h-full object-cover" />
                    <button type="button" aria-label={t('removerFoto')} onClick={() => setFotos((x) => x.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-sm">×</button>
                  </div>
                ))}
              </div>
            )}
            {fotos.length < 6 && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => inputCamera.current?.click()} data-testid="foto-camera"
                  className="min-h-[48px] border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-700 hover:border-primary-400">📷 {t('tirarFoto')}</button>
                <button type="button" onClick={() => inputFoto.current?.click()} data-testid="foto-galeria"
                  className="min-h-[48px] border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-700 hover:border-primary-400">🖼️ {t('escolherGaleria')}</button>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">{t('fotosAjuda')}</p>
            <p className="text-sm font-medium text-gray-700 mt-5 mb-2">{tn('urgencyLabel')}</p>
            <div className="grid sm:grid-cols-3 gap-2">
              {URGENCIAS.map((u) => (
                <button key={u.value} type="button" onClick={() => setUrgencia(u.value)} aria-pressed={urgencia === u.value}
                  className={`p-3 rounded-lg border-2 text-left ${urgencia === u.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
                  <p className="font-medium text-gray-900 text-sm">{tc(`urgencias.${u.value}`)}</p>
                  <p className="text-xs text-gray-500">{tc(`urgencias.${u.value}Desc`)}</p>
                </button>
              ))}
            </div>
            <Navegar voltar="servico" ok={servicoOk} avancar={() => setEtapa('carro')} falta={lista.length > 0 ? t('faltaDescricaoLista') : t('faltaDescricao')} campo="pedido-descricao" />
          </div>
        )}

        {/* o passo do carro fica montado (so escondido): o seletor de marca/modelo guarda a
            escolha dentro dele e, desmontado, voltava vazio ao ir e voltar (teste 06/11) */}
        {(
          <div data-testid="passo-carro" hidden={etapa !== 'carro'}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{tn('step1Title')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('carroDica')}</p>
            <FipeAutocomplete limparForaDoCatalogo value={{ tipo: carro.tipo, marca: carro.marca, modelo: carro.modelo, ano: carro.ano }}
              onChange={(f) => setCarro({ tipo: f.tipo, marca: f.marca, modelo: f.modelo, ano: f.ano, codigo: f.codigo || '' })} />
            <label htmlFor="pedido-placa" className="block text-sm font-medium text-gray-700 mt-4 mb-1">{tn('plateLabel')}</label>
            {!anoDoCarroValido(carro.ano) && <p role="alert" className="mt-1 text-sm text-red-700">{te('ANO_INVALIDO')}</p>}
            <input id="pedido-placa" className="input-field" maxLength={10} aria-invalid={!placaValida(placa)} placeholder={exemploPlaca(locale)} value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
            {!placaValida(placa) && <p role="alert" className="mt-1 text-sm text-red-700" data-testid="placa-invalida">{te('PLACA_INVALIDA')}</p>}
            <Navegar voltar="detalhe" ok={carroOk} avancar={() => setEtapa('local')} falta={faltaCarro[0]} campo={faltaCarro[1]} />
          </div>
        )}

        {etapa === 'local' && (
          <div data-testid="passo-local">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{tn('step5Title')}</h2>
            <label htmlFor="pedido-endereco" className="block text-sm font-medium text-gray-700 mb-1">{tn('addressLabel')}</label>
            <EnderecoAutocomplete id="pedido-endereco" value={endereco} onChange={(v) => { setEndereco(v); }} placeholder={tn('placeholderAddress')} perto={coords}
              onSelect={(s) => { setEndereco(s.rotulo); setCoords({ lat: s.latitude, lon: s.longitude }); if (s.paisCodigo) setPais(s.paisCodigo); }} />
            <p className="text-xs text-gray-500 mt-1">{tn('addressHelp')}</p>
            {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
            <Navegar voltar="carro" ok={endereco.trim().length > 2} avancar={() => { setErro(''); setEtapa('contato'); }} falta={t('faltaEndereco')} campo="pedido-endereco" />
          </div>
        )}

        {etapa === 'contato' && (
          <div data-testid="passo-contato">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('contatoTitulo')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('contatoTexto')}</p>
            {(
              <div className="space-y-3">
                <div>
                  <label htmlFor="pedido-nome" className="block text-sm font-medium text-gray-700 mb-1">{t('nome')}</label>
                  <input id="pedido-nome" className="input-field" autoComplete="name" maxLength={100} value={nome} onChange={(e) => { setNome(e.target.value); contarUmaVez('contato_digitou'); }} />
                </div>
                <div>
                  <label htmlFor="pedido-email" className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                  <input id="pedido-email" type="email" inputMode="email" className="input-field" autoComplete="email" maxLength={254} value={email} onChange={(e) => { setEmail(e.target.value); contarUmaVez('contato_digitou'); }} />
                  {sugestao && (
                    <button type="button" onClick={() => setEmail(sugestao)} className="mt-1 text-sm text-amber-800 underline" data-testid="sugestao-email">{t('voceQuisDizer', { email: sugestao })}</button>
                  )}
                </div>
                {/* celular so para quem quer SMS (dono 13/11): desmarcado, o campo nem aparece e nada e enviado */}
                <div className="rounded-lg border border-gray-200 p-3">
                  <label className="flex items-start gap-2 text-sm text-gray-800">
                    <input id="pedido-quer-sms" type="checkbox" checked={querSms} className="w-4 h-4 mt-0.5" data-testid="quer-sms"
                      onChange={(e) => { setQuerSms(e.target.checked); if (e.target.checked) contarUmaVez('contato_sms_opt'); else setTelefone(''); }} />
                    <span>{t('querSms')}</span>
                  </label>
                  {querSms && (
                    <div className="mt-3">
                      <label htmlFor="pedido-telefone" className="block text-sm font-medium text-gray-700 mb-1">{t('telefone')}</label>
                      <CampoTelefone id="pedido-telefone" value={telefone} onChange={setTelefone} />
                      <p className="text-xs text-gray-500 mt-1">{t('telefoneDica')}</p>
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
                <label className="flex items-start gap-2 text-sm text-gray-700 pt-1">
                  <input id="pedido-termos" type="checkbox" checked={termos} onChange={(e) => setTermos(e.target.checked)} className="w-4 h-4 mt-0.5" data-testid="aceito-termos" />
                  <span>
                    {t.rich('aceitoTermos', {
                      termos: (c) => <Link href="/termos" target="_blank" className="text-primary-700 underline">{c}</Link>,
                      privacidade: (c) => <Link href="/privacidade" target="_blank" className="text-primary-700 underline">{c}</Link>,
                    })}
                  </span>
                </label>
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
        <p className="text-center text-sm text-gray-600 mt-6">{t('jaTemConta')} <Link href="/login" className="text-primary-700 underline">{t('entrar')}</Link></p>
      )}
    </div>
  );
}
