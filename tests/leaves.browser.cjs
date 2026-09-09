// Optional browser regression: node tests/leaves.browser.cjs (requires Playwright).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    await page.goto(process.env.SIDELEAF_TEST_URL || 'http://127.0.0.1:8765');
    await page.evaluate(()=>localStorage.setItem('sideleaf.leaf-posts.v1',JSON.stringify([
      {id:'a',author:'wish',body:'这个海洋怎么又开始装神弄鬼了。',createdAt:2000,comments:[{author:'zheng',body:'因为它很享受看你一边骂，一边继续往下读。',createdAt:2001},{author:'wish',body:'被你猜到了 ^_^',createdAt:2002}]},
      {id:'b',author:'zheng',body:'读到弗伯克那句玩笑，想起你会在这里停一下。',createdAt:1000,comments:[{author:'wish',body:'长评论也要保持叶片位置。'.repeat(12),createdAt:1001}]}
    ])));
    await page.reload();
    await page.click('[data-main-view="leaves"]');
    for(const width of [390,320,430]) {
      await page.setViewportSize({width,height:844});
      const layout=await page.evaluate(()=>{
        const rect=s=>Array.from(document.querySelectorAll(s),e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,h:r.height}});
        return {authors:rect('.leaf-card-meta > .leaf-author'),replies:rect('.leaf-comment p'),nodes:rect('.leaf-reply-node'),overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(layout.overflow,false,`no overflow at ${width}`);
      assert.equal(layout.authors[0].x,layout.authors[1].x,'author columns align');
      layout.replies.forEach((r,i)=>assert.ok(Math.abs(r.y-layout.nodes[i].y)<8,'leaf tracks reply first line'));
      if(width===390 && process.env.SIDELEAF_TEST_SCREENSHOT) await page.screenshot({path:process.env.SIDELEAF_TEST_SCREENSHOT,fullPage:true});
    }
    await page.click('[data-leaf-action="menu"][data-post-id="b"]');
    assert.equal(await page.locator('[data-leaf-action="edit"][data-post-id="b"]').count(),0);
    await page.click('[data-leaf-action="comment"][data-post-id="b"]');
    await page.fill('[data-leaf-comment-input="b"]','浏览器回归评论');
    await page.click('[data-leaf-action="send-comment"][data-post-id="b"]');
    assert.ok(await page.locator('.leaf-comment').filter({hasText:'浏览器回归评论'}).count());
    await page.click('[data-leaf-action="menu"][data-post-id="a"]');
    await page.click('[data-leaf-action="edit"][data-post-id="a"]');
    assert.equal(await page.locator('#leaf-input').inputValue(),'这个海洋怎么又开始装神弄鬼了。');
    assert.deepEqual(errors,[]);
    console.log('PASS: 320/390/430px layout, author alignment, reply anchors, comment submission, edit, author permissions, no JS errors');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
