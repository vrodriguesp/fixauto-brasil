import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ErroValidacao, ehUuid, texto } from '@/lib/validacao';
import { carregarPedido, enviarConviteOficinas, motivosDe, oficinaBate, oficinasComDistancia, quemJaRecebeu, type MotivoJaRecebeu, type OficinaAviso } from '@/lib/avisar-oficinas-pedido';
import { MAX_CONVITES_POR_VEZ, STATUS_TRIAGEM, mesmoPais, paisDoPedido, umDeCadaVez } from '@/lib/triagem-pedido';

export const dynamic = 'force-dynamic';

const PULADA: Record<MotivoJaRecebeu, string> = { orcamento: 'ja_orcou', dispensa: 'dispensou', convite: 'ja_convidada', aviso: 'ja_recebeu' };

// Triagem (Lote 2, migracao 085): enviar o pedido a oficinas escolhidas pelo admin, mesmo sem o tipo.
// A convidada passa a ver e poder orcar (minha_oficina_atende) e recebe 1 aviso 'pedido_convite' + e-mail + push.
// Recusa a chamada inteira (400, nada gravado) se alguma oficina nao existe, esta inativa, e de outro pais ou
// de outra conta (teste x real, 063/064). Quem ja recebeu este pedido (aviso, orcamento, "sem interesse",
// convite) e pulado: nunca recebe dois avisos do mesmo pedido.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  let ids: string[], motivo: string | null;
  try {
    const b = await req.json().catch(() => ({}));
    if (!Array.isArray(b?.oficinaIds) || !b.oficinaIds.length || !b.oficinaIds.every(ehUuid)) throw new ErroValidacao('oficinaIds: escolha pelo menos uma oficina');
    ids = Array.from(new Set<string>(b.oficinaIds));
    if (ids.length > MAX_CONVITES_POR_VEZ) throw new ErroValidacao(`No máximo ${MAX_CONVITES_POR_VEZ} oficinas por vez`);
    motivo = texto(b?.motivo, 'motivo', 500);
  } catch (e) {
    return NextResponse.json({ error: e instanceof ErroValidacao ? e.message : 'Dados inválidos' }, { status: 400 });
  }

  return umDeCadaVez(`envio:${params.id}`, async () => {
    const sol = await carregarPedido(params.id);
    if (!sol) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    if (!STATUS_TRIAGEM.includes(sol.status)) return NextResponse.json({ error: 'Só um pedido aberto ou em orçamento pode ser enviado a oficinas.' }, { status: 409 });
    // como tipo/avisar: os avisos do pedido de acidente sao do fluxo do acidente (Fable M-4)
    if (sol.emergencia_id) return NextResponse.json({ error: 'Pedido de acidente: os avisos são do fluxo do acidente.' }, { status: 409 });

    const { pais } = paisDoPedido(sol);
    const clienteTeste = !!sol.cliente?.conta_teste;
    const [todas, j] = await Promise.all([oficinasComDistancia(sol), quemJaRecebeu(sol.id)]);
    const porId = new Map(todas.map((o) => [o.oficina_id, o]));

    const erros: { id: string; motivo: string }[] = [];
    const puladas: { id: string; nome: string; motivo: string }[] = [];
    const alvo: OficinaAviso[] = [];
    // ja recebeu SO o aviso (ex.: pelo "Cobrar", fora do raio dela) e nao tem acesso: libera o acesso sem novo aviso (Fable I-3)
    const soAcesso: OficinaAviso[] = [];
    for (const id of ids) {
      const o = porId.get(id);
      if (!o) { erros.push({ id, motivo: 'nao_encontrada' }); continue; }
      if (!o.ativa) { erros.push({ id, motivo: 'inativa' }); continue; }
      if (o.conta_teste !== clienteTeste) { erros.push({ id, motivo: 'conta_teste' }); continue; }
      if (!mesmoPais(o, pais)) { erros.push({ id, motivo: 'outro_pais' }); continue; }
      const m = motivosDe(o, j);
      // so quem NAO bate com o pedido (tipo/raio) precisa do convite para ver; quem bate ja ve e e pulado
      if (m.length === 1 && m[0] === 'aviso' && !oficinaBate(o, sol)) soAcesso.push(o);
      else if (m.length) puladas.push({ id, nome: o.nome, motivo: PULADA[m[0]] });
      else alvo.push(o);
    }
    if (erros.length) {
      const txt = erros.some((e) => e.motivo === 'conta_teste') ? 'Conta de teste e conta real não se misturam.' : 'Há oficina inválida na escolha (inativa, de outro país ou inexistente).';
      return NextResponse.json({ error: `${txt} Nada foi enviado.`, erros }, { status: 400 });
    }

    // o banco decide quem e novo (ON CONFLICT DO NOTHING ... RETURNING): so essas recebem o aviso
    let novas: OficinaAviso[] = [];
    if (alvo.length) {
      const { data: inseridas, error } = await supabaseAdmin.from('pedido_convites')
        .upsert(alvo.map((o) => ({ solicitacao_id: sol.id, oficina_id: o.oficina_id, convidado_por: auth.userId, origem: 'admin', motivo })), { onConflict: 'solicitacao_id,oficina_id', ignoreDuplicates: true })
        .select('oficina_id');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const ok = new Set((inseridas || []).map((r: any) => r.oficina_id));
      novas = alvo.filter((o) => ok.has(o.oficina_id));
      for (const o of alvo) if (!ok.has(o.oficina_id)) puladas.push({ id: o.oficina_id, nome: o.nome, motivo: 'ja_convidada' });
    }
    // acesso sem aviso: grava o convite e NAO chama enviarConviteOficinas (a oficina ja tem o aviso deste pedido)
    let acessoLiberado: OficinaAviso[] = [];
    if (soAcesso.length) {
      const { data: inseridas, error } = await supabaseAdmin.from('pedido_convites')
        .upsert(soAcesso.map((o) => ({ solicitacao_id: sol.id, oficina_id: o.oficina_id, convidado_por: auth.userId, origem: 'admin', motivo })), { onConflict: 'solicitacao_id,oficina_id', ignoreDuplicates: true })
        .select('oficina_id');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const ok = new Set((inseridas || []).map((r: any) => r.oficina_id));
      acessoLiberado = soAcesso.filter((o) => ok.has(o.oficina_id));
      for (const o of soAcesso) if (!ok.has(o.oficina_id)) puladas.push({ id: o.oficina_id, nome: o.nome, motivo: 'ja_convidada' });
    }
    const { erro } = await enviarConviteOficinas(sol, novas);

    if (novas.length || acessoLiberado.length) {
      await registrarAuditoria(supabaseAdmin, {
        adminId: auth.userId, entidade: 'solicitacao', entidadeId: sol.id, acao: 'convidar_oficinas',
        depois: { oficinas: novas.map((o) => o.oficina_id), acessoSemAviso: acessoLiberado.map((o) => o.oficina_id), puladas: puladas.map((p) => p.id) }, motivo, solicitacaoId: sol.id,
      });
    }
    if (erro) return NextResponse.json({ error: `Convites gravados (as oficinas já veem o pedido), mas o aviso não foi enviado: ${erro}`, convidadas: novas.length }, { status: 500 });
    return NextResponse.json({
      convidadas: novas.length, oficinas: novas.map((o) => ({ oficina_id: o.oficina_id, nome: o.nome })),
      acessoSemAviso: acessoLiberado.map((o) => ({ oficina_id: o.oficina_id, nome: o.nome })), puladas,
    });
  });
}
