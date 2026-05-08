// Dropdown context menu — right-click the canvas (empty area) or a node.
const CTX_NODE_ITEMS = [
  { action:'source',    label:'Source' },
  { action:'pool',      label:'Pool' },
  { action:'drain',     label:'Drain' },
  { action:'converter', label:'Converter' },
  { action:'gate',      label:'Gate' },
  { action:'booster',   label:'Booster' },
  { action:'splitter',  label:'Splitter' },
  { action:'delay',     label:'Delay' },
  { action:'event',     label:'Event' },
  { action:'market',    label:'Market' },
  { action:'offer',     label:'Offer' },
  { action:'tombola',   label:'Tombola' },
];

window.ContextMenu = function ContextMenu({ menu, onClose, onPick }){
  const [submenuOpen, setSubmenuOpen] = React.useState(false);
  React.useEffect(()=>{
    function key(e){ if(e.key==='Escape') onClose(); }
    function down(e){
      if(e.target.closest('.ctx-menu')) return;
      onClose();
    }
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', down, true);
    return ()=>{ window.removeEventListener('keydown', key); window.removeEventListener('mousedown', down, true); };
  }, [onClose]);

  // Clamp inside viewport
  const W = 200, H = menu.kind==='node' ? 90 : 250;
  const left = Math.min(menu.screenX, window.innerWidth - W - 8);
  const top  = Math.min(menu.screenY, window.innerHeight - H - 8);

  return (
    <div className="ctx-menu" style={{ left, top }} onContextMenu={e=>e.preventDefault()}>
      {menu.kind==='canvas' && (
        <React.Fragment>
          <div
            className={`ctx-item has-sub ${submenuOpen?'open':''}`}
            onMouseEnter={()=>setSubmenuOpen(true)}
            onMouseLeave={()=>setSubmenuOpen(false)}
          >
            <span>Add node</span><span className="ctx-arrow">▸</span>
            {submenuOpen && (
              <div className="ctx-sub">
                {CTX_NODE_ITEMS.map(it => (
                  <button key={it.action} className="ctx-item" onClick={()=>onPick({type:'add', action:it.action})}>
                    <span className="ctx-icon"><NodeIcon type={it.action} size={14}/></span>
                    <span>{it.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="ctx-item" onClick={()=>onPick({type:'addGroup'})}>
            <span className="ctx-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3"/></svg></span>
            <span>Add group</span>
          </button>
        </React.Fragment>
      )}
      {menu.kind==='node' && (
        <React.Fragment>
          <button className="ctx-item" onClick={()=>onPick({type:'duplicate'})}>
            <span className="ctx-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/></svg></span>
            <span>Duplicate</span>
          </button>
          <div className="ctx-sep"/>
          <button className="ctx-item ctx-danger" onClick={()=>onPick({type:'delete'})}>
            <span className="ctx-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6"/></svg></span>
            <span>Delete <kbd className="ctx-kbd">Del</kbd></span>
          </button>
        </React.Fragment>
      )}
    </div>
  );
};
