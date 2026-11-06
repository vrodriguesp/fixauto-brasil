import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/api-auth';
import { limitarPorIp, dentroDoLimite } from '@/lib/rate-limit';
import { ErroValidacao, texto, email as validarEmail, validarImagens } from '@/lib/validacao';
import { idiomaDoSite } from '@/lib/site-url';
import { TERMOS_VERSAO } from '@/lib/termos';
import {
  validarPedido, criarPedido, guardarFotos, novoCodigo, hashCodigo, enviarCodigo,
  apagarPendente, limparPendentes, contarEtapa,
} from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';
const HORA = 60 * 60 * 1000;

// Pedido de orcamento sem cadastro (site e app; regras em lib/pedido-sem-conta.ts).
// Com login: cria o pedido na hora. Sem login: guarda o pedido, cria a conta
// (sem ativar) e manda o codigo de 6 digitos; o pedido so vai para as oficinas
// em /api/pedido-sem-conta/confirmar. E-mail de quem ja tem conta: 409
// CONTA_EXISTENTE (a tela pede a senha) ou, com modo 'codigo', o codigo vai
// para esse e-mail e o pedido entra na conta dele so depois do codigo.
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
    const telefone = texto(d.telefone, 'telefone', 30);
    const idioma = idiomaDoSite(typeof d.idioma === 'string' ? d.idioma : null);
    if (d.aceitouTermos !== true) throw new ErroValidacao('termos', 'TERMOS_OBRIGATORIOS');
    if (!dentroDoLimite(`pedido-sem-conta:${email.toLowerCase()}`, 5, HORA)) {
      return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    }

    const { data: existente } = await supabaseAdmin.from('profiles')
      .select('id, tipo, ativo').ilike('email', email.replace(/[%_\\]/g, '\\$&')).maybeSingle();
    let userIdPendente: string;
    let contaNova: boolean;
    if (existente) {
      if (d.modo !== 'codigo') {
        await contarEtapa(funil, 'conta_existente');
        return NextResponse.json({ error: 'Entre na sua conta', codigo: 'CONTA_EXISTENTE' }, { status: 409 });
      }
      if (existente.tipo !== 'cliente' || existente.ativo === false) {
        return NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 });
      }
      // avaliacao pendente: avisa ANTES do codigo (depois a pessoa perderia o que digitou)
      const { data: avaliar } = await supabaseAdmin.rpc('tem_avaliacao_pendente', { p_cliente: existente.id });
      if (avaliar === true) return NextResponse.json({ error: 'Avaliação pendente', codigo: 'AVALIACAO_PENDENTE' }, { status: 409 });
      // um pedido por codigo aberto por conta: o novo substitui o anterior
      const { data: abertos } = await supabaseAdmin.from('pedidos_pendentes').select('id, user_id, conta_nova, fotos').eq('user_id', existente.id);
      for (const p of abertos || []) await apagarPendente(p, true);
      userIdPendente = existente.id;
      contaNova = false;
    } else {
      const senha = typeof d.senha === 'string' ? d.senha : '';
      if (senha.length < 8 || senha.length > 72) throw new ErroValidacao('senha curta', 'SENHA_CURTA');
      // pedido anterior deste e-mail ainda sem codigo: reaproveita a conta (nova senha) e troca o pedido
      const { data: anteriores } = await supabaseAdmin.from('pedidos_pendentes')
        .select('id, user_id, conta_nova, fotos').ilike('email', email.replace(/[%_\\]/g, '\\$&')).eq('conta_nova', true);
      const anterior = anteriores?.[0];
      if (anterior) {
        for (const p of anteriores!) await apagarPendente(p, p.user_id === anterior.user_id);
        await supabaseAdmin.auth.admin.updateUserById(anterior.user_id, { password: senha });
        userIdPendente = anterior.user_id;
        reaproveitado = anterior.user_id;
      } else {
        const { data: auth, error } = await supabaseAdmin.auth.admin.createUser({
          email, password: senha, email_confirm: false, user_metadata: { tipo: 'cliente', idioma, origem: 'pedido_sem_conta' },
        });
        if (error || !auth.user) {
          // conta so no auth (cadastro pela metade): trata como conta existente
          if (/already|registered|exists/i.test(error?.message || '')) {
            return NextResponse.json({ error: 'Entre na sua conta', codigo: 'CONTA_EXISTENTE' }, { status: 409 });
          }
          throw new Error(error?.message || 'createUser falhou');
        }
        userIdPendente = auth.user.id;
        criadoUser = auth.user.id;
      }
      contaNova = true;
    }

    const id = randomUUID();
    const codigo = novoCodigo();
    const caminhos = await guardarFotos(id, fotos);
    const { error: pErro } = await supabaseAdmin.from('pedidos_pendentes').insert({
      id, user_id: userIdPendente, conta_nova: contaNova, email, nome, telefone, idioma, origem,
      dados: pedido, fotos: caminhos, codigo_hash: hashCodigo(id, codigo),
      termos_aceitos_em: new Date().toISOString(), termos_versao: TERMOS_VERSAO,
    });
    if (pErro) throw new Error(pErro.message);
    criadoUser = null; reaproveitado = null; // dali em diante a limpeza das 24 h cuida da conta
    const enviado = await enviarCodigo(email, nome, codigo, idioma);
    if (!enviado) {
      await apagarPendente({ id, user_id: userIdPendente, conta_nova: contaNova, fotos: caminhos });
      throw new Error('e-mail do codigo nao enviado');
    }
    await contarEtapa(funil, 'codigo_enviado');
    limparPendentes().catch((e) => console.error('[pedido-sem-conta] limpeza', e));
    return NextResponse.json({ pendenteId: id, email, contaNova });
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
