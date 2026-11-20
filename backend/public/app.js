(() => {
  const SESSION_KEY = 'ticketiq.accessToken';
  const PAGE_SIZE = 10;
  const CATEGORIES = [
    'ACCOUNT',
    'ORDER',
    'REFUND',
    'CONTACT',
    'PAYMENT',
    'FEEDBACK',
    'SHIPPING',
    'INVOICE',
    'DELIVERY',
    'SUBSCRIPTION',
    'CANCEL',
    'UNCLASSIFIED',
  ];
  const NEXT_STATUSES = {
    NEW: ['IN_PROGRESS'],
    IN_PROGRESS: ['RESOLVED'],
    RESOLVED: ['IN_PROGRESS'],
  };
  const ACTIVITY_LABELS = {
    TICKET_CREATED: 'Ticket created',
    ASSIGNEE_CHANGED: 'Assignee updated',
    STATUS_CHANGED: 'Status changed',
    INTERNAL_NOTE_ADDED: 'Internal note added',
    CATEGORY_CORRECTED: 'Category corrected',
  };

  const elements = {
    loginScreen: document.getElementById('login-screen'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    workspace: document.getElementById('workspace'),
    userName: document.getElementById('user-name'),
    userRole: document.getElementById('user-role'),
    userAvatar: document.getElementById('user-avatar'),
    serviceStatus: document.getElementById('service-status'),
    ticketList: document.getElementById('ticket-list'),
    queueTotal: document.getElementById('queue-total'),
    paginationCaption: document.getElementById('pagination-caption'),
    previousPage: document.getElementById('previous-page'),
    nextPage: document.getElementById('next-page'),
    createDialog: document.getElementById('create-dialog'),
    createForm: document.getElementById('create-form'),
    createError: document.getElementById('create-error'),
    ticketDialog: document.getElementById('ticket-dialog'),
    ticketDetail: document.getElementById('ticket-detail'),
    toastRegion: document.getElementById('toast-region'),
  };

  const state = {
    token: sessionStorage.getItem(SESSION_KEY),
    user: null,
    agents: [],
    page: 1,
    totalPages: 1,
    searchTimer: null,
    toastTimer: null,
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });
  }

  function messageFrom(payload, fallback) {
    if (payload && typeof payload.message === 'string') return payload.message;
    if (Array.isArray(payload?.message)) return payload.message.join(', ');
    return fallback;
  }

  function clearSession(message = '') {
    state.token = null;
    state.user = null;
    sessionStorage.removeItem(SESSION_KEY);
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      dialog.close();
    }
    elements.workspace.hidden = true;
    elements.loginScreen.hidden = false;
    elements.loginError.textContent = message;
    elements.loginError.hidden = !message;
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (state.token && !options.skipAuth) {
      headers.set('Authorization', `Bearer ${state.token}`);
    }

    let body;
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }

    const response = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body,
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      if (response.status === 401 && state.token && path !== '/auth/login') {
        clearSession('Your session expired. Please sign in again.');
      }
      throw new Error(
        messageFrom(payload, `Request failed with status ${response.status}`),
      );
    }

    return payload;
  }

  function showToast(message, kind = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${kind === 'error' ? 'is-error' : 'is-success'}`;
    toast.textContent = message;
    elements.toastRegion.replaceChildren(toast);
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.remove(), 4200);
  }

  function run(task) {
    task().catch((error) => {
      showToast(error instanceof Error ? error.message : 'Something went wrong.', 'error');
    });
  }

  function showWorkspace(user) {
    state.user = user;
    elements.loginScreen.hidden = true;
    elements.workspace.hidden = false;
    elements.userName.textContent = user.displayName;
    elements.userRole.textContent = user.role;
    elements.userAvatar.textContent = user.displayName.trim().charAt(0).toUpperCase();
    elements.loginError.hidden = true;
  }

  function dateLabel(value, includeTime = true) {
    if (!value) return 'No deadline';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    }).format(date);
  }

  function statusLabel(status) {
    return {
      NEW: 'New',
      IN_PROGRESS: 'In progress',
      RESOLVED: 'Resolved',
    }[status] || status;
  }

  function statusClass(status) {
    return {
      NEW: 'status-new',
      IN_PROGRESS: 'status-in-progress',
      RESOLVED: 'status-resolved',
    }[status] || '';
  }

  function urgencyClass(urgency) {
    return {
      High: 'urgency-high',
      Medium: 'urgency-medium',
      Low: 'urgency-low',
    }[urgency] || 'fallback-badge';
  }

  function isOverdue(ticket) {
    return (
      ticket.status !== 'RESOLVED' &&
      ticket.dueAt &&
      new Date(ticket.dueAt).getTime() < Date.now()
    );
  }

  function buildTicketQuery() {
    const params = new URLSearchParams({
      page: String(state.page),
      limit: String(PAGE_SIZE),
    });
    const filters = [
      ['q', document.getElementById('filter-search').value.trim()],
      ['status', document.getElementById('filter-status').value],
      ['urgency', document.getElementById('filter-urgency').value],
      ['category', document.getElementById('filter-category').value],
      ['overdue', document.getElementById('filter-overdue').value],
    ];
    for (const [key, value] of filters) {
      if (value) params.set(key, value);
    }
    return params;
  }

  async function loadDashboard() {
    elements.ticketList.setAttribute('aria-busy', 'true');
    const query = buildTicketQuery();
    const [summary, agents, ticketPage] = await Promise.all([
      api('/tickets/summary'),
      api('/agents'),
      api(`/tickets?${query.toString()}`),
    ]);

    state.agents = agents;
    state.totalPages = Math.max(1, ticketPage.totalPages || 1);
    state.page = ticketPage.page || state.page;
    document.getElementById('summary-open').textContent =
      String((summary.byStatus?.NEW || 0) + (summary.byStatus?.IN_PROGRESS || 0));
    document.getElementById('summary-high').textContent = String(summary.openHighUrgency);
    document.getElementById('summary-unassigned').textContent = String(summary.unassigned);
    document.getElementById('summary-overdue').textContent = String(summary.overdue);
    document.getElementById('nav-open-count').textContent =
      String((summary.byStatus?.NEW || 0) + (summary.byStatus?.IN_PROGRESS || 0));
    elements.queueTotal.textContent = String(ticketPage.total);
    elements.paginationCaption.textContent =
      `Page ${state.page} of ${state.totalPages} · ${ticketPage.total} tickets`;
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= state.totalPages;
    renderTickets(ticketPage.data || []);
    elements.ticketList.setAttribute('aria-busy', 'false');
    refreshServiceStatus();
  }

  async function refreshServiceStatus() {
    try {
      const health = await api('/health');
      const reachable = health.mlService === 'reachable';
      elements.serviceStatus.classList.toggle('is-unreachable', !reachable);
      elements.serviceStatus.innerHTML = `
        <span class="status-pulse"></span>
        ML service ${reachable ? 'connected' : 'offline'}
      `;
    } catch {
      elements.serviceStatus.classList.add('is-unreachable');
      elements.serviceStatus.textContent = 'Service status unavailable';
    }
  }

  function renderTickets(tickets) {
    if (!tickets.length) {
      elements.ticketList.innerHTML = `
        <div class="queue-empty">
          <strong>No tickets found</strong>
          <span>Try changing a filter or create a new ticket.</span>
        </div>
      `;
      return;
    }

    elements.ticketList.innerHTML = tickets
      .map((ticket) => {
        const overdue = isOverdue(ticket);
        const assignee = ticket.assignee?.displayName || 'Unassigned';
        const fallback = ticket.isFallback
          ? '<span class="badge fallback-badge">Fallback</span>'
          : '';
        return `
          <article class="ticket-row">
            <div class="ticket-main">
              <span class="ticket-priority-bar" data-urgency="${escapeHtml(ticket.urgency)}"></span>
              <div class="ticket-main-copy">
                <button
                  class="ticket-title-button"
                  type="button"
                  data-open-ticket="${escapeHtml(ticket.id)}"
                >${escapeHtml(ticket.title)}</button>
                <div class="ticket-subline">
                  <span class="ticket-id">#${escapeHtml(ticket.id.slice(0, 8))}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span class="ticket-description-preview">${escapeHtml(ticket.description)}</span>
                  ${fallback}
                </div>
              </div>
            </div>
            <span class="category-label">${escapeHtml(ticket.category)}</span>
            <span class="badge ${urgencyClass(ticket.urgency)}">${escapeHtml(ticket.urgency)}</span>
            <span class="assignee-cell" title="${escapeHtml(assignee)}">${escapeHtml(assignee)}</span>
            <span class="badge ${statusClass(ticket.status)}">${escapeHtml(statusLabel(ticket.status))}</span>
            <span class="sla-cell ${overdue ? 'sla-overdue' : ''}" title="${escapeHtml(dateLabel(ticket.dueAt))}">
              ${overdue ? 'Overdue' : escapeHtml(dateLabel(ticket.dueAt))}
            </span>
          </article>
        `;
      })
      .join('');
  }

  function activityDescription(event) {
    const metadata = event.metadata || {};
    if (event.type === 'STATUS_CHANGED' && metadata.from && metadata.to) {
      return `${statusLabel(metadata.from)} → ${statusLabel(metadata.to)}`;
    }
    if (event.type === 'ASSIGNEE_CHANGED' && metadata.toAgentName) {
      return `Assigned to ${metadata.toAgentName}`;
    }
    if (event.type === 'CATEGORY_CORRECTED' && metadata.from && metadata.to) {
      return `${metadata.from} → ${metadata.to}`;
    }
    return '';
  }

  function renderActivity(events) {
    if (!events.length) return '<p class="muted">No activity recorded yet.</p>';
    return `
      <div class="detail-activity">
        ${events
          .map((event) => {
            const description = activityDescription(event);
            return `
              <div class="activity-item">
                <span class="activity-dot" aria-hidden="true">&#8226;</span>
                <div class="activity-copy">
                  <strong>${escapeHtml(ACTIVITY_LABELS[event.type] || event.type)}</strong>
                  ${description ? `<span>${escapeHtml(description)}</span>` : ''}
                  <span>${escapeHtml(event.actorName)} · ${escapeHtml(dateLabel(event.createdAt))}</span>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  function renderAgentOptions(ticket) {
    const selectedAgent = ticket.assigneeId || '';
    const options = [
      `<option value="" ${selectedAgent ? '' : 'selected'}>Unassigned</option>`,
      ...state.agents.map((agent) => {
        const isSelected = agent.id === selectedAgent;
        const isDisabled = !agent.isActive && !isSelected;
        return `
          <option value="${escapeHtml(agent.id)}" ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}>
            ${escapeHtml(agent.displayName)}${agent.isActive ? '' : ' (inactive)'}
          </option>
        `;
      }),
    ];
    return options.join('');
  }

  function renderStatusOptions(ticket) {
    const statuses = NEXT_STATUSES[ticket.status] || [];
    if (!statuses.length) return '<option value="">No available transition</option>';
    return statuses
      .map(
        (status) =>
          `<option value="${status}">${escapeHtml(statusLabel(status))}</option>`,
      )
      .join('');
  }

  async function openTicket(ticketId) {
    elements.ticketDetail.innerHTML = `
      <div class="queue-loading">
        <span class="spinner"></span>
        Loading ticket...
      </div>
    `;
    elements.ticketDialog.showModal();
    let ticket;
    let activity;
    try {
      [ticket, activity] = await Promise.all([
        api(`/tickets/${encodeURIComponent(ticketId)}`),
        api(`/tickets/${encodeURIComponent(ticketId)}/activity`),
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not load this ticket.';
      elements.ticketDetail.innerHTML = `
        <div class="queue-empty">
          <strong>Ticket could not be loaded</strong>
          <span>${escapeHtml(message)}</span>
          <button class="button button-quiet" type="button" data-close-dialog="ticket-dialog">
            Close
          </button>
        </div>
      `;
      throw error;
    }

    const alternatives = CATEGORIES.filter((category) => category !== ticket.category);
    const overdue = isOverdue(ticket);
    elements.ticketDetail.innerHTML = `
      <header class="detail-header">
        <div class="detail-header-main">
          <p class="eyebrow">TICKET #${escapeHtml(ticket.id.slice(0, 8))}</p>
          <h2>${escapeHtml(ticket.title)}</h2>
          <div class="detail-subline">
            <span>Created ${escapeHtml(dateLabel(ticket.createdAt))}</span>
            <span aria-hidden="true">&middot;</span>
            <span>SLA ${escapeHtml(dateLabel(ticket.dueAt))}${overdue ? ' · overdue' : ''}</span>
          </div>
          <div class="detail-badges">
            <span class="badge ${urgencyClass(ticket.urgency)}">${escapeHtml(ticket.urgency)} urgency</span>
            <span class="badge ${statusClass(ticket.status)}">${escapeHtml(statusLabel(ticket.status))}</span>
            ${ticket.isFallback ? '<span class="badge fallback-badge">ML fallback used</span>' : ''}
          </div>
        </div>
        <button
          class="icon-button"
          type="button"
          data-close-dialog="ticket-dialog"
          aria-label="Close ticket details"
        >&times;</button>
      </header>
      <div class="detail-description">${escapeHtml(ticket.description)}</div>
      <div class="detail-grid">
        <section class="detail-section">
          <h3>Assignment</h3>
          <p>Choose an active agent in this workspace.</p>
          <form id="assign-form" data-ticket-id="${escapeHtml(ticket.id)}">
            <label for="assignee-select">Assigned to</label>
            <select id="assignee-select" name="agentId">${renderAgentOptions(ticket)}</select>
            <button class="button button-quiet" type="submit">Save assignment</button>
          </form>
        </section>
        <section class="detail-section">
          <h3>Workflow</h3>
          <p>Move through the allowed ticket status transitions.</p>
          <form id="status-form" data-ticket-id="${escapeHtml(ticket.id)}">
            <label for="status-select">Next status</label>
            <select id="status-select" name="status">${renderStatusOptions(ticket)}</select>
            <button class="button button-primary" type="submit" ${NEXT_STATUSES[ticket.status]?.length ? '' : 'disabled'}>
              Update status
            </button>
          </form>
        </section>
        <section class="detail-section">
          <h3>Category</h3>
          <p>
            Current: <strong>${escapeHtml(ticket.category)}</strong>
            ${ticket.predictedCategory ? ` · ML predicted ${escapeHtml(ticket.predictedCategory)}` : ''}
          </p>
          <form id="category-form" data-ticket-id="${escapeHtml(ticket.id)}">
            <label for="category-select">Correct category</label>
            <select id="category-select" name="category">
              ${alternatives.map((category) => `<option value="${category}">${category}</option>`).join('')}
            </select>
            <label for="category-reason">Reason for correction</label>
            <textarea id="category-reason" name="reason" minlength="5" maxlength="1000" rows="3" required placeholder="Explain why the category should change..."></textarea>
            <button class="button button-quiet" type="submit">Save correction</button>
          </form>
        </section>
        <section class="detail-section">
          <h3>Classification</h3>
          <p>Category and urgency come from the ML service at ticket intake.</p>
          <div class="classification-row">
            <span>Current category</span><strong>${escapeHtml(ticket.category)}</strong>
          </div>
          <div class="classification-row">
            <span>Original prediction</span><strong>${escapeHtml(ticket.predictedCategory || 'Not available')}</strong>
          </div>
          <div class="classification-row">
            <span>Intake mode</span><strong>${ticket.isFallback ? 'Fallback' : 'ML service'}</strong>
          </div>
        </section>
        <section class="detail-section detail-section-full">
          <h3>Activity history</h3>
          <p>Changes are recorded for this ticket and workspace.</p>
          ${renderActivity(activity)}
        </section>
      </div>
    `;
  }

  function setFormBusy(form, busy) {
    for (const button of form.querySelectorAll('button[type="submit"]')) {
      button.disabled = busy;
      button.dataset.originalLabel ||= button.textContent;
      button.textContent = busy ? 'Saving...' : button.dataset.originalLabel;
    }
  }

  async function submitMutation(form, path, body, successMessage) {
    const ticketId = form.dataset.ticketId;
    setFormBusy(form, true);
    try {
      await api(path(ticketId), { method: 'PATCH', body });
      await Promise.all([loadDashboard(), openTicket(ticketId)]);
      showToast(successMessage);
    } finally {
      setFormBusy(form, false);
    }
  }

  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = elements.loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    elements.loginError.hidden = true;
    const formData = new FormData(elements.loginForm);
    let tokens;
    try {
      tokens = await api(
        '/auth/login',
        {
          method: 'POST',
          body: {
            email: formData.get('email'),
            password: formData.get('password'),
          },
          skipAuth: true,
        },
      );
    } catch (error) {
      elements.loginError.textContent =
        error instanceof Error ? error.message : 'Sign in failed.';
      elements.loginError.hidden = false;
      return;
    } finally {
      submitButton.disabled = false;
    }

    state.token = tokens.accessToken;
    sessionStorage.setItem(SESSION_KEY, state.token);
    let user;
    try {
      user = await api('/auth/me');
    } catch (error) {
      clearSession(
        error instanceof Error ? error.message : 'Could not verify your account.',
      );
      return;
    }

    showWorkspace(user);
    try {
      await loadDashboard();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not load the workspace.',
        'error',
      );
    }
  });

  elements.createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = elements.createForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    elements.createError.hidden = true;
    const formData = new FormData(elements.createForm);
    try {
      const ticket = await api('/tickets', {
        method: 'POST',
        body: {
          title: formData.get('title'),
          description: formData.get('description'),
        },
      });
      elements.createDialog.close();
      elements.createForm.reset();
      state.page = 1;
      await loadDashboard();
      showToast(
        ticket.isFallback
          ? 'Ticket created using safe fallback classification.'
          : 'Ticket created and classified.',
      );
      await openTicket(ticket.id);
    } catch (error) {
      elements.createError.textContent =
        error instanceof Error ? error.message : 'Could not create ticket.';
      elements.createError.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });

  elements.ticketDialog.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const formData = new FormData(form);

    if (form.id === 'assign-form') {
      run(() =>
        submitMutation(
          form,
          (ticketId) => `/tickets/${encodeURIComponent(ticketId)}/assignee`,
          { agentId: formData.get('agentId') || null },
          'Assignment updated.',
        ),
      );
    } else if (form.id === 'status-form') {
      run(() =>
        submitMutation(
          form,
          (ticketId) => `/tickets/${encodeURIComponent(ticketId)}/status`,
          { status: formData.get('status') },
          'Ticket status updated.',
        ),
      );
    } else if (form.id === 'category-form') {
      run(() =>
        submitMutation(
          form,
          (ticketId) => `/tickets/${encodeURIComponent(ticketId)}/category`,
          {
            category: formData.get('category'),
            reason: formData.get('reason'),
          },
          'Category correction saved.',
        ),
      );
    }
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const closeButton = event.target.closest('[data-close-dialog]');
    if (closeButton) {
      document.getElementById(closeButton.dataset.closeDialog)?.close();
      return;
    }
    const ticketButton = event.target.closest('[data-open-ticket]');
    if (ticketButton) {
      run(() => openTicket(ticketButton.dataset.openTicket));
    }
  });

  document.getElementById('new-ticket-button').addEventListener('click', () => {
    elements.createError.hidden = true;
    elements.createDialog.showModal();
  });

  document.getElementById('refresh-button').addEventListener('click', () => {
    run(loadDashboard);
  });

  document.getElementById('logout-button').addEventListener('click', () => {
    clearSession();
  });

  document.getElementById('filter-form').addEventListener('change', (event) => {
    if (event.target.id === 'filter-search') return;
    state.page = 1;
    run(loadDashboard);
  });

  document.getElementById('filter-search').addEventListener('input', () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.page = 1;
      run(loadDashboard);
    }, 250);
  });

  document.getElementById('filter-form').addEventListener('reset', () => {
    window.setTimeout(() => {
      state.page = 1;
      run(loadDashboard);
    }, 0);
  });

  elements.previousPage.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    run(loadDashboard);
  });

  elements.nextPage.addEventListener('click', () => {
    if (state.page >= state.totalPages) return;
    state.page += 1;
    run(loadDashboard);
  });

  document.addEventListener('keydown', (event) => {
    if (
      event.key === '/' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !(event.target instanceof HTMLInputElement) &&
      !(event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      document.getElementById('filter-search').focus();
    }
  });

  async function initialize() {
    if (!state.token) return;
    try {
      const user = await api('/auth/me');
      showWorkspace(user);
      await loadDashboard();
    } catch (error) {
      if (state.token) {
        clearSession('Your session could not be restored. Please sign in again.');
      }
      if (error instanceof Error && !error.message.includes('401')) {
        showToast(error.message, 'error');
      }
    }
  }

  initialize();
})();
