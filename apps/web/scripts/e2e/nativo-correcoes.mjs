// Reteste do APP no emulador Android (Expo Go) dos pontos do teste no iPhone
// de 03/10/2026, com a conta em ingles e o GPS em Milao (pais != idioma):
//  a lista e pedido do acidente sem "[TIPO:...]"; completar o carro no pedido
//  b mensagens: audio recebido toca (antes "[Audio]"); gravar e enviar audio
//  c horario vencido nao aparece no orcamento
//  d acabei de bater: pedido de permissao, localizacao na tela com a rua,
//    "seu carro" pre-escolhido, dicas da Italia (CAI) mesmo em ingles
//   node nativo-correcoes.mjs <.env.local>
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tocar, digitar, textos, foto, erroNaTela, espera, voltar, rolar, temTexto, reiniciarApp, fecharTeclado } from './nativo.mjs';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ADB = 'C:/Android/platform-tools/adb.exe';
const adb = (...a) => { try { return execFileSync(ADB, a, { encoding: 'utf8' }); } catch (e) { return String(e.message); } };
const tag = crypto.randomBytes(3).toString('hex');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 220) : ''}`); };
const contas = []; const sols = []; let ofId; const ems = [];
const tentar = async (f) => { try { await f(); } catch (e) { console.log('   (passo)', e.message); } };

// WAV de 2 s (tom de 440 Hz) para a mensagem de audio vinda do site
function wav() {
  const sr = 8000, n = sr * 2, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 8000), 44 + i * 2);
  return b;
}

try {
  const email = `natc${tag}@example.test`, senha = `Natc${tag}Senha9`;
  const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(u.user.id);
  await sb.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'NATIVO CORRECOES', email, idioma: 'en', termos_aceitos_em: new Date().toISOString(), termos_versao: '2026-09-30' });
  const { data: carro } = await sb.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: 'Panda', fipe_ano: '2019', placa: 'AB123CD' }).select('id').single();
  const { data: vazio } = await sb.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: '', fipe_modelo: '', fipe_ano: '' }).select('id').single();
  const { data: sAc } = await sb.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: vazio.id, tipo: 'colisao', descricao: '[TIPO:outro_causou] side hit', urgencia: 'alta', latitude: 45.46, longitude: 9.19, endereco: 'Milano' }).select('id').single();
  sols.push(sAc.id);
  const { data: uo } = await sb.auth.admin.createUser({ email: `natc-ofi-${tag}@example.test`, password: senha, email_confirm: true });
  contas.push(uo.user.id);
  await sb.from('profiles').insert({ id: uo.user.id, tipo: 'oficina', nome: 'NATC OFI', email: `natc-ofi-${tag}@example.test`, idioma: 'it' });
  const { data: of } = await sb.from('oficinas').insert({ profile_id: uo.user.id, nome_fantasia: 'OFFICINA TEST', endereco: 'x', cidade: 'Milano', estado: 'MI', cep: '1', pais: 'IT', latitude: 45.46, longitude: 9.19, ativa: true }).select('id').single();
  ofId = of.id;
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: sAc.id, oficina_id: ofId, valor_total: 450, prazo_dias: 2, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10), depois = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await sb.from('orcamento_disponibilidade').insert([
    { orcamento_id: o.id, data_checkin: ontem, turno: 'manha', data_previsao_entrega: ontem },
    { orcamento_id: o.id, data_checkin: depois, turno: 'tarde', data_previsao_entrega: depois },
  ]);
  const caminho = `audio/${sAc.id}/${ofId}/${Date.now()}.wav`;
  await sb.storage.from('damage-photos').upload(caminho, wav(), { contentType: 'audio/wav' });
  const audioUrl = sb.storage.from('damage-photos').getPublicUrl(caminho).data.publicUrl;
  await sb.from('mensagens').insert({ solicitacao_id: sAc.id, oficina_id: ofId, remetente_id: uo.user.id, texto: '[Audio]', tipo: 'audio', audio_url: audioUrl, audio_duracao_segundos: 2, transcricao: 'Buongiorno, la macchina è pronta domani' });

  // permissoes zeradas (para ver o pedido do sistema) e GPS em Milao
  for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'RECORD_AUDIO']) adb('shell', 'pm', 'revoke', 'host.exp.exponent', `android.permission.${p}`);
  adb('emu', 'geo', 'fix', '9.1900', '45.4642');

  await reiniciarApp();
  // menu de desenvolvedor do Expo Go por cima do app
  for (let i = 0; i < 3 && temTexto(/developer menu|Continue/); i++) { await tentar(() => tocar(/^(Continue|Close)$/)); await espera(1500); }
  if (temTexto(/developer menu/)) { await voltar(); }
  if (temTexto(/^Sign in$/)) {
    await digitar('Email', email); await digitar('Password', senha);
    await tocar('Sign in', { ultimo: true }); await espera(6000);
  }
  foto('natc-inicio.png');

  // ---- a) lista e pedido do acidente
  await tentar(() => tocar(/^Requests$/)); await espera(2500);
  foto('natc-pedidos.png');
  ok('a lista sem "[TIPO:" e com titulo "Accident"', !temTexto(/\[TIPO/) && temTexto(/^Accident$/), textos().slice(0, 12).join(' | '));
  await tentar(() => tocar(/^Accident$/)); await espera(3000);
  ok('a pedido sem "[TIPO:"', !temTexto(/\[TIPO/));
  ok('a convite para completar o carro', temTexto(/Add your car details/));
  await tentar(() => tocar(/Add your car details/)); await espera(1500);
  await tentar(() => digitar('License plate', 'GH456JK'));
  foto('natc-editar-pedido.png');
  await tentar(async () => { await rolar(); await tocar(/^Save$/); }); await espera(3000);
  const { data: vz } = await sb.from('veiculos').select('placa').eq('id', vazio.id).single();
  ok('a placa salva no carro do pedido', vz.placa === 'GH456JK', JSON.stringify(vz));

  // ---- c) orcamento: so o horario ainda valido
  await tentar(rolar); await espera(800);
  const horarios = [...new Set(textos().filter((t) => /\(13:00-17:00\)|\(08:00-12:00\)/.test(t)))];
  ok('c so 1 horario (o de ontem some)', horarios.length === 1, horarios.join(' | '));
  foto('natc-orcamento.png');

  // ---- b) conversa: audio recebido e gravar audio
  await tentar(async () => { for (let i = 0; i < 3 && !temTexto(/^Messages$/); i++) await rolar(); });
  await tentar(() => tocar(/^Messages$/, { ultimo: true })); await espera(4000);
  foto('natc-conversa.png');
  ok('b audio recebido aparece com "Play" e transcricao (nao "[Audio]")', temTexto(/^Play$/) && temTexto(/macchina è pronta/) && !temTexto(/^\[Audio\]$/), textos().slice(0, 15).join(' | '));
  await tentar(() => tocar(/^Play$/)); await espera(1000);
  const tocando = temTexto(/^Pause$/) || temTexto(/0:0[12] \/ 0:02/);
  ok('b audio toca (botao vira Pause / tempo anda)', tocando, textos().filter((t) => /\d:\d\d|Pause|Play/.test(t)).join(' | '));
  await tentar(() => tocar('Record audio')); await espera(2500);
  for (let i = 0; i < 4 && !temTexto(/Recording/); i++) {
    await tentar(() => tocar(/While using the app|Only this time|^Allow$|Mentre usi l|Solo questa volta|^Consenti$/)); await espera(2500);
  }
  const gravando = temTexto(/Recording/);
  ok('b gravando apos permitir o microfone', gravando, textos().slice(-8).join(' | '));
  foto('natc-gravando.png');
  if (gravando) { await espera(2500); await tentar(() => tocar('Send audio')); await espera(6000); }
  const { data: aud } = await sb.from('mensagens').select('audio_url, audio_duracao_segundos').eq('solicitacao_id', sAc.id).eq('remetente_id', u.user.id).eq('tipo', 'audio');
  ok('b audio gravado no app chegou ao banco (.m4a)', (aud || []).length === 1 && /\.m4a$/.test(aud[0].audio_url), JSON.stringify(aud));
  const { data: nOf } = await sb.from('notificacoes').select('titulo').eq('profile_id', uo.user.id).eq('tipo', 'nova_mensagem');
  ok('b oficina avisada (em italiano)', (nOf || []).some((n) => /Nuovo messaggio audio/.test(n.titulo)), JSON.stringify(nOf));
  await voltar(); await voltar();

  // ---- d) acabei de bater
  await tentar(() => tocar(/^Home$/)); await espera(2000);
  await tentar(() => tocar(/just crashed/)); await espera(3000);
  const pediu = temTexto(/While using the app|Only this time|Mentre usi l|Solo questa volta/);
  ok('d pede a permissao de localizacao ao abrir', pediu);
  await tentar(() => tocar(/While using the app|Mentre usi l/));
  // emulador: o GPS so responde com posicoes enviadas enquanto o app pede
  for (let i = 0; i < 8 && !temTexto(/Location found/); i++) {
    adb('emu', 'geo', 'fix', '9.1900', '45.4642'); await espera(2500);
    if (temTexto(/^Try again$/)) { adb('emu', 'geo', 'fix', '9.1900', '45.4642'); await tentar(() => tocar(/^Try again$/)); await espera(4000); }
  }
  for (let i = 0; i < 4 && !temTexto(/Location found/); i++) await rolar();
  const tela = textos();
  ok('d localizacao encontrada aparece na tela', temTexto(/Location found/), tela.slice(-10).join(' | '));
  ok('d endereco preenchido com a cidade (Milano/Milan)', tela.some((t) => /Mil(an|ano)/.test(t)), tela.filter((t) => /Mil/.test(t)).join(' | '));
  foto('natc-acidente-local.png');
  await tentar(async () => { for (let i = 0; i < 5 && !temTexto(/^Submit report$/); i++) await rolar(); await fecharTeclado(); await tocar(/^Submit report$/); });
  await espera(9000);
  foto('natc-acidente-fim.png');
  const fim = textos().join(' | ');
  ok('d dicas da Italia em ingles (CAI, 3 days)', /CAI/.test(fim) && /3 days/.test(fim) && !/avarii/i.test(fim), fim.slice(0, 300));
  const { data: novo } = await sb.from('solicitacoes').select('id, veiculo_id, emergencia_id').eq('cliente_id', u.user.id).neq('id', sAc.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (novo) { sols.push(novo.id); ems.push(novo.emergencia_id); }
  ok('d acidente usa o carro cadastrado (Fiat Panda pre-escolhido)', novo?.veiculo_id === carro.id, JSON.stringify(novo));
  ok('d nenhuma tela de erro', !erroNaTela());
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 600)); }
finally {
  for (const sid of sols) {
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sid);
    for (const o of orcs || []) for (const t of ['orcamento_disponibilidade', 'orcamento_itens']) await sb.from(t).delete().eq('orcamento_id', o.id);
    for (const t of ['mensagens', 'agenda', 'orcamentos', 'solicitacao_fotos']) await sb.from(t).delete().eq('solicitacao_id', sid);
    await sb.from('solicitacoes').update({ emergencia_id: null }).eq('id', sid);
  }
  for (const eid of ems) for (const t of ['emergencia_fotos', 'emergencia_mensagens', 'emergencia_outro_veiculo', 'emergencia_oficinas_notificadas']) await sb.from(t).delete().eq('emergencia_id', eid);
  for (const eid of ems) await sb.from('emergencias').delete().eq('id', eid);
  for (const sid of sols) await sb.from('solicitacoes').delete().eq('id', sid);
  if (ofId) { await sb.from('agenda').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { for (const [t, c] of [['veiculos', 'profile_id'], ['notificacoes', 'profile_id']]) await sb.from(t).delete().eq(c, id); await sb.from('emergencias').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
