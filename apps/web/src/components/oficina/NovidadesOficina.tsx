'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import ConviteRecepcao, { CHAVE_CONVITE_RECEPCAO } from '@/components/oficina/ConviteRecepcao';

// Cartao "Novidades" no topo de Pedidos (pedido do dono 15/11; migracao 084). UM cartao so, que JUNTA o
// convite da recepcao de carros (check-in v2, decisao 6) e a pagina Melhorias - nunca dois banners.
// - Aparece para quem recebeu o aviso "Novidades" no sino (dono/admin das oficinas que ja existiam no deploy)
//   e ainda nao fechou o cartao. Fechar fica no banco (avisos_dispensados): vale em qualquer aparelho.
// - Sem o aviso, ou depois de fechado: o convite da recepcao de antes (ConviteRecepcao), com o adiamento de
//   7 dias dele. Ao fechar o cartao o convite tambem fica adiado 7 dias (a pessoa acabou de fechar um aviso).
// - Nenhum e-mail (confirmacao do dono 15/11).
export const CHAVE_NOVIDADES = 'oficina-2026-11';
const SETE_DIAS = 7 * 24 * 3600e3;

// aoDefinir: avisa a pagina quando ja sabe se aparece (Pedidos espera para nao empurrar a lista)
export default function NovidadesOficina({ aoDefinir }: { aoDefinir?: () => void } = {}) {
  const t = useTranslations('novidadesOficina');
  const tc = useTranslations('conviteRecepcao');
  const { user, oficina, funcionario, refreshProfile } = useAuth();
  const podeVer = !!user && !!oficina && (!funcionario || funcionario.cargo === 'admin');
  const [estado, setEstado] = useState<'carregando' | 'mostrar' | 'nao'>('carregando');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!podeVer) { setEstado('nao'); return; }
    let vivo = true;
    (async () => {
      const [{ data: avisos }, { data: fechado }] = await Promise.all([
        supabase.from('notificacoes').select('id').eq('profile_id', user.id).eq('tipo', 'novidades')
          .eq('dados->>chave', CHAVE_NOVIDADES).limit(1),
        supabase.from('avisos_dispensados').select('chave').eq('profile_id', user.id).eq('chave', CHAVE_NOVIDADES).maybeSingle(),
      ]);
      if (vivo) setEstado((avisos?.length || 0) > 0 && !fechado ? 'mostrar' : 'nao');
    })().catch(() => { if (vivo) setEstado('nao'); });
    return () => { vivo = false; };
  }, [user?.id, podeVer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (estado !== 'carregando') aoDefinir?.(); }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!podeVer || estado === 'carregando') return null;
  if (estado === 'nao') return <ConviteRecepcao />;

  const o = oficina as { recepcao_inicio?: string | null; recepcao_confirmada_em?: string | null };
  const recepcaoRespondida = !!(o?.recepcao_inicio || o?.recepcao_confirmada_em);

  const fechar = async () => {
    setEstado('nao');
    try { localStorage.setItem(CHAVE_CONVITE_RECEPCAO, String(Date.now() + SETE_DIAS)); } catch { /* so nesta visita */ }
    // 23505 = ja estava fechado (outra aba/aparelho): tudo certo
    await supabase.from('avisos_dispensados').insert({ profile_id: user!.id, chave: CHAVE_NOVIDADES });
  };
  const horarioServe = async () => {
    if (enviando) return;
    setEnviando(true); setErro(false);
    const r = await fetch('/api/oficina/recepcao-confirmada', { method: 'POST' }).catch(() => null);
    setEnviando(false);
    if (!r?.ok) { setErro(true); return; }
    refreshProfile?.();
  };

  return (
    <section className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4" data-testid="novidades-oficina" aria-labelledby="novidades-titulo">
      <div className="flex items-start justify-between gap-2">
        <h2 id="novidades-titulo" className="text-base font-semibold text-blue-950">✨ {t('titulo')}</h2>
        <button type="button" onClick={fechar} aria-label={t('fechar')} title={t('fechar')} data-testid="novidades-fechar"
          className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-blue-800 hover:bg-blue-100">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="mt-2 rounded-lg bg-white/70 p-3" data-testid="novidades-recepcao">
        <h3 className="text-sm font-semibold text-blue-950">🚗 {t('recepcaoTitulo')}</h3>
        <p className="mt-1 text-sm text-blue-900">{recepcaoRespondida ? t('recepcaoFeita') : t('recepcaoTexto')}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Link href="/oficina/perfil#recepcao" className={`${recepcaoRespondida ? 'btn-secondary' : 'btn-primary'} min-h-[44px] !py-2 text-center text-sm`} data-testid="novidades-perfil">
            {recepcaoRespondida ? t('abrirPerfil') : tc('preencher')}
          </Link>
          {!recepcaoRespondida && (
            <button type="button" onClick={horarioServe} disabled={enviando} className="btn-secondary min-h-[44px] !py-2 text-sm disabled:opacity-60" data-testid="novidades-serve">{tc('serve')}</button>
          )}
        </div>
        {erro && <p role="alert" className="mt-2 text-sm text-red-700">{tc('erro')}</p>}
      </div>

      <div className="mt-2 rounded-lg bg-white/70 p-3">
        <h3 className="text-sm font-semibold text-blue-950">💡 {t('melhoriasTitulo')}</h3>
        <p className="mt-1 text-sm text-blue-900">{t('melhoriasTexto')}</p>
        <Link href="/oficina/melhorias" className="btn-secondary mt-2 inline-flex min-h-[44px] w-full items-center justify-center !py-2 text-sm sm:w-auto" data-testid="novidades-melhorias">{t('abrirMelhorias')}</Link>
      </div>

      <Link href="/oficina/aprender?tema=horarios-checkin" className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-blue-800 underline underline-offset-2" data-testid="novidades-aprender">
        {t('comoFunciona')}
      </Link>
    </section>
  );
}
