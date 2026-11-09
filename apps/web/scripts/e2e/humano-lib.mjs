// Gestos de pessoa e conferencia visual de tela, compartilhados pelos testes "humanos"
// (jornada-humana-funcoes.mjs). Mesmas regras do jornada-humana.mjs.
import fs from 'node:fs';

export function criarHumano({ W, OUT, ok }) {
  const CEL = W < 500;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function ver(p, loc) {
    await loc.first().waitFor({ state: 'visible', timeout: 15000 });
    for (let i = 0; i < 40; i++) {
      const b = await loc.first().boundingBox();
      if (!b) { await sleep(150); continue; }
      const { vh, barra } = await p.evaluate(() => { const b = document.querySelector('.barra-inferior'); return { vh: innerHeight, barra: !!b && getComputedStyle(b).display !== 'none' }; });
      const topoLivre = 70, baseLivre = vh - (barra ? 80 : 10); // espaco do menu de baixo so quando ele esta na tela
      if (b.y >= topoLivre && b.y + Math.min(b.height, 60) <= baseLivre) return b;
      const dy = b.y < topoLivre ? Math.max(-500, b.y - topoLivre - 40) : Math.min(500, b.y + Math.min(b.height, 60) - baseLivre + 60);
      await p.mouse.wheel(0, dy); await sleep(120);
    }
    return loc.first().boundingBox();
  }
  async function coberto(loc) {
    return loc.first().evaluate((el) => {
      const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 20);
      const hit = document.elementFromPoint(x, y);
      if (!hit || el === hit || el.contains(hit) || hit.contains(el)) return null;
      const lab = el.closest('label'); if (lab && (lab === hit || lab.contains(hit))) return null;
      if (el.id && hit.closest(`label[for="${el.id}"]`)) return null;
      return `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 50)}`;
    });
  }
  async function tocar(p, loc, nome) {
    await ver(p, loc);
    const c = await coberto(loc);
    ok(`toque "${nome}": nada por cima`, !c, c || '');
    if (CEL) await loc.first().tap(); else await loc.first().click();
    await sleep(350);
  }
  async function conferirDigitando(p, loc, nome) {
    const tampa = await loc.first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      for (const f of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(f); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || f.contains(el) || el.contains(f)) continue;
        const q = f.getBoundingClientRect(); if (!q.width || !q.height) continue;
        if (q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) return `${f.tagName.toLowerCase()}.${String(f.className).slice(0, 50)}`;
      }
      return null;
    });
    ok(`campo "${nome}": nada fixo por cima enquanto digita`, !tampa, tampa || '');
    if (CEL) { const barra = await p.evaluate(() => { const b = document.querySelector('.barra-inferior'); return b ? getComputedStyle(b).display : 'none'; }); ok(`campo "${nome}": menu de baixo escondido enquanto digita`, barra === 'none', barra); }
  }
  async function digitar(p, loc, texto, nome, { limpar = true } = {}) {
    await tocar(p, loc, nome);
    ok(`campo "${nome}": foco no 1o toque`, await loc.first().evaluate((el) => el === document.activeElement));
    if (limpar) { await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace'); }
    await p.keyboard.type(texto, { delay: 18 });
    const v = await loc.first().inputValue().catch(() => null);
    ok(`campo "${nome}": guardou o que foi digitado`, v === null || v === texto || v.replace(/\s/g, '') === texto.replace(/\s/g, ''), `${v} vs ${texto}`);
    await conferirDigitando(p, loc, nome);
  }
  async function escolher(p, loc, valor, nome) { await ver(p, loc); await loc.first().selectOption(valor); ok(`lista "${nome}"`, true); await sleep(250); }

  let n = 0;
  async function tela(p, nome, { topo = false } = {}) {
    await p.waitForLoadState('networkidle').catch(() => {}); await sleep(900);
    n++;
    if (topo) { const y = await p.evaluate(() => scrollY); ok(`[${nome}] abre no alto`, y < 10, `rolagem ${y}`); }
    const r = await p.evaluate(() => {
      const out = { crua: null, sw: document.documentElement.scrollWidth - innerWidth, fora: [], vaza: [], cortado: [], encosta: [] };
      const m = document.body.innerText.match(/\b(pedidoSemConta|cliente[A-Z]\w+|oficina[A-Z]\w+|loja[A-Z]\w+|constants|erros|common|agendaMudanca|resumoAgenda)\.[a-zA-Z_]+|\?\?[a-zA-Z]+\.[a-zA-Z.]+/); out.crua = m?.[0] || null;
      const vis = (e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return e.offsetParent !== null && cs.visibility !== 'hidden' && cs.opacity !== '0' && !e.closest('[aria-hidden=true], .sr-only') && b.width > 2 && b.height > 2; };
      const nome = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${(e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 28)}"`;
      for (const e of document.querySelectorAll('main button, main a, main input, main select, main textarea')) {
        if (!vis(e)) continue; const b = e.getBoundingClientRect();
        let rola = false; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { if (/auto|scroll/.test(getComputedStyle(a).overflowX)) { rola = true; break; } }
        if (!rola && b.width && (b.left < -1 || b.right > innerWidth + 1)) out.fora.push(nome(e));
      }
      for (const el of document.querySelectorAll('main *')) {
        if (!vis(el)) continue;
        const pai = el.parentElement; if (!pai) continue;
        const e = el.getBoundingClientRect(), q = pai.getBoundingClientRect();
        if (e.width && q.width && (e.right > q.right + 2 || e.left < q.left - 2)) {
          const cs = getComputedStyle(pai);
          let rola = false; for (let a = pai; a && a !== document.body; a = a.parentElement) { if (/auto|scroll/.test(getComputedStyle(a).overflowX)) { rola = true; break; } }
          if (!rola && cs.overflowX === 'visible' && (cs.borderRightWidth !== '0px' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') && getComputedStyle(el).position !== 'absolute') out.vaza.push(`${nome(el)} sai ${Math.round(Math.max(e.right - q.right, q.left - e.left))}px`);
        }
        const cs2 = getComputedStyle(el);
        if (el.children.length === 0 && (el.innerText || '').trim() && el.scrollWidth > el.clientWidth + 2 && /hidden|clip/.test(cs2.overflowX) && cs2.textOverflow !== 'ellipsis' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) out.cortado.push(nome(el));
      }
      const camada = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { if (getComputedStyle(x).position === 'fixed') return x; } return null; };
      const folhas = [...document.querySelectorAll('main span, main p, main label, main h1, main h2, main h3, main dt, main dd, main td, main th, main a, main button')]
        .filter((e) => vis(e) && getComputedStyle(e).display !== 'inline' && (e.innerText || '').trim() && ![...e.children].some((c) => (c.innerText || '').trim())).slice(0, 400)
        .map((e) => ({ e, r: e.getBoundingClientRect(), c: camada(e) })).filter((x) => x.r.width > 0);
      for (let i = 0; i < folhas.length; i++) for (let j = i + 1; j < folhas.length; j++) {
        const a = folhas[i], b = folhas[j]; if (a.e.contains(b.e) || b.e.contains(a.e) || a.c !== b.c) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 3 && h > 3) out.encosta.push(`${nome(a.e)} x ${nome(b.e)}`);
      }
      for (const k of ['fora', 'vaza', 'cortado', 'encosta']) out[k] = out[k].slice(0, 5);
      return out;
    });
    ok(`[${nome}] sem chave sem traducao`, !r.crua, r.crua || '');
    ok(`[${nome}] sem rolagem lateral`, r.sw <= 1, `${r.sw}px`);
    ok(`[${nome}] nada fora da tela`, !r.fora.length, r.fora.join(' | '));
    ok(`[${nome}] nada vazando da borda da caixa`, !r.vaza.length, r.vaza.join(' | '));
    ok(`[${nome}] nenhum texto cortado`, !r.cortado.length, r.cortado.join(' | '));
    ok(`[${nome}] nenhum texto por cima de outro`, !r.encosta.length, r.encosta.join(' | '));
    fs.mkdirSync(OUT, { recursive: true });
    await p.screenshot({ path: `${OUT}/${String(n).padStart(3, '0')}-${nome.replace(/[^a-z0-9]+/gi, '_').slice(0, 50)}.png`, fullPage: true }).catch(() => {});
  }
  // cada campo de texto visivel da tela: toca, digita como pessoa e devolve o valor de antes
  // (nada e salvo); confere foco no 1o toque e nada por cima enquanto digita
  async function varrerCampos(p, nome, max = 6) {
    const campos = p.locator('main input[type=text]:visible, main input[type=email]:visible, main input[type=tel]:visible, main input[type=number]:visible, main input:not([type]):visible, main textarea:visible');
    const k = Math.min(await campos.count(), max);
    for (let i = 0; i < k; i++) {
      const c = campos.nth(i);
      if (await c.evaluate((e) => e.disabled || e.readOnly || e.closest('[aria-hidden=true]'))) continue;
      const rot = `${nome} #${i + 1} ${(await c.getAttribute('placeholder') || await c.getAttribute('aria-label') || '').slice(0, 20)}`;
      const antes = await c.inputValue();
      const tipo = await c.getAttribute('type');
      await tocar(p, c, rot);
      ok(`campo "${rot}": foco no 1o toque`, await c.evaluate((el) => el === document.activeElement));
      await p.keyboard.press('End'); await p.keyboard.type(tipo === 'number' ? '1' : 'ab', { delay: 30 });
      await conferirDigitando(p, c, rot);
      await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace'); if (antes) await p.keyboard.type(antes, { delay: 5 });
      await c.blur().catch(() => {}); await sleep(150);
    }
  }
  return { CEL, sleep, ver, tocar, digitar, escolher, tela, varrerCampos };
}
