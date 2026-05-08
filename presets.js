// Presets — reusable mini-graphs that drop into an existing diagram.
// Each preset is a small set of nodes + edges with a fixed layout offset.
// User picks where to drop (canvas center). Wire-up is manual after insert.

const PRESETS = {
  // --- PRODUCTION & ECONOMY LOOPS ---
  prod_basic: {
    name: 'Basic Production Loop',
    category: 'Production',
    desc: 'Source → Pool → Converter → Pool → Drain. The classic resource pipeline.',
    resources: ['raw','goods'],
    nodes: [
      { id:'src', type:'source', name:'Raw Source', dx:0, dy:0, produces:'raw', rate:1 },
      { id:'pool_in', type:'pool', name:'Stockpile', dx:240, dy:0, resources:{raw:5}, capacity:200 },
      { id:'conv', type:'converter', name:'Workshop', dx:480, dy:0, inputRecipe:{raw:2}, outputProducts:{goods:1}, cycleTime:2 },
      { id:'pool_out', type:'pool', name:'Warehouse', dx:720, dy:0, resources:{}, capacity:Infinity },
      { id:'sink', type:'drain', name:'Market', dx:960, dy:0, consumes:'goods', demand:1 },
    ],
    edges: [
      ['src','pool_in','raw','2'],
      ['pool_in','conv','raw','2'],
      ['conv','pool_out','goods','1'],
      ['pool_out','sink','goods','1'],
    ]
  },
  prod_two_input: {
    name: 'Two-Input Crafting',
    category: 'Production',
    desc: 'Two raw resources combine in a converter (e.g. wood + iron → tools).',
    resources: ['mat_a','mat_b','craft'],
    nodes: [
      { id:'src_a', type:'source', name:'Source A', dx:0, dy:0, produces:'mat_a', rate:1 },
      { id:'src_b', type:'source', name:'Source B', dx:0, dy:160, produces:'mat_b', rate:1 },
      { id:'pool_a', type:'pool', name:'Pool A', dx:240, dy:0, resources:{mat_a:5}, capacity:200 },
      { id:'pool_b', type:'pool', name:'Pool B', dx:240, dy:160, resources:{mat_b:5}, capacity:200 },
      { id:'conv', type:'converter', name:'Combine', dx:480, dy:80, inputRecipe:{mat_a:1,mat_b:1}, outputProducts:{craft:1}, cycleTime:2 },
      { id:'pool_out', type:'pool', name:'Output', dx:720, dy:80, resources:{}, capacity:Infinity },
    ],
    edges: [
      ['src_a','pool_a','mat_a','2'], ['src_b','pool_b','mat_b','2'],
      ['pool_a','conv','mat_a','1'], ['pool_b','conv','mat_b','1'],
      ['conv','pool_out','craft','1'],
    ]
  },
  prod_to_market: {
    name: 'Production → Market → Coin',
    category: 'Production',
    desc: 'Full goods-to-coin loop. Drain converts goods into a coin pool.',
    resources: ['goods','coin'],
    nodes: [
      { id:'pool_in', type:'pool', name:'Goods', dx:0, dy:0, resources:{goods:10}, capacity:200 },
      { id:'sink', type:'drain', name:'Market Sale', dx:240, dy:0, consumes:'goods', demand:2 },
      { id:'pool_coin', type:'pool', name:'Coin', dx:480, dy:0, resources:{coin:0}, capacity:Infinity },
    ],
    edges: [
      ['pool_in','sink','goods','2'],
      ['sink','pool_coin','coin','15'],
    ]
  },
  prod_compost: {
    name: 'Compost / Byproduct Loop',
    category: 'Production',
    desc: 'Converter outputs a byproduct that feeds a booster on its own input.',
    resources: ['raw','goods','byprod'],
    nodes: [
      { id:'pool_in', type:'pool', name:'Input', dx:0, dy:0, resources:{raw:10}, capacity:200 },
      { id:'conv', type:'converter', name:'Workshop', dx:240, dy:0, inputRecipe:{raw:2}, outputProducts:{goods:1,byprod:1}, cycleTime:2 },
      { id:'pool_b', type:'pool', name:'Byproduct', dx:480, dy:160, resources:{}, capacity:80 },
      { id:'boost', type:'booster', name:'Recycle Boost', dx:0, dy:160, target:'', multiplier:1.5, duration:5, cost:{byprod:4}, cooldown:8 },
    ],
    edges: [
      ['pool_in','conv','raw','2'],
      ['conv','pool_b','byprod','1'],
      ['pool_b','boost','byprod','0'],
    ]
  },

  // --- PROGRESSION ---
  prog_energy: {
    name: 'Energy Refill Loop',
    category: 'Progression',
    desc: 'Energy regenerates and gates a play action.',
    resources: ['energy'],
    nodes: [
      { id:'src', type:'source', name:'Energy Regen', dx:0, dy:0, produces:'energy', rate:1 },
      { id:'pool', type:'pool', name:'Energy', dx:240, dy:0, resources:{energy:30}, capacity:60 },
      { id:'gate', type:'gate', name:'Has Energy', dx:480, dy:0, condition:'energy>=5' },
    ],
    edges: [
      ['src','pool','energy','3'],
      ['pool','gate','energy','0'],
    ]
  },
  prog_xp: {
    name: 'XP & Level Up',
    category: 'Progression',
    desc: 'XP accumulates; an event fires when a threshold is hit.',
    resources: ['xp'],
    nodes: [
      { id:'pool', type:'pool', name:'XP', dx:0, dy:0, resources:{}, capacity:Infinity },
      { id:'ev', type:'event', name:'Level Up', dx:240, dy:0, triggerType:'gate', period:0, payload:{} },
      { id:'gate', type:'gate', name:'XP >= 100', dx:240, dy:160, condition:'xp>=100' },
    ],
    edges: []
  },
  prog_daily: {
    name: 'Daily Login Reward',
    category: 'Progression',
    desc: 'Periodic event that drops a small currency reward.',
    resources: ['gem'],
    nodes: [
      { id:'ev', type:'event', name:'Daily Login', dx:0, dy:0, triggerType:'periodic', period:24, offset:0, payload:{gem:5} },
      { id:'pool', type:'pool', name:'Gems', dx:240, dy:0, resources:{}, capacity:Infinity },
    ],
    edges: [
      ['ev','pool','gem','5'],
    ]
  },

  // --- MONETIZATION ---
  mon_starter: {
    name: 'Starter Pack Offer',
    category: 'Monetization',
    desc: 'Triggered by a soft-currency threshold; converts at a fixed rate.',
    resources: ['soft_coin','gem','revenue'],
    nodes: [
      { id:'offer', type:'offer', name:'Starter Pack', dx:0, dy:0, triggerResource:'soft_coin', triggerThreshold:200, cooldown:8, conversionRate:0.08, price:499, reward:{gem:50, soft_coin:1000} },
      { id:'pool_rev', type:'pool', name:'Revenue', dx:240, dy:0, resources:{}, capacity:Infinity },
      { id:'pool_gem', type:'pool', name:'Gems', dx:240, dy:160, resources:{}, capacity:Infinity },
    ],
    edges: [
      ['offer','pool_rev','revenue','499'],
      ['offer','pool_gem','gem','50'],
    ]
  },
  mon_battle_pass: {
    name: 'Battle Pass',
    category: 'Monetization',
    desc: 'One-time periodic offer (every 30 steps) with a big reward.',
    resources: ['gem','xp','revenue'],
    nodes: [
      { id:'offer', type:'offer', name:'Battle Pass', dx:0, dy:0, triggerResource:'xp', triggerThreshold:50, cooldown:30, conversionRate:0.12, price:999, reward:{gem:200,xp:500} },
      { id:'pool_rev', type:'pool', name:'Revenue', dx:240, dy:0, resources:{}, capacity:Infinity },
    ],
    edges: [
      ['offer','pool_rev','revenue','999'],
    ]
  },
  mon_gacha: {
    name: 'Gacha / Loot Box',
    category: 'Monetization',
    desc: 'Drain consumes hard currency and routes to revenue.',
    resources: ['gem','revenue'],
    nodes: [
      { id:'pool_g', type:'pool', name:'Gems', dx:0, dy:0, resources:{gem:50}, capacity:Infinity },
      { id:'sink', type:'drain', name:'Gacha Pull', dx:240, dy:0, consumes:'gem', demand:10 },
      { id:'pool_rev', type:'pool', name:'Revenue', dx:480, dy:0, resources:{}, capacity:Infinity },
    ],
    edges: [
      ['pool_g','sink','gem','10'],
      ['sink','pool_rev','revenue','100'],
    ]
  },
  mon_iap: {
    name: 'IAP Bundle Pack',
    category: 'Monetization',
    desc: 'Pure event-based purchase: fires on a schedule, generating revenue + currency.',
    resources: ['gem','revenue'],
    nodes: [
      { id:'ev', type:'event', name:'IAP Promo', dx:0, dy:0, triggerType:'periodic', period:7, offset:3, payload:{gem:100, revenue:299} },
      { id:'pool_g', type:'pool', name:'Gems', dx:240, dy:0, resources:{}, capacity:Infinity },
      { id:'pool_rev', type:'pool', name:'Revenue', dx:240, dy:160, resources:{}, capacity:Infinity },
    ],
    edges: [
      ['ev','pool_g','gem','100'],
      ['ev','pool_rev','revenue','299'],
    ]
  },

  // --- ECONOMY HEALTH / FLOW ---
  flow_split: {
    name: 'Spend Splitter',
    category: 'Flow',
    desc: 'Routes one currency into two sinks by ratio. Tune share for spend mix.',
    resources: ['coin'],
    nodes: [
      { id:'sp', type:'splitter', name:'Spend Split', dx:0, dy:0, mode:'ratio' },
      { id:'sink_a', type:'drain', name:'Upgrades', dx:240, dy:-80, consumes:'coin', demand:30 },
      { id:'sink_b', type:'drain', name:'Cosmetics', dx:240, dy:80, consumes:'coin', demand:15 },
    ],
    edges: [
      ['sp','sink_a','coin','30',false,null,{share:2}],
      ['sp','sink_b','coin','15',false,null,{share:1}],
    ]
  },
  flow_delay: {
    name: 'Crafting Queue (Delay)',
    category: 'Flow',
    desc: 'Resources feed in, emerge N steps later.',
    resources: ['raw','crafted'],
    nodes: [
      { id:'pool_in', type:'pool', name:'Queue Input', dx:0, dy:0, resources:{raw:5}, capacity:100 },
      { id:'delay', type:'delay', name:'Build Time (3)', dx:240, dy:0, delay:3 },
      { id:'pool_out', type:'pool', name:'Crafted', dx:480, dy:0, resources:{}, capacity:Infinity },
    ],
    edges: [
      ['pool_in','delay','raw','1'],
      ['delay','pool_out','crafted','1'],
    ]
  },
  flow_sink: {
    name: 'Currency Sink',
    category: 'Flow',
    desc: 'Drain consumes currency at a fixed rate. Use to balance inflation.',
    resources: ['coin'],
    nodes: [
      { id:'sink', type:'drain', name:'Maintenance', dx:0, dy:0, consumes:'coin', demand:5 },
    ],
    edges: []
  },
  flow_market: {
    name: 'Two-Resource Market',
    category: 'Flow',
    desc: 'Bidirectional exchange between two pools at a price.',
    resources: ['coin','gem'],
    nodes: [
      { id:'pool_a', type:'pool', name:'Coin', dx:0, dy:0, resources:{coin:100}, capacity:Infinity },
      { id:'pool_b', type:'pool', name:'Gems', dx:480, dy:0, resources:{gem:0}, capacity:Infinity },
      { id:'mk', type:'market', name:'Exchange', dx:240, dy:0, resA:'coin', resB:'gem', baseRate:10, elasticity:0.1 },
    ],
    edges: []
  },
};

