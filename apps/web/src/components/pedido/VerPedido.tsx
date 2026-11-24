'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, rota } from '@/i18n/navigation';
import { hrefNoIdioma } from '@/i18n/routing';
import { supabase } from '@/lib/supabase';
import { textoErroApi } from '@/lib/erro-api';

// Link "Ver orcamento" dos e-mails do pedido (api/link-acesso; dono 12/11):
// "Ola, <nome>! Voce tem novidades no pedido <numero>" + um botao. Abrir a pagina
// nao gasta o token (Outlook/antivirus abrem links sozinhos - caso 29/10); o
// toque gasta, entra na conta e abre o pedido (antes, "crie a sua senha" se ainda
// nao tem). Quem ja esta logado como o dono vai direto. Link usado ou vencido:
// "receber um codigo por e-mail" na tela de login.
// Link da OFICINA (089; dono 16/11): o modo vem da API (finalidade 'oficina'), nao
// da URL. "Abrir o pedido" gasta o token e entra; "Nao tenho interesse" so grava
// com o toque em "Confirmar" (d=1 so abre o formulario) e nao gasta o token.
const MOTIVOS = ['nao_faz', 'faz_parte', 'sem_agenda', 'longe', 'outro'] as const;

type DadosOficina = {
  finalidade: 'oficina'; oficina: { nome: string }; numero: number | null; solicitacaoId: string;
  tipoNome: string | null; carro: string | null; cidade: string | null;
  aberto: boolean; jaOrcou: boolean; dispensa: { motivo: string } | null;
};

