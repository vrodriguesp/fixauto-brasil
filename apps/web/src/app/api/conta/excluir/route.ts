import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { dentroDoLimite } from '@/lib/rate-limit';
import { excluirOuAnonimizarConta } from '@/lib/excluir-conta';

export const dynamic = 'force-dynamic';



// Excluir a propria conta (exigido pela Apple - 5.1.1(v) - e pelo Google Play,
// que pede tambem um endereco na web: /[locale]/excluir-conta).
// - Sem historico (nenhum pedido/acidente/oficina/loja): apaga tudo de vez.
// - Com historico: o login deixa de existir (email trocado, senha aleatoria,
//   bloqueado) e os dados pessoais somem (nome, email, telefone, placas,
//   veiculos sem pedido, avisos, dados de acidente). Pedidos/orcamentos/
//   comissoes ficam anonimos: sao da oficina tambem (e apagar o perfil em
//   cascata levaria junto a comissao devida e e barrado pela agenda).
// - Carro dentro da oficina agora (servico em andamento): pede para esperar a
//   entrega, para nao deixar a oficina sem contato com o dono do carro.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!dentroDoLimite(`excluir-conta:${userId}`, 5, 60 * 60 * 1000)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  const { confirmar } = await req.json().catch(() => ({}));
  if (confirmar !== true) return NextResponse.json({ error: 'Confirmação obrigatória', codigo: 'DADOS_INVALIDOS' }, { status: 400 });

  const { data: perfil } = await supabaseAdmin.from('profiles').select('id, tipo').eq('id', userId).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 });
  if (perfil.tipo === 'admin') return NextResponse.json({ error: 'Conta de administrador', codigo: 'ACESSO_NEGADO' }, { status: 403 });

  const r = await excluirOuAnonimizarConta(userId);
  if (r.erro === 'CARRO_EM_SERVICO') return NextResponse.json({ error: 'Há um carro em serviço', codigo: 'CARRO_EM_SERVICO' }, { status: 409 });
  if (r.erro) return NextResponse.json({ error: r.erro }, { status: 500 });
  return NextResponse.json({ ok: true, modo: r.modo });
}
