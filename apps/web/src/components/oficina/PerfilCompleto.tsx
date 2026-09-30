'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// "Seu perfil esta X% completo": o que falta para o perfil publico convencer
// (o cliente compara logo, descricao, fotos, horario). Some aos 100%.
export default function PerfilCompleto() {
  const t = useTranslations('oficinaDashboard');
  const { user, oficina } = useAuth();
  const [fotos, setFotos] = useState<number | null>(null);

  useEffect(() => {
    if (!oficina?.id) return;
    supabase.from('oficina_fotos').select('id', { count: 'exact', head: true }).eq('oficina_id', oficina.id)
      .then(({ count }) => setFotos(count ?? 0));
  }, [oficina?.id]);

  if (!oficina || fotos === null) return null;
  const o = oficina as typeof oficina & { logo_url?: string | null; descricao?: string | null; horario_funcionamento?: unknown; cnpj?: string | null };
  const itens: [string, boolean][] = [
    ['item_logo', !!o.logo_url],
    ['item_descricao', (o.descricao || '').trim().length >= 80],
    ['item_telefone', !!user?.telefone],
    ['item_endereco', !!(o.endereco && o.cidade)],
    ['item_servicos', (o.especialidades || []).length > 0],
    ['item_horario', !!o.horario_funcionamento],
    ['item_fotos', fotos >= 3],
    ['item_registro', !!o.cnpj],
  ];
  const feitos = itens.filter(([, ok]) => ok).length;
  const pct = Math.round((feitos / itens.length) * 100);
  if (pct === 100) return null;

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="font-semibold text-gray-900">{t('perfilTitulo', { pct })}</h2>
        <Link href="/oficina/perfil" className="text-sm font-medium text-primary-600 hover:underline whitespace-nowrap py-2">{t('perfilBotao')}</Link>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pct >= 75 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-gray-600 mb-3">{t('perfilTexto')}</p>
      <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {itens.map(([k, ok]) => (
          <li key={k} className={`flex items-center gap-2 text-sm ${ok ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
            <span aria-hidden="true" className={ok ? 'text-green-600' : 'text-gray-300'}>{ok ? '✓' : '○'}</span>
            {t(k)}
          </li>
        ))}
      </ul>
    </div>
  );
}
