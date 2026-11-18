'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import StarRating from '@/components/ui/StarRating';
import { formatDate, INTL_LOCALE } from '@/lib/utils';
import { TIPOS_SERVICO } from '@fixauto/shared';
import StructuredData from '@/components/seo/StructuredData';
import { generateAutoRepairSchema, generateReviewSchema } from '@/lib/seo-utils';
import { countryNameForCode } from '@/lib/currency';
import {
  cidadeRegiao, complementoVisivel, descricaoParaLocale, formatarEndereco, formatarTelefone,
  ordenarEspecialidades, tipoOficinaTitulo,
} from '@/lib/oficina-publica';
import type { PerfilOficina } from './perfil-dados';

const TIERS_VOLUME = [500, 100, 50, 10];

// Chaves de horario_funcionamento, de segunda (2024-01-01 foi segunda) a domingo
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;

function getServiceIcon(value: string): string {
  const found = TIPOS_SERVICO.find((s) => s.value === value);
  return found ? found.icon : '';
}

// Pagina publica da oficina - reorganizada na auditoria Fable 18/11 (Documentos/
// Analises/Paginas_publicas_oficinas_2026-11-18): logo de verdade, regiao e
// endereco na lingua da pagina, descricao traduzida (guardada, migracao 099),
// horario em tabela com o nome do dia inteiro, CTA "pede orcamento" fixo no
// celular e selos de reputacao so com historico (lib/oficina-publica.ts).
export default function OficinaPerfilClient({ dados }: { dados: PerfilOficina }) {
  const t = useTranslations('oficinaPerfilPublico');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || 'en-GB';
  // 1 casa decimal com o separador do idioma ("2,5" em ru/et/it/pt, "2.5" em en)
  const decimal1 = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  const { oficina, avaliacoes, fotos, ajusteMedio, hasRevisions, totalServicosConcluidos, temHistorico, respondeRapido } = dados;

  const calculatedMedia = avaliacoes.length > 0 ? avaliacoes.reduce((sum, a) => sum + a.nota, 0) / avaliacoes.length : 0;
  const totalAvaliacoes = avaliacoes.length;
  // avaliacoes e selos de comportamento so com historico (dono 18/11)
  const mostrarAvaliacoes = temHistorico && totalAvaliacoes > 0;
  const tierVolume = temHistorico ? TIERS_VOLUME.find((v) => totalServicosConcluidos >= v) : undefined;

  const regiao = cidadeRegiao(oficina.cidade, oficina.estado, locale, oficina.pais);
  const endereco = formatarEndereco(oficina.endereco, oficina.pais);
  const complemento = complementoVisivel(oficina.endereco, oficina.complemento);
  const telefone = formatarTelefone(oficina.profile?.telefone, oficina.pais);
  const tipo = tipoOficinaTitulo(oficina.especialidades);
  const especialidades = ordenarEspecialidades(oficina.especialidades).filter((esp) => tc.has(`tiposServico.${esp}`));
  const seguradoras = (oficina.seguradoras_convencionadas || []) as string[];

  // descricao na lingua da pagina (traducao guardada) com "ver original"
  const descr = descricaoParaLocale(oficina.descricao, oficina.descricao_traducoes, locale);
  const [verOriginal, setVerOriginal] = useState(false);

  // barra fixa do CTA no celular: o botao redondo do chat sobe (regra body.com-barra-inferior do globals.css)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639.98px)');
    const aplicar = () => document.body.classList.toggle('com-barra-inferior', mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => { mq.removeEventListener('change', aplicar); document.body.classList.remove('com-barra-inferior'); };
  }, []);
  const textoDescricao = descr.traduzida && verOriginal ? (oficina.descricao || '').trim() : descr.texto;

  // mapa: pela posicao conferida no cadastro (pino certo); sem ela, pelo endereco
  const hasCoords = oficina.latitude !== null && oficina.longitude !== null;
  const pais = countryNameForCode(oficina.pais);
  const consultaEndereco = `${endereco}, ${oficina.cidade}${pais ? `, ${pais}` : ''}`;
  const mapaSrc = hasCoords
    ? `https://www.google.com/maps?hl=${locale}&q=${oficina.latitude},${oficina.longitude}&z=15&output=embed`
    : `https://www.google.com/maps?hl=${locale}&q=${encodeURIComponent(consultaEndereco)}&output=embed`;
  const mapaLink = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${oficina.latitude},${oficina.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consultaEndereco)}`;

  // dia de hoje (fuso do visitante) para destacar na tabela de horarios
  const hojeIdx = (new Date().getDay() + 6) % 7; // 0 = segunda
  const nomeDia = (i: number) => new Intl.DateTimeFormat(intl, { weekday: 'long' }).format(new Date(2024, 0, 1 + i));

  const autoRepairSchema = generateAutoRepairSchema({ ...oficina, estado: regiao.includes(',') ? regiao.split(', ').slice(1).join(', ') : oficina.estado, endereco, profile: telefone ? { telefone: telefone.href } : null, descricao: descr.texto, logo_url: oficina.logo_url }, locale);
  const reviewSchema = generateReviewSchema(oficina, avaliacoes);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 sm:pb-8" data-testid="oficina-perfil">
      <StructuredData data={autoRepairSchema} />
      <StructuredData data={reviewSchema} />

      {/* Voltar = de onde a pessoa veio (conversa, pedido...), nao o inicio do site (dono 09/11).
          Aberta numa aba nova pelo app, sem historico: fecha a aba e a pessoa volta ao app;
          so sem nada disso vai para o inicio. */}
      <Link href="/" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4 min-h-[44px]"
        onClick={(e) => {
          if (window.history.length > 1) { e.preventDefault(); window.history.back(); return; }
          e.preventDefault();
          const inicio = e.currentTarget.href;
          window.close();
          setTimeout(() => { if (!window.closed) window.location.assign(inicio); }, 150);
        }}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('backLink')}
      </Link>

      {/* Cabecalho: logo, nome, tipo, cidade, selos */}
      <div className="card mb-4 sm:mb-6" data-testid="oficina-cabecalho">
        <div className="flex items-start gap-4">
          {oficina.logo_url ? (
            // logos sao quase sempre retangulares: quadrado com object-contain (no circulo cortava, ex.: "2" do Nordic Autoglass)
            <img src={oficina.logo_url} alt={oficina.nome_fantasia} data-testid="oficina-logo"
              className="h-16 sm:h-20 w-auto max-w-[9rem] sm:max-w-[11rem] rounded-xl object-contain bg-white border border-gray-200 p-1.5 flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0" data-testid="oficina-inicial">
              <span className="text-primary-700 font-bold text-2xl">{oficina.nome_fantasia?.charAt(0)}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words leading-tight">{oficina.nome_fantasia}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {t(tipo === 'carroceria' ? 'tipoCarroceria' : tipo === 'geral' ? 'tipoGeral' : 'tipoRemont')} · {regiao}
            </p>
            {mostrarAvaliacoes && (
              <div className="flex items-center gap-x-2 gap-y-1 mt-2 flex-wrap" data-testid="oficina-nota">
                <StarRating rating={calculatedMedia} size="md" />
                <span className="text-sm text-gray-700 font-medium">{calculatedMedia.toFixed(1)}</span>
                <span className="text-sm text-gray-500">
                  {totalAvaliacoes === 1 ? t('reviewCountSingular', { count: totalAvaliacoes }) : t('reviewCountPlural', { count: totalAvaliacoes })}
                </span>
              </div>
            )}
            {(respondeRapido || temHistorico) && (
              <div className="flex items-center gap-2 flex-wrap mt-2" data-testid="oficina-selos">
                {respondeRapido && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-800 border border-green-100" data-testid="selo-responde-rapido">
                    ⚡ {t('respondeRapido')}
                  </span>
                )}
                {temHistorico && calculatedMedia >= 4 && totalAvaliacoes > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-900 border border-yellow-100">🏆 {t('qualityBadge')}</span>
                )}
                {tierVolume && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-100">🔧 {t('volumeBadge', { tier: tierVolume })}</span>
                )}
                {temHistorico && hasRevisions && ajusteMedio !== null && Math.abs(ajusteMedio) >= 0.05 && (
                  ajusteMedio < 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-800 border border-green-100">{t('priceAdjustmentDown', { pct: decimal1(ajusteMedio) })}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-800 border border-orange-100">{t('priceAdjustmentUp', { pct: decimal1(ajusteMedio) })}</span>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* CTA principal: pedir orcamento (o pedido vai a esta e as outras oficinas da zona) + ligar */}
        <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center" data-testid="oficina-cta">
          <Link href="/pedido" className="btn-primary text-center min-h-[48px] inline-flex items-center justify-center sm:px-8" data-testid="cta-pedir-orcamento">
            {t('ctaPedirOrcamento')}
          </Link>
          {telefone && (
            <a href={`tel:${telefone.href}`} className="btn-secondary text-center min-h-[48px] inline-flex items-center justify-center gap-2" data-testid="cta-ligar">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              {t('ligar')}
            </a>
          )}
          <p className="text-xs text-gray-500 sm:ml-2">{t('ctaPedirOrcamentoTexto')}</p>
        </div>
      </div>

      {/* Sobre a oficina (texto do dono, na lingua da pagina) */}
      {textoDescricao && (
        <div className="card mb-4 sm:mb-6" data-testid="oficina-sobre">
          <h2 className="font-semibold text-gray-900 mb-2">{t('sobreTitulo')}</h2>
          <p className="text-gray-700 whitespace-pre-line leading-relaxed" data-testid="oficina-descricao">{textoDescricao}</p>
          {descr.traduzida && (
            <p className="mt-2 text-xs text-gray-500" data-testid="oficina-descricao-aviso">
              {verOriginal ? '' : `${t('traduzidoAutomaticamente')} · `}
              <button type="button" onClick={() => setVerOriginal((v) => !v)} className="underline hover:text-gray-700 min-h-[32px]" data-testid="oficina-descricao-toggle">
                {verOriginal ? t('verTraducao') : t('verOriginal')}
              </button>
            </p>
          )}
        </div>
      )}

      {/* Services */}
      {especialidades.length > 0 && (
        <div className="card mb-4 sm:mb-6" data-testid="oficina-servicos">
          <h2 className="font-semibold text-gray-900 mb-3">{t('servicesOfferedTitle')}</h2>
          <div className="flex flex-wrap gap-2">
            {especialidades.map((esp) => (
              <span key={esp} className="badge bg-gray-100 text-gray-800 py-1.5 px-3 text-sm">
                <span className="mr-1.5">{getServiceIcon(esp)}</span>
                {tc(`tiposServico.${esp}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Seguradoras convencionadas */}
      {seguradoras.length > 0 && (
        <div className="card mb-4 sm:mb-6" data-testid="oficina-seguradoras">
          <h2 className="font-semibold text-gray-900 mb-3">{t('seguradorasConvencionadas')}</h2>
          <div className="flex flex-wrap gap-2">
            {seguradoras.map((s) => (
              <span key={s} className="badge bg-emerald-50 text-emerald-800 py-1.5 px-3 text-sm">🛡️ {s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      {fotos.length > 0 && (
        <div className="card mb-4 sm:mb-6" data-testid="oficina-fotos">
          <h2 className="font-semibold text-gray-900 mb-3">{t('photosTitle')}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {fotos.map((foto) => (
              <a key={foto.id} href={foto.foto_url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden block bg-gray-100">
                <img src={foto.foto_url} alt={foto.tipo} loading="lazy" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Address & Map */}
      <div className="card mb-4 sm:mb-6" data-testid="oficina-endereco">
        <h2 className="font-semibold text-gray-900 mb-3">{t('addressTitle')}</h2>
        <div className="text-sm text-gray-700 space-y-0.5 mb-4">
          <p className="font-medium text-gray-900">{endereco}</p>
          {complemento && <p>{complemento}</p>}
          <p>{regiao}{oficina.cep ? ` · ${t('cepLabel')} ${oficina.cep}` : ''}</p>
          {oficina.cnpj && <p className="text-gray-500">{t('registroEmpresa')}: {oficina.cnpj}</p>}
        </div>
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <iframe
            title={t('mapIframeTitle')}
            width="100%"
            height="260"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            src={mapaSrc}
          />
          <a href={mapaLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center text-sm text-primary-600 hover:underline min-h-[44px] bg-gray-50" data-testid="link-google-maps">
            {t('openInMapsLink')}
          </a>
        </div>
      </div>

      {/* Contact & Hours */}
      <div className="card mb-4 sm:mb-6" data-testid="oficina-contato">
        <h2 className="font-semibold text-gray-900 mb-3">{t('contactHoursTitle')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('phoneLabel')}</p>
            {telefone ? (
              <a href={`tel:${telefone.href}`} className="inline-flex items-center min-h-[44px] text-primary-600 font-medium text-lg hover:underline" data-testid="oficina-telefone">
                {telefone.visivel}
              </a>
            ) : (
              <p className="text-sm text-gray-400">{t('phoneNotInformed')}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">{t('hoursLabel')}</p>
            {/* Horario real cadastrado pela oficina, em tabela: nome do dia inteiro
                (cabia mal abreviado em pt/ru), hoje em destaque, fechado em cinza */}
            {oficina.horario_funcionamento ? (
              <table className="w-full text-sm border-collapse" data-testid="oficina-horario">
                <tbody>
                  {DIAS.map((dia, i) => {
                    const h = oficina.horario_funcionamento?.[dia];
                    const aberto = !!(h?.aberto && h.inicio && h.fim);
                    const hoje = i === hojeIdx;
                    return (
                      <tr key={dia} className={hoje ? 'bg-primary-50/60 font-semibold text-gray-900' : aberto ? 'text-gray-700' : 'text-gray-400'} data-testid={`horario-${dia}`} data-hoje={hoje ? '1' : undefined}>
                        <th scope="row" className="text-left font-inherit py-1 pr-3 first-letter:uppercase whitespace-nowrap align-top w-1/2">
                          {nomeDia(i)}{hoje && <span className="ml-1 text-[11px] font-normal text-primary-700">({t('hoje')})</span>}
                        </th>
                        <td className="py-1 tabular-nums whitespace-nowrap">
                          {aberto ? `${h!.inicio}–${h!.fim}` : t('hoursClosed')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400">{t('hoursNotInformed')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Reviews: so com historico (>= 3 avaliacoes ou 3 servicos); antes "Hinnangud (0)" (dono 18/11) */}
      {mostrarAvaliacoes ? (
        <div className="card" data-testid="oficina-avaliacoes">
          <h2 className="font-semibold text-gray-900 mb-4">{t('reviewsTitle', { count: totalAvaliacoes })}</h2>
          <div className="space-y-4">
            {avaliacoes.map((av) => (
              <div key={av.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 text-xs font-bold">{av.cliente?.nome?.charAt(0)?.toUpperCase() || '?'}</span>
                    </div>
                    <span className="font-medium text-sm text-gray-900">{av.cliente?.nome || t('clientFallback')}</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(av.created_at, locale)}</span>
                </div>
                <div className="ml-10">
                  <div className="flex items-center gap-2">
                    <StarRating rating={av.nota} size="sm" />
                    {av.nota_anterior != null && av.nota_anterior !== av.nota && (
                      av.nota > av.nota_anterior
                        ? <span className="text-green-600 text-sm font-bold" title={`${av.nota_anterior}`}>↑</span>
                        : <span className="text-red-600 text-sm font-bold" title={`${av.nota_anterior}`}>↓</span>
                    )}
                  </div>
                  {av.comentario && <p className="text-sm text-gray-600 mt-1">{av.comentario}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-2" data-testid="oficina-avaliacoes-em-breve">{t('avaliacoesEmBreve')}</p>
      )}

      {/* Barra fixa no celular: o CTA sempre a mao (o cabecalho sai de vista ao rolar) */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="cta-fixo">
        <div className="flex gap-3">
          <Link href="/pedido" className="btn-primary flex-1 text-center min-h-[48px] inline-flex items-center justify-center">
            {t('ctaPedirOrcamento')}
          </Link>
          {telefone && (
            <a href={`tel:${telefone.href}`} aria-label={t('ligar')} className="btn-secondary min-h-[48px] min-w-[48px] inline-flex items-center justify-center px-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
