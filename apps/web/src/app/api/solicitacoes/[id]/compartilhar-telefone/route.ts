import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid, texto, ErroValidacao } from '@/lib/validacao';
import { dentroDoLimite } from '@/lib/rate-limit';
import { notifNovaMensagem } from '@/lib/notif-i18n';
import { emTodasAsLinguas } from '@/lib/notif-textos';
import { idiomaDoSite } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

// "Enviar meu numero" (dono 13/11; migracao 081): o motorista passa o celular a UMA
// oficina que mandou orcamento no pedido dele. Fica registrado (a oficina ve o botao
// "ligar" na pagina do pedido, sem procurar na conversa) e vai tambem como mensagem na
// conversa com ela, com o aviso de nova mensagem. As outras oficinas nao veem.
const MENSAGEM: Record<string, string> = {
  et: '📞 Minu telefoninumber: {tel}', ru: '📞 Мой номер телефона: {tel}', en: '📞 My phone number: {tel}',
  it: '📞 Il mio numero di telefono: {tel}', pt: '📞 Meu telefone: {tel}', 'pt-PT': '📞 O meu número: {tel}',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!dentroDoLimite(`compartilhar-telefone:${userId}`, 10, 3600e3)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'RATE_LIMIT' }, { status: 429 });
  try {
    const b = await req.json().catch(() => ({}));
    const oficinaId = b?.oficinaId;
    if (!ehUuid(oficinaId)) throw new ErroValidacao('oficina');
    const telefone = texto(b?.telefone, 'telefone', 30, true)!;
    if (telefone.replace(/\D/g, '').length < 8) throw new ErroValidacao('telefone', 'TELEFONE_INVALIDO');

    const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id, status, cliente_id').eq('id', params.id).maybeSingle();
    if (!sol) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (sol.cliente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (['cancelada', 'concluida', 'expirada'].includes(sol.status as string)) return NextResponse.json({ error: 'Pedido fechado', codigo: 'PEDIDO_FECHADO' }, { status: 409 });
    // so para oficina que mandou orcamento neste pedido
    const { data: orc } = await supabaseAdmin.from('orcamentos').select('id').eq('solicitacao_id', sol.id).eq('oficina_id', oficinaId).limit(1).maybeSingle();
    if (!orc) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    // o mesmo numero de novo para a mesma oficina: nada muda (sem mensagem e aviso repetidos)
    const { data: ja } = await supabaseAdmin.from('telefone_compartilhado').select('telefone').eq('solicitacao_id', sol.id).eq('oficina_id', oficinaId).maybeSingle();
    if (ja?.telefone === telefone) return NextResponse.json({ ok: true });

    const { error: eReg } = await supabaseAdmin.from('telefone_compartilhado')
      .upsert({ solicitacao_id: sol.id, oficina_id: oficinaId, cliente_id: userId, telefone, created_at: new Date().toISOString() }, { onConflict: 'solicitacao_id,oficina_id' });
    if (eReg) throw new Error(eReg.message);

    const [{ data: eu }, { data: oficina }] = await Promise.all([
      supabaseAdmin.from('profiles').select('idioma').eq('id', userId).maybeSingle(),
      supabaseAdmin.from('oficinas').select('profile_id').eq('id', oficinaId).maybeSingle(),
    ]);
    const textoMsg = (MENSAGEM[idiomaDoSite(eu?.idioma)] || MENSAGEM.en).replace('{tel}', telefone);
    const { error: eMsg } = await supabaseAdmin.from('mensagens').insert({ solicitacao_id: sol.id, oficina_id: oficinaId, remetente_id: userId, texto: textoMsg });
    if (eMsg) console.error('[compartilhar-telefone] mensagem', eMsg.message);
    if (!eMsg && oficina?.profile_id) {
      const { data: perfil } = await supabaseAdmin.from('profiles').select('idioma').eq('id', oficina.profile_id).maybeSingle();
      const n = notifNovaMensagem(perfil?.idioma);
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: oficina.profile_id, tipo: 'nova_mensagem', titulo: n.titulo, mensagem: textoMsg.slice(0, 100),
        dados: {
          solicitacao_id: sol.id, oficina_id: oficinaId,
          textos: emTodasAsLinguas((l) => ({ titulo: notifNovaMensagem(l).titulo, mensagem: textoMsg.slice(0, 100) })),
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[compartilhar-telefone]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
