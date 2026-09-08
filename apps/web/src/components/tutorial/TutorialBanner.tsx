'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TutorialBanner({ href, storageKey }: { href: string; storageKey: string }) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    try {
      setVisivel(localStorage.getItem(storageKey) !== '1');
    } catch {
      setVisivel(true);
    }
  }, [storageKey]);

  const dispensar = () => {
    setVisivel(false);
    try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
  };

  if (!visivel) return null;

  return (
    <div className="mb-6 flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">🎓</span>
        <p className="text-sm text-indigo-900">
          Novo por aqui? <Link href={href} className="font-semibold underline hover:no-underline">Aprenda a usar o BipFix</Link> em poucos minutos.
        </p>
      </div>
      <button onClick={dispensar} className="text-indigo-400 hover:text-indigo-600 text-sm flex-shrink-0" aria-label="Dispensar">
        ✕
      </button>
    </div>
  );
}
