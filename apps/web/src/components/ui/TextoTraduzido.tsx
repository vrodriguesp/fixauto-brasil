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

// Lista de textos curtos (pecas, checklist, perguntas da IA): devolve cada um na
// lingua de quem le, ou o original enquanto a traducao nao chega / se falhar.
export function useTraducoes(textos: string[] | null | undefined): string[] {
  const lingua = useLocale();
  const lista = textos || [];
  const chave = lista.join('\u0000');
  const [tr, setTr] = useState<(string | null)[]>([]);
  useEffect(() => {
    setTr([]);
    let vivo = true;
    Promise.all(lista.map((t) => (t.trim().length < 2 ? Promise.resolve({ texto: null, origem: null }) : traduzir(t.trim(), lingua))))
      .then((r) => { if (vivo) setTr(r.map((x) => x.texto)); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, lingua]);
  return lista.map((t, i) => tr[i] || t);
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
