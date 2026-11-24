import { escapeHtml, fmt, resolveEmailLocale } from './email-i18n';
import { TEXTOS_EMAIL_MENSAGEM } from './email-mensagem-oficina-textos';

// E-mail "a oficina te escreveu" ao MOTORISTA (dono 24/11): regras e corpo do e-mail, puros (sem banco), para
// o servidor (lib/email-mensagem-oficina.ts) e o teste (scripts/teste-email-mensagem-oficina.ts) usarem o mesmo
// codigo. So oficina -> motorista; motorista -> oficina nao muda (so o sino/push de hoje).

/** no maximo 1 e-mail por conversa (pedido + oficina + quem recebe) a cada X horas (trava na tabela da 116) */
export const HORAS_ENTRE_EMAILS_MENSAGEM = 3;

/** pedido fechado: nada de e-mail (a conversa pode continuar no site, mas ninguem e chamado por e-mail) */
export const STATUS_PEDIDO_FECHADO = ['cancelada', 'concluida', 'expirada', 'no_show'] as const;

export type MotivoSemEmail =
  | 'nao_e_oficina' | 'sem_destino' | 'para_si_mesmo' | 'sem_pedido' | 'pedido_fechado'
  | 'sem_email' | 'perfil_inativo' | 'conta_teste';

export type DadosDecisao = {
  /** quem enviou e dono/funcionario ativo da oficina da conversa */
  daOficina: boolean;
  remetenteId: string;
  /** mensagens.pagador_id ou solicitacoes.cliente_id (nunca do corpo do pedido) */
  destinoId: string | null | undefined;
  numero: string | number | null | undefined;
  statusPedido: string | null | undefined;
  email: string | null | undefined;
  /** profiles.ativo (false = conta desativada) */
  ativo?: boolean | null;
  contaTeste: boolean;
};

export function decidirEmailMensagem(d: DadosDecisao): { enviar: true } | { enviar: false; motivo: MotivoSemEmail } {
  if (!d.daOficina) return { enviar: false, motivo: 'nao_e_oficina' };
  if (!d.destinoId) return { enviar: false, motivo: 'sem_destino' };
  if (d.destinoId === d.remetenteId) return { enviar: false, motivo: 'para_si_mesmo' };
  if (d.numero == null || String(d.numero).trim() === '') return { enviar: false, motivo: 'sem_pedido' };
  if (d.statusPedido && (STATUS_PEDIDO_FECHADO as readonly string[]).includes(d.statusPedido)) return { enviar: false, motivo: 'pedido_fechado' };
  const email = String(d.email || '').trim();
  // conta excluida fica com excluida-<id>@conta-excluida.invalid (lib/excluir-conta.ts)
  if (!email || !email.includes('@') || /\.invalid$/i.test(email)) return { enviar: false, motivo: 'sem_email' };
  if (d.ativo === false) return { enviar: false, motivo: 'perfil_inativo' };
  if (d.contaTeste) return { enviar: false, motivo: 'conta_teste' };
  return { enviar: true };
}

/** ultimo e-mail desta conversa antes deste instante -> pode mandar outro (a trava do banco usa o mesmo limite) */
export function limiteDaTrava(agora: number): string {
  return new Date(agora - HORAS_ENTRE_EMAILS_MENSAGEM * 3600e3).toISOString();
}

/** espelho da trava do banco: sem registro ou registro mais velho que o intervalo -> pode */
export function podeMandarDeNovo(ultimoEm: string | null | undefined, agora: number): boolean {
  if (!ultimoEm) return true;
  const t = Date.parse(ultimoEm);
  return !Number.isFinite(t) || t < Date.parse(limiteDaTrava(agora));
}

// nome da oficina no assunto: texto puro, uma linha, curto
const nomeLimpo = (s: string | null | undefined) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 80) || 'BipFix';

export function montarEmailMensagemOficina(p: {
  idioma: string | null | undefined; nome: string | null | undefined; oficina: string | null | undefined;
  numero: string | number; link: string;
}): { assunto: string; html: string } {
  const t = TEXTOS_EMAIL_MENSAGEM[resolveEmailLocale(p.idioma)];
  const oficina = nomeLimpo(p.oficina);
  const numero = String(p.numero);
  const assunto = fmt(t.assunto, { oficina, numero });
  const nome = String(p.nome || '').trim();
  // fmt com valores ja escapados: nome e oficina sao texto livre
  const ola = nome ? fmt(escapeHtml(t.ola), { nome: escapeHtml(nome) }) : escapeHtml(t.olaSemNome);
  const intro = fmt(escapeHtml(t.intro), { oficina: `<strong>${escapeHtml(oficina)}</strong>`, numero: escapeHtml(numero) });
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;" data-email="mensagem-oficina">
      <div style="background:#1e40af;color:white;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">BipFix</h1></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 12px;">${ola}</p>
        <p style="margin:0 0 12px;">${intro}</p>
        <p style="margin:0;color:#374151;">${escapeHtml(t.acao)}</p>
        <p style="margin:20px 0 0;"><a href="${escapeHtml(p.link)}" data-botao="pedido" style="display:inline-block;background:#1e40af;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">${escapeHtml(t.botao)}</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
        <p style="margin:0;font-size:12px;color:#6b7280;">${escapeHtml(t.rodape)}</p>
      </div>
    </div>`;
  return { assunto, html };
}
