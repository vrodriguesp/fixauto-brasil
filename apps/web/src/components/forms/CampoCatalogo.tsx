'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface OpcaoCatalogo {
  code: string;
  name: string;
}

// sem acento, sem espaco/hifen e minusculo: "skoda" acha "Škoda", "cx5" acha "CX-5", "mazda 3" acha "MAZDA3"
const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s\-_.]/g, '').toLowerCase();

// Marca/modelo do carro: escreve e ve as opcoes parecidas logo abaixo (como no app), escolhe
// com um toque OU fica com o que escreveu, se o carro nao esta no catalogo. Antes era um
// <select>: no celular abria a lista nativa de tela cheia, sem busca, e quem nao achava o
// carro na lista nao tinha como seguir (dono 12/11).
export default function CampoCatalogo({
  id, opcoes, valor, onEscolher, placeholder, carregando, focoAoMontar, desativado, populares, apelidos, descricaoId,
}: {
  id: string;
  opcoes: OpcaoCatalogo[];
  /** nome salvo (do catalogo ou escrito pela pessoa) */
  valor: string;
  /** code '' = escrito pela pessoa, fora do catalogo; null = campo apagado */
  onEscolher: (o: OpcaoCatalogo | null) => void;
  placeholder?: string;
  carregando?: boolean;
  focoAoMontar?: boolean;
  /** campo a vista mas parado (modelo antes da marca): a pessoa ve tudo o que vai preencher */
  desativado?: boolean;
  /** codigos mostrados num bloco no topo da lista inteira (marcas mais comuns, Fable 16/11) */
  populares?: string[];
  /** outros nomes por codigo (cirilico: "Тойота" acha Toyota) */
  apelidos?: Record<string, string[]>;
  /** id do texto de ajuda sob o rotulo (aria-describedby) */
  descricaoId?: string;
}) {
  const t = useTranslations('veiculoForm');
  const listaId = `${useId()}-lista`;
  const input = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState(valor);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  // o toque numa opcao chega depois do blur do campo: o blur espera e nao confirma o texto por cima
  const escolhendo = useRef(false);

  useEffect(() => { setTexto(valor); }, [valor]);
  // lista aberta pela setinha (campo sem foco): toque fora fecha
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);
  useEffect(() => {
    if (!focoAoMontar) return;
    // o campo novo aparece mais abaixo: no celular ficava atras da barra Tagasi/Edasi (Clarity 12/11)
    input.current?.focus({ preventScroll: true });
    input.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focoAoMontar]);

  // cada opcao e procurada pelo nome e pelos apelidos (cirilico/abreviacao)
  const chaves = useMemo(() => new Map(opcoes.map((o) => [o.code, [chave(o.name), ...(apelidos?.[o.code] || []).map(chave)]])), [opcoes, apelidos]);
  const k = chave(texto);
  // campo vazio ou com o valor ja escolhido: mostra a lista toda para trocar
  const listaInteira = !k || texto === valor;
  const filtradas = useMemo(() => {
    if (listaInteira) return opcoes;
    const ks = (o: OpcaoCatalogo) => chaves.get(o.code) || [chave(o.name)];
    const comeca = opcoes.filter((o) => ks(o).some((x) => x.startsWith(k)));
    const contem = opcoes.filter((o) => !ks(o).some((x) => x.startsWith(k)) && ks(o).some((x) => x.includes(k)));
    return [...comeca, ...contem];
  }, [listaInteira, k, opcoes, chaves]);
  // lista inteira: primeiro o bloco das mais comuns, depois todas de A a Z (Fable 16/11: ninguem rola 300 marcas)
  const topo = useMemo(() => (listaInteira && populares?.length
    ? populares.map((c) => opcoes.find((o) => o.code === c)).filter((o): o is OpcaoCatalogo => !!o) : []), [listaInteira, populares, opcoes]);
  const exata = k ? opcoes.find((o) => (chaves.get(o.code) || []).includes(k)) : undefined;
  const mostrarLivre = texto.trim().length > 0 && !exata && texto !== valor;
  // lista inteira (marcas ~300, modelos <100): cortar em 50 escondia Toyota/Volkswagen de quem rola pela setinha (jornada 12/11)
  const itens: OpcaoCatalogo[] = [...topo, ...filtradas, ...(mostrarLivre ? [{ code: '', name: texto.trim() }] : [])];

  const escolher = (o: OpcaoCatalogo | null) => {
    escolhendo.current = false;
    setAberto(false);
    setAtivo(-1);
    setTexto(o?.name || '');
    onEscolher(o);
  };
  // saiu do campo sem tocar numa opcao: vale o que esta escrito (do catalogo, se bater)
  const confirmarTexto = () => {
    const v = texto.trim();
    if (v === valor) { setAberto(false); return; }
    escolher(!v ? null : exata || { code: '', name: v });
  };

  return (
    <div className="relative" ref={caixa}>
      <input
        ref={input}
        id={id}
        type="text"
        className="input-field scroll-mt-24 pr-12 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        disabled={desativado}
        placeholder={carregando ? t('carregando') : placeholder}
        value={texto}
        autoComplete="off"
        autoCapitalize="words"
        role="combobox"
        aria-expanded={aberto && itens.length > 0}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-busy={carregando}
        aria-describedby={descricaoId}
        onFocus={() => { if (!desativado) setAberto(true); }}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(-1); }}
        onBlur={() => setTimeout(() => { if (!escolhendo.current) confirmarTexto(); }, 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(a + 1, itens.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (aberto && ativo >= 0 && itens[ativo]) escolher(itens[ativo]); else confirmarTexto(); }
          else if (e.key === 'Escape') setAberto(false);
        }}
      />
      {/* as duas formas (dono 12/11): a setinha abre a lista inteira para escolher; escrever filtra */}
      <button type="button" tabIndex={-1} aria-label={t('verLista')} data-testid={`${id}-abrir`} disabled={desativado}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (aberto) { setAberto(false); return; }
          // sem focar o campo: no celular so a lista abre, sem o teclado por cima
          setTexto(valor); setAtivo(-1); setAberto(true);
        }}
        className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-gray-500 disabled:text-gray-300">
        <svg className={`w-5 h-5 transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {aberto && itens.length > 0 && (
        <ul id={listaId} role="listbox" data-testid={`${id}-lista`}
          className="absolute z-30 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {itens.map((o, i) => [
            topo.length > 0 && (i === 0 || i === topo.length) && (
              <li key={`grupo-${i}`} role="presentation" data-testid={`${id}-grupo`}
                className={`px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 ${i ? 'border-t border-gray-100' : ''}`}>
                {i === 0 ? t('marcasPopulares') : t('marcasTodas')}
              </li>
            ),
            <li key={`${i < topo.length ? 'topo-' : ''}${o.code || `livre-${o.name}`}`} role="option" aria-selected={i === ativo}
              onPointerDown={() => { escolhendo.current = true; setTimeout(() => { escolhendo.current = false; }, 600); }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(o)}
              className={`px-4 py-3 min-h-[44px] cursor-pointer text-gray-900 ${i === ativo ? 'bg-primary-50' : 'hover:bg-gray-50'} ${o.code ? '' : 'border-t border-gray-100 text-primary-700'}`}>
              {o.code ? o.name : t('usarTexto', { texto: o.name })}
            </li>,
          ])}
        </ul>
      )}
    </div>
  );
}
