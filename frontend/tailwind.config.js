/** @type {import('tailwindcss').Config} */

// Every colour token is stored as RGB channels in src/styles/tokens.css, so
// opacity modifiers (bg-accent/20) work on them.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

const TOKEN_NAMES = [
  'shell-bg', 'shell-surface', 'shell-text', 'shell-text-muted', 'shell-border',
  'surface', 'surface-alt', 'text', 'text-muted', 'border',
  'field', 'field-border', 'control', 'control-border', 'control-hover',
  'accent', 'accent-strong', 'accent-ink', 'focus', 'hot',
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
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      transitionTimingFunction: {
        smooth: 'var(--soft)',
        soft: 'var(--soft)',
        spring: 'var(--spring)',
      },
      keyframes: {
        'banner-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'banner-glow': 'banner-glow 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
