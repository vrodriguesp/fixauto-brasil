import { diaNaOficina, horaLocalEmUtc, minutoNaOficina } from '@/lib/fuso';

// Periodos de check-in oferecidos pela oficina: manha 08-12, tarde 13-17
// (mesmos horarios do aceite, da agenda e do que o cliente ve). Para hoje so
// vale o periodo que ainda nao acabou - nunca um periodo ja vencido.
//
// Fuso: com `pais` (o da OFICINA) tudo e calculado no fuso dela - o dono que
// abre a oficina da Estonia estando no Brasil ve o dia/hora de Tallinn, igual
// ao Quadro (auditoria do painel 10/10, A6). Sem `pais` (dado ainda
// carregando) cai no fuso do aparelho, como antes.
export type Turno = 'manha' | 'tarde';
const FIM_TURNO: Record<Turno, number> = { manha: 12, tarde: 17 };
type Pais = string | null | undefined;
const temPais = (pais: Pais) => pais !== undefined;

/** Data de hoje no fuso da oficina (ou do aparelho, sem pais). */
export function hojeLocal(agora = new Date(), pais?: Pais): string {
  if (temPais(pais)) return diaNaOficina(agora, pais);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

export function turnoDisponivel(data: string, turno: Turno, agora = new Date(), pais?: Pais): boolean {
  if (!data) return true;
  const hoje = hojeLocal(agora, pais);
  if (data < hoje) return false;
  if (data > hoje) return true;
  const hora = temPais(pais) ? minutoNaOficina(agora, pais) / 60 : agora.getHours();
  return hora < FIM_TURNO[turno];
}

/** Primeiro periodo ainda valido: agora ou o proximo. */
export function primeiroTurnoLivre(agora = new Date(), pais?: Pais): { data: string; turno: Turno } {
  const hoje = hojeLocal(agora, pais);
  if (turnoDisponivel(hoje, 'manha', agora, pais)) return { data: hoje, turno: 'manha' };
  if (turnoDisponivel(hoje, 'tarde', agora, pais)) return { data: hoje, turno: 'tarde' };
  if (temPais(pais)) {
    const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
    return { data: d.toISOString().slice(0, 10), turno: 'manha' };
  }
  const amanha = new Date(agora);
  amanha.setDate(amanha.getDate() + 1);
  return { data: hojeLocal(amanha), turno: 'manha' };
}

// Data/hora digitadas pela oficina estao no fuso dela: gravar em UTC de
// verdade e ler de volta no mesmo fuso. Antes gravava "08:00Z" e a agenda
// mostrava 11:00 em Tallinn (auditoria Fable 08/10, M-03).
export function localParaIso(data: string, hora: string, pais?: Pais): string {
  if (temPais(pais)) return horaLocalEmUtc(data, hora, pais);
  return new Date(`${data}T${hora}:00`).toISOString();
}
export function dataLocalDe(iso: string, pais?: Pais): string {
  return hojeLocal(new Date(iso), pais);
}
export function horaLocalDe(iso: string, pais?: Pais): string {
  if (temPais(pais)) { const m = minutoNaOficina(iso, pais); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
