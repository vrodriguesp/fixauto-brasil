import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { escapeHtml } from '@/lib/email-i18n';

// Recebe o percurso de uma visita (components/VisitTracker.tsx) e manda UM
// e-mail por visita pro dono do site. O navegador reenvia o percurso
// inteiro toda vez que a aba sai de foco; aqui cada reenvio so atualiza os
// dados e empurra o envio pra frente - o e-mail sai quando a visita fica
// ESPERA_MS sem novidade. Estado so em memoria: o site roda num unico
// processo (PM2); um restart perde no maximo as visitas ainda pendentes.
//
// Env: VISITAS_EMAIL_PARA (destino; sem ela nada e enviado, so logado),
// VISITAS_ESPERA_MS (opcional, padrao 3 min).

export const runtime = 'nodejs';

const DESTINO = process.env.VISITAS_EMAIL_PARA;
const ESPERA_MS = Number(process.env.VISITAS_ESPERA_MS) || 3 * 60 * 1000;
const MAX_EMAILS_HORA = 40;
const MAX_PENDENTES = 500;
const FROM_EMAIL = process.env.FROM_EMAIL || 'BipFix <noreply@bipfix.com>';
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Robos que executam JavaScript (Googlebot, previews de link, testes de
// velocidade) tambem chegariam aqui - sem este filtro, a caixa de entrada
// enche de "visitas" de maquina.
const ROBO = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|axios|node-fetch|monitor|uptime|playwright|puppeteer|selenium/i;

interface Pagina {
  p: string;
  t: number;
}

interface Visita {
  sid: string;
  inicio: number;
  fim: number;
  ref: string;
  paginas: Pagina[];
  idioma: string;
  tela: string;
  fuso: string;
  usuario: { tipo: string; nome: string } | null;
}

interface Pendente {
  visita: Visita;
  ip: string;
  ua: string;
  timer: ReturnType<typeof setTimeout>;
}

const pendentes = new Map<string, Pendente>();
const envios: number[] = [];
let descartadasPorLimite = 0;

const texto = (v: unknown, max: number) => String(v ?? '').slice(0, max);

function validar(corpo: any): Visita | null {
  if (!corpo || typeof corpo.sid !== 'string' || !/^[\w-]{8,64}$/.test(corpo.sid)) return null;
  if (!Array.isArray(corpo.paginas) || corpo.paginas.length === 0) return null;
  const paginas = corpo.paginas
    .slice(-50)
    .filter((p: any) => p && typeof p.p === 'string' && Number.isFinite(p.t))
    .map((p: any) => ({ p: texto(p.p, 300), t: Number(p.t) }));
  if (!paginas.length) return null;
  const usuario =
    corpo.usuario && typeof corpo.usuario === 'object'
      ? { tipo: texto(corpo.usuario.tipo, 20), nome: texto(corpo.usuario.nome, 100) }
      : null;
  return {
    sid: corpo.sid,
    inicio: Number(corpo.inicio) || paginas[0].t,
    fim: Number(corpo.fim) || Date.now(),
    ref: texto(corpo.ref, 300),
    paginas,
    idioma: texto(corpo.idioma, 20),
    tela: texto(corpo.tela, 20),
    fuso: texto(corpo.fuso, 60),
    usuario,
  };
}

function ipDoVisitante(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  return (xff ? xff.split(',')[0] : req.headers.get('x-real-ip') || '').trim();
}

// Mostra so o comeco do IP no e-mail: basta pra ver se e a mesma rede,
// sem guardar/expor o endereco completo do visitante.
function mascararIp(ip: string): string {
  if (!ip) return 'desconhecido';
  if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.') + '.x';
  return ip.split(':').slice(0, 3).join(':') + ':…';
}

function localizacao(ip: string): string {
  try {
    // require tardio: a base (~100 MB) so e carregada no primeiro uso
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const geoip = require('geoip-lite');
    const g = ip ? geoip.lookup(ip) : null;
    if (!g) return 'desconhecida';
    const pais = new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(g.country) || g.country;
    return g.city ? `${g.city}, ${pais}` : pais;
  } catch {
    return 'desconhecida';
  }
}

function origem(ref: string, primeiraPagina: string): string {
  const utm = new URLSearchParams(primeiraPagina.split('?')[1] || '').get('utm_source');
  let host = '';
  try {
    host = ref ? new URL(ref).hostname.replace(/^www\./, '') : '';
  } catch {}
  if (host === 'bipfix.com') host = '';

  let base = 'Direto (digitou o endereço, link salvo ou QR code)';
  if (/google\./.test(host)) base = 'Busca no Google';
  else if (/bing\.|duckduckgo|yahoo|yandex/.test(host)) base = `Busca (${host})`;
  else if (/instagram/.test(host)) base = 'Instagram';
  else if (/facebook|fb\.com/.test(host)) base = 'Facebook';
  else if (/chatgpt|openai|perplexity|claude\.ai|gemini/.test(host)) base = `Assistente de IA (${host})`;
  else if (host) base = `Link em ${host}`;

  return utm ? `${base} — campanha: ${utm}` : base;
}

function dispositivo(ua: string): string {
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'outro sistema';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'outro navegador';
  const tipo = /Mobi|iPhone|Android(?!.*Tablet)/.test(ua) ? 'celular' : /iPad|Tablet/.test(ua) ? 'tablet' : 'computador';
  return `${tipo} · ${so} · ${nav}`;
}

function duracao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function montarEmail(p: Pendente) {
  const v = p.visita;
  const quando = new Date(v.inicio).toLocaleString('pt-BR', { timeZone: 'Europe/Tallinn', dateStyle: 'short', timeStyle: 'short' });
  const local = localizacao(p.ip);
  const de = origem(v.ref, v.paginas[0].p);

  const linhas = v.paginas
    .map((pg, i) => {
      const prox = v.paginas[i + 1]?.t ?? v.fim;
      return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace">${escapeHtml(pg.p)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap;color:#555">${duracao(prox - pg.t)}</td></tr>`;
    })
    .join('');

  const quem = v.usuario
    ? `Usuário logado: <b>${escapeHtml(v.usuario.nome)}</b> (${escapeHtml(v.usuario.tipo)})`
    : 'Visitante não logado';

  const assunto = `Visita no BipFix: ${local} · ${v.paginas.length} página${v.paginas.length > 1 ? 's' : ''} · ${duracao(v.fim - v.inicio)}`;

  const item = (rotulo: string, valor: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap">${rotulo}</td><td style="padding:4px 0">${valor}</td></tr>`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
    <div style="background:#1e40af;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0">
      <div style="font-size:18px;font-weight:bold">Nova visita no bipfix.com</div>
      <div style="opacity:.85;margin-top:4px">${escapeHtml(quando)} (horário de Tallinn)</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:18px 22px;border-radius:0 0 10px 10px">
      <table style="font-size:14px;border-collapse:collapse">
        ${item('Quem', quem)}
        ${item('De onde veio', escapeHtml(de))}
        ${item('Localização', `${escapeHtml(local)} <span style="color:#999">(IP ${escapeHtml(mascararIp(p.ip))})</span>`)}
        ${item('Dispositivo', escapeHtml(dispositivo(p.ua)))}
        ${item('Idioma / fuso', `${escapeHtml(v.idioma)} · ${escapeHtml(v.fuso)}`)}
        ${item('Tela', escapeHtml(v.tela))}
        ${item('Duração total', duracao(v.fim - v.inicio))}
      </table>
      <div style="margin-top:18px;font-weight:bold">Páginas visitadas (em ordem)</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:6px">${linhas}</table>
      ${v.ref ? `<p style="font-size:12px;color:#888;margin-top:14px">Referência completa: ${escapeHtml(v.ref)}</p>` : ''}
      ${descartadasPorLimite ? `<p style="font-size:12px;color:#b45309">${descartadasPorLimite} visita(s) anterior(es) não geraram e-mail por causa do limite de ${MAX_EMAILS_HORA} por hora.</p>` : ''}
      ${CLARITY_ID ? `<p style="font-size:13px;margin-top:16px">Gravação da sessão (cliques e rolagem), se o visitante aceitou cookies: <a href="https://clarity.microsoft.com/projects/view/${CLARITY_ID}/impressions">Microsoft Clarity</a></p>` : ''}
    </div>
  </div>`;

  return { assunto, html };
}

async function enviar(sid: string) {
  const p = pendentes.get(sid);
  pendentes.delete(sid);
  if (!p) return;

  const agora = Date.now();
  while (envios.length && envios[0] < agora - 3600_000) envios.shift();
  if (envios.length >= MAX_EMAILS_HORA) {
    descartadasPorLimite++;
    return;
  }

  const { assunto, html } = montarEmail(p);
  if (!resend || !DESTINO) {
    // Modo de teste (ex.: ambiente local): nada e enviado; o e-mail que
    // seria mandado fica em <tmp>/bipfix-ultima-visita.html pra conferir.
    const arquivo = require('path').join(require('os').tmpdir(), 'bipfix-ultima-visita.html');
    require('fs').writeFileSync(arquivo, `<!-- ${assunto} -->\n${html}`);
    console.log(`[visita] (sem envio: RESEND_API_KEY/VISITAS_EMAIL_PARA ausente) ${assunto} -> ${arquivo}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM_EMAIL, to: DESTINO, subject: assunto, html });
    envios.push(agora);
    descartadasPorLimite = 0;
  } catch (e) {
    console.error('[visita] falha ao enviar e-mail', e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') || '';
    if (!ua || ROBO.test(ua)) return new NextResponse(null, { status: 204 });

    const bruto = await req.text();
    if (bruto.length > 30_000) return new NextResponse(null, { status: 413 });
    const visita = validar(JSON.parse(bruto));
    if (!visita) return new NextResponse(null, { status: 400 });

    const existente = pendentes.get(visita.sid);
    if (existente) clearTimeout(existente.timer);
    else if (pendentes.size >= MAX_PENDENTES) return new NextResponse(null, { status: 429 });

    pendentes.set(visita.sid, {
      visita,
      ip: ipDoVisitante(req),
      ua: ua.slice(0, 400),
      timer: setTimeout(() => void enviar(visita.sid), ESPERA_MS),
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
