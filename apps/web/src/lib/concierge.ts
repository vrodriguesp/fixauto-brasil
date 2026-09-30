import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';

// Fase sem oficinas ativas: cada pedido/acidente novo chega por e-mail ao
// dono da plataforma (VISITAS_EMAIL_PARA) para encaminhamento manual - o
// motorista nao fica sem resposta enquanto a rede de oficinas e montada.
export async function avisarAdminSeSemOficinas(tipo: 'pedido' | 'acidente', id: string, resumo: string) {
  const destino = process.env.VISITAS_EMAIL_PARA;
  if (!destino) return;
  const { count } = await supabaseAdmin.from('oficinas').select('id', { count: 'exact', head: true }).eq('ativa', true);
  if (count && count > 0) return;
  const caminho = tipo === 'pedido' ? `/admin/solicitacoes/${id}` : `/admin/emergencias/${id}`;
  await enviarEmail({
    para: destino,
    assunto: `[BipFix] Novo ${tipo === 'pedido' ? 'pedido' : 'acidente'} sem oficina ativa`,
    html: `<p>Chegou um novo ${tipo} e ainda não há oficinas ativas para recebê-lo.</p>
<p>${escapeHtml(resumo.slice(0, 300))}</p>
<p><a href="https://bipfix.com${caminho}">Abrir no painel</a> e encaminhar manualmente.</p>`,
  });
}
