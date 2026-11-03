'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';

// Chat de suporte com o admin (dono 03/11): botao no canto de todas as paginas.
// Logado (oficina, loja, cliente): conversa da conta. Visitante: nome + e-mail
// para comecar; a chave da conversa fica neste navegador. Mensagens por
// consulta periodica (4 s com o chat aberto, 45 s fechado so para o contador).

type Msg = { id: string; autor: 'usuario' | 'admin' | 'auto'; texto: string; original: string | null; created_at: string };
const CHAVE = 'bipfix_suporte';
// pagina do acidente (tem conversa propria), nas 6 linguas - i18n/routing.ts
const CONVERSA_ACIDENTE = /\/(emergencia\/acidente|accident\/report|avarii\/teade|incidente\/segnalazione|dtp\/soobshchenie)\/[^/]+/;
const lerChave = (): { c: string; t: string } | null => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; } };

export default function ChatSuporte() {
  const t = useTranslations('suporte');
  const tTr = useTranslations('traducao');
  const locale = useLocale();
  const pathname = usePathname() || '';
  const busca = useSearchParams();
  const { user, isLoggedIn, loading } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [temConversa, setTemConversa] = useState(false);
  const [online, setOnline] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [originais, setOriginais] = useState<Record<string, boolean>>({});
  const fimRef = useRef<HTMLDivElement>(null);

  // nas conversas (oficina <-> cliente, acidente) o botao cobriria a caixa de digitar
  const escondido = loading || user?.tipo === 'admin' || /\/mensagens\/[^/]+/.test(pathname) || CONVERSA_ACIDENTE.test(pathname);
  const visitante = !loading && !isLoggedIn;

  const carregar = useCallback(async (estaAberto: boolean) => {
    const k = visitante ? lerChave() : null;
    if (visitante && !k) { setTemConversa(false); return; }
    const q = new URLSearchParams({ ...(k ? { c: k.c, t: k.t } : {}), ...(estaAberto ? { aberto: '1' } : {}) });
    const r = await fetch(`/api/suporte?${q}`).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setOnline(!!d.adminOnline);
    setTemConversa(!!d.conversa);
    setMsgs(d.mensagens || []);
    setNaoLidas(d.naoLidas || 0);
    if (visitante && k && !d.conversa) { try { localStorage.removeItem(CHAVE); } catch { /* ignora */ } }
  }, [visitante]);

  useEffect(() => {
    if (escondido) return;
    carregar(aberto);
    const id = setInterval(() => { if (document.visibilityState === 'visible') carregar(aberto); }, aberto ? 4000 : 45000);
    return () => clearInterval(id);
  }, [aberto, escondido, carregar]);

  // link do e-mail de resposta: ?suporte=1 abre o chat
  useEffect(() => { if (busca?.get('suporte') === '1') setAberto(true); }, [busca]);
  useEffect(() => { if (aberto) fimRef.current?.scrollIntoView({ block: 'end' }); }, [aberto, msgs.length]);
  // espaco no fim da pagina para o botao nao cobrir o ultimo botao da pagina
  useEffect(() => {
    document.body.classList.toggle('com-chat-suporte', !escondido);
    return () => document.body.classList.remove('com-chat-suporte');
  }, [escondido]);

  if (escondido) return null;

  async function comecar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nome = String(f.get('nome') || '').trim(); const email = String(f.get('email') || '').trim();
    if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErro(t('erroCampos')); return; }
    if (!f.get('consentimento')) { setErro(t('erroConsentimento')); return; }
    setEnviando(true); setErro('');
    const r = await fetch('/api/suporte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'iniciar', nome, email, consentimento: true, idioma: locale, pagina: pathname, site: f.get('site') || '' }) }).catch(() => null);
    setEnviando(false);
    const d = r?.ok ? await r.json() : null;
    if (!d?.conversaId) { setErro(t('erro')); return; }
    try { localStorage.setItem(CHAVE, JSON.stringify({ c: d.conversaId, t: d.token })); } catch { /* ignora */ }
    setTemConversa(true);
    carregar(true);
  }

  async function enviar() {
    const txt = texto.trim();
    if (!txt || enviando) return;
    setEnviando(true); setErro('');
    const k = visitante ? lerChave() : null;
    const r = await fetch('/api/suporte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'enviar', texto: txt, idioma: locale, pagina: pathname, ...(k ? { c: k.c, t: k.t } : {}) }) }).catch(() => null);
    setEnviando(false);
    if (!r?.ok) { setErro(t('erro')); return; }
    setTexto('');
    carregar(true);
  }

  const precisaCadastro = visitante && !temConversa;
  const hora = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      {!aberto && (
        <button type="button" onClick={() => setAberto(true)} aria-label={t('abrir')} data-testid="chat-suporte-botao"
          className="chat-suporte-botao fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-300">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          {naoLidas > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-xs font-bold leading-5" data-testid="chat-suporte-nao-lidas">{naoLidas}</span>}
        </button>
      )}

      {aberto && (
        <div role="dialog" aria-label={t('titulo')} data-testid="chat-suporte-janela"
          className="fixed inset-0 z-[60] flex flex-col bg-white sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[560px] sm:max-h-[calc(100vh-2rem)] sm:w-[380px] sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-2xl">
          <div className="flex items-center justify-between gap-3 bg-primary-600 px-4 py-3 text-white sm:rounded-t-2xl">
            <div className="min-w-0">
              <p className="font-semibold">{t('titulo')}</p>
              <p className="flex items-center gap-1.5 text-xs text-primary-100">
                <span className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-green-400' : 'bg-gray-300'}`} aria-hidden="true" />
                {online ? t('online') : t('offline')}
              </p>
            </div>
            <button type="button" onClick={() => setAberto(false)} aria-label={t('fechar')} className="rounded-lg p-2 hover:bg-primary-700">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {precisaCadastro ? (
            <form onSubmit={comecar} className="flex-1 space-y-3 overflow-y-auto p-4" noValidate>
              <p className="text-sm text-gray-600">{t('intro')}</p>
              <div>
                <label htmlFor="suporte-nome" className="mb-1 block text-sm font-medium text-gray-700">{t('nome')}</label>
                <input id="suporte-nome" name="nome" autoComplete="name" maxLength={100} className="input-field" />
              </div>
              <div>
                <label htmlFor="suporte-email" className="mb-1 block text-sm font-medium text-gray-700">{t('email')}</label>
                <input id="suporte-email" name="email" type="email" autoComplete="email" maxLength={254} className="input-field" />
              </div>
              {/* campo isca para robos (escondido de pessoas) */}
              <input name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
              <label className="flex items-start gap-2 text-sm text-gray-600">
                <input type="checkbox" name="consentimento" className="mt-1 h-4 w-4 flex-shrink-0" />
                <span>{t('consentimento')} <Link href="/privacidade" target="_blank" className="text-primary-600 underline">{t('privacidade')}</Link></span>
              </label>
              {erro && <p className="text-sm text-red-600" role="alert">{erro}</p>}
              <button type="submit" disabled={enviando} className="btn-primary w-full disabled:opacity-60">{t('comecar')}</button>
            </form>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4" aria-live="polite">
                {msgs.length === 0 && <p className="text-center text-sm text-gray-500">{t('vazio')}</p>}
                {msgs.map((m) => {
                  const minha = m.autor === 'usuario';
                  const verOriginal = !!originais[m.id];
                  return (
                    <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${minha ? 'bg-primary-600 text-white' : m.autor === 'auto' ? 'border border-gray-200 bg-white italic text-gray-600' : 'border border-gray-200 bg-white text-gray-900'}`}>
                        <p className="whitespace-pre-wrap break-words">{verOriginal && m.original ? m.original : m.texto}</p>
                        <p className={`mt-1 text-[11px] ${minha ? 'text-primary-100' : 'text-gray-400'}`}>
                          {hora(m.created_at)}
                          {m.original && (
                            <> · <button type="button" className="underline" onClick={() => setOriginais((o) => ({ ...o, [m.id]: !o[m.id] }))}>
                              {verOriginal ? tTr('verTraducao') : `${t('traduzida')} · ${tTr('verOriginal')}`}
                            </button></>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={fimRef} />
              </div>
              <div className="border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {erro && <p className="mb-2 text-sm text-red-600" role="alert">{erro}</p>}
                <div className="flex items-end gap-2">
                  <label htmlFor="suporte-texto" className="sr-only">{t('placeholder')}</label>
                  <textarea id="suporte-texto" rows={1} maxLength={2000} value={texto} placeholder={t('placeholder')}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                    className="input-field max-h-32 min-h-[44px] flex-1 resize-none" />
                  <button type="button" onClick={enviar} disabled={enviando || !texto.trim()} data-testid="chat-suporte-enviar"
                    className="btn-primary min-h-[44px] !px-4 disabled:opacity-50">{t('enviar')}</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
