import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { iguaisSeguro } from '@/lib/segredos';
import { garantirTraducaoDescricao, hashDescricao } from '@/lib/traduzir-descricao';

export const dynamic = 'force-dynamic';

// Preenchimento unico (deploy da migracao 099): traduz a descricao das oficinas
// ativas que ainda nao tem traducao do texto atual - uma chamada ao provedor por
// oficina. { "dry_run": true } so lista o que faria. Chave TAREFAS_CHAVE, como as
// outras tarefas. Uso: curl -X POST -H "x-tarefa-chave: $CHAVE" -H "Content-Type: application/json" -d '{"dry_run":true}' https://bipfix.com/api/tarefas/traduzir-descricoes
export async function POST(req: NextRequest) {
  const chave = process.env.TAREFAS_CHAVE;
  if (!chave || !iguaisSeguro(req.headers.get('x-tarefa-chave') || '', chave)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const corpo = await req.json().catch(() => ({}));
  const dryRun = !!corpo?.dry_run;
  const limite = Math.min(50, Math.max(1, Number(corpo?.limite) || 20));
  const { data, error } = await supabaseAdmin.from('oficinas').select('id, nome_fantasia, descricao, descricao_traducoes').eq('ativa', true).not('descricao', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const pendentes = (data || []).filter((o) => (o.descricao || '').trim() && (o.descricao_traducoes as { hash?: string } | null)?.hash !== hashDescricao(o.descricao as string));
  const feitas: { id: string; nome: string; linguas?: string[] }[] = [];
  for (const o of pendentes.slice(0, limite)) {
    if (dryRun) { feitas.push({ id: o.id, nome: o.nome_fantasia }); continue; }
    const r = await garantirTraducaoDescricao(o.id, true);
    feitas.push({ id: o.id, nome: o.nome_fantasia, linguas: Object.keys(r.traducoes || {}).filter((k) => !['origem', 'hash'].includes(k)) });
  }
  return NextResponse.json({ ok: true, dry_run: dryRun, pendentes: pendentes.length, processadas: feitas });
}
