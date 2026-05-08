// Reverse Solver — given a target metric value, find the parameter value that hits it.
// Uses bracketing + bisection on monotone metrics; surfaces the tradeoff curve so the user
// can see what it tried.
const { useState: useSolveState, useMemo: useSolveMemo } = React;

// Tunable knobs per node type — shared by Solver and Tornado (was in sweep.jsx before its removal)
const SWEEP_TUNABLES = {
  source: [{key:'__outEdgeLabel', label:'Output rate (edge)', isEdge:true, edgeFilter:'out'}],
  drain: [{key:'demand', label:'Demand'}],
  converter: [{key:'cycleTime', label:'Cycle time'}],
  gate: [{key:'threshold', label:'Threshold'}],
  booster: [{key:'amount', label:'Amount'},{key:'duration', label:'Duration'}],
  delay: [{key:'delay', label:'Delay'}],
  event: [{key:'period', label:'Period'},{key:'offset', label:'Offset'}],
  market: [{key:'baseRate', label:'Base rate'},{key:'elasticity', label:'Elasticity'}],
  offer: [
    {key:'triggerThreshold', label:'Trigger ≥'},
    {key:'cooldown', label:'Cooldown'},
    {key:'conversionRate', label:'Conversion rate'},
    {key:'price', label:'Price'},
  ],
  tombola: [
    {key:'cost', label:'Cost / pull'},
    {key:'pullCount', label:'Prizes / pull'},
    {key:'maxPullsPerStep', label:'Max pulls / step'},
  ],
};
window.SWEEP_TUNABLES = SWEEP_TUNABLES;

function cloneForSolve(d){
  return {
    name: d.name,
    nodes: JSON.parse(JSON.stringify(d.nodes)),
    edges: JSON.parse(JSON.stringify(d.edges)),
    resources: [...d.resources],
    currentStep: 0,
  };
}

function applyParamSolve(d, nodeId, paramKey, value){
  const node = d.nodes[nodeId];
  if(!node) return;
  if(paramKey === '__outEdgeLabel'){
    for(const e of d.edges){
      if(e.from === nodeId && e.kind!=='signal' && e.resource===node.produces){
        e.label = String(value);
      }
    }
    node.rate = value;
  } else {
    node[paramKey] = value;
  }
}

function evalMetric(d, simSteps, metric, metricTarget){
  // reset goals/offers/tombolas
  for(const id in d.nodes){
    const n = d.nodes[id];
    if(n.type==='goal'){ n.passing=false; n.passCount=0; n.failCount=0; n.firstPassStep=-1; n.lastEvalStep=-1; }
    if(n.type==='offer'){ n.shows=0; n.conversions=0; n.lastShown=-9999; }
    if(n.type==='tombola'){ n.totalPulls=0; n.lastPayout={}; n.history=[]; }
  }
  const prodTotals = {};
  let goalsAllPassedStep = null;
  const cap = Math.min(2000, Math.max(1, simSteps));
  for(let i=0;i<cap;i++){
    let analytics;
    try {
      const r = RFSim.step(d);
      analytics = r.analytics;
    } catch(e){ break; }
    for(const r in (analytics?.total_production||{})) prodTotals[r] = (prodTotals[r]||0) + analytics.total_production[r];
    if(goalsAllPassedStep === null){
      const allGoals = Object.values(d.nodes).filter(n=>n.type==='goal');
      if(allGoals.length && allGoals.every(g=>g.firstPassStep>=0)){
        goalsAllPassedStep = Math.max(...allGoals.map(g=>g.firstPassStep));
      }
    }
  }
  // Compute metric
  if(metric==='goalPassStep'){
    if(metricTarget==='__all') return goalsAllPassedStep;
    const g = d.nodes[metricTarget];
    return g && g.firstPassStep>=0 ? g.firstPassStep : null;
  }
  if(metric==='poolFinal'){
    const p = d.nodes[metricTarget];
    if(p && p.type==='pool'){
      let s=0; for(const r in (p.resources||{})) s += p.resources[r];
      return s;
    }
    return null;
  }
  if(metric==='totalProd'){
    return prodTotals[metricTarget] || 0;
  }
  if(metric==='offerCvr'){
    const o = d.nodes[metricTarget];
    return o && o.shows>0 ? o.conversions/o.shows : 0;
  }
  if(metric==='offerRevenue'){
    const o = d.nodes[metricTarget];
    return o ? (o.conversions||0)*(o.price||0) : 0;
  }
  return null;
}

