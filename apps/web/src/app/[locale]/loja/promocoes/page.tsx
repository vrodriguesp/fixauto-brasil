import { notFound } from 'next/navigation';
import { getSessionUserId } from '@/lib/api-auth';
import { pecasV3Ativo } from '@/lib/pecas-v3';
import { supabaseAdmin } from '@/lib/supabase-admin';
import PromocoesLoja from '@/components/pecas/PromocoesLoja';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

// Pecas lote 5 (20/11): promocoes da loja (so com a tela nova: v3 global ou conta de teste). Sem isso a pagina nao existe.
export default async function LojaPromocoesPage() {
  const userId = await getSessionUserId();
  if (!userId || !(await pecasV3Ativo(userId))) notFound();
  const { data: loja } = await supabaseAdmin.from('lojas_pecas').select('id').eq('profile_id', userId).maybeSingle();
  if (!loja) notFound();
  return <PromocoesLoja />;
}
