import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CanonicalGrid, DomainError, parsePaletteSnapshot, parseProject, parseProjectJson,
  serializeProject, gridFromProject, migrateLegacyPindo, parseCellPatchCommand,
} from '../dist/index.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const rejected = (fn, code) => assert.throws(fn, error => error instanceof DomainError && (!code || error.code === code));
const project = () => fixture('expected-project-v1');
const cmd = edits => ({ commandId:'command:test',projectId:'import:test',baseRevision:0,edits });

test('grid rejects coercion hazards and allocation overruns before allocating typed storage', () => {
  for (const value of [-1,65536,65537,1.5,NaN,Infinity,'1',null,undefined]) {
    rejected(() => new CanonicalGrid(1,1,[value],3),'E_GRID_INVALID');
  }
  for (const [w,h] of [[0,1],[-1,1],[1.2,1],[4097,1],[4096,4096],[NaN,2]]) {
    rejected(() => new CanonicalGrid(w,h,[],3),'E_GRID_INVALID');
  }
  rejected(() => new CanonicalGrid(1,1,Array(1),3),'E_GRID_INVALID');
  rejected(() => new CanonicalGrid(1,1,new Uint16Array([1]),3),'E_GRID_INVALID');
  rejected(() => new CanonicalGrid(1,1,[1],0),'E_PALETTE_INVALID');
});

test('grid buffer ownership, row-major coordinates and EMPTY counts are independent invariants', () => {
  const source=[1,0,3,2,1,3];const grid=new CanonicalGrid(3,2,source,3);source[0]=0;
  grid.toUint16Array()[0]=0;grid.toArray()[2]=0;
  assert.equal(grid.at(0,0),1);assert.equal(grid.at(2,1),3);
  assert.deepEqual([...grid.count().byIndex],[[1,2],[3,2],[2,1]]);
  assert.equal(grid.count().occupied,5);assert.equal(grid.count().byIndex.has(0),false);
  rejected(()=>grid.at(-1,0));rejected(()=>grid.at(1.1,0));rejected(()=>grid.at(0,2));
});

test('seeded grid counts and JSON round trips agree with a separate flat-array oracle', () => {
  let seed=7411;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let sample=0;sample<300;sample++){
    const width=random()%15+1,height=random()%15+1;
    const cells=Array.from({length:width*height},()=>random()%4);
    const p=project();Object.assign(p,{width,height,cells,progress:cells.map(()=>0),locks:cells.map(()=>0)});
    const grid=gridFromProject(p),counts=grid.count();
    assert.equal(counts.occupied,cells.reduce((n,c)=>n+Number(c>0),0));
    for(let color=1;color<=3;color++)assert.equal(counts.byIndex.get(color)??0,cells.filter(c=>c===color).length);
    assert.deepEqual(parseProjectJson(serializeProject(p)),p);
  }
});

test('palette snapshot retains same-HEX material identities and cannot drift with its input', () => {
  const input=fixture('palette'),parsed=parsePaletteSnapshot(input);
  assert.equal(parsed.colors[0].displayHex,parsed.colors[2].displayHex);
  assert.notEqual(parsed.colors[0].id,parsed.colors[2].id);
  input.colors[0].id='changed';input.colors.reverse();
  assert.equal(parsed.colors[0].id,'demo:white');assert.equal(parsed.colors[2].finish,'clear');
  assert.throws(()=>{parsed.colors[0].material.fuseFamily='changed';},TypeError);
});

for (const [name,mutate] of [
  ['duplicate ID',p=>{p.colors[1].id=p.colors[0].id;}],
  ['index gap',p=>{p.colors[1].index=4;}],
  ['index reorder',p=>{p.colors.reverse();}],
  ['invalid hex',p=>{p.colors[0].displayHex='#GGGGGG';}],
  ['missing provenance',p=>{delete p.provenance;}],
  ['impossible date',p=>{p.provenance.capturedOn='2026-02-30';}],
  ['unknown field',p=>{p.isOfficial=true;}],
]) test(`palette rejects ${name}`,()=>{const p=fixture('palette');mutate(p);rejected(()=>parsePaletteSnapshot(p));});

