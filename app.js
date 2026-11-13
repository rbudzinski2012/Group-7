const state = {
  categories: [],
  subscriptions: [],
  activeCategory: 'all'
};

function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Number(cents) || 0);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function showFeedback(message, type = 'success') {
  const banner = document.getElementById('feedbackBanner');
  banner.textContent = message;
  banner.className = `feedback-banner ${type}`;
  setTimeout(() => {
    banner.classList.add('hidden');
  }, 5000);
}

async function fetchCategories() {
  const res = await fetch('/api/categories');
  if (!res.ok) throw new Error('Failed to load categories.');
  state.categories = await res.json();

  const select = document.getElementById('subCategorySelect');
  const filterContainer = document.getElementById('categoryFilterContainer');

  select.innerHTML = state.categories
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join('');

  const chipsHtml = [
    `<button class="filter-chip ${state.activeCategory === 'all' ? 'active' : ''}" data-category="all" type="button">All Categories</button>`,
    ...state.categories.map(
      (c) =>
        `<button class="filter-chip ${String(state.activeCategory) === String(c.id) ? 'active' : ''}" data-category="${c.id}" type="button">${c.name}</button>`
    )
  ].join('');

  filterContainer.innerHTML = chipsHtml;
  filterContainer.querySelectorAll('.filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.category;
      filterContainer.querySelectorAll('.filter-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      refreshDashboard();
    });
  });
}

async function fetchSummary() {
  const res = await fetch('/api/summary');
  if (!res.ok) throw new Error('Failed to load summary.');
  const summary = await res.json();

  document.getElementById('metricAnnualOutflow').textContent = formatCents(
    summary.active_annual_outflow_cents
  );
  document.getElementById('metricMonthlyOutflow').textContent = formatCents(
    summary.monthly_outflow_cents
  );
  document.getElementById('metricReclaimedSavings').textContent = formatCents(
    summary.reclaimed_annual_savings_cents
  );
  document.getElementById('metricActiveCount').textContent =
    `${summary.active_subscriptions_count} / ${summary.total_subscriptions_count}`;

  renderCategoryBreakdown(summary.category_breakdown_cents, summary.active_annual_outflow_cents);
  renderAuditLogs(summary.recent_audit_logs);
}

