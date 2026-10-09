'use client';

import { useEffect, useState, type InputHTMLAttributes } from 'react';

// Campo numerico que deixa APAGAR e digitar de novo (teste do dono 09/10,
// ponto 8): antes o valor virava numero a cada tecla com "|| 1", entao apagar
// o "1" o trazia de volta na hora e digitar "8" dava "18". Aqui o texto fica
// livre enquanto a pessoa digita; o numero so e repassado quando e valido, e
// ao sair do campo vazio volta o minimo. Aceita virgula decimal (2,5 / 45,90).
// type="text" + inputMode: o teclado numerico do celular sem as manias do
// <input type="number"> (rolagem do mouse muda o valor, "e", setinhas).
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min'> & {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  decimal?: boolean;
  vazioQuandoZero?: boolean; // preco: mostra o campo vazio (placeholder) em vez de "0"
};

const ler = (txt: string, decimal: boolean) => {
  const limpo = txt.replace(',', '.');
  const n = decimal ? parseFloat(limpo) : parseInt(limpo, 10);
  return Number.isFinite(n) ? n : NaN;
};

export default function CampoNumero({ value, onChange, min = 0, decimal = false, vazioQuandoZero = false, onBlur, ...resto }: Props) {
  const mostrar = (n: number) => (vazioQuandoZero && !n ? '' : String(n));
  const [txt, setTxt] = useState(() => mostrar(value));
  // valor mudado por fora (ex.: a IA leu o orcamento): atualiza o texto
  useEffect(() => {
    if (ler(txt, decimal) !== value && !(txt === '' && vazioQuandoZero && !value)) setTxt(mostrar(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      {...resto}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={txt}
      onChange={(e) => {
        const v = e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, '');
        setTxt(v);
        const n = ler(v, decimal);
        if (!Number.isNaN(n) && n >= min) onChange(n);
      }}
      onBlur={(e) => {
        const n = ler(txt, decimal);
        if (Number.isNaN(n) || n < min) { onChange(min); setTxt(mostrar(min)); }
        onBlur?.(e);
      }}
    />
  );
}