export default function VerPedido({ token, chat, chatOficina = '', oficina = false, dispensar = false }: { token: string; chat: boolean; chatOficina?: string; oficina?: boolean; dispensar?: boolean }) {
  const t = useTranslations('verPedido');
  const te = useTranslations('erros');
  const locale = useLocale();
  const router = useRouter();
  const [estado, setEstado] = useState<'carregando' | 'pedido' | 'invalido'>('carregando');
  const [dados, setDados] = useState<{ nome: string; numero: number | null; solicitacaoId: string } | null>(null);
  const [dadosOficina, setDadosOficina] = useState<DadosOficina | null>(null);
  const [modoOficina, setModoOficina] = useState(oficina);
  const [fechado, setFechado] = useState(false);
  const [solicitacaoId, setSolicitacaoId] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');
  const iniciado = useRef(false);

  const chamar = (acao: string, extra: Record<string, unknown> = {}) => fetch('/api/link-acesso', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: token, acao, idioma: locale, ...extra }),
  }).then(async (r) => ({ r, d: await r.json().catch(() => ({})) }), () => ({ r: null as Response | null, d: {} as any }));

  // chatOficina (of=<uuid>, e-mail "a oficina te escreveu" 24/11): o chat com a oficina que escreveu; sem ele, igual a antes
  const ofChat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatOficina) ? chatOficina : '';
  const destino = (id: string) => chat ? `/cliente/mensagens/${id}${ofChat ? `?oficina=${ofChat}` : ''}` : `/cliente/orcamentos/${id}`;

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    // o token sai da barra de endereco (nao vai para historico/compartilhamento)
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) { setEstado('invalido'); return; }
    chamar('ver').then(({ r, d }) => {
      if (d?.solicitacaoId) setSolicitacaoId(d.solicitacaoId);
      if (d?.finalidade === 'oficina') {
        setModoOficina(true);
        if (d.jaLogado && d.solicitacaoId) { router.replace(`/oficina/orcamento/${d.solicitacaoId}`); return; }
        if (!r?.ok) { setEstado('invalido'); return; }
        setDadosOficina(d);
        if (!d.aberto) setFechado(true);
        setEstado('pedido');
        return;
      }
      if (r?.status === 403) setModoOficina(false);
      if (d?.jaLogado && d.solicitacaoId) { router.replace(destino(d.solicitacaoId)); return; }
      if (!r?.ok) { setEstado('invalido'); return; }
      setModoOficina(false);
      setDados(d);
      setEstado('pedido');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const entrar = async () => {
    if (entrando) return;
    setEntrando(true); setErro('');
    const { r, d } = await chamar('entrar');
    const oficinaResp = d?.finalidade === 'oficina';
    const alvoDe = (id: string) => (oficinaResp ? (d.destino || `/oficina/orcamento/${id}`) : destino(id));
    if (d?.jaLogado && d.solicitacaoId) { router.replace(alvoDe(d.solicitacaoId)); return; }
    if (!r?.ok) {
      setEntrando(false);
      if (d?.codigo === 'PEDIDO_FECHADO') { setFechado(true); return; }
      if (r?.status === 410 || r?.status === 403) { setEstado('invalido'); return; }
      setErro(textoErroApi(te, r?.status || 500, d));
      return;
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: d.tokenHash, type: 'email' });
    if (error) { setEntrando(false); setEstado('invalido'); return; }
    const alvo = alvoDe(d.solicitacaoId);
    router.replace(d.senhaDefinida === false ? rota('/criar-senha', undefined, { voltar: alvo }) : alvo);
    router.refresh();
  };

  // link gasto/vencido: tela de login ja em "receber um codigo", e de volta ao pedido depois
  const voltarDe = (id: string | null) => (modoOficina ? (id ? `/oficina/orcamento/${id}` : '/oficina/pedidos') : (id ? destino(id) : null));
  const voltar = voltarDe(solicitacaoId);
  const loginComCodigo = rota('/login', undefined, { codigo: '1', ...(voltar ? { voltar: hrefNoIdioma(locale, voltar) } : {}) });
  const loginOficina = (alvo: string) => rota('/login', undefined, { voltar: hrefNoIdioma(locale, alvo) });

  return (
    <div className="max-w-md mx-auto px-4 py-12" data-testid="ver-pedido">
      {estado === 'carregando' && <p className="text-center text-gray-500 py-16" role="status">…</p>}

      {estado === 'pedido' && !modoOficina && dados && (
        <div className="card text-center" data-testid="ver-pedido-ola">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('titulo', { nome: dados.nome })}</h1>
          <p className="text-gray-700 mb-6">{t('texto', { numero: dados.numero ?? '' })}</p>
          {erro && <p role="alert" className="mb-4 text-sm text-red-700">{erro}</p>}
          <button type="button" onClick={entrar} disabled={entrando} aria-busy={entrando} className="btn-primary w-full disabled:opacity-50" data-testid="ver-pedido-entrar">
            {entrando ? t('abrindo') : t('ver')}
          </button>
        </div>
      )}

      {estado === 'pedido' && modoOficina && dadosOficina && !fechado && (
        <PedidoOficina
          dados={dadosOficina} abrirDispensa={dispensar} entrando={entrando} erro={erro}
          onEntrar={entrar} chamar={chamar} onFechado={() => setFechado(true)} onInvalido={() => setEstado('invalido')}
        />
      )}

      {estado === 'pedido' && modoOficina && fechado && (
        <div className="card text-center" data-testid="ver-pedido-fechado">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('oficinaFechadoTitulo')}</h1>
          <p className="text-gray-600 mb-6">{t('oficinaFechadoTexto', { numero: dadosOficina?.numero ?? '' })}</p>
          <button type="button" onClick={() => router.push(loginOficina('/oficina/pedidos'))} className="btn-primary w-full" data-testid="ver-pedido-entrar-login">{t('entrar')}</button>
        </div>
      )}

      {estado === 'invalido' && (
        <div className="card text-center" data-testid="ver-pedido-invalido">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('invalidoTitulo')}</h1>
          <p className="text-gray-600 mb-6">{modoOficina ? t('oficinaInvalidoTexto') : t('invalidoTexto')}</p>
          {modoOficina && (
            <button type="button" onClick={() => router.push(loginOficina(voltar || '/oficina/pedidos'))} className="btn-primary w-full mb-3" data-testid="ver-pedido-entrar-login">{t('entrar')}</button>
          )}
          <button type="button" onClick={() => router.push(loginComCodigo)} className={`${modoOficina ? 'btn-secondary' : 'btn-primary'} w-full`} data-testid="ver-pedido-codigo">{t('receberCodigo')}</button>
        </div>
      )}
    </div>
  );
}

