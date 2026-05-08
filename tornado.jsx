// Tornado / Sensitivity Ranking — bump every tunable knob ±X%, measure metric delta, sort by impact.
const { useState: useTornState, useMemo: useTornMemo, useEffect: useTornEffect } = React;

function cloneForTorn(d){
  return {
    name: d.name,
    nodes: JSON.parse(JSON.stringify(d.nodes)),
    edges: JSON.parse(JSON.stringify(d.edges)),
    resources: [...d.resources],
    currentStep: 0,
  };
}

function applyParamTorn(d, nodeId, paramKey, value){
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

function evalMetricTorn(d, simSteps, metric, metricTarget){
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
    try { analytics = RFSim.step(d).analytics; } catch(e){ break; }
    for(const r in (analytics?.total_production||{})) prodTotals[r] = (prodTotals[r]||0) + analytics.total_production[r];
    if(goalsAllPassedStep===null){
      const allGoals = Object.values(d.nodes).filter(n=>n.type==='goal');
      if(allGoals.length && allGoals.every(g=>g.firstPassStep>=0)){
        goalsAllPassedStep = Math.max(...allGoals.map(g=>g.firstPassStep));
      }
    }
  }
  if(metric==='goalPassStep'){
    if(metricTarget==='__all') return goalsAllPassedStep ?? cap;
    const g = d.nodes[metricTarget];
    return g && g.firstPassStep>=0 ? g.firstPassStep : cap;
  }
  if(metric==='poolFinal'){
    const p = d.nodes[metricTarget];
    if(p && p.type==='pool'){ let s=0; for(const r in (p.resources||{})) s += p.resources[r]; return s; }
    return 0;
  }
  if(metric==='totalProd') return prodTotals[metricTarget] || 0;
  if(metric==='offerCvr'){ const o = d.nodes[metricTarget]; return o && o.shows>0 ? o.conversions/o.shows : 0; }
  if(metric==='offerRevenue'){ const o = d.nodes[metricTarget]; return o ? (o.conversions||0)*(o.price||0) : 0; }
  return 0;
}

function getCurValTorn(diagram, node, paramKey){
  if(paramKey==='__outEdgeLabel'){
    const out = (diagram.edges||[]).find(e=>e.from===node.id && e.kind!=='signal' && e.resource===node.produces);
    return out ? Number(out.label)||1 : (Number(node.rate)||1);
  }
  return Number(node[paramKey]) || 0;
}

