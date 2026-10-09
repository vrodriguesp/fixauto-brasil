import { supabaseAdmin } from './supabase-admin';
import { tipoCompativel, distanciaKm } from '@fixauto/shared';
import { oficinaTemCapacidade } from './capacidade';
import { notifEmergenciaAcidenteProximo } from './notif-i18n';

export type OficinaAvisada = { profile_id: string; idioma: string | null };

/**
 * Avisa oficinas de colisao num raio de 50 km do acidente. Devolve quem foi
 * avisado (a rota manda a esses o aviso de pedido novo). Sem coordenadas ou
 * sem oficina perto: ninguem - antes avisava 20 oficinas ativas QUALQUER
 * (de outro pais: acidente em Tallinn chegava a oficina de Milao; achado no
 * teste por mercados de 09/10). O admin e avisado por e-mail nesse caso.
 * Idempotente: se o acidente ja tem oficinas avisadas, nao avisa de novo.
 */
export async function avisarOficinasDoAcidente(emergenciaId: string, latitude: number | null, longitude: number | null, tipo = 'colisao'): Promise<OficinaAvisada[]> {
  if (latitude == null || longitude == null) return [];
  const { count } = await supabaseAdmin
    .from('emergencia_oficinas_notificadas')
    .select('id', { count: 'exact', head: true })
    .eq('emergencia_id', emergenciaId);
  if (count && count > 0) return [];

  const RAIO_KM = 50;
  const dLat = RAIO_KM / 111;
  const dLon = RAIO_KM / (111 * Math.cos((latitude * Math.PI) / 180));
  const campos = 'id, profile_id, especialidades, capacidade_servicos, latitude, longitude, profile:profiles!oficinas_profile_id_fkey(idioma)';

  const { data: proximas } = await supabaseAdmin
    .from('oficinas')
    .select(campos)
    .eq('ativa', true)
    .gte('latitude', latitude - dLat)
    .lte('latitude', latitude + dLat)
    .gte('longitude', longitude - dLon)
    .lte('longitude', longitude + dLon);

  // acidente = carroceria: so oficinas de colisao/funilaria/pintura (ou sem
  // especialidade marcada), dentro do raio de 50 km do acidente
  const colisao = (proximas || []).filter((o: any) => tipoCompativel(o.especialidades, tipo)
    && o.latitude != null && distanciaKm(latitude, longitude, o.latitude, o.longitude) <= RAIO_KM);
  const comCapacidade = [];
  for (const o of colisao) if (await oficinaTemCapacidade(supabaseAdmin, o, tipo)) comCapacidade.push(o);
  const destinos = comCapacidade.length > 0 ? comCapacidade : colisao;

  for (const o of destinos as any[]) {
    await supabaseAdmin.from('emergencia_oficinas_notificadas').insert({ emergencia_id: emergenciaId, oficina_id: o.id });
    if (o.profile_id) {
      const n = notifEmergenciaAcidenteProximo(o.profile?.idioma);
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: o.profile_id,
        tipo: 'emergencia',
        titulo: n.titulo,
        mensagem: n.mensagem,
        dados: { emergencia_id: emergenciaId },
      });
    }
  }
  return (destinos as any[]).filter((o) => o.profile_id).map((o) => ({ profile_id: o.profile_id, idioma: o.profile?.idioma ?? null }));
}
