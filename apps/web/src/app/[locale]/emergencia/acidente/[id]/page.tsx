'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { headersEmergencia } from '@/lib/emergencia-token';
import { useAuth } from '@/lib/auth-context';
import { compressImage } from '@/lib/image-compress';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';

interface Mensagem {
  id: string;
  remetente_tipo: 'proprietario' | 'outro';
  texto: string;
  created_at: string;
}

interface OutroVeiculo {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  placa: string;
  veiculo_descricao: string;
  observacoes: string;
  notificado: boolean;
}

interface Orcamento {
  id: string;
  valor_total: number;
  prazo_dias: number;
  status: string;
  observacoes: string | null;
  oficina: {
    nome_fantasia: string;
    endereco?: string;
    cidade?: string;
    estado?: string;
    pais?: string | null;
    profile?: { telefone?: string; email?: string };
  } | null;
}

export default function AcidenteRegistroPage() {
  const t = useTranslations('emergenciaAcidenteDetalhe');
  const locale = useLocale();
  const { id: emergenciaId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'registro' | 'chat' | 'orcamentos'>('registro');

  // Other vehicle registration
  const [outroNome, setOutroNome] = useState('');
  const [outroTelefone, setOutroTelefone] = useState('');
  const [outroEmail, setOutroEmail] = useState('');
  const [outroPlaca, setOutroPlaca] = useState('');
  const [outroVeiculo, setOutroVeiculo] = useState('');
  const [outroVeiculoDetalhes, setOutroVeiculoDetalhes] = useState<{ marca: string; modelo: string; ano: string; cor: string } | null>(null);
  const [buscandoOutroPlaca, setBuscandoOutroPlaca] = useState(false);
  const [fotosOutro, setFotosOutro] = useState<{ file: File; preview: string }[]>([]);

  const buscarOutroPlaca = async (p: string) => {
    const clean = p.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length < 7) return;
    setBuscandoOutroPlaca(true);
    try {
      const res = await fetch('/api/consultar-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: clean }),
      });
      if (res.ok) {
        const data = await res.json();
        setOutroVeiculoDetalhes({ marca: data.marca, modelo: data.modelo, ano: data.ano, cor: data.cor });
        setOutroVeiculo(`${data.marca} ${data.modelo}`);
      }
    } catch { /* silencioso */ }
    setBuscandoOutroPlaca(false);
  };
  const [observacoes, setObservacoes] = useState('');
  const [registered, setRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [outroVeiculoId, setOutroVeiculoId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Chat
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Orcamentos
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [loadingOrc, setLoadingOrc] = useState(false);
  const [emergData, setEmergData] = useState<{ solicitacao_id: string | null; profile_id: string | null; descricao: string | null } | null>(null);
  const [veiculoProprietario, setVeiculoProprietario] = useState<{ fipe_marca: string; fipe_modelo: string; fipe_ano: string; placa: string; cor: string } | null>(null);
  const [papel, setPapel] = useState<'proprietario' | 'outro' | 'oficina' | 'admin' | null>(null);
  const isProprietario = papel === 'proprietario';

  // Determine if current user is the victim (only victims can accept quotes and send to responsible)
  // eu_causei: registrant is responsible, so registrant is NOT victim
  // outro_causou: registrant is victim
  const isVitima = emergData?.descricao?.match(/\[TIPO:(\w+)\]/)
    ? (emergData.descricao.match(/\[TIPO:(\w+)\]/)?.[1] === 'outro_causou'
        ? isProprietario   // registrant is victim
        : papel === 'outro')  // eu_causei: the other driver is the victim
    : isProprietario; // fallback for legacy data

  // Dados do acidente pela API (acesso verificado no servidor: codigo
  // secreto deste navegador ou participante logado)
  const [semAcesso, setSemAcesso] = useState(false);
  const loadData = useCallback(async () => {
    if (!emergenciaId) return;
    const res = await fetch(`/api/emergencia/${emergenciaId}`, { headers: headersEmergencia(emergenciaId), cache: 'no-store' });
    if (res.status === 403 || res.status === 404) {
      setSemAcesso(true);
      setLoadingOrc(false);
      return;
    }
    if (!res.ok) return;
    const d = await res.json();
    setSemAcesso(false);
    const outro = d.outro as OutroVeiculo | null;
    if (outro) {
      setOutroNome(outro.nome);
      setOutroTelefone(outro.telefone || '');
      setOutroEmail(outro.email || '');
      setOutroPlaca(outro.placa);
      setOutroVeiculo(outro.veiculo_descricao || '');
      setObservacoes(outro.observacoes || '');
      setOutroVeiculoId(outro.id);
      setRegistered(true);
    }
    setMensagens((prev) => {
      const pendentes = prev.filter((m) => m.id.startsWith('temp-'));
      return [...(d.mensagens as Mensagem[]), ...pendentes];
    });
    setEmergData(d.emergencia);
    setPapel(d.papel);
    if (d.veiculo) setVeiculoProprietario(d.veiculo);
    setOrcamentos(d.orcamentos as Orcamento[]);
    setLoadingOrc(false);
  }, [emergenciaId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Atualiza a cada 5 s (o chat do acidente nao usa mais o tempo real do
  // banco, que exigiria deixar a tabela aberta a quem nao tem login)
  useEffect(() => {
    if (!emergenciaId) return;
    const t = setInterval(loadData, 5000);
    return () => clearInterval(t);
  }, [emergenciaId, loadData]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const picked = Array.from(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
    const compressed = await Promise.all(picked.map(compressImage));
    const newFotos = compressed.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFotosOutro((prev) => [...prev, ...newFotos]);
  };

  const handleRegister = async () => {
    setRegistering(true);
    setError('');
    const form = new FormData();
    form.append('dados', JSON.stringify({
      nome: outroNome,
      telefone: outroTelefone || null,
      email: outroEmail || null,
      placa: outroPlaca,
      veiculo: outroVeiculo || null,
      observacoes: observacoes || null,
      idioma: locale,
    }));
    fotosOutro.forEach((f) => form.append('fotos', f.file));
    const res = await fetch(`/api/emergencia/${emergenciaId}/outro-veiculo`, {
      method: 'POST',
      headers: headersEmergencia(emergenciaId),
      body: form,
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(r.error || 'Error');
      setRegistering(false);
      return;
    }
    setOutroVeiculoId(r.id);
    setRegistering(false);
    setRegistered(true);
  };

  const sendMessage = async () => {
    if (!novaMensagem.trim() || !emergenciaId) return;
    setSendingMsg(true);

    const texto = novaMensagem;
    setNovaMensagem('');

    const meuTipo = papel === 'outro' ? 'outro' : 'proprietario';

    // Optimistic update
    const tempMsg: Mensagem = {
      id: `temp-${Date.now()}`,
      remetente_tipo: meuTipo,
      texto,
      created_at: new Date().toISOString(),
    };
    setMensagens((prev) => [...prev, tempMsg]);

    const res = await fetch(`/api/emergencia/${emergenciaId}/mensagens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headersEmergencia(emergenciaId) },
      body: JSON.stringify({ texto }),
    });
    const inserted = res.ok ? await res.json() : null;
    if (!inserted) setMensagens((prev) => prev.filter((m) => m.id !== tempMsg.id));

    // Replace temp with real
    if (inserted) {
      setMensagens((prev) => prev.map(m => m.id === tempMsg.id ? (inserted as Mensagem) : m));
    }

    setSendingMsg(false);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Parse accident type from emergencia descricao
  const tipoMatch = emergData?.descricao?.match(/\[TIPO:(\w+)\]/);
  const tipoAcidente = tipoMatch ? tipoMatch[1] : null;

  // Fallback: try old format [RESP:xxx]
  const respMatch = !tipoAcidente ? emergData?.descricao?.match(/\[RESP:(\w+)\]/) : null;
  const responsabilidadeLegacy = respMatch ? respMatch[1] : null;

  // Determine labels based on tipo_acidente
  // eu_causei: registrant = Responsável, outro = Vítima
  // outro_causou: registrant = Vítima, outro = Responsável
  const registranteLabel = tipoAcidente === 'eu_causei' ? t('registranteLabelEuCausei') : tipoAcidente === 'outro_causou' ? t('registranteLabelOutroCausou') : t('registranteLabelDefault');
  const outroLabel = tipoAcidente === 'eu_causei' ? t('outroLabelEuCausei') : tipoAcidente === 'outro_causou' ? t('outroLabelOutroCausou') : t('outroLabelDefault');
  const registranteColor = tipoAcidente === 'eu_causei' ? 'text-red-600' : tipoAcidente === 'outro_causou' ? 'text-green-600' : 'text-blue-600';
  const outroColor = tipoAcidente === 'eu_causei' ? 'text-green-600' : tipoAcidente === 'outro_causou' ? 'text-red-600' : 'text-orange-600';
  const registranteBorderColor = tipoAcidente === 'eu_causei' ? 'border-l-red-400' : tipoAcidente === 'outro_causou' ? 'border-l-green-400' : 'border-l-blue-400';
  const outroBorderColor = tipoAcidente === 'eu_causei' ? 'border-l-green-400' : tipoAcidente === 'outro_causou' ? 'border-l-red-400' : 'border-l-orange-400';

  const tipoBadge: Record<string, { label: string; color: string }> = {
    eu_causei: { label: t('badgeEuCausei'), color: 'bg-red-100 text-red-700' },
    outro_causou: { label: t('badgeOutroCausou'), color: 'bg-green-100 text-green-700' },
    sem_outro: { label: t('badgeSemOutro'), color: 'bg-gray-100 text-gray-700' },
  };

  // Legacy badges for old data
  const respBadge: Record<string, { label: string; color: string }> = {
    responsavel: { label: t('legacyResponsavel'), color: 'bg-red-100 text-red-700' },
    vitima: { label: t('legacyVitima'), color: 'bg-green-100 text-green-700' },
    dividida: { label: t('legacyDividida'), color: 'bg-yellow-100 text-yellow-700' },
    individual: { label: t('legacyIndividual'), color: 'bg-gray-100 text-gray-700' },
  };

  const buildQuoteMessage = (orc: Orcamento) => {
    const ofi = orc.oficina;
    let msg = t('quoteMsgBase', { oficina: ofi?.nome_fantasia || '', valor: formatCurrency(orc.valor_total, currencyForCountry(ofi?.pais), locale), dias: orc.prazo_dias });
    if (ofi?.endereco) {
      const endereco = ofi.cidade ? `${ofi.endereco}${t('quoteMsgCityPart', { cidade: ofi.cidade })}` : ofi.endereco;
      msg += t('quoteMsgAddressPart', { endereco });
    }
    if (ofi?.profile?.telefone) {
      msg += t('quoteMsgPhonePart', { telefone: ofi.profile.telefone });
    }
    return msg;
  };

  if (semAcesso) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{t('semAcessoTitulo')}</h1>
        <p className="text-gray-600 mb-6">{t('semAcessoTexto')}</p>
        <Link href="/login" className="btn-primary inline-block">{t('semAcessoEntrar')}</Link>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-gray-900">{t('headerTitle')}</h1>
          <p className="text-gray-600 text-sm">{t('headerSubtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setStep('registro')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            step === 'registro' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'
          }`}
        >
          {t('tabEnvolvidos')}
        </button>
        <button
          onClick={() => setStep('chat')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            step === 'chat' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'
          }`}
        >
          {t('tabMensagens')} {mensagens.length > 0 && `(${mensagens.length})`}
        </button>
        <button
          onClick={() => setStep('orcamentos')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            step === 'orcamentos' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'
          }`}
        >
          {t('tabOrcamentos')} {orcamentos.length > 0 && `(${orcamentos.length})`}
        </button>
      </div>

      {/* Registration tab */}
      {step === 'registro' && !registered && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('formTitle')}</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('otherNameLabel')}</label>
              <input type="text" className="input-field" placeholder={t('otherNamePlaceholder')} value={outroNome} onChange={(e) => setOutroNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('phoneLabel')}</label>
                <input type="tel" className="input-field" placeholder={t('phonePlaceholder')} value={outroTelefone} onChange={(e) => setOutroTelefone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('emailLabel')}</label>
                <input type="email" className="input-field" placeholder={t('emailPlaceholder')} value={outroEmail} onChange={(e) => setOutroEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('plateLabel')}</label>
                <div className="flex gap-2">
                  <input type="text" className="input-field uppercase" placeholder={t('platePlaceholder')} maxLength={8} value={outroPlaca}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setOutroPlaca(v);
                      if (v.replace(/[^a-zA-Z0-9]/g, '').length === 7) buscarOutroPlaca(v);
                    }} />
                  {buscandoOutroPlaca && <div className="flex items-center"><div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>}
                </div>
                {outroVeiculoDetalhes && (
                  <p className="text-xs text-green-600 mt-1">{outroVeiculoDetalhes.marca} {outroVeiculoDetalhes.modelo} - {outroVeiculoDetalhes.ano} {outroVeiculoDetalhes.cor}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicleLabel')}</label>
                <input type="text" className="input-field" placeholder={t('vehiclePlaceholder')} value={outroVeiculo} onChange={(e) => setOutroVeiculo(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('photosLabel')}</label>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
              <div className="flex gap-3 flex-wrap">
                {fotosOutro.map((foto, i) => (
                  <div key={i} className="w-20 h-20 rounded-lg overflow-hidden">
                    <img src={foto.preview} alt={`${i + 1}`} className="w-full h-full object-cover" />
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('observationsLabel')}</label>
              <textarea
                className="input-field min-h-[80px]"
                placeholder={t('observationsPlaceholder')}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>

          {outroEmail && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
              <p className="text-sm text-blue-800">
                {t('notifyInfo')}
              </p>
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={!outroNome || !outroPlaca || registering}
            className="btn-primary w-full mt-6"
          >
            {registering ? t('registeringBtn') : t('registerBtn')}
          </button>
        </div>
      )}

      {step === 'registro' && registered && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('involvedTitle')}</h2>

          {/* Accident type badge */}
          {tipoAcidente && tipoBadge[tipoAcidente] && (
            <div className={`inline-block px-3 py-1.5 rounded-full text-sm font-medium ${tipoBadge[tipoAcidente].color}`}>
              {tipoBadge[tipoAcidente].label}
            </div>
          )}
          {/* Legacy responsibility badge */}
          {!tipoAcidente && responsabilidadeLegacy && respBadge[responsabilidadeLegacy] && (
            <div className={`inline-block px-3 py-1.5 rounded-full text-sm font-medium ${respBadge[responsabilidadeLegacy].color}`}>
              {respBadge[responsabilidadeLegacy].label}
            </div>
          )}

          {/* Registrant (proprietário) */}
          <div className={`card border-l-4 ${registranteBorderColor}`}>
            <p className={`text-xs font-semibold ${registranteColor} uppercase mb-2`}>{registranteLabel}</p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('nameFieldLabel')}</span>
                <span className="text-gray-900 font-medium">{user?.nome || t('youFallback')}</span>
              </div>
              {veiculoProprietario && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('vehicleFieldLabel')}</span>
                    <span className="text-gray-900">{veiculoProprietario.fipe_marca} {veiculoProprietario.fipe_modelo}</span>
                  </div>
                  {veiculoProprietario.fipe_ano && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('yearFieldLabel')}</span>
                      <span className="text-gray-900">{veiculoProprietario.fipe_ano}</span>
                    </div>
                  )}
                  {veiculoProprietario.placa && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('plateFieldLabel')}</span>
                      <span className="text-gray-900 font-mono">{veiculoProprietario.placa}</span>
                    </div>
                  )}
                  {veiculoProprietario.cor && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('colorFieldLabel')}</span>
                      <span className="text-gray-900">{veiculoProprietario.cor}</span>
                    </div>
                  )}
                </>
              )}
              {user?.telefone && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('phoneFieldLabel')}</span>
                  <a href={`tel:${user.telefone}`} className="text-primary-600 hover:underline">{user.telefone}</a>
                </div>
              )}
              {emergData?.solicitacao_id && <p className="text-xs text-gray-500 mt-1">{t('requestRegisteredNote')}</p>}
            </div>
          </div>

          {/* Outro envolvido */}
          <div className={`card border-l-4 ${outroBorderColor}`}>
            <div className="flex items-center justify-between mb-2">
              <p className={`text-xs font-semibold ${outroColor} uppercase`}>{outroLabel}</p>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-xs text-green-600">{t('notifiedBadge')}</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('nameFieldLabel')}</span>
                <span className="text-gray-900 font-medium">{outroNome}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('vehicleFieldLabel')}</span>
                <span className="text-gray-900">{outroVeiculo || t('notInformed')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('plateFieldLabel')}</span>
                <span className="text-gray-900 font-mono">{outroPlaca}</span>
              </div>
              {outroTelefone && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('phoneFieldLabel')}</span>
                  <a href={`tel:${outroTelefone}`} className="text-primary-600 hover:underline">{outroTelefone}</a>
                </div>
              )}
              {outroEmail && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('emailLabel')}</span>
                  <span className="text-gray-900">{outroEmail}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={() => setStep('chat')} className="btn-primary flex-1">
              {t('sendMessageBtn')}
            </button>
            <button onClick={() => setStep('orcamentos')} className="btn-secondary flex-1">
              {t('viewQuotesBtn')}
            </button>
          </div>
        </div>
      )}

      {/* Chat tab */}
      {step === 'chat' && (
        <div className="card !p-0 overflow-hidden">
          <div className="bg-gray-50 p-4 border-b">
            <p className="font-medium text-gray-900">{outroNome || t('chatOtherFallback')}</p>
            <p className="text-xs text-gray-500">{outroVeiculo || t('chatVehicleFallback')} - {outroPlaca || t('chatNoPlateFallback')}</p>
          </div>

          <div className="h-[400px] overflow-y-auto p-4 space-y-3">
            {mensagens.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-gray-400">{t('chatEmptyState')}</p>
              </div>
            )}
            {mensagens.map((msg) => {
              const meuTipo = papel === 'outro' ? 'outro' : 'proprietario';
              const isMyMsg = msg.remetente_tipo === meuTipo;
              return (
                <div key={msg.id} className={`flex ${isMyMsg ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    isMyMsg
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-900 rounded-bl-md'
                  }`}>
                    {!isMyMsg && (
                      <p className={`text-xs font-semibold mb-0.5 ${isMyMsg ? 'text-primary-200' : 'text-gray-500'}`}>
                        {msg.remetente_tipo === 'proprietario' ? t('chatSenderProprietario') : outroNome || t('chatSenderOutroFallback')}
                      </p>
                    )}
                    <p className="text-sm">{msg.texto}</p>
                    <p className={`text-xs mt-1 ${isMyMsg ? 'text-primary-200' : 'text-gray-400'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t flex gap-2">
            <input
              type="text"
              className="input-field flex-1"
              placeholder={t('chatInputPlaceholder')}
              value={novaMensagem}
              onChange={(e) => setNovaMensagem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !sendingMsg && sendMessage()}
            />
            <button onClick={sendMessage} disabled={sendingMsg} className="btn-primary !px-4">
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
          {loadingOrc ? (
            <div className="card text-center py-8">
              <div className="animate-pulse text-gray-400">{t('loadingQuotes')}</div>
            </div>
          ) : orcamentos.length === 0 ? (
            <div className="card text-center py-12">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="font-semibold text-gray-900 mb-2">{t('noQuotesTitle')}</h3>
              <p className="text-sm text-gray-500">
                {t('noQuotesText')}
              </p>
            </div>
          ) : (
            <>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  {tipoAcidente === 'eu_causei' || tipoAcidente === 'outro_causou'
                    ? t('victimDecidesNote')
                    : t('shareWithOtherNote')}
                </p>
              </div>

              {orcamentos.map((orc) => {
                const ofi = orc.oficina;
                const isAceito = orc.status === 'aceito';
                return (
                  <div key={orc.id} className={`card ${isAceito ? 'border-2 border-green-400' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{ofi?.nome_fantasia || t('workshopFallback')}</h3>
                        {isAceito && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{t('quoteAcceptedBadge')}</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-900">{formatCurrency(orc.valor_total, currencyForCountry(ofi?.pais), locale)}</p>
                        <p className="text-xs text-gray-500">{t('deadlineLabel', { dias: orc.prazo_dias })}</p>
                      </div>
                    </div>

                    {/* Oficina details */}
                    {ofi && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase">{t('workshopDataTitle')}</p>
                        {ofi.endereco && <p className="text-sm text-gray-700">{ofi.endereco}</p>}
                        {(ofi.cidade || ofi.estado) && <p className="text-sm text-gray-700">{ofi.cidade}{ofi.estado ? `, ${ofi.estado}` : ''}</p>}
                        {ofi.profile?.telefone && (
                          <p className="text-sm"><a href={`tel:${ofi.profile.telefone}`} className="text-primary-600 hover:underline">{ofi.profile.telefone}</a></p>
                        )}
                        {ofi.profile?.email && (
                          <p className="text-sm"><a href={`mailto:${ofi.profile.email}`} className="text-primary-600 hover:underline">{ofi.profile.email}</a></p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      {tipoAcidente !== 'sem_outro' && (
                        (tipoAcidente === 'eu_causei' || tipoAcidente === 'outro_causou')
                          ? isVitima && (
                            <button
                              onClick={() => {
                                setStep('chat');
                                setNovaMensagem(buildQuoteMessage(orc));
                              }}
                              className="btn-secondary flex-1 !py-2 text-sm"
                            >
                              {t('sendToResponsibleBtn')}
                            </button>
                          )
                          : (
                            <button
                              onClick={() => {
                                setStep('chat');
                                setNovaMensagem(buildQuoteMessage(orc));
                              }}
                              className="btn-secondary flex-1 !py-2 text-sm"
                            >
                              {t('sendToOtherBtn')}
                            </button>
                          )
                      )}
                      {isVitima && !isAceito && (
                        <Link
                          href={`/cliente/orcamentos/${emergData?.solicitacao_id}`}
                          className="btn-primary flex-1 !py-2 text-sm text-center"
                        >
                          {t('acceptQuoteBtn')}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
