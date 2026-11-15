// Ajudantes dos e2e para o seletor de check-in v2 (Documentos/Analises/Checkin_v2_decisoes_finais_2026-11-14.md):
// o formulario do orcamento comeca com as datas e a validade VAZIAS; a data se escolhe no mini calendario
// (folha "<pre>-folha") + uma faixa ("<pre>-faixa-HHMM-HHMM"). pre: 'ck' orcamento, 'nd' novas datas (079),
// 'pnd' mudanca de data do aceito (077).
const somar = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** abre a folha, vai ate o mes do dia e toca nele (sem dia: o dia realcado = proximo dia aberto) */
export async function abrirDia(page, opcoes = {}) {
  const { pre = 'ck', dia } = opcoes;
  await page.getByTestId(`${pre}-adicionar`).click();
  await page.getByTestId(`${pre}-folha`).waitFor({ timeout: 10000 });
  let alvo = dia;
  if (!alvo) {
    const r = page.locator(`[data-testid^="${pre}-dia-"][data-estado="realce"]`).first();
    alvo = (await r.getAttribute('data-testid')).replace(`${pre}-dia-`, '');
  }
  const ir = async (d) => { for (let i = 0; i < 5 && !(await page.getByTestId(`${pre}-dia-${d}`).count()); i++) { await page.getByTestId(`${pre}-mes-seguinte`).click(); await page.waitForTimeout(120); } };
  await ir(alvo);
  // dia pedido fechado no perfil (ex.: data relativa caiu num domingo): o proximo dia escolhivel
  if (dia && opcoes.pularFechado !== false) for (let i = 0; i < 14 && await page.getByTestId(`${pre}-dia-${alvo}`).isDisabled(); i++) { alvo = somar(alvo, 1); await ir(alvo); }
  return alvo;
}

/**
 * Escolhe dia + faixa. faixa: 'HHMM-HHMM' exata, ou turno 'manha' (1a faixa que comeca antes de 12:00) / 'tarde'
 * (1a que comeca as 12:00 ou depois); sem faixa: a 1a disponivel. Devolve { dia, inicio, fim }.
 */
export async function escolherCheckin(page, { pre = 'ck', dia, faixa, _tentativa = 0 } = {}) {
  const alvo = await abrirDia(page, { pre, dia, pularFechado: arguments[1]?.pularFechado });
  await page.getByTestId(`${pre}-dia-${alvo}`).click();
  await page.getByTestId(`${pre}-faixas`).waitFor({ timeout: 10000 });
  let chip;
  if (faixa && /^\d{4}-\d{4}$/.test(faixa)) chip = page.getByTestId(`${pre}-faixa-${faixa}`);
  else {
    const ids = await page.locator(`[data-testid^="${pre}-faixa-"]:not([disabled])`).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    const pega = ids.find((id) => { const ini = id.split('-').at(-2); return !faixa || (faixa === 'manha' ? ini < '1200' : ini >= '1200'); });
    // data relativa caiu num dia sem esse turno (ex.: sabado 08-12 e 'tarde'): o proximo dia, como no dia fechado (15/11)
    if (!pega && dia && arguments[1]?.pularFechado !== false && _tentativa < 7) {
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      return escolherCheckin(page, { pre, dia: somar(alvo, 1), faixa, _tentativa: _tentativa + 1 });
    }
    if (!pega) throw new Error(`sem faixa ${faixa || ''} em ${alvo}`);
    chip = page.getByTestId(pega);
  }
  const id = await chip.getAttribute('data-testid');
  await chip.click();
  await page.waitForTimeout(300);
  const [ini, fim] = id.split('-').slice(-2);
  return { dia: alvo, inicio: `${ini.slice(0, 2)}:${ini.slice(2)}`, fim: `${fim.slice(0, 2)}:${fim.slice(2)}` };
}

/** validade do orcamento (obrigatoria): ultima data de check-in + dias (padrao 7) */
export async function preencherValidade(page, ymd) { await page.locator('#cacb1-103').fill(ymd); await page.waitForTimeout(150); }

/** o caminho tipico de antes ("data ja preenchida"): 1 data (dia realcado ou o dado) + validade = data + 7 */
export async function preencherCheckinEValidade(page, opts = {}) {
  const r = await escolherCheckin(page, opts);
  await preencherValidade(page, somar(r.dia, opts.validadeDias ?? 7));
  return r;
}
