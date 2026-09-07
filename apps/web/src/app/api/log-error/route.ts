import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Public endpoint (called from any page, including anonymous visitors) that
// records a client-side JS error so it shows up in /admin/monitoramento.
// Inputs are truncated defensively since this is reachable by anyone.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mensagem = String(body.mensagem || 'Erro desconhecido').slice(0, 500);
    const stack = body.stack ? String(body.stack).slice(0, 3000) : null;
    const url = body.url ? String(body.url).slice(0, 500) : null;
    const userAgent = req.headers.get('user-agent')?.slice(0, 300) || null;

    await supabaseAdmin.from('app_errors').insert({ mensagem, stack, url, user_agent: userAgent });

    return NextResponse.json({ success: true });
  } catch {
    // Never let error-logging itself break the page
    return NextResponse.json({ success: false });
  }
}
