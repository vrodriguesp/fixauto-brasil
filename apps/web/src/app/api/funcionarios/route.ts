import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { sendFuncionarioNovaSenhaEmail } from '@/lib/notifications';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';


// Gerador criptografico (Math.random() e previsivel - OWASP); 12 caracteres
function gerarSenhaTemporaria(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$&';
  let senha = '';
  for (let i = 0; i < 12; i++) senha += chars[randomInt(chars.length)];
  return senha;
}

// POST: Create a new funcionario with nome, email, senha temporária
export async function POST(req: NextRequest) {
  try {
    const { nome, email, senha, cargo, especialidade, oficina_id, telefone, acesso_portal } = await req.json();

    // Mecanico SEM acesso ao portal: so nome (e telefone) para a oficina
    // atribuir servicos e registrar etapas em nome dele - sem conta de login.
    if (acesso_portal === false) {
      const callerSemAcesso = await getSessionUserId(req);
      if (!callerSemAcesso) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
      const { data: minha } = await supabaseAdmin.from('oficinas').select('id').eq('id', oficina_id).eq('profile_id', callerSemAcesso).maybeSingle();
      if (!minha) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
      const nomeLimpo = typeof nome === 'string' ? nome.trim().slice(0, 100) : '';
      if (!nomeLimpo) return NextResponse.json({ error: 'Nome obrigatório', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
      const { data: novo, error: eNovo } = await supabaseAdmin.from('funcionarios').insert({
        oficina_id, profile_id: null, acesso_portal: false, nome: nomeLimpo,
        telefone: typeof telefone === 'string' ? telefone.trim().slice(0, 30) || null : null,
        cargo: cargo === 'admin' ? 'admin' : 'mecanico', especialidade: especialidade || null, primeiro_login: false,
      }).select('*').single();
      if (eNovo) return NextResponse.json({ error: eNovo.message }, { status: 500 });
      return NextResponse.json({ success: true, funcionario: novo });
    }

    if (cargo && !['mecanico', 'admin'].includes(cargo)) {
      return NextResponse.json({ error: 'Cargo inválido', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
    }
    if (!email || !senha || !cargo || !oficina_id) {
      return NextResponse.json({ error: 'Campos obrigatórios: email, senha, cargo, oficina_id' }, { status: 400 });
    }
    if (typeof senha !== 'string' || senha.length < 8) {
      return NextResponse.json({ error: 'Senha curta', codigo: 'SENHA_CURTA' }, { status: 400 });
    }

    // So o dono da oficina pode cadastrar funcionario nela - sem isso,
    // qualquer um passando um oficina_id de terceiro criava uma conta e
    // se auto-cadastrava como funcionario daquela oficina (account
    // takeover). Ver docs/AUDITORIA_SEGURANCA_API_2026-09-08.md.
    const callerId = await getSessionUserId(req);
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const { data: oficinaDoChamador } = await supabaseAdmin
      .from('oficinas')
      .select('id, profile:profiles(idioma)')
      .eq('id', oficina_id)
      .eq('profile_id', callerId)
      .single();
    if (!oficinaDoChamador) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // 1. Check if user exists with this email
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, email, tipo')
      .eq('email', email)
      .single();

    let profileId: string;

    if (existingProfile) {
      // So liga conta de equipe (tipo oficina, sem oficina propria). E-mail de
      // cliente/loja nao vira funcionario: ao remover depois, a conta dele seria
      // apagada junto (auditoria Fable 08/10, M-08).
      const { data: temOficina } = await supabaseAdmin.from('oficinas').select('id').eq('profile_id', existingProfile.id).maybeSingle();
      if ((existingProfile as any).tipo !== 'oficina' || temOficina) {
        return NextResponse.json({ error: 'Este e-mail já é de outra conta', codigo: 'EMAIL_DE_OUTRA_CONTA' }, { status: 409 });
      }
      profileId = existingProfile.id;
    } else {
      // 2. Create auth user with the provided password
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });

      if (authError || !authData.user) {
        return NextResponse.json({ error: authError?.message || 'Erro ao criar usuário' }, { status: 500 });
      }

      profileId = authData.user.id;

      // Create profile as 'oficina' type so they get oficina routing -
      // idioma herda do dono da oficina que esta convidando (mesma
      // empresa/pais, aposta razoavel na ausencia de sinal proprio).
      await supabaseAdmin.from('profiles').insert({
        id: profileId,
        tipo: 'oficina',
        nome: nome || email.split('@')[0],
        email,
        idioma: (oficinaDoChamador as any)?.profile?.idioma || 'pt',
      });
    }

    // 3. Check if already a funcionario of this oficina
    const { data: existing } = await supabaseAdmin
      .from('funcionarios')
      .select('id')
      .eq('profile_id', profileId)
      .eq('oficina_id', oficina_id)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Este funcionário já está cadastrado nesta oficina', codigo: 'FUNCIONARIO_JA_CADASTRADO' }, { status: 409 });
    }

    // 4. Create funcionario record with primeiro_login = true
    const { data: func, error: funcError } = await supabaseAdmin
      .from('funcionarios')
      .insert({
        profile_id: profileId,
        oficina_id,
        cargo,
        especialidade: especialidade || null,
        primeiro_login: true,
      })
      .select('*, profile:profiles(*)')
      .single();

    if (funcError) {
      return NextResponse.json({ error: funcError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, funcionario: func });
  } catch (err) {
    console.error('[funcionarios] POST error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH: Update funcionario (toggle ativo, change cargo, primeiro_login,
// dados pessoais via profiles, ou gerar nova senha temporária)
export async function PATCH(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { id, nome, telefone, resetSenha, concederAcesso, ...funcUpdates } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    const { data: func } = await supabaseAdmin
      .from('funcionarios')
      .select('*, profile:profiles(id, nome, email, idioma), oficina:oficinas(nome_fantasia, profile_id)')
      .eq('id', id)
      .single();

    if (!func) {
      return NextResponse.json({ error: 'Funcionário não encontrado' }, { status: 404 });
    }

    // So o dono da oficina pode editar/resetar senha/mudar cargo de um
    // funcionario dela - sem isso, o id (por si so) bastava pra
    // sequestrar a conta de qualquer funcionario de qualquer oficina.
    if ((func as any).oficina?.profile_id !== callerId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // So campos conhecidos (antes qualquer coluna do corpo ia para o update)
    for (const k of Object.keys(funcUpdates)) {
      if (!['ativo', 'cargo', 'especialidade', 'capacidade_maxima', 'primeiro_login'].includes(k)) delete funcUpdates[k];
    }
    if (funcUpdates.cargo !== undefined && !['mecanico', 'admin'].includes(funcUpdates.cargo)) {
      return NextResponse.json({ error: 'Cargo inválido', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
    }

    // Dar acesso ao portal a um mecanico cadastrado sem login
    if (concederAcesso && !func.profile_id) {
      const emailNovo = String(concederAcesso.email || '').trim().toLowerCase();
      const senhaNova = String(concederAcesso.senha || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNovo)) return NextResponse.json({ error: 'E-mail inválido', codigo: 'EMAIL_INVALIDO' }, { status: 400 });
      if (senhaNova.length < 8) return NextResponse.json({ error: 'Senha curta', codigo: 'SENHA_CURTA' }, { status: 400 });
      const { data: jaExiste } = await supabaseAdmin.from('profiles').select('id').eq('email', emailNovo).maybeSingle();
      let novoProfileId = jaExiste?.id as string | undefined;
      if (!novoProfileId) {
        const { data: criado, error: eCriar } = await supabaseAdmin.auth.admin.createUser({ email: emailNovo, password: senhaNova, email_confirm: true });
        if (eCriar || !criado.user) return NextResponse.json({ error: eCriar?.message || 'Erro ao criar usuário' }, { status: 500 });
        novoProfileId = criado.user.id;
        const { data: dono } = await supabaseAdmin.from('profiles').select('idioma').eq('id', callerId).maybeSingle();
        await supabaseAdmin.from('profiles').insert({ id: novoProfileId, tipo: 'oficina', nome: (func as any).nome || emailNovo.split('@')[0], email: emailNovo, telefone: (func as any).telefone || null, idioma: dono?.idioma || 'pt' });
      }
      const { error: eLig } = await supabaseAdmin.from('funcionarios').update({ profile_id: novoProfileId, acesso_portal: true, primeiro_login: true }).eq('id', id);
      if (eLig) return NextResponse.json({ error: eLig.message, codigo: eLig.code === '23505' ? 'FUNCIONARIO_JA_CADASTRADO' : undefined }, { status: eLig.code === '23505' ? 409 : 500 });
      return NextResponse.json({ success: true });
    }

    // Sem login: nome e telefone ficam no proprio cadastro do mecanico
    if (!func.profile_id && (nome !== undefined || telefone !== undefined)) {
      await supabaseAdmin.from('funcionarios').update({
        ...(nome !== undefined ? { nome: String(nome).trim().slice(0, 100) || (func as any).nome } : {}),
        ...(telefone !== undefined ? { telefone: telefone ? String(telefone).slice(0, 30) : null } : {}),
      }).eq('id', id);
    }

    // Update personal data on profiles
    if (func.profile_id && (nome !== undefined || telefone !== undefined)) {
      const profileUpdates: Record<string, string> = {};
      if (nome !== undefined) profileUpdates.nome = nome;
      if (telefone !== undefined) profileUpdates.telefone = telefone;
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdates)
        .eq('id', func.profile_id);
      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }
    }

    // Generate a new temporary password and force change on next login
    let novaSenha: string | undefined;
    if (resetSenha && func.profile_id) {
      novaSenha = gerarSenhaTemporaria();
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(func.profile_id, {
        password: novaSenha,
      });
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 });
      }
      funcUpdates.primeiro_login = true;

      if (func.profile?.email) {
        await sendFuncionarioNovaSenhaEmail({
          toEmail: func.profile.email,
          toName: func.profile.nome || 'Funcionário',
          oficinaNome: func.oficina?.nome_fantasia || 'Sua oficina',
          novaSenha,
          locale: (func.profile as any)?.idioma,
        }).catch(() => {});
      }
    }

    // Update role/status/specialty fields on funcionarios
    if (Object.keys(funcUpdates).length > 0) {
      const { error } = await supabaseAdmin
        .from('funcionarios')
        .update(funcUpdates)
        .eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, novaSenha });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE: Remove funcionario + profile + auth user
export async function DELETE(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    // 1. Get the funcionario to find the profile_id + confirm ownership
    const { data: func } = await supabaseAdmin
      .from('funcionarios')
      .select('profile_id, oficina:oficinas(profile_id)')
      .eq('id', id)
      .single();

    if (!func) {
      return NextResponse.json({ error: 'Funcionário não encontrado' }, { status: 404 });
    }

    // So o dono da oficina pode remover um funcionario dela - sem isso, o
    // id bastava pra apagar (inclusive a conta inteira via auth) o
    // funcionario de qualquer oficina.
    if ((func as any).oficina?.profile_id !== callerId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // 2. Check if this profile is ONLY a funcionario (not an oficina owner)
    const { data: ownsOficina } = await supabaseAdmin
      .from('oficinas')
      .select('id')
      .eq('profile_id', func.profile_id)
      .single();

    // Ja trabalhou em algum servico: so desativa, para o historico continuar
    // mostrando quem fez cada etapa
    const [{ count: nEtapas }, { count: nAgenda }] = await Promise.all([
      supabaseAdmin.from('manutencao_etapas').select('id', { count: 'exact', head: true }).eq('funcionario_id', id),
      supabaseAdmin.from('agenda').select('id', { count: 'exact', head: true }).eq('funcionario_id', id),
    ]);
    if ((nEtapas || 0) + (nAgenda || 0) > 0) {
      await supabaseAdmin.from('funcionarios').update({ ativo: false }).eq('id', id);
      return NextResponse.json({ success: true, desativado: true });
    }

    // 3. Delete funcionario record
    const { error } = await supabaseAdmin
      .from('funcionarios')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 4. So apaga a conta de login se ela existe SO por causa deste vinculo:
    //    conta de equipe, sem oficina propria, sem outro vinculo de equipe,
    //    sem pedidos/carros. Senao so desliga o vinculo (M-08).
    if (!ownsOficina && func.profile_id) {
      const [{ data: perfil }, { count: outrosVinculos }, { count: pedidos }, { count: carros }] = await Promise.all([
        supabaseAdmin.from('profiles').select('tipo').eq('id', func.profile_id).maybeSingle(),
        supabaseAdmin.from('funcionarios').select('id', { count: 'exact', head: true }).eq('profile_id', func.profile_id),
        supabaseAdmin.from('solicitacoes').select('id', { count: 'exact', head: true }).eq('cliente_id', func.profile_id),
        supabaseAdmin.from('veiculos').select('id', { count: 'exact', head: true }).eq('profile_id', func.profile_id),
      ]);
      if ((perfil as any)?.tipo === 'oficina' && !outrosVinculos && !pedidos && !carros) {
        await supabaseAdmin.auth.admin.deleteUser(func.profile_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
