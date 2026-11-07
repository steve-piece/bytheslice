// tailwind.config.js
// Fixture: a Tailwind v3 config that binds raw colors, with DEFAULT, nesting, a quoted key and a spread.
module.exports = {
  content: ['./app/*.tsx', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#123456', 500: '#123456' },
        'accent-soft': '#abcdef', /* colors: { fake: '#000' } in a comment is not a color */
        ...require('./palette'),
      },
    },
  },
};
