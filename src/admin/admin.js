import {
  sb, state, CFG, loadConfig, applyBranding, currentTenant,
  _loadSession, _saveSession, _clearSession,
  can, ACCESS, verifyLogin, validatePassword,
  money, fld, modalActions, statusBadge,
  openPinPrompt, pinPromptHTML, handlePpKey,
  logBillEvent,
  myAccountModalHTML, handleChangePasswordSubmit,
  generateTempPassword, listPendingResetRequests, resolvePasswordReset,
  matchesInvoiceSearch,
  getSubInvoices, createSubInvoice, markComponentNotNeeded,
} from '../shared.js'


const ADMIN_MODULES = [
  ['dashboard', '▦', 'Dashboard'],
  ['repairs',   '◈', 'Repair Tickets'],
  ['inventory', '▤', 'Inventory'],
  ['catalog',   '▥', 'Catalog'],
  ['reports',   '▧', 'Reports'],
  ['employees', '♙', 'Employees'],
  ['receipts',  '◉', 'Receipts'],
  ['ems',       '⏱', 'EMS'],
  ['settings',  '◐', 'Settings'],
]

const adminState = {
  adminModule:      'dashboard',
  settingsTab:      'branding',
  catalogTab:       'quickitems',
  receiptsExpanded: null,
  filter:           '',
  receiptDateFrom:  '',
  receiptDateTo:    '',
  receiptSearch:    '',
  receiptModalIdx:  null,
}

let SESSION = {}
let _inv = null  // populated via dynamic import only when inventory_module_enabled

/* ── Load ── */
async function load() {
  await loadConfig()
  if (CFG.inventory_module_enabled && !_inv) {
    _inv = await import('../inventory.js')
  }
  const fetchInv = CFG.inventory_module_enabled
    ? sb.from('inventory').select('*').order('name')
    : Promise.resolve({ data: [] })

  const [tickets, sales, employees, udhar, returns_, inv, quickItems, repairComponents] = await Promise.all([
    sb.from('tickets').select('*').order('id', { ascending: false }),
    sb.from('sales').select('*').order('id', { ascending: false }),
    sb.from('employees').select('id, name, role, status, email').order('name'),
    sb.from('udhar').select('*').order('id', { ascending: false }),
    sb.from('returns').select('*').order('id', { ascending: false }),
    fetchInv,
    sb.from('quick_items').select('*').order('sort_order'),
    sb.from('repair_components').select('*').order('sort_order'),
  ])
  state.data = {
    tickets:          tickets.data          || [],
    sales:            sales.data            || [],
    employees:        employees.data        || [],
    udhar:            udhar.data            || [],
    returns:          returns_.data         || [],
    inventory:        inv.data              || [],
    quickItems:       quickItems.data       || [],
    repairComponents: repairComponents.data || [],
  }
  applyBranding()

  if (adminState.adminModule === 'ems') {
    const { loadEMSData, emsView, attachEMSEvents } = await import('./ems.js')
    const emsData = await loadEMSData()
    adminState._emsData = emsData
    adminState._emsHTML = emsView(emsData, SESSION)
    render()
    const app = document.getElementById('app')
    attachEMSEvents(app, () => adminState._emsData, async () => {
      const fresh = await loadEMSData()
      adminState._emsData = fresh
      adminState._emsHTML = emsView(fresh, SESSION)
      render()
    }, SESSION)
    return
  }

  render()
}

/* ── Render ── */
let _eventsAttached = false

