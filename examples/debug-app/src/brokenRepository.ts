/**
 * The source behind `examples/debug-app/bundle/broken.js`.
 *
 * This file is never served and never read at runtime. It exists so the built
 * fixture beside it is reviewable — you can see what the minified bundle came
 * from, and what the stack panel is supposed to show once symbolication has
 * done its job.
 *
 * The bundle and its map are **committed on purpose**. They stand in for "a
 * production build somebody deployed", and building them on the fly would mean
 * the debug harness needed a bundler at run time to demonstrate a feature that
 * is about builds that already happened. Regenerate with:
 *
 *   npx esbuild examples/debug-app/src/brokenRepository.ts \
 *     --bundle --minify --sourcemap --format=esm \
 *     --outfile=examples/debug-app/bundle/broken.js
 *
 * They live in `bundle/` rather than `dist/` because `.gitignore` drops every
 * `dist` in the repo — a fixture there would vanish from a fresh clone while
 * still working perfectly on the machine that made it.
 */

interface UserData {
  email: string
}

interface Table {
  insert(data: UserData): unknown
}

export class UserRepository {
  /** Never assigned. This is the bug the panel is meant to explain. */
  private table: Table | null = null

  public create(data: UserData): unknown {
    // A real crash has a line above it and a line below it, and the lines are
    // most of what makes it readable. Minified, this whole file is one line and
    // column 48213 of it means nothing to anybody.
    const normalised = { email: data.email.trim().toLowerCase() }

    return this.table!.insert(normalised)
  }
}

export function storeUser(email: string): unknown {
  return new UserRepository().create({ email })
}
