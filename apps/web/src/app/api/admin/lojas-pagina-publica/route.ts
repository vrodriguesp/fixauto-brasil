import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { paginaPublicaGlobal } from '@/lib/loja-publica';

export const dynamic = 'force-dynamic';

// Pecas lote 4 (18/11): interruptor global da pagina publica das lojas (plataforma_config.lojas_pagina_publica_ativo,
// migracao 094). Separado do pecas_v3_ativo: a pagina mostra avaliacoes a visitantes, o que os termos so cobrem
// depois do texto novo + aviso de 30 dias (Mapa_lote4.md sec. 0). Desligado: so lojas de conta de teste. Com auditoria.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ativo: await paginaPublicaGlobal() });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  if (typeof corpo.ativo !== 'boolean') return NextResponse.json({ error: 'ativo deve ser true/false' }, { status: 400 });
  const antes = await paginaPublicaGlobal();
  const { error } = await supabaseAdmin.from('plataforma_config').upsert({ id: 1, lojas_pagina_publica_ativo: corpo.ativo, updated_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarAuditoria(supabaseAdmin, {
    adminId: auth.userId, entidade: 'plataforma_config', entidadeId: null, acao: 'lojas_pagina_publica_ativo',
    antes: { lojas_pagina_publica_ativo: antes }, depois: { lojas_pagina_publica_ativo: corpo.ativo },
  });
  return NextResponse.json({ ativo: corpo.ativo });
}
