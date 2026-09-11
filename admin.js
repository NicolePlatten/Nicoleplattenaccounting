const cfg = window.NPA_PORTAL_CONFIG || {};
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
let clients = [];
let currentAdminId = null;

const show = (el, msg, ok = false) => {
  if (!el) return;
  el.hidden = false;
  el.className = ok ? 'portal-success' : 'portal-error';
  el.textContent = msg;
};

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.href = 'client-login.html';
    return;
  }

  currentAdminId = session.user.id;

  const { data: p } = await sb.from('profiles').select('role').eq('id', session.user.id).single();
  if (p?.role !== 'admin') {
    location.href = 'portal.html';
    return;
  }

  logoutBtn.onclick = async () => {
    await sb.auth.signOut();
    location.href = 'client-login.html';
  };

  newClientBtn.onclick = () => {
    adminEmpty.classList.add('hidden');
    clientEditor.classList.add('hidden');
    newClientForm.classList.remove('hidden');
  };

  cancelNewClient.onclick = () => {
    newClientForm.classList.add('hidden');
    adminEmpty.classList.remove('hidden');
  };

  newClientForm.addEventListener('submit', createClient);
  clientEditor.addEventListener('submit', saveClient);
  sendMessageBtn.onclick = sendMessage;

  await loadClients();
})();

async function loadClients() {
  const { data: workRows, error } = await sb
    .from('client_work')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    clientList.innerHTML = '<p class="portal-error">Could not load clients.</p>';
    return;
  }

  const rows = workRows || [];
  const ids = [...new Set(rows.map((r) => r.client_id))];

  let profilesById = {};
  if (ids.length) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id,full_name,business_name')
      .in('id', ids);

    profilesById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  }

  clients = rows.map((r) => ({ ...r, profile: profilesById[r.client_id] || null }));

  clientList.innerHTML = clients.length
    ? clients.map((c) => `
        <button class="client-item" data-id="${c.id}">
          <strong>${esc(c.profile?.full_name || 'Client')}</strong>
          <small>${esc(c.service_name || 'Client')} · ${c.progress || 0}%</small>
        </button>
      `).join('')
    : '<p class="portal-muted">No clients yet.</p>';

  clientList.querySelectorAll('button').forEach((b) => {
    b.onclick = () => openClient(b.dataset.id);
  });
}

function openClient(id) {
  const c = clients.find((x) => x.id === id);
  if (!c) return;

  document.querySelectorAll('.client-item').forEach((x) => {
    x.classList.toggle('active', x.dataset.id === id);
  });

  adminEmpty.classList.add('hidden');
  newClientForm.classList.add('hidden');
  clientEditor.classList.remove('hidden');

  editClientId.value = c.id;
  editHeading.textContent = c.profile?.full_name || 'Edit client';
  editName.value = c.profile?.full_name || '';
  editService.value = c.service_name || '';
  editStatus.value = c.status || '';
  editProgress.value = c.progress || 0;
  editStage.value = c.current_stage || 'Information received';
  editAction.value = c.next_action || '';
  editActionDetail.value = c.next_action_detail || '';
  adminMessage.hidden = true;
}

async function saveClient(e) {
  e.preventDefault();

  const id = editClientId.value;
  const c = clients.find((x) => x.id === id);

  const payload = {
    service_name: editService.value.trim(),
    status: editStatus.value.trim(),
    progress: Math.max(0, Math.min(100, Number(editProgress.value) || 0)),
    current_stage: editStage.value,
    next_action: editAction.value.trim(),
    next_action_detail: editActionDetail.value.trim(),
    updated_at: new Date().toISOString()
  };

  const { error } = await sb.from('client_work').update(payload).eq('id', id);

  if (!error && c?.client_id) {
    await sb.from('profiles').update({ full_name: editName.value.trim() }).eq('id', c.client_id);
  }

  show(adminMessage, error ? `Could not save the update: ${error.message}` : 'Client updated ✓', !error);

  if (!error) {
    await loadClients();
    openClient(id);
  }
}

async function sendMessage() {
  const c = clients.find((x) => x.id === editClientId.value);
  const body = newMessage.value.trim();
  if (!c || !body) return;

  const { error } = await sb.from('messages').insert({
    client_id: c.client_id,
    sender_id: currentAdminId,
    message: body
  });

  show(adminMessage, error ? `Could not add the message: ${error.message}` : 'Message added to client portal ✓', !error);
  if (!error) newMessage.value = '';
}

async function createClient(e) {
  e.preventDefault();

  const btn = e.currentTarget.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  const { error } = await sb.functions.invoke('create-client', {
    body: {
      name: newName.value.trim(),
      email: newEmail.value.trim(),
      password: newPassword.value,
      service: newService.value.trim()
    }
  });

  show(newClientMessage, error ? (error.message || 'Could not create client.') : 'Client login created ✓', !error);

  btn.disabled = false;
  btn.textContent = 'Create client';

  if (!error) {
    e.currentTarget.reset();
    await loadClients();
    setTimeout(() => {
      newClientForm.classList.add('hidden');
      adminEmpty.classList.remove('hidden');
    }, 700);
  }
}

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}
