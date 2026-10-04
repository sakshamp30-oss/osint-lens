import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#000000',
        panel: '#060401',
        amber: { DEFAULT: '#ff8c00', bright: '#ffb340', dim: '#8a4a00' },
        ok: '#39ff88',
        bad: '#ff3b3b',
        cyanx: '#00e5ff',
      },
      fontFamily: { mono: ['var(--font-mono)', 'ui-monospace', 'Menlo', 'monospace'] },
      boxShadow: {
        glow: '0 0 12px rgba(255,140,0,.45), 0 0 40px rgba(255,140,0,.15)',
      },
    },
  },
  plugins: [],
};
export default config;
