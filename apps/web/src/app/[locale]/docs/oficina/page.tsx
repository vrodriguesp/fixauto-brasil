'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Accordion({ title, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-lg font-semibold text-gray-900">{title}</span>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-6 text-gray-600 leading-relaxed space-y-3 border-t border-gray-100 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

function StepItem({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">
        {number}
      </div>
      <div>
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-600 mt-1">{desc}</p>
      </div>
    </div>
  );
}

type Step = { title: string; desc: string };
type Item = { label: string; desc: string };

export default function DocsOficinaPage() {
  const t = useTranslations('docsOficina');

  const s1Steps = t.raw('s1Steps') as Step[];
  const s2Items = t.raw('s2Items') as Item[];
  const s3Steps = t.raw('s3Steps') as Step[];
  const s4Items = t.raw('s4Items') as Item[];
  const s5Steps = t.raw('s5Steps') as Step[];
  const s6Items = t.raw('s6Items') as Item[];
  const s7Items = t.raw('s7Items') as Item[];
  const s8Items = t.raw('s8Items') as Item[];
  const s8ReduceList = t.raw('s8ReduceList') as string[];

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <Link href="/docs" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('pageBackLink')}
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">{t('pageTitle')}</h1>
        <p className="text-gray-600 text-lg">
          {t('pageSubtitle')}
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <Accordion title={t('s1Title')} defaultOpen>
          <p>{t('s1Intro')}</p>
          <div className="space-y-4 mt-4">
            {s1Steps.map((s, i) => (
              <StepItem key={i} number={i + 1} title={s.title} desc={s.desc} />
            ))}
          </div>
        </Accordion>

        <Accordion title={t('s2Title')}>
          <p>
            {t('s2Intro')}
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            {s2Items.map((it, i) => (
              <li key={i}><span className="font-medium">{it.label}</span> — {it.desc}</li>
            ))}
          </ul>
          <p className="mt-3">
            {t('s2Body')}
          </p>
          <p className="mt-2 text-sm bg-blue-50 p-3 rounded-lg">
            {t('s2Tip')}
          </p>
        </Accordion>

        <Accordion title={t('s3Title')}>
          <p>
            {t('s3Intro')}
          </p>
          <div className="space-y-4 mt-4">
            {s3Steps.map((s, i) => (
              <StepItem key={i} number={i + 1} title={s.title} desc={s.desc} />
            ))}
          </div>
          <p className="mt-3 text-sm bg-green-50 p-3 rounded-lg text-green-800">
            {t('s3Tip')}
          </p>
        </Accordion>

        <Accordion title={t('s4Title')}>
          <p>
            {t('s4Intro')}
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            {s4Items.map((it, i) => (
              <li key={i}><span className="font-medium">{it.label}</span> — {it.desc}</li>
            ))}
          </ul>
          <p className="mt-3">
            {t('s4Outro')}
          </p>
        </Accordion>

        <Accordion title={t('s5Title')}>
          <p>
            {t('s5Intro')}
          </p>
          <div className="space-y-4 mt-4">
            {s5Steps.map((s, i) => (
              <StepItem key={i} number={i + 1} title={s.title} desc={s.desc} />
            ))}
          </div>
        </Accordion>

        <Accordion title={t('s6Title')}>
          <p>
            {t('s6Intro')}
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            {s6Items.map((it, i) => (
              <li key={i}><span className="font-medium">{it.label}</span> — {it.desc}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm bg-blue-50 p-3 rounded-lg">
            {t('s6Note')}
          </p>
        </Accordion>

        <Accordion title={t('s7Title')}>
          <p>
            {t('s7Intro')}
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            {s7Items.map((it, i) => (
              <li key={i}><span className="font-medium">{it.label}</span> — {it.desc}</li>
            ))}
          </ul>
          <p className="mt-3">
            {t('s7Outro')}
          </p>
        </Accordion>

        <Accordion title={t('s8Title')}>
          <p>
            {t('s8Intro')}
          </p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            {s8Items.map((it, i) => (
              <li key={i}><span className="font-medium">{it.label}</span> — {it.desc}</li>
            ))}
          </ul>
          <p className="mt-4 font-medium text-gray-900">{t('s8ReduceTitle')}</p>
          <ul className="list-disc list-inside space-y-2 mt-2">
            {s8ReduceList.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm bg-green-50 p-3 rounded-lg text-green-800">
            {t('s8Note')}
          </p>
        </Accordion>
      </div>
    </div>
  );
}
