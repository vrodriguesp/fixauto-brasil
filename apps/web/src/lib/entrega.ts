import { recalcularComissaoConfig } from '@/lib/comissao';
import { taxaEfetivaServicos, valorDaComissao } from '@/lib/comissao-regras';
import { sendServicoConcluidoEmail, sendServicoConcluidoWhatsApp } from '@/lib/notifications';
import { notifServicoConcluido } from '@/lib/notif-i18n';
import { supabaseAdmin } from '@/lib/supabase-admin';



/**
 * Entrega do carro ao cliente (etapa final): fecha o agendamento, conclui o
 * pedido, avisa o cliente (pedindo a avaliacao) e lanca a comissao. Usada
 * pelo botao "Entregar" da oficina e pela entrega automatica (5 dias depois
 * de "concluido" sem a oficina marcar a entrega).
 */
export async function entregarServico(p: { eventoId: string; solicitacaoId: string | null; oficinaDoEvento: string; oficinaNome: string; callerId: string | null; automatica?: boolean }) {
  const { eventoId, solicitacaoId, oficinaDoEvento, oficinaNome, callerId } = p;
  // Trava atomica: so entrega carro que esta EM SERVICO, e uma vez so (antes:
  // entregava evento sem check-in e repetia aviso/e-mail/comissao a cada
  // clique - auditoria Fable 08/10, A-05/M-04). Devolve false se nao entregou.
  const { data: trava } = await supabaseAdmin.from('agenda')
    .update({ status: 'concluido', data_fim: new Date().toISOString() })
    .eq('id', eventoId).eq('status', 'em_andamento').select('id');
  if (!trava?.length) return false;
  // proposta de revisao ainda sem resposta perde o efeito: vale o valor aprovado
  if (solicitacaoId) await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('solicitacao_id', solicitacaoId).eq('status', 'pendente');
  // etapa final no historico do conserto (a tela nao grava mais por conta propria)
  await supabaseAdmin.from('manutencao_etapas').insert({ agenda_id: eventoId, status: 'entregue', observacao: null });
  await supabaseAdmin.from('agenda_historico').insert({ agenda_id: eventoId, acao: 'entregue', por_profile_id: callerId, detalhe: p.automatica ? { automatica: true } : {} });

    // 1. agenda ja fechada pela trava acima (status concluido + data_fim)

    // 2. Update solicitacao to concluida
    if (solicitacaoId) {
      await supabaseAdmin.from('solicitacoes').update({ status: 'concluida' }).eq('id', solicitacaoId);

      // 3. Get client info from solicitacao
      const { data: sol } = await supabaseAdmin
        .from('solicitacoes')
        .select('cliente_id, veiculo:veiculos(fipe_marca, fipe_modelo), cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, telefone, idioma)')
        .eq('id', solicitacaoId)
        .single();

      if (sol?.cliente_id) {
        const veiculoNome = sol.veiculo
          ? `${(sol.veiculo as any).fipe_marca} ${(sol.veiculo as any).fipe_modelo}`
          : ({ pt: 'seu veículo', 'pt-PT': 'o seu veículo', en: 'your vehicle', et: 'sinu sõiduk', it: 'il tuo veicolo', ru: 'ваш автомобиль' } as Record<string, string>)[(sol.cliente as any)?.idioma || 'en'] || 'your vehicle';
        const cliente = sol.cliente as any;

        // 4. Create notification
        const nConcluido = notifServicoConcluido(cliente?.idioma, veiculoNome);
        await supabaseAdmin.from('notificacoes').insert({
          profile_id: sol.cliente_id,
          tipo: 'servico_concluido',
          titulo: nConcluido.titulo,
          mensagem: nConcluido.mensagem,
          dados: { solicitacao_id: solicitacaoId },
        });

        // 4b. Email + WhatsApp - cliente pode nao estar com o app aberto
        // pra ver a notificacao in-app na hora que o carro fica pronto.
        if (cliente?.email) {
          sendServicoConcluidoEmail({
            toEmail: cliente.email,
            toName: cliente.nome || '',
            oficinaNome,
            veiculoNome,
            solicitacaoId,
            locale: cliente.idioma,
          }).catch(() => {});
        }
        if (cliente?.telefone) {
          // DDI pelo pais da oficina (numero nacional do cliente)
          const { data: ofPais } = await supabaseAdmin.from('oficinas').select('pais').eq('id', oficinaDoEvento).maybeSingle();
          sendServicoConcluidoWhatsApp({
            toPhone: cliente.telefone,
            pais: (ofPais as any)?.pais,
            toName: cliente.nome || '',
            oficinaNome,
            veiculoNome,
            solicitacaoId,
            locale: cliente.idioma,
          }).catch(() => {});
        }
      }
    }

    // 5. Register commission
    if (solicitacaoId) {
      try {
        // Find the accepted orcamento
        const { data: orc } = await supabaseAdmin
          .from('orcamentos')
          .select('id, oficina_id, valor_total')
          .eq('solicitacao_id', solicitacaoId)
          .eq('oficina_id', oficinaDoEvento)
          .eq('status', 'aceito')
          .maybeSingle();

        if (orc) {
          // Avoid double-charging commission if this endpoint runs twice for the same orcamento
          const { data: jaLancado } = await supabaseAdmin
            .from('comissao_lancamento')
            .select('id')
            .eq('orcamento_id', orc.id)
            .maybeSingle();

          // Condicao pela hierarquia (individual do admin > regra global):
          // percentual ou valor fixo por servico. Zero (fase de parceiros
          // fundadores ou oferta individual) nao gera lancamento - a oficina
          // nao deve ver "comissao pendente".
          const info = jaLancado ? null : await taxaEfetivaServicos(supabaseAdmin, orc.oficina_id);
          const valorComissao = info ? valorDaComissao(info, Number(orc.valor_total)) : 0;

          if (!jaLancado && valorComissao > 0) {
            const taxa = Number(orc.valor_total) > 0 ? Math.round((valorComissao / Number(orc.valor_total)) * 10000) / 10000 : 0;

            // Insert commission entry
            const { error: comissaoError } = await supabaseAdmin.from('comissao_lancamento').insert({
              oficina_id: orc.oficina_id,
              orcamento_id: orc.id,
              valor_servico: orc.valor_total,
              taxa_aplicada: taxa,
              valor_comissao: valorComissao,
              status: 'pendente',
            });

            if (comissaoError) {
              console.error('[confirmar-entrega] Falha ao registrar comissao:', comissaoError.message);
            } else {
              // Atualiza o cache de comissao_config pra refletir o novo total
              await recalcularComissaoConfig(supabaseAdmin, orc.oficina_id);
            }
          }
        }
      } catch (err) {
        console.error('[confirmar-entrega] Erro ao registrar comissao:', err);
      }
    }

  return true;
}
