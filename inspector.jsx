// Inspector panel for selected node/edge
function Inspector({ diagram, selection, onUpdate, onDelete, onClose }){
  if(!selection) return (
    <div className="section">
      <h3>Inspector</h3>
      <div className="desc">Select a node or edge to edit its properties. Drag from a node's right port to another node's left port to create an edge.</div>
    </div>
  );

  if(selection.kind==='edge'){
    const e = diagram.edges.find(x=>x.id===selection.id);
    if(!e) return null;
    const gates = Object.values(diagram.nodes).filter(n=>n.type==='gate');
    return (
      <div className="section inspector">
        <h3>Edge <button className="btn ghost" style={{padding:'2px 6px'}} onClick={onClose}>×</button></h3>
        <div className="desc">{diagram.nodes[e.from]?.name} → {diagram.nodes[e.to]?.name}</div>
        <label className="field">Edge kind
          <select value={e.kind||'flow'} onChange={ev=>onUpdate({kind:ev.target.value})}>
            <option value="flow">Flow (resource)</option>
            <option value="signal">Signal (controls boosters/gates)</option>
          </select>
        </label>
        <label className="field">Resource
          <select value={e.resource} onChange={ev=>onUpdate({resource:ev.target.value})}>
            {diagram.resources.map(r=><option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="field">{e.kind==='signal'?'Signal value':'Flow label'} (e.g. "5", "2d6", "3+1")
          <input type="text" value={e.label} onChange={ev=>onUpdate({label:ev.target.value})}/>
        </label>
        <div className="row">
          <label className="field">Share (ratio)
            <input type="number" min="0" step="0.1" value={e.share ?? 1} onChange={ev=>onUpdate({share:Math.max(0,parseFloat(ev.target.value)||0)})}/>
          </label>
          <label className="field">Priority
            <input type="number" value={e.priority ?? 0} onChange={ev=>onUpdate({priority:parseInt(ev.target.value)||0})}/>
          </label>
        </div>
        <label className="field" style={{flexDirection:'row',alignItems:'center',gap:6}}>
          <input type="checkbox" style={{width:'auto'}} checked={e.conditional} onChange={ev=>onUpdate({conditional:ev.target.checked})}/>
          Conditional (gated)
        </label>
        {e.conditional && (
          <label className="field">Controlled by Gate
            <select value={e.gateId||''} onChange={ev=>onUpdate({gateId:ev.target.value||null})}>
              <option value="">— none —</option>
              {gates.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
        <button className="btn warn" onClick={onDelete}><Icon.Trash/>Delete edge</button>
      </div>
    );
  }

  const n = diagram.nodes[selection.id];
  if(!n) return null;
  const pools = Object.values(diagram.nodes).filter(x=>x.type==='pool');
  const targetable = Object.values(diagram.nodes).filter(x=>x.type==='source'||x.type==='converter');
  const gates = Object.values(diagram.nodes).filter(x=>x.type==='gate');

  return (
    <div className="section inspector">
      <h3><span style={{display:'flex',alignItems:'center',gap:8}}><NodeIcon type={n.type} size={16}/>{n.type}</span><button className="btn ghost" style={{padding:'2px 6px'}} onClick={onClose}>×</button></h3>
      <label className="field">Name<input type="text" value={n.name} onChange={ev=>onUpdate({name:ev.target.value})}/></label>

      {n.type==='source' && (<>
        <label className="field">Produces
          <select value={n.produces} onChange={ev=>onUpdate({produces:ev.target.value})}>
            {diagram.resources.map(r=><option key={r}>{r}</option>)}
          </select>
        </label>
        <div className="desc">Outflow rate is set on each outgoing edge.</div>
      </>)}

      {n.type==='pool' && (<>
        <label className="field">Capacity (or "inf")
          <input type="text" value={n.capacity===Infinity?'inf':String(n.capacity)} onChange={ev=>{
            const v = ev.target.value.toLowerCase();
            onUpdate({capacity: v==='inf'||v===''?Infinity:Math.max(0, parseInt(v)||0)});
          }}/>
        </label>
        <div className="field" style={{textTransform:'none',color:'var(--ink)',fontWeight:600}}>Resources</div>
        {Object.entries(n.resources||{}).map(([k,v])=>(
          <div key={k} className="recipe-row">
            <span style={{fontFamily:'var(--font-mono)',fontSize:12}}>{k}</span>
            <input type="number" value={v} onChange={ev=>{
              const r = {...n.resources}; r[k] = parseInt(ev.target.value)||0;
              if(r[k]<=0) delete r[k];
              onUpdate({resources:r});
            }}/>
            <button className="btn ghost" onClick={()=>{ const r={...n.resources}; delete r[k]; onUpdate({resources:r}); }}>×</button>
          </div>
        ))}
        <AddResourceRow resources={diagram.resources} existing={Object.keys(n.resources||{})} onAdd={(r,v)=>{
          const rr = {...n.resources, [r]: v};
          onUpdate({resources:rr});
        }}/>
      </>)}

      {n.type==='drain' && (<>
        <label className="field">Consumes
          <select value={n.consumes} onChange={ev=>onUpdate({consumes:ev.target.value})}>
            {diagram.resources.map(r=><option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="field">Demand per step
          <input type="number" min="0" value={n.demand} onChange={ev=>onUpdate({demand:Math.max(0,parseInt(ev.target.value)||0)})}/>
        </label>
      </>)}

      {n.type==='converter' && (<>
        <label className="field">Cycle time (steps)
          <input type="number" min="1" value={n.cycleTime} onChange={ev=>onUpdate({cycleTime:Math.max(1,parseInt(ev.target.value)||1)})}/>
        </label>
        <RecipeEditor label="Input recipe" recipe={n.inputRecipe} resources={diagram.resources} onChange={r=>onUpdate({inputRecipe:r})}/>
        <RecipeEditor label="Output products" recipe={n.outputProducts} resources={diagram.resources} onChange={r=>onUpdate({outputProducts:r})}/>
      </>)}

      {n.type==='gate' && (<>
        <label className="field">Condition pool
          <select value={n.condPoolId||''} onChange={ev=>onUpdate({condPoolId:ev.target.value||null})}>
            <option value="">— none —</option>
            {pools.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field">Resource
          <select value={n.condResource||''} onChange={ev=>onUpdate({condResource:ev.target.value||null})}>
            <option value="">— none —</option>
            {diagram.resources.map(r=><option key={r}>{r}</option>)}
          </select>
        </label>
        <div className="row">
          <label className="field">Operator
            <select value={n.op} onChange={ev=>onUpdate({op:ev.target.value})}>
              {['>=','<=','==','>','<','!='].map(o=><option key={o}>{o}</option>)}
            </select>
          </label>
          <label className="field">Threshold
            <input type="number" value={n.threshold} onChange={ev=>onUpdate({threshold:parseInt(ev.target.value)||0})}/>
          </label>
        </div>
      </>)}

      {n.type==='booster' && (<>
        <label className="field">Target node
          <select value={n.targetId||''} onChange={ev=>onUpdate({targetId:ev.target.value||null})}>
            <option value="">— none —</option>
            {targetable.map(t=><option key={t.id} value={t.id}>{t.name} ({t.type})</option>)}
          </select>
        </label>
        <label className="field">Boost type
          <select value={n.boostType} onChange={ev=>onUpdate({boostType:ev.target.value})}>
            <option value="multiplicative">Multiplicative (×)</option>
            <option value="additive">Additive (+)</option>
          </select>
        </label>
        <label className="field">Amount
          <input type="number" step="0.1" value={n.amount} onChange={ev=>onUpdate({amount:parseFloat(ev.target.value)||0})}/>
        </label>
        <div className="desc">Tip: connect a Signal edge to override Amount each step.</div>
        <label className="field">Duration (steps or "inf")
          <input type="text" value={n.duration===Infinity?'inf':String(n.duration)} onChange={ev=>{
            const v=ev.target.value.toLowerCase();
            const dur = v==='inf'||v===''?Infinity:Math.max(1,parseInt(v)||1);
            onUpdate({duration:dur, remaining:dur, active:true});
          }}/>
        </label>
      </>)}

      {n.type==='splitter' && (<>
        <label className="field">Mode
          <select value={n.mode} onChange={ev=>onUpdate({mode:ev.target.value})}>
            <option value="ratio">Ratio (split by share)</option>
            <option value="priority">Priority (fill in order)</option>
          </select>
        </label>
        <div className="desc">Set each outgoing edge's <b>share</b> (ratio mode) or <b>priority</b> (priority mode) in the edge inspector.</div>
      </>)}

      {n.type==='delay' && (<>
        <label className="field">Delay (steps)
          <input type="number" min="1" value={n.delay} onChange={ev=>onUpdate({delay:Math.max(1,parseInt(ev.target.value)||1)})}/>
        </label>
        <div className="desc">Resources arriving here emit <b>{n.delay}</b> steps later. Models build queues, research, shipping.</div>
      </>)}

      {n.type==='event' && (<>
        <label className="field">Trigger type
          <select value={n.triggerType} onChange={ev=>onUpdate({triggerType:ev.target.value})}>
            <option value="periodic">Periodic (every N)</option>
            <option value="once">Once at step</option>
            <option value="gate">When gate opens</option>
          </select>
        </label>
        {n.triggerType==='periodic' && (
          <div className="row">
            <label className="field">Every (steps)
              <input type="number" min="1" value={n.period} onChange={ev=>onUpdate({period:Math.max(1,parseInt(ev.target.value)||1)})}/>
            </label>
            <label className="field">Offset
              <input type="number" min="0" value={n.offset} onChange={ev=>onUpdate({offset:Math.max(0,parseInt(ev.target.value)||0)})}/>
            </label>
          </div>
        )}
        {n.triggerType==='once' && (
          <label className="field">Fire at step
            <input type="number" min="0" value={n.offset} onChange={ev=>onUpdate({offset:Math.max(0,parseInt(ev.target.value)||0)})}/>
          </label>
        )}
        {n.triggerType==='gate' && (
          <label className="field">Gate
            <select value={n.gateId||''} onChange={ev=>onUpdate({gateId:ev.target.value||null})}>
              <option value="">— none —</option>
              {gates.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
        <RecipeEditor label="Payload (per fire)" recipe={n.payload} resources={diagram.resources} onChange={r=>onUpdate({payload:r})}/>
      </>)}

      {n.type==='market' && (<>
        <div className="row">
          <label className="field">Resource A
            <select value={n.resourceA} onChange={ev=>onUpdate({resourceA:ev.target.value})}>{diagram.resources.map(r=><option key={r}>{r}</option>)}</select>
          </label>
          <label className="field">Resource B
            <select value={n.resourceB} onChange={ev=>onUpdate({resourceB:ev.target.value})}>{diagram.resources.map(r=><option key={r}>{r}</option>)}</select>
          </label>
        </div>
        <label className="field">Base rate (B per A)
          <input type="number" step="0.001" value={n.baseRate} onChange={ev=>onUpdate({baseRate:parseFloat(ev.target.value)||0})}/>
        </label>
        <label className="field">Elasticity (0–1)
          <input type="number" step="0.05" min="0" max="1" value={n.elasticity} onChange={ev=>onUpdate({elasticity:Math.max(0,Math.min(1,parseFloat(ev.target.value)||0))})}/>
        </label>
        <div className="row">
          <label className="field">Reserve A
            <input type="number" min="0" value={n.reserveA} onChange={ev=>onUpdate({reserveA:Math.max(0,parseFloat(ev.target.value)||0)})}/>
          </label>
          <label className="field">Reserve B
            <input type="number" min="0" value={n.reserveB} onChange={ev=>onUpdate({reserveB:Math.max(0,parseFloat(ev.target.value)||0)})}/>
          </label>
        </div>
        <div className="desc">Connect pools' <b>resourceA</b>/<b>resourceB</b> in (deposits) and out (withdrawals).</div>
      </>)}

      {n.type==='tombola' && (<>
        <label className="field">Trigger resource (cost)
          <select value={n.triggerResource} onChange={ev=>onUpdate({triggerResource:ev.target.value})}>{diagram.resources.map(r=><option key={r}>{r}</option>)}</select>
        </label>
        <div className="row">
          <label className="field">Cost / pull
            <input type="number" min="0" value={n.cost} onChange={ev=>onUpdate({cost:Math.max(0,parseInt(ev.target.value)||0)})}/>
          </label>
          <label className="field">Prizes / pull
            <input type="number" min="1" value={n.pullCount} onChange={ev=>onUpdate({pullCount:Math.max(1,parseInt(ev.target.value)||1)})}/>
          </label>
        </div>
        <div className="row">
          <label className="field" style={{flexDirection:'row',alignItems:'center',gap:6}}>
            <input type="checkbox" style={{width:'auto'}} checked={!!n.unique} onChange={ev=>onUpdate({unique:ev.target.checked})}/>
            Unique per pull
          </label>
          <label className="field">Max pulls / step
            <input type="number" min="0" value={n.maxPullsPerStep} onChange={ev=>onUpdate({maxPullsPerStep:Math.max(0,parseInt(ev.target.value)||0)})}/>
          </label>
        </div>
        <PrizePoolEditor prizes={n.prizes||[]} resources={diagram.resources} prizeCounts={n.prizeCounts||{}} totalPulls={n.pulls||0} onChange={p=>onUpdate({prizes:p})}/>
        <div className="desc">Wire incoming flow edge of <b>{n.triggerResource}</b> from a pool. Wire outgoing flow edges, one per resource a prize can pay out (e.g. gold, gem).</div>
      </>)}

      {n.type==='offer' && (<>
        <label className="field">Trigger resource (in upstream pool)
          <select value={n.triggerResource} onChange={ev=>onUpdate({triggerResource:ev.target.value})}>{diagram.resources.map(r=><option key={r}>{r}</option>)}</select>
        </label>
        <label className="field">Trigger threshold (≥)
          <input type="number" min="0" value={n.triggerThreshold} onChange={ev=>onUpdate({triggerThreshold:Math.max(0,parseInt(ev.target.value)||0)})}/>
        </label>
        <div className="row">
          <label className="field">Cooldown
            <input type="number" min="0" value={n.cooldown} onChange={ev=>onUpdate({cooldown:Math.max(0,parseInt(ev.target.value)||0)})}/>
          </label>
          <label className="field">Conversion rate
            <input type="number" min="0" max="1" step="0.01" value={n.conversionRate} onChange={ev=>onUpdate({conversionRate:Math.max(0,Math.min(1,parseFloat(ev.target.value)||0))})}/>
          </label>
        </div>
        <label className="field">Price (revenue per conversion)
          <input type="number" min="0" value={n.price} onChange={ev=>onUpdate({price:Math.max(0,parseInt(ev.target.value)||0)})}/>
        </label>
        <RecipeEditor label="Reward (per conversion)" recipe={n.reward} resources={diagram.resources} onChange={r=>onUpdate({reward:r})}/>
        <div className="desc">Wire one outgoing edge to a "revenue" pool. Add reward edges for in-game items.</div>
      </>)}

      {n.type==='goal' && (<GoalEditor n={n} diagram={diagram} onUpdate={onUpdate}/>)}

      <div className="divider"/>
      <button className="btn warn" onClick={onDelete}><Icon.Trash/>Delete node</button>
    </div>
  );
}

function AddResourceRow({ resources, existing, onAdd }){
  const avail = resources.filter(r=>!existing.includes(r));
  const [r, setR] = React.useState(avail[0]||'');
  const [v, setV] = React.useState(1);
  React.useEffect(()=>{ if(!avail.includes(r)) setR(avail[0]||''); },[resources, existing]);
  if(avail.length===0) return null;
  return (
    <div className="recipe-row">
      <select value={r} onChange={ev=>setR(ev.target.value)}>{avail.map(x=><option key={x}>{x}</option>)}</select>
      <input type="number" min="1" value={v} onChange={ev=>setV(parseInt(ev.target.value)||1)}/>
      <button className="btn" onClick={()=>{ onAdd(r,v); setV(1); }}>+</button>
    </div>
  );
}

function RecipeEditor({ label, recipe, resources, onChange }){
  return (<>
    <div className="field" style={{textTransform:'none',color:'var(--ink)',fontWeight:600,marginTop:4}}>{label}</div>
    {Object.entries(recipe||{}).map(([k,v])=>(
      <div key={k} className="recipe-row">
        <span style={{fontFamily:'var(--font-mono)',fontSize:12}}>{k}</span>
        <input type="number" min="1" value={v} onChange={ev=>{
          const r = {...recipe}; r[k] = Math.max(1,parseInt(ev.target.value)||1); onChange(r);
        }}/>
        <button className="btn ghost" onClick={()=>{ const r={...recipe}; delete r[k]; onChange(r); }}>×</button>
      </div>
    ))}
    <AddResourceRow resources={resources} existing={Object.keys(recipe||{})} onAdd={(r,v)=>{
      onChange({...recipe, [r]:v});
    }}/>
  </>);
}

function PrizePoolEditor({ prizes, resources, prizeCounts, totalPulls, onChange }){
  const totalWeight = prizes.reduce((a,p)=>a+(+p.weight||0),0) || 1;
  function update(id, patch){ onChange(prizes.map(p => p.id===id ? {...p, ...patch} : p)); }
  function remove(id){ onChange(prizes.filter(p=>p.id!==id)); }
  function add(){
    const id = 'p_'+Math.random().toString(36).slice(2,7);
    onChange([...prizes, { id, resource: resources[0]||'gold', amount:10, weight:10, label:'Prize '+(prizes.length+1) }]);
  }
  return (<>
    <div className="field" style={{textTransform:'none',color:'var(--ink)',fontWeight:600,marginTop:6}}>Prize pool ({prizes.length})</div>
    <div className="prize-head">
      <div>Label</div><div>Resource</div><div>Amt</div><div>Wt</div><div>%</div><div>Hits</div><div></div>
    </div>
    {prizes.map(p=>{
      const pct = ((+p.weight||0)/totalWeight)*100;
      const hits = prizeCounts[p.id]||0;
      const expected = totalPulls>0 ? (totalPulls * pct/100) : 0;
      const hitsTitle = totalPulls>0 ? `actual ${hits}, expected ~${expected.toFixed(1)}` : `${hits} hits`;
      return (
        <div key={p.id} className="prize-card">
          <div className="prize-card-r1">
            <input type="text" value={p.label||''} onChange={ev=>update(p.id,{label:ev.target.value})} placeholder="Label"/>
            <button className="btn ghost prize-del" onClick={()=>remove(p.id)} title="Remove prize">×</button>
          </div>
          <div className="prize-card-r2">
            <select value={p.resource} onChange={ev=>update(p.id,{resource:ev.target.value})}>{resources.map(r=><option key={r}>{r}</option>)}</select>
            <input type="number" min="0" value={p.amount||0} onChange={ev=>update(p.id,{amount:Math.max(0,parseInt(ev.target.value)||0)})} title="Amount"/>
            <input type="number" min="0" step="0.5" value={p.weight||0} onChange={ev=>update(p.id,{weight:Math.max(0,parseFloat(ev.target.value)||0)})} title="Weight"/>
          </div>
          <div className="prize-card-r3">
            <div className="prize-pct-bar"><div style={{width:pct+'%'}}/></div>
            <span className="prize-pct-num">{pct.toFixed(1)}%</span>
            <span className="prize-hits" title={hitsTitle}>{hits} hit{hits===1?'':'s'}</span>
          </div>
        </div>
      );
    })}
    <button className="btn" onClick={add} style={{marginTop:6}}><Icon.Plus/>Add prize</button>
  </>);
}

window.Inspector = Inspector;

// Goal editor — friendly builder + raw formula fallback
function GoalEditor({ n, diagram, onUpdate }){
  const pools = Object.values(diagram.nodes).filter(x => x.type==='pool');
  const resources = diagram.resources || [];
  const cond = n.condition || '';

  // Try to parse a simple `pool.<resource> <op> <number>` shape.
  // If it matches we show the builder; otherwise we drop into raw mode automatically.
  const simpleRe = /^\s*pool\.([a-zA-Z0-9_]+)\s*(>=|<=|>|<|==|!=)\s*([\d.]+)\s*$/;
  const m = cond.match(simpleRe);
  const [rawMode, setRawMode] = React.useState(!!cond && !m);

  const builderResource = m ? m[1] : (resources[0] || '');
  const builderOp = m ? m[2] : '>=';
  const builderValue = m ? m[3] : '100';

  function setBuilder(patch){
    const next = {
      resource: builderResource,
      op: builderOp,
      value: builderValue,
      ...patch,
    };
    onUpdate({ condition: `pool.${next.resource} ${next.op} ${next.value}` });
  }

  return (<>
    <div className="field" style={{textTransform:'none',color:'var(--ink)',fontWeight:600,marginTop:6}}>Goal condition</div>
    {!rawMode ? (<>
      <div className="row">
        <label className="field">Resource
          <select value={builderResource} onChange={ev=>setBuilder({resource:ev.target.value})}>
            {resources.length === 0 && <option value="">(define a resource first)</option>}
            {resources.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="field">Compare
          <select value={builderOp} onChange={ev=>setBuilder({op:ev.target.value})}>
            <option value=">=">≥</option>
            <option value=">">&gt;</option>
            <option value="<=">≤</option>
            <option value="<">&lt;</option>
            <option value="==">=</option>
            <option value="!=">≠</option>
          </select>
        </label>
        <label className="field">Value
          <input type="number" value={builderValue} onChange={ev=>setBuilder({value:ev.target.value})}/>
        </label>
      </div>
      <div className="desc" style={{marginTop:4}}>
        Currently: <code>{cond || `pool.${builderResource} ${builderOp} ${builderValue}`}</code>{' '}
        <button className="btn ghost" style={{padding:'1px 6px',fontSize:10,marginLeft:6}} onClick={()=>setRawMode(true)}>edit as formula</button>
      </div>
    </>) : (<>
      <label className="field">Formula (boolean)
        <textarea
          rows={3}
          value={cond}
          onChange={ev=>onUpdate({condition:ev.target.value})}
          placeholder="pool.gold >= 500 and pool.xp >= 100"
          style={{fontFamily:'var(--font-mono)',fontSize:11,resize:'vertical'}}
        />
      </label>
      <div className="desc">
        Use <code>pool.&lt;resource&gt;</code> for current pool levels, <code>step</code> for tick count.
        Operators: <code>&gt;= &lt;= == !=</code>, combine with <code>and</code> / <code>or</code>.
        <button className="btn ghost" style={{padding:'1px 6px',fontSize:10,marginLeft:6}} onClick={()=>setRawMode(false)}>back to builder</button>
      </div>
    </>)}

    <label className="field">Deadline (optional)
      <input
        type="number" min="0"
        value={n.byStep || ''}
        placeholder="e.g. 100"
        onChange={ev=>{
          const v = ev.target.value === '' ? null : Math.max(0, parseInt(ev.target.value)||0);
          onUpdate({ byStep: v });
        }}
      />
    </label>
    <div className="desc">If set, goal is marked <b>fail</b> if condition still false at this step.</div>

    {n.lastResult && (
      <div className="field" style={{textTransform:'none',marginTop:8}}>
        Status:{' '}
        <b style={{color: n.lastResult==='pass' ? 'var(--moss)' : n.lastResult==='fail' ? 'var(--terracotta)' : 'var(--ink-soft)'}}>
          {n.lastResult}
        </b>
        {n.lastEvalStep != null && <span style={{color:'var(--ink-soft)',marginLeft:6}}>(step {n.lastEvalStep})</span>}
      </div>
    )}
  </>);
}
