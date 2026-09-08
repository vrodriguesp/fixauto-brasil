// Busca de endereço por CEP via ViaCEP (API publica brasileira, gratuita,
// sem chave). Usado pra evitar erro de digitacao em rua/cidade/estado: o
// usuario so digita o CEP e o resto e preenchido automaticamente.

export interface EnderecoPorCep {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

/** Formata como usuario digita: 00000-000. Aceita colar com ou sem tracinho. */
export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function cepEstaCompleto(cep: string): boolean {
  return cep.replace(/\D/g, '').length === 8;
}

/** Retorna null se o CEP nao existir ou a consulta falhar (rede/API fora). */
export async function buscarEnderecoPorCep(cep: string): Promise<EnderecoPorCep | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    return {
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      localidade: data.localidade || '',
      uf: data.uf || '',
    };
  } catch {
    return null;
  }
}
