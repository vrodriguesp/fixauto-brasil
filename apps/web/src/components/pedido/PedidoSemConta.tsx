'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter as useRouterNext } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { routing, hrefNoIdioma } from '@/i18n/routing';
import { useAuth } from '@/lib/auth-context';
import { exemploPlaca } from '@/lib/exemplos';
import { textoErroApi } from '@/lib/erro-api';
import FipeAutocomplete from '@/components/forms/FipeAutocomplete';
import EnderecoAutocomplete from '@/components/forms/EnderecoAutocomplete';
import CampoTelefone from '@/components/forms/CampoTelefone';
import {
  TIPOS_SERVICO, URGENCIAS,
  SERVICOS_REVISAO, SERVICOS_MECANICA, SERVICOS_ELETRICA, SERVICOS_PNEU,
} from '@fixauto/shared';

// Pedido de orcamento SEM cadastro (dono 06/11; regras em lib/pedido-sem-conta.ts).
// Mesmo pedido do /cliente/nova-solicitacao (servico, carro, local), mais o
// contato no fim; o pedido so vai para as oficinas depois do codigo de 6 digitos
// enviado ao e-mail. O app faz o mesmo em apps/mobile/app/pedido.tsx.
const FUNIL = 'pedido_site';
const contar = (etapa: string) => {
  try { fetch('/api/funil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ funil: FUNIL, etapa }), keepalive: true }).catch(() => {}); } catch { /* nunca atrapalha o pedido */ }
};
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
// O resto do formulario vai num rascunho da aba (sessionStorage); senha e fotos ficam
// so na memoria da pagina (nunca gravadas) e sobrevivem porque a troca de idioma
// nesta pagina e feita sem recarregar (ver o clique nos links de idioma abaixo).
const RASCUNHO = 'bipfix_pedido_rascunho';
const memoria: { senha: string; senhaLogin: string; fotos: { file: File; preview: string }[] } = { senha: '', senhaLogin: '', fotos: [] };
const LISTA_CURTA = 6; // "ver mais": a lista inteira so quando a pessoa pede

export default function PedidoSemConta() {
  const t = useTranslations('pedidoSemConta');
  const tn = useTranslations('clienteNovaSolicitacao');
  const tc = useTranslations('constants');
  const te = useTranslations('erros');
  const locale = useLocale();
  const router = useRouter();
  const routerNext = useRouterNext();
  const { isLoggedIn, loading: carregandoLogin, signIn } = useAuth();

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
  const [senha, setSenha] = useState(() => memoria.senha);
  const [verSenha, setVerSenha] = useState(false);
  const [telefone, setTelefone] = useState('');
  const [termos, setTermos] = useState(false);
  const [site, setSite] = useState(''); // campo invisivel (robo)
  // envio / codigo
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [contaExistente, setContaExistente] = useState(false);
  const [senhaLogin, setSenhaLogin] = useState(() => memoria.senhaLogin);
  const [pendente, setPendente] = useState<{ id: string; email: string; contaNova: boolean } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState('');
  const [corrigindo, setCorrigindo] = useState(false);
  const [emailNovo, setEmailNovo] = useState('');
  const [esperaReenvio, setEsperaReenvio] = useState(0);
  const [resultado, setResultado] = useState<{ numero: number | null; contaNova: boolean } | null>(null);

  // quem ja esta logado usa o pedido normal (mesmos passos, sem contato/codigo)
  useEffect(() => {
    // chegou pelo "voltar" depois de pedir (ja logado): vai ao inicio, nao abre outro pedido (dono 08/11)
    if (!carregandoLogin && isLoggedIn && etapa === 'servico' && !pendente) { const voltou = Date.now() - ((window as any).__bipfixVoltou || 0) < 5000 || (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'back_forward'; limparRascunho(); router.replace(voltou ? '/cliente/dashboard' : '/cliente/nova-solicitacao'); }
  }, [carregandoLogin, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // rascunho: volta o que a pessoa ja tinha feito (troca de idioma ou recarregar)
  const [rascunhoLido, setRascunhoLido] = useState(false);
  useEffect(() => {
    let tinha = false;
    try {
      const r = JSON.parse(sessionStorage.getItem(RASCUNHO) || 'null');
      if (r && Date.now() - (r.em || 0) < 24 * 3600 * 1000) {
        tinha = true;
        setTipo(r.tipo || ''); setServicos(Array.isArray(r.servicos) ? r.servicos : []); setDescricao(r.descricao || ''); setUrgencia(r.urgencia || 'media');
        if (r.carro) setCarro(r.carro);
        setPlaca(r.placa || ''); setEndereco(r.endereco || ''); setCoords(r.coords || null); setPais(r.pais || null);
        setNome(r.nome || ''); setEmail(r.email || ''); setTelefone(r.telefone || ''); setTermos(!!r.termos);
        setContaExistente(!!r.contaExistente);
        if (r.pendente) setPendente(r.pendente);
        // codigo so com o pedido pendente guardado; senao volta ao contato
        const e: Etapa = r.etapa === 'codigo' && !r.pendente ? 'contato' : r.etapa;
        if (e && e !== 'enviado') setEtapa(e);
      }
    } catch { /* sem armazenamento: comeca do zero */ }
    if (!tinha) contar('abriu');
    setRascunhoLido(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rascunhoLido) return;
    memoria.senha = senha; memoria.senhaLogin = senhaLogin; memoria.fotos = fotos;
    try {
      sessionStorage.setItem(RASCUNHO, JSON.stringify({ em: Date.now(), etapa, tipo, servicos, descricao, urgencia, carro, placa, endereco, coords, pais, nome, email, telefone, termos, contaExistente, pendente }));
    } catch { /* ignora */ }
  }, [rascunhoLido, etapa, tipo, servicos, descricao, urgencia, carro, placa, endereco, coords, pais, nome, email, telefone, termos, contaExistente, pendente, senha, senhaLogin, fotos]);
  const limparRascunho = () => {
    memoria.senha = ''; memoria.senhaLogin = ''; memoria.fotos = [];
    try { sessionStorage.removeItem(RASCUNHO); } catch { /* ignora */ }
  };
  // links de idioma (cabecalho/rodape) nesta pagina: troca sem recarregar, para
  // senha e fotos (so na memoria) nao se perderem
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
  // passo novo comeca no alto (o anterior era mais comprido: a pessoa via so o rodape - teste do dono 06/11)
  const primeiraEtapa = useRef(true);
  useEffect(() => {
    if (['detalhe', 'carro', 'local', 'contato'].includes(etapa)) contar(etapa);
    if (primeiraEtapa.current) { primeiraEtapa.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [etapa]);
  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const i = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(i);
  }, [esperaReenvio]);
  // posicao do aparelho (se permitida): aproxima as sugestoes de endereco e evita digitar
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (p) => {
      const c = { lat: p.coords.latitude, lon: p.coords.longitude };
      setCoords((atual) => atual || c);
      const r = await fetch(`/api/geocode?lat=${c.lat}&lon=${c.lon}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => ({})) : {};
      if (d.paisCodigo) setPais((x) => x || d.paisCodigo);
    }, () => {}, { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 });
  }, []);

  const tipoConfig = TIPOS_SERVICO.find((x) => x.value === tipo);
  const NS: Record<string, string> = { revisao: 'servicosRevisao', mecanica: 'servicosMecanica', eletrica: 'servicosEletrica', pneu: 'servicosPneu' };
  const lista = tipo === 'revisao' ? SERVICOS_REVISAO : tipo === 'mecanica' ? SERVICOS_MECANICA : tipo === 'eletrica' ? SERVICOS_ELETRICA : tipo === 'pneu' ? SERVICOS_PNEU : [];
  const rotuloServico = (v: string) => (NS[tipo] ? tc(`${NS[tipo]}.${v}`) : v);
  // busca sem acento e sem maiusculas ('rehvi' acha 'Rehvide vahetus')
  const semAcento = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const listaFiltrada = lista.filter((sv) => semAcento(rotuloServico(sv.value)).includes(semAcento(busca.trim())));
  const listaCurta = !listaAberta && !busca.trim() && listaFiltrada.length > LISTA_CURTA;
  const listaVisivel = listaCurta ? listaFiltrada.filter((sv, i) => i < LISTA_CURTA || servicos.includes(sv.value)) : listaFiltrada;
  // escreveu o que precisa OU marcou algum servico da lista
  const servicoOk = !!tipo && (descricao.trim().length > 0 || servicos.length > 0);
  const carroOk = !!(carro.marca && carro.modelo && carro.ano);
  const contatoOk = nome.trim().length > 0 && EMAIL_OK.test(email.trim()) && senha.length >= 8 && termos;
  const sugestao = sugestaoEmail(email);

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

  const enviar = async (modo?: 'codigo') => {
    if (enviando) return;
    setEnviando(true); setErro('');
    try {
      const local = await resolverLocal();
      if (!local) { setErro(tn('erroLocalizacao')); setEtapa('local'); return; }
      const form = new FormData();
      form.append('dados', JSON.stringify({
        origem: 'site', modo, site, idioma: locale, nome: nome.trim(), email: email.trim(), senha, telefone: telefone.trim(), aceitouTermos: termos,
        tipo, descricao: descricaoFinal(), urgencia, endereco, latitude: local.lat, longitude: local.lon, pais: local.pais,
        veiculo: { tipo: carro.tipo, marca: carro.marca, modelo: carro.modelo, ano: carro.ano, codigo: carro.codigo || null, placa: placa.trim() || null },
      }));
      for (const f of fotos) form.append('fotos', f.file);
      const res = await fetch('/api/pedido-sem-conta', { method: 'POST', body: form }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (res?.status === 409 && d.codigo === 'CONTA_EXISTENTE') { setContaExistente(true); return; }
      if (!res || !res.ok) { setErro(textoErroApi(te, res?.status || 500, d)); return; }
      if (d.solicitacaoId) { limparRascunho(); router.replace(`/cliente/orcamentos/${d.solicitacaoId}`); return; } // entrou com a senha
      setPendente({ id: d.pendenteId, email: d.email, contaNova: !!d.contaNova });
      setEsperaReenvio(30); setCodigo(''); setAviso('');
      setEtapa('codigo');
    } finally {
      setEnviando(false);
    }
  };

  // e-mail que ja tem conta: entra aqui mesmo e o pedido segue com a sessao
  const entrarEEnviar = async () => {
    if (!senhaLogin || enviando) return;
    setEnviando(true); setErro('');
    const { error } = await signIn(email.trim(), senhaLogin);
    setEnviando(false);
    if (error) {
      setErro(error === 'email_not_confirmed' ? t('loginNaoConfirmado') : error.startsWith('over_') ? te('MUITAS_TENTATIVAS') : t('loginErro'));
      return;
    }
    await enviar();
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
      if (!res || !res.ok) { setErro(textoErroApi(te, res?.status || 500, d)); return; }
      if (pendente.contaNova) {
        // conta nova: ja entra com a senha que acabou de criar e abre o pedido
        const { error } = await signIn(pendente.email, senha);
        if (!error) { limparRascunho(); router.replace(`/cliente/orcamentos/${d.solicitacaoId}`); return; }
      }
      limparRascunho();
      setResultado({ numero: d.numero ?? null, contaNova: pendente.contaNova });
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
  const Navegar = ({ voltar, avancar, ok, rotulo }: { voltar?: Etapa; avancar: () => void; ok: boolean; rotulo?: string }) => (
    <div className="flex justify-between mt-6 gap-3">
      {voltar ? <button type="button" onClick={() => setEtapa(voltar)} className="btn-secondary">{tn('back')}</button> : <span />}
      <button type="button" onClick={avancar} disabled={!ok || enviando} aria-busy={enviando} className="btn-primary disabled:opacity-50">{rotulo || tn('next')}</button>
    </div>
  );

  if (etapa === 'enviado') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center" data-testid="pedido-enviado">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('enviadoTitulo')}</h1>
        <p className="text-gray-600 mb-6">{t('enviadoTexto', { email: pendente?.email || email })}</p>
        <Link href="/login" className="btn-primary inline-block">{t('enviadoEntrar')}</Link>
        {!resultado?.contaNova && (aviso ? <p role="status" className="mt-4 text-sm text-green-700">{aviso}</p> : (
          <button type="button" className="mt-4 text-sm text-primary-700 underline min-h-[44px]" onClick={async () => {
            await fetch('/api/esqueci-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pendente?.email || email.trim(), locale }) }).catch(() => {});
            setAviso(t('linkSenhaEnviado'));
          }}>{t('enviadoCriarSenha')}</button>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
      <p className="text-gray-600 mt-1 mb-6">{t('subtitulo')}</p>

      {indice >= 0 && (
        <div className="flex items-center gap-2 mb-6" aria-label={t('passoDe', { n: indice + 1, total: passos.length })}>
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
                  onClick={() => { if (s.value !== tipo) { setServicos([]); setBusca(''); setListaAberta(false); } setTipo(s.value); setEtapa('detalhe'); }}
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
            <input ref={inputFoto} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1}
              onChange={(e) => { const fs = Array.from(e.target.files || []).slice(0, 6 - fotos.length); setFotos((x) => [...x, ...fs.map((file) => ({ file, preview: URL.createObjectURL(file) }))]); e.target.value = ''; }} />
            <div className="grid grid-cols-4 gap-2">
              {fotos.map((f, i) => (
                <div key={f.preview} className="relative aspect-square rounded-lg overflow-hidden">
                  <img src={f.preview} alt={tn('photoAlt', { n: i + 1 })} className="w-full h-full object-cover" />
                  <button type="button" aria-label={t('removerFoto')} onClick={() => setFotos((x) => x.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-sm">×</button>
                </div>
              ))}
              {fotos.length < 6 && (
                <button type="button" onClick={() => inputFoto.current?.click()} className="aspect-square border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-primary-400">+ {tn('addPhoto')}</button>
              )}
            </div>
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
            <Navegar voltar="servico" ok={servicoOk} avancar={() => setEtapa('carro')} />
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
            <input id="pedido-placa" className="input-field" maxLength={15} placeholder={exemploPlaca(locale)} value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
            <Navegar voltar="detalhe" ok={carroOk} avancar={() => setEtapa('local')} />
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
            <Navegar voltar="carro" ok={endereco.trim().length > 2} avancar={() => { setErro(''); setEtapa('contato'); }} />
          </div>
        )}

        {etapa === 'contato' && (
          <div data-testid="passo-contato">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('contatoTitulo')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('contatoTexto')}</p>
            {!contaExistente && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="pedido-nome" className="block text-sm font-medium text-gray-700 mb-1">{t('nome')}</label>
                  <input id="pedido-nome" className="input-field" autoComplete="name" maxLength={100} value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pedido-email" className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                  <input id="pedido-email" type="email" inputMode="email" className="input-field" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
                  {sugestao && (
                    <button type="button" onClick={() => setEmail(sugestao)} className="mt-1 text-sm text-amber-800 underline" data-testid="sugestao-email">{t('voceQuisDizer', { email: sugestao })}</button>
                  )}
                </div>
                <div>
                  <label htmlFor="pedido-senha" className="block text-sm font-medium text-gray-700 mb-1">{t('senha')}</label>
                  <div className="relative">
                    <input id="pedido-senha" type={verSenha ? 'text' : 'password'} className="input-field pr-20" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={8} maxLength={72} value={senha} onChange={(e) => setSenha(e.target.value)} />
                    <button type="button" onClick={() => setVerSenha((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-primary-700 px-2 py-1">{verSenha ? t('ocultar') : t('mostrar')}</button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{t('senhaDica')}</p>
                </div>
                <div>
                  <label htmlFor="pedido-telefone" className="block text-sm font-medium text-gray-700 mb-1">{t('telefone')} <span className="text-gray-400 font-normal">({t('opcional')})</span></label>
                  <CampoTelefone id="pedido-telefone" value={telefone} onChange={setTelefone} />
                  <p className="text-xs text-gray-500 mt-1">{t('telefoneDica')}</p>
                </div>
                {/* campo invisivel para robos (pessoas nao veem nem preenchem) */}
                <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                  <label htmlFor="pedido-site">Website</label>
                  <input id="pedido-site" tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
                </div>
                <label className="flex items-start gap-2 text-sm text-gray-700 pt-1">
                  <input type="checkbox" checked={termos} onChange={(e) => setTermos(e.target.checked)} className="w-4 h-4 mt-0.5" data-testid="aceito-termos" />
                  <span>
                    {t.rich('aceitoTermos', {
                      termos: (c) => <Link href="/termos" target="_blank" className="text-primary-700 underline">{c}</Link>,
                      privacidade: (c) => <Link href="/privacidade" target="_blank" className="text-primary-700 underline">{c}</Link>,
                    })}
                  </span>
                </label>
                {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
                <Navegar voltar="local" ok={contatoOk} avancar={() => enviar()} rotulo={enviando ? t('enviando') : t('enviarPedido')} />
              </div>
            )}

            {contaExistente && (
              <div className="rounded-lg border-2 border-amber-300 p-4" data-testid="conta-existente">
                <h3 className="font-semibold text-gray-900 mb-1">{t('contaExistenteTitulo')}</h3>
                <p className="text-sm text-gray-700 mb-3">{t('contaExistenteTexto', { email: email.trim() })}</p>
                <label htmlFor="pedido-senha-login" className="block text-sm font-medium text-gray-700 mb-1">{t('senha')}</label>
                <input id="pedido-senha-login" type="password" className="input-field" autoComplete="current-password" value={senhaLogin} onChange={(e) => setSenhaLogin(e.target.value)} />
                {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
                <button type="button" onClick={entrarEEnviar} disabled={!senhaLogin || enviando} className="btn-primary w-full mt-3 disabled:opacity-50">{t('entrarEEnviar')}</button>
                <button type="button" onClick={() => enviar('codigo')} disabled={enviando} className="w-full mt-3 min-h-[44px] text-sm font-medium text-primary-700 underline" data-testid="enviar-codigo-conta">{t('naoLembroSenha')}</button>
                <button type="button" onClick={() => { setContaExistente(false); setErro(''); }} className="w-full mt-1 min-h-[44px] text-sm text-gray-600 underline">{t('usarOutroEmail')}</button>
              </div>
            )}
          </div>
        )}

        {etapa === 'codigo' && pendente && (
          <div data-testid="passo-codigo">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('codigoTitulo')}</h2>
            <p className="text-sm text-gray-700 mb-4">{t('codigoTexto', { email: pendente.email })}</p>
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
              {pendente.contaNova && !corrigindo && (
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
          </div>
        )}
      </div>

      {etapa === 'servico' && (
        <p className="text-center text-sm text-gray-600 mt-6">{t('jaTemConta')} <Link href="/login" className="text-primary-700 underline">{t('entrar')}</Link></p>
      )}
    </div>
  );
}
