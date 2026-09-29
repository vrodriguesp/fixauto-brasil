// Teste da hierarquia de comissao contra o banco real, sem deixar rastro:
// cria uma oficina temporaria, passa por todos os cenarios (global isento /
// fixa / desempenho x taxa individual vigente / vencida) e apaga tudo no
// fim, restaurando a regra global que estava antes.
//
//   npx tsx --env-file=.env.local scripts/teste-comissao-hierarquia.ts
import { createClient } from '@supabase/supabase-js';
import { taxaEfetivaServicos, taxaEfetivaPecas, lerPlataformaConfig } from '../src/lib/comissao-regras';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OFICINA = '00000000-0000-0000-0000-00000000c0de';

let falhas = 0;
function confere(nome: string, obtido: { taxa: number; origem: string }, taxa: number, origem: string) {
  const ok = Math.abs(obtido.taxa - taxa) < 1e-9 && obtido.origem === origem;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${obtido.taxa} (${obtido.origem}) esperado ${taxa} (${origem})`);
}

async function global(modo: string, taxa = 0.1) {
  const { error } = await sb.from('plataforma_config').update({ comissao_servicos_modo: modo, comissao_servicos_taxa: taxa, comissao_pecas_modo: modo, comissao_pecas_taxa: taxa }).eq('id', 1);
  if (error) throw error;
}

async function individual(taxa: number | null, ate: string | null = null) {
  const { error } = await sb.from('comissao_config').upsert(
    { oficina_id: OFICINA, usa_override: taxa != null, taxa_fixa_override: taxa, override_ate: ate },
    { onConflict: 'oficina_id' }
  );
  if (error) throw error;
  const { error: e2 } = await sb.from('comissao_pecas_config').upsert(
    { fornecedor_tipo: 'oficina', fornecedor_id: OFICINA, usa_override: taxa != null, taxa_fixa_override: taxa, override_ate: ate },
    { onConflict: 'fornecedor_tipo,fornecedor_id' }
  );
  if (e2) throw e2;
}

(async () => {
  const antes = await lerPlataformaConfig(sb);
  const { data: admin } = await sb.from('profiles').select('id').eq('tipo', 'admin').limit(1).single();
  const { error: eIns } = await sb.from('oficinas').insert({
    id: OFICINA, profile_id: admin!.id, nome_fantasia: 'TESTE hierarquia', endereco: 'x', cidade: 'Tallinn',
    estado: 'Harju', cep: '10111', latitude: 59.4, longitude: 24.7, ativa: false,
  });
  if (eIns) throw eIns;

  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  try {
    await global('isento');
    confere('global isento, sem individual', await taxaEfetivaServicos(sb, OFICINA), 0, 'global');

    await individual(0.07);
    confere('individual 7% sem prazo vale sobre global isento', await taxaEfetivaServicos(sb, OFICINA), 0.07, 'individual');

    await individual(0.07, ontem);
    confere('individual vencida ontem -> volta a global', await taxaEfetivaServicos(sb, OFICINA), 0, 'global');

    await individual(0.07, amanha);
    confere('individual ate amanha ainda vale', await taxaEfetivaServicos(sb, OFICINA), 0.07, 'individual');

    await global('fixa', 0.12);
    await individual(0);
    confere('individual 0% vale sobre global fixa 12%', await taxaEfetivaServicos(sb, OFICINA), 0, 'individual');

    await individual(null);
    confere('sem individual -> global fixa 12%', await taxaEfetivaServicos(sb, OFICINA), 0.12, 'global');

    await global('desempenho');
    confere('global desempenho, oficina nova = taxa base 15%', await taxaEfetivaServicos(sb, OFICINA), 0.15, 'global');

    await global('fixa', 0.02);
    confere('pecas: global fixa 2%', await taxaEfetivaPecas(sb, 'oficina', OFICINA), 0.02, 'global');
    await individual(0.01);
    confere('pecas: individual 1% vale sobre global', await taxaEfetivaPecas(sb, 'oficina', OFICINA), 0.01, 'individual');
  } finally {
    await sb.from('plataforma_config').update({
      comissao_servicos_modo: antes.comissao_servicos_modo, comissao_servicos_taxa: antes.comissao_servicos_taxa,
      comissao_pecas_modo: antes.comissao_pecas_modo, comissao_pecas_taxa: antes.comissao_pecas_taxa,
    }).eq('id', 1);
    await sb.from('comissao_pecas_config').delete().eq('fornecedor_id', OFICINA);
    await sb.from('oficinas').delete().eq('id', OFICINA);
    const depois = await lerPlataformaConfig(sb);
    console.log('regra global restaurada:', depois.comissao_servicos_modo, depois.comissao_pecas_modo);
  }
  console.log(falhas === 0 ? 'TUDO CERTO' : `${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})();
