import { NextRequest, NextResponse } from 'next/server';
import { sendLeadParceiroEmail } from '@/lib/notifications';
import { limitarPorIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';


// Rota publica (sem login) usada pelo formulario de /seja-parceiro. Usa a
// service role pra poder validar/sanitizar no servidor antes de gravar, em
// vez de deixar o client anonimo inserir direto na tabela.
export async function POST(req: NextRequest) {
  try {
    // Formulario publico: limite por IP (cada lead manda e-mail ao admin)
    if (!limitarPorIp(req, 'leads', 5, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }
    const body = await req.json();
    const { tipo, nomeResponsavel, nomeNegocio, cidade, estado, whatsapp, email, observacao } = body;
    const longo = (v: unknown, max: number) => typeof v === 'string' && v.length > max;
    if (longo(nomeResponsavel, 100) || longo(nomeNegocio, 150) || longo(cidade, 100) || longo(estado, 60) || longo(whatsapp, 30) || longo(email, 254) || longo(observacao, 2000)) {
      return NextResponse.json({ error: 'Campo muito longo' }, { status: 400 });
    }

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
