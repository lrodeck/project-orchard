// A/B Test mode — variant overrides on the current diagram
const { useState, useEffect, useMemo } = React;

function cloneDiagAB(d){
  const s = JSON.stringify(d, (k,v)=>v===Infinity?'__inf__':v);
  const out = JSON.parse(s, (k,v)=>v==='__inf__'?Infinity:v);
  for(const id in out.nodes){
    const n = out.nodes[id];
    if(n.type==='converter'){ n.isProcessing=false; n.cycleProgress=0; n.batchInputs={}; n.outputBuffer={}; }
    if(n.type==='gate') n.isOpen=false;
    if(n.type==='drain') n.consumedLast=0;
    if(n.type==='booster'){ n.active=true; n.remaining = n.duration; }
    if(n.type==='splitter') n.buffer = {};
    if(n.type==='delay') n.queue = [];
    if(n.type==='event') n.firedCount = 0;
    if(n.type==='offer'){ n.lastFiredStep = -999; n.firedCount = 0; n.shows=0; n.conversions=0; n.revenue=0; }
    if(n.type==='market') n.priceHist = [];
    if(n.type==='tombola'){ n.pulls=0; n.pullsLast=0; n.lastPayout={}; n.prizeCounts={}; }
    if(n.type==='source') n.producedLast=0;
  }
  out.currentStep = 0;
  return out;
}

// Tunable knobs per node type — these are what variants can override
const TUNABLES = {
  source: [{key:'rate', label:'Rate', step:0.1, min:0}],
  drain: [{key:'demand', label:'Demand', step:1, min:0}],
  converter: [{key:'cycleTime', label:'Cycle time', step:1, min:1}],
  gate: [{key:'threshold', label:'Threshold', step:1, min:0}],
  booster: [{key:'amount', label:'Amount', step:0.1, min:0},{key:'duration', label:'Duration', step:1, min:1}],
  delay: [{key:'delay', label:'Delay', step:1, min:1}],
  event: [{key:'period', label:'Period', step:1, min:1}],
  market: [{key:'baseRate', label:'Base rate', step:0.001, min:0},{key:'elasticity', label:'Elasticity', step:0.05, min:0, max:1}],
  offer: [
    {key:'triggerThreshold', label:'Trigger ≥', step:1, min:0},
    {key:'cooldown', label:'Cooldown', step:1, min:0},
    {key:'conversionRate', label:'Conv rate', step:0.01, min:0, max:1},
    {key:'price', label:'Price', step:1, min:0},
  ],
  tombola: [
    {key:'cost', label:'Cost', step:1, min:0},
    {key:'pullCount', label:'Pulls', step:1, min:1},
    {key:'maxPullsPerStep', label:'Max/step', step:1, min:0},
  ],
};

function applyOverrides(diag, overrides){
  for(const nid in overrides){
    const n = diag.nodes[nid]; if(!n) continue;
    const ov = overrides[nid];
    for(const k in ov){
      if(ov[k] === undefined || ov[k] === '') continue;
      n[k] = ov[k];
    }
  }
  return diag;
}

function runSimAB(diag, overrides, steps){
  const d = applyOverrides(cloneDiagAB(diag), overrides);
  const hist = [];
  for(let i=0;i<steps;i++){
    const { analytics } = RFSim.step(d);
    hist.push({ step: d.currentStep, total_production: analytics.total_production||{}, pool_levels: analytics.pool_levels||{} });
  }
  return { final:d, hist };
}

function aggregate(runs){
  if(!runs.length) return { mean:[] };
  const N = runs.length, T = runs[0].hist.length;
  const mean = [];
  for(let t=0;t<T;t++){
    const stepObj = { step: runs[0].hist[t].step, total_production:{}, pool_levels:{} };
    const allRes = new Set();
    runs.forEach(r => Object.keys(r.hist[t].total_production||{}).forEach(k=>allRes.add(k)));
    for(const r of allRes){
      let s=0; for(const run of runs) s += (run.hist[t].total_production?.[r]||0);
      stepObj.total_production[r] = s/N;
    }
    const allPools = new Set();
    runs.forEach(r => Object.keys(r.hist[t].pool_levels||{}).forEach(k=>allPools.add(k)));
    for(const pid of allPools){
      stepObj.pool_levels[pid] = {};
      const resInPool = new Set();
      runs.forEach(r => Object.keys(r.hist[t].pool_levels?.[pid]||{}).forEach(k=>resInPool.add(k)));
      for(const r of resInPool){
        let s=0; for(const run of runs) s += (run.hist[t].pool_levels?.[pid]?.[r]||0);
        stepObj.pool_levels[pid][r] = s/N;
      }
    }
    mean.push(stepObj);
  }
  return { mean };
}

