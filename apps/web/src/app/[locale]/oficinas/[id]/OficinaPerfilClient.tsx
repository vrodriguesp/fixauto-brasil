'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import StarRating from '@/components/ui/StarRating';
import { formatDate, INTL_LOCALE } from '@/lib/utils';
import { TIPOS_SERVICO } from '@fixauto/shared';
import StructuredData from '@/components/seo/StructuredData';
import { generateAutoRepairSchema, generateReviewSchema } from '@/lib/seo-utils';
import { countryNameForCode } from '@/lib/currency';
import type { PerfilOficina } from './perfil-dados';

const TIERS_VOLUME = [500, 100, 50, 10];

// Chaves de horario_funcionamento, de segunda (2024-01-01 foi segunda) a domingo
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;

function getServiceIcon(value: string): string {
  const found = TIPOS_SERVICO.find((s) => s.value === value);
  return found ? found.icon : '';
}

export default function OficinaPerfilClient({ dados }: { dados: PerfilOficina }) {
  const t = useTranslations('oficinaPerfilPublico');
  const tc = useTranslations('constants');
  const locale = useLocale();
  // Dados ja vem do servidor (perfil-dados.ts): a pagina sai completa no HTML.
  const { oficina, avaliacoes, fotos, tempoMedioResposta, ajusteMedio, hasRevisions, totalServicosConcluidos } = dados;

  // Calculate rating from actual reviews
  const calculatedMedia = avaliacoes.length > 0
    ? avaliacoes.reduce((sum, a) => sum + a.nota, 0) / avaliacoes.length
    : 0;
  const totalAvaliacoes = avaliacoes.length;

  const lat = oficina.latitude;
  const lng = oficina.longitude;
  const hasCoords = lat !== null && lng !== null;

  const parceiraDesde = oficina.created_at
    ? new Date(oficina.created_at).toLocaleDateString(INTL_LOCALE[locale] || 'en-GB', { month: '2-digit', year: 'numeric' })
    : null;
  const tierVolume = TIERS_VOLUME.find((t) => totalServicosConcluidos >= t);

  const autoRepairSchema = generateAutoRepairSchema(oficina, locale);
  const reviewSchema = generateReviewSchema(oficina, avaliacoes);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <StructuredData data={autoRepairSchema} />
      <StructuredData data={reviewSchema} />

      {/* Back link */}
      <Link href="/" className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('backLink')}
      </Link>

      {/* Workshop Header */}
      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 font-bold text-2xl">
              {oficina.nome_fantasia?.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{oficina.nome_fantasia}</h1>
              {calculatedMedia >= 4 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-400 text-yellow-900">
                  🏆 {t('qualityBadge')}
                </span>
              )}
              {tempoMedioResposta !== null && tempoMedioResposta < 2 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                  ⚡ {t('fastResponseBadge')}
                </span>
              )}
              {tierVolume && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                  🔧 {t('volumeBadge', { tier: tierVolume })}
                </span>
              )}
              {parceiraDesde && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                  {t('partnerSinceBadge', { data: parceiraDesde })}
                </span>
              )}
              {hasRevisions && ajusteMedio !== null ? (
                ajusteMedio < 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                    {t('priceAdjustmentDown', { pct: ajusteMedio.toFixed(1) })}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                    {t('priceAdjustmentUp', { pct: ajusteMedio.toFixed(1) })}
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                  {t('noPriceAdjustment')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <StarRating rating={calculatedMedia} size="md" />
              <span className="text-sm text-gray-600 font-medium">
                {calculatedMedia.toFixed(1)}
              </span>
              <span className="text-sm text-gray-500">
                {totalAvaliacoes === 1 ? t('reviewCountSingular', { count: totalAvaliacoes }) : t('reviewCountPlural', { count: totalAvaliacoes })}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {oficina.cidade} - {oficina.estado}
            </p>
            {tempoMedioResposta !== null && (
              <p className="text-xs text-gray-400 mt-1">
                {t('avgResponseTime', {
                  tempo: tempoMedioResposta < 1
                    ? t('avgResponseMinutes', { min: Math.round(tempoMedioResposta * 60) })
                    : t('avgResponseHours', { horas: tempoMedioResposta.toFixed(1) }),
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Sobre a oficina (texto do dono) */}
      {oficina.descricao && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-2">{t('sobreTitulo')}</h2>
          <p className="text-gray-700 whitespace-pre-line">{oficina.descricao}</p>
        </div>
      )}

      {/* Services */}
      {oficina.especialidades && oficina.especialidades.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">{t('servicesOfferedTitle')}</h2>
          <div className="flex flex-wrap gap-2">
            {oficina.especialidades.map((esp) => (
              <span key={esp} className="badge">
                <span className="mr-1">{getServiceIcon(esp)}</span>
                {tc(`tiposServico.${esp}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Seguradoras convencionadas */}
      {((oficina as any).seguradoras_convencionadas || []).length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">{t('seguradorasConvencionadas')}</h2>
          <div className="flex flex-wrap gap-2">
            {((oficina as any).seguradoras_convencionadas as string[]).map((s) => (
              <span key={s} className="badge bg-emerald-50 text-emerald-800">🛡️ {s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      {fotos.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">{t('photosTitle')}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {fotos.map((foto) => (
              <a key={foto.id} href={foto.foto_url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden block">
                <img src={foto.foto_url} alt={foto.tipo} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Address & Map */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">{t('addressTitle')}</h2>
        <div className="text-sm text-gray-600 space-y-1 mb-4">
          <p>{oficina.endereco}</p>
          <p>
            {oficina.cidade} - {oficina.estado}
            {oficina.cep && `, ${t('cepLabel')}: ${oficina.cep}`}
          </p>
          {oficina.cnpj && <p>{t('registroEmpresa')}: {oficina.cnpj}</p>}
        </div>
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <iframe
            title={t('mapIframeTitle')}
            width="100%"
            height="300"
            style={{ border: 0 }}
            loading="lazy"
            src={`https://www.google.com/maps?q=${encodeURIComponent(`${oficina.endereco}, ${oficina.cidade} - ${oficina.estado}${countryNameForCode(oficina.pais) ? `, ${countryNameForCode(oficina.pais)}` : ''}`)}&output=embed`}
          />
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${oficina.endereco}, ${oficina.cidade} - ${oficina.estado}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-primary-600 hover:underline py-2 bg-gray-50"
          >
            {t('openInMapsLink')}
          </a>
        </div>
      </div>

      {/* Contact & Hours */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">{t('contactHoursTitle')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('phoneLabel')}</p>
            {oficina.profile?.telefone ? (
              <a
                href={`tel:${oficina.profile.telefone}`}
                className="text-primary-600 font-medium hover:underline"
              >
                {oficina.profile.telefone}
              </a>
            ) : (
              <p className="text-sm text-gray-400">{t('phoneNotInformed')}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('hoursLabel')}</p>
            {/* Horario real cadastrado pela oficina (antes era um texto fixo
                "Seg a Sex 08-18", igual para todas). */}
            {oficina.horario_funcionamento ? (
              <div className="text-sm text-gray-700 space-y-0.5">
                {DIAS.map((dia, i) => {
                  const h = oficina.horario_funcionamento?.[dia];
                  const nome = new Intl.DateTimeFormat(INTL_LOCALE[locale] || 'en-GB', { weekday: 'short' }).format(new Date(2024, 0, 1 + i));
                  return (
                    <p key={dia}>
                      <span className="inline-block w-12 capitalize">{nome}</span>
                      {h?.aberto && h.inicio && h.fim ? `${h.inicio} – ${h.fim}` : <span className="text-gray-400">{t('hoursClosed')}</span>}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">{t('hoursNotInformed')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Reviews */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">
          {t('reviewsTitle', { count: totalAvaliacoes })}
        </h2>
        {totalAvaliacoes === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">
            {t('noReviewsText')}
          </p>
        ) : (
          <div className="space-y-4">
            {avaliacoes.map((av) => (
              <div key={av.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 text-xs font-bold">
                        {av.cliente?.nome?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <span className="font-medium text-sm text-gray-900">
                      {av.cliente?.nome || t('clientFallback')}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(av.created_at, locale)}</span>
                </div>
                <div className="ml-10">
                  <div className="flex items-center gap-2">
                    <StarRating rating={av.nota} size="sm" />
                    {av.nota_anterior != null && av.nota_anterior !== av.nota && (
                      av.nota > av.nota_anterior ? (
                        <span className="text-green-600 text-sm font-bold" title={`${av.nota_anterior}`}>
                          ↑
                        </span>
                      ) : (
                        <span className="text-red-600 text-sm font-bold" title={`${av.nota_anterior}`}>
                          ↓
                        </span>
                      )
                    )}
                  </div>
                  {av.comentario && (
                    <p className="text-sm text-gray-600 mt-1">{av.comentario}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
