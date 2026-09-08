import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendLeadParceiroEmail } from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Rota publica (sem login) usada pelo formulario de /seja-parceiro. Usa a
// service role pra poder validar/sanitizar no servidor antes de gravar, em
// vez de deixar o client anonimo inserir direto na tabela.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tipo, nomeResponsavel, nomeNegocio, cidade, estado, whatsapp, email, observacao } = body;

    if (!tipo || !['oficina', 'loja_pecas'].includes(tipo)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }
    if (!nomeResponsavel?.trim() || !nomeNegocio?.trim() || !cidade?.trim() || !estado?.trim() || !whatsapp?.trim()) {
      return NextResponse.json({ error: 'Preencha todos os campos obrigatórios' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('leads_parceiros').insert({
      tipo,
      nome_responsavel: nomeResponsavel.trim(),
      nome_negocio: nomeNegocio.trim(),
      cidade: cidade.trim(),
      estado: estado.trim().toUpperCase(),
      whatsapp: whatsapp.trim(),
      email: email?.trim() || null,
      observacao: observacao?.trim() || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    sendLeadParceiroEmail({
      tipo,
      nomeResponsavel: nomeResponsavel.trim(),
      nomeNegocio: nomeNegocio.trim(),
      cidade: cidade.trim(),
      estado: estado.trim().toUpperCase(),
      whatsapp: whatsapp.trim(),
      email: email?.trim() || null,
      observacao: observacao?.trim() || null,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 });
  }
}
