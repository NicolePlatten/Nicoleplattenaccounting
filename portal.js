const cfg = window.NPA_PORTAL_CONFIG || {};
const configured = cfg.supabaseUrl && cfg.supabasePublishableKey;
const sb = configured ? supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;

const show = (el,msg,ok=false)=>{ if(!el)return; el.hidden=false; el.className=ok?'portal-success':'portal-error'; el.textContent=msg; };

(async()=>{
  const login=document.getElementById('loginForm');
  if(login){
    if(!configured){show(loginMessage,'Portal setup is not connected to Supabase yet.');return;}
    const {data:{session}}=await sb.auth.getSession(); if(session){await routeUser(session.user);return;}
    login.addEventListener('submit',async e=>{e.preventDefault();const btn=login.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Signing in…';const {data,error}=await sb.auth.signInWithPassword({email:email.value.trim(),password:password.value});if(error){show(loginMessage,'Email or password not recognised.');btn.disabled=false;btn.textContent='Sign in';return;}await routeUser(data.user)});
    resetPassword.onclick=async()=>{if(!email.value){show(loginMessage,'Enter your email address first.');return;}const {error}=await sb.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:new URL('client-login.html',location.href).href});show(loginMessage,error?'We could not send the reset email.':'Password reset email sent.',!error)};
    return;
  }

  if(!configured)return location.href='client-login.html';
  const {data:{session}}=await sb.auth.getSession(); if(!session)return location.href='client-login.html';

  if(document.getElementById('changePasswordForm')) {
    await loadPasswordChange(session.user);
    return;
  }

  logoutBtn?.addEventListener('click',async()=>{await sb.auth.signOut();location.href='client-login.html'});
  if(location.pathname.endsWith('portal.html'))await loadPortal(session.user);
})();

async function routeUser(user){
  const {data}=await sb.from('profiles').select('role,must_change_password').eq('id',user.id).single();
  if(data?.role==='admin') return location.href='admin.html';
  if(data?.must_change_password) return location.href='change-password.html';
  location.href='portal.html';
}

async function loadPasswordChange(user) {
  const { data: profile } = await sb.from('profiles').select('role,must_change_password').eq('id', user.id).single();
  if(profile?.role === 'admin') return location.href='admin.html';
  if(!profile?.must_change_password) return location.href='portal.html';

  changePasswordForm.addEventListener('submit', async e => {
    e.preventDefault();
    const password = newPassword.value;
    const confirm = confirmPassword.value;
    if(password.length < 10) return show(passwordMessage, 'Please use at least 10 characters.');
    if(password !== confirm) return show(passwordMessage, 'The two passwords do not match.');
    const btn = e.currentTarget.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    const { data, error } = await sb.functions.invoke('complete-first-login', { body: { password } });
    const detail = data?.error || error?.message;
    if(error || data?.error){
      show(passwordMessage, detail || 'We could not change your password. Please try again.');
      btn.disabled = false; btn.textContent = 'Save new password';
      return;
    }
    show(passwordMessage, 'Password changed successfully ✓', true);
    setTimeout(()=>location.href='portal.html',500);
  });
}

async function loadPortal(user){
  userEmail.textContent=user.email||'';
  const {data:profile}=await sb.from('profiles').select('*').eq('id',user.id).single();
  if(profile?.must_change_password) return location.href='change-password.html';
  welcomeName.textContent=`Welcome, ${profile?.full_name||'there'}`;

  const {data:works,error}=await sb.from('client_work').select('*').eq('client_id',user.id).order('updated_at',{ascending:false});
  if(error){activeWork.innerHTML='<p class="portal-error">We could not load your work right now.</p>';return;}

  const rows=works||[];
  const active=rows.filter(w=>w.is_active!==false);
  const completed=rows.filter(w=>w.is_active===false);

  const ids=rows.map(w=>w.id);
  let notes=[];
  if(ids.length){
    const result=await sb.from('work_notes').select('*').in('work_id',ids).order('created_at',{ascending:true});
    notes=result.data||[];
  }
  const notesByWork={};
  notes.forEach(n=>(notesByWork[n.work_id] ||= []).push(n));

  activeCount.textContent=`${active.length} active`;
  activeWork.innerHTML=active.length?active.map(w=>renderWorkCard(w,notesByWork[w.id]||[])).join(''):'<div class="empty-work"><h2>Nothing active right now</h2><p class="portal-muted">Completed work will stay in your history below.</p></div>';
  completedWork.innerHTML=completed.length?completed.map(w=>renderHistoryCard(w,notesByWork[w.id]||[])).join(''):'<p class="portal-muted">No completed work yet.</p>';

  const priority=active[0]||rows[0];
  nextAction.textContent=priority?.next_action||'Nothing needed right now';
  nextActionDetail.textContent=priority?.next_action_detail||'Nicole will update this if anything is required from you.';

  documentWork.innerHTML=active.length?active.map(w=>`<option value="${escAttr(w.service_name||'Accounting')}">${esc(w.service_name||'Accounting')}${w.period_label?` — ${esc(w.period_label)}`:''}</option>`).join(''):'<option value="General documents">General documents</option>';

  const {data:msgs}=await sb.from('messages').select('*').eq('client_id',user.id).order('created_at',{ascending:false});
  if(msgs?.length)messages.innerHTML=msgs.map(m=>`<div class="message"><p>${esc(m.message)}</p><time>${formatStamp(m.created_at)}</time></div>`).join('');

  documentForm.addEventListener('submit',e=>sendDocument(e,profile));
}

