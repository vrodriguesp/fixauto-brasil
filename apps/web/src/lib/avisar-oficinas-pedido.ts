import { supabaseAdmin } from './supabase-admin';
import { tipoCompativel } from '@fixauto/shared';
import { notifNovaSolicitacaoTitulo } from './notif-i18n';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';
import { urlNoIdioma } from './site-url';
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
export const TIPOS: Record<string, Record<string, string>> = {
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
    .select('tipo, descricao, urgencia, endereco, latitude, longitude, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano), cliente:profiles!solicitacoes_cliente_id_fkey(conta_teste)').eq('id', solicitacaoId).maybeSingle();
  if (!sol || sol.latitude == null || sol.longitude == null) return 0;
  const { data: oficinas } = await supabaseAdmin.from('oficinas')
    .select('profile_id, nome_fantasia, especialidades, latitude, longitude, raio_atendimento_km, profile:profiles!oficinas_profile_id_fkey(idioma, conta_teste, email, nome)')
    .eq('ativa', true);
  // conta de teste (revisor das lojas) so avisa oficina de teste, e vice-versa (migracao 063)
  const clienteTeste = !!(sol.cliente as any)?.conta_teste;
  const alvo = (oficinas || []).filter((o: any) =>
    !!o.profile?.conta_teste === clienteTeste &&
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
  // e-mail tambem (dono 07/11: "a oficina recebe e-mail quando chega um pedido novo");
  // um erro de e-mail nao segura o aviso no painel
  await Promise.all(alvo.map((o: any) => emailNovoPedido(o, sol, solicitacaoId, carro).catch((e) => console.error('[avisar-oficinas] e-mail', e))));
  return linhas.length;
}

const TXT_EMAIL: Record<string, { assunto: string; ola: string; texto: string; urg: Record<string, string>; botao: string; rodape: string }> = {
  et: { assunto: 'Uus päring: {t}', ola: 'Tere, {n}!', texto: 'Sinu piirkonnas on uus hinnapäring, mis sobib sinu töökoja teenustega:', urg: { baixa: 'Kiiret ei ole', media: 'Mõne nädala jooksul', alta: 'Kiire' }, botao: 'Vaata päringut ja saada pakkumine', rodape: 'Saad selle kirja, sest sinu töökoda on BipFixis ja teeb seda teenust selles piirkonnas.' },
  ru: { assunto: 'Новая заявка: {t}', ola: 'Здравствуйте, {n}!', texto: 'В вашем районе новая заявка на расчёт цены, подходящая под услуги вашего автосервиса:', urg: { baixa: 'Не срочно', media: 'В течение нескольких недель', alta: 'Срочно' }, botao: 'Посмотреть заявку и отправить смету', rodape: 'Вы получили это письмо, потому что ваш автосервис есть в BipFix и выполняет эту услугу в этом районе.' },
  en: { assunto: 'New request: {t}', ola: 'Hello {n},', texto: 'There is a new quote request in your area that matches your shop’s services:', urg: { baixa: 'Not urgent', media: 'Within a few weeks', alta: 'Urgent' }, botao: 'See the request and send a quote', rodape: 'You receive this e-mail because your repair shop is on BipFix and does this service in this area.' },
  it: { assunto: 'Nuova richiesta: {t}', ola: 'Ciao {n},', texto: 'C’è una nuova richiesta di preventivo nella tua zona che corrisponde ai servizi della tua officina:', urg: { baixa: 'Non urgente', media: 'Entro poche settimane', alta: 'Urgente' }, botao: 'Vedi la richiesta e invia un preventivo', rodape: 'Ricevi questa e-mail perché la tua officina è su BipFix e offre questo servizio in questa zona.' },
  pt: { assunto: 'Novo pedido: {t}', ola: 'Olá, {n}!', texto: 'Chegou um novo pedido de orçamento na sua região que combina com os serviços da sua oficina:', urg: { baixa: 'Sem pressa', media: 'Nas próximas semanas', alta: 'Urgente' }, botao: 'Ver o pedido e enviar orçamento', rodape: 'Você recebe este e-mail porque sua oficina está na BipFix e faz este serviço nesta região.' },
  'pt-PT': { assunto: 'Novo pedido: {t}', ola: 'Olá, {n}!', texto: 'Chegou um novo pedido de orçamento na sua zona que corresponde aos serviços da sua oficina:', urg: { baixa: 'Sem pressa', media: 'Nas próximas semanas', alta: 'Urgente' }, botao: 'Ver o pedido e enviar orçamento', rodape: 'Recebe este e-mail porque a sua oficina está na BipFix e faz este serviço nesta zona.' },
};

async function emailNovoPedido(o: any, sol: any, solicitacaoId: string, carro: string) {
  const para = o.profile?.email;
  if (!para) return;
  const idioma = o.profile?.idioma && TXT_EMAIL[o.profile.idioma] ? o.profile.idioma : 'en';
  const x = TXT_EMAIL[idioma];
  const tipo = TIPOS[idioma]?.[sol.tipo] || sol.tipo;
  const ano = (sol.veiculo as any)?.fipe_ano;
  const desc = String(sol.descricao || '').slice(0, 300);
  const link = urlNoIdioma(idioma, `/oficina/enviar-orcamento/${solicitacaoId}`);
  await enviarEmail({ para, assunto: x.assunto.replace('{t}', [tipo, carro].filter(Boolean).join(' – ')), html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e40af;color:white;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">BipFix</h1></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>${x.ola.replace('{n}', escapeHtml(o.profile?.nome || o.nome_fantasia || ''))}</p>
        <p>${x.texto}</p>
        <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#111827;">${escapeHtml(tipo)}</p>
          ${carro ? `<p style="margin:0 0 6px;">${escapeHtml(carro)}${ano && ano !== '-' ? ' ' + escapeHtml(String(ano)) : ''}</p>` : ''}
          ${desc ? `<p style="margin:0 0 6px;color:#374151;">${escapeHtml(desc)}</p>` : ''}
          <p style="margin:0;color:#6b7280;font-size:14px;">${escapeHtml(sol.endereco || '')} · ${x.urg[sol.urgencia] || ''}</p>
        </div>
        <p style="margin-top:24px;"><a href="${link}" style="display:inline-block;background:#1e40af;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">${x.botao}</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">${x.rodape}</p>
      </div>
    </div>` });
}
