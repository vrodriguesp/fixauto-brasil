'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import CampoTelefone from '@/components/forms/CampoTelefone';

// Telefone do motorista para a oficina (dono 13/11): no pedido o celular so vai com
// "quero SMS"; quando a oficina precisa ligar, o motorista passa o numero aqui.
// - Depois do aceite: sem telefone no perfil, pede o numero (o perfil so e visivel
//   para a oficina com orcamento aceito - migracao 074).
// - Antes do aceite: envia o numero a UMA oficina (as outras nao veem): fica registrado
//   para ela ligar da pagina do pedido (migracao 081) e vai tambem na conversa.
// O mesmo no app: apps/mobile/components/TelefoneOficina.tsx.
const telefoneOk = (v: string) => v.replace(/\D/g, '').length >= 8;
const Cadeado = () => (
  <svg aria-hidden="true" className="w-4 h-4 shrink-0 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
);

/** Orcamento aceito: mostra o numero que a oficina ve ou pede para adicionar. */
export function TelefoneDepoisDoAceite({ oficinaNome }: { oficinaNome: string }) {
  const t = useTranslations('telefoneOficina');
  const { user, refreshProfile } = useAuth();
  const [telefone, setTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  if (!user || user.tipo !== 'cliente') return null;

  if (user.telefone && !salvo) {
    return (
      <p className="mt-3 text-sm text-gray-700" data-testid="telefone-oficina-ve">
        {t('seuNumero', { tel: user.telefone })} · <Link href="/cliente/perfil" className="text-primary-700 underline">{t('alterar')}</Link>
      </p>
    );
  }
  if (salvo) return <p role="status" className="mt-3 text-sm text-green-800" data-testid="telefone-salvo">{t('salvo', { oficina: oficinaNome })}</p>;

  const salvar = async () => {
    if (salvando) return;
    if (!telefoneOk(telefone)) { setErro(t('numeroInvalido')); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('profiles').update({ telefone: telefone.trim() }).eq('id', user.id);
    setSalvando(false);
    if (error) { setErro(t('erro')); return; }
    setSalvo(true);
    refreshProfile().catch(() => {});
  };

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left" data-testid="telefone-depois-aceite">
      <p className="font-semibold text-gray-900">📞 {t('avisoTitulo')}</p>
      <p className="text-sm text-gray-700 mt-1 mb-3">{t('avisoTexto', { oficina: oficinaNome })}</p>
      <CampoTelefone id="telefone-aceite" value={telefone} onChange={(v) => { setTelefone(v); setErro(''); }} />
      {erro && <p role="alert" className="mt-1 text-sm text-red-700">{erro}</p>}
      <p className="flex items-start gap-1.5 text-xs text-gray-600 mt-2"><Cadeado /><span>{t('privacidade')}</span></p>
      <button type="button" onClick={salvar} disabled={salvando} aria-busy={salvando} className="btn-primary mt-3 disabled:opacity-50" data-testid="telefone-aceite-salvar">
        {salvando ? t('salvando') : t('salvar')}
      </button>
    </div>
  );
}

/** Antes do aceite: manda o numero na conversa com esta oficina (so ela ve). */
export function CompartilharTelefone({ solicitacaoId, oficinaId, oficinaNome }: { solicitacaoId: string; oficinaId: string; oficinaNome: string }) {
  const t = useTranslations('telefoneOficina');
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);
  if (!user || user.tipo !== 'cliente') return null;
  const conversa = `/cliente/mensagens/${solicitacaoId}?oficina=${oficinaId}`;

  if (enviado) {
    return (
      <p role="status" className="text-xs text-green-800 py-1" data-testid="telefone-compartilhado">
        ✓ {t('compartilhado')} <Link href={conversa} className="text-primary-700 underline">{t('verConversa')}</Link>
      </p>
    );
  }
  if (!aberto) {
    return (
      <button type="button" onClick={() => { setAberto(true); setTelefone(user.telefone || ''); }}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline py-1 min-h-[32px]" data-testid="compartilhar-telefone">
        📞 {t('compartilhar')}
      </button>
    );
  }

  const enviar = async () => {
    if (enviando) return;
    if (!telefoneOk(telefone)) { setErro(t('numeroInvalido')); return; }
    setEnviando(true); setErro('');
    // o servidor registra (a oficina ve o botao "ligar" no pedido - migracao 081), poe a
    // mensagem na conversa e avisa a oficina
    const r = await fetch(`/api/solicitacoes/${solicitacaoId}/compartilhar-telefone`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oficinaId, telefone: telefone.trim() }),
    }).catch(() => null);
    setEnviando(false);
    if (!r?.ok) { setErro(t('erro')); return; }
    setEnviado(true);
  };

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 max-w-md" data-testid="compartilhar-telefone-painel">
      <p className="text-xs text-gray-700 mb-2">{t('compartilharTexto', { oficina: oficinaNome })}</p>
      <CampoTelefone id={`telefone-${oficinaId}`} value={telefone} onChange={(v) => { setTelefone(v); setErro(''); }} />
      {erro && <p role="alert" className="mt-1 text-sm text-red-700">{erro}</p>}
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={enviar} disabled={enviando} aria-busy={enviando} className="btn-primary text-sm disabled:opacity-50" data-testid="compartilhar-telefone-enviar">{t('compartilharEnviar')}</button>
        <button type="button" onClick={() => { setAberto(false); setErro(''); }} className="btn-secondary text-sm">{t('cancelar')}</button>
      </div>
    </div>
  );
}
