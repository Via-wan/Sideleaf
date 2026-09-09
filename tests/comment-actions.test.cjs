const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('    function addLeafComment('),html.indexOf('    function setMainView('));
function action(state,comments,body='new') {
  const post={id:'p',comments:structuredClone(comments)};
  const c={leafReplyState:state,leafFeed:{querySelector:()=>({value:body})},CSS:{escape:x=>x},leafPostsKey:'p',readArray:()=>[post],Date,Math,window:{crypto:{randomUUID:()=> 'new-id'}},showToast:()=>{},saveLeafPosts:()=>{},openLeafMenuId:null,openLeafCommentId:'p'};
  vm.runInNewContext(source+';addLeafComment("p");',c);return post.comments;
}
test('reply saves exact parent identity, while edits retain comment identity',()=>{
  const original={id:'z',author:'zheng',body:'hello'};
  const replies=action({post:'p',mode:'reply',target:'z'},[original]);
  assert.equal(replies[1].replyToId,'z');assert.equal(replies[1].replyToAuthor,'zheng');
  const edited=action({post:'p',mode:'edit',target:'new-id'},replies,'edited');
  assert.equal(edited.length,2);assert.equal(edited[1].id,'new-id');assert.equal(edited[1].replyToId,'z');assert.equal(edited[1].body,'edited');
});
test('editing another author, blank sends and missing reply targets do not mutate comments',()=>{
  const comments=[{id:'z',author:'zheng',body:'hello'}];
  assert.equal(action({post:'p',mode:'edit',target:'z'},comments)[0].body,'hello');
  assert.equal(action({post:'p',mode:'reply',target:'gone'},comments).length,1);
  assert.equal(action({},comments,'  ').length,1);
});
