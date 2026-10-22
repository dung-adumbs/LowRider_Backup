/* Shared staged-job UI; all Start/Resume authorization occurs on the Pi. */
(() => {
 'use strict';
 const endpoint='/machine/cnc_preflight/';let state={state:'empty'},latest=null,busy=false,polling=false,dialogSequence=0;
 const $=s=>document.querySelector(s),ui=()=>window.PendantUI;
 const el=(tag,text,cls)=>ui().el(tag,text,cls);
 const text=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
 async function api(name,method='GET',body){return ui().api(endpoint+name,method,body);}
 function canResume(){return !busy&&!!latest?.pause_resume?.is_paused&&state.active_filename===state.filename&&state.state==='analyzed'&&!!state.verification?.approved;}
 function render(){
  const card=$('#pendant-stage-card');if(!card)return;
  const paused=!!latest?.pause_resume?.is_paused,running=!paused&&latest?.print_stats?.state==='printing';
  card.hidden=running||(!state.filename&&!paused);card.dataset.result=state.state==='scanning'?'pending':state.verification?.approved?'pass':'blocked';
  text($('#pendant-stage-filename'),state.filename||'No file staged');
  const message=state.state==='scanning'?`Scanning ${Math.round((state.progress||0)*100)}% · ${(state.lines||0).toLocaleString()} lines`:state.verification?.reason||state.message||'Stage and verify the paused file.';
  text($('#pendant-stage-result'),message);
  const progress=$('#pendant-scan-progress');progress.hidden=state.state!=='scanning';progress.value=state.progress||0;
  const start=$('#pendant-verified-start');start.hidden=paused;start.disabled=busy||state.state!=='analyzed'||!state.verification?.approved||running;
  const resume=$('#pendant-quadrant-resume');resume.hidden=!paused;resume.disabled=!canResume();
  text(resume,!busy&&state.state==='scanning'?'Verifying…':'Resume job…');
  const old=$('#lowrider-pause-resume');if(paused&&old)old.disabled=!canResume();
  ui().queueFit();
 }
 function mount(){
  const body=$('.panel-body'),zone=$('#pendant-jog-zone'),pad=$('#lowrider-jog-pad');if(!body||!zone||!pad||$('#pendant-stage-card'))return;
  const card=el('section');card.id='pendant-stage-card';card.hidden=true;card.setAttribute('aria-label','Staged CNC job');
  const filename=el('strong');filename.id='pendant-stage-filename';const result=el('div');result.id='pendant-stage-result';result.setAttribute('role','status');const progress=el('progress');progress.id='pendant-scan-progress';progress.max=1;
  const controls=el('div',undefined,'preflight-actions'),start=el('button','Start job…');start.id='pendant-verified-start';start.addEventListener('click',startJob);
  const details=el('button','Verify / details');details.addEventListener('click',detailsDialog);controls.append(start,details);card.append(filename,result,progress,controls);zone.before(card);
  const resumeButton=el('button','Resume job…');resumeButton.id='pendant-quadrant-resume';resumeButton.addEventListener('click',resume);pad.append(resumeButton);render();
 }
 async function refresh(){if(polling)return state;polling=true;try{state=await api('status');}catch(error){state={...state,state:'unavailable',verification:{approved:false,reason:'Verification service unavailable: '+error.message}};}finally{polling=false;render();}return state;}
 async function stage(filename){busy=true;render();try{state=await api('stage','POST',{filename});}finally{busy=false;render();}await refresh();}
 function verificationText(value){
  if(!value)return 'Verification has not completed.';
  const lines=[value.reason||'',...(value.violations||[]).map(v=>v.message),...(value.return_violations||[]).map(v=>v.message)];
  if(value.work_min)for(let i=0;i<3;i++)lines.push(`${'XYZ'[i]} work ${value.work_min[i].toFixed(3)} to ${value.work_max[i].toFixed(3)} mm · machine ${value.machine_min[i].toFixed(3)} to ${value.machine_max[i].toFixed(3)} mm`);
  if(value.label)lines.push('Tool section: '+value.label);if(value.scope)lines.push(value.scope);
  if(value.issues)for(const issue of value.issues.slice(0,8))lines.push(`Line ${issue.line}: ${issue.message}`);
  return lines.filter(Boolean).join('\n');
 }
 async function detailsDialog(){
  const m=ui().modal('G-code verification'),info=el('pre',undefined,'preflight-details');m.insert(info);m.insert(el('p','Travel verification does not certify stock, clamps, cutter length or fixture clearance.'));
  const show=()=>{info.textContent=[state.filename||'No file staged',state.state==='scanning'?`Scanning ${Math.round((state.progress||0)*100)}%`:verificationText(state.verification),state.report?`Scanned ${state.report.moves.toLocaleString()} moves in ${state.report.scan_seconds}s\nSHA-256: ${state.report.sha256}`:''].join('\n\n');};show();
  m.add('Verify again',async()=>{const result=await api('verify','POST',{});state.verification=result;show();render();});
  const timer=setInterval(show,1000);m.dialog.addEventListener('close',()=>clearInterval(timer));await refresh();show();
 }
 async function ensurePausedFile(){
  const status=(await ui().api('/printer/objects/query?pause_resume&print_stats')).status;
  if(!status.pause_resume?.is_paused)throw Error('No paused job.');const filename=status.print_stats?.filename;if(!filename)throw Error('No active file is available.');
  if(state.filename!==filename||state.state==='empty'||state.state==='error'||state.state==='unavailable')await stage(filename);else await refresh();
 }
 async function afterZero(){
  busy=true;render();try{await ensurePausedFile();const result=await api('verify','POST',{});state.verification=result;const m=ui().modal(result.approved?'Tool Z verified':'Resume blocked — check tool Z');m.insert(el('pre',verificationText(result),'preflight-details'));if(state.state==='scanning')m.insert(el('p','A background scan is running. Close this dialog and wait for the main verification panel.'));m.add('Verify again',async()=>{m.dialog.close();await afterZero();});}catch(error){const m=ui().modal('Tool Z verification');m.insert(el('p',error.message));}finally{busy=false;await refresh();}
 }
 async function resume(){
  if(busy)return;busy=true;render();try{await ensurePausedFile();const result=await api('verify','POST',{});state.verification=result;if(!result.approved){await detailsDialog();return;}
   const captured=state.id,m=ui().modal('Resume CNC job?');m.insert(el('p','Check tool clearance, the workpiece, clamps, and router power. Resume lifts Z, returns to the captured XY, then lowers to the saved cutting Z.'));m.insert(el('pre',verificationText(result),'preflight-details'));
   m.add('Resume job',async()=>{m.dialog.close();busy=true;render();try{await api('resume','POST',{stage_id:captured});}catch(error){const failure=ui().modal('Resume blocked');failure.insert(el('p',error.message));}finally{busy=false;await refresh();}});
  }catch(error){const m=ui().modal('Resume blocked');m.insert(el('p',error.message));}finally{busy=false;render();}
 }
 async function startJob(){
  if(busy)return;busy=true;render();try{await refresh();const verified=await api('verify','POST',{});state.verification=verified;if(!verified.approved){await detailsDialog();return;}
   const captured=state.id,filename=state.filename,m=ui().modal('Start verified CNC job?');m.insert(el('p',filename));m.insert(el('p','Confirm work/tool zero, tool and clamps, clearance and manual router power. Later tool sections must be re-verified with their actual tool zeros.'));m.insert(el('pre',verificationText(verified),'preflight-details'));
   m.add('Start job',async()=>{m.dialog.close();busy=true;render();try{await api('start','POST',{stage_id:captured});}catch(error){const failure=ui().modal('Start blocked');failure.insert(el('p',error.message));}finally{busy=false;await refresh();}});
  }catch(error){const m=ui().modal('Start blocked');m.insert(el('p',error.message));}finally{busy=false;render();}
 }
 function viewer(filename){const m=ui().modal('Toolpath viewer');m.insert(el('p',filename));const frame=el('iframe');frame.title='Mainsail G-code toolpath viewer';frame.src='/viewer?filename='+encodeURIComponent('gcodes/'+filename);frame.className='preflight-viewer';m.insert(frame);m.insert(el('p','Visualization is not verification. Enable travel visibility in the viewer for non-extruding CNC paths.'));}
 async function files(){
  const m=ui().modal('Files / stage job'),search=el('input'),list=el('select'),details=el('div',undefined,'cnc-file-details');search.placeholder='Filter files';search.setAttribute('aria-label','Filter G-code files');search.className='file-search';list.size=6;list.className='file-list cnc-file-list';list.setAttribute('aria-label','G-code files');m.insert(search);m.insert(list);m.insert(details);
  let selected='',sequence=0;
  async function inspect(){const filename=list.value;selected=filename;const token=++sequence;details.replaceChildren();if(!filename)return;details.append(el('p','Reading file details…'));try{
    const [info,metadata]=await Promise.all([api('inspect?filename='+encodeURIComponent(filename)),ui().api('/server/files/metadata?filename='+encodeURIComponent(filename)).catch(()=>({}))]);if(token!==sequence||!m.dialog.open)return;
    details.replaceChildren(el('strong',filename));details.append(el('p',`${(info.size/1e6).toFixed(2)} MB · modified ${new Date(info.modified).toLocaleString()}`));const warning=el('p',info.preliminary?.message||'No boundary metadata — full scan required.','file-fit-warning');if(info.preliminary?.fits===false)warning.classList.add('outside');details.append(warning);
    if(info.metadata?.available)details.append(el('pre',`Header bounds · mm\n${'XYZ'.split('').map((axis,i)=>axis+' '+info.metadata.min[i].toFixed(3)+' to '+info.metadata.max[i].toFixed(3)).join('\n')}`,'preflight-details'));
    const known={estimated_time:'Estimated time (s)',object_height:'Reported height (mm)',slicer:'Generator',slicer_version:'Generator version'};for(const [key,label] of Object.entries(known))if(metadata[key]!==undefined)details.append(el('div',label+': '+metadata[key]));
    if(info.header_comments?.length){const fold=el('details'),summary=el('summary','Program comments / tool notes');fold.append(summary,el('pre',info.header_comments.join('\n'),'preflight-details'));details.append(fold);}
   }catch(error){if(token===sequence)details.replaceChildren(el('p',error.message));}}
  try{const all=(await ui().api('/server/files/list?root=gcodes')).filter(f=>/\.(gcode|gco|gc|nc|ngc|tap)$/i.test(f.path)).sort((a,b)=>b.modified-a.modified);const renderFiles=()=>{const old=list.value;list.replaceChildren();for(const file of all.filter(f=>f.path.toLowerCase().includes(search.value.toLowerCase()))){const item=el('option',file.path);item.value=file.path;item.disabled=/quarantine|old-machine-origin/i.test(file.path);list.append(item);}if([...list.options].some(o=>o.value===old))list.value=old;inspect();};search.addEventListener('input',renderFiles);list.addEventListener('change',inspect);renderFiles();
   m.add('Stage & verify',async()=>{if(!selected)throw Error('Select a file.');await stage(selected);m.dialog.close();});m.add('View toolpath',()=>{if(!selected)throw Error('Select a file.');viewer(selected);});
  }catch(error){m.feedback.textContent=error.message;}
 }
 document.addEventListener('cnc-pendant-status',event=>{latest=event.detail;render();});new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
 async function poll(){await refresh();setTimeout(poll,1500);}poll();
 window.CncPreflight={files,resume,afterZero,canResume,refresh};
})();
