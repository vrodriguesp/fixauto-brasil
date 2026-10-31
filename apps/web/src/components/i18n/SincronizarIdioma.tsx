'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// A conta segue o idioma em que a pessoa usa o site (mesma regra do app):
// avisos e e-mails saem em profiles.idioma. Antes o site so gravava o idioma
// do cadastro - quem se cadastrou em /en e usa o site em russo recebia os
// avisos em ingles (teste do dono, 31/10).
export default function SincronizarIdioma() {
  const locale = useLocale();
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id || !locale || user.idioma === locale) return;
    supabase.from('profiles').update({ idioma: locale }).eq('id', user.id).then(({ error }) => {
      if (!error) (user as any).idioma = locale;
    });
  }, [user?.id, user?.idioma, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
