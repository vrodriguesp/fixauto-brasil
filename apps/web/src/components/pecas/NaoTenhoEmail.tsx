'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

// Link "Nao tenho" do e-mail de pecas (lote 2, 17/11; api/cotacao-peca/nao-tenho-email). Sem login:
// abrir so mostra o nome da peca ('ver' nao grava nada); o toque em "Confirmar" grava a dispensa
// e a cotacao some da lista do fornecedor. O token sai da barra de endereco ao abrir.
type Estado = 'carregando' | 'pergunta' | 'feito' | 'vencido' | 'jaRespondeu' | 'jaDispensou' | 'invalido';
const MOTIVOS = [['sem_estoque', 'semEstoque'], ['nao_trabalho', 'naoTrabalho'], ['outro', 'outro']] as const;

export default function NaoTenhoEmail({ token: tokenDaPagina }: { token: string }) {
  const t = useTranslations('pecas');
  const [token, setToken] = useState(tokenDaPagina);
  const [estado, setEstado] = useState<Estado>('carregando');
  const [peca, setPeca] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);
  const iniciado = useRef(false);

  const chamar = (acao: 'ver' | 'confirmar', extra: Record<string, unknown> = {}, k = token) => fetch('/api/cotacao-peca/nao-tenho-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, acao, ...extra }),
  }).then(async (r) => ({ r, d: await r.json().catch(() => ({})) }), () => ({ r: null as Response | null, d: {} as any }));

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    // pagina gerada sem a consulta (cache): o token tambem e lido da barra; lote 3: o link novo traz o
    // token no fragmento (#k=), que o script da pagina ja tirou da barra e guardou em window.__naoTenhoK
    const k = tokenDaPagina || (window as unknown as { __naoTenhoK?: string }).__naoTenhoK || new URLSearchParams(window.location.search).get('k') || (window.location.hash.match(/[#&]k=([A-Za-z0-9_-]+)/) || [])[1] || '';
    setToken(k);
    // o token nao fica no historico nem vai junto se a pessoa compartilhar a pagina
    window.history.replaceState(null, '', window.location.pathname);
    if (!k) { setEstado('invalido'); return; }
    chamar('ver', {}, k).then(({ r, d }) => {
      if (!r?.ok) { setEstado('invalido'); return; }
      setPeca(String(d.peca || ''));
      if (d.jaDispensou) setEstado('jaDispensou');
      else if (d.jaRespondeu) setEstado('jaRespondeu');
      else if (d.vencido || !d.aberta) setEstado('vencido');
      else setEstado('pergunta');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmar = async () => {
    if (enviando) return;
    setEnviando(true); setErro(false);
    const { r, d } = await chamar('confirmar', motivo ? { motivo } : {});
    setEnviando(false);
    if (r?.ok) { setEstado(d.jaDispensou ? 'jaDispensou' : 'feito'); return; }
    if (d?.codigo === 'COTACAO_FECHADA') setEstado('vencido');
    else if (d?.codigo === 'JA_RESPONDEU') setEstado('jaRespondeu');
    else if (d?.codigo === 'LINK_INVALIDO') setEstado('invalido');
    else setErro(true);
  };

  const mensagem = (testid: string, texto: string) => (
    <p className="text-gray-700" role="status" data-testid={testid}>{texto}</p>
  );

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 mb-3">{t('naoTenhoTitulo')}</h1>
        {estado === 'carregando' && <div className="animate-pulse h-16 bg-gray-200 rounded-lg" aria-busy="true" />}
        {peca && estado !== 'carregando' && estado !== 'invalido' && (
          <p className="mb-4 font-medium text-gray-900 break-words" data-testid="nao-tenho-peca">{peca}</p>
        )}
        {estado === 'pergunta' && (
          <div className="space-y-3">
            <label htmlFor="nao-tenho-motivo" className="block text-sm font-medium text-gray-700">{t('naoTenhoMotivo')}</label>
            <select id="nao-tenho-motivo" data-testid="nao-tenho-motivo" className="input-field" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">—</option>
              {MOTIVOS.map(([v, k]) => <option key={v} value={v}>{t(`naoTenhoMotivos.${k}`)}</option>)}
            </select>
            <button type="button" onClick={confirmar} disabled={enviando} aria-busy={enviando} className="btn-primary w-full min-h-[44px] disabled:opacity-50" data-testid="nao-tenho-confirmar">
              {t('naoTenhoConfirmar')}
            </button>
            {erro && <p role="alert" className="text-sm text-red-700">{t('respostaErro')}</p>}
          </div>
        )}
        {estado === 'feito' && mensagem('nao-tenho-feito', t('naoTenhoFeito'))}
        {estado === 'vencido' && mensagem('nao-tenho-vencido', t('naoTenhoVencido'))}
        {estado === 'jaRespondeu' && mensagem('nao-tenho-ja-respondeu', t('naoTenhoJaRespondeu'))}
        {estado === 'jaDispensou' && mensagem('nao-tenho-ja-dispensou', t('naoTenhoJaDispensou'))}
        {estado === 'invalido' && mensagem('nao-tenho-invalido', t('naoTenhoInvalido'))}
      </div>
    </div>
  );
}
