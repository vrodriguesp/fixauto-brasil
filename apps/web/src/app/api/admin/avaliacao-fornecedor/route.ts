import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { erro, ok, UUID, SEM_CACHE } from '@/lib/pecas-confianca';

export const dynamic = 'force-dynamic';

// Lote 3 de pecas (admin): avaliacoes de fornecedor denunciadas ou ocultas (GET) e ocultar/mostrar com
// motivo (POST), com auditoria. Oculta: some para os parceiros; o fornecedor, a autora e o admin continuam vendo.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { data, error } = await supabaseAdmin.from('fornecedores_avaliacoes')
    .select('id, pedido_id, fornecedor_tipo, fornecedor_id, nota, comentario, resposta, oculta, oculta_motivo, denunciada_em, denuncia_motivo, criado_em, oficina:oficinas(nome_fantasia)')
    .or('denunciada_em.not.is.null,oculta.eq.true')
    .order('criado_em', { ascending: false }).limit(100);
  if (error) return erro(500, 'ERRO');
  const lojas = Array.from(new Set(((data as any[]) || []).filter((a) => a.fornecedor_tipo === 'loja').map((a) => a.fornecedor_id)));
  const ofs = Array.from(new Set(((data as any[]) || []).filter((a) => a.fornecedor_tipo === 'oficina').map((a) => a.fornecedor_id)));
  const [{ data: ln }, { data: on }] = await Promise.all([
    lojas.length ? supabaseAdmin.from('lojas_pecas').select('id, nome_fantasia').in('id', lojas) : Promise.resolve({ data: [] as any[] }),
    ofs.length ? supabaseAdmin.from('oficinas').select('id, nome_fantasia').in('id', ofs) : Promise.resolve({ data: [] as any[] }),
  ]);
  const nomes = new Map<string, string>([...((ln as any[]) || []), ...((on as any[]) || [])].map((x) => [x.id, x.nome_fantasia]));
  return Response.json({ avaliacoes: ((data as any[]) || []).map((a) => ({ ...a, autora: a.oficina?.nome_fantasia || '-', fornecedor: nomes.get(a.fornecedor_id) || '-' })) }, { headers: SEM_CACHE });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const corpo = await req.json().catch(() => ({}));
    if (typeof corpo?.id !== 'string' || !UUID.test(corpo.id) || typeof corpo?.oculta !== 'boolean') return erro(400, 'DADOS_INVALIDOS');
    const motivo = typeof corpo?.motivo === 'string' ? corpo.motivo.trim().slice(0, 300) : '';
    if (corpo.oculta && !motivo) return erro(400, 'MOTIVO_OBRIGATORIO');
    const { data: antes } = await supabaseAdmin.from('fornecedores_avaliacoes').select('id, oculta, oculta_motivo').eq('id', corpo.id).maybeSingle();
    if (!antes) return erro(404, 'NAO_ENCONTRADO');
    const { error } = await supabaseAdmin.from('fornecedores_avaliacoes')
      .update({ oculta: corpo.oculta, oculta_motivo: motivo || null, oculta_por: auth.userId, atualizado_em: new Date().toISOString() })
      .eq('id', corpo.id);
    if (error) return erro(500, 'ERRO');
    await registrarAuditoria(supabaseAdmin, {
      adminId: auth.userId, entidade: 'avaliacao_fornecedor', entidadeId: corpo.id, acao: corpo.oculta ? 'ocultar_avaliacao' : 'mostrar_avaliacao',
      antes: { oculta: antes.oculta, oculta_motivo: antes.oculta_motivo }, depois: { oculta: corpo.oculta, oculta_motivo: motivo || null }, motivo: motivo || null,
    });
    return ok();
  } catch (e) {
    console.error('[admin/avaliacao-fornecedor]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
