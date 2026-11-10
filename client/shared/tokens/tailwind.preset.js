/**
 * Tailwind CSS Preset for BHOJORA Applications
 * Ensures zero visual drift between customer, partner, and admin web frontends.
 */

const colors = require('./colors.json');
const spacing = require('./spacing.json');

module.exports = {
  theme: {
    screens: spacing.breakpoints,
    extend: {
      colors: {
        terracotta: {
          DEFAULT: colors.brand.terracotta.default,
          dark: colors.brand.terracotta.dark,
          light: colors.brand.terracotta.light,
        },
        cream: {
          DEFAULT: colors.brand.cream.default,
          card: colors.brand.cream.card,
          alt: colors.brand.cream.alt,
        },
        trust: {
          DEFAULT: colors.brand.trustGreen.default,
          light: colors.brand.trustGreen.light,
          text: colors.brand.trustGreen.text,
        },
        saffron: {
          DEFAULT: colors.brand.saffron.default,
          dark: colors.brand.saffron.dark,
          light: colors.brand.saffron.light,
        },
        neutral: colors.neutrals,
      },
      fontFamily: {
        heading: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        button: ['Manrope', 'sans-serif'],
      },
      spacing: spacing.spacing,
      borderRadius: spacing.borderRadius,
      boxShadow: spacing.boxShadow,
      minHeight: {
        'touch-mobile': spacing.touchTarget.minMobile,
        'touch-button': spacing.touchTarget.standardButton,
      },
      minWidth: {
        'touch-mobile': spacing.touchTarget.minMobile,
        'touch-button': spacing.touchTarget.standardButton,
      },
    },
  },
};
