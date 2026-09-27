import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {mkdtempSync, readdirSync, writeFileSync, rmSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temporary = mkdtempSync(path.join(os.tmpdir(), 'stackline-cfb-consumer-'))
try {
  execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', temporary], {stdio: 'pipe'})
  const archive = readdirSync(temporary).find(name => name.endsWith('.tgz'))
  writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({name:'cfb-consumer', version:'1.0.0', private:true}))
  const install = spawnSync('npm', ['install', path.join(temporary, archive), '--no-fund'], {cwd: temporary, encoding:'utf8'})
  assert.equal(install.status, 0, install.stdout + install.stderr)
  assert.doesNotMatch(install.stdout + install.stderr, /npm warn|deprecated/i)
  execFileSync(process.execPath, ['-e', `
    const assert=require('node:assert/strict');
    const CFB=require('@stackline/cfb');
    const archive=CFB.utils.cfb_new();
    CFB.utils.cfb_add(archive,'nested/example',Buffer.from('packed consumer'));
    for(const fileType of ['cfb','zip']) {
      const bytes=CFB.write(archive,{type:'buffer',fileType,compression:true});
      assert.equal(Buffer.from(CFB.find(CFB.read(bytes,{type:'buffer'}),'/nested/example').content).toString(),'packed consumer');
    }
  `], {cwd:temporary,stdio:'pipe'})
  writeFileSync(path.join(temporary,'consumer.cts'), `import CFB = require('@stackline/cfb');\nconst container = CFB.utils.cfb_new();\nCFB.utils.cfb_add(container, 'example', new Uint8Array([1, 2, 3]));\nconst bytes: Uint8Array = CFB.write(container, {type: 'buffer'});\nconst entry = CFB.find(CFB.parse(bytes), '/example');\nif (entry) { const size: number = entry.size; console.log(size); }\n`)
  writeFileSync(path.join(temporary,'tsconfig.json'), JSON.stringify({compilerOptions:{strict:true,noEmit:true,module:'node16',target:'es2020',types:[]},files:['consumer.cts']}))
  execFileSync(path.join(root,'node_modules','.bin','tsc'), ['--project',path.join(temporary,'tsconfig.json')], {cwd:temporary,stdio:'pipe'})
  const audit=JSON.parse(execFileSync('npm',['audit','--json'],{cwd:temporary,encoding:'utf8'}))
  assert.equal(audit.metadata.vulnerabilities.total,0)
  console.log('Packed CFB/ZIP consumers, published declarations, install warnings and audit: PASS')
} finally { rmSync(temporary,{recursive:true,force:true}) }