function render() {
  const tenant = currentTenant()
  if (!can(adminState.adminModule, state.role)) adminState.adminModule = 'dashboard'
  const _modalScroll = document.querySelector('.modal')?.scrollTop || 0
  const _activeEl   = document.activeElement
  const _focusAttr  = _activeEl?.hasAttribute('data-receipt-search') ? 'data-receipt-search' : null
  const _cursorPos  = _focusAttr ? _activeEl.selectionStart : null

  document.getElementById('app').innerHTML = `
    <div class="app-shell client-shell">
      <main class="main">
        <header class="topbar">
          <div class="brand top-brand">
            <div class="logo">${tenant.logo ? `<img alt="" src="${tenant.logo}">` : tenant.name.slice(0,2).toUpperCase()}</div>
            <div>
              <strong>${tenant.name}</strong>
              <span class="muted" style="font-size:12px">${state.role} · Back Office</span>
            </div>
          </div>
          <div class="top-actions">
            <select class="tenant-switcher compact-select" data-action="admin-module">
              ${ADMIN_MODULES.filter(([k]) => can(k, state.role))
                .map(([k,,l]) => `<option value="${k}" ${k === adminState.adminModule ? 'selected' : ''}>${l}</option>`)
                .join('')}
            </select>
            <span class="chip">
              <strong style="font-size:12px">${SESSION.employee.name}</strong>
              <span class="muted" style="font-size:11px"> · ${state.role}</span>
            </span>
            <span class="chip">
              <i class="dot ${state.online ? '' : 'offline'}"></i>
              ${state.online ? 'Online' : 'Offline'}
            </span>
            ${(SESSION.isAdmin || state.role === 'Business Owner') ? `
              <button class="secondary-button" data-action="go-pos">POS</button>
              ${CFG.technician_module_enabled
                ? `<button class="secondary-button" data-action="go-workshop">Workshop</button>`
                : ''}
            ` : ''}
            <button class="icon-button" data-action="my-account" title="My Account">👤</button>
            <button class="icon-button" data-action="theme">
              ${state.theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button class="icon-button" data-action="logout" style="color:var(--danger)">Logout</button>
          </div>
        </header>
        <section class="content">${pageContent()}</section>
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
  if (_focusAttr) {
    const el = document.querySelector(`[${_focusAttr}]`)
    if (el) { el.focus(); if (_cursorPos != null) el.setSelectionRange(_cursorPos, _cursorPos) }
  }
}

function pageContent() {
  const pages = { dashboard, repairs, inventory, catalog, reports, employees, receipts, settings }
  if (adminState.adminModule === 'ems') {
    return adminShell(adminState._emsHTML || '<div class="empty">Loading EMS…</div>')
  }
  return adminShell((pages[adminState.adminModule] || dashboard)())
}

function adminShell(content) {
  const tenant   = currentTenant()
  const modLabel = ADMIN_MODULES.find(([k]) => k === adminState.adminModule)?.[2] || ''
  return `
    <div class="admin-header">
      <div><h1>${modLabel}</h1><p class="muted">${tenant.name}</p></div>
    </div>
    ${content}`
}

const tit = (h, sub, action) =>
  `<div class="page-title"><div><h1>${h}</h1><p class="muted">${sub}</p></div><div>${action}</div></div>`
const tlb = (ph) =>
  `<div class="toolbar"><div class="toolbar-left"><input class="search" data-filter value="${adminState.filter}" placeholder="${ph}"></div></div>`

/* ═══════════════ PAGES ═══════════════ */
function dashboard() {
  const sales    = state.data.sales    || []
  const tickets  = state.data.tickets  || []
  const udhar    = state.data.udhar    || []
  const today    = new Date().toISOString().slice(0,10)
  const todayS   = sales.filter(s => (s.created_at||'').slice(0,10) === today)
  const total    = sales.reduce((s,x) => s + Number(x.total_bill||0), 0)
  const todayRev = todayS.reduce((s,x) => s + Number(x.total_bill||0), 0)
  const pending  = tickets.filter(t => !['Delivered','Declined'].includes(t.status)).length
  const udharBal = udhar.filter(u => u.status !== 'Settled').reduce((s,u) => s + Number(u.balance_due||0), 0)
  const kpis = [
    ["Today's Revenue", todayRev,  'receipts'],
    ['Total Revenue',   total,     'receipts'],
    ['Total Sales',     sales.length, 'receipts'],
    ['Open Tickets',    pending,   'repairs'],
    ['Udhar Balance',   udharBal,  'udharList'],
    ['Employees',       (state.data.employees||[]).length, 'employees'],
  ]
  return `
    ${tit('Dashboard','Live overview of sales, tickets, and operations.',
      `<button class="primary-button" data-action="go-pos">Go to POS</button>`)}
    <div class="grid kpi-grid">
      ${kpis.map(([l,v,target]) => `
        <div class="card kpi" style="cursor:pointer" data-kpi-target="${target}">
          <span class="label">${l}</span>
          <span class="value">${typeof v === 'number' && !['Total Sales','Open Tickets','Employees'].includes(l)
            ? money(v) : v}</span>
        </div>`).join('')}
    </div>
    <div class="grid two-col">
      <div class="card">
        <h2>Recent Sales</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Invoice</th><th>Customer</th><th>Payment</th><th>Total</th></tr></thead>
          <tbody>
            ${sales.slice(0,8).map(s => `<tr>
              <td>${s.invoice_number||`INV-${s.id}`}</td>
              <td>${s.customer_name||'Walk-in'}</td>
              <td>${s.payment_method}</td>
              <td>${money(s.total_bill)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>Operational Alerts</h2>
        <div class="list">
          <div class="list-row"><span>Pending Repairs</span><strong>${pending}</strong></div>
          <div class="list-row"><span>Outstanding Udhar</span><strong>${(state.data.udhar||[]).filter(u=>u.status!=='Settled').length}</strong></div>
          <div class="list-row"><span>Today's Transactions</span><strong>${todayS.length}</strong></div>
          <div class="list-row"><span>Active Employees</span><strong>${(state.data.employees||[]).filter(e=>e.status==='Active').length}</strong></div>
        </div>
      </div>
    </div>`
}

function repairs() {
  const rows = (state.data.tickets||[]).filter(t =>
    (`${t.customer_name} ${t.ticket_number} ${t.device_model} ${t.device_brand} ${t.status} ${t.customer_phone}`)
      .toLowerCase().includes(adminState.filter.toLowerCase()))
  const sc = {'Pending':'warn','In Progress':'warn','Ready':'good','Delivered':'good','Declined':'bad'}
  return `
    ${tit('Repair Tickets','Full repair queue.',`<button class="primary-button" data-action="go-pos" title="Create tickets from the POS counter">New Ticket (via POS)</button>`)}
    ${tlb('Search by customer, device, ticket…')}
    <div class="grid two-col">
      <div class="card">
        <div class="table-wrap"><table>
          <thead><tr><th>Customer</th><th>Ticket</th><th>Device</th><th>Advance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `
              <tr style="cursor:pointer" data-view-ticket="${r.id}">
                <td><strong>${r.customer_name}</strong><br><small class="muted">${r.customer_phone}</small></td>
                <td><span style="color:var(--primary);font-size:12px">${r.ticket_number}</span></td>
                <td>${r.device_brand} ${r.device_model}</td>
                <td>${Number(r.advance_payment||0)>0 ? money(r.advance_payment) : '—'}</td>
                <td><span class="badge ${sc[r.status]||'warn'}">${r.status}</span></td>
                <td>
                <div style="display:flex;gap:6px;align-items:center">
                  <button class="secondary-button" style="font-size:12px;padding:4px 10px"
                    data-action="open-ticket-editor" data-ticket-id="${r.id}">Edit</button>
                  <button class="secondary-button" style="font-size:12px;padding:4px 10px"
                    data-action="admin-collect" data-ticket-id="${r.id}">Collect</button>
                </div>
              </td>
              </tr>`).join('') :
              `<tr><td colspan="6" style="text-align:center;color:var(--muted)">No tickets found.</td></tr>`}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>Status Summary</h2>
        <div class="list">
          ${['Pending','In Progress','Ready','Delivered','Declined'].map(s => `
            <div class="list-row"><span>${s}</span>
              <strong>${(state.data.tickets||[]).filter(t=>t.status===s).length}</strong>
            </div>`).join('')}
        </div>
      </div>
    </div>`
}

function inventory() {
  if (!CFG.inventory_module_enabled) return `<div class="card"><p class="muted">Inventory module is disabled. Enable it in Settings.</p></div>`
  if (!_inv) return `<div class="card"><p class="muted">Loading inventory module…</p></div>`
  return _inv.adminInventoryPage({ filter: adminState.filter, tit })
}

function reports() {
  const sales   = state.data.sales   || []
  const tickets = state.data.tickets || []
  const udhar   = state.data.udhar   || []
  const total   = sales.reduce((s,x) => s+Number(x.total_bill||0), 0)
  const disc    = sales.reduce((s,x) => s+Number(x.discount||0), 0)
  const labour  = sales.reduce((s,x) => s+Number(x.labour_cost||0), 0)
  const avg     = sales.length ? total/sales.length : 0
  const udharOut= udhar.filter(u=>u.status!=='Settled').reduce((s,u)=>s+Number(u.balance_due||0),0)
  return `
    ${tit('Reports','Sales analytics and outstanding credits.','')}
    <div class="grid kpi-grid">
      ${[['Total Revenue',total],['Discounts Given',disc],['Labour Income',labour],
         ['Avg Invoice',avg],['Udhar Outstanding',udharOut],['Total Invoices',sales.length]
        ].map(([l,v]) => `
        <div class="card kpi"><span class="label">${l}</span>
          <span class="value">${l==='Total Invoices'?v:money(v)}</span>
        </div>`).join('')}
    </div>
    <div class="grid two-col">
      <div class="card">
        <h2>Payment Breakdown</h2>
        <div class="list">
          ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer','Udhar'].map(m => {
            const c = sales.filter(s=>s.payment_method===m).length
            const r = sales.filter(s=>s.payment_method===m).reduce((s,x)=>s+Number(x.total_bill||0),0)
            return c ? `<div class="list-row"><span>${m} <small class="muted">(${c})</small></span><strong>${money(r)}</strong></div>` : ''
          }).join('')}
        </div>
      </div>
      <div class="card">
        <h2>Repair Summary</h2>
        <div class="list">
          ${['Pending','In Progress','Ready','Delivered','Declined'].map(s => `
            <div class="list-row"><span>${s}</span><strong>${tickets.filter(t=>t.status===s).length}</strong></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="card">
      <h2>Recent Invoices</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Invoice</th><th>Customer</th><th>Items</th><th>Payment</th><th>Total</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${sales.slice(0,15).map(s => `<tr>
            <td>${s.invoice_number||`INV-${s.id}`}</td>
            <td>${s.customer_name||'Walk-in'}</td>
            <td>${(s.items_sold||[]).length} item(s)</td>
            <td>${s.payment_method}</td>
            <td>${money(s.total_bill)}</td>
            <td>${new Date(s.created_at).toLocaleDateString()}</td>
            <td><button class="secondary-button" style="font-size:12px"
              data-action="reprint-receipt" data-sale-id="${s.id}">Reprint</button></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`
}

function employees() {
  const emps = state.data.employees || []
  return `
    ${tit('Employees','Staff roster, roles, and access control.',
      `<button class="secondary-button" data-action="open-password-resets">🔑 Password Resets</button>
       <button class="primary-button" data-modal="employee">Add Employee</button>`)}
    <div class="card">
      ${emps.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${emps.map(e => `<tr>
              <td><strong>${e.name}</strong></td>
              <td class="muted" style="font-size:12px">${e.email||'—'}</td>
              <td>${e.role}</td>
              <td><span class="badge ${e.status==='Active'?'good':'bad'}">${e.status}</span></td>
              <td style="display:flex;gap:6px">
                <button class="secondary-button" style="font-size:12px"
                  data-action="edit-employee"
                  data-emp-id="${e.id}" data-emp-name="${e.name}"
                  data-emp-role="${e.role}" data-emp-status="${e.status}"
                  data-emp-email="${e.email||''}">Edit</button>
                ${state.role === 'Business Owner' || SESSION.isAdmin ? `
                  <button class="secondary-button" style="font-size:12px;color:var(--danger)"
                    data-action="remove-employee"
                    data-emp-id="${e.id}" data-emp-name="${e.name}"
                    data-emp-can-delete="true">Remove</button>
                ` : `
                  <button class="secondary-button" style="font-size:12px;color:var(--warning)"
                    data-action="remove-employee"
                    data-emp-id="${e.id}" data-emp-name="${e.name}"
                    data-emp-can-delete="false">Deactivate</button>
                `}
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>` :
        `<div class="empty">No employees yet.</div>`}
    </div>`
}

function receipts() {
  const allSales = state.data.sales || []
  const dateFrom = adminState.receiptDateFrom || ''
  const dateTo   = adminState.receiptDateTo   || ''
  const search   = adminState.receiptSearch   || ''

  const filtered = allSales.filter(s => {
    const matchText = (`${s.customer_name||''} ${s.payment_method||''} ${s.employee_name||''}`)
      .toLowerCase().includes(search.toLowerCase())
    const matchInvoice = matchesInvoiceSearch(s.invoice_number||'', search, CFG.invoice_prefix) && search.trim() !== ''
    const sDate     = (s.created_at||'').slice(0,10)
    const matchFrom = !dateFrom || sDate >= dateFrom
    const matchTo   = !dateTo   || sDate <= dateTo
    return (matchText || matchInvoice) && matchFrom && matchTo
  })

  return `
    ${tit('Receipts Archive','Full log of all completed sales.','')}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;align-items:flex-end">
      <div style="flex:1;min-width:200px">
        <input class="search" data-receipt-search value="${search}"
          placeholder="Search by customer, payment…"
          style="width:100%">
      </div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)">
        From
        <input type="date" value="${dateFrom}" data-receipt-from
          style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;
                 background:var(--surface);color:var(--text);font-size:13px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)">
        To
        <input type="date" value="${dateTo}" data-receipt-to
          style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;
                 background:var(--surface);color:var(--text);font-size:13px">
      </label>
      <button class="secondary-button" data-action="clear-receipt-filter">Clear</button>
    </div>
    <p class="muted" style="font-size:13px;margin-bottom:8px">
      ${filtered.length} receipt${filtered.length !== 1 ? 's' : ''} found
    </p>
    <div class="card" style="display:grid;gap:0">
      ${filtered.length ? filtered.map((s, idx) => `
        <div style="border-bottom:1px solid var(--border);padding:12px 4px;
                    display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div style="cursor:pointer;flex:1;min-width:0"
            data-action="open-receipt-modal" data-receipt-idx="${idx}">
            <strong>${s.customer_name||'Walk-in'}</strong><br>
            <span class="muted" style="font-size:12px">
              ${s.invoice_number||`INV-${s.id}`} · ${s.payment_method} · ${s.employee_name||''}
            </span>
          </div>
          <div style="text-align:right;flex-shrink:0;display:flex;align-items:center;gap:10px">
            <div>
              <div><strong>${money(s.total_bill)}</strong></div>
              <span class="muted" style="font-size:11px">
                ${new Date(s.created_at).toLocaleDateString()}
                ${new Date(s.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
              </span>
            </div>
            <button class="secondary-button" style="font-size:12px;white-space:nowrap"
              data-action="reprint-receipt" data-sale-id="${s.id}">Reprint</button>
          </div>
        </div>`).join('') :
      `<div class="empty" style="padding:24px;text-align:center">No receipts found.</div>`}
    </div>`
}

function settings() {
  if (state.role !== 'Business Owner' && !SESSION.isAdmin)
    return `<div class="card"><p class="muted">Settings are available to Business Owner only.</p></div>`
  const t = currentTenant()
  const tabs = { branding:'Branding', contact:'Contact', receipt:'Receipt & Tax', staff:'Staff & Security' }
  return `
    ${tit('Business Settings','Branding, contact, receipt, staff.','')}
    <div class="settings-tabs">
      ${Object.entries(tabs).map(([k,l]) =>
        `<button class="settings-tab ${adminState.settingsTab===k?'active':''}" data-settings-tab="${k}">${l}</button>`
      ).join('')}
    </div>
    ${settingsTabContent()}`
}

function catalog() {
  if (state.role !== 'Business Owner' && !SESSION.isAdmin && state.role !== 'Manager')
    return `<div class="card"><p class="muted">Catalog is available to Managers and the Business Owner only.</p></div>`
  const tabs = { quickitems:'Quick Items', components:'Components' }
  return `
    ${tit('Catalog','Quick sale items and repair components.','')}
    <div class="settings-tabs">
      ${Object.entries(tabs).map(([k,l]) =>
        `<button class="settings-tab ${adminState.catalogTab===k?'active':''}" data-catalog-tab="${k}">${l}</button>`
      ).join('')}
    </div>
    ${catalogTabContent()}`
}

function catalogTabContent() {
  if (adminState.catalogTab === 'components') {
    const comps = state.data.repairComponents || []
    return `
      <div class="card" style="display:grid;gap:14px">
        <div><h2>Quick-Tap Components</h2></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${comps.map((c) => `
            <div style="display:flex;align-items:center;gap:6px;background:var(--surface-2);
                        border:1px solid var(--border);border-radius:8px;padding:6px 10px">
              <span style="font-size:13px">${c.name}</span>
              <button type="button" data-remove-quick="${c.id}"
                style="color:var(--danger);background:none;border:none;
                       font-size:16px;line-height:1;padding:0 2px;cursor:pointer">×</button>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <input id="new-comp-input" class="search" placeholder="New component name" style="flex:1">
          <button class="primary-button" data-action="add-quick-comp">Add</button>
        </div>
      </div>`
  }

  if (adminState.catalogTab === 'quickitems') {
    const items = state.data.quickItems || []
    return `
      <div class="card" style="display:grid;gap:16px">
        <div><h2>Quick Sale Items</h2></div>
        ${items.map((item,i) => `
          <div style="padding:12px;background:var(--surface-2);border-radius:8px;display:grid;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <strong>${item.name}</strong>
              <button type="button" data-remove-qitem="${i}"
                style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer">×</button>
            </div>
            <div style="font-size:13px;color:var(--muted)">
              Prices: ${(item.prices||[]).map((p,pi) => {
                const pv = (typeof p === 'object' && p !== null) ? p : { name:'', price:p }
                return `
                <span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px">
                  ${pv.name ? `<strong>${pv.name}</strong>:` : ''} ${money(pv.price)}
                  <button type="button" data-remove-qprice="${i}-${pi}"
                    style="color:var(--danger);background:none;border:none;font-size:14px;cursor:pointer;padding:0">×</button>
                </span>`
              }).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <input class="search" placeholder="Brand/Variant name (optional)" id="qvariant-name-${i}" style="flex:2;min-width:0">
              <input type="number" step="any" min="0" placeholder="Price" id="qprice-input-${i}"
                style="flex:1;min-width:0;border:1px solid var(--border);border-radius:6px;
                       padding:7px 9px;background:var(--surface);color:var(--text)">
              <button type="button" class="secondary-button" data-add-qprice="${i}">+ Add</button>
            </div>
          </div>`).join('')}
        <button class="primary-button" data-action="open-add-quick-item">+ Add Quick Item</button>
      </div>`
  }
}

function qiVariantRowHTML() {
  return `<div data-variant-row style="display:flex;gap:8px;margin-bottom:8px">
    <input class="search" name="variantName[]" placeholder="Brand/Variant name (optional)" style="flex:2;min-width:0">
    <input type="number" step="any" min="0" name="variantPrice[]" placeholder="Price" class="search" style="flex:1;min-width:0">
    <button type="button" class="secondary-button" data-action="remove-variant-row" style="color:var(--danger)">×</button>
  </div>`
}

function settingsTabContent() {
  const t = currentTenant()

  const platformFlags = `
    <div class="card" style="display:grid;gap:10px;padding:14px 16px;margin-bottom:4px">
      <p style="font-size:12px;font-weight:600;color:var(--muted);
                text-transform:uppercase;letter-spacing:.5px">
        Plan Features — Managed by RetailOS Platform
      </p>
      <div style="display:grid;gap:8px">
        ${[
          ['Repair Module',     CFG.repair_module_enabled],
          ['Inventory Module',  CFG.inventory_module_enabled],
          ['Technician Module', CFG.technician_module_enabled],
          ['Live Tracking',     CFG.live_tracking_enabled],
          ['EMS',               CFG.ems_enabled],
          ['Break Tracking',    CFG.ems_track_breaks],
        ].map(([label, enabled]) => `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px">${label}</span>
            <span class="badge ${enabled ? 'good' : 'bad'}">
              ${enabled ? 'Enabled' : 'Not enabled'}
            </span>
          </div>`).join('')}
      </div>
    </div>`

  if (adminState.settingsTab === 'branding') return platformFlags + `
    <form class="card form-grid" data-form="settings">
      ${fld('Business Name','name',t.name)}
      ${fld('Description','businessDescription',CFG.shop_description||'')}
      ${fld('Primary Color','primaryColor',t.primaryColor,'color')}
      ${fld('Secondary Color','secondaryColor',t.secondaryColor,'color')}
      <label class="field"><span>Logo Upload</span><input name="logo" type="file" accept="image/*"></label>
      <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save Branding</button></div>
    </form>`

  if (adminState.settingsTab === 'contact') return `
    <form class="card form-grid" data-form="settings">
      ${fld('Business Name','name',t.name)}
      ${fld('Address','address',t.address)}
      ${fld('Phone','phone',t.phone)}
      ${fld('Email','email',CFG.shop_email||'')}
      <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save Contact Info</button></div>
    </form>`

  if (adminState.settingsTab === 'receipt') return `
    <form class="card form-grid" data-form="settings">
      ${fld('Currency Symbol','currency',t.currency)}
      ${fld('Tax Rate %','taxRate',t.taxRate,'number')}
      ${fld('Invoice Prefix','invoicePrefix',CFG.invoice_prefix||'INV')}
      ${fld('Ticket Prefix','ticketPrefix',CFG.ticket_prefix||'TK')}
      <p class="muted" style="grid-column:1/-1;font-size:12px;margin-top:-6px">
        Full numbers look like <strong>${CFG.invoice_prefix||'INV'}20260712 0001</strong> and
        <strong>${CFG.ticket_prefix||'TK'}20260712 0001</strong> — date stamped automatically,
        sequence number never resets or repeats.
      </p>
      <label class="field" style="grid-column:1/-1"><span>Receipt Footer</span>
        <textarea name="receiptFooter">${t.receiptFooter}</textarea></label>
      <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save Receipt Settings</button></div>
    </form>`

  if (adminState.settingsTab === 'staff') {
    return `
      <div style="display:grid;gap:16px">
        <div class="card" style="display:grid;gap:14px">
          <h2>Owner Login</h2>
          <p class="muted" style="font-size:13px">Email and password used by the shop owner to sign in.</p>
          <form class="form-grid" data-form="owner-login">
            ${fld('Owner Email','owner_email',CFG.owner_email||'','email')}
            ${fld('New Password (blank = keep)','owner_password','','password')}
            <div class="modal-actions" style="grid-column:1/-1">
              <button class="primary-button">Save Owner Login</button>
            </div>
          </form>
        </div>
        <div class="card" style="display:grid;gap:14px">
          <h2>Override PIN</h2>
          <p class="muted" style="font-size:13px">
            4-digit PIN for discounts, returns, and sensitive actions at POS.
            Not a login PIN — an authorization PIN for protected operations.
          </p>
          <form class="form-grid" data-form="override-pin">
            ${fld('New Override PIN','override_pin','','password')}
            <div class="modal-actions" style="grid-column:1/-1">
              <button class="primary-button">Save PIN</button>
            </div>
          </form>
        </div>
        <div class="card" style="padding:14px">
          <p class="muted" style="font-size:13px">
            To manage employees, go to the
            <button type="button" class="secondary-button"
              style="font-size:12px;padding:3px 10px;margin:0 4px"
              data-action="go-employees-tab">Employees tab</button>
          </p>
        </div>
      </div>`
  }

  return ''
}

/* ═══════════════ MODALS ═══════════════ */
function renderModal() {
  if (!state.modal) return ''
  const { type, id } = state.modal

  if (type === 'pinPrompt') return `<div class="modal-backdrop">${pinPromptHTML(state.modal.purpose)}</div>`

  if (type === 'myAccount') return myAccountModalHTML(SESSION)

  if (type === 'addQuickItem') {
    return `<div class="modal-backdrop"><form class="modal" data-form="add-quick-item" style="max-width:480px">
      <h2>Add Quick Item</h2>
      <div class="form-grid">
        ${fld('Item Name','itemName')}
      </div>
      <p class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 6px">
        Variants (brand/name optional, price required)
      </p>
      <div id="qi-variant-rows">${qiVariantRowHTML()}</div>
      <button type="button" class="secondary-button" data-action="add-variant-row">+ Add Another Variant</button>
      ${modalActions()}
    </form></div>`
  }

  if (type === 'passwordResets') {
    const reqs = state.modal.requests || []
    return `<div class="modal-backdrop"><div class="modal" style="max-width:520px">
      <h2>Pending Password Resets</h2>
      ${!reqs.length ? `<p class="muted">No pending requests.</p>` : `
        <div style="display:grid;gap:10px;max-height:50vh;overflow-y:auto">
          ${reqs.map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;background:var(--surface-2);border-radius:8px">
              <div>
                <strong>${r.email}</strong><br>
                <span class="muted" style="font-size:12px">Requested ${new Date(r.requested_at).toLocaleString()}</span>
              </div>
              <button class="secondary-button" data-action="resolve-reset" data-reset-id="${r.id}" data-reset-email="${r.email}">Set New Password</button>
            </div>`).join('')}
        </div>`}
      <div class="modal-actions"><button type="button" class="secondary-button" data-close>Close</button></div>
    </div></div>`
  }

  if (type === 'receipt') return `<div class="modal-backdrop" data-no-backdrop-close>
    <div class="modal">
      <h2>Repair Ticket Created</h2>
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:15px;font-weight:700">${state.modal.ticket.invoice_number || state.modal.ticket.ticket_number}</div>
        <div class="muted" style="font-size:12px">Ticket: ${state.modal.ticket.ticket_number}</div>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
        <button class="primary-button" data-action="print-ticket-slip">Print Receipt</button>
      </div>
    </div></div>`

  if (type === 'employee') {
    if (state.modal.editMode) {
      const e = state.modal
      return `<div class="modal-backdrop"><form class="modal" data-form="edit-employee" style="max-width:420px" data-emp-id="${e.id}">
        <h2>Edit Employee</h2>
        <div class="form-grid">
          <label class="field"><span>Name</span><input name="name" value="${e.name||''}" required></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${e.email||''}"></label>
          <label class="field"><span>New Password (blank = keep)</span><input name="password" type="password" autocomplete="off" placeholder="Leave blank to keep"></label>
          <label class="field"><span>Role</span>
            <select name="role">
              ${['Business Owner','Manager','Cashier','Technician'].map(r =>
                `<option ${r===e.role?'selected':''}>${r}</option>`).join('')}
            </select></label>
          <label class="field"><span>Status</span>
            <select name="status">
              <option ${e.status==='Active'?'selected':''}>Active</option>
              <option ${e.status==='Inactive'?'selected':''}>Inactive</option>
            </select></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button class="primary-button">Save Changes</button>
        </div>
      </form></div>`
    }
    return `<div class="modal-backdrop"><form class="modal" data-form="employee" style="max-width:440px">
      <h2>Add Employee</h2>
      <div class="form-grid">
        ${fld('Full Name','name')}
        ${fld('Email','email','','email')}
        <label class="field"><span>Password</span>
          <div style="display:flex;gap:6px">
            <input name="password" type="password" style="flex:1">
            <button type="button" class="secondary-button" data-action="gen-employee-password" style="white-space:nowrap">Generate</button>
          </div>
        </label>
        <label class="field"><span>Role</span>
          <select name="role">
            <option>Cashier</option><option>Technician</option><option>Manager</option>
          </select></label>
      </div>
      <p class="muted" style="font-size:12px;margin-top:-6px">Share this password with the employee yourself — no invite email is sent.</p>
      ${modalActions()}
    </form></div>`
  }

  if (type === 'ticketDetail') {
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(id))
    if (!tk) return `<div class="modal-backdrop"><div class="modal"><p class="muted">Not found.</p><div class="modal-actions"><button class="secondary-button" data-close>Close</button></div></div></div>`
    const sc = {'Pending':'warn','In Progress':'warn','Ready':'good','Delivered':'good','Declined':'bad'}
    return `<div class="modal-backdrop"><div class="modal" style="max-width:600px">
      <h2>${tk.ticket_number} <span class="badge ${sc[tk.status]||'warn'}" style="margin-left:8px">${tk.status}</span></h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:14px;margin-bottom:14px;padding:12px;background:var(--surface-2);border-radius:8px">
        <div><span class="muted">Customer</span><br><strong>${tk.customer_name}</strong></div>
        <div><span class="muted">Phone</span><br><strong>${tk.customer_phone||'—'}</strong></div>
        <div><span class="muted">Device</span><br><strong>${tk.device_brand} ${tk.device_model}</strong></div>
        <div><span class="muted">IMEI</span><br><strong>${tk.imei||'—'}</strong></div>
        <div><span class="muted">Quote</span><br><strong>${money(tk.estimated_quote||0)}</strong></div>
        <div><span class="muted">Advance</span><br><strong>${money(tk.advance_payment||0)}${tk.advance_method?' ('+tk.advance_method+')':''}</strong></div>
      </div>
      ${tk.technician_note ? `<div style="background:color-mix(in srgb,var(--warning) 10%,var(--surface));border-left:3px solid var(--warning);padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:12px;font-size:14px"><strong>Note:</strong> ${tk.technician_note}</div>` : ''}
      ${(tk.components_noted||[]).length ? `
        <div style="display:grid;gap:6px;margin-bottom:12px">
          ${tk.components_noted.map((c,i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:8px;font-size:14px;${c.removed?'opacity:.55':''}">
              <span>
                <strong style="${c.removed?'text-decoration:line-through':''}">${c.name}</strong>
                <span class="badge warn" style="font-size:11px">${c.tag||c.condition||''}</span>
                ${c.removed ? `<br><span class="muted" style="font-size:11px">Not needed: ${c.removedReason||''}</span>` : ''}
              </span>
              <span style="display:flex;align-items:center;gap:8px">
                <span>${c.price>0 ? money(c.price) : '<span class="muted">Not priced</span>'}</span>
                ${!c.removed ? `<button type="button" class="secondary-button" style="font-size:11px;padding:4px 8px" data-mark-not-needed="${i}">Not Needed</button>` : ''}
              </span>
            </div>`).join('')}
        </div>` : ''}
      ${(state.modal.subInvoices||[]).length ? `
        <div style="margin-bottom:12px">
          <strong style="font-size:13px">Sub-Invoices</strong>
          <div style="display:grid;gap:6px;margin-top:6px">
            ${state.modal.subInvoices.map(s => `
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:8px 10px;background:var(--surface-2);border-radius:6px">
                <span>${s.invoice_number}</span><span>${money(s.estimated_quote)} · Bal: ${money(s.balance_due)}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      <div style="border-top:1px solid var(--border);padding-top:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="td-status" style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text);flex:1">
            ${['Pending','In Progress','Ready','Delivered','Declined'].map(s =>
              `<option ${s===tk.status?'selected':''}>${s}</option>`).join('')}
          </select>
          <input type="number" step="any" min="0" id="td-actual-quote" placeholder="Actual price" value="${tk.actual_quote||''}"
            style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text);width:180px">
        </div>
        <textarea id="td-note" placeholder="Add a note…"
          style="width:100%;margin-top:8px;min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text);box-sizing:border-box">${tk.update_note||''}</textarea>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
        <button class="secondary-button" data-action="open-create-sub-invoice" data-ticket-id="${tk.id}">+ Create Sub-Invoice</button>
        <button class="primary-button" data-action="save-ticket-detail" data-id="${tk.id}">Save Update</button>
      </div>
    </div></div>`
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
                  data-subinv-comp-price="${i}"
                  style="width:110px;border:1px solid var(--border);border-radius:6px;
                         padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
                <button type="button" data-subinv-comp-remove="${i}"
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
            <input type="number" step="any" min="0" value="${labour || ''}" placeholder="0" data-subinv-labour
              style="width:120px;border:1px solid var(--border);border-radius:6px;
                     padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
          </label>

          <label class="field" style="margin-bottom:12px">
            <span>Note</span>
            <textarea id="sub-invoice-note" style="min-height:56px" placeholder="What was found / done…"></textarea>
          </label>

          <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;
                      background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:15px">
            <span>Sub-Invoice Total</span><span id="subinv-draft-total">${money(total)}</span>
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
            <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-select="Broken">Broken</button>
            <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-select="Not Working">Not Working</button>
            <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-select="Custom">Custom…</button>
            <div id="custom-tag-wrap" class="hidden" style="display:grid;gap:8px">
              <input id="custom-tag-text" class="search" placeholder="Describe the issue">
              <button type="button" class="primary-button" data-action="confirm-draft-custom-tag">Add</button>
            </div>
          </div>
          <div class="modal-actions"><button class="secondary-button" data-close>Cancel</button></div>
        </div>
      </div>`
  }

  if (type === 'inv-add' || type === 'inv-edit') {
    return _inv ? _inv.inventoryModalHTML(type, id) : ''
  }

  if (type === 'udharList') {
    const outstanding = (state.data.udhar||[]).filter(u => u.status !== 'Settled')
    return `<div class="modal-backdrop"><div class="modal" style="max-width:640px">
      <h2>Outstanding Credits</h2>
      ${outstanding.length === 0 ? `<div class="empty">No outstanding credits.</div>` : `
        <div style="display:grid;gap:10px">
          ${outstanding.map(u => `
            <div style="padding:12px;background:var(--surface-2);border-radius:8px;display:grid;gap:8px">
              <div style="display:flex;justify-content:space-between">
                <div><strong>${u.customer_name}</strong> · ${u.customer_phone}<br>
                  <small class="muted">INV-${u.sale_id} · ${new Date(u.created_at).toLocaleDateString()}</small></div>
                <span class="badge ${u.status==='Settled'?'good':'bad'}">${u.status}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span>Balance: <strong>${money(u.balance_due)}</strong></span>
                <span class="muted">Total: ${money(u.total_amount)}</span>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="number" step="any" min="0" placeholder="Amount to settle" data-settle-amount="${u.id}"
                  style="flex:1;border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
                <select data-settle-method="${u.id}" style="border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
                  ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m => `<option>${m}</option>`).join('')}
                </select>
                <button class="primary-button" data-settle-id="${u.id}">Settle</button>
              </div>
            </div>`).join('')}
        </div>`}
      <div class="modal-actions"><button class="secondary-button" data-close>Close</button></div>
    </div></div>`
  }

  if (type === 'receipt-detail') {
    const allSales  = state.data.sales || []
    const search    = adminState.receiptSearch  || ''
    const dateFrom  = adminState.receiptDateFrom || ''
    const dateTo    = adminState.receiptDateTo   || ''
    const filtered  = allSales.filter(s => {
      const matchText = (`${s.customer_name||''} ${s.payment_method||''} ${s.employee_name||''}`)
        .toLowerCase().includes(search.toLowerCase())
      const sDate     = (s.created_at||'').slice(0,10)
      const matchFrom = !dateFrom || sDate >= dateFrom
      const matchTo   = !dateTo   || sDate <= dateTo
      return matchText && matchFrom && matchTo
    })
    const idx  = adminState.receiptModalIdx ?? 0
    const s    = filtered[idx]
    if (!s) return ''
    const items = Array.isArray(s.items_sold) ? s.items_sold : []
    const hasPrev = idx > 0
    const hasNext = idx < filtered.length - 1
    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal" style="max-width:600px;max-height:90vh;overflow-y:auto">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h2 style="margin:0">${s.invoice_number||`INV-${s.id}`}</h2>
            <button class="icon-button" data-close style="font-size:20px;line-height:1">×</button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;
                      padding:12px;background:var(--surface-2);border-radius:10px;
                      font-size:13px;margin-bottom:16px">
            <div><span class="muted">Date</span><br>
              <strong>${new Date(s.created_at).toLocaleString()}</strong></div>
            <div><span class="muted">Customer</span><br>
              <strong>${s.customer_name||'Walk-in'}</strong></div>
            <div><span class="muted">Cashier</span><br>
              <strong>${s.employee_name||'—'}</strong></div>
            <div><span class="muted">Payment</span><br>
              <strong>${s.payment_method}</strong></div>
            ${s.ticket_id ? `<div><span class="muted">Linked Ticket</span><br><strong>#${s.ticket_id}</strong></div>` : ''}
          </div>

          <div style="margin-bottom:16px">
            <p style="font-size:12px;font-weight:600;color:var(--muted);
                       text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Items</p>
            ${items.length ? `
              <div style="display:grid;gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden">
                <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;
                            padding:8px 12px;background:var(--surface-2);
                            font-size:12px;font-weight:600;color:var(--muted)">
                  <span>Item</span><span>Qty</span><span>Total</span>
                </div>
                ${items.map(i => `
                  <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;
                              padding:10px 12px;border-top:1px solid var(--border);font-size:13px">
                    <div>
                      <strong>${i.name||'Item'}</strong>
                      <br><span class="muted">${money(i.soldPrice||i.sold_price||0)} each
                      ${(i.discount||0) > 0 ? ` · disc ${money(i.discount)}` : ''}</span>
                    </div>
                    <span style="text-align:right">${i.qty||1}</span>
                    <span style="text-align:right"><strong>${money((i.soldPrice||i.sold_price||0)*(i.qty||1))}</strong></span>
                  </div>`).join('')}
              </div>` :
              `<p class="muted" style="font-size:13px">No item breakdown recorded.</p>`}
          </div>

          <div style="border-top:1px solid var(--border);padding-top:12px;
                      display:grid;gap:6px;font-size:13px">
            ${Number(s.labour_cost||0) > 0 ? `
              <div style="display:flex;justify-content:space-between">
                <span>Labour</span><span>${money(s.labour_cost)}</span>
              </div>` : ''}
            ${Number(s.discount||0) > 0 ? `
              <div style="display:flex;justify-content:space-between;color:var(--success)">
                <span>Discount</span><span>− ${money(s.discount)}</span>
              </div>` : ''}
            ${Number(s.tax||0) > 0 ? `
              <div style="display:flex;justify-content:space-between">
                <span>Tax</span><span>${money(s.tax)}</span>
              </div>` : ''}
            <div style="display:flex;justify-content:space-between;
                        font-size:18px;font-weight:700;padding-top:6px;
                        border-top:1px solid var(--border)">
              <span>Total</span><span>${money(s.total_bill)}</span>
            </div>
            ${s.cash_tendered > 0 ? `
              <div style="display:flex;justify-content:space-between;color:var(--muted)">
                <span>Cash Received</span><span>${money(s.cash_tendered)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;color:var(--muted)">
                <span>Change Given</span><span>${money(s.change_given||0)}</span>
              </div>` : ''}
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;
                      margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
            <div style="display:flex;gap:8px">
              <button class="secondary-button" ${!hasPrev?'disabled':''} data-action="receipt-prev">← Prev</button>
              <button class="secondary-button" ${!hasNext?'disabled':''} data-action="receipt-next">Next →</button>
            </div>
            <div style="display:flex;gap:8px">
              <button class="secondary-button" data-close>Close</button>
              <button class="primary-button"
                data-action="reprint-receipt" data-sale-id="${s.id}">Reprint</button>
            </div>
          </div>
        </div>
      </div>`
  }

  return ''
}

/* ═══════════════ EVENTS ═══════════════ */
function attachEvents() {
  const app = document.getElementById('app')

  // Click delegation
  app.addEventListener('click', async e => {
    // Backdrop click — close modal only if backdrop itself was clicked
    // and it's not flagged as "no backdrop close" (e.g. receipt modal)
    if (e.target.classList.contains('modal-backdrop') && !e.target.hasAttribute('data-no-backdrop-close')) {
      state.modal = null; render(); return
    }

    const el = e.target.closest(
      'button,[data-modal],[data-close],[data-action],' +
      '[data-settings-tab],[data-catalog-tab],[data-kpi-target],[data-pp-key],' +
      '[data-remove-quick],[data-remove-qitem],[data-add-qprice],[data-remove-qprice],' +
      '[data-inv-edit],[data-inv-delete],[data-settle-id],[data-view-ticket],' +
      '[data-mark-not-needed],[data-subinv-comp-remove],[data-add-draft-comp-name],[data-tag-select]'
    )
    if (!el) return

    if (el.dataset.ppKey !== undefined) { handlePpKey(el.dataset.ppKey, verifyAdminLocal, render); return }
    if (el.dataset.close !== undefined) { state.modal = null; render(); return }
    if (el.dataset.action === 'print-ticket-slip') {
      if (state.modal?.ticket) {
        const { buildTicketSlip, printThermal } = await import('../print/print.js')
        printThermal(buildTicketSlip(state.modal.ticket))
      }
      return
    }

    if (el.dataset.kpiTarget) {
      const target = el.dataset.kpiTarget
      if (target === 'udharList') { state.modal = { type:'udharList' }; render(); return }
      if (ADMIN_MODULES.find(([k]) => k === target)) {
        adminState.filter = ''
        const { navigate } = await import('../router.js')
        navigate(`/admin/${target}`)
        return
      }
      return
    }

    if (el.dataset.settingsTab) {
      const { navigate } = await import('../router.js')
      navigate(`/admin/settings?tab=${el.dataset.settingsTab}`, { replace: true, force: true })
      return
    }
    if (el.dataset.catalogTab) {
      const { navigate } = await import('../router.js')
      navigate(`/admin/catalog?tab=${el.dataset.catalogTab}`, { replace: true, force: true })
      return
    }
    if (el.dataset.modal) { state.modal = { type:el.dataset.modal, id:el.dataset.id }; render(); return }

    if (el.dataset.action === 'go-pos') {
      const { navigate } = await import('../router.js')
      navigate('/pos'); return
    }
    if (el.dataset.action === 'go-workshop') {
      const { navigate } = await import('../router.js')
      navigate('/workshop'); return
    }

    if (el.dataset.action === 'gen-employee-password') {
      const input = document.querySelector('[data-form="employee"] input[name="password"]')
      if (input) { input.type = 'text'; input.value = generateTempPassword() }
      return
    }
    if (el.dataset.action === 'open-add-quick-item') {
      state.modal = { type: 'addQuickItem' }; render(); return
    }
    if (el.dataset.action === 'add-variant-row') {
      document.getElementById('qi-variant-rows')?.insertAdjacentHTML('beforeend', qiVariantRowHTML())
      return
    }
    if (el.dataset.action === 'remove-variant-row') {
      el.closest('[data-variant-row]')?.remove()
      return
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
        state.modal = { type: 'ticketDetail', id: ticketId, subInvoices: subs }
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
    if (el.dataset.subinvCompRemove !== undefined) {
      const parentId = state.modal?.parentId
      const comps = readSubInvCompsFromDOM()
      comps.splice(Number(el.dataset.subinvCompRemove), 1)
      state.modal = { type: 'create-sub-invoice', parentId, draftComponents: comps, draftLabour: readSubInvLabourFromDOM() }
      render(); return
    }

    /* Add predefined component to the draft — opens tag picker */
    if (el.dataset.addDraftCompName) {
      state.modal = {
        type:     'add-comp-tag',
        compName: el.dataset.addDraftCompName,
        _parentId: state.modal?.parentId,
        _draftComponents: readSubInvCompsFromDOM(),
        _draftLabour: readSubInvLabourFromDOM(),
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
        _draftComponents: readSubInvCompsFromDOM(),
        _draftLabour: readSubInvLabourFromDOM(),
      }
      render(); return
    }

    /* Tag selection for the sub-invoice draft — Broken / Not Working / Custom */
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
    if (el.dataset.action === 'confirm-draft-custom-tag') {
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
      const comps  = readSubInvCompsFromDOM()
      const labour = readSubInvLabourFromDOM()
      const note   = document.getElementById('sub-invoice-note')?.value || ''
      if (!comps.length && !labour) { alert('Add at least one component or a labour charge.'); return }

      const res = await createSubInvoice(tk, comps, labour, note, SESSION.employee?.name)
      if (!res.ok) { alert('Error: ' + res.error); return }

      const { buildSubInvoiceSlip, printThermal } = await import('../print/print.js')
      printThermal(buildSubInvoiceSlip(res.data, tk))

      state.modal = null
      await load(); return
    }

    if (el.dataset.action === 'install' && state.installPrompt) {
      state.installPrompt.prompt(); state.installPrompt = null; render(); return
    }
    if (el.dataset.action === 'my-account') {
      state.modal = { type: 'myAccount' }; render(); return
    }
    if (el.dataset.action === 'open-password-resets') {
      const requests = await listPendingResetRequests()
      state.modal = { type: 'passwordResets', requests }
      render(); return
    }
    if (el.dataset.action === 'resolve-reset') {
      const email = el.dataset.resetEmail
      const newPass = generateTempPassword()
      const res = await resolvePasswordReset(el.dataset.resetId, email, newPass, SESSION.employee?.name || 'Admin')
      if (!res.ok) { alert('Error: ' + res.error); return }
      alert(`New password for ${email}:\n\n${newPass}\n\nShare this with them directly — it won't be shown again.`)
      const requests = await listPendingResetRequests()
      state.modal = { type: 'passwordResets', requests }
      render(); return
    }
    if (el.dataset.action === 'theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('retailos-theme', state.theme)
      applyBranding(); render(); return
    }
    if (el.dataset.action === 'logout') {
      if (!confirm('Log out?')) return
      _clearSession()
      const { navigate } = await import('../router.js')
      navigate('/login', { force: true }); return
    }

    if (el.dataset.action === 'go-employees-tab') {
      adminState.adminModule = 'employees'
      adminState.settingsTab = 'branding'
      adminState.catalogTab  = 'quickitems'
      const { navigate } = await import('../router.js')
      navigate('/admin/employees'); return
    }

    if (el.dataset.action === 'edit-employee') {
      state.modal = { type:'employee', editMode:true,
        id:el.dataset.empId, name:el.dataset.empName,
        role:el.dataset.empRole, status:el.dataset.empStatus, email:el.dataset.empEmail }
      render(); return
    }

    if (el.dataset.action === 'remove-employee') {
      const name      = el.dataset.empName || 'this employee'
      const empId     = el.dataset.empId
      const canDelete = el.dataset.empCanDelete === 'true'

      // Determine action before opening PIN prompt
      let chosenAction = 'deactivate'  // default for Managers
      if (canDelete) {
        const choice = confirm(
          `What would you like to do with ${name}?\n\n` +
          `OK = Permanently Delete\n` +
          `Cancel = Make Inactive only`
        )
        chosenAction = choice ? 'delete' : 'deactivate'
      }

      openPinPrompt('admin', async (verified) => {
        // Security guard — only proceed if PIN was actually verified
        if (!verified) return

        if (chosenAction === 'delete') {
          const { error } = await sb.from('employees').delete().eq('id', empId)
          if (error) {
            if (error.message.includes('foreign key') || error.message.includes('violates')) {
              // Has transaction history — fall back to deactivate
              const { error: deactErr } = await sb.from('employees')
                .update({ status: 'Inactive' }).eq('id', empId)
              if (deactErr) { alert('Error: ' + deactErr.message); return }
              alert(`${name} has transaction history and cannot be permanently deleted.\nSet to Inactive instead.`)
            } else {
              alert('Error deleting employee: ' + error.message); return
            }
          }
        } else {
          // Deactivate only
          const { error } = await sb.from('employees')
            .update({ status: 'Inactive' }).eq('id', empId)
          if (error) { alert('Error deactivating: ' + error.message); return }
        }

        // Clear active sessions regardless of action
        await sb.from('active_sessions').delete().eq('employee_id', String(empId))
        await load()
      }, render); return
    }

    if (el.dataset.action === 'open-ticket-editor') {
      const ticketId = el.dataset.ticketId
      state.modal = { type:'ticketDetail', id:ticketId, subInvoices: [] }
      render()
      const subs = await getSubInvoices(ticketId)
      if (state.modal?.type === 'ticketDetail' && String(state.modal.id) === ticketId) {
        state.modal.subInvoices = subs
        render()
      }
      return
    }

    if (el.dataset.action === 'admin-collect') {
      const found = state.data.tickets.find(t => String(t.id) === String(el.dataset.ticketId))
      if (!found) return
      sessionStorage.setItem('retailos_collect_ticket', String(found.id))
      const { navigate } = await import('../router.js')
      navigate('/pos'); return
    }

    if (el.dataset.action === 'save-ticket-detail') {
      const newStatus   = document.getElementById('td-status')?.value
      const actualQuote = Number(document.getElementById('td-actual-quote')?.value||0)
      const note        = document.getElementById('td-note')?.value||''
      const upd = { status:newStatus, update_note:note }
      if (actualQuote > 0) upd.actual_quote = actualQuote
      const { error } = await sb.from('tickets').update(upd).eq('id', el.dataset.id)
      if (error) { alert('Update failed: '+error.message); return }
      state.modal = null; await load(); return
    }

    if (el.dataset.action === 'reprint-receipt') {
      const saleId = Number(el.dataset.saleId)
      const sale   = state.data.sales.find(s => s.id === saleId)
      if (!sale) { alert('Sale not found.'); return }
      const { buildReceiptSlip, printThermal } = await import('../print/print.js')
      const reprSale = {
        receiptNo: sale.invoice_number||`INV-${sale.id}`, date: sale.created_at,
        cashier: sale.employee_name||'Counter', customer: sale.customer_name||'Walk-in',
        items: (sale.items_sold||[]).map(i => ({
          name:i.name, variantName:i.variant_name||'', qty:i.qty||1, soldPrice:i.sold_price||i.soldPrice||0,
          originalPrice:i.original_price||0, discount:i.discount||0, reason:i.reason||''
        })),
        labour:sale.labour_cost||0, discount:sale.discount||0, tax:sale.tax||0,
        total:sale.total_bill||0, payment:sale.payment_method||'—',
      }
      printThermal(buildReceiptSlip(reprSale, true)); return
    }

    if (el.dataset.action === 'clear-receipt-filter') {
      adminState.receiptDateFrom = ''
      adminState.receiptDateTo   = ''
      adminState.receiptSearch   = ''
      render(); return
    }

    if (el.dataset.action === 'open-receipt-modal') {
      adminState.receiptModalIdx = Number(el.dataset.receiptIdx)
      state.modal = { type: 'receipt-detail' }
      render(); return
    }

    if (el.dataset.action === 'receipt-prev') {
      if (adminState.receiptModalIdx > 0) {
        adminState.receiptModalIdx--
        state.modal = { type: 'receipt-detail' }
        render()
      }
      return
    }

    if (el.dataset.action === 'receipt-next') {
      adminState.receiptModalIdx++
      state.modal = { type: 'receipt-detail' }
      render()
      return
    }

    if (el.dataset.action === 'toggle-receipt') {
      const rid = Number(el.dataset.receiptId)
      adminState.receiptsExpanded = adminState.receiptsExpanded === rid ? null : rid
      render(); return
    }

    if (el.dataset.action === 'add-quick-comp') {
      const val = document.getElementById('new-comp-input')?.value?.trim(); if (!val) return
      const { error } = await sb.from('repair_components').insert({
        name: val, sort_order: (state.data.repairComponents||[]).length + 1
      })
      if (error) { alert('Error: '+error.message); return }
      const input = document.getElementById('new-comp-input')
      if (input) input.value = ''
      await load(); return
    }
    if (el.dataset.action === 'save-quick-comps') {
      // No longer needed — adds/removes go directly to DB
      await load(); return
    }
    if (el.dataset.removeQuick !== undefined) {
      const compId = Number(el.dataset.removeQuick)
      const { error } = await sb.from('repair_components').delete().eq('id', compId)
      if (error) { alert('Error: '+error.message); return }
      await load(); return
    }

    if (el.dataset.action === 'add-qitem') {
      const val = document.getElementById('qitem-name')?.value?.trim(); if (!val) return
      const { error } = await sb.from('quick_items').insert({
        name: val, prices: [], sort_order: (state.data.quickItems||[]).length + 1
      })
      if (error) { alert('Error: '+error.message); return }
      await load(); return
    }
    if (el.dataset.action === 'save-qitems') {
      // Save is now per-item directly to quick_items table
      // Individual add/remove handlers do the DB work — this just refreshes
      await load(); return
    }
    if (el.dataset.removeQitem !== undefined) {
      const item = (state.data.quickItems||[])[Number(el.dataset.removeQitem)]
      if (!item) return
      const { error } = await sb.from('quick_items').delete().eq('id', item.id)
      if (error) { alert('Error: '+error.message); return }
      await load(); return
    }
    if (el.dataset.addQprice !== undefined) {
      const idx  = Number(el.dataset.addQprice)
      const val  = Number(document.getElementById(`qprice-input-${idx}`)?.value)
      if (!val || val <= 0) return
      const variantName = document.getElementById(`qvariant-name-${idx}`)?.value?.trim() || ''
      const item = (state.data.quickItems||[])[idx]
      if (!item) return
      const newPrices = [...(item.prices||[]), { name: variantName, price: val }]
      const { error } = await sb.from('quick_items').update({ prices: newPrices }).eq('id', item.id)
      if (error) { alert('Error: '+error.message); return }
      await load(); return
    }
    if (el.dataset.removeQprice !== undefined) {
      const [i,pi] = el.dataset.removeQprice.split('-').map(Number)
      const item = (state.data.quickItems||[])[i]
      if (!item) return
      const newPrices = [...(item.prices||[])]
      newPrices.splice(pi, 1)
      const { error } = await sb.from('quick_items').update({ prices: newPrices }).eq('id', item.id)
      if (error) { alert('Error: '+error.message); return }
      await load(); return
    }

    if (el.dataset.invEdit && _inv) { _inv.handleInvEdit(el); render(); return }
    if (el.dataset.invDelete && _inv) {
      const { deleted } = await _inv.handleInvDelete(el)
      if (deleted) await load()
      return
    }

    if (el.dataset.settleId) {
      const udharId = Number(el.dataset.settleId)
      const amount  = Number(document.querySelector(`[data-settle-amount="${udharId}"]`)?.value)
      const method  = document.querySelector(`[data-settle-method="${udharId}"]`)?.value || 'Cash'
      if (!amount || amount <= 0) { alert('Enter a valid amount.'); return }
      openPinPrompt('settle', async (verified) => {
        if (!verified) return
        const rec = state.data.udhar.find(u => u.id === udharId); if (!rec) return
        const history = rec.payment_history || []
        history.push({ date:new Date().toISOString().slice(0,10), paid:amount, method })
        const newPaid    = Number(rec.amount_paid)+Number(amount)
        const newBalance = Math.max(0, Number(rec.total_amount)-newPaid)
        const { error } = await sb.from('udhar').update({
          amount_paid:newPaid, balance_due:newBalance, payment_history:history,
          status:newBalance<=0?'Settled':'Partial',
          settled_at:newBalance<=0?new Date().toISOString():null,
        }).eq('id', udharId)
        if (error) { alert('Settle error: '+error.message); return }
        await load(); state.modal = { type:'udharList' }; render()
      }, render); return
    }

    const viewTicketEl = el.closest('[data-view-ticket]')
    if (viewTicketEl && el.tagName !== 'BUTTON' && !el.closest('button')) {
      const ticketId = String(viewTicketEl.dataset.viewTicket)
      state.modal = { type:'ticketDetail', id:ticketId, subInvoices: [] }
      render()
      const subs = await getSubInvoices(ticketId)
      if (state.modal?.type === 'ticketDetail' && String(state.modal.id) === ticketId) {
        state.modal.subInvoices = subs
        render()
      }
      return
    }
  })

  // Input
  app.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.filter !== undefined) { adminState.filter = t.value; render() }
    if (t.dataset.receiptSearch !== undefined) { adminState.receiptSearch = t.value; render() }
    if (t.dataset.receiptFrom !== undefined) { adminState.receiptDateFrom = t.value; render() }
    if (t.dataset.receiptTo   !== undefined) { adminState.receiptDateTo   = t.value; render() }
    if (t.dataset.subinvCompPrice !== undefined || t.dataset.subinvLabour !== undefined) {
      const prices = [...document.querySelectorAll('[data-subinv-comp-price]')].reduce((s,inp) => s+(Number(inp.value)||0), 0)
      const labour = Number(document.querySelector('[data-subinv-labour]')?.value||0)
      const el     = document.getElementById('subinv-draft-total')
      if (el) el.textContent = money(prices+labour)
    }
  })

  // Enter key submits quick-add inputs that aren't inside a <form>
  app.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    if (e.target.id?.startsWith('qprice-input-')) {
      e.preventDefault()
      const idx = e.target.id.replace('qprice-input-', '')
      document.querySelector(`[data-add-qprice="${idx}"]`)?.click()
      return
    }
    const map = {
      'new-comp-input': 'add-quick-comp',
      'custom-comp-name': 'add-custom-draft-comp',
      'custom-tag-text':  'confirm-draft-custom-tag',
    }
    const action = map[e.target.id]
    if (!action) return
    e.preventDefault()
    document.querySelector(`[data-action="${action}"]`)?.click()
  })

  // Change
  app.addEventListener('change', async e => {
    const t = e.target
    if (t.dataset.action === 'admin-module') {
      adminState.filter = ''
      const { navigate } = await import('../router.js')
      navigate(`/admin/${t.value}`)
      return
    }
  })

  // Submit
  app.addEventListener('submit', async e => {
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    const type = form.dataset.form

    if (type === 'add-quick-item') {
      const itemName = data.itemName?.trim()
      if (!itemName) { alert('Item name is required.'); return }
      const names  = [...form.querySelectorAll('[name="variantName[]"]')].map(i => i.value.trim())
      const prices = [...form.querySelectorAll('[name="variantPrice[]"]')].map(i => Number(i.value) || 0)
      const variants = names.map((name, i) => ({ name, price: prices[i] })).filter(v => v.price > 0)
      const { error } = await sb.from('quick_items').insert({
        name: itemName, prices: variants,
        sort_order: (state.data.quickItems||[]).length + 1
      })
      if (error) { alert('Error: ' + error.message); return }
      state.modal = null
      await load(); return
    }

    if (type === 'change-password') {
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

    if (type === 'edit-employee') {
      const empId   = form.dataset.empId
      const updates = { name:data.name, role:data.role, status:data.status, email:(data.email||'').toLowerCase().trim() }
      if (data.password?.trim()) {
        const err = validatePassword(data.password)
        if (err) { alert(err); return }
        updates.password = data.password
      }
      const { error } = await sb.from('employees').update(updates).eq('id', empId)
      if (error) { alert('Error updating: '+error.message); return }
      state.modal = null; await load(); return
    }

    if (type === 'employee') {
      const pwErr = validatePassword(data.password||'')
      if (pwErr) { alert(pwErr); return }
      const { error } = await sb.from('employees').insert({
        name:data.name, email:(data.email||'').toLowerCase().trim(),
        password:data.password, role:data.role||'Cashier', status:'Active',
      })
      if (error) { alert('Error saving employee: '+error.message); return }
      state.modal = null; await load(); return
    }

    if (type === 'settings') {
      const updates = {}
      const logoFile = form.querySelector('[name="logo"]')?.files?.[0]
      if (logoFile) {
        const base64 = await new Promise(res => {
          const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(logoFile)
        })
        updates.shop_logo = base64
      }
      if (data.name)                updates.shop_name        = data.name
      if (data.address)             updates.shop_address     = data.address
      if (data.phone)               updates.shop_phone       = data.phone
      if (data.primaryColor)        updates.primary_color    = data.primaryColor
      if (data.secondaryColor)      updates.secondary_color  = data.secondaryColor
      if (data.currency)            updates.currency         = data.currency
      if (data.taxRate)             updates.tax_rate         = Number(data.taxRate)
      if (data.invoicePrefix)       updates.invoice_prefix   = data.invoicePrefix.trim().toUpperCase()
      if (data.ticketPrefix)        updates.ticket_prefix    = data.ticketPrefix.trim().toUpperCase()
      if (data.receiptFooter)       updates.terms_text       = data.receiptFooter
      if (data.businessDescription) updates.shop_description = data.businessDescription
      const { error } = await sb.from('shop_config').update(updates).eq('id',1)
      if (error) { alert('Settings error: '+error.message); return }
      state.modal = null; await load(); return
    }

    if (type === 'owner-login') {
      const updates = {}
      if (data.owner_email?.trim())    updates.owner_email    = data.owner_email.toLowerCase().trim()
      if (data.owner_password?.trim()) {
        const err = validatePassword(data.owner_password)
        if (err) { alert(err); return }
        updates.owner_password = data.owner_password
      }
      if (!Object.keys(updates).length) { alert('Nothing to update.'); return }
      const { error } = await sb.from('shop_config').update(updates).eq('id',1)
      if (error) { alert('Error: '+error.message); return }
      Object.assign(CFG, updates); alert('Owner login updated.'); return
    }

    if (type === 'override-pin') {
      if (!data.override_pin?.trim()) { alert('Enter a PIN.'); return }
      const { error } = await sb.from('shop_config').update({ override_pin:data.override_pin }).eq('id',1)
      if (error) { alert('Error: '+error.message); return }
      CFG.override_pin = data.override_pin; alert('Override PIN updated.'); return
    }

    if ((type === 'inv-add' || type === 'inv-edit') && _inv) {
      const fn = type === 'inv-add' ? _inv.submitInvAdd : _inv.submitInvEdit
      const { ok } = await fn(data)
      if (!ok) return
      state.modal = null; await load(); return
    }

    state.modal = null; await load()
  })

  // Keyboard
  document.addEventListener('keydown', e => {
    if (document.getElementById('pp-display')) {
      if (e.key==='Enter'||e.key==='Return') { e.preventDefault(); handlePpKey('✓',verifyAdminLocal,render); return }
      if (e.key==='Backspace')               { e.preventDefault(); handlePpKey('⌫',verifyAdminLocal,render); return }
      if (e.key==='Escape')                  { e.preventDefault(); state.modal=null; render(); return }
      if (/^[0-9]$/.test(e.key))            { e.preventDefault(); handlePpKey(e.key,verifyAdminLocal,render); return }
    }
  })
}

/* ── Sub-invoice draft helpers ── */
function readSubInvCompsFromDOM() {
  const comps = [...(state.modal?.draftComponents || [])]
  document.querySelectorAll('[data-subinv-comp-price]').forEach((inp, i) => {
    if (comps[i]) comps[i].price = Number(inp.value) || 0
  })
  return comps
}

function readSubInvLabourFromDOM() {
  return Number(document.querySelector('[data-subinv-labour]')?.value || 0)
}

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

/* ── Public ── */
export async function initAdmin(sess, module, query) {
  SESSION    = sess
  state.role = sess.isAdmin ? 'Business Owner' : (sess.employee?.role || 'Manager')
  if (module) adminState.adminModule = module
  if (module === 'settings' && query?.tab) adminState.settingsTab = query.tab
  if (module === 'catalog'  && query?.tab) adminState.catalogTab  = query.tab
  await load()
}