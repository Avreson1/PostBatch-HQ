/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
    './*.{js,jsx}',
  ],
  theme: {
    // Tight, near-square corners everywhere. `rounded-full` stays for dots/avatars.
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '3px',
      md: '3px',
      lg: '4px',
      xl: '5px',
      '2xl': '6px',
      '3xl': '8px',
      full: '9999px',
    },
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      colors: {
        postbatch: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a5f',
        },
      },
      boxShadow: {
        card: '0 0 0 1px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.08), 0 6px 20px rgba(15, 23, 42, 0.06)',
        float: '0 8px 30px rgba(15, 23, 42, 0.18)',
      },
    },
  },
  plugins: [],
};