for(const [name,mutate] of [
  ['future schema',p=>{p.schemaVersion=2;}],
  ['unknown index',p=>{p.cells[0]=4;}],
  ['overflow index',p=>{p.cells[0]=65537;}],
  ['progress on empty',p=>{p.progress[1]=1;}],
  ['short progress',p=>{p.progress.pop();}],
  ['long locks',p=>{p.locks.push(0);}],
  ['disabled used material',p=>{p.palette.colors[0].enabled=false;}],
  ['crop outside image',p=>{p.recipe.crop={x:0.8,y:0,width:0.5,height:1};}],
  ['time reversal',p=>{p.updatedAt='2020-01-01T00:00:00Z';}],
  ['impossible timestamp',p=>{p.createdAt='2026-02-30T00:00:00Z';}],
  ['timestamp without timezone',p=>{p.createdAt='2026-09-01T00:00:00';}],
  ['missing source descriptor',p=>{p.recipe.sourceAssetId='missing';}],
  ['single with pieces',p=>{p.pieces=[{id:'p',name:'p',indices:[0]}];}],
  ['multi without pieces',p=>{p.mode='multi';}],
  ['unknown property',p=>{p.extra='not part of contract';}],
]) test(`project rejects ${name} without mutation`,()=>{
  const p=project();mutate(p);const before=structuredClone(p);rejected(()=>parseProject(p));assert.deepEqual(p,before);
});

test('empty drafts and locked holes remain representable without claiming manufacturability',()=>{
  const p=project();p.cells.fill(0);p.locks[1]=1;
  const parsed=parseProject(p);assert.equal(gridFromProject(parsed).count().occupied,0);assert.equal(parsed.locks[1],1);
});

test('project snapshots are detached and frozen, with stable serialization',()=>{
  const p=project(),parsed=parseProject(p);p.cells[0]=0;p.palette.colors[0].name='changed';
  assert.equal(parsed.cells[0],1);assert.equal(parsed.palette.colors[0].name,'Demo white');
  assert.throws(()=>{parsed.progress[0]=1;},TypeError);
  assert.deepEqual(parseProjectJson(serializeProject(parsed)),parsed);
  rejected(()=>parseProjectJson('{broken'),'E_SCHEMA');
});

test('multi-piece membership covers occupied cells exactly once, independently of topology',()=>{
  const p=project();p.mode='multi';p.pieces=[{id:'first',name:'first',indices:[0,2]},{id:'second',name:'second',indices:[3,4,5]}];
  assert.equal(parseProject(p).pieces.length,2);
  for(const bad of [
    [{id:'a',name:'a',indices:[0,2,3,4]}],
    [{id:'a',name:'a',indices:[0,2,3,4,5,1]}],
    [{id:'a',name:'a',indices:[0,2,3,4,5,20]}],
    [{id:'a',name:'a',indices:[0,2]},{id:'b',name:'b',indices:[0,3,4,5]}],
    [{id:'a',name:'a',indices:[0,2]},{id:'a',name:'b',indices:[3,4,5]}],
  ]){p.pieces=bad;rejected(()=>parseProject(p));}
});

test('asset references, roles, payload metadata and MIME stay consistent',()=>{
  const p=project();p.assets=[{id:'source',kind:'source',availability:'omitted',mime:'image/png'}];p.recipe.sourceAssetId='source';
  assert.equal(parseProject(p).assets[0].availability,'omitted');
  p.assets[0].path='assets/source.png';rejected(()=>parseProject(p));
  p.assets[0]={id:'source',kind:'source',availability:'embedded',path:'assets/source.png',mime:'image/png',bytes:1,sha256:'0'.repeat(64)};
  parseProject(p);p.assets[0].mime='image/jpeg';rejected(()=>parseProject(p));p.assets[0].mime='image/png';
  p.recipe.sourceMaskAssetId='source';rejected(()=>parseProject(p));delete p.recipe.sourceMaskAssetId;
  p.assets.push({...p.assets[0]});rejected(()=>parseProject(p));
});

test('migration matches a fixed golden document, retains EMPTY and keeps caller-owned objects intact',()=>{
  const legacy=freeze(fixture('legacy-v1')),options=freeze(fixture('import-options'));
  const result=migrateLegacyPindo(legacy,options);
  assert.deepEqual(result.document,fixture('expected-project-v1'));
  assert.deepEqual(migrateLegacyPindo(legacy,options),result);
  assert.deepEqual(result.document.cells,[1,0,3,2,1,3]);
  assert.equal(gridFromProject(result.document).count().occupied,5);
  assert.equal(result.document.revision,0);assert.ok(result.document.progress.every(v=>v===0));
  assert.equal(result.document.assets,undefined);assert.equal(result.document.recipe.sourceAssetId,undefined);
  assert.match(result.document.notes,/legacy-source-reference/);
  assert.equal(result.warnings.length,4);
});

test('migration never infers EMPTY from white color or transparent background and never guesses unknown IDs',()=>{
  const legacy=fixture('legacy-v1'),options=fixture('import-options');
  legacy.cells[0][1]={colorId:'old-white',isEmpty:false};assert.equal(migrateLegacyPindo(legacy,options).document.cells[1],1);
  legacy.cells[0][1]={colorId:'unknown'};rejected(()=>migrateLegacyPindo(legacy,options),'E_UNKNOWN_COLOR');
  legacy.cells[0][1].isEmpty=true;assert.equal(migrateLegacyPindo(legacy,options).document.cells[1],0);
});

