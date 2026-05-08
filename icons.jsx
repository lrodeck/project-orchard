// Icon components
const Icon = {
  Source: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v6"/><path d="M12 22c-4 0-7-3-7-7 0-3 2-5 4-7 0 2 1 3 3 3s3-1 3-3c2 2 4 4 4 7 0 4-3 7-7 7z"/>
    </svg>
  ),
  Pool: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>
    </svg>
  ),
  Drain: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18l-2 4H5z"/><path d="M5 10l3 10h8l3-10"/><path d="M12 14v4"/>
    </svg>
  ),
  Converter: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 4v3"/><path d="M12 17v3"/><path d="M4 12h3"/><path d="M17 12h3"/><path d="M6.3 6.3l2 2"/><path d="M15.7 15.7l2 2"/><path d="M17.7 6.3l-2 2"/><path d="M8.3 15.7l-2 2"/>
    </svg>
  ),
  Gate: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V8l8-4 8 4v12"/><path d="M4 20h16"/><path d="M9 20v-8h6v8"/>
    </svg>
  ),
  Booster: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>
    </svg>
  ),
  Splitter: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h6"/><path d="M9 12l6-6"/><path d="M9 12l6 6"/><circle cx="3" cy="12" r="1.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/>
    </svg>
  ),
  Delay: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>
    </svg>
  ),
  Event: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v3"/><path d="M12 19v3"/><path d="M4.2 4.2l2.1 2.1"/><path d="M17.7 17.7l2.1 2.1"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.2 19.8l2.1-2.1"/><path d="M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Offer: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>
    </svg>
  ),
  Tombola: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18"/><path d="M9 3v18"/>
      <circle cx="6" cy="6" r="0.8" fill="currentColor"/>
      <circle cx="15" cy="15" r="0.8" fill="currentColor"/>
      <path d="M14 7l2 2-2 2"/><path d="M19 14l-2 2 2 2"/>
    </svg>
  ),
  Market: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-6 9 6"/><path d="M5 9v11h14V9"/><path d="M9 14h6"/><path d="M9 17h6"/>
    </svg>
  ),
  Goal: ({size=18}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    </svg>
  ),
  Play: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l16 9-16 9z"/></svg>,
  Pause: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  Step: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l10 9-10 9zM18 3h2v18h-2z"/></svg>,
  Undo: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7"/></svg>,
  Reset: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>,
  Save: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Load: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
  Plus: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Logo: () => (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" fill="var(--moss)" stroke="var(--ink)" strokeWidth="1.5"/>
      <path d="M10 18 Q12 14 16 14 Q20 14 22 18" stroke="var(--cream)" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <circle cx="10" cy="18" r="2" fill="var(--ochre)" stroke="var(--ink)" strokeWidth="1"/>
      <circle cx="22" cy="18" r="2" fill="var(--terracotta)" stroke="var(--ink)" strokeWidth="1"/>
      <circle cx="16" cy="14" r="2" fill="var(--cream)" stroke="var(--ink)" strokeWidth="1"/>
      <path d="M16 6 Q14 9 16 12 Q18 9 16 6" fill="var(--leaf)" stroke="var(--ink)" strokeWidth="1"/>
    </svg>
  )
};

function NodeIcon({type, size=18}){
  const map = { source: Icon.Source, pool: Icon.Pool, drain: Icon.Drain, converter: Icon.Converter, gate: Icon.Gate, booster: Icon.Booster, splitter: Icon.Splitter, delay: Icon.Delay, event: Icon.Event, market: Icon.Market, offer: Icon.Offer, tombola: Icon.Tombola, goal: Icon.Goal };
  const C = map[type] || Icon.Pool;
  return <span className={`ic ic-${type}`}><C size={size}/></span>;
}

window.Icon = Icon;
window.NodeIcon = NodeIcon;
