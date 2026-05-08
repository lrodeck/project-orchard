// Main App
const { useState, useEffect, useRef, useCallback, useMemo } = React;

const COLORS = ['#5e7a3a','#c0623a','#d99a2b','#6b3a5c','#6e8aa4','#8a3a1c','#3f5524','#a87aa0','#bfa055','#7fa0aa','#c47860','#e89438'];

// Hover descriptions for each palette node type. `params` are short hints
// at the canonical knobs the inspector exposes; they're not exhaustive.
const NODE_TIPS = {
  source:    { title:'Source',    desc:'Spawns a resource at a fixed rate every step. The starting tap of any economy.', params:[['emits','N / step'],['resource','one type']] },
  pool:      { title:'Pool',      desc:'Stores resources. Has an optional capacity cap; routes outflows by edge priority.', params:[['holds','any resources'],['capacity','optional']] },
  drain:     { title:'Drain',     desc:'Consumes a resource and removes it from the system. Models sinks, costs, decay.', params:[['rate','N / step']] },
  converter: { title:'Converter', desc:'Transforms input resources into output resources at a fixed ratio.', params:[['ratio','in:out'],['triggers','every step']] },
  gate:      { title:'Gate',      desc:'Conditional pass-through — only forwards when an upstream pool meets a threshold.', params:[['threshold','N'],['mode','gte / lte']] },
  booster:   { title:'Booster',   desc:'Multiplies the rate of a downstream node while active. Models temporary buffs.', params:[['mult','×N'],['duration','steps']] },
  splitter:  { title:'Splitter',  desc:'Routes a single inflow across multiple outputs by ratio.', params:[['outputs','any #'],['weights','sum to 1']] },
  delay:     { title:'Delay',     desc:'Pipeline that holds inflow for N steps before releasing it. Models build queues.', params:[['delay','N steps']] },
  event:     { title:'Event',     desc:'Fires once at a given step. Triggers downstream nodes (e.g. spawn, boost, end-of-season).', params:[['fires at','step N']] },
  market:    { title:'Market',    desc:'Two-way exchange between resources with dynamic price (supply/demand drift).', params:[['price','adjusts'],['liquidity','depth']] },
  offer:     { title:'Offer',     desc:'Monetization touchpoint: sells a bundle for a price; a % of viewers convert per step.', params:[['price','virtual cost'],['conv %','% of pop']] },
  tombola:   { title:'Mystery Box', desc:'Weighted random reward — pays out one (or more) prizes per pull. Supports unique prizes.', params:[['pulls','per trigger'],['prizes','weighted']] },
  goal:      { title:'Goal',      desc:'Assertion. Watches a condition and surfaces pass/fail in KPIs and tornado analysis.', params:[['condition','formula'],['by step','optional deadline']] },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "cottage",
  "density": "normal",
  "layout": "left",
  "showLog": true,
  "showAnalytics": true,
  "demoScenario": "ftp"
}/*EDITMODE-END*/;

function makeBlankDiagram(){
  return { nodes:{}, edges:[], groups:[], resources:['gold','wood','stone','food'], currentStep:0, name:'Untitled Economy' };
}

const GROUP_COLORS = ['#c0623a','#5e7a3a','#d99a2b','#6b3a5c','#6e8aa4','#8a3a1c','#a87aa0','#7fa0aa'];

