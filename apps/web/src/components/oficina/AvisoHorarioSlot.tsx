'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { conflitoHorario, horarioDoDia, turnoAcabaLogo, turnoDisponivel, type HorarioSemana, type Turno } from '@/lib/turnos';

// Data de check-in x horario de funcionamento da oficina (caso real 14/11: "sabado a tarde" com a
// oficina fechada no sabado). Usado no formulario do orcamento e na resposta a "novas datas" (079).
//  - 'fechado': dia fechado pelo horario do perfil -> ERRO (bloqueia o envio - dono 14/11)
//  - 'turno': abre nesse dia, mas fora do periodo -> aviso
//  - 'acaba-logo': hoje e o periodo acaba em menos de MARGEM_HORAS -> aviso
export const MARGEM_HORAS = 2;
export type AvisoHorario = { tipo: 'fechado' | 'turno' | 'acaba-logo'; texto: string } | null;

export function useAvisoHorario(horario: HorarioSemana, pais: string | null | undefined) {
  const t = useTranslations('oficinaEnviarOrcamento');
  return (data: string, turno: Turno): AvisoHorario => {
    if (!data || !turnoDisponivel(data, turno, undefined, pais ?? null)) return null;
    const c = conflitoHorario(data, turno, horario);
    if (c === 'fechado') return { tipo: 'fechado', texto: t('erroDiaFechado') };
    if (c === 'turno') { const h = horarioDoDia(data, horario); return { tipo: 'turno', texto: t('avisoTurnoForaHorario', { inicio: h?.inicio || '', fim: h?.fim || '' }) }; }
    if (turnoAcabaLogo(data, turno, MARGEM_HORAS, undefined, pais ?? null)) return { tipo: 'acaba-logo', texto: t('avisoTurnoAcabaLogo', { horas: MARGEM_HORAS }) };
    return null;
  };
}

/** "Se abre nesse horario, atualize o horario no perfil" - abre o perfil numa aba nova (o formulario fica). */
export function LinkHorarioPerfil({ testid }: { testid: string }) {
  const t = useTranslations('oficinaEnviarOrcamento');
  return (
    <p className="mt-1">
      {t('dicaHorarioPerfil')}{' '}
      <Link href="/oficina/perfil#horario-funcionamento" target="_blank" rel="noopener" data-testid={testid} className="font-medium underline">{t('linkHorarioPerfil')} ↗</Link>
    </p>
  );
}

/** Caixa do aviso/erro abaixo da data; `id` liga ao campo por aria-describedby. */
export default function AvisoHorarioSlot({ aviso, id, testid, testidLink }: { aviso: AvisoHorario; id: string; testid: string; testidLink: string }) {
  if (!aviso) return null;
  const erro = aviso.tipo === 'fechado';
  return (
    <div id={id} role={erro ? 'alert' : 'status'} data-testid={testid} data-tipo={aviso.tipo}
      className={`w-full rounded-lg border p-2 text-sm ${erro ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <p>{erro ? '⛔' : '⚠️'} {aviso.texto}</p>
      {aviso.tipo !== 'acaba-logo' && <LinkHorarioPerfil testid={testidLink} />}
    </div>
  );
}
