import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import { dirname, join } from 'node:path'

console.info('install-pb-hooks')

const GITHUB_REPO = 'satohshi/pocketbase-schema-generator'
const SCRIPT_DIR = import.meta.dirname
const CONFIG = join(SCRIPT_DIR, 'pb-hooks-config.json')
const EXTRACT_PATH = join(SCRIPT_DIR, '../docker/pocketbase/hooks')
const TEMP_ARCHIVE = join(SCRIPT_DIR, '../temp/hooks-archive.zip')
const TEMP_EXTRACT = join(SCRIPT_DIR, '../temp/hooks-extracted')

async function downloadLatestRelease() {
  try {
    // Check if config file exists
    if (!fs.existsSync(CONFIG)) {
      throw new Error(`Config file not found at: ${CONFIG}`)
    }

    // Fetch the latest release info from GitHub API
    console.log('Fetching latest release info...')
    const releaseJson = execSync(
      `curl -s -L https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { encoding: 'utf-8' },
    )

    const releaseData = JSON.parse(releaseJson)
    if (!releaseData.assets || releaseData.assets.length === 0) {
      throw new Error('No assets found in the latest release')
    }

    // Find the zip asset (or use the first asset if no zip is found)
    const zipAsset =
      releaseData.assets.find((asset: any) => asset.name.endsWith('.zip')) || releaseData.assets[0]

    console.log(`Downloading ${zipAsset.name} from release ${releaseData.tag_name}...`)

    // Create temp directory
    fs.mkdirSync(dirname(TEMP_ARCHIVE), { recursive: true })

    // Download the asset using curl
    execSync(`curl -L -o ${TEMP_ARCHIVE} ${zipAsset.browser_download_url}`, {
      stdio: 'inherit',
    })
    console.log('Download complete!')

    // Create temporary extraction directory
    fs.mkdirSync(TEMP_EXTRACT, { recursive: true })

    // Extract the zip file to temp directory
    console.log('Extracting archive...')
    execSync(`unzip -o ${TEMP_ARCHIVE} -d ${TEMP_EXTRACT}`, {
      stdio: 'inherit',
    })

    // Find the pb_hooks folder
    const pbHooksPath = join(TEMP_EXTRACT, 'pb_hooks')
    if (!fs.existsSync(pbHooksPath)) {
      throw new Error('pb_hooks folder not found in the archive')
    }

    // Create destination directory
    fs.mkdirSync(EXTRACT_PATH, { recursive: true })

    // Move contents of pb_hooks to destination
    console.log(`Moving pb_hooks contents to ${EXTRACT_PATH}...`)
    const files = fs.readdirSync(pbHooksPath)

    for (const file of files) {
      const srcPath = join(pbHooksPath, file)
      const destPath = join(EXTRACT_PATH, file)

      // Remove existing file/folder if it exists
      if (fs.existsSync(destPath)) {
        execSync(`rm -r ${destPath}`)
      }

      // Move the file/folder
      fs.renameSync(srcPath, destPath)
    }

    console.log('Move complete!')

    const configDestination = join(EXTRACT_PATH, 'config.json')
    console.log(`Moving config to ${configDestination}...`)
    fs.copyFileSync(CONFIG, configDestination)

    // Cleanup
    fs.unlinkSync(TEMP_ARCHIVE)
    execSync(`rm -r ${TEMP_EXTRACT}`)
    console.log('Cleaned up temporary files.')

    console.log('✓ Installation complete!')
  } catch (error) {
    console.error('Error:', error)

    // Cleanup on error
    if (fs.existsSync(TEMP_ARCHIVE)) {
      fs.unlinkSync(TEMP_ARCHIVE)
    }
    if (fs.existsSync(TEMP_EXTRACT)) {
      execSync(`rm -r ${TEMP_EXTRACT}`)
    }

    process.exit(1)
  }
}

downloadLatestRelease()
