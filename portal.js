const cfg = window.NPA_PORTAL_CONFIG || {};
const configured = cfg.supabaseUrl && cfg.supabasePublishableKey;
const sb = configured ? supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;

function bringIntoView(el, focusSelector = null){
  if(!el)return;
  window.requestAnimationFrame(()=>{
    const rect=el.getBoundingClientRect();
    const topSafe=92;
    const bottomSafe=window.innerHeight-24;
    if(rect.top<topSafe || rect.bottom>bottomSafe){
      el.scrollIntoView({behavior:'smooth',block:'start'});
    }
    if(focusSelector){
      window.setTimeout(()=>{
        const target=el.matches?.(focusSelector)?el:el.querySelector?.(focusSelector);
        target?.focus?.({preventScroll:true});
      },280);
    }
  });
}


function showPortalToast(title, message='', isError=false){
  let region=document.getElementById('portalToastRegion');
  if(!region){
    region=document.createElement('div');
    region.id='portalToastRegion';
    region.className='portal-toast-region';
    region.setAttribute('aria-live','polite');
    region.setAttribute('aria-atomic','true');
    document.body.appendChild(region);
  }
  const toast=document.createElement('div');
  toast.className=`portal-toast${isError?' error':''}`;
  toast.setAttribute('role',isError?'alert':'status');
  toast.innerHTML=`<span class="portal-toast-icon">${isError?'!':'✓'}</span><div><strong>${esc(title)}</strong>${message?`<span>${esc(message)}</span>`:''}</div>`;
  region.appendChild(toast);
  window.setTimeout(()=>{
    toast.classList.add('is-leaving');
    window.setTimeout(()=>toast.remove(),220);
  },3600);
}

const show = (el,msg,ok=false)=>{
  if(!el)return;
  el.hidden=false;
  el.className=ok?'portal-success':'portal-error';
  el.textContent=msg;
  bringIntoView(el);
};

