/** @type {import('tailwindcss').Config} */

// Every colour token is stored as RGB channels in src/styles/tokens.css, so
// opacity modifiers (bg-accent/20) work on them.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

const TOKEN_NAMES = [
  'shell-bg', 'shell-surface', 'shell-text', 'shell-text-muted', 'shell-border',
  'surface', 'surface-alt', 'text', 'text-muted', 'border',
  'accent', 'accent-strong', 'accent-ink', 'focus',
  'success', 'success-bg', 'error', 'error-bg', 'warning', 'warning-bg',
  'tag', 'tag-bg', 'info', 'info-bg',
  'gold', 'gold-soft', 'gold-ink', 'gold-surface', 'gold-text',
];

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(TOKEN_NAMES.map((name) => [name, token(name)])),
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'Inter', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      transitionTimingFunction: {
        // Apple-style ease-out: fast start, long soft settle.
        smooth: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        'aurora-drift-a': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(6%, 8%) scale(1.12)' },
        },
        'aurora-drift-b': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-8%, 5%) scale(1.08)' },
        },
        'banner-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        // The proven-lane shine: a slanted band of light crosses the row
        // left -> right, then rests for the remaining ~45% of the cycle.
        'gold-sweep': {
          '0%': { transform: 'translateX(-150%) skewX(-20deg)' },
          '55%, 100%': { transform: 'translateX(420%) skewX(-20deg)' },
        },
      },
      animation: {
        'aurora-drift-a': 'aurora-drift-a 24s ease-in-out infinite',
        'aurora-drift-b': 'aurora-drift-b 28s ease-in-out infinite',
        'banner-glow': 'banner-glow 1.6s ease-in-out infinite',
        'gold-sweep': 'gold-sweep 3.8s cubic-bezier(0.45, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
