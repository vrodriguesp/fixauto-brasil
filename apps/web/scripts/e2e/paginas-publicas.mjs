// Paginas publicas das oficinas (perfil /oficinas/<id> e lista /oficinas) - auditoria Fable 18/11
// (Documentos/Analises/Paginas_publicas_oficinas_2026-11-18). Semeia oficinas parecidas com as 7 reais
// e confere, nos 6 idiomas e em 360/390/412 (+1280): logo de verdade, regiao e endereco na lingua da
// pagina, descricao traduzida com "ver original", horario em tabela (7 dias, alinhados, hoje marcado),
// CTA visivel e com destino 200, selos so com historico (>= 3 avaliacoes/servicos), selo "responde em
// 1 dia" so com mediana < 24 h, JSON-LD valido (sem aggregateRating sem historico), sem transbordo,
// sem erro no console, sem 4xx/5xx do proprio site.
//   node paginas-publicas.mjs <.env.local> [SITE]      (SITE padrao http://localhost:3107)
// Traducao: a rota usa TRADUCAO_FAKE=1 do .env.local do site de teste ("[ru] texto"), sem chamadas reais.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.argv[3] || 'http://localhost:3107';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const MSG = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')), '../../messages');
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const T = Object.fromEntries(['pt', 'pt-PT', 'en', 'et', 'it', 'ru'].map((l) => [l, msgs(l)]));
const tp = (l, k) => T[l].oficinaPerfilPublico[k];

let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const oficinas = [];
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };
const SEG = { pt: 'oficinas', 'pt-PT': 'oficinas', en: 'repair-shops', et: 'tookojad', it: 'officine', ru: 'avtoservisy' };
const REGIAO = { et: 'Harju maakond', en: 'Harju County', ru: 'Harjumaa', pt: 'Harjumaa', 'pt-PT': 'Harjumaa', it: 'Harjumaa' };
const h = (n) => new Date(Date.now() - n * 3600e3).toISOString();

