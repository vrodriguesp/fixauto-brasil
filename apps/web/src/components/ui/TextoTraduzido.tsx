'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

// Mostra um texto escrito pela outra pessoa (cliente <-> oficina) na lingua de
// quem le, com "traduzido do estoniano - ver original" (dono 03/11). Pede a
// traducao a /api/traduzir; os textos da mesma tela vao juntos numa chamada so
// e ficam guardados na memoria da pagina. Sem traducao (mesma lingua, erro,
// sem chave), mostra o original como sempre.

type Traducao = { texto: string | null; origem: string | null };
const memoria = new Map<string, Promise<Traducao>>();
let fila: { texto: string; lingua: string; resolver: (t: Traducao) => void }[] = [];
let agendado: ReturnType<typeof setTimeout> | null = null;

function enviarFila() {
  agendado = null;
  const lote = fila; fila = [];
  const porLingua = new Map<string, typeof lote>();
  for (const item of lote) porLingua.set(item.lingua, [...(porLingua.get(item.lingua) || []), item]);
  for (const [lingua, itens] of Array.from(porLingua)) {
    for (let i = 0; i < itens.length; i += 50) {
      const parte = itens.slice(i, i + 50);
      fetch('/api/traduzir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lingua, textos: parte.map((p) => p.texto) }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => parte.forEach((p, k) => p.resolver(d?.traducoes?.[k] || { texto: null, origem: null })))
        .catch(() => parte.forEach((p) => p.resolver({ texto: null, origem: null })));
    }
  }
}

function traduzir(texto: string, lingua: string): Promise<Traducao> {
  const chave = `${lingua}\n${texto}`;
  let p = memoria.get(chave);
  if (!p) {
    p = new Promise<Traducao>((resolver) => { fila.push({ texto, lingua, resolver }); });
    memoria.set(chave, p);
    if (!agendado) agendado = setTimeout(enviarFila, 60);
  }
  return p;
}

export function useTraducao(texto: string | null | undefined, ativo = true) {
  const lingua = useLocale();
  const [tr, setTr] = useState<Traducao | null>(null);
  useEffect(() => {
    setTr(null);
    const t = (texto || '').trim();
    if (!ativo || t.length < 2) return;
    let vivo = true;
    traduzir(t, lingua).then((r) => { if (vivo) setTr(r); });
    return () => { vivo = false; };
  }, [texto, lingua, ativo]);
  return tr;
}

// Bloco de textos (analise da IA: resumo, pecas, checklist, perguntas): cada um na
// lingua de quem le, ou o original enquanto a traducao nao chega / se falhar.
// `original` = a pessoa pediu para ver o bloco todo no original (um aviso so
// para o bloco, nao um por linha).
export function useTraducoes(textos: string[] | null | undefined, original = false): { textos: string[]; origem: string | null } {
  const lingua = useLocale();
  // itens vem do JSON da IA sem conferencia: null/numero viram texto
  const lista = (textos || []).map((t) => String(t ?? ''));
  const chave = lista.join('\u0000');
  const [tr, setTr] = useState<Traducao[]>([]);
  useEffect(() => {
    setTr([]);
    let vivo = true;
    Promise.all(lista.map((t) => (t.trim().length < 2 ? Promise.resolve({ texto: null, origem: null }) : traduzir(t.trim(), lingua))))
      .then((r) => { if (vivo) setTr(r); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, lingua]);
  const origem = tr.find((x) => x?.texto)?.origem || null;
  return { textos: lista.map((t, i) => (!original && tr[i]?.texto) || t), origem };
}

// "Traduzido do russo automaticamente · ver original" para um bloco inteiro
export function AvisoTraducao({ origem, original, alternar, className }: { origem: string | null; original: boolean; alternar: () => void; className?: string }) {
  const t = useTranslations('traducao');
  const lingua = useLocale();
  if (!origem) return null;
  let nome = origem;
  try { nome = new Intl.DisplayNames([lingua], { type: 'language' }).of(origem.toLowerCase()) || origem; } catch { /* nome do codigo */ }
  return (
    <p className={`text-xs text-gray-500 ${className || ''}`}>
      <span aria-hidden="true">🌐 </span>{original ? t('original') : t('traduzidoDe', { lingua: nome })}
      {' · '}
      <button type="button" className="underline hover:text-gray-700" onClick={alternar}>
        {original ? t('verTraducao') : t('verOriginal')}
      </button>
    </p>
  );
}

export default function TextoTraduzido({ texto, className, compacto, ativo = true }: {
  texto: string | null | undefined;
  className?: string;
  /** lista/cartao/tabela: em linha (span), so o texto traduzido e um icone, sem "ver original" */
  compacto?: boolean;
  /** false = mostra o original sem pedir traducao (ex.: mensagem da propria pessoa) */
  ativo?: boolean;
}) {
  const t = useTranslations('traducao');
  const lingua = useLocale();
  const tr = useTraducao(texto, ativo);
  const [original, setOriginal] = useState(false);
  if (!texto) return null;
  const traduzido = tr?.texto && !original ? tr.texto : null;
  const nomeLingua = (() => {
    try { return tr?.origem ? new Intl.DisplayNames([lingua], { type: 'language' }).of(tr.origem.toLowerCase()) || tr.origem : ''; } catch { return tr?.origem || ''; }
  })();
  if (compacto) {
    return (
      <span className={className} title={tr?.texto ? t('traduzidoDe', { lingua: nomeLingua }) : undefined}>
        {tr?.texto && <span aria-hidden="true">🌐 </span>}{tr?.texto || texto}
      </span>
    );
  }
  return (
    <div>
      <p className={className}>{traduzido || texto}</p>
      {tr?.texto && (
        <p className="mt-1 text-xs text-gray-400">
          {original ? t('original') : t('traduzidoDe', { lingua: nomeLingua })}
          {' · '}
          <button type="button" className="underline hover:text-gray-600" onClick={() => setOriginal((o) => !o)}>
            {original ? t('verTraducao') : t('verOriginal')}
          </button>
        </p>
      )}
    </div>
  );
}
