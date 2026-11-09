import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { acessoEmergencia } from '@/lib/emergencia-acesso';
import { limitarPorIp } from '@/lib/rate-limit';
import { ErroValidacao, ehUuid, texto, placaCarro } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

// Quem registrou o acidente completa/corrige o PROPRIO carro (marca, modelo, placa) pela pagina do
// acidente - tambem quem entrou so com o codigo do navegador, sem login (dono 09/11).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (!limitarPorIp(req, 'emergencia-veiculo', 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas tentativas' }, { status: 429 });
    }
    const acesso = await acessoEmergencia(req, params.id);
    if (!acesso || acesso.papel !== 'proprietario') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (!acesso.emergencia.solicitacao_id) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const { data: sol } = await supabaseAdmin.from('solicitacoes').select('veiculo_id, cliente_id').eq('id', acesso.emergencia.solicitacao_id).maybeSingle();
    if (!sol?.veiculo_id) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dados = {
      fipe_marca: texto(d.marca, 'marca', 60, true),
      fipe_modelo: texto(d.modelo, 'modelo', 80) || '',
      placa: placaCarro(d.placa, 'placa'),
    };
    const { error } = await supabaseAdmin.from('veiculos').update(dados).eq('id', sol.veiculo_id).eq('profile_id', sol.cliente_id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[emergencia/veiculo]', e);
    return NextResponse.json({ error: 'Erro ao salvar o carro' }, { status: 500 });
  }
}
