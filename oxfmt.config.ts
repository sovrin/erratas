import { defineConfig } from 'oxfmt'

// Formatting rules for the whole repository. oxfmt also honours .gitignore, so only the tracked
// files it should skip are listed here: the lockfile, and what release-please writes.
export default defineConfig({
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  // Keep the hand-curated key order in every package.json.
  sortPackageJson: false,
  ignorePatterns: ['pnpm-lock.yaml', 'CHANGELOG.md', '.release-please-manifest.json'],
})
