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
export default function VerPedido({ token, chat }: { token: string; chat: boolean }) {
  const t = useTranslations('verPedido');
  const te = useTranslations('erros');
  const locale = useLocale();
  const router = useRouter();
  const [estado, setEstado] = useState<'carregando' | 'pedido' | 'invalido'>('carregando');
  const [dados, setDados] = useState<{ nome: string; numero: number | null; solicitacaoId: string } | null>(null);
  const [solicitacaoId, setSolicitacaoId] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');
  const iniciado = useRef(false);

  const chamar = (acao: string) => fetch('/api/link-acesso', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: token, acao }),
  }).then(async (r) => ({ r, d: await r.json().catch(() => ({})) }), () => ({ r: null as Response | null, d: {} as any }));

  const destino = (id: string) => chat ? `/cliente/mensagens/${id}` : `/cliente/orcamentos/${id}`;

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    // o token sai da barra de endereco (nao vai para historico/compartilhamento)
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) { setEstado('invalido'); return; }
    chamar('ver').then(({ r, d }) => {
      if (d?.solicitacaoId) setSolicitacaoId(d.solicitacaoId);
      if (d?.jaLogado && d.solicitacaoId) { router.replace(destino(d.solicitacaoId)); return; }
      if (!r?.ok) { setEstado('invalido'); return; }
      setDados(d);
      setEstado('pedido');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const entrar = async () => {
    if (entrando) return;
    setEntrando(true); setErro('');
    const { r, d } = await chamar('entrar');
    if (d?.jaLogado && d.solicitacaoId) { router.replace(destino(d.solicitacaoId)); return; }
    if (!r?.ok) {
      setEntrando(false);
      if (r?.status === 410) { setEstado('invalido'); return; }
      setErro(textoErroApi(te, r?.status || 500, d));
      return;
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: d.tokenHash, type: 'email' });
    if (error) { setEntrando(false); setEstado('invalido'); return; }
    const alvo = destino(d.solicitacaoId);
    router.replace(d.senhaDefinida === false ? rota('/criar-senha', undefined, { voltar: alvo }) : alvo);
    router.refresh();
  };

  // link gasto/vencido: tela de login ja em "receber um codigo", e de volta ao pedido depois
  const loginComCodigo = rota('/login', undefined, { codigo: '1', ...(solicitacaoId ? { voltar: hrefNoIdioma(locale, destino(solicitacaoId)) } : {}) });

  return (
    <div className="max-w-md mx-auto px-4 py-12" data-testid="ver-pedido">
      {estado === 'carregando' && <p className="text-center text-gray-500 py-16" role="status">…</p>}

      {estado === 'pedido' && dados && (
        <div className="card text-center" data-testid="ver-pedido-ola">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('titulo', { nome: dados.nome })}</h1>
          <p className="text-gray-700 mb-6">{t('texto', { numero: dados.numero ?? '' })}</p>
          {erro && <p role="alert" className="mb-4 text-sm text-red-700">{erro}</p>}
          <button type="button" onClick={entrar} disabled={entrando} aria-busy={entrando} className="btn-primary w-full disabled:opacity-50" data-testid="ver-pedido-entrar">
            {entrando ? t('abrindo') : t('ver')}
          </button>
        </div>
      )}

      {estado === 'invalido' && (
        <div className="card text-center" data-testid="ver-pedido-invalido">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('invalidoTitulo')}</h1>
          <p className="text-gray-600 mb-6">{t('invalidoTexto')}</p>
          <button type="button" onClick={() => router.push(loginComCodigo)} className="btn-primary w-full" data-testid="ver-pedido-codigo">{t('receberCodigo')}</button>
        </div>
      )}
    </div>
  );
}
