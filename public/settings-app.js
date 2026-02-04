/**
 * Settings App - Frontend for managing orgs, apps, and agents
 */

// State
let orgs = [];
let apps = [];
let agents = [];
let currentSection = 'orgs';

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadAllData();
  bindEventListeners();
  renderCurrentSection();
}

// ============== Data Loading ==============

async function loadAllData() {
  try {
    const [orgsRes, appsRes, agentsRes] = await Promise.all([
      fetch('/api/settings/orgs'),
      fetch('/api/settings/apps'),
      fetch('/api/settings/agents'),
    ]);

    orgs = await orgsRes.json();
    apps = await appsRes.json();
    agents = await agentsRes.json();

    updateCounts();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function updateCounts() {
  document.getElementById('orgs-count').textContent = orgs.length;
  document.getElementById('apps-count').textContent = apps.length;
  document.getElementById('agents-count').textContent = agents.length;
}

// ============== Event Listeners ==============

function bindEventListeners() {
  // Navigation
  document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchSection(item.dataset.section);
    });
  });

  // Add buttons
  document.getElementById('btn-add-org').addEventListener('click', () => openOrgModal());
  document.getElementById('btn-add-app').addEventListener('click', () => openAppModal());
  document.getElementById('btn-add-agent').addEventListener('click', () => openAgentModal());

  // Org modal
  document.getElementById('org-modal-close').addEventListener('click', closeOrgModal);
  document.getElementById('org-modal-cancel').addEventListener('click', closeOrgModal);
  document.getElementById('org-modal-save').addEventListener('click', saveOrg);
  document.getElementById('btn-add-auth-server').addEventListener('click', addAuthServerRow);
  document.getElementById('org-modal').addEventListener('click', (e) => {
    if (e.target.id === 'org-modal') closeOrgModal();
  });

  // App modal
  document.getElementById('app-modal-close').addEventListener('click', closeAppModal);
  document.getElementById('app-modal-cancel').addEventListener('click', closeAppModal);
  document.getElementById('app-modal-save').addEventListener('click', saveApp);
  document.getElementById('app-auth-method').addEventListener('change', updateAppAuthFields);
  document.getElementById('app-modal').addEventListener('click', (e) => {
    if (e.target.id === 'app-modal') closeAppModal();
  });

  // Agent modal
  document.getElementById('agent-modal-close').addEventListener('click', closeAgentModal);
  document.getElementById('agent-modal-cancel').addEventListener('click', closeAgentModal);
  document.getElementById('agent-modal-save').addEventListener('click', saveAgent);
  document.getElementById('agent-modal').addEventListener('click', (e) => {
    if (e.target.id === 'agent-modal') closeAgentModal();
  });

  // Import/Export
  document.getElementById('btn-export').addEventListener('click', exportSettings);
  document.getElementById('btn-import').addEventListener('click', openImportModal);
  document.getElementById('import-modal-close').addEventListener('click', closeImportModal);
  document.getElementById('import-modal-cancel').addEventListener('click', closeImportModal);
  document.getElementById('import-modal-confirm').addEventListener('click', importSettings);
  document.getElementById('import-modal').addEventListener('click', (e) => {
    if (e.target.id === 'import-modal') closeImportModal();
  });
}

// ============== Navigation ==============

function switchSection(section) {
  currentSection = section;

  // Update nav
  document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  // Update content
  document.querySelectorAll('.settings-section').forEach(s => {
    s.hidden = true;
  });
  document.getElementById(`section-${section}`).hidden = false;

  renderCurrentSection();
}

function renderCurrentSection() {
  switch (currentSection) {
    case 'orgs':
      renderOrgs();
      break;
    case 'apps':
      renderApps();
      break;
    case 'agents':
      renderAgents();
      break;
  }
}

// ============== Organizations ==============

