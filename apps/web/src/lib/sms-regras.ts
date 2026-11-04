// Regra pura do SMS "chegou orcamento" (sem banco; testada em scripts/teste-sms-regras.ts).
// Regras: so pedido aberto e com orcamento; automatico so com o interruptor do
// admin ligado, uma vez por orcamento e so para quem NAO tem o app (push);
// envio manual do admin ignora interruptor/app mas nunca pedido fechado.

/** tem o app = abriu o app (token de push visto) nos ultimos N dias */
export const SMS_APP_DIAS = 60;
export const ABERTOS = ['aberta', 'em_orcamento'];

export type TipoSms = 'orcamento_auto' | 'manual';
export type DecisaoSms = { enviar: true } | { enviar: false; motivo: string };

export function decidirSms(p: {
  tipo: TipoSms; smsAtivo: boolean; status: string | null; telefone: string | null;
  temApp: boolean; jaEnviado: boolean; temOrcamento: boolean;
}): DecisaoSms {
  if (!p.telefone || !p.telefone.replace(/\D/g, '')) return { enviar: false, motivo: 'sem_telefone' };
  if (!p.status || !ABERTOS.includes(p.status)) return { enviar: false, motivo: 'pedido_fechado' };
  if (!p.temOrcamento) return { enviar: false, motivo: 'sem_orcamento' };
  if (p.tipo === 'orcamento_auto') {
    if (!p.smsAtivo) return { enviar: false, motivo: 'sms_desligado' };
    if (p.jaEnviado) return { enviar: false, motivo: 'ja_enviado' };
    if (p.temApp) return { enviar: false, motivo: 'tem_app' };
  }
  return { enviar: true };
}

/** partes cobradas: GSM-7 = 160 (153 em varias), qualquer outro caractere (õ, cirilico) = 70 (67) */
const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
export function partesSms(texto: string): number {
  const c = Array.from(texto);
  const gsm = c.every((x) => GSM7.includes(x));
  const lim = gsm ? [160, 153] : [70, 67];
  return c.length <= lim[0] ? 1 : Math.ceil(c.length / lim[1]);
}
