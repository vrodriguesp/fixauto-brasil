import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { dentroDoLimite } from '@/lib/rate-limit';
import { garantirTraducaoDescricao } from '@/lib/traduzir-descricao';

export const dynamic = 'force-dynamic';

// Chamada pela tela "Perfil" da oficina logo depois de gravar: traduz a descricao
// para as linguas do site UMA vez (so se mudou) e guarda em descricao_traducoes
// (migracao 099). So o dono (profile_id) ou um funcionario da propria oficina.
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const corpo = await request.json().catch(() => null);
  const oficinaId = String(corpo?.oficina_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(oficinaId)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  const { data: of } = await supabaseAdmin.from('oficinas').select('id, profile_id').eq('id', oficinaId).maybeSingle();
  let permitido = !!of && of.profile_id === userId;
  if (of && !permitido) {
    const { data: func } = await supabaseAdmin.from('funcionarios').select('id').eq('oficina_id', oficinaId).eq('profile_id', userId).eq('ativo', true).maybeSingle();
    permitido = !!func;
  }
  if (!permitido) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  // o provedor gratis e limitado: no maximo 5 traducoes por hora por oficina (o hash evita repetir texto igual)
  if (!dentroDoLimite(`traduzir-descricao:${oficinaId}`, 5, 60 * 60 * 1000)) return NextResponse.json({ ok: false, limite: true });
  const r = await garantirTraducaoDescricao(oficinaId);
  return NextResponse.json({ ok: true, traduziu: r.traduziu, linguas: Object.keys(r.traducoes || {}).filter((k) => !['origem', 'hash'].includes(k)) });
}
