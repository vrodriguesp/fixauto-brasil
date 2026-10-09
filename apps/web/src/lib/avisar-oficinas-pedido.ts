import { supabaseAdmin } from './supabase-admin';
import { tipoCompativel } from '@fixauto/shared';
import { notifNovaSolicitacaoTitulo } from './notif-i18n';
import pt from '../../messages/pt.json';
import ptPT from '../../messages/pt-PT.json';
import en from '../../messages/en.json';
import et from '../../messages/et.json';
import it from '../../messages/it.json';
import ru from '../../messages/ru.json';

// Aviso de pedido novo as oficinas - no servidor (antes o navegador/app do
// cliente inseria um aviso por oficina ativa DO MUNDO INTEIRO, em serie;
// auditoria Fable 08/10, A5/E9). So oficinas ativas, cujo raio de
// atendimento alcanca o pedido e que fazem esse tipo de servico.
const TIPOS: Record<string, Record<string, string>> = {
  pt: (pt as any).constants.tiposServico, 'pt-PT': (ptPT as any).constants.tiposServico, en: (en as any).constants.tiposServico,
  et: (et as any).constants.tiposServico, it: (it as any).constants.tiposServico, ru: (ru as any).constants.tiposServico,
};

function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export async function avisarOficinasDoPedido(solicitacaoId: string): Promise<number> {
  const { count } = await supabaseAdmin.from('notificacoes').select('id', { count: 'exact', head: true })
    .eq('tipo', 'nova_solicitacao').eq('dados->>solicitacao_id', solicitacaoId);
  if (count && count > 0) return -1; // ja avisado (idempotente; -1 = nao avisar o admin de novo)
  const { data: sol } = await supabaseAdmin.from('solicitacoes')
    .select('tipo, endereco, latitude, longitude, veiculo:veiculos(fipe_marca, fipe_modelo)').eq('id', solicitacaoId).maybeSingle();
  if (!sol || sol.latitude == null || sol.longitude == null) return 0;
  const { data: oficinas } = await supabaseAdmin.from('oficinas')
    .select('profile_id, especialidades, latitude, longitude, raio_atendimento_km, profile:profiles!oficinas_profile_id_fkey(idioma)')
    .eq('ativa', true);
  const alvo = (oficinas || []).filter((o: any) =>
    tipoCompativel(o.especialidades, sol.tipo) &&
    o.latitude != null && o.longitude != null &&
    distanciaKm({ lat: sol.latitude, lon: sol.longitude }, { lat: o.latitude, lon: o.longitude }) <= (o.raio_atendimento_km || 30));
  const carro = [(sol.veiculo as any)?.fipe_marca, (sol.veiculo as any)?.fipe_modelo].filter(Boolean).join(' ');
  const linhas = alvo.map((o: any) => {
    const idioma = o.profile?.idioma && TIPOS[o.profile.idioma] ? o.profile.idioma : 'en';
    return {
      profile_id: o.profile_id, tipo: 'nova_solicitacao', titulo: notifNovaSolicitacaoTitulo(idioma),
      mensagem: [TIPOS[idioma][sol.tipo] || sol.tipo, carro, sol.endereco].filter(Boolean).join(' - '),
      dados: { solicitacao_id: solicitacaoId },
    };
  });
  if (linhas.length) await supabaseAdmin.from('notificacoes').insert(linhas);
  return linhas.length;
}
