// Codigo de acesso de um acidente registrado sem login: fica so neste
// navegador (o servidor guarda apenas o hash) e vai no cabecalho das
// chamadas a /api/emergencia/<id>.
const chave = (id: string) => `bipfix_emergencia_${id}`;

export function salvarTokenEmergencia(id: string, token: string) {
  try {
    localStorage.setItem(chave(id), token);
  } catch {}
}

export function headersEmergencia(id: string): Record<string, string> {
  try {
    const t = localStorage.getItem(chave(id));
    return t ? { 'x-emergencia-token': t } : {};
  } catch {
    return {};
  }
}
