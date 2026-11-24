import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { linkPedido } from './link-acesso';
import { perfilDeContaTeste } from './conta-teste-envio';
import { SITE_URL, idiomaDoSite } from './site-url';
import {
  decidirEmailMensagem, limiteDaTrava, montarEmailMensagemOficina, consultaChatOficina, linkPagadorMensagem, type MotivoSemEmail,
} from './email-mensagem-oficina-regras';

// E-mail ao MOTORISTA quando a OFICINA escreve no chat do pedido (dono 24/11): a maioria dos motoristas nao tem
// o app, entao so via o sino do site e nunca sabia que a oficina escreveu. Chamado por api/avisar-mensagem (que o
// chat do site e o do app chamam depois de gravar a mensagem), so para mensagem de quem e da oficina.
// - sem o texto da mensagem (privacidade; audio = o mesmo e-mail);
// - no maximo 1 e-mail por conversa (pedido + oficina + quem recebe) a cada HORAS_ENTRE_EMAILS_MENSAGEM, trava
//   na tabela emails_mensagem_cliente (116): insert (1.a vez) ou update condicional (ultimo_em mais velho que o
//   intervalo) - duas mensagens ao mesmo tempo nunca mandam 2 e-mails;
// - nunca lanca: qualquer erro vai para o log e o chat segue igual.

const TABELA = 'emails_mensagem_cliente';
const site = () => SITE_URL.replace('://www.', '://');

type Chave = { solicitacao_id: string; oficina_id: string; profile_id: string };

/** reserva o envio desta conversa; devolve o ultimo_em gravado ou null se ja houve e-mail dentro do intervalo */
async function reservarEnvio(chave: Chave, agora: number): Promise<string | null> {
  const em = new Date(agora).toISOString();
  const { error } = await supabaseAdmin.from(TABELA).insert({ ...chave, ultimo_em: em });
  if (!error) return em;
  if (error.code !== '23505') throw new Error(`reservar: ${error.message}`);
  // ja existe: so passa se o ultimo e-mail e mais velho que o intervalo (o UPDATE reavalia o WHERE sob o lock da linha)
  const { data, error: e2 } = await supabaseAdmin.from(TABELA).update({ ultimo_em: em })
    .eq('solicitacao_id', chave.solicitacao_id).eq('oficina_id', chave.oficina_id).eq('profile_id', chave.profile_id)
    .lt('ultimo_em', limiteDaTrava(agora))
    .select('ultimo_em');
  if (e2) throw new Error(`reservar: ${e2.message}`);
  return data && data.length ? em : null;
}

/** o envio falhou: solta a trava para a proxima mensagem tentar de novo */
async function soltarEnvio(chave: Chave, em: string): Promise<void> {
  await supabaseAdmin.from(TABELA).delete()
    .eq('solicitacao_id', chave.solicitacao_id).eq('oficina_id', chave.oficina_id).eq('profile_id', chave.profile_id)
    .eq('ultimo_em', em)
    .then(() => {}, () => {});
}

export type ResultadoEmailMensagem = { enviado: boolean; motivo?: MotivoSemEmail | 'trava' | 'falhou' | 'erro' };

/**
 * Manda (ou nao) o e-mail ao motorista pela mensagem `mensagemId`. `daOficina` e `destinoId` vem de quem chama
 * (api/avisar-mensagem ja conferiu que quem pediu e o remetente e calculou o destino pela conversa).
 */
export async function emailMensagemDaOficina(p: { mensagemId: string; remetenteId: string; daOficina: boolean; destinoId: string | null | undefined; agora?: number }): Promise<ResultadoEmailMensagem> {
  try {
    if (!p.daOficina) return { enviado: false, motivo: 'nao_e_oficina' };
    const { data: msg } = await supabaseAdmin.from('mensagens')
      .select('solicitacao_id, oficina_id, pagador_id').eq('id', p.mensagemId).maybeSingle();
    if (!msg || !p.destinoId) return { enviado: false, motivo: 'sem_destino' };
    const [{ data: sol }, { data: of }, { data: perfil }] = await Promise.all([
      supabaseAdmin.from('solicitacoes').select('id, numero, status, cliente_id').eq('id', msg.solicitacao_id).maybeSingle(),
      supabaseAdmin.from('oficinas').select('nome_fantasia').eq('id', msg.oficina_id).maybeSingle(),
      supabaseAdmin.from('profiles').select('nome, email, idioma, ativo').eq('id', p.destinoId).maybeSingle(),
    ]);
    const decisao = decidirEmailMensagem({
      daOficina: p.daOficina, remetenteId: p.remetenteId, destinoId: p.destinoId,
      numero: sol?.numero, statusPedido: sol?.status, email: perfil?.email, ativo: perfil?.ativo,
      // so consulta a conta de teste quando o resto ja deixou passar
      contaTeste: false,
    });
    if (!decisao.enviar) return { enviado: false, motivo: decisao.motivo };
    if (await perfilDeContaTeste(p.destinoId)) return { enviado: false, motivo: 'conta_teste' };

    const chave: Chave = { solicitacao_id: msg.solicitacao_id, oficina_id: msg.oficina_id, profile_id: p.destinoId };
    const agora = p.agora ?? Date.now();
    const reservado = await reservarEnvio(chave, agora);
    if (!reservado) return { enviado: false, motivo: 'trava' };

    const idioma = idiomaDoSite(perfil!.idioma);
    // dono do pedido: link de acesso de uso unico (entra na conta com um toque, para quem nao tem senha) que abre
    // o chat com a oficina que escreveu (of=); quem paga o reparo (acidente): link curto com &g=1 -> o chat dele
    const link = sol!.cliente_id === p.destinoId
      ? await linkPedido(sol!.numero, p.destinoId, sol!.id, consultaChatOficina(msg.oficina_id))
      : linkPagadorMensagem(site(), sol!.numero, msg.oficina_id, idioma);
    const { assunto, html } = montarEmailMensagemOficina({ idioma: perfil!.idioma, nome: perfil!.nome, oficina: of?.nome_fantasia, numero: sol!.numero, link });
    const ok = await enviarEmail({ para: String(perfil!.email).trim(), assunto, html });
    if (!ok) {
      await soltarEnvio(chave, reservado);
      console.error('[email-mensagem] envio falhou', { mensagemId: p.mensagemId });
      return { enviado: false, motivo: 'falhou' };
    }
    return { enviado: true };
  } catch (e) {
    console.error('[email-mensagem] erro:', (e as Error)?.message);
    return { enviado: false, motivo: 'erro' };
  }
}
