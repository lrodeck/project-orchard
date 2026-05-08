// Node React component (HTML-overlay nodes positioned in canvas-inner)
const NodeView = React.memo(function NodeView({ node, selected, onMouseDown, onPortDown, onPortUp, onClick, simStep, onSize }){
  const ref = React.useRef(null);
  React.useEffect(() => {
    if(!ref.current || !onSize) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => {
      onSize(node.id, el.offsetWidth, el.offsetHeight);
    });
    ro.observe(el);
    onSize(node.id, el.offsetWidth, el.offsetHeight);
    return () => ro.disconnect();
  }, [node.id, onSize]);
  const sub = (() => {
    if(node.type==='source') return <div className="resline"><span>produces</span><strong>{node.produces}</strong></div>;
    if(node.type==='pool'){
      const entries = Object.entries(node.resources||{}).slice(0,4);
      const cap = node.capacity===Infinity ? '∞' : node.capacity;
      return (<>
        {entries.length===0 && <div className="resline"><span>empty</span><strong>{cap}</strong></div>}
        {entries.map(([k,v])=>(<div key={k} className="resline"><span>{k}</span><strong>{v}</strong></div>))}
        {Object.keys(node.resources||{}).length>4 && <div className="resline"><span>…{Object.keys(node.resources).length-4} more</span></div>}
        <div className="resline"><span>capacity</span><strong>{cap}</strong></div>
      </>);
    }
    if(node.type==='drain') return (<>
      <div className="resline"><span>consumes</span><strong>{node.consumes}</strong></div>
      <div className="resline"><span>demand</span><strong>{node.demand}/step</strong></div>
      <div className="resline"><span>last</span><strong>{node.consumedLast||0}</strong></div>
    </>);
    if(node.type==='converter'){
      const ins = Object.entries(node.inputRecipe||{}).map(([k,v])=>`${v} ${k}`).join(' + ') || '—';
      const outs = Object.entries(node.outputProducts||{}).map(([k,v])=>`${v} ${k}`).join(' + ') || '—';
      return (<>
        <div className="resline"><span>in</span><strong style={{textAlign:'right'}}>{ins}</strong></div>
        <div className="resline"><span>out</span><strong style={{textAlign:'right'}}>{outs}</strong></div>
        <div className="resline"><span>cycle</span><strong>{node.cycleProgress||0}/{node.cycleTime}</strong></div>
        {node.isProcessing && <div className="progress"><div style={{width: `${(node.cycleProgress/node.cycleTime)*100}%`}}/></div>}
      </>);
    }
    if(node.type==='gate'){
      const pn = (node.condPoolId||'?').slice(0,4);
      return (<>
        <div className="resline"><span>if</span><strong>{node.condResource||'?'} {node.op} {node.threshold}</strong></div>
        <div className="resline"><span>state</span><strong>{node.isOpen?'OPEN':'CLOSED'}</strong></div>
      </>);
    }
    if(node.type==='booster'){
      const dur = node.duration===Infinity ? '∞' : `${node.remaining}/${node.duration}`;
      const amt = node.signalAmount!=null ? `${node.signalAmount} (sig)` : node.amount;
      return (<>
        <div className="resline"><span>{node.boostType==='multiplicative'?'×':'+'}</span><strong>{amt}</strong></div>
        <div className="resline"><span>dur</span><strong>{dur}</strong></div>
        <div className="resline"><span>active</span><strong>{node.active?'yes':'no'}</strong></div>
      </>);
    }
    if(node.type==='splitter'){
      const buf = Object.entries(node.buffer||{});
      return (<>
        <div className="resline"><span>mode</span><strong>{node.mode}</strong></div>
        {buf.length>0 && buf.slice(0,2).map(([k,v])=>(<div key={k} className="resline"><span>{k}</span><strong>{v}</strong></div>))}
        {buf.length===0 && <div className="resline"><span>buffer</span><strong>—</strong></div>}
      </>);
    }
    if(node.type==='delay'){
      return (<>
        <div className="resline"><span>delay</span><strong>{node.delay} steps</strong></div>
        <div className="resline"><span>queue</span><strong>{(node.queue||[]).length}</strong></div>
      </>);
    }
    if(node.type==='event'){
      const trig = node.triggerType==='periodic' ? `every ${node.period}` : node.triggerType==='once' ? `at ${node.offset}` : 'on gate';
      const pay = Object.entries(node.payload||{}).slice(0,2).map(([k,v])=>`${v} ${k}`).join(', ') || '—';
      return (<>
        <div className="resline"><span>trigger</span><strong>{trig}</strong></div>
        <div className="resline"><span>payload</span><strong style={{textAlign:'right'}}>{pay}</strong></div>
        <div className="resline"><span>fires</span><strong>{node.fireCount||0}</strong></div>
      </>);
    }
    if(node.type==='market'){
      return (<>
        <div className="resline"><span>pair</span><strong>{node.resourceA}↔{node.resourceB}</strong></div>
        <div className="resline"><span>rate</span><strong>{(node.lastRate||node.baseRate).toFixed(3)}</strong></div>
        <div className="resline"><span>reserves</span><strong>{Math.round(node.reserveA)}/{Math.round(node.reserveB)}</strong></div>
      </>);
    }
    if(node.type==='tombola'){
      const last = Object.entries(node.lastPayout||{}).slice(0,2).map(([k,v])=>`${v} ${k}`).join(', ') || '—';
      return (<>
        <div className="resline"><span>cost</span><strong>{node.cost} {node.triggerResource}</strong></div>
        <div className="resline"><span>pull</span><strong>{node.pullCount}× {node.unique?'unique':'rep'}</strong></div>
        <div className="resline"><span>pulls</span><strong>{node.pulls}</strong></div>
        <div className="resline"><span>last</span><strong>{last}</strong></div>
      </>);
    }
    if(node.type==='offer'){
      const cvr = node.shows>0 ? ((node.conversions/node.shows)*100).toFixed(1)+'%' : '—';
      return (<>
        <div className="resline"><span>price</span><strong>{node.price}</strong></div>
        <div className="resline"><span>shows·conv</span><strong>{node.shows}·{node.conversions}</strong></div>
        <div className="resline"><span>cvr</span><strong>{cvr}</strong></div>
        <div className="resline"><span>revenue</span><strong>{node.revenue}</strong></div>
      </>);
    }
  })();

  const isPulsing = (node.type==='source') || (node.type==='converter' && node.isProcessing) || (node.type==='gate' && node.isOpen) || (node.type==='event' && node.lastFiredStep===simStep) || (node.type==='delay' && (node.queue||[]).length>0) || (node.type==='tombola' && (node.pullsLast||0)>0);

  return (
    <div
      ref={ref}
      className={`node node-${node.type} ${selected?'selected':''} ${node.type==='gate'? (node.isOpen?'gate-open':'gate-closed'):''}`}
      data-node-id={node.id}
      style={{ left: node.x, top: node.y }}
      onMouseDown={(e)=>onMouseDown(e, node.id)}
      onClick={(e)=>{ e.stopPropagation(); onClick(node.id); }}
    >
      <button
        className="node-del"
        title="Delete node"
        onMouseDown={(e)=>{ e.stopPropagation(); }}
        onClick={(e)=>{ e.stopPropagation(); if(window.__orchardDeleteNode) window.__orchardDeleteNode(node.id); }}
      >×</button>
      <div className="head">
        <NodeIcon type={node.type} size={16}/>
        <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{node.name}</span>
        {isPulsing && <span className="pulse" title="active"/>}
      </div>
      <div className="body">{sub}</div>
      <div className="ports">
        {node.type !== 'drain' && node.type !== 'gate' && (
          <div className="port out" onMouseDown={(e)=>{e.stopPropagation(); onPortDown(e, node.id, 'out');}} onMouseUp={(e)=>{e.stopPropagation(); onPortUp(e, node.id, 'out');}} title="Drag to connect"/>
        )}
        {node.type !== 'source' && (
          <div className="port in" onMouseDown={(e)=>{e.stopPropagation(); onPortDown(e, node.id, 'in');}} onMouseUp={(e)=>{e.stopPropagation(); onPortUp(e, node.id, 'in');}} title="Drop to connect"/>
        )}
      </div>
    </div>
  );
});

