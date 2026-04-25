/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Share Tech Mono"', 'monospace'],
        segment: ['"Share Tech Mono"', 'monospace'],
      },
      colors: {
        'led-green': '#39ff14',
        'led-red': '#ff1744',
        'led-amber': '#ffab00',
        'led-cyan': '#00e5ff',
        'panel-dark': '#1a1a1a',
        'panel-mid': '#2a2a2a',
        'panel-light': '#3a3a3a',
        'chrome': '#555',
      },
      boxShadow: {
        'led': '0 0 6px currentColor, 0 0 12px currentColor',
        'inset-display': 'inset 0 2px 8px rgba(0,0,0,0.8)',
      },
    },
  },
  plugins: [],
}
