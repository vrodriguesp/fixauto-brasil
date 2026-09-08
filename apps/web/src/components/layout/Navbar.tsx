'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useRef, useState } from 'react';

export default function Navbar() {
  const { user, oficina, funcionario, loja, isLoggedIn, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
    router.refresh();
  };

  const isOficina = user?.tipo === 'oficina';
  const isAdmin = user?.tipo === 'admin';
  const isLoja = user?.tipo === 'loja_pecas';
  const isMecanico = funcionario?.cargo === 'mecanico';
  const dashboardPath = isAdmin
    ? '/admin/dashboard'
    : isOficina
      ? (isMecanico ? '/oficina/veiculos-em-servico' : '/oficina/dashboard')
      : isLoja
        ? '/loja/dashboard'
        : '/cliente/dashboard';

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href={isLoggedIn ? dashboardPath : '/'} className="flex items-center gap-1">
              <img src="/logo.png" alt="BipFix" className="h-7 sm:h-10" />
              {(isOficina || isAdmin) && (
                <div className="flex flex-col ml-1">
                  {isOficina && (
                    <span className="text-[10px] font-semibold text-sky-700 uppercase tracking-wider leading-none">Oficinas</span>
                  )}
                  {isAdmin && (
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-none">Admin</span>
                  )}
                </div>
              )}
            </Link>

            {isLoggedIn && (
              <div className="hidden md:flex items-center ml-8 gap-1">
                {isAdmin ? (
                  <>
                    <NavLink href="/admin/dashboard">Dashboard</NavLink>
                    <NavLink href="/admin/usuarios">Usuarios</NavLink>
                    <NavLink href="/admin/oficinas">Oficinas</NavLink>
                    <NavLink href="/admin/comissoes">Comissoes</NavLink>
                  </>
                ) : isOficina ? (
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
                      <MoreNavDropdown
                        items={[
                          { href: '/oficina/capacidade', label: 'Capacidade' },
                          { href: '/oficina/pecas', label: 'Peças' },
                          { href: '/oficina/equipe', label: 'Equipe' },
                          { href: '/oficina/comissao', label: 'Comissão' },
                          { href: '/oficina/avaliacoes', label: 'Avaliações' },
                          { href: '/oficina/aprender', label: '🎓 Aprender' },
                        ]}
                      />
                      <NavLink href="/oficina/perfil">Perfil</NavLink>
                    </>
                  )
                ) : isLoja ? (
                  <>
                    <NavLink href="/loja/dashboard">Dashboard</NavLink>
                    <NavLink href="/loja/cotacoes">Cotações</NavLink>
                    <NavLink href="/loja/catalogo">Catálogo</NavLink>
                    <NavLink href="/loja/pedidos">Pedidos</NavLink>
                    <NavLink href="/loja/comissao">Comissão</NavLink>
                    <NavLink href="/loja/aprender">🎓 Aprender</NavLink>
                    <NavLink href="/loja/perfil">Perfil</NavLink>
                  </>
                ) : (
                  <>
                    <NavLink href="/cliente/dashboard">Dashboard</NavLink>
                    <NavLink href="/cliente/veiculos">Veículos</NavLink>
                    <NavLink href="/cliente/nova-solicitacao">Nova Solicitação</NavLink>
                    <NavLink href="/cliente/orcamentos">Orçamentos</NavLink>
                    <NavLink href="/cliente/mensagens">Mensagens</NavLink>
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
                  href={isAdmin ? '/admin/dashboard' : isOficina ? '/oficina/perfil' : isLoja ? '/loja/perfil' : '/cliente/perfil'}
                  className="hidden sm:flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isAdmin ? 'bg-slate-200' : isOficina ? 'bg-sky-100' : isLoja ? 'bg-orange-100' : 'bg-primary-100'}`}>
                    <span className={`font-semibold text-sm ${isAdmin ? 'text-slate-700' : isOficina ? 'text-sky-700' : isLoja ? 'text-orange-700' : 'text-primary-700'}`}>
                      {user!.nome.charAt(0)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">{user!.nome}</p>
                    <p className="text-gray-500 text-xs">
                      {isAdmin ? 'Administrador' : isOficina ? oficina?.nome_fantasia : isLoja ? loja?.nome_fantasia : 'Cliente'}
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
            {isAdmin ? (
              <>
                <MobileNavLink href="/admin/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</MobileNavLink>
                <MobileNavLink href="/admin/usuarios" onClick={() => setMenuOpen(false)}>Usuarios</MobileNavLink>
                <MobileNavLink href="/admin/oficinas" onClick={() => setMenuOpen(false)}>Oficinas</MobileNavLink>
                <MobileNavLink href="/admin/comissoes" onClick={() => setMenuOpen(false)}>Comissoes</MobileNavLink>
              </>
            ) : isOficina ? (
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
                  <MobileNavLink href="/oficina/capacidade" onClick={() => setMenuOpen(false)}>Capacidade</MobileNavLink>
                  <MobileNavLink href="/oficina/pecas" onClick={() => setMenuOpen(false)}>Peças</MobileNavLink>
                  <MobileNavLink href="/oficina/equipe" onClick={() => setMenuOpen(false)}>Equipe</MobileNavLink>
                  <MobileNavLink href="/oficina/checkin" onClick={() => setMenuOpen(false)}>Check-in Manual</MobileNavLink>
                  <MobileNavLink href="/oficina/comissao" onClick={() => setMenuOpen(false)}>Comissão</MobileNavLink>
                  <MobileNavLink href="/oficina/avaliacoes" onClick={() => setMenuOpen(false)}>Avaliações</MobileNavLink>
                  <MobileNavLink href="/oficina/aprender" onClick={() => setMenuOpen(false)}>🎓 Aprender</MobileNavLink>
                  <MobileNavLink href="/oficina/perfil" onClick={() => setMenuOpen(false)}>Perfil</MobileNavLink>
                </>
              )
            ) : isLoja ? (
              <>
                <MobileNavLink href="/loja/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</MobileNavLink>
                <MobileNavLink href="/loja/cotacoes" onClick={() => setMenuOpen(false)}>Cotações</MobileNavLink>
                <MobileNavLink href="/loja/catalogo" onClick={() => setMenuOpen(false)}>Catálogo</MobileNavLink>
                <MobileNavLink href="/loja/pedidos" onClick={() => setMenuOpen(false)}>Pedidos</MobileNavLink>
                <MobileNavLink href="/loja/comissao" onClick={() => setMenuOpen(false)}>Comissão</MobileNavLink>
                <MobileNavLink href="/loja/aprender" onClick={() => setMenuOpen(false)}>🎓 Aprender</MobileNavLink>
                <MobileNavLink href="/loja/perfil" onClick={() => setMenuOpen(false)}>Perfil</MobileNavLink>
              </>
            ) : (
              <>
                <MobileNavLink href="/cliente/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</MobileNavLink>
                <MobileNavLink href="/cliente/veiculos" onClick={() => setMenuOpen(false)}>Veículos</MobileNavLink>
                <MobileNavLink href="/cliente/nova-solicitacao" onClick={() => setMenuOpen(false)}>Nova Solicitação</MobileNavLink>
                <MobileNavLink href="/cliente/orcamentos" onClick={() => setMenuOpen(false)}>Orçamentos</MobileNavLink>
                <MobileNavLink href="/cliente/mensagens" onClick={() => setMenuOpen(false)}>Mensagens</MobileNavLink>
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
  const pathname = usePathname();
  const active = pathname === href || pathname?.startsWith(href + '/');
  return (
    <Link
      href={href}
      className={`px-2.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || pathname?.startsWith(href + '/');
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block px-3 py-2 rounded-lg text-base font-medium ${
        active ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      {children}
    </Link>
  );
}

function MoreNavDropdown({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const hasActiveItem = items.some((i) => pathname === i.href || pathname?.startsWith(i.href + '/'));

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
          hasActiveItem ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        Mais
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
          {items.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  active ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