function stageData(work){
  if(Array.isArray(work.stages)&&work.stages.length)return work.stages;
  const defaults=['Information received','Accounts preparation','Accounts review','Tax return preparation','Client approval','Submitted to HMRC','Completed'];
  const ix=Math.max(0,defaults.indexOf(work.current_stage));
  return defaults.map((name,i)=>({name,completed:(work.progress||0)>=100||i<ix}));
}
function progress(work){const s=stageData(work);return s.length?Math.round(s.filter(x=>x.completed).length/s.length*100):(work.progress||0)}

function renderWorkCard(work,notes){
  const pct=progress(work), stages=stageData(work), current=stages.find(s=>!s.completed);
  return `<article class="portal-card pad work-card"><div class="work-card-head"><div><span class="portal-kicker">${esc(work.period_label||'Current work')}</span><h2>${esc(work.service_name||'Accounting work')}</h2></div><span class="status-pill">${esc(work.status||'In progress')}</span></div><div class="progress-track"><div class="progress-bar" style="width:${pct}%"></div></div><div class="work-progress-line"><strong>${pct}% complete</strong><span>${current?`Current: ${esc(current.name)}`:'Completed'}</span></div><div class="steps compact">${stages.map((s,i)=>renderClientStage(s,i,stages,notes)).join('')}</div></article>`;
}

function renderClientStage(stage,index,stages,notes){
  const stageNotes=notes.filter(n=>Number(n.stage_index)===index);
  const isCurrent=!stage.completed&&stages.slice(0,index).every(x=>x.completed);
  return `<div class="step ${stage.completed?'done':(isCurrent?'current':'')}"><span class="step-dot">${stage.completed?'✓':index+1}</span><div class="step-content"><strong>${esc(stage.name)}</strong><small>${stage.completed?'Completed':(isCurrent?'Current':'Upcoming')}</small>${stageNotes.length?`<div class="client-stage-notes">${stageNotes.map(renderClientNote).join('')}</div>`:''}</div></div>`;
}

function renderClientNote(n){
  return `<div class="client-stage-note"><div class="stage-note-meta"><strong>${esc(n.author_name||'Nicole')}</strong><span>${formatStamp(n.created_at)}</span></div><p>${esc(n.note)}</p></div>`;
}

function renderHistoryCard(work,notes){
  const stages=stageData(work);
  return `<details class="history-details"><summary><span><strong>${esc(work.service_name||'Accounting work')}</strong><small>${esc(work.period_label||'Completed work')}</small></span><span class="history-complete">✓ Completed</span></summary><div class="history-stage-list">${stages.map((s,i)=>renderClientStage({...s,completed:true},i,stages.map(x=>({...x,completed:true})),notes)).join('')}</div></details>`;
}

async function sendDocument(e,profile){
  e.preventDefault();const file=documentFile.files[0];if(!file)return;
  if(file.size>8*1024*1024){show(documentMessage,'Please keep each file under 8 MB.');return;}
  const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Sending…';
  const form=new FormData();form.append('file',file);form.append('note',documentNote.value);form.append('clientName',profile?.full_name||'Client');form.append('service',documentWork.value||'Accounting');
  const {error}=await sb.functions.invoke('email-document',{body:form});show(documentMessage,error?'The document could not be emailed. Please try again.':'Sent securely to Nicole ✓',!error);if(!error)e.currentTarget.reset();btn.disabled=false;btn.textContent='Email document to Nicole';
}
function formatStamp(value){try{return new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}catch{return''}}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escAttr(v=''){return esc(v).replace(/`/g,'&#96;')}
