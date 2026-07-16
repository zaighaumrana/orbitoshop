/* ═══════════════════════════════════════════════════════════════════
   RetailOS — workshop.js
   Roles served: Technician, Business Owner (when switching to workshop)
   Single attachEvents() architecture, router-driven navigation.
═══════════════════════════════════════════════════════════════════ */
import {
  leaveRequestHTML,
  submitLeaveRequest,
  handleClockOut,
} from '../admin/ems.js'

import {
  sb, state, CFG, loadConfig, applyBranding, currentTenant,
  _clearSession, money, fld, modalActions,
  openPinPrompt, pinPromptHTML, handlePpKey,
  myAccountModalHTML, handleChangePasswordSubmit,
  getSubInvoices, createSubInvoice, markComponentNotNeeded,
} from '../shared.js'

import { navigate } from '../router.js'

/* ── Workshop state ── */
const wsState = {
  filter:      '',
  statusFilter: 'all',  // 'all' | 'Pending' | 'In Progress' | 'Ready'
}

let SESSION        = {}
let _eventsAttached = false

/* ── Load ── */
async function load() {
  await loadConfig()
  const [tickets, repairComponents] = await Promise.all([
    sb.from('tickets')
      .select('*')
      .not('status', 'in', '("Delivered","Declined")')
      .order('created_at', { ascending: false }),
    sb.from('repair_components').select('*').order('sort_order'),
  ])
  state.data.tickets          = tickets.data          || []
  state.data.repairComponents = repairComponents.data || []
  applyBranding()
  render()
}

/* ── Render ── */
function render() {
  if (!SESSION.employee) { navigate('/login'); return }

  const tenant = currentTenant()
  const isAdmin = SESSION.isAdmin || state.role === 'Business Owner'
  const _modalScroll = document.querySelector('.modal')?.scrollTop || 0

  document.getElementById('app').innerHTML = `
    <div class="app-shell client-shell">
      <main class="main">
        <header class="topbar">
          <div class="brand top-brand">
            <div class="logo">
              ${tenant.logo
                ? `<img alt="" src="${tenant.logo}">`
                : tenant.name.slice(0,2).toUpperCase()}
            </div>
            <div>
              <strong>${tenant.name}</strong>
              <span class="muted" style="font-size:12px">
                ${state.role} · Workshop
              </span>
            </div>
          </div>
          <div class="top-actions">
            <span class="chip">
              <strong style="font-size:12px">${SESSION.employee.name}</strong>
            </span>
            <span class="chip">
              <i class="dot ${state.online ? '' : 'offline'}"></i>
              ${state.online ? 'Online' : 'Offline'}
            </span>
            ${isAdmin ? `
              <button class="secondary-button" data-action="go-pos">POS</button>
              <button class="secondary-button" data-action="go-admin">Admin</button>
            ` : ''}
            <button class="icon-button" data-action="my-account" title="My Account">👤</button>
            <button class="icon-button" data-action="theme">
              ${state.theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            ${CFG.ems_enabled && !isAdmin ? `
              <button class="secondary-button" style="font-size:12px"
                data-action="ems-clock-out">🕐 Clock Out</button>
            ` : ''}
            <button class="icon-button" data-action="logout"
              style="color:var(--danger)">Logout</button>
          </div>
        </header>
        <section class="content">${workshopView()}</section>
      </main>
    </div>
    ${renderModal()}`

  if (!_eventsAttached) {
    attachEvents()
    _eventsAttached = true
  }
  if (_modalScroll) {
    const m = document.querySelector('.modal')
    if (m) m.scrollTop = _modalScroll
  }
}

