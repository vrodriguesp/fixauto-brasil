// Teste real (Chromium) da pagina /admin/sms renderizada sozinha: a API e simulada
// no fetch; cliques, digitacao, confirmacao, erros e tela de celular.
//   node admin_sms.mjs <raiz do repo>
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const req = createRequire(import.meta.url);
const { chromium } = req('playwright-core');
const [RAIZ] = process.argv.slice(2);
const { transform } = createRequire(path.join(RAIZ, 'package.json'))('sucrase');
const react = fs.readFileSync(path.join(RAIZ, 'node_modules/react/umd/react.development.js'), 'utf8');
const reactDom = fs.readFileSync(path.join(RAIZ, 'node_modules/react-dom/umd/react-dom.development.js'), 'utf8');
const css = 'body{font-family:sans-serif;margin:0} .input-field{border:1px solid #ccc;padding:8px;box-sizing:border-box} .btn-primary{background:#2563eb;color:#fff;padding:8px 16px}';
const code = transform(fs.readFileSync(path.join(RAIZ, 'apps/web/src/app/admin/sms/page.tsx'), 'utf8').replace("'use client';", ''), { transforms: ['typescript', 'jsx', 'imports'] }).code;
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');

let falhas = 0;
const confere = (nome, ok, extra = '') => { if (!ok) falhas++; console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' — ' + extra : ''}`); };

// cenario = o que a API simulada responde
function pagina(cenario) {
  return `<html><head><meta name="viewport" content="width=device-width"><script src="https://cdn.tailwindcss.com/3.4.1"></script><style>${css}</style></head><body><div id="r"></div>
  <script>${react}</script><script>${reactDom}</script><script>
  window.chamadas = [];
  const C = ${JSON.stringify(cenario)};
  window.fetch = async (url, o = {}) => {
    const metodo = o.method || 'GET'; const corpo = o.body ? JSON.parse(o.body) : null;
    window.chamadas.push({ metodo, corpo });
    const resp = (st, j) => ({ ok: st < 400, status: st, json: async () => j });
    if (metodo === 'GET') return C.getFalha ? resp(500, {}) : resp(200, C.get);
    if (metodo === 'PATCH') return resp(200, { ativo: corpo.ativo });
    if (metodo === 'POST') return C.post[corpo.numero] || resp(404, { error: 'Pedido não encontrado' });
  };
  // respostas do POST precisam virar funcao no navegador
  for (const k of Object.keys(C.post || {})) { const [st, j] = C.post[k]; C.post[k] = { ok: st < 400, status: st, json: async () => j }; }
  const mods = { react: React, '@/lib/utils': { timeAgo: (d) => 'agora' } };
  const require = (m) => mods[m]; const exports = {}; const module = { exports };
  ${code}
  ReactDOM.createRoot(document.getElementById('r')).render(React.createElement(exports.default));
  </script></body></html>`;
}
const GET = { ativo: true, configurado: true, saldo: { saldo: '19.83', moeda: 'USD' }, envios: [
  { id: '1', tipo: 'orcamento_auto', status: 'enviado', motivo: null, final: '567', quando: new Date().toISOString(), numero: 100133, cliente: 'Cliente A' },
  { id: '2', tipo: 'orcamento_auto', status: 'pulado', motivo: 'tem_app', final: '111', quando: new Date().toISOString(), numero: 100093, cliente: 'Cliente B' },
] };
const POST = { '100133': [200, { status: 'enviado' }], '100130': [422, { status: 'pulado', motivo: 'sem_orcamento' }], '100099': [422, { status: 'pulado', motivo: 'pedido_fechado' }] };

const b = await chromium.launch({ executablePath: exe });
async function abrir(cenario, viewport = { width: 1280, height: 900 }) {
  const p = await b.newPage({ viewport }); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/tailwind|production/i.test(m.text())) erros.push(m.text()); });
  await p.setContent(pagina(cenario), { waitUntil: 'load' });
  await p.waitForTimeout(400);
  return { p, erros };
}

// 1. carga normal
let { p, erros } = await abrir({ get: GET, post: POST });
confere('carrega o saldo', (await p.textContent('[data-testid="sms-saldo"]')).includes('19.83 USD'));
confere('interruptor mostra ligado', (await p.textContent('[data-testid="sms-interruptor"]')).includes('Ligado'));
confere('aria-checked=true', (await p.getAttribute('[data-testid="sms-interruptor"]', 'aria-checked')) === 'true');
confere('lista com 2 envios', (await p.locator('[data-testid="sms-lista"] li').count()) === 2);
confere('motivo traduzido "tem o app"', (await p.textContent('[data-testid="sms-lista"]')).includes('cliente tem o app'));

// 2. desligar
await p.click('[data-testid="sms-interruptor"]'); await p.waitForTimeout(200);
let ch = await p.evaluate(() => window.chamadas);
confere('PATCH ativo=false', ch.some((c) => c.metodo === 'PATCH' && c.corpo.ativo === false));
confere('interruptor mostra desligado', (await p.textContent('[data-testid="sms-interruptor"]')).includes('Desligado'));
// e ligar de novo
await p.click('[data-testid="sms-interruptor"]'); await p.waitForTimeout(200);
confere('religar: PATCH ativo=true', (await p.evaluate(() => window.chamadas)).some((c) => c.metodo === 'PATCH' && c.corpo.ativo === true));

// 3. enviar sem numero
await p.click('[data-testid="sms-enviar"]'); await p.waitForTimeout(150);
confere('sem numero: avisa', (await p.textContent('[data-testid="sms-aviso"]')).includes('Digite o número'));
confere('sem numero: nao chama POST', !(await p.evaluate(() => window.chamadas)).some((c) => c.metodo === 'POST'));

// 4. digitar e cancelar a confirmacao
p.once('dialog', (d) => d.dismiss());
await p.click('[data-testid="sms-numero"]'); await p.keyboard.type('100133', { delay: 40 });
confere('campo recebe o numero inteiro', (await p.inputValue('[data-testid="sms-numero"]')) === '100133');
await p.click('[data-testid="sms-enviar"]'); await p.waitForTimeout(200);
confere('cancelar confirmacao: nao envia', !(await p.evaluate(() => window.chamadas)).some((c) => c.metodo === 'POST'));

// 5. confirmar -> enviado
let textoDialogo = '';
p.once('dialog', (d) => { textoDialogo = d.message(); d.accept(); });
await p.click('[data-testid="sms-enviar"]'); await p.waitForTimeout(300);
confere('confirmacao cita o pedido', textoDialogo.includes('100133'), textoDialogo);
confere('POST com numero 100133', (await p.evaluate(() => window.chamadas)).some((c) => c.metodo === 'POST' && c.corpo.numero === '100133'));
confere('mensagem de sucesso', (await p.textContent('[data-testid="sms-aviso"]')).includes('SMS enviado'));
confere('campo limpo depois do envio', (await p.inputValue('[data-testid="sms-numero"]')) === '');

// 6. numero com espacos/letras e pedido sem orcamento
p.once('dialog', (d) => d.accept());
await p.click('[data-testid="sms-numero"]'); await p.keyboard.type(' 100 130 ', { delay: 30 });
await p.click('[data-testid="sms-enviar"]'); await p.waitForTimeout(300);
confere('limpa espacos: POST 100130', (await p.evaluate(() => window.chamadas)).some((c) => c.metodo === 'POST' && c.corpo.numero === '100130'));
confere('sem orcamento: explica', (await p.textContent('[data-testid="sms-aviso"]')).includes('sem orçamento'));
confere('erro mantem o numero digitado', (await p.inputValue('[data-testid="sms-numero"]')) === ' 100 130 ');

// 7. pedido cancelado
await p.fill('[data-testid="sms-numero"]', '100099'); p.once('dialog', (d) => d.accept());
await p.click('[data-testid="sms-enviar"]'); await p.waitForTimeout(300);
confere('pedido cancelado: explica', (await p.textContent('[data-testid="sms-aviso"]')).includes('fechado ou cancelado'));

// 8. pedido inexistente
await p.fill('[data-testid="sms-numero"]', '999999'); p.once('dialog', (d) => d.accept());
await p.click('[data-testid="sms-enviar"]'); await p.waitForTimeout(300);
confere('pedido inexistente: explica', (await p.textContent('[data-testid="sms-aviso"]')).includes('não encontrado'));

// 9. Enter no campo envia (formulario)
await p.fill('[data-testid="sms-numero"]', '100133'); p.once('dialog', (d) => d.accept());
const antes = (await p.evaluate(() => window.chamadas)).filter((c) => c.metodo === 'POST').length;
await p.press('[data-testid="sms-numero"]', 'Enter'); await p.waitForTimeout(300);
confere('Enter envia', (await p.evaluate(() => window.chamadas)).filter((c) => c.metodo === 'POST').length === antes + 1);
confere('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
await p.close();

// 10. API fora do ar
({ p, erros } = await abrir({ getFalha: true }));
confere('falha de carga: mostra aviso', (await p.textContent('body')).includes('Não foi possível carregar'));
await p.close();

// 11. chaves nao configuradas + lista vazia
({ p } = await abrir({ get: { ...GET, configurado: false, saldo: null, envios: [] }, post: POST }));
confere('sem chaves: alerta', (await p.textContent('body')).includes('chaves da Twilio não estão'));
confere('lista vazia: texto', (await p.textContent('body')).includes('Nenhum SMS ainda'));
await p.close();

// 12. celular 375 px: sem rolagem lateral, botoes >= 44 px
({ p } = await abrir({ get: GET, post: POST }, { width: 375, height: 800 }));
const larg = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
confere('celular: sem rolagem lateral', larg[0] <= larg[1], larg.join(' x '));
const alt = await p.evaluate(() => ['sms-interruptor', 'sms-enviar', 'sms-numero'].map((t) => document.querySelector(`[data-testid="${t}"]`).getBoundingClientRect().height));
confere('celular: toques >= 44 px', alt.every((h) => h >= 44), alt.join(', '));
await p.screenshot({ path: path.join(RAIZ, 'Documentos/_teste_local/admin_sms_celular.png'), fullPage: true });
await p.close();

await b.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
