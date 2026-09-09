const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const source = html.slice(html.indexOf('    function botanicalLeaf('),html.indexOf('    function renderFootprints('));
function render(posts, menu=null) {
  const context = {leafFeed:{innerHTML:''},leafPostsKey:'posts',readArray:()=>posts.slice(),bookTitleMap:()=>new Map([['book','示例书籍']]),openLeafMenuId:menu,openLeafCommentId:null,
    escapeText:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),formatMoment:String};
  vm.runInNewContext(source+'\nrenderLeafPosts();',context);
  return context.leafFeed.innerHTML;
}
test('叶间为空时保留原有提示，不产生装饰孤枝',()=>{
  const output=render([]);
  assert.match(output,/叶间还很安静/);
  assert.doesNotMatch(output,/leaf-vine/);
});
test('每条动态和每条回复分别拥有随内容定位的叶片',()=>{
  const output=render([{id:'a',author:'wish',body:'示例动态',createdAt:2,bookId:'book',comments:[{author:'zheng',body:'第一条回复',createdAt:3},{author:'wish',body:'第二条回复',createdAt:4}]}]);
  assert.equal((output.match(/leaf-post-node/g)||[]).length,1);
  assert.equal((output.match(/leaf-reply-node/g)||[]).length,2);
  assert.match(output,/《示例书籍》/);
  assert.doesNotMatch(output,/leaf-card-actions/);
  assert.match(output,/leaf-comment is-zheng/);
  assert.match(output,/leaf-comment is-wish/);
});
test('双方动态共享同一作者网格，仍仅允许编辑和删除愿的动态',()=>{
  const posts=['wish','zheng'].map((author,i)=>({id:author,author,body:'示例',createdAt:i,comments:[]}));
  const output=render(posts,'wish');
  assert.equal((output.match(/class="leaf-card-meta"/g)||[]).length,2);
  for(const action of ['edit','delete']) {
    assert.match(output,new RegExp(`data-leaf-action="${action}" data-post-id="wish"`));
    assert.doesNotMatch(output,new RegExp(`data-leaf-action="${action}" data-post-id="zheng"`));
  }
  assert.equal((output.match(/data-leaf-action="comment"/g)||[]).length,2);
});
test('动态、回复和菜单 ID 继续转义，不将文本变成 HTML',()=>{
  const output=render([{id:'" onclick="bad',body:'<script>bad</script>',createdAt:1,comments:[{body:'<img onerror=bad>',createdAt:2}]}]);
  assert.doesNotMatch(output,/<script>|<img/);
  assert.match(output,/&lt;script&gt;/);
  assert.match(output,/data-post-id="&quot; onclick=&quot;bad"/);
});
test('两种阅读器版本与本次更新保持一致',()=>{
  for(const file of ['read.html','reader.html']) assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes('<small class="build-version">Sideleaf 0.21.2</small>'),file+' version label');
  assert.match(fs.readFileSync(path.join(root,'sw.js'),'utf8'),/network-first-v82/);
  assert.match(html,/href="\.\/sideleaf-leaves.css"/);
});
test('操作菜单脱离内容流，弧枝与发布叶片均有稳定锚点',()=>{
  const css=fs.readFileSync(path.join(root,'sideleaf-leaves.css'),'utf8');
  assert.match(css,/#view-leaves \.leaf-action-menu\s*\{[^}]*position:\s*absolute/s);
  assert.match(css,/#leaf-composer:not\(\.is-open\)\s*\{\s*overflow:\s*visible/);
  assert.match(html,/<svg class="leaf-header-branch"[^>]*>\s*<path/);
});
test('空白处收起菜单，发布框内容先于外框隐藏',()=>{
  const css=fs.readFileSync(path.join(root,'sideleaf-leaves.css'),'utf8');
  assert.match(html,/const keepsMenuOpen = event\.target\.closest\('\.leaf-more, \.leaf-action-menu'\)/);
  assert.match(html,/if \(openLeafMenuId && !keepsMenuOpen\)/);
  assert.match(html,/<svg class="leaf-plus-sprout"[^>]*>[\s\S]*leaf-plus-stem[\s\S]*leaf-plus-blade/);
  assert.match(css,/#leaf-composer \.leaf-compose-body\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(css,/#leaf-composer\.is-open \.leaf-compose-body\s*\{[^}]*visibility:\s*visible/s);
});
