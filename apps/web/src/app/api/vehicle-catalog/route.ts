import { NextRequest, NextResponse } from 'next/server';
import catalog from '@/data/vehicles-catalog.json';

// Catalogo aberto de marca/modelo (VehiclesDB, CC-BY 4.0 -
// https://github.com/vehiclesdb/vehiclesdb) usado como substituto da FIPE
// fora do Brasil - a FIPE so cobre o mercado brasileiro (marca/modelo/ano
// + valor de mercado); este catalogo cobre 918 marcas / ~14.900 modelos
// reconciliados de registros oficiais de 14 paises (majoritariamente
// europeus + America do Norte/Oceania), sem preco (nao serve pra
// avaliacao de veiculo, so identificacao). Carregado uma vez em memoria
// (import estatico), sem chamada de rede em cada requisicao.

type MakeRow = [slug: string, name: string, kinds: string[]];
type ModelRow = [makeSlug: string, modelSlug: string, name: string, kind: string, bodyType: string | null];

const data = catalog as unknown as { makes: MakeRow[]; models: ModelRow[] };

// Mapeia o TIPOS_VEICULO do BipFix (cars/motorcycles/trucks) pros "kinds"
// do VehiclesDB - motos inclui ciclomotores, caminhoes inclui vans e
// onibus (nao ha slot separado pra esses no formulario do BipFix).
const KIND_MAP: Record<string, string[]> = {
  cars: ['car'],
  motorcycles: ['motorcycle', 'moped'],
  trucks: ['truck', 'van', 'bus'],
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo') || 'cars';
  const marca = searchParams.get('marca');
  const kinds = KIND_MAP[tipo] || KIND_MAP.cars;

  if (!marca) {
    const makes = data.makes
      .filter((m) => m[2].some((k) => kinds.includes(k)))
      .map((m) => ({ code: m[0], name: m[1] }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(makes);
  }

  const models = data.models
    .filter((m) => m[0] === marca && kinds.includes(m[3]))
    .map((m) => ({ code: m[1], name: m[2] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(models);
}
