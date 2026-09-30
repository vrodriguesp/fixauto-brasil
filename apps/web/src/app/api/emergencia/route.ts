import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/api-auth';
import { limitarPorIp } from '@/lib/rate-limit';
import { ErroValidacao, texto, email as validarEmail, numero, umDe, validarImagens, extensaoDe } from '@/lib/validacao';
import { tokenAleatorio, hashToken } from '@/lib/segredos';
import { garantirContaCliente } from '@/lib/conta-convite';
import { avisarOficinasDoAcidente } from '@/lib/emergencia-oficinas';
import { notifNovaSolicitacaoColisao } from '@/lib/notif-i18n';
import { avisarAdminSeSemOficinas } from '@/lib/concierge';

export const dynamic = 'force-dynamic';

const TIPOS = ['eu_causei', 'outro_causou', 'sem_outro'] as const;
const HORA = 60 * 60 * 1000;

// Registro de acidente ("Acabei de bater"), no site e no app. Uma rota so,
// no servidor, faz tudo: antes eram 4 chamadas abertas (gravacao direta no
// banco pelo navegador, upload, criacao da solicitacao aceitando qualquer
// clienteId do corpo e aviso as oficinas) que qualquer um podia repetir para
// qualquer acidente. Agora:
// - o dono vem da SESSAO (nunca do corpo); sem login, o e-mail informado
//   ganha conta com link para definir senha (sem senha por e-mail);
// - devolve um codigo secreto (so o hash fica no banco) para quem registrou
//   sem login continuar acompanhando o acidente neste navegador;
// - limite por IP, validacao de campos e fotos (tipo, 10 MB, ate 6).
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!limitarPorIp(req, 'emergencia', userId ? 10 : 3, HORA)) {
      return NextResponse.json({ error: 'Muitos registros em pouco tempo. Tente de novo mais tarde.' }, { status: 429 });
    }

    const form = await req.formData();
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(String(form.get('dados') || '{}'));
    } catch {
      throw new ErroValidacao('dados inválidos');
    }
    const fotos = validarImagens(form.getAll('fotos').filter((f): f is File => f instanceof File), 6);

    const tipoAcidente = umDe(d.tipoAcidente ?? 'outro_causou', 'tipoAcidente', TIPOS);
    const descricaoLivre = texto(d.descricao, 'descricao', 2000);
    const endereco = texto(d.endereco, 'endereco', 300);
    const latitude = numero(d.latitude, 'latitude', -90, 90);
    const longitude = numero(d.longitude, 'longitude', -180, 180);
    const idioma = texto(d.idioma, 'idioma', 10);
    const placa = texto(d.placa, 'placa', 15);
    const vInfo = (d.veiculoInfo && typeof d.veiculoInfo === 'object' ? d.veiculoInfo : {}) as Record<string, unknown>;

    let nome = texto(d.nome, 'nome', 100);
    let email = validarEmail(d.email);
    let telefone = texto(d.telefone, 'telefone', 30);

    // Dono: sessao; sem sessao, o e-mail informado (conta criada ou existente)
    let clienteId = userId;
    let contaCriada = false;
    if (clienteId) {
      const { data: p } = await supabaseAdmin.from('profiles').select('nome, email, telefone').eq('id', clienteId).single();
      nome = nome || p?.nome || null;
      email = email || p?.email || null;
      telefone = telefone || p?.telefone || null;
    } else {
      if (!email) throw new ErroValidacao('email obrigatório');
      if (!nome) throw new ErroValidacao('nome obrigatório');
      const conta = await garantirContaCliente({ email, nome, telefone, idioma });
      clienteId = conta.id;
      contaCriada = conta.criada;
    }

    const descricao = `[TIPO:${tipoAcidente}] ${descricaoLivre || 'Emergência - Colisão'}`;
    const token = tokenAleatorio();

    const { data: emergencia, error: eErr } = await supabaseAdmin
      .from('emergencias')
      .insert({
        profile_id: clienteId,
        nome,
        email,
        telefone,
        descricao,
        endereco,
        latitude,
        longitude,
        prioridade: 'urgente',
        acesso_token_hash: hashToken(token),
      })
      .select('id')
      .single();
    if (eErr || !emergencia) throw new Error(eErr?.message || 'Erro ao registrar acidente');

    // Fotos: nomes aleatorios, no espaco privado (acesso por link temporario)
    const urls: string[] = [];
    for (const f of fotos) {
      const caminho = `emergencia/${emergencia.id}/${randomUUID()}.${extensaoDe(f.type)}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('damage-photos')
        .upload(caminho, Buffer.from(await f.arrayBuffer()), { contentType: f.type });
      if (upErr) {
        console.error('[emergencia] upload', upErr.message);
        continue;
      }
      const url = supabaseAdmin.storage.from('damage-photos').getPublicUrl(caminho).data.publicUrl;
      urls.push(url);
      await supabaseAdmin.from('emergencia_fotos').insert({ emergencia_id: emergencia.id, foto_url: url });
    }

    // Veiculo + solicitacao de colisao vinculada
    const { data: veiculos } = await supabaseAdmin.from('veiculos').select('id').eq('profile_id', clienteId).limit(1);
    let veiculoId = veiculos?.[0]?.id;
    if (!veiculoId) {
      const { data: v } = await supabaseAdmin
        .from('veiculos')
        .insert({
          profile_id: clienteId,
          fipe_tipo: 'cars',
          fipe_marca: String(vInfo.marca || '').slice(0, 60),
          fipe_modelo: String(vInfo.modelo || '').slice(0, 80),
          fipe_ano: String(vInfo.ano || '').slice(0, 10),
          placa,
          cor: vInfo.cor ? String(vInfo.cor).slice(0, 30) : null,
          apelido: placa ? `Veículo ${placa}` : 'Veículo da emergência',
        })
        .select('id')
        .single();
      veiculoId = v?.id;
    }

    let solicitacaoId: string | null = null;
    if (veiculoId) {
      const { data: sol } = await supabaseAdmin
        .from('solicitacoes')
        .insert({ cliente_id: clienteId, veiculo_id: veiculoId, tipo: 'colisao', descricao, urgencia: 'alta', latitude, longitude, endereco, emergencia_id: emergencia.id })
        .select('id')
        .single();
      solicitacaoId = sol?.id ?? null;
      if (solicitacaoId) {
        await supabaseAdmin.from('emergencias').update({ solicitacao_id: solicitacaoId }).eq('id', emergencia.id);
        for (const url of urls) await supabaseAdmin.from('solicitacao_fotos').insert({ solicitacao_id: solicitacaoId, foto_url: url });
      }
    }

    const avisadas = await avisarOficinasDoAcidente(emergencia.id, latitude, longitude);
    await avisarAdminSeSemOficinas('acidente', emergencia.id, `${descricao} - ${endereco || ''}`).catch((e) => console.error('[emergencia] concierge', e));

    // Oficinas de colisao ativas recebem tambem o aviso de nova solicitacao
    if (solicitacaoId) {
      const { data: oficinas } = await supabaseAdmin
        .from('oficinas')
        .select('profile_id, especialidades, profile:profiles!oficinas_profile_id_fkey(idioma)')
        .eq('ativa', true);
      for (const o of (oficinas || []) as any[]) {
        if (o.especialidades?.length > 0 && !o.especialidades.some((e: string) => ['colisao', 'funilaria'].includes(e))) continue;
        const n = notifNovaSolicitacaoColisao(o.profile?.idioma);
        await supabaseAdmin.from('notificacoes').insert({
          profile_id: o.profile_id,
          tipo: 'nova_solicitacao',
          titulo: n.titulo,
          mensagem: n.mensagem,
          dados: { solicitacao_id: solicitacaoId },
        });
      }
    }

    return NextResponse.json({ id: emergencia.id, token, solicitacaoId, contaCriada, oficinasNotificadas: avisadas });
  } catch (e) {
    if (e instanceof ErroValidacao) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 400 });
    console.error('[api/emergencia]', e);
    return NextResponse.json({ error: 'Erro ao registrar o acidente' }, { status: 500 });
  }
}
