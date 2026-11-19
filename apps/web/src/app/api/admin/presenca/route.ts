import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { presencaDe, presencaDeOficinas } from '@/lib/presenca';

export const dynamic = 'force-dynamic';

// Presenca para as telas do admin (dono 19/11): ?profiles=a,b&oficinas=x,y ->
// { profiles: { id: visto_em }, oficinas: { id: visto_em } } (so quem tem sinal).
// Ate 300 ids de cada; so admin.
const lista = (v: string | null) => (v || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 300);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const [profiles, oficinas] = await Promise.all([presencaDe(lista(searchParams.get('profiles'))), presencaDeOficinas(lista(searchParams.get('oficinas')))]);
  return NextResponse.json({ profiles, oficinas, agora: new Date().toISOString() });
}
