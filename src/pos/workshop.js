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
            <button class="icon-button" data-action="theme">
              ${state.theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            ${CFG.ems_enabled && !isAdmin ? `
              <button class="secondary-button" style="font-size:12px"
                data-action="open-leave-request">📋 Leave</button>
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

  if (type === 'pinPrompt') {
    return `<div class="modal-backdrop">${pinPromptHTML(state.modal.purpose)}</div>`
  }

  if (type === 'edit-components') {
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(id))
    if (!tk) return ''
    const comps      = tk.components_noted || []
    const compDefs   = state.data.repairComponents || []
    const partsTotal = comps.reduce((s,c) => s + Number(c.price||0), 0)
    const labourVal  = state.modal._labour ?? Number(tk.labour_cost || 0)
    const grandTotal = partsTotal + labourVal

    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal" style="max-width:560px;max-height:90vh;overflow-y:auto">
          <h2 style="margin-bottom:4px">${tk.customer_name}</h2>
          <p class="muted" style="font-size:13px;margin-bottom:16px">
            ${tk.invoice_number || tk.ticket_number}
            · ${tk.device_brand} ${tk.device_model}
          </p>

          <!-- Existing components -->
          <div style="display:grid;gap:8px;margin-bottom:14px">
            <strong style="font-size:13px">Components</strong>
            ${comps.length ? comps.map((c,i) => `
              <div style="display:grid;grid-template-columns:1fr auto auto;
                          gap:8px;align-items:center">
                <div>
                  <span style="font-size:13px"><strong>${c.name}</strong></span>
                  <span class="badge warn" style="font-size:11px;margin-left:6px">
                    ${c.tag || c.condition || ''}
                  </span>
                  ${c.customText
                    ? `<span class="muted" style="font-size:12px"> — ${c.customText}</span>`
                    : ''}
                </div>
                <input type="number" step="any" min="0"
                  value="${c.price || ''}" placeholder="Price"
                  data-comp-price="${i}"
                  style="width:110px;border:1px solid var(--border);border-radius:6px;
                         padding:6px 8px;background:var(--surface);
                         color:var(--text);font-size:13px">
                <button type="button" data-comp-remove="${i}"
                  style="color:var(--danger);background:none;border:none;
                         font-size:18px;cursor:pointer;padding:0 4px">×</button>
              </div>`).join('') :
              `<p class="muted" style="font-size:13px">No components yet.</p>`}
          </div>

          <!-- Add from predefined list -->
          <div style="margin-bottom:12px">
            <p class="muted" style="font-size:12px;margin-bottom:6px">Add component:</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
              ${compDefs.map(c => `
                <button type="button" class="secondary-button"
                  style="font-size:12px;padding:5px 12px"
                  data-add-comp-name="${c.name}">
                  ${c.name}
                </button>`).join('')}
            </div>
            <!-- Custom component -->
            <div style="display:flex;gap:8px">
              <input id="custom-comp-name" class="search"
                placeholder="Custom component name" style="flex:1">
              <button type="button" class="secondary-button"
                data-action="add-custom-comp">+ Add</button>
            </div>
          </div>

          <!-- Labour -->
          <label style="display:flex;justify-content:space-between;align-items:center;
                        padding:10px;background:var(--surface-2);border-radius:8px;
                        margin-bottom:8px;gap:12px">
            <span style="font-size:13px;font-weight:500">Labour Charge</span>
            <input type="number" step="any" min="0" id="ws-labour"
              value="${labourVal || ''}" placeholder="0"
              data-ws-labour
              style="width:120px;border:1px solid var(--border);border-radius:6px;
                     padding:6px 8px;background:var(--surface);
                     color:var(--text);font-size:13px">
          </label>

          <!-- Technician note -->
          <label class="field" style="margin-bottom:12px">
            <span>Technician Note</span>
            <textarea id="ws-tech-note" style="min-height:56px"
              placeholder="Note for the customer or next technician…">${tk.technician_note || ''}</textarea>
          </label>

          <!-- Live total -->
          <div style="display:flex;justify-content:space-between;font-weight:600;
                      padding:10px;background:var(--surface-2);border-radius:8px;
                      margin-bottom:16px;font-size:15px">
            <span>Updated Quote</span>
            <span id="ws-total">${money(grandTotal)}</span>
          </div>

          <div class="modal-actions">
            <button class="secondary-button" data-close>Cancel</button>
            <button class="primary-button" data-action="save-components"
              data-ticket-id="${tk.id}">
              Save to Ticket
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

  /* ── Helpers to read current editor state ── */
  function readCompsFromDOM(ticket) {
    const comps = [...(ticket.components_noted || [])]
    document.querySelectorAll('[data-comp-price]').forEach((inp, i) => {
      if (comps[i]) comps[i].price = Number(inp.value) || 0
    })
    return comps
  }

  function readLabourFromDOM() {
    return Number(document.getElementById('ws-labour')?.value || 0)
  }

  function updateWsTotal() {
    const prices = [...document.querySelectorAll('[data-comp-price]')]
      .reduce((s, inp) => s + (Number(inp.value) || 0), 0)
    const labour = readLabourFromDOM()
    const el = document.getElementById('ws-total')
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
      '[data-status-filter],[data-add-comp-name],[data-tag-select],' +
      '[data-comp-remove],[data-pp-key]'
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

    /* Open component editor */
    if (el.dataset.action === 'edit-components') {
      state.modal = { type: 'edit-components', id: el.dataset.ticketId, _labour: null }
      render(); return
    }

    /* Collect → POS (admin/owner only) */
    if (el.dataset.action === 'ws-collect') {
      const ticketId = el.dataset.ticketId
      sessionStorage.setItem('retailos_collect_ticket', String(ticketId))
      const { initPOS } = await import('./pos.js')
      initPOS(SESSION); return
    }

    /* Remove component from editor */
    if (el.dataset.compRemove !== undefined) {
      const tk = state.data.tickets.find(t => String(t.id) === String(state.modal?.id))
      if (!tk) return
      const comps = readCompsFromDOM(tk)
      comps.splice(Number(el.dataset.compRemove), 1)
      tk.components_noted = comps
      state.modal._labour = readLabourFromDOM()
      render(); return
    }

    /* Add predefined component — opens tag picker */
    if (el.dataset.addCompName) {
      state.modal = {
        type:     'add-comp-tag',
        compName: el.dataset.addCompName,
        _ticketId: state.modal?.id,
        _labour:   readLabourFromDOM(),
      }
      render(); return
    }

    /* Add custom component — opens tag picker */
    if (el.dataset.action === 'add-custom-comp') {
      const name = document.getElementById('custom-comp-name')?.value?.trim()
      if (!name) { alert('Enter a component name.'); return }
      state.modal = {
        type:     'add-comp-tag',
        compName: name,
        _ticketId: state.modal?.id,
        _labour:   readLabourFromDOM(),
        _custom:   true,
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
      _addComponentToTicket(state.modal._ticketId, state.modal.compName, tag, '')
      return
    }

    /* Confirm custom tag text */
    if (el.dataset.action === 'confirm-custom-tag') {
      const text = document.getElementById('custom-tag-text')?.value?.trim()
      if (!text) { alert('Describe the issue.'); return }
      _addComponentToTicket(state.modal._ticketId, state.modal.compName, 'Custom', text)
      return
    }

    /* Save components to ticket */
    if (el.dataset.action === 'save-components') {
      const ticketId = el.dataset.ticketId
      const tk       = state.data.tickets.find(t => String(t.id) === String(ticketId))
      if (!tk) return

      const comps      = readCompsFromDOM(tk)
      const labour     = readLabourFromDOM()
      const techNote   = document.getElementById('ws-tech-note')?.value || ''
      const partsTotal = comps.reduce((s,c) => s + Number(c.price||0), 0)
      const newQuote   = partsTotal + labour

      const { error } = await sb.from('tickets').update({
        components_noted: comps,
        labour_cost:      labour,
        technician_note:  techNote,
        estimated_quote:  newQuote,
        // Update final_total only if ticket is not yet locked
        ...(!tk.is_locked ? { final_total: newQuote } : {}),
      }).eq('id', ticketId)

      if (error) { alert('Save failed: ' + error.message); return }

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
  })
  
  /* ── Input — live total update ── */
  app.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.wsFilter !== undefined) {
      wsState.filter = t.value; render(); return
    }
    if (t.dataset.compPrice !== undefined || t.dataset.wsLabour !== undefined) {
      updateWsTotal()
    }
  })

  /* ── Keyboard ── */
  document.addEventListener('keydown', e => {
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

/* ── Helper: add a tagged component back to the ticket in memory then re-open editor ── */
function _addComponentToTicket(ticketId, name, tag, customText) {
  const savedLabour = state.modal._labour
  const tk = state.data.tickets.find(t => String(t.id) === String(ticketId))
  if (!tk) { state.modal = null; render(); return }
  tk.components_noted = [
    ...(tk.components_noted || []),
    { name, tag, condition: tag, customText, price: 0 },
  ]
  state.modal = { type: 'edit-components', id: ticketId, _labour: savedLabour }
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
  _eventsAttached  = false
  wsState.filter   = ''
  wsState.statusFilter = 'all'
  await load()
}