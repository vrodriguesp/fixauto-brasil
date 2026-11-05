import { supabaseAdmin } from '@/lib/supabase-admin';

// Oficina de conta de teste (profiles.conta_teste, migracao 063) fica fora do
// que e publico: lista de oficinas, contagem, sitemap e indexacao do perfil
// (dono 05/11: oficina de teste ativa em producao para testes logados). A
// chave publica nao le profiles (028), por isso a consulta e do servidor.
// Erro de banco: lanca - nao pode virar "nenhuma oficina de teste" e mostrar
// a de teste ao publico.
export async function perfisDeTeste(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from('profiles').select('id').eq('conta_teste', true);
  if (error) throw new Error(`Falha ao buscar contas de teste: ${error.message}`);
  return new Set((data || []).map((p: { id: string }) => p.id));
}
