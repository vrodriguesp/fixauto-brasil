import { supabaseAdmin } from './supabase-admin';

// Lote 1 de pecas (17/11, migracao 091): a parte nova (placa, unidade, sem carro,
// "enviar a", validade de 7 dias, telefone comercial) fica atras de um interruptor.
// Vale para quem tem a conta de teste ou para todos quando o admin liga o global
// (plataforma_config.pecas_v3_ativo, /admin/pecas). Desligado = telas de hoje.
// Mapa: Documentos/Analises/Pecas_lote1_2026-11-17 (Fable_auditoria_mapa_lote1.md, sec. 3).

/** Interruptor global. Sem a coluna (build novo antes da migracao): desligado. */
export async function interruptorPecasV3Global(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('plataforma_config').select('pecas_v3_ativo').eq('id', 1).maybeSingle();
  if (error) return false;
  return !!(data as { pecas_v3_ativo?: boolean } | null)?.pecas_v3_ativo;
}

/** Conta de teste (profiles.conta_teste) - separa teste de real tambem nas pecas (091). */
export async function contaTeste(profileId: string | null | undefined): Promise<boolean> {
  if (!profileId) return false;
  const { data } = await supabaseAdmin.from('profiles').select('conta_teste').eq('id', profileId).maybeSingle();
  return !!data?.conta_teste;
}

/** A tela nova vale para esta pessoa? (global ligado OU conta de teste) */
export async function pecasV3Ativo(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const [global, teste] = await Promise.all([interruptorPecasV3Global(), contaTeste(userId)]);
  return global || teste;
}

/** Telefone comercial (fornecedores_contato) de lojas e oficinas, por "tipo:id". Vazio = sem. */
export async function telefonesComerciais(partes: { tipo: 'loja' | 'oficina'; id: string | null | undefined }[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const lojas = Array.from(new Set(partes.filter((p) => p.tipo === 'loja' && p.id).map((p) => p.id as string)));
  const oficinas = Array.from(new Set(partes.filter((p) => p.tipo === 'oficina' && p.id).map((p) => p.id as string)));
  const [{ data: dl }, { data: dof }] = await Promise.all([
    lojas.length ? supabaseAdmin.from('fornecedores_contato').select('fornecedor_tipo, fornecedor_id, telefone').eq('fornecedor_tipo', 'loja').in('fornecedor_id', lojas) : Promise.resolve({ data: [] as any[] }),
    oficinas.length ? supabaseAdmin.from('fornecedores_contato').select('fornecedor_tipo, fornecedor_id, telefone').eq('fornecedor_tipo', 'oficina').in('fornecedor_id', oficinas) : Promise.resolve({ data: [] as any[] }),
  ]);
  // sem a tabela (antes da 091) data vem nulo: segue o telefone do perfil, como hoje
  for (const r of [...((dl as any[]) || []), ...((dof as any[]) || [])]) {
    const tel = String(r.telefone || '').trim();
    if (tel) mapa.set(`${r.fornecedor_tipo}:${r.fornecedor_id}`, tel);
  }
  return mapa;
}
