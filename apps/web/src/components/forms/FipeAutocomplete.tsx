'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { paisDoAparelho } from '@/lib/seguro-reparo';
import { useLocale, useTranslations } from 'next-intl';
import { TIPOS_VEICULO } from '@fixauto/shared';

interface FipeValue {
  tipo: string;
  marca: string;
  modelo: string;
  ano: string;
  codigo?: string;
  valor?: string;
}

interface FipeAutocompleteProps {
  value: FipeValue;
  onChange: (value: FipeValue) => void;
  /** apaga marca/modelo que nao existem no catalogo (so no pedido sem conta). Fora
   * dele (editar um carro ja salvo) os nomes salvos ficam, so as listas ficam sem selecao */
  limparForaDoCatalogo?: boolean;
}

interface FipeOption {
  code: string;
  name: string;
}

const TIPO_LABEL_KEY: Record<string, 'tipoCarro' | 'tipoMoto' | 'tipoCaminhao'> = {
  cars: 'tipoCarro',
  motorcycles: 'tipoMoto',
  trucks: 'tipoCaminhao',
};

export default function FipeAutocomplete({ value, onChange, limparForaDoCatalogo = false }: FipeAutocompleteProps) {
  const locale = useLocale();
  const t = useTranslations('veiculoForm');
  // A FIPE (tabela de precos de veiculos) so cobre o mercado brasileiro -
  // fora do "pt", marca/modelo vem do catalogo aberto VehiclesDB (CC-BY 4.0,
  // https://github.com/vehiclesdb/vehiclesdb), sem preco (esse catalogo nao
  // tem valor de mercado nem cascata por ano como a FIPE - o ano fica livre).
  // Catalogo do PAIS do carro, nao do idioma: um brasileiro na Estonia usando
  // o site em portugues tem carro estoniano (sem FIPE). Pais = onde o aparelho
  // esta (fuso horario); so sem esse sinal vale o idioma.
  // null = pais ainda nao conhecido: nenhuma lista e pedida antes. Antes a pagina
  // /br/pt num aparelho fora do Brasil pedia a FIPE e logo depois o catalogo; se a
  // FIPE respondia por ultimo, as marcas ficavam com codigos FIPE (Toyota=56) e os
  // modelos eram pedidos ao catalogo com marca=56 - lista vazia (10/11)
  const [isBR, setIsBR] = useState<boolean | null>(null);
  useEffect(() => { const p = paisDoAparelho(); setIsBR(p ? p === 'BR' : locale === 'pt'); }, [locale]);
  // so a resposta do pedido mais recente vale (uma lista que chega atrasada e ignorada)
  const pedidoMarcas = useRef(0);
  const pedidoModelos = useRef(0);
  const [marcas, setMarcas] = useState<FipeOption[]>([]);
  const [modelos, setModelos] = useState<FipeOption[]>([]);
  const [anos, setAnos] = useState<FipeOption[]>([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const [selectedMarcaCode, setSelectedMarcaCode] = useState('');
  const [selectedModeloCode, setSelectedModeloCode] = useState('');
  const [selectedAnoCode, setSelectedAnoCode] = useState('');

  const fetchMarcas = useCallback(async (tipo: string) => {
    if (isBR === null) return;
    const n = ++pedidoMarcas.current;
    setLoading('marcas');
    setError('');
    try {
      const url = isBR ? `/api/fipe?path=${tipo}/brands` : `/api/vehicle-catalog?tipo=${tipo}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao buscar marcas');
      const data = await res.json();
      if (n !== pedidoMarcas.current) return;
      setMarcas(data);
    } catch {
      if (n !== pedidoMarcas.current) return;
      setError(t('erroMarcas'));
      setMarcas(
        isBR
          ? [
              { code: '59', name: 'Volkswagen' },
              { code: '21', name: 'Fiat' },
              { code: '23', name: 'Chevrolet' },
              { code: '25', name: 'Ford' },
              { code: '26', name: 'Honda' },
              { code: '56', name: 'Toyota' },
              { code: '29', name: 'Hyundai' },
              { code: '44', name: 'Renault' },
              { code: '36', name: 'Nissan' },
              { code: '34', name: 'Mitsubishi' },
              { code: '48', name: 'GM - Chevrolet' },
              { code: '7', name: 'BMW' },
              { code: '33', name: 'Mercedes-Benz' },
              { code: '3', name: 'Audi' },
              { code: '40', name: 'Peugeot' },
              { code: '10', name: 'Citroen' },
              { code: '30', name: 'Jeep' },
            ]
          : []
      );
    }
    setLoading('');
  }, [isBR, t]);

  const fetchModelos = useCallback(async (tipo: string, marcaCode: string) => {
    const n = ++pedidoModelos.current;
    setLoading('modelos');
    setError('');
    try {
      const url = isBR
        ? `/api/fipe?path=${tipo}/brands/${marcaCode}/models`
        : `/api/vehicle-catalog?tipo=${tipo}&marca=${marcaCode}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao buscar modelos');
      const data = await res.json();
      if (n !== pedidoModelos.current) return;
      setModelos(data);
    } catch {
      if (n !== pedidoModelos.current) return;
      setError(t('erroModelos'));
      setModelos([]);
    }
    setLoading('');
  }, [isBR, t]);

  const fetchAnos = useCallback(async (tipo: string, marcaCode: string, modeloCode: string) => {
    setLoading('anos');
    setError('');
    try {
      const res = await fetch(`/api/fipe?path=${tipo}/brands/${marcaCode}/models/${modeloCode}/years`);
      if (!res.ok) throw new Error('Erro ao buscar anos');
      const data = await res.json();
      setAnos(data);
    } catch {
      setError(t('erroAnos'));
      setAnos([]);
    }
    setLoading('');
  }, [t]);

  useEffect(() => {
    fetchMarcas(value.tipo);
  }, [value.tipo, fetchMarcas]);

  // Carro ja escolhido (rascunho de quem trocou de idioma ou recarregou a pagina):
  // quando as listas chegam, marca/modelo/ano voltam selecionados pelo nome,
  // sem chamar onChange (que apagaria o resto) - antes voltavam vazios (dono 06/11)
  // A lista pode mudar de catalogo (Portugal <-> Brasil usam catalogos diferentes, com
  // outros codigos): o carro e procurado de novo pelo nome; modelo que nao existe com o
  // mesmo nome no catalogo novo e apagado, para a pessoa escolher de novo.
  useEffect(() => {
    if (!value.marca || !marcas.length || marcas.some((x) => x.code === selectedMarcaCode)) return;
    const m = marcas.find((x) => x.name.toLowerCase() === value.marca.toLowerCase());
    setSelectedModeloCode(''); setSelectedAnoCode(''); setModelos([]); setAnos([]);
    if (m) { setSelectedMarcaCode(m.code); fetchModelos(value.tipo, m.code); }
    else { setSelectedMarcaCode(''); if (limparForaDoCatalogo) onChange({ ...value, marca: '', modelo: '', ano: '', codigo: undefined, valor: undefined }); }
  }, [marcas]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!value.modelo || !modelos.length || modelos.some((x) => x.code === selectedModeloCode)) return;
    const m = modelos.find((x) => x.name.toLowerCase() === value.modelo.toLowerCase());
    if (m) { setSelectedModeloCode(m.code); if (isBR && selectedMarcaCode) fetchAnos(value.tipo, selectedMarcaCode, m.code); }
    else if (limparForaDoCatalogo) onChange({ ...value, modelo: '', ano: '', codigo: undefined, valor: undefined });
  }, [modelos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedAnoCode || !value.ano || !anos.length) return;
    const a = anos.find((x) => x.name === value.ano);
    if (a) setSelectedAnoCode(a.code);
  }, [anos]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTipoChange = (tipo: string) => {
    onChange({ tipo, marca: '', modelo: '', ano: '' });
    setSelectedMarcaCode('');
    setSelectedModeloCode('');
    setSelectedAnoCode('');
    setModelos([]);
    setAnos([]);
  };

  const handleMarcaChange = (marcaCode: string) => {
    const marca = marcas.find((m) => m.code === marcaCode);
    if (marca) {
      setSelectedMarcaCode(marcaCode);
      setSelectedModeloCode('');
      setSelectedAnoCode('');
      onChange({ ...value, marca: marca.name, modelo: '', ano: '', codigo: undefined, valor: undefined });
      setModelos([]);
      setAnos([]);
      fetchModelos(value.tipo, marcaCode);
    }
  };

  const handleModeloChange = (modeloCode: string) => {
    const modelo = modelos.find((m) => m.code === modeloCode);
    if (modelo) {
      setSelectedModeloCode(modeloCode);
      setSelectedAnoCode('');
      onChange({ ...value, modelo: modelo.name, ano: '', codigo: undefined, valor: undefined });
      if (isBR) {
        setAnos([]);
        fetchAnos(value.tipo, selectedMarcaCode, modeloCode);
      }
    }
  };

  const handleAnoChange = async (anoCode: string) => {
    const ano = anos.find((a) => a.code === anoCode);
    if (ano) {
      setSelectedAnoCode(anoCode);
      setLoading('valor');
      try {
        const res = await fetch(
          `/api/fipe?path=${value.tipo}/brands/${selectedMarcaCode}/models/${selectedModeloCode}/years/${anoCode}`
        );
        if (res.ok) {
          const data = await res.json();
          onChange({
            ...value,
            ano: ano.name,
            codigo: data.codeFipe,
            valor: data.price,
          });
          setLoading('');
          return;
        }
      } catch {
        // Ignore and set without price
      }
      onChange({ ...value, ano: ano.name });
      setLoading('');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          {error}
        </div>
      )}

      {/* Vehicle type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelTipo')}</label>
        <div className="flex gap-2">
          {TIPOS_VEICULO.map((tipo) => (
            <button
              key={tipo.value}
              type="button"
              onClick={() => handleTipoChange(tipo.value)}
              className={`flex-1 py-3 rounded-lg text-sm font-medium border transition-colors ${
                value.tipo === tipo.value
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t(TIPO_LABEL_KEY[tipo.value])}
            </button>
          ))}
        </div>
      </div>

      {/* Marca */}
      <div>
        <label htmlFor="cbbe3-101" className="block text-sm font-medium text-gray-700 mb-1">
          {t('labelMarca')} {loading === 'marcas' && <span className="text-gray-400">({t('carregando')})</span>}
        </label>
        <select id="cbbe3-101"
          className="input-field"
          value={selectedMarcaCode}
          onChange={(e) => handleMarcaChange(e.target.value)}
          disabled={loading === 'marcas'}
        >
          <option value="">{t('selecioneMarca')}</option>
          {marcas.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Modelo */}
      {selectedMarcaCode && (
        <div>
          <label htmlFor="cbbe3-102" className="block text-sm font-medium text-gray-700 mb-1">
            {t('labelModelo')} {loading === 'modelos' && <span className="text-gray-400">({t('carregando')})</span>}
          </label>
          <select id="cbbe3-102"
            className="input-field"
            value={selectedModeloCode}
            onChange={(e) => handleModeloChange(e.target.value)}
            disabled={loading === 'modelos'}
          >
            <option value="">{t('selecioneModelo')}</option>
            {modelos.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Ano */}
      {selectedModeloCode && (
        <div>
          <label htmlFor="cbbe3-103" className="block text-sm font-medium text-gray-700 mb-1">
            {t('labelAno')} {isBR && loading === 'anos' && <span className="text-gray-400">({t('carregando')})</span>}
          </label>
          {isBR ? (
            <select id="cbbe3-103"
              className="input-field"
              value={selectedAnoCode}
              onChange={(e) => handleAnoChange(e.target.value)}
              disabled={loading === 'anos'}
            >
              <option value="">{t('selecioneAno')}</option>
              {anos.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="cbbe3-103"
              type="number"
              inputMode="numeric"
              className="input-field"
              placeholder={t('placeholderAno')}
              value={value.ano}
              onChange={(e) => onChange({ ...value, ano: e.target.value })}
            />
          )}
        </div>
      )}

      {/* Selected summary */}
      {isBR && value.marca && value.modelo && value.ano && (
        <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium text-primary-900">
              {value.marca} {value.modelo} ({value.ano})
            </p>
          </div>
          {loading === 'valor' ? (
            <p className="text-sm text-primary-600 mt-1">{t('buscandoValor')}</p>
          ) : value.valor ? (
            <p className="text-sm text-green-700 font-semibold mt-1">{t('valorFipe')}: {value.valor}</p>
          ) : (
            <p className="text-sm text-gray-500 mt-1">{t('valorFipeIndisponivel')}</p>
          )}
          {value.codigo && (
            <p className="text-xs text-gray-500 mt-1">{t('codigoFipe')}: {value.codigo}</p>
          )}
        </div>
      )}
    </div>
  );
}
