import * as fs from 'fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

console.info('clear-pb-hooks')

const HOOKS_PATH = join(import.meta.dirname, '../docker/pocketbase/hooks')

async function clearHooks() {
  if (fs.existsSync(HOOKS_PATH)) {
    execSync(`rm -r ${HOOKS_PATH}`)
  }

  process.exit(0)
}

clearHooks()
