import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import { join } from 'node:path'

console.info('reset-pocketbase')

const COMPOSE_FILE = join(import.meta.dirname, '../docker/docker-compose.yml')
const DATA_DIR = join(import.meta.dirname, '../docker/pocketbase/data')
const PB_URL = process.env.PB_URL || 'http://localhost:8090'

function run(cmd: string) {
  execSync(cmd, { stdio: 'inherit' })
}

async function waitForHealth(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${PB_URL}/api/health`)
      if (res.ok) return
    } catch {
      // not up yet, keep retrying
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('PocketBase did not become healthy in time')
}

async function reset() {
  console.log('Stopping database...')
  run(`docker compose -f "${COMPOSE_FILE}" down`)

  console.log('Wiping PocketBase data (collections + files, keeping migrations/hooks)...')
  if (fs.existsSync(DATA_DIR)) {
    for (const entry of fs.readdirSync(DATA_DIR)) {
      if (entry === '.gitkeep') continue
      fs.rmSync(join(DATA_DIR, entry), { recursive: true, force: true })
    }
  }

  console.log('Starting database (migrations reapply automatically)...')
  run(`docker compose -f "${COMPOSE_FILE}" up -d database`)

  console.log('Waiting for PocketBase to become healthy...')
  await waitForHealth()

  const email = process.env.PB_ADMIN_EMAIL
  const password = process.env.PB_ADMIN_PASSWORD
  if (email && password) {
    console.log('Recreating superuser...')
    run(
      `docker compose -f "${COMPOSE_FILE}" exec database /pb/pocketbase --dir=/pb_data superuser upsert "${email}" "${password}"`,
    )
  } else {
    console.log(
      'PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD not set (docker/.env) — skipping superuser recreation. Run `npm run pb:superuser -- <email> <password>` manually.',
    )
  }

  console.log('Done. Fresh PocketBase, empty collections.')
  process.exit(0)
}

reset()
