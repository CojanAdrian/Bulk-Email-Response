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
    },
  },
  plugins: [],
};