function ABMiniChart({ seriesA, seriesB, label, color }){
  const w = 360, h = 90, pad = 18;
  const all = [...seriesA, ...seriesB];
  if(!all.length) return null;
  const maxX = Math.max(...all.map(p=>p.step), 1);
  const maxY = Math.max(...all.map(p=>p.value), 1);
  const sx = step => pad + (step/maxX) * (w-pad*2);
  const sy = v => h - pad - (v/maxY) * (h-pad*2);
  const path = arr => arr.length ? arr.map((p,i)=>`${i?'L':'M'}${sx(p.step).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ') : '';
  return (
    <div className="ab-mini">
      <div className="ab-mini-label"><span>{label}</span><span className="ab-mini-max">peak {maxY.toFixed(1)}</span></div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{display:'block'}}>
        <line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} stroke="var(--line)"/>
        <path d={path(seriesA)} stroke={color.a} fill="none" strokeWidth="2"/>
        <path d={path(seriesB)} stroke={color.b} fill="none" strokeWidth="2" strokeDasharray="4 3"/>
      </svg>
    </div>
  );
}

function VariantOverrideEditor({ variant, diagram, overrides, setOverrides, color }){
  // Pick which nodes to expose
  const tunableNodes = Object.values(diagram.nodes||{}).filter(n => TUNABLES[n.type]);
  if(!tunableNodes.length) return <div className="ab-empty" style={{padding:8,fontSize:11}}>No tunable nodes in current diagram.</div>;
  function setVal(nid, key, val){
    setOverrides(prev => ({...prev, [nid]: {...(prev[nid]||{}), [key]: val }}));
  }
  function clearVal(nid, key){
    setOverrides(prev => {
      const next = {...prev}; const node = {...(next[nid]||{})}; delete node[key];
      if(Object.keys(node).length===0) delete next[nid]; else next[nid]=node;
      return next;
    });
  }
  return (
    <div className="ab-overrides">
      <div className="ab-overrides-head" style={{borderColor:color}}>
        <span className="ab-tag" style={{background:color}}>{variant}</span>
        <span className="desc" style={{margin:0,fontSize:10}}>Leave blank to inherit; type a value to override.</span>
      </div>
      <div className="ab-override-list">
        {tunableNodes.map(n => {
          const fields = TUNABLES[n.type];
          const ov = overrides[n.id] || {};
          return (
            <div key={n.id} className="ab-override-node">
              <div className="ab-override-name"><NodeIcon type={n.type} size={12}/><b>{n.name}</b><span className="ab-override-type">{n.type}</span></div>
              <div className="ab-override-fields">
                {fields.map(f => {
                  const inherited = n[f.key];
                  const val = ov[f.key];
                  const isOverridden = val !== undefined && val !== '';
                  return (
                    <div key={f.key} className={`ab-override-field ${isOverridden?'overridden':''}`}>
                      <label>{f.label}</label>
                      <input
                        type="number" step={f.step} min={f.min} max={f.max}
                        placeholder={String(inherited ?? '')}
                        value={val ?? ''}
                        onChange={e => {
                          if(e.target.value === '') clearVal(n.id, f.key);
                          else setVal(n.id, f.key, +e.target.value);
                        }}
                      />
                      {isOverridden && <button className="btn ghost ab-clear" onClick={()=>clearVal(n.id, f.key)} title="Reset to inherited">↺</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.ABTestModal = function ABTestModal({ open, onClose, currentDiagram }){
  const [overridesA, setOverridesA] = useState({});
  const [overridesB, setOverridesB] = useState({});
  const [steps, setSteps] = useState(60);
  const [trials, setTrials] = useState(3);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('A'); // A | B | both

  useEffect(()=>{ if(!open){ setResults(null); } },[open]);

  async function runAB(){
    setBusy(true); setResults(null);
    await new Promise(r=>setTimeout(r,30));
    const runsA=[], runsB=[];
    for(let i=0;i<trials;i++){ runsA.push(runSimAB(currentDiagram, overridesA, steps)); }
    for(let i=0;i<trials;i++){ runsB.push(runSimAB(currentDiagram, overridesB, steps)); }
    const aggA = aggregate(runsA), aggB = aggregate(runsB);
    setResults({ aggA, aggB, steps, trials });
    setBusy(false);
  }

  const compareResources = useMemo(()=>{
    if(!results) return [];
    const set = new Set();
    [...results.aggA.mean, ...results.aggB.mean].forEach(s => Object.keys(s.total_production||{}).forEach(k=>set.add(k)));
    return [...set];
  },[results]);

  const kpis = useMemo(()=>{
    if(!results) return null;
    function summarize(agg){
      const totalByRes = {};
      for(const s of agg.mean) for(const r in s.total_production) totalByRes[r] = (totalByRes[r]||0) + s.total_production[r];
      return { totalByRes };
    }
    return { A: summarize(results.aggA), B: summarize(results.aggB) };
  },[results]);

  const colorAB = { a: 'var(--moss)', b: 'var(--terracotta)' };
  const overrideCount = (o) => Object.values(o).reduce((s,n)=>s+Object.keys(n).length,0);

  if(!open) return null;

  return (
    <div className="modal-bg" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal ab-modal">
        <div className="ab-head">
          <div>
            <h3>A/B Test — Variant Overrides</h3>
            <div className="desc" style={{margin:0}}>Compare your current diagram against tweaked versions of itself. Leave a field blank to inherit; fill it to override.</div>
          </div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="ab-config">
          <div className="ab-pick">
            <label>Steps</label>
            <input type="number" min="5" max="500" value={steps} onChange={e=>setSteps(+e.target.value||60)}/>
          </div>
          <div className="ab-pick">
            <label>Trials</label>
            <input type="number" min="1" max="20" value={trials} onChange={e=>setTrials(+e.target.value||1)}/>
          </div>
          <button className="btn primary" onClick={runAB} disabled={busy}>{busy ? 'Running…' : 'Run A/B'}</button>
        </div>

        <div className="ab-tabs-row">
          <div className="ab-tabs">
            <button className={`ab-tab ${activeTab==='A'?'active':''}`} onClick={()=>setActiveTab('A')}>
              <span className="ab-dot" style={{background:colorAB.a}}/>A — Control <span className="ab-count">{overrideCount(overridesA)} override{overrideCount(overridesA)===1?'':'s'}</span>
            </button>
            <button className={`ab-tab ${activeTab==='B'?'active':''}`} onClick={()=>setActiveTab('B')}>
              <span className="ab-dot" style={{background:colorAB.b}}/>B — Variant <span className="ab-count">{overrideCount(overridesB)} override{overrideCount(overridesB)===1?'':'s'}</span>
            </button>
          </div>
        </div>

        <div className="ab-body">
          {activeTab==='A' && (
            <VariantOverrideEditor variant="A — Control" diagram={currentDiagram} overrides={overridesA} setOverrides={setOverridesA} color={colorAB.a}/>
          )}
          {activeTab==='B' && (
            <VariantOverrideEditor variant="B — Variant" diagram={currentDiagram} overrides={overridesB} setOverrides={setOverridesB} color={colorAB.b}/>
          )}
        </div>

        {!results && !busy && (
          <div className="ab-empty">Override a few values on B (or both), then run. Use trials &gt;1 to average noise from events, offers, and tombolas.</div>
        )}
        {busy && <div className="ab-empty">Simulating {steps} steps × {trials} trials per variant…</div>}

        {results && (
          <div className="ab-results">
            <div className="ab-legend">
              <span><span className="dot" style={{background:colorAB.a}}></span>Control (A) · {overrideCount(overridesA)} overrides</span>
              <span><span className="dot dashed" style={{borderColor:colorAB.b}}></span>Variant (B) · {overrideCount(overridesB)} overrides</span>
              <span className="ab-meta">{results.steps} steps · {results.trials} trial{results.trials>1?'s':''}</span>
            </div>

            <div className="ab-kpi-grid">
              <div className="ab-kpi-row ab-kpi-head">
                <div>Resource</div><div>A total</div><div>B total</div><div>Δ</div><div>Winner</div>
              </div>
              {compareResources.map(r=>{
                const a = kpis.A.totalByRes[r]||0;
                const b = kpis.B.totalByRes[r]||0;
                const delta = b - a;
                const pct = a===0 ? (b===0?0:100) : (delta/a)*100;
                const winner = Math.abs(delta) < 0.001 ? '—' : (delta>0?'B':'A');
                return (
                  <div key={r} className="ab-kpi-row">
                    <div className="res">{r}</div>
                    <div>{a.toFixed(1)}</div>
                    <div>{b.toFixed(1)}</div>
                    <div className={delta>0?'pos':delta<0?'neg':''}>{delta>0?'+':''}{delta.toFixed(1)} ({pct>0?'+':''}{pct.toFixed(0)}%)</div>
                    <div className={`win-${winner.toLowerCase()}`}>{winner}</div>
                  </div>
                );
              })}
              {compareResources.length===0 && <div className="ab-empty" style={{padding:8}}>No production recorded.</div>}
            </div>

            <div className="ab-charts">
              {compareResources.map(r => {
                const seriesA = results.aggA.mean.map(s => ({step:s.step, value:s.total_production[r]||0}));
                const seriesB = results.aggB.mean.map(s => ({step:s.step, value:s.total_production[r]||0}));
                return <ABMiniChart key={r} label={`${r} produced / step`} seriesA={seriesA} seriesB={seriesB} color={colorAB}/>;
              })}
            </div>

            <div className="ab-actions">
              <button className="btn" onClick={()=>{
                const rows = [['step','resource','variant','value']];
                for(const s of results.aggA.mean) for(const r in s.total_production) rows.push([s.step,r,'A',s.total_production[r]]);
                for(const s of results.aggB.mean) for(const r in s.total_production) rows.push([s.step,r,'B',s.total_production[r]]);
                const csv = rows.map(r=>r.join(',')).join('\n');
                const blob = new Blob([csv],{type:'text/csv'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href=url; a.download='ab_test.csv'; a.click();
                URL.revokeObjectURL(url);
              }}>Export CSV</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
