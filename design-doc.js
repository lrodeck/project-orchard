// Design Doc exporter — generates a self-contained HTML document
// summarizing the current scenario: cover, system overview SVG snapshot,
// resource flow analysis, and simulation results.
//
// Triggered from the topbar; opens result in a new window with a Print button.
// Auto-runs a 200-step simulation if there's no history yet.

(function(global){

  const COLORS = ['#5e7a3a','#c0623a','#d99a2b','#6b3a5c','#6e8aa4','#8a3a1c','#3f5524','#a87aa0','#bfa055','#7fa0aa','#c47860','#e89438'];

  // Resolve a resource's color: explicit override on diagram > positional default.
  function resColor(diagram, r){
    const overrides = diagram && diagram.resourceColors;
    if(overrides && overrides[r]) return overrides[r];
    const i = (diagram && diagram.resources) ? diagram.resources.indexOf(r) : -1;
    return COLORS[(i<0?0:i) % COLORS.length];
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // -------- 1. Snapshot the canvas as inline SVG --------
  // Reads node positions/types from `diagram` and re-renders a clean,
  // labeled diagram suitable for print. We do NOT screenshot the live DOM
  // — we re-render so labels stay legible at print scale.
  function renderSystemSVG(diagram){
    const nodes = Object.values(diagram.nodes);
    if(!nodes.length) return '<div style="padding:40px;text-align:center;color:#888">Empty scenario.</div>';

    // Compute bounds with padding
    const PAD = 80;
    const NW = 140, NH = 70; // node box w/h
    const xs = nodes.map(n=>n.x), ys = nodes.map(n=>n.y);
    const minX = Math.min(...xs) - PAD;
    const minY = Math.min(...ys) - PAD;
    const maxX = Math.max(...xs) + NW + PAD;
    const maxY = Math.max(...ys) + NH + PAD;
    const W = maxX - minX, H = maxY - minY;

    // node center for edge endpoints
    const cx = (n) => (n.x - minX) + NW/2;
    const cy = (n) => (n.y - minY) + NH/2;

    // type → fill color (muted, print-friendly)
    const TYPE_FILL = {
      source:'#e8d8a8', pool:'#cce0c4', drain:'#e8c4b8', converter:'#d8c4e0',
      gate:'#e0d8b8', booster:'#f0d8b0', splitter:'#cce0e0', delay:'#d8d8d8',
      event:'#f0c8c8', market:'#c8d8e8', offer:'#f0c8d8', tombola:'#e8d8e8', goal:'#c8e0c8'
    };

    // Resource → color (for edge stroke)
    const resColor = {};
    diagram.resources.forEach((r,i)=>{ resColor[r] = COLORS[i % COLORS.length]; });

    // groups behind everything
    const groupsSvg = (diagram.groups||[]).map(g => {
      const x = g.x - minX, y = g.y - minY;
      return `<g>
        <rect x="${x}" y="${y}" width="${g.w}" height="${g.h}" rx="10"
              fill="${g.color||'#888'}" fill-opacity="0.07"
              stroke="${g.color||'#888'}" stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="6 4"/>
        <text x="${x+10}" y="${y+18}" font-size="12" font-weight="700"
              fill="${g.color||'#666'}" font-family="ui-sans-serif,system-ui,sans-serif">${esc(g.name||'group')}</text>
      </g>`;
    }).join('');

    // edges
    const edgesSvg = (diagram.edges||[]).map(e => {
      const a = diagram.nodes[e.from], b = diagram.nodes[e.to];
      if(!a || !b) return '';
      const x1=cx(a), y1=cy(a), x2=cx(b), y2=cy(b);
      const stroke = e.signal ? '#888' : (resColor[e.resource] || '#666');
      const dash = e.signal ? '4 3' : '0';
      // simple cubic curve
      const dx = (x2-x1) * 0.5;
      const path = `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
      return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-dasharray="${dash}" opacity="0.85"/>`;
    }).join('');

    // nodes
    const nodesSvg = nodes.map(n => {
      const x = n.x - minX, y = n.y - minY;
      const fill = TYPE_FILL[n.type] || '#ddd';
      return `<g>
        <rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="8"
              fill="${fill}" stroke="#333" stroke-width="1"/>
        <text x="${x+NW/2}" y="${y+24}" text-anchor="middle"
              font-size="11" font-weight="700" font-family="ui-sans-serif,system-ui,sans-serif"
              fill="#1a1a1a">${esc(n.name||n.type)}</text>
        <text x="${x+NW/2}" y="${y+42}" text-anchor="middle"
              font-size="9" font-family="ui-monospace,monospace" fill="#555"
              text-transform="uppercase">${esc(n.type)}</text>
        ${nodeStateLabel(n, x+NW/2, y+58)}
      </g>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:#fafaf7;border:1px solid #ddd;border-radius:6px">
      ${groupsSvg}
      ${edgesSvg}
      ${nodesSvg}
    </svg>`;
  }

  function nodeStateLabel(n, x, y){
    let s = '';
    if(n.type==='source') s = `${n.rate}/step`;
    else if(n.type==='pool'){
      const tot = Object.values(n.resources||{}).reduce((a,b)=>a+b,0);
      s = `${tot}${n.capacity===Infinity||n.capacity==null?'':'/'+n.capacity}`;
    } else if(n.type==='drain') s = `${n.rate}/step`;
    else if(n.type==='converter') s = `${n.inAmount||1}:${n.outAmount||1}`;
    else if(n.type==='gate') s = `${n.mode||'gte'} ${n.threshold}`;
    else if(n.type==='offer') s = `$${n.price} • ${n.conversion}%`;
    else if(n.type==='market') s = `@${(n.price||0).toFixed?.(2) ?? n.price}`;
    if(!s) return '';
    return `<text x="${x}" y="${y}" text-anchor="middle" font-size="9" font-family="ui-monospace,monospace" fill="#333">${esc(s)}</text>`;
  }

  // -------- 2. Resource flow analysis (per-resource production/consumption) --------
  function resourceFlowTable(diagram, hist){
    if(!diagram.resources.length) return '<p>No resources defined.</p>';
    const last = hist[hist.length-1] || {};
    const rows = diagram.resources.map((r,i) => {
      const producers = Object.values(diagram.nodes).filter(n =>
        (n.type==='source' && n.resource===r) ||
        (n.type==='converter' && n.outResource===r)
      );
      const consumers = Object.values(diagram.nodes).filter(n =>
        (n.type==='drain' && n.resource===r) ||
        (n.type==='converter' && n.inResource===r)
      );
      const inPools = Object.values(diagram.nodes).filter(n =>
        n.type==='pool' && n.resources && (r in n.resources));
      const stored = inPools.reduce((a,p)=>a+(p.resources?.[r]||0), 0);
      const prodNow = last?.total_production?.[r] || 0;
      // crude consumption estimate: drains' rates that match resource
      const consNow = Object.values(diagram.nodes)
        .filter(n=>n.type==='drain' && n.resource===r)
        .reduce((a,n)=>a+(n.rate||0), 0);
      const net = prodNow - consNow;
      const status = net>0?'accumulating':(net<0?'depleting':'equilibrium');
      return `<tr>
        <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${resColor(diagram,r)};margin-right:6px;vertical-align:middle"></span><b>${esc(r)}</b></td>
        <td>${producers.map(n=>esc(n.name)).join(', ')||'—'}</td>
        <td>${consumers.map(n=>esc(n.name)).join(', ')||'—'}</td>
        <td>${inPools.map(n=>esc(n.name)).join(', ')||'—'}</td>
        <td class="num">${stored}</td>
        <td class="num">${prodNow}</td>
        <td class="num">${consNow}</td>
        <td class="num ${net>0?'pos':net<0?'neg':''}">${net>0?'+':''}${net}</td>
        <td><span class="pill ${status}">${status}</span></td>
      </tr>`;
    }).join('');

    return `<table class="dd-table">
      <thead><tr>
        <th>Resource</th><th>Produced by</th><th>Consumed by</th><th>Pooled in</th>
        <th>Stored</th><th>P/step</th><th>C/step</th><th>Net</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // -------- 3. Inline SVG line chart (simple, no deps) --------
  function lineChart(series, opts={}){
    const W = opts.width || 720, H = opts.height || 220;
    const PAD = {l:48, r:12, t:12, b:28};
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const allY = series.flatMap(s => s.points.map(p=>p.y));
    const allX = series.flatMap(s => s.points.map(p=>p.x));
    if(!allY.length) return '<div style="padding:20px;color:#888">No data yet.</div>';
    const minY = 0, maxY = Math.max(1, ...allY);
    const minX = Math.min(...allX), maxX = Math.max(...allX);
    const sx = (x) => PAD.l + (maxX===minX?0:(x-minX)/(maxX-minX)*iw);
    const sy = (y) => PAD.t + ih - (y-minY)/(maxY-minY)*ih;

    // Y gridlines
    const ticks = 4;
    const gridY = Array.from({length:ticks+1}, (_,i)=>{
      const v = minY + (maxY-minY)*i/ticks;
      const y = sy(v);
      return `<line x1="${PAD.l}" x2="${W-PAD.r}" y1="${y}" y2="${y}" stroke="#eee"/>
              <text x="${PAD.l-6}" y="${y+3}" text-anchor="end" font-size="9" font-family="ui-monospace,monospace" fill="#888">${Math.round(v)}</text>`;
    }).join('');

    // X axis labels (start, mid, end)
    const xLabels = [minX, Math.round((minX+maxX)/2), maxX].map(v =>
      `<text x="${sx(v)}" y="${H-8}" text-anchor="middle" font-size="9" font-family="ui-monospace,monospace" fill="#888">${v}</text>`
    ).join('');

    const lines = series.map(s => {
      const d = s.points.map((p,i)=>(i?'L':'M')+sx(p.x)+' '+sy(p.y)).join(' ');
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.8"/>`;
    }).join('');

    const legend = series.map((s,i) =>
      `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:11px"><span style="width:14px;height:3px;background:${s.color};display:inline-block"></span>${esc(s.name)}</span>`
    ).join('');

    return `<div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
        ${gridY}${xLabels}${lines}
      </svg>
      <div style="margin-top:6px">${legend}</div>
    </div>`;
  }

  // -------- 4. Run simulation if needed --------
  function ensureSim(diagram, existingHist, steps=200){
    if(existingHist && existingHist.length >= 50) return existingHist;
    // deep clone diagram so we don't mutate the user's live one
    const d = JSON.parse(JSON.stringify(diagram));
    // restore booster.remaining=Infinity convention used by app
    for(const n of Object.values(d.nodes)){
      if(n.type==='booster' && n.remaining===null) n.remaining = Infinity;
      if(n.capacity===null) n.capacity = Infinity;
    }
    const hist = [];
    for(let i=0; i<steps; i++){
      const { analytics } = global.RFSim.step(d);
      hist.push({ step: d.currentStep, ...analytics });
    }
    return hist;
  }

  // -------- 4b. Narrative — verbally explain the system --------
  // Walks the graph from sources outward and produces plain-English paragraphs
  // describing what each module does and how they connect. Engineering tone.
  function buildNarrative(diagram){
    const nodes = Object.values(diagram.nodes);
    if(!nodes.length) return '';
    const N = id => diagram.nodes[id];
    const nm = id => esc(N(id)?.name||'?');
    const outEdges = (id, opts={}) => (diagram.edges||[]).filter(e=>e.from===id && (opts.signal===undefined || !!e.signal===opts.signal));
    const inEdges  = (id, opts={}) => (diagram.edges||[]).filter(e=>e.to===id   && (opts.signal===undefined || !!e.signal===opts.signal));

    const sources   = nodes.filter(n=>n.type==='source');
    const pools     = nodes.filter(n=>n.type==='pool');
    const drains    = nodes.filter(n=>n.type==='drain');
    const converters= nodes.filter(n=>n.type==='converter');
    const gates     = nodes.filter(n=>n.type==='gate');
    const offers    = nodes.filter(n=>n.type==='offer');
    const markets   = nodes.filter(n=>n.type==='market');
    const tombolas  = nodes.filter(n=>n.type==='tombola');
    const events    = nodes.filter(n=>n.type==='event');
    const goals     = nodes.filter(n=>n.type==='goal');
    const groups    = diagram.groups||[];

    const inGroup = (n, g) => n.x>=g.x && n.y>=g.y && n.x<=g.x+g.w && n.y<=g.y+g.h;

    const parts = [];

    // 1. Top-line description
    const topLine = (() => {
      const tags = [];
      if(sources.length) tags.push(`${sources.length} input source${sources.length>1?'s':''}`);
      if(pools.length)   tags.push(`${pools.length} buffer pool${pools.length>1?'s':''}`);
      if(converters.length) tags.push(`${converters.length} converter${converters.length>1?'s':''}`);
      if(offers.length)  tags.push(`${offers.length} monetization offer${offers.length>1?'s':''}`);
      if(markets.length) tags.push(`${markets.length} dynamic market${markets.length>1?'s':''}`);
      if(tombolas.length)tags.push(`${tombolas.length} mystery box${tombolas.length>1?'s':''}`);
      if(events.length)  tags.push(`${events.length} scheduled event${events.length>1?'s':''}`);
      if(goals.length)   tags.push(`${goals.length} goal assertion${goals.length>1?'s':''}`);
      return `<p>This system is composed of ${tags.join(', ').replace(/, ([^,]*)$/, ', and $1')}. The sections below describe each module and the path resources take through them.</p>`;
    })();
    parts.push(topLine);

    // 2. Feature groups — narrate each as a discrete capability
    if(groups.length){
      parts.push('<h3>Feature modules</h3>');
      for(const g of groups){
        const inside = nodes.filter(n => inGroup(n, g));
        if(!inside.length) continue;
        const types = inside.reduce((acc,n)=>{ acc[n.type]=(acc[n.type]||0)+1; return acc; }, {});
        const typeStr = Object.entries(types).map(([t,c])=>`${c} ${t}${c>1?'s':''}`).join(', ');
        // role inference
        const role = (() => {
          if(types.offer)   return 'monetization touchpoint — exposes a paid offer to the player and converts a fraction of impressions into spend';
          if(types.tombola) return 'gacha / mystery-box loop — pulls from a weighted prize table on trigger';
          if(types.market)  return 'two-way exchange — players trade resources at a price that drifts with supply and demand';
          if(types.event)   return 'scheduled trigger — fires at a fixed step to launch downstream activity';
          if(types.converter && types.pool) return 'crafting / production loop — buffers raw input, converts at a fixed ratio, stores output';
          if(types.gate)    return 'progression gate — only releases flow downstream once an upstream pool meets a threshold';
          if(types.source && types.pool) return 'production line — generates a resource on a tick and stores it for downstream use';
          if(types.drain)   return 'consumption sink — removes a resource from the system to model spend or decay';
          return 'group of related nodes';
        })();
        // resources touched
        const resources = new Set();
        for(const n of inside){
          if(n.resource) resources.add(n.resource);
          if(n.inResource) resources.add(n.inResource);
          if(n.outResource) resources.add(n.outResource);
          for(const r of Object.keys(n.resources||{})) resources.add(r);
        }
        // external connections (edges crossing the group boundary)
        const ids = new Set(inside.map(n=>n.id));
        const incoming = (diagram.edges||[]).filter(e => ids.has(e.to) && !ids.has(e.from));
        const outgoing = (diagram.edges||[]).filter(e => ids.has(e.from) && !ids.has(e.to));
        const incStr = incoming.length ? `Receives from ${incoming.slice(0,4).map(e=>nm(e.from)).join(', ')}${incoming.length>4?'…':''}.` : 'No external inputs.';
        const outStr = outgoing.length ? `Feeds ${outgoing.slice(0,4).map(e=>nm(e.to)).join(', ')}${outgoing.length>4?'…':''}.` : 'No external outputs.';

        parts.push(`<div class="feature-block">
          <h4>${esc(g.name||'feature')}</h4>
          <div class="feature-meta"><b>Role:</b> ${role}.<br/>
          <b>Composition:</b> ${typeStr} — ${inside.map(n=>`<code>${esc(n.name)}</code>`).join(', ')}.<br/>
          <b>Resources:</b> ${[...resources].map(esc).join(', ')||'none directly'}.<br/>
          <b>Wiring:</b> ${incStr} ${outStr}</div>
        </div>`);
      }
    }

    // 3. Source-to-sink walks for each resource
    if(sources.length){
      parts.push('<h3>Resource paths</h3>');
      const lines = [];
      for(const src of sources){
        const path = [src.name];
        let cur = src, depth=0;
        while(depth<6){
          const out = outEdges(cur.id, {signal:false});
          if(!out.length) break;
          const next = N(out[0].to); if(!next) break;
          path.push(next.name);
          cur = next; depth++;
        }
        lines.push(`<li><code>${path.map(esc).join(' → ')}</code> — ${src.rate}/step of <b>${esc(src.resource||'?')}</b> enters here.</li>`);
      }
      parts.push(`<ul class="path-list">${lines.join('')}</ul>`);
    }

    // 4. Goals as acceptance criteria
    if(goals.length){
      parts.push('<h3>Acceptance criteria</h3>');
      parts.push(`<ul class="goal-list">${goals.map(g => `<li><b>${esc(g.name||'goal')}</b> — <code>${esc(g.condition||'—')}</code>${g.byStep?` by step ${g.byStep}`:''}. ${g.lastResult?`Currently <b>${esc(g.lastResult)}</b>.`:''}</li>`).join('')}</ul>`);
    }

    // 5. Risk callouts
    const risks = [];
    const sourcedRes = new Set(sources.map(s=>s.resource).filter(Boolean));
    const drainedRes = new Set(drains.map(d=>d.resource).filter(Boolean));
    for(const r of sourcedRes){ if(!drainedRes.has(r)) risks.push(`<b>${esc(r)}</b> is produced but never drained — it will accumulate without bound unless a pool capacity caps it.`); }
    for(const r of drainedRes){ if(!sourcedRes.has(r)) risks.push(`<b>${esc(r)}</b> is drained but never produced — sinks will starve.`); }
    const orphanNodes = nodes.filter(n => n.type!=='goal' && n.type!=='event' && !inEdges(n.id).length && !outEdges(n.id).length);
    if(orphanNodes.length) risks.push(`${orphanNodes.length} node${orphanNodes.length>1?'s have':' has'} no edges and will not participate in the simulation: ${orphanNodes.map(n=>`<code>${esc(n.name)}</code>`).join(', ')}.`);
    if(risks.length){
      parts.push('<h3>Structural risks</h3>');
      parts.push(`<ul class="risk-list">${risks.map(r=>`<li>${r}</li>`).join('')}</ul>`);
    }

    return parts.join('');
  }

  // -------- 5. The full doc HTML --------
  function buildDocHTML(diagram, hist, canvasPng){
    const nodes = Object.values(diagram.nodes);
    const edges = diagram.edges || [];
    const groups = diagram.groups || [];
    const goals = nodes.filter(n=>n.type==='goal');
    const sources = nodes.filter(n=>n.type==='source');
    const pools = nodes.filter(n=>n.type==='pool');
    const drains = nodes.filter(n=>n.type==='drain');
    const date = new Date();

    // sim charts
    const prodSeries = diagram.resources.map((r,i)=>({
      name: r, color: resColor(diagram, r),
      points: hist.map(h => ({x:h.step, y: h.total_production?.[r]||0}))
    })).filter(s => s.points.some(p=>p.y>0));

    const poolSeries = [];
    let ci = 0;
    pools.forEach(p => {
      Object.keys(p.resources||{}).forEach(r => {
        poolSeries.push({
          name: `${p.name}/${r}`, color: COLORS[(ci++)%COLORS.length],
          points: hist.map(h => ({x:h.step, y: h.pool_levels?.[p.id]?.[r]||0}))
        });
      });
    });

    // TL;DR — derive a one-liner about the system
    const economyType = (() => {
      const hasMarket = nodes.some(n=>n.type==='market');
      const hasOffer = nodes.some(n=>n.type==='offer');
      const hasTombola = nodes.some(n=>n.type==='tombola');
      const tags = [];
      if(hasOffer || hasMarket) tags.push('monetized');
      if(hasTombola) tags.push('gacha-style');
      if(goals.length) tags.push(`${goals.length} goal${goals.length>1?'s':''}`);
      if(groups.length) tags.push(`${groups.length} feature${groups.length>1?'s':''}`);
      return tags.join(' · ') || 'open-loop economy';
    })();

    const finalStep = hist[hist.length-1]?.step ?? 0;
    const totalProd = diagram.resources.reduce((a,r)=>a + hist.reduce((b,h)=>b+(h.total_production?.[r]||0), 0), 0);

    return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>${esc(diagram.name||'Scenario')} — Feature Design Document</title>
<style>
  :root {
    --ink: #1a1a1a; --ink-soft: #555; --line: #ddd; --paper: #fff;
    --accent: #5e7a3a; --accent-soft: #e8efde;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --sans: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#f4f3ee; color:var(--ink); font-family:var(--sans); }
  .page { max-width: 880px; margin: 24px auto; background:var(--paper); padding: 56px 64px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  h1 { font-size: 32px; margin: 0 0 6px; letter-spacing: -.02em; }
  h2 { font-size: 20px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 2px solid var(--accent); letter-spacing:-.01em; }
  h3 { font-size: 14px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-soft); }
  p { line-height: 1.55; font-size: 13.5px; }
  .meta { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); }
  .meta b { color: var(--ink); }
  .hr { height: 1px; background: var(--line); margin: 24px 0; }

  /* Toolbar (hidden in print) */
  .toolbar {
    position: sticky; top: 0; background: var(--accent); color: #fff;
    padding: 10px 16px; display: flex; gap: 12px; align-items: center;
    z-index: 50; box-shadow: 0 1px 6px rgba(0,0,0,.15);
  }
  .toolbar b { font-weight: 700; }
  .toolbar button {
    background: #fff; color: var(--accent); border: none; padding: 6px 14px;
    font-weight: 700; border-radius: 4px; cursor: pointer; font-size: 12px;
  }
  .toolbar button:hover { background: #f0f0f0; }

  /* Cover stat tiles */
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0 24px; }
  .stat { border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; }
  .stat .l { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-soft); }
  .stat .v { font-size: 24px; font-weight: 700; font-family: var(--mono); margin-top: 2px; line-height: 1.1; }
  .stat .s { font-size: 10px; color: var(--ink-soft); margin-top: 2px; font-family: var(--mono); }

  .tldr { background: var(--accent-soft); border-left: 3px solid var(--accent); padding: 14px 18px; border-radius: 0 6px 6px 0; margin: 12px 0 0; }
  .tldr p { margin: 0; font-size: 13.5px; }

  /* Tables */
  .dd-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
  .dd-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-soft); padding: 8px 10px; border-bottom: 2px solid var(--ink); font-weight: 700; }
  .dd-table td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .dd-table td.num { font-family: var(--mono); text-align: right; }
  .dd-table td.num.pos { color: #2a7a3a; }
  .dd-table td.num.neg { color: #b03a2a; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .pill.accumulating { background: #fff3d8; color: #8a5a00; }
  .pill.depleting { background: #fde0db; color: #8a2a1c; }
  .pill.equilibrium { background: #e0e8d8; color: #3a5a24; }

  /* Narrative blocks */
  .feature-block { border:1px solid var(--line); border-left:3px solid var(--accent); padding:10px 14px; margin:10px 0; border-radius:0 4px 4px 0; background:#fafaf7; }
  .feature-block h4 { margin:0 0 6px; font-size:14px; }
  .feature-meta { font-size:12px; line-height:1.55; color:var(--ink); }
  .feature-meta code { font-family:var(--mono); font-size:11px; background:#eee; padding:1px 4px; border-radius:2px; }
  .path-list, .goal-list, .risk-list { font-size:12.5px; line-height:1.7; padding-left:18px; margin:6px 0; }
  .path-list code { font-family:var(--mono); font-size:11.5px; background:#f0efe8; padding:2px 6px; border-radius:3px; }
  .goal-list code, .risk-list code { font-family:var(--mono); font-size:11px; background:#f0efe8; padding:1px 4px; border-radius:2px; }
  .risk-list li { color:#7a3a1c; }

  .legend-row { display: flex; flex-wrap: wrap; gap: 14px; margin: 8px 0 0; font-size: 11px; color: var(--ink-soft); }
  .legend-row .key { display: inline-flex; align-items: center; gap: 6px; }
  .legend-row .sw { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #888; }

  .footnote { font-size: 10px; color: var(--ink-soft); margin-top: 24px; border-top: 1px solid var(--line); padding-top: 12px; font-family: var(--mono); }

  @media print {
    .toolbar { display: none; }
    body { background: #fff; }
    .page { box-shadow: none; margin: 0; padding: 24px 32px; max-width: none; }
    h2 { page-break-after: avoid; }
    .stat-grid, .dd-table, svg { page-break-inside: avoid; }
  }
</style>
</head><body>

<div class="toolbar">
  <b>Feature Design Document</b>
  <span style="opacity:.85;font-size:12px">${esc(diagram.name||'Scenario')}</span>
  <span style="flex:1"></span>
  <button onclick="window.print()">Print / Save as PDF</button>
  <button onclick="window.close()" style="background:transparent;color:#fff;border:1px solid #fff">Close</button>
</div>

<div class="page">

  <!-- 1. COVER -->
  <h1>${esc(diagram.name||'Untitled Scenario')}</h1>
  <div class="meta"><b>Feature Design Document</b> · generated ${date.toLocaleDateString()} ${date.toLocaleTimeString()} · ${esc(economyType)}</div>

  <div class="tldr">
    <p><b>TL;DR.</b> System contains <b>${nodes.length} nodes</b> across <b>${groups.length||'no'} feature group${groups.length===1?'':'s'}</b>, exchanging <b>${diagram.resources.length} resource type${diagram.resources.length===1?'':'s'}</b> via <b>${edges.length} edge${edges.length===1?'':'s'}</b>. Economy is sourced by ${sources.length} input tap${sources.length===1?'':'s'}, buffered by ${pools.length} pool${pools.length===1?'':'s'}, and consumed by ${drains.length} drain${drains.length===1?'':'s'}. Simulated to step ${finalStep} with cumulative production of ${totalProd.toLocaleString()} units across all resources.</p>
  </div>

  <div class="stat-grid">
    <div class="stat"><div class="l">Nodes</div><div class="v">${nodes.length}</div><div class="s">${sources.length} src · ${pools.length} pool · ${drains.length} drain</div></div>
    <div class="stat"><div class="l">Resources</div><div class="v">${diagram.resources.length}</div><div class="s">${diagram.resources.slice(0,3).map(esc).join(', ')}${diagram.resources.length>3?'…':''}</div></div>
    <div class="stat"><div class="l">Edges</div><div class="v">${edges.length}</div><div class="s">${edges.filter(e=>e.signal).length} signal · ${edges.filter(e=>!e.signal).length} flow</div></div>
    <div class="stat"><div class="l">Sim length</div><div class="v">${finalStep}</div><div class="s">steps run</div></div>
  </div>

  <!-- 2. SYSTEM OVERVIEW -->
  <h2>System Overview</h2>
  <p>Authoritative diagram of the scenario as configured. Captured live from the editor canvas.</p>
  ${canvasPng
    ? `<img src="${canvasPng}" alt="System diagram" style="width:100%;height:auto;border:1px solid #ddd;border-radius:6px;background:#fafaf7"/>`
    : renderSystemSVG(diagram)}

  ${diagram.resources.length ? `<div class="legend-row">
    <b style="font-size:11px;color:var(--ink)">Resources:</b>
    ${diagram.resources.map((r,i)=>`<span class="key"><span class="sw" style="background:${resColor(diagram,r)}"></span>${esc(r)}</span>`).join('')}
  </div>` : ''}

  ${groups.length ? `<h3>Feature groups</h3>
    <ul style="font-size:12.5px;line-height:1.6">
      ${groups.map(g => {
        const inside = nodes.filter(n => n.x>=g.x && n.y>=g.y && n.x<=g.x+g.w && n.y<=g.y+g.h);
        return `<li><b>${esc(g.name||'group')}</b> — ${inside.length} node${inside.length===1?'':'s'}: ${inside.map(n=>`<code style="font-family:var(--mono);font-size:11px">${esc(n.name)}</code>`).join(', ')||'<i>empty</i>'}</li>`;
      }).join('')}
    </ul>` : ''}

  <!-- 2b. NARRATIVE -->
  <h2>How it works</h2>
  ${buildNarrative(diagram)}

  <!-- 3. RESOURCE FLOW ANALYSIS -->
  <h2>Resource Flow Analysis</h2>
  <p>Per-resource ledger of production, consumption, and net flow at the final simulated step. <b>Net</b> &gt; 0 means accumulating (risk: inflation / dead stock); &lt; 0 means depleting (risk: starvation); ≈ 0 means the system is in equilibrium.</p>
  ${resourceFlowTable(diagram, hist)}

  <!-- 4. SIMULATION RESULTS -->
  <h2>Simulation Results</h2>
  <p>Output of a ${hist.length}-step deterministic run with the configuration shown above. Charts trace cumulative production and pool levels per step.</p>

  <h3>Total production per step</h3>
  ${prodSeries.length ? lineChart(prodSeries) : '<p style="color:#888;font-size:12px">No production recorded.</p>'}

  ${poolSeries.length ? `<h3>Pool levels per step</h3>${lineChart(poolSeries.slice(0,8))}${poolSeries.length>8?`<div class="meta" style="margin-top:4px">Showing 8 of ${poolSeries.length} pool/resource series.</div>`:''}` : ''}

  <h3>Final-step KPIs</h3>
  <table class="dd-table">
    <thead><tr><th>Metric</th><th>Value</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Steps simulated</td><td class="num">${hist.length}</td><td>Auto-run if no history existed.</td></tr>
      <tr><td>Cumulative production</td><td class="num">${totalProd.toLocaleString()}</td><td>Across all resources, all sources.</td></tr>
      ${diagram.resources.map(r => {
        const cum = hist.reduce((a,h)=>a+(h.total_production?.[r]||0), 0);
        const last = hist[hist.length-1]?.total_production?.[r] || 0;
        return `<tr><td>${esc(r)} — cumulative</td><td class="num">${cum.toLocaleString()}</td><td>Last step: ${last}/step</td></tr>`;
      }).join('')}
      ${goals.length ? goals.map(g => `<tr><td>Goal: ${esc(g.name||'unnamed')}</td><td class="num">${esc(g.lastResult||'pending')}</td><td>${esc(g.condition||'—')}</td></tr>`).join('') : ''}
    </tbody>
  </table>

  <div class="footnote">
    Generated by Orchard. This document reflects the scenario as captured at export time. Re-export after tuning to refresh.
  </div>

</div>
</body></html>`;
  }

  // -------- 6. Public entry point --------
  // canvasEl: the live `.canvas` DOM node (we snapshot the inner-transformed view as a PNG)
  async function exportDesignDoc(diagram, hist, canvasEl){
    const safeHist = ensureSim(diagram, hist, 200);
    let canvasPng = null;
    try {
      if(canvasEl && global.htmlToImage){
        // Snapshot the .canvas-inner so we get the unscaled, untranslated content,
        // then we let the doc fit it to its width.
        const inner = canvasEl.querySelector('.canvas-inner') || canvasEl;
        // Temporarily reset transform so the snapshot captures everything,
        // then restore it. We compute the bounding box of all nodes/groups
        // to size the snapshot tightly.
        const prevTransform = inner.style.transform;
        inner.style.transform = 'translate(0,0) scale(1)';
        // measure bounding box from the diagram model (true node/group coords),
        // NOT from DOM children — the canvas-inner contains a full-bleed SVG edge
        // layer which would force the box to start at (0,0) and produce a tiny
        // image floating in a sea of empty.
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        for(const n of Object.values(diagram.nodes||{})){
          const w = 160, h = 90; // generous default node size
          if(n.x<minX)minX=n.x; if(n.y<minY)minY=n.y;
          if(n.x+w>maxX)maxX=n.x+w; if(n.y+h>maxY)maxY=n.y+h;
        }
        for(const g of (diagram.groups||[])){
          if(g.x<minX)minX=g.x; if(g.y<minY)minY=g.y;
          if(g.x+g.w>maxX)maxX=g.x+g.w; if(g.y+g.h>maxY)maxY=g.y+g.h;
        }
        if(!isFinite(minX)){ minX=0; minY=0; maxX=800; maxY=600; }
        const PAD=40;
        const w = (maxX-minX)+PAD*2, h = (maxY-minY)+PAD*2;
        // wrap nodes into a temporary translated container... easier: just snapshot inner with explicit width/height & negative translation
        canvasPng = await global.htmlToImage.toPng(inner, {
          width: w, height: h,
          style: { transform: `translate(${-minX+PAD}px, ${-minY+PAD}px) scale(1)`, transformOrigin: '0 0' },
          backgroundColor: getComputedStyle(canvasEl).backgroundColor || '#f4f3ee',
          pixelRatio: 2,
          cacheBust: true,
        });
        inner.style.transform = prevTransform;
      }
    } catch(e){
      console.warn('Canvas snapshot failed; falling back to SVG render:', e);
    }
    const html = buildDocHTML(diagram, safeHist, canvasPng);
    const wnd = window.open('', '_blank');
    if(!wnd){ alert('Pop-up blocked. Allow pop-ups for this page to export.'); return; }
    wnd.document.open();
    wnd.document.write(html);
    wnd.document.close();
  }

  global.OrchardDesignDoc = { exportDesignDoc };

})(window);
