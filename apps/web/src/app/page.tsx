'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { isLoggedIn, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-pulse text-gray-400">Carregando...</div>
      </div>
    );
  }

  if (isLoggedIn) {
    const dashPath = user?.tipo === 'oficina' ? '/oficina/dashboard' : '/cliente/dashboard';
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Voce esta logado como {user?.nome}</p>
          <Link href={dashPath} className="btn-primary">
            Ir para Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
              Seu carro precisa de reparo?{' '}
              <span className="text-primary-200">Encontre a melhor oficina.</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-primary-100 leading-relaxed">
              Envie fotos do dano, receba orcamentos de oficinas proximas e escolha a melhor opcao.
              Simples, rapido e transparente.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/cadastro?tipo=cliente"
                className="bg-white text-primary-700 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-50 transition-colors text-center"
              >
                Preciso de um reparo
              </Link>
              <Link
                href="/cadastro?tipo=oficina"
                className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/10 transition-colors text-center"
              >
                Sou uma oficina
              </Link>
            </div>
          </div>
        </div>

        {/* Emergency button */}
        <div className="absolute bottom-0 left-0 right-0 translate-y-1/2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Link
              href="/emergencia"
              className="block bg-red-600 hover:bg-red-700 text-white rounded-2xl p-6 shadow-xl transition-all hover:shadow-2xl border-2 border-red-500"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xl font-bold">Acabei de bater!</p>
                  <p className="text-red-100 text-sm mt-1">
                    Tire uma foto agora e receba orcamentos de oficinas proximas em minutos.
                    Registre o outro veiculo envolvido.
                  </p>
                </div>
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="pt-28 pb-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Como funciona
          </h2>
          <p className="text-gray-600 text-center mb-16 max-w-2xl mx-auto">
            Em poucos passos voce recebe orcamentos das melhores oficinas da sua regiao
          </p>

          <div className="grid md:grid-cols-4 gap-8">
            <Step
              number={1}
              title="Descreva o problema"
              description="Envie fotos do dano e uma descricao do que aconteceu com seu veiculo"
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
            <Step
              number={2}
              title="Oficinas recebem"
              description="Oficinas proximas a voce recebem sua solicitacao e avaliam o servico"
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
            />
            <Step
              number={3}
              title="Compare orcamentos"
              description="Receba orcamentos detalhados com precos, prazos e avaliacoes"
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              }
            />
            <Step
              number={4}
              title="Escolha e repare"
              description="Aceite o melhor orcamento e acompanhe o reparo do seu veiculo"
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>
        </div>
      </section>

      {/* For workshops */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Para oficinas mecanicas
              </h2>
              <p className="text-gray-600 text-lg mb-8">
                Aumente sua base de clientes e organize seus servicos em uma unica plataforma.
              </p>
              <ul className="space-y-4">
                <Feature text="Receba solicitacoes de clientes proximos automaticamente" />
                <Feature text="Envie orcamentos estruturados e profissionais" />
                <Feature text="Gerencie sua agenda com servicos internos e externos" />
                <Feature text="Construa sua reputacao com avaliacoes de clientes" />
              </ul>
              <Link href="/cadastro?tipo=oficina" className="btn-primary inline-block mt-8">
                Cadastrar minha oficina
              </Link>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Nova solicitacao</p>
                    <p className="text-sm text-gray-500">Colisao - VW Gol 2021 - 3km de voce</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Orcamento aceito!</p>
                    <p className="text-sm text-gray-500">Funilaria - Chevrolet Onix 2023</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg">
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Nova avaliacao: 5 estrelas</p>
                    <p className="text-sm text-gray-500">&quot;Excelente trabalho, recomendo!&quot;</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            <Stat number="500+" label="Oficinas cadastradas" />
            <Stat number="10.000+" label="Reparos realizados" />
            <Stat number="4.7" label="Avaliacao media" />
            <Stat number="R$ 850" label="Economia media" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">FA</span>
                </div>
                <span className="text-xl font-bold text-white">
                  Fix<span className="text-primary-400">Auto</span>
                </span>
              </div>
              <p className="text-sm">
                Conectando motoristas as melhores oficinas do Brasil.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-3">Para Motoristas</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/cadastro?tipo=cliente" className="hover:text-white">Criar conta</Link></li>
                <li><Link href="/emergencia" className="hover:text-white">Acabei de bater</Link></li>
                <li><Link href="#" className="hover:text-white">Como funciona</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-3">Para Oficinas</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/cadastro?tipo=oficina" className="hover:text-white">Cadastrar oficina</Link></li>
                <li><Link href="#" className="hover:text-white">Planos</Link></li>
                <li><Link href="#" className="hover:text-white">Suporte</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-3">Contato</h3>
              <ul className="space-y-2 text-sm">
                <li>contato@fixauto.com.br</li>
                <li>(11) 3000-0000</li>
                <li>Sao Paulo, SP</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
            <p>2026 FixAuto Brasil. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({ number, title, description, icon }: { number: number; title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary-600">
        {icon}
      </div>
      <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 text-sm font-bold">
        {number}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <svg className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-gray-700">{text}</span>
    </li>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <p className="text-3xl lg:text-4xl font-bold">{number}</p>
      <p className="text-primary-200 mt-1">{label}</p>
    </div>
  );
}
