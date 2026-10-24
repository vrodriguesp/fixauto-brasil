'use client';

import { useState } from 'react';

// Video do YouTube "leve" (facade): mostra a miniatura do proprio site e so
// carrega o player quando a pessoa clica. Nao baixa nada do YouTube antes do
// clique (pagina rapida, sem cookies de terceiros) e usa youtube-nocookie.com.
export default function VideoYouTube({ id, titulo, miniatura, rotuloPlay, prioridade = false }: { id: string; titulo: string; miniatura: string; rotuloPlay: string; prioridade?: boolean }) {
  const [ativo, setAtivo] = useState(false);
  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-900 shadow-lg">
      {ativo ? (
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
          title={titulo}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setAtivo(true)} className="group absolute inset-0 w-full h-full" aria-label={`${rotuloPlay}: ${titulo}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={miniatura} alt="" width={1280} height={720} loading={prioridade ? 'eager' : 'lazy'} decoding="async" {...(prioridade ? { fetchPriority: 'high' as const } : {})} className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[72px] h-[50px] rounded-2xl bg-red-600 group-hover:bg-red-700 shadow-xl transition-colors">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </button>
      )}
    </div>
  );
}