// Bracket-and-bisect solver. Returns {x, y, history, status}
async function solveBisect(baseDiag, nodeId, paramKey, simSteps, metric, metricTarget, targetY, lo, hi, onProgress){
  const history = [];
  const evalAt = (x) => {
    const d = cloneForSolve(baseDiag);
    applyParamSolve(d, nodeId, paramKey, x);
    const y = evalMetric(d, simSteps, metric, metricTarget);
    history.push({ x, y });
    return y;
  };

  // 1. Sample 7 points across [lo,hi] to understand shape + monotonicity
  const probes = 7;
  const ys = [];
  for(let i=0;i<probes;i++){
    const x = lo + (hi-lo)*(i/(probes-1));
    const y = evalAt(x);
    ys.push({x,y});
    onProgress && onProgress(history.length, history.length + 30);
    await new Promise(r=>setTimeout(r,0));
  }

  // Check if any probe crosses the target
  const valid = ys.filter(p=>p.y!=null);
  if(!valid.length){
    return { x: null, y: null, history, status: 'no_signal', message: 'Metric never returned a value across the range. Goal may never pass — widen range or pick a different metric.' };
  }

  // Find adjacent pair that brackets target
  let bracket = null;
  for(let i=0;i<ys.length-1;i++){
    const a = ys[i], b = ys[i+1];
    if(a.y==null || b.y==null) continue;
    if((a.y - targetY) * (b.y - targetY) <= 0){
      bracket = [a, b];
      break;
    }
  }

  if(!bracket){
    // Target outside achievable range — return closest
    const best = valid.reduce((a,b) => Math.abs(a.y-targetY) < Math.abs(b.y-targetY) ? a : b);
    return {
      x: best.x, y: best.y, history, status: 'out_of_range',
      message: `Target ${targetY} not reachable in [${lo.toFixed(2)}, ${hi.toFixed(2)}]. Closest: ${best.y?.toFixed(2)} at ${best.x.toFixed(2)}. Try widening range.`,
    };
  }

  // 2. Bisect within bracket
  let [a, b] = bracket;
  let iters = 0;
  const maxIters = 25;
  while(iters < maxIters && Math.abs(b.x - a.x) > Math.max(0.0001, (hi-lo)*1e-4)){
    const mx = (a.x + b.x) / 2;
    const my = evalAt(mx);
    if(my == null){
      // Move toward whichever side has signal
      if(a.y!=null && b.y==null) b = {x:mx, y:my};
      else if(a.y==null && b.y!=null) a = {x:mx, y:my};
      else break;
    } else if((a.y - targetY) * (my - targetY) <= 0){
      b = {x:mx, y:my};
    } else {
      a = {x:mx, y:my};
    }
    iters++;
    onProgress && onProgress(history.length, history.length + (maxIters - iters));
    await new Promise(r=>setTimeout(r,0));
  }

  // Pick closer of a, b
  const final = (a.y!=null && Math.abs(a.y - targetY) < Math.abs((b.y??Infinity) - targetY)) ? a : b;
  return {
    x: final.x, y: final.y, history,
    status: Math.abs(final.y - targetY) / Math.max(1, Math.abs(targetY)) < 0.05 ? 'ok' : 'approximate',
    message: null,
  };
}

