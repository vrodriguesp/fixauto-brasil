// Periodos de check-in oferecidos pela oficina: manha 08-12, tarde 13-17
// (mesmos horarios do aceite, da agenda e do que o cliente ve). Para hoje so
// vale o periodo que ainda nao acabou - nunca um periodo ja vencido.
export type Turno = 'manha' | 'tarde';
const FIM_TURNO: Record<Turno, number> = { manha: 12, tarde: 17 };

/** Data de hoje no fuso do aparelho (toISOString daria a data em UTC). */
export function hojeLocal(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

export function turnoDisponivel(data: string, turno: Turno, agora = new Date()): boolean {
  if (!data) return true;
  const hoje = hojeLocal(agora);
  if (data < hoje) return false;
  if (data > hoje) return true;
  return agora.getHours() < FIM_TURNO[turno];
}

/** Primeiro periodo ainda valido: agora ou o proximo. */
export function primeiroTurnoLivre(agora = new Date()): { data: string; turno: Turno } {
  const hoje = hojeLocal(agora);
  if (turnoDisponivel(hoje, 'manha', agora)) return { data: hoje, turno: 'manha' };
  if (turnoDisponivel(hoje, 'tarde', agora)) return { data: hoje, turno: 'tarde' };
  const amanha = new Date(agora);
  amanha.setDate(amanha.getDate() + 1);
  return { data: hojeLocal(amanha), turno: 'manha' };
}

// Data/hora digitadas pela oficina estao no fuso dela (o do navegador):
// gravar em UTC de verdade e ler de volta no mesmo fuso. Antes gravava
// "08:00Z" e a agenda mostrava 11:00 em Tallinn (auditoria Fable 08/10, M-03).
export function localParaIso(data: string, hora: string): string {
  return new Date(`${data}T${hora}:00`).toISOString();
}
export function dataLocalDe(iso: string): string {
  return hojeLocal(new Date(iso));
}
export function horaLocalDe(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
