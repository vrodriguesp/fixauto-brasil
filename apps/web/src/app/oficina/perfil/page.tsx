'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { TIPOS_SERVICO, ESTADOS_BRASIL } from '@fixauto/shared';

export default function PerfilOficinaPage() {
  const { user, oficina, loading, refreshProfile } = useAuth();

  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [raio, setRaio] = useState(30);
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Sync state when oficina/user data loads
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const defaultHorario = {
    seg: { aberto: true, inicio: '08:00', fim: '18:00' },
    ter: { aberto: true, inicio: '08:00', fim: '18:00' },
    qua: { aberto: true, inicio: '08:00', fim: '18:00' },
    qui: { aberto: true, inicio: '08:00', fim: '18:00' },
    sex: { aberto: true, inicio: '08:00', fim: '18:00' },
    sab: { aberto: true, inicio: '08:00', fim: '12:00' },
    dom: { aberto: false, inicio: '', fim: '' },
  };
  const [horario, setHorario] = useState<Record<string, { aberto: boolean; inicio: string; fim: string }>>(defaultHorario);

  // Capacity per service type
  const [capacidade, setCapacidade] = useState<Record<string, number>>({});

  const DIAS = [
    { key: 'seg', label: 'Segunda' }, { key: 'ter', label: 'Terça' },
    { key: 'qua', label: 'Quarta' }, { key: 'qui', label: 'Quinta' },
    { key: 'sex', label: 'Sexta' }, { key: 'sab', label: 'Sábado' },
    { key: 'dom', label: 'Domingo' },
  ];

  useEffect(() => {
    if (oficina) {
      setNomeFantasia(oficina.nome_fantasia || '');
      setCnpj(oficina.cnpj || '');
      setEndereco(oficina.endereco || '');
      setCidade(oficina.cidade || '');
      setEstado(oficina.estado || '');
      setCep(oficina.cep || '');
      setRaio(oficina.raio_atendimento_km || 30);
      setEspecialidades(oficina.especialidades || []);
      setLogoUrl((oficina as any).logo_url || '');
      if ((oficina as any).horario_funcionamento) {
        setHorario((oficina as any).horario_funcionamento);
      }
      if ((oficina as any).capacidade_servicos) {
        setCapacidade((oficina as any).capacidade_servicos);
      }
    }
  }, [oficina]);

  useEffect(() => {
    if (user) {
      setNome(user.nome || '');
      setEmail(user.email || '');
      setTelefone(user.telefone || '');
    }
  }, [user]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !oficina) return;
    setUploadingLogo(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `oficinas/${oficina.id}/logo.${ext}`;
    const { data: uploadData } = await supabase.storage
      .from('damage-photos')
      .upload(fileName, file, { contentType: file.type, upsert: true });
    if (uploadData?.path) {
      const { data: urlData } = supabase.storage.from('damage-photos').getPublicUrl(uploadData.path);
      setLogoUrl(urlData.publicUrl);
      await supabase.from('oficinas').update({ logo_url: urlData.publicUrl }).eq('id', oficina.id);
    }
    setUploadingLogo(false);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  // Photos
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<{ id: string; foto_url: string; descricao: string | null; tipo: string }[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [fotoTipo, setFotoTipo] = useState('estrutura');

  useEffect(() => {
    if (oficina) {
      supabase
        .from('oficina_fotos')
        .select('*')
        .eq('oficina_id', oficina.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => { if (data) setFotos(data); });
    }
  }, [oficina]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !oficina) return;
    setUploadingPhoto(true);

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `oficinas/${oficina.id}/${Date.now()}.${ext}`;
      const { data: uploadData } = await supabase.storage
        .from('damage-photos')
        .upload(fileName, file, { contentType: file.type });

      if (uploadData?.path) {
        const { data: urlData } = supabase.storage
          .from('damage-photos')
          .getPublicUrl(uploadData.path);

        const { data: fotoData } = await supabase
          .from('oficina_fotos')
          .insert({ oficina_id: oficina.id, foto_url: urlData.publicUrl, tipo: fotoTipo })
          .select()
          .single();

        if (fotoData) setFotos((prev) => [fotoData, ...prev]);
      }
    }
    setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeletePhoto = async (id: string) => {
    await supabase.from('oficina_fotos').delete().eq('id', id);
    setFotos((prev) => prev.filter((f) => f.id !== id));
  };

  const toggleEspecialidade = (value: string) => {
    setEspecialidades((prev) =>
      prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);

    // Update oficina
    if (oficina) {
      const { error: ofiError } = await supabase
        .from('oficinas')
        .update({
          nome_fantasia: nomeFantasia,
          cnpj: cnpj || null,
          endereco,
          cidade,
          estado,
          cep,
          raio_atendimento_km: raio,
          especialidades,
          horario_funcionamento: horario,
          capacidade_servicos: capacidade,
        })
        .eq('id', oficina.id);
      if (ofiError) {
        setError(ofiError.message);
        setSaving(false);
        return;
      }
    }

    // Update profile
    if (user) {
      const { error: profError } = await supabase
        .from('profiles')
        .update({ nome, telefone })
        .eq('id', user.id);
      if (profError) {
        setError(profError.message);
        setSaving(false);
        return;
      }
    }

    await refreshProfile();
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  if (loading || !user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse text-gray-400">Carregando perfil...</div>
      </div>
    );
  }

  const [copied, setCopied] = useState(false);
  const publicUrl = oficina ? `${window.location.origin}/oficinas/${oficina.id}` : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Perfil da Oficina</h1>
        {oficina && (
          <div className="flex items-center gap-2">
            <a
              href={`/oficinas/${oficina.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary !py-2 !px-4 text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Ver página pública
            </a>
            <button
              onClick={handleCopyLink}
              className="btn-secondary !py-2 !px-4 text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {copied ? 'Link copiado!' : 'Compartilhar'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-green-800">Alterações salvas com sucesso!</p>
        </div>
      )}

      {/* Logo */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Logo da Oficina</h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-24 h-24 rounded-xl object-cover border-2 border-gray-200" />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-primary-100 flex items-center justify-center border-2 border-dashed border-primary-300">
                <span className="text-primary-700 font-bold text-3xl">{nomeFantasia.charAt(0) || 'O'}</span>
              </div>
            )}
          </div>
          <div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="btn-secondary !py-2 !px-4 text-sm">
              {uploadingLogo ? 'Enviando...' : logoUrl ? 'Trocar logo' : 'Adicionar logo'}
            </button>
            <p className="text-xs text-gray-500 mt-1">Aparece no perfil público e nas solicitações</p>
          </div>
        </div>
      </div>

      {/* Workshop info */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados da oficina</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome fantasia</label>
            <input type="text" className="input-field" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
            <input type="text" className="input-field" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
            <input type="text" className="input-field" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input type="text" className="input-field" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select className="input-field" value={estado} onChange={(e) => setEstado(e.target.value)}>
                {ESTADOS_BRASIL.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
              <input type="text" className="input-field" value={cep} onChange={(e) => setCep(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Raio de atendimento (km)
            </label>
            <input type="number" className="input-field" value={raio} onChange={(e) => setRaio(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Specialties */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Especialidades</h2>
        <p className="text-sm text-gray-500 mb-4">
          Selecione os serviços que sua oficina oferece. Você só receberá solicitações compatíveis.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {TIPOS_SERVICO.map((t) => {
            const isSelected = especialidades.includes(t.value);
            return (
              <label
                key={t.value}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleEspecialidade(t.value)}
                  className="w-4 h-4 text-primary-600 rounded"
                />
                <span className="text-lg">{t.icon}</span>
                <span className="text-sm font-medium text-gray-900">{t.label}</span>
              </label>
            );
          })}
        </div>
        {especialidades.length > 0 && (
          <p className="text-xs text-primary-600 mt-3">
            {especialidades.length} serviço(s) selecionado(s)
          </p>
        )}
      </div>

      {/* Capacity per service type */}
      {especialidades.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Capacidade por Serviço</h2>
          <p className="text-sm text-gray-500 mb-4">
            Defina o número máximo de carros que sua oficina pode atender simultaneamente por tipo de serviço.
          </p>
          <div className="space-y-3">
            {TIPOS_SERVICO.filter((t) => especialidades.includes(t.value)).map((t) => (
              <div key={t.value} className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-48">
                  <span className="text-lg">{t.icon}</span>
                  <span className="text-sm font-medium text-gray-700">{t.label}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  placeholder="Sem limite"
                  className="input-field !w-28 !py-1.5 text-sm text-center"
                  value={capacidade[t.value] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCapacidade((prev) => ({
                      ...prev,
                      [t.value]: val === '' ? 0 : Number(val),
                    }));
                  }}
                />
                <span className="text-xs text-gray-400">carros</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal info */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados pessoais</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input type="text" className="input-field" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className="input-field bg-gray-50" value={email} disabled />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <input type="tel" className="input-field" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Working hours */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Horário de Funcionamento</h2>
        <div className="space-y-3">
          {DIAS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <label className="flex items-center gap-2 w-28">
                <input
                  type="checkbox"
                  checked={horario[key]?.aberto ?? false}
                  onChange={(e) => setHorario({ ...horario, [key]: { ...horario[key], aberto: e.target.checked } })}
                  className="w-4 h-4 text-primary-600 rounded"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
              {horario[key]?.aberto ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    className="input-field !py-1 !px-2 text-sm !w-28"
                    value={horario[key]?.inicio || '08:00'}
                    onChange={(e) => setHorario({ ...horario, [key]: { ...horario[key], inicio: e.target.value } })}
                  />
                  <span className="text-gray-400">às</span>
                  <input
                    type="time"
                    className="input-field !py-1 !px-2 text-sm !w-28"
                    value={horario[key]?.fim || '18:00'}
                    onChange={(e) => setHorario({ ...horario, [key]: { ...horario[key], fim: e.target.value } })}
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">Fechado</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Photos */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Fotos da Oficina</h2>
        <p className="text-sm text-gray-500 mb-4">
          Adicione fotos da estrutura, equipamentos e serviços realizados. Elas aparecem na sua página pública.
        </p>

        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />

        <div className="flex items-center gap-3 mb-4">
          <select className="input-field !w-auto" value={fotoTipo} onChange={(e) => setFotoTipo(e.target.value)}>
            <option value="estrutura">Estrutura</option>
            <option value="servico">Serviços realizados</option>
            <option value="equipe">Equipe</option>
          </select>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="btn-primary !py-2 !px-4 text-sm"
          >
            {uploadingPhoto ? 'Enviando...' : '+ Adicionar fotos'}
          </button>
        </div>

        {fotos.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-400">Nenhuma foto adicionada</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {fotos.map((foto) => (
              <div key={foto.id} className="aspect-square rounded-lg overflow-hidden relative group">
                <img src={foto.foto_url} alt={foto.descricao || foto.tipo} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onClick={() => handleDeletePhoto(foto.id)}
                    className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <span className="absolute bottom-1 left-1 text-xs bg-black/50 text-white px-2 py-0.5 rounded">
                  {foto.tipo === 'estrutura' ? 'Estrutura' : foto.tipo === 'servico' ? 'Serviço' : 'Equipe'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>
    </div>
  );
}
