// Settings modal — themes (with theme-fitting Google Fonts) + density + layout + panels
const { useState: useStateSettings, useEffect: useEffectSettings } = React;

// Each theme bundles a display font, body font, and mono font from Google Fonts.
// The heroFont is shown big on the theme card preview.
const THEMES = [
  { id:'cottage',     name:'Cottage Core',  desc:'Warm linen + moss. Storybook serifs.',
    bg:'#f3eedd', accent:'#5e7a3a', accent2:'#c0623a', ink:'#2b2417',
    fonts:{ display:"'Fraunces'", body:"'Inter'", mono:"'JetBrains Mono'" } },
  { id:'solarpunk',   name:'Solar Punk',    desc:'Sun-bleached greens. Optimistic geometric.',
    bg:'#eef4e0', accent:'#3f7a3a', accent2:'#e07a3a', ink:'#1f2d18',
    fonts:{ display:"'Outfit'", body:"'Outfit'", mono:"'JetBrains Mono'" } },
  { id:'whimsy-goth', name:'Whimsy Goth',   desc:'Velvet midnight + plum. Romantic display.',
    bg:'#1f1a24', accent:'#7a8a3a', accent2:'#a87aa0', ink:'#e8dcc6',
    fonts:{ display:"'Cormorant Garamond'", body:"'EB Garamond'", mono:"'Fira Code'" } },
  { id:'dawn',        name:'Dawn',          desc:'Pink desert sunrise. Editorial warmth.',
    bg:'#f5e8d6', accent:'#7a6033', accent2:'#d65a2a', ink:'#3d2418',
    fonts:{ display:"'Playfair Display'", body:"'Lora'", mono:"'IBM Plex Mono'" } },
  { id:'pro',         name:'Pro Live Ops',  desc:'Clinical product UI. Neutral and tight.',
    bg:'#f4f6f9', accent:'#0f766e', accent2:'#dc2626', ink:'#0f172a',
    fonts:{ display:"'Inter'", body:"'Inter'", mono:"'IBM Plex Mono'" } },
  // New themes
  { id:'terminal',    name:'Terminal',      desc:'Phosphor green on slate. Hacker-classic.',
    bg:'#0d1117', accent:'#3fb950', accent2:'#f0883e', ink:'#c9d1d9',
    fonts:{ display:"'Space Mono'", body:"'IBM Plex Mono'", mono:"'IBM Plex Mono'" } },
  { id:'paper',       name:'Paper Mono',    desc:'Pure ink-on-paper. Minimal monochrome.',
    bg:'#fafaf7', accent:'#1a1a1a', accent2:'#6b6b6b', ink:'#0a0a0a',
    fonts:{ display:"'Newsreader'", body:"'Newsreader'", mono:"'JetBrains Mono'" } },
  { id:'arcade',      name:'Arcade Neon',   desc:'CRT pink & cyan. Retro-future swagger.',
    bg:'#15102a', accent:'#ff5fb3', accent2:'#5fe0ff', ink:'#f0e8ff',
    fonts:{ display:"'Press Start 2P'", body:"'Space Grotesk'", mono:"'Space Mono'" } },
  { id:'bauhaus',     name:'Bauhaus',       desc:'Primary blocks. Geometric clarity.',
    bg:'#f3f0e8', accent:'#d62828', accent2:'#1d4ed8', ink:'#0a0a0a',
    fonts:{ display:"'Archivo Black'", body:"'Archivo'", mono:"'JetBrains Mono'" } },
  { id:'forest',      name:'Forest Floor',  desc:'Deep moss + bark. Quiet woodland.',
    bg:'#1a2419', accent:'#9ec872', accent2:'#d99a2b', ink:'#e6e8d8',
    fonts:{ display:"'Lora'", body:"'Lora'", mono:"'JetBrains Mono'" } },
  { id:'cardboard',    name:'Cardboard Box', desc:'Kraft paper + ink stamp. Tabletop game vibe.',
    bg:'#d4b896', accent:'#5a7a3a', accent2:'#b8521e', ink:'#3d2817',
    fonts:{ display:"'Amatic SC'", body:"'Quattrocento'", mono:"'Special Elite'" } },
  { id:'pixel-quest',  name:'Pixel Quest',   desc:'16-bit RPG menu. Warm wood + scanlines.',
    bg:'#2c1810', accent:'#7fb842', accent2:'#f0b838', ink:'#f4d5a0',
    fonts:{ display:"'Press Start 2P'", body:"'VT323'", mono:"'VT323'" } },
  { id:'cyberpunk',    name:'Cyber Neon',    desc:'Magenta grid + cyan glow. Night city.',
    bg:'#0a0518', accent:'#ff2ec4', accent2:'#00f0ff', ink:'#e8dfff',
    fonts:{ display:"'Orbitron'", body:"'Rajdhani'", mono:"'Share Tech Mono'" } },
  { id:'notebook',     name:'Notebook',      desc:'Graph paper + handwriting. Sketch mode.',
    bg:'#fbfaf2', accent:'#1a3a78', accent2:'#d8423a', ink:'#1a3a78',
    fonts:{ display:"'Caveat'", body:"'Kalam'", mono:"'Caveat'" } },
];

