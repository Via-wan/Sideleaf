/* A single measured botanical drawing. All stems and leaves share coordinates. */
(function () {
  'use strict';
  const feed = document.getElementById('leaf-feed');
  if (!feed) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('leaf-connected-vine');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // The sibling overlay never changes feed dimensions or participates in its observer.
  feed.parentElement.appendChild(svg);
  let pending = false;
  const n = value => Number(value.toFixed(2));
  const path = (d, cls) => `<path class="${cls}" d="${d}"/>`;
  function leaf(x, y, length, angle, author, small = false) {
    // Local origin is the petiole endpoint, shared exactly with its branch.
    let veins = path('M0 0 Q18 -1 40 0', 'vine-midvein');
    for (const t of [9, 16, 23, 30]) {
      const w = Math.sin(t / 40 * Math.PI) * 10.5;
      veins += path(`M${t} 0 Q${t-1} ${-w/2} ${t-4} ${-w} M${t} 0 Q${t-1} ${w/2} ${t-4} ${w}`, 'vine-finevein');
    }
    return `<g class="vine-leaf is-${author}${small?' is-small':''}" transform="translate(${n(x)} ${n(y)}) rotate(${angle}) scale(${length/40})">${path('M0 0 C5 -12 20 -15 40 0 C25 5 12 19 0 0Z', 'vine-blade')}${veins}</g>`;
  }
  function draw() {
    pending = false;
    if (!feed.getClientRects().length || !feed.clientWidth) { svg.style.display = 'none'; return; }
    const rect = feed.getBoundingClientRect();
    const parent = feed.parentElement.getBoundingClientRect();
    const rows = [...feed.querySelectorAll('.leaf-card-meta, .leaf-comment')];
    if (!rows.length) { svg.style.display = 'none'; return; }
    const textX = parseFloat(getComputedStyle(feed).paddingLeft);
    const railLeft = textX - 60;
    const nodes = rows.map(row => {
      const box = row.getBoundingClientRect();
      const post = row.classList.contains('leaf-card-meta');
      return {post, y: box.top-rect.top+(post ? box.height/2+18 : 3),
        x: post ? 12 : 29, author: row.closest('.is-zheng') ? 'zheng' : 'wish'};
    });
    const headers = nodes.filter(node=>node.post);
    const lastY = nodes[nodes.length-1].y+48;
    function stemAt(y) {
      let start = headers[0].y, period = Math.max(150,(headers[1]?.y || lastY)-start);
      for(let i=0;i<headers.length;i++) {
        if(y < headers[i].y) break;
        start=headers[i].y;
        period=Math.max(150,(headers[i+1]?.y || lastY)-start);
      }
      const phase=(y-start)*Math.PI*2/period;
      return {x:23-11*Math.cos(phase), y, slope:11*Math.sin(phase)*Math.PI*2/period};
    }
    nodes.forEach(node=>{node.x=stemAt(node.y).x;});
    const points = [stemAt(nodes[0].y-62), ...nodes.map(node=>stemAt(node.y)), stemAt(lastY)];
    // Hermite controls preserve the stem tangent through every reply anchor.
    const controls = (a,b) => {const h=(b.y-a.y)/3;return [{x:a.x+a.slope*h,y:a.y+h},{x:b.x-b.slope*h,y:b.y-h}];};
    let main = `M${n(points[0].x)} ${n(points[0].y)}`;
    for (let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i], [c,d]=controls(a,b);
      main += ` C${n(c.x)} ${n(c.y)} ${n(d.x)} ${n(d.y)} ${n(b.x)} ${n(b.y)}`;
    }
    let drawing = path(main, 'vine-stem');
    nodes.forEach(node=>{
      const end = node.post ? {x:18,y:node.y-11} : {x:42,y:node.y+5};
      const rise = node.post ? -10 : 9;
      drawing += path(`M${n(node.x)} ${n(node.y)} C${n(node.x+2)} ${n(node.y+rise)} ${end.x-8} ${n(end.y-2)} ${end.x} ${n(end.y)}`, 'vine-twig');
      drawing += leaf(end.x,end.y,node.post ? (node.author==='zheng'?49:46) : 23,node.post?-38:36,node.author);
    });
    // Decorations occupy only genuinely spare intervals, not comment/header space.
    for (let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i];
      if (b.y-a.y < 58) continue;
      const t=.52, u=1-t, [c,d]=controls(a,b);
      const x=u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x;
      const y=u*u*u*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t*t*t*b.y;
      const left=i%2===1, ex=x+(left?-3:4), ey=y-5;
      drawing += path(`M${n(x)} ${n(y)} Q${n(x)} ${n(ey)} ${n(ex)} ${n(ey)}`, 'vine-twig');
      drawing += leaf(ex,ey,left?19:17,left?-137:-51,i%3===0?'wish':'zheng',true);
    }
    svg.style.cssText = `display:block;left:${n(rect.left-parent.left+railLeft)}px;top:${n(rect.top-parent.top)}px;height:${n(rect.height+10)}px`;
    svg.setAttribute('viewBox', `0 0 80 ${n(rect.height+10)}`);
    svg.innerHTML = drawing;
  }
  function schedule() { if (!pending) { pending=true; requestAnimationFrame(draw); } }
  new ResizeObserver(schedule).observe(feed);
  new MutationObserver(schedule).observe(feed,{childList:true,subtree:true});
  window.addEventListener('resize', schedule);
  document.fonts.ready.then(schedule);
  schedule();
})();
