// Menu do site no computador: algum texto do cabecalho por cima de outro botao?
// oficina, cliente e loja; 6 idiomas; larguras 1024..1920; mede caixa a caixa.
//   node site-menu-sobreposto.mjs <.env.local> [SITE]
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js'); const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = process.argv[3] || 'https://bipfix.com';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex');
const PREFIXOS = { pt: 'br/pt', 'pt-PT': 'pt/pt', en: 'ee/en', et: 'ee/et', it: 'it/it', ru: 'ee/ru' };
const LARGURAS = process.env.LARGURAS ? process.env.LARGURAS.split(',').map(Number) : [1024, 1152, 1280, 1366, 1440, 1536, 1920];
const contas = []; const extras = [];
const conta = async (tipo) => {
  const email = `menu-${tipo}-${tag}@example.test`; const senha = `Me${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  // nome comprido de proposito (pior caso)
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: 'Alessandro Bartolomeo Pereira', email, idioma: 'it' });
  const base = { profile_id: data.user.id, nome_fantasia: 'Autofficina Moretto e Figli Srl', endereco: 'Via Roma 1', cidade: 'Milano', estado: 'MI', cep: '20121', ativa: true };
  if (tipo === 'oficina') { const { data: o } = await sb.from('oficinas').insert({ ...base, pais: 'IT', latitude: 45.46, longitude: 9.19, raio_atendimento_km: 30 }).select('id').single(); extras.push(['oficinas', o.id]); }
  if (tipo === 'loja_pecas') { const { data: l, error } = await sb.from('lojas_pecas').insert(base).select('id').single(); if (error) console.log('loja:', error.message); else extras.push(['lojas_pecas', l.id]); }
  return { email, senha, tipo };
};
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const problemas = [];
try {
  for (const tipo of ['oficina', 'cliente', 'loja_pecas']) {
    const c = await conta(tipo);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
    const p = await ctx.newPage();
    await p.goto(`${SITE}/it/it/login`, { waitUntil: 'networkidle' });
    await p.fill('input[type=email]', c.email); await p.fill('input[type=password]', c.senha); await p.click('button[type=submit]');
    await p.waitForTimeout(5000);
    const inicio = new URL(p.url()).pathname.replace(/^\/it\/it/, '');
    console.log(tipo, 'entrou em', inicio);
    for (const [loc, pre] of Object.entries(PREFIXOS)) {
      await p.goto(`${SITE}/${pre}${inicio}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
      for (const w of LARGURAS) {
        await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(250);
        const r = await p.evaluate(() => {
          const h = document.querySelector('header') || document.querySelector('nav');
          if (!h) return { erro: 'sem cabecalho' };
          // pedacos visiveis: textos soltos e botoes/links/icones
          const pecas = [];
          const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const t = n.textContent.trim(); if (!t) continue;
            const el = n.parentElement; const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden],[aria-hidden=true]')) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            // texto cortado com reticencias: conta so a parte visivel (caixa do elemento)
            const eb = el.getBoundingClientRect(); const corta = cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis';
            for (const r0 of rg.getClientRects()) { const b = corta ? { left: Math.max(r0.left, eb.left), right: Math.min(r0.right, eb.right), top: r0.top, bottom: r0.bottom } : r0; b.width = b.right - b.left; b.height = b.bottom - b.top; if (b.width > 1 && b.height > 1) pecas.push({ t: t.slice(0, 40), el, b }); }
          }
          for (const el of h.querySelectorAll('a,button,svg,img,select')) {
            const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
            if (b.width > 1 && b.height > 1 && cs.visibility !== 'hidden') pecas.push({ t: `<${el.tagName.toLowerCase()}> ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}`, el, b, caixa: true });
          }
          const hb = h.getBoundingClientRect();
          const out = [];
          for (let i = 0; i < pecas.length; i++) for (let j = i + 1; j < pecas.length; j++) {
            const A = pecas[i], B = pecas[j];
            if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
            if (A.caixa && B.caixa) { /* caixas dentro de caixas (link com svg) ja cobertas acima */ }
            const x = Math.min(A.b.right, B.b.right) - Math.max(A.b.left, B.b.left);
            const y = Math.min(A.b.bottom, B.b.bottom) - Math.max(A.b.top, B.b.top);
            if (x > 3 && y > 3) out.push(`"${A.t}" x "${B.t}" (${Math.round(x)}x${Math.round(y)}px)`);
          }
          // texto cortado/fora da tela ou cabecalho com 2 linhas
          const fora = pecas.filter((q) => q.b.right > window.innerWidth + 1 || q.b.left < -1).map((q) => `fora da tela: "${q.t}"`);
          return { out: [...new Set(out)], fora, altura: Math.round(hb.height), rolagem: document.documentElement.scrollWidth > window.innerWidth + 1 };
        });
        const msgs = [...(r.out || []), ...(r.fora || []), ...(r.erro ? [r.erro] : []), ...(r.rolagem ? ['pagina com rolagem horizontal'] : []), ...(r.altura > 90 ? [`cabecalho alto (${r.altura}px)`] : [])];
        if (msgs.length) {
          problemas.push(`${tipo} ${loc} ${w}px: ${msgs.slice(0, 4).join(' | ')}`);
          await p.screenshot({ path: `menu-${tipo}-${loc}-${w}.png`, clip: { x: 0, y: 0, width: w, height: 120 } });
        }
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const [t, id] of extras) { await sb.from('comissao_config').delete().eq('oficina_id', id); await sb.from(t).delete().eq('id', id); }
  for (const id of contas) { await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
}
console.log(problemas.length ? problemas.join('\n') : 'nenhuma sobreposicao');
console.log(`${problemas.length} combinacao(oes) com problema`);
