'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { compressImage } from '@/lib/image-compress';

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
    profile?: { telefone?: string; email?: string };
  } | null;
}

export default function AcidenteRegistroPage() {
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
  const isProprietario = user?.id === emergData?.profile_id;

  // Determine if current user is the victim (only victims can accept quotes and send to responsible)
  // eu_causei: registrant is responsible, so registrant is NOT victim
  // outro_causou: registrant is victim
  const isVitima = emergData?.descricao?.match(/\[TIPO:(\w+)\]/)
    ? (emergData.descricao.match(/\[TIPO:(\w+)\]/)?.[1] === 'outro_causou'
        ? user?.id === emergData?.profile_id   // registrant is victim
        : user?.id !== emergData?.profile_id)  // eu_causei: registrant is NOT victim
    : isProprietario; // fallback for legacy data

  // Load existing data
  const loadData = useCallback(async () => {
    if (!emergenciaId) return;

    // Check if outro veiculo already registered
    const { data: outros } = await supabase
      .from('emergencia_outro_veiculo')
      .select('*')
      .eq('emergencia_id', emergenciaId)
      .limit(1);

    if (outros && outros.length > 0) {
      const outro = outros[0] as OutroVeiculo;
      setOutroNome(outro.nome);
      setOutroTelefone(outro.telefone || '');
      setOutroEmail(outro.email || '');
      setOutroPlaca(outro.placa);
      setOutroVeiculo(outro.veiculo_descricao || '');
      setObservacoes(outro.observacoes || '');
      setOutroVeiculoId(outro.id);
      setRegistered(true);
    }

    // Load messages
    const { data: msgs } = await supabase
      .from('emergencia_mensagens')
      .select('*')
      .eq('emergencia_id', emergenciaId)
      .order('created_at', { ascending: true });

    if (msgs) setMensagens(msgs as Mensagem[]);

    // Load orcamentos if there's a linked solicitacao
    setLoadingOrc(true);
    const { data: emerg } = await supabase
      .from('emergencias')
      .select('solicitacao_id, profile_id, descricao')
      .eq('id', emergenciaId)
      .single();

    if (emerg) setEmergData(emerg as { solicitacao_id: string | null; profile_id: string | null; descricao: string | null });

    // Fetch vehicle info for the emergency owner
    if (emerg?.solicitacao_id) {
      const { data: solData } = await supabase
        .from('solicitacoes')
        .select('veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, placa, cor)')
        .eq('id', emerg.solicitacao_id)
        .single();

      if (solData?.veiculo) {
        const v = solData.veiculo as unknown as { fipe_marca: string; fipe_modelo: string; fipe_ano: string; placa: string; cor: string };
        setVeiculoProprietario(v);
      }
    }

    if (emerg?.solicitacao_id) {
      const { data: orcs } = await supabase
        .from('orcamentos')
        .select('id, valor_total, prazo_dias, status, observacoes, oficina:oficinas(nome_fantasia, endereco, cidade, estado, profile:profiles(telefone, email))')
        .eq('solicitacao_id', emerg.solicitacao_id);

      if (orcs) setOrcamentos(orcs as unknown as Orcamento[]);
    }
    setLoadingOrc(false);
  }, [emergenciaId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time messages
  useEffect(() => {
    if (!emergenciaId) return;
    const channel = supabase
      .channel(`emergencia-msgs-${emergenciaId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'emergencia_mensagens',
        filter: `emergencia_id=eq.${emergenciaId}`,
      }, (payload) => {
        setMensagens((prev) => [...prev, payload.new as Mensagem]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [emergenciaId]);

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

    // 1. Save outro veiculo
    const { data: outro, error: outroError } = await supabase
      .from('emergencia_outro_veiculo')
      .insert({
        emergencia_id: emergenciaId,
        nome: outroNome,
        telefone: outroTelefone || null,
        email: outroEmail || null,
        placa: outroPlaca,
        veiculo_descricao: outroVeiculo || null,
        observacoes: observacoes || null,
      })
      .select()
      .single();

    if (outroError) {
      setError(outroError.message);
      setRegistering(false);
      return;
    }

    setOutroVeiculoId(outro.id);

    // 2. Upload photos
    for (const foto of fotosOutro) {
      const fileName = `emergencia/${emergenciaId}/outro/${Date.now()}-${foto.file.name}`;
      const { data: uploadData } = await supabase.storage
        .from('damage-photos')
        .upload(fileName, foto.file);

      if (uploadData?.path) {
        const { data: { publicUrl } } = supabase.storage
          .from('damage-photos')
          .getPublicUrl(uploadData.path);

        await supabase.from('emergencia_outro_veiculo_fotos').insert({
          outro_veiculo_id: outro.id,
          foto_url: publicUrl,
        });
      }
    }

    // 3. Notify the other person via API (sends email + WhatsApp)
    if (outroEmail || outroTelefone) {
      try {
        await fetch('/api/notificar-acidente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emergenciaId, outroVeiculoId: outro.id }),
        });
      } catch {
        // Non-blocking: notification failure shouldn't prevent registration
        console.warn('Falha ao enviar notificação');
      }
    }

    setRegistering(false);
    setRegistered(true);
  };

  const sendMessage = async () => {
    if (!novaMensagem.trim() || !emergenciaId) return;
    setSendingMsg(true);

    const texto = novaMensagem;
    setNovaMensagem('');

    const meuTipo = isProprietario ? 'proprietario' : 'outro';

    // Optimistic update
    const tempMsg: Mensagem = {
      id: `temp-${Date.now()}`,
      remetente_tipo: meuTipo,
      texto,
      created_at: new Date().toISOString(),
    };
    setMensagens((prev) => [...prev, tempMsg]);

    const { data: inserted } = await supabase.from('emergencia_mensagens').insert({
      emergencia_id: emergenciaId,
      remetente_tipo: meuTipo,
      remetente_id: user?.id || null,
      texto,
    }).select().single();

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

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // Parse accident type from emergencia descricao
  const tipoMatch = emergData?.descricao?.match(/\[TIPO:(\w+)\]/);
  const tipoAcidente = tipoMatch ? tipoMatch[1] : null;

  // Fallback: try old format [RESP:xxx]
  const respMatch = !tipoAcidente ? emergData?.descricao?.match(/\[RESP:(\w+)\]/) : null;
  const responsabilidadeLegacy = respMatch ? respMatch[1] : null;

  // Determine labels based on tipo_acidente
  // eu_causei: registrant = Responsável, outro = Vítima
  // outro_causou: registrant = Vítima, outro = Responsável
  const registranteLabel = tipoAcidente === 'eu_causei' ? 'Responsável' : tipoAcidente === 'outro_causou' ? 'Vítima' : 'Motorista 1';
  const outroLabel = tipoAcidente === 'eu_causei' ? 'Vítima' : tipoAcidente === 'outro_causou' ? 'Responsável' : 'Motorista 2';
  const registranteColor = tipoAcidente === 'eu_causei' ? 'text-red-600' : tipoAcidente === 'outro_causou' ? 'text-green-600' : 'text-blue-600';
  const outroColor = tipoAcidente === 'eu_causei' ? 'text-green-600' : tipoAcidente === 'outro_causou' ? 'text-red-600' : 'text-orange-600';
  const registranteBorderColor = tipoAcidente === 'eu_causei' ? 'border-l-red-400' : tipoAcidente === 'outro_causou' ? 'border-l-green-400' : 'border-l-blue-400';
  const outroBorderColor = tipoAcidente === 'eu_causei' ? 'border-l-green-400' : tipoAcidente === 'outro_causou' ? 'border-l-red-400' : 'border-l-orange-400';

  const tipoBadge: Record<string, { label: string; color: string }> = {
    eu_causei: { label: 'Você causou o acidente', color: 'bg-red-100 text-red-700' },
    outro_causou: { label: 'O outro motorista causou', color: 'bg-green-100 text-green-700' },
    sem_outro: { label: 'Sem outro envolvido', color: 'bg-gray-100 text-gray-700' },
  };

  // Legacy badges for old data
  const respBadge: Record<string, { label: string; color: string }> = {
    responsavel: { label: 'Assume responsabilidade', color: 'bg-red-100 text-red-700' },
    vitima: { label: 'Vítima', color: 'bg-green-100 text-green-700' },
    dividida: { label: 'Responsabilidade dividida - 50%', color: 'bg-yellow-100 text-yellow-700' },
    individual: { label: 'Cada um paga o seu', color: 'bg-gray-100 text-gray-700' },
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
          <p className="text-gray-600 text-sm">Registre o outro veículo e acompanhe os orçamentos</p>
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
          Envolvidos
        </button>
        <button
          onClick={() => setStep('chat')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            step === 'chat' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'
          }`}
        >
          Mensagens {mensagens.length > 0 && `(${mensagens.length})`}
        </button>
        <button
          onClick={() => setStep('orcamentos')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            step === 'orcamentos' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'
          }`}
        >
          Orçamentos {orcamentos.length > 0 && `(${orcamentos.length})`}
        </button>
      </div>

      {/* Registration tab */}
      {step === 'registro' && !registered && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados do outro veículo</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do outro motorista *</label>
              <input type="text" className="input-field" placeholder="Nome completo" value={outroNome} onChange={(e) => setOutroNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input type="tel" className="input-field" placeholder="(11) 99999-0000" value={outroTelefone} onChange={(e) => setOutroTelefone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" className="input-field" placeholder="email@email.com" value={outroEmail} onChange={(e) => setOutroEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Placa do veículo *</label>
                <div className="flex gap-2">
                  <input type="text" className="input-field uppercase" placeholder="ABC1D23" maxLength={8} value={outroPlaca}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Veículo (marca/modelo)</label>
                <input type="text" className="input-field" placeholder="Ex: Fiat Argo" value={outroVeiculo} onChange={(e) => setOutroVeiculo(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fotos do outro veículo</label>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
              <div className="flex gap-3 flex-wrap">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <textarea
                className="input-field min-h-[80px]"
                placeholder="Detalhes sobre o acidente, acordo feito no local..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>

          {outroEmail && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
              <p className="text-sm text-blue-800">
                O outro motorista receberá uma notificação por email para acompanhar o acidente e os orçamentos.
              </p>
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={!outroNome || !outroPlaca || registering}
            className="btn-primary w-full mt-6"
          >
            {registering ? 'Registrando...' : 'Registrar outro veículo'}
          </button>
        </div>
      )}

      {step === 'registro' && registered && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Veículos envolvidos</h2>

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
                <span className="text-gray-500">Nome:</span>
                <span className="text-gray-900 font-medium">{user?.nome || 'Você'}</span>
              </div>
              {veiculoProprietario && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Veículo:</span>
                    <span className="text-gray-900">{veiculoProprietario.fipe_marca} {veiculoProprietario.fipe_modelo}</span>
                  </div>
                  {veiculoProprietario.fipe_ano && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Ano:</span>
                      <span className="text-gray-900">{veiculoProprietario.fipe_ano}</span>
                    </div>
                  )}
                  {veiculoProprietario.placa && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Placa:</span>
                      <span className="text-gray-900 font-mono">{veiculoProprietario.placa}</span>
                    </div>
                  )}
                  {veiculoProprietario.cor && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Cor:</span>
                      <span className="text-gray-900">{veiculoProprietario.cor}</span>
                    </div>
                  )}
                </>
              )}
              {user?.telefone && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Telefone:</span>
                  <a href={`tel:${user.telefone}`} className="text-primary-600 hover:underline">{user.telefone}</a>
                </div>
              )}
              {emergData?.solicitacao_id && <p className="text-xs text-gray-500 mt-1">Solicitação registrada</p>}
            </div>
          </div>

          {/* Outro envolvido */}
          <div className={`card border-l-4 ${outroBorderColor}`}>
            <div className="flex items-center justify-between mb-2">
              <p className={`text-xs font-semibold ${outroColor} uppercase`}>{outroLabel}</p>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-xs text-green-600">Notificado</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Nome:</span>
                <span className="text-gray-900 font-medium">{outroNome}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Veículo:</span>
                <span className="text-gray-900">{outroVeiculo || 'Não informado'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Placa:</span>
                <span className="text-gray-900 font-mono">{outroPlaca}</span>
              </div>
              {outroTelefone && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Telefone:</span>
                  <a href={`tel:${outroTelefone}`} className="text-primary-600 hover:underline">{outroTelefone}</a>
                </div>
              )}
              {outroEmail && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Email:</span>
                  <span className="text-gray-900">{outroEmail}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={() => setStep('chat')} className="btn-primary flex-1">
              Enviar mensagem
            </button>
            <button onClick={() => setStep('orcamentos')} className="btn-secondary flex-1">
              Ver orçamentos
            </button>
          </div>
        </div>
      )}

      {/* Chat tab */}
      {step === 'chat' && (
        <div className="card !p-0 overflow-hidden">
          <div className="bg-gray-50 p-4 border-b">
            <p className="font-medium text-gray-900">{outroNome || 'Outro motorista'}</p>
            <p className="text-xs text-gray-500">{outroVeiculo || 'Veículo'} - {outroPlaca || 'Sem placa'}</p>
          </div>

          <div className="h-[400px] overflow-y-auto p-4 space-y-3">
            {mensagens.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-gray-400">Nenhuma mensagem ainda. Envie a primeira!</p>
              </div>
            )}
            {mensagens.map((msg) => {
              const meuTipo = isProprietario ? 'proprietario' : 'outro';
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
                        {msg.remetente_tipo === 'proprietario' ? 'Motorista' : outroNome || 'Outro envolvido'}
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
              placeholder="Digite uma mensagem..."
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
              <div className="animate-pulse text-gray-400">Carregando orçamentos...</div>
            </div>
          ) : orcamentos.length === 0 ? (
            <div className="card text-center py-12">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="font-semibold text-gray-900 mb-2">Nenhum orçamento ainda</h3>
              <p className="text-sm text-gray-500">
                Oficinas próximas estão avaliando os danos. Você receberá orçamentos por email assim que estiverem prontos.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  {tipoAcidente === 'eu_causei' || tipoAcidente === 'outro_causou'
                    ? 'A vítima decide qual orçamento aceitar. Após aceitar, as informações da oficina serão compartilhadas com o responsável.'
                    : 'Compartilhe esses orçamentos com o outro motorista para entrar em acordo sobre qual oficina usar para a reparação.'}
                </p>
              </div>

              {orcamentos.map((orc) => {
                const ofi = orc.oficina;
                const isAceito = orc.status === 'aceito';
                return (
                  <div key={orc.id} className={`card ${isAceito ? 'border-2 border-green-400' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{ofi?.nome_fantasia || 'Oficina'}</h3>
                        {isAceito && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Aceito</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-900">{formatCurrency(orc.valor_total)}</p>
                        <p className="text-xs text-gray-500">Prazo: {orc.prazo_dias} dias</p>
                      </div>
                    </div>

                    {/* Oficina details */}
                    {ofi && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Dados da oficina</p>
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
                                setNovaMensagem(`Orçamento da ${ofi?.nome_fantasia}: ${formatCurrency(orc.valor_total)}, prazo ${orc.prazo_dias} dias.${ofi?.endereco ? ' Endereço: ' + ofi.endereco + (ofi.cidade ? ', ' + ofi.cidade : '') : ''}${ofi?.profile?.telefone ? ' Tel: ' + ofi.profile.telefone : ''}`);
                              }}
                              className="btn-secondary flex-1 !py-2 text-sm"
                            >
                              Enviar ao responsável
                            </button>
                          )
                          : (
                            <button
                              onClick={() => {
                                setStep('chat');
                                setNovaMensagem(`Orçamento da ${ofi?.nome_fantasia}: ${formatCurrency(orc.valor_total)}, prazo ${orc.prazo_dias} dias.${ofi?.endereco ? ' Endereço: ' + ofi.endereco + (ofi.cidade ? ', ' + ofi.cidade : '') : ''}${ofi?.profile?.telefone ? ' Tel: ' + ofi.profile.telefone : ''}`);
                              }}
                              className="btn-secondary flex-1 !py-2 text-sm"
                            >
                              Enviar ao outro envolvido
                            </button>
                          )
                      )}
                      {isVitima && !isAceito && (
                        <Link
                          href={`/cliente/orcamentos/${emergData?.solicitacao_id}`}
                          className="btn-primary flex-1 !py-2 text-sm text-center"
                        >
                          Aceitar orçamento
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
