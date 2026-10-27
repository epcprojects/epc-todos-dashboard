import { useId } from 'react';
import { platKey } from '@/lib/text';

/** Brand marks drawn as small inline SVGs in each platform's own colours (24x24 box). */
export function PlatformIcon({ name, className = 'size-5' }: { name: string; className?: string }) {
  const gid = useId();
  const k = platKey(name);
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden="true">
      {children}
    </svg>
  );
  switch (k) {
    case 'linkedin':
      return svg(
        <>
          <rect width="24" height="24" rx="5" fill="#0A66C2" />
          <rect x="4.6" y="9.4" width="3" height="9.4" fill="#fff" />
          <circle cx="6.1" cy="6" r="1.8" fill="#fff" />
          <path d="M10.2 9.4h2.9v1.3c.5-.9 1.6-1.5 3-1.5 2.7 0 3.4 1.7 3.4 4v5.6h-3v-5c0-1.1-.2-2-1.4-2-1.3 0-1.9.9-1.9 2.1v4.9h-3z" fill="#fff" />
        </>,
      );
    case 'facebook':
      return svg(
        <>
          <circle cx="12" cy="12" r="12" fill="#1877F2" />
          <path d="M13.4 24v-8.6h2.9l.5-3.4h-3.4V9.9c0-1 .4-1.7 1.8-1.7h1.7V5.2c-.3 0-1.4-.2-2.6-.2-2.6 0-4.3 1.6-4.3 4.4V12H7v3.4h2.9V24z" fill="#fff" />
        </>,
      );
    case 'instagram':
      return svg(
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset=".3" stopColor="#FA7E1E" />
              <stop offset=".6" stopColor="#D62976" />
              <stop offset=".8" stopColor="#962FBF" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill={`url(#${gid})`} />
          <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="16.3" cy="7.7" r="1.1" fill="#fff" />
        </>,
      );
    case 'youtube':
      return svg(
        <>
          <rect y="3.5" width="24" height="17" rx="5" fill="#FF0000" />
          <path d="M9.7 8.6v6.8l6-3.4z" fill="#fff" />
        </>,
      );
    case 'tiktok': {
      const note = 'M15.6 4.5h-2.4v10.3a2.1 2.1 0 1 1-2.1-2.1c.2 0 .4 0 .6.1V10.3a4.5 4.5 0 1 0 3.9 4.5V9.6c.9.6 1.9 1 3 1V8.2c-1.5-.2-2.7-1.6-3-3.7z';
      return svg(
        <>
          <rect width="24" height="24" rx="6" fill="#010101" />
          <g transform="translate(1.6 .4) scale(.84)">
            <path d={note} fill="#25F4EE" transform="translate(-.9 -.7)" />
            <path d={note} fill="#FE2C55" transform="translate(.9 .7)" />
            <path d={note} fill="#fff" />
          </g>
        </>,
      );
    }
    case 'twitter':
      return svg(
        <>
          <rect width="24" height="24" rx="6" fill="#000" />
          <path d="M6 5.5h3.4l3.1 4.3 3.7-4.3h1.7l-4.6 5.3 5 7.7h-3.4l-3.4-4.9-4.2 4.9H6.6l5.1-5.9z" fill="#fff" />
        </>,
      );
    case 'pinterest':
      return svg(
        <>
          <circle cx="12" cy="12" r="12" fill="#E60023" />
          <path d="M12.3 5C8.7 5 7 7.4 7 9.5c0 1.2.5 2.2 1.4 2.6.2.1.3 0 .3-.2l.2-.8c0-.2 0-.3-.1-.5-.3-.3-.4-.7-.4-1.3 0-1.7 1.3-3.2 3.3-3.2 1.8 0 2.8 1.1 2.8 2.6 0 2-.9 3.6-2.2 3.6-.7 0-1.3-.6-1.1-1.3.2-.9.6-1.8.6-2.4 0-.6-.3-1-1-1-.8 0-1.4.8-1.4 1.9 0 .7.2 1.1.2 1.1l-.9 3.8c-.2.9 0 2.1 0 2.2 0 .1.1.1.2 0 .1-.1 1-1.4 1.3-2.4l.5-1.9c.3.5 1 .9 1.8.9 2.4 0 4-2.2 4-5C16.8 6.7 15 5 12.3 5z" fill="#fff" />
        </>,
      );
    case 'threads':
      return svg(
        <>
          <rect width="24" height="24" rx="6" fill="#000" />
          <path d="M16.6 11.4c-.2-2.4-1.5-3.7-3.7-3.7-1.9 0-3.1 1.1-3.5 2.3m7.3 1.4c-.8-.4-1.8-.6-2.9-.5-1.9.1-2.7 1-2.7 2 0 1.1 1 1.8 2.3 1.7 1.7-.1 2.8-1.1 2.9-3.4zm0 0c1 .8 1.3 2.4.5 3.8-.9 1.6-2.7 2.3-4.7 2.3-3.2 0-5.1-2.1-5.1-5.3s1.9-5.4 5.1-5.4" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </>,
      );
    default:
      return null;
  }
}

export const hasPlatformIcon = (name: string) => !!platKey(name) && ['linkedin', 'facebook', 'instagram', 'youtube', 'tiktok', 'twitter', 'pinterest', 'threads'].includes(platKey(name) as string);
