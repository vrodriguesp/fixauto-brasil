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
import { validarSeguro } from '@/lib/seguro-reparo';

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
    const latitude = numero(d.latitude, 'latitude', -90, 90);
    const longitude = numero(d.longitude, 'longitude', -180, 180);
    // so o GPS respondeu (sem rua): guarda as coordenadas como endereco
    const endereco = texto(d.endereco, 'endereco', 300)
      || (latitude != null && longitude != null ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : null);
    const idioma = texto(d.idioma, 'idioma', 10);
    const placa = texto(d.placa, 'placa', 15);
    // quem paga o reparo (opcional; pode ser completado depois na pagina do acidente)
    const seguro = validarSeguro(d);
    const vInfo = (d.veiculoInfo && typeof d.veiculoInfo === 'object' ? d.veiculoInfo : {}) as Record<string, unknown>;

    let nome = texto(d.nome, 'nome', 100);
    let email = validarEmail(d.email);
    let telefone = texto(d.telefone, 'telefone', 30);

    // Dono: sessao; sem sessao, o e-mail informado (conta criada ou existente)
    let clienteId = userId;
    let contaCriada = false;
    if (clienteId) {
      const { data: p } = await supabaseAdmin.from('profiles').select('nome, email, telefone').eq('id', clienteId).single();
      // com sessao vale o perfil (o corpo so completa o que faltar - auditoria B10)
      nome = p?.nome || nome || null;
      email = p?.email || email || null;
      telefone = p?.telefone || telefone || null;
    } else {
      if (!email) throw new ErroValidacao('email obrigatório');
      if (!nome) throw new ErroValidacao('nome obrigatório');
      // E-mail de uma conta que ja existe: so com login. Antes, qualquer um
      // registrava um acidente DENTRO da conta de outra pessoa e recebia o
      // token de acesso (auditoria Fable 08/10, C1).
      const { data: jaExiste } = await supabaseAdmin.from('profiles').select('id')
        .ilike('email', email.replace(/[%_\\]/g, '\\$&')).maybeSingle();
      if (jaExiste) return NextResponse.json({ error: 'Entre na sua conta', codigo: 'CONTA_EXISTENTE' }, { status: 409 });
      const conta = await garantirContaCliente({ email, nome, telefone, idioma });
      clienteId = conta.id;
      contaCriada = conta.criada;
    }

    // sem texto livre fica so a marca do tipo (a tela mostra "Acidente" traduzido)
    const descricao = `[TIPO:${tipoAcidente}] ${descricaoLivre || ''}`.trim();
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
        tipo_acidente: tipoAcidente,
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

    // Carro do acidente: (1) um dos carros da pessoa, escolhido no formulario;
    // (2) mesma placa de um carro dela; (3) o que ela informou agora vira um
    // carro cadastrado dela; (4) nada informado: com um so carro, e ele; senao
    // um carro "a completar" (antes pegava o primeiro carro da lista, mesmo
    // que fosse outro). Os dados podem ser completados depois no pedido.
    const veiculoPedido = typeof d.veiculoId === 'string' ? d.veiculoId : null;
    const marcaInf = String(vInfo.marca || '').trim().slice(0, 60);
    const modeloInf = String(vInfo.modelo || '').trim().slice(0, 80);
    const { data: meus } = await supabaseAdmin.from('veiculos').select('id, placa, fipe_marca').eq('profile_id', clienteId);
    const normPlaca = (p: string | null | undefined) => (p || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    let veiculoId: string | undefined =
      (veiculoPedido && meus?.find((v) => v.id === veiculoPedido)?.id) ||
      (placa ? meus?.find((v) => normPlaca(v.placa) && normPlaca(v.placa) === normPlaca(placa))?.id : undefined);
    if (!veiculoId && !placa && !marcaInf) {
      const completos = (meus || []).filter((v) => v.fipe_marca);
      if (completos.length === 1) veiculoId = completos[0].id;
    }
    if (!veiculoId) {
      const { data: v } = await supabaseAdmin
        .from('veiculos')
        .insert({
          profile_id: clienteId,
          fipe_tipo: 'cars',
          fipe_marca: marcaInf,
          fipe_modelo: modeloInf,
          fipe_ano: String(vInfo.ano || '').slice(0, 10),
          placa,
          cor: vInfo.cor ? String(vInfo.cor).slice(0, 30) : null,
          apelido: null,
        })
        .select('id')
        .single();
      veiculoId = v?.id;
    }

    let solicitacaoId: string | null = null;
    if (veiculoId) {
      const { data: sol } = await supabaseAdmin
        .from('solicitacoes')
        .insert({
          cliente_id: clienteId, veiculo_id: veiculoId, tipo: 'colisao', descricao, tipo_acidente: tipoAcidente, urgencia: 'alta', latitude, longitude, endereco, emergencia_id: emergencia.id,
          ...seguro, seguro_atualizado_em: seguro.pagamento_reparo ? new Date().toISOString() : null,
        })
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
