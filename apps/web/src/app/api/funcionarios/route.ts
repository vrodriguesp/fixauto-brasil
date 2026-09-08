import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendFuncionarioNovaSenhaEmail } from '@/lib/notifications';
import { getSessionUserId } from '@/lib/api-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function gerarSenhaTemporaria(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$&';
  let senha = '';
  for (let i = 0; i < 8; i++) senha += chars[Math.floor(Math.random() * chars.length)];
  return senha;
}

// POST: Create a new funcionario with nome, email, senha temporária
export async function POST(req: NextRequest) {
  try {
    const { nome, email, senha, cargo, especialidade, oficina_id } = await req.json();

    if (!email || !senha || !cargo || !oficina_id) {
      return NextResponse.json({ error: 'Campos obrigatórios: email, senha, cargo, oficina_id' }, { status: 400 });
    }

    // So o dono da oficina pode cadastrar funcionario nela - sem isso,
    // qualquer um passando um oficina_id de terceiro criava uma conta e
    // se auto-cadastrava como funcionario daquela oficina (account
    // takeover). Ver docs/AUDITORIA_SEGURANCA_API_2026-09-08.md.
    const callerId = await getSessionUserId();
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const { data: oficinaDoChamador } = await supabaseAdmin
      .from('oficinas')
      .select('id')
      .eq('id', oficina_id)
      .eq('profile_id', callerId)
      .single();
    if (!oficinaDoChamador) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // 1. Check if user exists with this email
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, email')
      .eq('email', email)
      .single();

    let profileId: string;

    if (existingProfile) {
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

      // Create profile as 'oficina' type so they get oficina routing
      await supabaseAdmin.from('profiles').insert({
        id: profileId,
        tipo: 'oficina',
        nome: nome || email.split('@')[0],
        email,
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
      return NextResponse.json({ error: 'Este funcionário já está cadastrado nesta oficina' }, { status: 409 });
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
    const callerId = await getSessionUserId();
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { id, nome, telefone, resetSenha, ...funcUpdates } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    const { data: func } = await supabaseAdmin
      .from('funcionarios')
      .select('*, profile:profiles(id, nome, email), oficina:oficinas(nome_fantasia, profile_id)')
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

    // Update personal data on profiles
    if (nome !== undefined || telefone !== undefined) {
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
    if (resetSenha) {
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
    const callerId = await getSessionUserId();
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

    // 3. Delete funcionario record
    const { error } = await supabaseAdmin
      .from('funcionarios')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 4. If they don't own an oficina, delete auth user entirely
    //    (CASCADE will delete profile and related data)
    if (!ownsOficina) {
      await supabaseAdmin.auth.admin.deleteUser(func.profile_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
