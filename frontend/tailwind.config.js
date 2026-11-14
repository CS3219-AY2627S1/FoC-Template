/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component tailwind.config.js from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#000000', 70: '#4A4A4A', 40: '#8A8A8A' },
        line: '#E4E4E4',
        surface: { DEFAULT: '#FFFFFF', alt: '#F7F7F7' },
        orange: '#EF7C00',
        blue: '#003D7C',
        alert: '#B3261E',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Georgia', 'serif'],
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.4' }],
        sm: ['0.875rem', { lineHeight: '1.45' }],
        base: ['1rem', { lineHeight: '1.55' }],
        lg: ['1.125rem', { lineHeight: '1.5' }],
        xl: ['1.375rem', { lineHeight: '1.35' }],
        '2xl': ['1.75rem', { lineHeight: '1.2' }],
        '3xl': ['2.25rem', { lineHeight: '1.12' }],
        '4xl': ['3rem', { lineHeight: '1.05' }],
      },
      borderRadius: {
        card: '12px',
        btn: '10px',
        pill: '999px',
      },
      maxWidth: {
        prose: '68ch',
        page: '1200px',
      },
      boxShadow: {
        nav: '0 1px 3px rgba(0,0,0,0.06)',
        modal: '0 24px 60px rgba(0,0,0,0.22)',
      },
      transitionDuration: { 150: '150ms', 250: '250ms' },
    },
  },
  plugins: [],
}
