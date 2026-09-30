// Teste das regras de acesso (RLS) da migracao 028 contra o banco real, sem
// deixar rastro: cria contas e dados temporarios com a service role, entra
// como cada tipo de pessoa (e sem login) e confere o que cada um PODE e NAO
// PODE ler/gravar. Apaga tudo no fim, mesmo se algo falhar.
//   node --env-file=.env.local scripts/teste-rls.mjs
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

let falhas = 0;
const criadosUsers = [];
const limpar = [];
function confere(nome, ok) {
  if (!ok) falhas++;
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
}

async function conta(tipo, rotulo) {
  const email = `rls-${rotulo}-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const senha = crypto.randomBytes(12).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  criadosUsers.push(data.user.id);
  const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, tipo, nome: `RLS ${rotulo}`, email, telefone: '+3720000', idioma: 'et' });
  if (e2) throw e2;
  const c = createClient(URL_, ANON, opts);
  const { error: e3 } = await c.auth.signInWithPassword({ email, password: senha });
  if (e3) throw e3;
  return { id: data.user.id, c };
}

async function ins(tabela, linha) {
  const { data, error } = await admin.from(tabela).insert(linha).select().single();
  if (error) throw new Error(`${tabela}: ${error.message}`);
  limpar.push([tabela, data.id]);
  return data;
}

const ve = async (c, tabela, id) => {
  const { data } = await c.from(tabela).select('id').eq('id', id);
  return (data || []).length === 1;
};

try {
  const anon = createClient(URL_, ANON, opts);
  const A = await conta('cliente', 'clienteA');
  const Bc = await conta('cliente', 'clienteB');
  const X = await conta('oficina', 'oficinaX');
  const Y = await conta('oficina', 'oficinaY');
  const Z = await conta('oficina', 'oficinaZ');
  const F = await conta('oficina', 'funcX');
  const L = await conta('loja_pecas', 'lojaL');
  const ADM = await conta('admin', 'admin');

  const base = { endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '10111', latitude: 59.43, longitude: 24.75, ativa: false, pais: 'EE' };
  const ofX = await ins('oficinas', { ...base, profile_id: X.id, nome_fantasia: 'RLS X' });
  const ofY = await ins('oficinas', { ...base, profile_id: Y.id, nome_fantasia: 'RLS Y' });
  await ins('oficinas', { ...base, profile_id: Z.id, nome_fantasia: 'RLS Z' });
  await ins('funcionarios', { profile_id: F.id, oficina_id: ofX.id, cargo: 'mecanico', ativo: true });
  await ins('lojas_pecas', { profile_id: L.id, nome_fantasia: 'RLS L', endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '10111', ativa: false });
  const vA = await ins('veiculos', { profile_id: A.id, fipe_tipo: 'cars', fipe_marca: 'X', fipe_modelo: 'Y', fipe_ano: '2020' });
  const vB = await ins('veiculos', { profile_id: Bc.id, fipe_tipo: 'cars', fipe_marca: 'X', fipe_modelo: 'Y', fipe_ano: '2020' });
  const S1 = await ins('solicitacoes', { cliente_id: A.id, veiculo_id: vA.id, tipo: 'mecanica', descricao: 'rls', urgencia: 'media', status: 'aberta', latitude: 59.4, longitude: 24.7, endereco: 'x' });
  const S2 = await ins('solicitacoes', { cliente_id: Bc.id, veiculo_id: vB.id, tipo: 'mecanica', descricao: 'rls', urgencia: 'media', status: 'concluida', latitude: 59.4, longitude: 24.7, endereco: 'x' });
  const O1 = await ins('orcamentos', { solicitacao_id: S1.id, oficina_id: ofX.id, valor_total: 100, prazo_dias: 1, status: 'enviado', validade: '2030-01-01' });
  const O2 = await ins('orcamentos', { solicitacao_id: S1.id, oficina_id: ofY.id, valor_total: 120, prazo_dias: 1, status: 'enviado', validade: '2030-01-01' });
  const M1 = await ins('mensagens', { solicitacao_id: S1.id, remetente_id: A.id, texto: 'oi' });
  const E1 = await ins('emergencias', { profile_id: A.id, nome: 'A', email: 'a@example.test', telefone: '1', descricao: 'rls', endereco: 'x', latitude: 59.4, longitude: 24.7, prioridade: 'urgente' });
  await ins('emergencia_outro_veiculo', { emergencia_id: E1.id, nome: 'B', placa: 'ABC123', profile_id: Bc.id });
  const caminho = `solicitacoes/${S1.id}/rls-${crypto.randomUUID()}.txt`;
  const up = await admin.storage.from('damage-photos').upload(caminho, Buffer.from('teste'), { contentType: 'text/plain' });
  if (up.error) throw up.error;

  // --- sem login
  confere('anon NAO le perfis', (await anon.from('profiles').select('id').limit(5)).data?.length === 0);
  confere('anon NAO le solicitacoes', !(await ve(anon, 'solicitacoes', S1.id)));
  confere('anon NAO le orcamentos', !(await ve(anon, 'orcamentos', O1.id)));
  confere('anon NAO le mensagens', !(await ve(anon, 'mensagens', M1.id)));
  confere('anon NAO le acidentes', !(await ve(anon, 'emergencias', E1.id)));
  confere('anon LE oficinas (publico)', await ve(anon, 'oficinas', ofX.id));
  confere('anon NAO grava acidente', !!(await anon.from('emergencias').insert({ nome: 'x', descricao: 'x', endereco: 'x', latitude: 0, longitude: 0 })).error);
  confere('anon NAO lista fotos', ((await anon.storage.from('damage-photos').list('solicitacoes')).data || []).length === 0);
  confere('anon NAO assina foto', !!(await anon.storage.from('damage-photos').createSignedUrl(caminho, 60)).error);
  const pub = await fetch(`${URL_}/storage/v1/object/public/damage-photos/${caminho}`);
  confere(`anon NAO baixa pelo endereco publico (${pub.status})`, pub.status >= 400);
  confere('anon NAO envia arquivo', !!(await anon.storage.from('damage-photos').upload(`solicitacoes/${S1.id}/x.txt`, Buffer.from('x'))).error);

  // --- cliente A (dono do pedido S1 e do acidente E1)
  confere('A le o proprio perfil', await ve(A.c, 'profiles', A.id));
  confere('A NAO le perfil do cliente B', !(await ve(A.c, 'profiles', Bc.id)));
  confere('A le perfil da oficina X (contato comercial)', await ve(A.c, 'profiles', X.id));
  confere('A le o pedido dele', await ve(A.c, 'solicitacoes', S1.id));
  confere('A NAO le pedido de B', !(await ve(A.c, 'solicitacoes', S2.id)));
  confere('A le os dois orcamentos do pedido dele', (await ve(A.c, 'orcamentos', O1.id)) && (await ve(A.c, 'orcamentos', O2.id)));
  confere('A le a conversa dele', await ve(A.c, 'mensagens', M1.id));
  confere('A envia mensagem no pedido dele', !(await A.c.from('mensagens').insert({ solicitacao_id: S1.id, remetente_id: A.id, texto: 'x' })).error);
  confere('A NAO envia mensagem no pedido de B', !!(await A.c.from('mensagens').insert({ solicitacao_id: S2.id, remetente_id: A.id, texto: 'x' })).error);
  confere('A le o acidente dele', await ve(A.c, 'emergencias', E1.id));
  confere('A assina a foto do pedido dele', !(await A.c.storage.from('damage-photos').createSignedUrl(caminho, 60)).error);
  confere('A NAO notifica o cliente B', !!(await A.c.from('notificacoes').insert({ profile_id: Bc.id, tipo: 'x', titulo: 'x', mensagem: 'x' })).error);
  confere('A notifica a oficina X', !(await A.c.from('notificacoes').insert({ profile_id: X.id, tipo: 'x', titulo: 'x', mensagem: 'x' })).error);

  // --- cliente B (outro motorista do acidente E1)
  confere('B NAO le o pedido de A', !(await ve(Bc.c, 'solicitacoes', S1.id)));
  confere('B NAO le orcamento de A', !(await ve(Bc.c, 'orcamentos', O1.id)));
  confere('B NAO le a conversa de A', !(await ve(Bc.c, 'mensagens', M1.id)));
  confere('B NAO le o perfil de A', !(await ve(Bc.c, 'profiles', A.id)));
  confere('B (outro motorista) le o acidente', await ve(Bc.c, 'emergencias', E1.id));
  confere('B NAO altera mensagens de A', ((await Bc.c.from('mensagens').update({ texto: 'hack' }).eq('id', M1.id).select()).data || []).length === 0);

  // --- oficina X (orcou S1)
  confere('X le o pedido aberto S1', await ve(X.c, 'solicitacoes', S1.id));
  confere('X NAO le pedido concluido de outro S2', !(await ve(X.c, 'solicitacoes', S2.id)));
  confere('X le o proprio orcamento', await ve(X.c, 'orcamentos', O1.id));
  confere('X NAO le o orcamento concorrente', !(await ve(X.c, 'orcamentos', O2.id)));
  confere('X le o perfil do cliente A (envolvida)', await ve(X.c, 'profiles', A.id));
  confere('X NAO le o perfil do cliente B', !(await ve(X.c, 'profiles', Bc.id)));
  confere('X le a conversa de S1', await ve(X.c, 'mensagens', M1.id));
  confere('X assina a foto de S1', !(await X.c.storage.from('damage-photos').createSignedUrl(caminho, 60)).error);
  confere('X NAO le o acidente de A (nao avisada)', !(await ve(X.c, 'emergencias', E1.id)));

  // --- oficina Z (sem relacao)
  confere('Z le o pedido aberto (marketplace)', await ve(Z.c, 'solicitacoes', S1.id));
  confere('Z NAO le a conversa de S1', !(await ve(Z.c, 'mensagens', M1.id)));
  confere('Z NAO le o perfil do cliente A', !(await ve(Z.c, 'profiles', A.id)));
  confere('Z NAO le orcamentos de S1', !(await ve(Z.c, 'orcamentos', O1.id)));

  // --- funcionario da oficina X
  confere('funcionario de X le o orcamento de X', await ve(F.c, 'orcamentos', O1.id));
  confere('funcionario de X le o perfil do dono', await ve(F.c, 'profiles', X.id));

  // --- loja
  confere('loja NAO le pedidos de clientes', !(await ve(L.c, 'solicitacoes', S1.id)));
  confere('loja NAO le perfil de cliente', !(await ve(L.c, 'profiles', A.id)));

  // --- admin
  confere('admin le tudo (pedido, orcamento, perfil, acidente)',
    (await ve(ADM.c, 'solicitacoes', S2.id)) && (await ve(ADM.c, 'orcamentos', O2.id)) && (await ve(ADM.c, 'profiles', Bc.id)) && (await ve(ADM.c, 'emergencias', E1.id)));

  await admin.storage.from('damage-photos').remove([caminho]);
} catch (e) {
  falhas++;
  console.log('ERRO no teste:', e.message);
} finally {
  for (const [tabela, id] of limpar.reverse()) await admin.from(tabela).delete().eq('id', id);
  await admin.from('notificacoes').delete().in('profile_id', criadosUsers);
  await admin.from('mensagens').delete().in('remetente_id', criadosUsers);
  for (const id of criadosUsers) {
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`limpeza: ${criadosUsers.length} contas e ${limpar.length} registros apagados`);
}
console.log(falhas === 0 ? 'TUDO CERTO' : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
