import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { iguaisSeguro } from '@/lib/segredos';

export const dynamic = 'force-dynamic';

const DIAS = 183; // ~6 meses

// Prazo de guarda do chat de suporte (dono 03/11, politica de privacidade):
// conversa de visitante sem conta, parada ha 6 meses, e apagada com as
// mensagens (ON DELETE CASCADE). Conversa de quem tem conta segue a conta.
// Chamada uma vez por dia pelo agendador do servidor (crontab), com a chave
// TAREFAS_CHAVE - mesmo esquema de entregas-automaticas.
export async function POST(req: NextRequest) {
  const chave = process.env.TAREFAS_CHAVE;
  if (!chave || !iguaisSeguro(req.headers.get('x-tarefa-chave') || '', chave)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const limite = new Date(Date.now() - DIAS * 86400000).toISOString();
  const { data, error } = await supabaseAdmin.from('suporte_conversas').delete()
    .is('profile_id', null).lt('ultima_mensagem_em', limite).select('id');
  if (error) { console.error('[limpar-suporte]', error.message); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json({ ok: true, apagadas: (data || []).length });
}
