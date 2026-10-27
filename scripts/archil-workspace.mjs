/**
 * Runs a command in a persistent Archil workspace, so files written there
 * survive between runs and machines.
 *
 *   ARCHIL_API_KEY=key-… node scripts/archil-workspace.mjs "ls -la"
 *   npm run workspace -- "echo hi > /mnt/archil/hello.txt"
 *
 * The disk is created on first use and reopened by name afterwards, so anything
 * a command leaves behind (`artifacts/…`, dumps, scratch checkouts) is still
 * there next time. Commands run in a short-lived microVM with the disk mounted
 * as the working directory, so relative paths land on the disk.
 *
 * ARCHIL_API_KEY is an account-level key (it starts with `key-`), not a disk
 * token. Create one at https://archil.com and export it; never commit it.
 */
import * as archil from 'disk'

const DISK_NAME = 'spark-workspace'
const DEFAULT_COMMAND = 'ls -la'

const apiKey = process.env.ARCHIL_API_KEY
if (!apiKey) {
  console.error(
    'ARCHIL_API_KEY is not set. Create an API key at https://archil.com, then:\n' +
      '  export ARCHIL_API_KEY=key-…\n' +
      'See .env.example.',
  )
  process.exit(1)
}

archil.configure({ apiKey })

/** Open the project's workspace disk, creating it the first time. */
async function openWorkspace() {
  const existing = await archil.listDisks({ name: DISK_NAME })
  const match = existing.find((d) => d.name === DISK_NAME)
  if (match) return archil.getDisk(match.id)

  const { disk } = await archil.createDisk({ name: DISK_NAME })
  console.log(`created Archil disk ${DISK_NAME} (${disk.id})`)
  return disk
}

const command = process.argv.slice(2).join(' ').trim() || DEFAULT_COMMAND
const disk = await openWorkspace()

const { stdout, stderr, exitCode, timing } = await disk.exec(command)

if (stdout) process.stdout.write(stdout.endsWith('\n') ? stdout : `${stdout}\n`)
if (stderr) process.stderr.write(stderr.endsWith('\n') ? stderr : `${stderr}\n`)
if (exitCode !== 0) console.error(`${command} exited ${exitCode} (${timing.executeMs}ms)`)
process.exit(exitCode)