// Inject Google Fonts <link> for all theme fonts on first mount (idempotent).
function ensureGoogleFonts(){
  if(document.getElementById('orchard-theme-fonts')) return;
  const fams = [
    'Outfit:wght@400;500;600;700',
    'Cormorant+Garamond:wght@400;500;600;700',
    'EB+Garamond:wght@400;500;600;700',
    'Fira+Code:wght@400;500',
    'Playfair+Display:wght@400;500;600;700',
    'Lora:wght@400;500;600;700',
    'IBM+Plex+Mono:wght@400;500',
    'Space+Mono:wght@400;700',
    'Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700',
    'Press+Start+2P',
    'Space+Grotesk:wght@400;500;600;700',
    'Archivo+Black',
    'Archivo:wght@400;500;600;700',
    'Plus+Jakarta+Sans:wght@400;500;600;700',
    'Amatic+SC:wght@400;700',
    'Quattrocento:wght@400;700',
    'Special+Elite',
    'VT323',
    'Orbitron:wght@400;500;600;700;900',
    'Rajdhani:wght@400;500;600;700',
    'Share+Tech+Mono',
    'Caveat:wght@400;500;600;700',
    'Kalam:wght@300;400;700',
  ];
  const link = document.createElement('link');
  link.id = 'orchard-theme-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?' + fams.map(f=>`family=${f}`).join('&') + '&display=swap';
  document.head.appendChild(link);
}

window.applyThemeFonts = function(themeId){
  const t = THEMES.find(t=>t.id===themeId); if(!t) return;
  // Use a per-theme style block so it overrides the base :root vars.
  let s = document.getElementById('orchard-theme-fonts-vars');
  if(!s){ s = document.createElement('style'); s.id = 'orchard-theme-fonts-vars'; document.head.appendChild(s); }
  s.textContent = `:root{
    --font-display: ${t.fonts.display}, Georgia, serif;
    --font-body: ${t.fonts.body}, system-ui, sans-serif;
    --font-mono: ${t.fonts.mono}, ui-monospace, monospace;
  }`;
};

window.ALL_THEMES = THEMES;

window.SettingsModal = function SettingsModal({ open, onClose, t, setTweak }){
  useEffectSettings(()=>{ if(open) ensureGoogleFonts(); }, [open]);
  if(!open) return null;
  return (
    <div className="modal-bg" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal settings-modal">
        <div className="ab-head">
          <div>
            <h3>Settings</h3>
            <div className="desc" style={{margin:0}}>Look, feel, and panels.</div>
          </div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <h4>Theme</h4>
          <div className="theme-grid">
            {THEMES.map(th => {
              const selected = t.theme === th.id;
              return (
                <button
                  key={th.id}
                  className={`theme-card ${selected?'selected':''}`}
                  onClick={()=>setTweak('theme', th.id)}
                  style={{ background: th.bg, color: th.ink, borderColor: selected ? th.accent : 'var(--line)' }}
                >
                  <div className="theme-card-hero" style={{ fontFamily: `${th.fonts.display}, serif`, color: th.ink }}>Aa</div>
                  <div className="theme-card-name" style={{ fontFamily: `${th.fonts.display}, serif` }}>{th.name}</div>
                  <div className="theme-card-desc" style={{ fontFamily: `${th.fonts.body}, sans-serif`, color: th.ink, opacity:.7 }}>{th.desc}</div>
                  <div className="theme-card-swatches">
                    <span style={{background:th.accent}}/>
                    <span style={{background:th.accent2}}/>
                    <span style={{background:th.ink, opacity:.4}}/>
                  </div>
                  <div className="theme-card-fonts" style={{ fontFamily: `${th.fonts.mono}, monospace`, color: th.ink, opacity:.55 }}>
                    {th.fonts.display.replace(/'/g,'')} · {th.fonts.body.replace(/'/g,'')}
                  </div>
                  {selected && <div className="theme-card-check" style={{background:th.accent}}>✓</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-section">
            <h4>Density</h4>
            <div className="seg-control">
              {[['compact','Compact'],['normal','Normal'],['comfortable','Cozy']].map(([v,l])=>(
                <button key={v} className={`seg-btn ${t.density===v?'active':''}`} onClick={()=>setTweak('density',v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="settings-section">
            <h4>Tools side</h4>
            <div className="seg-control">
              {[['left','Left'],['right','Right']].map(([v,l])=>(
                <button key={v} className={`seg-btn ${t.layout===v?'active':''}`} onClick={()=>setTweak('layout',v)}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h4>Panels</h4>
          <div className="settings-toggles">
            <label className="settings-toggle">
              <input type="checkbox" checked={!!t.showAnalytics} onChange={e=>setTweak('showAnalytics', e.target.checked)}/>
              <span>Show analytics panel</span>
            </label>
            <label className="settings-toggle">
              <input type="checkbox" checked={!!t.showLog} onChange={e=>setTweak('showLog', e.target.checked)}/>
              <span>Show log panel</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
