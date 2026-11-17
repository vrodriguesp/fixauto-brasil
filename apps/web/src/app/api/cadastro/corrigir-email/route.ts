import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp, dentroDoLimite } from '@/lib/rate-limit';
import { ErroValidacao, email as validarEmail } from '@/lib/validacao';
import { enviarConfirmacaoEmail, enviarAvisoContaExistente } from '@/lib/email-cadastro';
import {
  lerTokenCorrecao, tokenEhOAtual, novoTokenCorrecao, CORRECAO_MAX, CORRECAO_PRAZO_MS, type CorrecaoGuardada,
} from '@/lib/cadastro-correcao';

export const dynamic = 'force-dynamic';

// "E-mail errado? Corrigir" (17/11): troca o e-mail de uma conta que ACABOU de ser criada
// e ainda nao foi confirmada, e manda o link de confirmacao para o endereco novo.
// Prova de que e quem criou a conta: o token devolvido pelo POST /api/cadastro (lib/
// cadastro-correcao) - so o hash dele fica na conta, vale 24 h e muda a cada correcao.
// No maximo 3 correcoes por conta. O e-mail continua NAO confirmado (a troca pela API de
// admin do GoTrue nao manda e-mail de "troca de e-mail" nem confirma) e o link mandado ao
// endereco errado deixa de valer (o link novo substitui o token do anterior).
//
// Nao revela mais que o cadastro: e-mail novo ja cadastrado responde igual a sucesso (o
// dono daquele e-mail recebe o aviso "voce ja tem conta", como no cadastro) e o token
// fantasma do cadastro com e-mail existente tambem.
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'cadastro-corrigir', 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  try {
    const b = await req.json().catch(() => ({}));
    const atual = validarEmail(b?.email, true)!;
    const novo = validarEmail(b?.novoEmail, true)!;
    const tk = lerTokenCorrecao(b?.token);
    if (!tk) return NextResponse.json({ error: 'Correcao invalida', codigo: 'CORRECAO_INVALIDA' }, { status: 403 });
    if (Date.now() > tk.expiraEm) return NextResponse.json({ error: 'Prazo da correcao acabou', codigo: 'CORRECAO_EXPIRADA' }, { status: 410 });
    if (novo === atual) return NextResponse.json({ error: 'E-mail igual', codigo: 'EMAIL_IGUAL' }, { status: 400 });
    // tentativas por conta (certas ou erradas), igual para conta de verdade e fantasma
    if (!dentroDoLimite(`cadastro-corrigir:${tk.userId}`, 10, CORRECAO_PRAZO_MS)) {
      return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    }
    // o mesmo endereco nao recebe mais que 3 links de correcao por hora
    if (!dentroDoLimite(`cadastro-corrigir-para:${novo}`, 3, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    }
    const idioma = typeof b.idioma === 'string' ? b.idioma : null;
    const doApp = b.origem === 'app';
    const contaDoNovo = async () => {
      const { data } = await supabaseAdmin
        .from('profiles').select('id, idioma').ilike('email', novo.replace(/[%_\\]/g, '\\$&')).maybeSingle();
      return data;
    };
    const avisarDono = async (idiomaDono: string | null) => {
      if (dentroDoLimite(`cadastro-existe:${novo}`, 1, 10 * 60 * 1000)) await enviarAvisoContaExistente(novo, idiomaDono || idioma);
    };

    const { data: u, error: uErro } = await supabaseAdmin.auth.admin.getUserById(tk.userId);
    if (!u?.user) {
      if (uErro && uErro.status !== 404) throw new Error(uErro.message);
      // token fantasma (cadastro com e-mail que ja tinha conta): responde como sucesso, com o
      // mesmo limite de 3 correcoes da conta de verdade (aqui contado em memoria)
      if (!dentroDoLimite(`cadastro-corrigir-ok:${tk.userId}`, CORRECAO_MAX, CORRECAO_PRAZO_MS)) {
        return NextResponse.json({ error: 'Limite de correcoes', codigo: 'CORRECOES_ESGOTADAS' }, { status: 429 });
      }
      const outro = await contaDoNovo();
      if (outro) await avisarDono(outro.idioma);
      return NextResponse.json({ ok: true, email: novo, correcao: novoTokenCorrecao(tk.userId, tk.expiraEm).token });
    }
    const user = u.user;
    const g = (user.app_metadata?.correcao_email ?? null) as CorrecaoGuardada | null;
    // ja confirmada (a pessoa entra normalmente) ou token anterior a uma correcao
    if (user.email_confirmed_at || !tokenEhOAtual(b.token, g)) {
      return NextResponse.json({ error: 'Correcao invalida', codigo: 'CORRECAO_INVALIDA' }, { status: 403 });
    }
    const usadas = Number(g!.usadas) || 0;
    if (usadas >= CORRECAO_MAX) return NextResponse.json({ error: 'Limite de correcoes', codigo: 'CORRECOES_ESGOTADAS' }, { status: 429 });
    if ((user.email || '').toLowerCase() === novo) return NextResponse.json({ error: 'E-mail igual', codigo: 'EMAIL_IGUAL' }, { status: 400 });

    // token novo a cada correcao; o prazo continua o do cadastro
    const proximo = novoTokenCorrecao(user.id, tk.expiraEm);
    const guardar: CorrecaoGuardada = { ...proximo.guardar, usadas: usadas + 1 };

    const outro = await contaDoNovo();
    if (outro && outro.id !== user.id) {
      // igual ao cadastro: nao revela na tela; a conta fica com o e-mail anterior e a
      // tentativa conta no limite
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { app_metadata: { correcao_email: guardar } });
      if (error) throw new Error(error.message);
      await avisarDono(outro.idioma);
      return NextResponse.json({ ok: true, email: novo, correcao: proximo.token });
    }

    const { error: aErro } = await supabaseAdmin.auth.admin.updateUserById(user.id, { email: novo, app_metadata: { correcao_email: guardar } });
    if (aErro) throw new Error(aErro.message);
    const { data: perfil, error: pErro } = await supabaseAdmin
      .from('profiles').update({ email: novo }).eq('id', user.id).select('nome, idioma').maybeSingle();
    if (pErro || !perfil) {
      // desfaz: conta e perfil continuam com o mesmo e-mail
      await supabaseAdmin.auth.admin.updateUserById(user.id, { email: user.email, app_metadata: { correcao_email: g } });
      throw new Error(pErro?.message || 'perfil nao encontrado');
    }
    const enviado = await enviarConfirmacaoEmail(novo, perfil.nome, perfil.idioma || idioma, doApp);
    // sem envio, a pessoa usa "enviar de novo" (ja para o endereco novo)
    if (!enviado) console.error('[cadastro/corrigir-email] link de confirmacao nao enviado');
    return NextResponse.json({ ok: true, email: novo, correcao: proximo.token });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[cadastro/corrigir-email]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
