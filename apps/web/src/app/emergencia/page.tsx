'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function EmergenciaPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { user, isLoggedIn } = useAuth();

  const [step, setStep] = useState(1);
  const [fotos, setFotos] = useState<{ file: File; preview: string }[]>([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [descricao, setDescricao] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [emergenciaId, setEmergenciaId] = useState<string | null>(null);
  const [coords, setCoords] = useState({ lat: -23.5505, lon: -46.6333 });
  const [tipoAcidente, setTipoAcidente] = useState<'eu_causei' | 'outro_causou' | 'sem_outro'>('outro_causou');
  const [placa, setPlaca] = useState('');
  const [veiculoInfo, setVeiculoInfo] = useState<{ marca: string; modelo: string; ano: string; cor: string } | null>(null);
  const [buscandoPlaca, setBuscandoPlaca] = useState(false);
  const [placaNaoEncontrada, setPlacaNaoEncontrada] = useState(false);


  const buscarPlaca = async (p: string) => {
    const clean = p.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length < 7) return;
    setBuscandoPlaca(true);
    setPlacaNaoEncontrada(false);
    setVeiculoInfo(null);
    try {
      const res = await fetch('/api/consultar-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: clean }),
      });
      if (res.ok) {
        const data = await res.json();
        setVeiculoInfo({ marca: data.marca, modelo: data.modelo, ano: data.ano, cor: data.cor });
      } else {
        setPlacaNaoEncontrada(true);
      }
    } catch {
      setPlacaNaoEncontrada(true);
    }
    setBuscandoPlaca(false);
  };

  useEffect(() => {
    if (isLoggedIn && user) {
      setNome(user.nome);
      setEmail(user.email);
      setTelefone(user.telefone || '');
    }
  }, [isLoggedIn, user]);

  // Auto-detect location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          if (!localizacao) setLocalizacao('Localização detectada automaticamente');
        },
        () => { /* fallback to default SP coords */ }
      );
    }
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFotos = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFotos((prev) => [...prev, ...newFotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setFotos((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleNext = () => {
    if (isLoggedIn && step === 1) setStep(3);
    else setStep(step + 1);
  };

  const handleBack = () => {
    if (isLoggedIn && step === 3) setStep(1);
    else setStep(step - 1);
  };

  const uploadPhotos = async (emergId: string) => {
    const formData = new FormData();
    formData.append('emergenciaId', emergId);
    fotos.forEach((f) => formData.append('fotos', f.file));

    const res = await fetch('/api/upload-emergencia', { method: 'POST', body: formData });
    const data = await res.json();
    return (data.urls as string[]) || [];
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      // 1. Create emergencia
      const { data: emergencia, error: emergError } = await supabase
        .from('emergencias')
        .insert({
          profile_id: user?.id || null,
          nome,
          email,
          telefone,
          descricao: `[TIPO:${tipoAcidente}] ${descricao || 'Emergência - Colisão'}`,
          endereco: localizacao,
          latitude: coords.lat,
          longitude: coords.lon,
          prioridade: 'urgente',
        })
        .select()
        .single();

      if (emergError || !emergencia) {
        setError(emergError?.message || 'Erro ao registrar emergência');
        setSubmitting(false);
        return;
      }

      setEmergenciaId(emergencia.id);

      // 2. Upload photos
      const photoUrls = fotos.length > 0 ? await uploadPhotos(emergencia.id) : [];

      // 3. Create account (if not logged in) + solicitação via server API
      const solRes = await fetch('/api/criar-solicitacao-emergencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergenciaId: emergencia.id,
          clienteId: user?.id || null,
          nome,
          email,
          telefone,
          tipoAcidente,
          descricao: `[TIPO:${tipoAcidente}] ${descricao || 'Emergência - Colisão registrada pelo fluxo "Acabei de bater"'}`,
          latitude: coords.lat,
          longitude: coords.lon,
          endereco: localizacao,
          photoUrls,
          placa: placa || null,
          veiculoInfo: veiculoInfo || null,
        }),
      });
      if (!solRes.ok) {
        console.error('[emergencia] Criar solicitacao failed:', await solRes.text());
      }

      // 4. NOTIFY nearby oficinas (use default SP coords as fallback)
      const notifyRes = await fetch('/api/notificar-oficinas-emergencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergenciaId: emergencia.id,
          latitude: coords.lat,
          longitude: coords.lon,
        }),
      });
      if (!notifyRes.ok) {
        console.error('[emergencia] Notify failed:', await notifyRes.text());
      }

      setSubmitting(false);
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Emergência registrada!</h1>
        <p className="text-gray-600 mb-6">
          Oficinas próximas foram notificadas e enviarão orçamentos em breve.
        </p>

        {tipoAcidente !== 'sem_outro' && (
          <div className="card text-left mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Próximo passo</h2>
            <p className="text-sm text-gray-600 mb-4">
              Registre o outro veículo envolvido no acidente para trocar informações.
            </p>
            <button
              onClick={() => router.push(`/emergencia/acidente/${emergenciaId}`)}
              className="btn-primary w-full"
            >
              Registrar outro veículo envolvido
            </button>
          </div>
        )}

        {isLoggedIn ? (
          <button onClick={() => router.push('/cliente/dashboard')} className="btn-secondary w-full">
            Ir para o Dashboard
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Crie uma conta para acompanhar os orçamentos e escolher uma oficina.</p>
            <button onClick={() => router.push('/cadastro?tipo=cliente')} className="btn-primary w-full">
              Criar minha conta
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[80vh]">
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
              <p className="text-red-100 text-sm">Tire fotos e receba orçamentos rápido</p>
            </div>
          </div>
          {isLoggedIn && (
            <div className="mt-3 bg-white/10 rounded-lg px-3 py-2 text-sm">
              Logado como <strong>{user?.nome}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-8">
          {(isLoggedIn ? [1, 3] : [1, 2, 3]).map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-2 rounded-full transition-colors ${
                (isLoggedIn ? (step >= s) : (i + 1 <= (step === 3 ? 3 : step)))
                  ? 'bg-red-500' : 'bg-gray-200'
              }`} />
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="card">
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Fotos do acidente</h2>
              <p className="text-sm text-gray-500 mb-4">
                Tire fotos agora ou escolha da galeria
              </p>

              {/* Camera input (capture) */}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
              {/* Gallery input (no capture) */}
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />

              {fotos.length === 0 ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full py-12 border-2 border-dashed border-red-300 rounded-xl flex flex-col items-center justify-center hover:border-red-400 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-12 h-12 text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-red-600 font-semibold">Tirar foto agora</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 border border-gray-300 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-gray-700 font-medium">Escolher da galeria</span>
                  </button>
                </div>
              ) : (
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
                  <div className="space-y-2">
                    <button type="button" onClick={() => cameraInputRef.current?.click()}
                      className="w-full aspect-video border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-red-400 transition-colors">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      </svg>
                      <span className="text-[10px] text-gray-500">Câmera</span>
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-full aspect-video border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-gray-400 transition-colors">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-[10px] text-gray-500">Galeria</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Placa lookup */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Placa do seu veículo</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input-field flex-1 uppercase"
                    placeholder="ABC1D23"
                    maxLength={8}
                    value={placa}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setPlaca(v);
                      if (v.replace(/[^a-zA-Z0-9]/g, '').length === 7) buscarPlaca(v);
                    }}
                  />
                  {buscandoPlaca && (
                    <div className="flex items-center">
                      <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {veiculoInfo && (
                  <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-green-800">
                      {veiculoInfo.marca} {veiculoInfo.modelo}
                    </p>
                    <p className="text-xs text-green-600">
                      Ano: {veiculoInfo.ano} | Cor: {veiculoInfo.cor}
                    </p>
                  </div>
                )}
                {placaNaoEncontrada && (
                  <div className="mt-3">
                    <p className="text-xs text-orange-600 mb-2">Placa não encontrada. Digite marca e modelo:</p>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ex: Fiat Argo"
                      onChange={(e) => {
                        const val = e.target.value;
                        const parts = val.split(' ');
                        setVeiculoInfo({ marca: parts[0] || val, modelo: parts.slice(1).join(' ') || '', ano: '', cor: '' });
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descreva o que aconteceu (opcional)</label>
                <textarea className="input-field min-h-[80px]" placeholder="Ex: Bati na traseira do carro da frente no semáforo..."
                  value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">O que aconteceu?</label>
                <div className="space-y-2">
                  {[
                    { value: 'eu_causei', label: 'Eu causei o acidente', desc: 'Você é o responsável pelo reparo do outro veículo' },
                    { value: 'outro_causou', label: 'O outro motorista causou', desc: 'Você é a vítima e receberá orçamentos para reparo' },
                    { value: 'sem_outro', label: 'Sem outro envolvido', desc: 'Ex: bateu no poste, muro, etc.' },
                  ].map((opt) => (
                    <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      tipoAcidente === opt.value ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio"
                        name="tipoAcidente"
                        value={opt.value}
                        checked={tipoAcidente === opt.value}
                        onChange={(e) => setTipoAcidente(e.target.value as 'eu_causei' | 'outro_causou' | 'sem_outro')}
                        className="accent-red-600 mt-0.5"
                      />
                      <div>
                        <span className="text-sm text-gray-900 font-medium">{opt.label}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button onClick={handleNext} disabled={fotos.length === 0}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                  Próximo
                </button>
              </div>
            </div>
          )}

          {step === 2 && !isLoggedIn && (
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
                <button onClick={() => setStep(3)} disabled={!nome || !email || !telefone}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                  Próximo
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Localização</h2>
              <p className="text-sm text-gray-500 mb-4">Onde você está?</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereço / Região</label>
                  <input type="text" className="input-field" placeholder="Rua, bairro ou ponto de referência"
                    value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} />
                </div>
                <button type="button" onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setLocalizacao('Localização atual detectada'); },
                      () => setLocalizacao('São Paulo, SP')
                    );
                  }
                }} className="w-full p-3 border border-gray-300 rounded-lg text-sm text-primary-600 hover:bg-primary-50 flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  Usar minha localização atual
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mt-6 space-y-2">
                <h3 className="font-medium text-gray-900 text-sm">Resumo</h3>
                <p className="text-xs text-gray-600">{fotos.length} foto(s) do acidente</p>
                <p className="text-xs text-gray-600">{nome} - {telefone}</p>
                {descricao && <p className="text-xs text-gray-600">{descricao}</p>}
              </div>

              <div className="flex justify-between mt-6">
                <button onClick={handleBack} className="btn-secondary">Voltar</button>
                <button onClick={handleSubmit} disabled={!localizacao || submitting}
                  className="bg-red-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 text-lg">
                  {submitting ? 'Enviando...' : 'Enviar para oficinas!'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
