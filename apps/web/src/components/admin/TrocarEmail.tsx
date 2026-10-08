'use client';

import { useState } from 'react';

// Troca do email de acesso pelo admin (email errado no cadastro, caixa sem
// acesso). O novo ja fica confirmado; a senha continua a mesma.
export default function TrocarEmail({ profileId, emailAtual, aoTrocar }: { profileId: string; emailAtual: string; aoTrocar?: (email: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [motivo, setMotivo] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const salvar = async () => {
    setSalvando(true); setErro('');
    const res = await fetch('/api/admin/usuarios/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: profileId, email, motivo }) });
    const d = await res.json().catch(() => ({}));
    setSalvando(false); setConfirmar(false);
    if (!res.ok) { setErro(d.error || 'Erro ao trocar o email'); return; }
    setOk(`Email trocado para ${d.email}. A senha continua a mesma.`);
    setAberto(false); setEmail(''); setMotivo('');
    aoTrocar?.(d.email);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-white break-all">{emailAtual}</p>
        {!aberto && (
          <button type="button" onClick={() => { setAberto(true); setOk(''); }} className="text-xs text-sky-400 hover:text-sky-300 underline">
            Mudar email
          </button>
        )}
      </div>
      {ok && <p className="text-xs text-emerald-400 mt-1">{ok}</p>}
      {aberto && (
        <div className="mt-2 space-y-2 bg-slate-900/60 border border-slate-700 rounded-lg p-3">
          <input type="email" aria-label="Novo email" placeholder="Novo email" value={email} onChange={(e) => { setEmail(e.target.value); setConfirmar(false); }}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white" />
          <input type="text" aria-label="Motivo" placeholder="Motivo (ex.: email digitado errado)" value={motivo} onChange={(e) => setMotivo(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white" />
          {erro && <p className="text-xs text-red-400">{erro}</p>}
          {confirmar ? (
            <div role="alertdialog" className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded p-2">
              <p className="mb-2">O login desta conta passa a ser <b>{email.trim().toLowerCase()}</b> (já confirmado). O email antigo deixa de funcionar. Confirmar?</p>
              <div className="flex gap-2">
                <button type="button" onClick={salvar} disabled={salvando} className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium disabled:opacity-50">
                  {salvando ? 'Salvando...' : 'Sim, trocar'}
                </button>
                <button type="button" onClick={() => setConfirmar(false)} className="px-3 py-1.5 rounded bg-slate-700 text-slate-200 text-xs">Voltar</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => { setErro(''); setConfirmar(true); }} disabled={!email.includes('@') || motivo.trim().length < 3}
                className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-40">
                Trocar
              </button>
              <button type="button" onClick={() => { setAberto(false); setErro(''); }} className="px-3 py-1.5 rounded bg-slate-700 text-slate-200 text-xs">Cancelar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
