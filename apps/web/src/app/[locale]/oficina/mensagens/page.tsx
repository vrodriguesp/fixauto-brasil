'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { INTL_LOCALE } from '@/lib/utils';

interface Conversa {
  solicitacaoId: string;
  pagadorId: string | null;
  ultima: { texto: string | null; tipo: string | null; created_at: string; minha: boolean };
  novas: number;
  carro: string;
  placa: string;
  cliente: string;
  numero: number | null;
}

// Todas as conversas da oficina num lugar (feedback do dono 27/10): antes so
// dava para chegar a uma conversa pelo pedido. Uma linha por pedido (e por
// responsavel pelo pagamento, nos acidentes), a mais recente em cima.
// Regra do dono (27/10): pedidos ativos; servicos entregues so aparecem se a
// garantia esta valendo E o cliente reabriu a conversa (a oficina so responde).
export default function OficinaConversasPage() {
  const t = useTranslations('oficinaConversas');
  const locale = useLocale();
  const { user, oficina } = useAuth();
  const [conversas, setConversas] = useState<Conversa[] | null>(null);

  useEffect(() => {
    if (!oficina?.id || !user?.id) return;
    (async () => {
      const { data: msgs } = await supabase.from('mensagens')
        .select('solicitacao_id, pagador_id, remetente_id, texto, tipo, lida, created_at')
        .eq('oficina_id', oficina.id).order('created_at', { ascending: false }).limit(1000);
      const porConversa = new Map<string, Conversa>();
      for (const m of (msgs || []) as any[]) {
        const chave = `${m.solicitacao_id}|${m.pagador_id || ''}`;
        let c = porConversa.get(chave);
        if (!c) {
          c = { solicitacaoId: m.solicitacao_id, pagadorId: m.pagador_id, ultima: { texto: m.texto, tipo: m.tipo, created_at: m.created_at, minha: m.remetente_id === user.id }, novas: 0, carro: '', placa: '', cliente: '', numero: null };
          porConversa.set(chave, c);
        }
        if (!m.lida && m.remetente_id !== user.id) c.novas++;
      }
      const ids = Array.from(new Set(Array.from(porConversa.values()).map((c) => c.solicitacaoId)));
      const fora = new Set<string>();
      if (ids.length) {
        const { data: sols } = await supabase.from('solicitacoes')
          .select('id, numero, status, cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(nome), veiculo:veiculos!solicitacoes_veiculo_id_fkey(fipe_marca, fipe_modelo, placa)')
          .in('id', ids);
        for (const c of Array.from(porConversa.values())) {
          const s: any = (sols || []).find((x: any) => x.id === c.solicitacaoId);
          c.carro = s?.veiculo?.fipe_marca ? `${s.veiculo.fipe_marca} ${s.veiculo.fipe_modelo || ''}`.trim() : '';
          c.placa = s?.veiculo?.placa || '';
          c.cliente = s?.cliente?.nome || '';
          c.numero = s?.numero ?? null;
        }
        const entregues = (sols || []).filter((s: any) => s.status === 'concluida').map((s: any) => s.id);
        (sols || []).filter((s: any) => ['cancelada', 'no_show'].includes(s.status)).forEach((s: any) => fora.add(s.id));
        if (entregues.length) {
          const [{ data: orcs }, { data: ags }] = await Promise.all([
            supabase.from('orcamentos').select('solicitacao_id, garantia_dias').eq('oficina_id', oficina.id).eq('status', 'aceito').in('solicitacao_id', entregues),
            supabase.from('agenda').select('solicitacao_id, data_fim, data_inicio').eq('oficina_id', oficina.id).eq('status', 'concluido').in('solicitacao_id', entregues),
          ]);
          for (const sid of entregues) {
            const o: any = (orcs || []).find((x: any) => x.solicitacao_id === sid);
            const a: any = (ags || []).find((x: any) => x.solicitacao_id === sid);
            const entregueEm = a?.data_fim || a?.data_inicio;
            const naGarantia = !!o?.garantia_dias && !!entregueEm && Date.now() <= new Date(entregueEm).getTime() + o.garantia_dias * 86400000;
            const cliente = (sols || []).find((x: any) => x.id === sid)?.cliente_id;
            const reabriu = !!entregueEm && ((msgs || []) as any[]).some((m) => m.solicitacao_id === sid && m.remetente_id !== user.id && (m.remetente_id === cliente || m.pagador_id) && m.created_at > entregueEm);
            if (!naGarantia || !reabriu) fora.add(sid);
          }
        }
      }
      setConversas(Array.from(porConversa.values()).filter((c) => !fora.has(c.solicitacaoId)));
    })();
  }, [oficina?.id, user?.id]);

  const quando = (iso: string) => {
    const d = new Date(iso);
    const hoje = new Date().toDateString() === d.toDateString();
    return d.toLocaleString(INTL_LOCALE[locale as keyof typeof INTL_LOCALE] || locale, hoje ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('titulo')}</h1>
      <p className="text-gray-600 mb-6">{t('subtitulo')}</p>
      {conversas === null ? (
        <p className="text-gray-500">{t('carregando')}</p>
      ) : conversas.length === 0 ? (
        <p className="card text-gray-600">{t('vazio')}</p>
      ) : (
        <ul className="card p-0 divide-y divide-gray-100">
          {conversas.map((c) => (
            <li key={`${c.solicitacaoId}|${c.pagadorId || ''}`}>
              <Link href={`/oficina/mensagens/${c.solicitacaoId}${c.pagadorId ? `?pagador=${c.pagadorId}` : ''}`}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 ${c.novas ? 'bg-primary-50/60' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className={`truncate ${c.novas ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                    {[c.carro, c.placa].filter(Boolean).join(' · ') || t('semCarro')}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {[c.cliente, c.numero ? t('pedido', { n: c.numero }) : '', c.pagadorId ? t('pagador') : ''].filter(Boolean).join(' · ')}
                  </p>
                  <p className={`text-sm truncate mt-0.5 ${c.novas ? 'text-gray-900' : 'text-gray-600'}`}>
                    {c.ultima.minha ? `${t('voce')}: ` : ''}{c.ultima.tipo === 'audio' ? t('audio') : c.ultima.texto}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-gray-500">{quando(c.ultima.created_at)}</span>
                  {c.novas > 0 && (
                    <span className="min-w-[1.5rem] text-center rounded-full bg-primary-600 text-white text-xs font-semibold px-2 py-0.5" aria-label={t('novas', { n: c.novas })}>{c.novas}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
