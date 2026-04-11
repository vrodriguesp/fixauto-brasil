'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useState } from 'react';

export default function Navbar() {
  const { user, oficina, funcionario, isLoggedIn, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
    router.refresh();
  };

  const isOficina = user?.tipo === 'oficina';
  const isMecanico = funcionario?.cargo === 'mecanico';
  const dashboardPath = isOficina
    ? (isMecanico ? '/oficina/veiculos-em-servico' : '/oficina/dashboard')
    : '/cliente/dashboard';

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href={isLoggedIn ? dashboardPath : '/'} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isOficina ? 'bg-emerald-600' : 'bg-primary-600'}`}>
                <span className="text-white font-bold text-sm">FA</span>
              </div>
              <span className="text-xl font-bold text-gray-900">
                Fix<span className={isOficina ? 'text-emerald-600' : 'text-primary-600'}>Auto</span>
              </span>
            </Link>

            {isLoggedIn && (
              <div className="hidden md:flex items-center ml-8 gap-1">
                {isOficina ? (
                  isMecanico ? (
                    <>
                      <NavLink href="/oficina/veiculos-em-servico">Oficina</NavLink>
                    </>
                  ) : (
                    <>
                      <NavLink href="/oficina/dashboard">Dashboard</NavLink>
                      <NavLink href="/oficina/solicitacoes">Solicitações</NavLink>
                      <NavLink href="/oficina/veiculos-em-servico">Oficina</NavLink>
                      <NavLink href="/oficina/agenda">Agenda</NavLink>
                      <NavLink href="/oficina/equipe">Equipe</NavLink>
                      <NavLink href="/oficina/avaliacoes">Avaliações</NavLink>
                      <NavLink href="/oficina/perfil">Perfil</NavLink>
                    </>
                  )
                ) : (
                  <>
                    <NavLink href="/cliente/dashboard">Dashboard</NavLink>
                    <NavLink href="/cliente/veiculos">Veículos</NavLink>
                    <NavLink href="/cliente/nova-solicitacao">Nova Solicitação</NavLink>
                    <NavLink href="/cliente/orcamentos">Orçamentos</NavLink>
                    <NavLink href="/cliente/historico">Histórico</NavLink>
                    <NavLink href="/cliente/perfil">Perfil</NavLink>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <>
                <Link
                  href={isOficina ? '/oficina/perfil' : '/cliente/perfil'}
                  className="hidden sm:flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isOficina ? 'bg-emerald-100' : 'bg-primary-100'}`}>
                    <span className={`font-semibold text-sm ${isOficina ? 'text-emerald-700' : 'text-primary-700'}`}>
                      {user!.nome.charAt(0)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">{user!.nome}</p>
                    <p className="text-gray-500 text-xs">
                      {isOficina ? oficina?.nome_fantasia : 'Cliente'}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Sair
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="btn-secondary text-sm !py-2 !px-4">
                  Entrar
                </Link>
                <Link href="/cadastro" className="btn-primary text-sm !py-2 !px-4">
                  Cadastrar
                </Link>
              </div>
            )}

            {/* Mobile menu button */}
            {isLoggedIn && (
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && isLoggedIn && (
          <div className="md:hidden pb-4 border-t border-gray-100 pt-2">
            {isOficina ? (
              isMecanico ? (
                <>
                  <MobileNavLink href="/oficina/veiculos-em-servico" onClick={() => setMenuOpen(false)}>Oficina</MobileNavLink>
                </>
              ) : (
                <>
                  <MobileNavLink href="/oficina/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</MobileNavLink>
                  <MobileNavLink href="/oficina/solicitacoes" onClick={() => setMenuOpen(false)}>Solicitações</MobileNavLink>
                  <MobileNavLink href="/oficina/veiculos-em-servico" onClick={() => setMenuOpen(false)}>Oficina</MobileNavLink>
                  <MobileNavLink href="/oficina/agenda" onClick={() => setMenuOpen(false)}>Agenda</MobileNavLink>
                  <MobileNavLink href="/oficina/equipe" onClick={() => setMenuOpen(false)}>Equipe</MobileNavLink>
                  <MobileNavLink href="/oficina/checkin" onClick={() => setMenuOpen(false)}>Check-in Manual</MobileNavLink>
                  <MobileNavLink href="/oficina/avaliacoes" onClick={() => setMenuOpen(false)}>Avaliações</MobileNavLink>
                  <MobileNavLink href="/oficina/perfil" onClick={() => setMenuOpen(false)}>Perfil</MobileNavLink>
                </>
              )
            ) : (
              <>
                <MobileNavLink href="/cliente/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</MobileNavLink>
                <MobileNavLink href="/cliente/veiculos" onClick={() => setMenuOpen(false)}>Veículos</MobileNavLink>
                <MobileNavLink href="/cliente/nova-solicitacao" onClick={() => setMenuOpen(false)}>Nova Solicitação</MobileNavLink>
                <MobileNavLink href="/cliente/orcamentos" onClick={() => setMenuOpen(false)}>Orçamentos</MobileNavLink>
                <MobileNavLink href="/cliente/historico" onClick={() => setMenuOpen(false)}>Histórico</MobileNavLink>
                <MobileNavLink href="/cliente/perfil" onClick={() => setMenuOpen(false)}>Perfil</MobileNavLink>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-3 py-2 rounded-lg text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
    >
      {children}
    </Link>
  );
}
