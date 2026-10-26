import { Resend } from 'resend';

// Ponto unico de envio de e-mail (Resend): remetente de uma variavel so e
// erro do Resend tratado igual em todo lugar (o SDK devolve { error } em vez
// de lancar).
export const FROM_EMAIL = process.env.FROM_EMAIL || 'BipFix <noreply@bipfix.com>';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function enviarEmail(p: { para: string; assunto: string; html: string }): Promise<boolean> {
  if (!resend) {
    // ambiente de teste local (Documentos/_teste_local): grava o e-mail num
    // arquivo em vez de enviar, para os testes abrirem os links
    if (process.env.EMAIL_PASTA_TESTE) {
      const fs = await import('node:fs/promises');
      const nome = `${Date.now()}_${p.para.replace(/[^a-z0-9@._-]/gi, '_')}.html`;
      await fs.mkdir(process.env.EMAIL_PASTA_TESTE, { recursive: true });
      await fs.writeFile(`${process.env.EMAIL_PASTA_TESTE}/${nome}`, `<!-- para: ${p.para} | assunto: ${p.assunto} -->\n${p.html}`);
      return true;
    }
    console.warn('[email] RESEND_API_KEY ausente - e-mail nao enviado');
    return false;
  }
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to: p.para, subject: p.assunto, html: p.html });
  if (error) {
    console.error('[email] Resend recusou:', error.name, error.message);
    return false;
  }
  return true;
}