window.NodeView = NodeView;

// Edge SVG path
function curvePath(x1,y1,x2,y2){
  const dx = Math.max(40, Math.abs(x2-x1) * .4);
  return `M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`;
}
window.curvePath = curvePath;

// Mini sparkline / line chart
function LineChart({ series, height=200 }){
  // series: [{name, color, points: [{x,y}]}]
  if(!series.length || series.every(s => s.points.length===0)) return <div style={{padding:20,fontSize:11,color:'var(--ink-soft)'}}>Run simulation to populate.</div>;
  const padL=34, padR=10, padT=10, padB=22;
  const W=600, H=height;
  let xs=[], ys=[];
  series.forEach(s => s.points.forEach(p => { xs.push(p.x); ys.push(p.y); }));
  const xMin = Math.min(...xs, 0), xMax = Math.max(...xs, 1);
  const yMin = 0, yMax = Math.max(...ys, 1);
  const xScale = x => padL + (x-xMin)/(xMax-xMin || 1) * (W-padL-padR);
  const yScale = y => H - padB - (y-yMin)/(yMax-yMin || 1) * (H-padT-padB);

  const yTicks = 4;
  const xTicks = Math.min(8, Math.max(2, Math.floor(xMax-xMin)));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {/* grid */}
        {Array.from({length: yTicks+1}).map((_,i)=>{
          const y = padT + (i/yTicks)*(H-padT-padB);
          const v = yMax - (i/yTicks)*(yMax-yMin);
          return (<g key={i}>
            <line x1={padL} y1={y} x2={W-padR} y2={y} stroke="var(--line)" strokeDasharray="2 3" opacity=".5"/>
            <text x={padL-4} y={y+3} fontSize="9" textAnchor="end" fill="var(--ink-soft)" fontFamily="var(--font-mono)">{Math.round(v*10)/10}</text>
          </g>);
        })}
        {Array.from({length: xTicks+1}).map((_,i)=>{
          const x = padL + (i/xTicks)*(W-padL-padR);
          const v = Math.round(xMin + (i/xTicks)*(xMax-xMin));
          return (<g key={i}>
            <text x={x} y={H-6} fontSize="9" textAnchor="middle" fill="var(--ink-soft)" fontFamily="var(--font-mono)">{v}</text>
          </g>);
        })}
        {/* lines */}
        {series.map((s,i)=>{
          if(s.points.length===0) return null;
          const d = s.points.map((p,idx)=>`${idx===0?'M':'L'}${xScale(p.x)},${yScale(p.y)}`).join(' ');
          return <g key={i}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
            {s.points.length<30 && s.points.map((p,idx)=>(
              <circle key={idx} cx={xScale(p.x)} cy={yScale(p.y)} r="2.5" fill={s.color}/>
            ))}
          </g>;
        })}
      </svg>
      <div className="chart-legend">
        {series.map((s,i)=>(<span key={i}><span className="swatch" style={{background:s.color}}/>{s.name}</span>))}
      </div>
    </div>
  );
}
window.LineChart = LineChart;
