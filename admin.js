const cfg = window.NPA_PORTAL_CONFIG || {};
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
let clientGroups = [];
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

const WORKFLOWS = {
  annual_accounts: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  bookkeeping: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  vat: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  payroll: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  self_assessment: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"],
  custom: ["Package and fee agreed", "Onboarding documentation and invoice sent to client", "Documents received back from client", "Client/business information received", "Invoice paid", "Work in progress", "Work completed awaiting approval", "Approval from client", "Work submitted"]
};

const show = (el, msg, ok = false) => {
  if (!el) return;
  el.hidden = false;
  el.className = ok ? 'portal-success' : 'portal-error';
  el.textContent = msg;
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
    scheduleForm.classList.remove('hidden');
    if(!scheduleDueDate.value) scheduleDueDate.value=formatDateInput(new Date());
    scheduleTitle.focus();
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
  const profileResult = await sb.from('profiles').select('id,full_name,business_name,role').eq('role', 'client');
  const profiles = profileResult.data || [];
  const map = Object.fromEntries(profiles.map(p => [p.id, { ...p, works: [] }]));
  (rows || []).forEach(r => {
    if (!map[r.client_id]) map[r.client_id] = { id: r.client_id, full_name: 'Client', works: [] };
    map[r.client_id].works.push(r);
  });

  clientGroups = Object.values(map).sort((a,b) => (a.full_name || '').localeCompare(b.full_name || ''));
  clientList.innerHTML = clientGroups.length ? clientGroups.map(c => {
    const active = c.works.filter(w => w.is_active !== false).length;
    const unread=unreadByClient[c.id]||0;
    return `<button class="client-item" data-id="${c.id}">
      <span class="client-item-row"><strong>${esc(c.full_name || 'Client')}</strong>${unread?`<span class="activity-badge">${unread}</span>`:''}</span>
      <small>${active} active item${active === 1 ? '' : 's'} · ${c.works.length} total${unread?` · ${unread} new`:''}</small>
    </button>`;
  }).join('') : '<p class="portal-muted">No clients yet.</p>';

  clientList.querySelectorAll('button').forEach(btn => btn.onclick = () => openClient(btn.dataset.id));
  await refreshDashboardOverview();
  if (currentClientId && clientGroups.some(c => c.id === currentClientId)) openClient(currentClientId, false);
}

function showNewClient() {
  adminEmpty.classList.add('hidden');
  clientWorkspace.classList.add('hidden');
  newClientForm.classList.remove('hidden');
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
  clientWorkspace.classList.remove('hidden');
  workEditor.classList.add('hidden');
  newWorkForm.classList.add('hidden');

  clientHeading.textContent = client.full_name || 'Client';
  clientSub.textContent = client.business_name || 'Manage ongoing and one-off work';
  renderWorkList(client);
  loadClientActivity(clientId);
  loadClientEmailReplies(clientId);
  loadClientSchedules(clientId);
  if (scroll && innerWidth < 820) clientWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
}



