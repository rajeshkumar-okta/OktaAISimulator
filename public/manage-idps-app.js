// Manage IdPs Application

let idpList = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Display redirect URI
  document.getElementById('redirect-uri').textContent = `${window.location.origin}/callback`;

  // Setup auto-correct for domain inputs
  setupDomainAutoCorrect('new-domain');

  // Button handlers
  document.getElementById('add-idp-trigger').addEventListener('click', showAddForm);
  document.getElementById('cancel-add-btn').addEventListener('click', hideAddForm);
  document.getElementById('save-add-btn').addEventListener('click', handleAddIdp);

  // Load IdPs
  await loadIdps();
}

async function loadIdps() {
  const listEl = document.getElementById('idp-list');
  listEl.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const res = await fetch('/api/idps');
    idpList = await res.json();

    if (idpList.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">🔐</div>
          <p>No Identity Providers configured yet.</p>
        </div>
      `;
      return;
    }

    // Load full details for each IdP
    const fullIdps = await Promise.all(
      idpList.map(async (idp) => {
        try {
          const res = await fetch(`/api/idps/${idp.id}`);
          return await res.json();
        } catch {
          return idp;
        }
      })
    );

    listEl.innerHTML = fullIdps.map(idp => renderIdpCard(idp)).join('');

    // Bind edit/delete handlers
    bindCardHandlers();
  } catch (err) {
    listEl.innerHTML = `<div class="error-message visible">Failed to load IdPs: ${escapeHtml(err.message)}</div>`;
  }
}

function renderIdpCard(idp) {
  const config = idp.config || {};
  const maskedSecret = maskSecret(config.clientSecret);
  const isPrimary = idp.isPrimary;
  const createdAt = idp.createdAt ? new Date(idp.createdAt).toLocaleDateString() : 'Unknown';

  return `
    <div class="idp-card ${isPrimary ? 'primary' : ''}" data-id="${idp.id}">
      <div class="idp-card-header">
        <div class="idp-card-title">
          <h3>${escapeHtml(idp.name || 'Unnamed IdP')}</h3>
          ${isPrimary ? '<span class="badge-primary">Primary</span>' : ''}
        </div>
        <div class="idp-card-actions view-mode">
          <button class="btn btn-secondary btn-small edit-btn">Edit</button>
          ${!isPrimary ? '<button class="btn btn-secondary btn-small delete-btn">Delete</button>' : ''}
        </div>
      </div>

      <div class="idp-fields view-mode">
        <div class="idp-field">
          <label>Authorization Server URL</label>
          <div class="idp-field-value">${escapeHtml(config.oktaDomain || '-')}</div>
        </div>
        <div class="idp-field">
          <label>Client ID</label>
          <div class="idp-field-value">${escapeHtml(config.clientId || '-')}</div>
        </div>
        <div class="idp-field">
          <label>Client Secret</label>
          <div class="idp-field-value secret">${maskedSecret}</div>
        </div>
      </div>

      <div class="idp-fields edit-mode">
        <div class="idp-field">
          <label>Name</label>
          <input type="text" class="edit-name" value="${escapeHtml(idp.name || '')}">
        </div>
        <div class="idp-field">
          <label>Authorization Server URL</label>
          <input type="text" class="edit-domain" value="${escapeHtml(config.oktaDomain || '')}">
        </div>
        <div class="idp-field">
          <label>Client ID</label>
          <input type="text" class="edit-clientId" value="${escapeHtml(config.clientId || '')}">
        </div>
        <div class="idp-field">
          <label>Client Secret</label>
          <input type="password" class="edit-clientSecret" placeholder="Enter new secret to change">
          <div class="hint" style="font-size: 0.7rem; color: #888; margin-top: 0.25rem;">Leave blank to keep current secret</div>
        </div>
        ${!isPrimary ? `
        <div class="checkbox-row">
          <input type="checkbox" class="edit-isPrimary">
          <label>Set as primary IdP</label>
        </div>
        ` : ''}
        <div class="edit-actions">
          <button class="btn btn-secondary btn-small cancel-edit-btn">Cancel</button>
          <button class="btn btn-primary btn-small save-edit-btn">Save Changes</button>
        </div>
      </div>

      <div class="idp-meta view-mode">
        <span>Created: ${createdAt}</span>
        ${idp.createdBy ? `<span>By: ${escapeHtml(idp.createdBy)}</span>` : ''}
      </div>
    </div>
  `;
}

function bindCardHandlers() {
  // Edit buttons
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.idp-card');
      card.classList.add('editing');
      setupDomainAutoCorrect(card.querySelector('.edit-domain'));
    });
  });

  // Cancel edit buttons
  document.querySelectorAll('.cancel-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.idp-card');
      card.classList.remove('editing');
    });
  });

  // Save edit buttons
  document.querySelectorAll('.save-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleSaveEdit(e.target.closest('.idp-card')));
  });

  // Delete buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleDelete(e.target.closest('.idp-card')));
  });
}

async function handleSaveEdit(card) {
  const id = card.dataset.id;
  const name = card.querySelector('.edit-name').value.trim();
  const oktaDomain = card.querySelector('.edit-domain').value.trim().replace(/\/$/, '');
  const clientId = card.querySelector('.edit-clientId').value.trim();
  const clientSecret = card.querySelector('.edit-clientSecret').value;
  const isPrimaryCheckbox = card.querySelector('.edit-isPrimary');
  const isPrimary = isPrimaryCheckbox ? isPrimaryCheckbox.checked : false;

  if (!name || !oktaDomain || !clientId) {
    alert('Name, Authorization Server URL, and Client ID are required.');
    return;
  }

  const saveBtn = card.querySelector('.save-edit-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    // Get current config to preserve secret if not changed
    const currentRes = await fetch(`/api/idps/${id}`);
    const current = await currentRes.json();

    const config = {
      oktaDomain,
      clientId,
      clientSecret: clientSecret || current.config?.clientSecret || '',
    };

    const res = await fetch(`/api/idps/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config, isPrimary }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update IdP');
    }

    await loadIdps();
  } catch (err) {
    alert('Error: ' + err.message);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
}

