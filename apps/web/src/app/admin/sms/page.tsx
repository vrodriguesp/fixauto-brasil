'use client';

import { useCallback, useEffect, useState } from 'react';
import { timeAgo } from '@/lib/utils';

// SMS ao cliente (dono 04/11): ligar/desligar o aviso automatico "chegou
// orcamento", enviar manualmente pelo numero do pedido e ver o registro.
// Desligar quando o app estiver na loja: quem tem o app recebe o push.

interface Envio { id: string; tipo: 'orcamento_auto' | 'manual'; status: 'enviado' | 'recusado' | 'pulado'; motivo: string | null; final: string | null; quando: string; numero: number | null; cliente: string | null }
interface Dados { ativo: boolean; configurado: boolean; saldo: { saldo: string; moeda: string } | null; envios: Envio[] }

const MOTIVO: Record<string, string> = {
  sem_telefone: 'cliente sem telefone',
  pedido_fechado: 'pedido fechado ou cancelado',
  sem_orcamento: 'pedido ainda sem orçamento',
  tem_app: 'cliente tem o app (recebeu push)',
  pedido_nao_encontrado: 'pedido não encontrado',
  erro_interno: 'erro interno',
};
const STATUS: Record<Envio['status'], string> = {
  enviado: 'bg-green-100 text-green-800', recusado: 'bg-red-100 text-red-800', pulado: 'bg-gray-100 text-gray-700',
};

export default function AdminSmsPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [numero, setNumero] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch('/api/admin/sms').catch(() => null);
    if (!r || !r.ok) { setErroCarga(true); return; }
    setErroCarga(false); setDados(await r.json());
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const alternar = async () => {
    if (!dados) return;
    setSalvando(true);
    const r = await fetch('/api/admin/sms', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !dados.ativo }) }).catch(() => null);
    setSalvando(false);
    if (r?.ok) setDados({ ...dados, ativo: !dados.ativo });
    else setAviso({ ok: false, texto: 'Não foi possível salvar. Tente de novo.' });
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = numero.replace(/\D/g, '');
    if (!n) { setAviso({ ok: false, texto: 'Digite o número do pedido (ex.: 100133).' }); return; }
    if (!confirm(`Enviar o SMS "chegou orçamento" ao cliente do pedido ${n}?`)) return;
    setEnviando(true); setAviso(null);
    const r = await fetch('/api/admin/sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: n }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setEnviando(false);
    if (r?.ok) { setAviso({ ok: true, texto: `SMS enviado ao cliente do pedido ${n}.` }); setNumero(''); }
    else setAviso({ ok: false, texto: `Não enviado: ${MOTIVO[j.motivo] || j.error || j.motivo || 'erro de conexão'}.` });
    carregar();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900">SMS aos clientes</h1>
      <p className="text-gray-600 mt-1">Aviso &quot;chegou orçamento&quot; por SMS (Twilio, só números da Estônia). Quem tem o app recebe a notificação no app, não SMS.</p>

      {erroCarga && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">Não foi possível carregar. Recarregue a página.</p>}
      {!dados && !erroCarga && <p className="mt-6 text-gray-500">Carregando…</p>}

      {dados && (
        <>
          {!dados.configurado && (
            <p role="alert" className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">As chaves da Twilio não estão no servidor: nenhum SMS sai até elas serem configuradas.</p>
          )}

          <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5" aria-labelledby="sms-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 id="sms-auto" className="font-semibold text-gray-900">Envio automático</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {dados.ativo ? 'Ligado: o cliente recebe 1 SMS quando chega cada orçamento novo.' : 'Desligado: só e-mail e notificação no site/app.'}
                </p>
                {dados.saldo && <p className="mt-1 text-sm text-gray-500" data-testid="sms-saldo">Saldo Twilio: {Number(dados.saldo.saldo).toFixed(2)} {dados.saldo.moeda}</p>}
              </div>
              <button type="button" role="switch" aria-checked={dados.ativo} onClick={alternar} disabled={salvando} data-testid="sms-interruptor"
                className={`inline-flex min-h-[44px] items-center rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50 ${dados.ativo ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600'}`}>
                {salvando ? 'Salvando…' : dados.ativo ? 'Ligado — desligar' : 'Desligado — ligar'}
              </button>
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5" aria-labelledby="sms-manual">
            <h2 id="sms-manual" className="font-semibold text-gray-900">Enviar manualmente</h2>
            <p className="mt-1 text-sm text-gray-600">Manda o aviso &quot;chegou orçamento&quot; ao cliente de um pedido aberto que já tem orçamento (funciona mesmo com o automático desligado).</p>
            <form onSubmit={enviar} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="sms-numero">Número do pedido</label>
              <input id="sms-numero" inputMode="numeric" placeholder="Nº do pedido, ex.: 100133" value={numero} onChange={(e) => setNumero(e.target.value)}
                className="input-field min-h-[44px] sm:w-64" data-testid="sms-numero" />
              <button type="submit" disabled={enviando} className="btn-primary min-h-[44px] disabled:opacity-50" data-testid="sms-enviar">
                {enviando ? 'Enviando…' : 'Enviar SMS'}
              </button>
            </form>
            {aviso && <p role="status" className={`mt-3 text-sm ${aviso.ok ? 'text-green-700' : 'text-red-700'}`} data-testid="sms-aviso">{aviso.texto}</p>}
          </section>

          <section className="mt-6" aria-labelledby="sms-registro">
            <h2 id="sms-registro" className="font-semibold text-gray-900">Últimos envios</h2>
            {dados.envios.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Nenhum SMS ainda.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white" data-testid="sms-lista">
                {dados.envios.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[e.status]}`}>{e.status}</span>
                    <span className="text-gray-900">Pedido {e.numero ?? '—'}{e.cliente ? ` · ${e.cliente}` : ''}{e.final ? ` · …${e.final}` : ''}</span>
                    <span className="text-gray-500">{e.tipo === 'manual' ? 'manual' : 'automático'}</span>
                    {e.motivo && <span className="text-gray-500">· {MOTIVO[e.motivo] || e.motivo}</span>}
                    <span className="ml-auto text-gray-400">{timeAgo(e.quando)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
