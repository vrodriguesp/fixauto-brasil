import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { configSuporte } from '@/lib/suporte';

// Chat de suporte, lado do admin (dono 03/11): lista das conversas, interruptor
// da traducao automatica e "admin online" (o painel do admin aberto manda um
// sinal a cada minuto; com ele online nao sai a mensagem automatica).

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { data: conversas } = await supabaseAdmin.from('suporte_conversas')
    .select('id, profile_id, visitante_nome, visitante_email, idioma, pagina, ultima_mensagem_em, nao_lidas_admin, usuario_visto_em, profile:profiles(nome, email, tipo)')
    .order('ultima_mensagem_em', { ascending: false }).limit(100);
  const ids = (conversas || []).map((c) => c.id);
  // ultima mensagem de cada conversa (para a previa da lista)
  const { data: ultimas } = ids.length
    ? await supabaseAdmin.from('suporte_mensagens').select('conversa_id, autor, texto, traducao, created_at').in('conversa_id', ids).order('created_at', { ascending: false }).limit(500)
    : { data: [] as any[] };
  const previa = new Map<string, any>();
  for (const m of ultimas || []) if (!previa.has(m.conversa_id)) previa.set(m.conversa_id, m);
  const cfg = await configSuporte();
  return NextResponse.json({
    traducao: cfg.traducao,
    conversas: (conversas || []).map((c: any) => {
      const u = previa.get(c.id);
      return {
        id: c.id, idioma: c.idioma, pagina: c.pagina, ultima: c.ultima_mensagem_em, naoLidas: c.nao_lidas_admin,
        nome: c.profile?.nome || c.visitante_nome || '?', email: c.profile?.email || c.visitante_email || '',
        tipo: c.profile?.tipo || 'visitante',
        previa: u ? { autor: u.autor, texto: (u.autor === 'usuario' && u.traducao) || u.texto } : null,
      };
    }),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  if (typeof corpo.traducao !== 'boolean') return NextResponse.json({ error: 'traducao deve ser true/false' }, { status: 400 });
  const { error } = await supabaseAdmin.from('plataforma_config').upsert({ id: 1, suporte_traducao: corpo.traducao, updated_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ traducao: corpo.traducao });
}

/** sinal de "admin online" + total de nao lidas (para o menu do admin) */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  // upsert: a linha unica pode faltar num banco novo
  await supabaseAdmin.from('plataforma_config').upsert({ id: 1, admin_visto_em: new Date().toISOString() }, { onConflict: 'id' });
  const { data } = await supabaseAdmin.from('suporte_conversas').select('nao_lidas_admin').gt('nao_lidas_admin', 0);
  return NextResponse.json({ naoLidas: (data || []).reduce((s, c) => s + c.nao_lidas_admin, 0) });
}
