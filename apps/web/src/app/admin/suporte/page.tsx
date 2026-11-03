'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { timeAgo } from '@/lib/utils';

// Chat de suporte (dono 03/11): conversas com oficinas, lojas, clientes e
// visitantes. A mensagem da pessoa aparece traduzida para o portugues (com o
// original embaixo); a resposta vai traduzida para a lingua dela quando a
// traducao esta ligada. Com esta pagina (ou qualquer outra do admin) aberta,
// o admin conta como "online" e nao sai a mensagem automatica.

interface Conversa { id: string; idioma: string; pagina: string | null; ultima: string; naoLidas: number; nome: string; email: string; tipo: string; previa: { autor: string; texto: string } | null }
interface Msg { id: string; autor: 'usuario' | 'admin' | 'auto'; texto: string; traducao: string | null; origem: string | null; created_at: string }

const IDIOMA: Record<string, string> = { et: '🇪🇪 estoniano', ru: '🇷🇺 russo', en: '🇬🇧 inglês', it: '🇮🇹 italiano', 'pt-PT': '🇵🇹 português (PT)', pt: '🇧🇷 português' };
const TIPO: Record<string, string> = { oficina: 'Oficina', loja_pecas: 'Loja', cliente: 'Cliente', visitante: 'Visitante' };

export default function SuporteAdmin() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [traducao, setTraducao] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const fimRef = useRef<HTMLDivElement>(null);

  const carregarLista = useCallback(async () => {
    const r = await fetch('/api/admin/suporte').catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setConversas(d.conversas || []); setTraducao(!!d.traducao);
  }, []);
  const carregarConversa = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/suporte/${id}`).catch(() => null);
    if (r?.ok) setMsgs((await r.json()).mensagens || []);
  }, []);

  useEffect(() => { carregarLista(); const i = setInterval(carregarLista, 10000); return () => clearInterval(i); }, [carregarLista]);
  useEffect(() => {
    if (!aberta) return;
    carregarConversa(aberta);
    const i = setInterval(() => carregarConversa(aberta), 4000);
    return () => clearInterval(i);
  }, [aberta, carregarConversa]);
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, aberta]);

  async function mudarTraducao() {
    // muda na hora; volta se o servidor recusar
    const novo = !traducao;
    setTraducao(novo);
    const r = await fetch('/api/admin/suporte', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traducao: novo }) }).catch(() => null);
    if (!r?.ok) { setTraducao(!novo); setAviso('Não foi possível mudar a tradução.'); }
  }

  async function responder() {
    if (!aberta || !texto.trim() || enviando) return;
    setEnviando(true); setAviso('');
    const r = await fetch(`/api/admin/suporte/${aberta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) }).catch(() => null);
    setEnviando(false);
    if (!r?.ok) { setAviso('Não foi possível enviar.'); return; }
    const d = await r.json();
    setTexto('');
    if (d.porEmail) setAviso('A pessoa não está com o chat aberto: a resposta foi também por e-mail.');
    carregarConversa(aberta); carregarLista();
  }

  const conv = conversas.find((c) => c.id === aberta);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suporte (chat)</h1>
          <p className="text-gray-600 mt-1">Com esta página aberta você aparece online e a mensagem automática não sai.</p>
        </div>
        <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
          <input type="checkbox" checked={traducao} onChange={mudarTraducao} className="h-4 w-4" data-testid="suporte-traducao" />
          <span><strong>Tradução automática</strong><br /><span className="text-gray-500">{traducao ? 'Ligada: você lê em português e a pessoa recebe na língua dela' : 'Desligada: as mensagens vão como foram escritas'}</span></span>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <ul className={`space-y-2 ${aberta ? 'hidden md:block' : ''}`}>
          {conversas.length === 0 && <li className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Nenhuma conversa ainda.</li>}
          {conversas.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setAberta(c.id)} data-testid="suporte-conversa"
                className={`w-full rounded-lg border p-3 text-left ${aberta === c.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900 truncate">{c.nome}</span>
                  {c.naoLidas > 0 && <span className="rounded-full bg-red-600 px-2 text-xs font-bold text-white">{c.naoLidas}</span>}
                </div>
                <p className="text-xs text-gray-500">{TIPO[c.tipo] || c.tipo} · {IDIOMA[c.idioma] || c.idioma} · {timeAgo(c.ultima, 'pt')}</p>
                {c.previa && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{c.previa.autor === 'usuario' ? '' : 'Você: '}{c.previa.texto}</p>}
              </button>
            </li>
          ))}
        </ul>

        {aberta && conv ? (
          <div className="flex h-[70vh] flex-col rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-3 border-b border-gray-200 p-3">
              <button type="button" onClick={() => setAberta(null)} className="md:hidden rounded p-1 text-gray-500" aria-label="Voltar">←</button>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{conv.nome}</p>
                <p className="text-xs text-gray-500 truncate">{conv.email} · {TIPO[conv.tipo] || conv.tipo} · {IDIOMA[conv.idioma] || conv.idioma}{conv.pagina ? ` · ${conv.pagina}` : ''}</p>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
              {msgs.map((m) => {
                const minha = m.autor !== 'usuario';
                return (
                  <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.autor === 'admin' ? 'bg-primary-600 text-white' : m.autor === 'auto' ? 'border border-dashed border-gray-300 bg-white italic text-gray-500' : 'border border-gray-200 bg-white text-gray-900'}`}>
                      {m.autor === 'auto' && <p className="text-[11px] not-italic font-semibold">Resposta automática (você estava offline)</p>}
                      <p className="whitespace-pre-wrap break-words">{m.autor === 'usuario' && m.traducao ? m.traducao : m.texto}</p>
                      {m.traducao && (
                        <p className={`mt-1 whitespace-pre-wrap border-t pt-1 text-xs ${m.autor === 'admin' ? 'border-primary-400 text-primary-100' : 'border-gray-100 text-gray-500'}`}>
                          {m.autor === 'usuario' ? `Original (${m.origem || '?'}): ${m.texto}` : `Enviado como: ${m.traducao}`}
                        </p>
                      )}
                      <p className={`mt-1 text-[11px] ${m.autor === 'admin' ? 'text-primary-100' : 'text-gray-400'}`}>{new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={fimRef} />
            </div>
            <div className="border-t border-gray-200 p-3">
              {aviso && <p className="mb-2 text-xs text-gray-600" role="status">{aviso}</p>}
              <div className="flex items-end gap-2">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} aria-label="Resposta" data-testid="suporte-resposta"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(); } }}
                  placeholder={traducao ? 'Escreva em português ou inglês: vai traduzido' : 'Escreva a resposta'} className="input-field flex-1 resize-none" />
                <button type="button" onClick={responder} disabled={enviando || !texto.trim()} className="btn-primary disabled:opacity-50">Enviar</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex h-[70vh] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">Escolha uma conversa</div>
        )}
      </div>
    </div>
  );
}
