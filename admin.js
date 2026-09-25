
function showAdminToast(title, message='', isError=false){
  let region=document.getElementById('adminToastRegion');
  if(!region){
    region=document.createElement('div');
    region.id='adminToastRegion';
    region.className='admin-toast-region';
    region.setAttribute('aria-live','polite');
    region.setAttribute('aria-atomic','true');
    document.body.appendChild(region);
  }
  const toast=document.createElement('div');
  toast.className=`admin-toast${isError?' error':''}`;
  toast.setAttribute('role',isError?'alert':'status');
  toast.innerHTML=`<span class="admin-toast-icon">${isError?'!':'✓'}</span><div><strong>${esc(title)}</strong>${message?`<span>${esc(message)}</span>`:''}</div>`;
  region.appendChild(toast);
  window.setTimeout(()=>{
    toast.classList.add('is-leaving');
    window.setTimeout(()=>toast.remove(),220);
  },3200);
}

const cfg = window.NPA_PORTAL_CONFIG || {};
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
let clientGroups = [];
let potentialClients = [];
let currentClientId = null;
let currentWorkId = null;
let currentAdminId = null;
let allSchedules = [];
let calendarCursor = new Date();
let selectedCalendarDate = null;
let activeServiceFilter = 'all';
let currentNotes = [];
let unreadByClient = {};
let dashboardActivity = [];
let clientStatusFilterValue = 'current';
let globalSearchTerm = '';
let calendarViewMode = 'month';

const WORKFLOWS = {
  annual_accounts: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  bookkeeping: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  vat: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  payroll: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  self_assessment: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  custom: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"]
};

function bringIntoView(el, focusSelector = null) {
  if (!el) return;
  window.requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const topSafe = 92;
    const bottomSafe = window.innerHeight - 24;
    if (rect.top < topSafe || rect.bottom > bottomSafe) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (focusSelector) {
      window.setTimeout(() => {
        const target = el.matches?.(focusSelector) ? el : el.querySelector?.(focusSelector);
        target?.focus?.({ preventScroll: true });
      }, 280);
    }
  });
}

function revealPanel(el, focusSelector = null) {
  if (!el) return;
  el.classList.remove('hidden');
  bringIntoView(el, focusSelector);
}

const show = (el, msg, ok = false) => {
  if (!el) return;
  el.hidden = false;
  el.className = ok ? 'portal-success' : 'portal-error';
  el.textContent = msg;
  bringIntoView(el);
};

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return location.href = 'client-login.html';
  currentAdminId = session.user.id;

  const { data: profile } = await sb.from('profiles').select('role').eq('id', session.user.id).single();
  if (profile?.role !== 'admin') return location.href = 'portal.html';

  logoutBtn.onclick = async () => { await sb.auth.signOut(); location.href = 'client-login.html'; };
  newClientBtn.onclick = showNewClient;
  cancelNewClient.onclick = () => { newClientForm.classList.add('hidden'); adminEmpty.classList.remove('hidden'); };
  newClientForm.addEventListener('submit', createClient);
  newWorkBtn.onclick = showNewWork;
  deleteClientBtn?.addEventListener('click', deleteCurrentClient);
  addScheduleBtn?.addEventListener('click', ()=>{
    if(!scheduleDueDate.value) scheduleDueDate.value=formatDateInput(new Date());
    revealPanel(scheduleForm, '#scheduleTitle, input, select, textarea');
  });
  cancelScheduleBtn?.addEventListener('click', ()=>scheduleForm.classList.add('hidden'));
  scheduleForm?.addEventListener('submit', saveClientSchedule);
  calendarPrev?.addEventListener('click', ()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar();});
  calendarNext?.addEventListener('click', ()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar();});
  document.querySelectorAll('[data-service-filter]').forEach(btn=>btn.addEventListener('click',()=>{ activeServiceFilter=btn.dataset.serviceFilter; document.querySelectorAll('[data-service-filter]').forEach(b=>b.classList.toggle('active',b===btn)); renderCalendar(); updateServiceSummary(); }));
  cancelNewWork.onclick = () => newWorkForm.classList.add('hidden');
  newWorkForm.addEventListener('submit', createWork);
  workEditor.addEventListener('submit', saveWork);
  deleteWorkBtn.onclick = archiveWork;
  sendMessageBtn.onclick = sendMessage;
  sendClientEmailBtn?.addEventListener('click', sendClientEmail);
  addAdminNoteBtn?.addEventListener('click', addSelectedStageNote);
  editWorkflow.addEventListener('change', () => { renderStageChecklist(null); renderNotesPanel(); });
  markAllNotificationsRead?.addEventListener('click', markAllActivityRead);
  saveClientStatusBtn?.addEventListener('click', saveClientStatus);
  exportClientsBtn?.addEventListener('click', exportClientDataCsv);
  clientStatusFilter?.addEventListener('change', ()=>{ clientStatusFilterValue=clientStatusFilter.value; renderClientList(); });
  globalClientSearch?.addEventListener('input', ()=>{ globalSearchTerm=globalClientSearch.value.trim().toLowerCase(); renderClientList(); });
  calendarMonthViewBtn?.addEventListener('click', ()=>setCalendarView('month'));
  calendarAgendaViewBtn?.addEventListener('click', ()=>setCalendarView('agenda'));
  showAllNotifications?.addEventListener('click', openActivityDrawer);
  closeActivityDrawer?.addEventListener('click', closeActivityDrawerPanel);
  document.querySelectorAll('[data-close-activity]').forEach(el=>el.addEventListener('click', closeActivityDrawerPanel));
  document.querySelectorAll('.sidebar-link').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.sidebar-link').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  });

  await loadClients();
  await loadAllSchedules();
})();

async function loadClients() {
  unreadByClient = {};
  const [unreadNotesResult, unreadDocsResult, unreadEmailRepliesResult] = await Promise.all([
    sb.from('client_notes').select('client_id').is('admin_seen_at', null),
    sb.from('document_submissions').select('client_id').is('admin_seen_at', null),
    sb.from('client_email_replies').select('client_id').is('admin_seen_at', null)
  ]);
  [...(unreadNotesResult.data || []), ...(unreadDocsResult.data || []), ...(unreadEmailRepliesResult.data || [])].forEach(r => {
    unreadByClient[r.client_id] = (unreadByClient[r.client_id] || 0) + 1;
  });

  const { data: rows, error } = await sb.from('client_work').select('*').order('updated_at', { ascending: false });
  if (error) {
    clientList.innerHTML = `<p class="portal-error">Could not load clients: ${esc(error.message)}</p>`;
    return;
  }

  // Include profiles even if a newly created client has no work record yet.
  const profileResult = await sb.from('profiles').select('id,full_name,business_name,role,client_status,last_login_at').eq('role', 'client');
  const profiles = profileResult.data || [];
  const map = Object.fromEntries(profiles.map(p => [p.id, { ...p, works: [] }]));
  (rows || []).forEach(r => {
    if (!map[r.client_id]) map[r.client_id] = { id: r.client_id, full_name: 'Client', works: [] };
    map[r.client_id].works.push(r);
  });

  clientGroups = Object.values(map).sort((a,b) => (a.full_name || '').localeCompare(b.full_name || ''));
  renderClientList();
  await refreshDashboardOverview();
  if (currentClientId && clientGroups.some(c => c.id === currentClientId)) openClient(currentClientId, false);
}


function renderClientList(){
  const filtered=clientGroups.filter(c=>{
    const status=c.client_status||'active';
    const statusOk=clientStatusFilterValue==='all' || (clientStatusFilterValue==='current' && status!=='former') || status===clientStatusFilterValue;
    if(!statusOk)return false;
    if(!globalSearchTerm)return true;
    const hay=[c.full_name,c.business_name,status,...(c.works||[]).flatMap(w=>[w.service_name,w.period_label,w.status,w.current_stage])].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(globalSearchTerm);
  });
  clientList.innerHTML=filtered.length?filtered.map(c=>{
    const active=c.works.filter(w=>w.is_active!==false).length;
    const unread=unreadByClient[c.id]||0;
    const status=c.client_status||'active';
    return `<button class="client-item" data-id="${c.id}">
      <span class="client-item-row"><strong>${esc(c.full_name||'Client')}</strong>${unread?`<span class="activity-badge">${unread}</span>`:''}</span>
      <small><span class="client-status-dot status-${status}"></span>${clientStatusLabel(status)} · ${active} active · ${c.works.length} total${unread?` · ${unread} unread`:''}</small>
      <small class="client-last-login">Last login: ${formatLastLogin(c.last_login_at)}</small>
    </button>`;
  }).join(''):'<p class="portal-muted">No clients match this view.</p>';
  clientList.querySelectorAll('button[data-id]').forEach(btn=>btn.onclick=()=>openClient(btn.dataset.id));
}
function clientStatusLabel(v){return ({active:'Active',onboarding:'Onboarding',paused:'Paused',former:'Former'})[v]||'Active';}

