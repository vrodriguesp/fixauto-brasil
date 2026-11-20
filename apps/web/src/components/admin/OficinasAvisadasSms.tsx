'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/utils';

// "Oficinas avisadas" (dono 20/11): quem recebeu o pedido, se abriu, orcou ou marcou "sem interesse",
// e o SMS com o link do pedido (individual ou "para quem nao abriu"). Confirmacao na propria pagina.
// API: /api/admin/solicitacoes/[id]/sms-oficinas; regras em lib/sms-oficinas.ts.

const BLOQUEIO: Record<string, string> = {
  pedido_fechado: 'pedido encerrado', orcou: 'já orçou', dispensou: 'não tem interesse', inativa: 'oficina inativa',
  sem_telefone: 'sem telefone', sms_recente: 'SMS há menos de 12 h',
};
const MOTIVO_RESULTADO: Record<string, string> = {
  ...BLOQUEIO, conta_teste: 'conta de teste (não recebe SMS)', nao_configurado: 'SMS não configurado no servidor',
  abriu: 'já abriu o pedido', fora_da_lista: 'fora da lista', nao_avisada: 'não foi avisada', erro_interno: 'erro interno',
};
const STATUS_SMS: Record<string, string> = { enviado: 'enviado', enviando: 'enviando', recusado: 'recusado', pulado: 'não enviado' };
const IDIOMA: Record<string, string> = { et: 'ET', ru: 'RU', en: 'EN' };

type Linha = {
  oficina_id: string; nome: string; cidade: string | null; idioma: string; avisadaEm: string; vistoEm: string | null;
  orcamento: { status: string; em: string } | null; dispensa: { motivo: string; em: string } | null;
  telefone: boolean; telefoneFinal: string | null; ativa: boolean; contaTeste: boolean;
  ultimoSms: { status: string; motivo: string | null; em: string } | null;
  bloqueio: string | null; liberaEm: string | null; naoAbriu: boolean; texto: string;
};

