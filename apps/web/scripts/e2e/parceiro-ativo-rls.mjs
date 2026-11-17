// Teste de seguranca da migracao 090 (17/11): oficina/loja so nascem pelo cadastro
// do servidor e so as ATIVAS enxergam cotacoes de pecas e contatos de outras contas.
// Cada ataque com a chave publica deve falhar; cada acao legitima deve passar.
//   node parceiro-ativo-rls.mjs <.env.local>
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 200) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const ofs = []; const lojas = []; const sols = [];
const conta = async (tipo) => {
  const email = `par-${tipo}${contas.length}-${tag}@example.test`; const senha = `Par${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo}`, email, telefone: '+37250000000', idioma: 'et' });
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await a.auth.signInWithPassword({ email, password: senha });
  return { id: data.user.id, a };
};
const base = { endereco: 'Narva mnt 5', cidade: 'Tallinn', estado: 'Harju', cep: '10117', pais: 'EE', latitude: 59.43, longitude: 24.75 };
const oficina = async (dono, ativa) => {
  const { data, error } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `PAR OF ${tag}`, ...base, ativa, raio_atendimento_km: 30, especialidades: ['mecanica'] }).select('id').single();
  if (error) throw new Error('oficina: ' + error.message);
  ofs.push(data.id); return data.id;
};
const loja = async (dono, ativa) => {
  const { data, error } = await sb.from('lojas_pecas').insert({ profile_id: dono.id, nome_fantasia: `PAR LOJA ${tag}`, ...base, ativa }).select('id').single();
  if (error) throw new Error('loja: ' + error.message);
  lojas.push(data.id); return data.id;
};
const cotacao = async (ofId) => {
  const { data, error } = await sb.from('cotacoes_pecas').insert({ oficina_id: ofId, peca_descricao: `Pastilhas ${tag}`, fipe_marca: 'Skoda', fipe_modelo: 'Octavia', fipe_ano: '2016', quantidade: 1 }).select('id').single();
  if (error) throw new Error('cotacao: ' + error.message);
  return data.id;
};
const veCotacao = async (a, id) => { const { data } = await a.from('cotacoes_pecas').select('id').eq('id', id); return (data || []).length === 1; };
const vePerfil = async (a, id) => { const { data } = await a.from('profiles').select('id, email, telefone').eq('id', id); return (data || []).length === 1; };

