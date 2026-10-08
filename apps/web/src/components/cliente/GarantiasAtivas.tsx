'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { INTL_LOCALE } from '@/lib/utils';

interface Garantia { solicitacaoId: string; oficinaId: string; oficina: string; carro: string; fim: Date; dias: number }

// Servicos entregues ainda na garantia (informada pela oficina no orcamento,
// contada a partir da entrega): contagem regressiva na tela inicial e
// atalho para falar com a oficina enquanto a garantia vale.
export default function GarantiasAtivas() {
  const t = useTranslations('garantia');
  const locale = useLocale();
  const { user } = useAuth();
  const [lista, setLista] = useState<Garantia[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('solicitacoes')
        .select('id, veiculo:veiculos(fipe_marca, fipe_modelo), orcamentos(oficina_id, status, garantia_dias, oficina:oficinas(nome_fantasia)), agenda(oficina_id, status, data_fim)')
        .eq('cliente_id', user.id).eq('status', 'concluida');
      const agora = Date.now();
      const out: Garantia[] = [];
      for (const s of (data || []) as any[]) {
        const orc = (s.orcamentos || []).find((o: any) => o.status === 'aceito' && o.garantia_dias > 0);
        const ent = (s.agenda || []).find((a: any) => a.oficina_id === orc?.oficina_id && a.status === 'concluido' && a.data_fim);
        if (!orc || !ent) continue;
        const fim = new Date(new Date(ent.data_fim).getTime() + orc.garantia_dias * 86400000);
        if (fim.getTime() < agora) continue;
        out.push({
          solicitacaoId: s.id, oficinaId: orc.oficina_id, oficina: orc.oficina?.nome_fantasia || '',
          carro: s.veiculo?.fipe_marca ? `${s.veiculo.fipe_marca} ${s.veiculo.fipe_modelo}` : '',
          fim, dias: Math.ceil((fim.getTime() - agora) / 86400000),
        });
      }
      setLista(out.sort((a, b) => a.fim.getTime() - b.fim.getTime()));
    })();
  }, [user]);

  if (!lista.length) return null;
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('titulo')}</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {lista.map((g) => (
          <div key={g.solicitacaoId} className="card border-l-4 border-l-emerald-500">
            <p className="text-sm text-gray-500">{g.carro}{g.carro && g.oficina ? ' · ' : ''}{g.oficina}</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{t('diasRestantes', { dias: g.dias })}</p>
            <p className="text-xs text-gray-500">{t('ate', { data: g.fim.toLocaleDateString(INTL_LOCALE[locale] || 'en-GB') })}</p>
            <Link href={`/cliente/mensagens/${g.solicitacaoId}?oficina=${g.oficinaId}`} className="inline-block mt-3 text-sm font-medium text-primary-700 hover:underline">
              {t('falarComOficina')}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
