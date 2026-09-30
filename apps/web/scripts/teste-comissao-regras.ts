// Teste da decisao de comissao sem banco (funcoes puras de comissao-regras):
// percentual, faixa por desempenho, valor fixo por servico (global e
// individual), prazo da condicao individual e valor cobrado.
//
//   npx tsx scripts/teste-comissao-regras.ts
import { CONFIG_PADRAO, naFaixa, resolverPecas, resolverServicos, valorDaComissao, type PlataformaConfig } from '../src/lib/comissao-regras';

let falhas = 0;
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = typeof esperado === 'number' ? Math.abs(Number(obtido) - esperado) < 1e-9 : obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${obtido}${ok ? '' : ` (esperado ${esperado})`}`);
}

const cfg = (p: Partial<PlataformaConfig>): PlataformaConfig => ({ ...CONFIG_PADRAO, ...p });
const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

// global isento
let e = resolverServicos(null, cfg({ comissao_servicos_modo: 'isento' }), 'EUR', null);
confere('isento: taxa', e.taxa, 0);
confere('isento: cobra', valorDaComissao(e, 500), 0);

// global percentual fixo
e = resolverServicos(null, cfg({ comissao_servicos_modo: 'fixa', comissao_servicos_taxa: 0.04 }), 'EUR', null);
confere('fixa 4%: cobra em 500', valorDaComissao(e, 500), 20);

// desempenho: escala 5..15% levada para a faixa 1..5%
confere('faixa: pior desempenho = max', naFaixa(0.15, { TAXA_MIN: 0.05, TAXA_MAX: 0.15 }, 0.01, 0.05), 0.05);
confere('faixa: melhor desempenho = min', naFaixa(0.05, { TAXA_MIN: 0.05, TAXA_MAX: 0.15 }, 0.01, 0.05), 0.01);
confere('faixa: meio', naFaixa(0.10, { TAXA_MIN: 0.05, TAXA_MAX: 0.15 }, 0.01, 0.05), 0.03);
e = resolverServicos(null, cfg({ comissao_servicos_modo: 'desempenho', comissao_servicos_min: 0.01, comissao_servicos_max: 0.05 }), 'EUR', 0.10);
confere('desempenho 1..5%: taxa', e.taxa, 0.03);
confere('desempenho: faixa exposta', e.faixaGlobal?.max, 0.05);

// valor fixo por servico, por moeda
const porServico = cfg({ comissao_servicos_modo: 'por_servico', comissao_servicos_valor_por_moeda: { EUR: 5, BRL: 25 } });
e = resolverServicos(null, porServico, 'EUR', null);
confere('por servico EUR: tipo', e.tipo, 'valor_fixo');
confere('por servico EUR: cobra', valorDaComissao(e, 300), 5);
confere('por servico: nunca mais que o servico', valorDaComissao(e, 3), 3);
confere('por servico BRL', valorDaComissao(resolverServicos(null, porServico, 'BRL', null), 300), 25);
confere('por servico sem valor na moeda', valorDaComissao(resolverServicos(null, porServico, 'USD', null), 300), 0);

// individual percentual vale sobre a global
const ind = { usa_override: true, taxa_fixa_override: 0.02, override_ate: amanha };
e = resolverServicos(ind, porServico, 'EUR', null);
confere('individual 2% sobre global por servico: origem', e.origem, 'individual');
confere('individual 2%: cobra em 500', valorDaComissao(e, 500), 10);

// individual valor fixo vale sobre a global percentual
const indFixo = { usa_override: true, override_tipo: 'valor_fixo', valor_fixo_override: 7.5, override_ate: null };
e = resolverServicos(indFixo, cfg({ comissao_servicos_modo: 'fixa', comissao_servicos_taxa: 0.05 }), 'EUR', null);
confere('individual valor fixo: tipo', e.tipo, 'valor_fixo');
confere('individual valor fixo: cobra', valorDaComissao(e, 500), 7.5);

// individual vencida -> volta para a global
e = resolverServicos({ ...ind, override_ate: ontem }, cfg({ comissao_servicos_modo: 'fixa', comissao_servicos_taxa: 0.05 }), 'EUR', null);
confere('individual vencida: origem', e.origem, 'global');
confere('individual vencida: taxa', e.taxa, 0.05);

// individual valor fixo sem valor nao vale
e = resolverServicos({ usa_override: true, override_tipo: 'valor_fixo', valor_fixo_override: null }, cfg({ comissao_servicos_modo: 'isento' }), 'EUR', null);
confere('individual valor fixo vazio: origem', e.origem, 'global');

// pecas: faixa propria
const p = resolverPecas(null, cfg({ comissao_pecas_modo: 'desempenho', comissao_pecas_min: 0.005, comissao_pecas_max: 0.02 }), 0.03);
confere('pecas desempenho pior = max', p.taxa, 0.02);
confere('pecas: cobra em 200', valorDaComissao(p, 200), 4);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os casos ok');
process.exit(falhas ? 1 : 0);
