'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { localePrefix as prefixoDoIdioma } from '@/i18n/routing';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compress';
import { TIPOS_SERVICO } from '@fixauto/shared';
import { Link, rota } from '@/i18n/navigation';
import EnderecoEstruturado, { juntarEndereco, separarEndereco, type ValorEndereco } from '@/components/forms/EnderecoEstruturado';
import { seguradorasDoPais } from '@/lib/seguradoras';

export default function PerfilOficinaPage() {
  const t = useTranslations('oficinaPerfil');
  const tErr = useTranslations('erros');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const { user, oficina, loading, refreshProfile } = useAuth();

  const [nomeFantasia, setNomeFantasia] = useState('');
  const [descricao, setDescricao] = useState('');
  const [cnpj, setCnpj] = useState('');
  // endereco em campos separados (rua, numero, CEP, cidade), conferido no mapa
  const [end, setEnd] = useState<ValorEndereco>({ rua: '', numero: '', cidade: '', estado: '', cep: '', latitude: null, longitude: null, pais: '' });
  const [raio, setRaio] = useState(30);
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  // seguradoras convencionadas (lista do pais + outras digitadas)
  const [convencionadas, setConvencionadas] = useState<string[]>([]);
  const [outraSeguradora, setOutraSeguradora] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

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
    { key: 'seg', label: t('segunda') }, { key: 'ter', label: t('terca') },
    { key: 'qua', label: t('quarta') }, { key: 'qui', label: t('quinta') },
    { key: 'sex', label: t('sexta') }, { key: 'sab', label: t('sabado') },
    { key: 'dom', label: t('domingo') },
  ];

  useEffect(() => {
    if (oficina) {
      setNomeFantasia(oficina.nome_fantasia || '');
      setCnpj(oficina.cnpj || '');
      const partes = separarEndereco(oficina.endereco || '', (oficina as { numero?: string | null }).numero);
      setEnd({
        rua: partes.rua, numero: partes.numero, cidade: oficina.cidade || '', estado: oficina.estado || '', cep: oficina.cep || '',
        latitude: oficina.latitude != null ? Number(oficina.latitude) : null, longitude: oficina.longitude != null ? Number(oficina.longitude) : null,
        pais: (oficina as { pais?: string | null }).pais || '',
      });
      setDescricao((oficina as { descricao?: string | null }).descricao || '');
      setRaio(oficina.raio_atendimento_km || 30);
      setEspecialidades(oficina.especialidades || []);
      setConvencionadas((oficina as { seguradoras_convencionadas?: string[] }).seguradoras_convencionadas || []);
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
    const compressed = await compressImage(file);
    const ext = compressed.name.split('.').pop() || 'jpg';
    const fileName = `oficinas/${oficina.id}/logo.${ext}`;
    const { data: uploadData } = await supabase.storage
      .from('publico')
      .upload(fileName, compressed, { contentType: compressed.type, upsert: true });
    if (uploadData?.path) {
      const { data: urlData } = supabase.storage.from('publico').getPublicUrl(uploadData.path);
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
      const compressed = await compressImage(file);
      const ext = compressed.name.split('.').pop() || 'jpg';
      const fileName = `oficinas/${oficina.id}/${Date.now()}.${ext}`;
      const { data: uploadData } = await supabase.storage
        .from('publico')
        .upload(fileName, compressed, { contentType: compressed.type });

      if (uploadData?.path) {
        const { data: urlData } = supabase.storage
          .from('publico')
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
          descricao: descricao.trim() || null,
          cnpj: cnpj || null,
          endereco: juntarEndereco(end.rua, end.numero),
          numero: end.numero.trim() || null,
          cidade: end.cidade,
          estado: end.estado,
          cep: end.cep,
          raio_atendimento_km: raio,
          especialidades,
          seguradoras_convencionadas: convencionadas,
          horario_funcionamento: horario,
          capacidade_servicos: capacidade,
          // posicao conferida no mapa (distancia ate os clientes)
          ...(end.latitude != null && end.longitude != null ? { latitude: end.latitude, longitude: end.longitude } : {}),
          ...(end.pais ? { pais: end.pais } : {}),
        })
        .eq('id', oficina.id);
      if (ofiError) {
        console.error(ofiError); setError(tErr((ofiError as { code?: string }).code === 'weak_password' ? 'SENHA_CURTA' : 'GENERICO'));
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
        console.error(profError); setError(tErr((profError as { code?: string }).code === 'weak_password' ? 'SENHA_CURTA' : 'GENERICO'));
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
        <div className="animate-pulse text-gray-400">{t('carregandoPerfil')}</div>
      </div>
    );
  }

  const localePrefix = prefixoDoIdioma(locale);
  const publicUrl = oficina && typeof window !== 'undefined' ? `${window.location.origin}${localePrefix}/oficinas/${oficina.id}` : '';

  const handleCopyLink = () => {
    // celular: menu de compartilhar do aparelho; computador: copia o link
    if (typeof navigator !== 'undefined' && (navigator as any).share && window.matchMedia('(pointer: coarse)').matches) {
      (navigator as any).share({ title: oficina?.nome_fantasia, url: publicUrl }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* celular: titulo em cima, botoes embaixo lado a lado (antes saiam da tela) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
        {oficina && oficina.ativa === false && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t('paginaPublicaAposAprovacao')}</p>
        )}
        {oficina && oficina.ativa !== false && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Link
              href={rota('/oficinas/[id]', { id: oficina.id })}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary !py-2 !px-3 text-sm flex items-center justify-center gap-2 min-h-[44px]"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {t('verPaginaPublica')}
            </Link>
            <button
              onClick={handleCopyLink}
              className="btn-secondary !py-2 !px-3 text-sm flex items-center justify-center gap-2 min-h-[44px]"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {copied ? t('linkCopiado') : t('compartilhar')}
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
          <p className="text-sm text-green-800">{t('alteracoesSalvas')}</p>
        </div>
      )}

      {/* Logo */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('logoDaOficina')}</h2>
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
              {uploadingLogo ? t('enviando') : logoUrl ? t('trocarLogo') : t('adicionarLogo')}
            </button>
            <p className="text-xs text-gray-500 mt-1">{t('apareceNoPerfilPublico')}</p>
          </div>
        </div>
      </div>

      {/* Workshop info */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('dadosDaOficina')}</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="c83a1-1" className="block text-sm font-medium text-gray-700 mb-1">{t('nomeFantasia')}</label>
            <input id="c83a1-1" type="text" className="input-field" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
          </div>
          <div>
            <label htmlFor="descricao-oficina" className="block text-sm font-medium text-gray-700 mb-1">{t('descricaoLabel')}</label>
            <textarea id="descricao-oficina" className="input-field min-h-[110px]" maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={t('descricaoPlaceholder')} />
            <p className="text-xs text-gray-500 mt-1">{t('descricaoAjuda')} ({descricao.length}/1000)</p>
          </div>
          <div>
            <label htmlFor="c83a1-2" className="block text-sm font-medium text-gray-700 mb-1">{t('cnpj')}</label>
            <input id="c83a1-2" type="text" className="input-field" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
          </div>
          <EnderecoEstruturado idBase="oficina-end" valor={end} onChange={setEnd}
            perto={end.latitude != null && end.longitude != null ? { lat: end.latitude, lon: end.longitude } : null} />
          <div>
            <label htmlFor="c83a1-101" className="block text-sm font-medium text-gray-700 mb-1">
              {t('raioDeAtendimento')}
            </label>
            <input id="c83a1-101" type="number" className="input-field" value={raio} onChange={(e) => setRaio(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Seguradoras convencionadas */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('seguradorasTitulo')}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('seguradorasTexto')}</p>
        <div className="flex flex-wrap gap-2">
          {Array.from(new Set([...seguradorasDoPais(end.pais), ...convencionadas])).map((s) => {
            const marcada = convencionadas.includes(s);
            return (
              <button key={s} type="button" aria-pressed={marcada}
                onClick={() => setConvencionadas((l) => (marcada ? l.filter((x) => x !== s) : [...l, s]))}
                className={`px-3 py-2 min-h-[40px] rounded-full text-sm border ${marcada ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {marcada ? '✓ ' : ''}{s}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-4">
          <input aria-label={t('seguradoraOutra')} type="text" maxLength={60} className="input-field flex-1" placeholder={t('seguradoraOutra')}
            value={outraSeguradora} onChange={(e) => setOutraSeguradora(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = outraSeguradora.trim(); if (v && !convencionadas.includes(v)) setConvencionadas([...convencionadas, v]); setOutraSeguradora(''); } }} />
          <button type="button" className="btn-secondary" disabled={!outraSeguradora.trim()}
            onClick={() => { const v = outraSeguradora.trim(); if (v && !convencionadas.includes(v)) setConvencionadas([...convencionadas, v]); setOutraSeguradora(''); }}>
            {t('seguradoraAdicionar')}
          </button>
        </div>
      </div>

      {/* Specialties */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('especialidades')}</h2>
        <p className="text-sm text-gray-500 mb-4">
          {t('selecioneServicos')}
        </p>
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
          {TIPOS_SERVICO.map((tipo) => {
            const isSelected = especialidades.includes(tipo.value);
            return (
              <label
                key={tipo.value}
                className={`flex items-center gap-3 p-3 min-w-0 rounded-lg border-2 cursor-pointer transition-all ${
                  isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleEspecialidade(tipo.value)}
                  className="w-4 h-4 flex-shrink-0 text-primary-600 rounded"
                />
                <span className="text-lg flex-shrink-0">{tipo.icon}</span>
                <span className="text-sm font-medium text-gray-900 min-w-0 break-words">{tc(`tiposServico.${tipo.value}`)}</span>
              </label>
            );
          })}
        </div>
        {especialidades.length > 0 && (
          <p className="text-xs text-primary-600 mt-3">
            {t('servicosSelecionados', { count: especialidades.length })}
          </p>
        )}
      </div>

      {/* Capacity per service type */}
      {especialidades.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('capacidadePorServico')}</h2>
          <p className="text-sm text-gray-500 mb-4">
            {t('defineNumeroMaximoCarros')}
          </p>
          <div className="space-y-3">
            {TIPOS_SERVICO.filter((svc) => especialidades.includes(svc.value)).map((svc) => (
              <div key={svc.value} className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-48">
                  <span className="text-lg">{svc.icon}</span>
                  <span className="text-sm font-medium text-gray-700">{tc(`tiposServico.${svc.value}`)}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  placeholder={t('semLimite')}
                  className="input-field !w-28 !py-1.5 text-sm text-center"
                  value={capacidade[svc.value] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCapacidade((prev) => ({
                      ...prev,
                      [svc.value]: val === '' ? 0 : Number(val),
                    }));
                  }}
                />
                <span className="text-xs text-gray-400">{t('carros')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal info */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('dadosPessoais')}</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="c83a1-7" className="block text-sm font-medium text-gray-700 mb-1">{t('nome')}</label>
            <input id="c83a1-7" type="text" className="input-field" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label htmlFor="c83a1-8" className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
            <input id="c83a1-8" type="email" className="input-field bg-gray-50" value={email} disabled />
          </div>
          <div>
            <label htmlFor="c83a1-9" className="block text-sm font-medium text-gray-700 mb-1">{t('telefone')}</label>
            <input id="c83a1-9" type="tel" className="input-field" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Working hours */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('horarioDeFuncionamento')}</h2>
        <div className="space-y-3">
          {DIAS.map(({ key, label }) => (
            <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 w-28 shrink-0">
                <input
                  type="checkbox"
                  checked={horario[key]?.aberto ?? false}
                  onChange={(e) => setHorario({ ...horario, [key]: { ...horario[key], aberto: e.target.checked } })}
                  className="w-4 h-4 text-primary-600 rounded"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
              {horario[key]?.aberto ? (
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="time"
                    aria-label={label}
                    className="input-field !py-1 !px-2 text-sm !w-[6.75rem] min-w-0"
                    value={horario[key]?.inicio || '08:00'}
                    onChange={(e) => setHorario({ ...horario, [key]: { ...horario[key], inicio: e.target.value } })}
                  />
                  <span className="text-gray-400">{t('as')}</span>
                  <input
                    type="time"
                    className="input-field !py-1 !px-2 text-sm !w-[6.75rem] min-w-0"
                    value={horario[key]?.fim || '18:00'}
                    onChange={(e) => setHorario({ ...horario, [key]: { ...horario[key], fim: e.target.value } })}
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">{t('fechado')}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Photos */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('fotosDaOficina')}</h2>
        <p className="text-sm text-gray-500 mb-4">
          {t('adicioneFotosEstrutura')}
        </p>

        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />

        <div className="flex items-center gap-3 mb-4">
          <select className="input-field !w-auto" value={fotoTipo} onChange={(e) => setFotoTipo(e.target.value)}>
            <option value="estrutura">{t('estrutura')}</option>
            <option value="servico">{t('servicosRealizados')}</option>
            <option value="equipe">{t('equipe')}</option>
          </select>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="btn-primary !py-2 !px-4 text-sm"
          >
            {uploadingPhoto ? t('enviando') : t('adicionarFotos')}
          </button>
        </div>

        {fotos.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-400">{t('nenhumaFotoAdicionada')}</p>
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
                  {foto.tipo === 'estrutura' ? t('estrutura') : foto.tipo === 'servico' ? t('servico') : t('equipe')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? t('salvando') : t('salvarAlteracoes')}
        </button>
      </div>
    </div>
  );
}