async function handleDelete(card) {
  const id = card.dataset.id;
  const name = card.querySelector('h3').textContent;

  if (!confirm(`Are you sure you want to delete "${name}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/idps/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete IdP');
    }
    await loadIdps();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function showAddForm() {
  document.getElementById('add-idp-trigger').style.display = 'none';
  document.getElementById('add-idp-form').classList.add('visible');
  document.getElementById('new-name').focus();
}

function hideAddForm() {
  document.getElementById('add-idp-form').classList.remove('visible');
  document.getElementById('add-idp-trigger').style.display = '';
  clearAddForm();
}

function clearAddForm() {
  document.getElementById('new-name').value = '';
  document.getElementById('new-domain').value = '';
  document.getElementById('new-clientId').value = '';
  document.getElementById('new-clientSecret').value = '';
  document.getElementById('new-isPrimary').checked = false;
  hideError('add-error');
}

async function handleAddIdp() {
  const name = document.getElementById('new-name').value.trim();
  const oktaDomain = document.getElementById('new-domain').value.trim().replace(/\/$/, '');
  const clientId = document.getElementById('new-clientId').value.trim();
  const clientSecret = document.getElementById('new-clientSecret').value;
  const isPrimary = document.getElementById('new-isPrimary').checked;

  const errorEl = document.getElementById('add-error');

  if (!name) {
    showError(errorEl, 'Name is required');
    return;
  }
  if (!oktaDomain) {
    showError(errorEl, 'Authorization Server URL is required');
    return;
  }
  if (!oktaDomain.startsWith('https://')) {
    showError(errorEl, 'Authorization Server URL must start with https://');
    return;
  }
  if (!clientId) {
    showError(errorEl, 'Client ID is required');
    return;
  }
  if (!clientSecret) {
    showError(errorEl, 'Client Secret is required');
    return;
  }

  hideError(errorEl);

  const saveBtn = document.getElementById('save-add-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Adding...';

  try {
    const res = await fetch('/api/idps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        config: { oktaDomain, clientId, clientSecret },
        createdBy: getCurrentUserSub(),
        isPrimary,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to add IdP');
    }

    hideAddForm();
    await loadIdps();
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Add IdP';
  }
}

// --- Utility functions ---

function getCurrentUserSub() {
  try {
    const userJson = localStorage.getItem('okta_current_user');
    if (userJson) {
      const user = JSON.parse(userJson);
      return user.sub || 'unknown';
    }
  } catch {}
  return 'unknown';
}

function maskSecret(secret) {
  if (!secret) return '••••••••';
  if (secret.length <= 8) return '••••••••';
  return secret.substring(0, 4) + '••••••••' + secret.substring(secret.length - 4);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function showError(el, message) {
  el.textContent = message;
  el.classList.add('visible');
}

function hideError(el) {
  if (typeof el === 'string') {
    el = document.getElementById(el);
  }
  el.classList.remove('visible');
}

function setupDomainAutoCorrect(input) {
  if (typeof input === 'string') {
    input = document.getElementById(input);
  }
  if (!input) return;

  const handler = () => autoCorrectOktaDomain(input);
  input.addEventListener('input', handler);
  input.addEventListener('paste', () => setTimeout(handler, 0));
}

function autoCorrectOktaDomain(input) {
  const value = input.value;
  const corrected = value.replace(/-admin\.(okta|oktapreview|okta-emea|okta-gov)/gi, '.$1');

  if (corrected !== value) {
    input.value = corrected;
    input.style.backgroundColor = '#d1fae5';
    setTimeout(() => {
      input.style.backgroundColor = '';
    }, 1000);
  }
}
