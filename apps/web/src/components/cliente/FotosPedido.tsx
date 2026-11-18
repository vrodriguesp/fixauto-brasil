'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { FOTOS_POR_PEDIDO, STATUS_FOTOS_EDITAVEIS } from '@fixauto/shared';
import MidiaPrivada from '@/components/midia/MidiaPrivada';
import { compressImages } from '@/lib/image-compress';

type Foto = { id: string; foto_url: string; descricao?: string | null; origem?: string | null; created_at?: string };

// Fotos do pedido na tela do motorista (lote A, 18/11): as da criacao + as adicionadas depois.
// Com o pedido aberta/em_orcamento: camera e galeria (campos separados - o Chrome do Android abre
// a galeria com um so campo), contador n/10, apagar so as que ele adicionou. Tudo passa pela rota
// /api/solicitacoes/[id]/fotos (reencode no servidor, aviso as oficinas). Sem cadastro novo de estado
// no historico: nada de pushState - voltar continua levando ao painel.
export default function FotosPedido({ solicitacaoId, fotos, status, aoMudar }: {
  solicitacaoId: string;
  fotos: Foto[];
  status: string;
  aoMudar: () => void | Promise<void>;
}) {
  const t = useTranslations('clienteOrcamentoDetalhe');
  const tErr = useTranslations('erros');
  const inputCamera = useRef<HTMLInputElement>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const podeEditar = (STATUS_FOTOS_EDITAVEIS as readonly string[]).includes(status);
  const total = fotos.length;
  const restam = Math.max(0, FOTOS_POR_PEDIDO - total);

  const mensagemErro = (codigo?: string, status?: number) => {
    const conhecidos = ['FOTOS_PEDIDO_MAX', 'FOTO_STATUS', 'FOTO_NAO_APAGAVEL', 'FOTO_INVALIDA', 'FOTO_TIPO', 'FOTO_TAMANHO', 'RATE_LIMIT', 'SEM_ACESSO'];
    if (codigo && conhecidos.includes(codigo)) return tErr(codigo, { max: FOTOS_POR_PEDIDO });
    if (status === 413) return tErr('FOTO_TAMANHO');
    return t('fotosErro');
  };

  const enviar = async (e: ChangeEvent<HTMLInputElement>) => {
    const escolhidas = Array.from(e.target.files || []);
    e.target.value = '';
    if (!escolhidas.length) return;
    setErro(''); setAviso('');
    // o limite e conferido ja na tela (mensagem clara, nada enviado) e de novo no servidor
    if (escolhidas.length > restam) { setErro(tErr('FOTOS_PEDIDO_MAX', { max: FOTOS_POR_PEDIDO })); return; }
    setEnviando(true);
    try {
      const arquivos = await compressImages(escolhidas);
      const form = new FormData();
      for (const f of arquivos) form.append('fotos', f, f.name || 'foto.jpg');
      const res = await fetch(`/api/solicitacoes/${solicitacaoId}/fotos`, { method: 'POST', body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(mensagemErro(d.codigo, res.status)); return; }
      setAviso(t('fotosEnviadas', { n: (d.fotos || []).length }));
      await aoMudar();
    } catch {
      setErro(t('fotosErro'));
    } finally {
      setEnviando(false);
    }
  };

  const apagar = async (foto: Foto) => {
    if (!confirm(t('fotosApagarConfirma'))) return;
    setErro(''); setAviso('');
    setApagando(foto.id);
    try {
      const res = await fetch(`/api/solicitacoes/${solicitacaoId}/fotos?foto=${foto.id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(mensagemErro(d.codigo, res.status)); return; }
      await aoMudar();
    } catch {
      setErro(t('fotosErro'));
    } finally {
      setApagando(null);
    }
  };

  if (!total && !podeEditar) return null;

  return (
    <div className="mt-4" data-testid="fotos-pedido">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-gray-700">{t('photosCount', { count: total })}</p>
        {podeEditar && <span className="text-xs text-gray-500" data-testid="fotos-contador">{t('fotosContador', { n: total, max: FOTOS_POR_PEDIDO })}</span>}
      </div>
      {total > 0 && (
        <div className="flex gap-2 flex-wrap">
          {fotos.map((foto) => {
            const adicionada = foto.origem === 'adicionada';
            return (
              <div key={foto.id} className="relative w-20 h-20" data-testid={adicionada ? 'foto-adicionada' : 'foto-criacao'}>
                <MidiaPrivada url={foto.foto_url}>{(u) => (
                  <a href={u} target="_blank" rel="noopener noreferrer" className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden block">
                    <img src={u} alt={foto.descricao || t('photoFallback')} className="w-full h-full object-cover" />
                  </a>
                )}</MidiaPrivada>
                {adicionada && <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-primary-600 text-white text-[10px] font-semibold">{t('fotosNova')}</span>}
                {podeEditar && adicionada && (
                  <button type="button" aria-label={t('fotosApagar')} disabled={apagando === foto.id} data-testid="foto-apagar"
                    onClick={() => apagar(foto)} className="absolute -top-2 -right-2 w-7 h-7 bg-red-600 text-white rounded-full text-sm shadow disabled:opacity-50">×</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {podeEditar && (
        <div className="mt-3">
          <input ref={inputCamera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={enviar} data-testid="fotos-input-camera" />
          <input ref={inputGaleria} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={enviar} data-testid="fotos-input-galeria" />
          {restam > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => inputCamera.current?.click()} disabled={enviando} data-testid="fotos-camera"
                className="min-h-[44px] border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-700 hover:border-primary-400 disabled:opacity-50">📷 {t('fotosCamera')}</button>
              <button type="button" onClick={() => inputGaleria.current?.click()} disabled={enviando} data-testid="fotos-galeria"
                className="min-h-[44px] border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-700 hover:border-primary-400 disabled:opacity-50">🖼️ {t('fotosGaleria')}</button>
            </div>
          ) : (
            <p className="text-sm text-gray-600" data-testid="fotos-cheio">{t('fotosLimiteCheio', { max: FOTOS_POR_PEDIDO })}</p>
          )}
          {enviando && <p className="text-sm text-gray-600 mt-2" role="status">{t('fotosEnviando')}</p>}
          {aviso && !enviando && <p className="text-sm text-emerald-700 mt-2" role="status" data-testid="fotos-ok">{aviso}</p>}
          {erro && <p className="text-sm text-red-700 mt-2" role="alert" data-testid="fotos-erro">{erro}</p>}
          <p className="text-xs text-gray-500 mt-2">{t('fotosAjuda')}</p>
        </div>
      )}
    </div>
  );
}
