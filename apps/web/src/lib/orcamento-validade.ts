import { diaNaOficina } from './fuso';

// Orcamento vencido (dono 11/11, 079): a validade e a data maxima do orcamento. Passado esse dia
// (no fuso da oficina) o cliente nao aceita nem pede novas datas; a oficina revisa o orcamento.
// Sem validade = nao vence. Regra pura: usada pelas rotas e pelas telas.
export function orcamentoVencido(validade: string | null | undefined, pais?: string | null, agora: Date | number = Date.now()): boolean {
  if (!validade) return false;
  return String(validade).slice(0, 10) < diaNaOficina(new Date(agora), pais);
}