function PedidoOficina({ dados, abrirDispensa, entrando, erro, onEntrar, chamar, onFechado, onInvalido }: {
  dados: DadosOficina; abrirDispensa: boolean; entrando: boolean; erro: string;
  onEntrar: () => void; chamar: (acao: string, extra?: Record<string, unknown>) => Promise<{ r: Response | null; d: any }>;
  onFechado: () => void; onInvalido: () => void;
}) {
  const t = useTranslations('verPedido');
  const to = useTranslations('oficinaPedidos');
  const [dispensa, setDispensa] = useState<{ motivo: string } | null>(dados.dispensa);
  const [jaOrcou, setJaOrcou] = useState(dados.jaOrcou);
  const [form, setForm] = useState(abrirDispensa && !dados.dispensa && !dados.jaOrcou);
  const [motivo, setMotivo] = useState('');
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [recemDispensado, setRecemDispensado] = useState(false);
  const [erroDisp, setErroDisp] = useState(false);

  const tratarErro = (r: Response | null, d: any) => {
    if (d?.codigo === 'PEDIDO_FECHADO') { onFechado(); return; }
    if (d?.codigo === 'JA_ORCOU') { setJaOrcou(true); setForm(false); return; }
    if (r?.status === 410 || r?.status === 403) { onInvalido(); return; }
    setErroDisp(true);
  };

  const confirmar = async () => {
    if (!motivo || salvando) return;
    setSalvando(true); setErroDisp(false);
    const { r, d } = await chamar('dispensar', { motivo, comentario: comentario.trim() || null });
    setSalvando(false);
    if (!r?.ok) { tratarErro(r, d); return; }
    setDispensa({ motivo }); setForm(false); setRecemDispensado(true);
  };

  const desfazer = async () => {
    if (salvando) return;
    setSalvando(true); setErroDisp(false);
    const { r, d } = await chamar('desfazer');
    setSalvando(false);
    if (!r?.ok) { tratarErro(r, d); return; }
    setDispensa(null); setRecemDispensado(false); setMotivo(''); setComentario('');
  };

  const detalhe = [dados.tipoNome, dados.carro, dados.cidade].filter(Boolean).join(' · ');
  const botaoAbrir = (
    <button type="button" onClick={onEntrar} disabled={entrando} aria-busy={entrando} className="btn-primary w-full disabled:opacity-50" data-testid="ver-pedido-entrar">
      {entrando ? t('abrindo') : t('oficinaAbrir')}
    </button>
  );

  return (
    <div className="card text-center" data-testid="ver-pedido-oficina">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('oficinaTitulo', { oficina: dados.oficina.nome })}</h1>
      <p className="text-gray-700">{t('oficinaTexto', { numero: dados.numero ?? '' })}</p>
      {detalhe && <p className="text-sm text-gray-500 mt-1 mb-6 break-words">{detalhe}</p>}
      {!detalhe && <div className="mb-6" />}
      {erro && <p role="alert" className="mb-4 text-sm text-red-700">{erro}</p>}

      {jaOrcou && (
        <div className="space-y-3">
          <p className="text-gray-700" data-testid="ver-pedido-ja-orcou">{t('oficinaJaOrcou')}</p>
          {botaoAbrir}
        </div>
      )}

      {!jaOrcou && dispensa && (
        <div className="space-y-3 text-left">
          <p className="text-gray-700 text-center" data-testid={recemDispensado ? 'ver-pedido-dispensado' : 'ver-pedido-ja-dispensou'}>
            {recemDispensado ? t('oficinaDispensado') : t('oficinaJaDispensou', { motivo: to(`motivo_${dispensa.motivo}`) })}
          </p>
          {erroDisp && <p role="alert" className="text-sm text-red-700">{to('erroDispensa')}</p>}
          <button type="button" onClick={desfazer} disabled={salvando} className="btn-secondary w-full disabled:opacity-50" data-testid="ver-pedido-desfazer">{t('oficinaDesfazer')}</button>
          {botaoAbrir}
        </div>
      )}

      {!jaOrcou && !dispensa && !form && (
        <div className="space-y-3">
          {botaoAbrir}
          <button type="button" onClick={() => setForm(true)} className="btn-secondary w-full" data-testid="ver-pedido-dispensar">{t('oficinaNaoInteresse')}</button>
        </div>
      )}

      {!jaOrcou && !dispensa && form && (
        <fieldset className="text-left border-0 p-0 m-0" data-testid="dispensar-form">
          <legend className="font-medium text-gray-900">{to('dispensarTitulo')}</legend>
          <p className="mt-1 text-sm text-gray-600">{to('dispensarAjuda')}</p>
          <div className="mt-3 space-y-2">
            {MOTIVOS.map((m) => (
              <label key={m} className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                <input type="radio" name="motivo-dispensa" value={m} checked={motivo === m} onChange={() => setMotivo(m)} className="h-5 w-5" data-testid={`motivo-${m}`} />
                <span className="text-sm text-gray-800">{to(`motivo_${m}`)}</span>
              </label>
            ))}
          </div>
          <label className="block mt-3 text-sm text-gray-700">
            {to('comentarioOpcional')}
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value.slice(0, 500))} rows={2}
              placeholder={to('comentarioDica')} className="input-field mt-1" data-testid="dispensa-comentario" />
          </label>
          {erroDisp && <p role="alert" className="mt-2 text-sm text-red-700">{to('erroDispensa')}</p>}
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={confirmar} disabled={!motivo || salvando} className="btn-primary w-full min-h-[44px] disabled:opacity-50" data-testid="confirmar-dispensa">
              {to('confirmarDispensa')}
            </button>
            <button type="button" onClick={() => setForm(false)} className="btn-secondary w-full min-h-[44px]" data-testid="cancelar-dispensa">
              {to('cancelarDispensa')}
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