function renderOrgs() {
  const list = document.getElementById('orgs-list');

  if (orgs.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>No organizations yet</h3>
        <p>Add your first Okta organization to get started</p>
      </div>
    `;
    return;
  }

  list.innerHTML = orgs.map(org => {
    const authServerCount = org.authServers?.length || 0;
    const appCount = apps.filter(a => a.orgId === org.id).length;
    const agentCount = agents.filter(a => a.orgId === org.id).length;

    return `
      <div class="entity-card" data-id="${org.id}">
        <div class="entity-info">
          <div class="entity-name">${escapeHtml(org.name)}</div>
          <div class="entity-meta">
            <code>${escapeHtml(org.oktaDomain)}</code>
          </div>
          <div class="entity-badges">
            <span class="entity-badge">${authServerCount} auth server${authServerCount !== 1 ? 's' : ''}</span>
            <span class="entity-badge">${appCount} app${appCount !== 1 ? 's' : ''}</span>
            <span class="entity-badge">${agentCount} agent${agentCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="entity-actions">
          <button class="btn btn-secondary" onclick="editOrg('${org.id}')">Edit</button>
          <button class="btn btn-secondary" onclick="deleteOrg('${org.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function openOrgModal(org = null) {
  const modal = document.getElementById('org-modal');
  const title = document.getElementById('org-modal-title');

  if (org) {
    title.textContent = 'Edit Organization';
    document.getElementById('org-id').value = org.id;
    document.getElementById('org-name').value = org.name;
    document.getElementById('org-domain').value = org.oktaDomain;
    document.getElementById('org-notes').value = org.notes || '';
    renderAuthServers(org.authServers || []);
  } else {
    title.textContent = 'Add Organization';
    document.getElementById('org-id').value = '';
    document.getElementById('org-name').value = '';
    document.getElementById('org-domain').value = '';
    document.getElementById('org-notes').value = '';
    renderAuthServers([]);
  }

  modal.hidden = false;
}

function closeOrgModal() {
  document.getElementById('org-modal').hidden = true;
}

function renderAuthServers(servers) {
  const container = document.getElementById('org-auth-servers');
  container.innerHTML = servers.map((s, i) => `
    <div class="auth-server-item" data-index="${i}">
      <input type="text" placeholder="ID (e.g., default)" value="${escapeHtml(s.id || '')}" data-field="id">
      <input type="text" placeholder="Name" value="${escapeHtml(s.name || '')}" data-field="name">
      <button type="button" class="btn btn-secondary btn-remove" onclick="removeAuthServer(${i})">×</button>
    </div>
  `).join('');

  if (servers.length === 0) {
    container.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 0.5rem;">No auth servers configured</div>';
  }
}

function addAuthServerRow() {
  const container = document.getElementById('org-auth-servers');
  const items = container.querySelectorAll('.auth-server-item');
  const index = items.length;

  // Clear "no auth servers" message if present
  if (container.querySelector('div:not(.auth-server-item)')) {
    container.innerHTML = '';
  }

  const row = document.createElement('div');
  row.className = 'auth-server-item';
  row.dataset.index = index;
  row.innerHTML = `
    <input type="text" placeholder="ID (e.g., default)" data-field="id">
    <input type="text" placeholder="Name" data-field="name">
    <button type="button" class="btn btn-secondary btn-remove" onclick="removeAuthServer(${index})">×</button>
  `;
  container.appendChild(row);
}

window.removeAuthServer = function(index) {
  const container = document.getElementById('org-auth-servers');
  const items = container.querySelectorAll('.auth-server-item');
  if (items[index]) {
    items[index].remove();
  }
  if (container.children.length === 0) {
    container.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 0.5rem;">No auth servers configured</div>';
  }
};

function getAuthServersFromForm() {
  const items = document.querySelectorAll('#org-auth-servers .auth-server-item');
  const servers = [];
  items.forEach(item => {
    const id = item.querySelector('[data-field="id"]').value.trim();
    const name = item.querySelector('[data-field="name"]').value.trim();
    if (id) {
      servers.push({ id, name: name || id });
    }
  });
  return servers;
}

async function saveOrg() {
  const id = document.getElementById('org-id').value;
  const data = {
    name: document.getElementById('org-name').value.trim(),
    oktaDomain: document.getElementById('org-domain').value.trim(),
    authServers: getAuthServersFromForm(),
    notes: document.getElementById('org-notes').value.trim(),
  };

  if (!data.name || !data.oktaDomain) {
    alert('Name and Okta Domain are required');
    return;
  }

  try {
    if (id) {
      await fetch(`/api/settings/orgs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/settings/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }

    closeOrgModal();
    await loadAllData();
    renderOrgs();
  } catch (err) {
    alert('Error saving organization: ' + err.message);
  }
}

window.editOrg = async function(id) {
  const org = orgs.find(o => o.id === id);
  if (org) {
    openOrgModal(org);
  }
};

window.deleteOrg = async function(id) {
  if (!confirm('Delete this organization? This cannot be undone.')) return;

  try {
    const res = await fetch(`/api/settings/orgs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    await loadAllData();
    renderOrgs();
  } catch (err) {
    alert('Error deleting organization: ' + err.message);
  }
};

// ============== Applications ==============

function renderApps() {
  const list = document.getElementById('apps-list');

  if (apps.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>No applications yet</h3>
        <p>Add your first OAuth application</p>
      </div>
    `;
    return;
  }

  list.innerHTML = apps.map(app => {
    const org = orgs.find(o => o.id === app.orgId);
    const orgName = org ? org.name : 'No org';
    const typeLabels = { web: 'Web', spa: 'SPA', native: 'Native', service: 'Service' };

    return `
      <div class="entity-card" data-id="${app.id}">
        <div class="entity-info">
          <div class="entity-name">${escapeHtml(app.name)}</div>
          <div class="entity-meta">
            Client ID: <code>${escapeHtml(app.clientId)}</code>
          </div>
          <div class="entity-badges">
            <span class="entity-badge">${escapeHtml(orgName)}</span>
            <span class="entity-badge">${typeLabels[app.applicationType] || app.applicationType}</span>
            <span class="entity-badge">${app.authMethod === 'secret' ? 'Secret' : app.authMethod === 'private_key_jwt' ? 'Private Key' : 'PKCE'}</span>
          </div>
        </div>
        <div class="entity-actions">
          <button class="btn btn-secondary" onclick="editApp('${app.id}')">Edit</button>
          <button class="btn btn-secondary" onclick="deleteApp('${app.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function openAppModal(app = null) {
  const modal = document.getElementById('app-modal');
  const title = document.getElementById('app-modal-title');
  const orgSelect = document.getElementById('app-org');

  // Populate org dropdown
  orgSelect.innerHTML = '<option value="">Select organization...</option>' +
    orgs.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');

  if (app) {
    title.textContent = 'Edit Application';
    document.getElementById('app-id').value = app.id;
    document.getElementById('app-name').value = app.name;
    orgSelect.value = app.orgId || '';
    document.getElementById('app-client-id').value = app.clientId;
    document.getElementById('app-type').value = app.applicationType || 'web';
    document.getElementById('app-auth-method').value = app.authMethod || 'secret';
    document.getElementById('app-client-secret').value = app.clientSecret || '';
    document.getElementById('app-private-jwk').value = app.privateJwk ? JSON.stringify(app.privateJwk, null, 2) : '';
    document.getElementById('app-redirect-uris').value = (app.redirectUris || []).join(', ');
    document.getElementById('app-scopes').value = app.defaultScopes || 'openid profile email';
    document.getElementById('app-notes').value = app.notes || '';
  } else {
    title.textContent = 'Add Application';
    document.getElementById('app-id').value = '';
    document.getElementById('app-name').value = '';
    orgSelect.value = '';
    document.getElementById('app-client-id').value = '';
    document.getElementById('app-type').value = 'web';
    document.getElementById('app-auth-method').value = 'secret';
    document.getElementById('app-client-secret').value = '';
    document.getElementById('app-private-jwk').value = '';
    document.getElementById('app-redirect-uris').value = '';
    document.getElementById('app-scopes').value = 'openid profile email';
    document.getElementById('app-notes').value = '';
  }

  updateAppAuthFields();
  modal.hidden = false;
}

function closeAppModal() {
  document.getElementById('app-modal').hidden = true;
}

function updateAppAuthFields() {
  const method = document.getElementById('app-auth-method').value;
  document.getElementById('app-secret-group').hidden = method !== 'secret';
  document.getElementById('app-jwk-group').hidden = method !== 'private_key_jwt';
}

async function saveApp() {
  const id = document.getElementById('app-id').value;
  const redirectUrisStr = document.getElementById('app-redirect-uris').value;
  const privateJwkStr = document.getElementById('app-private-jwk').value.trim();

  let privateJwk = null;
  if (privateJwkStr) {
    try {
      privateJwk = JSON.parse(privateJwkStr);
    } catch {
      alert('Invalid JSON for Private JWK');
      return;
    }
  }

  const data = {
    name: document.getElementById('app-name').value.trim(),
    orgId: document.getElementById('app-org').value || null,
    clientId: document.getElementById('app-client-id').value.trim(),
    applicationType: document.getElementById('app-type').value,
    authMethod: document.getElementById('app-auth-method').value,
    clientSecret: document.getElementById('app-client-secret').value.trim(),
    privateJwk,
    redirectUris: redirectUrisStr.split(',').map(s => s.trim()).filter(s => s),
    defaultScopes: document.getElementById('app-scopes').value.trim(),
    notes: document.getElementById('app-notes').value.trim(),
  };

  if (!data.name || !data.clientId) {
    alert('Name and Client ID are required');
    return;
  }

  try {
    if (id) {
      await fetch(`/api/settings/apps/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/settings/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }

    closeAppModal();
    await loadAllData();
    renderApps();
  } catch (err) {
    alert('Error saving application: ' + err.message);
  }
}

window.editApp = async function(id) {
  const app = apps.find(a => a.id === id);
  if (app) {
    openAppModal(app);
  }
};

window.deleteApp = async function(id) {
  if (!confirm('Delete this application?')) return;

  try {
    await fetch(`/api/settings/apps/${id}`, { method: 'DELETE' });
    await loadAllData();
    renderApps();
  } catch (err) {
    alert('Error deleting application: ' + err.message);
  }
};

// ============== Agents ==============

function renderAgents() {
  const list = document.getElementById('agents-list');

  if (agents.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>No agents yet</h3>
        <p>Add your first workload identity / agent</p>
      </div>
    `;
    return;
  }

  list.innerHTML = agents.map(agent => {
    const org = orgs.find(o => o.id === agent.orgId);
    const orgName = org ? org.name : 'No org';

    return `
      <div class="entity-card" data-id="${agent.id}">
        <div class="entity-info">
          <div class="entity-name">${escapeHtml(agent.name)}</div>
          <div class="entity-meta">
            Principal: <code>${escapeHtml(agent.principalId)}</code>
          </div>
          <div class="entity-badges">
            <span class="entity-badge">${escapeHtml(orgName)}</span>
            <span class="entity-badge">${agent.privateJwk ? 'Has Private Key' : 'No Key'}</span>
          </div>
        </div>
        <div class="entity-actions">
          <button class="btn btn-secondary" onclick="editAgent('${agent.id}')">Edit</button>
          <button class="btn btn-secondary" onclick="deleteAgent('${agent.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function openAgentModal(agent = null) {
  const modal = document.getElementById('agent-modal');
  const title = document.getElementById('agent-modal-title');
  const orgSelect = document.getElementById('agent-org');

  // Populate org dropdown
  orgSelect.innerHTML = '<option value="">Select organization...</option>' +
    orgs.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');

  if (agent) {
    title.textContent = 'Edit Agent';
    document.getElementById('agent-id').value = agent.id;
    document.getElementById('agent-name').value = agent.name;
    orgSelect.value = agent.orgId || '';
    document.getElementById('agent-principal-id').value = agent.principalId || '';
    document.getElementById('agent-private-jwk').value = agent.privateJwk ? JSON.stringify(agent.privateJwk, null, 2) : '';
    document.getElementById('agent-notes').value = agent.notes || '';
  } else {
    title.textContent = 'Add Agent';
    document.getElementById('agent-id').value = '';
    document.getElementById('agent-name').value = '';
    orgSelect.value = '';
    document.getElementById('agent-principal-id').value = '';
    document.getElementById('agent-private-jwk').value = '';
    document.getElementById('agent-notes').value = '';
  }

  modal.hidden = false;
}

function closeAgentModal() {
  document.getElementById('agent-modal').hidden = true;
}

async function saveAgent() {
  const id = document.getElementById('agent-id').value;
  const privateJwkStr = document.getElementById('agent-private-jwk').value.trim();

  let privateJwk = null;
  if (privateJwkStr) {
    try {
      privateJwk = JSON.parse(privateJwkStr);
    } catch {
      alert('Invalid JSON for Private JWK');
      return;
    }
  }

  const data = {
    name: document.getElementById('agent-name').value.trim(),
    orgId: document.getElementById('agent-org').value || null,
    principalId: document.getElementById('agent-principal-id').value.trim(),
    privateJwk,
    notes: document.getElementById('agent-notes').value.trim(),
  };

  if (!data.name) {
    alert('Name is required');
    return;
  }

  try {
    if (id) {
      await fetch(`/api/settings/agents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/settings/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }

    closeAgentModal();
    await loadAllData();
    renderAgents();
  } catch (err) {
    alert('Error saving agent: ' + err.message);
  }
}

window.editAgent = async function(id) {
  const agent = agents.find(a => a.id === id);
  if (agent) {
    openAgentModal(agent);
  }
};

window.deleteAgent = async function(id) {
  if (!confirm('Delete this agent?')) return;

  try {
    await fetch(`/api/settings/agents/${id}`, { method: 'DELETE' });
    await loadAllData();
    renderAgents();
  } catch (err) {
    alert('Error deleting agent: ' + err.message);
  }
};

// ============== Import/Export ==============

async function exportSettings() {
  try {
    const res = await fetch('/api/settings/export');
    const data = await res.json();

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `okta-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error exporting settings: ' + err.message);
  }
}

function openImportModal() {
  document.getElementById('import-data').value = '';
  document.getElementById('import-overwrite').checked = false;
  document.getElementById('import-modal').hidden = false;
}

function closeImportModal() {
  document.getElementById('import-modal').hidden = true;
}

async function importSettings() {
  const dataStr = document.getElementById('import-data').value.trim();
  const overwrite = document.getElementById('import-overwrite').checked;

  if (!dataStr) {
    alert('Please paste JSON data to import');
    return;
  }

  let data;
  try {
    data = JSON.parse(dataStr);
  } catch {
    alert('Invalid JSON');
    return;
  }

  try {
    const url = overwrite ? '/api/settings/import?overwrite=true' : '/api/settings/import';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();

    closeImportModal();
    await loadAllData();
    renderCurrentSection();

    if (result.imported) {
      alert(`Imported: ${result.imported.orgs} orgs, ${result.imported.apps} apps, ${result.imported.agents} agents\n` +
            `Skipped: ${result.skipped.orgs} orgs, ${result.skipped.apps} apps, ${result.skipped.agents} agents`);
    } else {
      alert('Settings imported successfully');
    }
  } catch (err) {
    alert('Error importing settings: ' + err.message);
  }
}

// ============== Utilities ==============

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}
