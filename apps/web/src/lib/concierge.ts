import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';

// Fase sem oficinas ativas: cada pedido/acidente novo chega por e-mail ao
// dono da plataforma (VISITAS_EMAIL_PARA) para encaminhamento manual - o
// motorista nao fica sem resposta enquanto a rede de oficinas e montada.
// `avisadas`: quantas oficinas foram avisadas deste pedido/acidente. Quando
// informado, o admin e chamado se NINGUEM perto foi avisado (ex.: primeiro
// acidente numa cidade nova) - antes so quando nao havia oficina ativa no mundo.
export async function avisarAdminSeSemOficinas(tipo: 'pedido' | 'acidente', id: string, resumo: string, avisadas?: number) {
  const destino = process.env.VISITAS_EMAIL_PARA;
  if (!destino) return;
  if (avisadas != null) {
    if (avisadas > 0) return;
  } else {
    const { count } = await supabaseAdmin.from('oficinas').select('id', { count: 'exact', head: true }).eq('ativa', true);
    if (count && count > 0) return;
  }
  const caminho = tipo === 'pedido' ? `/admin/solicitacoes/${id}` : `/admin/emergencias/${id}`;
  await enviarEmail({
    para: destino,
    assunto: `[BipFix] Novo ${tipo === 'pedido' ? 'pedido' : 'acidente'} sem oficina ativa`,
    html: `<p>Chegou um novo ${tipo} e nenhuma oficina ativa perto dele foi avisada.</p>
<p>${escapeHtml(resumo.slice(0, 300))}</p>
<p><a href="https://bipfix.com${caminho}">Abrir no painel</a> e encaminhar manualmente.</p>`,
  });
}
