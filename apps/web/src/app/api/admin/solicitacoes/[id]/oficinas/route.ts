import { NextRequest, NextResponse } from 'next/server';
import { tipoCompativel } from '@fixauto/shared';
import { requireAdmin } from '@/lib/admin-auth';
import { ehUuid } from '@/lib/validacao';
import { carregarPedido, oficinasComDistancia, quemJaRecebeu } from '@/lib/avisar-oficinas-pedido';
import { estadoDaOficina, mesmoPais, paisDoPedido } from '@/lib/triagem-pedido';

export const dynamic = 'force-dynamic';

const LIMITE = 50;
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Triagem (Lote 2): lista para "enviar para oficinas escolhidas". So leitura. Oficinas ATIVAS do MESMO PAIS do
// pedido (decisao do dono 15/11), da mais perto para a mais longe; ?q= filtra por nome, cidade ou endereco.
// Cada linha diz se a oficina faz o tipo (compativel), se e conta de teste e o que ja aconteceu com ela neste pedido.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const sol = await carregarPedido(params.id);
  if (!sol) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });

  // sem os caracteres que mudavam o filtro do PostgREST (mesma limpeza de admin/solicitacoes, auditoria B-02)
  const q = normal((req.nextUrl.searchParams.get('q') || '').replace(/[,()*%\\]/g, ' ').trim()).slice(0, 80);
  const { pais, gravado } = paisDoPedido(sol);
  const clienteTeste = !!sol.cliente?.conta_teste;
  const [todas, j] = await Promise.all([oficinasComDistancia(sol), quemJaRecebeu(sol.id)]);
  const lista = todas
    .filter((o) => o.ativa && mesmoPais(o, pais))
    .filter((o) => !q || [o.nome, o.cidade, o.endereco].some((c) => c && normal(c).includes(q)))
    .sort((a, b) => (a.km ?? 9e9) - (b.km ?? 9e9) || a.nome.localeCompare(b.nome));

  return NextResponse.json({
    pais, paisGravado: gravado, tipo: sol.tipo, total: lista.length, limite: LIMITE,
    oficinas: lista.slice(0, LIMITE).map((o) => ({
      oficina_id: o.oficina_id, profile_id: o.profile_id, nome: o.nome, cidade: o.cidade, pais: o.pais,
      especialidades: o.especialidades, km: o.km == null ? null : Math.round(o.km * 10) / 10,
      compativel: tipoCompativel(o.especialidades, sol.tipo),
      dentroDoRaio: o.km != null && o.km <= o.raio,
      conta_teste: o.conta_teste,
      // conta de teste x real nunca se misturam (063/064): a outra fica so para ver
      mesmaConta: o.conta_teste === clienteTeste,
      estado: estadoDaOficina(o, j),
    })),
  });
}
