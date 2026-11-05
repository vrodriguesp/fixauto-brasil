import { useEffect, useState, type ComponentProps } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { apiFetch } from './api';

// Texto escrito pela outra pessoa (oficina <-> motorista) na lingua de quem le,
// igual ao site (03/11; teste 05/11: no app a resposta da oficina russa e os
// itens do orcamento ficavam em russo para o motorista estoniano). Usa a mesma
// rota /api/traduzir do site (DeepL + cache no servidor); os textos da mesma tela
// vao juntos numa chamada so e ficam na memoria do app. Sem traducao (mesma
// lingua, erro, sem rede), mostra o original como antes.

type Traducao = { texto: string | null; origem: string | null };
const VAZIA: Traducao = { texto: null, origem: null };
const memoria = new Map<string, Promise<Traducao>>();
let fila: { texto: string; lingua: string; chave: string; resolver: (t: Traducao) => void }[] = [];
let agendado: ReturnType<typeof setTimeout> | null = null;

function enviarFila() {
  agendado = null;
  const lote = fila; fila = [];
  const porLingua = new Map<string, typeof lote>();
  for (const item of lote) porLingua.set(item.lingua, [...(porLingua.get(item.lingua) || []), item]);
  for (const [lingua, itens] of Array.from(porLingua)) {
    for (let i = 0; i < itens.length; i += 50) {
      const parte = itens.slice(i, i + 50);
      apiFetch('/api/traduzir', { method: 'POST', body: JSON.stringify({ lingua, textos: parte.map((p) => p.texto) }) })
        .then((d) => parte.forEach((p, k) => p.resolver(d?.traducoes?.[k] || VAZIA)))
        // falhou (sem rede, sem login): esquece para tentar de novo na proxima tela
        .catch(() => parte.forEach((p) => { memoria.delete(p.chave); p.resolver(VAZIA); }));
    }
  }
}

function traduzir(texto: string, lingua: string): Promise<Traducao> {
  const chave = `${lingua}\n${texto}`;
  let p = memoria.get(chave);
  if (!p) {
    p = new Promise<Traducao>((resolver) => { fila.push({ texto, lingua, chave, resolver }); });
    memoria.set(chave, p);
    if (!agendado) agendado = setTimeout(enviarFila, 60);
  }
  return p;
}

/** Varios textos de uma vez. `original` = a pessoa pediu para ver o original. */
export function useTraducoes(textos: (string | null | undefined)[], original = false, ativo = true): { textos: string[]; traduzido: boolean } {
  const { i18n } = useTranslation();
  const lingua = i18n.language;
  const lista = textos.map((t) => String(t ?? ''));
  const chave = lista.join('\u0000');
  const [tr, setTr] = useState<Traducao[]>([]);
  useEffect(() => {
    setTr([]);
    if (!ativo) return;
    let vivo = true;
    Promise.all(lista.map((t) => (t.trim().length < 2 ? Promise.resolve(VAZIA) : traduzir(t.trim(), lingua))))
      .then((r) => { if (vivo) setTr(r); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, lingua, ativo]);
  return { textos: lista.map((t, i) => (!original && tr[i]?.texto) || t), traduzido: tr.some((x) => !!x?.texto) };
}

/** "Traduzido automaticamente · ver original" (toca para alternar). */
export function AvisoTraducao({ traduzido, original, alternar, claro }: { traduzido: boolean; original: boolean; alternar: () => void; claro?: boolean }) {
  const { t } = useTranslation();
  if (!traduzido) return null;
  return (
    <Text className={`text-[11px] mt-1 ${claro ? 'text-primary-100' : 'text-gray-400'}`}>
      {original ? t('traducao.original') : `🌐 ${t('traducao.traduzido')}`}
      {' · '}
      <Text onPress={alternar} accessibilityRole="button" className="underline">{original ? t('traducao.verTraducao') : t('traducao.verOriginal')}</Text>
    </Text>
  );
}

/** Texto curto traduzido sem o aviso (avisos/lista): so troca o texto. */
export function TextoTraduzido({ texto, ativo = true, ...props }: { texto: string | null | undefined; ativo?: boolean } & ComponentProps<typeof Text>) {
  const tr = useTraducoes([texto], false, ativo);
  return <Text {...props}>{tr.textos[0]}</Text>;
}
