import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// Guias da Central de Ajuda (Guia do Motorista / Guia da Oficina).
// Secoes em <details> nativo: abre e fecha sem JavaScript e TODO o texto vai
// no HTML. Antes era um acordeao em React que so montava o conteudo da secao
// aberta - o Google via so a 1a de 7 secoes e tratava as paginas como quase
// vazias/duplicadas (Search Console, 09/10/2026).
type Passo = { title: string; desc: string };
type Item = { label: string; desc: string };
type Selo = { name: string; desc: string };
type Secao = {
  titulo: string;
  intro?: string;
  passos?: Passo[];
  itens?: Item[];
  selos?: Selo[];
  texto?: string;
  nota?: string;
  aviso?: string;
};

const COR_SELO = ['text-green-700', 'text-blue-700', 'text-orange-700'];

export default function GuiaAjuda({ namespace }: { namespace: 'docsCliente' | 'docsOficina' }) {
  const t = useTranslations(namespace);
  const secoes = t.raw('secoes') as Secao[];

  return (
    <div>
      <div className="mb-10">
        <Link href="/docs" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('pageBackLink')}
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">{t('pageTitle')}</h1>
        <p className="text-gray-600 text-lg">{t('pageSubtitle')}</p>
      </div>

      <nav aria-label={t('pageTitle')} className="mb-8 rounded-xl border border-gray-200 bg-white p-4">
        <ol className="grid gap-1 sm:grid-cols-2 text-sm">
          {secoes.map((s, i) => (
            <li key={i}><a href={`#secao-${i + 1}`} className="text-primary-700 hover:underline">{s.titulo}</a></li>
          ))}
        </ol>
      </nav>

      <div className="space-y-4">
        {secoes.map((s, i) => (
          <details key={i} id={`secao-${i + 1}`} open={i === 0} className="group border border-gray-200 rounded-xl overflow-hidden bg-white scroll-mt-24">
            <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-gray-50 transition-colors">
              <h2 className="text-lg font-semibold text-gray-900">{s.titulo}</h2>
              <svg className="w-5 h-5 shrink-0 text-gray-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-6 pb-6 text-gray-600 leading-relaxed space-y-3 border-t border-gray-100 pt-4">
              {s.intro && <p>{s.intro}</p>}
              {s.passos && (
                <ol className="space-y-4 mt-2">
                  {s.passos.map((p, j) => (
                    <li key={j} className="flex gap-4">
                      <span className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5" aria-hidden="true">{j + 1}</span>
                      <div>
                        <p className="font-medium text-gray-900">{p.title}</p>
                        <p className="text-sm text-gray-600 mt-1">{p.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {s.itens && (
                <ul className="list-disc pl-5 space-y-2 mt-2">
                  {s.itens.map((it, j) => (
                    <li key={j}><span className="font-medium text-gray-900">{it.label}</span> — {it.desc}</li>
                  ))}
                </ul>
              )}
              {s.selos && (
                <ul className="list-disc pl-5 space-y-2 mt-2">
                  {s.selos.map((b, j) => (
                    <li key={j}><span className={`font-medium ${COR_SELO[j % 3]}`}>{b.name}</span> — {b.desc}</li>
                  ))}
                </ul>
              )}
              {s.texto && <p>{s.texto}</p>}
              {s.nota && <p className="text-sm bg-blue-50 p-3 rounded-lg">{s.nota}</p>}
              {s.aviso && <p className="text-sm bg-red-50 p-3 rounded-lg text-red-800">{s.aviso}</p>}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
