import { getTranslations } from 'next-intl/server';
import { hrefNoIdioma } from '@/i18n/routing';

// Documento legal (politica de privacidade, termos de uso) escrito como uma
// lista de secoes nos arquivos de mensagens: usado pelas versoes europeias
// (en/et/it, base GDPR / direito da UE). As versoes em portugues (Brasil,
// LGPD / CDC) tem layout proprio em cada pagina.

interface Secao {
  titulo: string;
  subsecao?: boolean;
  paragrafos?: string[];
  itens?: string[];
  depois?: string[];
}

export default async function DocumentoLegalSecoes({ locale, namespace }: { locale: string; namespace: string }) {
  const t = await getTranslations({ locale, namespace });
  const secoes = t.raw('secoes') as Secao[];

  // O texto vem dos nossos proprios arquivos de mensagens (versionados no
  // repositorio) e so usa <strong> e <a> - nao e conteudo de usuario, por
  // isso pode ir como HTML. Links internos (href="/privacidade") sao
  // escritos sem idioma; aqui ganham o idioma atual e o nome traduzido da
  // pagina (ex.: /privacidade -> /et/privaatsus).
  const html = (s: string) => ({ __html: s.replace(/href="(\/(?!\/)[^"]*)"/g, (_, p) => `href="${hrefNoIdioma(locale, p)}"`) });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('pageTitle')}</h1>
      <p className="text-sm text-gray-500 mb-10">{t('lastUpdatedLabel')} {t('updatedDate')}</p>

      <div className="text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_a]:text-primary-600 [&_a:hover]:underline">
        {secoes.map((s) => (
          <section key={s.titulo}>
            {s.subsecao ? <h3>{s.titulo}</h3> : <h2>{s.titulo}</h2>}
            {s.paragrafos?.map((p, i) => <p key={i} dangerouslySetInnerHTML={html(p)} />)}
            {s.itens && (
              <ul>
                {s.itens.map((item, i) => <li key={i} dangerouslySetInnerHTML={html(item)} />)}
              </ul>
            )}
            {s.depois?.map((p, i) => <p key={i} dangerouslySetInnerHTML={html(p)} />)}
          </section>
        ))}
      </div>
    </div>
  );
}
