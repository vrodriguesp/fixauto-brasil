import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { oficinasDoUsuario } from '@/lib/acesso-servico';
import { dentroDoLimite } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const TIPOS = ['mao_de_obra', 'peca', 'material', 'outro'];
const MODELOS = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

// Orcamento feito em outro sistema (foto ou PDF): a IA le os itens, o prazo e
// a garantia e devolve para PREENCHER o formulario - a oficina confere e
// corrige antes de enviar (nada e enviado ao cliente sem ela revisar).
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!(await oficinasDoUsuario(userId)).length) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  if (!dentroDoLimite(`ler-orcamento:${userId}`, 20, 60 * 60 * 1000)) return NextResponse.json({ error: 'Muitas requisições', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get('arquivo');
  const idioma = String(form?.get('idioma') || 'pt').slice(0, 10);
  if (!(arquivo instanceof File)) return NextResponse.json({ error: 'Arquivo obrigatório', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  const tipo = arquivo.type || '';
  if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(tipo)) return NextResponse.json({ error: 'Tipo de arquivo', codigo: 'TIPO_ARQUIVO' }, { status: 400 });
  if (arquivo.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Arquivo grande', codigo: 'ARQUIVO_GRANDE' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'IA indisponível', codigo: 'IA_OCUPADA' }, { status: 503 });
  const dados = Buffer.from(await arquivo.arrayBuffer()).toString('base64');
  const corpo = JSON.stringify({
    contents: [{ parts: [
      { inline_data: { mime_type: tipo, data: dados } },
      { text: `Este documento e um orcamento de oficina mecanica/funilaria. Extraia os dados e responda SO JSON:
{"itens":[{"descricao":"texto do item","tipo":"mao_de_obra|peca|material|outro","quantidade":1,"valor_unitario":0}],"prazo_dias":null,"garantia_dias":null,"observacoes":"","total":0}
Regras: valores numericos sem simbolo de moeda (ponto decimal); quantidade padrao 1; se o documento so tiver o total de uma linha, use valor_unitario = total da linha / quantidade; garantia em dias (6 meses = 180); prazo em dias; se nao houver, null. Mantenha as descricoes no idioma do documento. Observacoes: condicoes relevantes (validade, forma de pagamento) em ${idioma}, curto.` },
    ] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' },
  });

  let res: Response | null = null;
  for (const modelo of MODELOS) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: corpo,
      }).catch(() => null);
      if (res?.ok || (res && ![429, 500, 503].includes(res.status))) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (res?.ok) break;
  }
  if (!res?.ok) {
    const msg = res ? String((await res.json().catch(() => ({})) as any).error?.message || '') : '';
    console.error('[ler-orcamento] Gemini', res?.status, msg);
    if (res?.status === 400) return NextResponse.json({ error: 'Arquivo ilegível', codigo: 'FOTO_INVALIDA' }, { status: 422 });
    return NextResponse.json({ error: 'IA ocupada', codigo: 'IA_OCUPADA' }, { status: 503 });
  }
  const g = await res.json();
  const texto = (g.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  let lido: any;
  try { lido = JSON.parse(texto.replace(/^```json\s*|\s*```$/g, '')); } catch { return NextResponse.json({ error: 'Não foi possível ler', codigo: 'FOTO_INVALIDA' }, { status: 422 }); }

  const num = (v: unknown) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
  const itens = (Array.isArray(lido.itens) ? lido.itens : []).slice(0, 60).map((i: any) => ({
    descricao: String(i?.descricao || '').slice(0, 200),
    tipo: TIPOS.includes(i?.tipo) ? i.tipo : 'outro',
    quantidade: Math.max(1, Math.round(num(i?.quantidade) || 1)),
    valor_unitario: num(i?.valor_unitario),
  })).filter((i: any) => i.descricao);
  if (!itens.length) return NextResponse.json({ error: 'Nenhum item', codigo: 'SEM_ITENS' }, { status: 422 });
  const inteiro = (v: unknown) => { const n = Math.round(num(v)); return n > 0 ? n : null; };
  return NextResponse.json({
    itens,
    prazo_dias: inteiro(lido.prazo_dias),
    garantia_dias: inteiro(lido.garantia_dias),
    observacoes: String(lido.observacoes || '').slice(0, 1000),
    total: num(lido.total),
  });
}
