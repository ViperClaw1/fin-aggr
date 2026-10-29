// The Open Graph card shared by the opengraph-image routes: dark, the title, one line under it and
// the demo-data label (AC-5 holds for shared links too). next/og ships its own font: no fetch.
import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

export function ogCard(title: string, subtitle: string): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: '#0a0a0a',
        color: '#ededed',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700 }}>FA</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 34, color: '#a3a3a3' }}>{subtitle}</div>
      </div>
      <div
        style={{
          display: 'flex',
          alignSelf: 'flex-start',
          padding: '8px 16px',
          borderRadius: 8,
          background: '#451a03',
          color: '#fde68a',
          fontSize: 26,
        }}
      >
        DEMO DATA · synthetic banks and rates
      </div>
    </div>,
    OG_SIZE,
  );
}