function SolverModal({ open, onClose, currentDiagram }){
  const [nodeId, setNodeId] = useSolveState('');
  const [paramKey, setParamKey] = useSolveState('');
  const [rangeMin, setRangeMin] = useSolveState(1);
  const [rangeMax, setRangeMax] = useSolveState(20);
  const [simSteps, setSimSteps] = useSolveState(100);
  const [metric, setMetric] = useSolveState('goalPassStep');
  const [metricTarget, setMetricTarget] = useSolveState('');
  const [targetY, setTargetY] = useSolveState(50);
  const [running, setRunning] = useSolveState(false);
  const [progress, setProgress] = useSolveState({ done: 0, total: 0 });
  const [result, setResult] = useSolveState(null);

  const tunableNodes = useSolveMemo(() => {
    if(!currentDiagram) return [];
    return Object.values(currentDiagram.nodes||{}).filter(n => SWEEP_TUNABLES[n.type]);
  }, [currentDiagram]);

  const selectedNode = nodeId && currentDiagram?.nodes[nodeId];
  const paramOptions = selectedNode ? SWEEP_TUNABLES[selectedNode.type] : [];

  React.useEffect(()=>{
    if(!nodeId && tunableNodes.length){
      setNodeId(tunableNodes[0].id);
      setParamKey(SWEEP_TUNABLES[tunableNodes[0].type][0].key);
    }
  }, [tunableNodes, nodeId]);

  React.useEffect(()=>{
    if(selectedNode && paramOptions.length && !paramOptions.find(p=>p.key===paramKey)){
      setParamKey(paramOptions[0].key);
    }
  }, [nodeId]);

  function getCurrentValue(node, key){
    if(!node) return 1;
    if(key === '__outEdgeLabel'){
      const out = (currentDiagram?.edges||[]).find(e=>e.from===node.id && e.kind!=='signal' && e.resource===node.produces);
      return out ? Number(out.label)||1 : (Number(node.rate)||1);
    }
    return Number(node[key]) || 1;
  }

  React.useEffect(()=>{
    if(selectedNode && paramKey){
      const cur = getCurrentValue(selectedNode, paramKey);
      const round = (v) => Math.round(v * 1000) / 1000;
      setRangeMin(round(Math.max(0, cur*0.1)));
      setRangeMax(round(cur*10 || 10));
    }
  }, [nodeId, paramKey]);

  const goals = useSolveMemo(()=>Object.values(currentDiagram?.nodes||{}).filter(n=>n.type==='goal'), [currentDiagram]);
  const pools = useSolveMemo(()=>Object.values(currentDiagram?.nodes||{}).filter(n=>n.type==='pool'), [currentDiagram]);
  const offers = useSolveMemo(()=>Object.values(currentDiagram?.nodes||{}).filter(n=>n.type==='offer'), [currentDiagram]);
  const resources = currentDiagram?.resources || [];

  // Default metric + target whenever scenario changes
  React.useEffect(()=>{
    const validMetrics = [];
    if(goals.length>0) validMetrics.push('goalPassStep');
    if(pools.length>0) validMetrics.push('poolFinal');
    if(resources.length>0) validMetrics.push('totalProd');
    if(offers.length>0) { validMetrics.push('offerCvr'); validMetrics.push('offerRevenue'); }
    if(validMetrics.length && !validMetrics.includes(metric)){
      setMetric(validMetrics[0]);
      return;
    }
    if(metric==='goalPassStep' && goals.length && (!metricTarget || (metricTarget!=='__all' && !goals.find(g=>g.id===metricTarget)))){
      setMetricTarget(goals.length>1 ? '__all' : goals[0].id);
    }
    if(metric==='poolFinal' && pools.length && !pools.find(p=>p.id===metricTarget)){
      setMetricTarget(pools[0].id);
    }
    if(metric==='totalProd' && resources.length && !resources.includes(metricTarget)){
      setMetricTarget(resources[0]);
    }
    if((metric==='offerCvr'||metric==='offerRevenue') && offers.length && !offers.find(o=>o.id===metricTarget)){
      setMetricTarget(offers[0].id);
    }
  }, [metric, goals.length, pools.length, offers.length, resources.length]);

  async function runSolve(){
    if(!selectedNode || !paramKey || !currentDiagram) return;
    setRunning(true); setResult(null); setProgress({done:0, total:30});
    const res = await solveBisect(
      currentDiagram, nodeId, paramKey, simSteps, metric, metricTarget, Number(targetY),
      Number(rangeMin), Number(rangeMax),
      (done, total) => setProgress({done, total})
    );
    setResult(res);
    setRunning(false);
  }

  if(!open) return null;

  const metricLabel = {
    goalPassStep: 'step at which goal passes',
    poolFinal: 'pool final total',
    totalProd: 'cumulative production',
    offerCvr: 'offer conversion rate',
    offerRevenue: 'offer revenue',
  }[metric];

  // chart of probe history
  const W=720, H=300, P=40;
  let xMin=0, xMax=1, yMin=0, yMax=1;
  if(result && result.history.length){
    const xs = result.history.map(p=>p.x);
    const ys = result.history.map(p=>p.y).filter(v=>v!=null);
    xMin = Math.min(...xs); xMax = Math.max(...xs);
    if(ys.length){
      yMin = Math.min(...ys, Number(targetY));
      yMax = Math.max(...ys, Number(targetY));
    }
    if(yMin===yMax){ yMax=yMin+1; }
  }
  const px = v => P + (v-xMin)/Math.max(0.0001,xMax-xMin)*(W-2*P);
  const py = v => v==null ? null : H-P - (v-yMin)/Math.max(0.0001,yMax-yMin)*(H-2*P);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal sweep-modal" onClick={e=>e.stopPropagation()}>
        <div className="help-head">
          <h2 style={{margin:0}}>Reverse Solver</h2>
          <button className="btn ghost" onClick={onClose} style={{padding:'4px 10px'}}>×</button>
        </div>
        <div className="sweep-body">
          <div className="sweep-config">
            <div className="sweep-section">
              <div className="sweep-section-title">1. Pick parameter</div>
              {tunableNodes.length===0 ? <div className="desc">No tunable nodes. Add a Source, Drain, Converter, etc. first.</div> : (<>
                <label className="field">Node
                  <select value={nodeId} onChange={e=>setNodeId(e.target.value)}>
                    {tunableNodes.map(n=><option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
                  </select>
                </label>
                <label className="field">Parameter
                  <select value={paramKey} onChange={e=>setParamKey(e.target.value)}>
                    {paramOptions.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </label>
                <div className="row">
                  <label className="field">Min
                    <input type="number" value={rangeMin} onChange={e=>setRangeMin(parseFloat(e.target.value)||0)} step="any"/>
                  </label>
                  <label className="field">Max
                    <input type="number" value={rangeMax} onChange={e=>setRangeMax(parseFloat(e.target.value)||0)} step="any"/>
                  </label>
                </div>
                {selectedNode && <div className="desc" style={{marginTop:6}}>Current value: <b>{getCurrentValue(selectedNode, paramKey)}</b></div>}
              </>)}
            </div>

            <div className="sweep-section">
              <div className="sweep-section-title">2. Pick target metric</div>
              <label className="field">Measure
                <select value={metric} onChange={e=>setMetric(e.target.value)}>
                  {goals.length>0 && <option value="goalPassStep">Goal passes at step</option>}
                  {pools.length>0 && <option value="poolFinal">Pool final total</option>}
                  {resources.length>0 && <option value="totalProd">Cumulative production</option>}
                  {offers.length>0 && <option value="offerCvr">Offer conversion rate</option>}
                  {offers.length>0 && <option value="offerRevenue">Offer revenue</option>}
                </select>
              </label>
              {metric==='goalPassStep' && (
                <label className="field">Goal
                  <select value={metricTarget} onChange={e=>setMetricTarget(e.target.value)}>
                    {goals.length>1 && <option value="__all">All goals (last to pass)</option>}
                    {goals.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
              )}
              {metric==='poolFinal' && (
                <label className="field">Pool
                  <select value={metricTarget} onChange={e=>setMetricTarget(e.target.value)}>
                    {pools.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
              {metric==='totalProd' && (
                <label className="field">Resource
                  <select value={metricTarget} onChange={e=>setMetricTarget(e.target.value)}>
                    {resources.map(r=><option key={r} value={r}>{r.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}</option>)}
                  </select>
                </label>
              )}
              {(metric==='offerCvr'||metric==='offerRevenue') && (
                <label className="field">Offer
                  <select value={metricTarget} onChange={e=>setMetricTarget(e.target.value)}>
                    {offers.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              )}
              <label className="field">Target value
                <input type="number" value={targetY} onChange={e=>setTargetY(parseFloat(e.target.value)||0)} step="any"/>
              </label>
              <label className="field">Sim steps per try
                <input type="number" min="10" max="2000" value={simSteps} onChange={e=>setSimSteps(Math.max(10,Math.min(2000,parseInt(e.target.value)||100)))}/>
              </label>
            </div>

            <div className="sweep-section">
              <button className="btn primary" onClick={runSolve} disabled={running||!selectedNode||!paramKey} style={{width:'100%'}}>
                {running ? `Solving… ${progress.done}/${progress.total}` : 'Solve'}
              </button>
            </div>
          </div>

          <div className="sweep-chart">
            {!result && !running && <div className="sweep-placeholder">Pick a parameter, set a target, hit Solve.<br/>The solver probes the range, then bisects to converge on the target.</div>}
            {running && <div className="sweep-placeholder">Searching… {progress.done} probes</div>}
            {result && result.x!=null && (
              <div className={`solver-result-card status-${result.status}`}>
                <div className="solver-result-head">
                  <span className="solver-result-icon">
                    {result.status==='ok' ? '✓' : result.status==='approximate' ? '~' : '!'}
                  </span>
                  <span className="solver-result-title">
                    {result.status==='ok'
                      ? 'Found a value that hits your target'
                      : result.status==='approximate'
                      ? 'Got close, but couldn’t hit it exactly'
                      : 'Target is outside this range'}
                  </span>
                </div>
                <div className="solver-result-row">
                  <div>
                    <div className="solver-result-label">Set <b>{paramOptions.find(p=>p.key===paramKey)?.label}</b> to</div>
                    <div className="solver-result-value">{result.x.toFixed(3)}</div>
                  </div>
                  <div className="solver-result-arrow">→</div>
                  <div>
                    <div className="solver-result-label">Result · {metricLabel}</div>
                    <div className="solver-result-value">{result.y?.toFixed(2)} <span className="solver-result-target">(target {Number(targetY).toFixed(2)})</span></div>
                  </div>
                </div>
                <div className="solver-result-explain">
                  {result.status==='ok' && 'Within 5% of your target. Click Apply to write this value into the live diagram.'}
                  {result.status==='approximate' && 'The solver couldn’t fully converge — the metric may be flat, noisy, or non-monotone in this range. Try widening the range or picking a different metric.'}
                  {result.status==='out_of_range' && 'The target value can’t be reached anywhere between your Min and Max. The closest point is shown above. Widen the range and try again.'}
                </div>
                {result.status==='ok' && (
                  <button className="btn primary" style={{marginTop:8}} onClick={()=>{
                    window.dispatchEvent(new CustomEvent('orchard.applyParam', { detail: { nodeId, paramKey, value: result.x } }));
                  }}>Apply to diagram</button>
                )}
              </div>
            )}
            {result && result.x==null && (
              <div className="solver-result-card status-fail">
                <div className="solver-result-head">
                  <span className="solver-result-icon">!</span>
                  <span className="solver-result-title">No solution found</span>
                </div>
                <div className="solver-result-explain">{result.message}</div>
              </div>
            )}
            {result && result.history.length>0 && (<>
              <div className="sweep-chart-title">Search trace · target = {Number(targetY).toFixed(2)} {metricLabel}</div>
              <div className="solver-explainer">
                <b>How to read this:</b> each dot is one full simulation run at a different parameter value. Faint dots came first (initial probes across the range); bolder/later dots are bisection — the solver keeps narrowing toward the dashed terracotta target line. The big green dot + green vertical line is the converged solution. Terracotta dots at the floor mean that run produced no value (e.g. goal never passed).
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="sweep-svg">
                <line x1={P} y1={H-P} x2={W-P} y2={H-P} stroke="var(--line)"/>
                <line x1={P} y1={P} x2={P} y2={H-P} stroke="var(--line)"/>
                {[0,0.25,0.5,0.75,1].map(t=>{
                  const v = xMin + (xMax-xMin)*t;
                  return <g key={t}>
                    <line x1={px(v)} y1={H-P} x2={px(v)} y2={H-P+4} stroke="var(--ink-soft)"/>
                    <text x={px(v)} y={H-P+18} textAnchor="middle" fontSize="10" fill="var(--ink-soft)">{v.toFixed(2)}</text>
                  </g>;
                })}
                {[0,0.5,1].map(t=>{
                  const v = yMin + (yMax-yMin)*t;
                  return <g key={t}>
                    <line x1={P-4} y1={py(v)} x2={P} y2={py(v)} stroke="var(--ink-soft)"/>
                    <text x={P-6} y={py(v)+3} textAnchor="end" fontSize="10" fill="var(--ink-soft)">{v.toFixed(0)}</text>
                  </g>;
                })}
                {/* target line */}
                <line x1={P} y1={py(Number(targetY))} x2={W-P} y2={py(Number(targetY))} stroke="var(--terracotta)" strokeDasharray="4 3" opacity="0.7"/>
                <text x={W-P-4} y={py(Number(targetY))-4} textAnchor="end" fontSize="10" fill="var(--terracotta)">target</text>
                {/* probes (numbered) */}
                {result.history.map((p,i)=>{
                  if(p.y==null) return <circle key={i} cx={px(p.x)} cy={H-P-4} r="3" fill="var(--terracotta)" opacity={0.4 + 0.6*i/result.history.length}/>;
                  const isFinal = i===result.history.length-1 && result.x!=null;
                  return <g key={i}>
                    <circle cx={px(p.x)} cy={py(p.y)} r={isFinal?6:3} fill={isFinal?'var(--moss)':'var(--ink-soft)'} opacity={0.3 + 0.7*i/result.history.length} stroke={isFinal?'var(--paper)':'none'} strokeWidth="2"/>
                  </g>;
                })}
                {/* line connecting probes in order they were made */}
                {(()=>{
                  const pts = result.history.filter(p=>p.y!=null).map(p=>`${px(p.x)},${py(p.y)}`).join(' ');
                  return pts ? <polyline points={pts} fill="none" stroke="var(--ink-soft)" strokeWidth="1" opacity="0.3" strokeDasharray="2 2"/> : null;
                })()}
                {/* recommended */}
                {result.x!=null && (
                  <line x1={px(result.x)} y1={P} x2={px(result.x)} y2={H-P} stroke="var(--moss)" strokeDasharray="4 3" opacity="0.6"/>
                )}
                <text x={W/2} y={H-6} textAnchor="middle" fontSize="11" fill="var(--ink-soft)">
                  {selectedNode ? `${selectedNode.name} · ${paramOptions.find(p=>p.key===paramKey)?.label}` : ''}
                </text>
              </svg>
              <div className="sweep-legend">
                <span><span className="sweep-dot" style={{background:'var(--ink-soft)'}}/> probe</span>
                <span><span className="sweep-dot" style={{background:'var(--moss)'}}/> solution</span>
                <span><span className="sweep-dot" style={{background:'var(--terracotta)'}}/> no signal</span>
                <span style={{marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-soft)'}}>
                  {result.history.length} simulation{result.history.length===1?'':'s'} run
                </span>
              </div>
            </>)}
          </div>
        </div>
      </div>
    </div>
  );
}

window.SolverModal = SolverModal;
