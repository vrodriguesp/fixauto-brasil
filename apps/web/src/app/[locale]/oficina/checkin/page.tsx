'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useAgenda } from '@/hooks/use-agenda';
import { supabase } from '@/lib/supabase';
import { TIPOS_SERVICO, CORES_AGENDA } from '@fixauto/shared';

export default function ManualCheckinPage() {
  const router = useRouter();
  const { oficina } = useAuth();
  const { add: addEvento } = useAgenda();

  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  const [veiculoMarca, setVeiculoMarca] = useState('');
  const [veiculoModelo, setVeiculoModelo] = useState('');
  const [veiculoAno, setVeiculoAno] = useState('');
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [veiculoCor, setVeiculoCor] = useState('');
  const [tipoServico, setTipoServico] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataCheckin, setDataCheckin] = useState(new Date().toISOString().split('T')[0]);
  const [turnoCheckin, setTurnoCheckin] = useState('manha');
  const [prazoDias, setPrazoDias] = useState(5);
  const [valorEstimado, setValorEstimado] = useState('');
  const [cor, setCor] = useState('#3B82F6');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const dataEntrega = (() => {
    const d = new Date(dataCheckin + 'T12:00:00');
    d.setDate(d.getDate() + prazoDias);
    return d.toISOString().split('T')[0];
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome || !veiculoMarca || !veiculoModelo || !tipoServico) {
      setError('Preencha os campos obrigatórios');
      return;
    }
    setSaving(true);
    setError('');

    const tipoLabel = TIPOS_SERVICO.find(t => t.value === tipoServico)?.label || tipoServico;

    // Create agenda event
    const { error: agendaError } = await addEvento({
      titulo: `${tipoLabel} - ${veiculoMarca} ${veiculoModelo}`,
      descricao: `Cliente: ${clienteNome} | Placa: ${veiculoPlaca || 'N/A'} | Tel: ${clienteTelefone || 'N/A'}${descricao ? ' | ' + descricao : ''}${valorEstimado ? ' | Valor: R$ ' + valorEstimado : ''}`,
      data_inicio: `${dataCheckin}T${turnoCheckin === 'manha' ? '08:00:00' : '13:00:00'}Z`,
      data_fim: `${dataEntrega}T18:00:00Z`,
      tipo: 'externo',
      cor,
    });

    if (agendaError) {
      setError(typeof agendaError === 'string' ? agendaError : (agendaError as any).message || 'Erro ao registrar');
      setSaving(false);
      return;
    }

    // Check if client exists by email
    if (clienteEmail) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', clienteEmail)
        .single();

      if (existingProfile) {
        // Create notification for the client
        await supabase.from('notificacoes').insert({
          profile_id: existingProfile.id,
          tipo: 'checkin_manual',
          titulo: 'Veículo registrado na oficina',
          mensagem: `A oficina ${oficina?.nome_fantasia} registrou a entrada do seu veículo ${veiculoMarca} ${veiculoModelo}.`,
          dados: { oficina_id: oficina?.id },
        });
      }
    }

    setSaving(false);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Veículo registrado!</h1>
        <p className="text-gray-600 mb-6">
          O check-in de {veiculoMarca} {veiculoModelo} ({clienteNome}) foi registrado na agenda.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => router.push('/oficina/agenda')} className="btn-primary">
            Ver na Agenda
          </button>
          <button onClick={() => { setSuccess(false); setClienteNome(''); setVeiculoMarca(''); setVeiculoModelo(''); setDescricao(''); setVeiculoPlaca(''); }} className="btn-secondary">
            Registrar outro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Registrar Entrada de Veículo</h1>
      <p className="text-gray-600 mb-8">Registre manualmente a entrada de um veículo na oficina</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Client info */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados do cliente</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do cliente *</label>
              <input type="text" className="input-field" placeholder="Nome completo" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input type="tel" className="input-field" placeholder="(11) 99999-0000" value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" className="input-field" placeholder="email@email.com" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle info */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados do veículo</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marca *</label>
                <input type="text" className="input-field" placeholder="Ex: Volkswagen" value={veiculoMarca} onChange={(e) => setVeiculoMarca(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo *</label>
                <input type="text" className="input-field" placeholder="Ex: Gol" value={veiculoModelo} onChange={(e) => setVeiculoModelo(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
                <input type="text" className="input-field" placeholder="2023" value={veiculoAno} onChange={(e) => setVeiculoAno(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Placa</label>
                <input type="text" className="input-field" placeholder="ABC-1234" value={veiculoPlaca} onChange={(e) => setVeiculoPlaca(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                <input type="text" className="input-field" placeholder="Prata" value={veiculoCor} onChange={(e) => setVeiculoCor(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Service info */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Serviço</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de serviço *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TIPOS_SERVICO.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipoServico(t.value)}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      tipoServico === t.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-xl">{t.icon}</span>
                    <p className="text-xs text-gray-900 mt-1">{t.label}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição do serviço</label>
              <textarea className="input-field min-h-[80px]" placeholder="Detalhes do serviço a ser realizado..." value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor estimado (R$)</label>
              <input type="text" className="input-field" placeholder="0,00" value={valorEstimado} onChange={(e) => setValorEstimado(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Agendamento</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data check-in</label>
              <input type="date" className="input-field" value={dataCheckin} onChange={(e) => setDataCheckin(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Turno</label>
              <select className="input-field" value={turnoCheckin} onChange={(e) => setTurnoCheckin(e.target.value)}>
                <option value="manha">Manhã (08:00 - 12:00)</option>
                <option value="tarde">Tarde (13:00 - 17:00)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prazo (dias)</label>
              <input type="number" className="input-field" min={1} value={prazoDias} onChange={(e) => setPrazoDias(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Previsão de entrega</label>
              <input type="date" className="input-field bg-gray-50" value={dataEntrega} disabled />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cor na agenda</label>
            <div className="flex gap-2">
              {CORES_AGENDA.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${cor === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Registrando...' : 'Registrar Check-in'}
          </button>
        </div>
      </form>
    </div>
  );
}
