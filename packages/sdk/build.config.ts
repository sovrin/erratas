import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  // Two entries, and the split is load-bearing: `src/node` imports `node:fs`,
  // which must never reach a browser bundle. `failOnWarn` below is what turns
  // an accidental import across that line into a failed build.
  entries: ['src/index', 'src/node/index'],
  declaration: true,
  clean: true,
  // The SDK ships with no runtime dependencies on purpose — bundle size is the
  // reason to choose this over Sentry — so there is nothing to externalise, and
  // an accidental import of something heavy should fail the build loudly.
  failOnWarn: true,
  rollup: {
    emitCJS: true,
    esbuild: { target: 'es2020' },
  },
})
