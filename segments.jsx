// Player Segments — Monte Carlo across cohorts of stochastic player profiles.
// Each segment has a population %, activity rate (chance source/converter triggers per step),
// spend multiplier (multiplies offer conversionRate), uses booster (boolean), and noise.
//
// Output: weighted aggregate + per-segment p10/p50/p90 distribution bands.

const { useState: useStateSeg, useMemo: useMemoSeg, useEffect: useEffectSeg } = React;

const DEFAULT_SEGMENTS = [
  // sessionsPerDay × sessionMins / minutesPerStep => steps/day; we cap at 1.0 for activity.
  // churnProb: chance per real day (=`stepsPerDay` steps) the player drops out for the rest of the run.
  { id:'casual',  name:'Casual F2P',   color:'#9bb275', popPct:60, sessionsPerDay:1.5, sessionMins:4,  daysBetween:0,  spendMult:0,   usesBooster:false, churnProb:0.04, retentionDays:14, noise:0.15 },
  { id:'engaged', name:'Engaged F2P',  color:'#5e7a3a', popPct:25, sessionsPerDay:4,   sessionMins:8,  daysBetween:0,  spendMult:0,   usesBooster:false, churnProb:0.015,retentionDays:60, noise:0.10 },
  { id:'lapsed',  name:'Lapsed (returning)', color:'#a89a7e', popPct:5, sessionsPerDay:0.5, sessionMins:3, daysBetween:2, spendMult:0,  usesBooster:false, churnProb:0.08, retentionDays:7,  noise:0.20 },
  { id:'minnow',  name:'Minnow',       color:'#d99a2b', popPct:7,  sessionsPerDay:3,   sessionMins:7,  daysBetween:0,  spendMult:1.0, usesBooster:true,  churnProb:0.02, retentionDays:45, noise:0.20 },
  { id:'whale',   name:'Whale',        color:'#c0623a', popPct:3,  sessionsPerDay:6,   sessionMins:12, daysBetween:0,  spendMult:6.0, usesBooster:true,  churnProb:0.005,retentionDays:120,noise:0.25 },
];

// Treat 1 sim step ≈ 5 minutes of player time for derivation. (User can tune via stepsPerDay below.)
const MINUTES_PER_STEP = 5;
const STEPS_PER_DAY = (24*60)/MINUTES_PER_STEP; // 288

function deriveSeg(seg){
  const stepsPlayed = (seg.sessionsPerDay||0) * (seg.sessionMins||0) / MINUTES_PER_STEP;
  const activityRaw = stepsPlayed / STEPS_PER_DAY;
  // Boost low values so casual play still registers in the abstract sim
  const activity = Math.max(0.02, Math.min(1, activityRaw * 60));
  // gap multiplier: every `daysBetween` adds a probability the player sits this step out
  const gapMult = 1 / (1 + (seg.daysBetween||0)*0.5);
  return { activity: activity * gapMult, stepsPerSession: Math.max(1, Math.round((seg.sessionMins||0)/MINUTES_PER_STEP)) };
}

function cloneDiagSeg(d){
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
    if(n.type==='offer'){ n.lastFiredStep = -999; n.firedCount = 0; }
    if(n.type==='tombola'){ n.pulls = 0; n.pullsLast = 0; n.lastPayout = {}; n.prizeCounts = {}; }
  }
  out.currentStep = 0;
  return out;
}

// Apply a segment profile to a clone of the diagram.
// activity: scales source rates and (probabilistically) gates converter cycles.
// spendMult: multiplies offer conversionRate.
// usesBooster: if false, deactivate booster nodes for this segment.
// noise: per-trial uniform jitter ±noise on rates.
function applySegment(diag, seg, rng){
  const j = () => 1 + (rng()*2-1) * (seg.noise||0);
  const { activity } = deriveSeg(seg);
  for(const id in diag.nodes){
    const n = diag.nodes[id];
    if(n.type==='source'){ n.rate = (n.rate||1) * activity * j(); }
    if(n.type==='converter'){
      // Slow cycle time inversely with activity (less active = longer real cycles).
      n.cycleTime = Math.max(1, Math.round((n.cycleTime||1) / Math.max(0.05, activity) * j()));
    }
    if(n.type==='offer'){
      n.conversionRate = (n.conversionRate||0) * (seg.spendMult||0);
    }
    if(n.type==='tombola'){
      // Less active players pull less often
      n.maxPullsPerStep = Math.max(0, Math.round((n.maxPullsPerStep||0) * activity));
    }
    if(n.type==='booster' && !seg.usesBooster){
      n.active = false;
    }
  }
  return diag;
}