(async()=>{
  const login=document.getElementById('loginForm');
  if(login){
    if(!configured){show(loginMessage,'Portal setup is not connected to Supabase yet.');return;}
    const {data:{session}}=await sb.auth.getSession(); if(session){await routeUser(session.user);return;}
    login.addEventListener('submit',async e=>{e.preventDefault();const btn=login.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Signing in…';const {data,error}=await sb.auth.signInWithPassword({email:email.value.trim(),password:password.value});if(error){show(loginMessage,'Email or password not recognised.');btn.disabled=false;btn.textContent='Sign in';return;}await routeUser(data.user)});
    resetPassword.onclick=async()=>{
      if(!email.value){show(loginMessage,'Enter your email address first.');return;}
      resetPassword.disabled=true;
      resetPassword.textContent='Sending…';
      const {error}=await sb.auth.resetPasswordForEmail(email.value.trim(),{
        redirectTo:'https://nicoleplattenaccounting.co.uk/reset-password.html'
      });
      show(loginMessage,error?'We could not send the reset email.':'Password reset email sent. Please check your inbox and junk folder.',!error);
      resetPassword.disabled=false;
      resetPassword.textContent='Forgotten password?';
    };
    return;
  }

  if(!configured)return location.href='client-login.html';

  if(document.getElementById('resetPasswordForm')) {
    await loadPasswordReset();
    return;
  }

  const {data:{session}}=await sb.auth.getSession(); if(!session)return location.href='client-login.html';

  if(document.getElementById('changePasswordForm')) {
    await loadPasswordChange(session.user);
    return;
  }

  logoutBtn?.addEventListener('click',async()=>{await sb.auth.signOut();location.href='client-login.html'});
  if(location.pathname.endsWith('portal.html'))await loadPortal(session.user);
})();


async function loadPasswordReset(){
  const status = document.getElementById('resetPasswordStatus');
  const form = document.getElementById('resetPasswordForm');
  const button = form?.querySelector('button[type=submit]');

  const {data:{session}} = await sb.auth.getSession();

  if(!session){
    form?.classList.add('hidden');
    show(status,'This password reset link is invalid or has expired. Please request a new one from the login page.');
    return;
  }

  form.addEventListener('submit', async e=>{
    e.preventDefault();

    const password = document.getElementById('resetNewPassword').value;
    const confirm = document.getElementById('resetConfirmPassword').value;

    if(password.length < 10){
      show(status,'Please use at least 10 characters.');
      return;
    }

    if(password !== confirm){
      show(status,'The two passwords do not match.');
      return;
    }

    button.disabled=true;
    button.textContent='Saving…';

    const {error}=await sb.auth.updateUser({password});

    if(error){
      show(status,error.message || 'We could not reset your password. Please request a new reset link.');
      button.disabled=false;
      button.textContent='Save new password';
      return;
    }

    show(status,'Password changed successfully ✓ Redirecting you to sign in…',true);

    await sb.auth.signOut();
    setTimeout(()=>location.href='client-login.html',900);
  });
}

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
  if((profile?.portal_tier||'full')==='potential'){
    renderPotentialPortal(profile);
    await loadSharedPortalCommunication(profile,user.id,[]);
    bindPortalAutoReveal();
    return;
  }

  await loadClientNextDue(user.id);
  await loadClientActions(user.id);

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

  await loadSharedPortalCommunication(profile,user.id,active);
  bindPortalAutoReveal();
}

async function loadSharedPortalCommunication(profile,clientId,activeWorks=[]){
  const activeOptions=(activeWorks||[]).length
    ? activeWorks.map(w=>`<option value="${escAttr(w.id)}">${esc(w.service_name||'Accounting')}${w.period_label?` — ${esc(w.period_label)}`:''}</option>`).join('')
    : '';

  if(window.documentWork) documentWork.innerHTML=activeOptions || '<option value="">General documents</option>';
  if(window.clientNoteWork) clientNoteWork.innerHTML='<option value="">General note</option>'+activeOptions;

  if(window.messages){
    const {data:msgs,error}=await sb.from('messages').select('*').eq('client_id',clientId).order('created_at',{ascending:false});
    messages.innerHTML=error
      ? '<p class="portal-muted">No portal messages yet.</p>'
      : msgs?.length
        ? msgs.map(m=>`<div class="message"><p>${esc(m.message)}</p><time>${formatStamp(m.created_at)}</time></div>`).join('')
        : '<p class="portal-muted">No messages yet.</p>';
  }

  await Promise.all([loadDocumentHistory(clientId),loadClientNoteHistory(clientId)]);

  if(window.documentForm && !documentForm.dataset.bound){
    documentForm.dataset.bound='1';
    documentForm.addEventListener('submit',e=>sendDocuments(e,profile,clientId));
  }
  if(window.clientNoteForm && !clientNoteForm.dataset.bound){
    clientNoteForm.dataset.bound='1';
    clientNoteForm.addEventListener('submit',e=>sendClientNote(e,clientId));
  }
}

function renderPotentialPortal(profile){
  document.getElementById('potentialPortalPreview')?.classList.remove('hidden');
  document.querySelectorAll('.full-client-only').forEach(el=>el.classList.add('hidden'));
  const count=document.getElementById('activeCount'); if(count)count.textContent='Preview access';
  const copy=document.getElementById('welcomePortalCopy');
  if(copy)copy.textContent='Your preview account is ready. Follow your progress, message Nicole and send documents securely while you discuss the right package for your business.';
  const preview=document.getElementById('potentialPortalPreview');
  if(preview && profile?.potential_discussion){
    const hero=preview.querySelector('.potential-preview-hero');
    const note=document.createElement('div');note.className='potential-discussion-note';
    note.innerHTML=`<span>Current discussion</span><strong>${esc(profile.potential_discussion)}</strong>`;
    hero?.appendChild(note);
  }
  renderPotentialJourney(profile);
}

function renderPotentialJourney(profile){
  const steps=[
    ['discuss_needs','Discuss your accountancy needs'],
    ['learn_business','Learn about your business and key information'],
    ['discuss_package','Discuss a package and services tailored to you'],
    ['agree_scope_fee','Agree the scope of work and fee'],
    ['move_to_onboarding','Move into the client onboarding process']
  ];
  const raw=profile?.potential_checklist&&typeof profile.potential_checklist==='object'?profile.potential_checklist:{};
  const complete=steps.filter(([key])=>!!raw[key]).length;
  const percent=Math.round((complete/steps.length)*100);
  const percentEl=document.getElementById('potentialJourneyPercent');
  const bar=document.getElementById('potentialJourneyBar');
  const title=document.getElementById('potentialJourneyTitle');
  const copy=document.getElementById('potentialJourneyCopy');
  const list=document.getElementById('potentialJourneySteps');
  if(percentEl)percentEl.textContent=`${percent}%`;
  if(bar)bar.style.width=`${percent}%`;
  if(title)title.textContent=percent===100?'Ready to start your journey with Nicole':`${percent}% of the way there`;
  if(copy)copy.textContent=percent===100?'Your discussions are complete. Nicole can now move your account into the full onboarding portal.':`${percent}% of the way to starting your journey with Nicole. Nicole will update each step as your discussions progress.`;
  if(list)list.innerHTML=steps.map(([key,label],ix)=>`<div class="potential-client-step ${raw[key]?'completed':''}"><span class="potential-client-step-icon">${raw[key]?'✓':ix+1}</span><div><strong>${esc(label)}</strong><small>${raw[key]?'Completed':'To be completed'}</small></div></div>`).join('');
}

function bindPortalAutoReveal(){
  document.querySelectorAll('details').forEach(details=>{
    if(details.dataset.autoRevealBound==='true')return;
    details.dataset.autoRevealBound='true';
    details.addEventListener('toggle',()=>{
      if(details.open) bringIntoView(details);
    });
  });
}


function stageData(work){
  if(Array.isArray(work.stages)&&work.stages.length)return work.stages;
  const defaults=["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"];
  const ix=Math.max(0,defaults.indexOf(work.current_stage));
  return defaults.map((name,i)=>({name,completed:(work.progress||0)>=100||i<ix}));
}
function progress(work){const s=stageData(work);return s.length?Math.round(s.filter(x=>x.completed).length/s.length*100):(work.progress||0)}


async function loadClientNextDue(clientId){
  const card=document.getElementById('clientDueCard');
  if(!card)return;

  const {data,error}=await sb.from('client_schedules')
    .select('title,client_label,cadence,next_due_date')
    .eq('client_id',clientId)
    .eq('is_active',true)
    .order('next_due_date',{ascending:true})
    .limit(1);

  if(error || !data?.length){
    clientDueHeadline.textContent='Nothing due yet';
    clientDueDate.textContent='Nicole will add your next date when required.';
    clientDueService.textContent='';
    return;
  }

  const item=data[0];
  const today=localDateOnly(new Date());
  const due=new Date(`${item.next_due_date}T12:00:00`);
  const start=new Date(`${today}T12:00:00`);
  const days=Math.round((due-start)/86400000);
  const label=item.client_label||'Next due date';

  if(days>1) clientDueHeadline.textContent=`${label} due in ${days} days`;
  else if(days===1) clientDueHeadline.textContent=`${label} due tomorrow`;
  else if(days===0) clientDueHeadline.textContent=`${label} due today`;
  else clientDueHeadline.textContent=`${label} is ${Math.abs(days)} day${Math.abs(days)===1?'':'s'} overdue`;

  clientDueDate.textContent=due.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  clientDueService.textContent=item.title||'';
  card.classList.toggle('overdue',days<0);
}
function localDateOnly(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

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


async function loadClientNoteHistory(clientId){
  const el=document.getElementById('clientNoteHistory');
  if(!el)return;

  const {data,error}=await sb.from('client_notes')
    .select('id,note,service_name,created_at')
    .eq('client_id',clientId)
    .order('created_at',{ascending:false})
    .limit(10);

  if(error||!data?.length){
    el.innerHTML='<p class="portal-muted">No notes sent yet.</p>';
    return;
  }

  el.innerHTML=data.map(n=>`<div class="client-own-note">
    <div class="client-own-note-meta">
      <strong>${esc(n.service_name||'General note')}</strong>
      <time>${formatStamp(n.created_at)}</time>
    </div>
    <p>${esc(n.note)}</p>
  </div>`).join('');
}

async function sendClientNote(e,clientId){
  e.preventDefault();
  const formEl=e.currentTarget;
  if(formEl.dataset.submitting==='1')return;
  const note=clientNoteText.value.trim();
  if(!note)return show(clientNoteMessage,'Write a note first.');

  const btn=formEl.querySelector('button[type=submit]');
  formEl.dataset.submitting='1';
  btn.disabled=true;
  btn.textContent='Sending…';

  try{
    const {data,error}=await sb.functions.invoke('notify-client-note',{
      body:{
        note,
        workId:clientNoteWork.value||null
      }
    });

    const failed=error||data?.error;
    const warning=data?.warning;

    show(
      clientNoteMessage,
      failed
        ? (data?.error||error?.message||'Your note could not be sent.')
        : warning
          ? 'Your note was saved, but the email notification could not be sent. Nicole can still see it in the admin portal.'
          : 'Note sent to Nicole ✓',
      !failed
    );

    if(!failed){
      clientNoteText.value='';
      showPortalToast('DONE — Message sent','Nicole can now see your message in her portal.');
      await loadClientNoteHistory(clientId);
    }else{
      showPortalToast('Message not sent',data?.error||error?.message||'Please try again.',true);
    }
  }finally{
    formEl.dataset.submitting='0';
    btn.disabled=false;
    btn.textContent='Send note to Nicole';
  }
}

async function loadDocumentHistory(clientId){
  const el=document.getElementById('documentHistory');
  if(!el)return;
  const {data,error}=await sb.from('document_submissions')
    .select('id,file_name,file_count,service_name,sent_at')
    .eq('client_id',clientId)
    .order('sent_at',{ascending:false})
    .limit(8);
  if(error||!data?.length){
    el.innerHTML='<p class="portal-muted">No documents sent yet.</p>';
    return;
  }
  el.innerHTML=data.map(d=>`<div class="document-history-row"><div><strong>${esc(d.file_name||'Document')}</strong>${d.service_name?`<small>${esc(d.service_name)}</small>`:''}</div><time>${formatStamp(d.sent_at)}</time></div>`).join('');
}

async function sendDocuments(e,profile,clientId){
  e.preventDefault();
  const formEl=e.currentTarget;
  if(formEl.dataset.submitting==='1')return;
  const files=[...documentFile.files];
  if(!files.length)return show(documentMessage,'Choose at least one file.');

  const allowedExt=/\.(pdf|doc|docx|xls|xlsx|csv|jpg|jpeg|png|heic|webp)$/i;
  if(files.length>5)return show(documentMessage,'Please send no more than 5 files at once.');
  if(files.some(f=>!allowedExt.test(f.name)))return show(documentMessage,'One of those file types is not supported.');
  if(files.some(f=>f.size>8*1024*1024))return show(documentMessage,'Each file must be 8 MB or smaller.');
  const total=files.reduce((sum,f)=>sum+f.size,0);
  if(total>20*1024*1024)return show(documentMessage,'Please keep the total upload under 20 MB.');

  const btn=formEl.querySelector('button[type=submit]');
  formEl.dataset.submitting='1';
  btn.disabled=true; btn.textContent='Sending…';

  try{
    const form=new FormData();
    files.forEach(file=>form.append('files',file,file.name));
    form.append('note',documentNote.value.trim());
    form.append('workId',documentWork.value||'');

    const {data,error}=await sb.functions.invoke('email-document',{body:form});
    const detail=data?.error||error?.message;
    const failed=error||data?.error;

    show(documentMessage,failed
      ? (detail||'The documents could not be emailed. Please try again.')
      : 'Documents sent securely to Nicole ✓',!failed);

    if(!failed){
      const sentCount=files.length;
      const requestId=document.getElementById('documentRequest')?.value||'';
      if(requestId){await sb.from('client_document_requests').update({status:'received',received_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',requestId).eq('client_id',clientId);}
      formEl.reset();
      showPortalToast('DONE — Documents sent',`${sentCount} file${sentCount===1?'':'s'} sent securely to Nicole.`);
      await Promise.all([loadDocumentHistory(clientId),loadClientActions(clientId)]);
    }else{
      showPortalToast('Documents not sent',detail||'Please try again.',true);
    }
  }finally{
    formEl.dataset.submitting='0';
    btn.disabled=false; btn.textContent='Email documents to Nicole';
  }
}

function formatStamp(value){try{return new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}catch{return''}}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escAttr(v=''){return esc(v).replace(/`/g,'&#96;')}


/* V11 — client action centre */
async function loadClientActions(clientId){
  const list=document.getElementById('clientActionsList'); if(!list)return;
  const [requestsRes,onboardingRes,workRes]=await Promise.all([
    sb.from('client_document_requests').select('id,title,note,due_date,status').eq('client_id',clientId).eq('status','requested').order('due_date',{ascending:true,nullsFirst:false}),
    sb.from('client_onboarding_items').select('id,title,completed,client_action_required').eq('client_id',clientId).eq('completed',false).eq('client_action_required',true).order('position',{ascending:true}),
    sb.from('client_work').select('id,service_name,period_label,current_stage,next_action,next_action_detail,is_active').eq('client_id',clientId).eq('is_active',true)
  ]);
  const today=localDateOnly(new Date()); const actions=[];
  (requestsRes.data||[]).forEach(r=>actions.push({kind:'document',title:`Upload ${r.title}`,detail:r.note||'Nicole is waiting for this document.',due:r.due_date,overdue:!!r.due_date&&r.due_date<today,requestId:r.id}));
  (onboardingRes.data||[]).forEach(r=>actions.push({kind:'onboarding',title:r.title,detail:'Needed to complete your onboarding.'}));
  (workRes.data||[]).forEach(w=>{const action=(w.next_action||'').trim(); const stage=(w.current_stage||'').toLowerCase(); if(action&&action.toLowerCase()!=='nothing needed right now')actions.push({kind:'work',title:action,detail:w.next_action_detail||`${w.service_name||'Accounting work'}${w.period_label?` · ${w.period_label}`:''}`}); else if(stage.includes('approval from client'))actions.push({kind:'approval',title:`Approve ${w.service_name||'your accounting work'}`,detail:w.period_label||'Nicole is waiting for your approval.'});});
  const title=document.getElementById('clientActionsTitle'),sub=document.getElementById('clientActionsSub'),count=document.getElementById('clientActionsCount'); if(count)count.textContent=String(actions.length); if(title)title.textContent=actions.length?`${actions.length} action${actions.length===1?'':'s'} needed`:'You’re all caught up'; if(sub)sub.textContent=actions.length?'Complete these items to keep your work moving.':'Anything Nicole needs from you will appear here.';
  list.innerHTML=actions.length?actions.map(a=>`<article class="client-action-row ${a.overdue?'overdue':''} ${a.requestId?'clickable':''}" ${a.requestId?`data-client-request="${escAttr(a.requestId)}" role="button" tabindex="0"`:''}><span class="action-icon">${a.kind==='document'?'↥':a.kind==='approval'?'✓':a.kind==='onboarding'?'○':'→'}</span><span><strong>${esc(a.title)}</strong><small>${esc(a.detail||'')}${a.due?` · Due ${new Date(`${a.due}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`:''}</small></span><b>${a.overdue?'Overdue':a.kind==='document'?'Upload':'Action'}</b></article>`).join(''):'<div class="today-clear">No actions needed right now.</div>'; list.querySelectorAll('[data-client-request]').forEach(row=>{const go=()=>{const sel=document.getElementById('documentRequest');if(sel)sel.value=row.dataset.clientRequest;document.getElementById('documentForm')?.scrollIntoView({behavior:'smooth',block:'start'});};row.addEventListener('click',go);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  const select=document.getElementById('documentRequest'); if(select){select.innerHTML='<option value="">No — general document upload</option>'+(requestsRes.data||[]).map(r=>`<option value="${escAttr(r.id)}">${esc(r.title)}</option>`).join('');}
}
