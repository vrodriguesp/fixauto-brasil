'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
// endereco com pais e mapa (antes so CEP brasileiro via ViaCEP - auditoria M-14)
import EnderecoEstruturado, { juntarEndereco, separarEndereco, type ValorEndereco } from '@/components/forms/EnderecoEstruturado';
import CampoTelefone from '@/components/forms/CampoTelefone';
import { usePecasV3 } from '@/hooks/use-pecas-v3';
import { PerfilFiscalCampos, fiscalDoPerfil, colunasFiscais, type ValorFiscal } from '@/components/pecas/FornecedorV3';
import AvisosNavegador from '@/components/pecas/AvisosNavegador';
import PaginaPublicaLoja, { paginaPublicaDoPerfil, colunasPaginaPublica, type ValorPaginaPublica } from '@/components/pecas/PaginaPublicaLoja';

export default function PerfilLojaPage() {
  const t = useTranslations('lojaPerfil');
  const tp = useTranslations('pecas');
  const { user, loja, loading, refreshProfile } = useAuth();
  // lote 1 de pecas (17/11): telefone comercial (fornecedores_contato, so o dono le), so com o
  // interruptor; vai para a oficina compradora so depois do pedido confirmado (/api/contato-pedido-peca)
  const v3 = usePecasV3();
  const [telefoneComercial, setTelefoneComercial] = useState('');
  const [tinhaComercial, setTinhaComercial] = useState(false);
  // lote 2: perfil fiscal (registro no IVA, aliquota, regime de margem para usadas), so com o interruptor
  const [fiscal, setFiscal] = useState<ValorFiscal>({ registrado: null, pct: '', margem: false });
  // lote 4: pagina publica (so quando liberada para a loja: interruptor proprio ou conta de teste)
  const locale = useLocale();
  const [pub, setPub] = useState<ValorPaginaPublica>(() => paginaPublicaDoPerfil(null));
  const [estadoPub, setEstadoPub] = useState<{ liberada: boolean; existe: boolean; teste: boolean; url: string | null } | null>(null);
  const carregarEstadoPub = () => fetch(`/api/loja/pagina-publica?l=${encodeURIComponent(locale)}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).then((j) => setEstadoPub(j ? { liberada: !!j.liberada, existe: !!j.existe, teste: !!j.teste, url: j.url || null } : null)).catch(() => setEstadoPub(null));

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
      setFiscal(fiscalDoPerfil(loja));
      setPub(paginaPublicaDoPerfil(loja));
    }
  }, [loja]);

  useEffect(() => {
    if (user) {
      setNome(user.nome || '');
      setEmail(user.email || '');
      setTelefone(user.telefone || '');
    }
  }, [user]);

  useEffect(() => {
    if (!v3 || !loja) return;
    carregarEstadoPub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v3, loja?.id]);

  useEffect(() => {
    if (!v3 || !loja) return;
    supabase.from('fornecedores_contato').select('telefone').eq('fornecedor_tipo', 'loja').eq('fornecedor_id', loja.id).maybeSingle()
      .then(({ data }) => { setTelefoneComercial(data?.telefone || ''); setTinhaComercial(!!data); });
  }, [v3, loja]);

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
      // lote 2: so com o interruptor e so depois de preenchido uma vez (sem isso, nada muda)
      ...(v3 ? colunasFiscais(fiscal) || {} : {}),
      // lote 4: so com a pagina liberada (sem isso, nada muda)
      ...(v3 && estadoPub?.liberada ? colunasPaginaPublica(pub) : {}),
    }).eq('id', loja.id);

    await supabase.from('profiles').update({ nome, telefone }).eq('id', user!.id);

    // vazio = usa o telefone do perfil (a tabela nao tem DELETE pelo cliente: grava vazio)
    if (v3 && (telefoneComercial.trim() || tinhaComercial)) {
      const { error: eTel } = await supabase.from('fornecedores_contato').upsert(
        { fornecedor_tipo: 'loja', fornecedor_id: loja.id, telefone: telefoneComercial.trim().slice(0, 30), updated_at: new Date().toISOString() },
        { onConflict: 'fornecedor_tipo,fornecedor_id' }
      );
      if (!eTel) setTinhaComercial(true);
    }

    await refreshProfile();
    if (v3 && estadoPub?.liberada) await carregarEstadoPub();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading || !loja || v3 === null) {
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
          <CampoTelefone id="c9a81-3" value={telefone} onChange={(v) => setTelefone(v)} pais={end.pais} />
        </div>
        {v3 && (
          <div>
            <label htmlFor="perfil-telefone-comercial" className="block text-sm font-medium text-gray-700 mb-1">{tp('telefoneComercial')}</label>
            <input id="perfil-telefone-comercial" data-testid="perfil-telefone-comercial" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} className="input-field"
              value={telefoneComercial} onChange={(e) => setTelefoneComercial(e.target.value)} />
            <p className="text-xs text-gray-500 mt-1">{tp('telefoneComercialAjuda')}</p>
          </div>
        )}
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
        {v3 && <PerfilFiscalCampos valor={fiscal} aoMudar={setFiscal} pais={end.pais || loja.pais} />}
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
      {/* lote 4: pagina publica (so com a tela nova e a pagina liberada) */}
      {v3 && estadoPub?.liberada && (
        <PaginaPublicaLoja valor={pub} aoMudar={setPub} teste={estadoPub.teste} url={estadoPub.existe ? estadoPub.url : null}
          endereco={{ latitude: end.latitude, longitude: end.longitude, cidade: end.cidade, endereco: juntarEndereco(end.rua, end.numero) }} />
      )}
      {v3 && estadoPub?.liberada && (
        <div className="flex items-center gap-3 mt-4">
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50" data-testid="loja-pagina-publica-salvar">
            {saving ? t('salvandoButton') : t('salvarButton')}
          </button>
          {saved && <span className="text-sm text-green-600">{t('salvoMsg')}</span>}
        </div>
      )}
      {/* lote 3c: avisos no navegador (so com a tela nova) */}
      {v3 && <AvisosNavegador />}
    </div>
  );
}
