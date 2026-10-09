import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { enviarDiagnostico } from '../lib/diagnostico';

export interface Pendente { solicitacaoId: string; oficina: string }

// Servico entregue sem avaliacao (como no Uber): aviso fixo no inicio ate o
// cliente avaliar; enquanto isso nao abre pedido novo (o banco tambem recusa).
// O "acabei de bater" nunca e bloqueado.
export function useAvaliacaoPendente(recarregar?: number) {
  const { user } = useAuth();
  const [pendente, setPendente] = useState<Pendente | null | undefined>(undefined);
  const carregar = useCallback(async () => {
    if (!user) return;
    const inicio = Date.now();
    try {
      const { data, error } = await supabase.from('solicitacoes')
        .select('id, created_at, orcamentos(status, oficina:oficinas(nome_fantasia)), avaliacoes(id)')
        .eq('cliente_id', user.id).eq('status', 'concluida').order('created_at', { ascending: false });
      if (error) { enviarDiagnostico('avaliacao-pendente', error.message, { code: error.code }); setPendente(null); return; }
      const s = ((data || []) as any[]).find((x) => !(x.avaliacoes || []).length && (x.orcamentos || []).some((o: any) => o.status === 'aceito'));
      setPendente(s ? { solicitacaoId: s.id, oficina: s.orcamentos.find((o: any) => o.status === 'aceito')?.oficina?.nome_fantasia || '' } : null);
      if (Date.now() - inicio > 5000) enviarDiagnostico('avaliacao-pendente', 'consulta lenta', { ms: Date.now() - inicio });
    } catch (e) {
      // antes: uma excecao aqui deixava o novo pedido carregando para sempre
      enviarDiagnostico('avaliacao-pendente', e instanceof Error ? e.message : String(e));
      setPendente(null);
    }
  }, [user]);
  useEffect(() => { carregar(); }, [carregar, recarregar]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  // nunca prende a tela: sem resposta em 6 s segue sem o aviso (o banco
  // continua recusando pedido novo com avaliacao pendente) e registra o motivo
  useEffect(() => {
    if (pendente !== undefined) return;
    const tmr = setTimeout(() => {
      setPendente((p) => {
        if (p === undefined) enviarDiagnostico('avaliacao-pendente', 'sem resposta em 6 s', { temUsuario: !!user });
        return p === undefined ? null : p;
      });
    }, 6000);
    return () => clearTimeout(tmr);
  }, [pendente, user]);
  return pendente;
}

export default function AvaliacaoPendente({ recarregar }: { recarregar?: number }) {
  const { t } = useTranslation();
  const p = useAvaliacaoPendente(recarregar);
  if (!p) return null;
  return (
    <Pressable onPress={() => router.push(`/solicitacao/${p.solicitacaoId}`)} accessibilityRole="button"
      className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-4">
      <Text className="text-amber-900 font-semibold">⭐ {t('avaliacao.pendenteTitulo', { oficina: p.oficina })}</Text>
      <Text className="text-amber-800 text-sm mb-1">{t('avaliacao.pendenteTexto')}</Text>
      <Text className="text-primary-700 font-medium">{t('avaliacao.avaliarAgora')} ›</Text>
    </Pressable>
  );
}
