'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useVeiculos } from '@/hooks/use-veiculos';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import {
  TIPOS_SERVICO, URGENCIAS,
  SERVICOS_REVISAO, SERVICOS_MECANICA, SERVICOS_ELETRICA, SERVICOS_PNEU,
} from '@fixauto/shared';

export default function NovaSolicitacaoPage() {
  const router = useRouter();
  const { veiculos } = useVeiculos();
  const { create: createSolicitacao } = useSolicitacoes();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  const [veiculoId, setVeiculoId] = useState('');
  const [tipo, setTipo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [urgencia, setUrgencia] = useState('media');
  const [fotos, setFotos] = useState<{ file: File; preview: string }[]>([]);
  const [servicosSelecionados, setServicosSelecionados] = useState<string[]>([]);
  const [endereco, setEndereco] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const selectedVeiculo = veiculos.find((v) => v.id === veiculoId);
  const tipoConfig = TIPOS_SERVICO.find((t) => t.value === tipo);
  const needsPhoto = tipoConfig?.needsPhoto ?? true;

  const getServiceList = () => {
    switch (tipo) {
      case 'revisao': return SERVICOS_REVISAO;
      case 'mecanica': return SERVICOS_MECANICA;
      case 'eletrica': return SERVICOS_ELETRICA;
      case 'pneu': return SERVICOS_PNEU;
      default: return [];
    }
  };

  const toggleServico = (servico: string) => {
    setServicosSelecionados((prev) =>
      prev.includes(servico) ? prev.filter((s) => s !== servico) : [...prev, servico]
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFotos = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFotos((prev) => [...prev, ...newFotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setFotos((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!veiculoId || !endereco) return;
    const fullDescricao = servicosSelecionados.length > 0
      ? `Serviços: ${servicosSelecionados.join(', ')}${descricao ? '. ' + descricao : ''}`
      : descricao;
    const { error } = await createSolicitacao({
      veiculo_id: veiculoId,
      tipo,
      descricao: fullDescricao,
      urgencia,
      latitude: -23.5505,
      longitude: -46.6333,
      endereco,
    });
    if (!error) {
      setSubmitted(true);
      setTimeout(() => router.push('/cliente/dashboard'), 2000);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Solicitação enviada!</h1>
        <p className="text-gray-600 mb-4">
          Oficinas próximas a você foram notificadas. Você receberá orçamentos em breve.
        </p>
        <p className="text-sm text-gray-500">Redirecionando para o dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Nova Solicitação</h1>
      <p className="text-gray-600 mb-8">Descreva o problema do seu veículo para receber orçamentos</p>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} className="flex-1">
            <div className={`h-2 rounded-full transition-colors ${i + 1 <= step ? 'bg-primary-600' : 'bg-gray-200'}`} />
          </div>
        ))}
        <span className="text-sm text-gray-500 ml-2">{step}/{totalSteps}</span>
      </div>

      <div className="card">
        {/* Step 1: Select vehicle */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Selecione o veículo</h2>
            <div className="space-y-3">
              {veiculos.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">Nenhum veículo cadastrado</p>
                  <a href="/cliente/veiculos?add=true" className="btn-primary">
                    Cadastrar veículo
                  </a>
                </div>
              ) : (
                veiculos.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVeiculoId(v.id)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      veiculoId === v.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">
                      {v.apelido && <span className="text-primary-600">{v.apelido} - </span>}
                      {v.fipe_marca} {v.fipe_modelo}
                    </p>
                    <p className="text-sm text-gray-500">
                      {v.fipe_ano} {v.placa && `| ${v.placa}`} {v.cor && `| ${v.cor}`}
                    </p>
                    {v.fipe_valor && (
                      <p className="text-xs text-green-600 mt-1">FIPE: {v.fipe_valor}</p>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={() => setStep(2)} disabled={!veiculoId} className="btn-primary">
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Service type */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Tipo de serviço</h2>
            <div className="grid grid-cols-2 gap-3">
              {TIPOS_SERVICO.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setTipo(t.value); setServicosSelecionados([]); }}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    tipo === t.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <p className="font-medium text-gray-900 mt-2">{t.label}</p>
                  {!t.needsPhoto && (
                    <p className="text-xs text-gray-500 mt-1">Selecione os serviços</p>
                  )}
                </button>
              ))}
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(1)} className="btn-secondary">Voltar</button>
              <button onClick={() => setStep(3)} disabled={!tipo} className="btn-primary">Próximo</button>
            </div>
          </div>
        )}

        {/* Step 3: Photos OR Service checklist */}
        {step === 3 && (
          <div>
            {needsPhoto ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Fotos do dano</h2>
                <p className="text-sm text-gray-500 mb-4">Adicione fotos para que as oficinas possam avaliar melhor</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoUpload}
                />

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {fotos.map((foto, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden relative group">
                      <img
                        src={foto.preview}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-primary-400 hover:bg-primary-50 transition-colors"
                  >
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-xs text-gray-500 mt-1">Adicionar foto</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Selecione os serviços necessários
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Marque todos os serviços que você precisa
                </p>

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {getServiceList().map((servico) => (
                    <label
                      key={servico}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        servicosSelecionados.includes(servico)
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={servicosSelecionados.includes(servico)}
                        onChange={() => toggleServico(servico)}
                        className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-900">{servico}</span>
                    </label>
                  ))}
                </div>

                {servicosSelecionados.length > 0 && (
                  <div className="mt-4 p-3 bg-primary-50 rounded-lg">
                    <p className="text-sm text-primary-800">
                      <strong>{servicosSelecionados.length}</strong> serviço(s) selecionado(s)
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(2)} className="btn-secondary">Voltar</button>
              <button onClick={() => setStep(4)} className="btn-primary">Próximo</button>
            </div>
          </div>
        )}

        {/* Step 4: Description & urgency */}
        {step === 4 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Detalhes do serviço</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {needsPhoto ? 'Descreva o problema' : 'Observações adicionais (opcional)'}
                </label>
                <textarea
                  className="input-field min-h-[120px]"
                  placeholder={needsPhoto
                    ? 'Descreva o que aconteceu, o que precisa ser reparado...'
                    : 'Alguma informação adicional sobre o serviço?'
                  }
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Urgência</label>
                <div className="space-y-2">
                  {URGENCIAS.map((u) => (
                    <button
                      key={u.value}
                      type="button"
                      onClick={() => setUrgencia(u.value)}
                      className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                        urgencia === u.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full ${
                        u.color === 'green' ? 'bg-green-500' :
                        u.color === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{u.label}</p>
                        <p className="text-xs text-gray-500">{u.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(3)} className="btn-secondary">Voltar</button>
              <button
                onClick={() => setStep(5)}
                disabled={needsPhoto && !descricao}
                className="btn-primary"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Location & confirm */}
        {step === 5 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Localização e confirmação</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Endereço / Região
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Bairro, cidade - Estado"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Oficinas próximas a este endereço serão notificadas
                </p>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h3 className="font-medium text-gray-900">Resumo da solicitação</h3>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Veículo:</span>
                    <span className="text-gray-900">
                      {selectedVeiculo?.fipe_marca} {selectedVeiculo?.fipe_modelo} {selectedVeiculo?.fipe_ano}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tipo:</span>
                    <span className="text-gray-900">{tipoConfig?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Urgência:</span>
                    <span className="text-gray-900">{URGENCIAS.find((u) => u.value === urgencia)?.label}</span>
                  </div>
                  {needsPhoto && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Fotos:</span>
                      <span className="text-gray-900">{fotos.length} foto(s)</span>
                    </div>
                  )}
                  {servicosSelecionados.length > 0 && (
                    <div>
                      <span className="text-gray-500">Serviços:</span>
                      <ul className="mt-1 ml-4 list-disc text-gray-700">
                        {servicosSelecionados.map((s) => (
                          <li key={s} className="text-xs">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {descricao && (
                  <div className="border-t pt-2">
                    <p className="text-sm text-gray-600">{descricao}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(4)} className="btn-secondary">Voltar</button>
              <button onClick={handleSubmit} disabled={!endereco} className="btn-success">
                Enviar Solicitação
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
