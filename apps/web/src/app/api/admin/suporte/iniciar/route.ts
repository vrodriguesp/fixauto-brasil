import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { linguaValida } from '@/lib/suporte';

export const dynamic = 'force-dynamic';

// Admin comeca uma conversa de suporte com uma oficina, loja ou cliente (dono 19/11:
// "a caixa pela qual a gente se comunica com a oficina"). Antes so quem escrevia
// pelo balao do site abria a conversa. A conversa e a MESMA do balao (uma por conta,
// migracao 069): a pessoa ve no chat do site; a mensagem em si vai pela rota da
// conversa (/api/admin/suporte/<id>), com traducao e e-mail quando ela nao esta
// com o chat aberto, como qualquer resposta.
//   GET ?q=texto  -> contas para escolher (nome, e-mail, nome da oficina/loja, nº do cliente)
//   POST { profileId } -> { conversaId, nova }

const TIPOS = ['oficina', 'cliente', 'loja_pecas'];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  // sem os caracteres que mudam o filtro .or() do PostgREST (auditoria B-02)
  const q = (req.nextUrl.searchParams.get('q') || '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ contas: [] });
  const base = () => supabaseAdmin.from('profiles').select('id, nome, email, tipo, codigo, idioma, ativo').in('tipo', TIPOS).limit(20);
  let { data: perfis } = /^\d{3,9}$/.test(q)
    ? await base().eq('codigo', Number(q))
    : await base().or(`nome.ilike.%${q}%,email.ilike.%${q}%`);
  perfis = perfis || [];
  // tambem pelo nome da oficina / loja
  if (!/^\d{3,9}$/.test(q)) {
    const [{ data: ofs }, { data: ljs }] = await Promise.all([
      supabaseAdmin.from('oficinas').select('profile_id').ilike('nome_fantasia', `%${q}%`).limit(20),
      supabaseAdmin.from('lojas_pecas').select('profile_id').ilike('nome_fantasia', `%${q}%`).limit(20),
    ]);
    const ids = [...(ofs || []), ...(ljs || [])].map((x) => x.profile_id).filter((id) => id && !perfis!.some((p) => p.id === id));
    if (ids.length) {
      const { data: mais } = await supabaseAdmin.from('profiles').select('id, nome, email, tipo, codigo, idioma, ativo').in('id', ids).in('tipo', TIPOS);
      perfis = [...perfis, ...(mais || [])];
    }
  }
  const ids = perfis.map((p) => p.id);
  const [{ data: ofs }, { data: ljs }] = ids.length
    ? await Promise.all([supabaseAdmin.from('oficinas').select('profile_id, nome_fantasia').in('profile_id', ids), supabaseAdmin.from('lojas_pecas').select('profile_id, nome_fantasia').in('profile_id', ids)])
    : [{ data: [] }, { data: [] }];
  const empresa = new Map([...(ofs || []), ...(ljs || [])].map((x) => [x.profile_id, x.nome_fantasia]));
  return NextResponse.json({
    contas: perfis.slice(0, 20).map((p) => ({ id: p.id, nome: p.nome, email: p.email, tipo: p.tipo, codigo: p.codigo, idioma: p.idioma, ativo: p.ativo, empresa: empresa.get(p.id) || null })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  const profileId = String(corpo.profileId || '');
  if (!/^[0-9a-f-]{36}$/.test(profileId)) return NextResponse.json({ error: 'profileId inválido' }, { status: 400 });
  const { data: perfil } = await supabaseAdmin.from('profiles').select('id, tipo, idioma').eq('id', profileId).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 });
  if (!TIPOS.includes(perfil.tipo)) return NextResponse.json({ error: 'Só oficina, loja ou cliente' }, { status: 400 });
  const { data: existente } = await supabaseAdmin.from('suporte_conversas').select('id, arquivada_em').eq('profile_id', profileId).maybeSingle();
  if (existente) {
    // arquivada (migracao 112): o admin quis falar com a conta de novo -> volta para Ativas
    if (existente.arquivada_em) {
      const { error: eDes } = await supabaseAdmin.from('suporte_conversas').update({ arquivada_em: null }).eq('id', existente.id);
      if (eDes) return NextResponse.json({ error: eDes.message }, { status: 500 });
      return NextResponse.json({ conversaId: existente.id, nova: false, desarquivada: true });
    }
    return NextResponse.json({ conversaId: existente.id, nova: false });
  }
  // lingua da conversa = a do cadastro (a resposta e o e-mail vao nela); muda quando a pessoa escrever
  const { data: nova, error } = await supabaseAdmin.from('suporte_conversas').insert({ profile_id: profileId, idioma: linguaValida(perfil.idioma) }).select('id').single();
  if (error) {
    // duas abas ao mesmo tempo: a outra criou primeiro (indice unico por conta)
    const { data: outra } = await supabaseAdmin.from('suporte_conversas').select('id').eq('profile_id', profileId).maybeSingle();
    if (outra) return NextResponse.json({ conversaId: outra.id, nova: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ conversaId: nova.id, nova: true });
}
