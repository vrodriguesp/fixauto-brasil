'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
  // predio, andar, nome do centro... (opcional; so aparece quando a tela passa o campo)
  complemento?: string;
}

// Endereco da oficina em campos separados (rua, numero, CEP, cidade): as
// sugestoes da rua ajudam, mas o numero fica num campo proprio - antes as
// sugestoes muitas vezes nao traziam o numero. Ao sair dos campos, o endereco
// e conferido no mapa (posicao exata com o numero, ou da rua se o numero nao
// estiver no mapa).
// sem a posicao da pessoa, as sugestoes vinham de qualquer lugar ("Tartu mnt" -> Poltsamaa
// em vez de Tallinn - dono 08/11): usa o centro do mercado so para ordenar as sugestoes
const CENTRO: Record<string, { lat: number; lon: number }> = {
  et: { lat: 59.437, lon: 24.745 }, ru: { lat: 59.437, lon: 24.745 }, en: { lat: 59.437, lon: 24.745 },
  it: { lat: 41.9028, lon: 12.4964 }, 'pt-PT': { lat: 38.7223, lon: -9.1393 }, pt: { lat: -23.5505, lon: -46.6333 },
};

export default function EnderecoEstruturado({ valor, onChange, perto, idBase = 'end' }: {
  valor: ValorEndereco;
  onChange: (v: ValorEndereco) => void;
  perto?: { lat: number; lon: number } | null;
  idBase?: string;
}) {
  const t = useTranslations('enderecoEstruturado');
  const locale = useLocale();
  const pertoUsado = perto || CENTRO[locale] || null;
  const [estado, setEstado] = useState<'' | 'conferindo' | 'ok' | 'semNumero' | 'naoEncontrado'>('');
  const ultimo = useRef('');
  const atual = useRef(valor);
  atual.current = valor;

  const conferir = async () => {
    const v = atual.current;
    // rua + numero ja basta (antes exigia cidade ou CEP e quem nao escolhia sugestao
    // nunca tinha o endereco conferido - dono 08/11)
    if (!v.rua.trim() || (!v.cidade.trim() && !v.cep.trim() && !v.numero.trim())) return;
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
        // predio achado: o CEP dele vale mais que o generico da rua vindo da sugestao
        cep: (d.numeroEncontrado && v.numero.trim() && d.cep) || atual.current.cep || d.cep || '',
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
    // o complemento nao entra na busca do mapa: nao desfaz a posicao conferida
    if (campo === 'complemento') { onChange({ ...valor, complemento: v }); return; }
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
            perto={pertoUsado}
            onSelect={(s) => {
              const novo = {
                ...valor,
                rua: s.rua || s.endereco,
                // "Tartu mnt 50" digitado e a sugestao so da rua: o 50 vai para o numero
                numero: s.numero || valor.numero || (valor.rua.match(/s(d+[a-zA-Z]?(?:[-/]d+)?)s*$/) || [])[1] || '',
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
      {valor.complemento !== undefined && (
        <div>
          <label htmlFor={`${idBase}-complemento`} className="block text-sm font-medium text-gray-700 mb-1">{t('complemento')}</label>
          <input id={`${idBase}-complemento`} type="text" maxLength={100} className="input-field" value={valor.complemento}
            placeholder={t('complementoPlaceholder')} onChange={(e) => set('complemento', e.target.value)} />
        </div>
      )}
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
