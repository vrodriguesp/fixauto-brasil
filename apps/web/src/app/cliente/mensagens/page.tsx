'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { timeAgo, cleanDescricao } from '@/lib/utils';

interface ConversaOficina {
  solicitacao_id: string;
  oficina_nome: string;
  veiculo_desc: string;
  placa: string;
  ultima_mensagem: string;
  ultima_mensagem_at: string;
  nao_lidas: number;
}

interface ConversaEmergencia {
  emergencia_id: string;
  solicitacao_id: string | null;
  outro_nome: string;
  outro_placa: string;
  outro_veiculo: string;
  ultima_mensagem: string;
  ultima_mensagem_at: string;
  nao_lidas: number;
}

interface SolicitacaoGroup {
  id: string;
  descricao: string;
  veiculo_marca: string;
  veiculo_modelo: string;
  placa: string;
  status: string;
  conversas_oficina: ConversaOficina[];
  conversa_emergencia: ConversaEmergencia | null;
  is_responsavel_pagamento?: boolean;
}

export default function ClienteMensagensListPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<SolicitacaoGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchConversations() {
      setLoading(true);

      // 1. Get all solicitacoes for this client
      const { data: solicitacoes } = await supabase
        .from('solicitacoes')
        .select('id, descricao, status, veiculo:veiculos!solicitacoes_veiculo_id_fkey(fipe_marca, fipe_modelo, placa)')
        .eq('cliente_id', user!.id)
        .order('created_at', { ascending: false });

      if (!solicitacoes || solicitacoes.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const solIds = solicitacoes.map((s: any) => s.id);

      // 2. Get last message per solicitacao from mensagens table
      const { data: mensagens } = await supabase
        .from('mensagens')
        .select('id, solicitacao_id, remetente_id, texto, tipo, lida, created_at')
        .in('solicitacao_id', solIds)
        .order('created_at', { ascending: false });

      // 3. Get oficinas linked via orcamentos
      const { data: orcamentos } = await supabase
        .from('orcamentos')
        .select('solicitacao_id, oficina:oficinas!orcamentos_oficina_id_fkey(nome_fantasia)')
        .in('solicitacao_id', solIds);

      // 4. Get emergencias linked to solicitacoes
      const { data: emergencias } = await supabase
        .from('emergencias')
        .select('id, solicitacao_id, descricao, profile_id')
        .in('solicitacao_id', solIds);

      // 5. For each emergencia, get outro_veiculo and last message
      let emergenciaMsgMap: Record<string, ConversaEmergencia> = {};
      if (emergencias && emergencias.length > 0) {
        const emergIds = emergencias.map((e: any) => e.id);

        const { data: outrosVeiculos } = await supabase
          .from('emergencia_outro_veiculo')
          .select('emergencia_id, nome, placa, veiculo_descricao')
          .in('emergencia_id', emergIds);

        const { data: emergMensagens } = await supabase
          .from('emergencia_mensagens')
          .select('id, emergencia_id, remetente_tipo, texto, created_at')
          .in('emergencia_id', emergIds)
          .order('created_at', { ascending: false });

        for (const emerg of emergencias) {
          const outro = outrosVeiculos?.find((o: any) => o.emergencia_id === emerg.id);
          if (!outro) continue;

          const msgs = emergMensagens?.filter((m: any) => m.emergencia_id === emerg.id) || [];
          const lastMsg = msgs[0];

          emergenciaMsgMap[emerg.solicitacao_id] = {
            emergencia_id: emerg.id,
            solicitacao_id: emerg.solicitacao_id,
            outro_nome: outro.nome || 'Outro motorista',
            outro_placa: outro.placa || '',
            outro_veiculo: outro.veiculo_descricao || '',
            ultima_mensagem: lastMsg?.texto || '',
            ultima_mensagem_at: lastMsg?.created_at || '',
            nao_lidas: 0, // emergencia_mensagens doesn't have 'lida' column tracked per user
          };
        }
      }

      // Build responsavel map: check if the current user is the responsible party for payment
      const responsavelMap: Record<string, boolean> = {};
      if (emergencias) {
        for (const emerg of emergencias) {
          const tipoMatch = (emerg as any).descricao?.match(/\[TIPO:(\w+)\]/);
          const tipo = tipoMatch ? tipoMatch[1] : null;
          if (tipo === 'eu_causei' && (emerg as any).profile_id === user!.id) {
            // User registered and caused it - they are responsible
            responsavelMap[emerg.solicitacao_id] = true;
          }
          // outro_causou + user is the "outro" is handled below in the outroRegistros section
        }
      }

      // Build groups
      const groupList: SolicitacaoGroup[] = [];

      for (const sol of solicitacoes) {
        const veiculo = sol.veiculo as any;
        const solMensagens = mensagens?.filter((m: any) => m.solicitacao_id === sol.id) || [];
        const lastMsg = solMensagens[0];
        const naoLidas = solMensagens.filter(
          (m: any) => !m.lida && m.remetente_id !== user!.id
        ).length;

        const oficinaNome = orcamentos?.find((o: any) => o.solicitacao_id === sol.id)?.oficina;

        const conversasOficina: ConversaOficina[] = [];
        if (solMensagens.length > 0 || orcamentos?.some((o: any) => o.solicitacao_id === sol.id)) {
          conversasOficina.push({
            solicitacao_id: sol.id,
            oficina_nome: (oficinaNome as any)?.nome_fantasia || 'Oficina',
            veiculo_desc: veiculo ? `${veiculo.fipe_marca} ${veiculo.fipe_modelo}` : '',
            placa: veiculo?.placa || '',
            ultima_mensagem: lastMsg?.tipo === 'audio' ? 'Mensagem de audio' : (lastMsg?.texto || 'Sem mensagens'),
            ultima_mensagem_at: lastMsg?.created_at || '',
            nao_lidas: naoLidas,
          });
        }

        const conversaEmergencia = emergenciaMsgMap[sol.id] || null;

        // Only include groups that have at least one conversation
        if (conversasOficina.length > 0 || conversaEmergencia) {
          groupList.push({
            id: sol.id,
            descricao: sol.descricao || '',
            veiculo_marca: veiculo?.fipe_marca || '',
            veiculo_modelo: veiculo?.fipe_modelo || '',
            placa: veiculo?.placa || '',
            status: sol.status || '',
            conversas_oficina: conversasOficina,
            conversa_emergencia: conversaEmergencia,
            is_responsavel_pagamento: responsavelMap[sol.id] || false,
          });
        }
      }

      // 6. Also find emergencias where this user is the "outro envolvido"
      const { data: outroRegistros } = await supabase
        .from('emergencia_outro_veiculo')
        .select('emergencia_id, nome, placa, veiculo_descricao, email')
        .eq('email', user!.email);

      if (outroRegistros && outroRegistros.length > 0) {
        const outroEmergIds = outroRegistros.map((o: any) => o.emergencia_id);
        const { data: outroEmergs } = await supabase
          .from('emergencias')
          .select('id, nome, solicitacao_id, descricao')
          .in('id', outroEmergIds);

        const { data: outroMsgs } = await supabase
          .from('emergencia_mensagens')
          .select('id, emergencia_id, texto, created_at')
          .in('emergencia_id', outroEmergIds)
          .order('created_at', { ascending: false });

        for (const reg of outroRegistros) {
          const emerg = outroEmergs?.find((e: any) => e.id === reg.emergencia_id);
          if (!emerg) continue;
          // Skip if already shown via own solicitacao
          if (emerg.solicitacao_id && solIds.includes(emerg.solicitacao_id)) continue;

          const msgs = outroMsgs?.filter((m: any) => m.emergencia_id === reg.emergencia_id) || [];
          const lastMsg = msgs[0];

          // Check if the user is the responsible party (outro_causou means the "outro" person is responsible)
          const outroTipoMatch = (emerg as any).descricao?.match(/\[TIPO:(\w+)\]/);
          const outroTipo = outroTipoMatch ? outroTipoMatch[1] : null;
          const isResponsavelPagamento = outroTipo === 'outro_causou';

          // If this user is the responsible party and there's a linked solicitacao,
          // add an oficina conversation for payment
          const outroConversasOficina: ConversaOficina[] = [];
          if (isResponsavelPagamento && emerg.solicitacao_id) {
            // Check if there are messages in the solicitacao (oficina chat created by aceitar-orcamento)
            const { data: pagMsgs } = await supabase
              .from('mensagens')
              .select('id, texto, created_at')
              .eq('solicitacao_id', emerg.solicitacao_id)
              .order('created_at', { ascending: false })
              .limit(1);

            if (pagMsgs && pagMsgs.length > 0) {
              // Get oficina name from orcamentos
              const { data: pagOrc } = await supabase
                .from('orcamentos')
                .select('oficina:oficinas!orcamentos_oficina_id_fkey(nome_fantasia)')
                .eq('solicitacao_id', emerg.solicitacao_id)
                .eq('status', 'aceito')
                .limit(1);

              const pagOficinaNome = (pagOrc?.[0]?.oficina as any)?.nome_fantasia || 'Oficina';

              outroConversasOficina.push({
                solicitacao_id: emerg.solicitacao_id,
                oficina_nome: pagOficinaNome,
                veiculo_desc: reg.veiculo_descricao || '',
                placa: reg.placa || '',
                ultima_mensagem: pagMsgs[0].texto || '',
                ultima_mensagem_at: pagMsgs[0].created_at || '',
                nao_lidas: 0,
              });
            }
          }

          groupList.push({
            id: `outro-${reg.emergencia_id}`,
            descricao: `Acidente registrado por ${emerg.nome}`,
            veiculo_marca: reg.veiculo_descricao || '',
            veiculo_modelo: '',
            placa: reg.placa || '',
            status: 'acidente',
            conversas_oficina: outroConversasOficina,
            is_responsavel_pagamento: isResponsavelPagamento,
            conversa_emergencia: {
              emergencia_id: reg.emergencia_id,
              solicitacao_id: emerg.solicitacao_id,
              outro_nome: emerg.nome || 'Outro motorista',
              outro_placa: '',
              outro_veiculo: '',
              ultima_mensagem: lastMsg?.texto || 'Sem mensagens',
              ultima_mensagem_at: lastMsg?.created_at || '',
              nao_lidas: 0,
            },
          });
        }
      }

      setGroups(groupList);
      setLoading(false);
    }

    fetchConversations();
  }, [user]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cliente" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mensagens</h1>
          <p className="text-sm text-gray-500">Todas as suas conversas</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Nenhuma conversa</h3>
          <p className="text-sm text-gray-500">
            Suas conversas com oficinas e outros motoristas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Solicitacao header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {group.veiculo_marca} {group.veiculo_modelo}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {group.placa ? `Placa ${group.placa} - ` : ''}{cleanDescricao(group.descricao)?.slice(0, 60)}{(cleanDescricao(group.descricao)?.length || 0) > 60 ? '...' : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    group.status === 'aceita' || group.status === 'concluida' ? 'bg-green-100 text-green-700' :
                    group.status === 'em_andamento' ? 'bg-purple-100 text-purple-700' :
                    group.status === 'em_orcamento' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {group.status === 'aberta' ? 'Aberta' :
                     group.status === 'em_orcamento' ? 'Em orcamento' :
                     group.status === 'aceita' ? 'Aceita' :
                     group.status === 'em_andamento' ? 'Em andamento' :
                     group.status === 'concluida' ? 'Concluida' :
                     group.status}
                  </span>
                </div>
              </div>

              {/* Conversations */}
              <div className="divide-y divide-gray-100">
                {/* Oficina conversations */}
                {group.conversas_oficina.map((conv) => (
                  <Link
                    key={`oficina-${conv.solicitacao_id}`}
                    href={`/cliente/mensagens/${conv.solicitacao_id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className={`w-10 h-10 ${group.is_responsavel_pagamento ? 'bg-red-100' : 'bg-orange-100'} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <svg className={`w-5 h-5 ${group.is_responsavel_pagamento ? 'text-red-600' : 'text-orange-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {conv.oficina_nome}
                          {group.is_responsavel_pagamento && (
                            <span className="text-xs text-red-600 font-normal ml-1">(pagamento)</span>
                          )}
                        </p>
                        {conv.ultima_mensagem_at && (
                          <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                            {timeAgo(conv.ultima_mensagem_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-500 truncate">
                          {conv.ultima_mensagem}
                        </p>
                        {conv.nao_lidas > 0 && (
                          <span className="bg-primary-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 ml-2">
                            {conv.nao_lidas > 9 ? '9+' : conv.nao_lidas}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}

                {/* Emergency conversation */}
                {group.conversa_emergencia && (
                  <Link
                    href={`/emergencia/acidente/${group.conversa_emergencia.emergencia_id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {group.conversa_emergencia.outro_nome}
                          <span className="text-xs text-gray-400 font-normal ml-1">
                            (outro motorista)
                          </span>
                        </p>
                        {group.conversa_emergencia.ultima_mensagem_at && (
                          <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                            {timeAgo(group.conversa_emergencia.ultima_mensagem_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-500 truncate">
                          {group.conversa_emergencia.ultima_mensagem || 'Sem mensagens'}
                        </p>
                        {group.conversa_emergencia.outro_placa && (
                          <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                            {group.conversa_emergencia.outro_placa}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
