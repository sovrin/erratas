/**
 * Identity this SDK reports as, so ingest can tell a browser payload from a
 * future Python or Go one, and can special-case a version that turns out to
 * send something wrong.
 *
 * Inlined rather than imported from package.json: a JSON import survives our
 * own build but not every consumer's bundler, and this string ends up in the
 * hot path of a library whose whole selling point is that it is small.
 * `test/version.test.ts` asserts it still matches package.json, which is what
 * actually stops the two drifting.
 */
export const SDK_NAME = 'erratas-javascript'
export const SDK_VERSION = '0.2.0'