/* ── Workshop View ── */
function workshopView() {
  const search = wsState.filter.toLowerCase()
  const all    = state.data.tickets || []

  const filtered = all.filter(t => {
    const matchSearch = !search || (
      `${t.customer_name} ${t.customer_phone} ${t.ticket_number}
       ${t.invoice_number||''} ${t.device_brand} ${t.device_model} ${t.imei||''}`
        .toLowerCase().includes(search)
    )
    const matchStatus = wsState.statusFilter === 'all' || t.status === wsState.statusFilter
    return matchSearch && matchStatus
  })

  const counts = {
    Pending:     all.filter(t => t.status === 'Pending').length,
    'In Progress': all.filter(t => t.status === 'In Progress').length,
    Ready:       all.filter(t => t.status === 'Ready').length,
  }

  const statusColors = {
    'Pending':     'warn',
    'In Progress': 'warn',
    'Ready':       'good',
    'Delivered':   'good',
    'Declined':    'bad',
  }

  return `
    <div style="display:grid;gap:16px;padding:16px">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;
                  align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <h1 style="margin:0;font-size:20px">Workshop — Repair Queue</h1>
          <p class="muted" style="font-size:13px;margin:4px 0 0">
            ${filtered.length} ticket${filtered.length !== 1 ? 's' : ''}
            · ${new Date().toLocaleDateString()}
          </p>
        </div>
        <!-- Status count badges -->
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Object.entries(counts).map(([s, n]) => `
            <button class="${wsState.statusFilter === s
              ? 'primary-button' : 'secondary-button'}"
              style="font-size:12px;padding:5px 12px"
              data-status-filter="${s}">
              ${s}: ${n}
            </button>`).join('')}
          <button class="${wsState.statusFilter === 'all'
            ? 'primary-button' : 'secondary-button'}"
            style="font-size:12px;padding:5px 12px"
            data-status-filter="all">
            All: ${all.length}
          </button>
        </div>
      </div>

      <!-- Search -->
      <input class="search" placeholder="Search name, phone, device, IMEI, ticket #…"
        data-ws-filter value="${wsState.filter}"
        style="font-size:14px;padding:10px 14px">

      <!-- Ticket Cards -->
      ${filtered.length ? filtered.map(t => `
        <div class="card" style="display:grid;gap:12px">

          <!-- Top row: customer + status -->
          <div style="display:flex;justify-content:space-between;
                      align-items:start;gap:12px">
            <div style="display:grid;gap:3px">
              <strong style="font-size:16px">${t.customer_name}</strong>
              <span class="muted" style="font-size:12px">
                ${t.invoice_number || t.ticket_number}
                ${t.customer_phone ? '· ' + t.customer_phone : ''}
              </span>
            </div>
            <span class="badge ${statusColors[t.status] || 'warn'}"
              style="flex-shrink:0;font-size:12px">${t.status}</span>
          </div>

          <!-- Device info -->
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px">
            <span>📱 <strong>${t.device_brand} ${t.device_model}</strong></span>
            ${t.imei ? `<span class="muted">IMEI: ${t.imei}</span>` : ''}
          </div>

          <!-- Components -->
          ${(t.components_noted||[]).length ? `
            <div style="display:grid;gap:6px">
              ${t.components_noted.map(c => `
                <div style="display:flex;justify-content:space-between;
                            align-items:center;padding:7px 10px;
                            background:var(--surface-2);border-radius:8px;font-size:13px">
                  <span>
                    <strong>${c.name}</strong>
                    <span class="badge warn" style="font-size:11px;margin-left:6px">
                      ${c.tag || c.condition || ''}
                    </span>
                    ${c.customText ? `<span class="muted" style="font-size:12px"> — ${c.customText}</span>` : ''}
                  </span>
                  <span style="color:var(--muted)">
                    ${Number(c.price||0) > 0 ? money(c.price) : 'Not priced'}
                  </span>
                </div>`).join('')}
            </div>` : `
            <p class="muted" style="font-size:13px">No components logged yet.</p>`}

          <!-- Labour + Quote -->
          <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px">
            ${Number(t.labour_cost||0) > 0 ? `
              <span>Labour: <strong>${money(t.labour_cost)}</strong></span>` : ''}
            ${Number(t.final_total||t.estimated_quote||0) > 0 ? `
              <span>Quote: <strong>${money(t.final_total || t.estimated_quote)}</strong></span>` : ''}
            ${Number(t.amount_paid||0) > 0 ? `
              <span style="color:var(--success)">
                Paid: <strong>${money(t.amount_paid)}</strong>
              </span>` : ''}
            ${Number(t.balance_due||0) > 0 ? `
              <span style="color:var(--danger)">
                Balance: <strong>${money(t.balance_due)}</strong>
              </span>` : ''}
          </div>

          <!-- Technician note -->
          ${t.technician_note ? `
            <div style="background:color-mix(in srgb,var(--warning) 10%,var(--surface));
                        border-left:3px solid var(--warning);
                        padding:8px 12px;border-radius:0 8px 8px 0;font-size:13px">
              <strong>Note:</strong> ${t.technician_note}
            </div>` : ''}

          <!-- Action buttons -->
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${['Pending','In Progress','Ready'].map(s => s !== t.status ? `
              <button class="secondary-button" style="font-size:12px;padding:6px 12px"
                data-ws-status="${t.id}" data-ws-new-status="${s}">
                → ${s}
              </button>` : '').join('')}
            <button class="primary-button" style="font-size:12px;padding:6px 12px"
              data-action="edit-components" data-ticket-id="${t.id}">
              ✏️ Edit Components
            </button>
            ${(SESSION.isAdmin || state.role === 'Business Owner') ? `
              <button class="secondary-button" style="font-size:12px;padding:6px 12px"
                data-action="ws-collect" data-ticket-id="${t.id}">
                💳 Collect → POS
              </button>` : ''}
          </div>
        </div>`).join('') : `
        <div class="card" style="text-align:center;padding:48px;color:var(--muted)">
          <div style="font-size:48px;margin-bottom:12px">✅</div>
          <strong>All clear</strong>
          <p style="font-size:13px;margin:6px 0 0">
            ${wsState.filter || wsState.statusFilter !== 'all'
              ? 'No tickets match your search.'
              : 'No active repair tickets right now.'}
          </p>
        </div>`}
    </div>`
}

