/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        kt: {
          red: '#E4002B',
          dark: '#1A1A1A',
          gray: '#F5F5F5',
        },
      },
    },
  },
  plugins: [],
}
