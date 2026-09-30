import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';

// Paineis logados (cliente, oficina, loja): recebem TODOS os textos do idioma.
// O layout de idioma entrega as paginas publicas so os textos que os
// componentes de navegador delas usam (ver NAMESPACES_PUBLICOS em
// app/[locale]/layout.tsx) - antes cada pagina publica levava no HTML ~125 KB
// de textos, inclusive os de todos os paineis e a politica de privacidade inteira.
//
// O idioma vem EXPLICITO do segmento [locale]: o Next renderiza layouts em
// paralelo, entao o setRequestLocale do layout pai nao vale aqui - sem isso
// os paineis caiam no idioma padrao (ingles) em /et, /it, /ru...
export default async function MensagensDaArea({ locale, children }: { locale: string; children: React.ReactNode }) {
  setRequestLocale(locale);
  const messages = await getMessages({ locale });
  return <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>;
}
