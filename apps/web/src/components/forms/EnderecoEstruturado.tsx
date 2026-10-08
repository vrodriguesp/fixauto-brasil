'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import EnderecoAutocomplete from './EnderecoAutocomplete';
import { buscarEnderecoPorCep, cepEstaCompleto, formatCep } from '@/lib/cep';

export interface ValorEndereco {
  rua: string;
  numero: string;
  cidade: string;
  estado: string;
  cep: string;
  latitude: number | null;
  longitude: number | null;
  pais: string;
}

// Endereco da oficina em campos separados (rua, numero, CEP, cidade): as
// sugestoes da rua ajudam, mas o numero fica num campo proprio - antes as
// sugestoes muitas vezes nao traziam o numero. Ao sair dos campos, o endereco
// e conferido no mapa (posicao exata com o numero, ou da rua se o numero nao
// estiver no mapa).
export default function EnderecoEstruturado({ valor, onChange, perto, idBase = 'end' }: {
  valor: ValorEndereco;
  onChange: (v: ValorEndereco) => void;
  perto?: { lat: number; lon: number } | null;
  idBase?: string;
}) {
  const t = useTranslations('enderecoEstruturado');
  const [estado, setEstado] = useState<'' | 'conferindo' | 'ok' | 'semNumero' | 'naoEncontrado'>('');
  const ultimo = useRef('');
  const atual = useRef(valor);
  atual.current = valor;

  const conferir = async () => {
    const v = atual.current;
    if (!v.rua.trim() || (!v.cidade.trim() && !v.cep.trim())) return;
    const chave = [v.rua, v.numero, v.cidade, v.cep, v.pais].map((x) => x.trim().toLowerCase()).join('|');
    if (chave === ultimo.current) return;
    ultimo.current = chave;
    setEstado('conferindo');
    const p = new URLSearchParams({ rua: v.rua.trim(), numero: v.numero.trim(), cidade: v.cidade.trim(), cep: v.cep.trim(), pais: v.pais });
    try {
      const r = await fetch(`/api/geocode?${p}`);
      if (!r.ok) { setEstado('naoEncontrado'); return; }
      const d = await r.json();
      onChange({
        ...atual.current,
        latitude: d.latitude, longitude: d.longitude,
        cidade: atual.current.cidade || d.cidade || '',
        estado: atual.current.estado || d.estado || '',
        cep: atual.current.cep || d.cep || '',
        pais: d.paisCodigo || atual.current.pais,
      });
      setEstado(d.numeroEncontrado ? 'ok' : 'semNumero');
    } catch {
      setEstado('naoEncontrado');
    }
  };

  // endereco ja salvo e conferido: mostra como confirmado
  useEffect(() => {
    if (valor.latitude != null && valor.rua && !estado) setEstado('ok');
  }, [valor.latitude, valor.rua, estado]);

  const set = (campo: keyof ValorEndereco, v: string) => {
    if (estado && estado !== 'conferindo') setEstado('');
    onChange({ ...valor, [campo]: v, latitude: campo === 'pais' ? valor.latitude : null, longitude: campo === 'pais' ? valor.longitude : null });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div>
          <label htmlFor={`${idBase}-rua`} className="block text-sm font-medium text-gray-700 mb-1">{t('rua')}</label>
          <EnderecoAutocomplete id={`${idBase}-rua`}
            value={valor.rua}
            onChange={(v) => set('rua', v)}
            placeholder={t('ruaPlaceholder')}
            perto={perto}
            onSelect={(s) => {
              const novo = {
                ...valor,
                rua: s.rua || s.endereco,
                numero: s.numero || valor.numero,
                cidade: s.cidade || valor.cidade,
                estado: s.estado || valor.estado,
                cep: s.cep || valor.cep,
                pais: s.paisCodigo || valor.pais,
                latitude: null, longitude: null,
              };
              onChange(novo);
              atual.current = novo;
              setTimeout(conferir, 0);
            }}
          />
        </div>
        <div>
          <label htmlFor={`${idBase}-numero`} className="block text-sm font-medium text-gray-700 mb-1">{t('numero')}</label>
          <input id={`${idBase}-numero`} type="text" inputMode="text" maxLength={20} className="input-field" value={valor.numero}
            onChange={(e) => set('numero', e.target.value)} onBlur={conferir} />
        </div>
      </div>
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <div>
          <label htmlFor={`${idBase}-cep`} className="block text-sm font-medium text-gray-700 mb-1">{t('cep')}</label>
          <input id={`${idBase}-cep`} type="text" maxLength={15} className="input-field" value={valor.cep}
            onChange={(e) => set('cep', valor.pais === 'BR' ? formatCep(e.target.value) : e.target.value)}
            onBlur={async () => {
              // Brasil: o CEP preenche rua, cidade e estado (ViaCEP)
              if (valor.pais === 'BR' && cepEstaCompleto(valor.cep)) {
                const r = await buscarEnderecoPorCep(valor.cep);
                if (r) {
                  const novo = { ...atual.current, rua: atual.current.rua || r.logradouro || '', cidade: r.localidade || atual.current.cidade, estado: r.uf || atual.current.estado };
                  onChange(novo);
                  atual.current = novo;
                }
              }
              conferir();
            }} />
        </div>
        <div>
          <label htmlFor={`${idBase}-cidade`} className="block text-sm font-medium text-gray-700 mb-1">{t('cidade')}</label>
          <input id={`${idBase}-cidade`} type="text" maxLength={80} className="input-field" value={valor.cidade}
            onChange={(e) => set('cidade', e.target.value)} onBlur={conferir} />
        </div>
      </div>
      <div>
        <label htmlFor={`${idBase}-estado`} className="block text-sm font-medium text-gray-700 mb-1">{t('estado')}</label>
        <input id={`${idBase}-estado`} type="text" maxLength={80} className="input-field" value={valor.estado}
          onChange={(e) => set('estado', e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { ultimo.current = ''; conferir(); }} disabled={!valor.rua.trim() || estado === 'conferindo'}
          className="btn-secondary !py-2 text-sm disabled:opacity-50">{t('conferir')}</button>
        <p className="text-sm" role="status">
          {estado === 'conferindo' && <span className="text-gray-500">{t('conferindo')}</span>}
          {estado === 'ok' && <span className="text-green-700">✓ {t('encontrado')}</span>}
          {estado === 'semNumero' && <span className="text-amber-700">{t('semNumero')}</span>}
          {estado === 'naoEncontrado' && <span className="text-red-700">{t('naoEncontrado')}</span>}
        </p>
      </div>
    </div>
  );
}

/** "Via Torino, 10" a partir de rua + numero (o que fica salvo em oficinas.endereco). */
export const juntarEndereco = (rua: string, numero: string) => [rua.trim(), numero.trim()].filter(Boolean).join(', ');

/** Separa um endereco salvo antes (sem campo de numero) em rua e numero. */
export function separarEndereco(endereco: string, numeroSalvo?: string | null): { rua: string; numero: string } {
  const e = (endereco || '').trim();
  if (numeroSalvo && e.endsWith(numeroSalvo)) return { rua: e.slice(0, -numeroSalvo.length).replace(/[,\s]+$/, ''), numero: numeroSalvo };
  const m = e.match(/^(.*?)[,\s]+(\d+[A-Za-z]?(?:[/-]\d+[A-Za-z]?)?)$/);
  return m ? { rua: m[1], numero: m[2] } : { rua: e, numero: numeroSalvo || '' };
}
