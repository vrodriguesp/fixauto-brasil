import { SITE_URL } from './site-url';

// Identidade da BipFix em todos os e-mails (dono 07/11): logo no topo azul da
// marca, fundo claro e rodape da empresa. Aplicada no envio (lib/email.ts e
// lib/notifications.ts), entao vale para todo e-mail que ja existe: o topo antigo
// so com o texto "BipFix" (cores diferentes em cada e-mail) vira o topo com o
// logo, na mesma cor; o resto do conteudo nao muda.
export const AZUL_MARCA = '#1d4ed8';
const BASE = SITE_URL.replace('://www.', '://');

const TOPO_ANTIGO = /<div style="background: ?#[0-9a-fA-F]{6}; ?color: ?white; ?padding: ?24px; ?border-radius: ?12px 12px 0 0;">\s*<h1 style="margin: ?0; ?font-size: ?24px;">BipFix<\/h1>/g;

function topo(): string {
  return `<div style="background:${AZUL_MARCA};color:white;padding:20px 24px;border-radius:12px 12px 0 0;">`
    + `<a href="${BASE}" style="text-decoration:none;"><img src="${BASE}/email/logo-branco.png" width="174" height="40" alt="BipFix" style="display:block;border:0;width:174px;height:40px;"></a>`;
}

const RODAPE = `
  <div style="max-width:600px;margin:0 auto;padding:16px 8px 0;text-align:center;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
    <a href="${BASE}" style="color:${AZUL_MARCA};font-weight:bold;text-decoration:none;">bipfix.com</a> · Tallinn, Eesti<br>
    BipFix is a product of RPyrus OÜ · Registrikood 17628754 · Tartu mnt 67/1-13b, 10115 Tallinn
  </div>`;

export function aplicarIdentidade(html: string): string {
  if (!html || html.includes('data-bipfix-marca')) return html;
  const comTopo = html.replace(TOPO_ANTIGO, topo());
  return `<div data-bipfix-marca style="background:#f1f5f9;padding:24px 12px;">${comTopo}${RODAPE}</div>`;
}