function TornadoModal({ open, onClose, currentDiagram }){
  const [metric, setMetric] = useTornState('goalPassStep');
  const [metricTarget, setMetricTarget] = useTornState('');
  const [bumpPct, setBumpPct] = useTornState(20);
  const [simSteps, setSimSteps] = useTornState(100);
  const [running, setRunning] = useTornState(false);
  const [progress, setProgress] = useTornState({ done: 0, total: 0 });
  const [results, setResults] = useTornState(null);
  const [baseline, setBaseline] = useTornState(null);

  const goals = useTornMemo(()=>Object.values(currentDiagram?.nodes||{}).filter(n=>n.type==='goal'), [currentDiagram]);
  const pools = useTornMemo(()=>Object.values(currentDiagram?.nodes||{}).filter(n=>n.type==='pool'), [currentDiagram]);
  const offers = useTornMemo(()=>Object.values(currentDiagram?.nodes||{}).filter(n=>n.type==='offer'), [currentDiagram]);
  const resources = currentDiagram?.resources || [];

  // Auto-default metric/target — prefer metrics most likely to show signal
  useTornEffect(()=>{
    const valid = [];
    // Order matters: pick first preferred metric that exists.
    // Prefer goalPassStep > totalProd > offerRevenue > poolFinal — pool levels often clamp at equilibrium.
    if(goals.length>0) valid.push('goalPassStep');
    if(resources.length>0) valid.push('totalProd');
    if(offers.length>0){ valid.push('offerRevenue'); valid.push('offerCvr'); }
    if(pools.length>0) valid.push('poolFinal');
    if(valid.length && !valid.includes(metric)){ setMetric(valid[0]); return; }
    if(metric==='goalPassStep' && goals.length && (!metricTarget || (metricTarget!=='__all' && !goals.find(g=>g.id===metricTarget)))){
      setMetricTarget(goals.length>1 ? '__all' : goals[0].id);
    }
    if(metric==='poolFinal' && pools.length && !pools.find(p=>p.id===metricTarget)){ setMetricTarget(pools[0].id); }
    if(metric==='totalProd' && resources.length && !resources.includes(metricTarget)){ setMetricTarget(resources[0]); }
    if((metric==='offerCvr'||metric==='offerRevenue') && offers.length && !offers.find(o=>o.id===metricTarget)){ setMetricTarget(offers[0].id); }
  }, [metric, goals.length, pools.length, offers.length, resources.length]);

  // Discover all tunable knobs in the diagram
  const knobs = useTornMemo(()=>{
    if(!currentDiagram) return [];
    const out = [];
    for(const id in currentDiagram.nodes){
      const n = currentDiagram.nodes[id];
      const params = SWEEP_TUNABLES[n.type];
      if(!params) continue;
      for(const p of params){
        const cur = getCurValTorn(currentDiagram, n, p.key);
        if(cur === 0 && p.key !== '__outEdgeLabel') continue; // skip zero-value knobs (no leverage to test)
        out.push({ nodeId: id, nodeName: n.name, nodeType: n.type, paramKey: p.key, paramLabel: p.label, current: cur });
      }
    }
    return out;
  }, [currentDiagram]);

  async function runTornado(){
    if(!currentDiagram || !knobs.length) return;
    setRunning(true); setResults(null); setBaseline(null);
    setProgress({ done: 0, total: knobs.length*2 + 1 });

    // 1. Baseline
    const baseDiag = cloneForTorn(currentDiagram);
    const base = evalMetricTorn(baseDiag, simSteps, metric, metricTarget);
    setBaseline(base);
    setProgress({ done: 1, total: knobs.length*2 + 1 });
    await new Promise(r=>setTimeout(r,0));

    // 2. For each knob, run +bump and -bump
    const out = [];
    let done = 1;
    const factor = bumpPct/100;
    for(const k of knobs){
      const upVal = k.current * (1+factor) || (1+factor);
      const dnVal = Math.max(0, k.current * (1-factor));

      const dUp = cloneForTorn(currentDiagram);
      applyParamTorn(dUp, k.nodeId, k.paramKey, upVal);
      const yUp = evalMetricTorn(dUp, simSteps, metric, metricTarget);
      done++; setProgress({ done, total: knobs.length*2 + 1 });
      await new Promise(r=>setTimeout(r,0));

      const dDn = cloneForTorn(currentDiagram);
      applyParamTorn(dDn, k.nodeId, k.paramKey, dnVal);
      const yDn = evalMetricTorn(dDn, simSteps, metric, metricTarget);
      done++; setProgress({ done, total: knobs.length*2 + 1 });
      await new Promise(r=>setTimeout(r,0));

      const deltaUp = yUp - base;
      const deltaDn = yDn - base;
      const maxAbs = Math.max(Math.abs(deltaUp), Math.abs(deltaDn));
      out.push({
        ...k, base, upVal, dnVal, yUp, yDn, deltaUp, deltaDn, maxAbs
      });
    }
    out.sort((a,b)=>b.maxAbs - a.maxAbs);
    setResults(out);
    setRunning(false);
  }

  if(!open) return null;

  const metricLabel = {
    goalPassStep: 'goal pass step',
    poolFinal: 'pool final',
    totalProd: 'total production',
    offerCvr: 'offer CVR',
    offerRevenue: 'offer revenue',
  }[metric];

  // Lower is better for goalPassStep (faster pass = better); higher for everything else
  const lowerIsBetter = metric==='goalPassStep';

  // Chart
  const maxAbs = results?.length ? Math.max(...results.map(r=>r.maxAbs)) : 1;
  const W = 720, rowH = 28;
  const labelW = 220;
  const chartW = W - labelW - 30;
  const cx = labelW + chartW/2;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal sweep-modal" onClick={e=>e.stopPropagation()}>
        <div className="help-head">
          <h2 style={{margin:0}}>Sensitivity Tornado</h2>
          <button className="btn ghost" onClick={onClose} style={{padding:'4px 10px'}}>×</button>
        </div>
        <div className="sweep-body">
          <div className="sweep-config">
            <div className="sweep-section">
              <div className="sweep-section-title">1. Pick target metric</div>
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
                    {resources.map(r=><option key={r} value={r}>{r.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
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
            </div>

            <div className="sweep-section">
              <div className="sweep-section-title">2. Probe settings</div>
              <label className="field">Bump %
                <input type="number" min="1" max="200" value={bumpPct} onChange={e=>setBumpPct(Math.max(1,Math.min(200,parseInt(e.target.value)||20)))}/>
              </label>
              <div className="desc" style={{marginTop:-4}}>Each knob is tested at ±{bumpPct}% of its current value.</div>
              <label className="field">Sim steps per probe
                <input type="number" min="10" max="2000" value={simSteps} onChange={e=>setSimSteps(Math.max(10,Math.min(2000,parseInt(e.target.value)||100)))}/>
              </label>
              <div className="desc" style={{marginTop:-4}}>{knobs.length} knobs · {knobs.length*2+1} simulations.</div>
            </div>

            <div className="sweep-section">
              <button className="btn primary" onClick={runTornado} disabled={running||!knobs.length} style={{width:'100%'}}>
                {running ? `Running… ${progress.done}/${progress.total}` : 'Run tornado'}
              </button>
              {!knobs.length && <div className="desc" style={{marginTop:8}}>No tunable knobs in the current diagram.</div>}
            </div>
          </div>

          <div className="sweep-chart">
            {!results && !running && <div className="sweep-placeholder">Tornado ranks every knob by the size of its impact on a single metric.<br/><br/>Each knob gets bumped up and down by the same percent; the bigger the resulting swing in the metric, the higher the bar.<br/><br/>Top bar = the knob worth tuning first.</div>}
            {running && <div className="sweep-placeholder">Probing knobs… {progress.done} / {progress.total}</div>}
            {results && results.length>0 && baseline!=null && (() => {
              const allFlat = results.every(r => Math.abs(r.deltaUp) < 1e-6 && Math.abs(r.deltaDn) < 1e-6);
              if(allFlat){
                // Diagnose specific causes
                const noGoals = metric==='goalPassStep' && goals.length===0;
                const goalNeverPasses = metric==='goalPassStep' && baseline >= simSteps;
                const poolFlat = metric==='poolFinal' && baseline === 0;
                const noOffer = (metric==='offerCvr' || metric==='offerRevenue') && baseline === 0;
                const causes = [];
                if(noGoals){
                  causes.push(<li key="ng"><b>No goals exist</b> — you picked "Goal passes at step" but the diagram has no Goal nodes. Switch the metric (above) to <b>Cumulative production</b> or <b>Pool final total</b>.</li>);
                } else if(goalNeverPasses){
                  causes.push(<li key="gnp"><b>Goal never passes</b> — even the baseline never satisfies the goal in {simSteps} steps. Either raise sim steps, lower the goal threshold, or check that flows actually reach the goal's pool.</li>);
                }
                if(poolFlat){
                  causes.push(<li key="pf"><b>Pool stays at zero</b> — no inflows are reaching <i>{currentDiagram?.nodes?.[metricTarget]?.name || 'this pool'}</i>. Confirm an edge produces into it.</li>);
                }
                if(noOffer){
                  causes.push(<li key="no"><b>Offer never fires</b> — the trigger threshold is never met. Lower it, or feed more resource into the watch pool.</li>);
                }
                // Generic causes (always show if no specific diagnosis)
                if(!causes.length){
                  causes.push(
                    <li key="ss"><b>System hits equilibrium</b> — pool levels clamp because consumption matches production. Try metric <b>Cumulative production</b> instead — it counts every unit ever produced, so bumps always show.</li>,
                    <li key="bs"><b>Bump too small</b> — try 50% or 100%.</li>,
                    <li key="st"><b>Sim too short</b> — try 500 or 1000 steps so downstream effects accumulate.</li>,
                  );
                }
                return (<div className="sweep-placeholder" style={{textAlign:'left',padding:'24px 28px'}}>
                  <div style={{fontSize:15,fontWeight:600,color:'var(--ink)',marginBottom:10}}>No signal — every knob returned the baseline ({baseline.toFixed(2)}).</div>
                  <div style={{fontSize:13,color:'var(--ink-soft)',lineHeight:1.55,marginBottom:14}}>The metric didn't move when any knob was bumped ±{bumpPct}%. Likely cause{causes.length>1?'s':''}:</div>
                  <ul style={{fontSize:13,color:'var(--ink-soft)',lineHeight:1.7,paddingLeft:20,margin:0}}>{causes}</ul>
                </div>);
              }
              return (<>
              <div className="sweep-chart-title">
                Sensitivity to {metricLabel} · baseline = <b>{baseline.toFixed(2)}</b> · ±{bumpPct}%
              </div>
              <div className="solver-explainer" style={{marginBottom:8}}>
                <b>How to read this:</b> each row is one tunable knob. <b>Top bar = +{bumpPct}%, bottom bar = −{bumpPct}%.</b> Bars are sorted by largest absolute swing — the top row is your highest-leverage lever. {lowerIsBetter ? <>For <i>{metricLabel}</i>, <b>lower is better</b> — green = improvement.</> : <>For <i>{metricLabel}</i>, <b>higher is better</b> — green = improvement.</>}
              </div>
              {(() => {
                // Filter out zero-impact knobs from the chart entirely
                const visible = results.filter(r => Math.abs(r.deltaUp) > 1e-6 || Math.abs(r.deltaDn) > 1e-6);
                const hidden = results.length - visible.length;
                if(!visible.length) return null;
                const vMaxAbs = Math.max(...visible.map(r=>r.maxAbs)) || 1;
                const PAD_X = 16; // visual breathing room inside the SVG box
                const vW = 760, vRowH = 32;
                const vLabelW = 250, vValueW = 90;
                const vChartW = vW - vLabelW - vValueW - 20 - PAD_X;
                const vcx = vLabelW + vChartW/2;
                const totalH = visible.length*vRowH + 24;
                return (<>
                  <svg viewBox={`0 0 ${vW} ${totalH}`} className="sweep-svg" style={{maxHeight:'none', width:'100%'}}>
                    {/* center axis */}
                    <line x1={vcx} y1={0} x2={vcx} y2={visible.length*vRowH} stroke="var(--line)"/>
                    <text x={vcx} y={totalH - 6} textAnchor="middle" fontSize="10" fill="var(--ink-soft)">baseline ({baseline.toFixed(2)})</text>
                    {visible.map((r,i)=>{
                      const y = i*vRowH + vRowH/2;
                      const upGood = lowerIsBetter ? r.deltaUp < 0 : r.deltaUp > 0;
                      const dnGood = lowerIsBetter ? r.deltaDn < 0 : r.deltaDn > 0;
                      const upX2 = vcx + (r.deltaUp/vMaxAbs)*vChartW/2;
                      const dnX2 = vcx + (r.deltaDn/vMaxAbs)*vChartW/2;
                      const valueX = vLabelW + vChartW + 8;
                      return (<g key={i}>
                        {/* row hover band */}
                        <rect x={0} y={y-vRowH/2} width={vW} height={vRowH} fill={i%2?'rgba(0,0,0,0.02)':'transparent'}/>
                        {/* knob label — anchored 'start' so long text grows RIGHTWARD into the chart area, never clipping at the SVG's left edge. We truncate so it can't overflow into the bars. */}
                        <text x={PAD_X} y={y+4} textAnchor="start" fontSize="11" fill="var(--ink)" style={{fontFamily:'var(--font-mono)'}}>
                          <tspan>{(r.nodeName.length > 16 ? r.nodeName.slice(0,15)+'…' : r.nodeName)}</tspan>
                          <tspan fill="var(--ink-soft)" dx="6">{r.paramLabel.length > 14 ? r.paramLabel.slice(0,13)+'…' : r.paramLabel}</tspan>
                        </text>
                        {/* up bar */}
                        {Math.abs(r.deltaUp) > 1e-6 && (
                          <rect x={Math.min(vcx, upX2)} y={y - 9} width={Math.max(1.5, Math.abs(upX2 - vcx))} height={8}
                            fill={upGood ? 'var(--moss)' : 'var(--terracotta)'} opacity="0.85" rx="1">
                            <title>{`+${bumpPct}% → ${r.yUp.toFixed(2)} (Δ ${r.deltaUp>=0?'+':''}${r.deltaUp.toFixed(2)})`}</title>
                          </rect>
                        )}
                        {/* down bar */}
                        {Math.abs(r.deltaDn) > 1e-6 && (
                          <rect x={Math.min(vcx, dnX2)} y={y + 2} width={Math.max(1.5, Math.abs(dnX2 - vcx))} height={8}
                            fill={dnGood ? 'var(--moss)' : 'var(--terracotta)'} opacity="0.55" rx="1">
                            <title>{`-${bumpPct}% → ${r.yDn.toFixed(2)} (Δ ${r.deltaDn>=0?'+':''}${r.deltaDn.toFixed(2)})`}</title>
                          </rect>
                        )}
                        {/* values right-aligned in dedicated column — never overlap bars */}
                        <text x={vW - PAD_X} y={y-2} textAnchor="end" fontSize="10" fill="var(--ink-soft)" style={{fontFamily:'var(--font-mono)'}}>
                          ▲ {r.deltaUp>=0?'+':''}{r.deltaUp.toFixed(1)}
                        </text>
                        <text x={vW - PAD_X} y={y+10} textAnchor="end" fontSize="10" fill="var(--ink-soft)" style={{fontFamily:'var(--font-mono)'}}>
                          ▼ {r.deltaDn>=0?'+':''}{r.deltaDn.toFixed(1)}
                        </text>
                      </g>);
                    })}
                  </svg>
                  {hidden>0 && <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:6,fontStyle:'italic'}}>{hidden} knob{hidden>1?'s':''} hidden — they had no effect on this metric.</div>}
                </>);
              })()}
              <div className="sweep-legend">
                <span><span className="sweep-dot" style={{background:'var(--moss)'}}/> better</span>
                <span><span className="sweep-dot" style={{background:'var(--terracotta)'}}/> worse</span>
                <span style={{opacity:0.7}}>▲ = +{bumpPct}%, ▼ = −{bumpPct}%</span>
              </div>
            </>);
            })()}
            {results && results.length===0 && <div className="sweep-placeholder">No knobs produced any change. Try a larger bump %.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

window.TornadoModal = TornadoModal;
