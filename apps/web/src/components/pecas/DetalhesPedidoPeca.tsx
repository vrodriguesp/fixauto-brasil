'use client';

// Descricao e fotos do pedido de peca, para quem vai responder (loja ou
// oficina fornecedora). As fotos abrem em tamanho grande ao tocar.
export default function DetalhesPedidoPeca({ observacao, fotos }: { observacao?: string | null; fotos?: string[] | null }) {
  if (!observacao && !(fotos && fotos.length)) return null;
  return (
    <div className="mt-2 space-y-2">
      {observacao && <p className="text-sm text-gray-700 whitespace-pre-line break-words">{observacao}</p>}
      {fotos && fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fotos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" loading="lazy" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
