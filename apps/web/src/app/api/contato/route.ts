import { NextRequest, NextResponse } from 'next/server';
import { sendPerguntaSiteEmail } from '@/lib/notifications';
import { limitarPorIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { chamarGemini } from '@/lib/gemini';

// Formulario "Ainda tem duvidas?" da pagina para oficinas (rota publica, sem
// login). Grava em leads_parceiros (aparece em /admin/leads-parceiros) e manda
// e-mail ao admin com a pergunta traduzida para o portugues.
const PAIS: Record<string, string> = { et: 'EE', ru: 'EE', en: 'EE', it: 'IT', 'pt-PT': 'PT', pt: 'BR' };
const MODELOS = [{ modelo: 'gemini-2.5-flash', semRaciocinio: true }, { modelo: 'gemini-3.5-flash-lite' }];

async function traduzir(texto: string): Promise<string | null> {
  const res = await chamarGemini(MODELOS, {
    contents: [{ parts: [{ text: `Translate the following message into Brazilian Portuguese. Reply with the translation only.\n\n${texto}` }] }],
    generationConfig: { temperature: 0 },
  }, { rotulo: 'contato', prazoTotalMs: 10_000, prazoTentativaMs: 8_000 }).catch(() => null);
  if (!res?.ok) return null;
  const json = await res.json().catch(() => null);
  const saida = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('').trim();
  return saida || null;
}

export async function POST(req: NextRequest) {
  try {
    // cada envio manda e-mail ao admin: limite por IP
    if (!limitarPorIp(req, 'contato', 5, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    // campo isca: robo preencheu -> finge sucesso e nao grava nada
    if (body.site) return NextResponse.json({ success: true });

    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
    const contato = typeof body.contato === 'string' ? body.contato.trim() : '';
    const pergunta = typeof body.pergunta === 'string' ? body.pergunta.trim() : '';
    const locale = typeof body.locale === 'string' && body.locale in PAIS ? body.locale : 'et';
    const pagina = typeof body.pagina === 'string' ? body.pagina.slice(0, 200) : '';
    if (!nome || !contato || pergunta.length < 3) {
      return NextResponse.json({ error: 'Preencha todos os campos' }, { status: 400 });
    }
    if (nome.length > 100 || contato.length > 254 || pergunta.length > 2000) {
      return NextResponse.json({ error: 'Campo muito longo' }, { status: 400 });
    }

    const traducao = locale === 'pt' || locale === 'pt-PT' ? null : await traduzir(pergunta);
    const email = /\S+@\S+\.\S+/.test(contato) ? contato : null;

    const { error } = await supabaseAdmin.from('leads_parceiros').insert({
      tipo: 'oficina',
      nome_responsavel: nome,
      nome_negocio: 'Pergunta pelo site',
      cidade: '-',
      estado: '-',
      whatsapp: contato,
      email,
      observacao: `[Pergunta pelo site · idioma ${locale}${pagina ? ` · ${pagina}` : ''}]\n${pergunta}${traducao ? `\n\n[Tradução] ${traducao}` : ''}`,
      pais: PAIS[locale],
    });
    if (error) console.error('[contato] erro ao gravar:', error.message);

    const envio = await sendPerguntaSiteEmail({ nome, contato, pergunta, traducao, locale, pagina });
    // so falha para a pessoa se nao gravou E nao enviou (senao a pergunta se perderia)
    if (error && !envio.success) {
      return NextResponse.json({ error: 'Falha ao enviar' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[contato]', e);
    return NextResponse.json({ error: 'Falha ao enviar' }, { status: 500 });
  }
}
