// Local do pedido amplo demais (dono 20/11, pedido 100154 ficou com "Estonia"): pais, regiao e
// condado (maakond) nao entram nas sugestoes nem passam no geocode por texto; endereco, linnaosa,
// vald e cidade continuam valendo. Usa os servicos reais de mapa (Photon/Nominatim; Geoapify se houver chave).
//   SITE=http://localhost:3105 node local-amplo.mjs
const SITE = process.env.SITE || 'http://localhost:3100';
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 240) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sugestoes = async (q) => (await fetch(`${SITE}/api/endereco/sugestoes?q=${encodeURIComponent(q)}&pais=EE`)).json();
const geocode = async (q) => { const r = await fetch(`${SITE}/api/geocode?q=${encodeURIComponent(q)}&idioma=et`); return { status: r.status, corpo: await r.json() }; };
// rotulo que e so o pais/condado: "Estonia", "Eesti", "Harju County", "Harju maakond", "Lombardia"
const soAmplo = (s) => /^(estonia|eesti|harju (county|maakond)|harjumaa|lääne-viru (county|maakond)|lombardia|lombardy)(, (estonia|eesti|italia|italy))?$/i.test(s.rotulo.trim()) || (!s.cidade && !s.endereco);

try {
  for (const q of ['eesti', 'estonia', 'harjumaa', 'lääne-viru maakond']) {
    const l = await sugestoes(q);
    ok(`sugestoes "${q}": nenhuma e so pais/condado`, Array.isArray(l) && !l.some(soAmplo), JSON.stringify(l.map((s) => s.rotulo)));
    await sleep(300);
  }
  for (const [q, esperado] of [['rakvere', /rakvere/i], ['rae vald', /rae/i], ['lasnamäe', /lasnam/i], ['narva mnt 5', /narva/i]]) {
    const l = await sugestoes(q);
    ok(`sugestoes "${q}": continua sugerindo`, Array.isArray(l) && l.some((s) => esperado.test(s.rotulo)), JSON.stringify(l.map((s) => s.rotulo)));
    await sleep(300);
  }
  for (const q of ['eesti', 'harjumaa', 'lombardia']) {
    const r = await geocode(q);
    ok(`geocode "${q}": 404 (amplo demais)`, r.status === 404, `${r.status} ${JSON.stringify(r.corpo).slice(0, 120)}`);
  }
  for (const q of ['rakvere', 'rae vald', 'lasnamäe', 'Narva mnt 5, Tallinn', 'tallinn']) {
    const r = await geocode(q);
    ok(`geocode "${q}": acha com coordenadas`, r.status === 200 && typeof r.corpo.latitude === 'number', `${r.status} ${JSON.stringify(r.corpo).slice(0, 120)}`);
  }
  // 21/11: mercado da Estonia = so lugares da Estonia ("Таллинн" em RU trazia 5 lugares da Russia)
  const sugestoesPais = async (q, pais) => (await fetch(`${SITE}/api/endereco/sugestoes?q=${encodeURIComponent(q)}&pais=${pais}`)).json();
  for (const [q, esperado] of [['Таллинн', /tallinn|таллинн/i], ['Ласнамяэ', /lasnam|ласнам/i], ['Нарва', /narva|нарва/i], ['Lasnamäe', /lasnam/i], ['Tallinn', /tallinn/i]]) {
    const l = await sugestoes(q);
    ok(`sugestoes EE "${q}": todas na Estonia e acha o lugar`, Array.isArray(l) && l.length > 0 && l.every((s) => s.paisCodigo === 'EE') && l.some((s) => esperado.test(s.rotulo) || esperado.test(s.cidade)),
      JSON.stringify(l.map((s) => `${s.rotulo} [${s.paisCodigo}]`)));
    await sleep(300);
  }
  {
    // outro mercado continua como antes: o pais so ordena, nao esconde
    const l = await sugestoesPais('Tallinn', 'IT');
    ok('sugestoes IT "Tallinn": outros mercados sem filtro de pais (Tallinn EE aparece)', Array.isArray(l) && l.some((s) => s.paisCodigo === 'EE'), JSON.stringify(l.map((s) => `${s.rotulo} [${s.paisCodigo}]`)));
  }
  for (const [q, esperado] of [['Таллинн', /tallinn/i], ['Нарва', /narva/i], ['Ласнамяэ', /lasnam/i], ['Tallinn', /tallinn/i]]) {
    const rr = await fetch(`${SITE}/api/geocode?q=${encodeURIComponent(q)}&pais=ee&idioma=et`);
    const c = await rr.json();
    ok(`geocode "${q}" &pais=ee: na Estonia`, rr.status === 200 && c.paisCodigo === 'EE' && c.latitude > 57.4 && c.latitude < 59.9 && c.longitude > 21.5 && c.longitude < 28.3 && esperado.test(`${c.cidade} ${c.enderecoCompleto}`), `${rr.status} ${JSON.stringify(c).slice(0, 160)}`);
  }
  // o caso real: varias cidades juntas continua nao encontrado
  const r = await geocode('tallinn.rakvere.tartu');
  ok('geocode "tallinn.rakvere.tartu": nao encontrado', r.status === 404, r.status);
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 600)); }
console.log(`\n${falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`}`);
process.exit(falhas ? 1 : 0);
