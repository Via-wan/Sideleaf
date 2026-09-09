const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf('    function positionLeafComposerForViewport()'), html.indexOf('    function openLeafComposer()'));
function style() {
  return {setProperty(k,v){this[k]=v;},getPropertyValue(k){return this[k] || '';},removeProperty(k){delete this[k];}};
}
test('keyboard positioning preserves background height and restores default position on dismissal', () => {
  const body = {style:style()}; body.style.setProperty('--leaf-rest-height','800px');
  const leafComposer = {hidden:false,classList:{contains:()=>true},style:style()};
  const viewport = {height:800,offsetTop:0,scale:1};
  const context={document:{body},window:{innerHeight:800,visualViewport:viewport},leafComposer};
  vm.createContext(context); vm.runInContext(source,context);
  context.positionLeafComposerForViewport();
  assert.equal(leafComposer.style.top,undefined,'no keyboard: keep CSS bottom anchor');
  Object.assign(viewport,{height:400,offsetTop:90});
  context.positionLeafComposerForViewport();
  assert.equal(leafComposer.style.top,'288px');
  assert.equal(body.style['--leaf-viewport-offset'],'90px');
  assert.equal(body.style['--leaf-rest-height'],'800px');
  Object.assign(viewport,{height:800,offsetTop:0});
  context.positionLeafComposerForViewport();
  assert.equal(leafComposer.style.top,undefined);
  assert.equal(leafComposer.style.bottom,undefined);
  assert.equal(body.style['--leaf-viewport-offset'],'0px');
});
test('pinch zoom is not treated as a keyboard and short viewports bound the composer height',()=>{
  const body={style:style()};body.style.setProperty('--leaf-rest-height','800px');
  const leafComposer={hidden:false,classList:{contains:()=>true},style:style()};
  const viewport={height:300,offsetTop:0,scale:2};
  const context={document:{body},window:{innerHeight:800,visualViewport:viewport},leafComposer};
  vm.createContext(context);vm.runInContext(source,context);
  context.positionLeafComposerForViewport();assert.equal(leafComposer.style.top,undefined);
  Object.assign(viewport,{height:180,scale:1});context.positionLeafComposerForViewport();
  assert.equal(leafComposer.style['--leaf-input-max-height'],'156px');
  assert.equal(leafComposer.style.top,'12px');
});
