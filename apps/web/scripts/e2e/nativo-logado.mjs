// App NATIVO (emulador Android, Expo Go): entra com conta de teste e passa por
// todas as telas logadas, conferindo erro na tela e tirando foto. Limpa no fim.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { tocar, digitar, textos, foto, erroNaTela, espera, voltar, rolar, temTexto, reiniciarApp } from './nativo.mjs';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex');
const email = `nativo${tag}@example.test`; const senha = `Nat${tag}Senha9`;
const contas = []; let solId, ofId;
const problemas = [];
const confere = async (nome) => {
  await espera(2500);
  foto(`nat-${nome}.png`);
  const erro = erroNaTela();
  console.log(`${erro ? 'FALHA' : 'ok  '} ${nome}: ${textos().slice(0, 6).join(' | ').slice(0, 160)}`);
  if (erro) problemas.push(nome);
};
try {
  const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(u.user.id);
  await sb.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'NATIVO TESTE', email, idioma: 'en', termos_aceitos_em: new Date().toISOString(), termos_versao: '2026-09-30' });
  const { data: v } = await sb.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2019' }).select('id').single();
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'Native test brakes', urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  solId = s.id;
  const { data: uo } = await sb.auth.admin.createUser({ email: `nat-ofi-${tag}@example.test`, password: senha, email_confirm: true });
  contas.push(uo.user.id);
  await sb.from('profiles').insert({ id: uo.user.id, tipo: 'oficina', nome: 'NAT OFI', email: `nat-ofi-${tag}@example.test`, idioma: 'et' });
  const { data: of } = await sb.from('oficinas').insert({ profile_id: uo.user.id, nome_fantasia: 'NATIVE TEST SHOP', endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true }).select('id').single();
  ofId = of.id;
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: solId, oficina_id: ofId, valor_total: 120, prazo_dias: 2, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  const d1 = new Date(Date.now() + 86400000).toISOString().slice(0, 10), d2 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: d1, turno: 'tarde', data_previsao_entrega: d2 });

  // volta para a tela de entrada e entra
  await reiniciarApp();
  await confere('entrada');
  await digitar('Email', email);
  await digitar('Password', senha);
  await tocar('Sign in', { ultimo: true });
  await espera(5000);
  await confere('inicio');
  await tocar(/New request/); await confere('novo-pedido'); await voltar();
  await tocar(/Native test brakes|Toyota Corolla/); await confere('pedido-orcamento');
  await rolar(); await confere('pedido-orcamento-rolado');
  await tocar(/^Messages$/).catch(() => {}); await confere('conversa'); await voltar(); await voltar();
  await tocar(/^Vehicles$/); await confere('aba-veiculos');
  await tocar(/Add vehicle/); await confere('novo-veiculo'); await voltar();
  await tocar(/^Requests$/); await confere('aba-pedidos');
  await tocar(/^Messages$/); await confere('aba-mensagens');
  await tocar(/^Profile$/); await confere('aba-perfil');
  await tocar(/^Home$/); await tocar(/just crashed|I've just crashed/); await confere('acidente-logado'); await voltar();
  await tocar(/^Profile$/); await tocar(/Log out|Sign out/).catch(() => {}); await espera(2000);
  await tocar(/^(Log out|Sign out)$/, { ultimo: true }).catch(() => {}); await confere('saiu');
} catch (e) {
  problemas.push('parou: ' + e.message);
  foto('nat-parou.png');
  console.log('FALHA parou:', e.message, '|', textos().slice(0, 8).join(' | '));
} finally {
  if (solId) {
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', solId);
    for (const o of orcs || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('agenda_eventos').delete().eq('orcamento_id', o.id); }
    for (const t of ['orcamentos', 'mensagens']) await sb.from(t).delete().eq('solicitacao_id', solId);
    await sb.from('solicitacoes').delete().eq('id', solId);
  }
  if (ofId) await sb.from('oficinas').delete().eq('id', ofId);
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(problemas.length ? `PROBLEMAS: ${problemas.join(', ')}` : 'TUDO OK no nativo');
}