async function refreshDashboardOverview(){
  const active=clientGroups.reduce((n,c)=>n+c.works.filter(w=>w.is_active!==false).length,0);

  const [unreadNotes,unreadDocs,unreadReplies,recentNotes,recentDocs,recentReplies]=await Promise.all([
    sb.from('client_notes').select('client_id,note,service_name,created_at').is('admin_seen_at',null).order('created_at',{ascending:false}).limit(25),
    sb.from('document_submissions').select('client_id,file_name,file_count,service_name,client_note,sent_at').is('admin_seen_at',null).order('sent_at',{ascending:false}).limit(25),
    sb.from('client_email_replies').select('client_id,subject,body_text,attachment_names,received_at').is('admin_seen_at',null).order('received_at',{ascending:false}).limit(25),
    sb.from('client_notes').select('client_id,note,service_name,created_at,admin_seen_at').order('created_at',{ascending:false}).limit(30),
    sb.from('document_submissions').select('client_id,file_name,file_count,service_name,client_note,sent_at,admin_seen_at').order('sent_at',{ascending:false}).limit(30),
    sb.from('client_email_replies').select('client_id,subject,body_text,attachment_names,received_at,admin_seen_at').order('received_at',{ascending:false}).limit(30)
  ]);

  const unreadRows=[
    ...(unreadNotes.data||[]).map(x=>({kind:'note',client_id:x.client_id,title:'New note',detail:x.note,service:x.service_name,created_at:x.created_at,unread:true})),
    ...(unreadDocs.data||[]).map(x=>({kind:'document',client_id:x.client_id,title:'Documents uploaded',detail:`${x.file_count||1} file${(x.file_count||1)===1?'':'s'}${x.file_name?` · ${x.file_name}`:''}${x.client_note?` — ${x.client_note}`:''}`,service:x.service_name,created_at:x.sent_at,unread:true})),
    ...(unreadReplies.data||[]).map(x=>({kind:'email',client_id:x.client_id,title:'Email reply',detail:`${x.subject||'Reply'} — ${x.body_text||''}`,created_at:x.received_at,unread:true}))
  ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  dashboardActivity=[
    ...(recentNotes.data||[]).map(x=>({kind:'note',client_id:x.client_id,title:'Client note',detail:x.note,service:x.service_name,created_at:x.created_at,unread:!x.admin_seen_at})),
    ...(recentDocs.data||[]).map(x=>({kind:'document',client_id:x.client_id,title:'Document upload',detail:`${x.file_count||1} file${(x.file_count||1)===1?'':'s'}${x.file_name?` · ${x.file_name}`:''}${x.client_note?` — ${x.client_note}`:''}`,service:x.service_name,created_at:x.sent_at,unread:!x.admin_seen_at})),
    ...(recentReplies.data||[]).map(x=>({kind:'email',client_id:x.client_id,title:'Email reply',detail:`${x.subject||'Reply'} — ${x.body_text||''}`,created_at:x.received_at,unread:!x.admin_seen_at}))
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

  notificationCentre.querySelectorAll('.notification-item').forEach(b=>b.onclick=()=>openClient(b.dataset.client));
}

function renderCompactNotification(x){
  const client=clientGroups.find(v=>v.id===x.client_id);
  const icon=x.kind==='document'?'↥':x.kind==='email'?'✉':'✎';
  const label=x.kind==='document'?'Document upload':x.kind==='email'?'Email reply':'Client note';
  return `<button class="notification-item compact-notification ${x.unread?'is-unread':''}" type="button" data-client="${escAttr(x.client_id)}">
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
  </button>`;
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
  unreadByClient={}; document.querySelectorAll('.activity-badge').forEach(b=>b.remove());
  await refreshDashboardOverview(); markAllNotificationsRead.textContent='Mark all read';
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
      </div>
    `).join('');
  }

  // Opening the client records the activity as reviewed by Nicole.
  const seenAt=new Date().toISOString();
  await Promise.all([
    sb.from('client_notes').update({admin_seen_at:seenAt}).eq('client_id',clientId).is('admin_seen_at',null),
    sb.from('document_submissions').update({admin_seen_at:seenAt}).eq('client_id',clientId).is('admin_seen_at',null),
    sb.from('client_email_replies').update({admin_seen_at:seenAt}).eq('client_id',clientId).is('admin_seen_at',null)
  ]);

  unreadByClient[clientId]=0;
  const badge=document.querySelector(`.client-item[data-id="${clientId}"] .activity-badge`);
  if(badge)badge.remove();
  clientUnreadPill.classList.add('hidden');
  await refreshDashboardOverview();
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

  if(unread){
    await sb.from('client_email_replies')
      .update({admin_seen_at:new Date().toISOString()})
      .eq('client_id',clientId)
      .is('admin_seen_at',null);
    emailReplyCount?.classList.add('hidden');
  }
}


async function loadAllSchedules(){
  const {data,error}=await sb.from('client_schedules')
    .select('id,client_id,title,client_label,service_type,cadence,next_due_date,remind_14_days,remind_7_days,is_active,profiles!client_schedules_client_id_fkey(full_name)')
    .eq('is_active',true)
    .order('next_due_date',{ascending:true});

  if(error){console.error('Could not load schedules',error);return;}
  allSchedules=data||[];
  updateScheduleStats();
  renderCalendar();
  updateServiceSummary();
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
    remind_14_days:scheduleRemind14.checked,
    remind_7_days:scheduleRemind7.checked,
    is_active:true
  };
  if(!payload.title||!payload.next_due_date)return show(scheduleMessage,'Add a title and next due date.');

  const btn=e.currentTarget.querySelector('button[type=submit]');
  btn.disabled=true;btn.textContent='Saving…';
  const {error}=await sb.from('client_schedules').insert(payload);
  show(scheduleMessage,error?(error.message||'Could not save schedule.'):'Schedule added ✓',!error);

  if(!error){
    scheduleForm.reset();
    scheduleClientLabel.value='Next invoice';
    scheduleRemind14.checked=true;scheduleRemind7.checked=true;
    scheduleForm.classList.add('hidden');
    await loadClientSchedules(currentClientId);
    await loadAllSchedules();
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
  workEditor.classList.remove('hidden');
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
  newWorkForm.classList.remove('hidden');
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
    e.currentTarget.reset();
    await loadClients();
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
  if (!error) await loadClients();
}

async function archiveWork() {
  if (!currentWorkId || !confirm('Move this work item to completed history?')) return;
  const client = clientGroups.find(c => c.id === currentClientId);
  const work = client?.works.find(w => w.id === currentWorkId);
  const stages = parseStages(work).map(s => ({ ...s, completed: true }));
  const { error } = await sb.from('client_work').update({ stages, is_active: false, status: 'Completed', progress: 100, current_stage: 'Completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', currentWorkId);
  show(workMessage, error ? `Could not complete item: ${error.message}` : 'Moved to completed history ✓', !error);
  if (!error) { await loadClients(); workEditor.classList.add('hidden'); }
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
