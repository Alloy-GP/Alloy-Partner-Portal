import js from '@eslint/js';
import globals from 'globals';

// One rule, on purpose: `no-undef`. An identifier that is used but never
// imported or defined compiles fine under Vite and throws at runtime — the
// class that blanked the Insight portal (App.jsx used
// onboardingOwnsPaymentNudge without importing it, 2026-10-08) and that took
// invites down in an edge function before that. `npm run check` runs this over
// src/; edge functions are covered by `deno check` (check:edge) instead.
void js; // recommended set deliberately NOT applied — this is a crash gate, not a style guide.

// The code carries `eslint-disable-line react-hooks/exhaustive-deps` comments
// from editors that run that plugin. It isn't installed here (its peer range
// lags ESLint), and an unknown rule name in a directive is itself an error —
// so resolve the name to a no-op rule instead of stripping the comments.
const reactHooksStub = { rules: { 'exhaustive-deps': { meta: { type: 'suggestion' }, create: () => ({}) } } };

export default [
  { ignores: ['dist/**', 'node_modules/**', 'supabase/**', 'tools/**', 'scripts/**', 'public/**', '.context/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooksStub },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021, ...globals.vitest, ...globals.node },
    },
    rules: { 'no-undef': 'error' },
  },
];
