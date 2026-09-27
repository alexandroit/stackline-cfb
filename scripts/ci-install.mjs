import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
const result = spawnSync('npm', ['ci', '--ignore-scripts', '--no-fund'], {encoding: 'utf8'})
process.stdout.write(result.stdout || '')
process.stderr.write(result.stderr || '')
assert.equal(result.status, 0, 'npm ci failed')
assert.doesNotMatch((result.stdout || '') + (result.stderr || ''), /npm warn deprecated/i, 'Deprecated dependencies must be fixed before release')
