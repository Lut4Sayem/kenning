import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Mantine is only here for BlockNote (ADR 0009)
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/editor/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@mantine/*'], message: 'Mantine is only allowed in src/editor (ADR 0009).' }] }],
    },
  },
)
