'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface NoShowWarningProps {
  clienteId: string;
}

export default function NoShowWarning({ clienteId }: NoShowWarningProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!clienteId) return;
    supabase
      .from('no_show_historico')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', clienteId)
      .eq('reagendado', false)
      .then(({ count: c }) => {
        if (c !== null) setCount(c);
      });
  }, [clienteId]);

  if (count === 0) return null;

  return (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-sm font-medium text-yellow-800">
          Este cliente tem {count} falta{count > 1 ? 's' : ''} registrada{count > 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
