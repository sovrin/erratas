import { defineConfig } from 'oxfmt'

export default defineConfig({
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,

  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'always',
  bracketSpacing: true,

  // Keep <script> and <style> aligned with the SFC tags.
  vueIndentScriptAndStyle: false,

  // Change to true if you prefer one Vue prop per line.
  singleAttributePerLine: false,

  sortImports: {
    internalPattern: ['~/', '@/', '#'],
    newlinesBetween: true,

    // Avoid reordering imports that may execute code.
    sortSideEffects: false,
  },

  sortPackageJson: {
    sortScripts: true,
  },

  ignorePatterns: ['.nuxt/**', '.output/**', 'dist/**', 'coverage/**'],
})
