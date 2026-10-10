import { supabaseAdmin } from '@/lib/supabase-admin';

// Postos da oficina (elevador, posto no chao, vaga de espera) e as ocupacoes
// por intervalo (migracao 057). Regras usadas por /api/servico.

export interface Posto { id: string; nome: string; tipo: 'elevador' | 'box' | 'vaga'; capacidade: number }

export async function postoAtivo(boxId: unknown, oficinaId: string): Promise<Posto | null> {
  if (typeof boxId !== 'string' || !boxId) return null;
  const { data } = await supabaseAdmin.from('oficina_boxes').select('id, nome, tipo, capacidade')
    .eq('id', boxId).eq('oficina_id', oficinaId).eq('ativo', true).maybeSingle();
  return (data as Posto) || null;
}

// Um carro que esta no posto agora (ocupacao real sem fim) nao tem hora para
// sair: conta como ocupando ate 15 min a partir de agora. Assim da para
// reservar a tarde enquanto o carro da manha ainda esta la (o Quadro mostra).
const FOLGA_ABERTA_MS = 15 * 60e3;

/**
 * Quem ja ocupa o posto no intervalo [inicio, fim) - fim null = "a partir de
 * agora, sem hora para sair". Vazio = cabe. Elevador e posto no chao: um carro
 * por vez; vaga de espera: ate `capacidade` carros ao mesmo tempo.
 */
export async function conflitosNoPosto(posto: Posto, inicio: Date, fim: Date | null, agendaId: string, ignorarOcupacao?: string) {
  const agora = Date.now();
  const ini = inicio.getTime();
  const fi = fim ? fim.getTime() : Math.max(ini, agora) + FOLGA_ABERTA_MS;
  const { data } = await supabaseAdmin.from('posto_ocupacoes')
    .select('id, agenda_id, inicio, fim, real, agenda:agenda(titulo, status)')
    .eq('box_id', posto.id).lt('inicio', new Date(fi).toISOString())
    .or(`fim.is.null,fim.gt.${new Date(ini).toISOString()}`);
  const outros = (data || []).filter((o: any) => o.agenda_id !== agendaId && o.id !== ignorarOcupacao
    && !['concluido', 'cancelado'].includes(o.agenda?.status))
    .filter((o: any) => {
      const oIni = new Date(o.inicio).getTime();
      const oFim = o.fim ? new Date(o.fim).getTime() : Math.max(oIni, agora) + FOLGA_ABERTA_MS;
      return oIni < fi && oFim > ini;
    });
  const carros = new Set(outros.map((o: any) => o.agenda_id));
  if (carros.size < Math.max(1, posto.capacidade || 1)) return [];
  return outros.map((o: any) => ({ titulo: o.agenda?.titulo || '', inicio: o.inicio, fim: o.fim, real: o.real }));
}
