'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { textoErroApi } from '@/lib/erro-api';
import { INTL_LOCALE } from '@/lib/utils';
import { ehPreferencia, type PreferenciaHorario as Pref } from '@/lib/preferencia-horario';

// "Quando voce pode levar o carro?" (migracao 114, dono 21/11): pergunta OPCIONAL depois de o pedido ja estar
// gravado (ecra de sucesso do pedido logado; pagina do pedido para quem veio do fluxo sem conta). Fichas grandes
// de 1 toque: seg-sab, manha/tarde, "qualquer dia util", "o quanto antes"; um botao "Guardar"; "Agora nao" pula.
// Nunca trava nem atrasa o pedido. Guardado em solicitacoes.preferencia_horario; a oficina ve no pedido e no
// formulario do orcamento. modo 'sucesso' = ecra grande; modo 'cartao' = na pagina do pedido (pergunta uma vez,
// depois mostra a escolha com "Mudar").
export const nomeDia = (d: number, intl: string, forma: 'short' | 'long' = 'short') =>
  new Date(Date.UTC(2026, 10, 1 + d, 12)).toLocaleDateString(intl, { timeZone: 'UTC', weekday: forma }).replace(/\.$/, '');

/** "seg, ter · de manha" / "qualquer dia util · a tarde" / "o quanto antes" - na lingua da tela */
export function textoPreferencia(p: Pref | null | undefined, t: (k: string) => string, intl: string): string {
  if (!p) return '';
  const partes: string[] = [];
  if (p.opcao === 'urgente') partes.push(t('urgente'));
  if (p.opcao === 'qualquer') partes.push(t('qualquer'));
  if (p.dias?.length) partes.push(p.dias.map((d) => nomeDia(d, intl)).join(', '));
  if (p.partes?.length === 1) partes.push(t(p.partes[0] === 'manha' ? 'manhaCurto' : 'tardeCurto'));
  return partes.join(' · ');
}

