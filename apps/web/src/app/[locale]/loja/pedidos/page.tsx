'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { usePecasV3 } from '@/hooks/use-pecas-v3';
import { numeroDaQuantidade } from '@/lib/pecas-formato';
import { CancelarPedidoV3, CanceladoInfo, chaveProblema } from '@/components/pecas/ConfiancaV3';

interface PedidoRow {
  id: string;
  resposta_id: string;
  preco_total: number;
  quantidade: number;
  status: string;
  created_at: string;
  cotacao: { peca_descricao: string; unidade?: string | null } | null;
  oficina: { nome_fantasia: string; endereco?: string | null; numero?: string | null; cidade: string; estado: string } | null;
  // lote 3 (093): ciclo do pedido v3 (NULL = pedido de hoje)
  v3?: boolean | null;
  recebido_em?: string | null;
  problema?: string | null;
  cancelado_por?: string | null;
  cancelado_motivo?: string | null;
  cancelado_texto?: string | null;
  cotacao_id?: string;
}

export default function LojaPedidosPage() {
  const t = useTranslations('lojaPedidos');
  const tp = useTranslations('pecas');
  const locale = useLocale();
  const { loja } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [loading, setLoading] = useState(true);
  // lote 1 (17/11): telefone da compradora pela rota do servidor (o comercial dela, se houver;
  // senao o do perfil, como antes) - a loja deixa de ler o perfil da oficina direto
  const [telefones, setTelefones] = useState<Record<string, string>>({});
  // lote 3 (P-13): contato arquivado pela rota (recebido/entregue + 30 dias, ou cancelado)
  const [arquivados, setArquivados] = useState<Set<string>>(new Set());
  const v3 = usePecasV3();

  const fetchPedidos = async () => {
    if (!loja) return;
    setLoading(true);
    const { data } = await supabase
      .from('pedidos_pecas')
      // B1 (16/11): pedidos_pecas tem 2 ligacoes com oficinas (compradora e oficina_fornecedora);
      // sem dizer qual, o Supabase devolvia erro PGRST201 e a lista ficava sempre vazia
      .select('*, cotacao:cotacoes_pecas(peca_descricao, unidade), oficina:oficinas!pedidos_pecas_oficina_id_fkey(nome_fantasia, endereco, numero, cidade, estado)')
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false });
    const lista = ((data as any[]) || []) as PedidoRow[];
    // o telefone chega junto com a lista (sem a linha aparecer sem ele e mudar depois); a rota aceita 50 por vez
    const tels: Record<string, string> = {};
    const arq = new Set<string>();
    for (let i = 0; i < lista.length; i += 50) {
      const r = await fetch('/api/contato-pedido-peca', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoIds: lista.slice(i, i + 50).map((p) => p.id) }) }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      for (const [id, c] of Object.entries((j?.contatos || {}) as Record<string, { telefone?: string | null; arquivado?: boolean }>)) {
        if (c?.telefone) tels[id] = c.telefone;
        if (c?.arquivado) arq.add(id);
      }
    }
    setTelefones(tels);
    setArquivados(arq);
    setPedidos(lista);
    setLoading(false);
  };

  useEffect(() => { fetchPedidos(); }, [loja]);

  const handleMarcarEntregue = async (id: string) => {
    await fetch('/api/marcar-pedido-peca-entregue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId: id }),
    });
    await fetchPedidos();
  };

  if (loading || v3 === null) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('pageTitle')}</h1>
      <p className="text-gray-600 mb-8">{t('pageSubtitle')}</p>

      {pedidos.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">{t('emptyState')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const statusLabel = p.status === 'entregue' ? t('statusEntregue') : p.status === 'cancelado' ? t('statusCancelado') : p.status === 'confirmado' ? t('statusConfirmado') : p.status;
            return (
            <div key={p.id} data-testid="pedido-loja" className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="font-medium text-gray-900">{p.cotacao?.peca_descricao}</p>
                <p className="text-sm text-gray-500">
                  {p.oficina?.nome_fantasia} - {[[p.oficina?.endereco, p.oficina?.numero].filter(Boolean).join(' '), p.oficina?.cidade].filter(Boolean).join(', ')}
                  {telefones[p.id] && ` · ${telefones[p.id]}`}
                </p>
                {/* lote 3: so com a tela nova e em pedido v3 */}
                {v3 && p.v3 && arquivados.has(p.id) && <p data-testid="contato-arquivado" className="text-xs text-gray-500 mt-0.5">{tp('contatoArquivado')}</p>}
                {v3 && p.v3 && p.recebido_em && <p data-testid="pedido-recebido-info" className="text-sm text-green-700 mt-1">{tp('recebidoEm', { data: formatDate(p.recebido_em, locale) })}</p>}
                {v3 && p.v3 && p.problema && p.status !== 'cancelado' && <p data-testid="pedido-problema-info" className="text-sm text-amber-800 mt-1">{tp('problemaInfo', { problema: tp(`problemas.${chaveProblema(p.problema)}`) })}</p>}
                {v3 && p.v3 && p.status === 'cancelado' && <CanceladoInfo pedido={p as any} />}
                {v3 && p.v3 && p.status === 'confirmado' && <CancelarPedidoV3 pedidoId={p.id} lado="fornecedor" aoTerminar={fetchPedidos} />}
                <p className="text-sm text-gray-600 mt-1">
                  {t('infoLinha', {
                    preco: formatCurrency(p.preco_total, currencyForCountry(loja?.pais), locale),
                    // lote 1: com o interruptor, "4,5 l" (numero + unidade); sem ele, o numero como hoje
                    quantidade: v3 && p.cotacao?.unidade && p.cotacao.unidade !== 'un' ? `${numeroDaQuantidade(p.quantidade, locale)} ${tp(`unidades.${p.cotacao.unidade}`)}` : p.quantidade,
                    data: formatDate(p.created_at, locale),
                  })}
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 flex-shrink-0">
                <Link href={`/loja/conversa/${p.resposta_id}`} className="text-xs text-primary-600 hover:underline font-medium">
                  {t('conversarLink')}
                </Link>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  p.status === 'entregue' ? 'bg-green-100 text-green-700' :
                  p.status === 'cancelado' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {statusLabel}
                </span>
                {p.status === 'confirmado' && (
                  <button onClick={() => handleMarcarEntregue(p.id)} className="text-xs text-primary-600 hover:underline font-medium">
                    {t('marcarEntregueButton')}
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