try {
  // contas
  const motorista = await conta('cliente');
  const donoOfA = await conta('oficina'); const ofA = await oficina(donoOfA, true); // oficina ativa (compradora)
  const donoOfI = await conta('oficina'); const ofI = await oficina(donoOfI, false); // oficina recem-cadastrada (inativa)
  const funcA = await conta('oficina'); // funcionario da oficina ativa
  await sb.from('funcionarios').insert({ oficina_id: ofA, profile_id: funcA.id, nome: 'Func', cargo: 'mecanico', ativo: true });
  const donoLjA = await conta('loja_pecas'); await loja(donoLjA, true); // loja ativa
  const donoLjI = await conta('loja_pecas'); await loja(donoLjI, false); // loja recem-cadastrada (inativa)
  const cotA = await cotacao(ofA);
  const cotI = await cotacao(ofI);

  // 1) ninguem cria oficina/loja pela API (so o cadastro do servidor)
  const { error: e1 } = await motorista.a.from('lojas_pecas').insert({ profile_id: motorista.id, nome_fantasia: 'Loja falsa', ...base });
  ok('motorista NAO cria loja de pecas pela API', !!e1, e1?.message || 'inseriu');
  const { error: e2 } = await motorista.a.from('oficinas').insert({ profile_id: motorista.id, nome_fantasia: 'Oficina falsa', ...base });
  ok('motorista NAO cria oficina pela API', !!e2, e2?.message || 'inseriu');
  const { count: falsas } = await sb.from('lojas_pecas').select('id', { count: 'exact', head: true }).eq('profile_id', motorista.id);
  const { count: falsasO } = await sb.from('oficinas').select('id', { count: 'exact', head: true }).eq('profile_id', motorista.id);
  ok('nenhuma linha falsa ficou no banco', (falsas ?? 0) === 0 && (falsasO ?? 0) === 0, `${falsas}/${falsasO}`);
  const { error: e3 } = await donoLjI.a.from('lojas_pecas').insert({ profile_id: donoLjI.id, nome_fantasia: 'Segunda loja', ...base });
  ok('dono de loja NAO cria segunda loja pela API', !!e3, e3?.message || 'inseriu');

  // 2) cotacoes de pecas
  ok('motorista NAO ve cotacoes', !(await veCotacao(motorista.a, cotA)));
  ok('loja INATIVA NAO ve cotacoes', !(await veCotacao(donoLjI.a, cotA)));
  ok('oficina INATIVA NAO ve cotacao de outra oficina', !(await veCotacao(donoOfI.a, cotA)));
  ok('legitimo: oficina INATIVA ve a PROPRIA cotacao', await veCotacao(donoOfI.a, cotI));
  ok('legitimo: loja ATIVA ve cotacao', await veCotacao(donoLjA.a, cotA));
  ok('legitimo: oficina ATIVA ve cotacao de outra oficina (aba Vender)', await veCotacao(donoOfA.a, cotI));
  ok('legitimo: oficina ATIVA ve a propria cotacao', await veCotacao(donoOfA.a, cotA));
  ok('legitimo: funcionario da oficina ATIVA ve cotacoes', await veCotacao(funcA.a, cotA));

  // 3) contatos (perfil com e-mail/telefone)
  ok('motorista NAO ve o perfil do dono da oficina', !(await vePerfil(motorista.a, donoOfA.id)));
  ok('loja INATIVA NAO ve o perfil do dono da oficina', !(await vePerfil(donoLjI.a, donoOfA.id)));
  ok('oficina INATIVA NAO ve o perfil do dono da loja', !(await vePerfil(donoOfI.a, donoLjA.id)));
  ok('legitimo: loja ATIVA ve o perfil do dono da oficina', await vePerfil(donoLjA.a, donoOfA.id));
  ok('legitimo: oficina ATIVA ve o perfil do dono da loja', await vePerfil(donoOfA.a, donoLjA.id));
  ok('legitimo: funcionario da oficina ATIVA ve o perfil do dono da loja', await vePerfil(funcA.a, donoLjA.id));
  ok('legitimo: cada um ve o proprio perfil', (await vePerfil(donoLjI.a, donoLjI.id)) && (await vePerfil(donoOfI.a, donoOfI.id)) && (await vePerfil(motorista.a, motorista.id)));

  // 4) o painel da conta inativa continua funcionando (dados proprios)
  const { data: minhaLoja } = await donoLjI.a.from('lojas_pecas').select('id, ativa').eq('profile_id', donoLjI.id);
  ok('legitimo: loja INATIVA le a propria linha (banner "em analise")', (minhaLoja || []).length === 1 && minhaLoja[0].ativa === false);
  const { error: eUpd } = await donoLjI.a.from('lojas_pecas').update({ nome_fantasia: `PAR LOJA ${tag} editada` }).eq('profile_id', donoLjI.id);
  const { data: lj2 } = await sb.from('lojas_pecas').select('nome_fantasia, ativa').eq('profile_id', donoLjI.id).single();
  ok('legitimo: loja INATIVA edita o proprio perfil (e continua inativa)', !eUpd && lj2.nome_fantasia.endsWith('editada') && lj2.ativa === false, eUpd?.message);
  const { error: eUpdO } = await donoOfI.a.from('oficinas').update({ nome_fantasia: `PAR OF ${tag} editada` }).eq('id', ofI);
  const { data: of2 } = await sb.from('oficinas').select('nome_fantasia, ativa').eq('id', ofI).single();
  ok('legitimo: oficina INATIVA edita o proprio perfil (e continua inativa)', !eUpdO && of2.nome_fantasia.endsWith('editada') && of2.ativa === false, eUpdO?.message);
  const { error: eCot } = await donoOfA.a.from('cotacoes_pecas').insert({ oficina_id: ofA, peca_descricao: 'Filtro de oleo', fipe_marca: 'VW', fipe_modelo: 'Golf', fipe_ano: '2015', quantidade: 2 });
  ok('legitimo: oficina ATIVA cria cotacao pelo navegador', !eCot, eCot?.message);

  // 4b) equipe so pela rota do servidor (auditoria Fable): ninguem se poe como funcionario de alguem pela API
  const { error: eF1 } = await donoOfI.a.from('funcionarios').insert({ oficina_id: ofI, profile_id: donoLjA.id, nome: 'x', cargo: 'mecanico', ativo: false });
  ok('oficina INATIVA NAO poe o dono da loja como funcionario pela API', !!eF1, eF1?.message || 'inseriu');
  ok('...e continua sem ver o perfil do dono da loja', !(await vePerfil(donoOfI.a, donoLjA.id)));
  const { error: eF2 } = await donoOfA.a.from('funcionarios').insert({ oficina_id: ofA, profile_id: motorista.id, nome: 'y', cargo: 'mecanico', ativo: true });
  ok('oficina ATIVA NAO poe um motorista como funcionario pela API', !!eF2, eF2?.message || 'inseriu');
  ok('...e nao ve o perfil do motorista', !(await vePerfil(donoOfA.a, motorista.id)));
  const { data: eqA } = await donoOfA.a.from('funcionarios').select('id, profile_id').eq('oficina_id', ofA);
  ok('legitimo: dono le a propria equipe (pagina Equipe)', (eqA || []).some((f) => f.profile_id === funcA.id), JSON.stringify(eqA));
  await donoOfA.a.from('funcionarios').update({ cargo: 'admin' }).eq('oficina_id', ofA);
  await donoOfA.a.from('funcionarios').delete().eq('oficina_id', ofA);
  const { data: eqA2 } = await sb.from('funcionarios').select('cargo').eq('oficina_id', ofA).eq('profile_id', funcA.id);
  ok('dono NAO altera nem apaga funcionario direto pela API (so pela rota)', (eqA2 || []).length === 1 && eqA2[0].cargo === 'mecanico', JSON.stringify(eqA2));
  const funcI = await conta('oficina');
  await sb.from('funcionarios').insert({ oficina_id: ofI, profile_id: funcI.id, nome: 'FuncI', cargo: 'mecanico', ativo: true });
  ok('funcionario de oficina INATIVA NAO ve cotacao de outra oficina', !(await veCotacao(funcI.a, cotA)));
  ok('legitimo: funcionario de oficina INATIVA ve a cotacao da propria oficina', await veCotacao(funcI.a, cotI));
  ok('loja ATIVA ve a cotacao de oficina inativa (comportamento atual, fixado)', await veCotacao(donoLjA.a, cotI));

  // 5) cliente com pedido continua vendo a oficina do orcamento (086 intacto)
  const { data: v } = await motorista.a.from('veiculos').insert({ profile_id: motorista.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: 'Fabia', fipe_ano: '2018' }).select('id').single();
  const { data: s } = await motorista.a.from('solicitacoes').insert({ cliente_id: motorista.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'teste 090', urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  sols.push(s.id);
  const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const { error: eOrc } = await donoOfA.a.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: ofA, valor_total: 300, prazo_dias: 2, tempo_execucao_horas: 3, validade: dia(10), garantia_dias: 30 });
  ok('legitimo: oficina ATIVA envia orcamento', !eOrc, eOrc?.message);
  ok('legitimo: motorista com orcamento ve o dono da oficina', await vePerfil(motorista.a, donoOfA.id));
} catch (e) {
  falhas++; console.log('FALHA execucao -', e.message);
} finally {
  for (const id of sols) { await sb.from('orcamentos').delete().eq('solicitacao_id', id); await sb.from('solicitacoes').delete().eq('id', id); }
  for (const id of ofs) { await sb.from('cotacoes_pecas').delete().eq('oficina_id', id); await sb.from('funcionarios').delete().eq('oficina_id', id); await sb.from('oficinas').delete().eq('id', id); }
  for (const id of lojas) await sb.from('lojas_pecas').delete().eq('id', id);
  for (const id of contas) { await sb.from('lojas_pecas').delete().eq('profile_id', id); await sb.from('oficinas').delete().eq('profile_id', id); await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
}