function formatLastLogin(value){
  if(!value) return 'Never logged in';
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return 'Unknown';
  const diff=Math.max(0,Date.now()-date.getTime());
  const mins=Math.floor(diff/60000);
  const hours=Math.floor(diff/3600000);
  const days=Math.floor(diff/86400000);
  if(mins<1) return 'Just now';
  if(mins<60) return `${mins} min${mins===1?'':'s'} ago`;
  if(hours<24) return `${hours} hour${hours===1?'':'s'} ago`;
  if(days===1) return 'Yesterday';
  if(days<7) return `${days} days ago`;
  return date.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

async function saveClientStatus(){
  if(!currentClientId)return;
  const value=clientStatusSelect.value;
  const {error}=await sb.from('profiles').update({client_status:value}).eq('id',currentClientId);
  show(clientMessage,error?`Could not update client status: ${error.message}`:`Client status changed to ${clientStatusLabel(value)} ✓`,!error);
  if(!error){
    const client=clientGroups.find(c=>c.id===currentClientId); if(client)client.client_status=value;
    await logAudit(currentClientId,'client_status',`Client status changed to ${clientStatusLabel(value)}`,{status:value});
    renderClientList(); await loadClientAuditLog(currentClientId);
  }
}

function bindMarkReadButtons(root){
  root?.querySelectorAll('[data-mark-read-id]').forEach(btn=>btn.addEventListener('click',async e=>{
    e.preventDefault();e.stopPropagation();btn.disabled=true;btn.textContent='Updating…';
    await markActivityItemRead(btn.dataset.markReadKind,btn.dataset.markReadId,btn.dataset.markReadClient);
  }));
}
async function markActivityItemRead(kind,id,clientId){
  const table=kind==='note'?'client_notes':kind==='document'?'document_submissions':kind==='email'?'client_email_replies':null;
  if(!table||!id)return;
  const {error}=await sb.from(table).update({admin_seen_at:new Date().toISOString()}).eq('id',id);
  if(error){alert(`Could not mark as read: ${error.message}`);return;}
  await logAudit(clientId,'activity_read',`${kind==='email'?'Email reply':kind==='document'?'Document upload':'Client note'} marked as read`,{source_id:id});
  await loadClients();
  if(currentClientId===clientId){await loadClientActivity(clientId);await loadClientEmailReplies(clientId);await loadClientAuditLog(clientId);}
}

async function logAudit(clientId,actionType,summary,metadata={}){
  try{await sb.from('practice_audit_log').insert({client_id:clientId||null,actor_id:currentAdminId,actor_name:'Nicole',action_type:actionType,summary,metadata});}
  catch(e){console.warn('Audit write failed',e);}
}
async function loadClientAuditLog(clientId){
  if(!window.clientAuditLog)return;
  const {data,error}=await sb.from('practice_audit_log').select('id,actor_name,summary,created_at').eq('client_id',clientId).order('created_at',{ascending:false}).limit(50);
  if(error){clientAuditLog.innerHTML=`<p class="portal-error">Could not load audit trail: ${esc(error.message)}</p>`;return;}
  clientAuditLog.innerHTML=(data||[]).length?(data||[]).map(r=>`<div class="audit-row"><span class="audit-marker"></span><div><strong>${esc(r.summary)}</strong><small>${esc(r.actor_name||'System')} · ${formatStamp(r.created_at)}</small></div></div>`).join(''):'<p class="portal-muted">No audit events yet.</p>';
}

function setCalendarView(mode){
  calendarViewMode=mode;
  calendarMonthViewBtn.classList.toggle('active',mode==='month');
  calendarAgendaViewBtn.classList.toggle('active',mode==='agenda');
  calendarGrid.classList.toggle('hidden',mode!=='month');
  document.querySelector('.calendar-weekdays')?.classList.toggle('hidden',mode!=='month');
  calendarAgenda.classList.toggle('hidden',mode!=='agenda');
  if(mode==='agenda')renderAgenda();
}
function renderAgenda(){
  const today=dateOnly(new Date()),cutoff=addDays(today,60);
  const rows=(activeServiceFilter==='all'?allSchedules:allSchedules.filter(s=>s.service_type===activeServiceFilter))
    .filter(s=>s.next_due_date>=today&&s.next_due_date<=cutoff).sort((a,b)=>a.next_due_date.localeCompare(b.next_due_date));
  if(!rows.length){calendarAgenda.innerHTML='<p class="portal-muted">Nothing due in the next 60 days.</p>';return;}
  const groups={}; rows.forEach(s=>(groups[s.next_due_date]??=[]).push(s));
  calendarAgenda.innerHTML=Object.entries(groups).map(([date,items])=>`<section class="agenda-day"><h4>${formatFriendlyDate(date)}</h4>${items.map(s=>`<button type="button" class="agenda-item" data-agenda-client="${s.client_id}"><span class="calendar-due-dot service-${s.service_type||'other'}"></span><span><strong>${esc(s.profiles?.full_name||'Client')}</strong><small>${esc(s.title)} · ${serviceLabel(s.service_type)}</small></span><b>${dueRelativeText(s.next_due_date)}</b></button>`).join('')}</section>`).join('');
  calendarAgenda.querySelectorAll('[data-agenda-client]').forEach(btn=>btn.onclick=()=>{openClient(btn.dataset.agendaClient);document.getElementById('clientDirectory')?.scrollIntoView({behavior:'smooth',block:'start'});});
}
function renderTodayPanel(){
  if(!window.todayItems)return;
  const today=dateOnly(new Date());
  const due=allSchedules.filter(s=>s.next_due_date<=today).sort((a,b)=>a.next_due_date.localeCompare(b.next_due_date));
  const unread=dashboardActivity.filter(x=>x.unread);
  const total=due.length+unread.length;
  todayHeading.textContent=total?`${total} thing${total===1?'':'s'} need your attention`:'Nothing urgent right now';
  todaySub.textContent=total?'Deadlines and unread client activity stay here until you deal with them.':'Your deadlines and unread client activity will appear here.';
  const items=[
    ...due.slice(0,5).map(s=>`<button class="today-item ${s.next_due_date<today?'overdue':'due-today'}" type="button" data-today-client="${s.client_id}"><span><strong>${s.next_due_date<today?'Overdue':'Due today'} · ${esc(s.profiles?.full_name||'Client')}</strong><small>${esc(s.title)} · ${serviceLabel(s.service_type)}</small></span><b>${dueRelativeText(s.next_due_date)}</b></button>`),
    ...unread.slice(0,5).map(x=>{const c=clientGroups.find(v=>v.id===x.client_id);return `<button class="today-item unread" type="button" data-today-client="${x.client_id}"><span><strong>Unread ${x.kind==='email'?'email reply':x.kind==='document'?'document':'client note'} · ${esc(c?.full_name||'Client')}</strong><small>${esc((x.detail||'').slice(0,120))}</small></span><b>Open</b></button>`})
  ];
  todayItems.innerHTML=items.length?items.join(''):'<div class="today-clear">All clear — nothing needs attention today.</div>';
  todayItems.querySelectorAll('[data-today-client]').forEach(btn=>btn.onclick=()=>openClient(btn.dataset.todayClient));
}

async function advanceScheduleAfterWork(scheduleId,sourceDueDate){
  const {data:schedule,error}=await sb.from('client_schedules').select('*').eq('id',scheduleId).single();
  if(error||!schedule||schedule.next_due_date!==sourceDueDate)return;
  const next=nextScheduleDate(schedule.next_due_date,schedule.cadence);
  const patch=schedule.cadence==='one_off'?{is_active:false,last_completed_for:sourceDueDate,updated_at:new Date().toISOString()}:{next_due_date:next,last_completed_for:sourceDueDate,reminder_14_sent_for:null,reminder_7_sent_for:null,updated_at:new Date().toISOString()};
  await sb.from('client_schedules').update(patch).eq('id',scheduleId).eq('next_due_date',sourceDueDate);
  await logAudit(currentClientId,'schedule_advanced',schedule.cadence==='one_off'?`One-off schedule completed: ${schedule.title}`:`Schedule advanced: ${schedule.title} → ${formatFriendlyDate(next)}`,{schedule_id:scheduleId,completed_for:sourceDueDate});
}
function exportClientDataCsv(){
  const rows=[['Client','Business','Status','Service','Period','Work status','Progress','Next due dates']];
  clientGroups.forEach(c=>{
    const dueText=allSchedules.filter(s=>s.client_id===c.id&&s.is_active).map(s=>`${s.title}: ${s.next_due_date}`).join(' | ');
    if((c.works||[]).length)c.works.forEach(w=>rows.push([c.full_name||'',c.business_name||'',clientStatusLabel(c.client_status||'active'),w.service_name||'',w.period_label||'',w.status||'',w.progress??'',dueText]));
    else rows.push([c.full_name||'',c.business_name||'',clientStatusLabel(c.client_status||'active'),'','','','',dueText]);
  });
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`nicole-platten-client-export-${dateOnly(new Date())}.csv`;document.body.appendChild(a);a.click();a.remove();
}
function showNewClient() {
  adminEmpty.classList.add('hidden');
  clientWorkspace.classList.add('hidden');
  revealPanel(newClientForm, 'input, select, textarea');
}

function openClient(clientId, scroll = true) {
  const client = clientGroups.find(c => c.id === clientId);
  if (!client) return;
  currentClientId = clientId;
  currentWorkId = null;
  currentNotes = [];

  document.querySelectorAll('.client-item').forEach(x => x.classList.toggle('active', x.dataset.id === clientId));
  adminEmpty.classList.add('hidden');
  newClientForm.classList.add('hidden');
  revealPanel(clientWorkspace);
  workEditor.classList.add('hidden');
  newWorkForm.classList.add('hidden');

  clientHeading.textContent = client.full_name || 'Client';
  clientSub.textContent = client.business_name || 'Manage ongoing and one-off work';
  clientStatusSelect.value = client.client_status || 'active';
  renderWorkList(client);
  loadClientActivity(clientId);
  loadClientEmailReplies(clientId);
  loadClientSchedules(clientId);
  loadClientAuditLog(clientId);
  if (scroll) bringIntoView(clientWorkspace);
}



async function refreshDashboardOverview(){
  const active=clientGroups.reduce((n,c)=>n+c.works.filter(w=>w.is_active!==false).length,0);

  const [unreadNotes,unreadDocs,unreadReplies,recentNotes,recentDocs,recentReplies]=await Promise.all([
    sb.from('client_notes').select('id,client_id,note,service_name,created_at').is('admin_seen_at',null).order('created_at',{ascending:false}).limit(25),
    sb.from('document_submissions').select('id,client_id,file_name,file_count,service_name,client_note,sent_at').is('admin_seen_at',null).order('sent_at',{ascending:false}).limit(25),
    sb.from('client_email_replies').select('id,client_id,subject,body_text,attachment_names,received_at').is('admin_seen_at',null).order('received_at',{ascending:false}).limit(25),
    sb.from('client_notes').select('id,client_id,note,service_name,created_at,admin_seen_at').order('created_at',{ascending:false}).limit(30),
    sb.from('document_submissions').select('id,client_id,file_name,file_count,service_name,client_note,sent_at,admin_seen_at').order('sent_at',{ascending:false}).limit(30),
    sb.from('client_email_replies').select('id,client_id,subject,body_text,attachment_names,received_at,admin_seen_at').order('received_at',{ascending:false}).limit(30)
  ]);

  const unreadRows=[
    ...(unreadNotes.data||[]).map(x=>({kind:'note',id:x.id,client_id:x.client_id,title:'New note',detail:x.note,service:x.service_name,created_at:x.created_at,unread:true})),
    ...(unreadDocs.data||[]).map(x=>({kind:'document',id:x.id,client_id:x.client_id,title:'Documents uploaded',detail:`${x.file_count||1} file${(x.file_count||1)===1?'':'s'}${x.file_name?` · ${x.file_name}`:''}${x.client_note?` — ${x.client_note}`:''}`,service:x.service_name,created_at:x.sent_at,unread:true})),
    ...(unreadReplies.data||[]).map(x=>({kind:'email',id:x.id,client_id:x.client_id,title:'Email reply',detail:`${x.subject||'Reply'} — ${x.body_text||''}`,created_at:x.received_at,unread:true}))
  ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  dashboardActivity=[
    ...(recentNotes.data||[]).map(x=>({kind:'note',id:x.id,client_id:x.client_id,title:'Client note',detail:x.note,service:x.service_name,created_at:x.created_at,unread:!x.admin_seen_at})),
    ...(recentDocs.data||[]).map(x=>({kind:'document',id:x.id,client_id:x.client_id,title:'Document upload',detail:`${x.file_count||1} file${(x.file_count||1)===1?'':'s'}${x.file_name?` · ${x.file_name}`:''}${x.client_note?` — ${x.client_note}`:''}`,service:x.service_name,created_at:x.sent_at,unread:!x.admin_seen_at})),
    ...(recentReplies.data||[]).map(x=>({kind:'email',id:x.id,client_id:x.client_id,title:'Email reply',detail:`${x.subject||'Reply'} — ${x.body_text||''}`,created_at:x.received_at,unread:!x.admin_seen_at}))
  ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,40);

  statClients.textContent=clientGroups.length;
  statActiveWork.textContent=active;
  statNewActivity.textContent=unreadRows.length;

  markAllNotificationsRead.disabled=!unreadRows.length;

  const visible=unreadRows.slice(0,3);

  notificationCentre.innerHTML=visible.length
    ? visible.map(x=>renderCompactNotification(x)).join('')
    : `<div class="notification-empty">
         <span class="notification-empty-icon">✓</span>
         <div><strong>You're all caught up</strong><p>No new client updates right now.</p></div>
       </div>`;

  notificationCentre.querySelectorAll('[data-open-client]').forEach(b=>b.onclick=()=>openClient(b.dataset.openClient));
  bindMarkReadButtons(notificationCentre);
  renderTodayPanel();
}

function renderCompactNotification(x){
  const client=clientGroups.find(v=>v.id===x.client_id);
  const icon=x.kind==='document'?'↥':x.kind==='email'?'✉':'✎';
  const label=x.kind==='document'?'Document upload':x.kind==='email'?'Email reply':'Client note';
  return `<div class="notification-item compact-notification ${x.unread?'is-unread':''}" data-client="${escAttr(x.client_id)}">
    <button class="notification-open" type="button" data-open-client="${escAttr(x.client_id)}">
      <span class="notification-icon-wrap"><span class="unread-dot"></span><span class="notification-icon">${icon}</span></span>
      <span class="notification-copy">
        <span class="notification-topline">
          <strong>${esc(client?.full_name||'Client')}</strong>
          <time>${formatStamp(x.created_at)}</time>
        </span>
        <span class="notification-meta">${label}${x.service?` · ${esc(x.service)}`:''}</span>
        <p>${esc(x.detail||'')}</p>
      </span>
      <span class="notification-arrow">›</span>
    </button>
    ${x.unread?`<button class="mark-read-btn" type="button" data-mark-read-kind="${x.kind}" data-mark-read-id="${x.id}" data-mark-read-client="${x.client_id}">Mark as read</button>`:''}
  </div>`;
}

function openActivityDrawer(){
  activityDrawer.classList.remove('hidden');
  activityDrawer.setAttribute('aria-hidden','false');
  document.body.classList.add('drawer-open');

  activityDrawerList.innerHTML=dashboardActivity.length
    ? dashboardActivity.map(x=>{
        const client=clientGroups.find(v=>v.id===x.client_id);
        return `<button class="drawer-activity-item ${x.unread?'is-unread':''}" type="button" data-client="${escAttr(x.client_id)}">
          <span class="drawer-activity-icon">${x.kind==='document'?'↥':x.kind==='email'?'✉':'✎'}</span>
          <span class="drawer-activity-copy">
            <span><strong>${esc(client?.full_name||'Client')}</strong><time>${formatStamp(x.created_at)}</time></span>
            <b>${x.kind==='document'?'Document upload':x.kind==='email'?'Email reply':'Client note'}</b>
            ${x.service?`<small>${esc(x.service)}</small>`:''}
            <p>${esc(x.detail||'')}</p>
          </span>
        </button>`;
      }).join('')
    : '<p class="portal-muted">No activity to show.</p>';

  activityDrawerList.querySelectorAll('.drawer-activity-item').forEach(btn=>{
    btn.onclick=()=>{
      closeActivityDrawerPanel();
      openClient(btn.dataset.client);
    };
  });
}

function closeActivityDrawerPanel(){
  activityDrawer.classList.add('hidden');
  activityDrawer.setAttribute('aria-hidden','true');
  document.body.classList.remove('drawer-open');
}

async function markAllActivityRead(){
  const now=new Date().toISOString();
  markAllNotificationsRead.disabled=true; markAllNotificationsRead.textContent='Updating…';
  await Promise.all([
    sb.from('client_notes').update({admin_seen_at:now}).is('admin_seen_at',null),
    sb.from('document_submissions').update({admin_seen_at:now}).is('admin_seen_at',null),
    sb.from('client_email_replies').update({admin_seen_at:now}).is('admin_seen_at',null)
  ]);
  await logAudit(null,'activity_read_all','All unread client activity marked as read',{});
  unreadByClient={};
  await loadClients();
  if(currentClientId)await loadClientActivity(currentClientId);
  markAllNotificationsRead.textContent='Mark all read';
}

async function loadClientActivity(clientId){
  const [notesResult, docsResult, repliesResult]=await Promise.all([
    sb.from('client_notes')
      .select('id,note,service_name,created_at,admin_seen_at')
      .eq('client_id',clientId)
      .order('created_at',{ascending:false})
      .limit(30),
    sb.from('document_submissions')
      .select('id,file_name,file_count,service_name,client_note,sent_at,admin_seen_at')
      .eq('client_id',clientId)
      .order('sent_at',{ascending:false})
      .limit(30),
    sb.from('client_email_replies')
      .select('id,subject,body_text,attachment_names,received_at,admin_seen_at')
      .eq('client_id',clientId)
      .order('received_at',{ascending:false})
      .limit(30)
  ]);

  const notes=(notesResult.data||[]).map(n=>({
    kind:'note',
    id:n.id,
    title:'Client note',
    service_name:n.service_name,
    summary:n.note,
    created_at:n.created_at,
    seen:n.admin_seen_at
  }));

  const docs=(docsResult.data||[]).map(d=>({
    kind:'document',
    id:d.id,
    title:'Document upload',
    service_name:d.service_name,
    summary:`${d.file_name||'Document'}${d.client_note?` — ${d.client_note}`:''}`,
    created_at:d.sent_at,
    seen:d.admin_seen_at
  }));

  const replies=(repliesResult.data||[]).map(r=>({
    kind:'email',
    id:r.id,
    title:'Email reply',
    service_name:null,
    summary:`${r.subject||'Reply'} — ${r.body_text||''}${(r.attachment_names||[]).length?` · Attachments: ${(r.attachment_names||[]).join(', ')}`:''}`,
    created_at:r.received_at,
    seen:r.admin_seen_at
  }));

  const rows=[...notes,...docs,...replies]
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
    .slice(0,40);

  const hasUnread=rows.some(r=>!r.seen);
  clientUnreadPill.classList.toggle('hidden',!hasUnread);

  if(!rows.length){
    clientActivity.innerHTML='<p class="portal-muted">No client activity yet.</p>';
  } else {
    clientActivity.innerHTML=rows.map(r=>`
      <div class="activity-row ${r.seen?'':'unread'}">
        <div class="activity-row-head">
          <strong>${esc(r.title)}</strong>
          <time>${formatStamp(r.created_at)}</time>
        </div>
        ${r.service_name?`<small>${esc(r.service_name)}</small>`:''}
        <p>${esc(r.summary||'')}</p>
        ${!r.seen?`<button class="mark-read-btn" type="button" data-mark-read-kind="${r.kind}" data-mark-read-id="${r.id}" data-mark-read-client="${clientId}">Mark as read</button>`:'<span class="read-status">Read</span>'}
      </div>
    `).join('');
    bindMarkReadButtons(clientActivity);
  }

}


async function loadClientEmailReplies(clientId){
  if(!window.clientEmailReplies) return;

  const {data,error}=await sb.from('client_email_replies')
    .select('id,subject,body_text,from_email,attachment_names,received_at,admin_seen_at,forwarded_to_nicole')
    .eq('client_id',clientId)
    .order('received_at',{ascending:false})
    .limit(50);

  if(error){
    clientEmailReplies.innerHTML=`<p class="portal-error">Could not load email replies: ${esc(error.message)}</p>`;
    return;
  }

  const rows=data||[];
  const unread=rows.filter(r=>!r.admin_seen_at).length;

  if(window.emailReplyCount){
    emailReplyCount.textContent=`${unread} new`;
    emailReplyCount.classList.toggle('hidden',unread===0);
  }

  clientEmailReplies.innerHTML=rows.length ? rows.map(r=>`
    <article class="email-reply-card ${r.admin_seen_at?'':'unread'}">
      <div class="email-reply-top">
        <div>
          <span class="email-reply-label">Client reply</span>
          <strong>${esc(r.subject||'Reply')}</strong>
        </div>
        <time>${formatStamp(r.received_at)}</time>
      </div>
      <p class="email-reply-body">${esc(r.body_text||'')}</p>
      ${(r.attachment_names||[]).length ? `<div class="email-reply-files"><strong>Attachments</strong>${r.attachment_names.map(f=>`<span>📎 ${esc(f)}</span>`).join('')}</div>` : ''}
      <div class="email-reply-foot">
        <small>${r.from_email?`From ${esc(r.from_email)}`:'Received by email'}</small>
        ${r.forwarded_to_nicole?'<small>✓ Copy forwarded to Nicole’s Outlook</small>':'<small>Saved in portal</small>'}
      </div>
    </article>
  `).join('') : '<p class="portal-muted">No email replies yet.</p>';

  // Replies stay unread until Nicole deliberately marks them as dealt with,
  // matching the behaviour of notes and document uploads.
}


async function loadAllSchedules(){
  const {data,error}=await sb.from('client_schedules')
    .select('id,client_id,title,client_label,service_type,cadence,next_due_date,remind_14_days,remind_7_days,reminder_14_sent_for,reminder_7_sent_for,reminder_last_checked_at,reminder_last_error,auto_create_work,is_active,profiles!client_schedules_client_id_fkey(full_name)')
    .eq('is_active',true)
    .order('next_due_date',{ascending:true});

  if(error){console.error('Could not load schedules',error);return;}
  allSchedules=data||[];
  updateScheduleStats();
  renderCalendar();
  updateServiceSummary();
  renderClientList();
  renderTodayPanel();
}

function updateScheduleStats(){
  const today=dateOnly(new Date());
  const seven=addDays(today,7);
  const fourteen=addDays(today,14);
  const overdue=allSchedules.filter(s=>s.next_due_date<today).length;
  const due7=allSchedules.filter(s=>s.next_due_date>=today && s.next_due_date<=seven).length;
  const due14=allSchedules.filter(s=>s.next_due_date>=today && s.next_due_date<=fourteen).length;
  if(window.statUpcoming) statUpcoming.textContent=due7;
  if(window.calendarOverdueChip) calendarOverdueChip.textContent=`${overdue} overdue`;
  if(window.calendar7Chip) calendar7Chip.textContent=`${due7} this week`;
  if(window.calendar14Chip) calendar14Chip.textContent=`${due14} in 14 days`;
}

function renderCalendar(){
  if(!window.calendarGrid)return;
  const year=calendarCursor.getFullYear(),month=calendarCursor.getMonth();
  const calendarSchedules=activeServiceFilter==='all'?allSchedules:allSchedules.filter(s=>s.service_type===activeServiceFilter);
  calendarMonthLabel.textContent=new Date(year,month,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});

  const first=new Date(year,month,1);
  const firstMon=(first.getDay()+6)%7;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const prevDays=new Date(year,month,0).getDate();
  const today=dateOnly(new Date());
  const cells=[];

  for(let i=0;i<42;i++){
    let dnum,cellDate,outside=false;
    if(i<firstMon){dnum=prevDays-firstMon+i+1;cellDate=dateOnly(new Date(year,month-1,dnum));outside=true;}
    else if(i>=firstMon+daysInMonth){dnum=i-(firstMon+daysInMonth)+1;cellDate=dateOnly(new Date(year,month+1,dnum));outside=true;}
    else {dnum=i-firstMon+1;cellDate=dateOnly(new Date(year,month,dnum));}

    const due=calendarSchedules.filter(s=>s.next_due_date===cellDate);
    const overdue=cellDate<today && due.length;
    cells.push(`<button class="calendar-day ${outside?'outside':''} ${cellDate===today?'today':''} ${selectedCalendarDate===cellDate?'selected':''} ${overdue?'has-overdue':''}" type="button" data-date="${cellDate}">
      <span class="calendar-day-number">${dnum}</span>
      <span class="calendar-dots">
        ${due.slice(0,4).map(s=>`<i class="calendar-dot service-${s.service_type||'other'}"></i>`).join('')}
        ${due.length>4?`<b>+${due.length-4}</b>`:''}
      </span>
    </button>`);
  }

  calendarGrid.innerHTML=cells.join('');
  calendarGrid.querySelectorAll('.calendar-day').forEach(btn=>btn.addEventListener('click',()=>{
    selectedCalendarDate=btn.dataset.date;
    renderCalendar();
    renderCalendarDay(selectedCalendarDate);
  }));

  if(!selectedCalendarDate){
    const firstUpcoming=allSchedules.find(s=>s.next_due_date>=today);
    selectedCalendarDate=firstUpcoming?.next_due_date||today;
  }
  renderCalendarDay(selectedCalendarDate);
}

function renderCalendarDay(date){
  if(!window.calendarDayItems)return;
  const d=new Date(`${date}T12:00:00`);
  calendarSelectedDate.textContent=d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const source=activeServiceFilter==='all'?allSchedules:allSchedules.filter(s=>s.service_type===activeServiceFilter);
  const rows=source.filter(s=>s.next_due_date===date);
  calendarDayItems.innerHTML=rows.length?rows.map(s=>`
    <button class="calendar-due-item ${date<dateOnly(new Date())?'overdue':''}" type="button" data-client="${s.client_id}">
      <span class="calendar-due-dot service-${s.service_type||'other'}"></span>
      <span><strong>${esc(s.profiles?.full_name||'Client')}</strong><small>${serviceTypeLabel(s.service_type)} · ${esc(s.title)} · ${cadenceLabel(s.cadence)}</small></span>
      <b>›</b>
    </button>`).join(''):'<p class="portal-muted">Nothing due on this date.</p>';

  calendarDayItems.querySelectorAll('[data-client]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelector(`.client-item[data-id="${btn.dataset.client}"]`)?.click();
    document.getElementById('clientDirectory')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

async function loadClientSchedules(clientId){
  if(!window.clientSchedules)return;
  const {data,error}=await sb.from('client_schedules').select('*').eq('client_id',clientId)
    .order('is_active',{ascending:false}).order('next_due_date',{ascending:true});

  if(error){clientSchedules.innerHTML=`<p class="portal-error">Could not load calendar dates: ${esc(error.message)}</p>`;return;}

  const rows=data||[];
  clientSchedules.innerHTML=rows.length?rows.map(s=>`
    <article class="client-schedule-row ${s.is_active?'':'inactive'}">
      <div class="schedule-date-badge">
        <strong>${new Date(`${s.next_due_date}T12:00:00`).getDate()}</strong>
        <small>${new Date(`${s.next_due_date}T12:00:00`).toLocaleDateString('en-GB',{month:'short'}).toUpperCase()}</small>
      </div>
      <div class="schedule-row-copy">
        <strong>${esc(s.title)}</strong>
        <small>${serviceTypeLabel(s.service_type)} · ${esc(s.client_label)} · ${cadenceLabel(s.cadence)} · ${esc(dueRelativeText(s.next_due_date))}</small>
      </div>
      <div class="schedule-row-actions">
        ${s.is_active?`<button class="schedule-complete" data-complete-schedule="${s.id}" type="button">✓ Complete</button>`:''}
        <button class="schedule-delete" data-delete-schedule="${s.id}" type="button">Delete</button>
      </div>
    </article>`).join(''):'<p class="portal-muted">No recurring dates added yet.</p>';

  clientSchedules.querySelectorAll('[data-complete-schedule]').forEach(btn=>btn.addEventListener('click',()=>completeSchedule(btn.dataset.completeSchedule,rows.find(x=>x.id===btn.dataset.completeSchedule))));
  clientSchedules.querySelectorAll('[data-delete-schedule]').forEach(btn=>btn.addEventListener('click',()=>deleteSchedule(btn.dataset.deleteSchedule)));
}

async function saveClientSchedule(e){
  e.preventDefault();
  if(!currentClientId)return;
  const payload={
    client_id:currentClientId,
    service_type:scheduleServiceType.value,
    title:scheduleTitle.value.trim(),
    client_label:scheduleClientLabel.value.trim()||'Next invoice',
    cadence:scheduleCadence.value,
    next_due_date:scheduleDueDate.value,
    auto_create_work:scheduleAutoCreateWork.checked,
    remind_14_days:scheduleRemind14.checked,
    remind_7_days:scheduleRemind7.checked,
    is_active:true
  };
  if(!payload.title||!payload.next_due_date)return show(scheduleMessage,'Add a title and next due date.');

  const btn=e.currentTarget.querySelector('button[type=submit]');
  btn.disabled=true;btn.textContent='Saving…';
  const {error}=await sb.from('client_schedules').insert(payload);
  show(scheduleMessage,error?(error.message||'Could not save schedule.'):'Schedule added ✓',!error);
  if(error) showAdminToast('Couldn’t save reminder', error.message||'Please try again.', true);

  if(!error){
    showAdminToast('Done — reminder saved', `${payload.title} · ${formatFriendlyDate(payload.next_due_date)}`);
    scheduleForm.reset();
    scheduleClientLabel.value='Next invoice';
    scheduleAutoCreateWork.checked=true;scheduleRemind14.checked=true;scheduleRemind7.checked=true;
    scheduleForm.classList.add('hidden');
    await logAudit(currentClientId,'schedule_created',`Schedule added: ${payload.title}`,payload);
    await loadClientSchedules(currentClientId);
    await loadAllSchedules();
    await loadClientAuditLog(currentClientId);
  }
  btn.disabled=false;btn.textContent='Save schedule';
}

async function completeSchedule(id,schedule){
  if(!schedule)return;
  const next=nextScheduleDate(schedule.next_due_date,schedule.cadence);
  const patch=schedule.cadence==='one_off'
    ? {is_active:false,updated_at:new Date().toISOString()}
    : {next_due_date:next,reminder_14_sent_for:null,reminder_7_sent_for:null,updated_at:new Date().toISOString()};

  const {error}=await sb.from('client_schedules').update(patch).eq('id',id);
  if(error)return show(scheduleMessage,error.message||'Could not complete this date.');

  show(scheduleMessage,schedule.cadence==='one_off'?'One-off date completed ✓':`Completed ✓ Next date moved to ${formatFriendlyDate(next)}`,true);
  showAdminToast('Done', schedule.cadence==='one_off'?'Reminder marked complete.':`Next reminder moved to ${formatFriendlyDate(next)}`);
  await loadClientSchedules(currentClientId);
  await loadAllSchedules();
}

async function deleteSchedule(id){
  if(!confirm('Delete this calendar schedule?'))return;
  const {error}=await sb.from('client_schedules').delete().eq('id',id);
  if(error)return show(scheduleMessage,error.message||'Could not delete schedule.');
  await loadClientSchedules(currentClientId);
  await loadAllSchedules();
}

function nextScheduleDate(value,cadence){
  const [y,m,d]=value.split('-').map(Number);
  const months=cadence==='monthly'?1:cadence==='quarterly'?3:cadence==='annual'?12:0;
  if(!months)return value;
  const target=(m-1)+months;
  const year=y+Math.floor(target/12);
  const month=((target%12)+12)%12;
  const last=new Date(year,month+1,0).getDate();
  return dateOnly(new Date(year,month,Math.min(d,last)));
}

function serviceTypeLabel(v){
  return ({bookkeeping:'Bookkeeping',vat:'VAT',payroll:'Payroll',annual_accounts:'Annual Accounts',self_assessment:'Self Assessment',corporation_tax:'Corporation Tax',quarterly_review:'Quarterly Review',other:'Other'})[v]||'Other';
}
function updateServiceSummary(){
  if(!window.calendarServiceSummary)return;
  const today=dateOnly(new Date()), seven=addDays(today,7);
  const due=allSchedules.filter(s=>s.next_due_date>=today && s.next_due_date<=seven);
  const order=['bookkeeping','vat','payroll','annual_accounts','self_assessment','corporation_tax','quarterly_review','other'];
  const counts=order.map(type=>({type,count:due.filter(s=>s.service_type===type).length})).filter(x=>x.count);
  calendarServiceSummary.innerHTML=counts.length
    ? `<span>This week</span>${counts.map(x=>`<b class="service-summary-pill service-${x.type}">${x.count} ${serviceTypeLabel(x.type)}</b>`).join('')}`
    : '<span>This week</span><b class="service-summary-empty">No scheduled work due</b>';
}

function cadenceLabel(v){return ({monthly:'Monthly',quarterly:'Quarterly',annual:'Annual',one_off:'One-off'})[v]||v;}
function dueRelativeText(value){
  const today=dateOnly(new Date());
  const days=Math.round((new Date(`${value}T12:00:00`)-new Date(`${today}T12:00:00`))/86400000);
  if(days>1)return `due in ${days} days`;
  if(days===1)return 'due tomorrow';
  if(days===0)return 'due today';
  return `${Math.abs(days)} day${Math.abs(days)===1?'':'s'} overdue`;
}
function formatFriendlyDate(value){return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}
function formatDateInput(d){return dateOnly(d);}
function dateOnly(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function addDays(value,days){
  const d=new Date(`${value}T12:00:00`);d.setDate(d.getDate()+days);return dateOnly(d);
}

function renderWorkList(client) {
  const active = client.works.filter(w => w.is_active !== false);
  const completed = client.works.filter(w => w.is_active === false);
  workList.innerHTML = `
    <div class="work-section-title">Active work</div>
    ${active.length ? active.map(workButton).join('') : '<p class="portal-muted">No active work.</p>'}
    ${completed.length ? `<div class="work-section-title">Completed history</div>${completed.map(workButton).join('')}` : ''}
  `;
  workList.querySelectorAll('[data-work-id]').forEach(b => b.onclick = () => openWork(b.dataset.workId));
}

function workButton(w) {
  const pct = getProgress(w);
  return `<button type="button" class="work-item ${w.is_active === false ? 'complete' : ''}" data-work-id="${w.id}">
    <span><strong>${esc(w.service_name || 'Accounting work')}</strong>${w.period_label ? `<small>${esc(w.period_label)}</small>` : ''}</span>
    <span class="work-pct">${pct}%</span>
  </button>`;
}

async function openWork(id) {
  const client = clientGroups.find(c => c.id === currentClientId);
  const work = client?.works.find(w => w.id === id);
  if (!work) return;
  currentWorkId = id;
  revealPanel(workEditor, '#editService, input, select, textarea');
  newWorkForm.classList.add('hidden');
  editService.value = work.service_name || '';
  editPeriod.value = work.period_label || '';
  editWorkflow.value = WORKFLOWS[work.workflow_type] ? work.workflow_type : 'custom';
  editStatus.value = work.status || 'In progress';
  editAction.value = work.next_action || '';
  editActionDetail.value = work.next_action_detail || '';
  workMessage.hidden = true;

  const { data: notes, error } = await sb.from('work_notes').select('*').eq('work_id', id).order('created_at', { ascending: true });
  currentNotes = error ? [] : (notes || []);
  renderStageChecklist(work);
  renderNotesPanel();
}

function defaultStageState(workflow) {
  return (WORKFLOWS[workflow] || []).map(name => ({ name, completed: false }));
}

function parseStages(work) {
  if (Array.isArray(work?.stages) && work.stages.length) return work.stages;
  const workflow = work?.workflow_type || editWorkflow.value || 'annual_accounts';
  const stages = defaultStageState(workflow);
  if (work?.current_stage) {
    const ix = stages.findIndex(s => s.name === work.current_stage);
    if (ix > 0) stages.forEach((s,i) => s.completed = i < ix);
  }
  if ((work?.progress || 0) >= 100) stages.forEach(s => s.completed = true);
  return stages;
}

function renderStageChecklist(work) {
  let stages = work && editWorkflow.value === work.workflow_type ? parseStages(work) : defaultStageState(editWorkflow.value);
  if (!stages.length) stages = defaultStageState('annual_accounts');

  stageChecklist.innerHTML = stages.map((s,i) => `
    <label class="stage-admin-card simple-stage" data-stage-index="${i}">
      <span class="stage-number">${i + 1}</span>
      <input type="checkbox" ${s.completed ? 'checked' : ''}>
      <input class="stage-name" value="${escAttr(s.name)}" aria-label="Stage name">
    </label>
  `).join('');
}

function renderNotesPanel(){
  if (!window.noteStageSelect || !window.adminNotesHistory) return;
  const rows=[...stageChecklist.querySelectorAll('.stage-admin-card')];
  noteStageSelect.innerHTML=rows.map((row,i)=>{
    const name=row.querySelector('.stage-name')?.value.trim() || `Stage ${i+1}`;
    return `<option value="${i}">${i+1}. ${esc(name)}</option>`;
  }).join('');

  if(!currentNotes.length){
    adminNotesHistory.innerHTML='<p class="portal-muted">No client-visible notes have been added to this work yet.</p>';
    return;
  }

  adminNotesHistory.innerHTML=currentNotes.map(n=>`
    <div class="admin-note-history-item">
      <div class="admin-note-history-head">
        <span><strong>${Number(n.stage_index)+1}. ${esc(n.stage_name || 'Progress stage')}</strong><small>${esc(n.author_name || 'Nicole')} · ${formatStamp(n.created_at)}</small></span>
        <button type="button" class="note-delete" data-note-id="${escAttr(n.id)}">Delete</button>
      </div>
      <p>${esc(n.note)}</p>
    </div>
  `).join('');

  bindDeleteNoteButtons();
}

async function addSelectedStageNote(){
  if (!currentWorkId) return;
  const note=adminNoteText.value.trim();
  if(!note){ show(adminNoteMessage,'Write a note first.'); return; }

  const stageIndex=Number(noteStageSelect.value || 0);
  const row=stageChecklist.querySelector(`[data-stage-index="${stageIndex}"]`);
  const stageName=row?.querySelector('.stage-name')?.value.trim() || `Stage ${stageIndex+1}`;

  addAdminNoteBtn.disabled=true;
  addAdminNoteBtn.textContent='Adding…';

  const {data,error}=await sb.from('work_notes').insert({
    work_id:currentWorkId,
    stage_index:stageIndex,
    stage_name:stageName,
    author_id:currentAdminId,
    author_name:'Nicole',
    note
  }).select().single();

  show(adminNoteMessage,error?`Could not add note: ${error.message}`:'Note added to client portal ✓',!error);

  if(!error && data){
    currentNotes.push(data);
    adminNoteText.value='';
    renderNotesPanel();
  }

  addAdminNoteBtn.disabled=false;
  addAdminNoteBtn.textContent='Add note';
}

function bindDeleteNoteButtons() {
  adminNotesHistory?.querySelectorAll('.note-delete').forEach(btn => btn.onclick = () => deleteStageNote(btn.dataset.noteId));
}

async function deleteStageNote(noteId) {
  if (!confirm('Delete this note? It will disappear from the client portal.')) return;
  const { error } = await sb.from('work_notes').delete().eq('id', noteId);
  if (!error) {
    currentNotes = currentNotes.filter(n => n.id !== noteId);
    renderNotesPanel();
  }
}

function readStages() {
  return [...stageChecklist.querySelectorAll('.stage-admin-card')].map(row => ({
    name: row.querySelector('.stage-name').value.trim() || 'Stage',
    completed: row.querySelector('input[type=checkbox]').checked
  }));
}

function getProgress(work) {
  const stages = Array.isArray(work.stages) && work.stages.length ? work.stages : parseStages(work);
  if (!stages.length) return Number(work.progress) || 0;
  return Math.round(stages.filter(s => s.completed).length / stages.length * 100);
}

function showNewWork() {
  if (!currentClientId) return;
  newWorkForm.reset();
  newWorkWorkflow.value = 'bookkeeping';
  revealPanel(newWorkForm, '#newWorkService, input, select, textarea');
  workEditor.classList.add('hidden');
}

async function createWork(e) {
  e.preventDefault();
  const stages = defaultStageState(newWorkWorkflow.value);
  const { error } = await sb.from('client_work').insert({
    client_id: currentClientId,
    service_name: newWorkService.value.trim(),
    period_label: newWorkPeriod.value.trim() || null,
    workflow_type: newWorkWorkflow.value,
    stages,
    progress: 0,
    status: 'In progress',
    current_stage: stages[0]?.name || 'Started',
    next_action: 'Nothing needed right now',
    is_active: true,
    updated_at: new Date().toISOString()
  });
  show(newWorkMessage, error ? `Could not add work: ${error.message}` : 'New work added ✓', !error);
  if (!error) {
    await logAudit(currentClientId,'work_created',`Work created: ${newWorkService.value.trim()||'Work item'}`,{workflow:newWorkWorkflow.value,period:newWorkPeriod.value.trim()||null});
    e.currentTarget.reset();
    await loadClients();
    await loadClientAuditLog(currentClientId);
    newWorkForm.classList.add('hidden');
  }
}

async function saveWork(e) {
  e.preventDefault();
  if (!currentWorkId) return;
  const stages = readStages();
  const completedCount = stages.filter(s => s.completed).length;
  const progress = stages.length ? Math.round(completedCount / stages.length * 100) : 0;
  const nextIncomplete = stages.find(s => !s.completed);
  const allDone = stages.length > 0 && completedCount === stages.length;

  const payload = {
    service_name: editService.value.trim(),
    period_label: editPeriod.value.trim() || null,
    workflow_type: editWorkflow.value,
    stages,
    progress,
    status: allDone ? 'Completed' : (editStatus.value.trim() || 'In progress'),
    current_stage: allDone ? 'Completed' : (nextIncomplete?.name || 'In progress'),
    next_action: editAction.value.trim(),
    next_action_detail: editActionDetail.value.trim(),
    is_active: !allDone,
    completed_at: allDone ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };

  const { error } = await sb.from('client_work').update(payload).eq('id', currentWorkId);
  show(workMessage, error ? `Could not save: ${error.message}` : `Saved ✓ ${progress}% complete`, !error);
  if (!error) {
    const client=clientGroups.find(c=>c.id===currentClientId);
    const originalWork=client?.works.find(w=>w.id===currentWorkId);
    await logAudit(currentClientId,'work_updated',`${editService.value.trim()} updated to ${progress}%`,{progress,status:payload.status});
    if(allDone&&originalWork?.source_schedule_id&&originalWork?.source_due_date)await advanceScheduleAfterWork(originalWork.source_schedule_id,originalWork.source_due_date);
    await loadClients();await loadAllSchedules();await loadClientAuditLog(currentClientId);
  }
}

async function archiveWork() {
  if (!currentWorkId || !confirm('Move this work item to completed history?')) return;
  const client = clientGroups.find(c => c.id === currentClientId);
  const work = client?.works.find(w => w.id === currentWorkId);
  const stages = parseStages(work).map(s => ({ ...s, completed: true }));
  const { error } = await sb.from('client_work').update({ stages, is_active: false, status: 'Completed', progress: 100, current_stage: 'Completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', currentWorkId);
  show(workMessage, error ? `Could not complete item: ${error.message}` : 'Moved to completed history ✓', !error);
  if (!error) {
    await logAudit(currentClientId,'work_completed',`Work completed: ${work?.service_name||'Work item'}`,{work_id:currentWorkId});
    if(work?.source_schedule_id&&work?.source_due_date)await advanceScheduleAfterWork(work.source_schedule_id,work.source_due_date);
    await loadClients();await loadAllSchedules();await loadClientAuditLog(currentClientId);workEditor.classList.add('hidden');
  }
}


async function sendClientEmail(){
  if(!currentClientId) return;
  const subject=clientEmailSubject.value.trim();
  const message=clientEmailBody.value.trim();
  const files=[...(clientEmailFiles.files||[])];

  if(!subject) return show(clientEmailMessage,'Add an email subject.');
  if(!message && !files.length) return show(clientEmailMessage,'Write a message or attach a document.');

  if(files.length>5) return show(clientEmailMessage,'Please send no more than 5 files at once.');
  const maxEach=8*1024*1024, maxTotal=20*1024*1024;
  if(files.some(f=>f.size>maxEach)) return show(clientEmailMessage,'Each file must be 8 MB or smaller.');
  if(files.reduce((n,f)=>n+f.size,0)>maxTotal) return show(clientEmailMessage,'Files must total 20 MB or less.');

  sendClientEmailBtn.disabled=true;
  sendClientEmailBtn.textContent='Sending…';

  const form=new FormData();
  form.append('clientId',currentClientId);
  form.append('subject',subject);
  form.append('message',message);
  files.forEach(f=>form.append('files',f,f.name));

  const {data,error}=await sb.functions.invoke('email-client',{
    body:form
  });

  const failed=error||data?.error;
  show(clientEmailMessage,failed?(data?.error||error?.message||'Could not send email.'):'Email sent ✓ Any normal email reply will now return to this client record in the portal.',!failed);

  if(!failed){
    clientEmailSubject.value='';
    clientEmailBody.value='';
    clientEmailFiles.value='';
  }

  sendClientEmailBtn.disabled=false;
  sendClientEmailBtn.textContent='Send email / documents';
}

async function sendMessage() {
  const body = newMessage.value.trim();
  if (!currentClientId || !body) return;
  const { error } = await sb.from('messages').insert({ client_id: currentClientId, sender_id: currentAdminId, message: body });
  show(clientMessage, error ? `Could not add message: ${error.message}` : 'Message added to client portal ✓', !error);
  if (!error) newMessage.value = '';
}


async function deleteCurrentClient(){
  if(!currentClientId) return;

  const client=clientGroups.find(c=>c.id===currentClientId);
  if(!client) return;

  const name=client.full_name || 'this client';
  const typed=prompt(
    `Delete ${name}?\n\nThis permanently removes their login, work, notes, messages and portal history.\n\nType DELETE to confirm.`
  );

  if(typed!=='DELETE') return;

  deleteClientBtn.disabled=true;
  deleteClientBtn.textContent='Deleting…';

  const {data,error}=await sb.functions.invoke('delete-client',{
    body:{clientId:currentClientId}
  });

  const failed=error||data?.error;

  if(failed){
    show(clientMessage,data?.error||error?.message||'Could not delete client.');
    deleteClientBtn.disabled=false;
    deleteClientBtn.textContent='Delete client';
    return;
  }

  currentClientId=null;
  currentWorkId=null;
  clientWorkspace.classList.add('hidden');
  adminEmpty.classList.remove('hidden');
  clientMessage.hidden=true;
  deleteClientBtn.disabled=false;
  deleteClientBtn.textContent='Delete client';

  await loadClients();
}

async function createClient(e) {
  e.preventDefault();
  const btn = e.currentTarget.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Creating…';
  const { data, error } = await sb.functions.invoke('create-client', { body: {
    name: newName.value.trim(),
    email: newEmail.value.trim(),
    service: newService.value.trim()
  }});
  const detail = data?.error || error?.message;
  const failed = error || data?.error;
  const successText = data?.warning
    ? `Client created, but the welcome email could not be delivered: ${data.warning}`
    : 'Client login created and welcome email sent ✓';
  show(newClientMessage, failed ? (detail || 'Could not create client.') : successText, !failed);
  btn.disabled = false; btn.textContent = 'Create client';
  if (!(error || data?.error)) { e.currentTarget.reset(); await loadClients(); setTimeout(() => { newClientForm.classList.add('hidden'); adminEmpty.classList.remove('hidden'); }, 800); }
}

function formatStamp(value) {
  try { return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return ''; }
}
function esc(v='') { return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escAttr(v='') { return esc(v).replace(/`/g,'&#96;'); }

// Initial binding for any notes rendered after opening work.
const noteObserver = new MutationObserver(() => bindDeleteNoteButtons());
noteObserver.observe(stageChecklist, { childList: true, subtree: true });

/* =========================================================
   V10 — Practice workflow upgrade
   ========================================================= */
let clientQuickFilter='all';
let clientSortMode='attention';
let timelineFilter='all';

function attentionLabel(v){return ({none:'No action needed',nicole:'Nicole to action',client:'Waiting for client',urgent:'Urgent'})[v]||'No action needed';}
function attentionRank(v){return ({urgent:0,nicole:1,client:2,none:3})[v]??3;}
function clientNextDue(clientId){
  return allSchedules.filter(s=>s.client_id===clientId&&s.is_active!==false).sort((a,b)=>a.next_due_date.localeCompare(b.next_due_date))[0]||null;
}
function initials(name='Client'){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'C';}

// Bind controls added by V10.
document.querySelectorAll('[data-shortcut]').forEach(btn=>btn.addEventListener('click',()=>{
  document.getElementById(btn.dataset.shortcut)?.scrollIntoView({behavior:'smooth',block:'start'});
}));
document.getElementById('shortcutAddClient')?.addEventListener('click',showNewClient);
document.querySelectorAll('[data-client-quick]').forEach(btn=>btn.addEventListener('click',()=>{
  clientQuickFilter=btn.dataset.clientQuick;
  document.querySelectorAll('[data-client-quick]').forEach(x=>x.classList.toggle('active',x===btn));
  renderClientList();
}));
document.getElementById('clientSort')?.addEventListener('change',e=>{clientSortMode=e.target.value;renderClientList();});
document.getElementById('saveAttentionBtn')?.addEventListener('click',saveAttentionFlag);
document.querySelectorAll('[data-timeline-filter]').forEach(btn=>btn.addEventListener('click',()=>{
  timelineFilter=btn.dataset.timelineFilter;
  document.querySelectorAll('[data-timeline-filter]').forEach(x=>x.classList.toggle('active',x===btn));
  if(currentClientId)loadClientAuditLog(currentClientId);
}));

async function loadClients() {
  unreadByClient = {};
  const [unreadNotesResult, unreadDocsResult, unreadEmailRepliesResult] = await Promise.all([
    sb.from('client_notes').select('client_id').is('admin_seen_at', null),
    sb.from('document_submissions').select('client_id').is('admin_seen_at', null),
    sb.from('client_email_replies').select('client_id').is('admin_seen_at', null)
  ]);
  [...(unreadNotesResult.data || []), ...(unreadDocsResult.data || []), ...(unreadEmailRepliesResult.data || [])].forEach(r => {
    unreadByClient[r.client_id] = (unreadByClient[r.client_id] || 0) + 1;
  });

  const { data: rows, error } = await sb.from('client_work').select('*').order('updated_at', { ascending: false });
  if (error) {
    clientList.innerHTML = `<p class="portal-error">Could not load clients: ${esc(error.message)}</p>`;
    return;
  }

  const profileResult = await sb.from('profiles').select('id,full_name,business_name,login_email,email,role,client_status,last_login_at,attention_status,attention_note,attention_updated_at,portal_tier,potential_discussion,created_at,converted_at').eq('role', 'client');
  if(profileResult.error){
    clientList.innerHTML=`<p class="portal-error">Could not load client flags. Run the supplied Supabase update first: ${esc(profileResult.error.message)}</p>`;
    return;
  }
  const profiles = profileResult.data || [];
  potentialClients = profiles.filter(p => (p.portal_tier || 'full') === 'potential');
  const fullProfiles = profiles.filter(p => (p.portal_tier || 'full') !== 'potential');
  const map = Object.fromEntries(fullProfiles.map(p => [p.id, { ...p, works: [] }]));
  (rows || []).forEach(r => {
    if (map[r.client_id]) map[r.client_id].works.push(r);
  });

  clientGroups = Object.values(map).sort((a,b) => (a.full_name || '').localeCompare(b.full_name || ''));
  renderClientList();
  renderPotentialClients();
  await refreshDashboardOverview();
  if (currentClientId && clientGroups.some(c => c.id === currentClientId)) openClient(currentClientId, false);
}

function renderClientList(){
  let filtered=clientGroups.filter(c=>{
    const status=c.client_status||'active';
    const statusOk=clientStatusFilterValue==='all' || (clientStatusFilterValue==='current' && status!=='former') || status===clientStatusFilterValue;
    if(!statusOk)return false;
    const attention=c.attention_status||'none';
    if(clientQuickFilter==='attention' && attention==='none')return false;
    if(clientQuickFilter==='unread' && !(unreadByClient[c.id]>0))return false;
    if(clientQuickFilter==='onboarding' && status!=='onboarding')return false;
    if(globalSearchTerm){
      const hay=[c.full_name,c.business_name,status,attention,c.attention_note,...(c.works||[]).flatMap(w=>[w.service_name,w.period_label,w.status,w.current_stage])].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(globalSearchTerm))return false;
    }
    return true;
  });
  filtered=[...filtered].sort((a,b)=>{
    if(clientSortMode==='name')return (a.full_name||'').localeCompare(b.full_name||'');
    if(clientSortMode==='deadline')return (clientNextDue(a.id)?.next_due_date||'9999').localeCompare(clientNextDue(b.id)?.next_due_date||'9999');
    if(clientSortMode==='login')return new Date(b.last_login_at||0)-new Date(a.last_login_at||0);
    const ar=attentionRank(a.attention_status||'none'), br=attentionRank(b.attention_status||'none');
    if(ar!==br)return ar-br;
    const au=unreadByClient[a.id]||0, bu=unreadByClient[b.id]||0;
    if(au!==bu)return bu-au;
    return (a.full_name||'').localeCompare(b.full_name||'');
  });
  clientList.innerHTML=filtered.length?filtered.map(c=>{
    const active=c.works.filter(w=>w.is_active!==false).length;
    const unread=unreadByClient[c.id]||0;
    const status=c.client_status||'active';
    const attention=c.attention_status||'none';
    const due=clientNextDue(c.id);
    return `<button class="client-item ${attention!=='none'?'has-attention attention-'+attention:''}" data-id="${c.id}">
      <span class="client-item-row"><strong>${esc(c.full_name||'Client')}</strong><span class="client-row-badges">${attention!=='none'?`<span class="attention-mini ${attention}">${esc(attentionLabel(attention))}</span>`:''}${unread?`<span class="activity-badge">${unread}</span>`:''}</span></span>
      ${c.business_name?`<small class="client-business-line">${esc(c.business_name)}</small>`:''}
      <small><span class="client-status-dot status-${status}"></span>${clientStatusLabel(status)} · ${active} active${due?` · next ${formatShortDate(due.next_due_date)}`:''}</small>
      <small class="client-last-login">Last login: ${formatLastLogin(c.last_login_at)}</small>
    </button>`;
  }).join(''):'<p class="portal-muted">No clients match this view.</p>';
  clientList.querySelectorAll('button[data-id]').forEach(btn=>btn.onclick=()=>openClient(btn.dataset.id));
}

function formatShortDate(value){
  if(!value)return 'None';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}

function openClient(clientId, scroll = true) {
  const client = clientGroups.find(c => c.id === clientId);
  if (!client) return;
  currentClientId = clientId;
  currentWorkId = null;
  currentNotes = [];

  document.querySelectorAll('.client-item').forEach(x => x.classList.toggle('active', x.dataset.id === clientId));
  adminEmpty.classList.add('hidden');
  newClientForm.classList.add('hidden');
  revealPanel(clientWorkspace);
  workEditor.classList.add('hidden');
  newWorkForm.classList.add('hidden');

  clientHeading.textContent = client.full_name || 'Client';
  clientSub.textContent = client.business_name || 'Manage ongoing and one-off work';
  clientStatusSelect.value = client.client_status || 'active';
  attentionStatus.value=client.attention_status||'none';
  attentionNote.value=client.attention_note||'';
  updateClientOverview(client);
  renderWorkList(client);
  loadClientActivity(clientId);
  loadClientEmailReplies(clientId);
  loadClientSchedules(clientId);
  loadClientAuditLog(clientId);
  loadClientPracticeTools(clientId);
  if (scroll) bringIntoView(clientWorkspace);
}

function updateClientOverview(client){
  const active=(client.works||[]).filter(w=>w.is_active!==false).length;
  const due=clientNextDue(client.id);
  const attention=client.attention_status||'none';
  clientAvatarLarge.textContent=initials(client.full_name||'Client');
  clientOverviewName.textContent=client.full_name||'Client';
  clientOverviewBusiness.textContent=client.business_name||'Individual client';
  clientOverviewStatus.textContent=clientStatusLabel(client.client_status||'active');
  clientOverviewWork.textContent=String(active);
  clientOverviewDue.textContent=due?`${formatShortDate(due.next_due_date)} · ${dueRelativeText(due.next_due_date)}`:'None scheduled';
  clientOverviewLogin.textContent=formatLastLogin(client.last_login_at);
  attentionSummary.textContent=attention==='none'?'No flag set':`${attentionLabel(attention)}${client.attention_note?` · ${client.attention_note}`:''}`;
  document.querySelector('.client-overview-header')?.setAttribute('data-attention',attention);
}

async function saveAttentionFlag(){
  if(!currentClientId)return;
  const status=attentionStatus.value;
  const note=attentionNote.value.trim();
  saveAttentionBtn.disabled=true;saveAttentionBtn.textContent='Saving…';
  const patch={attention_status:status,attention_note:note||null,attention_updated_at:new Date().toISOString()};
  const {error}=await sb.from('profiles').update(patch).eq('id',currentClientId);
  saveAttentionBtn.disabled=false;saveAttentionBtn.textContent='Save flag';
  if(error)return showAdminToast('Couldn’t save flag',error.message||'Please try again.',true);
  const client=clientGroups.find(c=>c.id===currentClientId); if(client)Object.assign(client,patch);
  await logAudit(currentClientId,'attention_flag',status==='none'?'Needs-attention flag cleared':`${attentionLabel(status)}${note?`: ${note}`:''}`,patch);
  updateClientOverview(client);renderClientList();renderTodayPanel();
  showAdminToast('Done — client flag saved',attentionLabel(status));
  await loadClientAuditLog(currentClientId);
}

function renderTodayPanel(){
  if(!window.todayItems)return;
  const today=dateOnly(new Date()), week=addDays(today,7);
  const overdue=allSchedules.filter(s=>s.next_due_date<today).sort((a,b)=>a.next_due_date.localeCompare(b.next_due_date));
  const dueToday=allSchedules.filter(s=>s.next_due_date===today);
  const manual=clientGroups.filter(c=>(c.attention_status||'none')!=='none').sort((a,b)=>attentionRank(a.attention_status)-attentionRank(b.attention_status));
  const unread=dashboardActivity.filter(x=>x.unread);
  const upcoming=allSchedules.filter(s=>s.next_due_date>today&&s.next_due_date<=week).sort((a,b)=>a.next_due_date.localeCompare(b.next_due_date));
  const total=overdue.length+dueToday.length+manual.length+unread.length;
  todayHeading.textContent=total?`${total} item${total===1?'':'s'} need attention`:'Nothing urgent right now';
  todaySub.textContent=total?'Priority items are grouped here so Nicole can work through the day without hunting around the portal.':'You’re clear for now. Upcoming deadlines are shown below.';
  const rows=[];
  manual.slice(0,4).forEach(c=>rows.push(`<button class="today-item manual ${escAttr(c.attention_status||'nicole')}" type="button" data-today-client="${c.id}"><span><strong>${esc(attentionLabel(c.attention_status))} · ${esc(c.full_name||'Client')}</strong><small>${esc(c.attention_note||'Client has been flagged for follow-up')}</small></span><b>Open</b></button>`));
  overdue.slice(0,4).forEach(s=>rows.push(`<button class="today-item overdue" type="button" data-today-client="${s.client_id}"><span><strong>Overdue · ${esc(s.profiles?.full_name||'Client')}</strong><small>${esc(s.title)} · ${serviceLabel(s.service_type)}</small></span><b>${dueRelativeText(s.next_due_date)}</b></button>`));
  dueToday.slice(0,4).forEach(s=>rows.push(`<button class="today-item due-today" type="button" data-today-client="${s.client_id}"><span><strong>Due today · ${esc(s.profiles?.full_name||'Client')}</strong><small>${esc(s.title)} · ${serviceLabel(s.service_type)}</small></span><b>Today</b></button>`));
  unread.slice(0,4).forEach(x=>{const c=clientGroups.find(v=>v.id===x.client_id);rows.push(`<button class="today-item unread" type="button" data-today-client="${x.client_id}"><span><strong>Unread ${x.kind==='email'?'email reply':x.kind==='document'?'document':'client note'} · ${esc(c?.full_name||'Client')}</strong><small>${esc((x.detail||'').slice(0,120))}</small></span><b>Open</b></button>`)});
  if(!rows.length&&upcoming.length)upcoming.slice(0,4).forEach(s=>rows.push(`<button class="today-item upcoming" type="button" data-today-client="${s.client_id}"><span><strong>Coming up · ${esc(s.profiles?.full_name||'Client')}</strong><small>${esc(s.title)} · ${formatFriendlyDate(s.next_due_date)}</small></span><b>${dueRelativeText(s.next_due_date)}</b></button>`));
  todayItems.innerHTML=rows.length?rows.join(''):'<div class="today-clear">All clear — nothing needs attention today.</div>';
  todayItems.querySelectorAll('[data-today-client]').forEach(btn=>btn.onclick=()=>openClient(btn.dataset.todayClient));
  if(window.statNewActivity)statNewActivity.textContent=String(unread.length);
  renderV11Metrics();
  renderTodayActivityFeed();
  renderDeadlineCentreList();
}


function timelineCategoryFromAudit(action=''){
  const a=String(action).toLowerCase();
  if(a.includes('schedule')||a.includes('reminder'))return 'schedule';
  if(a.includes('work')||a.includes('stage')||a.includes('status'))return 'work';
  return 'admin';
}
function timelineIcon(kind){return ({document:'↥',email:'✉',note:'✎',schedule:'◷',work:'✓',admin:'•'})[kind]||'•';}

async function loadClientAuditLog(clientId){
  if(!window.clientAuditLog)return;
  const [auditRes,notesRes,docsRes,repliesRes]=await Promise.all([
    sb.from('practice_audit_log').select('id,actor_name,action_type,summary,created_at').eq('client_id',clientId).order('created_at',{ascending:false}).limit(60),
    sb.from('client_notes').select('id,note,service_name,created_at').eq('client_id',clientId).order('created_at',{ascending:false}).limit(30),
    sb.from('document_submissions').select('id,file_name,file_count,service_name,client_note,sent_at').eq('client_id',clientId).order('sent_at',{ascending:false}).limit(30),
    sb.from('client_email_replies').select('id,subject,body_text,received_at').eq('client_id',clientId).order('received_at',{ascending:false}).limit(30)
  ]);
  const events=[];
  (auditRes.data||[]).forEach(r=>events.push({id:`a-${r.id}`,category:timelineCategoryFromAudit(r.action_type),kind:timelineCategoryFromAudit(r.action_type),title:r.summary,detail:r.actor_name||'Nicole',at:r.created_at}));
  (notesRes.data||[]).forEach(r=>events.push({id:`n-${r.id}`,category:'client',kind:'note',title:'Client added a note',detail:`${r.service_name?`${r.service_name} · `:''}${r.note||''}`,at:r.created_at}));
  (docsRes.data||[]).forEach(r=>events.push({id:`d-${r.id}`,category:'client',kind:'document',title:'Client uploaded documents',detail:`${r.file_name||`${r.file_count||1} file(s)`}${r.client_note?` · ${r.client_note}`:''}`,at:r.sent_at}));
  (repliesRes.data||[]).forEach(r=>events.push({id:`e-${r.id}`,category:'client',kind:'email',title:'Client replied by email',detail:`${r.subject||'Reply'}${r.body_text?` · ${r.body_text.slice(0,180)}`:''}`,at:r.received_at}));
  let rows=events.sort((a,b)=>new Date(b.at)-new Date(a.at));
  if(timelineFilter!=='all')rows=rows.filter(x=>x.category===timelineFilter);
  rows=rows.slice(0,80);
  const err=auditRes.error||notesRes.error||docsRes.error||repliesRes.error;
  if(err&&!rows.length){clientAuditLog.innerHTML=`<p class="portal-error">Could not load timeline: ${esc(err.message)}</p>`;return;}
  clientAuditLog.innerHTML=rows.length?rows.map(r=>`<article class="timeline-row ${escAttr(r.kind)}"><div class="timeline-marker">${timelineIcon(r.kind)}</div><div class="timeline-card"><div class="timeline-card-top"><strong>${esc(r.title||'Activity')}</strong><time>${formatStamp(r.at)}</time></div><p>${esc(r.detail||'')}</p></div></article>`).join(''):'<p class="portal-muted">No timeline events in this view yet.</p>';
}

async function loadClientSchedules(clientId){
  if(!window.clientSchedules)return;
  const {data,error}=await sb.from('client_schedules').select('*').eq('client_id',clientId)
    .order('is_active',{ascending:false}).order('next_due_date',{ascending:true});
  if(error){clientSchedules.innerHTML=`<p class="portal-error">Could not load calendar dates: ${esc(error.message)}</p>`;return;}
  const rows=data||[];
  const today=dateOnly(new Date());
  clientSchedules.innerHTML=rows.length?rows.map(s=>{
    const reminder14=addDays(s.next_due_date,-14), reminder7=addDays(s.next_due_date,-7);
    const state14=!s.remind_14_days?'off':s.reminder_14_sent_for===s.next_due_date?'sent':reminder14<=today?'due':'pending';
    const state7=!s.remind_7_days?'off':s.reminder_7_sent_for===s.next_due_date?'sent':reminder7<=today?'due':'pending';
    return `<article class="client-schedule-row ${s.is_active?'':'inactive'}">
      <div class="schedule-date-badge"><strong>${new Date(`${s.next_due_date}T12:00:00`).getDate()}</strong><small>${new Date(`${s.next_due_date}T12:00:00`).toLocaleDateString('en-GB',{month:'short'}).toUpperCase()}</small></div>
      <div class="schedule-row-copy">
        <strong>${esc(s.title)}</strong>
        <small>${serviceTypeLabel(s.service_type)} · ${esc(s.client_label)} · ${cadenceLabel(s.cadence)} · ${esc(dueRelativeText(s.next_due_date))}</small>
        <div class="reminder-status-row">
          <span class="reminder-state ${state14}">14-day ${state14==='sent'?'sent ✓':state14==='off'?'off':state14==='due'?'due now':formatShortDate(reminder14)}</span>
          <span class="reminder-state ${state7}">7-day ${state7==='sent'?'sent ✓':state7==='off'?'off':state7==='due'?'due now':formatShortDate(reminder7)}</span>
          <span class="reminder-state ${s.auto_create_work?'sent':'off'}">Auto work ${s.auto_create_work?'on':'off'}</span>
        </div>
        ${s.reminder_last_error?`<small class="reminder-error">Reminder issue: ${esc(s.reminder_last_error)}</small>`:''}
      </div>
      <div class="schedule-row-actions">${s.is_active?`<button class="schedule-complete" data-complete-schedule="${s.id}" type="button">✓ Complete</button>`:''}<button class="schedule-delete" data-delete-schedule="${s.id}" type="button">Delete</button></div>
    </article>`;
  }).join(''):'<p class="portal-muted">No recurring dates added yet.</p>';
  clientSchedules.querySelectorAll('[data-complete-schedule]').forEach(btn=>btn.addEventListener('click',()=>completeSchedule(btn.dataset.completeSchedule,rows.find(x=>x.id===btn.dataset.completeSchedule))));
  clientSchedules.querySelectorAll('[data-delete-schedule]').forEach(btn=>btn.addEventListener('click',()=>deleteSchedule(btn.dataset.deleteSchedule)));
}


/* =========================================================
   V11 — practice management suite
   ========================================================= */
let onboardingCache=[];
let documentRequestCache=[];
let internalNoteCache=[];
let workTemplateCache=[];
let globalSearchExtras={};
let deadlineRange='all';

const v11El=id=>document.getElementById(id);

// Process due recurring work whenever Nicole opens the dashboard. If Supabase Cron is enabled,
// the supplied SQL also runs this every morning in the background.
(async()=>{
  try{
    const {data,error}=await sb.rpc('npa_create_due_work');
    if(!error && Number(data)>0){
      showAdminToast('Recurring work created',`${data} due work item${Number(data)===1?'':'s'} added automatically.`);
      await loadClients();
    }
  }catch(e){console.debug('Due-work processor unavailable until V11 SQL is run.');}
  await loadWorkTemplates();
  await loadGlobalSearchExtras();
})();

v11El('deadlineRangeFilter')?.addEventListener('change',e=>{deadlineRange=e.target.value;renderDeadlineCentreList();});
v11El('toggleTemplateForm')?.addEventListener('click',()=>revealPanel(v11El('workTemplateForm'),'#templateName'));
v11El('cancelTemplateForm')?.addEventListener('click',()=>v11El('workTemplateForm')?.classList.add('hidden'));
v11El('workTemplateForm')?.addEventListener('submit',saveWorkTemplate);
v11El('onboardingAddForm')?.addEventListener('submit',addOnboardingItem);
v11El('documentRequestForm')?.addEventListener('submit',addDocumentRequest);
v11El('internalNoteForm')?.addEventListener('submit',addInternalNote);

document.querySelectorAll('[data-client-action]').forEach(btn=>btn.addEventListener('click',()=>{
  if(!currentClientId)return;
  const action=btn.dataset.clientAction;
  if(action==='work')return showNewWork();
  if(action==='reminder'){if(!scheduleDueDate.value)scheduleDueDate.value=formatDateInput(new Date());return revealPanel(scheduleForm,'#scheduleTitle');}
  if(action==='document')return bringIntoView(v11El('documentRequestsPanel'),'#documentRequestTitle');
  if(action==='note')return bringIntoView(v11El('internalNotesPanel'),'#internalNoteText');
  if(action==='message'){
    const details=document.querySelector('.communication-dropdown'); if(details) details.open=true;
    return bringIntoView(details,'#clientEmailSubject');
  }
}));

async function loadClientPracticeTools(clientId){
  try{await sb.rpc('ensure_client_onboarding',{p_client_id:clientId});}catch(e){}
  await Promise.all([loadOnboarding(clientId),loadDocumentRequests(clientId),loadInternalNotes(clientId)]);
  updateV11ClientOverview();
}

async function loadOnboarding(clientId){
  const el=v11El('onboardingChecklist'); if(!el)return;
  const {data,error}=await sb.from('client_onboarding_items').select('*').eq('client_id',clientId).order('position',{ascending:true}).order('created_at',{ascending:true});
  if(error){el.innerHTML='<p class="portal-muted">Run the V11 Supabase SQL to enable onboarding.</p>';return;}
  onboardingCache=data||[];
  const done=onboardingCache.filter(x=>x.completed).length;
  const pct=onboardingCache.length?Math.round(done/onboardingCache.length*100):0;
  if(v11El('onboardingProgressPill'))v11El('onboardingProgressPill').textContent=`${pct}%`;
  el.innerHTML=onboardingCache.length?onboardingCache.map(x=>`<label class="onboarding-row ${x.completed?'completed':''}"><input type="checkbox" data-onboarding-toggle="${x.id}" ${x.completed?'checked':''}><span><strong>${esc(x.title)}</strong><small>${x.client_action_required?'Client action required':'Practice action'}</small></span><button class="row-delete-btn" data-onboarding-delete="${x.id}" type="button">Remove</button></label>`).join(''):'<p class="portal-muted">No onboarding items yet.</p>';
  el.querySelectorAll('[data-onboarding-toggle]').forEach(cb=>cb.addEventListener('change',()=>toggleOnboarding(cb.dataset.onboardingToggle,cb.checked)));
  el.querySelectorAll('[data-onboarding-delete]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();deleteOnboardingItem(b.dataset.onboardingDelete);}));
}
async function toggleOnboarding(id,completed){
  const patch={completed,completed_at:completed?new Date().toISOString():null,updated_at:new Date().toISOString()};
  const {error}=await sb.from('client_onboarding_items').update(patch).eq('id',id);
  if(error)return showAdminToast('Couldn’t update onboarding',error.message,true);
  const row=onboardingCache.find(x=>x.id===id); if(row)Object.assign(row,patch);
  await logAudit(currentClientId,'onboarding_updated',`${row?.title||'Onboarding item'} ${completed?'completed':'reopened'}`,{id,completed});
  await loadOnboarding(currentClientId); updateV11ClientOverview(); await loadClientAuditLog(currentClientId); await loadGlobalSearchExtras();
}
async function addOnboardingItem(e){
  e.preventDefault(); const title=v11El('onboardingNewItem').value.trim(); if(!title||!currentClientId)return;
  const max=Math.max(0,...onboardingCache.map(x=>Number(x.position)||0));
  const {error}=await sb.from('client_onboarding_items').insert({client_id:currentClientId,title,position:max+10,client_action_required:v11El('onboardingClientAction').checked});
  if(error)return showAdminToast('Couldn’t add checklist item',error.message,true);
  e.currentTarget.reset(); showAdminToast('Checklist item added',title); await loadOnboarding(currentClientId); updateV11ClientOverview(); await loadClientAuditLog(currentClientId);
}
async function deleteOnboardingItem(id){
  if(!confirm('Remove this onboarding checklist item?'))return;
  const row=onboardingCache.find(x=>x.id===id); const {error}=await sb.from('client_onboarding_items').delete().eq('id',id);
  if(error)return showAdminToast('Couldn’t remove item',error.message,true);
  await logAudit(currentClientId,'onboarding_removed',`Onboarding item removed: ${row?.title||'Item'}`,{id}); await loadOnboarding(currentClientId); updateV11ClientOverview(); await loadClientAuditLog(currentClientId);
}

async function loadDocumentRequests(clientId){
  const el=v11El('documentRequestList'); if(!el)return;
  const {data,error}=await sb.from('client_document_requests').select('*').eq('client_id',clientId).order('requested_at',{ascending:false});
  if(error){el.innerHTML='<p class="portal-muted">Run the V11 Supabase SQL to enable document requests.</p>';return;}
  documentRequestCache=data||[]; const today=dateOnly(new Date()); const open=documentRequestCache.filter(x=>x.status==='requested');
  if(v11El('documentRequestCount'))v11El('documentRequestCount').textContent=`${open.length} open`;
  el.innerHTML=documentRequestCache.length?documentRequestCache.map(x=>{const overdue=x.status==='requested'&&x.due_date&&x.due_date<today;return `<article class="document-request-row ${x.status==='received'?'received':''} ${overdue?'overdue':''}"><div><strong>${esc(x.title)}</strong><small>${x.note?esc(x.note)+' · ':''}${x.due_date?`Due ${formatFriendlyDate(x.due_date)}`:'No due date'}</small></div><div class="request-actions"><span class="request-status ${x.status==='received'?'received':overdue?'overdue':''}">${x.status==='received'?'Received ✓':overdue?'Overdue':'Requested'}</span>${x.status==='requested'?`<button data-request-received="${x.id}" type="button">Mark received</button>`:''}<button data-request-delete="${x.id}" type="button">Delete</button></div></article>`}).join(''):'<p class="portal-muted">No document requests yet.</p>';
  el.querySelectorAll('[data-request-received]').forEach(b=>b.onclick=()=>markDocumentRequestReceived(b.dataset.requestReceived));
  el.querySelectorAll('[data-request-delete]').forEach(b=>b.onclick=()=>deleteDocumentRequest(b.dataset.requestDelete));
}
async function addDocumentRequest(e){
  e.preventDefault(); if(!currentClientId)return; const title=v11El('documentRequestTitle').value.trim(); if(!title)return;
  const payload={client_id:currentClientId,title,note:v11El('documentRequestNote').value.trim()||null,due_date:v11El('documentRequestDue').value||null,status:'requested'};
  const {error}=await sb.from('client_document_requests').insert(payload); if(error)return showAdminToast('Couldn’t request document',error.message,true);
  e.currentTarget.reset(); showAdminToast('Document requested',title); await logAudit(currentClientId,'document_requested',`Document requested: ${title}`,payload); await loadDocumentRequests(currentClientId); updateV11ClientOverview(); await loadClientAuditLog(currentClientId); await loadGlobalSearchExtras();
}
async function markDocumentRequestReceived(id){
  const row=documentRequestCache.find(x=>x.id===id); const patch={status:'received',received_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const {error}=await sb.from('client_document_requests').update(patch).eq('id',id); if(error)return showAdminToast('Couldn’t update request',error.message,true);
  showAdminToast('Marked as received',row?.title||'Document'); await logAudit(currentClientId,'document_received',`Document received: ${row?.title||'Document'}`,{id}); await loadDocumentRequests(currentClientId); updateV11ClientOverview(); await loadClientAuditLog(currentClientId);
}
async function deleteDocumentRequest(id){
  if(!confirm('Delete this document request?'))return; const row=documentRequestCache.find(x=>x.id===id);
  const {error}=await sb.from('client_document_requests').delete().eq('id',id); if(error)return showAdminToast('Couldn’t delete request',error.message,true);
  await logAudit(currentClientId,'document_request_deleted',`Document request removed: ${row?.title||'Document'}`,{id}); await loadDocumentRequests(currentClientId); updateV11ClientOverview(); await loadClientAuditLog(currentClientId);
}

async function loadInternalNotes(clientId){
  const el=v11El('internalNotesList'); if(!el)return;
  const {data,error}=await sb.from('client_internal_notes').select('*').eq('client_id',clientId).order('created_at',{ascending:false}).limit(30);
  if(error){el.innerHTML='<p class="portal-muted">Run the V11 Supabase SQL to enable private notes.</p>';return;}
  internalNoteCache=data||[]; el.innerHTML=internalNoteCache.length?internalNoteCache.map(x=>`<article class="internal-note-row"><p>${esc(x.note)}</p><footer><time>${formatStamp(x.created_at)}</time><button type="button" data-internal-note-delete="${x.id}">Delete</button></footer></article>`).join(''):'<p class="portal-muted">No private notes yet.</p>';
  el.querySelectorAll('[data-internal-note-delete]').forEach(b=>b.onclick=()=>deleteInternalNote(b.dataset.internalNoteDelete));
}
async function addInternalNote(e){
  e.preventDefault(); const note=v11El('internalNoteText').value.trim(); if(!note||!currentClientId)return;
  const {error}=await sb.from('client_internal_notes').insert({client_id:currentClientId,note,created_by:currentAdminId}); if(error)return showAdminToast('Couldn’t save private note',error.message,true);
  e.currentTarget.reset(); showAdminToast('Private note saved'); await logAudit(currentClientId,'internal_note_added','Private practice note added',{}); await loadInternalNotes(currentClientId); await loadClientAuditLog(currentClientId); await loadGlobalSearchExtras();
}
async function deleteInternalNote(id){
  if(!confirm('Delete this private note?'))return; const {error}=await sb.from('client_internal_notes').delete().eq('id',id); if(error)return showAdminToast('Couldn’t delete note',error.message,true); await loadInternalNotes(currentClientId); await loadClientAuditLog(currentClientId); await loadGlobalSearchExtras();
}

function updateV11ClientOverview(){
  const pct=onboardingCache.length?Math.round(onboardingCache.filter(x=>x.completed).length/onboardingCache.length*100):0;
  const open=documentRequestCache.filter(x=>x.status==='requested').length;
  if(v11El('clientOverviewOnboarding'))v11El('clientOverviewOnboarding').textContent=onboardingCache.length?`${pct}% complete`:'Not started';
  if(v11El('clientOverviewRequests'))v11El('clientOverviewRequests').textContent=`${open} open`;
}

async function loadGlobalSearchExtras(){
  try{
    const [notes,requests,onboarding]=await Promise.all([
      sb.from('client_internal_notes').select('client_id,note'),
      sb.from('client_document_requests').select('client_id,title,note'),
      sb.from('client_onboarding_items').select('client_id,title')
    ]);
    globalSearchExtras={};
    const add=(id,t)=>{if(!id||!t)return;(globalSearchExtras[id] ||= []).push(t)};
    (notes.data||[]).forEach(x=>add(x.client_id,x.note)); (requests.data||[]).forEach(x=>{add(x.client_id,x.title);add(x.client_id,x.note)}); (onboarding.data||[]).forEach(x=>add(x.client_id,x.title));
    renderClientList();
  }catch(e){}
}

// Final V11 client-list renderer adds private notes/document request text to global search.
function renderClientList(){
  let filtered=clientGroups.filter(c=>{
    const status=c.client_status||'active';
    const statusOk=clientStatusFilterValue==='all' || (clientStatusFilterValue==='current'&&status!=='former') || status===clientStatusFilterValue; if(!statusOk)return false;
    const attention=c.attention_status||'none'; if(clientQuickFilter==='attention'&&attention==='none')return false; if(clientQuickFilter==='waiting'&&attention!=='client')return false; if(clientQuickFilter==='overdue'&&!(clientNextDue(c.id)?.next_due_date<dateOnly(new Date())))return false; if(clientQuickFilter==='unread'&&!(unreadByClient[c.id]>0))return false; if(clientQuickFilter==='onboarding'&&status!=='onboarding')return false;
    if(globalSearchTerm){const hay=[c.full_name,c.business_name,c.login_email,status,attention,c.attention_note,...(globalSearchExtras[c.id]||[]),...(c.works||[]).flatMap(w=>[w.service_name,w.period_label,w.status,w.current_stage])].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(globalSearchTerm))return false;} return true;
  });
  filtered=[...filtered].sort((a,b)=>{if(clientSortMode==='name')return(a.full_name||'').localeCompare(b.full_name||'');if(clientSortMode==='deadline')return(clientNextDue(a.id)?.next_due_date||'9999').localeCompare(clientNextDue(b.id)?.next_due_date||'9999');if(clientSortMode==='login')return new Date(b.last_login_at||0)-new Date(a.last_login_at||0);const ar=attentionRank(a.attention_status||'none'),br=attentionRank(b.attention_status||'none');if(ar!==br)return ar-br;const au=unreadByClient[a.id]||0,bu=unreadByClient[b.id]||0;if(au!==bu)return bu-au;return(a.full_name||'').localeCompare(b.full_name||'');});
  clientList.innerHTML=filtered.length?filtered.map(c=>{const active=c.works.filter(w=>w.is_active!==false).length,unread=unreadByClient[c.id]||0,status=c.client_status||'active',attention=c.attention_status||'none',due=clientNextDue(c.id);return `<button class="client-item ${attention!=='none'?'has-attention attention-'+attention:''}" data-id="${c.id}"><span class="client-item-row"><strong>${esc(c.full_name||'Client')}</strong><span class="client-row-badges">${attention!=='none'?`<span class="attention-mini ${attention}">${esc(attentionLabel(attention))}</span>`:''}${unread?`<span class="activity-badge">${unread}</span>`:''}</span></span>${c.business_name?`<small class="client-business-line">${esc(c.business_name)}</small>`:''}<small><span class="client-status-dot status-${status}"></span>${clientStatusLabel(status)} · ${active} active${due?` · next ${formatShortDate(due.next_due_date)}`:''}</small><small class="client-last-login">Last login: ${formatLastLogin(c.last_login_at)}</small></button>`}).join(''):'<p class="portal-muted">No clients match this view.</p>';
  clientList.querySelectorAll('button[data-id]').forEach(btn=>btn.onclick=()=>openClient(btn.dataset.id));
}

function renderV11Metrics(){
  const today=dateOnly(new Date()),week=addDays(today,7); const activeClients=clientGroups.filter(c=>(c.client_status||'active')==='active').length; const jobs=clientGroups.reduce((n,c)=>n+(c.works||[]).filter(w=>w.is_active!==false).length,0); const waiting=clientGroups.filter(c=>c.attention_status==='client').length; const overdue=allSchedules.filter(s=>s.next_due_date<today).length; const dueWeek=allSchedules.filter(s=>s.next_due_date>=today&&s.next_due_date<=week).length; const unread=dashboardActivity.filter(x=>x.unread).length;
  if(v11El('statClients'))v11El('statClients').textContent=activeClients;if(v11El('statActiveWork'))v11El('statActiveWork').textContent=jobs;if(v11El('statWaitingClients'))v11El('statWaitingClients').textContent=waiting;if(v11El('statOverdue'))v11El('statOverdue').textContent=overdue;if(v11El('statUpcoming'))v11El('statUpcoming').textContent=dueWeek;if(v11El('statNewActivity'))v11El('statNewActivity').textContent=unread;
}
function renderTodayActivityFeed(){
  const el=v11El('todayActivityFeed'); if(!el)return; const rows=dashboardActivity.slice(0,8); el.innerHTML=rows.length?rows.map(x=>{const c=clientGroups.find(v=>v.id===x.client_id);const icon=x.kind==='document'?'↥':x.kind==='email'?'✉':'✎';return `<button class="today-feed-item" type="button" data-feed-client="${x.client_id}"><span class="today-feed-icon">${icon}</span><span class="today-feed-copy"><strong>${esc(c?.full_name||'Client')} · ${esc(x.title)}</strong><small>${esc((x.detail||'').slice(0,100))}</small><time>${formatStamp(x.created_at)}</time></span></button>`}).join(''):'<p class="portal-muted">No recent client activity yet.</p>'; el.querySelectorAll('[data-feed-client]').forEach(b=>b.onclick=()=>openClient(b.dataset.feedClient));
}
function renderDeadlineCentreList(){
  const el=v11El('deadlineCentreList'); if(!el)return; const today=dateOnly(new Date()),week=addDays(today,7),month=addDays(today,30); let rows=[...allSchedules]; if(deadlineRange==='overdue')rows=rows.filter(x=>x.next_due_date<today);if(deadlineRange==='today')rows=rows.filter(x=>x.next_due_date===today);if(deadlineRange==='week')rows=rows.filter(x=>x.next_due_date>=today&&x.next_due_date<=week);if(deadlineRange==='month')rows=rows.filter(x=>x.next_due_date>=today&&x.next_due_date<=month);rows=rows.sort((a,b)=>a.next_due_date.localeCompare(b.next_due_date)).slice(0,40); el.innerHTML=rows.length?rows.map(x=>{const overdue=x.next_due_date<today, dueToday=x.next_due_date===today;return `<article class="deadline-row ${overdue?'overdue':dueToday?'today':''}"><div class="deadline-row-date"><strong>${formatShortDate(x.next_due_date)}</strong><small>${esc(dueRelativeText(x.next_due_date))}</small></div><div class="deadline-row-copy"><strong>${esc(x.profiles?.full_name||'Client')} · ${esc(x.title)}</strong><small>${serviceTypeLabel(x.service_type)} · ${cadenceLabel(x.cadence)}${x.auto_create_work?' · Auto-create work':''}</small></div><button type="button" data-deadline-client="${x.client_id}">Open client</button></article>`}).join(''):'<p class="portal-muted">No deadlines in this view.</p>'; el.querySelectorAll('[data-deadline-client]').forEach(b=>b.onclick=()=>openClient(b.dataset.deadlineClient));
}

async function loadWorkTemplates(){
  const el=v11El('workTemplateList'); if(!el)return; const {data,error}=await sb.from('work_templates').select('*').order('created_at',{ascending:false}); if(error){el.innerHTML='<p class="portal-muted">Run the V11 Supabase SQL to enable templates.</p>';return;} workTemplateCache=data||[]; el.innerHTML=workTemplateCache.length?workTemplateCache.map(x=>`<article class="template-card"><span><strong>${esc(x.name)}</strong><small>${serviceTypeLabel(x.service_type)} · ${cadenceLabel(x.cadence)}</small></span><button type="button" data-template-use="${x.id}">Use</button><button type="button" data-template-delete="${x.id}">Delete</button></article>`).join(''):'<p class="portal-muted">No templates yet.</p>'; el.querySelectorAll('[data-template-use]').forEach(b=>b.onclick=()=>useWorkTemplate(b.dataset.templateUse));el.querySelectorAll('[data-template-delete]').forEach(b=>b.onclick=()=>deleteWorkTemplate(b.dataset.templateDelete));
}
async function saveWorkTemplate(e){
  e.preventDefault(); const payload={name:v11El('templateName').value.trim(),service_type:v11El('templateServiceType').value,cadence:v11El('templateCadence').value,client_label:v11El('templateClientLabel').value.trim()||'Next due date',remind_14_days:true,remind_7_days:true,auto_create_work:true}; if(!payload.name)return; const {error}=await sb.from('work_templates').insert(payload); if(error)return showAdminToast('Couldn’t save template',error.message,true);e.currentTarget.reset();v11El('templateClientLabel').value='Next due date';e.currentTarget.classList.add('hidden');showAdminToast('Template saved',payload.name);await loadWorkTemplates();
}
function useWorkTemplate(id){
  const t=workTemplateCache.find(x=>x.id===id); if(!t)return;if(!currentClientId)return showAdminToast('Select a client first','Open a client, then apply this template.',true);scheduleServiceType.value=t.service_type;scheduleTitle.value=t.name;scheduleClientLabel.value=t.client_label;scheduleCadence.value=t.cadence;scheduleAutoCreateWork.checked=t.auto_create_work!==false;scheduleRemind14.checked=t.remind_14_days!==false;scheduleRemind7.checked=t.remind_7_days!==false;if(!scheduleDueDate.value)scheduleDueDate.value=formatDateInput(new Date());revealPanel(scheduleForm,'#scheduleDueDate');showAdminToast('Template applied',`Choose the first due date for ${t.name}.`);
}
async function deleteWorkTemplate(id){if(!confirm('Delete this recurring work template?'))return;const {error}=await sb.from('work_templates').delete().eq('id',id);if(error)return showAdminToast('Couldn’t delete template',error.message,true);await loadWorkTemplates();}

// V11 timeline also includes document requests, onboarding changes (via audit), and private practice notes.
async function loadClientAuditLog(clientId){
  if(!window.clientAuditLog)return; const [auditRes,notesRes,docsRes,repliesRes,requestsRes,privateRes]=await Promise.all([
    sb.from('practice_audit_log').select('id,actor_name,action_type,summary,created_at').eq('client_id',clientId).order('created_at',{ascending:false}).limit(80),
    sb.from('client_notes').select('id,note,service_name,created_at').eq('client_id',clientId).order('created_at',{ascending:false}).limit(30),
    sb.from('document_submissions').select('id,file_name,file_count,service_name,client_note,sent_at').eq('client_id',clientId).order('sent_at',{ascending:false}).limit(30),
    sb.from('client_email_replies').select('id,subject,body_text,received_at').eq('client_id',clientId).order('received_at',{ascending:false}).limit(30),
    sb.from('client_document_requests').select('id,title,status,requested_at,received_at').eq('client_id',clientId).order('requested_at',{ascending:false}).limit(30),
    sb.from('client_internal_notes').select('id,note,created_at').eq('client_id',clientId).order('created_at',{ascending:false}).limit(30)
  ]); const events=[];
  (auditRes.data||[]).forEach(r=>events.push({id:`a-${r.id}`,category:timelineCategoryFromAudit(r.action_type),kind:timelineCategoryFromAudit(r.action_type),title:r.summary,detail:r.actor_name||'Nicole',at:r.created_at}));
  (notesRes.data||[]).forEach(r=>events.push({id:`n-${r.id}`,category:'client',kind:'note',title:'Client added a note',detail:`${r.service_name?`${r.service_name} · `:''}${r.note||''}`,at:r.created_at}));
  (docsRes.data||[]).forEach(r=>events.push({id:`d-${r.id}`,category:'client',kind:'document',title:'Client uploaded documents',detail:`${r.file_name||`${r.file_count||1} file(s)`}${r.client_note?` · ${r.client_note}`:''}`,at:r.sent_at}));
  (repliesRes.data||[]).forEach(r=>events.push({id:`e-${r.id}`,category:'client',kind:'email',title:'Client replied by email',detail:`${r.subject||'Reply'}${r.body_text?` · ${r.body_text.slice(0,180)}`:''}`,at:r.received_at}));
  (requestsRes.data||[]).forEach(r=>events.push({id:`r-${r.id}`,category:'schedule',kind:'document',title:`Document ${r.status==='received'?'received':'requested'}: ${r.title}`,detail:r.status==='received'?'Client requirement completed':'Waiting for client document',at:r.status==='received'&&r.received_at?r.received_at:r.requested_at}));
  (privateRes.data||[]).forEach(r=>events.push({id:`p-${r.id}`,category:'admin',kind:'admin',title:'Private practice note',detail:r.note,at:r.created_at}));
  let rows=events.sort((a,b)=>new Date(b.at)-new Date(a.at));if(timelineFilter!=='all')rows=rows.filter(x=>x.category===timelineFilter);rows=rows.slice(0,100);const err=auditRes.error||notesRes.error||docsRes.error||repliesRes.error; if(err&&!rows.length){clientAuditLog.innerHTML=`<p class="portal-error">Could not load timeline: ${esc(err.message)}</p>`;return;} clientAuditLog.innerHTML=rows.length?rows.map(r=>`<article class="timeline-row ${escAttr(r.kind)}"><div class="timeline-marker">${timelineIcon(r.kind)}</div><div class="timeline-card"><div class="timeline-card-top"><strong>${esc(r.title||'Activity')}</strong><time>${formatStamp(r.at)}</time></div><p>${esc(r.detail||'')}</p></div></article>`).join(''):'<p class="portal-muted">No timeline events in this view yet.</p>';
}


/* =========================================================
   V12 — Potential client preview portal
   ========================================================= */
const potentialForm = document.getElementById('potentialClientForm');
const potentialList = document.getElementById('potentialClientList');
const potentialCount = document.getElementById('potentialClientCount');
const potentialMessage = document.getElementById('potentialClientMessage');

document.getElementById('showPotentialClientForm')?.addEventListener('click',()=>{
  potentialForm?.classList.remove('hidden');
  bringIntoView(potentialForm,'#potentialName');
});
document.getElementById('cancelPotentialClient')?.addEventListener('click',()=>{
  potentialForm?.classList.add('hidden');
  if(potentialMessage) potentialMessage.hidden=true;
});
potentialForm?.addEventListener('submit',createPotentialClient);

function renderPotentialClients(){
  if(!potentialList)return;
  const rows=[...potentialClients].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
  if(potentialCount) potentialCount.textContent=`${rows.length} potential`;
  potentialList.innerHTML=rows.length?rows.map(c=>{
    const email=c.login_email||c.email||'';
    return `<article class="potential-client-row">
      <div class="potential-avatar">${esc(initials(c.full_name||'P'))}</div>
      <div class="potential-client-copy">
        <div class="potential-client-title"><strong>${esc(c.full_name||'Potential client')}</strong><span class="potential-badge">Preview access</span></div>
        ${c.business_name?`<small>${esc(c.business_name)}</small>`:''}
        <small>${esc(email)}${c.last_login_at?` · Last login ${esc(formatLastLogin(c.last_login_at))}`:' · Not logged in yet'}</small>
        ${c.potential_discussion?`<p>${esc(c.potential_discussion)}</p>`:''}
      </div>
      <div class="potential-client-actions">
        <button class="portal-btn potential-upgrade" type="button" data-upgrade-potential="${escAttr(c.id)}">Upgrade to full client</button>
        <button class="portal-btn danger-outline" type="button" data-delete-potential="${escAttr(c.id)}">Delete</button>
      </div>
    </article>`;
  }).join(''):`<div class="potential-empty"><strong>No potential clients yet</strong><p>Create a preview login when someone is discussing services with Nicole but has not agreed a package yet.</p></div>`;
  potentialList.querySelectorAll('[data-upgrade-potential]').forEach(btn=>btn.addEventListener('click',()=>upgradePotentialClient(btn.dataset.upgradePotential)));
  potentialList.querySelectorAll('[data-delete-potential]').forEach(btn=>btn.addEventListener('click',()=>deletePotentialClient(btn.dataset.deletePotential)));
}

async function createPotentialClient(e){
  e.preventDefault();
  const btn=e.currentTarget.querySelector('button[type="submit"]');
  const payload={
    name:document.getElementById('potentialName')?.value.trim(),
    email:document.getElementById('potentialEmail')?.value.trim(),
    businessName:document.getElementById('potentialBusiness')?.value.trim(),
    discussion:document.getElementById('potentialDiscussion')?.value.trim()
  };
  if(!payload.name||!payload.email)return;
  btn.disabled=true;btn.textContent='Creating & emailing…';
  const {data,error}=await sb.functions.invoke('create-potential-client',{body:payload});
  const failed=error||data?.error;
  show(potentialMessage,failed?(data?.error||error?.message||'Could not create the potential client.'):'Preview login created and welcome email sent ✓',!failed);
  btn.disabled=false;btn.textContent='Create preview login & send email';
  if(!failed){
    e.currentTarget.reset();
    showAdminToast('Potential client created',`${payload.name} has been emailed their preview login.`);
    await loadClients();
    window.setTimeout(()=>potentialForm?.classList.add('hidden'),900);
  }
}

async function upgradePotentialClient(clientId){
  const c=potentialClients.find(x=>x.id===clientId); if(!c)return;
  if(!confirm(`Upgrade ${c.full_name||'this potential client'} to full client access?\n\nTheir existing login will immediately unlock the full client portal.`))return;
  const {error}=await sb.from('profiles').update({portal_tier:'full',converted_at:new Date().toISOString(),client_status:'onboarding'}).eq('id',clientId);
  if(error)return showAdminToast('Couldn’t upgrade client',error.message,true);
  await logAudit(clientId,'potential_converted','Potential client upgraded to full portal access',{from:'potential',to:'full'});
  showAdminToast('Full client access enabled',`${c.full_name||'Client'} can now use the complete portal.`);
  await loadClients();
  const upgraded=clientGroups.find(x=>x.id===clientId); if(upgraded) openClient(clientId);
}

async function deletePotentialClient(clientId){
  const c=potentialClients.find(x=>x.id===clientId); if(!c)return;
  const typed=prompt(`Delete potential client ${c.full_name||''}?\n\nThis permanently removes their preview login and portal record.\n\nType DELETE to confirm.`);
  if(typed!=='DELETE')return;
  const {data,error}=await sb.functions.invoke('delete-client',{body:{clientId}});
  if(error||data?.error)return showAdminToast('Couldn’t delete potential client',data?.error||error?.message||'Delete failed.',true);
  showAdminToast('Potential client deleted',`${c.full_name||'The preview account'} has been removed.`);
  await loadClients();
}
