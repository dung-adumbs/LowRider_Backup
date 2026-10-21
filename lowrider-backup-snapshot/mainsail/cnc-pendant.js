/* Standalone pendant bridge; existing controller macros remain authoritative. */
(() => {
  'use strict';
  let latest=null, fitted=false, fitQueued=false;
  const $=selector=>document.querySelector(selector);
  const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  async function api(path,method='GET',value){const r=await fetch(path,{method,cache:'no-store',signal:AbortSignal.timeout(10000),...(value!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}:{})});const data=await r.json();if(!r.ok||data.error)throw Error(data.error?.message||'Controller request failed');return data.result;}
  const command=script=>api('/printer/gcode/script','POST',{script});
  async function idle(){const s=(await api('/printer/objects/query?webhooks&print_stats&pause_resume&idle_timeout&toolhead&virtual_sdcard')).status;if(s?.webhooks?.state!=='ready'||['printing','paused'].includes(s.print_stats?.state)||s.pause_resume?.is_paused||s.virtual_sdcard?.is_active||s.idle_timeout?.state==='Printing')throw Error('Wait until the machine is idle, with no running or paused job.');return s;}
  async function emergencyStop(){try{await api('/printer/emergency_stop','POST',{});$('#pendant-live-state').textContent='EMERGENCY STOP — controller restart required';}catch(error){$('#pendant-live-state').textContent='Stop request failed — use the physical emergency stop';}}
  function stopButton(){const b=el('button','E-STOP','pendant-stop');b.type='button';b.setAttribute('aria-label','Emergency stop');b.addEventListener('click',emergencyStop);return b;}
  function modal(title){
    const dialog=el('dialog');dialog.setAttribute('aria-label',title);dialog.append(el('h3',title));const feedback=el('p','','dialog-feedback');feedback.setAttribute('role','status');dialog.append(feedback);const actions=el('div',undefined,'dialog-actions');dialog.append(actions);
    const add=(label,handler)=>{const b=el('button',label);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await handler();}catch(error){feedback.textContent=error.message;}finally{b.disabled=false;}});actions.append(b);return b;};
    add('Close',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();return{dialog,feedback,add,insert(e){dialog.insertBefore(e,feedback);}};
  }
  function fit(){const frame=$('#pendant-viewport'),content=$('#pendant-scale'),panel=$('.toolhead-control-panel');if(!frame||!panel)return;const scale=Math.min(1,frame.clientHeight/Math.max(1,panel.offsetHeight+8));const transform=scale<.999?`scale(${scale})`:'';if(content.style.transform!==transform)content.style.transform=transform;content.dataset.scale=scale.toFixed(3);}
  function queueFit(){if(fitQueued)return;fitQueued=true;requestAnimationFrame(()=>{fitQueued=false;fit();});}
  window.addEventListener('resize',queueFit);window.visualViewport?.addEventListener('resize',queueFit);
  document.addEventListener('cnc-pendant-status',event=>{
    const s=event.detail;latest=s;const ready=s?.webhooks?.state==='ready';$('#pendant-live-state').textContent=!ready?'Disconnected / controller not ready':(s.print_stats?.state==='paused'?'Paused':s.print_stats?.state==='printing'?'Running':'Ready')+(s.print_stats?.filename?' · '+s.print_stats.filename:'');
    for(const [i,a] of [...'XYZ'].entries()){
      const input=$(`[data-native-axis="${a}"]`);if(s?.gcode_move&&input)input.value=Number(s.gcode_move.gcode_position[i]).toFixed(a==='Z'?3:2);
      const machine=$('#machine-'+a);if(machine&&s?.gcode_move)machine.textContent='[ '+Number(s.gcode_move.position[i]).toFixed(a==='Z'?3:2)+' ]';
      const range=$('#lowrider-range-'+i);if(range&&s?.gcode_move&&s?.toolhead){const offset=s.gcode_move.position[i]-s.gcode_move.gcode_position[i];const text=s.toolhead.homed_axes.includes(a.toLowerCase())?(s.toolhead.axis_minimum[i]-offset).toFixed(2)+' to '+(s.toolhead.axis_maximum[i]-offset).toFixed(2):'Home '+a+' first';if(range.textContent!==text)range.textContent=text;}
    }queueFit();
  });
  async function homeEndstops(dialog){
    if(dialog.dataset.endstopsRequested)return;dialog.dataset.endstopsRequested='true';const row=el('div',undefined,'pendant-endstop-row');row.append(el('span','Endstops'));const switches=el('div',undefined,'switches');row.append(switches);const names=[['X','stepper_x'],['Y','stepper_y'],['Y1','y1'],['Z','stepper_z'],['Z1','z1']];const tiles=names.map(([name])=>{const e=el('span',name);e.setAttribute('role','status');e.style.background='#555';e.title='Reading';switches.append(e);return e;});dialog.querySelector('h3')?.after(row);
    try{const states=await api('/printer/query_endstops/status');names.forEach(([name,key],i)=>{const value=String(states[key]??'unavailable').toLowerCase();tiles[i].style.background=value==='triggered'?'#b71c1c':value==='open'?'#2e7d32':'#555';tiles[i].title=name+': '+value;tiles[i].setAttribute('aria-label',name+': '+value);});row.title='Snapshot on Home entry. Reopen Home to refresh.';}catch(error){row.title=error.message;tiles.forEach(e=>e.title='Unavailable');}
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest?.('[data-lowrider-disable-steppers]');if(!b)return;if(b.dataset.pendantConfirmed){delete b.dataset.pendantConfirmed;return;}
    event.preventDefault();event.stopImmediatePropagation();const m=modal('Disable steppers?');m.dialog.querySelector('.dialog-actions button').textContent='Cancel';m.insert(el('p','This releases motor holding torque. The gantry may shift or drop, and axes will need homing again. Continue?'));m.add('Yes, disable steppers',async()=>{await idle();m.dialog.close();b.dataset.pendantConfirmed='true';b.click();});
  },true);
  function arrangePendant(){
    if($('#pendant-jog-zone'))return;
    const pad=$('#lowrider-jog-pad'),z=$('#lowrider-horizontal-z'),scale=$('#lowrider-scale-toggle'),safe=$('#lowrider-z5-controls'),active=$('#lowrider-active-controls'),home=$('#lowrider-home-dialog'),timeout=$('#lowrider-stepper-timeout-row');
    if(!pad||!z||!safe||!active||!home||!timeout||!$('#lowrider-feed-factor')||!$('[data-lowrider-disable-steppers]'))return;
    const rate=pad.querySelector('[aria-label="Jog speed adjustment"]'),oldScale=scale.parentElement;
    const settings=el('div',undefined,'pendant-jog-settings');pad.before(settings);settings.append(rate);
    const zone=el('div');zone.id='pendant-jog-zone';pad.before(zone);zone.append(pad);
    $('#pendant-old-xy-label')?.remove();scale.dataset.pendantCenter='true';scale.dataset.mode='';scale.style.cssText='grid-column:4;grid-row:5';pad.append(scale);scale.replaceChildren(el('span','X / Y'),el('small',scale.textContent));
    z.dataset.pendantQuadrant='true';pad.append(z);
    const safety=el('div');safety.id='pendant-safety-strip';zone.after(safety);safety.append(safe);oldScale.hidden=true;
    const cap=safe.lastElementChild;cap.prepend(el('span','Jog cap','pendant-cap-caption'));
    const actions=el('div');actions.id='pendant-actions';safety.after(actions);actions.append(home,$('#lowrider-grid-zero'),$('#lowrider-pause-resume'),$('#lowrider-grid-light').parentElement);active.hidden=true;
    const auxiliary=$('#pendant-auxiliary');auxiliary.append($('.macrogroup_lowrider-homing_panel'),timeout);
    const disable=$('[data-lowrider-disable-steppers]');disable.textContent='Steppers';disable.setAttribute('aria-label','Disable Steppers');$('.pendant-tabs').append(disable);
    actions.after($('#lowrider-feed-factor'));
    queueFit();
  }
  const sections={
    async keepouts(){const m=modal('Keep-out areas'),panel=$('#lowrider-keepout-panel');if(panel){panel.style.setProperty('display','block','important');m.insert(panel);}else m.feedback.textContent='Settings are loading; close and try again.';m.dialog.addEventListener('close',()=>{if(panel){panel.style.removeProperty('display');$('.pendant-column').append(panel);}});},
    async files(){
      const m=modal('Files / job');m.feedback.textContent='Loading files…';m.insert(el('p',latest?.print_stats?.state||'Connecting'));const jobs=$('#lowrider-job-controls');if(jobs)m.insert(jobs);m.dialog.addEventListener('close',()=>{if(jobs)$('.macrogroup_lowrider-general_panel .v-card__text').append(jobs);});
      const search=el('input');search.className='file-search';search.placeholder='Filter files';search.setAttribute('aria-label','Filter G-code files');m.insert(search);const list=el('select');list.className='file-list';list.size=7;list.setAttribute('aria-label','G-code files');m.insert(list);
      try{const files=(await api('/server/files/list?root=gcodes')).filter(f=>/\.(gcode|gco|gc|nc|ngc|tap)$/i.test(f.path));const render=()=>{list.replaceChildren();for(const file of files.filter(f=>f.path.toLowerCase().includes(search.value.toLowerCase())).sort((a,b)=>b.modified-a.modified)){const o=el('option',file.path);o.value=file.path;o.disabled=/quarantine|old-machine-origin/i.test(file.path);list.append(o);}};search.addEventListener('input',render);render();m.feedback.textContent='Archived/quarantined files cannot be started here. Check tool, zero, clamps and router power before starting.';
        m.add('Start selected file…',async()=>{const filename=list.value;if(!filename)throw Error('Select a runnable file.');const current=await idle();if(current.toolhead?.homed_axes!=='xyz')throw Error('Home all axes and establish work/tool zeros first.');const confirm=modal('Start CNC job?');confirm.insert(el('p',filename));confirm.insert(el('p','Confirm tool/work zeros, clearance, clamps, feed settings and manual router power. This starts the program and can move immediately.'));confirm.add('Start job',async()=>{const fresh=await idle();if(fresh.toolhead?.homed_axes!=='xyz')throw Error('Axes are no longer all homed.');await api('/printer/print/start','POST',{filename});confirm.dialog.close();m.dialog.close();});});
      }catch(error){m.feedback.textContent=error.message;}
    },
    async machine(){
      const m=modal('Machine limits (current session)');const timeout=$('#lowrider-stepper-timeout-row');if(timeout){m.insert(timeout);m.dialog.addEventListener('close',()=>$('#pendant-auxiliary').append(timeout));}try{const s=(await api('/printer/objects/query?toolhead')).status.toolhead,inputs={};for(const [key,label,min,max] of [['max_velocity','Velocity mm/s',1,1000],['max_accel','Acceleration mm/s²',1,50000],['square_corner_velocity','Corner velocity mm/s',0,100],['minimum_cruise_ratio','Minimum cruise ratio',0,1]]){const row=el('label',label,'dialog-field'),value=el('input');value.type='number';value.min=min;value.max=max;value.step='any';value.value=s[key]??'';value.setAttribute('aria-label',label);if(s[key]===undefined)value.disabled=true;row.append(value);inputs[key]={value,min,max};m.insert(row);}m.insert(el('p','Session changes only; printer.cfg is not rewritten.'));
        m.add('Apply session limits',async()=>{await idle();const names={max_velocity:'VELOCITY',max_accel:'ACCEL',square_corner_velocity:'SQUARE_CORNER_VELOCITY',minimum_cruise_ratio:'MINIMUM_CRUISE_RATIO'},params=[];for(const [key,{value,min,max}] of Object.entries(inputs)){if(value.disabled)continue;const n=Number(value.value);if(!value.value.trim()||!Number.isFinite(n)||n<min||n>max)throw Error('Check '+key);params.push(names[key]+'='+n);}await command('SET_VELOCITY_LIMIT '+params.join(' '));m.feedback.textContent='Session limits applied.';});}catch(error){m.feedback.textContent=error.message;}
    },
    async macros(){
      const m=modal('Advanced macros');m.insert(el('p','Macros may move the machine and bypass pendant jog clearance/keep-out checks. Review before running.'));const filter=el('input');filter.placeholder='Filter macros';filter.setAttribute('aria-label','Filter macros');filter.style.width='100%';m.insert(filter);const list=el('div',undefined,'macro-list');m.insert(list);
      try{const [objects,help]=await Promise.all([api('/printer/objects/list'),api('/printer/gcode/help')]);const names=objects.objects.filter(n=>n.startsWith('gcode_macro ')).map(n=>n.slice(12)).filter(n=>!n.startsWith('_')&&!['PAUSE_BASE','RESUME_BASE','CANCEL_PRINT_BASE','CNC_PAUSE_BASE_ORIGINAL','CNC_PAUSE_CAPTURE_XY','CNC_RESUME_ORDERED'].includes(n)).sort();const render=()=>{list.replaceChildren();for(const name of names.filter(n=>n.toLowerCase().includes(filter.value.toLowerCase()))){const b=el('button',name.replaceAll('_',' '));b.append(el('small',help[name]||''));b.addEventListener('click',()=>{const confirm=modal('Run '+name+'?');confirm.insert(el('p',help[name]||'Review this macro before running.'));confirm.add('Run macro',async()=>{await idle();await command(name);confirm.dialog.close();m.feedback.textContent='Sent '+name;});});list.append(b);}};filter.addEventListener('input',render);render();}catch(error){m.feedback.textContent=error.message;}
    },
    async console(){
      const m=modal('Console / commands'),log=el('pre','','console-output');log.setAttribute('aria-label','Console output');m.insert(log);const form=el('form',undefined,'console-entry'),input=el('input'),send=el('button','Send');input.placeholder='Send G-code…';input.setAttribute('aria-label','Send G-code');input.autocomplete='off';send.type='submit';form.append(input,send);m.insert(form);m.insert(el('p','Console commands bypass pendant jog guards. Open Home for endstop states.'));const diagnostic=$('.macrogroup_lowrider-endstops_panel');if(diagnostic){const refresh=diagnostic.querySelector('#lowrider-endstop-refresh');if(refresh)refresh.style.display='none';m.insert(diagnostic);}let timer;
      const update=async()=>{if(!m.dialog.open)return;try{const messages=(await api('/server/gcode_store?count=80')).gcode_store;const bottom=log.scrollTop+log.clientHeight>=log.scrollHeight-30;log.textContent=messages.map(e=>new Date(e.time*1000).toLocaleTimeString()+' '+e.message).join('\n');if(bottom)log.scrollTop=log.scrollHeight;}catch(error){m.feedback.textContent=error.message;}if(m.dialog.open)timer=setTimeout(update,1200);};
      form.addEventListener('submit',async event=>{event.preventDefault();const script=input.value.trim();if(!script||send.disabled)return;send.disabled=true;try{await command(script);input.value='';}catch(error){m.feedback.textContent=error.message;}finally{send.disabled=false;}});m.dialog.addEventListener('close',()=>{clearTimeout(timer);if(diagnostic)$('#pendant-auxiliary').append(diagnostic);});update();
    }
  };
  document.querySelectorAll('[data-pendant-dialog]').forEach(b=>b.addEventListener('click',()=>sections[b.dataset.pendantDialog]()));
  const topStop=$('#pendant-estop');if(topStop)topStop.addEventListener('click',emergencyStop);
  const fullscreen=$('#pendant-fullscreen');
  if(fullscreen){
    const fullscreenLabel=()=>{const on=!!document.fullscreenElement;fullscreen.textContent=on?'Exit full screen':'Full screen';fullscreen.setAttribute('aria-label',on?'Exit full screen':'Enter full screen');queueFit();};
    fullscreen.addEventListener('click',async()=>{
      try{
        if(document.fullscreenElement)await document.exitFullscreen();
        else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});
        else throw Error('This browser does not offer page full screen. Open the pendant in a browser that supports full screen, or use its full-screen menu option.');
      }catch(error){const m=modal('Full screen');m.insert(el('p',error.message||'The browser did not allow full screen. Try opening the pendant directly in your Android browser.'));}
      fullscreenLabel();
    });
    document.addEventListener('fullscreenchange',fullscreenLabel);fullscreenLabel();
  }
  new MutationObserver(()=>{arrangePendant();for(const dialog of document.querySelectorAll('dialog')){if(!dialog.querySelector('.pendant-stop'))dialog.prepend(stopButton());if(dialog.querySelector('h3')?.textContent==='Home axes')homeEndstops(dialog);}const panel=$('.toolhead-control-panel');if(panel&&!fitted){new ResizeObserver(queueFit).observe(panel);fitted=true;}queueFit();}).observe(document.documentElement,{childList:true,subtree:true});queueFit();
})();