test('migration rejects many-to-one identity collapse and malformed matrices or options',()=>{
  const legacy=fixture('legacy-v1'),options=fixture('import-options');
  options.colorIdMap['old-clear']='demo:white';rejected(()=>migrateLegacyPindo(legacy,options),'E_PALETTE_INVALID');
  for(const mutate of [p=>{p.version=2;},p=>{p.cells[0].pop();},p=>{p.cells.pop();},p=>{p.metadata.width=0;},p=>{p.cells[0][0].isEmpty=1;},p=>{p.unknown='keep me';}]){
    const input=fixture('legacy-v1');mutate(input);const before=structuredClone(input);
    rejected(()=>migrateLegacyPindo(input,fixture('import-options')));assert.deepEqual(input,before);
  }
  rejected(()=>migrateLegacyPindo(fixture('legacy-v1'),null));
  const invalid=fixture('import-options');delete invalid.recipe;rejected(()=>migrateLegacyPindo(fixture('legacy-v1'),invalid));
});

test('revision commands are immutable validated intents and never partially modify the project',()=>{
  const p=freeze(project());const input=cmd([{index:1,before:0,after:1},{index:3,before:2,after:0}]);
  const parsed=parseCellPatchCommand(input,p);assert.deepEqual(parsed,input);input.edits[0].after=3;assert.equal(parsed.edits[0].after,1);
  assert.deepEqual(p,project());
  for(const bad of [
    {...cmd([{index:0,before:1,after:2}]),baseRevision:1},
    {...cmd([{index:0,before:1,after:2}]),projectId:'other'},
    cmd([{index:0,before:2,after:1}]),cmd([{index:0,before:1,after:4}]),
    cmd([{index:0,before:1,after:2},{index:0,before:1,after:3}]),
    cmd([{index:6,before:0,after:1}]),cmd([{index:0,before:1,after:65537}]),cmd([]),
  ])rejected(()=>parseCellPatchCommand(bad,p));
  const locked=project();locked.locks[1]=1;rejected(()=>parseCellPatchCommand(cmd([{index:1,before:0,after:1}]),locked),'E_LOCKED');
});

test('conditional embedded payload requirements remain enforced',()=>{
  for(const missing of ['path','bytes','sha256']){
    const p=project();p.assets=[{id:'source',kind:'source',availability:'embedded',path:'assets/source.png',mime:'image/png',bytes:1,sha256:'0'.repeat(64)}];
    delete p.assets[0][missing];rejected(()=>parseProject(p),'E_SCHEMA');
  }
});

test('generation identities and asset references cannot silently dangle',()=>{
  const p=project();p.assets=[{id:'image',kind:'ai-generated',availability:'omitted',mime:'image/png'}];
  const record={id:'generation:1',createdAt:p.createdAt,providerConfigId:'provider:1',modelId:'synthetic-model',skillVersion:'1',prompt:'synthetic fixture',parameters:{count:1,aspectRatio:'1:1',transparent:false},referenceAssetIds:[],outputAssetIds:['image'],billingStatus:'unknown'};
  p.generationRecords=[record];parseProject(p);
  record.outputAssetIds=['missing'];rejected(()=>parseProject(p));record.outputAssetIds=['image'];
  p.generationRecords.push(structuredClone(record));rejected(()=>parseProject(p));
});

test('legacy mapping uses own keys and rejects inherited or malformed mapping objects',()=>{
  const p=fixture('legacy-v1'),options=fixture('import-options');p.cells[0][0].colorId='__proto__';
  rejected(()=>migrateLegacyPindo(p,options),'E_UNKNOWN_COLOR');
  options.colorIdMap=Object.create({'__proto__':'demo:white'});rejected(()=>migrateLegacyPindo(p,options));
  options.colorIdMap=JSON.parse('{"__proto__":"demo:white","old-clear":"demo:clear","old-red":"demo:red","old-white":"demo:white"}');
  // Distinct old-white and __proto__ must not collapse to one identity.
  rejected(()=>migrateLegacyPindo(p,options),'E_PALETTE_INVALID');
  assert.equal(Object.prototype.polluted,undefined);
});

test('revision overflow and disabled destination are refused before application',()=>{
  const p=project();p.revision=2147483647;
  const input=cmd([{index:0,before:1,after:2}]);input.baseRevision=p.revision;
  rejected(()=>parseCellPatchCommand(input,p),'E_COMMAND_INVALID');
  p.revision=0;p.cells=p.cells.map(v=>v===2?1:v);p.palette.colors[1].enabled=false;input.baseRevision=0;
  rejected(()=>parseCellPatchCommand(input,p),'E_COMMAND_INVALID');
});
