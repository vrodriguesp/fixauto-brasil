// Nome do mecanico: com acesso ao portal vem da conta; sem acesso, do cadastro.
export function nomeFuncionario(f?: { nome?: string | null; profile?: { nome?: string | null; email?: string | null } | null } | null): string {
  if (!f) return '';
  return f.profile?.nome || f.nome || f.profile?.email || '';
}
