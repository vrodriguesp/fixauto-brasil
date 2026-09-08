'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ESTADOS_BRASIL } from '@fixauto/shared';

export default function SejaParceiroPage() {
  const [tipo, setTipo] = useState<'oficina' | 'loja_pecas'>('oficina');
  const [nomeResponsavel, setNomeResponsavel] = useState('');
  const [nomeNegocio, setNomeNegocio] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeResponsavel || !nomeNegocio || !cidade || !estado || !whatsapp) {
      setErro('Preencha todos os campos obrigatórios');
      return;
    }
    setErro('');
    setEnviando(true);
    const res = await fetch('/api/leads-parceiros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, nomeResponsavel, nomeNegocio, cidade, estado, whatsapp, email, observacao }),
    });
    setEnviando(false);
    if (res.ok) {
      setEnviado(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setErro(data.error || 'Não foi possível enviar. Tente novamente em instantes.');
    }
  };

  if (enviado) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Recebemos seu interesse!</h1>
          <p className="text-gray-600 leading-relaxed">
            Nossa equipe vai analisar sua região e entrar em contato pelo WhatsApp em até 48 horas úteis para
            explicar os próximos passos da fase piloto.
          </p>
          <Link href="/" className="inline-block mt-8 text-primary-600 font-medium hover:underline">
            Voltar para o início
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <span className="inline-block bg-white/15 text-white text-xs font-semibold px-3 py-1 rounded-full mb-5 tracking-wide">
            FASE DE SELEÇÃO DE PARCEIROS FUNDADORES
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
            Estamos construindo algo novo no mercado de reparo automotivo — e queremos você entre os primeiros
          </h1>
          <p className="mt-5 text-lg text-primary-100 leading-relaxed max-w-2xl mx-auto">
            O BipFix ainda é um projeto ambicioso em fase inicial, sem milhares de usuários — e é justamente por
            isso que quem entrar agora ajuda a moldar a plataforma e garante condições que não vão se repetir
            depois.
          </p>
        </div>
      </section>

      {/* Por que agora */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">O que significa ser parceiro fundador</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <Benefit
              title="Sem comissão nesta fase"
              text="Parceiros fundadores usam o sistema completo de gestão e captação sem pagar comissão, com aviso de 30 dias antes de qualquer mudança futura."
            />
            <Benefit
              title="Voz ativa no produto"
              text="Como um dos primeiros, seu feedback direto molda quais funcionalidades entram na plataforma a seguir."
            />
            <Benefit
              title="Vagas limitadas por região"
              text="Estamos selecionando um número reduzido de parceiros por cidade na fase piloto, para dar atenção real a cada um."
            />
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Cadastre seu interesse</h2>
            <p className="text-sm text-gray-500 mb-6">Leva menos de 1 minuto. Sem compromisso.</p>

            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-800">{erro}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipo('oficina')}
                  className={`py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${tipo === 'oficina' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}
                >
                  Sou oficina
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('loja_pecas')}
                  className={`py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${tipo === 'loja_pecas' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}
                >
                  Sou loja de peças
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do responsável *</label>
                <input type="text" className="input-field" value={nomeResponsavel} onChange={(e) => setNomeResponsavel(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do negócio *</label>
                <input type="text" className="input-field" placeholder={tipo === 'oficina' ? 'Ex: Oficina Bona' : 'Ex: Peças Silva'} value={nomeNegocio} onChange={(e) => setNomeNegocio(e.target.value)} required />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
                  <input type="text" className="input-field" value={cidade} onChange={(e) => setCidade(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado *</label>
                  <select className="input-field" value={estado} onChange={(e) => setEstado(e.target.value)} required>
                    <option value="">--</option>
                    {ESTADOS_BRASIL.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
                <input type="tel" className="input-field" placeholder="(16) 99999-0000" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail (opcional)</label>
                <input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quer nos contar algo? (opcional)</label>
                <textarea className="input-field" rows={2} placeholder="Ex: quantos funcionários, especialidades..." value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </div>

              <button type="submit" disabled={enviando} className="btn-primary w-full disabled:opacity-50">
                {enviando ? 'Enviando...' : 'Quero ser parceiro fundador'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Ao enviar, você concorda com nossos{' '}
                <Link href="/termos" target="_blank" className="underline">Termos de Uso</Link>.
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

function Benefit({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mx-auto mb-3 text-primary-600">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
    </div>
  );
}
