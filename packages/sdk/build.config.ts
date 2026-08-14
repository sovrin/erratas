import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: ['src/index'],
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
