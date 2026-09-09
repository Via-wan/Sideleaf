const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../sideleaf-vine.js'),'utf8');
function fixture(rows, visible=true) {
  const frames=[];
  const svg={classList:{add(){}},setAttribute(){},style:{},innerHTML:''};
  const feed={clientWidth:300,parentElement:{appendChild(){},getBoundingClientRect:()=>({left:0,top:0})},
    getClientRects:()=>visible?[{}]:[],getBoundingClientRect:()=>({left:0,top:100,height:600}),
    querySelectorAll:()=>rows.map(([post,y,zheng])=>({classList:{contains:()=>post},
      getBoundingClientRect:()=>({top:100+y,height:post?44:23}),closest:()=>zheng?{}:null}))};
  vm.runInNewContext(source,{document:{getElementById:()=>feed,createElementNS:()=>svg,fonts:{ready:{then(){}}}},
    window:{addEventListener(){}},ResizeObserver:class {observe(){}},MutationObserver:class {observe(){}},
    requestAnimationFrame:f=>frames.push(f),getComputedStyle:()=>({paddingLeft:'40'})});
  frames.forEach(f=>f());return svg;
}
test('single measured stem restores decorations without duplicate SVG leaves',()=>{
  const svg=fixture([[true,12,false],[false,130,true],[false,167,false],[true,240,true],[false,390,false]]);
  assert.equal((svg.innerHTML.match(/class="vine-stem"/g)||[]).length,1);
  assert.equal((svg.innerHTML.match(/class="vine-leaf /g)||[]).length,9);
  assert.ok(svg.innerHTML.includes('is-small'));
  assert.doesNotMatch(svg.innerHTML,/NaN|undefined/);
  const branches=[...svg.innerHTML.matchAll(/<path class="vine-twig" d="[^"]* ([\d.-]+) ([\d.-]+)"\/><g[^>]*translate\(([\d.-]+) ([\d.-]+)\)/g)];
  assert.equal(branches.length,9);
  branches.forEach(m=>{assert.equal(m[1],m[3]);assert.equal(m[2],m[4]);});
});
test('empty and hidden feeds never show an orphan vine',()=>{
  assert.equal(fixture([]).style.display,'none');
  assert.equal(fixture([[true,12,false]],false).style.display,'none');
});
test('consecutive replies follow a curved stem instead of one fixed vertical rail',()=>{
  const svg=fixture([[true,12,false],[false,130,true],[false,167,false],[true,240,true],[false,390,false]]);
  const stem=svg.innerHTML.match(/class="vine-stem" d="([^"]+)"/)[1];
  const segments=stem.split(' C').slice(1).map(s=>s.split(/\s+/).map(Number));
  assert.ok(segments.every(s=>s.length===6 && s.every(Number.isFinite)));
  assert.notEqual(segments[1][4],segments[2][4], 'reply anchors have distinct horizontal positions');
  // At each shared endpoint, outgoing/incoming dx/dy agree (rounding tolerance).
  for(let i=0;i<segments.length-1;i++) {
    const a=segments[i], b=segments[i+1];
    const before=(a[4]-a[2])/(a[5]-a[3]);
    const after=(b[0]-a[4])/(b[1]-a[5]);
    assert.ok(Math.abs(before-after)<.003, 'smooth tangent at row junction');
  }
});
