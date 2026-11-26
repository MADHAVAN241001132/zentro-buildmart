import type { Config } from 'tailwindcss';

// Brand palette from the project specification. Stitch surface tokens are kept as "stitch-*".
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        burgundy: { DEFAULT: '#6A0D2A', deep: '#45081C' },
        cream: '#FFF4E6',
        gold: '#C9A45C',
        card: '#FFFAF4',
        line: '#E6D5C3',
        ink: { DEFAULT: '#3B2529', muted: '#806C65' },
        success: '#287D50',
        warning: '#B7791F',
        danger: '#B42318',
        stitch: {
          surface: '#fff8f7',
          container: '#ffe9eb',
          outline: '#dcc0c3',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        control: '0.5rem',
        card: '0.75rem',
      },
      boxShadow: {
        rest: '0 4px 12px 0 rgba(59, 37, 41, 0.06)',
        hover: '0 8px 24px 0 rgba(59, 37, 41, 0.10)',
      },
      maxWidth: {
        content: '1440px',
      },
    },
  },
  plugins: [],
};

export default config;