function instantiatePreset(key, dropX, dropY, existingResources){
  const p = PRESETS[key];
  if(!p) return null;
  const idMap = {};
  const nodes = [];
  for(const n of p.nodes){
    const newId = RFSim.uid();
    idMap[n.id] = newId;
    const node = JSON.parse(JSON.stringify(Object.assign({
      isProcessing:false,cycleProgress:0,batchInputs:{},outputBuffer:{},isOpen:false,active:true,remaining:Infinity,consumedLast:0
    }, n)));
    node.id = newId;
    node.x = dropX + (n.dx||0);
    node.y = dropY + (n.dy||0);
    delete node.dx; delete node.dy;
    nodes.push(node);
  }
  const edges = (p.edges||[]).map(arr => {
    const [f,to,r,l,c,g,extra] = arr;
    const e = { id: RFSim.uid(), from:idMap[f], to:idMap[to], resource:r, label:l||'1', conditional:!!c, gateId: g?idMap[g]:null, kind:'flow', share:1, priority:0 };
    if(extra) Object.assign(e, extra);
    return e;
  });
  // Resources to merge
  const newResources = (p.resources||[]).filter(r => !existingResources.includes(r));
  return { nodes, edges, newResources };
}

window.PRESETS = PRESETS;
window.instantiatePreset = instantiatePreset;
