import type { CSSProperties } from 'react';

const paths = {
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
  micOff: 'm2 2 20 20M9 9v3a3 3 0 0 0 5.1 2.1M9 5a3 3 0 0 1 6 0v6M5 10v2a7 7 0 0 0 12 4.9M19 10v2M12 19v3M8 22h8',
  headphones: 'M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H5a2 2 0 0 1-2-2v-6ZM21 13h-4v8h2a2 2 0 0 0 2-2v-6Z',
  notes: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h6',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 14h2M14 14h2M8 18h2',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  arrowLeft: 'm12 5-7 7 7 7M5 12h14',
  external: 'M15 3h6v6M21 3l-9 9M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.1 6.1a8 8 0 0 1 13.2 3M4.7 14.9a8 8 0 0 0 13.2 3',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  signal: 'M4 20v-4M9 20v-8M14 20V8M19 20V4',
  copy: 'M9 9h12v12H9ZM15 9V3H3v12h6',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
};

export function CallIcon({ name, size = 18, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
