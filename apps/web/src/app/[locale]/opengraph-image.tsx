import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'BipFix';

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const title = t('title');
  const tagline = title.startsWith('BipFix - ') ? title.slice('BipFix - '.length) : title;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #2563eb 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 84,
              height: 84,
              borderRadius: 22,
              background: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
            }}
          >
            🔧
          </div>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, color: 'white', letterSpacing: -2 }}>
            BipFix
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 34,
            color: '#dbeafe',
            maxWidth: 880,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          {tagline}
        </div>
      </div>
    ),
    { ...size }
  );
}
