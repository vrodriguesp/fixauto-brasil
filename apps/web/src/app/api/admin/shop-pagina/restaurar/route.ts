import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limparConteudo } from '@/lib/shop-pagina';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pecas lote 5: restaurar uma versao do historico = novo RASCUNHO com o conteudo dela (nada e publicado sozinho).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  if (!UUID.test(String(corpo.versaoId || ''))) return NextResponse.json({ error: 'versaoId' }, { status: 400 });
  const { data: v } = await supabaseAdmin.from('shop_pagina_versoes').select('id, conteudo, criado_em').eq('id', corpo.versaoId).maybeSingle();
  if (!v) return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
  const conteudo = limparConteudo((v as any).conteudo);
  const nota = `restaurada de ${new Date((v as any).criado_em).toISOString().slice(0, 16).replace('T', ' ')}`;
  const { data: nova, error } = await supabaseAdmin.from('shop_pagina_versoes').insert({ estado: 'rascunho', conteudo, nota, criado_por: auth.userId }).select('id').single();
  if (error || !nova) return NextResponse.json({ error: error?.message || 'erro' }, { status: 500 });
  return NextResponse.json({ id: nova.id, conteudo });
}
