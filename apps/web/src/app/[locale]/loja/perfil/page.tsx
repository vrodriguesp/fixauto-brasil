'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
// endereco com pais e mapa (antes so CEP brasileiro via ViaCEP - auditoria M-14)
import EnderecoEstruturado, { juntarEndereco, separarEndereco, type ValorEndereco } from '@/components/forms/EnderecoEstruturado';

export default function PerfilLojaPage() {
  const t = useTranslations('lojaPerfil');
  const { user, loja, loading, refreshProfile } = useAuth();

  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [end, setEnd] = useState<ValorEndereco>({ rua: '', numero: '', cidade: '', estado: '', cep: '', latitude: null, longitude: null, pais: '' });
  const [raio, setRaio] = useState(30);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loja) {
      setNomeFantasia(loja.nome_fantasia || '');
      setCnpj(loja.cnpj || '');
      const partes = separarEndereco(loja.endereco || '');
      const l = loja as any;
      setEnd({
        rua: partes.rua, numero: partes.numero, cidade: loja.cidade || '', estado: loja.estado || '', cep: loja.cep || '',
        latitude: l.latitude != null ? Number(l.latitude) : null, longitude: l.longitude != null ? Number(l.longitude) : null, pais: l.pais || '',
      });
      setRaio(loja.raio_atendimento_km || 30);
    }
  }, [loja]);

  useEffect(() => {
    if (user) {
      setNome(user.nome || '');
      setEmail(user.email || '');
      setTelefone(user.telefone || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!loja) return;
    setSaving(true);
    await supabase.from('lojas_pecas').update({
      nome_fantasia: nomeFantasia,
      cnpj: cnpj || null,
      endereco: juntarEndereco(end.rua, end.numero),
      cidade: end.cidade,
      estado: end.estado,
      cep: end.cep,
      ...(end.latitude != null && end.longitude != null ? { latitude: end.latitude, longitude: end.longitude } : {}),
      ...(end.pais ? { pais: end.pais } : {}),
      raio_atendimento_km: raio,
    }).eq('id', loja.id);

    await supabase.from('profiles').update({ nome, telefone }).eq('id', user!.id);

    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading || !loja) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">{t('pageTitle')}</h1>

      <div className="card mb-6 space-y-4">
        <h2 className="font-semibold text-gray-900">{t('dadosPessoaisTitulo')}</h2>
        <div>
          <label htmlFor="c9a81-1" className="block text-sm font-medium text-gray-700 mb-1">{t('labelNome')}</label>
          <input id="c9a81-1" type="text" className="input-field" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label htmlFor="c9a81-2" className="block text-sm font-medium text-gray-700 mb-1">{t('labelEmail')}</label>
          <input id="c9a81-2" type="email" className="input-field bg-gray-50" value={email} disabled />
        </div>
        <div>
          <label htmlFor="c9a81-3" className="block text-sm font-medium text-gray-700 mb-1">{t('labelTelefone')}</label>
          <input id="c9a81-3" type="tel" className="input-field" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">{t('dadosLojaTitulo')}</h2>
        <div>
          <label htmlFor="c9a81-4" className="block text-sm font-medium text-gray-700 mb-1">{t('labelNomeFantasia')}</label>
          <input id="c9a81-4" type="text" className="input-field" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
        </div>
        <div>
          <label htmlFor="c9a81-5" className="block text-sm font-medium text-gray-700 mb-1">{t('labelCnpj')}</label>
          <input id="c9a81-5" type="text" className="input-field" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </div>
        <EnderecoEstruturado idBase="loja-end" valor={end} onChange={setEnd}
          perto={end.latitude != null && end.longitude != null ? { lat: end.latitude, lon: end.longitude } : null} />
        <div>
          <label htmlFor="c9a81-10" className="block text-sm font-medium text-gray-700 mb-1">{t('labelRaio')}</label>
          <input id="c9a81-10" type="number" className="input-field" value={raio} onChange={(e) => setRaio(Number(e.target.value))} />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? t('salvandoButton') : t('salvarButton')}
          </button>
          {saved && <span className="text-sm text-green-600">{t('salvoMsg')}</span>}
        </div>
      </div>
    </div>
  );
}
