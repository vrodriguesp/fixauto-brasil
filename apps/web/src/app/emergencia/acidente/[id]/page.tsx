'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

interface Mensagem {
  id: string;
  remetente: 'eu' | 'outro';
  texto: string;
  hora: string;
}

export default function AcidenteRegistroPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'registro' | 'chat' | 'orcamentos'>('registro');

  // Other vehicle registration
  const [outroNome, setOutroNome] = useState('');
  const [outroTelefone, setOutroTelefone] = useState('');
  const [outroEmail, setOutroEmail] = useState('');
  const [outroPlaca, setOutroPlaca] = useState('');
  const [outroVeiculo, setOutroVeiculo] = useState('');
  const [fotosOutro, setFotosOutro] = useState<{ file: File; preview: string }[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [registered, setRegistered] = useState(false);

  // Chat
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    { id: '1', remetente: 'outro', texto: 'Ola, vi que voce registrou nosso acidente. Podemos conversar sobre os orcamentos?', hora: '14:30' },
  ]);
  const [novaMensagem, setNovaMensagem] = useState('');

  // Mock orcamentos
  const mockOrcamentos = [
    { oficina: 'Carlos Auto Mecanica', valor: 'R$ 2.200,00', prazo: '5 dias', id: '1' },
    { oficina: 'Ana Funilaria & Pintura', valor: 'R$ 2.850,00', prazo: '4 dias', id: '2' },
    { oficina: 'Pedro Auto Center', valor: 'R$ 1.900,00', prazo: '7 dias', id: '3' },
  ];

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFotos = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFotosOutro((prev) => [...prev, ...newFotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRegister = () => {
    setRegistered(true);
  };

  const sendMessage = () => {
    if (!novaMensagem.trim()) return;
    const now = new Date();
    setMensagens([...mensagens, {
      id: `m-${Date.now()}`,
      remetente: 'eu',
      texto: novaMensagem,
      hora: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
    }]);
    setNovaMensagem('');

    // Simulate response
    setTimeout(() => {
      setMensagens((prev) => [...prev, {
        id: `m-${Date.now()}`,
        remetente: 'outro',
        texto: 'Ok, vou analisar os orcamentos e te retorno.',
        hora: `${now.getHours()}:${String(now.getMinutes() + 1).padStart(2, '0')}`,
      }]);
    }, 2000);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/emergencia" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registro do Acidente</h1>
          <p className="text-gray-600 text-sm">Registre o outro veiculo e acompanhe os orcamentos</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setStep('registro')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            step === 'registro' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'
          }`}
        >
          Outro Veiculo
        </button>
        <button
          onClick={() => setStep('chat')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            step === 'chat' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'
          }`}
        >
          Mensagens
        </button>
        <button
          onClick={() => setStep('orcamentos')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            step === 'orcamentos' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'
          }`}
        >
          Orcamentos
        </button>
      </div>

      {/* Registration tab */}
      {step === 'registro' && !registered && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados do outro veiculo</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do outro motorista</label>
              <input type="text" className="input-field" placeholder="Nome completo" value={outroNome} onChange={(e) => setOutroNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input type="tel" className="input-field" placeholder="(11) 99999-0000" value={outroTelefone} onChange={(e) => setOutroTelefone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (opcional)</label>
                <input type="email" className="input-field" placeholder="email@email.com" value={outroEmail} onChange={(e) => setOutroEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Placa do veiculo</label>
                <input type="text" className="input-field" placeholder="ABC-1234" value={outroPlaca} onChange={(e) => setOutroPlaca(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Veiculo (marca/modelo)</label>
                <input type="text" className="input-field" placeholder="Ex: Fiat Argo" value={outroVeiculo} onChange={(e) => setOutroVeiculo(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fotos do outro veiculo</label>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
              <div className="flex gap-3">
                {fotosOutro.map((foto, i) => (
                  <div key={i} className="w-20 h-20 rounded-lg overflow-hidden">
                    <img src={foto.preview} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-primary-400"
                >
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
              <textarea
                className="input-field min-h-[80px]"
                placeholder="Detalhes sobre o acidente, acordo feito no local..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={handleRegister}
            disabled={!outroNome || !outroPlaca}
            className="btn-primary w-full mt-6"
          >
            Registrar outro veiculo
          </button>
        </div>
      )}

      {step === 'registro' && registered && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Veiculo registrado</p>
              <p className="text-sm text-gray-500">O outro motorista foi notificado</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Motorista:</span>
              <span className="text-gray-900">{outroNome}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Veiculo:</span>
              <span className="text-gray-900">{outroVeiculo || 'Nao informado'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Placa:</span>
              <span className="text-gray-900">{outroPlaca}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Telefone:</span>
              <span className="text-gray-900">{outroTelefone || 'Nao informado'}</span>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={() => setStep('chat')} className="btn-primary flex-1">
              Enviar mensagem
            </button>
            <button onClick={() => setStep('orcamentos')} className="btn-secondary flex-1">
              Ver orcamentos
            </button>
          </div>
        </div>
      )}

      {/* Chat tab */}
      {step === 'chat' && (
        <div className="card !p-0 overflow-hidden">
          <div className="bg-gray-50 p-4 border-b">
            <p className="font-medium text-gray-900">{outroNome || 'Outro motorista'}</p>
            <p className="text-xs text-gray-500">{outroVeiculo || 'Veiculo'} - {outroPlaca || 'Sem placa'}</p>
          </div>

          <div className="h-[400px] overflow-y-auto p-4 space-y-3">
            {mensagens.map((msg) => (
              <div key={msg.id} className={`flex ${msg.remetente === 'eu' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                  msg.remetente === 'eu'
                    ? 'bg-primary-600 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-900 rounded-bl-md'
                }`}>
                  <p className="text-sm">{msg.texto}</p>
                  <p className={`text-xs mt-1 ${msg.remetente === 'eu' ? 'text-primary-200' : 'text-gray-400'}`}>
                    {msg.hora}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t flex gap-2">
            <input
              type="text"
              className="input-field flex-1"
              placeholder="Digite uma mensagem..."
              value={novaMensagem}
              onChange={(e) => setNovaMensagem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage} className="btn-primary !px-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Orcamentos tab */}
      {step === 'orcamentos' && (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              Compartilhe esses orcamentos com o outro motorista para entrar em acordo
              sobre qual oficina usar para a reparacao.
            </p>
          </div>

          {mockOrcamentos.map((orc) => (
            <div key={orc.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{orc.oficina}</h3>
                  <p className="text-sm text-gray-500">Prazo: {orc.prazo}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-900">{orc.valor}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="btn-success flex-1 !py-2 text-sm">
                  Aceitar
                </button>
                <button
                  onClick={() => { setStep('chat'); setNovaMensagem(`O que acha do orcamento da ${orc.oficina} por ${orc.valor}?`); }}
                  className="btn-secondary flex-1 !py-2 text-sm"
                >
                  Discutir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
