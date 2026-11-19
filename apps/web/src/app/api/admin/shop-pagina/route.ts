import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { CONTEUDO_VAZIO, MAX_VERSOES, limparConteudo } from '@/lib/shop-pagina';
import { interruptoresLote5 } from '@/lib/pecas-lote5';

export const dynamic = 'force-dynamic';
const SEM_CACHE = { 'Cache-Control': 'no-store' };

// Pecas lote 5 (20/11, migracao 106): editor da pagina do Shop (so admin). GET: rascunho atual (o mais novo, se for mais
// novo que a publicada; senao a publicada), a publicada, o historico (ultimas MAX_VERSOES) e os itens/promocoes que
// podem ir para destaque. PUT { conteudo, acao: 'rascunho' | 'publicar', nota }: grava uma versao nova (o conteudo e
// sempre limpo no servidor); publicar arquiva a publicada anterior. Funciona com o Shop desligado (o dono prepara antes).
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const [{ data: versoes }, sw, { data: itens }, { data: promos }] = await Promise.all([
    supabaseAdmin.from('shop_pagina_versoes').select('id, estado, conteudo, nota, criado_em, publicado_em, criado_por').order('criado_em', { ascending: false }).limit(MAX_VERSOES),
    interruptoresLote5(),
    supabaseAdmin.from('pecas_catalogo').select('id, nome, preco, visibilidade, loja:lojas_pecas(nome_fantasia)').eq('ativo', true).eq('oculto', false).in('visibilidade', ['oficinas', 'publico']).order('atualizado_em', { ascending: false }).limit(200),
    supabaseAdmin.from('promocoes_pecas').select('id, titulo, preco, valido_ate, loja:lojas_pecas(nome_fantasia)').eq('oculta', false).in('visibilidade', ['oficinas', 'publico']).gt('valido_ate', new Date().toISOString()).order('created_at', { ascending: false }).limit(200),
  ]);
  const lista = (versoes as any[]) || [];
  const publicada = lista.find((v) => v.estado === 'publicada') || null;
  const ultimo = lista[0] || null;
  const rascunho = ultimo && ultimo.estado === 'rascunho' ? ultimo : publicada;
  return NextResponse.json({
    shopLigado: sw.shop && sw.v3,
    rascunho: rascunho ? { id: rascunho.id, conteudo: limparConteudo(rascunho.conteudo), estado: rascunho.estado, criado_em: rascunho.criado_em } : { id: null, conteudo: CONTEUDO_VAZIO, estado: 'novo', criado_em: null },
    publicada: publicada ? { id: publicada.id, conteudo: limparConteudo(publicada.conteudo), publicado_em: publicada.publicado_em } : null,
    versoes: lista.map((v) => ({ id: v.id, estado: v.estado, nota: v.nota, criado_em: v.criado_em, publicado_em: v.publicado_em })),
    opcoes: [
      ...((promos as any[]) || []).map((p) => ({ tipo: 'promocao', id: p.id, nome: p.titulo, preco: Number(p.preco), loja: p.loja?.nome_fantasia || '' })),
      ...((itens as any[]) || []).map((i) => ({ tipo: 'item', id: i.id, nome: i.nome, preco: Number(i.preco), loja: i.loja?.nome_fantasia || '' })),
    ],
  }, { headers: SEM_CACHE });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => null);
  if (!corpo || (corpo.acao !== 'rascunho' && corpo.acao !== 'publicar')) return NextResponse.json({ error: 'acao deve ser rascunho/publicar' }, { status: 400 });
  const conteudo = limparConteudo(corpo.conteudo);
  const nota = typeof corpo.nota === 'string' ? corpo.nota.trim().slice(0, 200) || null : null;
  const publicar = corpo.acao === 'publicar';
  const agora = new Date().toISOString();
  // banner sem texto alternativo nao publica (et e ru, ou en que e o fallback deles)
  if (publicar && conteudo.banner && !(conteudo.textos.en?.bannerAlt || (conteudo.textos.et?.bannerAlt && conteudo.textos.ru?.bannerAlt))) {
    return NextResponse.json({ error: 'texto alternativo do banner obrigatório (ET e RU, ou EN)', codigo: 'BANNER_ALT' }, { status: 400 });
  }
  // grava como rascunho e so depois troca: se algo falhar no meio, a publicada anterior continua no ar
  const { data: nova, error } = await supabaseAdmin.from('shop_pagina_versoes')
    .insert({ estado: 'rascunho', conteudo, nota, criado_por: auth.userId })
    .select('id, estado, criado_em, publicado_em').single();
  if (error || !nova) return NextResponse.json({ error: error?.message || 'erro' }, { status: 500 });
  if (publicar) {
    const { data: anterior } = await supabaseAdmin.from('shop_pagina_versoes').select('id').eq('estado', 'publicada').maybeSingle();
    if (anterior) await supabaseAdmin.from('shop_pagina_versoes').update({ estado: 'arquivada' }).eq('id', anterior.id).eq('estado', 'publicada');
    const { error: ePub } = await supabaseAdmin.from('shop_pagina_versoes').update({ estado: 'publicada', publicado_em: agora }).eq('id', nova.id);
    if (ePub) {
      // indice unico (106): outro publicar ganhou a corrida - devolve a anterior e avisa
      if (anterior) await supabaseAdmin.from('shop_pagina_versoes').update({ estado: 'publicada' }).eq('id', anterior.id).eq('estado', 'arquivada');
      return NextResponse.json({ error: 'outra publicação ao mesmo tempo; tente de novo', codigo: 'CORRIDA' }, { status: 409 });
    }
    nova.estado = 'publicada'; nova.publicado_em = agora;
  }
  // historico: so as ultimas MAX_VERSOES (a publicada nunca sai)
  const { data: velhas } = await supabaseAdmin.from('shop_pagina_versoes').select('id').neq('estado', 'publicada').order('criado_em', { ascending: false }).range(MAX_VERSOES, MAX_VERSOES + 200);
  if (velhas?.length) await supabaseAdmin.from('shop_pagina_versoes').delete().in('id', velhas.map((v) => v.id));
  if (publicar) {
    await registrarAuditoria(supabaseAdmin, { adminId: auth.userId, entidade: 'shop_pagina_versoes', entidadeId: nova.id, acao: 'publicar_shop_pagina', depois: { nota } });
  }
  return NextResponse.json({ versao: nova, conteudo }, { headers: SEM_CACHE });
}
