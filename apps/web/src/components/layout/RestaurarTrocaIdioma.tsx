'use client';

import { useEffect } from 'react';
import { restaurarAposTrocaDeIdioma } from '@/lib/rascunho-troca-idioma';

// Depois de trocar a lingua: devolve aos campos o que a pessoa ja tinha digitado.
export default function RestaurarTrocaIdioma() {
  useEffect(() => { restaurarAposTrocaDeIdioma(); }, []);
  return null;
}
