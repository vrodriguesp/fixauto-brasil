import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin-auth';
import { IDIOMAS_SHOP } from '@/lib/shop-pagina';

export const dynamic = 'force-dynamic';

// Pecas lote 5: rotulos fixos do Shop num idioma, para a previa do editor (/admin nao tem os textos do site carregados).
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const l = req.nextUrl.searchParams.get('l') || 'et';
  const locale = (IDIOMAS_SHOP as readonly string[]).includes(l) ? l : 'et';
  const t = await getTranslations({ locale, namespace: 'pecasL5' });
  const tp = await getTranslations({ locale, namespace: 'pecas' });
  const unidades = Object.fromEntries(['un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa'].map((u) => [u, tp(`unidades.${u}`)]));
  const condicoes = Object.fromEntries(['nova', 'usada', 'recondicionada'].map((c) => [c, t(`condicao.${c}`)]));
  return NextResponse.json({
    locale, destaqueBipfix: t('destaqueBipfix'), etiquetaPromocao: t('etiquetaPromocao'), pedir: t('pedir'), destaquesTitulo: t('destaquesTitulo'),
    precoAnterior: t('precoAnterior'), shopTitulo: t('shopTitulo'), shopSubtitulo: t('shopSubtitulo'),
    validaAte: t('validaAte', { data: '{d}' }), atualizado: t('atualizado', { quando: '{q}' }), unidades, condicoes,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
