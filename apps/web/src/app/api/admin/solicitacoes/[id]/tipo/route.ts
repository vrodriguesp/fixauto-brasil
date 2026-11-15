import { NextRequest, NextResponse } from 'next/server';
import { TIPOS_SERVICO } from '@fixauto/shared';
import { requireAdmin } from '@/lib/admin-auth';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ErroValidacao, ehUuid, texto, umDe } from '@/lib/validacao';
import { quemJaRecebeu } from '@/lib/avisar-oficinas-pedido';
import { STATUS_TRIAGEM, umDeCadaVez } from '@/lib/triagem-pedido';

export const dynamic = 'force-dynamic';

const TIPOS = TIPOS_SERVICO.map((t) => t.value);

// Triagem (Lote 2, migracao 085): o admin corrige o tipo do pedido. SO grava o tipo e o historico
// (admin_auditoria 'mudar_tipo'): NENHUM aviso, e-mail ou push - avisar as oficinas do tipo novo e outro botao
// (.../avisar). Quem ja recebeu este pedido continua com acesso (decisao do dono 15/11): linha em
// pedido_convites com origem 'tipo_alterado', tambem sem aviso.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  let tipo: string, motivo: string | null;
  try {
    const b = await req.json().catch(() => ({}));
    tipo = umDe(b?.tipo, 'tipo', TIPOS);
    motivo = texto(b?.motivo, 'motivo', 500);
  } catch (e) {
    return NextResponse.json({ error: e instanceof ErroValidacao ? e.message : 'Dados inválidos' }, { status: 400 });
  }

  return umDeCadaVez(`tipo:${params.id}`, async () => {
    const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id, tipo, status, emergencia_id').eq('id', params.id).maybeSingle();
    if (!sol) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    // pedido de acidente: o tipo vem do fluxo do acidente (colisao, emergencia_oficinas_notificadas) - nao muda
    if (sol.emergencia_id) return NextResponse.json({ error: 'Pedido de acidente: o tipo não pode ser mudado.' }, { status: 409 });
    if (!STATUS_TRIAGEM.includes(sol.status)) return NextResponse.json({ error: 'Só um pedido aberto ou em orçamento pode mudar de tipo.' }, { status: 409 });
    if (sol.tipo === tipo) return NextResponse.json({ error: 'O pedido já tem este tipo.' }, { status: 409 });

    // so troca se ninguem mudou o tipo no meio (outra aba)
    const { data: mudou, error } = await supabaseAdmin.from('solicitacoes').update({ tipo }).eq('id', sol.id).eq('tipo', sol.tipo).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!mudou?.length) return NextResponse.json({ error: 'O tipo mudou enquanto você editava. Recarregue a página.' }, { status: 409 });

    // acesso mantido: toda oficina que ja recebeu este pedido (aviso no sino, orcamento ou "sem interesse")
    const j = await quemJaRecebeu(sol.id);
    const ids = new Set<string>([...Array.from(j.orcaram), ...Array.from(j.dispensaram)]);
    if (j.perfisAvisados.size) {
      const { data: dosAvisos } = await supabaseAdmin.from('oficinas').select('id').in('profile_id', Array.from(j.perfisAvisados));
      for (const o of dosAvisos || []) ids.add(o.id);
    }
    const novos = Array.from(ids).filter((id) => !j.convidadas.has(id));
    let erroAcesso: string | null = null;
    if (novos.length) {
      const { error: eIns } = await supabaseAdmin.from('pedido_convites')
        .upsert(novos.map((oficina_id) => ({ solicitacao_id: sol.id, oficina_id, convidado_por: auth.userId, origem: 'tipo_alterado' })), { onConflict: 'solicitacao_id,oficina_id', ignoreDuplicates: true });
      if (eIns) { erroAcesso = eIns.message; console.error('[admin/tipo] acesso mantido', eIns.message); }
    }

    await registrarAuditoria(supabaseAdmin, {
      adminId: auth.userId, entidade: 'solicitacao', entidadeId: sol.id, acao: 'mudar_tipo',
      antes: { tipo: sol.tipo }, depois: { tipo, acesso_mantido: erroAcesso ? [] : novos }, motivo, solicitacaoId: sol.id,
    });

    return NextResponse.json({ ok: true, antes: sol.tipo, tipo, acessoMantido: erroAcesso ? 0 : novos.length, avisadas: 0, ...(erroAcesso ? { aviso: 'Tipo salvo, mas o acesso de quem já tinha recebido não foi gravado.' } : {}) });
  });
}
