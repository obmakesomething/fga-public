// Local packaging and consumer verification. No publication commands exist here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkPublicFiles, validPayloadPath } from './check-public-files.mjs';
import { checkPublicImports } from './check-public-imports.mjs';
import { checkPublicClaims } from './check-public-claims.mjs';

const root=resolve(import.meta.dirname,'..');
const work=mkdtempSync(join(tmpdir(),'fga-package-'));
const home=join(work,'home');mkdirSync(home);
const userConfig=join(home,'user.conf'), globalConfig=join(home,'global.conf');
writeFileSync(userConfig,'');writeFileSync(globalConfig,'');
const env={PATH:process.env.PATH || '',HOME:home,TMPDIR:work,
  npm_config_userconfig:userConfig,npm_config_globalconfig:globalConfig,
  npm_config_cache:join(home,'cache'),npm_config_update_notifier:'false',
  npm_config_audit:'false',npm_config_fund:'false',CI:'1'};
const commands=[];
function run(command,args,cwd=root,binary=false){
  const result=spawnSync(command,args,{cwd,env,encoding:binary?undefined:'utf8',timeout:60000,maxBuffer:16*1024*1024});
  commands.push({command:command===process.execPath?'node':command,args:args.map(x=>x.startsWith(work)?'<temporary>'+x.slice(work.length):x),exitCode:result.status});
  if(result.error || result.status!==0)throw new Error(`${command} exited ${result.status}: ${String(result.stderr).slice(0,1000)}`);
  return result.stdout;
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
  assert.equal(checkPublicFiles(root).ok,true,'source allowlist');
  assert.equal(checkPublicImports(root).ok,true,'source imports');
  assert.equal(checkPublicClaims(root).ok,true,'source claims');
  const allow=JSON.parse(readFileSync(join(root,'provenance/public-files.json'))).files;
  const expected=allow.filter(p=>p!=='package-lock.json').sort();
  const dry=JSON.parse(run('npm',['pack','--dry-run','--json','--ignore-scripts','--offline']));
  assert.deepEqual(dry[0].files.map(x=>x.path).sort(),expected,'npm dry-run byte list');
  const packed=JSON.parse(run('npm',['pack','--json','--ignore-scripts','--offline','--pack-destination',work]));
  const tarball=join(work,packed[0].filename);
  const archiveNames=run('tar',['-tzf',tarball]).trim().split('\n');
  assert.deepEqual([...archiveNames].sort(),expected.map(p=>'package/'+p).sort(),'actual tar list');
  for(const p of archiveNames)assert.ok(p.startsWith('package/')&&validPayloadPath(p.slice(8)),'unsafe archive path');
  const metadata=run('tar',['-tvzf',tarball]).trim().split('\n');
  assert.equal(metadata.length,archiveNames.length);
  assert.ok(metadata.every(line=>line.startsWith('-')),'only regular tar files');
  const payload=join(work,'payload');mkdirSync(payload);
  for(const p of expected){
    const bytes=run('tar',['-xOf',tarball,'package/'+p],root,true);
    assert.equal(hash(bytes),hash(readFileSync(join(root,p))),'tar byte mismatch '+p);
    mkdirSync(dirname(join(payload,p)),{recursive:true});writeFileSync(join(payload,p),bytes);
  }
  assert.equal(checkPublicFiles(payload,{artifact:'npm'}).ok,true,'tar content scan');
  assert.equal(checkPublicImports(payload).ok,true,'tar import closure');
  assert.equal(checkPublicClaims(payload).ok,true,'tar claim manifest');
  const consumer=join(work,'consumer');mkdirSync(consumer);
  writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'local-consumer',version:'0.0.0',type:'module',private:true}));
  run('npm',['install',tarball,'--ignore-scripts','--offline','--no-audit','--no-fund'],consumer);
  writeFileSync(join(consumer,'smoke.mjs'),`import assert from 'node:assert/strict';
import * as api from 'fga-research-extract';
import {PUBLIC_SCHEMA_IDS,getPublicSchema} from 'fga-research-extract/schemas';
import manifest from 'fga-research-extract/manifest' with {type:'json'};
assert.deepEqual(Object.keys(api).sort(),manifest.exports);
assert.equal(api.evaluateAssertionV2({}).verdict,'UNKNOWN');
assert.equal(api.buildVerificationIdentity({}).identityStatus,'NOT_EVALUATED');
assert.equal(api.deriveDeliveryDecision({}).decision,'NOT_EVALUATED');
assert.equal(api.isVerdictEvidenceEligible({type:'triggersState',status:'OBSERVED'}),false);
assert.equal(PUBLIC_SCHEMA_IDS.length,4);
for(const id of PUBLIC_SCHEMA_IDS) assert.ok(getPublicSchema(id).$schema);
assert.throws(()=>getPublicSchema('unsupported'),RangeError);
assert.equal(manifest.activationStatus,'NOT_ACTIVATED');
console.log(JSON.stringify({importByPackageName:true,schemas:4,errorPaths:true}));\n`);
  const smoke=JSON.parse(run(process.execPath,['smoke.mjs'],consumer));
  const installed=join(consumer,'node_modules','fga-research-extract');
  run(process.execPath,['--test','test/research.test.mjs'],installed);
  const observed=JSON.parse(run(process.execPath,['examples/run.mjs'],installed));
  assert.deepEqual(observed,JSON.parse(readFileSync(join(root,'examples/expected-output.json'))));
  console.log(JSON.stringify({checker:'public-package',ok:true,tarballFiles:expected.length,tarballSha256:hash(readFileSync(tarball)),smoke,commands,networkIsolation:'Caller-controlled; --offline is not a network sandbox',temporaryArtifactsRetained:true}));
}catch(error){
  console.log(JSON.stringify({checker:'public-package',ok:false,error:error.message,commands,temporaryArtifactsRetained:true}));
  process.exitCode=1;
}
