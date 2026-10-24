/* Responsive dashboard host. The standalone pendant and native panels stay available. */
(() => {
  let queued=false, panel=null, hiddenStatus=null, timer=null;
  const style=document.createElement('style');style.textContent=`
    #cnc-dashboard-panel{background:#222;color:#eee;border-radius:6px;margin-bottom:24px;overflow:hidden;width:100%}
    #cnc-dashboard-panel .cnc-dashboard-heading{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;font:16px Arial,sans-serif}
    #cnc-dashboard-panel .cnc-dashboard-heading strong{flex:1}
    #cnc-dashboard-panel button,#cnc-dashboard-panel a{font:14px Arial,sans-serif;color:#b4d9fa;background:transparent;border:1px solid #666;border-radius:4px;padding:6px 9px;text-decoration:none;cursor:pointer}
    #cnc-dashboard-panel iframe{display:block;border:0;width:100%;height:860px;background:#171717}
    #cnc-dashboard-panel [hidden]{display:none!important}
    #cnc-dashboard-notice{padding:8px 12px;font-size:14px}
    @media(max-width:599px){#cnc-dashboard-panel{margin-bottom:12px}#cnc-dashboard-panel iframe{height:860px}}
  `;document.head.append(style);
  function showNative(){if(hiddenStatus){hiddenStatus.hidden=false;hiddenStatus=null;}}
  function destroy(){clearTimeout(timer);showNative();panel?.dispatchEvent(new Event("cnc-dashboard-destroy"));panel?.remove();panel=null;}
  function mount(){
    const dashboard=Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')==='/'&&/dashboard/i.test(a.textContent));
    if(dashboard&&!document.getElementById('cnc-pendant-navigation')){
      const link=dashboard.cloneNode(true);link.id='cnc-pendant-navigation';link.href='/cnc-pendant.html';link.classList.remove('v-list-item--active','v-list-item--exact-active');link.removeAttribute('aria-current');link.removeAttribute('aria-selected');(link.querySelector('.v-list-item__title')||link).textContent='CNC Pendant';link.setAttribute('aria-label','CNC Pendant');link.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();location.assign('/cnc-pendant.html');});dashboard.after(link);
    }
    if(location.pathname!=='/'){if(panel)destroy();return;}
    const machine=document.querySelector('.machine-settings-panel'),column=machine?.closest('.col');
    if(!column)return;
    if(panel?.isConnected){if(panel.parentElement!==column)column.prepend(panel);return;}
    if(panel)destroy();
    panel=document.createElement('section');panel.id='cnc-dashboard-panel';panel.setAttribute('aria-label','CNC Pendant dashboard panel');
    const heading=document.createElement('div');heading.className='cnc-dashboard-heading';
    const title=document.createElement('strong');title.textContent='CNC Pendant';
    const link=document.createElement('a');link.href='/cnc-pendant.html';link.textContent='Open full pendant';
    const toggle=document.createElement('button');toggle.textContent='Standard job panel';toggle.type='button';toggle.setAttribute('aria-pressed','false');
    const notice=document.createElement('div');notice.id='cnc-dashboard-notice';notice.textContent='Loading pendant…';notice.setAttribute('role','status');
    const frame=document.createElement('iframe');frame.title='CNC Pendant';frame.src='/cnc-pendant.html?embedded=1';frame.allow='fullscreen';
    let standard=false,ready=false;
    const native=()=>document.querySelector('.status-panel');
    const apply=()=>{showNative();if(ready&&!standard){const status=native();if(status){hiddenStatus=status;status.hidden=true;}}toggle.setAttribute('aria-pressed',String(standard));toggle.textContent=standard?'Hide standard job panel':'Standard job panel';};
    toggle.addEventListener('click',()=>{standard=!standard;apply();});
    const receive=event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='cnc-pendant-ready')return;ready=true;notice.hidden=true;clearTimeout(timer);apply();};
    window.addEventListener('message',receive);
    frame.addEventListener('load',()=>{try{if(frame.contentDocument?.querySelector('#pendant-live-state')){ready=true;notice.hidden=true;clearTimeout(timer);apply();}}catch(_){}});
    frame.addEventListener('error',()=>{ready=false;showNative();notice.hidden=false;notice.textContent='Pendant unavailable. Standard job panel remains available; use Open full pendant to retry.';});
    timer=setTimeout(()=>{if(!ready){showNative();notice.textContent='Pendant is taking longer to load. The standard job panel remains available.';}},15000);
    heading.append(title,link,toggle);panel.append(heading,notice,frame);column.prepend(panel);
    panel.addEventListener('cnc-dashboard-destroy',()=>window.removeEventListener('message',receive),{once:true});
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount();});}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('popstate',schedule);mount();
})();
