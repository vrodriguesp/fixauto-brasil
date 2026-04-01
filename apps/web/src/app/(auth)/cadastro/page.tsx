'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function CadastroPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-[80vh] flex items-center justify-center"><p>Carregando...</p></div>}>
      <CadastroPage />
    </Suspense>
  );
}

function CadastroPage() {
  const searchParams = useSearchParams();
  const tipoParam = searchParams.get('tipo') as 'cliente' | 'oficina' | null;

  const [userType, setUserType] = useState<'cliente' | 'oficina' | null>(tipoParam);
  const [step, setStep] = useState(tipoParam ? 2 : 1);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Workshop fields
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');

  const { signUp } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (tipoParam && (tipoParam === 'cliente' || tipoParam === 'oficina')) {
      setUserType(tipoParam);
      setStep(2);
    }
  }, [tipoParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !email || !password) {
      setError('Preencha todos os campos obrigatorios');
      return;
    }
    setError('');
    setLoading(true);

    const tipo = userType || 'cliente';
    const { error: authError } = await signUp(email, password, nome, telefone, tipo);

    if (authError) {
      setError(authError);
      setLoading(false);
      return;
    }

    // If oficina, also create the oficina record
    if (tipo === 'oficina') {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { error: ofiError } = await supabase.from('oficinas').insert({
          profile_id: authUser.id,
          nome_fantasia: nomeFantasia || nome,
          cnpj: cnpj || null,
          endereco: endereco || 'A definir',
          cidade: cidade || 'A definir',
          estado: estado || 'SP',
          cep: cep || '00000-000',
          latitude: -23.5505,  // Default SP, user can update later
          longitude: -46.6333,
          raio_atendimento_km: 30,
          especialidades: [],
        });
        if (ofiError) {
          setError(ofiError.message);
          setLoading(false);
          return;
        }
      }
    }

    setLoading(false);
    router.push(tipo === 'oficina' ? '/oficina/dashboard' : '/cliente/dashboard');
    router.refresh();
  };

  const title = userType === 'oficina' ? 'Cadastro da Oficina' : userType === 'cliente' ? 'Cadastro do Motorista' : 'Criar Conta';

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600 mt-2">Cadastre-se gratuitamente no FixAuto</p>
        </div>

        <div className="card">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Step 1: Choose type (only if no tipo param) */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Como deseja usar o FixAuto?</h2>
              <button
                onClick={() => { setUserType('cliente'); setStep(2); }}
                className="w-full p-6 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-primary-100">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Sou Motorista</p>
                    <p className="text-sm text-gray-500">Preciso de reparo ou manutencao no meu veiculo</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setUserType('oficina'); setStep(2); }}
                className="w-full p-6 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-primary-100">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Sou Oficina</p>
                    <p className="text-sm text-gray-500">Quero receber solicitacoes e enviar orcamentos</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Step 2: Personal info */}
          {step === 2 && (
            <form onSubmit={(e) => { e.preventDefault(); userType === 'oficina' ? setStep(3) : handleSubmit(e); }} className="space-y-4">
              {!tipoParam && (
                <div className="flex items-center gap-2 mb-4">
                  <button type="button" onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">Dados pessoais</h2>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
                <input type="text" className="input-field" placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" className="input-field" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input type="tel" className="input-field" placeholder="(11) 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                <input type="password" className="input-field" placeholder="Minimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Criando conta...' : userType === 'oficina' ? 'Proximo' : 'Criar conta'}
              </button>
            </form>
          )}

          {/* Step 3: Workshop info */}
          {step === 3 && userType === 'oficina' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <button type="button" onClick={() => setStep(2)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-lg font-semibold text-gray-900">Dados da oficina</h2>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome fantasia *</label>
                <input type="text" className="input-field" placeholder="Nome da oficina" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ (opcional)</label>
                <input type="text" className="input-field" placeholder="00.000.000/0001-00" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endereco</label>
                <input type="text" className="input-field" placeholder="Rua, numero" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                  <input type="text" className="input-field" placeholder="Sao Paulo" value={cidade} onChange={(e) => setCidade(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <input type="text" className="input-field" placeholder="SP" value={estado} onChange={(e) => setEstado(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                <input type="text" className="input-field" placeholder="00000-000" value={cep} onChange={(e) => setCep(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Criando conta...' : 'Criar conta da oficina'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-gray-600 mt-6">
            Ja tem conta?{' '}
            <Link href="/login" className="text-primary-600 font-medium hover:text-primary-700">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
