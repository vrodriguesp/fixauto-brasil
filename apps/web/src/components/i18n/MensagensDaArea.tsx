import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

// Paineis logados (cliente, oficina, loja): recebem TODOS os textos do idioma.
// O layout de idioma entrega as paginas publicas so os textos que os
// componentes de navegador delas usam (ver NAMESPACES_PUBLICOS em
// app/[locale]/layout.tsx) - antes cada pagina publica levava no HTML ~125 KB
// de textos, inclusive os de todos os paineis e a politica de privacidade inteira.
export default async function MensagensDaArea({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
