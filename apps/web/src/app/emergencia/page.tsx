'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function EmergenciaPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);

  const [fotos, setFotos] = useState<{ file: File; preview: string }[]>([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [descricao, setDescricao] = useState('');
  const [submitted, setSubmitted] = useState(false);

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

  const handleSubmit = () => {
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Fotos enviadas!</h1>
        <p className="text-gray-600 mb-6">
          Oficinas proximas a voce foram notificadas e enviarao orcamentos em breve.
          Voce recebera por email e podera acompanhar pelo app.
        </p>

        <div className="card text-left mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Proximo passo</h2>
          <p className="text-sm text-gray-600 mb-4">
            Registre o outro veiculo envolvido no acidente para trocar informacoes,
            ver orcamentos e entrar em acordo sobre a reparacao.
          </p>
          <button
            onClick={() => router.push('/emergencia/acidente/novo')}
            className="btn-primary w-full"
          >
            Registrar outro veiculo envolvido
          </button>
        </div>

        <button
          onClick={() => router.push('/cadastro?tipo=cliente')}
          className="btn-secondary w-full"
        >
          Criar minha conta para acompanhar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh]">
      {/* Red header */}
      <div className="bg-red-600 text-white py-6">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Acabei de bater!</h1>
              <p className="text-red-100 text-sm">Tire fotos e receba orcamentos rapido</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1">
              <div className={`h-2 rounded-full transition-colors ${s <= step ? 'bg-red-500' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>

        <div className="card">
          {/* Step 1: Photos */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Tire fotos do acidente</h2>
              <p className="text-sm text-gray-500 mb-4">
                Fotografe os danos no seu veiculo e, se possivel, a cena do acidente
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={handlePhotoUpload}
              />

              {fotos.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-16 border-2 border-dashed border-red-300 rounded-xl flex flex-col items-center justify-center hover:border-red-400 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-16 h-16 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-red-600 font-semibold text-lg">Tirar foto ou escolher imagem</p>
                  <p className="text-sm text-gray-500 mt-1">Toque para abrir a camera</p>
                </button>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {fotos.map((foto, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden relative group">
                        <img src={foto.preview} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
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
                      className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-red-400 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs text-gray-500">Mais fotos</span>
                    </button>
                  </div>
                </>
              )}

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descreva o que aconteceu (opcional)
                </label>
                <textarea
                  className="input-field min-h-[80px]"
                  placeholder="Ex: Bati na traseira do carro da frente no semaforo..."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setStep(2)}
                  disabled={fotos.length === 0}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Proximo
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Contact info */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Seus dados</h2>
              <p className="text-sm text-gray-500 mb-4">Para que as oficinas possam entrar em contato</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input type="text" className="input-field" placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" className="input-field" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
                  <input type="tel" className="input-field" placeholder="(11) 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(1)} className="btn-secondary">Voltar</button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!nome || !email || !telefone}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Proximo
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Location & send */}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Localizacao</h2>
              <p className="text-sm text-gray-500 mb-4">Onde voce esta? Oficinas proximas serao notificadas</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereco / Regiao</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Rua, bairro ou ponto de referencia"
                    value={localizacao}
                    onChange={(e) => setLocalizacao(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setLocalizacao('Localizacao atual detectada')}
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm text-primary-600 hover:bg-primary-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Usar minha localizacao atual
                </button>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4 mt-6 space-y-2">
                <h3 className="font-medium text-gray-900 text-sm">Resumo</h3>
                <p className="text-xs text-gray-600">{fotos.length} foto(s) do acidente</p>
                <p className="text-xs text-gray-600">{nome} - {telefone}</p>
                {descricao && <p className="text-xs text-gray-600">{descricao}</p>}
              </div>

              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(2)} className="btn-secondary">Voltar</button>
                <button
                  onClick={handleSubmit}
                  disabled={!localizacao}
                  className="bg-red-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 text-lg"
                >
                  Enviar para oficinas!
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
