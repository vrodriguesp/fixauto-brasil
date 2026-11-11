import { fusoDoPais } from './fuso';

// Orcamento vencido (dono 11/11, 079; igual ao site apps/web/src/lib/orcamento-validade.ts): a validade
// e a data maxima do orcamento. Passado esse dia (fuso da oficina) nao se aceita nem se pede novas datas.
// Sem validade = nao vence.
export function orcamentoVencido(validade: string | null | undefined, pais?: string | null, agora: Date = new Date()): boolean {
  if (!validade) return false;
  const hoje = agora.toLocaleDateString('en-CA', { timeZone: fusoDoPais(pais) });
  return String(validade).slice(0, 10) < hoje;
}
