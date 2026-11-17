import { NextRequest, NextResponse } from 'next/server';
import { limitarPorIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hashNaoTenho, TOKEN_NAO_TENHO } from '@/lib/pecas-nao-tenho';

export const dynamic = 'force-dynamic';

const MOTIVOS = ['sem_estoque', 'nao_trabalho', 'outro'];
const sem = { 'Cache-Control': 'no-store' };
const resposta = (corpo: Record<string, unknown>, status = 200) => NextResponse.json(corpo, { status, headers: sem });
const invalido = () => resposta({ codigo: 'LINK_INVALIDO' }, 410);

// Lote 2 de pecas (17/11): link "Nao tenho" do e-mail (bipfix.com/n/<token> -> pagina sem login).
// Sem sessao: quem decide e o token (preso a fornecedor + cotacao); o corpo nao decide mais nada.
//  - 'ver' NUNCA escreve: so { peca, aberta, jaRespondeu, jaDispensou, vencido } (nada da compradora,
//    do carro ou da placa). Leitores de e-mail e antivirus abrem links sozinhos: abrir nao age.
//  - 'confirmar': token valido -> fornecedor ativo -> cotacao aberta (senao COTACAO_FECHADA, token
//    nao gasto) -> sem oferta propria (JA_RESPONDEU) -> mesmo tipo de conta -> gasta o token (uso
//    unico atomico) -> grava a dispensa (origem 'email'). Nunca da login. Nunca loga o token.
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'nao-tenho-email', 30, 60 * 60 * 1000)) return resposta({ codigo: 'MUITAS_TENTATIVAS' }, 429);
  try {
    const corpo = await req.json().catch(() => ({}));
    const k = typeof corpo?.k === 'string' ? corpo.k : '';
    const acao = corpo?.acao;
    if (!TOKEN_NAO_TENHO.test(k) || (acao !== 'ver' && acao !== 'confirmar')) return invalido();

    const { data: tk } = await supabaseAdmin.from('pecas_links_email')
      .select('id, profile_id, cotacao_id, fornecedor_tipo, fornecedor_id, expira_em, usado_em')
      .eq('token_hash', hashNaoTenho(k)).maybeSingle();
    if (!tk) return invalido();

    const [{ data: cot }, { data: resp }, { data: disp }] = await Promise.all([
      supabaseAdmin.from('cotacoes_pecas').select('id, oficina_id, status, expira_em, peca_descricao, alvo').eq('id', tk.cotacao_id).maybeSingle(),
      supabaseAdmin.from('cotacoes_pecas_respostas').select('id').eq('cotacao_id', tk.cotacao_id)
        .eq(tk.fornecedor_tipo === 'loja' ? 'loja_id' : 'oficina_fornecedora_id', tk.fornecedor_id).limit(1),
      supabaseAdmin.from('cotacoes_pecas_dispensas').select('cotacao_id').eq('cotacao_id', tk.cotacao_id)
        .eq('fornecedor_tipo', tk.fornecedor_tipo).eq('fornecedor_id', tk.fornecedor_id).limit(1),
    ]);
    if (!cot) return invalido();
    const agora = Date.now();
    const vencido = !!tk.usado_em || Date.parse(tk.expira_em) <= agora;
    // lote 3 (item 4 do Fable): oficina numa cotacao que virou "so lojas" ja nao pode dispensar (alvo re-checado)
    const foraDoAlvo = tk.fornecedor_tipo === 'oficina' && (cot as { alvo?: string | null }).alvo === 'so_lojas';
    const aberta = ['aberta', 'respondida'].includes(String(cot.status)) && !(cot.expira_em && Date.parse(cot.expira_em) <= agora) && !foraDoAlvo;
    const jaRespondeu = !!resp?.length;
    const jaDispensou = !!disp?.length;

    if (acao === 'ver') return resposta({ peca: String(cot.peca_descricao || '').slice(0, 120), aberta, jaRespondeu, jaDispensou, vencido });

    // ---- confirmar ----
    if (vencido) return invalido();
    // fornecedor ativo (loja ativa + perfil ativo; oficina ativa que vende)
    const [{ data: perfil }, { data: forn }] = await Promise.all([
      supabaseAdmin.from('profiles').select('ativo, conta_teste').eq('id', tk.profile_id).maybeSingle(),
      tk.fornecedor_tipo === 'loja'
        ? supabaseAdmin.from('lojas_pecas').select('id, ativa').eq('id', tk.fornecedor_id).eq('profile_id', tk.profile_id).maybeSingle()
        : supabaseAdmin.from('oficinas').select('id, ativa, vende_pecas').eq('id', tk.fornecedor_id).eq('profile_id', tk.profile_id).maybeSingle(),
    ]);
    const ativo = !!perfil && perfil.ativo !== false && !!forn && forn.ativa !== false && (tk.fornecedor_tipo === 'loja' || (forn as { vende_pecas?: boolean }).vende_pecas === true);
    if (!ativo) return invalido();
    if (!aberta) return resposta({ codigo: 'COTACAO_FECHADA' }, 410);
    if (jaRespondeu) return resposta({ codigo: 'JA_RESPONDEU' }, 409);
    // conta de teste so dispensa cotacao de teste (e real so real)
    const { data: dona } = await supabaseAdmin.from('oficinas').select('profile:profiles!oficinas_profile_id_fkey(conta_teste)').eq('id', cot.oficina_id).maybeSingle();
    if (!!(dona as any)?.profile?.conta_teste !== !!perfil.conta_teste) return invalido();

    // uso unico: so quem gasta o token agora grava
    const { data: gasto } = await supabaseAdmin.from('pecas_links_email').update({ usado_em: new Date().toISOString() }).eq('id', tk.id).is('usado_em', null).select('id');
    if (!gasto?.length) return invalido();
    if (!jaDispensou) {
      const motivo = MOTIVOS.includes(corpo?.motivo) ? corpo.motivo : null;
      const { error } = await supabaseAdmin.from('cotacoes_pecas_dispensas').upsert({
        cotacao_id: tk.cotacao_id, fornecedor_tipo: tk.fornecedor_tipo, fornecedor_id: tk.fornecedor_id, profile_id: tk.profile_id, motivo, origem: 'email',
      }, { onConflict: 'cotacao_id,fornecedor_tipo,fornecedor_id', ignoreDuplicates: true });
      if (error) { console.error('[nao-tenho-email] dispensa:', error.message); return resposta({ codigo: 'ERRO' }, 500); }
    }
    return resposta({ ok: true, jaDispensou });
  } catch (err) {
    console.error('[nao-tenho-email]', (err as Error).message);
    return resposta({ codigo: 'ERRO' }, 500);
  }
}
