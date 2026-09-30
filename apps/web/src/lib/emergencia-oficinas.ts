import { supabaseAdmin } from './supabase-admin';
import { oficinaTemCapacidade } from './capacidade';
import { notifEmergenciaAcidenteProximo } from './notif-i18n';

/**
 * Avisa oficinas de colisao num raio de 50 km (ou as ativas, se nao houver
 * nenhuma perto). Idempotente: se o acidente ja tem oficinas avisadas, nao
 * avisa de novo. So roda no servidor, chamado pela criacao do acidente.
 */
export async function avisarOficinasDoAcidente(emergenciaId: string, latitude: number, longitude: number): Promise<number> {
  const { count } = await supabaseAdmin
    .from('emergencia_oficinas_notificadas')
    .select('id', { count: 'exact', head: true })
    .eq('emergencia_id', emergenciaId);
  if (count && count > 0) return 0;

  const RAIO_KM = 50;
  const dLat = RAIO_KM / 111;
  const dLon = RAIO_KM / (111 * Math.cos((latitude * Math.PI) / 180));
  const campos = 'id, profile_id, especialidades, capacidade_servicos, profile:profiles!oficinas_profile_id_fkey(idioma)';

  let { data: oficinas } = await supabaseAdmin
    .from('oficinas')
    .select(campos)
    .eq('ativa', true)
    .gte('latitude', latitude - dLat)
    .lte('latitude', latitude + dLat)
    .gte('longitude', longitude - dLon)
    .lte('longitude', longitude + dLon);

  if (!oficinas || oficinas.length === 0) {
    const { data: todas } = await supabaseAdmin.from('oficinas').select(campos).eq('ativa', true).limit(20);
    oficinas = todas || [];
  }

  const colisao = oficinas.filter(
    (o: any) => !o.especialidades?.length || o.especialidades.some((e: string) => ['colisao', 'funilaria', 'pintura', 'geral'].includes(e))
  );
  const comCapacidade = [];
  for (const o of colisao) if (await oficinaTemCapacidade(supabaseAdmin, o, 'colisao')) comCapacidade.push(o);
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
  return destinos.length;
}
