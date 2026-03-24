/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        shadow: {
          900: '#0a0a0f',
          800: '#0d0d14',
          700: '#12121c',
          600: '#1a1a28',
          500: '#252538',
        },
        neon: {
          blue: '#00d4ff',
          purple: '#a855f7',
          green: '#00ff88',
          red: '#ff3366',
          yellow: '#ffd600',
          cyan: '#22d3ee',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', 'monospace'],
        display: ['Orbitron', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'neon-blue': '0 0 5px #00d4ff, 0 0 20px #00d4ff, 0 0 40px #00d4ff',
        'neon-purple': '0 0 5px #a855f7, 0 0 20px #a855f7, 0 0 40px #a855f7',
        'neon-green': '0 0 5px #00ff88, 0 0 20px #00ff88, 0 0 40px #00ff88',
        'neon-red': '0 0 5px #ff3366, 0 0 20px #ff3366, 0 0 40px #ff3366',
      },
      animation: {
        'pulse-neon': 'pulse-neon 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        'pulse-neon': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.8', filter: 'brightness(1.2)' },
        },
        'fadeIn': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slideUp': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