export default function OficinasAvisadasSms({ solicitacaoId, numero }: { solicitacaoId: string; numero: number | null }) {
  const [dados, setDados] = useState<{ numero: number | null; configurado: boolean; oficinas: Linha[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<{ modo: 'uma' | 'nao_abriu'; alvo: Linha[] } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string[] | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/admin/solicitacoes/${solicitacaoId}/sms-oficinas`);
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { setErro(r.error || 'Erro ao carregar as oficinas avisadas.'); return; }
    setErro(null); setDados(r);
  }, [solicitacaoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async () => {
    if (!confirmar) return;
    setEnviando(true);
    const res = await fetch(`/api/admin/solicitacoes/${solicitacaoId}/sms-oficinas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: confirmar.modo, oficinaIds: confirmar.alvo.map((o) => o.oficina_id) }),
    });
    const r = await res.json().catch(() => ({}));
    setEnviando(false); setConfirmar(null);
    setResultado(res.ok
      ? (r.resultados || []).map((x: any) => `${x.nome || x.oficina_id}: ${x.status === 'enviado' ? 'SMS enviado' : `${STATUS_SMS[x.status] || x.status}${x.motivo ? ` (${MOTIVO_RESULTADO[x.motivo] || x.motivo})` : ''}`}`)
      : [r.error || 'Erro ao enviar.']);
    await carregar();
  };

  const n = dados?.numero ?? numero;
  const naoAbriram = (dados?.oficinas || []).filter((o) => o.naoAbriu);

  return (
    <div className="mb-8" data-testid="admin-oficinas-avisadas">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-slate-400 text-xs uppercase tracking-wide">
          Oficinas avisadas — pedido <span data-testid="avisadas-numero">{n ?? '—'}</span>{dados ? ` (${dados.oficinas.length})` : ''}
        </p>
        {dados && dados.oficinas.length > 0 && (
          <button
            onClick={() => { setResultado(null); setConfirmar({ modo: 'nao_abriu', alvo: naoAbriram }); }}
            disabled={!naoAbriram.length || !dados.configurado || enviando}
            title={!dados.configurado ? 'SMS não configurado no servidor' : !naoAbriram.length ? 'Nenhuma oficina sem abrir com telefone e sem SMS recente' : undefined}
            data-testid="sms-nao-abriu"
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
          >
            SMS para quem não abriu ({naoAbriram.length})
          </button>
        )}
      </div>
      {dados && !dados.configurado && <p className="text-amber-300 text-xs mb-2">SMS não configurado no servidor (Twilio): os botões ficam desligados.</p>}
      {erro && <p className="text-red-400 text-sm">{erro}</p>}

      {confirmar && (
        <div className="mb-3 rounded-xl border border-blue-500/40 bg-blue-500/10 p-4" data-testid="sms-confirmar">
          <p className="text-slate-200 text-sm font-medium mb-2">
            Enviar SMS do pedido {n} para {confirmar.alvo.length} {confirmar.alvo.length === 1 ? 'oficina' : 'oficinas'}?
          </p>
          <ul className="text-xs text-slate-300 space-y-1 mb-3">
            {confirmar.alvo.map((o) => (
              <li key={o.oficina_id} data-oficina={o.oficina_id}>
                <span className="font-medium">{o.nome}</span> · tel. …{o.telefoneFinal} · {IDIOMA[o.idioma] || o.idioma}
                <span className="block text-slate-400 break-all" data-testid="sms-texto">“{o.texto}”</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button onClick={enviar} disabled={enviando || !confirmar.alvo.length} data-testid="sms-confirmar-enviar" className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {enviando ? 'Enviando...' : `Confirmar e enviar ${confirmar.alvo.length}`}
            </button>
            <button onClick={() => setConfirmar(null)} disabled={enviando} className="text-slate-300 text-sm px-4 py-2 rounded-lg border border-slate-600">Cancelar</button>
          </div>
        </div>
      )}

      {resultado && (
        <ul className="mb-3 text-sm text-slate-200 space-y-0.5" data-testid="sms-resultado">
          {resultado.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}

      {dados && dados.oficinas.length === 0 ? (
        <p className="text-slate-500 text-sm">Nenhuma oficina foi avisada deste pedido.</p>
      ) : dados && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Oficina</th>
                <th className="py-1 pr-3 font-medium">Avisada</th>
                <th className="py-1 pr-3 font-medium">Abriu?</th>
                <th className="py-1 pr-3 font-medium">Orçamento</th>
                <th className="py-1 pr-3 font-medium">Sem interesse</th>
                <th className="py-1 pr-3 font-medium">Telefone</th>
                <th className="py-1 pr-3 font-medium">Último SMS</th>
                <th className="py-1 font-medium"></th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {dados.oficinas.map((o) => (
                <tr key={o.oficina_id} className="border-t border-slate-700/60 align-top" data-testid="avisada-oficina" data-oficina={o.oficina_id}
                  data-visto={o.vistoEm ? '1' : '0'} data-orcou={o.orcamento ? '1' : '0'} data-dispensou={o.dispensa ? '1' : '0'}
                  data-bloqueio={o.bloqueio || ''} data-nao-abriu={o.naoAbriu ? '1' : '0'}>
                  <td className="py-1.5 pr-3">
                    <span className="text-slate-200 font-medium">{o.nome}</span>
                    <span className="text-slate-500">{o.cidade ? ` · ${o.cidade}` : ''} · {IDIOMA[o.idioma] || o.idioma}</span>
                    {!o.ativa && <span className="ml-1 text-red-400">inativa</span>}
                    {o.contaTeste && <span className="ml-1 text-amber-300">teste</span>}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{formatDateTime(o.avisadaEm)}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{o.vistoEm ? <span className="text-emerald-400">sim · {formatDateTime(o.vistoEm)}</span> : <span className="text-slate-500">não</span>}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{o.orcamento ? <span className="text-emerald-400">{o.orcamento.status}</span> : '—'}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{o.dispensa ? <span className="text-amber-300">sim</span> : '—'}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{o.telefone ? `…${o.telefoneFinal}` : <span className="text-slate-500">sem</span>}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {o.ultimoSms ? `${STATUS_SMS[o.ultimoSms.status] || o.ultimoSms.status} · ${formatDateTime(o.ultimoSms.em)}${o.ultimoSms.motivo ? ` (${MOTIVO_RESULTADO[o.ultimoSms.motivo] || o.ultimoSms.motivo})` : ''}` : '—'}
                  </td>
                  <td className="py-1.5 whitespace-nowrap">
                    <button
                      onClick={() => { setResultado(null); setConfirmar({ modo: 'uma', alvo: [o] }); }}
                      disabled={!!o.bloqueio || !dados.configurado || enviando}
                      data-testid="sms-uma"
                      className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-2.5 py-1 rounded-lg"
                    >
                      Enviar SMS
                    </button>
                    {o.bloqueio && (
                      <span className="block text-slate-500 mt-0.5 whitespace-normal max-w-[11rem]" data-testid="sms-bloqueio">
                        {BLOQUEIO[o.bloqueio] || o.bloqueio}{o.liberaEm ? ` (libera ${formatDateTime(o.liberaEm)})` : ''}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
