import { NextRequest, NextResponse } from 'next/server';
import { limitarPorIp } from '@/lib/rate-limit';
import { contarEtapa } from '@/lib/pedido-sem-conta';

export const dynamic = 'force-dynamic';

// Passos do pedido (onde as pessoas desistem): so soma 1 no contador do dia.
// Sem IP guardado, sem cookie, sem dado pessoal (migracao 073).
// 12/11: tambem o toque no servico, o "Edasi" tocado com algo faltando, a foto anexada,
// a resposta ao aviso de cookies (so na pagina do pedido) e o cadastro de oficina.
const ETAPAS_PEDIDO = [
  'abriu', 'servico', 'detalhe', 'carro', 'local', 'contato', 'foto',
  'edasi_bloqueado_detalhe', 'edasi_bloqueado_carro', 'edasi_bloqueado_local', 'edasi_bloqueado_contato',
  'cookie_aceito', 'cookie_recusado',
  // 13/11 (Fable): no passo contato, digitou algo / marcou "quero SMS" (uma vez por visita)
  'contato_digitou', 'contato_sms_opt',
];
const FUNIS: Record<string, string[]> = {
  pedido_site: ETAPAS_PEDIDO,
  pedido_app: ETAPAS_PEDIDO,
  cadastro_site: ['abriu', 'edasi_bloqueado', 'enviado'],
};

export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'funil', 120, 60 * 60 * 1000)) return NextResponse.json({ ok: true });
  const b = await req.json().catch(() => ({}));
  if (typeof b?.funil === 'string' && FUNIS[b.funil]?.includes(b?.etapa)) await contarEtapa(b.funil, b.etapa);
  return NextResponse.json({ ok: true });
}
