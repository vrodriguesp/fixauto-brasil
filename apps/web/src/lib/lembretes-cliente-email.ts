import { escapeHtml, fmt, resolveEmailLocale } from './email-i18n';
import { fusoDoPais, horaLocalEmUtc } from './fuso';
import { dataHora, dataJanela } from './notif-agenda';
import { janelaDoSlot, slotAindaVale } from './turnos';
import { prazoDoOrcamento, type SlotLembrete, type TipoLembrete } from './lembretes-cliente-regras';
import { TEXTOS_LEMBRETE } from './lembretes-cliente-textos';

// Corpo dos e-mails de lembrete ao motorista (115). Puro (sem banco): o cron (lib/lembrar-clientes.ts) e o
// script que desenha os e-mails nos 6 idiomas (scripts/teste-lembretes-clientes.ts) usam o mesmo codigo.
// O topo azul "BipFix" vira o topo com o logo em lib/email-marca.ts (aplicado no envio).

export type OrcEmail = { id: string; oficina: string; valor: string; validade: string | null; pais: string | null; slots: SlotLembrete[]; status?: string; created_at?: string };
export type CheckinEmail = { oficina: string; inicio: string; fim: string | null; pais: string | null; endereco: string | null };

const LOC: Record<string, string> = { et: 'et-EE', ru: 'ru-RU', en: 'en-GB', it: 'it-IT', 'pt-PT': 'pt-PT', pt: 'pt-BR' };

