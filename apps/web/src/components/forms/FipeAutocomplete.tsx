'use client';

import { useState, useEffect, useCallback } from 'react';
import { FIPE_API_BASE, TIPOS_VEICULO } from '@fixauto/shared';

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

export default function FipeAutocomplete({ value, onChange }: FipeAutocompleteProps) {
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
      const res = await fetch(`${FIPE_API_BASE}/${tipo}/brands`);
      if (!res.ok) throw new Error('Erro ao buscar marcas');
      const data = await res.json();
      setMarcas(data);
    } catch {
      setError('Erro ao carregar marcas da FIPE. Usando dados de exemplo.');
      setMarcas([
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
      ]);
    }
    setLoading('');
  }, []);

  const fetchModelos = useCallback(async (tipo: string, marcaCode: string) => {
    setLoading('modelos');
    setError('');
    try {
      const res = await fetch(`${FIPE_API_BASE}/${tipo}/brands/${marcaCode}/models`);
      if (!res.ok) throw new Error('Erro ao buscar modelos');
      const data = await res.json();
      setModelos(data);
    } catch {
      setError('Erro ao carregar modelos.');
      setModelos([]);
    }
    setLoading('');
  }, []);

  const fetchAnos = useCallback(async (tipo: string, marcaCode: string, modeloCode: string) => {
    setLoading('anos');
    setError('');
    try {
      const res = await fetch(`${FIPE_API_BASE}/${tipo}/brands/${marcaCode}/models/${modeloCode}/years`);
      if (!res.ok) throw new Error('Erro ao buscar anos');
      const data = await res.json();
      setAnos(data);
    } catch {
      setError('Erro ao carregar anos.');
      setAnos([]);
    }
    setLoading('');
  }, []);

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
      setAnos([]);
      fetchAnos(value.tipo, selectedMarcaCode, modeloCode);
    }
  };

  const handleAnoChange = async (anoCode: string) => {
    const ano = anos.find((a) => a.code === anoCode);
    if (ano) {
      setSelectedAnoCode(anoCode);
      setLoading('valor');
      try {
        const res = await fetch(
          `${FIPE_API_BASE}/${value.tipo}/brands/${selectedMarcaCode}/models/${selectedModeloCode}/years/${anoCode}`
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de veículo</label>
        <div className="flex gap-2">
          {TIPOS_VEICULO.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleTipoChange(t.value)}
              className={`flex-1 py-3 rounded-lg text-sm font-medium border transition-colors ${
                value.tipo === t.value
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Marca */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Marca {loading === 'marcas' && <span className="text-gray-400">(carregando...)</span>}
        </label>
        <select
          className="input-field"
          value={selectedMarcaCode}
          onChange={(e) => handleMarcaChange(e.target.value)}
          disabled={loading === 'marcas'}
        >
          <option value="">Selecione a marca</option>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Modelo {loading === 'modelos' && <span className="text-gray-400">(carregando...)</span>}
          </label>
          <select
            className="input-field"
            value={selectedModeloCode}
            onChange={(e) => handleModeloChange(e.target.value)}
            disabled={loading === 'modelos'}
          >
            <option value="">Selecione o modelo</option>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ano {loading === 'anos' && <span className="text-gray-400">(carregando...)</span>}
          </label>
          <select
            className="input-field"
            value={selectedAnoCode}
            onChange={(e) => handleAnoChange(e.target.value)}
            disabled={loading === 'anos'}
          >
            <option value="">Selecione o ano</option>
            {anos.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Selected summary */}
      {value.marca && value.modelo && value.ano && (
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
            <p className="text-sm text-primary-600 mt-1">Buscando valor FIPE...</p>
          ) : value.valor ? (
            <p className="text-sm text-green-700 font-semibold mt-1">Valor FIPE: {value.valor}</p>
          ) : (
            <p className="text-sm text-gray-500 mt-1">Valor FIPE não disponível</p>
          )}
          {value.codigo && (
            <p className="text-xs text-gray-500 mt-1">Código FIPE: {value.codigo}</p>
          )}
        </div>
      )}
    </div>
  );
}
