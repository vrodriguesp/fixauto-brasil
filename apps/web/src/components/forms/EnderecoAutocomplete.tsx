'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { SugestaoEndereco } from '@/app/api/endereco/sugestoes/route';

export type { SugestaoEndereco };

// Campo de endereco com sugestoes enquanto digita (a partir de 3 letras).
// Continua aceitando texto livre. Teclado: setas + Enter; toque: linhas de 44 px.
export default function EnderecoAutocomplete({
  value, onChange, onSelect, placeholder, id, perto, className = 'input-field', required,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: SugestaoEndereco) => void;
  placeholder?: string;
  id?: string;
  perto?: { lat: number; lon: number } | null;
  className?: string;
  required?: boolean;
}) {
  const auto = useId();
  const listaId = `${id || auto}-sugestoes`;
  const [sugestoes, setSugestoes] = useState<SugestaoEndereco[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  // textos que vieram de uma sugestao escolhida (nao buscar de novo)
  const escolhidos = useRef<string[]>([]);
  const [procurando, setProcurando] = useState(false);
  const focado = useRef(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || escolhidos.current.includes(q) || !focado.current) { setSugestoes([]); setProcurando(false); return; }
    const ctl = new AbortController();
    const tmr = setTimeout(async () => {
      setProcurando(true);
      try {
        const p = perto ? `&lat=${perto.lat}&lon=${perto.lon}` : '';
        const r = await fetch(`/api/endereco/sugestoes?q=${encodeURIComponent(q)}${p}`, { signal: ctl.signal });
        const d = r.ok ? ((await r.json()) as SugestaoEndereco[]) : [];
        setSugestoes(d);
        setAberto(d.length > 0);
        setAtivo(-1);
      } catch { /* sem sugestoes: segue texto livre */ }
      if (!ctl.signal.aborted) setProcurando(false);
    }, 300);
    return () => { clearTimeout(tmr); ctl.abort(); };
  }, [value, perto]);

  const escolher = (s: SugestaoEndereco) => {
    escolhidos.current = [s.endereco, s.rua, s.rotulo].filter(Boolean);
    onSelect(s);
    setAberto(false);
    setSugestoes([]);
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-autocomplete="list"
        onFocus={() => { focado.current = true; if (sugestoes.length) setAberto(true); }}
        onBlur={() => { focado.current = false; setTimeout(() => setAberto(false), 150); }}
        onChange={(e) => onChange(e.target.value)}
        aria-busy={procurando}
        onKeyDown={(e) => {
          if (!aberto || !sugestoes.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, sugestoes.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && ativo >= 0) { e.preventDefault(); escolher(sugestoes[ativo]); }
          else if (e.key === 'Escape') setAberto(false);
        }}
      />
      {/* sugestoes podem levar alguns segundos: mostra que esta procurando */}
      {procurando && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" aria-hidden />
      )}
      {aberto && sugestoes.length > 0 && (
        <ul id={listaId} role="listbox" className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
          {sugestoes.map((s, i) => (
            <li
              key={s.rotulo}
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => { e.preventDefault(); escolher(s); }}
              className={`px-3 py-2.5 min-h-[44px] text-sm cursor-pointer border-b border-gray-50 last:border-0 ${i === ativo ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
            >
              {s.rotulo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
