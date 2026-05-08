// Themed confirm modal — replaces native confirm() so it inherits the active theme.
// Usage:
//   const ok = await window.confirmDialog({ title, message, confirmLabel, danger });
//   if(!ok) return;
// Renders into a singleton root in <body>; uses the same .modal-bg / .modal classes
// as the rest of the app so it adopts whatever theme is active.
(function(){
  let root = null;
  function getRoot(){
    if(root) return root;
    root = document.createElement('div');
    root.id = '__confirm-root';
    document.body.appendChild(root);
    return root;
  }

  window.confirmDialog = function(opts){
    const {
      title = 'Are you sure?',
      message = '',
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      danger = false,
    } = opts || {};

    return new Promise(resolve => {
      const node = getRoot();
      function close(result){
        ReactDOM.unmountComponentAtNode(node);
        resolve(result);
      }
      function Dialog(){
        // Esc to cancel, Enter to confirm
        React.useEffect(()=>{
          function onKey(e){
            if(e.key === 'Escape'){ close(false); }
            else if(e.key === 'Enter'){ close(true); }
          }
          window.addEventListener('keydown', onKey);
          return ()=> window.removeEventListener('keydown', onKey);
        }, []);
        return (
          <div className="modal-bg" onClick={e => { if(e.target===e.currentTarget) close(false); }}>
            <div className="modal" style={{maxWidth:420, width:'92vw'}}>
              <div className="ab-head" style={{marginBottom:8}}>
                <h3 style={{margin:0}}>{title}</h3>
                <button className="btn ghost" onClick={()=>close(false)} style={{padding:'2px 8px'}}>✕</button>
              </div>
              {message && (
                <div style={{fontSize:13, color:'var(--ink)', lineHeight:1.45, marginBottom:14}}>
                  {message}
                </div>
              )}
              <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                <button className="btn" onClick={()=>close(false)}>{cancelLabel}</button>
                <button className={`btn ${danger?'warn':'primary'}`} onClick={()=>close(true)} autoFocus>
                  {confirmLabel}
                </button>
              </div>
            </div>
          </div>
        );
      }
      ReactDOM.render(<Dialog/>, node);
    });
  };
})();