export default function PreferenciaHorario({ solicitacaoId, inicial, modo = 'cartao', aoTerminar, aoGuardar, urgencia }: {
  solicitacaoId: string; inicial?: unknown; modo?: 'sucesso' | 'cartao'; aoTerminar?: () => void; aoGuardar?: (p: Pref | null) => void; urgencia?: string | null;
}) {
  const t = useTranslations('preferencia');
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const pref0 = ehPreferencia(inicial) ? (inicial as Pref) : null;
  const [guardada, setGuardada] = useState<Pref | null>(pref0);
  const [editando, setEditando] = useState(modo === 'sucesso');
  const [dias, setDias] = useState<number[]>(pref0?.dias || []);
  const [parte, setParte] = useState<'manha' | 'tarde' | ''>(pref0?.partes?.length === 1 ? pref0.partes[0] : '');
  // urgencia "alta" do pedido ja diz "o quanto antes" (nao duplica a pergunta: so pre-marca)
  const [opcao, setOpcao] = useState<'qualquer' | 'urgente' | ''>(pref0?.opcao || (urgencia === 'alta' ? 'urgente' : ''));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(false);
  const [pulou, setPulou] = useState(false);
  const chave = `bipfix_pref_pulou:${solicitacaoId}`;
  useEffect(() => { try { if (sessionStorage.getItem(chave)) setPulou(true); } catch { /* sem storage */ } }, [chave]);

  const alternarDia = (d: number) => { setOpcao((o) => (o === 'qualquer' ? '' : o)); setDias((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d].sort())); };
  const escolherOpcao = (o: 'qualquer' | 'urgente') => { setOpcao((atual) => (atual === o ? '' : o)); if (o === 'qualquer') setDias([]); };
  const temAlgo = dias.length > 0 || !!parte || !!opcao;

  const guardar = async () => {
    if (enviando) return;
    if (!temAlgo) { pular(); return; }
    setEnviando(true); setErro('');
    try {
      const r = await fetch(`/api/solicitacoes/${solicitacaoId}/preferencia`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dias, partes: parte ? [parte] : [], opcao: opcao || null }) });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(textoErroApi(tErr, r.status, c)); return; }
      const p = (c?.preferencia as Pref) || null;
      setGuardada(p); aoGuardar?.(p); setFeito(true); setEditando(false);
      if (modo === 'sucesso') setTimeout(() => aoTerminar?.(), 900);
    } catch {
      setErro(tErr('GENERICO'));
    } finally {
      setEnviando(false);
    }
  };
  const pular = () => {
    try { sessionStorage.setItem(chave, '1'); } catch { /* sem storage */ }
    setPulou(true); setEditando(false);
    aoTerminar?.();
  };

  // ja guardada e nao esta editando: linha com "Mudar"
  if (!editando && guardada) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm" data-testid="preferencia-guardada">
        <span className="text-emerald-900"><span aria-hidden="true">🕒</span> {t('suaPreferencia', { texto: textoPreferencia(guardada, t, intl) })}{feito && <span className="ml-2 font-semibold" data-testid="preferencia-feito">{t('guardado')}</span>}</span>
        {modo === 'cartao' && <button type="button" onClick={() => { setEditando(true); setFeito(false); }} className="min-h-[40px] font-medium text-emerald-900 underline" data-testid="preferencia-mudar">{t('mudar')}</button>}
      </div>
    );
  }
  if (!editando && (pulou || modo === 'sucesso')) return null;

  const semana = [1, 2, 3, 4, 5, 6];
  const ficha = (on: boolean, extra = '') => `min-h-[48px] rounded-xl border-2 px-2 text-sm font-semibold ${on ? 'border-primary-600 bg-primary-50 text-primary-900' : 'border-gray-300 bg-white text-gray-800'} ${extra}`;
  return (
    <div className={`${modo === 'sucesso' ? 'rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm' : 'rounded-xl border border-primary-200 bg-primary-50/60 p-3'}`} data-testid="preferencia-horario">
      <p className="text-base font-bold text-gray-900">{t('titulo')} <span className="text-sm font-normal text-gray-500">{t('opcional')}</span></p>
      <p className="mt-1 text-sm text-gray-600">{t('texto')}</p>
      <div className="mt-3 grid grid-cols-6 gap-1.5" role="group" aria-label={t('diasTitulo')} data-testid="pref-dias">
        {semana.map((d) => (
          <button key={d} type="button" aria-pressed={dias.includes(d)} onClick={() => alternarDia(d)} data-testid={`pref-dia-${d}`} aria-label={nomeDia(d, intl, 'long')}
            className={ficha(dias.includes(d), 'capitalize')}>{nomeDia(d, intl)}</button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('partesTitulo')}>
        {(['manha', 'tarde'] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={parte === p} onClick={() => setParte((a) => (a === p ? '' : p))} data-testid={`pref-${p}`} className={ficha(parte === p)}>
            <span aria-hidden="true">{p === 'manha' ? '🌅' : '🌇'}</span> {t(p)}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5" role="group" aria-label={t('titulo')}>
        <button type="button" aria-pressed={opcao === 'qualquer'} onClick={() => escolherOpcao('qualquer')} data-testid="pref-qualquer" className={ficha(opcao === 'qualquer')}>{t('qualquer')}</button>
        <button type="button" aria-pressed={opcao === 'urgente'} onClick={() => escolherOpcao('urgente')} data-testid="pref-urgente" className={ficha(opcao === 'urgente')}>⚡ {t('urgente')}</button>
      </div>
      {erro && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
      {/* um botao "Guardar" (so com algo escolhido) + o caminho de saida sempre a vista: nada trava o pedido */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={guardar} disabled={enviando || !temAlgo} aria-busy={enviando} className="btn-primary min-h-[48px] flex-1 text-base disabled:opacity-50" data-testid="pref-guardar">
          {enviando ? t('guardando') : t('guardar')}
        </button>
        <button type="button" onClick={pular} disabled={enviando} className="btn-secondary min-h-[48px] flex-1" data-testid="pref-pular">{modo === 'sucesso' ? t('continuar') : t('agoraNao')}</button>
      </div>
    </div>
  );
}
