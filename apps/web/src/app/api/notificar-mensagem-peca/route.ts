import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { sendMensagemPecaEmail } from '@/lib/notifications';
import { notifMensagemPeca } from '@/lib/notif-i18n';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { emTodasAsLinguas } from '@/lib/notif-textos';
import { enviarPushNavegador } from '@/lib/push-navegador';

// A2 (16/11): mensagem nova na conversa de um pedido de peca -> aviso no sino da
// outra parte (oficina compradora <-> loja / oficina vendedora). Antes ninguem era
// avisado. Para nao virar spam:
//  - sino: 1 aviso nao lido por conversa (se ja ha um nao lido, nao cria outro);
//  - e-mail: no maximo 1 por conversa por hora (conta os avisos da ultima hora).
// Quem chama tem de ser o remetente da mensagem e parte da conversa.
// Lote 1 (17/11): conta de teste e conta real nao se avisam (a conversa de teste com uma
// loja real nao gera sino nem e-mail para ela, e vice-versa) -> { avisado: false }.
export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
    if (!callerId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!dentroDoLimite(`msg-peca-u:${callerId}`, 120, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }
    const { mensagemId } = await req.json();
    if (!mensagemId) return NextResponse.json({ error: 'mensagemId obrigatório' }, { status: 400 });

    const { data: msg } = await supabaseAdmin
      .from('cotacoes_pecas_mensagens')
      .select('id, cotacao_id, fornecedor_tipo, fornecedor_id, remetente_id')
      .eq('id', mensagemId)
      .maybeSingle();
    if (!msg || msg.remetente_id !== callerId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    const [{ data: cot }, { data: fornecedor }, { data: resposta }] = await Promise.all([
      supabaseAdmin.from('cotacoes_pecas')
        .select('id, peca_descricao, oficina:oficinas!cotacoes_pecas_oficina_id_fkey(id, profile_id, nome_fantasia, profile:profiles!oficinas_profile_id_fkey(email, nome, idioma, conta_teste))')
        .eq('id', msg.cotacao_id).single(),
      msg.fornecedor_tipo === 'loja'
        ? supabaseAdmin.from('lojas_pecas').select('id, profile_id, nome_fantasia, profile:profiles(email, nome, idioma, conta_teste)').eq('id', msg.fornecedor_id).maybeSingle()
        : supabaseAdmin.from('oficinas').select('id, profile_id, nome_fantasia, profile:profiles!oficinas_profile_id_fkey(email, nome, idioma, conta_teste)').eq('id', msg.fornecedor_id).maybeSingle(),
      supabaseAdmin.from('cotacoes_pecas_respostas').select('id')
        .eq('cotacao_id', msg.cotacao_id)
        .eq(msg.fornecedor_tipo === 'loja' ? 'loja_id' : 'oficina_fornecedora_id', msg.fornecedor_id)
        .limit(1).maybeSingle(),
    ]);
    const compradora = (cot as any)?.oficina;
    const forn = fornecedor as any;
    if (!cot || !compradora || !forn) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const souCompradora = compradora.profile_id === callerId;
    const souFornecedor = forn.profile_id === callerId;
    if (!souCompradora && !souFornecedor) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    // paridade teste x real: a conversa existe (gravada antes da 091 ou pela compradora), mas ninguem e avisado
    if (!!compradora.profile?.conta_teste !== !!forn.profile?.conta_teste) return NextResponse.json({ success: true, avisado: false });

    // destinatario, nome de quem escreveu (empresa, nao a pessoa) e o link da conversa para ele
    const dest = souCompradora ? { profileId: forn.profile_id, perfil: forn.profile } : { profileId: compradora.profile_id, perfil: compradora.profile };
    const remetenteNome = souCompradora ? compradora.nome_fantasia : forn.nome_fantasia;
    const q = `cotacaoId=${cot.id}&pecaDescricao=${encodeURIComponent(cot.peca_descricao || '')}`;
    const nomeCompradora = encodeURIComponent(compradora.nome_fantasia || '');
    let link: string;
    if (souCompradora) {
      link = msg.fornecedor_tipo === 'loja'
        ? (resposta ? `/loja/conversa/${resposta.id}` : `/loja/conversa/nova?${q}&oficinaNome=${nomeCompradora}`)
        : (resposta ? `/oficina/pecas/conversa/${resposta.id}` : `/oficina/pecas/conversa/nova?${q}&compradoraNome=${nomeCompradora}`);
    } else {
      link = resposta
        ? `/oficina/pecas/conversa/${resposta.id}`
        : `/oficina/pecas/conversa/nova?${q}&fornecedorTipo=${msg.fornecedor_tipo}&fornecedorId=${msg.fornecedor_id}`;
    }
    const conversa = `${cot.id}:${msg.fornecedor_tipo}:${msg.fornecedor_id}`;

    const umaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [{ data: naoLido }, { count: naUltimaHora }] = await Promise.all([
      supabaseAdmin.from('notificacoes').select('id').eq('profile_id', dest.profileId).eq('tipo', 'mensagem_peca')
        .eq('lida', false).eq('dados->>conversa', conversa).limit(1),
      supabaseAdmin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('profile_id', dest.profileId).eq('tipo', 'mensagem_peca')
        .eq('dados->>conversa', conversa).gte('created_at', umaHora),
    ]);
    if (naoLido?.length) return NextResponse.json({ success: true, avisado: false });

    const n = notifMensagemPeca(dest.perfil?.idioma, remetenteNome, cot.peca_descricao);
    await supabaseAdmin.from('notificacoes').insert({
      profile_id: dest.profileId,
      tipo: 'mensagem_peca',
      titulo: n.titulo,
      mensagem: n.mensagem,
      dados: { cotacao_id: cot.id, conversa, link, textos: emTodasAsLinguas((l) => notifMensagemPeca(l, remetenteNome, cot.peca_descricao)) },
    });
    // lote 3c (D-8): mensagem tambem no navegador de quem ligou o aviso (sem inscricao, nada sai)
    enviarPushNavegador(dest.profileId, { titulo: n.titulo, mensagem: n.mensagem, link }).catch(() => {});

    let email = false;
    if (!naUltimaHora && dest.perfil?.email) {
      const r = await sendMensagemPecaEmail({
        toEmail: dest.perfil.email,
        toName: dest.perfil.nome || '',
        remetente: remetenteNome || '-',
        pecaDescricao: cot.peca_descricao,
        linkInterno: link,
        locale: dest.perfil.idioma || undefined,
      }).catch(() => ({ success: false }));
      email = !!r.success;
    }
    return NextResponse.json({ success: true, avisado: true, email });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