function renderCategoryBreakdown(breakdown, totalActiveCents) {
  const container = document.getElementById('categoryBreakdownList');
  const entries = Object.entries(breakdown || {});
  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-state">No active category spend to display.</p>';
    return;
  }

  container.innerHTML = entries
    .sort((a, b) => b[1] - a[1])
    .map(([category, cents]) => {
      const pct = totalActiveCents > 0 ? Math.round((cents / totalActiveCents) * 100) : 0;
      return `
        <div class="breakdown-row">
          <div class="breakdown-meta">
            <span><strong>${category}</strong> (${pct}%)</span>
            <span>${formatCents(cents)} / yr</span>
          </div>
          <div class="breakdown-bar-bg">
            <div class="breakdown-bar-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderAuditLogs(logs) {
  const list = document.getElementById('auditLogList');
  if (!logs || logs.length === 0) {
    list.innerHTML = '<li class="empty-state">No status transitions recorded yet.</li>';
    return;
  }

  list.innerHTML = logs
    .map((log) => {
      const deltaStr =
        log.annual_savings_delta_cents > 0
          ? `+${formatCents(log.annual_savings_delta_cents)} saved`
          : log.annual_savings_delta_cents < 0
          ? `${formatCents(log.annual_savings_delta_cents)} reclaimed reversed`
          : '$0.00 delta';
      return `
        <li>
          <span><strong>${log.subscription_name}</strong>: ${log.previous_status} &rarr; ${log.new_status}</span>
          <strong>${deltaStr}</strong>
        </li>
      `;
    })
    .join('');
}

async function fetchSubscriptions() {
  const query =
    state.activeCategory !== 'all' ? `?category_id=${encodeURIComponent(state.activeCategory)}` : '';
  const res = await fetch(`/api/subscriptions${query}`);
  if (!res.ok) throw new Error('Failed to load subscriptions.');
  state.subscriptions = await res.json();
  renderSubscriptionsTable();
}

function renderSubscriptionsTable() {
  const tbody = document.getElementById('subscriptionsTableBody');
  if (state.subscriptions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty-state">No subscriptions match the current filter.</td></tr>';
    return;
  }

  tbody.innerHTML = state.subscriptions
    .map((sub) => {
      const nextToggleStatus = sub.status === 'canceled' ? 'active' : 'canceled';
      const toggleLabel = sub.status === 'canceled' ? 'Reactivate' : 'Cancel Service';
      return `
        <tr>
          <td><strong>${sub.name}</strong></td>
          <td>${sub.category_name}</td>
          <td>${formatCents(sub.amount_cents)}</td>
          <td style="text-transform: capitalize;">${sub.frequency}</td>
          <td>${formatCents(sub.monthly_equivalent_cents)}/mo</td>
          <td><strong>${formatCents(sub.annual_cents)}/yr</strong></td>
          <td><span class="badge badge-${sub.status}">${sub.status}</span></td>
          <td>
            <div class="action-group">
              <button class="btn btn-small btn-outline" onclick="toggleStatus(${sub.id}, '${nextToggleStatus}')">${toggleLabel}</button>
              <button class="btn btn-small btn-outline" onclick="openEditModal(${sub.id})">Edit</button>
              <button class="btn btn-small btn-danger" onclick="deleteSubscription(${sub.id})">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function refreshDashboard() {
  await Promise.all([fetchSubscriptions(), fetchSummary()]);
}

window.toggleStatus = async function (id, newStatus) {
  try {
    const res = await fetch(`/api/subscriptions/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!res.ok) {
      showFeedback(data.error || 'Failed to update status.', 'error');
      return;
    }
    showFeedback(
      `Updated "${data.name}" status to ${newStatus} (Savings impact: ${formatCents(data.savings_delta_cents)}).`,
      'success'
    );
    await refreshDashboard();
  } catch (err) {
    showFeedback(err.message, 'error');
  }
};

window.deleteSubscription = async function (id) {
  try {
    const res = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      showFeedback(data.error || 'Failed to delete subscription.', 'error');
      return;
    }
    showFeedback(data.message, 'success');
    await refreshDashboard();
  } catch (err) {
    showFeedback(err.message, 'error');
  }
};

window.openEditModal = function (id) {
  const sub = state.subscriptions.find((s) => s.id === id);
  if (!sub) return;

  document.getElementById('modalTitle').textContent = 'Edit Subscription';
  document.getElementById('subIdInput').value = sub.id;
  document.getElementById('subNameInput').value = sub.name;
  document.getElementById('subCostInput').value = (sub.amount_cents / 100).toFixed(2);
  document.getElementById('subFrequencySelect').value = sub.frequency;
  document.getElementById('subCategorySelect').value = sub.category_id;
  document.getElementById('subStatusSelect').value = sub.status;
  document.getElementById('modalErrorBox').classList.add('hidden');
  document.getElementById('subModal').classList.remove('hidden');
};

function openCreateModal() {
  document.getElementById('modalTitle').textContent = 'Add Subscription';
  document.getElementById('subscriptionForm').reset();
  document.getElementById('subIdInput').value = '';
  document.getElementById('modalErrorBox').classList.add('hidden');
  document.getElementById('subModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('subModal').classList.add('hidden');
}

document.getElementById('openModalBtn').addEventListener('click', openCreateModal);
document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

document.getElementById('subscriptionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('modalErrorBox');
  errorBox.classList.add('hidden');

  const id = document.getElementById('subIdInput').value;
  const name = document.getElementById('subNameInput').value.trim();
  const rawDollars = parseFloat(document.getElementById('subCostInput').value);
  const amount_cents = Number.isNaN(rawDollars) ? -1 : Math.round(rawDollars * 100);
  const frequency = document.getElementById('subFrequencySelect').value;
  const category_id = Number(document.getElementById('subCategorySelect').value);
  const status = document.getElementById('subStatusSelect').value;

  const url = id ? `/api/subscriptions/${id}` : '/api/subscriptions';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, amount_cents, frequency, category_id, status })
    });
    const data = await res.json();
    if (!res.ok) {
      errorBox.textContent = data.error || 'Validation failed.';
      errorBox.classList.remove('hidden');
      return;
    }
    closeModal();
    showFeedback(
      id ? `Updated "${data.name}" successfully.` : `Added "${data.name}" (${formatCents(data.annual_cents)}/yr).`,
      'success'
    );
    await refreshDashboard();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove('hidden');
  }
});

// Optional CSV Export
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (state.subscriptions.length === 0) {
    showFeedback('No subscriptions to export.', 'error');
    return;
  }
  const headers = ['ID', 'Name', 'Category', 'Amount_Cents', 'Frequency', 'Monthly_Equiv_Cents', 'Annual_Cents', 'Status'];
  const rows = state.subscriptions.map((s) => [
    s.id,
    `"${s.name.replace(/"/g, '""')}"`,
    `"${s.category_name}"`,
    s.amount_cents,
    s.frequency,
    s.monthly_equivalent_cents,
    s.annual_cents,
    s.status
  ]);
  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'subscriptions_portfolio.csv';
  link.click();
});

(async function init() {
  try {
    await fetchCategories();
    await refreshDashboard();
  } catch (err) {
    showFeedback(err.message, 'error');
  }
})();
