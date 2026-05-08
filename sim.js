// Resource Flow Simulation Engine — port of the Python backend, with extended node/edge types.
(function(global){
  const uid = () => Math.random().toString(36).slice(2,10);

  // Per-step evaluation context (set by step() so resolve() can see step/pool/prod/cons)
  let __ctx = { step: 0, pool: {}, prod: {}, cons: {} };
  function setCtx(c){ __ctx = c; }
  function getCtx(){ return __ctx; }

  // Resolve a numeric param: supports raw numbers, numeric strings, "=formula", and "NdM" dice.
  function R(value, fallback){
    if(value == null || value === '') return fallback;
    if(typeof value === 'number') return value;
    const s = String(value).trim();
    if(s.startsWith('=') && global.OrchardExpr){
      return global.OrchardExpr.resolve(s, __ctx, fallback);
    }
    return rollLabel(s);
  }

  function rollLabel(label){
    if(typeof label === 'number') return label;
    const s = String(label).trim();
    if(s==='') return 0;
    if(/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    if(s.startsWith('=') && global.OrchardExpr){
      return global.OrchardExpr.resolve(s, __ctx, 0);
    }
    const m = s.toLowerCase().match(/^(\d*)d(\d+)$/);
    if(m){
      const nd = m[1] ? parseInt(m[1],10) : 1;
      const ns = parseInt(m[2],10);
      if(nd<=0||ns<=0) return 0;
      let t=0; for(let i=0;i<nd;i++) t += 1+Math.floor(Math.random()*ns);
      return t;
    }
    try{
      if(/^[\d+\-*/().\s]+$/.test(s)) return Math.round(Function('"use strict";return ('+s+')')());
    }catch(e){}
    return 0;
  }

  function makeNode(type, props){
    const base = { id: uid(), type, name: props.name || type, x: props.x ?? 0, y: props.y ?? 0 };
    if(type==='source') return Object.assign(base, { produces: props.produces||'gold', rate: props.rate ?? 1 });
    if(type==='pool') return Object.assign(base, { resources: props.resources||{}, capacity: props.capacity ?? Infinity });
    if(type==='drain') return Object.assign(base, { consumes: props.consumes||'gold', demand: props.demand ?? 1, consumedLast: 0 });
    if(type==='converter') return Object.assign(base, {
      inputRecipe: props.inputRecipe||{}, outputProducts: props.outputProducts||{}, cycleTime: Math.max(1, props.cycleTime||1),
      isProcessing:false, cycleProgress:0, batchInputs:{}, outputBuffer:{}
    });
    if(type==='gate') return Object.assign(base, {
      condPoolId: props.condPoolId||null, condResource: props.condResource||null,
      threshold: props.threshold ?? 1, op: props.op || '>=', isOpen:false
    });
    if(type==='booster') return Object.assign(base, {
      targetId: props.targetId||null, boostType: props.boostType||'multiplicative',
      amount: props.amount ?? 1.5, duration: props.duration ?? Infinity, remaining: props.duration ?? Infinity, active: true,
      signalAmount: null  // last signal-driven amount, if any
    });
    if(type==='splitter') return Object.assign(base, {
      mode: props.mode || 'ratio',  // 'ratio' | 'priority'
      buffer: {} // res -> qty waiting to be distributed
    });
    if(type==='delay') return Object.assign(base, {
      delay: Math.max(1, props.delay ?? 3),
      queue: [] // [{res, amt, remaining}]
    });
    if(type==='event') return Object.assign(base, {
      triggerType: props.triggerType || 'periodic', // 'periodic' | 'once' | 'gate'
      period: props.period ?? 5,
      offset: props.offset ?? 0,
      payload: props.payload || {gold: 100}, // res -> amt
      gateId: props.gateId || null,
      lastFiredStep: -1, fireCount: 0
    });
    if(type==='offer') return Object.assign(base, {
      // Monetization touchpoint: when triggered, attempts conversion. On success,
      // emits 'revenue' (paid currency) and optionally a reward resource.
      triggerResource: props.triggerResource || 'gold',  // resource it watches in upstream pool
      triggerThreshold: props.triggerThreshold ?? 100,   // fires when pool has >= this
      cooldown: props.cooldown ?? 5,                      // steps between offers
      conversionRate: props.conversionRate ?? 0.05,       // 0..1 chance to convert when shown
      price: props.price ?? 100,                          // 'revenue' units emitted on conversion
      reward: props.reward || {},                         // res -> amt given to downstream pools
      shows: 0, conversions: 0, revenue: 0, lastShownStep: -999
    });
    if(type==='tombola') return Object.assign(base, {
      // Mystery box / random reward: when fed `cost` of `triggerResource` from upstream,
      // performs a "pull" that draws `pullCount` prize(s) from a weighted prize pool.
      // unique=true: a prize cannot be drawn twice in the same pull.
      triggerResource: props.triggerResource || 'gem',
      cost: props.cost ?? 10,         // amount consumed per pull
      pullCount: props.pullCount ?? 1, // prizes per pull
      unique: props.unique ?? false,   // unique within a single pull
      maxPullsPerStep: props.maxPullsPerStep ?? 1,
      // prizes: [{id, resource, amount, weight, label}]
      prizes: props.prizes || [
        { id: 'p1', resource:'gold',  amount: 50,  weight: 60, label:'Common'   },
        { id: 'p2', resource:'gold',  amount: 200, weight: 30, label:'Uncommon' },
        { id: 'p3', resource:'gem',   amount: 5,   weight: 9,  label:'Rare'     },
        { id: 'p4', resource:'gem',   amount: 50,  weight: 1,  label:'Jackpot'  },
      ],
      pulls: 0, pullsLast: 0, lastPayout: {}, prizeCounts: {}
    });
    if(type==='market') return Object.assign(base, {
      resourceA: props.resourceA || 'gold',
      resourceB: props.resourceB || 'gem',
      // baseRate = how many B you get per 1 A (before supply elasticity)
      baseRate: props.baseRate ?? 0.01,
      elasticity: props.elasticity ?? 0.5, // 0..1, how much rate moves with supply
      reserveA: props.reserveA ?? 1000,
      reserveB: props.reserveB ?? 100,
      lastRate: props.baseRate ?? 0.01
    });
    return base;
  }

  function makeEdge(fromId, toId, resource, label, conditional, gateId){
    return {
      id: uid(), from: fromId, to: toId,
      resource: resource||'gold',
      label: label||'1',
      conditional: !!conditional, gateId: gateId||null,
      condition: '',    // optional expression like "=pool.gold > 100"
      kind: 'flow',     // 'flow' | 'signal'
      share: 1,         // splitter ratio weight
      priority: 0       // lower = pulled/pushed first
    };
  }

  function isEdgeActive(diagram, e){
    // Gate-driven conditional
    if(e.conditional && e.gateId){
      const g = diagram.nodes[e.gateId];
      if(!(g && g.type==='gate' && g.isOpen)) return false;
    }
    // Expression-driven condition (e.g. "=pool.gold > 100")
    if(e.condition && String(e.condition).trim() !== ''){
      const v = R(e.condition, 1);
      if(!v) return false;
    }
    return true;
  }

  // Read a signal value at a node target: sum of all incoming signal edges' label values
  function signalInto(diagram, targetId){
    let v = 0; let any = false;
    for(const e of diagram.edges){
      if(e.kind==='signal' && e.to===targetId && isEdgeActive(diagram,e)){
        v += rollLabel(e.label); any = true;
      }
    }
    return any ? v : null;
  }

  function applyBoosts(diagram, targetId, resource, base){
    let v = base;
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type==='booster' && n.active && n.targetId===targetId){
        const amt = (n.signalAmount!=null) ? n.signalAmount : n.amount;
        if(n.boostType==='additive') v += amt;
        else v *= amt;
      }
    }
    return Math.round(v);
  }

  function edgeFlow(diagram, e){
    if(e.kind==='signal') return 0;
    const base = rollLabel(e.label);
    const from = diagram.nodes[e.from];
    if(from && from.type==='source' && e.resource===from.produces){
      return applyBoosts(diagram, from.id, e.resource, base);
    }
    return base;
  }

  function poolLoad(p){ let s=0; for(const k in p.resources) s+=p.resources[k]; return s; }
  function poolAdd(p, res, amt){
    if(amt<=0) return 0;
    const cap = p.capacity===Infinity ? Infinity : p.capacity - poolLoad(p);
    const t = Math.min(amt, cap);
    p.resources[res] = (p.resources[res]||0) + t;
    return t;
  }
  function poolRemove(p, res, amt){
    if(amt<=0) return 0;
    const av = p.resources[res]||0;
    const t = Math.min(amt, av);
    p.resources[res] = av - t;
    if(p.resources[res] <= 0) delete p.resources[res];
    return t;
  }

  function checkGate(diagram, g){
    if(!g.condPoolId || !diagram.nodes[g.condPoolId] || !g.condResource){ g.isOpen=false; return false; }
    const p = diagram.nodes[g.condPoolId];
    if(p.type!=='pool'){ g.isOpen=false; return false; }
    const v = p.resources[g.condResource]||0;
    // signal-driven threshold override
    const sigT = signalInto(diagram, g.id);
    const thr = sigT != null ? sigT : g.threshold;
    const ops = {'>=':(a,b)=>a>=b,'<=':(a,b)=>a<=b,'==':(a,b)=>a===b,'>':(a,b)=>a>b,'<':(a,b)=>a<b,'!=':(a,b)=>a!==b};
    g.isOpen = (ops[g.op]||(()=>false))(v, R(thr, 0));
    return g.isOpen;
  }

  // Sort flow edges by priority (lower first), preserving order otherwise
  function flowEdges(diagram, pred){
    return diagram.edges.filter(e => e.kind!=='signal' && pred(e)).sort((a,b)=>(a.priority||0)-(b.priority||0));
  }

  function step(diagram){
    const log = [];
    const analytics = { pool_levels:{}, node_production:{}, total_production:{} };
    const buf = {};
    const addBuf = (pid,res,amt)=>{ buf[pid]=buf[pid]||{}; buf[pid][res]=(buf[pid][res]||0)+amt; };
    diagram.currentStep += 1;
    log.push(`— Step ${diagram.currentStep} —`);

    // Build expression context: aggregate pools by resource name (sum across pools)
    const poolAgg = {};
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type==='pool'){
        for(const r in n.resources){ poolAgg[r] = (poolAgg[r]||0) + n.resources[r]; }
      }
    }
    const lastA = diagram._lastAnalytics || {};
    setCtx({ step: diagram.currentStep, pool: poolAgg, prod: lastA.total_production||{}, cons: lastA.total_consumption||{} });

    // Phase 0: boosters - tick remaining + read signals
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type==='booster'){
        const sig = signalInto(diagram, n.id);
        n.signalAmount = sig;
        if(n.active && n.duration!==Infinity){
          n.remaining -= 1;
          if(n.remaining<=0){ n.active=false; n.remaining=0; log.push(`Booster ${n.name} expired`); }
        }      }
    }
    // Phase 1: gates
    for(const id in diagram.nodes){ const n=diagram.nodes[id]; if(n.type==='gate') checkGate(diagram, n); }

    // Phase 2a: events fire
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type!=='event') continue;
      let fire = false;
      if(n.triggerType==='periodic'){
        const period = Math.max(1, R(n.period, 5));
        const offset = R(n.offset, 0);
        if(diagram.currentStep>=offset && (diagram.currentStep - offset) % period === 0) fire = true;
      } else if(n.triggerType==='once'){
        if(diagram.currentStep===R(n.offset, 0) && n.fireCount===0) fire = true;
      } else if(n.triggerType==='gate'){
        const g = diagram.nodes[n.gateId];
        if(g && g.type==='gate' && g.isOpen) fire = true;
      }
      if(fire){
        n.lastFiredStep = diagram.currentStep; n.fireCount += 1;
        log.push(`Event ${n.name} fired (${Object.entries(n.payload).map(([k,v])=>`${v} ${k}`).join(', ')})`);
        // Push payload along outgoing flow edges
        for(const e of flowEdges(diagram, e=>e.from===n.id)){
          if(!isEdgeActive(diagram,e)) continue;
          const amt = (n.payload[e.resource]||0);
          if(amt<=0) continue;
          const tgt = diagram.nodes[e.to];
          if(tgt && tgt.type==='pool'){ addBuf(tgt.id, e.resource, amt); }
          else if(tgt && tgt.type==='splitter'){ tgt.buffer[e.resource]=(tgt.buffer[e.resource]||0)+amt; }
          else if(tgt && tgt.type==='delay'){ tgt.queue.push({res:e.resource, amt, remaining:tgt.delay}); }
          analytics.node_production[n.id] = analytics.node_production[n.id]||{};
          analytics.node_production[n.id][e.resource] = (analytics.node_production[n.id][e.resource]||0)+amt;
          analytics.total_production[e.resource] = (analytics.total_production[e.resource]||0)+amt;
        }
      }
    }

    // Phase 2b: delay nodes — tick and release
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type!=='delay') continue;
      const stillWaiting = [];
      const ready = []; // {res, amt}
      for(const item of n.queue){
        item.remaining -= 1;
        if(item.remaining <= 0) ready.push({res:item.res, amt:item.amt});
        else stillWaiting.push(item);
      }
      n.queue = stillWaiting;
      if(ready.length){
        log.push(`Delay ${n.name} released ${ready.map(r=>`${r.amt} ${r.res}`).join(', ')}`);
        for(const r of ready){
          // distribute to outgoing edges in priority order
          let remaining = r.amt;
          for(const e of flowEdges(diagram, e=>e.from===n.id && e.resource===r.res)){
            if(remaining<=0) break;
            if(!isEdgeActive(diagram,e)) continue;
            const cap = edgeFlow(diagram,e);
            const push = Math.min(cap, remaining);
            const tgt = diagram.nodes[e.to];
            if(!tgt) continue;
            if(tgt.type==='pool'){ addBuf(tgt.id, r.res, push); remaining -= push; }
            else if(tgt.type==='splitter'){ tgt.buffer[r.res]=(tgt.buffer[r.res]||0)+push; remaining -= push; }
            else if(tgt.type==='delay'){ tgt.queue.push({res:r.res, amt:push, remaining:tgt.delay}); remaining -= push; }
          }
        }
      }
    }

    // Phase 2c: converters tick + emit
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type==='converter' && n.isProcessing){
        n.cycleProgress += 1;
        if(n.cycleProgress >= R(n.cycleTime, 1)){
          n.outputBuffer = {};
          for(const r in n.outputProducts){
            const v = applyBoosts(diagram, n.id, r, n.outputProducts[r]);
            n.outputBuffer[r] = (n.outputBuffer[r]||0)+v;
            analytics.node_production[n.id] = analytics.node_production[n.id]||{};
            analytics.node_production[n.id][r] = (analytics.node_production[n.id][r]||0)+v;
            analytics.total_production[r] = (analytics.total_production[r]||0)+v;
          }
          n.isProcessing=false; n.cycleProgress=0; n.batchInputs={};
          log.push(`Converter ${n.name} produced ${JSON.stringify(n.outputBuffer)}`);
        }
      }
    }

    // Helper: deposit `amt` of resource `r` into node `tgt`, returning amount actually accepted.
    // Lets converters/sources/splitters push directly into ANY downstream node — not just pools.
    function depositInto(tgt, r, amt){
      if(!tgt || amt<=0) return 0;
      if(tgt.type==='pool'){
        const cap = tgt.capacity===Infinity ? Infinity : Math.max(0, tgt.capacity - Object.values(tgt.resources||{}).reduce((a,b)=>a+b,0));
        const take = Math.min(amt, cap);
        if(take>0) addBuf(tgt.id, r, take);
        return take;
      }
      if(tgt.type==='splitter'){ tgt.buffer[r]=(tgt.buffer[r]||0)+amt; return amt; }
      if(tgt.type==='delay'){ tgt.queue.push({res:r, amt, remaining:tgt.delay}); return amt; }
      if(tgt.type==='drain' && tgt.consumes===r){
        // drain absorbs directly — counts toward its consumption
        tgt.consumedLast = (tgt.consumedLast||0) + amt;
        return amt;
      }
      if(tgt.type==='converter'){
        // feed converter's batchInputs directly — it'll be picked up next start cycle
        tgt.batchInputs = tgt.batchInputs || {};
        tgt.batchInputs[r] = (tgt.batchInputs[r]||0) + amt;
        return amt;
      }
      if(tgt.type==='market'){
        // any inbound resource matching A or B goes into reserves
        if(r===tgt.resourceA){ tgt.reserveA = (tgt.reserveA||0) + amt; return amt; }
        if(r===tgt.resourceB){ tgt.reserveB = (tgt.reserveB||0) + amt; return amt; }
        return 0;
      }
      if(tgt.type==='offer'){
        // offer can absorb the trigger resource directly (treated as "shown to player")
        if(r===tgt.triggerResource){ tgt.directFeed = (tgt.directFeed||0) + amt; return amt; }
        return 0;
      }
      return 0;
    }

    // Phase 3: converters push outputs (now also into splitters/delays)
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type==='converter' && Object.keys(n.outputBuffer||{}).length){
        const remaining = Object.assign({}, n.outputBuffer);
        for(const e of flowEdges(diagram, e=>e.from===n.id)){
          if(!isEdgeActive(diagram,e)) continue;
          const r=e.resource;
          if((remaining[r]||0)>0){
            const tgt = diagram.nodes[e.to];
            if(!tgt) continue;
            const cap = edgeFlow(diagram,e);
            const push = Math.min(cap, remaining[r]);
            if(push<=0) continue;
            const taken = depositInto(tgt, r, push);
            remaining[r] -= taken;
            if(remaining[r]<=0) delete remaining[r];
          }
        }
        n.outputBuffer = remaining;
      }
    }

    // Phase 4: sources
    for(const e of flowEdges(diagram, e=>true)){
      if(!isEdgeActive(diagram,e)) continue;
      const from=diagram.nodes[e.from], to=diagram.nodes[e.to];
      if(!from||!to) continue;
      if(from.type==='source' && e.resource===from.produces){
        const amt = edgeFlow(diagram, e);
        if(amt<=0) continue;
        const taken = depositInto(to, e.resource, amt);
        if(taken<=0) continue;
        analytics.node_production[from.id] = analytics.node_production[from.id]||{};
        analytics.node_production[from.id][e.resource] = (analytics.node_production[from.id][e.resource]||0)+taken;
        analytics.total_production[e.resource] = (analytics.total_production[e.resource]||0)+taken;
      }
    }

    // Phase 4b: splitters distribute their buffers
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type!=='splitter') continue;
      for(const r in n.buffer){
        let amt = n.buffer[r];
        if(amt<=0) continue;
        const outs = flowEdges(diagram, e=>e.from===n.id && e.resource===r && isEdgeActive(diagram,e));
        if(!outs.length) continue;
        if(n.mode==='priority'){
          for(const e of outs){
            if(amt<=0) break;
            const cap = edgeFlow(diagram,e); const push = Math.min(cap, amt);
            const tgt = diagram.nodes[e.to];
            if(!tgt) continue;
            const taken = depositInto(tgt, r, push);
            amt -= taken;
          }
        } else {
          // ratio mode — distribute by share weights
          const totalShare = outs.reduce((a,e)=>a + (e.share||1), 0) || 1;
          const initialAmt = amt;
          let dispatched = 0;
          for(let i=0;i<outs.length;i++){
            const e = outs[i];
            const isLast = i===outs.length-1;
            let want = isLast ? (initialAmt - dispatched) : Math.floor(initialAmt * (e.share||1) / totalShare);
            const cap = edgeFlow(diagram,e);
            const push = Math.min(cap, want, amt);
            if(push<=0) continue;
            const tgt = diagram.nodes[e.to];
            if(!tgt) continue;
            if(tgt.type==='pool'){ addBuf(tgt.id, r, push); }
            else if(tgt.type==='splitter'){ tgt.buffer[r]=(tgt.buffer[r]||0)+push; }
            else if(tgt.type==='delay'){ tgt.queue.push({res:r,amt:push,remaining:tgt.delay}); }
            else continue;
            amt -= push; dispatched += push;
          }
        }
        n.buffer[r] = amt; if(amt<=0) delete n.buffer[r];
      }
    }

    // Phase 5: drains (priority-aware)
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type!=='drain') continue;
      n.consumedLast = 0;
      let need = R(n.demand, 0);
      for(const e of flowEdges(diagram, e=>e.to===n.id && e.resource===n.consumes)){
        if(need<=0) break;
        if(!isEdgeActive(diagram,e)) continue;
        const src = diagram.nodes[e.from];
        if(!src||src.type!=='pool') continue;
        const cap = edgeFlow(diagram,e);
        const av = src.resources[e.resource]||0;
        const pull = Math.min(need, cap, av);
        if(pull>0){ addBuf(src.id, e.resource, -pull); n.consumedLast += pull; need -= pull; }
      }
    }

    // Phase 6: converters start new cycles
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type!=='converter' || n.isProcessing) continue;
      if(!Object.keys(n.inputRecipe).length) continue;
      const pulls = {};
      const fromBatch = {}; // resources to consume from existing batchInputs
      let ok = true;
      for(const r in n.inputRecipe){
        let need = n.inputRecipe[r], got=0;
        // First: count what's already in batchInputs (deposited by direct upstream feeds)
        const inBatch = (n.batchInputs && n.batchInputs[r]) || 0;
        if(inBatch > 0){
          const useBatch = Math.min(need, inBatch);
          fromBatch[r] = useBatch;
          got += useBatch;
        }
        // Then: top up from upstream pools
        for(const e of flowEdges(diagram, e=>e.to===n.id && e.resource===r)){
          if(got>=need) break;
          if(!isEdgeActive(diagram,e)) continue;
          const src=diagram.nodes[e.from];
          if(!src||src.type!=='pool') continue;
          const cap=edgeFlow(diagram,e);
          const av=src.resources[r]||0;
          const can = Math.min(need-got, cap, av);
          if(can>0){ pulls[src.id]=pulls[src.id]||{}; pulls[src.id][r]=(pulls[src.id][r]||0)+can; got+=can; }
        }
        if(got<need){ ok=false; break; }
      }
      if(ok){
        // Drain pulled amounts from upstream pools and from existing batchInputs;
        // then re-stake the recipe amounts into batchInputs for the cycle.
        for(const pid in pulls) for(const r in pulls[pid]){ addBuf(pid, r, -pulls[pid][r]); }
        const newBatch = {};
        for(const r in n.inputRecipe) newBatch[r] = n.inputRecipe[r];
        // Preserve any batchInputs leftover beyond the recipe (carry-over for next cycle)
        for(const r in (n.batchInputs||{})){
          const used = fromBatch[r] || 0;
          const leftover = (n.batchInputs[r]||0) - used;
          if(leftover > 0) newBatch[r] = (newBatch[r]||0) + leftover;
        }
        n.batchInputs = newBatch;
        n.isProcessing=true; n.cycleProgress=0;
        log.push(`Converter ${n.name} started`);
      }
    }

    // Phase 6b: market trades
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type!=='market') continue;
      // Find offering pool (B side = pool feeding resourceA in) and receiving pool (A side wanting resourceB)
      // Convention: incoming edges with resourceA are "sells" (pool offers A, gets B back to a pool of resourceB).
      // We handle bilateral flows via inEdges of either resource: deposit flows in, withdraw flows out via outEdges.
      // Simpler: for each incoming flow edge, deposit moves it into reserve, then we pay out via outgoing flow edges of opposite resource.
      const ins = flowEdges(diagram, e=>e.to===n.id && isEdgeActive(diagram,e));
      let depositedA=0, depositedB=0;
      for(const e of ins){
        const src = diagram.nodes[e.from];
        if(!src || src.type!=='pool') continue;
        const cap = edgeFlow(diagram,e);
        const av = src.resources[e.resource]||0;
        const take = Math.min(cap, av);
        if(take<=0) continue;
        if(e.resource===n.resourceA){ addBuf(src.id, e.resource, -take); depositedA += take; n.reserveA += take; }
        else if(e.resource===n.resourceB){ addBuf(src.id, e.resource, -take); depositedB += take; n.reserveB += take; }
      }
      // Compute current rate (B per A) using base rate adjusted by reserves
      const ratio = (n.reserveB+1) / (n.reserveA+1);
      const elastic = R(n.elasticity, 0.5);
      const dynRate = R(n.baseRate, 0.01) * (1-elastic) + ratio * elastic;
      n.lastRate = dynRate;
      // Pay out: for outgoing edges with resourceA, pay from reserveA in exchange for B taken from reserveB; vice versa
      // Convert depositedA -> resourceB out, depositedB -> resourceA out
      let owedB = depositedA * dynRate;
      let owedA = depositedB / Math.max(0.0001, dynRate);
      const outs = flowEdges(diagram, e=>e.from===n.id && isEdgeActive(diagram,e));
      for(const e of outs){
        const tgt = diagram.nodes[e.to];
        if(!tgt || tgt.type!=='pool') continue;
        const cap = edgeFlow(diagram,e);
        let pay = 0;
        if(e.resource===n.resourceB && owedB>0 && n.reserveB>0){
          pay = Math.min(cap, owedB, n.reserveB);
          n.reserveB -= pay; owedB -= pay;
        } else if(e.resource===n.resourceA && owedA>0 && n.reserveA>0){
          pay = Math.min(cap, owedA, n.reserveA);
          n.reserveA -= pay; owedA -= pay;
        }
        if(pay>0) addBuf(tgt.id, e.resource, Math.round(pay));
      }
      if(depositedA||depositedB) log.push(`Market ${n.name}: rate=${dynRate.toFixed(3)} (A→B), reserves A:${Math.round(n.reserveA)} B:${Math.round(n.reserveB)}`);
    }

    // Phase 6c: offers
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type!=='offer') continue;
      // Check cooldown
      if(diagram.currentStep - n.lastShownStep < R(n.cooldown, 0)) continue;
      // Find upstream pool with the trigger resource (via incoming flow edges)
      let triggered = false;
      for(const e of flowEdges(diagram, e=>e.to===n.id && e.resource===n.triggerResource)){
        if(!isEdgeActive(diagram,e)) continue;
        const src = diagram.nodes[e.from];
        if(!src||src.type!=='pool') continue;
        if((src.resources[n.triggerResource]||0) >= R(n.triggerThreshold, 0)){ triggered = true; break; }
      }
      if(!triggered) continue;
      n.lastShownStep = diagram.currentStep;
      n.shows += 1;
      const converted = Math.random() < R(n.conversionRate, 0);
      log.push(`Offer ${n.name} shown (${n.shows}). ${converted?'CONVERTED ✓':'declined'}`);
      if(converted){
        n.conversions += 1; n.revenue += R(n.price, 0);
        // emit revenue + rewards down outgoing edges
        for(const e of flowEdges(diagram, e=>e.from===n.id && isEdgeActive(diagram,e))){
          const tgt = diagram.nodes[e.to]; if(!tgt) continue;
          let amt = 0;
          if(e.resource==='revenue') amt = R(n.price, 0);
          else amt = n.reward[e.resource]||0;
          if(amt<=0) continue;
          if(tgt.type==='pool'){ addBuf(tgt.id, e.resource, amt); }
          else if(tgt.type==='splitter'){ tgt.buffer[e.resource]=(tgt.buffer[e.resource]||0)+amt; }
          analytics.node_production[n.id] = analytics.node_production[n.id]||{};
          analytics.node_production[n.id][e.resource] = (analytics.node_production[n.id][e.resource]||0)+amt;
          analytics.total_production[e.resource] = (analytics.total_production[e.resource]||0)+amt;
        }
      }
    }

    // Phase 6d: tombolas (mystery boxes)
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type!=='tombola') continue;
      n.pullsLast = 0; n.lastPayout = {};
      const cost = Math.max(0, R(n.cost, 0));
      const maxPulls = Math.max(0, R(n.maxPullsPerStep, 0));
      if(cost<=0 || maxPulls<=0) continue;
      // Pay for pulls from upstream pools (priority order)
      let paidPulls = 0;
      for(let p=0; p<maxPulls; p++){
        // try to gather `cost` of triggerResource from incoming flow edges
        let need = cost; let pulled = {};
        const ins = flowEdges(diagram, e=>e.to===n.id && e.resource===n.triggerResource && isEdgeActive(diagram,e));
        for(const e of ins){
          if(need<=0) break;
          const src = diagram.nodes[e.from]; if(!src||src.type!=='pool') continue;
          const cap = edgeFlow(diagram,e);
          const av = src.resources[e.resource]||0;
          const take = Math.min(need, cap, av);
          if(take>0){ pulled[src.id]=(pulled[src.id]||0)+take; need-=take; }
        }
        if(need>0){
          // refund — not enough resources to pull
          break;
        }
        // commit deduction
        for(const sid in pulled){ addBuf(sid, n.triggerResource, -pulled[sid]); }
        paidPulls++;
        // Roll prizes
        const totalPulls = Math.max(1, n.pullCount||1);
        const prizes = (n.prizes||[]).filter(p=> (p.weight||0) > 0);
        if(!prizes.length) continue;
        const drawn = []; const used = new Set();
        for(let k=0;k<totalPulls;k++){
          const pool = n.unique ? prizes.filter(p=>!used.has(p.id)) : prizes;
          if(!pool.length) break;
          const total = pool.reduce((a,p)=>a+(p.weight||0),0);
          let r = Math.random()*total; let chosen = pool[0];
          for(const p of pool){ r -= (p.weight||0); if(r<=0){ chosen=p; break; } }
          drawn.push(chosen); if(n.unique) used.add(chosen.id);
        }
        // Aggregate payout
        const payout = {};
        for(const pr of drawn){
          payout[pr.resource] = (payout[pr.resource]||0) + (pr.amount||0);
          n.prizeCounts[pr.id] = (n.prizeCounts[pr.id]||0) + 1;
        }
        // Push payout via outgoing flow edges
        for(const res in payout){
          let amt = payout[res];
          n.lastPayout[res] = (n.lastPayout[res]||0) + amt;
          for(const e of flowEdges(diagram, e=>e.from===n.id && e.resource===res && isEdgeActive(diagram,e))){
            if(amt<=0) break;
            const tgt = diagram.nodes[e.to]; if(!tgt) continue;
            const cap = edgeFlow(diagram,e);
            const push = Math.min(cap, amt);
            if(push<=0) continue;
            if(tgt.type==='pool'){ addBuf(tgt.id, res, push); amt-=push; }
            else if(tgt.type==='splitter'){ tgt.buffer[res]=(tgt.buffer[res]||0)+push; amt-=push; }
            else if(tgt.type==='delay'){ tgt.queue.push({res, amt:push, remaining:tgt.delay}); amt-=push; }
          }
          analytics.node_production[n.id] = analytics.node_production[n.id]||{};
          analytics.node_production[n.id][res] = (analytics.node_production[n.id][res]||0)+payout[res];
          analytics.total_production[res] = (analytics.total_production[res]||0)+payout[res];
        }
      }
      n.pulls += paidPulls; n.pullsLast = paidPulls;
      if(paidPulls>0){
        const summary = Object.entries(n.lastPayout).map(([k,v])=>`${v} ${k}`).join(', ');
        log.push(`Tombola ${n.name}: ${paidPulls} pull(s) → ${summary}`);
      }
    }

    // Phase 7: pool-to-pool
    for(const e of flowEdges(diagram, e=>true)){
      if(!isEdgeActive(diagram,e)) continue;
      const from=diagram.nodes[e.from], to=diagram.nodes[e.to];
      if(from&&to&&from.type==='pool'&&to.type==='pool'){
        const av=from.resources[e.resource]||0;
        const cap=edgeFlow(diagram,e);
        const amt=Math.min(cap,av);
        if(amt>0){ addBuf(from.id, e.resource, -amt); addBuf(to.id, e.resource, amt); }
      }
      // pool -> splitter
      if(from&&to&&from.type==='pool'&&to.type==='splitter'){
        const av=from.resources[e.resource]||0;
        const cap=edgeFlow(diagram,e);
        const amt=Math.min(cap,av);
        if(amt>0){ addBuf(from.id, e.resource, -amt); to.buffer[e.resource]=(to.buffer[e.resource]||0)+amt; }
      }
      // pool -> delay
      if(from&&to&&from.type==='pool'&&to.type==='delay'){
        const av=from.resources[e.resource]||0;
        const cap=edgeFlow(diagram,e);
        const amt=Math.min(cap,av);
        if(amt>0){ addBuf(from.id, e.resource, -amt); to.queue.push({res:e.resource, amt, remaining:to.delay}); }
      }
    }

    // Phase 8: apply
    for(const pid in buf){
      const p = diagram.nodes[pid];
      if(!p||p.type!=='pool') continue;
      for(const r in buf[pid]){
        const v = buf[pid][r];
        if(v>0) poolAdd(p, r, v);
        else if(v<0) poolRemove(p, r, -v);
      }
    }

    // Phase 9: record pool levels
    for(const id in diagram.nodes){
      const n=diagram.nodes[id];
      if(n.type==='pool') analytics.pool_levels[n.id] = Object.assign({}, n.resources);
    }

    // Phase 9b: goal evaluation — done last so all pool changes this step are visible
    const goalCtx = { step: diagram.currentStep, pool: {}, prod: analytics.total_production||{}, cons: __ctx.cons||{} };
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type==='pool') for(const r in n.resources) goalCtx.pool[r] = (goalCtx.pool[r]||0) + n.resources[r];
    }
    setCtx(goalCtx);
    for(const id in diagram.nodes){
      const n = diagram.nodes[id];
      if(n.type!=='goal') continue;
      n.lastEvalStep = diagram.currentStep;
      const v = R(n.condition, 0);
      const ok = !!v;
      if(ok){ n.passCount++; if(n.firstPassStep<0) n.firstPassStep = diagram.currentStep; }
      else  { n.failCount++; }
      if(n.mode==='sustain'){
        if(diagram.currentStep >= R(n.sinceStep, 0)){
          n.passing = ok && (!n.deadline || diagram.currentStep <= R(n.deadline, Infinity));
        }
      } else {
        // achieve: passing once we've ever passed (within deadline if set)
        const deadline = R(n.deadline, 0);
        if(deadline>0 && diagram.currentStep > deadline && n.firstPassStep<0) n.passing = false;
        else n.passing = (n.firstPassStep>=0) && (deadline<=0 || n.firstPassStep<=deadline);
      }
    }

    diagram._lastAnalytics = analytics;
    return { log, analytics };
  }

  function makeGroup(props){
    return {
      id: uid(),
      name: props.name || 'Group',
      x: props.x ?? 0, y: props.y ?? 0,
      w: props.w ?? 320, h: props.h ?? 220,
      color: props.color || '#c0623a',
      collapsed: false
    };
  }

  global.RFSim = { uid, makeNode, makeEdge, makeGroup, step, rollLabel, applyBoosts, signalInto, R, setCtx, getCtx };
})(window);
