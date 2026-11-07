'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PREFIXOS_TELEFONE, EXEMPLO_TELEFONE, prefixoPadrao, separarTelefone, juntarTelefone } from '@fixauto/shared';

// Telefone com prefixo internacional (dono 06/11): bandeira + codigo ja no pais do
// mercado do site, ao lado do numero. Devolve o numero completo ("+372 5123 4567").
// O mesmo campo no app: apps/mobile/components/CampoTelefone.tsx.
export default function CampoTelefone({ id, value, onChange, placeholder, required, autoComplete = 'tel', pais }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; autoComplete?: string;
  /** pais do cadastro (oficina/loja): prefixo de numero antigo salvo sem "+" */
  pais?: string | null;
}) {
  const locale = useLocale();
  const tc = useTranslations('constants');
  const padrao = prefixoPadrao(locale, pais);
  const [ddi, setDdi] = useState(() => separarTelefone(value, padrao).ddi);
  const [numero, setNumero] = useState(() => separarTelefone(value, padrao).numero);
  // valor que chega depois (perfil carregado do banco, rascunho): mostra separado
  useEffect(() => {
    if (juntarTelefone(ddi, numero) === (value || '')) return;
    const s = separarTelefone(value, padrao);
    setDdi(s.ddi); setNumero(s.numero);
  }, [value, padrao]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (novoDdi: string, novoNumero: string) => {
    // numero colado ja com "+..." de outro pais: o prefixo vai para o seletor
    const s = /^\s*(\+|00)/.test(novoNumero) ? separarTelefone(novoNumero, novoDdi) : { ddi: novoDdi, numero: novoNumero };
    setDdi(s.ddi); setNumero(s.numero);
    onChange(juntarTelefone(s.ddi, s.numero));
  };

  return (
    <div className="flex gap-2">
      <select aria-label={tc('prefixoTelefone')} className="input-field !w-auto shrink-0 pr-8" value={ddi} onChange={(e) => mudar(e.target.value, numero)} data-testid="prefixo-telefone">
        {PREFIXOS_TELEFONE.map((p) => (
          <option key={p.pais} value={p.ddi}>{p.bandeira} +{p.ddi}</option>
        ))}
      </select>
      <input id={id} type="tel" inputMode="tel" autoComplete={autoComplete === 'tel' ? 'tel-national' : autoComplete} className="input-field min-w-0 flex-1" maxLength={30}
        placeholder={EXEMPLO_TELEFONE[ddi] ?? placeholder} required={required} value={numero} onChange={(e) => mudar(ddi, e.target.value)} />
    </div>
  );
}
