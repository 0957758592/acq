// Dashboard SPA glue (thin presentation, TZ §11.9). Wires the unit-tested
// api-client + feature view-models to the DOM. All business logic lives behind
// the facade; this only renders server-state and dispatches operations. A
// top-level error boundary surfaces failures without unsafe HTML injection.
import { createApiClient } from '/js/api-client.js';
import { accountsViewModel } from '/js/features/accounts.js';

const apiOrigin = window.__ACQ_API__ && window.__ACQ_API__ !== 'self' ? window.__ACQ_API__ : '';

function showError(message) {
  const el = document.getElementById('error-boundary');
  el.textContent = `Error: ${message}`;
  el.hidden = false;
}

function clearError() {
  const el = document.getElementById('error-boundary');
  el.hidden = true;
  el.textContent = '';
}

function renderAccounts(vm) {
  const app = document.getElementById('app');
  app.replaceChildren();

  const summary = document.createElement('section');
  summary.setAttribute('aria-label', 'Pool summary');
  const heading = document.createElement('h2');
  heading.textContent = `Accounts: ${vm.total}`;
  summary.append(heading);
  for (const [status, count] of Object.entries(vm.byStatus)) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${status}: ${count}`;
    summary.append(chip);
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '';
  const hr = document.createElement('tr');
  for (const h of ['Platform', 'Identifier', 'Status', 'Device']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    hr.append(th);
  }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  for (const row of vm.rows) {
    const tr = document.createElement('tr');
    for (const cell of [row.platform, row.identifier, row.status, row.device ?? '—']) {
      const td = document.createElement('td');
      td.textContent = String(cell);
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  app.append(summary, table);
}

async function connect(token) {
  clearError();
  const client = createApiClient({ baseUrl: apiOrigin, token });
  try {
    // account.status returns { accounts } for the whole inventory.
    const data = await client.execute('account.status', {});
    renderAccounts(accountsViewModel(data.accounts || []));
  } catch (err) {
    showError(err.code ? `${err.code}: ${err.message}` : err.message);
  }
}

document.getElementById('auth').addEventListener('submit', (e) => {
  e.preventDefault();
  const token = document.getElementById('token').value.trim();
  if (token) connect(token);
});