/** "25 de novembro de 2026" no idioma de quem le (validade e uma data, sem hora) */
export function dataLonga(ymd: string, idioma: string): string {
  return new Intl.DateTimeFormat(LOC[resolveEmailLocale(idioma)] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(ymd).slice(0, 10)}T12:00:00Z`));
}

const inicioDoSlot = (s: SlotLembrete, pais: string | null) => horaLocalEmUtc(s.data_checkin, janelaDoSlot(s).inicio, pais);
const fimDoSlot = (s: SlotLembrete, pais: string | null) => horaLocalEmUtc(s.data_checkin, janelaDoSlot(s).fim, pais);

/** 1.o horario ainda escolhivel ("ter., 25 de novembro, 09:00–11:00") ou null */
export function primeiroHorarioTexto(o: OrcEmail, idioma: string, agora: number): string | null {
  const futuros = o.slots.filter((s) => slotAindaVale(s, new Date(agora), o.pais)).sort((a, b) => Date.parse(inicioDoSlot(a, o.pais)) - Date.parse(inicioDoSlot(b, o.pais)));
  if (!futuros.length) return null;
  return dataJanela(inicioDoSlot(futuros[0], o.pais), fimDoSlot(futuros[0], o.pais), idioma, fusoDoPais(o.pais));
}

/** "ate quando aceitar": a data da validade ou o dia + hora do fim do ultimo horario */
export function prazoTexto(o: OrcEmail, idioma: string): string | null {
  const p = prazoDoOrcamento({ ...o, status: o.status || 'enviado', created_at: o.created_at || '' });
  if (!p) return null;
  if (p.pela === 'validade' && o.validade) return dataLonga(o.validade, idioma);
  return dataHora(new Date(p.em), idioma, fusoDoPais(o.pais));
}

const caixa = (linhas: string[], extra = '') => `
        <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:12px 0;"${extra}>${linhas.join('')}</div>`;
const linha = (texto: string, estilo = 'margin:4px 0 0;color:#374151;') => `<p style="${estilo}">${texto}</p>`;

export function montarEmailLembrete(p: {
  tipo: TipoLembrete; idioma: string | null | undefined; nome: string | null; numero: string | number;
  orcamentos: OrcEmail[]; checkin?: CheckinEmail | null; agora: number; link: string;
  /** link "parar lembretes"; sem ele (vespera do check-in, que a pausa nao cala) o rodape nao o mostra */
  linkPausa?: string | null;
}): { assunto: string; html: string } {
  const l = resolveEmailLocale(p.idioma);
  const t = TEXTOS_LEMBRETE[l];
  const numero = String(p.numero ?? '');
  const um = p.orcamentos.length <= 1;
  const v = { numero };
  let assunto = ''; let intro = ''; let depois = ''; let botao = um ? t.botao1 : t.botaoN;
  const caixas: string[] = [];
  const nomeOf = (o: { oficina: string }) => linha(`<strong>${escapeHtml(o.oficina)}</strong>`, 'margin:0;color:#111827;');
  const valor = (o: OrcEmail) => linha(escapeHtml(o.valor), 'margin:4px 0 0;font-size:20px;font-weight:bold;color:#111827;');

  if (p.tipo === 'nao_decidiu') {
    assunto = fmt(um ? t.naoDecidiuAssunto1 : t.naoDecidiuAssuntoN, v);
    intro = fmt(um ? t.naoDecidiuIntro1 : t.naoDecidiuIntroN, v);
    depois = t.acoes;
    for (const o of p.orcamentos) {
      const h = primeiroHorarioTexto(o, l, p.agora);
      caixas.push(caixa([nomeOf(o), valor(o), linha(h ? escapeHtml(fmt(t.primeiroHorario, { quando: h })) : escapeHtml(t.semHorario)),
        o.validade ? linha(escapeHtml(fmt(t.validoAte, { data: dataLonga(o.validade, l) })), 'margin:4px 0 0;color:#6b7280;') : ''], ' data-orcamento="1"'));
    }
  } else if (p.tipo === 'vencem') {
    assunto = fmt(t.vencemAssunto, v);
    intro = fmt(t.vencemIntro, v);
    depois = t.acoes;
    const ordem = [...p.orcamentos].sort((a, b) => (prazoDoOrcamento({ ...a, status: 'enviado', created_at: '' })?.em ?? Infinity) - (prazoDoOrcamento({ ...b, status: 'enviado', created_at: '' })?.em ?? Infinity));
    for (const o of ordem) {
      const ate = prazoTexto(o, l);
      const h = primeiroHorarioTexto(o, l, p.agora);
      caixas.push(caixa([nomeOf(o), valor(o),
        ate ? linha(`<strong>${escapeHtml(fmt(t.aceitarAte, { quando: ate }))}</strong>`, 'margin:6px 0 0;color:#b91c1c;') : '',
        h ? linha(escapeHtml(fmt(t.primeiroHorario, { quando: h })), 'margin:4px 0 0;color:#6b7280;') : ''], ' data-orcamento="1"'));
    }
  } else if (p.tipo === 'venceram') {
    assunto = fmt(um ? t.venceramAssunto1 : t.venceramAssuntoN, v);
    intro = fmt(um ? t.venceramIntro1 : t.venceramIntroN, v);
    depois = t.venceramDepois;
    botao = t.botaoPedido;
    for (const o of p.orcamentos) caixas.push(caixa([nomeOf(o), valor(o)], ' data-orcamento="1"'));
  } else {
    const c = p.checkin as CheckinEmail;
    assunto = fmt(t.checkinAssunto, { oficina: c.oficina });
    intro = t.checkinIntro;
    depois = t.checkinDepois;
    botao = t.botaoPedido;
    caixas.push(caixa([nomeOf(c),
      linha(`<strong>${escapeHtml(fmt(t.quando, { quando: dataJanela(c.inicio, c.fim, l, fusoDoPais(c.pais)) }))}</strong>`, 'margin:6px 0 0;color:#111827;'),
      c.endereco ? linha(escapeHtml(fmt(t.endereco, { endereco: c.endereco })), 'margin:4px 0 0;color:#374151;') : ''], ' data-checkin="1"'));
  }

  const ola = p.nome ? fmt(t.ola, { nome: escapeHtml(p.nome) }) : t.olaSemNome;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;" data-lembrete="${p.tipo}">
      <div style="background:#1e40af;color:white;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">BipFix</h1></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 12px;">${ola}</p>
        <p style="margin:0 0 4px;">${escapeHtml(intro)}</p>
        ${caixas.join('')}
        ${depois ? `<p style="margin:12px 0 0;color:#374151;">${escapeHtml(depois)}</p>` : ''}
        <p style="margin:20px 0 0;"><a href="${p.link}" data-botao="pedido" style="display:inline-block;background:#1e40af;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">${escapeHtml(botao)}</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
        <p style="margin:0;font-size:12px;color:#6b7280;">${escapeHtml(fmt(t.rodape, v))}</p>
        ${p.linkPausa ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(t.pausa)} <a href="${p.linkPausa}" data-link="pausar" style="color:#4b5563;">${escapeHtml(t.pausaLink)}</a></p>` : ''}
      </div>
    </div>`;
  return { assunto, html };
}

/** texto do unico SMS de lembrete (no "vencem") */
export function textoSmsLembrete(idioma: string | null | undefined, numero: string | number, link: string): string {
  return fmt(TEXTOS_LEMBRETE[resolveEmailLocale(idioma)].smsVencem, { numero: String(numero), link });
}
