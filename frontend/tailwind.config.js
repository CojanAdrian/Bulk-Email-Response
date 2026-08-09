/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'shell-bg': 'var(--color-shell-bg)',
        'shell-surface': 'var(--color-shell-surface)',
        'shell-text': 'var(--color-shell-text)',
        'shell-text-muted': 'var(--color-shell-text-muted)',
        'shell-border': 'var(--color-shell-border)',
        surface: 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        'accent-strong': 'var(--color-accent-strong)',
        'accent-ink': 'var(--color-accent-ink)',
        success: 'var(--color-success)',
        'success-bg': 'var(--color-success-bg)',
        error: 'var(--color-error)',
        'error-bg': 'var(--color-error-bg)',
        warning: 'var(--color-warning)',
        'warning-bg': 'var(--color-warning-bg)',
        tag: 'var(--color-tag)',
        'tag-bg': 'var(--color-tag-bg)',
      },
      borderRadius: {
        '4xl': '2rem',
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
        'aurora-drift-c': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(5%, -7%) scale(1.1)' },
        },
      },
      animation: {
        'aurora-drift-a': 'aurora-drift-a 22s ease-in-out infinite',
        'aurora-drift-b': 'aurora-drift-b 26s ease-in-out infinite',
        'aurora-drift-c': 'aurora-drift-c 19s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
