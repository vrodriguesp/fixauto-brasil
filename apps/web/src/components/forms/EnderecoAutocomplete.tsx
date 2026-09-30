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
  const escolhido = useRef('');
  const focado = useRef(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || q === escolhido.current || !focado.current) { setSugestoes([]); return; }
    const ctl = new AbortController();
    const tmr = setTimeout(async () => {
      try {
        const p = perto ? `&lat=${perto.lat}&lon=${perto.lon}` : '';
        const r = await fetch(`/api/endereco/sugestoes?q=${encodeURIComponent(q)}${p}`, { signal: ctl.signal });
        const d = r.ok ? ((await r.json()) as SugestaoEndereco[]) : [];
        setSugestoes(d);
        setAberto(d.length > 0);
        setAtivo(-1);
      } catch { /* sem sugestoes: segue texto livre */ }
    }, 300);
    return () => { clearTimeout(tmr); ctl.abort(); };
  }, [value, perto]);

  const escolher = (s: SugestaoEndereco) => {
    escolhido.current = s.endereco || s.rotulo;
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
        onKeyDown={(e) => {
          if (!aberto || !sugestoes.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, sugestoes.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && ativo >= 0) { e.preventDefault(); escolher(sugestoes[ativo]); }
          else if (e.key === 'Escape') setAberto(false);
        }}
      />
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