/* ═══════════════════════════════════════════════════════════════════
   MODALS
═══════════════════════════════════════════════════════════════════ */
function renderModal() {
  if (!state.modal) return ''
  const { type, id } = state.modal

  if (type === 'leave-request') return leaveRequestHTML()

  if (type === 'myAccount') return myAccountModalHTML(SESSION)

  if (type === 'pinPrompt') {
    return `<div class="modal-backdrop">${pinPromptHTML(state.modal.purpose)}</div>`
  }

  if (type === 'edit-components') {
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(id))
    if (!tk) return ''
    const comps      = tk.components_noted || []
    const partsTotal = comps.filter(c=>!c.removed).reduce((s,c) => s + Number(c.price||0), 0)
    const grandTotal = partsTotal + Number(tk.labour_cost||0)
    const subs       = state.modal.subInvoices || []
    const subsTotal  = subs.reduce((s,x) => s + Number(x.balance_due||0), 0)

    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
          <h2 style="margin-bottom:4px">${tk.customer_name}</h2>
          <p class="muted" style="font-size:13px;margin-bottom:16px">
            ${tk.invoice_number || tk.ticket_number}
            ${tk.invoice_number ? `<br><span style="font-size:11px">Ticket: ${tk.ticket_number}</span>` : ''}
            · ${tk.device_brand} ${tk.device_model}
          </p>

          <div style="display:grid;gap:8px;margin-bottom:14px">
            <strong style="font-size:13px">Original Issues (locked)</strong>
            ${comps.length ? comps.map((c,i) => `
              <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;
                          ${c.removed?'opacity:.55':''}">
                <div>
                  <span style="font-size:13px;${c.removed?'text-decoration:line-through':''}"><strong>${c.name}</strong></span>
                  <span class="badge warn" style="font-size:11px;margin-left:6px">${c.tag || ''}</span>
                  ${c.customText ? `<span class="muted" style="font-size:12px"> — ${c.customText}</span>` : ''}
                  ${c.removed ? `<br><span class="muted" style="font-size:11px">Not needed: ${c.removedReason||''}</span>` : ''}
                </div>
                <span style="font-size:13px;min-width:70px;text-align:right">${Number(c.price)>0?money(c.price):'—'}</span>
                ${!c.removed ? `<button type="button" class="secondary-button" style="font-size:11px;padding:4px 8px"
                  data-mark-not-needed="${i}">Not Needed</button>` : `<span></span>`}
              </div>`).join('') :
              `<p class="muted" style="font-size:13px">No components noted.</p>`}
          </div>

          <div style="display:flex;justify-content:space-between;padding:10px;background:var(--surface-2);
                      border-radius:8px;margin-bottom:8px;font-size:13px">
            <span>Labour Fee (locked)</span><span>${money(tk.labour_cost||0)}</span>
          </div>
          ${tk.technician_note ? `<p class="muted" style="font-size:12px;margin-bottom:12px">Note: ${tk.technician_note}</p>` : ''}

          <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;
                      background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:15px">
            <span>Original Total</span><span>${money(grandTotal)}</span>
          </div>

          ${subs.length ? `
            <div style="margin-bottom:14px">
              <strong style="font-size:13px">Sub-Invoices</strong>
              <div style="display:grid;gap:6px;margin-top:6px">
                ${subs.map(s => `
                  <div style="display:flex;justify-content:space-between;font-size:12px;
                              padding:8px 10px;background:var(--surface-2);border-radius:6px">
                    <span>${s.invoice_number}</span>
                    <span>${money(s.estimated_quote)} · Bal: ${money(s.balance_due)}</span>
                  </div>`).join('')}
              </div>
              <p class="muted" style="font-size:12px;margin-top:6px">Combined outstanding balance: ${money(subsTotal)}</p>
            </div>` : ''}

          <div class="modal-actions">
            <button class="secondary-button" data-close>Close</button>
            <button class="primary-button" data-action="open-create-sub-invoice" data-ticket-id="${tk.id}">
              + Create Sub-Invoice
            </button>
          </div>
        </div>
      </div>`
  }

  if (type === 'mark-not-needed') {
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(state.modal.ticketId))
    const c  = tk?.components_noted?.[state.modal.index]
    if (!tk || !c) return ''
    return `<div class="modal-backdrop" data-no-backdrop-close>
      <div class="modal" style="max-width:400px">
        <h2>Mark "${c.name}" Not Needed</h2>
        <p class="muted" style="font-size:13px">E.g. "Only needed cleaning, no repair required." This stays visible on the ticket, it's not deleted.</p>
        <label class="field"><span>Reason</span><textarea id="not-needed-reason" style="min-height:56px"></textarea></label>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button type="button" class="primary-button" data-action="confirm-not-needed">Confirm (PIN required)</button>
        </div>
      </div>
    </div>`
  }

  if (type === 'create-sub-invoice') {
    const parentId = state.modal.parentId
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(parentId))
    if (!tk) return ''
    const draft      = state.modal.draftComponents || []
    const labour     = state.modal.draftLabour ?? 0
    const compDefs   = state.data.repairComponents || []
    const partsTotal = draft.reduce((s,c) => s + Number(c.price||0), 0)
    const total      = partsTotal + labour

    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
          <h2 style="margin-bottom:4px">Create Sub-Invoice</h2>
          <p class="muted" style="font-size:13px;margin-bottom:16px">
            Linked to ${tk.invoice_number} — ${tk.customer_name}, ${tk.device_brand} ${tk.device_model}
          </p>

          <div style="display:grid;gap:8px;margin-bottom:14px">
            <strong style="font-size:13px">Additional Components</strong>
            ${draft.length ? draft.map((c,i) => `
              <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
                <div>
                  <span style="font-size:13px"><strong>${c.name}</strong></span>
                  <span class="badge warn" style="font-size:11px;margin-left:6px">${c.tag || ''}</span>
                  ${c.customText ? `<span class="muted" style="font-size:12px"> — ${c.customText}</span>` : ''}
                </div>
                <input type="number" step="any" min="0" value="${c.price || ''}" placeholder="Price"
                  data-draft-comp-price="${i}"
                  style="width:110px;border:1px solid var(--border);border-radius:6px;
                         padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
                <button type="button" data-draft-comp-remove="${i}"
                  style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer;padding:0 4px">×</button>
              </div>`).join('') : `<p class="muted" style="font-size:13px">No components added yet.</p>`}
          </div>

          <div style="margin-bottom:12px">
            <p class="muted" style="font-size:12px;margin-bottom:6px">Add component:</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
              ${compDefs.map(c => `<button type="button" class="secondary-button" style="font-size:12px;padding:5px 12px"
                data-add-draft-comp-name="${c.name}">${c.name}</button>`).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <input id="custom-comp-name" class="search" placeholder="Custom component name" style="flex:1">
              <button type="button" class="secondary-button" data-action="add-custom-draft-comp">+ Add</button>
            </div>
          </div>

          <label style="display:flex;justify-content:space-between;align-items:center;padding:10px;
                        background:var(--surface-2);border-radius:8px;margin-bottom:8px;gap:12px">
            <span style="font-size:13px;font-weight:500">Labour Charge</span>
            <input type="number" step="any" min="0" value="${labour || ''}" placeholder="0" data-draft-labour
              style="width:120px;border:1px solid var(--border);border-radius:6px;
                     padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
          </label>

          <label class="field" style="margin-bottom:12px">
            <span>Note</span>
            <textarea id="sub-invoice-note" style="min-height:56px" placeholder="What was found / done…"></textarea>
          </label>

          <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;
                      background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:15px">
            <span>Sub-Invoice Total</span><span id="draft-total">${money(total)}</span>
          </div>

          <div class="modal-actions">
            <button type="button" class="secondary-button" data-close>Cancel</button>
            <button type="button" class="primary-button" data-action="submit-sub-invoice" data-parent-id="${parentId}">
              Create & Print
            </button>
          </div>
        </div>
      </div>`
  }

  if (type === 'add-comp-tag') {
    const { compName } = state.modal
    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal" style="max-width:360px">
          <h2>${compName}</h2>
          <p class="muted" style="font-size:13px">What's the issue?</p>
          <div style="display:grid;gap:8px;margin-top:10px">
            <button type="button" class="secondary-button"
              style="font-size:15px;min-height:48px" data-tag-select="Broken">
              Broken
            </button>
            <button type="button" class="secondary-button"
              style="font-size:15px;min-height:48px" data-tag-select="Not Working">
              Not Working
            </button>
            <button type="button" class="secondary-button"
              style="font-size:15px;min-height:48px" data-tag-select="Custom">
              Custom…
            </button>
            <div id="custom-tag-wrap" class="hidden" style="display:grid;gap:8px">
              <input id="custom-tag-text" class="search"
                placeholder="Describe the issue">
              <button type="button" class="primary-button"
                data-action="confirm-custom-tag">
                Add
              </button>
            </div>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" data-close>Cancel</button>
          </div>
        </div>
      </div>`
  }

  return ''
}

/* ═══════════════════════════════════════════════════════════════════
   EVENTS — called exactly once
═══════════════════════════════════════════════════════════════════ */
function attachEvents() {
  const app = document.getElementById('app')

  /* ── Helpers to read the sub-invoice draft from the DOM ── */
  function readDraftCompsFromDOM() {
    const comps = [...(state.modal?.draftComponents || [])]
    document.querySelectorAll('[data-draft-comp-price]').forEach((inp, i) => {
      if (comps[i]) comps[i].price = Number(inp.value) || 0
    })
    return comps
  }

  function readDraftLabourFromDOM() {
    return Number(document.querySelector('[data-draft-labour]')?.value || 0)
  }

  function updateDraftTotal() {
    const prices = [...document.querySelectorAll('[data-draft-comp-price]')]
      .reduce((s, inp) => s + (Number(inp.value) || 0), 0)
    const labour = readDraftLabourFromDOM()
    const el = document.getElementById('draft-total')
    if (el) el.textContent = money(prices + labour)
  }

  /* ── Click ── */
  app.addEventListener('click', async e => {
    // Backdrop close
    if (
      e.target.classList.contains('modal-backdrop') &&
      !e.target.hasAttribute('data-no-backdrop-close')
    ) {
      state.modal = null; render(); return
    }

    const el = e.target.closest(
      'button,[data-close],[data-action],[data-ws-status],' +
      '[data-status-filter],[data-add-draft-comp-name],[data-tag-select],' +
      '[data-draft-comp-remove],[data-mark-not-needed],[data-pp-key]'
    )
    if (!el) return

    /* PIN numpad */
    if (el.dataset.ppKey !== undefined) {
      handlePpKey(el.dataset.ppKey, verifyAdminLocal, render); return
    }

    /* Close */
    if (el.dataset.close !== undefined) { state.modal = null; render(); return }

    /* Status filter tabs */
    if (el.dataset.statusFilter !== undefined) {
      wsState.statusFilter = el.dataset.statusFilter
      render(); return
    }

    /* Top-bar navigation */
    if (el.dataset.action === 'go-pos') {
      const { initPOS } = await import('./pos.js')
      initPOS(SESSION); return
    }
    if (el.dataset.action === 'go-admin') {
      const { initAdmin } = await import('../admin/admin.js')
      initAdmin(SESSION, 'dashboard', {}); return
    }
    if (el.dataset.action === 'install' && state.installPrompt) {
      state.installPrompt.prompt(); state.installPrompt = null; render(); return
    }
    if (el.dataset.action === 'my-account') {
      state.modal = { type: 'myAccount' }; render(); return
    }
    if (el.dataset.action === 'theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('retailos-theme', state.theme)
      applyBranding(); render(); return
    }
    if (el.dataset.action === 'logout') {
      if (!confirm('Log out?')) return
      _clearSession(); navigate('/login'); return
    }
    if (el.dataset.action === 'ems-clock-out') {
      const { handleClockOut } = await import('../admin/ems.js')
      handleClockOut(SESSION, async () => {
        if (!confirm('Clocked out. Log out now?')) return
        _clearSession(); navigate('/login')
      })
      return
    }

    if (el.dataset.action === 'open-leave-request') {
      state.modal = { type: 'leave-request' }; render(); return
    }

    /* Change ticket status */
    if (el.dataset.wsStatus) {
      const ticketId = el.dataset.wsStatus
      const newStatus = el.dataset.wsNewStatus
      const { error } = await sb.from('tickets')
        .update({ status: newStatus })
        .eq('id', ticketId)
      if (error) { alert('Error: ' + error.message); return }
      const tk = state.data.tickets.find(t => String(t.id) === String(ticketId))
      if (tk) tk.status = newStatus
      render(); return
    }

    /* Open component editor (read-only view of the locked ticket) */
    if (el.dataset.action === 'edit-components') {
      const ticketId = el.dataset.ticketId
      state.modal = { type: 'edit-components', id: ticketId, subInvoices: [] }
      render()
      const subs = await getSubInvoices(ticketId)
      if (state.modal?.type === 'edit-components' && String(state.modal.id) === String(ticketId)) {
        state.modal.subInvoices = subs
        render()
      }
      return
    }

    /* Collect → POS (admin/owner only) */
    if (el.dataset.action === 'ws-collect') {
      const ticketId = el.dataset.ticketId
      sessionStorage.setItem('retailos_collect_ticket', String(ticketId))
      const { initPOS } = await import('./pos.js')
      initPOS(SESSION); return
    }

    /* Mark a component "not needed" — requires PIN, never deletes */
    if (el.dataset.markNotNeeded !== undefined) {
      const ticketId = state.modal?.id
      state.modal = { type: 'mark-not-needed', ticketId, index: Number(el.dataset.markNotNeeded) }
      render(); return
    }
    if (el.dataset.action === 'confirm-not-needed') {
      const reason = document.getElementById('not-needed-reason')?.value?.trim()
      if (!reason) { alert('Enter a reason.'); return }
      const { ticketId, index } = state.modal
      openPinPrompt('remove-component', async (verified) => {
        if (!verified) return
        const tk = state.data.tickets.find(t => String(t.id) === String(ticketId))
        if (!tk) return
        const res = await markComponentNotNeeded(ticketId, tk.components_noted||[], index, reason, SESSION.employee?.name)
        if (!res.ok) { alert('Error: ' + res.error); return }
        await load()
        const subs = await getSubInvoices(ticketId)
        state.modal = { type: 'edit-components', id: ticketId, subInvoices: subs }
        render()
      }, render)
      return
    }

    /* Open sub-invoice creation form */
    if (el.dataset.action === 'open-create-sub-invoice') {
      state.modal = { type: 'create-sub-invoice', parentId: el.dataset.ticketId, draftComponents: [], draftLabour: 0 }
      render(); return
    }

    /* Remove component from the sub-invoice draft */
    if (el.dataset.draftCompRemove !== undefined) {
      const parentId = state.modal?.parentId
      const comps = readDraftCompsFromDOM()
      comps.splice(Number(el.dataset.draftCompRemove), 1)
      state.modal = { type: 'create-sub-invoice', parentId, draftComponents: comps, draftLabour: readDraftLabourFromDOM() }
      render(); return
    }

    /* Add predefined component to the draft — opens tag picker */
    if (el.dataset.addDraftCompName) {
      state.modal = {
        type:     'add-comp-tag',
        compName: el.dataset.addDraftCompName,
        _parentId: state.modal?.parentId,
        _draftComponents: readDraftCompsFromDOM(),
        _draftLabour: readDraftLabourFromDOM(),
      }
      render(); return
    }

    /* Add custom component to the draft — opens tag picker */
    if (el.dataset.action === 'add-custom-draft-comp') {
      const name = document.getElementById('custom-comp-name')?.value?.trim()
      if (!name) { alert('Enter a component name.'); return }
      state.modal = {
        type:     'add-comp-tag',
        compName: name,
        _parentId: state.modal?.parentId,
        _draftComponents: readDraftCompsFromDOM(),
        _draftLabour: readDraftLabourFromDOM(),
      }
      render(); return
    }

    /* Tag selection — Broken / Not Working / Custom */
    if (el.dataset.tagSelect) {
      const tag = el.dataset.tagSelect
      if (tag === 'Custom') {
        const wrap = document.getElementById('custom-tag-wrap')
        if (wrap) wrap.classList.remove('hidden')
        return
      }
      _addComponentToDraft(state.modal.compName, tag, '')
      return
    }

    /* Confirm custom tag text */
    if (el.dataset.action === 'confirm-custom-tag') {
      const text = document.getElementById('custom-tag-text')?.value?.trim()
      if (!text) { alert('Describe the issue.'); return }
      _addComponentToDraft(state.modal.compName, 'Custom', text)
      return
    }

    /* Create the sub-invoice — no PIN required, adding only increases what's owed */
    if (el.dataset.action === 'submit-sub-invoice') {
      const parentId = el.dataset.parentId
      const tk = state.data.tickets.find(t => String(t.id) === String(parentId))
      if (!tk) return
      const comps  = readDraftCompsFromDOM()
      const labour = readDraftLabourFromDOM()
      const note   = document.getElementById('sub-invoice-note')?.value || ''
      if (!comps.length && !labour) { alert('Add at least one component or a labour charge.'); return }

      const res = await createSubInvoice(tk, comps, labour, note, SESSION.employee?.name)
      if (!res.ok) { alert('Error: ' + res.error); return }

      const { buildSubInvoiceSlip, printThermal } = await import('../print/print.js')
      printThermal(buildSubInvoiceSlip(res.data, tk))

      state.modal = null
      await load(); return
    }
  })

  /* ── Submit ── */
  app.addEventListener('submit', async e => {
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    if (form.dataset.form === 'leave-request') {
      const result = await submitLeaveRequest(SESSION, data)
      if (!result.ok) { alert('Error: ' + result.error); return }
      state.modal = null
      alert('Leave request submitted. Your manager will review it.')
      render(); return
    }
    if (form.dataset.form === 'change-password') {
      const result = await handleChangePasswordSubmit(SESSION, data)
      const errEl = document.getElementById('change-password-error')
      if (!result.ok) {
        if (errEl) { errEl.textContent = result.error; errEl.classList.remove('hidden') }
        return
      }
      state.modal = null
      alert('Password updated.')
      render(); return
    }
  })
  
  /* ── Input — live total update ── */
  app.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.wsFilter !== undefined) {
      wsState.filter = t.value; render(); return
    }
    if (t.dataset.draftCompPrice !== undefined || t.dataset.draftLabour !== undefined) {
      updateDraftTotal()
    }
  })

  /* ── Keyboard ── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const map = {
        'custom-comp-name': 'add-custom-draft-comp',
        'custom-tag-text':  'confirm-custom-tag',
      }
      const action = map[e.target.id]
      if (action) { e.preventDefault(); document.querySelector(`[data-action="${action}"]`)?.click(); return }
    }
    if (document.getElementById('pp-display')) {
      if (e.key === 'Enter')     { e.preventDefault(); handlePpKey('✓', verifyAdminLocal, render); return }
      if (e.key === 'Backspace') { e.preventDefault(); handlePpKey('⌫', verifyAdminLocal, render); return }
      if (e.key === 'Escape')    { e.preventDefault(); state.modal = null; render(); return }
      if (/^[0-9]$/.test(e.key)){ e.preventDefault(); handlePpKey(e.key, verifyAdminLocal, render); return }
    }
    if (e.key === 'Escape' && state.modal) {
      state.modal = null; render()
    }
  })
}

/* ── Helper: add a tagged component to the sub-invoice draft, then re-open the form ── */
function _addComponentToDraft(name, tag, customText) {
  const parentId = state.modal._parentId
  const draftComponents = [
    ...(state.modal._draftComponents || []),
    { name, tag, customText, price: 0 },
  ]
  state.modal = { type: 'create-sub-invoice', parentId, draftComponents, draftLabour: state.modal._draftLabour || 0 }
  render()
}

async function verifyAdminLocal(pin) {
  return String(pin) === String(CFG.override_pin)
    ? { ok: true } : { ok: false }
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC ENTRY POINT
═══════════════════════════════════════════════════════════════════ */
export async function initWorkshop(sess) {
  SESSION          = sess
  state.role       = sess.isAdmin ? 'Business Owner' : (sess.employee?.role || 'Technician')
  wsState.filter   = ''
  wsState.statusFilter = 'all'
  await load()
}