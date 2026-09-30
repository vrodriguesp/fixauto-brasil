'use client';

import { Suspense, useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { textoErroApi } from '@/lib/erro-api';
import { TIPOS_SERVICO } from '@fixauto/shared';
import { buscarEnderecoPorCep, formatCep, cepEstaCompleto } from '@/lib/cep';

export default function CadastroPageWrapper() {
  const t = useTranslations('cadastro');
  return (
    <Suspense fallback={<div className="min-h-[80vh] flex items-center justify-center"><p>{t('carregando')}</p></div>}>
      <CadastroPage />
    </Suspense>
  );
}

function CadastroPage() {
  const t = useTranslations('cadastro');
  const tc = useTranslations('constants');
  const te = useTranslations('erros');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const tipoParam = searchParams.get('tipo') as 'cliente' | 'oficina' | 'loja_pecas' | null;

  const [userType, setUserType] = useState<'cliente' | 'oficina' | 'loja_pecas' | null>(tipoParam);
  const [step, setStep] = useState(tipoParam ? 2 : 1);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  // oficina/loja: declara ser responsavel pela empresa e estar ciente de
  // possivel cobranca futura (aviso previo de 30 dias corridos)
  const [declaracao, setDeclaracao] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  // Workshop fields
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepErro, setCepErro] = useState('');
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  // Mesmo padrao de emergencia/page.tsx e cliente/nova-solicitacao: comeca
  // com um default (SP) e so sobrescreve se o navegador conceder
  // geolocalizacao - sem isso, toda oficina/loja cadastrada gravava a
  // mesma coordenada fixa, quebrando o "oficinas proximas" pra qualquer
  // parceiro fora de Sao Paulo (inclusive o piloto na Estonia).
  const [coords, setCoords] = useState({ lat: -23.5505, lon: -46.6333 });
  // Pais em codigo ISO 3166-1 alpha-2 - decide a MOEDA mostrada nos precos
  // dessa oficina/loja daqui pra frente (ver lib/currency.ts). Nunca deduzir
  // moeda pelo idioma da interface - so pelo pais real do negocio.
  const [pais, setPais] = useState('BR');
  const [geoResolved, setGeoResolved] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setCoords({ lat, lon });
          setGeoResolved(true);
          // O navegador so devolve lat/lon, nunca o pais - precisa de uma
          // geocodificacao reversa pra descobrir em que pais o
          // dispositivo esta.
          try {
            const res = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
            if (res.ok) {
              const data = await res.json();
              if (data.paisCodigo) setPais(data.paisCodigo);
            }
          } catch {
            // mantem o default BR se a geocodificacao reversa falhar
          }
        },
        () => { /* sem permissao - handleSubmit tenta geocodificar o endereco digitado */ }
      );
    }
  }, []);

  // Fallback quando o navegador nega geolocalizacao: geocodifica o endereco
  // que a oficina/loja digitou via Nominatim (gratuito, mundial) em vez de
  // deixar a coordenada (e o pais) presos no default de Sao Paulo/Brasil.
  const resolveLocation = async (): Promise<{ lat: number; lon: number; pais: string }> => {
    if (geoResolved) return { ...coords, pais };
    const query = [endereco, cidade, estado].filter(Boolean).join(', ');
    if (!query) return { ...coords, pais };
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          return { lat: data.latitude, lon: data.longitude, pais: data.paisCodigo || pais };
        }
      }
    } catch {
      // mantem o default (SP/BR) se a geocodificacao tambem falhar
    }
    return { ...coords, pais };
  };

  const handleCepChange = async (raw: string) => {
    const formatted = formatCep(raw);
    setCep(formatted);
    setCepErro('');
    if (!cepEstaCompleto(formatted)) return;
    setBuscandoCep(true);
    const resultado = await buscarEnderecoPorCep(formatted);
    setBuscandoCep(false);
    if (!resultado) {
      setCepErro(t('cepNaoEncontrado'));
      return;
    }
    setEndereco(resultado.logradouro || endereco);
    setCidade(resultado.localidade);
    setEstado(resultado.uf);
  };

  const toggleEspecialidade = (value: string) => {
    setEspecialidades((prev) =>
      prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]
    );
  };

  const renderEnderecoFields = () => (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelCep')}</label>
        <input
          type="text"
          inputMode="numeric"
          className="input-field"
          placeholder={t('placeholderCep')}
          value={cep}
          onChange={(e) => handleCepChange(e.target.value)}
          maxLength={9}
        />
        {buscandoCep && <p className="text-xs text-gray-400 mt-1">{t('buscandoEndereco')}</p>}
        {cepErro && <p className="text-xs text-red-500 mt-1">{cepErro}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelEndereco')}</label>
        <input type="text" className="input-field" placeholder={t('placeholderEndereco')} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        <p className="text-xs text-gray-400 mt-1">{t('enderecoAjuda')}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelCidade')}</label>
          <input type="text" className="input-field" placeholder={t('placeholderCidade')} value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelEstado')}</label>
          <input type="text" className="input-field" placeholder={t('placeholderEstado')} value={estado} onChange={(e) => setEstado(e.target.value)} />
        </div>
      </div>
    </>
  );


  useEffect(() => {
    if (tipoParam && (tipoParam === 'cliente' || tipoParam === 'oficina' || tipoParam === 'loja_pecas')) {
      setUserType(tipoParam);
      setStep(2);
    }
  }, [tipoParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !email || !password) {
      setError(t('errorCamposObrigatorios'));
      return;
    }
    if (!aceitouTermos) {
      setError(t('errorTermos'));
      return;
    }
    const tipo = userType || 'cliente';
    const parceiro = tipo === 'oficina' || tipo === 'loja_pecas';
    if (parceiro && !declaracao) {
      setError(te('DECLARACAO_OBRIGATORIA'));
      return;
    }
    setError('');
    setLoading(true);

    // Conta, perfil e oficina/loja sao criados no servidor; o login so
    // funciona depois que a pessoa confirma o e-mail pelo link enviado.
    const local = parceiro ? await resolveLocation() : null;
    const res = await fetch('/api/cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, senha: password, nome, telefone, tipo, idioma: locale,
        aceitouTermos, declaracaoResponsavel: parceiro ? declaracao : undefined,
        empresa: local && {
          nome_fantasia: nomeFantasia || nome,
          cnpj,
          endereco, cidade, estado, cep,
          pais: local.pais,
          latitude: local.lat,
          longitude: local.lon,
          especialidades: tipo === 'oficina' ? especialidades : undefined,
        },
      }),
    }).catch(() => null);
    setLoading(false);
    if (!res || !res.ok) {
      const corpo = res ? await res.json().catch(() => null) : null;
      setError(textoErroApi(te, res?.status || 500, corpo));
      return;
    }
    setEnviado(true);
  };

  const reenviar = async () => {
    setLoading(true);
    await fetch('/api/cadastro/reenviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, idioma: locale }),
    }).catch(() => {});
    setLoading(false);
    setReenviado(true);
  };

  if (enviado) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6" aria-hidden="true">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{t('verifiqueTitulo')}</h1>
          <p className="text-gray-600">{t('verifiqueTexto1')} <strong className="break-all">{email}</strong>.</p>
          <p className="text-gray-600 mt-2">{t('verifiqueTexto2')}</p>
          {(userType === 'oficina' || userType === 'loja_pecas') && (
            <p className="text-sm text-gray-600 mt-4 bg-blue-50 border border-blue-100 rounded-lg p-3">{t('verifiqueAnalise')}</p>
          )}
          <div className="mt-6">
            {reenviado ? (
              <p className="text-sm text-green-700" role="status">{t('linkReenviado')}</p>
            ) : (
              <button type="button" onClick={reenviar} disabled={loading} className="text-sm font-medium text-primary-600 hover:underline">
                {t('reenviarLink')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const title = userType === 'oficina' ? t('tituloOficina') : userType === 'loja_pecas' ? t('tituloLoja') : userType === 'cliente' ? t('tituloMotorista') : t('tituloGenerico');

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600 mt-2">{t('subtitulo')}</p>
        </div>

        <div className="card">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Step 1: Choose type (only if no tipo param) */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('comoDesejaUsar')}</h2>
              <button
                onClick={() => { setUserType('cliente'); setStep(2); }}
                className="w-full p-6 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-primary-100">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{t('souMotorista')}</p>
                    <p className="text-sm text-gray-500">{t('descMotorista')}</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setUserType('oficina'); setStep(2); }}
                className="w-full p-6 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-primary-100">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{t('souOficina')}</p>
                    <p className="text-sm text-gray-500">{t('descOficina')}</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setUserType('loja_pecas'); setStep(2); }}
                className="w-full p-6 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center group-hover:bg-primary-100">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{t('souLoja')}</p>
                    <p className="text-sm text-gray-500">{t('descLoja')}</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Step 2: Personal info */}
          {step === 2 && (
            <form onSubmit={(e) => { e.preventDefault(); (userType === 'oficina' || userType === 'loja_pecas') ? setStep(3) : handleSubmit(e); }} className="space-y-4">
              {!tipoParam && (
                <div className="flex items-center gap-2 mb-4">
                  <button type="button" onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">{t('dadosPessoais')}</h2>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelNomeCompleto')}</label>
                <input type="text" className="input-field" placeholder={t('placeholderNome')} value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelEmail')}</label>
                <input type="email" className="input-field" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelTelefone')}</label>
                <input type="tel" className="input-field" placeholder={t('placeholderTelefone')} value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelSenha')}</label>
                <input type="password" className="input-field" placeholder={t('placeholderSenhaMinima')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              <label className="flex items-start gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  checked={aceitouTermos}
                  onChange={(e) => setAceitouTermos(e.target.checked)}
                />
                <span>
                  {t('aceiteTexto1')}{' '}
                  <Link href="/termos" target="_blank" className="text-primary-600 hover:underline">{t('termosDeUso')}</Link>
                  {' '}{t('aceiteTexto2')}{' '}
                  <Link href="/privacidade" target="_blank" className="text-primary-600 hover:underline">{t('politicaDePrivacidade')}</Link>
                </span>
              </label>
              <button type="submit" className="btn-primary w-full" disabled={loading || !aceitouTermos}>
                {loading ? t('criandoConta') : (userType === 'oficina' || userType === 'loja_pecas') ? t('proximo') : t('criarConta')}
              </button>
            </form>
          )}

          {/* Step 3: Workshop info */}
          {step === 3 && userType === 'oficina' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <button type="button" onClick={() => setStep(2)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-lg font-semibold text-gray-900">{t('dadosOficina')}</h2>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelNomeFantasia')}</label>
                <input type="text" className="input-field" placeholder={t('placeholderNomeOficina')} value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelCnpj')}</label>
                <input type="text" className="input-field" placeholder={t('placeholderCnpj')} value={cnpj} onChange={(e) => setCnpj(e.target.value)} required />
              </div>
              {renderEnderecoFields()}

              {/* Especialidades */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('labelServicosOficina')}
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  {t('servicosAjuda')}
                </p>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                  {TIPOS_SERVICO.map((tipo) => (
                    <label
                      key={tipo.value}
                      className={`flex items-center gap-2 p-3 min-w-0 rounded-lg border-2 cursor-pointer transition-all ${
                        especialidades.includes(tipo.value)
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={especialidades.includes(tipo.value)}
                        onChange={() => toggleEspecialidade(tipo.value)}
                        className="w-4 h-4 flex-shrink-0 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                      />
                      <span className="text-lg flex-shrink-0">{tipo.icon}</span>
                      <span className="text-sm text-gray-900 min-w-0 break-words">{tc(`tiposServico.${tipo.value}`)}</span>
                    </label>
                  ))}
                </div>
                {especialidades.length > 0 && (
                  <p className="text-xs text-primary-600 mt-2">
                    {t('servicosSelecionados', { count: especialidades.length })}
                  </p>
                )}
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  checked={declaracao}
                  onChange={(e) => setDeclaracao(e.target.checked)}
                />
                <span>{t('declaracaoResponsavel')}</span>
              </label>
              <button type="submit" className="btn-primary w-full" disabled={loading || especialidades.length === 0 || !declaracao}>
                {loading ? t('criandoConta') : t('criarContaOficina')}
              </button>
            </form>
          )}

          {/* Step 3: Parts store info */}
          {step === 3 && userType === 'loja_pecas' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <button type="button" onClick={() => setStep(2)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-lg font-semibold text-gray-900">{t('dadosLoja')}</h2>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelNomeFantasia')}</label>
                <input type="text" className="input-field" placeholder={t('placeholderNomeLoja')} value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelCnpj')}</label>
                <input type="text" className="input-field" placeholder={t('placeholderCnpj')} value={cnpj} onChange={(e) => setCnpj(e.target.value)} required />
              </div>
              {renderEnderecoFields()}
              <label className="flex items-start gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  checked={declaracao}
                  onChange={(e) => setDeclaracao(e.target.checked)}
                />
                <span>{t('declaracaoResponsavel')}</span>
              </label>
              <button type="submit" className="btn-primary w-full" disabled={loading || !declaracao}>
                {loading ? t('criandoConta') : t('criarContaLoja')}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-gray-600 mt-6">
            {t('jaTemConta')}{' '}
            <Link href="/login" className="text-primary-600 font-medium hover:text-primary-700">
              {t('entrar')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