function runSegSim(diag, seg, steps, rng){
  const d = applySegment(cloneDiagSeg(diag), seg, rng);
  const totalProd = {};
  const finalPools = {};
  const churnProb = seg.churnProb || 0;
  const retentionSteps = (seg.retentionDays||999) * STEPS_PER_DAY / 24; // soft cap (steps until churn certain)
  let churned = false; let churnedAt = null;
  for(let i=0;i<steps;i++){
    if(churned) break;
    const { analytics } = RFSim.step(d);
    for(const r in analytics.total_production||{}){ totalProd[r] = (totalProd[r]||0) + analytics.total_production[r]; }
    // churn check, evaluated once per sim-day
    if(churnProb>0 && i % Math.round(STEPS_PER_DAY) === 0 && i>0){
      if(rng() < churnProb){ churned = true; churnedAt = i; }
    }
    if(!churned && i >= retentionSteps && rng() < 0.2){ churned = true; churnedAt = i; }
  }
  for(const id in d.nodes){
    const n = d.nodes[id];
    if(n.type==='pool'){
      for(const r in n.resources){ finalPools[r] = (finalPools[r]||0) + n.resources[r]; }
    }
  }
  return { totalProd, finalPools, churned, churnedAt: churnedAt ?? steps };
}

// Simple seeded RNG (mulberry32) so trials are repeatable per session.
function rng32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = seed;
    t = Math.imul(t ^ t>>>15, t | 1);
    t ^= t + Math.imul(t ^ t>>>7, t | 61);
    return ((t ^ t>>>14) >>> 0) / 4294967296;
  };
}

function quantile(arr, q){
  if(!arr.length) return 0;
  const a = [...arr].sort((x,y)=>x-y);
  const i = (a.length-1)*q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  if(lo===hi) return a[lo];
  return a[lo] + (a[hi]-a[lo])*(i-lo);
}

function DistBar({ p10, p50, p90, max, color }){
  if(max<=0) return <div className="dist-bar"><div className="dist-empty"/></div>;
  const pct = v => (v/max)*100;
  return (
    <div className="dist-bar">
      <div className="dist-range" style={{left:pct(p10)+'%', width:Math.max(1,pct(p90)-pct(p10))+'%', background:color, opacity:.25}}/>
      <div className="dist-median" style={{left:pct(p50)+'%', background:color}}/>
    </div>
  );
}

