import { NextRequest, NextResponse } from 'next/server';
import { TIPOS_SERVICO } from '@fixauto/shared';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp, dentroDoLimite } from '@/lib/rate-limit';
import { ErroValidacao, texto, email as validarEmail, umDe, numero } from '@/lib/validacao';
import { enviarConfirmacaoEmail, enviarAvisoContaExistente } from '@/lib/email-cadastro';
import { enviarEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/email-i18n';
import { idiomaDoSite } from '@/lib/site-url';
import { TERMOS_VERSAO } from '@/lib/termos';

// Cadastro com confirmacao de e-mail (site e app). O cadastro direto no
// GoTrue (supabase.auth.signUp) fica DESLIGADO (GOTRUE_DISABLE_SIGNUP): toda
// conta nasce aqui, validada no servidor, sem confirmar - o login so funciona
// depois que a pessoa abre o link enviado para o e-mail (prova que o e-mail
// e dela). Perfil e oficina/loja sao criados junto, pela service role, entao
// nao dependem de sessao no navegador.
//
// Resposta igual exista ou nao o e-mail (nao revela quem tem conta); quem ja
// tem conta recebe um aviso no proprio e-mail.
const TIPOS = ['cliente', 'oficina', 'loja_pecas'] as const;
const ESPECIALIDADES = TIPOS_SERVICO.map((t) => t.value) as readonly string[];

export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'cadastro', 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  let criado: string | null = null;
  try {
    const b = await req.json();
    const email = validarEmail(b.email, true)!;
    const senha = typeof b.senha === 'string' ? b.senha : '';
    if (senha.length < 8 || senha.length > 72) throw new ErroValidacao('senha curta', 'SENHA_CURTA');
    const nome = texto(b.nome, 'nome', 100, true)!;
    const telefone = texto(b.telefone, 'telefone', 30);
    const tipo = umDe(b.tipo, 'tipo', TIPOS);
    const idioma = idiomaDoSite(typeof b.idioma === 'string' ? b.idioma : null);
    if (b.aceitouTermos !== true) throw new ErroValidacao('termos', 'TERMOS_OBRIGATORIOS');
    const empresa = tipo === 'cliente' ? null : validarEmpresa(b.empresa, tipo);
    if (empresa && b.declaracaoResponsavel !== true) throw new ErroValidacao('declaracao', 'DECLARACAO_OBRIGATORIA');

    const { data: existente } = await supabaseAdmin
      .from('profiles').select('id, idioma').ilike('email', email.replace(/[%_\\]/g, '\\$&')).maybeSingle();
    if (existente) {
      if (dentroDoLimite(`cadastro-existe:${email}`, 1, 10 * 60 * 1000)) {
        await enviarAvisoContaExistente(email, existente.idioma || idioma);
      }
      return NextResponse.json({ ok: true });
    }

    const { data: auth, error: authErro } = await supabaseAdmin.auth.admin.createUser({
      email, password: senha, email_confirm: false, user_metadata: { tipo, idioma },
    });
    if (authErro || !auth.user) {
      // conta so no auth (sem perfil) ou corrida de dois cadastros: mesma resposta
      if (/already|registered|exists/i.test(authErro?.message || '')) return NextResponse.json({ ok: true });
      throw new Error(authErro?.message || 'createUser falhou');
    }
    criado = auth.user.id;
    const agora = new Date().toISOString();

    const { error: pErro } = await supabaseAdmin.from('profiles').insert({
      id: criado, tipo, nome, email, telefone, idioma,
      termos_aceitos_em: agora, termos_versao: TERMOS_VERSAO,
      responsavel_declarado_em: empresa ? agora : null,
    });
    if (pErro) throw new Error(pErro.message);

    if (empresa) {
      const tabela = tipo === 'oficina' ? 'oficinas' : 'lojas_pecas';
      const { error: eErro } = await supabaseAdmin.from(tabela).insert({ profile_id: criado, ...empresa });
      if (eErro) throw new Error(eErro.message);
    }

    const enviado = await enviarConfirmacaoEmail(email, nome, idioma);
    if (!enviado) throw new Error('e-mail de confirmacao nao enviado');

    if (empresa && process.env.VISITAS_EMAIL_PARA) {
      // parceiro novo nasce inativo: avisa o admin para conferir o registro e ativar
      await enviarEmail({
        para: process.env.VISITAS_EMAIL_PARA,
        assunto: `Novo cadastro para conferir: ${empresa.nome_fantasia.slice(0, 80)}`,
        html: `<p>Novo cadastro de <strong>${tipo === 'oficina' ? 'oficina' : 'loja de peças'}</strong> aguardando a conferência do registro da empresa.</p>
          <p>Nome: ${escapeHtml(empresa.nome_fantasia)}<br>Registro: ${escapeHtml(empresa.cnpj)}<br>País: ${empresa.pais}<br>Cidade: ${escapeHtml(empresa.cidade)}<br>Responsável: ${escapeHtml(nome)} (${escapeHtml(email)})</p>
          <p>Depois de conferir, ative em ${tipo === 'oficina' ? '/admin/oficinas' : '/admin/pecas'}.</p>`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (criado) {
      // desfaz o cadastro pela metade: a pessoa pode tentar de novo
      await supabaseAdmin.from('oficinas').delete().eq('profile_id', criado);
      await supabaseAdmin.from('lojas_pecas').delete().eq('profile_id', criado);
      await supabaseAdmin.from('profiles').delete().eq('id', criado);
      await supabaseAdmin.auth.admin.deleteUser(criado);
    }
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[cadastro]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}

function validarEmpresa(v: unknown, tipo: 'oficina' | 'loja_pecas') {
  const e = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const pais = typeof e.pais === 'string' && /^[A-Za-z]{2}$/.test(e.pais) ? e.pais.toUpperCase() : 'BR';
  const especialidades = Array.isArray(e.especialidades)
    ? Array.from(new Set(e.especialidades.filter((x): x is string => typeof x === 'string' && ESPECIALIDADES.includes(x))))
    : [];
  if (tipo === 'oficina' && especialidades.length === 0) throw new ErroValidacao('especialidades', 'CAMPO_OBRIGATORIO');
  const base = {
    nome_fantasia: texto(e.nome_fantasia, 'nome_fantasia', 150, true)!,
    // o registro da empresa e o que conferimos antes de ativar - obrigatorio
    cnpj: texto(e.cnpj, 'registro', 40, true)!,
    endereco: texto(e.endereco, 'endereco', 200) || '',
    cidade: texto(e.cidade, 'cidade', 100) || '',
    estado: texto(e.estado, 'estado', 60) || '',
    cep: texto(e.cep, 'cep', 20) || '',
    pais,
    latitude: e.latitude == null ? null : numero(e.latitude, 'latitude', -90, 90),
    longitude: e.longitude == null ? null : numero(e.longitude, 'longitude', -180, 180),
    raio_atendimento_km: 30,
    // so aparece para clientes depois que o admin confere o registro e ativa
    ativa: false,
  };
  return tipo === 'oficina' ? { ...base, especialidades } : base;
}
