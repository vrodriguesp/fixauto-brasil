import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { sendPedidoPecaConfirmadoEmail } from '@/lib/notifications';

// So o envio do e-mail (a notificacao in-app ja e inserida direto pelo
// client, permitida pela policy publica de notificacoes) - separado numa
// rota minima porque o Resend so pode ser chamado do servidor.
export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId();
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { toEmail, toName, oficinaCompradoraNome, pecaDescricao, valorTotal } = await req.json();
    if (!toEmail || !pecaDescricao) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const result = await sendPedidoPecaConfirmadoEmail({
      toEmail,
      toName: toName || 'Fornecedor',
      oficinaCompradoraNome: oficinaCompradoraNome || 'Uma oficina',
      pecaDescricao,
      valorTotal: Number(valorTotal) || 0,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
