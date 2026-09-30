import { supabaseAdmin } from './supabase-admin';
import { sendAccidentNotificationEmail, sendAccidentWhatsApp } from './notifications';
import { EMAIL_I18N, resolveEmailLocale, fmt, escapeHtml } from './email-i18n';
import { notifRegistroAcidente } from './notif-i18n';
import { garantirContaCliente } from './conta-convite';

/**
 * Avisa o outro motorista de um acidente (e-mail, WhatsApp, notificacao) e
 * liga a conta dele (existente ou criada com link de definir senha) ao
 * registro do outro veiculo - e isso que da a ele acesso ao acidente.
 */
export async function avisarOutroMotorista(emergencia: any, outro: any, idioma: string | null) {
  let profileId: string | null = null;
  let idiomaAviso = idioma;
  let jaTinhaConta = false;

  if (outro.email) {
    const acc = EMAIL_I18N.accidentNotification[resolveEmailLocale(idioma)];
    const conta = await garantirContaCliente({
      email: outro.email,
      nome: outro.nome,
      telefone: outro.telefone,
      idioma,
      introHtml: fmt(acc.intro, { fromName: escapeHtml(emergencia.nome || ''), placa: escapeHtml(outro.placa || '') }),
    });
    profileId = conta.id;
    jaTinhaConta = !conta.criada;
    if (!conta.criada) idiomaAviso = conta.idioma || idioma;
    await supabaseAdmin.from('emergencia_outro_veiculo').update({ profile_id: profileId }).eq('id', outro.id);

    // Quem ja tinha conta recebe o aviso do acidente (conta nova ja recebeu
    // o e-mail de boas-vindas com o contexto do acidente)
    if (jaTinhaConta) {
      await sendAccidentNotificationEmail({
        toEmail: outro.email,
        toName: outro.nome,
        fromName: emergencia.nome,
        placa: outro.placa,
        emergenciaId: emergencia.id,
        isRegistered: true,
        locale: idiomaAviso || undefined,
      });
    }
  }

  if (outro.telefone) {
    await sendAccidentWhatsApp({
      toPhone: outro.telefone,
      toName: outro.nome,
      fromName: emergencia.nome,
      placa: outro.placa,
      emergenciaId: emergencia.id,
      locale: idiomaAviso || undefined,
    });
  }

  await supabaseAdmin.from('emergencia_outro_veiculo').update({ notificado: true }).eq('id', outro.id);

  if (profileId) {
    const n = notifRegistroAcidente(idiomaAviso, emergencia.nome, outro.placa);
    await supabaseAdmin.from('notificacoes').insert({
      profile_id: profileId,
      tipo: 'acidente',
      titulo: n.titulo,
      mensagem: n.mensagem,
      dados: { emergencia_id: emergencia.id, solicitacao_id: emergencia.solicitacao_id || null },
    });
  }
}
