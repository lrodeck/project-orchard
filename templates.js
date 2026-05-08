// Templates — starter economies (kept minimal: blank + the two F2P/LiveOps cases)
const TEMPLATES = {
  blank: { name: 'Blank', nodes: [], edges: [], resources: ['gold','wood','stone','food'] },

  ftp: {
    name: 'F2P Soft + Hard Currency',
    resources: ['energy','soft_coin','gem','xp'],
    nodes: [
      { id:'s1', type:'source', name:'Energy Regen', x:80, y:120, produces:'energy', rate:1 },
      { id:'s2', type:'source', name:'Daily Login', x:80, y:300, produces:'gem', rate:1 },
      { id:'p1', type:'pool', name:'Energy', x:320, y:120, resources:{energy:30}, capacity:60 },
      { id:'p2', type:'pool', name:'Gems', x:320, y:300, resources:{gem:10}, capacity:Infinity },
      { id:'c1', type:'converter', name:'Play Mission', x:580, y:120, inputRecipe:{energy:5}, outputProducts:{soft_coin:50,xp:10}, cycleTime:1 },
      { id:'p3', type:'pool', name:'Soft Coin', x:820, y:120, resources:{soft_coin:200}, capacity:Infinity },
      { id:'p4', type:'pool', name:'XP', x:820, y:240, resources:{}, capacity:Infinity },
      { id:'d1', type:'drain', name:'Shop Buy', x:1080, y:120, consumes:'soft_coin', demand:30 },
    ],
    edges: [
      ['s1','p1','energy','3'],['s2','p2','gem','1'],
      ['p1','c1','energy','5'],
      ['c1','p3','soft_coin','50'],['c1','p4','xp','10'],
      ['p3','d1','soft_coin','30'],
    ]
  },

  sweep_playground: {
    name: 'Sweep Playground',
    resources: ['energy','coin','xp'],
    nodes: [
      // The knob: how many coins the Play Loop pays out per cycle.
      // Sweep this between 5 and 60 to see goal pass-times sweep too.
      { id:'s1', type:'source', name:'Energy Regen', x:80, y:140, produces:'energy', rate:5 },
      { id:'p1', type:'pool', name:'Energy', x:320, y:140, resources:{energy:0}, capacity:Infinity },
      { id:'c1', type:'converter', name:'Play Loop', x:560, y:140, inputRecipe:{energy:5}, outputProducts:{coin:20, xp:8}, cycleTime:1 },
      { id:'p2', type:'pool', name:'Wallet', x:800, y:80, resources:{coin:0}, capacity:Infinity },
      { id:'p3', type:'pool', name:'XP Bank', x:800, y:240, resources:{xp:0}, capacity:Infinity },
      { id:'d1', type:'drain', name:'Daily Costs', x:1040, y:80, consumes:'coin', demand:5 },
      { id:'g1', type:'goal', name:'Reach 500 coins', x:1280, y:80, condition:'pool.coin >= 500' },
      { id:'g2', type:'goal', name:'Reach level 5 (200 xp)', x:1280, y:240, condition:'pool.xp >= 200' },
    ],
    edges: [
      ['s1','p1','energy','5'],
      ['p1','c1','energy','5'],
      ['c1','p2','coin','20'],
      ['c1','p3','xp','8'],
      ['p2','d1','coin','5'],
    ]
  },

  bigfarm: {
    name: 'Big Farm',
    resources: ['wildflowers','corn','chicken_feed','eggs','dung','fertilizer','apples','soft_coin'],
    groups: [
      { name:'Wildflower Field', x:40, y:20, w:520, h:200, color:'#bfa055' },
      { name:'Chicken Loop',     x:40, y:240, w:1140, h:240, color:'#d99a2b' },
      { name:'Orchard Loop',     x:892, y:565, w:1140, h:200, color:'#5e7a3a' },
      { name:'Egg Booster Tier', x:1202, y:248, w:200, h:240, color:'#c0623a' },
    ],
    nodes: [
      // --- Wildflower Field — free pick, sells direct ---
      { id:'sWF', type:'source', name:'Acre (Wildflowers)', x:80, y:90, produces:'wildflowers', rate:3 },
      { id:'mWF', type:'market', name:'Flower Market', x:340, y:90, resourceA:'wildflowers', resourceB:'soft_coin', baseRate:2, reserveA:0, reserveB:1000, drift:0.001 },

      // --- Corn → Mill → Chicken Coop → Eggs / Dung ---
      { id:'sCorn', type:'source', name:'Acre (Corn)', x:80, y:330, produces:'corn', rate:4 },
      { id:'pCorn', type:'pool', name:'Corn Silo', x:280, y:330, resources:{corn:0}, capacity:200 },
      { id:'cMill', type:'converter', name:'Mill', x:480, y:330,
        inputRecipe:{corn:4}, outputProducts:{chicken_feed:2}, cycleTime:2 },
      { id:'cCoop', type:'converter', name:'Chicken Coop', x:700, y:330,
        inputRecipe:{chicken_feed:2}, outputProducts:{eggs:3, dung:1}, cycleTime:3 },
      { id:'pEggs', type:'pool', name:'Egg Crate', x:920, y:300, resources:{eggs:0}, capacity:Infinity },
      { id:'mEggs', type:'market', name:'Egg Market', x:920, y:420, resourceA:'eggs', resourceB:'soft_coin', baseRate:5, reserveA:0, reserveB:2000, drift:0.001 },
      { id:'gEggs', type:'gate', name:'Eggs ≥ 50?', x:1242, y:268,
        condPoolId:'pEggs', condResource:'eggs', threshold:50, op:'>=' },
      { id:'bBoost', type:'booster', name:'Harvest Boost', x:1242, y:368,
        targetId:'sCorn', boostType:'multiplicative', amount:1.25, duration:30, remaining:30, active:true },

      // --- Dung → Silo → Fertilizer → Orchard → Apples ---
      { id:'pDung', type:'pool', name:'Dung Silo', x:1132, y:645, resources:{dung:0}, capacity:120 },
      { id:'cFert', type:'converter', name:'Fertilizer Plant', x:1332, y:645,
        inputRecipe:{dung:5}, outputProducts:{fertilizer:2}, cycleTime:3 },
      { id:'sApple', type:'source', name:'Acre (Apple Trees)', x:1532, y:645, produces:'apples', rate:1 },
      { id:'cOrch', type:'converter', name:'Orchard', x:1732, y:645,
        inputRecipe:{fertilizer:1, apples:2}, outputProducts:{apples:5}, cycleTime:4 },
      { id:'mApple', type:'market', name:'Apple Market', x:1932, y:645, resourceA:'apples', resourceB:'soft_coin', baseRate:8, reserveA:0, reserveB:2000, drift:0.001 },

      // Soft-coin sink for accounting
      { id:'pCoin', type:'pool', name:'Wallet', x:2311, y:297, resources:{soft_coin:0}, capacity:Infinity },

      // Goal: profitability check
      { id:'gProfit', type:'goal', name:'Earn 5,000 soft_coin', x:1280, y:90, condition:'pool.soft_coin >= 5000' },
    ],
    edges: [
      // Wildflower → market → wallet
      ['sWF','mWF','wildflowers','3'],
      ['mWF','pCoin','soft_coin','99'],

      // Corn pipeline
      ['sCorn','pCorn','corn','4'],
      ['pCorn','cMill','corn','4'],
      ['cMill','cCoop','chicken_feed','2'],
      ['cCoop','pEggs','eggs','3'],
      ['cCoop','pDung','dung','1'],
      ['pEggs','mEggs','eggs','5'],
      ['mEggs','pCoin','soft_coin','99'],

      // Gate watches egg pool; conditional flow re-enables booster
      ['pEggs','gEggs','eggs','1', false, null, { kind:'signal' }],

      // Dung → fertilizer → orchard
      ['pDung','cFert','dung','5'],
      ['cFert','cOrch','fertilizer','2'],
      ['sApple','cOrch','apples','1'],
      ['cOrch','mApple','apples','5'],
      ['mApple','pCoin','soft_coin','99'],
    ],
  },

  liveops: {
    name: 'Live Ops + Monetization',
    resources: ['energy','soft_coin','gem','xp','revenue'],
    nodes: [
      { id:'s1', type:'source', name:'Energy Regen', x:60, y:80, produces:'energy', rate:1 },
      { id:'p1', type:'pool', name:'Energy', x:280, y:80, resources:{energy:30}, capacity:60 },
      { id:'c1', type:'converter', name:'Mission', x:520, y:80, inputRecipe:{energy:5}, outputProducts:{soft_coin:50,xp:10}, cycleTime:1 },
      { id:'p2', type:'pool', name:'Wallet', x:760, y:80, resources:{soft_coin:300}, capacity:Infinity },
      { id:'sp1', type:'splitter', name:'Spend Split', x:1000, y:80, mode:'ratio' },
      { id:'d1', type:'drain', name:'Upgrades', x:1240, y:0, consumes:'soft_coin', demand:40 },
      { id:'d2', type:'drain', name:'Cosmetics', x:1240, y:160, consumes:'soft_coin', demand:20 },
      { id:'ev1', type:'event', name:'Weekend Sale', x:60, y:280, triggerType:'periodic', period:14, offset:7, payload:{gem:30} },
      { id:'p3', type:'pool', name:'Gems', x:280, y:280, resources:{gem:5}, capacity:Infinity },
      { id:'of1', type:'offer', name:'Starter Pack', x:520, y:280, triggerResource:'soft_coin', triggerThreshold:200, cooldown:8, conversionRate:0.08, price:499, reward:{gem:50, soft_coin:1000} },
      { id:'p4', type:'pool', name:'Revenue', x:760, y:280, resources:{}, capacity:Infinity },
      { id:'dl1', type:'delay', name:'Crafting (3)', x:520, y:460, delay:3 },
      { id:'p5', type:'pool', name:'Crafted Items', x:760, y:460, resources:{}, capacity:Infinity },
    ],
    edges: [
      ['s1','p1','energy','3'],['p1','c1','energy','5'],
      ['c1','p2','soft_coin','50'],
      ['p2','sp1','soft_coin','40'],
      ['sp1','d1','soft_coin','40',false,null,{share:2}],
      ['sp1','d2','soft_coin','20',false,null,{share:1}],
      ['ev1','p3','gem','30'],
      ['p2','of1','soft_coin','0'],
      ['of1','p4','revenue','499'],
      ['of1','p3','gem','50'],
      ['of1','p2','soft_coin','1000'],
      ['c1','dl1','xp','10'],
      ['dl1','p5','xp','10'],
    ]
  },
};

function loadTemplate(key){
  const t = TEMPLATES[key];
  if(!t) return null;
  const nodes = {};
  for(const n of t.nodes) nodes[n.id] = JSON.parse(JSON.stringify(Object.assign({
    isProcessing:false,cycleProgress:0,batchInputs:{},outputBuffer:{},isOpen:false,active:true,remaining:Infinity,consumedLast:0
  }, n)));
  const edges = t.edges.map(arr => {
    const [f,to,r,l,c,g,extra] = arr;
    const e = { id: RFSim.uid(), from:f, to, resource:r, label:l||'1', conditional:!!c, gateId:g||null, kind:'flow', share:1, priority:0 };
    if(extra) Object.assign(e, extra);
    return e;
  });
  const groups = (t.groups||[]).map(g => Object.assign({ id: RFSim.uid() }, g));
  return {
    name: t.name, nodes, edges, groups, resources: t.resources.slice(), currentStep: 0,
  };
}

window.TEMPLATES = TEMPLATES;
window.loadTemplate = loadTemplate;
