import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/api-auth';
import { limitarPorIp, dentroDoLimite } from '@/lib/rate-limit';
import { ErroValidacao, texto, email as validarEmail, validarImagens } from '@/lib/validacao';
import { idiomaDoSite } from '@/lib/site-url';
import { TERMOS_VERSAO } from '@/lib/termos';
import {
  validarPedido, criarPedido, guardarFotos, novoCodigo, hashCodigo, enviarConfirmacao,
  apagarPendente, limparPendentes, contarEtapa, contaParaEmail,
} from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';
const HORA = 60 * 60 * 1000;

// Pedido de orcamento sem cadastro e sem senha (site e app; regras em
// lib/pedido-sem-conta.ts). Com login: cria o pedido na hora. Sem login: guarda o
// pedido, acha ou cria a conta (sem senha, sem ativar) e manda o e-mail com o
// codigo de 6 digitos e o botao (link); o pedido so vai para as oficinas em
// /confirmar (codigo) ou /retomar (link), que tambem entram na conta. E-mail que ja tem conta recebe o mesmo codigo e a
// resposta e a mesma ({ pendenteId, email }): nao revela quem tem conta.
export async function POST(req: NextRequest) {
  // O app so conta como logado com o proprio login (Authorization: Bearer). Um
  // cookie do site no mesmo aparelho/navegador nao vale: no teste local (site e
  // app em localhost) o pedido do app entrava na conta logada no site, ignorando
  // o e-mail digitado, e o app mostrava "pedido nao existe" (dono 06/11).
  const doApp = req.headers.get('x-bipfix-origem') === 'app';
  const userId = doApp && !req.headers.get('authorization')?.startsWith('Bearer ') ? null : await getSessionUserId(req);
  if (!limitarPorIp(req, 'pedido-sem-conta', userId ? 15 : 6, HORA)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  let criadoUser: string | null = null;
  let reaproveitado: string | null = null;
  try {
    const form = await req.formData();
    let d: Record<string, unknown>;
    try { d = JSON.parse(String(form.get('dados') || '{}')); } catch { throw new ErroValidacao('dados inválidos'); }
    // campo invisivel: so robo preenche
    if (typeof d.site === 'string' && d.site.trim()) throw new ErroValidacao('dados inválidos');
    const fotos = validarImagens(form.getAll('fotos').filter((f): f is File => f instanceof File), 6);
    const pedido = validarPedido(d);
    const origem = d.origem === 'app' ? 'app' : 'site';
    const funil = `pedido_${origem}`;

    // com login: igual ao pedido normal, sem codigo
    if (userId) {
      // so cliente ativo pede orcamento (conta desativada ou oficina/loja: nao)
      const { data: eu } = await supabaseAdmin.from('profiles').select('tipo, ativo').eq('id', userId).maybeSingle();
      if (eu?.tipo !== 'cliente' || eu.ativo === false) return NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 });
      const { data: pendente } = await supabaseAdmin.rpc('tem_avaliacao_pendente', { p_cliente: userId });
      if (pendente === true) return NextResponse.json({ error: 'Avaliação pendente', codigo: 'AVALIACAO_PENDENTE' }, { status: 409 });
      const caminhos = await guardarFotos(randomUUID(), fotos);
      const r = await criarPedido(userId, pedido, caminhos);
      await contarEtapa(funil, 'enviado_logado');
      return NextResponse.json({ solicitacaoId: r.id, numero: r.numero });
    }

    const nome = texto(d.nome, 'nome', 100, true)!;
    const email = validarEmail(d.email, true)!;
    // telefone so com "quero SMS" marcado (dono 13/11); app antigo sem o campo: como antes
    const telefone = d.querSms === false ? null : texto(d.telefone, 'telefone', 30);
    const idioma = idiomaDoSite(typeof d.idioma === 'string' ? d.idioma : null);
    if (d.aceitouTermos !== true) throw new ErroValidacao('termos', 'TERMOS_OBRIGATORIOS');
    if (!dentroDoLimite(`pedido-sem-conta:${email.toLowerCase()}`, 5, HORA)) {
      return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    }

    // conta existente (o codigo entra nela) ou nova, sem senha
    const conta = await contaParaEmail(email, idioma);
    if ('erro' in conta) {
      return conta.erro === 'SEM_ACESSO'
        ? NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 })
        : NextResponse.json({ error: 'Avaliação pendente', codigo: 'AVALIACAO_PENDENTE' }, { status: 409 });
    }
    if (conta.criada) criadoUser = conta.userId;
    else if (conta.contaNova) reaproveitado = conta.userId;
    // so para medir no funil (a resposta e a mesma)
    if (!conta.contaNova) await contarEtapa(funil, 'conta_existente');

    const id = randomUUID();
    const codigo = novoCodigo();
    const caminhos = await guardarFotos(id, fotos);
    const codigoHash = hashCodigo(id, codigo);
    const { data: novo, error: pErro } = await supabaseAdmin.from('pedidos_pendentes').insert({
      id, user_id: conta.userId, conta_nova: conta.contaNova, email, nome, telefone, idioma, origem,
      dados: pedido, fotos: caminhos, codigo_hash: codigoHash,
      termos_aceitos_em: new Date().toISOString(), termos_versao: TERMOS_VERSAO,
    }).select('created_at').single();
    if (pErro || !novo) throw new Error(pErro?.message || 'pendente nao gravado');
    criadoUser = null; reaproveitado = null; // dali em diante a limpeza das 24 h cuida da conta
    const enviado = await enviarConfirmacao({ id, email, nome, idioma, dados: pedido, created_at: novo.created_at, codigo_hash: codigoHash }, codigo);
    if (!enviado) {
      await apagarPendente({ id, user_id: conta.userId, conta_nova: conta.contaNova, fotos: caminhos });
      throw new Error('e-mail do codigo nao enviado');
    }
    await contarEtapa(funil, 'codigo_enviado');
    limparPendentes().catch((e) => console.error('[pedido-sem-conta] limpeza', e));
    return NextResponse.json({ pendenteId: id, email });
  } catch (e) {
    if (criadoUser) await supabaseAdmin.auth.admin.deleteUser(criadoUser).catch(() => {});
    // conta de um pedido anterior (ja apagado) reaproveitada e que ficou sem pedido:
    // apaga tambem, senao o e-mail ficaria preso numa conta que nunca sera ativada
    if (reaproveitado) {
      const { data: perfil } = await supabaseAdmin.from('profiles').select('id').eq('id', reaproveitado).maybeSingle();
      if (!perfil) await supabaseAdmin.auth.admin.deleteUser(reaproveitado).catch(() => {});
    }
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[pedido-sem-conta]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
