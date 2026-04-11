'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

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
  oficina: { nome_fantasia: string } | null;
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
  const [fotosOutro, setFotosOutro] = useState<{ file: File; preview: string }[]>([]);
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
      .select('solicitacao_id')
      .eq('id', emergenciaId)
      .single();

    if (emerg?.solicitacao_id) {
      const { data: orcs } = await supabase
        .from('orcamentos')
        .select('id, valor_total, prazo_dias, oficina:oficinas(nome_fantasia)')
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

    await supabase.from('emergencia_mensagens').insert({
      emergencia_id: emergenciaId,
      remetente_tipo: 'proprietario',
      remetente_id: user?.id || null,
      texto: novaMensagem,
    });

    setNovaMensagem('');
    setSendingMsg(false);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

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
          Outro Veículo
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
                <input type="text" className="input-field" placeholder="ABC-1234" value={outroPlaca} onChange={(e) => setOutroPlaca(e.target.value)} />
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
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Veículo registrado</p>
              <p className="text-sm text-gray-500">
                {outroEmail ? 'O outro motorista foi notificado por email' : 'Registro salvo com sucesso'}
              </p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Motorista:</span>
              <span className="text-gray-900">{outroNome}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Veículo:</span>
              <span className="text-gray-900">{outroVeiculo || 'Não informado'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Placa:</span>
              <span className="text-gray-900">{outroPlaca}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Telefone:</span>
              <span className="text-gray-900">{outroTelefone || 'Não informado'}</span>
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
            {mensagens.map((msg) => (
              <div key={msg.id} className={`flex ${msg.remetente_tipo === 'proprietario' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                  msg.remetente_tipo === 'proprietario'
                    ? 'bg-primary-600 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-900 rounded-bl-md'
                }`}>
                  <p className="text-sm">{msg.texto}</p>
                  <p className={`text-xs mt-1 ${msg.remetente_tipo === 'proprietario' ? 'text-primary-200' : 'text-gray-400'}`}>
                    {formatTime(msg.created_at)}
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
                  Compartilhe esses orçamentos com o outro motorista para entrar em acordo
                  sobre qual oficina usar para a reparação.
                </p>
              </div>

              {orcamentos.map((orc) => (
                <div key={orc.id} className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{orc.oficina?.nome_fantasia || 'Oficina'}</h3>
                      <p className="text-sm text-gray-500">Prazo: {orc.prazo_dias} dias</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900">{formatCurrency(orc.valor_total)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button className="btn-success flex-1 !py-2 text-sm">
                      Aceitar
                    </button>
                    <button
                      onClick={() => {
                        setStep('chat');
                        setNovaMensagem(`O que acha do orçamento da ${orc.oficina?.nome_fantasia} por ${formatCurrency(orc.valor_total)}?`);
                      }}
                      className="btn-secondary flex-1 !py-2 text-sm"
                    >
                      Discutir
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
