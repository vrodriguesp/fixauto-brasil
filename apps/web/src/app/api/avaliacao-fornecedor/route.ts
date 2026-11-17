import { NextRequest } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { carregarPedido, ladoDe, erro, ok, avaliavel, pedidoMesmoRegistro, contatoNoTexto, fornecedorDe, fornecedorIdDe, mesmoTipoConta, sino, emailL3, linkFornecedor, peca, type PedidoL3 } from '@/lib/pecas-confianca';
import { notifAvaliacaoRecebida } from '@/lib/pecas-confianca-textos';

export const dynamic = 'force-dynamic';

const EDITAVEL_MS = 48 * 60 * 60 * 1000;

// Lote 3 de pecas (L3.3, D-1/D-3/D-6/D-7): avaliacao do fornecedor (loja ou oficina) pela DONA da
// oficina compradora, 1 por pedido v3 entregue/recebido/com problema ou cancelado contra o fornecedor.
// Sem prazo final (obrigatoria: P-7). POST cria; PATCH edita ate 48 h e so sem resposta do fornecedor.
// Texto sem telefone/e-mail; par com o mesmo codigo de registro (P-20) nao avalia. So a rota grava
// (fornecedores_avaliacoes nao tem politica de escrita).
type Campos = { nota?: number; peca_certa?: boolean | null; no_prazo?: boolean | null; comentario?: string | null };

function lerCampos(corpo: any, exigirNota: boolean): { campos: Campos } | { codigo: string } {
  const campos: Campos = {};
  if (corpo?.nota !== undefined || exigirNota) {
    const n = corpo?.nota;
    if (!Number.isInteger(n) || n < 1 || n > 5) return { codigo: 'NOTA_INVALIDA' };
    campos.nota = n;
  }
  for (const [k, col] of [['pecaCerta', 'peca_certa'], ['noPrazo', 'no_prazo']] as const) {
    const v = corpo?.[k];
    if (v === undefined) continue;
    if (v !== null && typeof v !== 'boolean') return { codigo: 'CAMPO_INVALIDO' };
    campos[col] = v;
  }
  if (corpo?.comentario !== undefined) {
    if (corpo.comentario !== null && typeof corpo.comentario !== 'string') return { codigo: 'CAMPO_INVALIDO' };
    const c = String(corpo.comentario || '').trim();
    if (c.length > 300) return { codigo: 'TEXTO_LONGO' };
    if (contatoNoTexto(c)) return { codigo: 'CONTATO_NO_TEXTO' };
    campos.comentario = c || null;
  }
  return { campos };
}

async function inicio(req: NextRequest): Promise<{ resposta: Response } | { p: PedidoL3; userId: string; corpo: any }> {
  const userId = await getSessionUserId(req);
  if (!userId) return { resposta: erro(401, 'NAO_AUTENTICADO') };
  if (!dentroDoLimite(`avaliar-fornecedor-u:${userId}`, 20, 60 * 60 * 1000)) return { resposta: erro(429, 'MUITAS_TENTATIVAS') };
  const corpo = await req.json().catch(() => ({}));
  const p = await carregarPedido(corpo?.pedidoId);
  if (!p) return { resposta: erro(404, 'NAO_ENCONTRADO') };
  if (ladoDe(p, userId) !== 'compradora') return { resposta: erro(403, 'ACESSO_NEGADO') };
  if (p.v3 !== true) return { resposta: erro(409, 'NAO_V3') };
  return { p, userId, corpo };
}

export async function POST(req: NextRequest) {
  try {
    const i = await inicio(req);
    if ('resposta' in i) return i.resposta;
    const { p, userId, corpo } = i;
    const lido = lerCampos(corpo, true);
    if ('codigo' in lido) return erro(400, lido.codigo);
    const { data: ja } = await supabaseAdmin.from('fornecedores_avaliacoes').select('id').eq('pedido_id', p.id).limit(1);
    if (ja?.length) return erro(409, 'JA_AVALIADO');
    if (!avaliavel(p)) return erro(409, 'NAO_AVALIAVEL');
    if (pedidoMesmoRegistro(p)) return erro(409, 'MESMO_REGISTRO');
    const fornecedorId = fornecedorIdDe(p);
    if (!fornecedorId) return erro(409, 'NAO_AVALIAVEL');

    const agora = Date.now();
    const { data: nova, error } = await supabaseAdmin.from('fornecedores_avaliacoes').insert({
      pedido_id: p.id, oficina_id: p.oficina_id, autor_profile_id: userId, fornecedor_tipo: p.fornecedor_tipo, fornecedor_id: fornecedorId,
      nota: lido.campos.nota, peca_certa: lido.campos.peca_certa ?? null, no_prazo: lido.campos.no_prazo ?? null,
      nao_entregou: p.cancelado_motivo === 'nao_entregou' || p.problema === 'nao_entregou',
      comentario: lido.campos.comentario ?? null, editavel_ate: new Date(agora + EDITAVEL_MS).toISOString(),
    }).select('id').single();
    if (error) {
      if (error.code === '23505') return erro(409, 'JA_AVALIADO');
      console.error('[avaliacao-fornecedor]', error.message);
      return erro(500, 'ERRO');
    }

    const forn = fornecedorDe(p);
    if (forn?.profile_id && mesmoTipoConta(forn.profile || null, p.compradora?.profile || null)) {
      const nome = p.compradora?.nome_fantasia || '-';
      const link = p.fornecedor_tipo === 'loja' ? '/loja/avaliacoes' : '/oficina/pecas?aba=vender';
      const nota = lido.campos.nota as number;
      await sino(forn.profile_id, forn.profile?.idioma, 'avaliacao_recebida_fornecedor', (l) => notifAvaliacaoRecebida(l, nome, peca(p), nota),
        { pedido_id: p.id, cotacao_id: p.cotacao_id, avaliacao_id: nova.id, link: p.fornecedor_tipo === 'loja' ? link : linkFornecedor('oficina') });
      await emailL3({ tipo: 'avaliacao', para: forn.profile?.email, nome: forn.profile?.nome || forn.nome_fantasia, idioma: forn.profile?.idioma,
        vars: { oficina: nome, peca: peca(p), nota, texto: lido.campos.comentario || '' }, linkInterno: link, extra: !!lido.campos.comentario });
    }
    return ok({ id: nova.id });
  } catch (e) {
    console.error('[avaliacao-fornecedor]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const i = await inicio(req);
    if ('resposta' in i) return i.resposta;
    const { p, corpo } = i;
    const lido = lerCampos(corpo, false);
    if ('codigo' in lido) return erro(400, lido.codigo);
    const { data: av } = await supabaseAdmin.from('fornecedores_avaliacoes').select('id, editavel_ate, resposta').eq('pedido_id', p.id).maybeSingle();
    if (!av) return erro(409, 'NAO_AVALIADO');
    if (av.resposta || !av.editavel_ate || Date.parse(av.editavel_ate) <= Date.now()) return erro(409, 'FORA_DO_PRAZO');
    if (!Object.keys(lido.campos).length) return ok({ id: av.id });
    const { data: mudou, error } = await supabaseAdmin.from('fornecedores_avaliacoes')
      .update({ ...lido.campos, atualizado_em: new Date().toISOString() })
      .eq('id', av.id).is('resposta', null).gt('editavel_ate', new Date().toISOString()).select('id');
    if (error) return erro(500, 'ERRO');
    if (!mudou?.length) return erro(409, 'FORA_DO_PRAZO');
    return ok({ id: av.id });
  } catch (e) {
    console.error('[avaliacao-fornecedor PATCH]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
