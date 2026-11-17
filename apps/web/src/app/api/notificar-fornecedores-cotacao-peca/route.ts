import { NextRequest, NextResponse } from 'next/server';
import { distanciaKm } from '@/lib/utils';
import { sendCotacaoPecaDisponivelEmail } from '@/lib/notifications';
import { notifCotacaoPecaDisponivel } from '@/lib/notif-i18n';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { oficinaDoUsuarioEhDona } from '@/lib/acesso-servico';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { emTodasAsLinguas } from '@/lib/notif-textos';


// Avisa (sino + e-mail) quem pode vender a peca de um pedido novo:
//  - lojas de pecas ATIVAS do mesmo pais da oficina compradora (B3, 16/11: antes
//    as lojas nao recebiam nada e so viam o pedido se abrissem o site). Nao
//    depende de a compradora ter coordenadas (M12). O raio da loja (M2) ainda
//    nao filtra nada: decisao do dono pendente.
//  - oficinas que vendem sobra (vende_pecas) dentro do raio de cada uma, quando a
//    compradora tem coordenadas.
// Conta de teste so avisa conta de teste, e conta real so conta real (regra da 063).
// Dados lidos do banco (id da cotacao + sessao); o corpo nao decide nada.
// Lote 1 de pecas (17/11), pelo DADO da cotacao (os padroes = hoje, entao a cotacao da
// tela de hoje gera o mesmo aviso e o mesmo e-mail): "so lojas" nao avisa oficinas;
// vencida (expira_em no passado) nao avisa ninguem; quantidade com unidade e "sem
// veiculo"; a placa NUNCA vai no aviso nem no e-mail (so pela rota /api/cotacao-peca/placa).
export async function POST(req: NextRequest) {
  try {
    const { cotacaoId } = await req.json();
    if (!cotacaoId) {
      return NextResponse.json({ error: 'cotacaoId obrigatorio' }, { status: 400 });
    }

    // So a dona da oficina que pediu a cotacao
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const { data: cot } = await supabaseAdmin
      .from('cotacoes_pecas')
      .select('id, oficina_id, peca_descricao, fipe_marca, fipe_modelo, fipe_ano, quantidade, observacao, fotos, status, tipo, unidade, alvo, expira_em')
      .eq('id', cotacaoId)
      .maybeSingle();
    if (!cot || !(await oficinaDoUsuarioEhDona(userId, cot.oficina_id))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    const vencida = !!cot.expira_em && Date.parse(cot.expira_em) < Date.now();
    if (!['aberta', 'respondida'].includes(cot.status) || vencida) {
      return NextResponse.json({ success: true, lojasNotificadas: 0, oficinasNotificadas: 0 });
    }
    if (!dentroDoLimite(`fornecedores:${userId}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }

    const { data: compradora } = await supabaseAdmin
      .from('oficinas')
      .select('id, nome_fantasia, pais, latitude, longitude, profile:profiles!oficinas_profile_id_fkey(conta_teste)')
      .eq('id', cot.oficina_id)
      .single();
    if (!compradora) return NextResponse.json({ error: 'Oficina nao encontrada' }, { status: 404 });
    const compradoraTeste = !!(compradora as any).profile?.conta_teste;

    const pecaDescricao = cot.peca_descricao || '-';
    const oficinaCompradoraNome = compradora.nome_fantasia || '-';
    const semCarro = cot.tipo === 'sem_carro';
    const carro = semCarro ? '' : [cot.fipe_marca, cot.fipe_modelo, cot.fipe_ano].filter(Boolean).join(' ');
    const quantidade = Number(cot.quantidade) || 1;
    const unidade = cot.unidade || 'un';
    const foto = Array.isArray(cot.fotos) && cot.fotos.length ? String(cot.fotos[0]) : null;
    const vars = (perto: boolean) => ({ peca: pecaDescricao, oficina: oficinaCompradoraNome, carro, quantidade, unidade, semCarro, perto });

    // Auditoria Fable 16/11 (M-A): cada fornecedor e avisado uma vez por cotacao,
    // mesmo se a rota for chamada de novo (rede, F5) - nada de e-mail repetido.
    const { data: jaAvisados } = await supabaseAdmin
      .from('notificacoes')
      .select('profile_id')
      .eq('tipo', 'cotacao_peca_disponivel')
      .eq('dados->>cotacao_id', cotacaoId);
    const avisados = new Set((jaAvisados || []).map((n: any) => n.profile_id));

    const avisar = async (alvo: { profileId: string; idioma?: string | null; email?: string | null; nome?: string | null }, paraLoja: boolean) => {
      if (avisados.has(alvo.profileId)) return false;
      avisados.add(alvo.profileId);
      const link = paraLoja ? '/loja/cotacoes' : '/oficina/pecas?aba=vender';
      const nn = notifCotacaoPecaDisponivel(alvo.idioma, vars(!paraLoja));
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: alvo.profileId,
        tipo: 'cotacao_peca_disponivel',
        titulo: nn.titulo,
        mensagem: nn.mensagem,
        dados: { cotacao_id: cotacaoId, link, textos: emTodasAsLinguas((l) => notifCotacaoPecaDisponivel(l, vars(!paraLoja))) },
      });
      if (alvo.email) {
        await sendCotacaoPecaDisponivelEmail({
          toEmail: alvo.email,
          toName: alvo.nome || '',
          pecaDescricao,
          oficinaCompradoraNome,
          carro,
          quantidade,
          unidade,
          observacao: cot.observacao,
          foto,
          paraLoja,
          linkInterno: link,
          locale: alvo.idioma || undefined,
        }).catch(() => {});
      }
      return true;
    };

    // ---- lojas de pecas do mesmo pais ----
    let lojasNotificadas = 0;
    if (compradora.pais) {
      const { data: lojas } = await supabaseAdmin
        .from('lojas_pecas')
        .select('id, profile_id, nome_fantasia, profile:profiles(email, nome, idioma, conta_teste, ativo)')
        .eq('ativa', true)
        .eq('pais', compradora.pais);
      for (const l of lojas || []) {
        const p = (l as any).profile;
        if (!l.profile_id || !p || p.ativo === false || !!p.conta_teste !== compradoraTeste) continue;
        if (await avisar({ profileId: l.profile_id, idioma: p.idioma, email: p.email, nome: p.nome || l.nome_fantasia }, true)) lojasNotificadas++;
      }
    }

    // ---- oficinas vizinhas que vendem sobra (precisa das coordenadas da compradora) ----
    // "so lojas" (alvo, lote 1): nenhuma oficina e avisada
    let oficinasNotificadas = 0;
    const latitude = compradora.latitude;
    const longitude = compradora.longitude;
    if (latitude != null && longitude != null && cot.alvo !== 'so_lojas') {
      // Caixa larga (100km) so pra pre-filtrar no banco; o corte de verdade e o
      // raio de atendimento de cada oficina (o mesmo da aba "Vender excedente").
      const BOUNDING_BOX_KM = 100;
      const radiusLat = BOUNDING_BOX_KM / 111;
      const radiusLon = BOUNDING_BOX_KM / (111 * Math.cos(latitude * Math.PI / 180));
      const { data: candidatas, error } = await supabaseAdmin
        .from('oficinas')
        .select('id, profile_id, nome_fantasia, latitude, longitude, raio_atendimento_km, profile:profiles!oficinas_profile_id_fkey(email, nome, idioma, conta_teste)')
        .eq('vende_pecas', true)
        .eq('ativa', true)
        .neq('id', compradora.id)
        .gte('latitude', latitude - radiusLat)
        .lte('latitude', latitude + radiusLat)
        .gte('longitude', longitude - radiusLon)
        .lte('longitude', longitude + radiusLon);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      for (const o of candidatas || []) {
        if (o.latitude == null || o.longitude == null || !o.profile_id) continue;
        const p = (o as any).profile;
        if (!!p?.conta_teste !== compradoraTeste) continue;
        if (distanciaKm(latitude, longitude, o.latitude, o.longitude) > (o.raio_atendimento_km || 30)) continue;
        if (await avisar({ profileId: o.profile_id, idioma: p?.idioma, email: p?.email, nome: p?.nome || o.nome_fantasia }, false)) oficinasNotificadas++;
      }
    }

    return NextResponse.json({ success: true, lojasNotificadas, oficinasNotificadas, semCoordenadas: latitude == null || longitude == null });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
