import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { emergenciaId, clienteId, nome, email, telefone, descricao, latitude, longitude, endereco, photoUrls, placa, veiculoInfo } = await req.json();

    if (!emergenciaId) {
      return NextResponse.json({ error: 'emergenciaId obrigatório' }, { status: 400 });
    }

    let finalClienteId = clienteId;

    // If no logged-in user, create account automatically
    if (!finalClienteId && email) {
      // Check if email already has an account
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (existingProfile) {
        finalClienteId = existingProfile.id;
      } else {
        // Create auth user with temporary password
        const tempPassword = `BipFix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        });

        if (authError || !authData.user) {
          console.error('[criar-solicitacao-emergencia] Auth error:', authError?.message);
          return NextResponse.json({ error: authError?.message || 'Erro ao criar conta' }, { status: 500 });
        }

        finalClienteId = authData.user.id;

        // Create profile
        await supabaseAdmin.from('profiles').insert({
          id: finalClienteId,
          tipo: 'cliente',
          nome: nome || email.split('@')[0],
          email,
          telefone: telefone || null,
        });

        // Send password reset email so user can set their own password
        await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://bipfix.com'}/reset-password` },
        });

        // Send welcome email via Resend
        if (process.env.RESEND_API_KEY) {
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'BipFix <noreply@bipfix.com>',
                to: email,
                subject: 'Sua conta BipFix foi criada - Defina sua senha',
                html: `
                  <h2>Olá ${nome || ''}!</h2>
                  <p>Sua emergência foi registrada no BipFix e oficinas próximas já estão sendo notificadas.</p>
                  <p>Criamos uma conta para você acompanhar os orçamentos que chegarem.</p>
                  <p><strong>Para acessar sua conta, defina uma senha clicando no link abaixo:</strong></p>
                  <p><a href="https://bipfix.com/reset-password" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Definir minha senha</a></p>
                  <p>Seu email de acesso: <strong>${email}</strong></p>
                  <p>Você receberá notificações por email quando oficinas enviarem orçamentos.</p>
                  <br>
                  <p>Equipe BipFix</p>
                `,
              }),
            });
          } catch { /* non-blocking */ }
        }

        // Update emergencia with profile_id
        await supabaseAdmin.from('emergencias').update({ profile_id: finalClienteId }).eq('id', emergenciaId);
      }
    }

    if (!finalClienteId) {
      return NextResponse.json({ error: 'Não foi possível identificar o cliente' }, { status: 400 });
    }

    // Get first vehicle or create placeholder
    const { data: veiculos } = await supabaseAdmin
      .from('veiculos')
      .select('id')
      .eq('profile_id', finalClienteId)
      .limit(1);

    let veiculoId = veiculos?.[0]?.id;

    if (!veiculoId) {
      const { data: newVeiculo } = await supabaseAdmin
        .from('veiculos')
        .insert({
          profile_id: finalClienteId,
          fipe_tipo: 'cars',
          fipe_marca: veiculoInfo?.marca || 'A definir',
          fipe_modelo: veiculoInfo?.modelo || 'A definir',
          fipe_ano: veiculoInfo?.ano || 'A definir',
          placa: placa || null,
          cor: veiculoInfo?.cor || null,
          apelido: placa ? `Veículo ${placa}` : 'Veículo da emergência',
        })
        .select('id')
        .single();
      veiculoId = newVeiculo?.id;
    }

    if (!veiculoId) {
      return NextResponse.json({ error: 'Não foi possível criar veículo' }, { status: 500 });
    }

    // Create solicitacao
    const { data: sol, error: solError } = await supabaseAdmin
      .from('solicitacoes')
      .insert({
        cliente_id: finalClienteId,
        veiculo_id: veiculoId,
        tipo: 'colisao',
        descricao: descricao || 'Emergência - Colisão',
        urgencia: 'alta',
        latitude,
        longitude,
        endereco,
      })
      .select()
      .single();

    if (solError || !sol) {
      return NextResponse.json({ error: solError?.message || 'Erro ao criar solicitação' }, { status: 500 });
    }

    // Link emergencia to solicitacao
    await supabaseAdmin.from('emergencias').update({ solicitacao_id: sol.id }).eq('id', emergenciaId);

    // Copy photos
    if (photoUrls && Array.isArray(photoUrls)) {
      for (const url of photoUrls) {
        await supabaseAdmin.from('solicitacao_fotos').insert({
          solicitacao_id: sol.id,
          foto_url: url,
        });
      }
    }

    // Notify oficinas about the new solicitação
    const { data: oficinas } = await supabaseAdmin
      .from('oficinas')
      .select('id, profile_id, especialidades')
      .eq('ativa', true);

    if (oficinas) {
      for (const ofi of oficinas) {
        if (ofi.especialidades?.length > 0 && !ofi.especialidades.some((e: string) => ['colisao', 'funilaria'].includes(e))) continue;
        await supabaseAdmin.from('notificacoes').insert({
          profile_id: ofi.profile_id,
          tipo: 'nova_solicitacao',
          titulo: 'Nova solicitação!',
          mensagem: `Emergência - Novo pedido de reparo por colisão na sua região.`,
          dados: { solicitacao_id: sol.id },
        });
      }
    }

    return NextResponse.json({ success: true, solicitacaoId: sol.id, contaCriada: !clienteId });
  } catch (err) {
    console.error('[criar-solicitacao-emergencia]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
