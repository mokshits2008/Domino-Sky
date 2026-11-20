import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'monospace'],
      },
      colors: {
        canvas: 'var(--color-canvas)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          alt: 'var(--color-surface-alt)',
        },
        border: 'var(--color-border)',
        ink: {
          DEFAULT: 'var(--color-ink)',
          muted: 'var(--color-ink-muted)',
          faint: 'var(--color-ink-faint)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          tint: 'var(--color-primary-tint)',
        },
        closure: {
          DEFAULT: 'var(--color-closure)',
          tint: 'var(--color-closure-tint)',
        },
        recovery: 'var(--color-recovery)',
        spare: 'var(--color-spare)',
        severity: {
          none: {
            fill: '#CFE3D4',
            text: '#3F6B4E',
          },
          minor: {
            fill: '#F5E6B3',
            text: '#7A6420',
          },
          moderate: {
            fill: '#F6C9A6',
            text: '#8A4F1F',
          },
          severe: {
            fill: '#EBA5A0',
            text: '#8C2F2A',
          },
          cancelled: {
            fill: '#D9D5CE',
            text: '#5E5A52',
          },
        },
      },
      borderRadius: {
        card: '14px',
        input: '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(43,47,58,0.06)',
        'card-elevated': '0 8px 24px rgba(43,47,58,0.05)',
      },
      zIndex: {
        base: '0',
        sticky: '10',
        drawer: '20',
        popover: '30',
        modal: '40',
        toast: '50',
      },
      keyframes: {
        'clay-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.3' },
          '50%': { transform: 'scale(1.35)', opacity: '0.7' },
        },
      },
      animation: {
        'clay-pulse': 'clay-pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
