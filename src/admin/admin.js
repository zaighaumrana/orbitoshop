import {
  sb, state, CFG, loadConfig, applyBranding, currentTenant,
  _loadSession, _saveSession, _clearSession,
  can, ACCESS, verifyLogin, validatePassword,
  createTicket, updateTicket,
  money, fld, modalActions, statusBadge,
  openPinPrompt, pinPromptHTML, handlePpKey,
  logBillEvent, logInventoryEvent,
} from '../shared.js'

import { renderLogin } from '../auth.js'

const ADMIN_MODULES = [
  ['dashboard', '▦', 'Dashboard'],
  ['repairs',   '◈', 'Repair Tickets'],
  ['inventory', '▤', 'Inventory'],
  ['reports',   '▧', 'Reports'],
  ['employees', '♙', 'Employees'],
  ['receipts',  '◉', 'Receipts'],
  ['settings',  '◐', 'Settings'],
]

const adminState = {
  adminModule:      'dashboard',
  settingsTab:      'branding',
  receiptsExpanded: null,
  teLabour:         null,
  filter:           '',
  receiptDateFrom:  '',
  receiptDateTo:    '',
  receiptSearch:    '',
  receiptModalIdx:  null,
}

let SESSION = {}

/* ── Load ── */
async function load() {
  await loadConfig()
  const fetchInv = CFG.inventory_module_enabled
    ? sb.from('inventory').select('*').order('name')
    : Promise.resolve({ data: [] })

  const [tickets, sales, employees, udhar, returns_, inv] = await Promise.all([
    sb.from('tickets').select('*').order('id', { ascending: false }),
    sb.from('sales').select('*').order('id', { ascending: false }),
    sb.from('employees').select('id, name, role, status, email').order('name'),
    sb.from('udhar').select('*').order('id', { ascending: false }),
    sb.from('returns').select('*').order('id', { ascending: false }),
    fetchInv,
  ])
  state.data = {
    tickets:   tickets.data   || [],
    sales:     sales.data     || [],
    employees: employees.data || [],
    udhar:     udhar.data     || [],
    returns:   returns_.data  || [],
    inventory: inv.data       || [],
  }
  applyBranding()
  render()
}

/* ── Render ── */
let _eventsAttached = false

function render() {
  const tenant = currentTenant()
  if (!can(adminState.adminModule, state.role)) adminState.adminModule = 'dashboard'

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
}

function pageContent() {
  const pages = { dashboard, repairs, inventory, reports, employees, receipts, settings }
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
              <td>INV-${s.id}</td>
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
    ${tit('Repair Tickets','Full repair queue.',`<button class="primary-button" data-modal="repair">New Ticket</button>`)}
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
  const items    = state.data.inventory || []
  const filter   = adminState.filter.toLowerCase()
  const filtered = items.filter(i => !filter ||
    (i.name||'').toLowerCase().includes(filter) ||
    (i.sku||'').toLowerCase().includes(filter) ||
    (i.category||'').toLowerCase().includes(filter))
  const lowStock = items.filter(i => Number(i.qty||0) <= Number(i.min_qty||0) && Number(i.min_qty||0) > 0)
  return `
    ${tit('Inventory','Stock levels, pricing, and alerts.',
      `<button class="primary-button" data-modal="inv-add">+ Add Item</button>`)}
    ${lowStock.length ? `<div style="background:color-mix(in srgb,var(--warning) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--warning) 30%,var(--border));border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:12px">
      ⚠ ${lowStock.length} item${lowStock.length>1?'s':''} low: ${lowStock.map(i=>`<strong>${i.name}</strong> (${i.qty} left)`).join(', ')}
    </div>` : ''}
    <div class="card">
      <input class="search" placeholder="Search inventory…" data-filter
        value="${adminState.filter||''}" style="width:100%;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text)">
      ${filtered.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Qty</th><th>Sell</th><th>Cost</th><th></th></tr></thead>
          <tbody>
            ${filtered.map(i => `<tr>
              <td><strong>${i.name}</strong></td>
              <td class="muted">${i.sku||'—'}</td>
              <td>${i.category||'—'}</td>
              <td><span class="badge ${Number(i.qty||0)<=Number(i.min_qty||0)&&Number(i.min_qty||0)>0?'bad':'good'}">${i.qty}</span></td>
              <td>${money(i.price)}</td>
              <td class="muted">${money(i.cost)}</td>
              <td>
                <button class="secondary-button" style="font-size:12px;padding:4px 10px" data-inv-edit="${i.id}">Edit</button>
                <button class="secondary-button" style="font-size:12px;padding:4px 10px;color:var(--danger)" data-inv-delete="${i.id}">Delete</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>` :
        `<div class="empty">${filter ? 'No items match.' : 'No inventory yet.'}</div>`}
    </div>`
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
            <td>INV-${s.id}</td>
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
      `<button class="primary-button" data-modal="employee">Add Employee</button>`)}
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
                <button class="secondary-button" style="font-size:12px;color:var(--danger)"
                  data-action="remove-employee"
                  data-emp-id="${e.id}" data-emp-name="${e.name}">Remove</button>
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
    const sDate     = (s.created_at||'').slice(0,10)
    const matchFrom = !dateFrom || sDate >= dateFrom
    const matchTo   = !dateTo   || sDate <= dateTo
    return matchText && matchFrom && matchTo
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
              INV-${s.id} · ${s.payment_method} · ${s.employee_name||''}
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
  const tabs = { branding:'Branding', contact:'Contact', receipt:'Receipt & Tax',
                 components:'Components', quickitems:'Quick Items', staff:'Staff & Security' }
  return `
    ${tit('Business Settings','Branding, contact, receipt, components, quick items, staff.','')}
    <div class="settings-tabs">
      ${Object.entries(tabs).map(([k,l]) =>
        `<button class="settings-tab ${adminState.settingsTab===k?'active':''}" data-settings-tab="${k}">${l}</button>`
      ).join('')}
    </div>
    ${settingsTabContent()}`
}