const conta = async (tipo, nome, idioma = 'et') => {
  const email = `pub-${tipo}${contas.length}-${tag}@example.test`; const senha = `Pb${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  const { error: eP } = await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: tipo === 'oficina' ? '54572188' : '+372 5000 0000' });
  if (eP) throw new Error(eP.message);
  return { id: data.user.id, email, senha };
};
const HORARIO = { seg: { aberto: true, inicio: '08:30', fim: '17:00' }, ter: { aberto: true, inicio: '08:30', fim: '17:00' }, qua: { aberto: true, inicio: '08:30', fim: '17:00' }, qui: { aberto: true, inicio: '08:30', fim: '17:00' }, sex: { aberto: true, inicio: '08:30', fim: '17:00' }, sab: { aberto: false, inicio: '08:00', fim: '12:00' }, dom: { aberto: false, inicio: '', fim: '' } };
const oficina = async (nome, extra = {}) => {
  const dono = await conta('oficina', `Dono ${nome}`);
  const { data, error } = await sb.from('oficinas').insert({
    profile_id: dono.id, nome_fantasia: `${nome} ${tag}`, endereco: 'Akadeemia tee, 45', numero: '45', complemento: 'AKADEEMIA KESKUS', cidade: 'Tallinn', estado: 'Harju County', cep: '13520', pais: 'EE',
    latitude: 59.4059528, longitude: 24.6512987, ativa: true, raio_atendimento_km: 30, especialidades: ['outro', 'funilaria'], seguradoras_convencionadas: ['If', 'ERGO'],
    horario_funcionamento: HORARIO, descricao: 'Autoklaaside müük ja vahetus ning täkete peatamine.', logo_url: `${SITE}/logo-80.webp`, created_at: h(24 * 10), ...extra,
  }).select('id').single();
  if (error) throw new Error(`oficina ${nome}: ${error.message}`);
  oficinas.push(data.id);
  return { id: data.id, dono, nome: `${nome} ${tag}` };
};

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
async function abrir(url, largura, altura = 844) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, isMobile: largura < 700, hasTouch: largura < 700 });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const page = await ctx.newPage();
  const erros = []; const ruins = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|google|clarity|gtm|maps/i.test(m.text())) erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(SITE)) ruins.push(`${r.status()} ${r.url()}`); });
  const resp = await page.goto(url, { waitUntil: 'networkidle' }).catch(() => null);
  await page.waitForTimeout(600);
  return { ctx, page, status: resp ? resp.status() : 0, erros, ruins };
}
const info = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } });
  const vis = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, w: r.width, visivel: r.width > 0 && r.height > 0 }; };
  const linhas = [...document.querySelectorAll('[data-testid^="horario-"]')].map((tr) => { const th = tr.querySelector('th').getBoundingClientRect(); const td = tr.querySelector('td').getBoundingClientRect(); return { top: Math.round(th.top), tdTop: Math.round(td.top), thH: Math.round(th.height), hoje: tr.dataset.hoje === '1', texto: tr.innerText.replace(/\s+/g, ' ').trim() }; });
  return {
    title: document.title, desc: q('meta[name="description"]')?.content || '', canonical: q('link[rel="canonical"]')?.href || '', hreflang: document.querySelectorAll('link[rel="alternate"][hreflang]').length,
    og: q('meta[property="og:image"]')?.content || '', robots: q('meta[name="robots"]')?.content || '',
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    texto: document.body.innerText, jsonld,
    logo: (() => { const i = q('[data-testid="oficina-logo"]'); return i ? { w: i.naturalWidth, ok: i.complete && i.naturalWidth > 0 } : null; })(),
    inicial: !!q('[data-testid="oficina-inicial"]'),
    linhas, horario: vis('[data-testid="oficina-horario"]'), ctaFixo: vis('[data-testid="cta-fixo"]'), cta: vis('[data-testid="cta-pedir-orcamento"]'),
    ctaHref: q('[data-testid="cta-pedir-orcamento"]')?.href || '', telHref: q('[data-testid="oficina-telefone"]')?.getAttribute('href') || '', telTexto: q('[data-testid="oficina-telefone"]')?.innerText || '',
    selos: q('[data-testid="oficina-selos"]')?.innerText || '', nota: !!q('[data-testid="oficina-nota"]'), rapido: !!q('[data-testid="selo-responde-rapido"]'),
    avaliacoes: !!q('[data-testid="oficina-avaliacoes"]'), emBreve: !!q('[data-testid="oficina-avaliacoes-em-breve"]'),
    descricao: q('[data-testid="oficina-descricao"]')?.innerText || '', aviso: q('[data-testid="oficina-descricao-aviso"]')?.innerText || '', toggle: !!q('[data-testid="oficina-descricao-toggle"]'),
    mapa: q('[data-testid="oficina-endereco"] iframe')?.src || '', mapsLink: q('[data-testid="link-google-maps"]')?.href || '',
    endereco: q('[data-testid="oficina-endereco"]')?.innerText || '',
  };
});

try {
  const cli = await conta('cliente', 'Klient Pub', 'et');
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: `Pub${tag}`, fipe_ano: '2016', placa: `P${tag.slice(0, 5)}`.toUpperCase() }).select('id').single();
  const pedido = async (criadoHaH) => {
    const { data, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'funilaria', descricao: `pub ${tag}`, urgencia: 'media', status: 'aberta', latitude: 59.437, longitude: 24.75, endereco: 'Kesklinn', pais: 'EE', created_at: h(criadoHaH) }).select('id').single();
    if (error) throw new Error(`pedido: ${error.message}`); return data.id;
  };
  const orcamento = async (of, sol, criadoHaH, extra = {}) => {
    const { error } = await sb.from('orcamentos').insert({ solicitacao_id: sol, oficina_id: of.id, valor_total: 100, prazo_dias: 1, status: 'enviado', validade: new Date(Date.now() + 10 * 86400e3).toISOString(), created_at: h(criadoHaH), ...extra });
    if (error) throw new Error(`orcamento: ${error.message}`);
  };
  const avaliar = async (of, sol, nota) => { const { error } = await sb.from('avaliacoes').insert({ solicitacao_id: sol, oficina_id: of.id, cliente_id: cli.id, nota, comentario: `Hea töö ${tag}` }); if (error) throw new Error(`avaliacao: ${error.message}`); };

  // A: nova, parecida com a Nordic Autoglass (0 avaliacoes, 0 orcamentos, logo, kindlustus)
  const A = await oficina('Klaasid');
  // B: com historico (3 avaliacoes 5*) e resposta rapida (mediana 5 h; uma revisao fora da conta)
  const B = await oficina('Ajalugu', { especialidades: ['revisao', 'mecanica'], logo_url: null });
  const sB = [await pedido(100), await pedido(90), await pedido(80)];
  await orcamento(B, sB[0], 95); await orcamento(B, sB[1], 86); await orcamento(B, sB[2], 74); // 5h, 4h, 6h
  { const { error } = await sb.from('orcamentos').update({ revisao_numero: 1, valor_original: 100, valor_total: 150 }).eq('oficina_id', B.id).eq('solicitacao_id', sB[0]); if (error) throw new Error(`revisao: ${error.message}`); } // revisao na mesma linha: o tempo continua o da 1a versao
  for (const s of sB) await avaliar(B, s, 5);
  // C: 2 avaliacoes (ainda sem historico) e resposta lenta (mediana 30 h)
  const C = await oficina('Kaks', { especialidades: ['funilaria', 'colisao'], logo_url: null });
  const sC = [await pedido(100), await pedido(90), await pedido(80)];
  await orcamento(C, sC[0], 70); await orcamento(C, sC[1], 62); await orcamento(C, sC[2], 40); // 30h, 28h, 40h
  await avaliar(C, sC[0], 4); await avaliar(C, sC[1], 5);

  // traducao guardada (tarefa de preenchimento, provedor falso): dry-run lista, depois grava
  const tarefa = async (corpo) => (await fetch(`${SITE}/api/tarefas/traduzir-descricoes`, { method: 'POST', headers: { 'x-tarefa-chave': env.TAREFAS_CHAVE, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })).json();
  const dry = await tarefa({ dry_run: true });
  ok('tarefa traduzir-descricoes dry-run lista as oficinas sem traducao', dry.ok && dry.dry_run && dry.processadas.some((p) => p.id === A.id), JSON.stringify(dry).slice(0, 200));
  const real = await tarefa({ limite: 50 });
  ok('tarefa traduzir-descricoes grava (provedor falso)', real.ok && real.processadas.some((p) => p.id === A.id && p.linguas.includes('ru')), JSON.stringify(real).slice(0, 200));
  const { data: gravado } = await sb.from('oficinas').select('descricao_traducoes').eq('id', A.id).single();
  ok('descricao_traducoes guardada com origem et, hash e 5 linguas', gravado?.descricao_traducoes?.origem === 'et' && gravado.descricao_traducoes.hash && ['ru', 'en', 'pt', 'pt-PT', 'it'].every((l) => gravado.descricao_traducoes[l]), JSON.stringify(gravado));
  const semTexto = await tarefa({ dry_run: true });
  ok('segunda chamada: nada pendente (hash igual)', semTexto.ok && !semTexto.processadas.some((p) => p.id === A.id), JSON.stringify(semTexto).slice(0, 200));
  const outra = await fetch(`${SITE}/api/tarefas/traduzir-descricoes`, { method: 'POST', headers: { 'x-tarefa-chave': 'errada' } });
  ok('tarefa sem a chave: 403', outra.status === 403, outra.status);
  const semLogin = await fetch(`${SITE}/api/oficina/traduzir-descricao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oficina_id: A.id }) });
  ok('rota do perfil sem login: 401', semLogin.status === 401, semLogin.status);

  // ---------- perfil A em 6 idiomas x 360/390/412 + 1280
  const hojeIdx = (new Date().getDay() + 6) % 7;
  for (const l of ['et', 'ru', 'en', 'pt', 'pt-PT', 'it']) {
    for (const w of [360, 390, 412, 1280]) {
      const r = await abrir(`${SITE}${PREFIXO[l]}/${SEG[l]}/${A.id}`, w, w > 700 ? 800 : 844);
      const i = await info(r.page);
      const n = `A ${l} ${w}`;
      ok(`${n}: 200, sem erro de console, sem 4xx/5xx do site`, r.status === 200 && !r.erros.length && !r.ruins.length, `${r.status} ${r.erros.join(' | ')} ${r.ruins.join(' | ')}`);
      ok(`${n}: sem transbordo horizontal`, i.scrollW <= i.clientW, `${i.scrollW}/${i.clientW}`);
      ok(`${n}: logo carregado (nao a inicial)`, i.logo?.ok && !i.inicial, JSON.stringify(i.logo));
      ok(`${n}: regiao na lingua da pagina "${REGIAO[l]}" (nem "Harju County" cru fora do en)`, i.texto.includes(`Tallinn, ${REGIAO[l]}`) && (l === 'en' || !i.texto.includes('Harju County')), i.texto.slice(0, 400));
      ok(`${n}: endereco "Akadeemia tee 45" sem virgula e complemento 1x`, i.endereco.includes('Akadeemia tee 45') && !i.endereco.includes('tee, 45') && (i.endereco.match(/AKADEEMIA KESKUS/g) || []).length === 1, i.endereco);
      ok(`${n}: telefone com +372 e tel: sem espacos`, i.telTexto === '+372 5457 2188' && i.telHref === 'tel:+37254572188', `${i.telTexto} ${i.telHref}`);
      ok(`${n}: horario com 7 dias, alinhados, 1 linha por dia, hoje marcado, sab/dom fechados`,
        i.linhas.length === 7 && i.linhas.every((x) => x.top === x.tdTop && x.thH < 40) && i.linhas.filter((x) => x.hoje).length === 1 && i.linhas[hojeIdx].hoje
          && i.linhas[5].texto.includes(tp(l, 'hoursClosed')) && i.linhas[6].texto.includes(tp(l, 'hoursClosed')) && i.linhas[0].texto.includes('08:30–17:00'),
        JSON.stringify(i.linhas));
      ok(`${n}: bloco do horario com altura razoavel (< 260 px)`, i.horario && i.horario.h < 260, i.horario?.h);
      if (w < 700) {
        // dono 19/11: ao parar a rolagem com a tabela do horario na altura do botao redondo do chat, o botao
        // cobria a ponta de uma linha. Rola ate a tabela (o botao so aparece depois de 300 px) e confere que
        // o botao nao cruza nenhuma linha nem a barra fixa do CTA, e que nenhuma linha quebrou.
        await r.page.evaluate(() => window.scrollBy(0, 400));
        await r.page.waitForSelector('[data-testid="chat-suporte-botao"]', { timeout: 5000 }).catch(() => null);
        // leva o meio da tabela ate o meio do botao
        await r.page.evaluate(() => { const b = document.querySelector('[data-testid="chat-suporte-botao"]')?.getBoundingClientRect(); const t = document.querySelector('[data-testid="oficina-horario"]').getBoundingClientRect(); if (b) window.scrollBy(0, (t.top + t.height / 2) - (b.top + b.height / 2)); });
        await r.page.waitForTimeout(300);
        const c = await r.page.evaluate(() => {
          const b = document.querySelector('[data-testid="chat-suporte-botao"]')?.getBoundingClientRect();
          const cruza = (a) => b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          const linhas = [...document.querySelectorAll('[data-testid^="horario-"]')].map((tr) => tr.getBoundingClientRect());
          const cta = document.querySelector('[data-testid="cta-fixo"]')?.getBoundingClientRect();
          return { botao: b ? { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) } : null, ctaTop: cta ? Math.round(cta.top) : null, linhasNaTela: linhas.filter((x) => b && x.top < b.bottom && x.bottom > b.top).length, cruzaLinha: linhas.some(cruza), cruzaCta: !!(cta && cruza(cta)), tabelaDireita: Math.round(document.querySelector('[data-testid="oficina-horario"]').getBoundingClientRect().right), alturas: linhas.map((x) => Math.round(x.height)) };
        });
        ok(`${n}: botao do chat na altura da tabela do horario NAO cobre nenhuma linha (${c.linhasNaTela} na mesma altura) nem a barra do CTA, e nenhuma linha quebrou`,
          c.botao && c.linhasNaTela >= 1 && !c.cruzaLinha && !c.cruzaCta && c.tabelaDireita <= c.botao.l && c.botao.b <= c.ctaTop && c.alturas.every((h) => h < 40), JSON.stringify(c));
        if (l === 'et' && w === 390) {
          // 1a visita (aviso de cookies sem resposta): o aviso fica acima da barra do CTA e o botao do chat acima do aviso
          const ctx2 = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
          const p2 = await ctx2.newPage();
          await p2.goto(r.page.url(), { waitUntil: 'networkidle' }).catch(() => null);
          await p2.evaluate(() => window.scrollBy(0, 400)); await p2.waitForTimeout(600);
          const k = await p2.evaluate(() => { const g = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { t: Math.round(q.top), b: Math.round(q.bottom), h: Math.round(q.height) }; }; return { aviso: g('.aviso-cookies'), cta: g('[data-testid="cta-fixo"]'), botao: g('[data-testid="chat-suporte-botao"]') }; });
          ok(`${n}: com o aviso de cookies aberto, o aviso termina acima da barra do CTA e o botao do chat fica acima do aviso`,
            k.aviso && k.cta && k.aviso.b <= k.cta.t + 1 && (!k.botao || k.botao.b <= k.aviso.t + 1), JSON.stringify(k));
          await ctx2.close();
        }
      }
      ok(`${n}: nomes dos dias inteiros (pt: Segunda-feira / ru: понедельник / et: esmaspäev)`, /segunda|monday|esmaspäev|понедельник|lunedì/i.test(i.linhas[0].texto), i.linhas[0].texto);
      ok(`${n}: CTA "${tp(l, 'ctaPedirOrcamento')}" visivel no topo e, no celular, barra fixa visivel`, i.cta?.visivel && i.texto.includes(tp(l, 'ctaPedirOrcamento')) && (w > 700 ? !i.ctaFixo?.visivel : i.ctaFixo?.visivel && i.ctaFixo.bottom <= 844 + 1), JSON.stringify({ cta: i.cta, fixo: i.ctaFixo }));
      if (w === 360) {
        const alvo = await fetch(i.ctaHref); ok(`${n}: destino do CTA responde 200 e e o formulario de pedido`, alvo.status === 200 && /paring|zayavka|request|pedido|richiesta/.test(i.ctaHref), `${alvo.status} ${i.ctaHref}`);
        ok(`${n}: title pelo tipo (carroceria) e description com a descricao do dono`, i.title.includes(A.nome) && i.title.includes(tp(l, 'metaTitleCarroceria').split('{cidade}')[0].split('– ').pop().split('— ').pop().trim().slice(0, 8)) && i.desc.includes(A.nome), `${i.title} | ${i.desc}`);
        ok(`${n}: canonical proprio, hreflang >= 4, sem noindex, og:image = logo`, i.canonical.endsWith(`/${SEG[l]}/${A.id}`) && i.hreflang >= 4 && !/noindex/.test(i.robots) && i.og.includes('logo-80'), `${i.canonical} ${i.hreflang} ${i.robots} ${i.og}`);
        const ar = i.jsonld.find((x) => x && Array.isArray(x['@type']) && x['@type'].includes('AutoRepair'));
        ok(`${n}: JSON-LD AutoRepair com endereco formatado, regiao local, geo, 5 dias, telefone, descricao, logo e SEM aggregateRating`,
          ar && ar.address.streetAddress === 'Akadeemia tee 45' && ar.address.addressRegion === REGIAO[l] && ar.geo && ar.openingHoursSpecification.length === 5 && ar.telephone === '+37254572188' && ar.description && ar.image && !i.jsonld.some((x) => x && x.aggregateRating), JSON.stringify(ar).slice(0, 300));
      }
      // selos: nada (0 avaliacoes, 0 servicos, 0 orcamentos)
      ok(`${n}: sem selos, sem nota, sem "Uus BipFixis", sem "(0)" - so o aviso neutro`, !i.selos && !i.nota && !i.rapido && !i.avaliacoes && i.emBreve && !i.texto.includes(tp(l, 'novaNoBipfix')) && !i.texto.includes('(0)') && !i.texto.includes(tp(l, 'noPriceAdjustment')) && !i.texto.includes(tp(l, 'partnerSinceBadge').split('{')[0].trim()), `${i.selos} | ${i.texto.slice(0, 300)}`);
      // descricao: original em et; traduzida ("[xx] ...") nas outras, com ver original
      if (l === 'et') ok(`${n}: descricao original sem aviso de traducao`, i.descricao.startsWith('Autoklaaside') && !i.toggle, i.descricao);
      else {
        ok(`${n}: descricao traduzida "[${l}] ..." + "${tp(l, 'traduzidoAutomaticamente')}" + ${tp(l, 'verOriginal')}`, i.descricao.startsWith(`[${l}] Autoklaaside`) && i.aviso.includes(tp(l, 'traduzidoAutomaticamente')) && i.aviso.includes(tp(l, 'verOriginal')), `${i.descricao} | ${i.aviso}`);
        if (w === 390) {
          await r.page.click('[data-testid="oficina-descricao-toggle"]'); await r.page.waitForTimeout(200);
          const d2 = await r.page.innerText('[data-testid="oficina-descricao"]'); const a2 = await r.page.innerText('[data-testid="oficina-descricao-aviso"]');
          ok(`${n}: "ver original" mostra o estoniano e oferece "${tp(l, 'verTraducao')}"`, d2.startsWith('Autoklaaside') && a2.includes(tp(l, 'verTraducao')), `${d2} | ${a2}`);
        }
      }
      if (l === 'et' && w === 390) await r.page.screenshot({ path: path.join(path.dirname(process.argv[2]), '..', '..', 'resultados', `paginas-publicas-A-${l}-${w}.png`), fullPage: true }).catch(() => {});
      await r.ctx.close();
    }
  }

  // ---------- B: historico + resposta rapida
  for (const [l, w] of [['et', 390], ['ru', 360], ['en', 1280]]) {
    const r = await abrir(`${SITE}${PREFIXO[l]}/${SEG[l]}/${B.id}`, w, w > 700 ? 800 : 844);
    const i = await info(r.page);
    const n = `B ${l} ${w}`;
    ok(`${n}: 200 sem erros`, r.status === 200 && !r.erros.length && !r.ruins.length, `${r.status} ${r.erros.join(' | ')} ${r.ruins.join(' | ')}`);
    ok(`${n}: nota 5.0 com 3 avaliacoes e bloco de avaliacoes`, i.nota && i.avaliacoes && !i.emBreve && i.texto.includes('5.0') && i.texto.includes(tp(l, 'reviewCountPlural').replace('{count}', '3')), i.texto.slice(0, 400));
    ok(`${n}: selo "${tp(l, 'respondeRapido')}" (mediana 5 h) + qualidade`, i.rapido && i.selos.includes(tp(l, 'respondeRapido')) && i.selos.includes(tp(l, 'qualityBadge')), i.selos);
    ok(`${n}: sem "+0%" / "sem ajuste" (revisao +50% so com historico: aparece +50)`, !i.selos.includes('+0') && !i.texto.includes(tp(l, 'noPriceAdjustment')) && i.selos.includes('+50'), i.selos);
    ok(`${n}: sem logo -> inicial`, i.inicial && !i.logo, JSON.stringify(i.logo));
    ok(`${n}: title de oficina de remont (nao carroceria)`, i.title.includes(tp(l, 'metaTitleTemplate').split('{cidade}')[0].split('– ').pop().split('— ').pop().trim().slice(0, 6)), i.title);
    ok(`${n}: JSON-LD com aggregateRating 5.0 x3`, i.jsonld.some((x) => x && x.aggregateRating && x.aggregateRating.ratingValue === '5.0' && x.aggregateRating.ratingCount === 3), JSON.stringify(i.jsonld.map((x) => x?.aggregateRating)));
    await r.ctx.close();
  }
  // ---------- C: 2 avaliacoes + lento: nada
  for (const [l, w] of [['et', 390], ['pt-PT', 360]]) {
    const r = await abrir(`${SITE}${PREFIXO[l]}/${SEG[l]}/${C.id}`, w);
    const i = await info(r.page);
    const n = `C ${l} ${w}`;
    ok(`${n}: 2 avaliacoes / mediana 30 h -> sem nota, sem selos, sem avaliacoes, aviso neutro`, !i.nota && !i.selos && !i.rapido && !i.avaliacoes && i.emBreve && !i.jsonld.some((x) => x && x.aggregateRating), `${i.selos} | ${i.texto.slice(0, 300)}`);
    ok(`${n}: title de carroceria`, i.title.includes(tp(l, 'metaTitleCarroceria').split('{cidade}')[0].split('– ').pop().split('— ').pop().trim().slice(0, 8)), i.title);
    await r.ctx.close();
  }

  // ---------- lista
  for (const [l, w] of [['et', 360], ['ru', 390], ['en', 412], ['pt-PT', 390], ['it', 1280], ['pt', 360]]) {
    const r = await abrir(`${SITE}${PREFIXO[l]}/${SEG[l]}`, w, w > 700 ? 800 : 844);
    const i = await info(r.page);
    const n = `lista ${l} ${w}`;
    ok(`${n}: 200 sem erros, sem transbordo`, r.status === 200 && !r.erros.length && !r.ruins.length && i.scrollW <= i.clientW, `${r.status} ${r.erros.join(' | ')} ${i.scrollW}/${i.clientW}`);
    const cartoes = await r.page.evaluate((nomes) => Object.fromEntries(nomes.map((nm) => { const h2 = [...document.querySelectorAll('h2')].find((e) => e.innerText.includes(nm)); const li = h2?.closest('li'); const img = li?.querySelector('img'); return [nm, li ? { texto: li.innerText, logo: img ? { ok: img.complete && img.naturalWidth > 0, w: Math.round(img.getBoundingClientRect().width), fit: getComputedStyle(img).objectFit } : null } : null]; })), [A.nome, B.nome, C.nome]);
    ok(`${n}: A sem "Uus BipFixis" e sem estrelas; B com nota; C sem nota`, cartoes[A.nome] && !cartoes[A.nome].texto.includes(T[l].oficinasLista.newOnPlatform) && !/\d\.\d/.test(cartoes[A.nome].texto) && /5\.0/.test(cartoes[B.nome]?.texto || '') && !/\d\.\d/.test(cartoes[C.nome]?.texto || ''), JSON.stringify(cartoes).slice(0, 400));
    ok(`${n}: logo de A inteiro (object-contain) e regiao "${REGIAO[l]}"`, cartoes[A.nome]?.logo?.ok && cartoes[A.nome].logo.fit === 'contain' && cartoes[A.nome].texto.includes(REGIAO[l]), JSON.stringify(cartoes[A.nome]));
    ok(`${n}: "Muu/Outro" por ultimo nas especialidades de A`, (() => { const t = cartoes[A.nome]?.texto || ''; const o = t.indexOf(T[l].constants.tiposServico.outro); const f = t.indexOf(T[l].constants.tiposServico.funilaria); return o > f && f >= 0; })(), cartoes[A.nome]?.texto);
    await r.ctx.close();
  }
} catch (e) {
  falhas++; console.log('ERRO', e);
} finally {
  await browser.close();
  if (oficinas.length) { await sb.from('orcamentos').delete().in('oficina_id', oficinas); await sb.from('avaliacoes').delete().in('oficina_id', oficinas); }
  for (const id of contas) { await sb.from('solicitacoes').delete().eq('cliente_id', id); await sb.from('veiculos').delete().eq('profile_id', id); }
  if (oficinas.length) await sb.from('oficinas').delete().in('id', oficinas);
  for (const id of contas) await sb.auth.admin.deleteUser(id).catch(() => {});
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
}
