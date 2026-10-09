// Chamada ao Gemini com fila de modelos e PRAZO TOTAL. Antes cada rota tentava
// os modelos sem limite de tempo: com o 2.5-flash no limite do plano gratis,
// caia no 3.5-flash, que levou 82 s para ler um orcamento de 2 paginas
// (medido em 09/10) - o nginx cortava em 60 s e a tela ficava carregando.
// Agora cada tentativa tem prazo e o conjunto termina antes do corte do nginx.
export interface ModeloGemini {
  modelo: string;
  // desliga o "raciocinio" (so no 2.5-flash: 11 s -> 4 s na leitura do
  // orcamento, mesmo resultado; o 3.5-flash-lite recusa o parametro)
  semRaciocinio?: boolean;
}

export async function chamarGemini(
  modelos: ModeloGemini[],
  corpo: Record<string, any>,
  opcoes: { prazoTotalMs?: number; prazoTentativaMs?: number; rotulo: string },
): Promise<Response | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const fim = Date.now() + (opcoes.prazoTotalMs ?? 50_000);
  let res: Response | null = null;
  for (const { modelo, semRaciocinio } of modelos) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const resta = fim - Date.now();
      if (resta < 3000) return res;
      const gc = { ...(corpo.generationConfig || {}) };
      if (semRaciocinio) gc.thinkingConfig = { thinkingBudget: 0 };
      const inicio = Date.now();
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST',
        // chave no cabecalho, nao na URL (URLs aparecem em logs de proxy)
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ ...corpo, generationConfig: gc }),
        signal: AbortSignal.timeout(Math.min(resta, opcoes.prazoTentativaMs ?? 30_000)),
      }).catch(() => null);
      if (res?.ok) return res;
      console.error(`[${opcoes.rotulo}] Gemini ${modelo}`, res ? res.status : 'sem resposta/prazo', `${Date.now() - inicio} ms`);
      // sem resposta (prazo) ou erro que nao e de ocupado: proximo modelo
      if (!res || ![429, 500, 503].includes(res.status)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return res;
}
