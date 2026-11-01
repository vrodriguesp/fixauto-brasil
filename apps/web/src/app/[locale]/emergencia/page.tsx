'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, rota } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { salvarTokenEmergencia } from '@/lib/emergencia-token';
import { compressImage } from '@/lib/image-compress';
import { textoErroApi } from '@/lib/erro-api';
import { SeguroReparoCampos, ProximosPassosSeguro, SEGURO_VAZIO, type ValorSeguro } from '@/components/emergencia/SeguroReparo';
import EnderecoAutocomplete from '@/components/forms/EnderecoAutocomplete';
import { salvarRascunhoEmergencia, lerRascunhoEmergencia, apagarRascunhoEmergencia } from '@/lib/rascunho-emergencia';

export default function EmergenciaPage() {
  const t = useTranslations('emergencia');
  const tErros = useTranslations('erros');
  const [contaExistente, setContaExistente] = useState(false);
  const locale = useLocale();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { user, isLoggedIn, signIn } = useAuth();
  // e-mail que ja tem conta: entrar aqui mesmo (ou pedir nova senha) sem perder o formulario
  const [senhaLogin, setSenhaLogin] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erroLogin, setErroLogin] = useState('');
  const [resetEnviado, setResetEnviado] = useState(false);
  const [enviarAposLogin, setEnviarAposLogin] = useState(false);
  const [rascunho, setRascunho] = useState<'' | 'restaurado' | 'semFotos'>('');
  const [fotosNaoGuardadas, setFotosNaoGuardadas] = useState(false);
  const loginRef = useRef<HTMLDivElement>(null);

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
  // Mesmo padrao de cliente/nova-solicitacao: comeca com um default (SP) e
  // so sobrescreve se o navegador conceder geolocalizacao - sem isso, toda
  // emergencia gravava a mesma coordenada fixa, e "oficinas proximas"
  // notificava sempre ao redor de Sao Paulo pra qualquer usuario fora do
  // Brasil que negasse a permissao (ex: piloto na Estonia).
  // Sem localizacao padrao: um ponto fixo (antes, Sao Paulo) mandaria o aviso
  // as oficinas erradas. Sem GPS nem endereco encontrado, pede o endereco.
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  // pais do acidente: decide numero de emergencia, formulario e dicas de seguro
  const [paisAcidente, setPaisAcidente] = useState<string | null>(null);
  useEffect(() => {
    if (!coords) return;
    fetch(`/api/geocode?lat=${coords.lat}&lon=${coords.lon}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.paisCodigo) setPaisAcidente(d.paisCodigo); }).catch(() => {});
  }, [coords]);
  const [geoResolved, setGeoResolved] = useState(false);
  const [tipoAcidente, setTipoAcidente] = useState<'eu_causei' | 'outro_causou' | 'sem_outro'>('outro_causou');
  const [placa, setPlaca] = useState('');
  // quem paga o reparo (opcional) - a oficina ve no pedido
  const [seguro, setSeguro] = useState<ValorSeguro>(SEGURO_VAZIO);
  const [veiculoInfo, setVeiculoInfo] = useState<{ marca: string; modelo: string; ano: string; cor: string } | null>(null);
  const [buscandoPlaca, setBuscandoPlaca] = useState(false);
  const [placaNaoEncontrada, setPlacaNaoEncontrada] = useState(false);


  const buscarPlaca = async (p: string) => {
    const clean = p.replace(/[^a-zA-Z0-9]/g, '');
    // A consulta de placa usa uma base so do Brasil: fora da versao
    // brasileira ela sempre falharia (placas da Estonia tem outro formato)
    // base so do Brasil: decide pelo FORMATO da placa brasileira, nao pelo idioma
    if (!/^[A-Za-z]{3}\d[A-Za-z0-9]\d{2}$/.test(clean)) return;
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

  // volta do login/nova senha: restaura o que a pessoa ja tinha preenchido
  useEffect(() => {
    lerRascunhoEmergencia().then((r) => {
      if (!r) return;
      const d = r.dados;
      setNome(d.nome || ''); setEmail(d.email || ''); setTelefone(d.telefone || '');
      setDescricao(d.descricao || ''); setPlaca(d.placa || ''); setTipoAcidente(d.tipoAcidente || 'outro_causou');
      if (d.localizacao) setLocalizacao(d.localizacao);
      if (d.coords) { setCoords(d.coords); setGeoResolved(!!d.geoResolved); }
      setVeiculoInfo(d.veiculoInfo || null);
      if (d.seguro && typeof d.seguro === 'object') setSeguro({ ...SEGURO_VAZIO, ...(d.seguro as ValorSeguro) });
      const fotosOk = !!r.fotos && r.fotos.length >= (d.qtdFotos || 0);
      if (r.fotos?.length) setFotos(r.fotos.map((file) => ({ file, preview: URL.createObjectURL(file) })));
      setRascunho(fotosOk ? 'restaurado' : 'semFotos');
      // com as fotos de volta vai direto ao envio; sem elas, ao passo das fotos
      setStep(fotosOk ? 3 : 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-detect location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          setGeoResolved(true);
          if (!localizacao) setLocalizacao(t('locationAutoDetected'));
        },
        () => { /* sem permissao ou sem sinal - handleSubmit tenta geocodificar o endereco digitado */ },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback quando o navegador nega geolocalizacao: geocodifica o
  // endereco digitado via Nominatim (gratuito, mundial) em vez de deixar a
  // coordenada presa no default de Sao Paulo/Brasil.
  const resolveLocation = async (): Promise<{ lat: number; lon: number } | null> => {
    if (geoResolved || !localizacao) return coords;
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(localizacao)}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          return { lat: data.latitude, lon: data.longitude };
        }
      }
    } catch {
      // sem conexao com a geocodificacao: segue sem coordenadas
    }
    return coords;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const picked = Array.from(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    const compressed = await Promise.all(picked.map((f) => compressImage(f)));
    const newFotos = compressed.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFotos((prev) => [...prev, ...newFotos]);
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

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const loc = await resolveLocation();
      if (!loc) {
        setError(t('erroLocalizacao'));
        setSubmitting(false);
        return;
      }

      // Tudo no servidor numa chamada so: acidente, fotos, conta (se nao
      // estiver logado), solicitacao e aviso as oficinas proximas.
      const form = new FormData();
      form.append('dados', JSON.stringify({
        nome,
        email,
        telefone,
        idioma: locale,
        tipoAcidente,
        descricao,
        endereco: localizacao,
        latitude: loc.lat,
        longitude: loc.lon,
        placa: placa || null,
        veiculoInfo: veiculoInfo || null,
        ...seguro,
      }));
      fotos.forEach((f) => form.append('fotos', f.file));
      const res = await fetch('/api/emergencia', { method: 'POST', body: form });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.id) {
        setError(textoErroApi(tErros, res.status, r));
        const existe = r?.codigo === 'CONTA_EXISTENTE';
        setContaExistente(existe);
        if (existe) {
          const ok = await salvarRascunhoEmergencia({ nome, email, telefone, descricao, placa, tipoAcidente, localizacao, coords: loc, geoResolved: true, veiculoInfo, seguro }, fotos.map((f) => f.file));
          setFotosNaoGuardadas(!ok);
          setTimeout(() => loginRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        }
        setSubmitting(false);
        return;
      }
      salvarTokenEmergencia(r.id, r.token);
      apagarRascunhoEmergencia();
      setContaExistente(false);
      setEmergenciaId(r.id);

      setSubmitting(false);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError(tErros('GENERICO'));
      setSubmitting(false);
    }
  };

  // login aqui mesmo; o envio segue sozinho quando a sessao estiver pronta
  const entrarEEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senhaLogin || entrando) return;
    setEntrando(true);
    setErroLogin('');
    const { error: erroAuth } = await signIn(email, senhaLogin);
    setEntrando(false);
    if (erroAuth) {
      setErroLogin(erroAuth === 'email_not_confirmed' ? t('loginNaoConfirmado') : erroAuth === 'over_request_rate_limit' ? tErros('MUITAS_TENTATIVAS') : t('loginErro'));
      return;
    }
    setSenhaLogin('');
    setEnviarAposLogin(true);
  };
  useEffect(() => {
    if (!enviarAposLogin || !isLoggedIn) return;
    setEnviarAposLogin(false);
    setError('');
    handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enviarAposLogin, isLoggedIn]);

  const esqueciSenha = async () => {
    setErroLogin('');
    // o rascunho ja foi guardado no aviso de conta existente; guarda de novo (pode ter mudado)
    const ok = await salvarRascunhoEmergencia({ nome, email, telefone, descricao, placa, tipoAcidente, localizacao, coords, geoResolved, veiculoInfo, seguro }, fotos.map((f) => f.file));
    setFotosNaoGuardadas(!ok);
    await fetch('/api/esqueci-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, locale }) }).catch(() => {});
    setResetEnviado(true);
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('successTitle')}</h1>
        <p className="text-gray-600 mb-6">
          {t('successText')}
        </p>

        <ProximosPassosSeguro pagamento={seguro.pagamento_reparo} tipoAcidente={tipoAcidente} pais={paisAcidente} />

        {tipoAcidente !== 'sem_outro' && (
          <div className="card text-left mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">{t('nextStepTitle')}</h2>
            <p className="text-sm text-gray-600 mb-4">
              {t('nextStepText')}
            </p>
            <button
              onClick={() => router.push(rota('/emergencia/acidente/[id]', { id: emergenciaId }))}
              className="btn-primary w-full"
            >
              {t('registerOtherVehicleBtn')}
            </button>
          </div>
        )}

        {isLoggedIn ? (
          <button onClick={() => router.push('/cliente/dashboard')} className="btn-secondary w-full">
            {t('goToDashboardBtn')}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">{t('createAccountText')}</p>
            <button onClick={() => router.push(rota('/cadastro', undefined, { tipo: 'cliente' }))} className="btn-primary w-full">
              {t('createAccountBtn')}
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
              <h1 className="text-2xl font-bold">{t('headerTitle')}</h1>
              <p className="text-white text-sm">{t('headerSubtitle')}</p>
            </div>
          </div>
          {isLoggedIn && (
            <div className="mt-3 bg-white/10 rounded-lg px-3 py-2 text-sm">
              {t.rich('loggedInAs', { nome: user?.nome ?? '', strong: (chunks) => <strong>{chunks}</strong> })}
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

        {rascunho && !contaExistente && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6" role="status" data-testid="rascunho-restaurado">
            <p className="text-sm text-blue-900">{rascunho === 'restaurado' ? t('rascunhoRestaurado') : t('rascunhoSemFotos')}</p>
          </div>
        )}

        {error && !(contaExistente && !isLoggedIn) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {contaExistente && !isLoggedIn && (
          // e-mail de conta existente: entrar aqui mesmo; nada do que foi preenchido se perde.
          // Para quem nao e o dono do e-mail so aparece "este e-mail ja tem conta".
          <div ref={loginRef} className="card border-2 border-amber-300 mb-6" data-testid="login-emergencia">
            <h2 className="font-semibold text-gray-900 mb-1">{t('loginTitulo')}</h2>
            <p className="text-sm text-gray-700 mb-4">{t('loginTexto')}</p>
            <form onSubmit={entrarEEnviar} className="space-y-3">
              <div>
                <label htmlFor="emerg-login-email" className="block text-sm font-medium text-gray-700 mb-1">{t('emailLabel')}</label>
                <input id="emerg-login-email" type="email" className="input-field bg-gray-50" value={email} readOnly autoComplete="username" />
              </div>
              <div>
                <label htmlFor="emerg-login-senha" className="block text-sm font-medium text-gray-700 mb-1">{t('loginSenha')}</label>
                <input id="emerg-login-senha" type="password" className="input-field" value={senhaLogin} onChange={(e) => setSenhaLogin(e.target.value)} autoComplete="current-password" />
              </div>
              {erroLogin && <p className="text-sm text-red-700" role="alert">{erroLogin}</p>}
              <button type="submit" disabled={!senhaLogin || entrando || submitting} className="bg-red-600 text-white w-full px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                {entrando || submitting ? t('sendingBtn') : t('loginEnviar')}
              </button>
            </form>
            {resetEnviado ? (
              <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3 mt-4" role="status" data-testid="reset-enviado">{t('resetEnviado')}</p>
            ) : (
              <button type="button" onClick={esqueciSenha} className="mt-4 min-h-[44px] text-sm font-medium text-primary-700 hover:underline">{t('loginEsqueci')}</button>
            )}
            <p className="text-xs text-gray-500 mt-2">{fotosNaoGuardadas ? t('rascunhoFotosNaoGuardadas') : t('rascunhoGuardado')}</p>
          </div>
        )}

        <div className="card">
          <p className="text-xs text-gray-500 mb-3"><span className="text-red-600" aria-hidden="true">*</span> {t('camposObrigatorios')}</p>
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('step1Title')} <span className="text-red-600" aria-hidden="true">*</span></h2>
              <p className="text-sm text-gray-500 mb-1">
                {t('step1Subtitle')}
              </p>
              <p className="text-xs text-gray-500 mb-4">{t('fotoDica')}</p>

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
                    <p className="text-red-600 font-semibold">{t('takePhotoBtn')}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 border border-gray-300 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-gray-700 font-medium">{t('chooseGalleryBtn')}</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {fotos.map((foto, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden relative group">
                      <img src={foto.preview} alt={t('photoAlt', { number: i + 1 })} className="w-full h-full object-cover" />
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
                      <span className="text-[10px] text-gray-500">{t('cameraLabel')}</span>
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-full aspect-video border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-gray-400 transition-colors">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-[10px] text-gray-500">{t('galleryLabel')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Placa lookup */}
              <div className="mt-4">
                <label htmlFor="cc5ef-1" className="block text-sm font-medium text-gray-700 mb-1">{t('plateLabel')}</label>
                <div className="flex gap-2">
                  <input id="cc5ef-1"
                    type="text"
                    className="input-field flex-1 uppercase"
                    placeholder={t('platePlaceholder')}
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
                      {t('vehicleYearColor', { ano: veiculoInfo.ano, cor: veiculoInfo.cor })}
                    </p>
                  </div>
                )}
                {placaNaoEncontrada && (
                  <div className="mt-3">
                    <p className="text-xs text-orange-600 mb-2">{t('plateNotFoundText')}</p>
                    <input
                      type="text"
                      className="input-field"
                      placeholder={t('plateNotFoundPlaceholder')}
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
                <label htmlFor="cc5ef-2" className="block text-sm font-medium text-gray-700 mb-1">{t('descriptionLabel')}</label>
                <textarea id="cc5ef-2" className="input-field min-h-[80px]" placeholder={t('descriptionPlaceholder')}
                  value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('whatHappenedLabel')}</label>
                <div className="space-y-2">
                  {[
                    { value: 'eu_causei', label: t('optionEuCauseiLabel'), desc: t('optionEuCauseiDesc') },
                    { value: 'outro_causou', label: t('optionOutroCausouLabel'), desc: t('optionOutroCausouDesc') },
                    { value: 'sem_outro', label: t('optionSemOutroLabel'), desc: t('optionSemOutroDesc') },
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
                        className="accent-red-600 mt-0.5 w-5 h-5 shrink-0"
                      />
                      <div>
                        <span className="text-sm text-gray-900 font-medium">{opt.label}</span>
                        <p className="text-xs text-gray-600 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button onClick={handleNext} disabled={fotos.length === 0}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                  {t('nextBtn')}
                </button>
              </div>
            </div>
          )}

          {step === 2 && !isLoggedIn && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('step2Title')}</h2>
              <p className="text-sm text-gray-500 mb-4">{t('step2Subtitle')}</p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="cc5ef-3" className="block text-sm font-medium text-gray-700 mb-1">{t('nameLabel')} <span className="text-red-600" aria-hidden="true">*</span></label>
                  <input id="cc5ef-3" type="text" required aria-required="true" autoComplete="name" className="input-field" placeholder={t('namePlaceholder')} value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="cc5ef-4" className="block text-sm font-medium text-gray-700 mb-1">{t('emailLabel')} <span className="text-red-600" aria-hidden="true">*</span></label>
                  <input id="cc5ef-4" type="email" required aria-required="true" autoComplete="email" className="input-field" placeholder={t('emailPlaceholder')} value={email} onChange={(e) => { setEmail(e.target.value); setContaExistente(false); setResetEnviado(false); }} />
                </div>
                <div>
                  {/* telefone opcional (pedido do dono 31/10) */}
                  <label htmlFor="cc5ef-5" className="block text-sm font-medium text-gray-700 mb-1">{t('phoneLabel')} <span className="font-normal text-gray-500">({t('opcional')})</span></label>
                  <input id="cc5ef-5" type="tel" autoComplete="tel" className="input-field" placeholder={t('phonePlaceholder')} value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(1)} className="btn-secondary">{t('backBtn')}</button>
                <button onClick={() => setStep(3)} disabled={!nome.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                  {t('nextBtn')}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('step3Title')}</h2>
              <p className="text-sm text-gray-500 mb-4">{t('step3Subtitle')}</p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="cc5ef-6" className="block text-sm font-medium text-gray-700 mb-1">{t('addressLabel')} <span className="text-red-600" aria-hidden="true">*</span></label>
                  <EnderecoAutocomplete id="cc5ef-6"
                    value={localizacao}
                    onChange={setLocalizacao}
                    placeholder={t('addressPlaceholder')}
                    perto={coords}
                    onSelect={(s) => { setLocalizacao(s.rotulo); setCoords({ lat: s.latitude, lon: s.longitude }); setGeoResolved(true); }}
                  />
                </div>
                <button type="button" onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setGeoResolved(true); setLocalizacao(t('locationCurrentDetected')); },
                      () => setLocalizacao(''),
                      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
                    );
                  }
                }} className="w-full p-3 border border-gray-300 rounded-lg text-sm text-primary-600 hover:bg-primary-50 flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  {t('useCurrentLocationBtn')}
                </button>
              </div>

              <div className="mt-6">
                <SeguroReparoCampos valor={seguro} onChange={setSeguro} tipoAcidente={tipoAcidente} pais={paisAcidente} />
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mt-6 space-y-2">
                <h3 className="font-medium text-gray-900 text-sm">{t('summaryTitle')}</h3>
                <p className="text-xs text-gray-600">{t('summaryPhotos', { count: fotos.length })}</p>
                <p className="text-xs text-gray-600">{[nome, telefone].filter(Boolean).join(' - ')}</p>
                {descricao && <p className="text-xs text-gray-600">{descricao}</p>}
              </div>

              <div className="flex justify-between mt-6">
                <button onClick={handleBack} className="btn-secondary">{t('backBtn')}</button>
                <button onClick={handleSubmit} disabled={!localizacao || submitting}
                  className="bg-red-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 text-lg">
                  {submitting ? t('sendingBtn') : t('sendBtn')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
