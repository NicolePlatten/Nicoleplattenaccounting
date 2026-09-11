const cfg = window.NPA_PORTAL_CONFIG || {};
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
let clientGroups = [];
let currentClientId = null;
let currentWorkId = null;
let currentAdminId = null;
let currentNotes = [];
let unreadByClient = {};

const WORKFLOWS = {
  annual_accounts: ['Information received','Accounts preparation','Accounts review','Tax return preparation','Client approval','Submitted to HMRC','Completed'],
  bookkeeping: ['Documents received','Transactions reconciled','Queries raised','Queries resolved','Bookkeeping reviewed','Month completed'],
  vat: ['Records received','VAT reconciled','Review complete','Client approval','VAT return submitted','Completed'],
  payroll: ['Payroll information received','Payroll prepared','Client review','Payslips issued','RTI submitted','Completed'],
  self_assessment: ['Information received','Return prepared','Review complete','Client approval','Submitted to HMRC','Completed'],
  custom: []
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
  cancelNewWork.onclick = () => newWorkForm.classList.add('hidden');
  newWorkForm.addEventListener('submit', createWork);
  workEditor.addEventListener('submit', saveWork);
  deleteWorkBtn.onclick = archiveWork;
  sendMessageBtn.onclick = sendMessage;
  editWorkflow.addEventListener('change', () => renderStageChecklist(null));

  await loadClients();
})();

async function loadClients() {
  unreadByClient = {};
  const [unreadNotesResult, unreadDocsResult] = await Promise.all([
    sb.from('client_notes').select('client_id').is('admin_seen_at', null),
    sb.from('document_submissions').select('client_id').is('admin_seen_at', null)
  ]);
  [...(unreadNotesResult.data || []), ...(unreadDocsResult.data || [])].forEach(r => {
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
  if (scroll && innerWidth < 820) clientWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


async function loadClientActivity(clientId){
  const [notesResult, docsResult]=await Promise.all([
    sb.from('client_notes')
      .select('id,note,service_name,created_at,admin_seen_at')
      .eq('client_id',clientId)
      .order('created_at',{ascending:false})
      .limit(30),
    sb.from('document_submissions')
      .select('id,file_name,file_count,service_name,client_note,sent_at,admin_seen_at')
      .eq('client_id',clientId)
      .order('sent_at',{ascending:false})
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

  const rows=[...notes,...docs]
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
  await Promise.all([
    sb.from('client_notes').update({admin_seen_at:new Date().toISOString()}).eq('client_id',clientId).is('admin_seen_at',null),
    sb.from('document_submissions').update({admin_seen_at:new Date().toISOString()}).eq('client_id',clientId).is('admin_seen_at',null)
  ]);

  unreadByClient[clientId]=0;
  const badge=document.querySelector(`.client-item[data-id="${clientId}"] .activity-badge`);
  if(badge)badge.remove();
  clientUnreadPill.classList.add('hidden');
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
  if (!stages.length) stages = [{ name: 'Work completed', completed: false }];
  stageChecklist.innerHTML = stages.map((s,i) => `
    <div class="stage-admin-card" data-stage-index="${i}">
      <label class="stage-check">
        <input type="checkbox" ${s.completed ? 'checked' : ''}>
        <input class="stage-name" value="${escAttr(s.name)}" aria-label="Stage name">
      </label>
      <div class="stage-note-history" id="stageNotes${i}">${renderAdminNotes(i)}</div>
      <div class="stage-note-compose">
        <textarea id="stageNoteInput${i}" maxlength="5000" placeholder="Add a note the client will see for this stage…"></textarea>
        <button type="button" class="portal-btn secondary add-stage-note" data-stage-index="${i}">Add note</button>
      </div>
      <div id="stageNoteMessage${i}" hidden></div>
    </div>
  `).join('');
  stageChecklist.querySelectorAll('.add-stage-note').forEach(btn => btn.onclick = () => addStageNote(Number(btn.dataset.stageIndex)));
}

function renderAdminNotes(stageIndex) {
  const notes = currentNotes.filter(n => Number(n.stage_index) === stageIndex);
  if (!notes.length) return '<p class="portal-muted no-stage-notes">No notes added yet.</p>';
  return notes.map(n => `<div class="stage-note"><div class="stage-note-meta"><strong>${esc(n.author_name || 'Nicole')}</strong><span>${formatStamp(n.created_at)}</span></div><p>${esc(n.note)}</p><button type="button" class="note-delete" data-note-id="${n.id}" aria-label="Delete note">Delete</button></div>`).join('');
}

async function addStageNote(stageIndex) {
  if (!currentWorkId) return;
  const input = document.getElementById(`stageNoteInput${stageIndex}`);
  const msg = document.getElementById(`stageNoteMessage${stageIndex}`);
  const note = input?.value.trim();
  if (!note) { show(msg, 'Write a note first.'); return; }
  const row = stageChecklist.querySelector(`[data-stage-index="${stageIndex}"]`);
  const stageName = row?.querySelector('.stage-name')?.value.trim() || `Stage ${stageIndex + 1}`;
  const { data, error } = await sb.from('work_notes').insert({
    work_id: currentWorkId,
    stage_index: stageIndex,
    stage_name: stageName,
    author_id: currentAdminId,
    author_name: 'Nicole',
    note
  }).select().single();
  show(msg, error ? `Could not add note: ${error.message}` : 'Note added to client portal ✓', !error);
  if (!error && data) {
    currentNotes.push(data);
    input.value = '';
    document.getElementById(`stageNotes${stageIndex}`).innerHTML = renderAdminNotes(stageIndex);
    bindDeleteNoteButtons();
  }
}

function bindDeleteNoteButtons() {
  stageChecklist.querySelectorAll('.note-delete').forEach(btn => btn.onclick = () => deleteStageNote(btn.dataset.noteId));
}

async function deleteStageNote(noteId) {
  if (!confirm('Delete this note? It will disappear from the client portal.')) return;
  const { error } = await sb.from('work_notes').delete().eq('id', noteId);
  if (!error) {
    currentNotes = currentNotes.filter(n => n.id !== noteId);
    const client = clientGroups.find(c => c.id === currentClientId);
    const work = client?.works.find(w => w.id === currentWorkId);
    renderStageChecklist(work);
    bindDeleteNoteButtons();
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

async function sendMessage() {
  const body = newMessage.value.trim();
  if (!currentClientId || !body) return;
  const { error } = await sb.from('messages').insert({ client_id: currentClientId, sender_id: currentAdminId, message: body });
  show(clientMessage, error ? `Could not add message: ${error.message}` : 'Message added to client portal ✓', !error);
  if (!error) newMessage.value = '';
}

async function createClient(e) {
  e.preventDefault();
  const btn = e.currentTarget.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Creating…';
  const { data, error } = await sb.functions.invoke('create-client', { body: {
    name: newName.value.trim(), email: newEmail.value.trim(), password: newPassword.value, service: newService.value.trim()
  }});
  const detail = data?.error || error?.message;
  show(newClientMessage, error || data?.error ? (detail || 'Could not create client.') : 'Client login created. They must change the temporary password on first sign in ✓', !(error || data?.error));
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
