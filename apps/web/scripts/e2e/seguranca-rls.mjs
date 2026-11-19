// Teste de seguranca do banco (producao) - migracao 045 (auditoria Fable 08/10).
// Cada ataque com a chave publica deve falhar; cada acao legitima deve passar.
//   node seguranca-rls.mjs <.env.local>
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
const contas = []; const sols = []; const ofs = []; const ljs = [];
const conta = async (tipo) => {
  const email = `seg-${tipo}${contas.length}-${tag}@example.test`; const senha = `Seg${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo}`, email, idioma: 'et' });
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await a.auth.signInWithPassword({ email, password: senha });
  return { id: data.user.id, a };
};
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
try {
  const cli = await conta('cliente'); const of = await conta('oficina'); const outro = await conta('cliente');
  const { data: o } = await sb.from('oficinas').insert({ profile_id: of.id, nome_fantasia: `SEG ${tag}`, endereco: 'Narva mnt 5', cidade: 'Tallinn', estado: 'Harju', cep: '10117', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'] }).select('id').single();
  ofs.push(o.id);
  const { data: v } = await cli.a.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: 'Fabia', fipe_ano: '2018' }).select('id').single();
  const { data: vOutro } = await outro.a.from('veiculos').insert({ profile_id: outro.id, fipe_tipo: 'cars', fipe_marca: 'Audi', fipe_modelo: 'A4', fipe_ano: '2020' }).select('id').single();
  const { data: s } = await cli.a.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'teste', urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  sols.push(s.id);

  // C-01
  await cli.a.from('profiles').update({ tipo: 'admin' }).eq('id', cli.id);
  let { data: p } = await sb.from('profiles').select('tipo, ativo, nome').eq('id', cli.id).single();
  ok('C-01 cliente NAO vira admin', p.tipo === 'cliente', p.tipo);
  await sb.from('profiles').update({ ativo: false }).eq('id', outro.id);
  await outro.a.from('profiles').update({ ativo: true }).eq('id', outro.id);
  ({ data: p } = await sb.from('profiles').select('ativo').eq('id', outro.id).single());
  ok('C-01 conta desativada NAO se reativa', p.ativo === false);
  const { error: eNome } = await cli.a.from('profiles').update({ nome: 'Novo Nome', idioma: 'ru' }).eq('id', cli.id);
  ({ data: p } = await sb.from('profiles').select('nome, idioma').eq('id', cli.id).single());
  ok('C-01 legitimo: nome e idioma mudam', !eNome && p.nome === 'Novo Nome' && p.idioma === 'ru', eNome?.message);

  // A-03
  const { data: orc, error: eOrc } = await of.a.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: o.id, valor_total: 500, prazo_dias: 2, tempo_execucao_horas: 4, validade: dia(10), garantia_dias: 30 }).select('id').single();
  ok('legitimo: oficina envia orcamento', !eOrc, eOrc?.message);
  const { error: eVal } = await cli.a.from('orcamentos').update({ valor_total: 1 }).eq('id', orc.id);
  let { data: oo } = await sb.from('orcamentos').select('valor_total, status').eq('id', orc.id).single();
  ok('A-03 cliente NAO muda o valor', Number(oo.valor_total) === 500, `${oo.valor_total} ${eVal?.message || ''}`);
  const { error: eAc } = await cli.a.from('orcamentos').update({ status: 'aceito' }).eq('id', orc.id);
  ({ data: oo } = await sb.from('orcamentos').select('status').eq('id', orc.id).single());
  ok('A-03 cliente NAO aceita fora da rota', oo.status !== 'aceito', `${oo.status} ${eAc?.message || ''}`);
  const { error: eEd } = await of.a.from('orcamentos').update({ valor_total: 450, garantia_dias: 60 }).eq('id', orc.id);
  ({ data: oo } = await sb.from('orcamentos').select('valor_total').eq('id', orc.id).single());
  ok('legitimo: oficina revisa orcamento ainda nao aceito', !eEd && Number(oo.valor_total) === 450, eEd?.message);
  const { error: eRec } = await cli.a.from('orcamentos').update({ status: 'recusado' }).eq('id', orc.id);
  ({ data: oo } = await sb.from('orcamentos').select('status').eq('id', orc.id).single());
  ok('legitimo: cliente recusa', !eRec && oo.status === 'recusado', eRec?.message);
  await sb.from('orcamentos').update({ status: 'aceito' }).eq('id', orc.id);
  const { error: eAceito } = await of.a.from('orcamentos').update({ valor_total: 9999 }).eq('id', orc.id);
  ({ data: oo } = await sb.from('orcamentos').select('valor_total').eq('id', orc.id).single());
  ok('A-03 oficina NAO altera orcamento aceito', Number(oo.valor_total) === 450, `${oo.valor_total} ${eAceito?.message || ''}`);

  // A-04
  const { error: eSt } = await cli.a.from('solicitacoes').update({ status: 'concluida' }).eq('id', s.id);
  let { data: ss } = await sb.from('solicitacoes').select('status, veiculo_id').eq('id', s.id).single();
  ok('A-04 cliente NAO conclui o proprio pedido', ss.status !== 'concluida', `${ss.status} ${eSt?.message || ''}`);
  await cli.a.from('solicitacoes').update({ veiculo_id: vOutro.id }).eq('id', s.id);
  ({ data: ss } = await sb.from('solicitacoes').select('veiculo_id').eq('id', s.id).single());
  ok('A-04 cliente NAO poe carro de outra pessoa', ss.veiculo_id === v.id);
  const { error: eDesc } = await cli.a.from('solicitacoes').update({ descricao: 'teste editado' }).eq('id', s.id);
  ok('legitimo: cliente edita a descricao', !eDesc, eDesc?.message);
  const { data: s2 } = await cli.a.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'cancelar', urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  sols.push(s2.id);
  const { error: eCanc } = await cli.a.from('solicitacoes').update({ status: 'cancelada' }).eq('id', s2.id);
  ok('legitimo: cliente cancela pedido aberto', !eCanc, eCanc?.message);

  // A-08
  const { data: ag } = await sb.from('agenda').insert({ oficina_id: o.id, solicitacao_id: s.id, titulo: 't', data_inicio: new Date().toISOString(), data_fim: new Date(Date.now() + 3600e3).toISOString(), status: 'em_andamento', tipo: 'plataforma' }).select('id').single();
  const { error: eEt } = await of.a.from('manutencao_etapas').insert({ agenda_id: ag?.id, status: 'concluido' });
  ok('A-08 etapa direto no banco recusada (so /api/servico)', !!eEt, eEt?.message);

  // A-09 / M-17
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: eMet } = await anon.from('plataforma_metricas').select('*').limit(1);
  ok('A-09 plataforma_metricas fechada', !!eMet, eMet?.message);
  const { error: eLead } = await anon.from('leads_parceiros').insert({ tipo: 'oficina', nome_responsavel: 'x', nome_negocio: 'x', cidade: 'x', estado: 'x', whatsapp: '1' });
  ok('M-17 lead direto recusado', !!eLead, eLead?.message);

  // M-06
  await of.a.from('oficinas').update({ avaliacao_media: 5, total_avaliacoes: 999, descricao: 'nova descricao' }).eq('id', o.id);
  const { data: oo2 } = await sb.from('oficinas').select('avaliacao_media, total_avaliacoes, descricao').eq('id', o.id).single();
  ok('M-06 oficina NAO escreve a propria nota', Number(oo2.total_avaliacoes || 0) !== 999, JSON.stringify(oo2));
  ok('legitimo: oficina edita a descricao', oo2.descricao === 'nova descricao');

  // M-09: cliente sem relacao com a oficina nao le e-mail/telefone do dono
  const { data: pDono } = await outro.a.from('profiles').select('email, telefone').eq('id', of.id).maybeSingle();
  ok('M-09 cliente sem relacao NAO ve contato do dono da oficina', !pDono, JSON.stringify(pDono));
  const { data: pDono2 } = await cli.a.from('profiles').select('email').eq('id', of.id).maybeSingle();
  ok('M-09 legitimo: cliente com orcamento ve o dono da oficina', !!pDono2);

  // M-10: oficina nao aprovada nao ve pedido aberto nem orca
  const of2 = await conta('oficina');
  const { data: o2 } = await sb.from('oficinas').insert({ profile_id: of2.id, nome_fantasia: `SEG2 ${tag}`, endereco: 'Narva mnt 7', cidade: 'Tallinn', estado: 'Harju', cep: '10117', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: false, raio_atendimento_km: 30, especialidades: ['mecanica'] }).select('id').single();
  ofs.push(o2.id);
  const { data: s3 } = await cli.a.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'aberto', urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  sols.push(s3.id);
  const { data: vis } = await of2.a.from('solicitacoes').select('id').eq('id', s3.id);
  ok('M-10 oficina nao aprovada NAO ve pedido aberto', !(vis || []).length);
  const { error: eOrc2 } = await of2.a.from('orcamentos').insert({ solicitacao_id: s3.id, oficina_id: o2.id, valor_total: 10, prazo_dias: 1, tempo_execucao_horas: 1, validade: dia(5) });
  ok('M-10 oficina nao aprovada NAO orca', !!eOrc2, eOrc2?.message);
  const { data: vis2 } = await of.a.from('solicitacoes').select('id').eq('id', s3.id);
  ok('M-10 legitimo: oficina aprovada ve o pedido aberto', (vis2 || []).length === 1);

  // L-01..L-07 (migracao 098, 18/11): lojas_pecas era SELECT USING(true) para todos - a chave publica lia todas as
  // colunas (registro/cnpj, IVA, coordenadas, colunas da 097). Agora: so a propria loja, admin e oficinas.
  const lj = await conta('loja_pecas'); const lj2c = await conta('loja_pecas');
  const baseL = { endereco: 'Narva mnt 9', cidade: 'Tallinn', estado: 'Harju', cep: '10117', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true };
  const { data: l1, error: eL1 } = await sb.from('lojas_pecas').insert({ profile_id: lj.id, nome_fantasia: `SEG LOJA ${tag}`, cnpj: `REG-${tag}`, ...baseL }).select('id').single();
  const { data: l2, error: eL2 } = await sb.from('lojas_pecas').insert({ profile_id: lj2c.id, nome_fantasia: `SEG LOJA2 ${tag}`, cnpj: `REG2-${tag}`, ...baseL }).select('id').single();
  if (eL1 || eL2) throw new Error(`loja: ${eL1?.message || eL2?.message}`);
  ljs.push(l1.id, l2.id);
  const anonC = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: lA } = await anonC.from('lojas_pecas').select('id, cnpj, nome_fantasia').eq('id', l1.id);
  const { data: lAll } = await anonC.from('lojas_pecas').select('id').limit(5);
  ok('L-01 anon (chave publica sem login) NAO le lojas_pecas (nem a linha, nem a lista)', !(lA || []).length && !(lAll || []).length, JSON.stringify({ lA, n: (lAll || []).length }));
  const { error: eAU } = await anonC.from('lojas_pecas').update({ nome_fantasia: 'hack' }).eq('id', l1.id);
  const { data: l1d } = await sb.from('lojas_pecas').select('nome_fantasia').eq('id', l1.id).single();
  ok('L-02 anon NAO altera loja', l1d.nome_fantasia === `SEG LOJA ${tag}`, eAU?.message);
  const { data: lCli } = await cli.a.from('lojas_pecas').select('id, cnpj').eq('id', l1.id);
  ok('L-03 motorista logado NAO le loja de pecas', !(lCli || []).length, JSON.stringify(lCli));
  const { data: lOutra } = await lj2c.a.from('lojas_pecas').select('id, cnpj').eq('id', l1.id);
  ok('L-04 outra loja NAO le a concorrente', !(lOutra || []).length, JSON.stringify(lOutra));
  const { data: lPropria, error: ePropria } = await lj.a.from('lojas_pecas').select('*').eq('profile_id', lj.id).single();
  ok('L-05 legitimo: a loja le a propria linha inteira (perfil / auth-context select *)', !ePropria && lPropria?.id === l1.id && lPropria?.cnpj === `REG-${tag}`, ePropria?.message);
  const { error: eUpdL } = await lj.a.from('lojas_pecas').update({ cidade: 'Tartu' }).eq('id', l1.id);
  ok('L-06 legitimo: a loja continua salvando o proprio perfil', !eUpdL && (await sb.from('lojas_pecas').select('cidade').eq('id', l1.id).single()).data?.cidade === 'Tartu', eUpdL?.message);
  const { data: lOf } = await of.a.from('lojas_pecas').select('id, nome_fantasia, pais').in('id', [l1.id, l2.id]);
  const { data: lOf2 } = await of2.a.from('lojas_pecas').select('id, nome_fantasia').eq('id', l1.id);
  ok('L-07 legitimo: oficina (aprovada ou nao) le nome/pais das lojas (telas de pecas, conversa)', (lOf || []).length === 2 && (lOf2 || []).length === 1 && lOf.some((x) => x.nome_fantasia === `SEG LOJA ${tag}`), JSON.stringify({ n: (lOf || []).length, n2: (lOf2 || []).length }));

  // N-01..N-07 (migracao 101, dono 19/11): antes do aceite a oficina NAO le o nome/foto do cliente (so o codigo) nem a
  // rua do pedido (so a area); depois do aceite, tudo como antes. A pausa dos avisos so na propria linha.
  const { data: sN } = await cli.a.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'privacidade', urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Narva mnt 7, 10117 Tallinn, Estonia' }).select('id, area').single();
  sols.push(sN.id);
  // o orcamento de A-03 ficou 'aceito' (pedido s): sem ele a oficina ainda nao atende este cliente
  await sb.from('orcamentos').update({ status: 'enviado' }).eq('id', orc.id);
  ok('N-01 area derivada = bairro/cidade, sem rua nem codigo postal', sN.area === 'Tallinn, Estonia', sN.area);
  const { data: rc1 } = await of.a.rpc('resumo_clientes', { p_ids: [cli.id] });
  ok('N-02 oficina no raio SEM aceite: resumo_clientes da codigo mas NAO nome/foto', (rc1 || []).length === 1 && rc1[0].codigo != null && rc1[0].nome == null && rc1[0].avatar_url == null, JSON.stringify(rc1));
  const { data: rp1 } = await of.a.rpc('resumo_clientes_pedidos', { p_sols: [sN.id] });
  ok('N-03 resumo_clientes_pedidos SEM aceite: codigo sim, nome nao', (rp1 || []).length === 1 && rp1[0].codigo != null && rp1[0].nome == null, JSON.stringify(rp1));
  const { data: rpOutro } = await outro.a.rpc('resumo_clientes_pedidos', { p_sols: [sN.id] });
  ok('N-04 outro motorista NAO le o resumo do cliente pelo pedido', !(rpOutro || []).length, JSON.stringify(rpOutro));
  const { data: oN } = await sb.from('orcamentos').insert({ solicitacao_id: sN.id, oficina_id: o.id, valor_total: 100, prazo_dias: 1, tempo_execucao_horas: 1, validade: dia(10), status: 'aceito' }).select('id').single();
  const { data: rp2 } = await of.a.rpc('resumo_clientes_pedidos', { p_sols: [sN.id] });
  const { data: rc2 } = await of.a.rpc('resumo_clientes', { p_ids: [cli.id] });
  ok('N-05 legitimo: com orcamento ACEITO a oficina le o nome (por pedido e por cliente)', rp2?.[0]?.nome === 'Novo Nome' && rc2?.[0]?.nome === 'Novo Nome', JSON.stringify({ rp2, rc2 }));
  const { data: rpSelf } = await cli.a.rpc('resumo_clientes_pedidos', { p_sols: [sN.id] });
  ok('N-05 legitimo: o proprio cliente le o proprio nome', rpSelf?.[0]?.nome === 'Novo Nome');
  await sb.from('orcamentos').delete().eq('id', oN.id);
  const { error: ePausa } = await of.a.from('profiles').update({ avisos_pausados_ate: new Date(Date.now() + 7 * 86400000).toISOString() }).eq('id', of.id);
  const { data: pPausa } = await sb.from('profiles').select('avisos_pausados_ate').eq('id', of.id).single();
  ok('N-06 legitimo: oficina pausa os proprios avisos', !ePausa && !!pPausa?.avisos_pausados_ate, ePausa?.message);
  await cli.a.from('profiles').update({ avisos_pausados_ate: null }).eq('id', of.id);
  const { data: pPausa2 } = await sb.from('profiles').select('avisos_pausados_ate').eq('id', of.id).single();
  ok('N-07 outro usuario NAO mexe na pausa alheia', !!pPausa2?.avisos_pausados_ate);
  await sb.from('profiles').update({ avisos_pausados_ate: null }).eq('id', of.id);
  await sb.from('orcamentos').update({ status: 'aceito' }).eq('id', orc.id);

  // M-05: avisos em massa pelo navegador sao barrados
  let barrado = false;
  for (let i = 0; i < 45 && !barrado; i++) {
    const { error } = await cli.a.from('notificacoes').insert({ profile_id: of.id, tipo: 'teste', titulo: 'x', mensagem: 'x', dados: { solicitacao_id: s.id } });
    if (error) barrado = true;
  }
  ok('M-05 avisos em massa barrados (limite por hora)', barrado);
  await sb.from('notificacoes').delete().eq('tipo', 'teste');
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 600)); }
finally {
  for (const sid of sols) {
    const { data: ags } = await sb.from('agenda').select('id').eq('solicitacao_id', sid);
    for (const a of ags || []) { await sb.from('manutencao_etapas').delete().eq('agenda_id', a.id); await sb.from('agenda_historico').delete().eq('agenda_id', a.id); }
    await sb.from('agenda').delete().eq('solicitacao_id', sid);
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sid);
    for (const x of orcs || []) { await sb.from('orcamento_itens').delete().eq('orcamento_id', x.id); await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', x.id); }
    await sb.from('orcamentos').delete().eq('solicitacao_id', sid);
    await sb.from('solicitacoes').delete().eq('id', sid);
  }
  for (const oid of ofs) await sb.from('oficinas').delete().eq('id', oid);
  for (const lid of ljs) await sb.from('lojas_pecas').delete().eq('id', lid);
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
