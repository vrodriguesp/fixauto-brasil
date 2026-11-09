'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { headersEmergencia } from '@/lib/emergencia-token';
import { SeguroReparoEditor, type ValorSeguro } from '@/components/emergencia/SeguroReparo';
import { useAuth } from '@/lib/auth-context';
import { compressImage } from '@/lib/image-compress';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { textoErroApi } from '@/lib/erro-api';
import CampoTelefone from '@/components/forms/CampoTelefone';
import { useTopoAoMudar } from '@/hooks/use-topo-ao-mudar';
import { rolarAteAqui } from '@/hooks/use-mostrar-alerta';
import { useConversaCelular } from '@/hooks/use-conversa-celular';
import { placaValida } from '@/lib/validar-carro';
import CampoConversa, { AvisoNovaMensagem } from '@/components/conversa/CampoConversa';

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
  const tErros = useTranslations('erros');
  const locale = useLocale();
  const { id: emergenciaId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'registro' | 'chat' | 'orcamentos'>('registro');
  useTopoAoMudar(step);

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
    // A consulta de placa usa uma base so do Brasil: decide pelo FORMATO da
    // placa brasileira (AAA9999 / AAA9A99), nao pelo idioma da tela
    if (!/^[A-Za-z]{3}\d[A-Za-z0-9]\d{2}$/.test(clean)) return;
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
  // editar o outro motorista ja registrado / completar o proprio carro (dono 09/11)
  const [editandoOutro, setEditandoOutro] = useState(false);
  const editandoOutroRef = useRef(false);
  editandoOutroRef.current = editandoOutro;
  const [editandoCarro, setEditandoCarro] = useState(false);
  const [carroMarca, setCarroMarca] = useState('');
  const [carroModelo, setCarroModelo] = useState('');
  const [carroPlaca, setCarroPlaca] = useState('');
  const [salvandoCarro, setSalvandoCarro] = useState(false);
  const [error, setError] = useState('');

  // Chat
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Orcamentos
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [loadingOrc, setLoadingOrc] = useState(false);
  const [emergData, setEmergData] = useState<{ solicitacao_id: string | null; profile_id: string | null; descricao: string | null; nome?: string | null; latitude?: number | null; longitude?: number | null; created_at?: string | null; endereco?: string | null; tipo_acidente?: string | null } | null>(null);
  // pais do acidente (pela localizacao): regras e seguradoras do local, nao do idioma
  const [paisAcidente, setPaisAcidente] = useState<string | null>(null);
  useEffect(() => {
    if (emergData?.latitude == null || emergData?.longitude == null) return;
    fetch(`/api/geocode?lat=${emergData.latitude}&lon=${emergData.longitude}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.paisCodigo) setPaisAcidente(d.paisCodigo); }).catch(() => {});
  }, [emergData?.latitude, emergData?.longitude]);
  const [veiculoProprietario, setVeiculoProprietario] = useState<{ fipe_marca: string; fipe_modelo: string; fipe_ano: string; placa: string; cor: string } | null>(null);
  // quem paga o reparo (null = ainda carregando / sem acesso a esse dado)
  const [seguro, setSeguro] = useState<ValorSeguro | null>(null);
  const [papel, setPapel] = useState<'proprietario' | 'outro' | 'oficina' | 'admin' | null>(null);
  const isProprietario = papel === 'proprietario';
  // conversa do acidente no padrao unico (dono 09/11): abre no fim, aviso de nova mensagem e caixa
  // de escrever que nao fecha o teclado; fica dentro da pagina (com as abas), sem tela cheia
  const tConv = useTranslations('conversa');
  const chatRef = useRef<HTMLDivElement>(null);
  const chatListaRef = useRef<HTMLDivElement>(null);
  const { novaMensagem: chatNova, irParaFim: chatParaFim, propsLista: chatPropsLista } = useConversaCelular({
    conversa: chatRef, lista: chatListaRef, quantidade: mensagens.length,
    ultimaMinha: mensagens[mensagens.length - 1]?.remetente_tipo === (papel === 'outro' ? 'outro' : 'proprietario'),
    ativo: step === 'chat', fixar: false,
  });

  // Determine if current user is the victim (only victims can accept quotes and send to responsible)
  // eu_causei: registrant is responsible, so registrant is NOT victim

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
    if (outro && !editandoOutroRef.current) {
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
    if (d.seguro) {
      setSeguro((atual) => atual ?? {
        pagamento_reparo: d.seguro.pagamento_reparo || '',
        seguradora: d.seguro.seguradora || '',
        sinistro_numero: d.seguro.sinistro_numero || '',
        franquia: d.seguro.franquia != null ? String(d.seguro.franquia) : '',
      });
    }
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
    const compressed = await Promise.all(picked.map((f) => compressImage(f)));
    const newFotos = compressed.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFotosOutro((prev) => [...prev, ...newFotos]);
  };

  const handleRegister = async () => {
    setRegistering(true);
    setError('');
    if (editandoOutro) {
      const res = await fetch(`/api/emergencia/${emergenciaId}/outro-veiculo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headersEmergencia(emergenciaId) },
        body: JSON.stringify({ nome: outroNome, telefone: outroTelefone || null, email: outroEmail || null, placa: outroPlaca, veiculo: outroVeiculo || null, observacoes: observacoes || null, idioma: locale }),
      }).catch(() => null);
      const r = res ? await res.json().catch(() => ({})) : {};
      setRegistering(false);
      if (!res?.ok) { setError(textoErroApi(tErros, res?.status || 500, r)); return; }
      setEditandoOutro(false);
      loadData();
      return;
    }
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
      setError(textoErroApi(tErros, res.status, r));
      setRegistering(false);
      return;
    }
    setOutroVeiculoId(r.id);
    setRegistering(false);
    setRegistered(true);
  };

  const abrirEdicaoCarro = () => {
    setCarroMarca(veiculoProprietario?.fipe_marca || '');
    setCarroModelo(veiculoProprietario?.fipe_modelo || '');
    setCarroPlaca(veiculoProprietario?.placa || '');
    setEditandoCarro(true);
  };
  const salvarCarro = async () => {
    setSalvandoCarro(true); setError('');
    const res = await fetch(`/api/emergencia/${emergenciaId}/veiculo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headersEmergencia(emergenciaId) },
      body: JSON.stringify({ marca: carroMarca, modelo: carroModelo, placa: carroPlaca }),
    }).catch(() => null);
    const r = res ? await res.json().catch(() => ({})) : {};
    setSalvandoCarro(false);
    if (!res?.ok) { setError(textoErroApi(tErros, res?.status || 500, r)); return; }
    setEditandoCarro(false);
    loadData();
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
  const tipoAcidente = tipoMatch ? tipoMatch[1] : (emergData?.tipo_acidente || null);

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
        <Link href={user ? '/cliente/dashboard' : '/'} className="text-gray-400 hover:text-gray-600">
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
        <div ref={rolarAteAqui} role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Quem paga o reparo: o dono completa depois (ex.: numero do sinistro) */}
      {seguro && (papel === 'proprietario' || papel === 'admin' || papel === 'oficina') && (
        <SeguroReparoEditor
          inicial={seguro}
          tipoAcidente={(tipoAcidente as 'eu_causei' | 'outro_causou' | 'sem_outro') || 'outro_causou'}
          pais={paisAcidente}
          podeEditar={papel === 'proprietario'}
          salvar={async (v) => {
            const res = await fetch(`/api/emergencia/${emergenciaId}/seguro`, {
              method: 'POST',
              headers: { ...headersEmergencia(emergenciaId), 'Content-Type': 'application/json' },
              body: JSON.stringify(v),
            }).catch(() => null);
            return !!res?.ok;
          }}
        />
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto [&>button]:whitespace-nowrap [&>button]:flex-shrink-0">
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

      {/* Registration tab (dono 09/11): resumo, "Seu carro" e "Outro motorista" sempre com os dados
          salvos e "Editar"; o formulario do outro so quando ainda nao ha registro (ou ao editar) */}
      {step === 'registro' && papel && (
        <div className="space-y-4" data-testid="acidente-resumo">
          <div className="flex flex-wrap items-center gap-2">
            {tipoAcidente && tipoBadge[tipoAcidente] && (
              <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-medium ${tipoBadge[tipoAcidente].color}`}>{tipoBadge[tipoAcidente].label}</span>
            )}
            {!tipoAcidente && responsabilidadeLegacy && respBadge[responsabilidadeLegacy] && (
              <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-medium ${respBadge[responsabilidadeLegacy].color}`}>{respBadge[responsabilidadeLegacy].label}</span>
            )}
          </div>
          {(emergData?.created_at || emergData?.endereco) && (
            <p className="text-sm text-gray-600" data-testid="acidente-quando">
              {emergData?.created_at && new Date(emergData.created_at).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
              {emergData?.created_at && emergData?.endereco ? ' · ' : ''}{emergData?.endereco}
            </p>
          )}

          {/* Carro de quem registrou: para o dono, "Seu carro" */}
          <div className={`card border-l-4 ${registranteBorderColor}`} data-testid="card-seu-carro">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className={`text-xs font-semibold ${registranteColor} uppercase`}>
                {isProprietario ? t('seuCarroTitulo') : registranteLabel}
                {isProprietario && tipoAcidente !== 'sem_outro' && <span className="ml-1 font-normal normal-case text-gray-500">· {registranteLabel}</span>}
              </p>
              {isProprietario && !editandoCarro && (
                <button type="button" onClick={abrirEdicaoCarro} className="text-sm font-medium text-primary-700 min-h-[36px]" data-testid="editar-seu-carro">{t('editar')}</button>
              )}
            </div>
            {editandoCarro ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="sc-marca" className="block text-sm font-medium text-gray-700 mb-1">{t('marcaLabel')}</label>
                    <input id="sc-marca" className="input-field" maxLength={60} value={carroMarca} onChange={(e) => setCarroMarca(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="sc-modelo" className="block text-sm font-medium text-gray-700 mb-1">{t('modeloLabel')}</label>
                    <input id="sc-modelo" className="input-field" maxLength={80} value={carroModelo} onChange={(e) => setCarroModelo(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label htmlFor="sc-placa" className="block text-sm font-medium text-gray-700 mb-1">{t('plateFieldLabel')}</label>
                  <input id="sc-placa" className="input-field uppercase" maxLength={10} aria-invalid={!placaValida(carroPlaca)} value={carroPlaca} onChange={(e) => setCarroPlaca(e.target.value.toUpperCase())} />
                  {!placaValida(carroPlaca) && <p role="alert" className="mt-1 text-sm text-red-700">{tErros('PLACA_INVALIDA')}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setEditandoCarro(false)} className="btn-secondary">{t('cancelar')}</button>
                  <button type="button" onClick={salvarCarro} disabled={salvandoCarro || !carroMarca.trim() || !placaValida(carroPlaca)} className="btn-primary disabled:opacity-50" data-testid="salvar-seu-carro">{t('salvar')}</button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-500">{t('nameFieldLabel')}</span>
                  <span className="text-gray-900 font-medium text-right">{emergData?.nome || (isProprietario ? user?.nome : '') || t('youFallback')}</span>
                </div>
                {veiculoProprietario?.fipe_marca ? (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-500">{t('vehicleFieldLabel')}</span>
                    <span className="text-gray-900 text-right">{veiculoProprietario.fipe_marca} {veiculoProprietario.fipe_modelo}{veiculoProprietario.fipe_ano && veiculoProprietario.fipe_ano !== '-' ? ` (${veiculoProprietario.fipe_ano})` : ''}</span>
                  </div>
                ) : isProprietario && (
                  <button type="button" onClick={abrirEdicaoCarro} className="w-full text-left rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900" data-testid="completar-seu-carro">{t('seuCarroCompletar')}</button>
                )}
                {veiculoProprietario?.placa && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-500">{t('plateFieldLabel')}</span>
                    <span className="text-gray-900 font-mono">{veiculoProprietario.placa}</span>
                  </div>
                )}
                {veiculoProprietario?.cor && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-500">{t('colorFieldLabel')}</span>
                    <span className="text-gray-900">{veiculoProprietario.cor}</span>
                  </div>
                )}
                {isProprietario && user?.telefone && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-500">{t('phoneFieldLabel')}</span>
                    <a href={`tel:${user.telefone}`} className="text-primary-600 hover:underline">{user.telefone}</a>
                  </div>
                )}
                {emergData?.solicitacao_id && <p className="text-xs text-gray-500 mt-1">{t('requestRegisteredNote')}</p>}
              </div>
            )}
          </div>

          {/* Outro motorista */}
          {tipoAcidente === 'sem_outro' ? (
            <div className="card text-sm text-gray-600" data-testid="sem-outro">{t('semOutroTexto')}</div>
          ) : registered && !editandoOutro ? (
            <div className={`card border-l-4 ${outroBorderColor}`} data-testid="card-outro-motorista">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className={`text-xs font-semibold ${outroColor} uppercase`}>
                  {isProprietario ? t('outroMotoristaTitulo') : outroLabel}
                  {isProprietario && <span className="ml-1 font-normal normal-case text-gray-500">· {outroLabel}</span>}
                </p>
                {isProprietario ? (
                  <button type="button" onClick={() => setEditandoOutro(true)} className="text-sm font-medium text-primary-700 min-h-[36px]" data-testid="editar-outro">{t('editar')}</button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-green-600"><span className="w-2 h-2 bg-green-400 rounded-full" />{t('notifiedBadge')}</span>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-500">{t('nameFieldLabel')}</span>
                  <span className="text-gray-900 font-medium text-right">{outroNome}</span>
                </div>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-500">{t('vehicleFieldLabel')}</span>
                  <span className="text-gray-900 text-right">{outroVeiculo || t('notInformed')}</span>
                </div>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-gray-500">{t('plateFieldLabel')}</span>
                  <span className="text-gray-900 font-mono">{outroPlaca}</span>
                </div>
                {outroTelefone && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-500">{t('phoneFieldLabel')}</span>
                    <a href={`tel:${outroTelefone}`} className="text-primary-600 hover:underline">{outroTelefone}</a>
                  </div>
                )}
                {outroEmail && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-500">{t('emailLabel')}</span>
                    <span className="text-gray-900 break-all text-right">{outroEmail}</span>
                  </div>
                )}
                {observacoes && <p className="text-sm text-gray-700 whitespace-pre-line">{observacoes}</p>}
              </div>
            </div>
          ) : isProprietario ? (
        <div className="card" data-testid="form-outro-motorista">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">{editandoOutro ? t('editarOutroTitulo') : t('formTitle')}</h2>
          <p className="text-sm text-gray-500 mb-4">{t('formSubtitulo')}</p>

          <div className="space-y-4">
            <div>
              <label htmlFor="cbacc-1" className="block text-sm font-medium text-gray-700 mb-1">{t('otherNameLabel')}</label>
              <input id="cbacc-1" type="text" className="input-field" placeholder={t('otherNamePlaceholder')} value={outroNome} onChange={(e) => setOutroNome(e.target.value)} />
            </div>
            {/* no celular um campo por linha: o telefone (pais + numero) ficava espremido (dono 09/11) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="cbacc-2" className="block text-sm font-medium text-gray-700 mb-1">{t('phoneLabel')}</label>
                <CampoTelefone id="cbacc-2" value={outroTelefone} onChange={(v) => setOutroTelefone(v)} />
              </div>
              <div>
                <label htmlFor="cbacc-3" className="block text-sm font-medium text-gray-700 mb-1">{t('emailLabel')}</label>
                <input id="cbacc-3" type="email" className="input-field" placeholder={t('emailPlaceholder')} value={outroEmail} onChange={(e) => setOutroEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="cbacc-4" className="block text-sm font-medium text-gray-700 mb-1">{t('plateLabel')}</label>
                <div className="flex gap-2">
                  <input id="cbacc-4" type="text" className="input-field uppercase" placeholder={t('platePlaceholder')} maxLength={10} aria-invalid={!placaValida(outroPlaca)} value={outroPlaca}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setOutroPlaca(v);
                      if (v.replace(/[^a-zA-Z0-9]/g, '').length === 7) buscarOutroPlaca(v);
                    }} />
                  {buscandoOutroPlaca && <div className="flex items-center"><div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>}
                </div>
                {!placaValida(outroPlaca) && <p role="alert" className="mt-1 text-sm text-red-700" data-testid="placa-outro-invalida">{tErros('PLACA_INVALIDA')}</p>}
                {outroVeiculoDetalhes && (
                  <p className="text-xs text-green-600 mt-1">{outroVeiculoDetalhes.marca} {outroVeiculoDetalhes.modelo} - {outroVeiculoDetalhes.ano} {outroVeiculoDetalhes.cor}</p>
                )}
              </div>
              <div>
                <label htmlFor="cbacc-5" className="block text-sm font-medium text-gray-700 mb-1">{t('vehicleLabel')}</label>
                <input id="cbacc-5" type="text" className="input-field" placeholder={t('vehiclePlaceholder')} value={outroVeiculo} onChange={(e) => setOutroVeiculo(e.target.value)} />
              </div>
            </div>

            {!editandoOutro && (
            <div>
              <label htmlFor="cbacc-6" className="block text-sm font-medium text-gray-700 mb-1">{t('photosLabel')}</label>
              <input id="cbacc-6" ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={handlePhotoUpload} />
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
            )}

            <div>
              <label htmlFor="cbacc-7" className="block text-sm font-medium text-gray-700 mb-1">{t('observationsLabel')}</label>
              <textarea id="cbacc-7"
                className="input-field min-h-[80px]"
                placeholder={t('observationsPlaceholder')}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>

          {outroEmail && !editandoOutro && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
              <p className="text-sm text-blue-800">
                {t('notifyInfo')}
              </p>
            </div>
          )}

          <div className={`mt-6 grid gap-2 ${editandoOutro ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {editandoOutro && <button type="button" onClick={() => { setEditandoOutro(false); loadData(); }} className="btn-secondary">{t('cancelar')}</button>}
            <button
              onClick={handleRegister}
              disabled={!outroNome || !outroPlaca || !placaValida(outroPlaca) || registering}
              className="btn-primary w-full disabled:opacity-50"
              data-testid="registrar-outro"
            >
              {registering ? t('registeringBtn') : editandoOutro ? t('salvar') : t('registerBtn')}
            </button>
          </div>
        </div>
          ) : (
            <div className="card"><p className="text-sm text-gray-600">{t('aguardandoRegistro')}</p></div>
          )}

          {registered && !editandoOutro && (
            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep('chat')} className="btn-primary flex-1">
                {t('sendMessageBtn')}
              </button>
              <button onClick={() => setStep('orcamentos')} className="btn-secondary flex-1">
                {t('viewQuotesBtn')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chat tab */}
      {step === 'chat' && (
        <div ref={chatRef} className="card !p-0 overflow-hidden">
          <div className="bg-gray-50 p-4 border-b">
            <p className="font-medium text-gray-900">{outroNome || t('chatOtherFallback')}</p>
            <p className="text-xs text-gray-500">{outroVeiculo || t('chatVehicleFallback')} - {outroPlaca || t('chatNoPlateFallback')}</p>
          </div>

          <div className="relative">
          <div ref={chatListaRef} {...chatPropsLista} className="h-[400px] overflow-y-auto overscroll-contain p-4 space-y-3" data-testid="conversa-lista">
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
                      <p className={`text-xs font-semibold mb-0.5 ${isMyMsg ? 'text-white' : 'text-gray-600'}`}>
                        {msg.remetente_tipo === 'proprietario' ? t('chatSenderProprietario') : outroNome || t('chatSenderOutroFallback')}
                      </p>
                    )}
                    <p className="text-sm">{msg.texto}</p>
                    <p className={`text-xs mt-1 ${isMyMsg ? 'text-white' : 'text-gray-500'}`}>
                      {msg.id.startsWith('temp-') ? tConv('enviando') : formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <AvisoNovaMensagem visivel={chatNova} aoTocar={() => chatParaFim()} texto={tConv('novaMensagem')} />
          </div>
          <div className="conversa-composer p-3 border-t">
            <CampoConversa valor={novaMensagem} aoMudar={setNovaMensagem} aoEnviar={sendMessage}
              placeholder={t('chatInputPlaceholder')} rotuloEnviar={tConv('enviar')} testIdEnviar="conversa-enviar" />
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
                  {/* os orcamentos sao do carro de quem registrou: so ele aceita (A4) */}
                  {tipoAcidente === 'outro_causou'
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
                      {tipoAcidente !== 'sem_outro' && isProprietario && (
                        tipoAcidente === 'outro_causou'
                          ? (
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
                      {isProprietario && !isAceito && (
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
