import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionUserId } from '@/lib/api-auth';
import { sendCotacaoPecaRespondidaEmail } from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// A loja/oficina que responde uma cotacao nao e dona dela (a oficina
// compradora e), entao a policy de UPDATE de cotacoes_pecas bloqueia
// silenciosamente esse update vindo do client. Mesma causa-raiz do bug de
// avaliacao/oficina. Tambem centraliza aqui a notificacao (in-app + email)
// pra compradora, que antes era duplicada em cada tela de resposta
// (loja/cotacoes e oficina/pecas).
export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId();
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { cotacaoId } = await req.json();
    if (!cotacaoId) {
      return NextResponse.json({ error: 'cotacaoId obrigatório' }, { status: 400 });
    }

    const { data: respostas } = await supabaseAdmin
      .from('cotacoes_pecas_respostas')
      .select(`
        id, fornecedor_tipo, preco, prazo_dias,
        loja:lojas_pecas(profile_id, nome_fantasia),
        oficina_fornecedora:oficinas!cotacoes_pecas_respostas_oficina_fornecedora_id_fkey(profile_id, nome_fantasia)
      `)
      .eq('cotacao_id', cotacaoId)
      .order('created_at', { ascending: false });

    // So quem de fato respondeu essa cotacao (loja ou oficina
    // fornecedora dona da linha em cotacoes_pecas_respostas) pode marca-la
    // como respondida - sem isso, qualquer cotacaoId aberto podia ser
    // escondido de outros fornecedores sem nenhuma resposta real.
    const minhaResposta = (respostas || []).find((r: any) => {
      const fornecedorProfileId = r.fornecedor_tipo === 'loja' ? r.loja?.profile_id : r.oficina_fornecedora?.profile_id;
      return fornecedorProfileId === callerId;
    }) as any;
    if (!minhaResposta) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    await supabaseAdmin
      .from('cotacoes_pecas')
      .update({ status: 'respondida' })
      .eq('id', cotacaoId)
      .eq('status', 'aberta');

    const { data: cotacao } = await supabaseAdmin
      .from('cotacoes_pecas')
      .select('peca_descricao, oficina:oficinas(profile_id, profile:profiles(email, nome))')
      .eq('id', cotacaoId)
      .single();

    const compradoraProfile = (cotacao as any)?.oficina?.profile;
    if (compradoraProfile) {
      const fornecedorNome = minhaResposta.fornecedor_tipo === 'loja'
        ? minhaResposta.loja?.nome_fantasia
        : minhaResposta.oficina_fornecedora?.nome_fantasia;

      await supabaseAdmin.from('notificacoes').insert({
        profile_id: (cotacao as any).oficina.profile_id,
        tipo: 'cotacao_peca_respondida',
        titulo: 'Nova resposta de cotação de peça',
        mensagem: `${fornecedorNome} respondeu sua cotação de "${(cotacao as any).peca_descricao}"`,
        dados: { cotacao_id: cotacaoId },
      });

      if (compradoraProfile.email) {
        await sendCotacaoPecaRespondidaEmail({
          toEmail: compradoraProfile.email,
          toName: compradoraProfile.nome,
          fornecedorNome: fornecedorNome || 'Um fornecedor',
          pecaDescricao: (cotacao as any).peca_descricao,
          preco: minhaResposta.preco,
          prazoDias: minhaResposta.prazo_dias,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
