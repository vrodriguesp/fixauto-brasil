'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function FipeAutocomplete({ value, onChange }: FipeAutocompleteProps) {
  const locale = useLocale();
  const t = useTranslations('veiculoForm');
  // A FIPE (tabela de precos de veiculos) so cobre o mercado brasileiro -
  // fora do "pt", marca/modelo vem do catalogo aberto VehiclesDB (CC-BY 4.0,
  // https://github.com/vehiclesdb/vehiclesdb), sem preco (esse catalogo nao
  // tem valor de mercado nem cascata por ano como a FIPE - o ano fica livre).
  // Catalogo do PAIS do carro, nao do idioma: um brasileiro na Estonia usando
  // o site em portugues tem carro estoniano (sem FIPE). Pais = onde o aparelho
  // esta (fuso horario); so sem esse sinal vale o idioma.
  const [isBR, setIsBR] = useState(locale === 'pt');
  useEffect(() => { const p = paisDoAparelho(); if (p) setIsBR(p === 'BR'); }, []);
  const [marcas, setMarcas] = useState<FipeOption[]>([]);
  const [modelos, setModelos] = useState<FipeOption[]>([]);
  const [anos, setAnos] = useState<FipeOption[]>([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const [selectedMarcaCode, setSelectedMarcaCode] = useState('');
  const [selectedModeloCode, setSelectedModeloCode] = useState('');
  const [selectedAnoCode, setSelectedAnoCode] = useState('');

  const fetchMarcas = useCallback(async (tipo: string) => {
    setLoading('marcas');
    setError('');
    try {
      const url = isBR ? `/api/fipe?path=${tipo}/brands` : `/api/vehicle-catalog?tipo=${tipo}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao buscar marcas');
      const data = await res.json();
      setMarcas(data);
    } catch {
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
    setLoading('modelos');
    setError('');
    try {
      const url = isBR
        ? `/api/fipe?path=${tipo}/brands/${marcaCode}/models`
        : `/api/vehicle-catalog?tipo=${tipo}&marca=${marcaCode}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao buscar modelos');
      const data = await res.json();
      setModelos(data);
    } catch {
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
