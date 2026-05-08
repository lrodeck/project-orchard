// Help / How-To modal — onboarding for first-time users
function HelpModal({ open, onClose }){
  const [tab, setTab] = React.useState('start');
  if(!open) return null;

  const tabs = [
    {id:'start', label:'Getting started'},
    {id:'nodes', label:'Node types'},
    {id:'edges', label:'Edges'},
    {id:'formulas', label:'Formulas & conditions'},
    {id:'goals', label:'Goal nodes'},
    {id:'ab', label:'A/B Test'},
    {id:'seg', label:'Segments'},
    {id:'tips', label:'Tips & shortcuts'},
  ];

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal help-modal" onClick={e=>e.stopPropagation()}>
        <div className="help-head">
          <h2 style={{margin:0}}>How to use Orchard</h2>
          <button className="btn ghost" onClick={onClose} style={{padding:'4px 10px'}}>×</button>
        </div>
        <div className="help-body">
          <nav className="help-nav">
            {tabs.map(t=>(
              <button key={t.id} className={`help-nav-btn ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>
            ))}
          </nav>
          <div className="help-content">
            {tab==='start' && <HelpStart/>}
            {tab==='nodes' && <HelpNodes/>}
            {tab==='edges' && <HelpEdges/>}
            {tab==='formulas' && <HelpFormulas/>}
            {tab==='goals' && <HelpGoals/>}
            {tab==='ab' && <HelpAB/>}
            {tab==='seg' && <HelpSegments/>}
            {tab==='tips' && <HelpTips/>}
          </div>
        </div>
      </div>
    </div>
  );
}

function HelpStart(){
  return (<>
    <h3>What is this?</h3>
    <p>Orchard is a node-graph economy balancing tool. You build a diagram of how resources flow through your game, step the simulation forward, and watch what happens. Nodes produce, store, transform, and consume resources; edges carry them between.</p>
    <h3>The 60-second tour</h3>
    <ol>
      <li><b>Pick a scenario.</b> In the left sidebar under <i>Scenarios</i>, click <b>F2P Soft + Hard Currency</b> to load a starter economy.</li>
      <li><b>Step it.</b> Click <b>Run</b> in the sim controls (or hit <b>Step</b> for one tick at a time). Numbers on each node update live.</li>
      <li><b>Read the output.</b> The bottom panel switches between Analytics (charts), Log (events per step), and KPIs.</li>
      <li><b>Tweak something.</b> Click any node to open the Inspector on the right. Change a Source's rate, a Drain's demand, a Gate's threshold — the next step reflects it.</li>
      <li><b>Compare changes.</b> Open <b>A/B Test</b> to run your current diagram against a tweaked variant side-by-side.</li>
    </ol>
    <h3>The mental model</h3>
    <p>Each <b>step</b> is one tick of game-time. What a step represents (a second, a minute, a player session) is up to you — keep it consistent. On every step, all nodes evaluate in a fixed order: sources produce → splitters route → converters consume/produce → gates check → drains pull → events fire → tombolas roll → goals evaluate.</p>
  </>);
}

function HelpNodes(){
  const nodes = [
    {n:'Source', d:'Produces a resource each step. Set its production rate on outgoing edges (label = rate per step).'},
    {n:'Pool', d:'Stores resources. Set capacity (or "inf"). Initial values seed the economy.'},
    {n:'Drain', d:'Consumes a resource each step at a fixed demand. Models upkeep, costs, decay.'},
    {n:'Converter', d:'Recipe-based: takes input resources and outputs others on a cycle (e.g. 3 wood + 1 stone → 1 plank, every 2 steps).'},
    {n:'Gate', d:'Opens/closes based on a condition (e.g. pool.gold >= 100). Conditional edges only flow when their gate is open.'},
    {n:'Booster', d:'Multiplies or adds to a target node\'s rate while active. Connect a Signal edge to override the boost amount.'},
    {n:'Splitter', d:'Routes inflow across outgoing edges by ratio (share) or priority order. Useful for fan-out.'},
    {n:'Delay', d:'Buffers resources for N steps before emitting. Models build queues, research, shipping.'},
    {n:'Event', d:'Fires periodically (every N steps), once at step X, or when a gate opens. Each fire emits a payload of resources.'},
    {n:'Market', d:'Two-way exchange between two resources with elastic pricing. Reserves move with trade volume.'},
    {n:'Offer', d:'Monetization touchpoint. Tracks shows, conversions, conversion rate. Can be gated and produce hard currency.'},
    {n:'Tombola', d:'Mystery box with weighted random outputs. Multiple prizes per pull, unique-or-replacement, max pulls/step.'},
    {n:'Goal', d:'Assertion that evaluates a condition each step. Status shows pending → pass / fail. Great for "did we hit the design target?"'},
  ];
  return (<>
    <h3>Node types</h3>
    <div className="help-grid">
      {nodes.map(x=><div key={x.n} className="help-card"><b>{x.n}</b><div>{x.d}</div></div>)}
    </div>
  </>);
}

function HelpEdges(){
  return (<>
    <h3>Edges</h3>
    <p>Drag from a node's <b>right port</b> to another node's <b>left port</b> to connect them. Click the edge to open its inspector.</p>
    <h4>Edge kinds</h4>
    <ul>
      <li><b>Flow</b> — carries a resource. The label is the rate per step (supports formulas: "5", "2d6", "3+pool.gold/100").</li>
      <li><b>Signal</b> — carries a control value to Boosters or Gates. Doesn't move resources.</li>
    </ul>
    <h4>Edge properties</h4>
    <ul>
      <li><b>Share</b> — ratio for splitter outputs. 2:1:1 means 50% / 25% / 25%.</li>
      <li><b>Priority</b> — order for priority-mode splitters. Lower fills first.</li>
      <li><b>Conditional</b> — only flows when its referenced Gate is open.</li>
    </ul>
  </>);
}

function HelpFormulas(){
  return (<>
    <h3>Formulas</h3>
    <p>Most numeric fields (edge labels, source rates, gate thresholds, goal conditions) accept formulas, not just numbers.</p>
    <h4>Variables</h4>
    <ul>
      <li><code>step</code> — current step number</li>
      <li><code>pool.&lt;resource&gt;</code> — total of that resource across all pools (e.g. <code>pool.gold</code>)</li>
      <li><code>prod.&lt;resource&gt;</code> — total production this step</li>
      <li><code>cons.&lt;resource&gt;</code> — total consumption this step</li>
    </ul>
    <h4>Operators</h4>
    <ul>
      <li>Arithmetic: <code>+ - * / %</code></li>
      <li>Comparison: <code>&gt;= &lt;= &gt; &lt; == !=</code></li>
      <li>Logical: <code>and</code>, <code>or</code>, <code>not</code></li>
      <li>Dice: <code>2d6</code> (roll 2 six-sided), <code>3d10+5</code></li>
      <li>Functions: <code>min(a,b)</code>, <code>max(a,b)</code>, <code>floor(x)</code>, <code>ceil(x)</code>, <code>random()</code></li>
    </ul>
    <h4>Examples</h4>
    <pre>{`5                          // constant
2d6                        // random 2-12
pool.gold / 100            // 1% of total gold
floor(step / 10) + 1       // step up every 10 ticks
pool.gem >= 10 and pool.gold >= 500   // compound condition`}</pre>
  </>);
}

function HelpGoals(){
  return (<>
    <h3>Goal nodes</h3>
    <p>Goals are assertions that watch the simulation and report pass/fail. Use them to encode <i>"did the design target hold?"</i> — minimum DAU production, gem balance ceilings, time-to-first-purchase, etc.</p>
    <h4>How to use</h4>
    <ol>
      <li>Click <b>Goal</b> in the left palette (bullseye icon). It drops at canvas center.</li>
      <li>Select it, set a <b>Name</b> (e.g. "Reach 500 coins by step 100").</li>
      <li>Set <b>Condition</b> to a boolean formula:
        <ul>
          <li><code>pool.soft_coin &gt;= 500</code> — pool threshold</li>
          <li><code>prod.gem &gt;= 5</code> — production rate target</li>
          <li><code>step &gt;= 100 and pool.gold &gt;= 1000</code> — compound timed goal</li>
          <li><code>cons.energy &lt;= prod.energy</code> — economy is sustainable</li>
        </ul>
      </li>
      <li>Run the sim. The badge flips ⌛ pending → ✓ pass once true (or stays pending if never).</li>
    </ol>
    <h4>Pairing with A/B Test</h4>
    <p>Drop a Goal node, then open A/B Test and tweak a Source rate on the B variant. Run both — A passes, B fails. Instant proof your change broke the loop.</p>
  </>);
}

function HelpAB(){
  return (<>
    <h3>A/B Test</h3>
    <p>Compare your current diagram against a tweaked variant of itself. Both run in parallel; analytics overlay so you can see divergence.</p>
    <h4>How to use</h4>
    <ol>
      <li>Build a diagram you want to test.</li>
      <li>Click <b>A/B Test</b> in the sim controls.</li>
      <li>The modal lists every tunable node. <b>A — Control</b> uses your current values. Switch to <b>B — Variant</b> and type new values into any field to override (placeholder shows the inherited value).</li>
      <li>Set step count and trial count (Monte Carlo — averages across N runs to smooth out RNG).</li>
      <li>Hit <b>Run comparison</b>. Sparklines show pool levels and production for each side.</li>
    </ol>
    <h4>Tips</h4>
    <ul>
      <li>Override fields turn ochre when set. Click the ↺ to revert to inherited.</li>
      <li>The override count badge on each tab tells you how much you've changed.</li>
      <li>Goals show pass/fail per side — fastest sanity check there is.</li>
    </ul>
  </>);
}

function HelpSegments(){
  return (<>
    <h3>Player Segments</h3>
    <p>Run the simulation against a population of player cohorts (Casual F2P, Engaged, Minnow, Whale, etc.) instead of a single average player. Output is a weighted mix with p10 / p50 / p90 distribution bands.</p>
    <h4>Segment fields</h4>
    <ul>
      <li><b>Population %</b> — what share of your players this cohort represents.</li>
      <li><b>Activity rate</b> — chance of acting on any given step (0–1).</li>
      <li><b>Spend multiplier</b> — scales monetization touchpoints (Offers, Tombola pulls).</li>
      <li><b>Sessions / day</b> + <b>session length</b> — drives effective steps-per-day.</li>
      <li><b>Has booster</b> — toggles whether this cohort gets the booster effect.</li>
    </ul>
    <h4>How to use</h4>
    <ol>
      <li>Click <b>Segments</b> in the sim controls.</li>
      <li>Edit cohorts (or use the defaults — they cover the standard F2P pyramid).</li>
      <li>Set step count and trial count.</li>
      <li>Hit <b>Run</b>. Each segment gets its own KPI breakdown; the chart shows the weighted population result with confidence bands.</li>
    </ol>
  </>);
}

function HelpTips(){
  return (<>
    <h3>Tips & shortcuts</h3>
    <h4>Canvas</h4>
    <ul>
      <li><b>Drag</b> empty space to pan, <b>scroll</b> to zoom.</li>
      <li><b>Click</b> a node to select; <b>right-click</b> for Duplicate / Delete.</li>
      <li><b>Drag</b> from a right port to a left port to wire an edge.</li>
      <li>Hold <b>Shift</b> while dragging a node to snap to grid.</li>
    </ul>
    <h4>Sim</h4>
    <ul>
      <li><b>Step</b> = one tick. <b>Run</b> = continuous. <b>+10 / +50</b> = burst.</li>
      <li><b>Reset</b> clears pool levels back to initial state without changing the diagram.</li>
      <li><b>Undo</b> reverts the last sim step (not diagram edits).</li>
    </ul>
    <h4>Workflow</h4>
    <ul>
      <li>Start from a scenario — never blank — then trim it down.</li>
      <li>Use <b>Goals</b> to encode your design targets <i>before</i> tuning. They tell you when you're done.</li>
      <li>Use <b>Presets</b> in the sidebar for reusable mini-loops (production-to-market, gacha, season pass, etc.).</li>
      <li>Save often — JSON export round-trips cleanly.</li>
    </ul>
  </>);
}

window.HelpModal = HelpModal;
