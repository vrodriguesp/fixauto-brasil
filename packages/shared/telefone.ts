// Telefone com prefixo internacional (dono 06/11): campo de prefixo (bandeira + codigo)
// ao lado do numero, ja no pais do mercado, em todo lugar que pede telefone (site e app).
// O numero fica salvo completo: "+372 5123 4567". Antes era texto livre e o prefixo so
// era deduzido na hora do SMS pelo pais do pedido (estrangeiro sem "+" virava numero errado).

export interface PrefixoTelefone { pais: string; ddi: string; bandeira: string }

// primeiro os mercados, depois os vizinhos/visitantes mais comuns
export const PREFIXOS_TELEFONE: PrefixoTelefone[] = [
  { pais: 'EE', ddi: '372', bandeira: '🇪🇪' },
  { pais: 'IT', ddi: '39', bandeira: '🇮🇹' },
  { pais: 'PT', ddi: '351', bandeira: '🇵🇹' },
  { pais: 'BR', ddi: '55', bandeira: '🇧🇷' },
  { pais: 'LV', ddi: '371', bandeira: '🇱🇻' },
  { pais: 'LT', ddi: '370', bandeira: '🇱🇹' },
  { pais: 'FI', ddi: '358', bandeira: '🇫🇮' },
  { pais: 'RU', ddi: '7', bandeira: '🇷🇺' },
  { pais: 'UA', ddi: '380', bandeira: '🇺🇦' },
  { pais: 'BY', ddi: '375', bandeira: '🇧🇾' },
  { pais: 'PL', ddi: '48', bandeira: '🇵🇱' },
  { pais: 'SE', ddi: '46', bandeira: '🇸🇪' },
  { pais: 'NO', ddi: '47', bandeira: '🇳🇴' },
  { pais: 'DK', ddi: '45', bandeira: '🇩🇰' },
  { pais: 'DE', ddi: '49', bandeira: '🇩🇪' },
  { pais: 'NL', ddi: '31', bandeira: '🇳🇱' },
  { pais: 'BE', ddi: '32', bandeira: '🇧🇪' },
  { pais: 'FR', ddi: '33', bandeira: '🇫🇷' },
  { pais: 'ES', ddi: '34', bandeira: '🇪🇸' },
  { pais: 'GB', ddi: '44', bandeira: '🇬🇧' },
  { pais: 'IE', ddi: '353', bandeira: '🇮🇪' },
  { pais: 'CH', ddi: '41', bandeira: '🇨🇭' },
  { pais: 'AT', ddi: '43', bandeira: '🇦🇹' },
  { pais: 'CZ', ddi: '420', bandeira: '🇨🇿' },
  { pais: 'TR', ddi: '90', bandeira: '🇹🇷' },
  { pais: 'IN', ddi: '91', bandeira: '🇮🇳' },
  { pais: 'US', ddi: '1', bandeira: '🇺🇸' },
];

/** Exemplo de numero (sem prefixo) para o campo, pelo prefixo escolhido. */
export const EXEMPLO_TELEFONE: Record<string, string> = { '372': '5123 4567', '39': '333 123 4567', '351': '912 345 678', '55': '(11) 91234-5678' };

/** Prefixo inicial pelo idioma/mercado: /ee (et, ru, en) Estonia, it Italia, pt-PT Portugal, pt Brasil. */
export function prefixoPadrao(idioma: string | null | undefined, pais?: string | null): string {
  // pais do cadastro (oficina/loja), quando se sabe, vale mais que o idioma: numero
  // antigo sem "+" de uma oficina italiana usando o site em ingles continua +39
  const doPais = pais ? PREFIXOS_TELEFONE.find((p) => p.pais === pais.toUpperCase()) : undefined;
  if (doPais) return doPais.ddi;
  if (idioma === 'it') return '39';
  if (idioma === 'pt-PT') return '351';
  if (idioma === 'pt') return '55';
  return '372';
}

/** Separa um telefone salvo em prefixo + numero (para mostrar no campo). */
export function separarTelefone(valor: string | null | undefined, padrao: string): { ddi: string; numero: string } {
  const v = (valor || '').trim();
  const internacional = v.startsWith('+') ? v.slice(1) : v.startsWith('00') ? v.slice(2) : null;
  if (internacional !== null) {
    const digitos = internacional.replace(/\D/g, '');
    // o prefixo mais longo que bate ('372' antes de '37'...)
    const p = [...PREFIXOS_TELEFONE].sort((a, b) => b.ddi.length - a.ddi.length).find((x) => digitos.startsWith(x.ddi));
    if (p) {
      // tira o prefixo do texto mantendo a formatacao que a pessoa usou no resto
      let restantes = p.ddi.length;
      let i = 0;
      while (restantes > 0 && i < internacional.length) { if (/\d/.test(internacional[i])) restantes--; i++; }
      return { ddi: p.ddi, numero: internacional.slice(i).trim() };
    }
    return { ddi: padrao, numero: v };
  }
  return { ddi: padrao, numero: v };
}

// digitos minimos do numero nacional (sem o prefixo do pais) para tirar um prefixo repetido
const MINIMO_NACIONAL: Record<string, number> = { '372': 7, '39': 9, '55': 10, '351': 9 };

/**
 * Junta prefixo + numero para salvar ("+372 5123 4567"). Numero vazio = ''.
 * Quem digita o numero ja com "+" ou "00" (de outro pais) tem o proprio prefixo respeitado.
 */
export function juntarTelefone(ddi: string, numero: string): string {
  const n = (numero || '').trim();
  if (!n.replace(/\D/g, '')) return '';
  if (n.startsWith('+')) return n;
  if (n.startsWith('00')) return '+' + n.slice(2).trim();
  // prefixo digitado de novo sem o + ("372 5123 4567" com +372 escolhido) sai, se o que
  // sobra ainda tem o tamanho de um numero nacional (no Brasil o DDD 55 existe e na
  // Italia ha celulares 39x: por isso o minimo por pais)
  const digitos = n.replace(/\D/g, '');
  if (digitos.startsWith(ddi) && digitos.length - ddi.length >= (MINIMO_NACIONAL[ddi] ?? 8)) {
    let restantes = ddi.length;
    let i = 0;
    while (restantes > 0 && i < n.length) { if (/\d/.test(n[i])) restantes--; i++; }
    return `+${ddi} ${n.slice(i).trim()}`;
  }
  // zero de discagem nacional sai (0 41 9... -> +55 41 9...), menos na Italia, onde o 0
  // do fixo faz parte do numero internacional (+39 06 ...)
  return `+${ddi} ${ddi === '39' ? n : n.replace(/^0+(?=\d)/, '')}`;
}