function App(){
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Diagram state — start with chosen template
  const [diagram, setDiagram] = useState(() => loadTemplate(t.demoScenario) || makeBlankDiagram());
  const [nodeSizes, setNodeSizes] = useState({});
  const onNodeSize = useCallback((id, w, h) => {
    setNodeSizes(prev => {
      const cur = prev[id];
      if(cur && cur.w===w && cur.h===h) return prev;
      return { ...prev, [id]: {w, h} };
    });
  }, []);
  const portPos = useCallback((node, side) => {
    const s = nodeSizes[node.id] || { w: 180, h: 80 };
    return { x: node.x + (side==='out' ? s.w : 0), y: node.y + s.h/2 };
  }, [nodeSizes]);
  const [history, setHistory] = useState([]); // for undo step
  const [log, setLog] = useState([]);
  const [analyticsHist, setAnalyticsHist] = useState([]);
  const [selection, setSelection] = useState(null); // {kind:'node'|'edge', id}
  const [running, setRunning] = useState(false);
  const [bottomTab, setBottomTab] = useState('analytics');
  const [bottomMin, setBottomMin] = useState(false);
  const [radial, setRadial] = useState(null); // {kind, screenX, screenY, worldX, worldY, nodeId?}
  const [hint, setHint] = useState('');
  const [abOpen, setAbOpen] = useState(false);
  const [segOpen, setSegOpen] = useState(false);
  const [solveOpen, setSolveOpen] = useState(false);
  const [tornadoOpen, setTornadoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(()=>{ try { return !localStorage.getItem('orchard.helpSeen'); } catch(e){ return false; } });
  const [edgeDraft, setEdgeDraft] = useState(null); // {fromId, toId} pending edit
  const [view, setView] = useState({x:0,y:0,scale:1});
  const [drag, setDrag] = useState(null); // {kind:'node'|'pan'|'edge', ...}
  const [mousePos, setMousePos] = useState({x:0,y:0});
  const [paletteDrag, setPaletteDrag] = useState(null); // node type currently being dragged from palette
  const [paletteTip, setPaletteTip] = useState(null); // {type, x, y} for hover tooltip on palette button

  const canvasRef = useRef(null);

  // Apply theme/density/layout to root
  useEffect(()=>{
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
    document.documentElement.dataset.layout = t.layout;
    if(window.applyThemeFonts) window.applyThemeFonts(t.theme);
  },[t.theme, t.density, t.layout]);

  // Switch demo scenario when changed via Tweaks (only if user wants — preserve unsaved? we just confirm)
  const lastScenario = useRef(t.demoScenario);
  useEffect(()=>{
    if(t.demoScenario !== lastScenario.current){
      lastScenario.current = t.demoScenario;
      const d = loadTemplate(t.demoScenario) || makeBlankDiagram();
      setDiagram(d); setHistory([]); setLog([]); setAnalyticsHist([]); setSelection(null); setRunning(false);
      flash('Loaded scenario: ' + (TEMPLATES[t.demoScenario]?.name||'Blank'));
    }
  },[t.demoScenario]);

  function flash(msg){ setHint(msg); setTimeout(()=>setHint(''), 1800); }

  // Drag-from-palette: simpler — click adds at center
  const addNode = useCallback((type, atWorld) => {
    setDiagram(d => {
      const cnt = Object.values(d.nodes).filter(n=>n.type===type).length;
      const name = `${type}_${cnt+1}`;
      let x, y;
      if(atWorld){ x = atWorld.x - 70; y = atWorld.y - 40; }
      else {
        const cw = canvasRef.current?.clientWidth||800, ch = canvasRef.current?.clientHeight||600;
        x = (cw/2 - view.x)/view.scale - 70 + Math.random()*40;
        y = (ch/2 - view.y)/view.scale - 40 + Math.random()*40;
      }
      const props = { name, x, y };
      if(type==='source') props.produces = d.resources[0]||'gold';
      if(type==='drain') props.consumes = d.resources[0]||'gold';
      if(type==='pool') props.resources = {};
      const n = RFSim.makeNode(type, props);
      const nodes = {...d.nodes, [n.id]: n};
      setSelection({kind:'node', id:n.id});
      return {...d, nodes};
    });
    flash('Added ' + type);
  },[view]);

  const updateNode = useCallback((id, patch) => {
    setDiagram(d => {
      const n = d.nodes[id]; if(!n) return d;
      return {...d, nodes: {...d.nodes, [id]: {...n, ...patch}}};
    });
  },[]);
  const updateEdge = useCallback((id, patch) => {
    setDiagram(d => ({...d, edges: d.edges.map(e=>e.id===id?{...e,...patch}:e)}));
  },[]);

  // Expose deleteNode globally so the in-node × button can call it
  useEffect(() => {
    window.__orchardDeleteNode = (id) => deleteNode(id);
    return () => { delete window.__orchardDeleteNode; };
  }, [deleteNode]);

  // === Groups ===
  const addGroup = useCallback((atWorld) => {
    setDiagram(d => {
      const g = RFSim.makeGroup({
        name: 'Group ' + ((d.groups||[]).length+1),
        x: atWorld ? atWorld.x - 160 : -view.x/view.scale + 80,
        y: atWorld ? atWorld.y - 110 : -view.y/view.scale + 80,
        color: GROUP_COLORS[(d.groups||[]).length % GROUP_COLORS.length]
      });
      return {...d, groups:[...(d.groups||[]), g]};
    });
    flash('Group added — drag nodes onto it');
  }, [view.x, view.y, view.scale]);

  const updateGroup = useCallback((id, patch) => {
    setDiagram(d => ({...d, groups:(d.groups||[]).map(g => g.id===id ? {...g, ...patch} : g)}));
  }, []);

  const deleteGroup = useCallback((id) => {
    setDiagram(d => ({...d, groups:(d.groups||[]).filter(g => g.id!==id)}));
    setSelection(null);
  }, []);

  const duplicateNode = useCallback((id) => {
    setDiagram(d => {
      const n = d.nodes[id]; if(!n) return d;
      const clone = RFSim.cloneNode ? RFSim.cloneNode(n) : { ...JSON.parse(JSON.stringify(n)), id: Math.random().toString(36).slice(2,10) };
      clone.x = (n.x||0) + 30; clone.y = (n.y||0) + 30;
      clone.name = (n.name||n.type) + ' copy';
      return { ...d, nodes: { ...d.nodes, [clone.id]: clone } };
    });
    flash('Duplicated');
  }, []);

  const deleteNode = useCallback((id) => {
    setSelection(s => (s?.kind==='node' && s.id===id) ? null : s);
    setDiagram(d => {
      const nodes = {...d.nodes}; delete nodes[id];
      // unlink boosters/gates
      for(const nid in nodes){
        const n = nodes[nid];
        if(n.type==='booster' && n.targetId===id){ nodes[nid] = {...n, targetId:null, active:false}; }
        if(n.type==='gate' && n.condPoolId===id){ nodes[nid] = {...n, condPoolId:null}; }
      }
      const edges = d.edges.filter(e => e.from!==id && e.to!==id && e.gateId!==id);
      return {...d, nodes, edges};
    });
    setSelection(null);
  },[]);
  const deleteEdge = useCallback((id) => {
    setDiagram(d => ({...d, edges: d.edges.filter(e=>e.id!==id)}));
    setSelection(null);
  },[]);

  // === Canvas pan/zoom ===
  function onCanvasMouseDown(e){
    if(e.target === canvasRef.current || e.target.classList.contains('canvas-inner') || e.target.tagName==='svg' || e.target.tagName==='SVG'){
      setSelection(null);
      setDrag({kind:'pan', startX:e.clientX, startY:e.clientY, vx:view.x, vy:view.y});
    }
  }
  function onCanvasWheel(e){
    if(!canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0015;
    const newScale = Math.min(2, Math.max(0.3, view.scale * (1+delta)));
    const ratio = newScale / view.scale;
    const nx = mx - (mx - view.x)*ratio;
    const ny = my - (my - view.y)*ratio;
    setView({ x:nx, y:ny, scale:newScale });
  }

  // === Node drag ===
  function onNodeMouseDown(e, id){
    if(e.target.classList.contains('port')) return;
    if(e.target.classList.contains('node-del')) return;
    e.stopPropagation();
    setSelection({kind:'node', id});
    const n = diagram.nodes[id];
    setDrag({kind:'node', id, startX:e.clientX, startY:e.clientY, nx:n.x, ny:n.y});
  }

  // === Group drag / resize ===
  function onGroupMouseDown(e, id, mode){
    e.stopPropagation();
    const g = (diagram.groups||[]).find(x=>x.id===id); if(!g) return;
    setSelection({kind:'group', id});
    if(mode==='resize'){
      setDrag({kind:'group-resize', id, startX:e.clientX, startY:e.clientY, w:g.w, h:g.h});
    } else {
      // moving the group also moves all nodes inside it
      const inside = Object.values(diagram.nodes).filter(n => n.x>=g.x && n.y>=g.y && n.x<=g.x+g.w && n.y<=g.y+g.h);
      setDrag({kind:'group-move', id, startX:e.clientX, startY:e.clientY, gx:g.x, gy:g.y, children: inside.map(n=>({id:n.id, x:n.x, y:n.y}))});
    }
  }

  // === Edge drag from port ===
  function onPortDown(e, id, port){
    e.stopPropagation();
    if(port==='out'){
      const rect = canvasRef.current.getBoundingClientRect();
      setDrag({kind:'edge', fromId: id, startX: e.clientX, startY: e.clientY});
      setMousePos({ x: (e.clientX-rect.left-view.x)/view.scale, y: (e.clientY-rect.top-view.y)/view.scale });
    }
  }
  function onPortUp(e, id, port){
    e.stopPropagation();
    if(drag && drag.kind==='edge' && port==='in' && drag.fromId !== id){
      // create edge
      const from = diagram.nodes[drag.fromId], to = diagram.nodes[id];
      if(!from || !to){ setDrag(null); return; }
      // pick reasonable defaults
      let resource = diagram.resources[0]||'gold';
      if(from.type==='source') resource = from.produces;
      else if(to.type==='drain') resource = to.consumes;
      else if(from.type==='converter' && Object.keys(from.outputProducts||{}).length) resource = Object.keys(from.outputProducts)[0];
      else if(to.type==='converter' && Object.keys(to.inputRecipe||{}).length) resource = Object.keys(to.inputRecipe)[0];

      // validate
      if(from.type==='drain'){ flash('Drains cannot be edge source'); setDrag(null); return; }
      if(to.type==='source'){ flash('Sources cannot be edge target'); setDrag(null); return; }
      const edge = RFSim.makeEdge(from.id, to.id, resource, '1');
      setDiagram(d => ({...d, edges:[...d.edges, edge]}));
      setSelection({kind:'edge', id:edge.id});
      flash('Edge created');
    }
    setDrag(null);
  }

  useEffect(()=>{
    function move(e){
      if(!drag) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if(!rect) return;
      if(drag.kind==='pan'){
        setView(v => ({...v, x: drag.vx + (e.clientX-drag.startX), y: drag.vy + (e.clientY-drag.startY)}));
      } else if(drag.kind==='node'){
        const dx = (e.clientX-drag.startX)/view.scale, dy=(e.clientY-drag.startY)/view.scale;
        updateNode(drag.id, { x: drag.nx + dx, y: drag.ny + dy });
      } else if(drag.kind==='group-move'){
        const dx = (e.clientX-drag.startX)/view.scale, dy=(e.clientY-drag.startY)/view.scale;
        updateGroup(drag.id, { x: drag.gx + dx, y: drag.gy + dy });
        // move children too
        setDiagram(d => {
          const nodes = {...d.nodes};
          for(const c of drag.children){
            if(nodes[c.id]) nodes[c.id] = {...nodes[c.id], x: c.x + dx, y: c.y + dy};
          }
          return {...d, nodes};
        });
      } else if(drag.kind==='group-resize'){
        const dx = (e.clientX-drag.startX)/view.scale, dy=(e.clientY-drag.startY)/view.scale;
        updateGroup(drag.id, { w: Math.max(140, drag.w + dx), h: Math.max(100, drag.h + dy) });
      } else if(drag.kind==='edge'){
        setMousePos({ x:(e.clientX-rect.left-view.x)/view.scale, y:(e.clientY-rect.top-view.y)/view.scale });
      }
    }
    function up(){ if(drag && drag.kind!=='edge') setDrag(null); else if(drag && drag.kind==='edge') setDrag(null); }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  },[drag, view.scale, updateNode]);

  // Listen for solver "Apply to diagram"
  useEffect(()=>{
    function onApply(ev){
      const { nodeId, paramKey, value } = ev.detail || {};
      if(!nodeId || !paramKey) return;
      setDiagram(d => {
        const node = d.nodes[nodeId];
        if(!node) return d;
        const nodes = {...d.nodes};
        const edges = d.edges.map(e=>({...e}));
        if(paramKey === '__outEdgeLabel'){
          for(const e of edges){
            if(e.from === nodeId && e.kind!=='signal' && e.resource===node.produces){
              e.label = String(value);
            }
          }
          nodes[nodeId] = {...node, rate: value};
        } else {
          nodes[nodeId] = {...node, [paramKey]: value};
        }
        return {...d, nodes, edges};
      });
      flash(`Applied: ${value.toFixed(3)}`);
    }
    window.addEventListener('orchard.applyParam', onApply);
    return () => window.removeEventListener('orchard.applyParam', onApply);
  }, []);

  // === Simulation ===
  const stepOnce = useCallback(() => {
    setHistory(h => [...h.slice(-50), JSON.parse(JSON.stringify({d:diagram, l:log, a:analyticsHist}))]);
    const d = JSON.parse(JSON.stringify(diagram));
    // restore Infinity (JSON loses it)
    for(const id in d.nodes){
      const n = d.nodes[id];
      if(n.type==='pool' && n.capacity===null) n.capacity = Infinity;
      if(n.type==='booster' && n.duration===null) n.duration = Infinity;
      if(n.type==='booster' && n.remaining===null) n.remaining = Infinity;
    }
    const { log: stepLog, analytics } = RFSim.step(d);
    setDiagram(d);
    setLog(l => [...stepLog, ...l].slice(0, 800));
    setAnalyticsHist(a => [...a, { step: d.currentStep, ...analytics }]);
  },[diagram, log, analyticsHist]);

  const undoStep = useCallback(() => {
    if(!history.length) return flash('Nothing to undo');
    const last = history[history.length-1];
    setHistory(h => h.slice(0,-1));
    setDiagram(last.d); setLog(last.l); setAnalyticsHist(last.a);
    flash('Undid step');
  },[history]);

  const stepN = useCallback((n) => {
    setHistory(h => [...h.slice(-50), JSON.parse(JSON.stringify({d:diagram, l:log, a:analyticsHist}))]);
    const d = JSON.parse(JSON.stringify(diagram));
    for(const id in d.nodes){
      const nd = d.nodes[id];
      if(nd.type==='pool' && nd.capacity===null) nd.capacity = Infinity;
      if(nd.type==='booster' && nd.duration===null) nd.duration = Infinity;
      if(nd.type==='booster' && nd.remaining===null) nd.remaining = Infinity;
    }
    const allLogs = [];
    const allAnalytics = [];
    for(let i=0;i<n;i++){
      const { log: stepLog, analytics } = RFSim.step(d);
      allLogs.push(...stepLog);
      allAnalytics.push({ step: d.currentStep, ...analytics });
    }
    setDiagram(d);
    setLog(l => [...allLogs.reverse(), ...l].slice(0, 800));
    setAnalyticsHist(a => [...a, ...allAnalytics]);
  },[diagram, log, analyticsHist]);

  // Auto-run
  useEffect(()=>{
    if(!running) return;
    const id = setInterval(stepOnce, 600);
    return () => clearInterval(id);
  },[running, stepOnce]);

  const resetSim = useCallback(()=>{
    // Keep diagram structure but reset levels & step counter to 0 by reloading template-style state of pools
    setDiagram(d => {
      const nodes = {...d.nodes};
      for(const id in nodes){
        const n = nodes[id];
        if(n.type==='converter') nodes[id] = {...n, isProcessing:false, cycleProgress:0, batchInputs:{}, outputBuffer:{}};
        if(n.type==='gate') nodes[id] = {...n, isOpen:false};
        if(n.type==='drain') nodes[id] = {...n, consumedLast:0};
        if(n.type==='booster') nodes[id] = {...n, active:true, remaining:n.duration};
      }
      return {...d, nodes, currentStep:0};
    });
    setLog([]); setAnalyticsHist([]); setHistory([]); flash('Simulation reset');
  },[]);

  // === Resource management ===
  const addResource = (name) => {
    name = name.trim().toLowerCase();
    if(!name) return;
    if(diagram.resources.includes(name)) return flash('Already exists');
    setDiagram(d => ({...d, resources: [...d.resources, name]}));
  };
  const removeResource = async (name) => {
    const ok = await window.confirmDialog({
      title: 'Remove resource?',
      message: `Remove resource "${name}"? Nodes and edges using it will keep references.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if(!ok) return;
    setDiagram(d => {
      const colors = {...(d.resourceColors||{})};
      delete colors[name];
      return { ...d, resources: d.resources.filter(r=>r!==name), resourceColors: colors };
    });
  };
  const renameResource = (oldName, newName) => {
    newName = newName.trim().toLowerCase();
    if(!newName || newName === oldName) return;
    if(diagram.resources.includes(newName)) return flash('Name in use');
    setDiagram(d => {
      // Update resources array
      const resources = d.resources.map(r => r === oldName ? newName : r);
      // Update resourceColors map
      const colors = {...(d.resourceColors||{})};
      if(colors[oldName] != null){ colors[newName] = colors[oldName]; delete colors[oldName]; }
      // Update every node field that references the old name
      const nodes = {};
      for(const [id,n] of Object.entries(d.nodes)){
        const nn = {...n};
        if(nn.produces === oldName) nn.produces = newName;
        if(nn.consumes === oldName) nn.consumes = newName;
        if(nn.resource === oldName) nn.resource = newName;
        if(nn.triggerResource === oldName) nn.triggerResource = newName;
        if(nn.condResource === oldName) nn.condResource = newName;
        if(nn.resourceA === oldName) nn.resourceA = newName;
        if(nn.resourceB === oldName) nn.resourceB = newName;
        if(nn.resources && Object.prototype.hasOwnProperty.call(nn.resources, oldName)){
          nn.resources = {...nn.resources, [newName]: nn.resources[oldName]};
          delete nn.resources[oldName];
        }
        if(nn.inputs && Object.prototype.hasOwnProperty.call(nn.inputs, oldName)){
          nn.inputs = {...nn.inputs, [newName]: nn.inputs[oldName]};
          delete nn.inputs[oldName];
        }
        if(nn.outputs && Object.prototype.hasOwnProperty.call(nn.outputs, oldName)){
          nn.outputs = {...nn.outputs, [newName]: nn.outputs[oldName]};
          delete nn.outputs[oldName];
        }
        if(nn.reward && Object.prototype.hasOwnProperty.call(nn.reward, oldName)){
          nn.reward = {...nn.reward, [newName]: nn.reward[oldName]};
          delete nn.reward[oldName];
        }
        if(Array.isArray(nn.prizes)){
          nn.prizes = nn.prizes.map(p => p.resource === oldName ? {...p, resource:newName} : p);
        }
        if(typeof nn.condition === 'string'){
          // Replace `pool.<oldName>` references in formulas
          nn.condition = nn.condition.replace(new RegExp(`\\bpool\\.${oldName}\\b`,'g'), `pool.${newName}`);
        }
        nodes[id] = nn;
      }
      // Update edges
      const edges = (d.edges||[]).map(e => e.resource === oldName ? {...e, resource:newName} : e);
      return { ...d, resources, resourceColors: colors, nodes, edges };
    });
  };
  const setResourceColor = (name, color) => {
    setDiagram(d => ({ ...d, resourceColors: { ...(d.resourceColors||{}), [name]: color } }));
  };
  // Resolve a resource's color: explicit override > positional default
  const colorFor = (name) => {
    const i = diagram.resources.indexOf(name);
    return diagram.resourceColors?.[name] || COLORS[(i<0?0:i) % COLORS.length];
  };

  // === Save/Load ===
  const saveJSON = () => {
    const data = JSON.stringify(diagram, (k,v) => v===Infinity?'__inf__':v, 2);
    const blob = new Blob([data], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(diagram.name||'economy').replace(/\s+/g,'_')}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const loadJSON = (file) => {
    const r = new FileReader();
    r.onload = () => {
      try{
        const d = JSON.parse(r.result, (k,v) => v==='__inf__'?Infinity:v);
        setDiagram(d); setLog([]); setAnalyticsHist([]); setHistory([]); flash('Loaded');
      }catch(e){ alert('Invalid JSON: '+e.message); }
    };
    r.readAsText(file);
  };
  const exportCSV = () => {
    if(!analyticsHist.length) return flash('Run simulation first');
    const rows = [['step', ...diagram.resources]];
    for(const a of analyticsHist){
      rows.push([a.step, ...diagram.resources.map(r => a.total_production?.[r]||0)]);
    }
    const csv = rows.map(r=>r.join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='production.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // === Selection helpers ===
  const onSelectionUpdate = (patch) => {
    if(!selection) return;
    if(selection.kind==='node') updateNode(selection.id, patch);
    else updateEdge(selection.id, patch);
  };
  const onSelectionDelete = () => {
    if(!selection) return;
    if(selection.kind==='node') deleteNode(selection.id);
    else deleteEdge(selection.id);
  };

  // === Health & bottlenecks analysis ===
  const health = useMemo(() => analyzeHealth(diagram, analyticsHist), [diagram, analyticsHist]);

  // === Edges to render ===
  const edgePaths = useMemo(() => {
    return diagram.edges.map(e => {
      const from = diagram.nodes[e.from], to = diagram.nodes[e.to];
      if(!from||!to) return null;
      const p1 = portPos(from, 'out');
      const p2 = portPos(to, 'in');
      const lx = (p1.x+p2.x)/2, ly = (p1.y+p2.y)/2;
      return { e, d: curvePath(p1.x,p1.y,p2.x,p2.y), labelX:lx, labelY:ly };
    }).filter(Boolean);
  },[diagram.edges, diagram.nodes, portPos]);

  return (
    <React.Fragment>
    <TweaksPanel title="Tweaks">
      <TweakSection label="Look & feel">
        <TweakSelect label="Theme" value={t.theme} options={[
          {value:"cottage",label:"Cottage Core"},
          {value:"solarpunk",label:"Solar Punk"},
          {value:"whimsy-goth",label:"Whimsy Goth"},
          {value:"dawn",label:"Dawn"},
          {value:"pro",label:"Pro (Live Ops)"}
        ]} onChange={v=>setTweak('theme',v)}/>
        <TweakRadio label="Density" value={t.density} options={[
          {value:"compact",label:"Compact"},
          {value:"normal",label:"Normal"},
          {value:"comfortable",label:"Cozy"}
        ]} onChange={v=>setTweak('density',v)}/>
        <TweakRadio label="Tools side" value={t.layout} options={[
          {value:"left",label:"Left"},
          {value:"right",label:"Right"}
        ]} onChange={v=>setTweak('layout',v)}/>
      </TweakSection>
      <TweakSection label="Panels">
        <TweakToggle label="Show analytics" value={t.showAnalytics} onChange={v=>setTweak('showAnalytics',v)}/>
        <TweakToggle label="Show log" value={t.showLog} onChange={v=>setTweak('showLog',v)}/>
      </TweakSection>
      <TweakSection label="Scenario">
        <TweakSelect label="Demo economy" value={t.demoScenario} options={[
          {value:"blank",label:"Blank"},
          {value:"ftp",label:"F2P Soft+Hard Currency"},
          {value:"liveops",label:"Live Ops + Monetization"}
        ]} onChange={v=>setTweak('demoScenario',v)}/>
      </TweakSection>
    </TweaksPanel>
    <div className="app">
      {/* Topbar */}
      <div className="topbar">
        <div className="brand"><Icon.Logo/> <span>Orchard</span></div>
        <input type="text" value={diagram.name} onChange={e=>setDiagram(d=>({...d, name:e.target.value}))}
          style={{width:240, fontFamily:'var(--font-display)', fontSize:14}}/>
        <span className="health" data-status={health.status}>
          <span className="dot"/> {health.label}
        </span>
        <span className="sep"/>
        <span className="meta">{Object.keys(diagram.nodes).length} nodes · {diagram.edges.length} edges · step {diagram.currentStep}</span>
        <button className="btn" onClick={saveJSON}><Icon.Save/>Save</button>
        <label className="btn" style={{cursor:'pointer'}}>
          <Icon.Load/>Load
          <input type="file" accept=".json" style={{display:'none'}} onChange={e=>e.target.files[0]&&loadJSON(e.target.files[0])}/>
        </label>
        <button className="btn" onClick={exportCSV} title="Export production CSV">CSV</button>
        <button className="btn" onClick={async ()=>{
          try {
            const canvasEl = canvasRef.current;
            await window.OrchardDesignDoc.exportDesignDoc(diagram, analyticsHist, canvasEl);
            flash('Design Doc opened in new tab');
          } catch(e){ alert('Design Doc export failed: '+e.message); }
        }} title="Generate a printable Feature Design Document for this scenario">📄 Design Doc</button>
        <button className="btn" onClick={()=>setHelpOpen(true)} title="How-to & docs">? Help</button>
        <button className="btn" onClick={()=>setSettingsOpen(true)} title="Settings & themes">⚙ Settings</button>
      </div>

      {/* Left rail */}
      <div className="left-rail">
        <Section title="Nodes" storageKey="sec-nodes">
          <div className="desc"><b>Drag</b> a node onto the canvas to place it.</div>
          <div className="palette">
            {['source','pool','drain','converter','gate','booster','splitter','delay','event','market','offer','tombola','goal'].map(t=>(
              <button key={t}
                draggable
                title={NODE_TIPS[t]?.title + ' — ' + NODE_TIPS[t]?.desc}
                onMouseEnter={(e)=>{
                  const r = e.currentTarget.getBoundingClientRect();
                  setPaletteTip({type:t, x:r.right+8, y:r.top});
                }}
                onMouseLeave={()=>setPaletteTip(null)}
                onDragStart={(e)=>{
                  e.dataTransfer.setData('application/x-orchard-node-type', t);
                  e.dataTransfer.effectAllowed = 'copy';
                  e.currentTarget.classList.add('dragging');
                  setPaletteDrag(t);
                  setPaletteTip(null);
                }}
                onDragEnd={(e)=>{
                  e.currentTarget.classList.remove('dragging');
                  setPaletteDrag(null);
                }}>
                <span className="ic"><NodeIcon type={t} size={26}/></span>
                {t}
              </button>
            ))}
          </div>
          {paletteTip && (() => {
            const info = NODE_TIPS[paletteTip.type];
            if(!info) return null;
            return ReactDOM.createPortal(
              <div className="node-tip" style={{left: paletteTip.x, top: paletteTip.y, width: 240}}>
                <div className="tip-title"><NodeIcon type={paletteTip.type} size={14}/>{info.title}</div>
                <div className="tip-desc" style={{fontStyle:'normal',color:'var(--ink)'}}>{info.desc}</div>
                {info.params && info.params.map((p,i)=>(<div key={i} className="tip-row"><span>{p[0]}</span><b>{p[1]}</b></div>))}
              </div>,
              document.body
            );
          })()}
        </Section>

        <Section title="Resources" storageKey="sec-resources">
          <div className="desc">Define resource types used by nodes & edges. Click to rename or change color.</div>
          <div className="res-list">
            {diagram.resources.map(r=>(
              <ResourceChip
                key={r}
                name={r}
                color={colorFor(r)}
                onRename={(newName)=>renameResource(r, newName)}
                onColor={(c)=>setResourceColor(r, c)}
                onRemove={()=>removeResource(r)}
              />
            ))}
          </div>
          <ResourceAdd onAdd={addResource}/>
        </Section>

        <Section title="Scenarios" storageKey="sec-scenarios">
          <div className="desc">Load a starter economy.</div>
          <div className="btn-row" style={{flexDirection:'column'}}>
            {Object.entries(TEMPLATES).map(([k,v])=>(
              <button key={k} className="btn" onClick={async ()=>{
                if(diagram.currentStep>0){
                  const ok = await window.confirmDialog({
                    title: 'Replace current diagram?',
                    message: 'Loading a scenario will discard your current diagram and history.',
                    confirmLabel: 'Replace',
                    danger: true,
                  });
                  if(!ok) return;
                }
                setDiagram(loadTemplate(k) || makeBlankDiagram());
                setLog([]); setAnalyticsHist([]); setHistory([]); flash('Loaded '+v.name);
              }}>{v.name}</button>
            ))}
          </div>
        </Section>

        <Section title="Presets" storageKey="sec-presets" defaultCollapsed>
          <div className="desc">Insert a reusable mini-graph at the canvas center, then wire it to your existing nodes.</div>
          {(()=>{
            const groups = {};
            for(const [k,p] of Object.entries(PRESETS)){
              (groups[p.category] = groups[p.category]||[]).push([k,p]);
            }
            return Object.entries(groups).map(([cat, items])=>(
              <details key={cat} className="preset-group" open={cat==='Production'}>
                <summary className="preset-cat-summary"><span className="preset-cat">{cat}</span><span className="preset-count">{items.length}</span></summary>
                <div className="btn-row" style={{flexDirection:'column'}}>
                  {items.map(([k,p])=>(
                    <button key={k} className="btn preset-btn" title={p.desc} onClick={()=>{
                      const cw = canvasRef.current?.clientWidth||800, ch = canvasRef.current?.clientHeight||600;
                      const dropX = (cw/2 - view.x)/view.scale - 100;
                      const dropY = (ch/2 - view.y)/view.scale - 60;
                      const inst = instantiatePreset(k, dropX, dropY, diagram.resources);
                      if(!inst) return;
                      setDiagram(d => {
                        const nodes = {...d.nodes};
                        for(const n of inst.nodes) nodes[n.id] = n;
                        return {
                          ...d,
                          nodes,
                          edges: [...d.edges, ...inst.edges],
                          resources: [...d.resources, ...inst.newResources],
                        };
                      });
                      flash('Inserted preset: '+p.name);
                    }}>
                      <span className="preset-name">{p.name}</span>
                    </button>
                  ))}
                </div>
              </details>
            ));
          })()}
        </Section>

        <Section title="Bottlenecks" storageKey="sec-bottlenecks">
          <div className="warnings">
            {health.warnings.length===0 && <div className="desc" style={{margin:0}}>No issues detected.</div>}
            {health.warnings.map((w,i)=>(
              <div key={i} className={`warning ${w.severity==='bad'?'bad':''}`}>{w.text}</div>
            ))}
          </div>
        </Section>
      </div>

      {/* Center: canvas + bottom panels */}
      <div className="center">
        <div className="sim-controls">
          <div className="ctl-group">
            <button className="btn primary" onClick={stepOnce}><Icon.Step/>Step</button>
            <button className={`btn ${running?'warn':''}`} onClick={()=>setRunning(r=>!r)}>
              {running ? <><Icon.Pause/>Pause</> : <><Icon.Play/>Run</>}
            </button>
            <button className="btn ghost" onClick={()=>stepN(10)} title="Run 10 steps">+10</button>
            <button className="btn ghost" onClick={()=>stepN(50)} title="Run 50 steps">+50</button>
          </div>
          <div className="ctl-group">
            <button className="btn ghost icon-btn" onClick={undoStep} disabled={!history.length} title="Undo last step"><Icon.Undo/></button>
            <button className="btn ghost icon-btn" onClick={resetSim} title="Reset simulation"><Icon.Reset/></button>
          </div>
          <div className="ctl-divider"/>
          <div className="ctl-group">
            <button className="btn" onClick={()=>setAbOpen(true)} title="Compare two scenarios side-by-side">A/B</button>
            <button className="btn" onClick={()=>setSegOpen(true)} title="Simulate different player cohorts">Segments</button>
            <button className="btn" onClick={()=>setSolveOpen(true)} title="Find the parameter value that hits a target">Solve</button>
            <button className="btn" onClick={()=>setTornadoOpen(true)} title="Rank every knob by impact on a metric">Tornado</button>
          </div>
          <span className="step-display">step <strong>{diagram.currentStep}</strong></span>
        </div>

        <div className="canvas-wrap">
          <div
            ref={canvasRef}
            className={`canvas ${drag?.kind==='pan'?'dragging':''} ${paletteDrag?'drop-active':''}`}
            onMouseDown={onCanvasMouseDown}
            onWheel={onCanvasWheel}
            onDragOver={(e)=>{
              if(e.dataTransfer.types.includes('application/x-orchard-node-type')){
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(e)=>{
              const t = e.dataTransfer.getData('application/x-orchard-node-type');
              if(!t) return;
              e.preventDefault();
              const rect = canvasRef.current.getBoundingClientRect();
              const wx = (e.clientX - rect.left - view.x)/view.scale;
              const wy = (e.clientY - rect.top  - view.y)/view.scale;
              addNode(t, {x:wx, y:wy});
              setPaletteDrag(null);
            }}
            onContextMenu={(e)=>{
              e.preventDefault();
              const rect = canvasRef.current.getBoundingClientRect();
              const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
              const wx = (sx - view.x)/view.scale, wy = (sy - view.y)/view.scale;
              // Hit-test nodes
              const nodeEl = e.target.closest('.node');
              const nodeId = nodeEl?.dataset?.nodeId;
              if(nodeId && diagram.nodes[nodeId]){
                setSelection({kind:'node', id:nodeId});
                setRadial({ kind:'node', screenX: e.clientX, screenY: e.clientY, nodeId });
              } else {
                setRadial({ kind:'canvas', screenX: e.clientX, screenY: e.clientY, worldX: wx, worldY: wy });
              }
            }}
          >
            <div className="canvas-inner" style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.scale})`}}>
              {/* Groups (behind nodes) */}
              {(diagram.groups||[]).map(g => (
                <div key={g.id}
                  className={`group-rect ${selection?.kind==='group' && selection.id===g.id ? 'selected':''}`}
                  style={{left:g.x, top:g.y, width:g.w, height:g.h, color:g.color}}
                  onMouseDown={(e)=>onGroupMouseDown(e, g.id, 'move')}
                  onClick={(e)=>{ e.stopPropagation(); setSelection({kind:'group', id:g.id}); }}
                >
                  <div className="group-head" onMouseDown={(e)=>e.stopPropagation()}>
                    <input className="group-name" value={g.name}
                      onChange={(e)=>updateGroup(g.id, {name:e.target.value})}/>
                    <button className="group-del" title="Delete group (keeps nodes)" onClick={(e)=>{e.stopPropagation(); deleteGroup(g.id);}}>×</button>
                  </div>
                  <div className="group-resize" onMouseDown={(e)=>onGroupMouseDown(e, g.id, 'resize')}/>
                </div>
              ))}
              <svg className="edges" style={{width:4000,height:3000,position:'absolute',left:-1000,top:-1000,overflow:'visible'}}>
                <g transform="translate(1000,1000)">
                  {edgePaths.map(({e,d,labelX,labelY})=>{
                    const isSel = selection?.kind==='edge' && selection.id===e.id;
                    const flowing = diagram.currentStep>0;
                    return (
                      <g key={e.id}>
                        <path d={d} className={`edge-path ${e.kind==='signal'?'signal':''} ${e.conditional?'cond':''} ${isSel?'selected':''} ${flowing && e.kind!=='signal'?'flowing':''}`}
                          strokeDasharray={e.kind==='signal' ? '2 3' : (e.conditional ? '6 4' : (flowing ? '4 4' : 'none'))}/>
                        <path d={d} className="edge-hit"
                          onClick={(ev)=>{ ev.stopPropagation(); setSelection({kind:'edge',id:e.id}); }}/>
                        <rect className="edge-label-bg" x={labelX-22} y={labelY-9} width="44" height="18" rx="3"/>
                        <text className="edge-label" x={labelX} y={labelY+3} textAnchor="middle">{e.kind==='signal'?'~':''}{e.label} {e.resource.slice(0,4)}</text>
                      </g>
                    );
                  })}
                  {drag && drag.kind==='edge' && (() => {
                    const f = diagram.nodes[drag.fromId]; if(!f) return null;
                    const p = portPos(f, 'out');
                    return <path d={curvePath(p.x,p.y,mousePos.x,mousePos.y)} stroke="var(--ochre)" strokeWidth="2" strokeDasharray="4 3" fill="none"/>;
                  })()}
                </g>
              </svg>
              {Object.values(diagram.nodes).map(n=>(
                <NodeView key={n.id} node={n}
                  selected={selection?.kind==='node' && selection.id===n.id}
                  onMouseDown={onNodeMouseDown}
                  onPortDown={onPortDown}
                  onPortUp={onPortUp}
                  onClick={(id)=>setSelection({kind:'node',id})}
                  simStep={diagram.currentStep}
                  onSize={onNodeSize}
                />
              ))}
            </div>

            <div className={`hint ${hint?'show':''}`}>{hint}</div>

            <div style={{position:'absolute',bottom:10,right:10,display:'flex',gap:4}}>
              <button className="btn" onClick={()=>setView(v=>({...v,scale:Math.min(2,v.scale*1.2)}))}>+</button>
              <button className="btn" onClick={()=>setView(v=>({...v,scale:Math.max(.3,v.scale/1.2)}))}>−</button>
              <button className="btn" onClick={()=>{
                const nodes = Object.values(diagram.nodes||{});
                const groups = diagram.groups||[];
                if(!nodes.length && !groups.length){ setView({x:0,y:0,scale:1}); return; }
                let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
                for(const n of nodes){
                  const sz = nodeSizes[n.id] || {w:160, h:80};
                  minX=Math.min(minX,n.x); minY=Math.min(minY,n.y);
                  maxX=Math.max(maxX,n.x+sz.w); maxY=Math.max(maxY,n.y+sz.h);
                }
                for(const g of groups){
                  minX=Math.min(minX,g.x); minY=Math.min(minY,g.y);
                  maxX=Math.max(maxX,g.x+g.w); maxY=Math.max(maxY,g.y+g.h);
                }
                const pad = 40;
                const bw = maxX-minX, bh = maxY-minY;
                const cw = canvasRef.current?.clientWidth||800;
                const ch = canvasRef.current?.clientHeight||600;
                const scale = Math.min(2, Math.max(0.15, Math.min((cw-pad*2)/bw, (ch-pad*2)/bh)));
                const x = (cw - bw*scale)/2 - minX*scale;
                const y = (ch - bh*scale)/2 - minY*scale;
                setView({x, y, scale});
              }}>fit</button>
            </div>

            {Object.keys(diagram.nodes).length===0 && (
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                <div style={{textAlign:'center',color:'var(--ink-soft)',fontFamily:'var(--font-display)'}}>
                  <div style={{fontSize:32,marginBottom:8}}>🌱</div>
                  <div style={{fontSize:18}}>Plant your first node</div>
                  <div style={{fontSize:12,marginTop:4}}>Use the palette on the left, or pick a scenario.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom panel */}
        {(t.showAnalytics || t.showLog) && (
          <div className={`bottom ${bottomMin?'minimized':''}`}>
            <div className="bottom-bar">
              <span className="bottom-bar-title">Analytics & Log</span>
              <button className="panel-min" title={bottomMin?'Expand':'Minimize'} onClick={()=>setBottomMin(m=>!m)}>{bottomMin?'▴ Expand':'▾ Minimize'}</button>
            </div>
            {!bottomMin && (
              <div className="bottom-panels">
                {t.showAnalytics && (
                  <div className="panel">
                    <div className="tabs">
                      <button className={bottomTab==='analytics'?'active':''} onClick={()=>setBottomTab('analytics')}>KPIs & Charts</button>
                      <button className={bottomTab==='production'?'active':''} onClick={()=>setBottomTab('production')}>Production</button>
                      <button className={bottomTab==='pools'?'active':''} onClick={()=>setBottomTab('pools')}>Pool levels</button>
                    </div>
                    {bottomTab==='analytics' && <AnalyticsKPIs diagram={diagram} hist={analyticsHist}/>}
                    {bottomTab==='production' && <ProductionChart diagram={diagram} hist={analyticsHist}/>}
                    {bottomTab==='pools' && <PoolChart diagram={diagram} hist={analyticsHist}/>}
                  </div>
                )}
                {t.showLog && (
                  <div className="panel">
                    <div className="tabs">
                      <button className="active">Simulation log</button>
                      <button onClick={()=>setLog([])} style={{marginLeft:'auto',color:'var(--ink-soft)'}}>clear</button>
                    </div>
                    <div className="log">
                      {log.length===0 && <div style={{color:'var(--ink-soft)'}}>No log yet — step the simulation.</div>}
                      {log.slice(0,200).map((m,i)=>(
                        <div key={i} className={m.startsWith('—')?'head':(m.includes('!!!')?'err':'')}>{m}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right rail */}
      <div className="right-rail">
        <Inspector
          diagram={diagram}
          selection={selection}
          onUpdate={onSelectionUpdate}
          onDelete={onSelectionDelete}
          onClose={()=>setSelection(null)}
        />
        <NodeStateList diagram={diagram} onSelect={(id)=>setSelection({kind:'node',id})}/>
      </div>
    </div>
    <ABTestModal
      open={abOpen}
      onClose={()=>setAbOpen(false)}
      currentDiagram={diagram}
      templates={TEMPLATES}
      loadTemplate={loadTemplate}
    />
    <SegmentsModal
      open={segOpen}
      onClose={()=>setSegOpen(false)}
      currentDiagram={diagram}
    />
    <SolverModal open={solveOpen} onClose={()=>setSolveOpen(false)} currentDiagram={diagram}/>
    <TornadoModal open={tornadoOpen} onClose={()=>setTornadoOpen(false)} currentDiagram={diagram}/>
    <HelpModal open={helpOpen} onClose={()=>{ setHelpOpen(false); try { localStorage.setItem('orchard.helpSeen','1'); } catch(e){} }}/>    <SettingsModal open={settingsOpen} onClose={()=>setSettingsOpen(false)} t={t} setTweak={setTweak}/>
    {radial && <ContextMenu menu={radial} onClose={()=>setRadial(null)}
      onPick={(p)=>{
        const at = radial.kind==='canvas' ? { x: radial.worldX, y: radial.worldY } : null;
        const nodeId = radial.nodeId;
        setRadial(null);
        if(p.type==='add') addNode(p.action, at);
        else if(p.type==='addGroup') addGroup(at);
        else if(p.type==='duplicate' && nodeId) duplicateNode(nodeId);
        else if(p.type==='delete' && nodeId) deleteNode(nodeId);
      }}/>}
    </React.Fragment>
  );
}

function ResourceAdd({onAdd}){
  const [v,setV] = useState('');
  return (
    <form onSubmit={e=>{e.preventDefault(); onAdd(v); setV('');}} style={{display:'flex',gap:4,marginTop:6}}>
      <input type="text" value={v} onChange={e=>setV(e.target.value)} placeholder="e.g. mana"/>
      <button className="btn" type="submit"><Icon.Plus/></button>
    </form>
  );
}

// Curated color palette for resource swatches (12 distinguishable hues).
const RES_PALETTE = [
  '#5e7a3a','#c0623a','#d99a2b','#6b3a5c','#6e8aa4','#8a3a1c',
  '#3f5524','#a87aa0','#bfa055','#7fa0aa','#c47860','#e89438',
  '#2d6e6e','#9b4f96','#3a6ec0','#7a9248','#d04545','#46a173',
];

function ResourceChip({ name, color, onRename, onColor, onRemove }){
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(name);
  const popRef = useRef(null);

  // Keep editName in sync if name changes externally
  useEffect(()=>{ setEditName(name); }, [name]);

  // Click outside to close
  useEffect(()=>{
    if(!open) return;
    function onDoc(e){
      if(popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return ()=> document.removeEventListener('mousedown', onDoc);
  },[open]);

  function commitName(){
    const trimmed = editName.trim().toLowerCase();
    if(trimmed && trimmed !== name) onRename(trimmed);
    else setEditName(name);
  }

  return (
    <span className="chip res-chip" style={{position:'relative'}}>
      <button
        type="button"
        className="res-chip-body"
        onClick={()=>setOpen(o=>!o)}
        title="Edit resource"
      >
        <span className="swatch" style={{background:color}}/>
        <span>{name}</span>
      </button>
      <button
        type="button"
        className="res-chip-x"
        onClick={(e)=>{ e.stopPropagation(); onRemove(); }}
        title="Remove resource"
        aria-label={`Remove ${name}`}
      >×</button>
      {open && (
        <div ref={popRef} className="res-popover" onClick={e=>e.stopPropagation()}>
          <div className="res-pop-row">
            <input
              type="text"
              value={editName}
              onChange={e=>setEditName(e.target.value)}
              onKeyDown={e=>{
                if(e.key==='Enter'){ commitName(); setOpen(false); }
                else if(e.key==='Escape'){ setEditName(name); setOpen(false); }
              }}
              onBlur={commitName}
              autoFocus
              style={{width:'100%'}}
            />
          </div>
          <div className="res-pop-label">Color</div>
          <div className="res-pop-swatches">
            {RES_PALETTE.map(c => (
              <button
                key={c}
                type="button"
                className={`res-pop-sw ${c.toLowerCase()===color.toLowerCase()?'sel':''}`}
                style={{background:c}}
                onClick={()=>onColor(c)}
                aria-label={c}
              />
            ))}
            <label className="res-pop-sw custom" title="Custom color">
              <input
                type="color"
                value={color}
                onChange={e=>onColor(e.target.value)}
                style={{opacity:0,position:'absolute',inset:0,cursor:'pointer'}}
              />
              ⋯
            </label>
          </div>
        </div>
      )}
    </span>
  );
}

function NodeStateList({diagram, onSelect}){
  const nodes = Object.values(diagram.nodes);
  if(!nodes.length) return null;
  return (
    <div className="section">
      <h3><span>All Nodes ({nodes.length})</span></h3>
      <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:240,overflow:'auto'}}>
        {nodes.map(n=>(
          <div key={n.id}
            onClick={()=>onSelect(n.id)}
            style={{display:'flex',alignItems:'center',gap:6,padding:'4px 6px',borderRadius:6,cursor:'pointer',background:'var(--paper)',border:'1px solid var(--line)'}}>
            <NodeIcon type={n.type} size={14}/>
            <span style={{flex:1,fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n.name}</span>
            <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--ink-soft)'}}>{n.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Collapsible card. Persists open/closed in localStorage by storageKey.
function Section({title, children, storageKey, defaultCollapsed=false}){
  const [collapsed, setCollapsed] = useState(()=>{
    try {
      const v = localStorage.getItem('orchard.section.'+storageKey);
      if(v==null) return defaultCollapsed;
      return v==='1';
    } catch(e){ return defaultCollapsed; }
  });
  function toggle(){
    setCollapsed(c => {
      const nx = !c;
      try { localStorage.setItem('orchard.section.'+storageKey, nx?'1':'0'); } catch(e){}
      return nx;
    });
  }
  return (
    <div className={`section ${collapsed?'collapsed':''}`}>
      <h3 className="collapsible" onClick={toggle}>
        <span className="chev">▾</span>{title}
      </h3>
      {children}
    </div>
  );
}

function AnalyticsKPIs({diagram, hist}){
  if(!hist.length) return <div style={{padding:20,fontSize:11,color:'var(--ink-soft)'}}>Step simulation to populate KPIs.</div>;
  const last = hist[hist.length-1];
  const prev = hist[hist.length-2];
  const totalProd = (h) => Object.values(h?.total_production||{}).reduce((a,b)=>a+b, 0);
  const tNow = totalProd(last), tPrev = totalProd(prev);
  const cumul = hist.reduce((a,h)=>a+totalProd(h), 0);
  const avg = cumul / hist.length;
  const focus = diagram.resources[0];
  const focusNow = last.total_production?.[focus]||0;
  const focusPrev = prev?.total_production?.[focus]||0;
  const dStr = (d)=> d===0?'±0':(d>0?`+${d}`:`${d}`);
  const dCls = (d)=> d>0?'up':d<0?'down':'';
  const cap = Object.values(diagram.nodes).filter(n=>n.type==='pool').reduce((a,p)=>a+(p.capacity===Infinity?0:p.capacity),0);
  const load = Object.values(diagram.nodes).filter(n=>n.type==='pool').reduce((a,p)=>{ for(const k in p.resources) a+=p.resources[k]; return a; },0);

  return (
    <div>
      <div className="kpi-row">
        <div className="kpi"><div className="l">Total prod (step)</div><div className="v">{tNow}</div><div className={`d ${dCls(tNow-tPrev)}`}>{dStr(tNow-tPrev)} vs prev</div></div>
        <div className="kpi"><div className="l">Cumulative</div><div className="v">{cumul}</div><div className="d">avg {avg.toFixed(1)}/step</div></div>
        <div className="kpi"><div className="l">{focus} / step</div><div className="v">{focusNow}</div><div className={`d ${dCls(focusNow-focusPrev)}`}>{dStr(focusNow-focusPrev)} vs prev</div></div>
        <div className="kpi"><div className="l">Pool load</div><div className="v">{load}</div><div className="d">{cap?`/${cap} cap`:'∞ cap'}</div></div>
      </div>
      <ProductionChart diagram={diagram} hist={hist} compact/>
    </div>
  );
}

function ProductionChart({diagram, hist, compact}){
  const colorOf = (r,i) => diagram.resourceColors?.[r] || COLORS[i%COLORS.length];
  const series = diagram.resources.map((r,i)=>({
    name: r, color: colorOf(r,i),
    points: hist.map(h => ({x:h.step, y: h.total_production?.[r]||0}))
  })).filter(s=>s.points.some(p=>p.y>0));
  return <LineChart series={series} height={compact?160:240}/>;
}

function PoolChart({diagram, hist}){
  const pools = Object.values(diagram.nodes).filter(n=>n.type==='pool');
  const series = [];
  let ci = 0;
  pools.forEach(p => {
    const resourcesUsed = new Set();
    hist.forEach(h => { for(const r in (h.pool_levels?.[p.id]||{})) resourcesUsed.add(r); });
    resourcesUsed.forEach(r => {
      series.push({
        name: `${p.name}·${r}`,
        color: COLORS[ci++%COLORS.length],
        points: hist.map(h => ({x:h.step, y: h.pool_levels?.[p.id]?.[r]||0})),
      });
    });
  });
  return <LineChart series={series.slice(0,8)} height={240}/>;
}

function analyzeHealth(diagram, hist){
  const warnings = [];
  // capacity-bound pools
  for(const id in diagram.nodes){
    const n = diagram.nodes[id];
    if(n.type==='pool' && n.capacity!==Infinity){
      let load=0; for(const k in n.resources) load+=n.resources[k];
      if(load >= n.capacity*0.95 && n.capacity>0)
        warnings.push({severity:'bad', text:`Pool "${n.name}" is ${Math.round(load/n.capacity*100)}% full — flow may be blocked.`});
    }
    if(n.type==='drain'){
      const lastSteps = hist.slice(-5);
      const totalDemand = n.demand * lastSteps.length;
      // we don't have direct drain metrics; warn if its source pool is empty
      const inEdges = diagram.edges.filter(e=>e.to===id);
      const empty = inEdges.every(e => {
        const src = diagram.nodes[e.from];
        return src && src.type==='pool' && (src.resources[e.resource]||0)<=0;
      });
      if(inEdges.length>0 && empty) warnings.push({severity:'warn', text:`Drain "${n.name}" is starved — no resources available.`});
    }
    if(n.type==='converter' && !n.isProcessing && Object.keys(n.inputRecipe||{}).length){
      // look at last 5 cycles, are inputs available?
      const inEdges = diagram.edges.filter(e=>e.to===id);
      if(inEdges.length===0) warnings.push({severity:'bad', text:`Converter "${n.name}" has no input edges connected.`});
    }
    if(n.type==='source'){
      const out = diagram.edges.filter(e=>e.from===id);
      if(out.length===0) warnings.push({severity:'warn', text:`Source "${n.name}" has no outgoing edge.`});
    }
    if(n.type==='booster' && !n.targetId) warnings.push({severity:'warn', text:`Booster "${n.name}" has no target.`});
  }

  // health score
  const status = warnings.some(w=>w.severity==='bad')?'bad':(warnings.length>0?'warn':'good');
  const label = status==='good'?'Healthy':status==='warn'?'Minor issues':'Bottlenecks!';
  return { warnings, status, label };
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