window.SegmentsModal = function SegmentsModal({ open, onClose, currentDiagram }){
  const [segments, setSegments] = useStateSeg(DEFAULT_SEGMENTS);
  const [steps, setSteps] = useStateSeg(60);
  const [trials, setTrials] = useStateSeg(50);
  const [results, setResults] = useStateSeg(null);
  const [busy, setBusy] = useStateSeg(false);
  const [seed, setSeed] = useStateSeg(42);

  useEffectSeg(()=>{ if(!open) setResults(null); },[open]);

  function updateSeg(id, patch){
    setSegments(s => s.map(x => x.id===id ? {...x, ...patch} : x));
  }
  function addSeg(){
    setSegments(s => [...s, { id:'seg_'+Date.now().toString(36), name:'New Segment', color:'#6b3a5c', popPct:5, sessionsPerDay:2, sessionMins:5, daysBetween:0, spendMult:0, usesBooster:false, churnProb:0.03, retentionDays:30, noise:0.15 }]);
  }
  function removeSeg(id){
    setSegments(s => s.filter(x => x.id!==id));
  }
  function normalizePop(){
    const total = segments.reduce((a,b)=>a+(+b.popPct||0),0) || 1;
    setSegments(s => s.map(x => ({...x, popPct: Math.round((+x.popPct/total)*100)})));
  }

  const popTotal = segments.reduce((a,b)=>a+(+b.popPct||0),0);

  async function run(){
    setBusy(true); setResults(null);
    await new Promise(r=>setTimeout(r,30));
    const rng = rng32(seed);
    // Per-segment, per-trial results
    const perSeg = {};
    const allResources = new Set();
    for(const seg of segments){
      const trialsArr = [];
      for(let t=0;t<trials;t++){
        const r = runSegSim(currentDiagram, seg, steps, rng);
        Object.keys(r.totalProd).forEach(k=>allResources.add(k));
        Object.keys(r.finalPools).forEach(k=>allResources.add(k));
        trialsArr.push(r);
      }
      // Aggregate: per resource, an array of totalProd values across trials
      const byRes = {};
      for(const res of allResources){
        byRes[res] = trialsArr.map(t => t.totalProd[res]||0);
      }
      perSeg[seg.id] = { trialsArr, byRes };
    }
    // Weighted aggregate per resource
    const weighted = {};
    const totalPop = segments.reduce((a,b)=>a+(+b.popPct||0),0) || 1;
    for(const res of allResources){
      let mean = 0;
      for(const seg of segments){
        const w = (+seg.popPct||0)/totalPop;
        const arr = perSeg[seg.id].byRes[res]||[];
        const segMean = arr.reduce((a,b)=>a+b,0) / Math.max(1,arr.length);
        mean += w * segMean;
      }
      weighted[res] = mean;
    }
    setResults({ perSeg, allResources:[...allResources], weighted, segments:[...segments], steps, trials });
    setBusy(false);
  }

  // Per-segment quantiles
  const segStats = useMemoSeg(()=>{
    if(!results) return null;
    const out = {};
    for(const seg of results.segments){
      out[seg.id] = {};
      for(const res of results.allResources){
        const arr = results.perSeg[seg.id].byRes[res]||[];
        out[seg.id][res] = {
          p10: quantile(arr, 0.1),
          p50: quantile(arr, 0.5),
          p90: quantile(arr, 0.9),
          mean: arr.reduce((a,b)=>a+b,0)/Math.max(1,arr.length),
        };
      }
    }
    return out;
  },[results]);

  const maxPerRes = useMemoSeg(()=>{
    if(!results) return {};
    const m = {};
    for(const res of results.allResources){
      let max = 0;
      for(const seg of results.segments){
        const s = segStats[seg.id][res];
        if(s.p90 > max) max = s.p90;
      }
      m[res] = max;
    }
    return m;
  },[results, segStats]);

  if(!open) return null;

  return (
    <div className="modal-bg" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal seg-modal">
        <div className="ab-head">
          <div>
            <h3>Player Segments — Monte Carlo</h3>
            <div className="desc" style={{margin:0}}>Define cohorts and simulate the same economy across realistic player mixes.</div>
          </div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {/* Segment editor */}
        <div className="seg-editor">
          <div className="seg-head-row seg-head-row-v2">
            <div>Color</div><div>Name</div><div>Pop %</div>
            <div title="Sessions per day">Sess/day</div>
            <div title="Average minutes per session">Min/sess</div>
            <div title="Days off between play (lapsed players)">Gap days</div>
            <div title="Multiplier on offer conversion rates">Spend ×</div>
            <div title="Whether this segment uses booster nodes">Boost</div>
            <div title="Probability of churn per real day">Churn/day</div>
            <div title="Soft retention cap in days">Retain d</div>
            <div title="Per-trial random jitter (±)">Noise</div>
            <div></div>
          </div>
          {segments.map(seg=>{
            const { activity } = deriveSeg(seg);
            return (
            <React.Fragment key={seg.id}>
            <div className="seg-row seg-row-v2">
              <input type="color" value={seg.color} onChange={e=>updateSeg(seg.id,{color:e.target.value})}/>
              <input type="text" value={seg.name} onChange={e=>updateSeg(seg.id,{name:e.target.value})}/>
              <input type="number" min="0" max="100" value={seg.popPct} onChange={e=>updateSeg(seg.id,{popPct:+e.target.value||0})}/>
              <input type="number" step="0.5" min="0" value={seg.sessionsPerDay} onChange={e=>updateSeg(seg.id,{sessionsPerDay:+e.target.value||0})}/>
              <input type="number" step="1" min="0" value={seg.sessionMins} onChange={e=>updateSeg(seg.id,{sessionMins:+e.target.value||0})}/>
              <input type="number" step="0.5" min="0" value={seg.daysBetween||0} onChange={e=>updateSeg(seg.id,{daysBetween:+e.target.value||0})}/>
              <input type="number" step="0.5" min="0" value={seg.spendMult} onChange={e=>updateSeg(seg.id,{spendMult:+e.target.value||0})}/>
              <input type="checkbox" checked={!!seg.usesBooster} onChange={e=>updateSeg(seg.id,{usesBooster:e.target.checked})}/>
              <input type="number" step="0.005" min="0" max="1" value={seg.churnProb||0} onChange={e=>updateSeg(seg.id,{churnProb:+e.target.value||0})}/>
              <input type="number" step="1" min="1" value={seg.retentionDays||30} onChange={e=>updateSeg(seg.id,{retentionDays:+e.target.value||30})}/>
              <input type="number" step="0.05" min="0" max="1" value={seg.noise} onChange={e=>updateSeg(seg.id,{noise:+e.target.value||0})}/>
              <button className="btn ghost" onClick={()=>removeSeg(seg.id)} title="Remove">✕</button>
            </div>
            <div className="seg-derived" title="Derived from sessions × minutes">
              <span className="seg-color-dot" style={{background:seg.color}}/>
              <span><b>{((seg.sessionsPerDay||0)*(seg.sessionMins||0)).toFixed(0)}</b> min/day</span>
              <span>· effective activity <b>{(activity*100).toFixed(0)}%</b></span>
              <span>· session ≈ <b>{Math.max(1,Math.round((seg.sessionMins||0)/MINUTES_PER_STEP))}</b> step{seg.sessionMins>=10?'s':''}</span>
              <span>· est. lifetime <b>{Math.round(1/Math.max(0.001,seg.churnProb||0.001))}</b> day{seg.churnProb<0.5?'s':''}</span>
            </div>
            </React.Fragment>
          );})}
          <div className="seg-tools">
            <button className="btn" onClick={addSeg}>+ Add segment</button>
            <button className="btn" onClick={normalizePop}>Normalize to 100%</button>
            <span className={`pop-total ${Math.abs(popTotal-100)>1?'warn':''}`}>Total population: {popTotal}%</span>
          </div>
        </div>

        {/* Run controls */}
        <div className="ab-config" style={{gridTemplateColumns:'90px 90px 90px auto'}}>
          <div className="ab-pick"><label>Steps</label><input type="number" min="5" max="500" value={steps} onChange={e=>setSteps(+e.target.value||60)}/></div>
          <div className="ab-pick"><label>Trials / seg</label><input type="number" min="5" max="500" value={trials} onChange={e=>setTrials(+e.target.value||50)}/></div>
          <div className="ab-pick"><label>Seed</label><input type="number" value={seed} onChange={e=>setSeed(+e.target.value||0)}/></div>
          <button className="btn primary" onClick={run} disabled={busy || segments.length===0}>{busy?'Running…':'Run Monte Carlo'}</button>
        </div>

        {!results && !busy && <div className="ab-empty">Configure segments above, then run. Each segment runs {trials} trials × {steps} steps with stochastic noise.</div>}
        {busy && <div className="ab-empty">Simulating {segments.length} segments × {trials} trials × {steps} steps…</div>}

        {results && (
          <div className="ab-results">
            {/* Weighted aggregate row */}
            <div className="seg-section-h">Weighted aggregate (by population)</div>
            <div className="seg-kpi-grid">
              {results.allResources.map(res=>(
                <div key={res} className="seg-kpi">
                  <div className="seg-kpi-l">{res}</div>
                  <div className="seg-kpi-v">{results.weighted[res].toFixed(1)}</div>
                  <div className="seg-kpi-d">avg total / player</div>
                </div>
              ))}
            </div>

            {/* Per-segment distributions */}
            <div className="seg-section-h">Per-segment distribution (p10 — p50 — p90)</div>
            <div className="seg-dist-table">
              <div className="seg-dist-head">
                <div>Segment</div>
                {results.allResources.map(r=> <div key={r}>{r}</div>)}
              </div>
              {results.segments.map(seg=>(
                <div key={seg.id} className="seg-dist-row">
                  <div className="seg-name-cell">
                    <span className="seg-color-dot" style={{background:seg.color}}/>
                    <div>
                      <div style={{fontWeight:600}}>{seg.name}</div>
                      <div style={{fontSize:10,color:'var(--ink-soft)'}}>{seg.popPct}% · {seg.sessionsPerDay}/d×{seg.sessionMins}m · ×{seg.spendMult} · {seg.usesBooster?'boost':'no boost'}</div>
                    </div>
                  </div>
                  {results.allResources.map(res=>{
                    const st = segStats[seg.id][res];
                    return (
                      <div key={res} className="seg-dist-cell">
                        <DistBar p10={st.p10} p50={st.p50} p90={st.p90} max={maxPerRes[res]||1} color={seg.color}/>
                        <div className="dist-numbers">
                          <span>{st.p10.toFixed(0)}</span>
                          <span className="b">{st.p50.toFixed(0)}</span>
                          <span>{st.p90.toFixed(0)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Insight: revenue concentration */}
            {results.allResources.includes('revenue') && (() => {
              const totalPop = results.segments.reduce((a,b)=>a+(+b.popPct||0),0)||1;
              const rows = results.segments.map(seg=>{
                const w = (+seg.popPct||0)/totalPop;
                const r = segStats[seg.id]['revenue']?.mean || 0;
                return { seg, weighted: w*r, w };
              });
              const totalRev = rows.reduce((a,b)=>a+b.weighted,0) || 1;
              return (
                <>
                  <div className="seg-section-h">Revenue concentration</div>
                  <div className="rev-bars">
                    {rows.sort((a,b)=>b.weighted-a.weighted).map(({seg,weighted,w})=>(
                      <div key={seg.id} className="rev-row">
                        <div className="rev-label">
                          <span className="seg-color-dot" style={{background:seg.color}}/>
                          {seg.name} <span className="muted">({(w*100).toFixed(0)}% of pop)</span>
                        </div>
                        <div className="rev-track">
                          <div className="rev-fill" style={{width:((weighted/totalRev)*100)+'%', background:seg.color}}/>
                        </div>
                        <div className="rev-pct">{((weighted/totalRev)*100).toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
