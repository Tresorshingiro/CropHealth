const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        page: token('page'),
        surface: token('surface'),
        raised: token('raised'),
        line: token('line'),
        ink: token('ink'),
        'ink-2': token('ink-2'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-ink': token('accent-ink'),
        danger: token('danger'),
      },
      fontFamily: {
        // The same pair as the Natural Resource portal, bundled with the app.
        display: ['"Archivo Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        float: '0 8px 30px rgb(0 0 0 / 0.18), 0 1px 3px rgb(0 0 0 / 0.12)',
      },
      keyframes: {
        'slide-in-right': { from: { transform: 'translateX(1.5rem)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'slide-in-left': { from: { transform: 'translateX(-1.5rem)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'slide-up': { from: { transform: 'translateY(1.5rem)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
      },
      animation: {
        'slide-in-right': 'slide-in-right 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slide-in-left 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 320ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
