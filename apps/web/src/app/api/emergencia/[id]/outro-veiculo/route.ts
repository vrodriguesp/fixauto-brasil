import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { acessoEmergencia } from '@/lib/emergencia-acesso';
import { avisarOutroMotorista } from '@/lib/emergencia-outro';
import { limitarPorIp } from '@/lib/rate-limit';
import { ErroValidacao, ehUuid, texto, email as validarEmail, validarImagens, extensaoDe, placaCarro } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

// Quem registrou o acidente informa o outro veiculo (uma vez), com fotos, e
// o outro motorista e avisado. So o dono do acidente pode.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (!limitarPorIp(req, 'emergencia-outro', 5, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas tentativas' }, { status: 429 });
    }
    const acesso = await acessoEmergencia(req, params.id);
    if (!acesso || acesso.papel !== 'proprietario') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    const { count } = await supabaseAdmin
      .from('emergencia_outro_veiculo')
      .select('id', { count: 'exact', head: true })
      .eq('emergencia_id', params.id);
    if (count && count > 0) return NextResponse.json({ error: 'Outro veículo já registrado' }, { status: 409 });

    const form = await req.formData();
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(String(form.get('dados') || '{}'));
    } catch {
      throw new ErroValidacao('dados inválidos');
    }
    const fotos = validarImagens(
      form.getAll('fotos').filter((f): f is File => f instanceof File),
      6
    );

    const registro = {
      emergencia_id: params.id,
      nome: texto(d.nome, 'nome', 100, true),
      telefone: texto(d.telefone, 'telefone', 30),
      email: validarEmail(d.email),
      placa: placaCarro(texto(d.placa, 'placa', 15, true), 'placa'),
      veiculo_descricao: texto(d.veiculo, 'veiculo', 120),
      observacoes: texto(d.observacoes, 'observacoes', 2000),
    };
    const { data: outro, error } = await supabaseAdmin.from('emergencia_outro_veiculo').insert(registro).select('*').single();
    if (error || !outro) throw error || new Error('Erro ao registrar');

    for (const f of fotos) {
      const caminho = `emergencia/${params.id}/outro/${randomUUID()}.${extensaoDe(f.type)}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('damage-photos')
        .upload(caminho, Buffer.from(await f.arrayBuffer()), { contentType: f.type });
      if (upErr) continue;
      const url = supabaseAdmin.storage.from('damage-photos').getPublicUrl(caminho).data.publicUrl;
      await supabaseAdmin.from('emergencia_outro_veiculo_fotos').insert({ outro_veiculo_id: outro.id, foto_url: url });
    }

    if (outro.email || outro.telefone) {
      await avisarOutroMotorista(acesso.emergencia, outro, texto(d.idioma, 'idioma', 10)).catch((e) =>
        console.error('[emergencia/outro-veiculo] aviso', e)
      );
    }
    return NextResponse.json({ id: outro.id });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[emergencia/outro-veiculo]', e);
    return NextResponse.json({ error: 'Erro ao registrar o outro veículo' }, { status: 500 });
  }
}

// Corrigir os dados do outro motorista ja registrado (dono 09/11: "Editar" no resumo, em vez de
// pedir tudo de novo). So quem registrou. E-mail novo/trocado: o outro motorista e avisado.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (!limitarPorIp(req, 'emergencia-outro-editar', 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas tentativas' }, { status: 429 });
    }
    const acesso = await acessoEmergencia(req, params.id);
    if (!acesso || acesso.papel !== 'proprietario') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    const { data: atual } = await supabaseAdmin.from('emergencia_outro_veiculo').select('id, email').eq('emergencia_id', params.id).maybeSingle();
    if (!atual) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dados = {
      nome: texto(d.nome, 'nome', 100, true),
      telefone: texto(d.telefone, 'telefone', 30),
      email: validarEmail(d.email),
      placa: placaCarro(texto(d.placa, 'placa', 15, true), 'placa'),
      veiculo_descricao: texto(d.veiculo, 'veiculo', 120),
      observacoes: texto(d.observacoes, 'observacoes', 2000),
    };
    const { data: outro, error } = await supabaseAdmin.from('emergencia_outro_veiculo').update(dados).eq('id', atual.id).select('*').single();
    if (error || !outro) throw error || new Error('Erro ao salvar');
    if (outro.email && outro.email !== atual.email) {
      await avisarOutroMotorista(acesso.emergencia, outro, texto(d.idioma, 'idioma', 10)).catch((e) => console.error('[emergencia/outro-veiculo] aviso', e));
    }
    return NextResponse.json({ id: outro.id });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[emergencia/outro-veiculo PATCH]', e);
    return NextResponse.json({ error: 'Erro ao salvar o outro veículo' }, { status: 500 });
  }
}
