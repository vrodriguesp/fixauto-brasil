'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { buscarEnderecoPorCep, formatCep, cepEstaCompleto } from '@/lib/cep';
import { ESTADOS_BRASIL } from '@fixauto/shared';

export default function PerfilLojaPage() {
  const t = useTranslations('lojaPerfil');
  const { user, loja, loading, refreshProfile } = useAuth();

  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [raio, setRaio] = useState(30);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepErro, setCepErro] = useState('');

  const handleCepChange = async (raw: string) => {
    const formatted = formatCep(raw);
    setCep(formatted);
    setCepErro('');
    if (!cepEstaCompleto(formatted)) return;
    setBuscandoCep(true);
    const resultado = await buscarEnderecoPorCep(formatted);
    setBuscandoCep(false);
    if (!resultado) {
      setCepErro(t('cepErro'));
      return;
    }
    setEndereco(resultado.logradouro || endereco);
    setCidade(resultado.localidade);
    setEstado(resultado.uf);
  };

  useEffect(() => {
    if (loja) {
      setNomeFantasia(loja.nome_fantasia || '');
      setCnpj(loja.cnpj || '');
      setEndereco(loja.endereco || '');
      setCidade(loja.cidade || '');
      setEstado(loja.estado || '');
      setCep(loja.cep || '');
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
      endereco,
      cidade,
      estado,
      cep,
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
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelNome')}</label>
          <input type="text" className="input-field" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelEmail')}</label>
          <input type="email" className="input-field bg-gray-50" value={email} disabled />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelTelefone')}</label>
          <input type="tel" className="input-field" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">{t('dadosLojaTitulo')}</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelNomeFantasia')}</label>
          <input type="text" className="input-field" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelCnpj')}</label>
          <input type="text" className="input-field" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelCep')}</label>
          <input type="text" inputMode="numeric" maxLength={9} className="input-field !w-40" placeholder={t('cepPlaceholder')} value={cep} onChange={(e) => handleCepChange(e.target.value)} />
          {buscandoCep && <p className="text-xs text-gray-400 mt-1">{t('buscandoCep')}</p>}
          {cepErro && <p className="text-xs text-red-500 mt-1">{cepErro}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelEndereco')}</label>
          <input type="text" className="input-field" placeholder={t('enderecoPlaceholder')} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelCidade')}</label>
            <input type="text" className="input-field" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelEstado')}</label>
            <select className="input-field" value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ESTADOS_BRASIL.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelRaio')}</label>
          <input type="number" className="input-field" value={raio} onChange={(e) => setRaio(Number(e.target.value))} />
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
