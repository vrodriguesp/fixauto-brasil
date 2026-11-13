'use client';

import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LOCALES_SO_RECRUTAMENTO } from '@/lib/mercados';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useRef, useState } from 'react';
import NotificationBell from './NotificationBell';
import { useNotificacoes } from '@/hooks/use-notificacoes';
import LanguageSwitcher from './LanguageSwitcher';
import NextLink from 'next/link';
import { supabase } from '@/lib/supabase';

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
  const locale = useLocale();
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
    router.refresh();
  };

  const isOficina = user?.tipo === 'oficina';
  const isAdmin = user?.tipo === 'admin';
  const isCliente = user?.tipo === 'cliente';
  // cliente no celular: menu de baixo como o da oficina, com os avisos a vista (dono 08/11)
  const { unreadCount: avisosNovos } = useNotificacoes();
  const isLoja = user?.tipo === 'loja_pecas';
  const isMecanico = funcionario?.cargo === 'mecanico';
  const dashboardPath = isAdmin
    ? '/admin/dashboard'
    : isOficina
      ? (isMecanico ? '/oficina/hoje' : '/oficina/pedidos')
      : isLoja
        ? '/loja/dashboard'
        : '/cliente/dashboard';

  // painel da oficina (auditoria 10/10): Pedidos mostra quantos esperam
  // resposta; vermelho se algum espera ha mais de 4 h
  const [paraResponder, setParaResponder] = useState<{ total: number; atrasados: number } | null>(null);
  useEffect(() => {
    if (!isOficina || isMecanico || !oficina) return;
    let vivo = true;
    const ler = () => supabase.rpc('pedidos_para_responder').then(({ data }) => { if (vivo && data) setParaResponder(data as any); });
    ler();
    const i = setInterval(ler, 60e3);
    // "nao tenho interesse" muda o contador na hora (components/oficina/DispensarPedido.tsx)
    window.addEventListener('bipfix:pedido-dispensa', ler);
    return () => { vivo = false; clearInterval(i); window.removeEventListener('bipfix:pedido-dispensa', ler); };
  }, [isOficina, isMecanico, oficina]);
  const contadorPedidos = paraResponder && paraResponder.total > 0 ? (
    <span className={`ml-1 inline-block min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold leading-5 ${paraResponder.atrasados > 0 ? 'bg-red-600 text-white' : 'bg-primary-100 text-primary-800'}`} aria-label={t('pedidosEsperando', { n: paraResponder.total })}>{paraResponder.total}</span>
  ) : null;
  // mensagens nao lidas (bolinha em Mensagens - pedido do dono 07/11): mesma conta
  // da lista de conversas; a conversa aberta avisa ao marcar como lidas
  const [msgsNovas, setMsgsNovas] = useState(0);
  useEffect(() => {
    if (!isLoggedIn || !user?.id || isAdmin || isLoja || (isOficina && (isMecanico || !oficina))) return;
    let vivo = true; let ultima = 0;
    // so conversas que a lista mostra (auditoria 08/11): outra oficina escolhida,
    // orcamento recusado ou servico fora da garantia (conversa_aberta) e pedido
    // no_show nao contam - senao a bolinha nunca sumia
    const ler = async () => {
      // uma leitura antiga que chega depois (marcou lidas no meio) nao sobrescreve a nova
      const vez = ++ultima;
      let q = supabase.from('mensagens').select('solicitacao_id, oficina_id').eq('lida', false).neq('remetente_id', user.id).limit(300);
      q = isOficina && oficina ? q.eq('oficina_id', oficina.id) : q.is('pagador_id', null);
      const { data } = await q;
      const msgs = (data || []) as { solicitacao_id: string; oficina_id: string | null }[];
      const pares = Array.from(new Set(msgs.map((m) => `${m.solicitacao_id}|${m.oficina_id || ''}`)));
      const [abertas, sols] = await Promise.all([
        Promise.all(pares.map((p) => { const [s, o] = p.split('|'); return o ? supabase.rpc('conversa_aberta', { p_sol: s, p_of: o }).then((r) => !!r.data) : Promise.resolve(true); })),
        isOficina && pares.length ? supabase.from('solicitacoes').select('id, status').in('id', Array.from(new Set(msgs.map((m) => m.solicitacao_id)))).then((r) => r.data || []) : Promise.resolve([] as any[]),
      ]);
      const fora = new Set((sols as any[]).filter((s) => s.status === 'no_show').map((s) => s.id));
      const valem = new Set(pares.filter((p, i) => abertas[i] && !fora.has(p.split('|')[0])));
      if (vivo && vez === ultima) setMsgsNovas(msgs.filter((m) => valem.has(`${m.solicitacao_id}|${m.oficina_id || ''}`)).length);
    };
    ler();
    const i = setInterval(ler, 60e3);
    window.addEventListener('bipfix:mensagens-lidas', ler);
    return () => { vivo = false; clearInterval(i); window.removeEventListener('bipfix:mensagens-lidas', ler); };
  }, [isLoggedIn, user?.id, isAdmin, isLoja, isOficina, isMecanico, oficina]);
  const contadorMsgs = msgsNovas > 0 ? (
    <span className="ml-1 inline-block min-w-[1.25rem] rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold leading-5 text-white" aria-label={t('mensagensNovas', { n: msgsNovas })}>{msgsNovas > 99 ? '99+' : msgsNovas}</span>
  ) : null;
  const menuOficina = isOficina && !isMecanico;
  // Links publicos para quem nao entrou (auditoria SEO 13/11: o cabecalho so tinha
  // Entrar/Registrar; pedido, guias e a pagina das oficinas so no rodape). Nos
  // mercados so de recrutamento (IT/PT/BR) so a pagina das oficinas.
  const soRecrutamento = LOCALES_SO_RECRUTAMENTO.includes(locale);
  const linksVisitante = [
    ...(soRecrutamento ? [] : [{ href: '/pedido', label: t('pedirOrcamento') }, { href: '/guias', label: t('guias') }]),
    { href: '/para-oficinas', label: t('paraOficinas') },
  ];
  const areaPrivada = ['/cliente', '/oficina', '/loja', '/admin', '/definir-senha'].some((p) => pathname === p || pathname?.startsWith(p + '/'));
  // a barra de baixo (celular) nao pode cobrir o fim da pagina nem o rodape
  useEffect(() => {
    const temBarra = isLoggedIn && (isOficina || isCliente);
    document.body.classList.toggle('com-barra-inferior', !!temBarra);
    return () => document.body.classList.remove('com-barra-inferior');
  }, [isLoggedIn, isOficina, isCliente]);
  // celular digitando: a barra de baixo e o botao do chat sairiam por cima do teclado
  // (iPhone) e cobririam o campo - somem enquanto um campo de texto tem o foco (dono 08/11)
  useEffect(() => {
    const texto = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes((el as HTMLInputElement).type)));
    const entrou = (e: FocusEvent) => { if (texto(e.target)) document.body.classList.add('digitando'); };
    const saiu = () => setTimeout(() => { if (!texto(document.activeElement)) document.body.classList.remove('digitando'); }, 0);
    // iPhone: o teclado pode fechar sem o campo perder o foco, e o Safari deixa o que e fixo
    // (botao do chat, menu de baixo) na altura onde o teclado estava ate a pessoa rolar
    // (dono 08/11). Quando a area visivel volta ao tamanho cheio: sai do modo digitando e
    // forca o reposicionamento.
    const vv = window.visualViewport;
    let tecladoAberto = false;
    const medir = () => {
      if (!vv) return;
      const aberto = vv.height < window.innerHeight - 120;
      if (aberto) { tecladoAberto = true; return; }
      if (!tecladoAberto) return;
      tecladoAberto = false;
      document.body.classList.remove('digitando');
      requestAnimationFrame(() => {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('.chat-suporte-botao, .barra-inferior'))) { el.style.transform = 'translateZ(0)'; void el.offsetHeight; el.style.transform = ''; }
        window.scrollTo(window.scrollX, window.scrollY);
      });
    };
    vv?.addEventListener('resize', medir);
    document.addEventListener('focusin', entrou); document.addEventListener('focusout', saiu);
    return () => { vv?.removeEventListener('resize', medir); document.removeEventListener('focusin', entrou); document.removeEventListener('focusout', saiu); document.body.classList.remove('digitando'); };
  }, []);

  return (
    <>
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className={`${isLoggedIn ? 'max-w-screen-2xl' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8`}>
        {/* Menu do computador so a partir de 1280 px: abaixo disso os links nao cabem
            numa linha e ficavam uns por cima dos outros ("Workshop" sobre "Dashboard",
            nome sobre "Sair" - medido em 6 idiomas, 09/10); ali vale o menu de celular */}
        <div className="flex justify-between h-16 gap-1.5 min-[360px]:gap-3">
          <div className="flex items-center min-w-0">
            <LinkPainel href={isLoggedIn ? dashboardPath : '/'} className="flex items-center gap-1 shrink-0">
              <img src="/logo-80.webp" alt="BipFix" width={188} height={40} className="h-[22px] min-[360px]:h-7 sm:h-10 w-auto" />
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

            {!isLoggedIn && (
              <div className="hidden lg:flex items-center ml-5 gap-0.5">
                {linksVisitante.map((l) => <NavLink key={l.href} href={l.href}>{l.label}</NavLink>)}
              </div>
            )}

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
                      <NavLink href="/oficina/hoje">{t('hoje')}</NavLink>
                      <NavLink href="/oficina/agenda">{t('agenda')}</NavLink>
                      <NavLink href="/oficina/aprender">{t('aprender')}</NavLink>
                    </>
                  ) : (
                    <>
                      <NavLink href="/oficina/pedidos">{t('pedidosOficina')}{contadorPedidos}</NavLink>
                      <NavLink href="/oficina/hoje">{t('hoje')}</NavLink>
                      <NavLink href="/oficina/agenda">{t('agenda')}</NavLink>
                      {/* mensagens fora do "Mais" (pedido do dono 01/11) */}
                      <NavLink href="/oficina/mensagens">{t('conversasOficina')}{contadorMsgs}</NavLink>
                      <NavLink href="/oficina/desempenho">{t('desempenho')}</NavLink>
                      {/* fixo ao lado dos outros: e onde a oficina edita tudo (pedido do dono 10/10) */}
                      <NavLink href="/oficina/perfil">{t('minhaOficina')}</NavLink>
                      <MoreNavDropdown
                        moreLabel={t('mais')}
                        items={[
                          { href: '/oficina/garantias', label: t('garantiasOficina') },
                          { href: '/oficina/pecas', label: t('pecas') },
                          { href: '/oficina/equipe', label: t('equipe') },
                          { href: '/oficina/avaliacoes', label: t('avaliacoes') },
                          { href: '/oficina/aprender', label: t('aprender') },
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
                    <NavLink href="/loja/aprender">🎓 {t('aprender')}</NavLink>
                  </>
                ) : (
                  <>
                    <NavLink href="/cliente/dashboard">{t('inicio')}</NavLink>
                    <NavLink href="/cliente/veiculos">{t('veiculos')}</NavLink>
                    <NavLink href="/cliente/nova-solicitacao">{t('novaSolicitacao')}</NavLink>
                    <NavLink href="/cliente/orcamentos">{t('orcamentos')}</NavLink>
                    <NavLink href="/cliente/mensagens">{t('mensagens')}{contadorMsgs}</NavLink>
                    <NavLink href="/cliente/historico">{t('historico')}</NavLink>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 min-[360px]:gap-2 sm:gap-3 shrink-0">
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
                <LinkPainel href="/login" className="btn-secondary text-sm !py-2 !px-2.5 min-[360px]:!px-3 sm:!px-4 whitespace-nowrap">
                  {t('entrar')}
                </LinkPainel>
                {/* celular: so "Entrar" (a tela de entrar leva ao cadastro). Com os dois botoes
                    o seletor de idioma ficava em cima do logo - pagina da oficina aberta pelo app, 10/10 */}
                <LinkPainel href="/cadastro" className="btn-primary text-sm !py-2 !px-3 sm:!px-4 whitespace-nowrap !hidden sm:!inline-flex">
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
                className={`${isOficina ? 'hidden' : 'xl:hidden'} p-2 rounded-lg hover:bg-gray-100`}
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
                  <MobileNavLink href="/oficina/aprender" onClick={() => setMenuOpen(false)}>{t('aprender')}</MobileNavLink>
                </>
              ) : (
                <>
                  {/* "Minha oficina" saiu da barra de baixo para dar lugar as mensagens (01/11) */}
                  <MobileNavLink href="/oficina/perfil" onClick={() => setMenuOpen(false)}>{t('minhaOficina')}</MobileNavLink>
                  <MobileNavLink href="/oficina/garantias" onClick={() => setMenuOpen(false)}>{t('garantiasOficina')}</MobileNavLink>
                  <MobileNavLink href="/oficina/desempenho" onClick={() => setMenuOpen(false)}>{t('desempenho')}</MobileNavLink>
                  <MobileNavLink href="/oficina/pecas" onClick={() => setMenuOpen(false)}>{t('pecas')}</MobileNavLink>
                  <MobileNavLink href="/oficina/equipe" onClick={() => setMenuOpen(false)}>{t('equipe')}</MobileNavLink>
                  <MobileNavLink href="/oficina/avaliacoes" onClick={() => setMenuOpen(false)}>{t('avaliacoes')}</MobileNavLink>
                  <MobileNavLink href="/oficina/aprender" onClick={() => setMenuOpen(false)}>{t('aprender')}</MobileNavLink>
                </>
              )
            ) : isLoja ? (
              <>
                <MobileNavLink href="/loja/dashboard" onClick={() => setMenuOpen(false)}>{t('dashboard')}</MobileNavLink>
                <MobileNavLink href="/loja/cotacoes" onClick={() => setMenuOpen(false)}>{t('cotacoes')}</MobileNavLink>
                <MobileNavLink href="/loja/catalogo" onClick={() => setMenuOpen(false)}>{t('catalogo')}</MobileNavLink>
                <MobileNavLink href="/loja/pedidos" onClick={() => setMenuOpen(false)}>{t('pedidos')}</MobileNavLink>
                <MobileNavLink href="/loja/aprender" onClick={() => setMenuOpen(false)}>🎓 {t('aprender')}</MobileNavLink>
                <MobileNavLink href="/loja/perfil" onClick={() => setMenuOpen(false)}>{t('perfil')}</MobileNavLink>
              </>
            ) : (
              <>
                <MobileNavLink href="/cliente/dashboard" onClick={() => setMenuOpen(false)}>{t('inicio')}</MobileNavLink>
                <MobileNavLink href="/cliente/veiculos" onClick={() => setMenuOpen(false)}>{t('veiculos')}</MobileNavLink>
                <MobileNavLink href="/cliente/nova-solicitacao" onClick={() => setMenuOpen(false)}>{t('novaSolicitacao')}</MobileNavLink>
                <MobileNavLink href="/cliente/orcamentos" onClick={() => setMenuOpen(false)}>{t('orcamentos')}</MobileNavLink>
                <MobileNavLink href="/cliente/mensagens" onClick={() => setMenuOpen(false)}>{t('mensagens')}{contadorMsgs}</MobileNavLink>
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
    {/* celular e tablet: os mesmos links numa linha abaixo do cabecalho, fora da
        parte fixa (nao come altura da tela ao rolar). flex-wrap: se nao couber
        (320 px), quebra em vez de vazar para o lado. Fora do /pedido: ali a altura
        da tela e do formulario (Clarity 11/11, globals.css body.pagina-pedido) */}
    {!isLoggedIn && !areaPrivada && pathname !== '/pedido' && (
      <nav aria-label={t('menuPrincipal')} className="lg:hidden bg-white border-b border-gray-200">
        <div className="flex flex-wrap justify-center gap-x-1 px-2 py-1">
          {linksVisitante.map((l) => {
            const ativo = pathname === l.href || pathname?.startsWith(l.href + '/');
            return (
              <Link key={l.href} href={l.href as any} aria-current={ativo ? 'page' : undefined}
                className={`px-2.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${ativo ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}>
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>
    )}
    {isLoggedIn && isOficina && (
      // Barra de baixo no celular (auditoria do painel 10/10, B1): o principal
      // cabe no polegar; "Mais" abre o resto. Abaixo de 1280 px, como o menu.
      <nav aria-label={t('menuPrincipal')} className="barra-inferior xl:hidden fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className={`grid ${menuOficina ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {(menuOficina
            ? [{ href: '/oficina/pedidos', txt: t('pedidosOficina'), icone: 'caixa', extra: contadorPedidos }, { href: '/oficina/hoje', txt: t('hoje'), icone: 'hoje' }, { href: '/oficina/agenda', txt: t('agenda'), icone: 'agenda' }, { href: '/oficina/mensagens', txt: t('conversasOficina'), icone: 'mensagens', extra: contadorMsgs }]
            : [{ href: '/oficina/hoje', txt: t('hoje'), icone: 'hoje' }, { href: '/oficina/agenda', txt: t('agenda'), icone: 'agenda' }, { href: '/oficina/aprender', txt: t('aprender'), icone: 'aprender' }]
          ).map((it: any) => <ItemBarra key={it.href} {...it} onClick={() => setMenuOpen(false)} />)}
          <button type="button" onClick={() => { setMenuOpen((v) => !v); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-expanded={menuOpen} aria-controls="menu-mobile"
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${menuOpen ? 'text-primary-700' : 'text-gray-600'}`}>
            <Icone nome="mais" />{t('mais')}
          </button>
        </div>
      </nav>
    )}
    {isLoggedIn && isCliente && (
      <nav aria-label={t('menuPrincipal')} className="barra-inferior xl:hidden fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {[
            { href: '/cliente/dashboard', txt: t('inicio'), icone: 'casa' },
            { href: '/cliente/orcamentos', txt: t('pedidosCliente'), icone: 'caixa' },
            { href: '/cliente/mensagens', txt: t('mensagens'), icone: 'mensagens', extra: contadorMsgs },
            { href: '/cliente/notificacoes', txt: t('avisos'), icone: 'sino', extra: avisosNovos > 0 ? <span className="inline-block min-w-[1.25rem] rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold leading-5 text-white">{avisosNovos > 9 ? '9+' : avisosNovos}</span> : null },
          ].map((it: any) => <ItemBarra key={it.href} {...it} onClick={() => setMenuOpen(false)} />)}
          <button type="button" onClick={() => { setMenuOpen((v) => !v); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-expanded={menuOpen} aria-controls="menu-mobile"
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${menuOpen ? 'text-primary-700' : 'text-gray-600'}`}>
            <Icone nome="mais" />{t('mais')}
          </button>
        </div>
      </nav>
    )}
    </>
  );
}

function Icone({ nome }: { nome: string }) {
  const d: Record<string, string> = {
    caixa: 'M3 13h4l2 3h6l2-3h4M5 5h14l2 8v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6l2-8z',
    hoje: 'M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zm4 10l2 2 4-4',
    agenda: 'M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
    aprender: 'M12 14l9-5-9-5-9 5 9 5zm0 0v6m-6-9v5c0 1.5 3 3 6 3s6-1.5 6-3v-5',
    mais: 'M4 6h16M4 12h16M4 18h16',
    casa: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
    sino: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    mensagens: 'M8 10h8M8 14h5M21 12c0 4.4-4 8-9 8a9.9 9.9 0 01-4-.8L3 20l1.3-3.9A7.6 7.6 0 013 12c0-4.4 4-8 9-8s9 3.6 9 8z',
    oficina: 'M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6',
  };
  return <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={d[nome]} /></svg>;
}

function ItemBarra({ href, txt, icone, extra, onClick }: { href: string; txt: string; icone: string; extra?: React.ReactNode; onClick: () => void }) {
  const pathname = usePathname();
  const ativo = pathname === href || pathname?.startsWith(href + '/');
  return (
    <Link href={href as any} onClick={onClick} aria-current={ativo ? 'page' : undefined}
      className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${ativo ? 'text-primary-700' : 'text-gray-600'}`}>
      <span className="relative"><Icone nome={icone} />{extra && <span className="absolute -right-3 -top-1">{extra}</span>}</span>{txt}
    </Link>
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
