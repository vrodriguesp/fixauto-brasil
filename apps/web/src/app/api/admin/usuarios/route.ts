import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { excluirOuAnonimizarConta } from '@/lib/excluir-conta';
import { registrarAuditoria } from '@/lib/admin-auditoria';


export const dynamic = 'force-dynamic';

// PATCH: edit nome/telefone, and/or ativar/desativar a user account.
// Deactivating the owner of an oficina also deactivates the oficina itself
// (clients shouldn't keep seeing/booking a workshop whose owner is disabled).
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { id, nome, telefone, ativo } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    const updates: Record<string, string | boolean> = {};
    if (nome !== undefined) updates.nome = nome;
    if (telefone !== undefined) updates.telefone = telefone;
    if (ativo !== undefined) updates.ativo = ativo;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('profiles').update(updates).eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (ativo !== undefined) {
      await supabaseAdmin.from('oficinas').update({ ativa: ativo }).eq('profile_id', id);
      await supabaseAdmin.from('lojas_pecas').update({ ativa: ativo }).eq('profile_id', id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE: remove a conta - sem historico apaga; com historico anonimiza
// (lib/excluir-conta.ts, a mesma regra do "excluir minha conta").
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    // mesma regra da exclusao pelo proprio usuario: com historico anonimiza
    // (antes apagava em cascata comissoes e pedidos - auditoria B-03)
    const { data: alvo } = await supabaseAdmin.from('profiles').select('tipo').eq('id', id).maybeSingle();
    if (alvo?.tipo === 'admin') return NextResponse.json({ error: 'Conta de administrador' }, { status: 403 });
    const r = await excluirOuAnonimizarConta(id);
    if (r.erro === 'CARRO_EM_SERVICO') return NextResponse.json({ error: 'Há um carro em serviço desta conta. Conclua a entrega antes.', codigo: 'CARRO_EM_SERVICO' }, { status: 409 });
    if (r.erro) return NextResponse.json({ error: r.erro }, { status: 500 });
    await registrarAuditoria(supabaseAdmin, { adminId: auth.userId, entidade: 'profile', entidadeId: id, acao: r.modo === 'apagada' ? 'apagar_conta' : 'anonimizar_conta' });

    return NextResponse.json({ success: true, modo: r.modo });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