function settingsTabContent() {
  const t = currentTenant()
  if (adminState.settingsTab === 'branding') return `
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
      <label class="field" style="grid-column:1/-1"><span>Receipt Footer</span>
        <textarea name="receiptFooter">${t.receiptFooter}</textarea></label>
      <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save Receipt Settings</button></div>
    </form>`
  if (adminState.settingsTab === 'components') {
    const comps = CFG.quick_components || []
    return `
      <div class="card" style="display:grid;gap:14px">
        <div><h2>Quick-Tap Components</h2></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${comps.map((c,i) => `
            <div style="display:flex;align-items:center;gap:6px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:6px 10px">
              <span style="font-size:13px">${c}</span>
              <button type="button" data-remove-quick="${i}" style="color:var(--danger);background:none;border:none;font-size:16px;line-height:1;padding:0 2px;cursor:pointer">×</button>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <input id="new-comp-input" class="search" placeholder="New component name" style="flex:1">
          <button class="primary-button" data-action="add-quick-comp">Add</button>
        </div>
        <button class="primary-button" data-action="save-quick-comps">Save Components</button>
      </div>`
  }
  if (adminState.settingsTab === 'quickitems') {
    const items = CFG.quick_items || []
    return `
      <div class="card" style="display:grid;gap:16px">
        <div><h2>Quick Sale Items</h2></div>
        ${items.map((item,i) => `
          <div style="padding:12px;background:var(--surface-2);border-radius:8px;display:grid;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <strong>${item.name}</strong>
              <button type="button" data-remove-qitem="${i}" style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer">×</button>
            </div>
            <div style="font-size:13px;color:var(--muted)">
              Prices: ${item.prices.map((p,pi) => `
                <span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px">
                  ${money(p)}
                  <button type="button" data-remove-qprice="${i}-${pi}" style="color:var(--danger);background:none;border:none;font-size:14px;cursor:pointer;padding:0">×</button>
                </span>`).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <input type="number" step="any" min="0" placeholder="Add price" id="qprice-input-${i}"
                style="flex:1;border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
              <button type="button" class="secondary-button" data-add-qprice="${i}">+ Price</button>
            </div>
          </div>`).join('')}
        <div style="display:flex;gap:8px">
          <input id="qitem-name" class="search" placeholder="Item name" style="flex:1">
          <button class="primary-button" data-action="add-qitem">Add Item</button>
        </div>
        <button class="primary-button" data-action="save-qitems">Save Quick Items</button>
      </div>`
  }
  if (adminState.settingsTab === 'staff') {
    const emps = state.data.employees || []
    return `
      <div style="display:grid;gap:16px">
        <div class="card" style="display:grid;gap:14px">
          <h2>Employees</h2>
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
                    <button class="secondary-button" style="font-size:12px;color:var(--danger)"
                      data-action="remove-employee"
                      data-emp-id="${e.id}" data-emp-name="${e.name}">Remove</button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table></div>` : `<p class="muted">No employees yet.</p>`}
          <button class="primary-button" style="width:fit-content" data-modal="employee">+ Add Employee</button>
        </div>
        <div class="card" style="display:grid;gap:14px">
          <h2>Owner Login</h2>
          <form class="form-grid" data-form="owner-login">
            ${fld('Owner Email','owner_email',CFG.owner_email||'','email')}
            ${fld('New Password (blank = keep)','owner_password','','password')}
            <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save Owner Login</button></div>
          </form>
        </div>
        <div class="card" style="display:grid;gap:14px">
          <h2>Override PIN</h2>
          <p class="muted" style="font-size:13px">4-digit PIN for discounts and returns at POS.</p>
          <form class="form-grid" data-form="override-pin">
            ${fld('New Override PIN','override_pin','','password')}
            <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save PIN</button></div>
          </form>
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
        ${fld('Password','password','','password')}
        <label class="field"><span>Role</span>
          <select name="role">
            <option>Cashier</option><option>Technician</option><option>Manager</option>
          </select></label>
      </div>
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
          ${tk.components_noted.map(c => `
            <div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--surface-2);border-radius:8px;font-size:14px">
              <span><strong>${c.name}</strong> <span class="badge warn" style="font-size:11px">${c.condition||''}</span></span>
              <span>${c.price>0 ? money(c.price) : '<span class="muted">Not priced</span>'}</span>
            </div>`).join('')}
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
        <button class="primary-button" data-action="save-ticket-detail" data-id="${tk.id}">Save Update</button>
      </div>
    </div></div>`
  }

  if (type === 'ticket-editor') {
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(id))
    if (!tk) return ''
    const comps      = tk.components_noted || []
    const partsTotal = comps.reduce((s,c) => s+Number(c.price||0), 0)
    const labourVal  = adminState.teLabour ?? Math.max(0, Number(tk.estimated_quote||0)-partsTotal)
    return `<div class="modal-backdrop" id="ticket-editor-backdrop">
      <div class="modal" style="max-width:500px;max-height:85vh;overflow-y:auto">
        <h2>${tk.customer_name}</h2>
        <p class="muted" style="font-size:13px;margin-bottom:16px">${tk.ticket_number} · ${tk.device_brand} ${tk.device_model}</p>
        <div style="display:grid;gap:8px;margin-bottom:14px">
          <strong style="font-size:13px">Components</strong>
          ${comps.map((c,i) => `
            <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
              <span style="font-size:13px">${c.name} <small class="muted">(${c.condition})</small></span>
              <input type="number" min="0" value="${c.price||0}" data-te-price="${i}"
                style="width:100px;border:1px solid var(--border);border-radius:6px;padding:5px 8px;background:var(--surface);color:var(--text);font-size:13px">
              <button type="button" data-te-remove="${i}" style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer;padding:0 4px">×</button>
            </div>`).join('')}
          ${!comps.length ? `<p class="muted" style="font-size:13px">No components yet.</p>` : ''}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <input id="te-new-comp" class="search" placeholder="Component name" style="flex:1">
          <select id="te-new-cond" style="border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text);font-size:13px">
            ${['Repaired','Replaced','New','Cleaned','Checked'].map(c => `<option>${c}</option>`).join('')}
          </select>
          <button type="button" class="secondary-button" data-action="te-add-comp">+ Add</button>
        </div>
        <label style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--surface-2);border-radius:8px;margin-bottom:8px;gap:12px">
          <span style="font-size:13px;font-weight:500">Labour Charge</span>
          <input type="number" step="any" min="0" id="te-labour" value="${labourVal<0?0:labourVal}" data-te-labour
            style="width:110px;border:1px solid var(--border);border-radius:6px;padding:5px 8px;background:var(--surface);color:var(--text);font-size:13px">
        </label>
        <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;background:var(--surface-2);border-radius:8px;margin-bottom:16px">
          <span>Updated Quote</span><span id="te-total">${money(partsTotal+(isNaN(labourVal)?0:labourVal))}</span>
        </div>
        <div class="modal-actions">
          <button class="secondary-button" data-close>Cancel</button>
          <button class="primary-button" data-action="te-save">Save to Ticket</button>
        </div>
      </div></div>`
  }

  if (type === 'repair') {
    const comps = CFG.quick_components || []
    const sel   = state.modal?.selectedComponents || []
    const d     = state.modal?._draft || {}
    const fldV  = (label,name,val='',t='text') =>
      `<label class="field"><span>${label}</span><input name="${name}" type="${t}" value="${String(val).replace(/"/g,'&quot;')}" placeholder="${label}" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text)"></label>`
    return `<div class="modal-backdrop"><form class="modal" data-form="repair" style="max-width:680px">
      <h2>New Repair Ticket</h2>
      <div class="form-grid">
        ${fldV('Customer Name','customerName',d.customerName)}
        ${fldV('Customer Phone','customerPhone',d.customerPhone,'tel')}
        ${fldV('Device Brand','deviceBrand',d.deviceBrand)}
        ${fldV('Device Model','deviceModel',d.deviceModel)}
        ${fldV('IMEI / Serial','imei',d.imei)}
        ${fldV('Estimated Quote','estimatedQuote',d.estimatedQuote??'','number')}
        ${fldV('Advance Received','advance',d.advance??'','number')}
        <label class="field"><span>Advance Method</span>
          <select name="advanceMethod"><option value="">None</option>
            ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m =>
              `<option ${d.advanceMethod===m?'selected':''}>${m}</option>`).join('')}
          </select></label>
        <label class="field" style="grid-column:1/-1"><span>Technician Note</span>
          <textarea name="technicianNote" style="min-height:56px">${d.technicianNote||''}</textarea></label>
      </div>
      <p class="muted" style="font-size:13px;margin:8px 0 6px">Tap to add issues:</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        ${comps.map(c => {
          const active = sel.find(s => s.name === c)
          return `<button type="button" class="${active?'primary-button':'secondary-button'}" style="font-size:13px;padding:6px 14px" data-comp="${c}">${c}${active?' ✓':''}</button>`
        }).join('')}
      </div>
      ${sel.length ? `<div style="display:grid;gap:6px;margin-bottom:10px">
        ${sel.map((s,i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--surface-2);border-radius:8px">
            <strong style="flex:1">${s.name}</strong>
            <select data-comp-tag="${i}" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;background:var(--surface);color:var(--text)">
              ${['Repaired','Replaced','New','Cleaned','Checked'].map(t =>
                `<option ${t===s.tag?'selected':''}>${t}</option>`).join('')}
            </select>
            <button type="button" data-remove-comp="${i}" style="color:var(--danger);background:none;border:none;font-size:20px;line-height:1;padding:0 4px">×</button>
          </div>`).join('')}
      </div>` : ''}
      ${modalActions()}
    </form></div>`
  }

  if (type === 'inv-add') return `<div class="modal-backdrop"><form class="modal" data-form="inv-add" style="max-width:500px">
    <h2>Add Inventory Item</h2>
    <div class="form-grid">
      ${fld('Name','name')}${fld('SKU','sku')}${fld('Category','category','General')}
      ${fld('Selling Price','price','0','number')}
      ${fld('Cost Price','cost','0','number')}
      ${fld('Quantity','qty','0','number')}
      ${fld('Min Stock Alert','min_qty','0','number')}
    </div>
    ${modalActions()}
  </form></div>`

  if (type === 'inv-edit') {
    const item = (state.data.inventory||[]).find(p => String(p.id) === String(id))
    if (!item) return `<div class="modal-backdrop"><div class="modal"><p>Not found.</p><div class="modal-actions"><button class="secondary-button" data-close>Close</button></div></div></div>`
    return `<div class="modal-backdrop"><form class="modal" data-form="inv-edit" style="max-width:500px">
      <h2>Edit Item</h2>
      <input type="hidden" name="id" value="${item.id}">
      <div class="form-grid">
        ${fld('Name','name',item.name)}${fld('SKU','sku',item.sku)}${fld('Category','category',item.category)}
        ${fld('Selling Price','price',item.price,'number')}
        ${fld('Cost Price','cost',item.cost,'number')}
        ${fld('Quantity','qty',item.qty,'number')}
        ${fld('Min Stock Alert','min_qty',item.min_qty,'number')}
      </div>
      ${modalActions()}
    </form></div>`
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
            <h2 style="margin:0">INV-${s.id}</h2>
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
      'button,[data-modal],[data-close],[data-action],[data-comp],[data-remove-comp],' +
      '[data-settings-tab],[data-kpi-target],[data-pp-key],[data-te-remove],' +
      '[data-remove-quick],[data-remove-qitem],[data-add-qprice],[data-remove-qprice],' +
      '[data-inv-edit],[data-inv-delete],[data-settle-id],[data-view-ticket]'
    )
    if (!el) return

    if (el.dataset.ppKey !== undefined) { handlePpKey(el.dataset.ppKey, verifyAdminLocal, render); return }
    if (el.dataset.close !== undefined) { state.modal = null; render(); return }

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

    if (el.dataset.settingsTab) { adminState.settingsTab = el.dataset.settingsTab; render(); return }
    if (el.dataset.modal) { state.modal = { type:el.dataset.modal, id:el.dataset.id }; render(); return }

    if (el.dataset.action === 'go-pos') {
      const { navigate } = await import('../router.js')
      navigate('/pos'); return
    }
    if (el.dataset.action === 'go-workshop') {
      const { navigate } = await import('../router.js')
      navigate('/workshop'); return
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
      navigate('/login', { force: true })
      renderLogin(onLoginSuccess); return
    }

    if (el.dataset.action === 'edit-employee') {
      state.modal = { type:'employee', editMode:true,
        id:el.dataset.empId, name:el.dataset.empName,
        role:el.dataset.empRole, status:el.dataset.empStatus, email:el.dataset.empEmail }
      render(); return
    }

    if (el.dataset.action === 'remove-employee') {
      const name = el.dataset.empName || 'this employee'
      const empId = el.dataset.empId
      openPinPrompt('admin', async () => {
        const { error } = await sb.from('employees').delete().eq('id', empId)
        if (error) {
          if (error.message.includes('foreign key') || error.message.includes('violates')) {
            await sb.from('employees').update({ status:'Inactive' }).eq('id', empId)
            alert(`${name} has transaction history. Set to Inactive instead.`)
          } else { alert('Error: ' + error.message); return }
        }
        await sb.from('active_sessions').delete().eq('employee_id', String(empId))
        await load()
      }, render); return
    }

    if (el.dataset.action === 'open-ticket-editor') {
      const tk = state.data.tickets.find(t => String(t.id) === String(el.dataset.ticketId))
      if (!tk) return
      const pt = (tk.components_noted||[]).reduce((s,c) => s+Number(c.price||0), 0)
      adminState.teLabour = Math.max(0, Number(tk.estimated_quote||0)-pt)
      state.modal = { type:'ticket-editor', id:el.dataset.ticketId }; render(); return
    }

    if (el.dataset.action === 'admin-collect') {
      const found = state.data.tickets.find(t => String(t.id) === String(el.dataset.ticketId))
      if (!found) return
      sessionStorage.setItem('retailos_collect_ticket', String(found.id))
      const { navigate } = await import('../router.js')
      navigate('/pos'); return
    }

    if (el.dataset.action === 'te-add-comp') {
      const name = document.getElementById('te-new-comp')?.value?.trim()
      const cond = document.getElementById('te-new-cond')?.value || 'New'
      if (!name) return
      const tk = state.data.tickets.find(t => String(t.id) === String(state.modal?.id))
      if (!tk) return
      document.querySelectorAll('[data-te-price]').forEach((inp,i) => {
        if (tk.components_noted[i]) tk.components_noted[i].price = Number(inp.value)||0
      })
      adminState.teLabour = Number(document.getElementById('te-labour')?.value||0)
      tk.components_noted = [...tk.components_noted, { name, condition:cond, price:0 }]
      render(); return
    }
    if (el.dataset.teRemove !== undefined) {
      const tk = state.data.tickets.find(t => String(t.id) === String(state.modal?.id))
      if (!tk) return
      document.querySelectorAll('[data-te-price]').forEach((inp,i) => {
        if (tk.components_noted[i]) tk.components_noted[i].price = Number(inp.value)||0
      })
      adminState.teLabour = Number(document.getElementById('te-labour')?.value||0)
      tk.components_noted.splice(Number(el.dataset.teRemove), 1); render(); return
    }
    if (el.dataset.action === 'te-save') {
      const tk = state.data.tickets.find(t => String(t.id) === String(state.modal?.id))
      if (!tk) return
      document.querySelectorAll('[data-te-price]').forEach((inp,i) => {
        if (tk.components_noted[i]) tk.components_noted[i].price = Number(inp.value)||0
      })
      const labour  = Number(document.getElementById('te-labour')?.value||0)
      const pt      = tk.components_noted.reduce((s,c) => s+Number(c.price||0), 0)
      const { error } = await sb.from('tickets').update({
        components_noted: tk.components_noted, estimated_quote: pt+labour, labour_cost: labour
      }).eq('id', tk.id)
      if (error) { alert('Save failed: '+error.message); return }
      adminState.teLabour = null; state.modal = null; await load(); return
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
        receiptNo: `INV-${sale.id}`, date: sale.created_at,
        cashier: sale.employee_name||'Counter', customer: sale.customer_name||'Walk-in',
        items: (sale.items_sold||[]).map(i => ({
          name:i.name, qty:i.qty||1, soldPrice:i.sold_price||i.soldPrice||0,
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
      CFG.quick_components = [...(CFG.quick_components||[]), val]; render(); return
    }
    if (el.dataset.action === 'save-quick-comps') {
      const { error } = await sb.from('shop_config').update({ quick_components:CFG.quick_components }).eq('id',1)
      if (error) { alert('Save failed: '+error.message); return }
      alert('Components saved.'); await load(); return
    }
    if (el.dataset.removeQuick !== undefined) {
      const comps = [...(CFG.quick_components||[])]
      comps.splice(Number(el.dataset.removeQuick), 1); CFG.quick_components = comps; render(); return
    }

    if (el.dataset.action === 'add-qitem') {
      const val = document.getElementById('qitem-name')?.value?.trim(); if (!val) return
      CFG.quick_items = [...(CFG.quick_items||[]), { name:val, prices:[] }]; render(); return
    }
    if (el.dataset.action === 'save-qitems') {
      const { error } = await sb.from('shop_config').update({ quick_items:CFG.quick_items }).eq('id',1)
      if (error) { alert('Save failed: '+error.message); return }
      alert('Quick items saved.'); await load(); return
    }
    if (el.dataset.removeQitem !== undefined) {
      const items = [...(CFG.quick_items||[])]
      items.splice(Number(el.dataset.removeQitem), 1); CFG.quick_items = items; render(); return
    }
    if (el.dataset.addQprice !== undefined) {
      const idx = Number(el.dataset.addQprice)
      const val = Number(document.getElementById(`qprice-input-${idx}`)?.value)
      if (!val || val <= 0) return
      CFG.quick_items[idx].prices.push(val); render(); return
    }
    if (el.dataset.removeQprice !== undefined) {
      const [i,pi] = el.dataset.removeQprice.split('-').map(Number)
      CFG.quick_items[i].prices.splice(pi, 1); render(); return
    }

    if (el.dataset.comp !== undefined) {
      const name = el.dataset.comp
      const sel  = state.modal.selectedComponents || []
      const idx  = sel.findIndex(s => s.name === name)
      if (idx >= 0) sel.splice(idx, 1); else sel.push({ name, tag:'Repaired', price:0 })
      state.modal.selectedComponents = sel
      const form = document.querySelector("[data-form='repair']")
      if (form) state.modal._draft = Object.fromEntries(new FormData(form).entries())
      render(); return
    }
    if (el.dataset.removeComp !== undefined) {
      const sel = state.modal.selectedComponents || []
      sel.splice(Number(el.dataset.removeComp), 1)
      state.modal.selectedComponents = sel
      const form = document.querySelector("[data-form='repair']")
      if (form) state.modal._draft = Object.fromEntries(new FormData(form).entries())
      render(); return
    }

    if (el.dataset.invEdit) { state.modal = { type:'inv-edit', id:el.dataset.invEdit }; render(); return }
    if (el.dataset.invDelete) {
      if (!confirm('Delete this item?')) return
      const { error } = await sb.from('inventory').delete().eq('id', Number(el.dataset.invDelete))
      if (error) { alert('Error: '+error.message); return }
      await load(); return
    }

    if (el.dataset.settleId) {
      const udharId = Number(el.dataset.settleId)
      const amount  = Number(document.querySelector(`[data-settle-amount="${udharId}"]`)?.value)
      const method  = document.querySelector(`[data-settle-method="${udharId}"]`)?.value || 'Cash'
      if (!amount || amount <= 0) { alert('Enter a valid amount.'); return }
      openPinPrompt('settle', async () => {
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
      state.modal = { type:'ticketDetail', id:String(viewTicketEl.dataset.viewTicket) }
      render(); return
    }
  })

  // Input
  app.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.filter !== undefined) { adminState.filter = t.value; render() }
    if (t.dataset.receiptSearch !== undefined) { adminState.receiptSearch = t.value; render() }
    if (t.dataset.receiptFrom !== undefined) { adminState.receiptDateFrom = t.value; render() }
    if (t.dataset.receiptTo   !== undefined) { adminState.receiptDateTo   = t.value; render() }
    if (t.dataset.tePrice !== undefined || t.dataset.teLabour !== undefined) {
      const prices = [...document.querySelectorAll('[data-te-price]')].reduce((s,inp) => s+(Number(inp.value)||0), 0)
      const labour = Number(document.getElementById('te-labour')?.value||0)
      const el     = document.getElementById('te-total')
      if (el) el.textContent = money(prices+labour)
    }
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
    if (t.dataset.compTag !== undefined) {
      const sel = state.modal?.selectedComponents || []
      const idx = Number(t.dataset.compTag)
      if (sel[idx]) {
        sel[idx].tag = t.value
        const form = document.querySelector("[data-form='repair']")
        if (form) state.modal._draft = Object.fromEntries(new FormData(form).entries())
        render()
      }
    }
  })

  // Submit
  app.addEventListener('submit', async e => {
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    const type = form.dataset.form

    if (type === 'repair') {
      const sel = state.modal?.selectedComponents || []
      const res = await createTicket({
        customerName:data.customerName, customerPhone:data.customerPhone,
        deviceBrand:data.deviceBrand, deviceModel:data.deviceModel, imei:data.imei,
        components:sel.map(s => ({ name:s.name, condition:s.tag, price:0 })),
        estimatedQuote:Number(data.estimatedQuote||0), advance:Number(data.advance||0),
        advanceMethod:data.advanceMethod||'', technicianNote:data.technicianNote||'',
      }, SESSION.employee?.name)
      if (!res.ok) { alert('Error saving ticket: '+res.error); return }
      const { buildTicketSlip, printThermal } = await import('../print/print.js')
      state.modal = null; printThermal(buildTicketSlip(res.data)); await load(); return
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

    if (type === 'inv-add') {
      const { error } = await sb.from('inventory').insert({
        name:data.name, sku:data.sku||'', category:data.category||'General',
        price:Number(data.price||0), cost:Number(data.cost||0),
        qty:Number(data.qty||0), min_qty:Number(data.min_qty||0),
      })
      if (error) { alert('Error: '+error.message); return }
      await logInventoryEvent(); state.modal = null; await load(); return
    }

    if (type === 'inv-edit') {
      const { error } = await sb.from('inventory').update({
        name:data.name, sku:data.sku, category:data.category,
        price:Number(data.price), cost:Number(data.cost),
        qty:Number(data.qty), min_qty:Number(data.min_qty),
      }).eq('id', Number(data.id))
      if (error) { alert('Error: '+error.message); return }
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

async function verifyAdminLocal(pin) {
  return String(pin)===String(CFG.admin_password)||String(pin)===String(CFG.override_pin)
    ? { ok:true } : { ok:false }
}

/* ── Public ── */
export async function initAdmin(sess, module, query) {
  SESSION = sess
  state.role = sess.isAdmin ? 'Business Owner' : (sess.employee?.role || 'Manager')
  if (module) adminState.adminModule = module
  await load()
}

function onLoginSuccess(sess) {
  SESSION = sess
  state.role = sess.isAdmin ? 'Business Owner' : (sess.employee?.role || '')
  initAdmin(sess)
}