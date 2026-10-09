'use client';

import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useRef, useState } from 'react';
import NotificationBell from './NotificationBell';
import LanguageSwitcher from './LanguageSwitcher';
import NextLink from 'next/link';

// /admin nao tem idioma: link comum. O Link do next-intl poria /pt-br na
// frente (/pt-br/admin/oficinas -> 404) - achado no teste do admin, 30/09.
function LinkPainel(props: React.ComponentProps<typeof NextLink> & { href: string }) {
  return props.href.startsWith('/admin') ? <NextLink {...props} /> : <Link {...(props as any)} />;
}

export default function Navbar() {
  const { user, oficina, funcionario, loja, isLoggedIn, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const t = useTranslations('nav');

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
      <div className={`${isLoggedIn ? 'max-w-screen-2xl' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8`}>
        {/* Menu do computador so a partir de 1280 px: abaixo disso os links nao cabem
            numa linha e ficavam uns por cima dos outros ("Workshop" sobre "Dashboard",
            nome sobre "Sair" - medido em 6 idiomas, 09/10); ali vale o menu de celular */}
        <div className="flex justify-between h-16 gap-3">
          <div className="flex items-center min-w-0">
            <LinkPainel href={isLoggedIn ? dashboardPath : '/'} className="flex items-center gap-1 shrink-0">
              <img src="/logo-80.webp" alt="BipFix" width={188} height={40} className="h-7 sm:h-10 w-auto" />
              {(isOficina || isAdmin) && (
                // No celular nao ha espaco ao lado do logo (sobrepunha o seletor de idioma)
                <div className="hidden sm:flex flex-col ml-1 whitespace-nowrap">
                  {isOficina && (
                    <span className="text-[10px] font-semibold text-sky-700 uppercase tracking-wider leading-none">{t('oficina')}</span>
                  )}
                  {isAdmin && (
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-none">Admin</span>
                  )}
                </div>
              )}
            </LinkPainel>

            {isLoggedIn && (
              <div className="hidden xl:flex items-center ml-5 gap-0.5">
                {isAdmin ? (
                  <>
                    <NavLink href="/admin/dashboard">{t('dashboard')}</NavLink>
                    <NavLink href="/admin/usuarios">Usuários</NavLink>
                    <NavLink href="/admin/oficinas">Oficinas</NavLink>
                    <NavLink href="/admin/comissoes">Comissões</NavLink>
                    <NavLink href="/admin/leads-parceiros">Interessados</NavLink>
                  </>
                ) : isOficina ? (
                  isMecanico ? (
                    <>
                      <NavLink href="/oficina/veiculos-em-servico">{t('oficina')}</NavLink>
                      <NavLink href="/oficina/agenda">{t('agenda')}</NavLink>
                      <NavLink href="/oficina/aprender">🎓 {t('aprender')}</NavLink>
                    </>
                  ) : (
                    <>
                      <NavLink href="/oficina/dashboard">{t('dashboard')}</NavLink>
                      <NavLink href="/oficina/solicitacoes">{t('solicitacoes')}</NavLink>
                      <NavLink href="/oficina/veiculos-em-servico">{t('oficina')}</NavLink>
                      <NavLink href="/oficina/agenda">{t('agenda')}</NavLink>
                      <MoreNavDropdown
                        moreLabel={t('mais')}
                        items={[
                          { href: '/oficina/pecas', label: t('pecas') },
                          { href: '/oficina/equipe', label: t('equipe') },
                          { href: '/oficina/comissao', label: t('comissao') },
                          { href: '/oficina/avaliacoes', label: t('avaliacoes') },
                          { href: '/oficina/aprender', label: `🎓 ${t('aprender')}` },
                        ]}
                      />
                    </>
                  )
                ) : isLoja ? (
                  <>
                    <NavLink href="/loja/dashboard">{t('dashboard')}</NavLink>
                    <NavLink href="/loja/cotacoes">{t('cotacoes')}</NavLink>
                    <NavLink href="/loja/catalogo">{t('catalogo')}</NavLink>
                    <NavLink href="/loja/pedidos">{t('pedidos')}</NavLink>
                    <NavLink href="/loja/comissao">{t('comissao')}</NavLink>
                    <NavLink href="/loja/aprender">🎓 {t('aprender')}</NavLink>
                  </>
                ) : (
                  <>
                    <NavLink href="/cliente/dashboard">{t('dashboard')}</NavLink>
                    <NavLink href="/cliente/veiculos">{t('veiculos')}</NavLink>
                    <NavLink href="/cliente/nova-solicitacao">{t('novaSolicitacao')}</NavLink>
                    <NavLink href="/cliente/orcamentos">{t('orcamentos')}</NavLink>
                    <NavLink href="/cliente/mensagens">{t('mensagens')}</NavLink>
                    <NavLink href="/cliente/historico">{t('historico')}</NavLink>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <LanguageSwitcher compacto={isLoggedIn} />
            {isLoggedIn ? (
              <>
                <NotificationBell />
                <LinkPainel
                  href={isAdmin ? '/admin/dashboard' : isOficina ? '/oficina/perfil' : isLoja ? '/loja/perfil' : '/cliente/perfil'}
                  title={`${t('perfil')} · ${user!.nome}`}
                  aria-label={`${t('perfil')} · ${user!.nome}`}
                  className="hidden sm:flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isAdmin ? 'bg-slate-200' : isOficina ? 'bg-sky-100' : isLoja ? 'bg-orange-100' : 'bg-primary-100'}`}>
                    <span className={`font-semibold text-sm ${isAdmin ? 'text-slate-700' : isOficina ? 'text-sky-700' : isLoja ? 'text-orange-700' : 'text-primary-700'}`}>
                      {user!.nome.charAt(0)}
                    </span>
                  </div>
                  {/* nome e papel em uma linha cada, sem quebrar por cima de outros botoes (teste 09/10, ponto 3) */}
                  <div className="hidden 2xl:block text-sm min-w-0 max-w-[12rem]">
                    <p className="font-medium text-gray-900 truncate whitespace-nowrap" title={user!.nome}>{user!.nome}</p>
                    <p className="text-gray-500 text-xs truncate whitespace-nowrap">
                      {isAdmin ? t('administrador') : isOficina ? oficina?.nome_fantasia : isLoja ? loja?.nome_fantasia : t('cliente')}
                    </p>
                  </div>
                </LinkPainel>
                <button
                  onClick={handleSignOut}
                  className="hidden sm:block text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
                >
                  {t('sair')}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <LinkPainel href="/login" className="btn-secondary text-sm !py-2 !px-3 sm:!px-4 whitespace-nowrap">
                  {t('entrar')}
                </LinkPainel>
                <LinkPainel href="/cadastro" className="btn-primary text-sm !py-2 !px-3 sm:!px-4 whitespace-nowrap">
                  {t('cadastrar')}
                </LinkPainel>
              </div>
            )}

            {/* Mobile menu button */}
            {isLoggedIn && (
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Menu"
                aria-expanded={menuOpen}
                aria-controls="menu-mobile"
                className="xl:hidden p-2 rounded-lg hover:bg-gray-100"
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
          <div id="menu-mobile" className="xl:hidden pb-4 border-t border-gray-100 pt-2">
            {isAdmin ? (
              <>
                <MobileNavLink href="/admin/dashboard" onClick={() => setMenuOpen(false)}>{t('dashboard')}</MobileNavLink>
                <MobileNavLink href="/admin/usuarios" onClick={() => setMenuOpen(false)}>Usuários</MobileNavLink>
                <MobileNavLink href="/admin/oficinas" onClick={() => setMenuOpen(false)}>Oficinas</MobileNavLink>
                <MobileNavLink href="/admin/comissoes" onClick={() => setMenuOpen(false)}>Comissões</MobileNavLink>
                <MobileNavLink href="/admin/leads-parceiros" onClick={() => setMenuOpen(false)}>Interessados</MobileNavLink>
              </>
            ) : isOficina ? (
              isMecanico ? (
                <>
                  <MobileNavLink href="/oficina/veiculos-em-servico" onClick={() => setMenuOpen(false)}>{t('oficina')}</MobileNavLink>
                  <MobileNavLink href="/oficina/agenda" onClick={() => setMenuOpen(false)}>{t('agenda')}</MobileNavLink>
                  <MobileNavLink href="/oficina/aprender" onClick={() => setMenuOpen(false)}>🎓 {t('aprender')}</MobileNavLink>
                </>
              ) : (
                <>
                  <MobileNavLink href="/oficina/dashboard" onClick={() => setMenuOpen(false)}>{t('dashboard')}</MobileNavLink>
                  <MobileNavLink href="/oficina/solicitacoes" onClick={() => setMenuOpen(false)}>{t('solicitacoes')}</MobileNavLink>
                  <MobileNavLink href="/oficina/veiculos-em-servico" onClick={() => setMenuOpen(false)}>{t('oficina')}</MobileNavLink>
                  <MobileNavLink href="/oficina/agenda" onClick={() => setMenuOpen(false)}>{t('agenda')}</MobileNavLink>
                  <MobileNavLink href="/oficina/pecas" onClick={() => setMenuOpen(false)}>{t('pecas')}</MobileNavLink>
                  <MobileNavLink href="/oficina/equipe" onClick={() => setMenuOpen(false)}>{t('equipe')}</MobileNavLink>
                  <MobileNavLink href="/oficina/checkin" onClick={() => setMenuOpen(false)}>{t('checkinManual')}</MobileNavLink>
                  <MobileNavLink href="/oficina/comissao" onClick={() => setMenuOpen(false)}>{t('comissao')}</MobileNavLink>
                  <MobileNavLink href="/oficina/avaliacoes" onClick={() => setMenuOpen(false)}>{t('avaliacoes')}</MobileNavLink>
                  <MobileNavLink href="/oficina/aprender" onClick={() => setMenuOpen(false)}>🎓 {t('aprender')}</MobileNavLink>
                  <MobileNavLink href="/oficina/perfil" onClick={() => setMenuOpen(false)}>{t('perfil')}</MobileNavLink>
                </>
              )
            ) : isLoja ? (
              <>
                <MobileNavLink href="/loja/dashboard" onClick={() => setMenuOpen(false)}>{t('dashboard')}</MobileNavLink>
                <MobileNavLink href="/loja/cotacoes" onClick={() => setMenuOpen(false)}>{t('cotacoes')}</MobileNavLink>
                <MobileNavLink href="/loja/catalogo" onClick={() => setMenuOpen(false)}>{t('catalogo')}</MobileNavLink>
                <MobileNavLink href="/loja/pedidos" onClick={() => setMenuOpen(false)}>{t('pedidos')}</MobileNavLink>
                <MobileNavLink href="/loja/comissao" onClick={() => setMenuOpen(false)}>{t('comissao')}</MobileNavLink>
                <MobileNavLink href="/loja/aprender" onClick={() => setMenuOpen(false)}>🎓 {t('aprender')}</MobileNavLink>
                <MobileNavLink href="/loja/perfil" onClick={() => setMenuOpen(false)}>{t('perfil')}</MobileNavLink>
              </>
            ) : (
              <>
                <MobileNavLink href="/cliente/dashboard" onClick={() => setMenuOpen(false)}>{t('dashboard')}</MobileNavLink>
                <MobileNavLink href="/cliente/veiculos" onClick={() => setMenuOpen(false)}>{t('veiculos')}</MobileNavLink>
                <MobileNavLink href="/cliente/nova-solicitacao" onClick={() => setMenuOpen(false)}>{t('novaSolicitacao')}</MobileNavLink>
                <MobileNavLink href="/cliente/orcamentos" onClick={() => setMenuOpen(false)}>{t('orcamentos')}</MobileNavLink>
                <MobileNavLink href="/cliente/mensagens" onClick={() => setMenuOpen(false)}>{t('mensagens')}</MobileNavLink>
                <MobileNavLink href="/cliente/historico" onClick={() => setMenuOpen(false)}>{t('historico')}</MobileNavLink>
                <MobileNavLink href="/cliente/perfil" onClick={() => setMenuOpen(false)}>{t('perfil')}</MobileNavLink>
              </>
            )}
            {/* no celular o "Sair" fica aqui: na barra nao cabia ao lado do logo ("Terminar sessão") */}
            <button type="button" onClick={() => { setMenuOpen(false); handleSignOut(); }}
              className="sm:hidden block w-full text-left px-3 py-2 mt-1 rounded-lg text-base font-medium text-gray-600 hover:bg-gray-50 border-t border-gray-100">
              {t('sair')}
            </button>
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
    <LinkPainel
      href={href}
      className={`px-2.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      {children}
    </LinkPainel>
  );
}

function MobileNavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || pathname?.startsWith(href + '/');
  return (
    <LinkPainel
      href={href}
      onClick={onClick}
      className={`block px-3 py-2 rounded-lg text-base font-medium ${
        active ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      {children}
    </LinkPainel>
  );
}

function MoreNavDropdown({ items, moreLabel }: { items: { href: string; label: string }[]; moreLabel: string }) {
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
        {moreLabel}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
          {items.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <LinkPainel
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  active ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </LinkPainel>
            );
          })}
        </div>
      )}
    </div>
  );
}
