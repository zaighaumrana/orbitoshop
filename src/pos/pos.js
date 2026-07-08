/* ═══════════════════════════════════════════════════════════════════
   RetailOS — pos.js
   Roles served: Cashier
   Single attachEvents() architecture, router-driven navigation.
═══════════════════════════════════════════════════════════════════ */
import {
  leaveRequestHTML,
  submitLeaveRequest,
  handleClockOut,
} from '../admin/ems.js'

import {
  sb, state, CFG, loadConfig, applyBranding, currentTenant,
  _clearSession,
  money, fld, modalActions,
  openPinPrompt, pinPromptHTML, handlePpKey,
  logBillEvent,
} from '../shared.js'

import { navigate } from '../router.js'

/* ── POS-only state ── */
const posState = {
  cart:            [],
  checkoutPayment: 'Cash',
  cashTendered:    0,
  cartTicketId:    null,      // ticket id currently in cart (Place Order mode)
  cartIsNewTicket: false,     // true if this cart line is a brand-new ticket being placed
  cartAdvancePaid: 0,         // sum of payments already entered for this ticket
  udharName:       '',
  udharPhone:      '',
  invSearch:       '',
  repairSearch:    '',
}

let SESSION = {}
let _eventsAttached = false

/* ── Load ── */
async function load() {
  await loadConfig()
  const fetchInv = CFG.inventory_module_enabled
    ? sb.from('inventory').select('*').order('name')
    : Promise.resolve({ data: [] })
  const [tickets, sales, udhar, returns_, inv, quickItems, repairComponents] = await Promise.all([
    sb.from('tickets').select('*').order('id', { ascending: false }),
    sb.from('sales').select('*').order('id', { ascending: false }),
    sb.from('udhar').select('*').order('id', { ascending: false }),
    sb.from('returns').select('*').order('id', { ascending: false }),
    fetchInv,
    sb.from('quick_items').select('*').order('sort_order'),
    sb.from('repair_components').select('*').order('sort_order'),
  ])
  state.data = {
    tickets:          tickets.data          || [],
    sales:            sales.data            || [],
    employees:        [],
    udhar:            udhar.data            || [],
    returns:          returns_.data         || [],
    inventory:        inv.data              || [],
    quickItems:       quickItems.data       || [],
    repairComponents: repairComponents.data || [],
  }
  applyBranding()
  render()

  // Handoff from admin "Collect" button
  const handoffId = sessionStorage.getItem('retailos_collect_ticket')
  if (handoffId) {
    sessionStorage.removeItem('retailos_collect_ticket')
    const found = state.data.tickets.find(t => String(t.id) === String(handoffId))
    if (found) openCollectTicket(found)
  }
}

/* ── Render ── */
function render() {
  if (!SESSION.employee) { navigate('/login'); return }
  if (CFG.suspended) {
    document.getElementById('app').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  height:100vh;gap:16px;text-align:center;padding:24px">
        <div style="font-size:48px">🔒</div>
        <h2 style="color:var(--danger)">Account Suspended</h2>
        <p class="muted" style="max-width:360px;line-height:1.6">Contact your service provider.</p>
      </div>`
    return
  }
  const tenant = currentTenant()

  document.getElementById('app').innerHTML = `
    <div class="app-shell client-shell">
      <main class="main">
        <header class="topbar">
          <div class="brand top-brand">
            <div class="logo">${tenant.logo?`<img alt="" src="${tenant.logo}">`:tenant.name.slice(0,2).toUpperCase()}</div>
            <div>
              <strong>${tenant.name}</strong>
              <span class="muted" style="font-size:12px">Cashier · POS Counter</span>
            </div>
          </div>
          <div class="top-actions">
            <span class="chip"><strong style="font-size:12px">${SESSION.employee.name}</strong></span>
            <span class="chip"><i class="dot ${state.online?'':'offline'}"></i>${state.online?'Online':'Offline'}</span>
            ${state.installPrompt?`<button class="icon-button" data-action="install">Install</button>`:''}
            <button class="icon-button" data-action="theme">${state.theme==='dark'?'Light':'Dark'}</button>
            ${CFG.ems_enabled && !(SESSION.isAdmin || SESSION.employee?.role === 'Business Owner') ? `
              <button class="secondary-button" style="font-size:12px" data-action="ems-clock-out">
                🕐 Clock Out
              </button>
            ` : ''}
            <button class="icon-button" data-action="logout" style="color:var(--danger)">Logout</button>
          </div>
        </header>
        <section class="content">${posView()}</section>
      </main>
    </div>
    ${renderModal()}`

  if (!_eventsAttached) {
    attachEvents()
    _eventsAttached = true
  }
}

/* ── POS View ── */
function posView() {
  const tenant   = currentTenant()
  const subtotal = posState.cart.reduce((s,i) => s + i.soldPrice * i.qty, 0)
  const disc     = posState.cart.reduce((s,i) => s + (i.originalPrice - i.soldPrice) * i.qty, 0)
  const tax      = subtotal * (tenant.taxRate / 100)
  const grandTotal = subtotal + tax
  const tendered = posState.cashTendered || 0
  const change   = tendered - grandTotal
  const hasTicketInCart = posState.cart.some(i => i.isTicket)

  return `
    <div class="page-title">
      <div>
        <h1>Point of Sale</h1>
        <p class="muted">Counter · ${tenant.name} · <strong>${SESSION.employee.name}</strong></p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="secondary-button" data-action="shift-stats">📋 Shift Stats</button>
        ${CFG.repair_module_enabled ? `
          <button class="primary-button" data-modal="repair">+ New Ticket</button>
          <button class="secondary-button" data-action="open-repair-collection">🔧 Repairs</button>` : ''}
        ${CFG.ems_enabled && !(SESSION.isAdmin || SESSION.employee?.role === 'Business Owner') ? `
          <button class="secondary-button" data-action="open-leave-request">📋 Leave</button>
        ` : ''}
          <button class="secondary-button" data-action="open-return">↩ Return</button>
        <button class="secondary-button" data-action="open-udhar">₨ Credits</button>
      </div>
    </div>
    <div class="grid pos-layout">
      <div class="grid" style="align-content:start;gap:12px">
        ${quickItemsPanel()}
        ${inventoryPanel()}
        ${recentRepairPanel()}
      </div>
      <aside class="card cart">
        <h2>Cart</h2>
        ${posState.cart.length ? posState.cart.map(item => `
          <div class="cart-line">
            <div>
              <strong>${item.name}</strong><br>
              <small class="muted">
                ${item.isTicket ? '' : money(item.soldPrice) + ' each'}
                ${item.reason?' · '+item.reason:''}
              </small>
            </div>
            ${item.isTicket ? `
              <div></div>
            ` : `
              <div class="qty-controls">
                <button data-qty="${item.productId}" data-delta="-1">−</button>
                <strong>${item.qty}</strong>
                <button data-qty="${item.productId}" data-delta="1">+</button>
              </div>`}
            ${item.isTicket ?
              `<button class="secondary-button" style="font-size:12px" data-remove-cart-item="${item.productId}">Remove</button>` :
              `<button class="secondary-button" data-modal="override" data-id="${item.productId}">Price</button>`}
          </div>`).join('') : `<div class="empty">No items in cart.</div>`}

        <div class="totals">
          <div class="total-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
          ${disc>0?`<div class="total-row"><span>Discounts</span><strong style="color:var(--success)">− ${money(disc)}</strong></div>`:''}
          ${tax>0?`<div class="total-row"><span>Tax ${tenant.taxRate}%</span><strong>${money(tax)}</strong></div>`:''}
          <div class="total-row grand"><span>Total</span><strong>${money(grandTotal)}</strong></div>
        </div>

        ${!hasTicketInCart ? `
        <select class="tenant-switcher" data-action="payment">
          ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer','Udhar (Credit)'].map(m=>
            `<option ${posState.checkoutPayment===m?'selected':''}>${m}</option>`).join('')}
        </select>
        ${posState.checkoutPayment === 'Cash' ? `
          <div style="display:grid;gap:6px;margin-top:4px">
            <label style="font-size:13px;font-weight:500;color:var(--muted)">Cash Received</label>
            <input type="number" step="any" min="0" placeholder="Enter amount received"
              value="${tendered||''}" data-cash-tendered
              style="border:1px solid var(--border);border-radius:8px;padding:9px 12px;
                     background:var(--surface);color:var(--text);font-size:16px;width:100%">
            ${tendered>0?`
            <div style="display:flex;justify-content:space-between;padding:9px 12px;border-radius:8px;font-weight:600;font-size:15px;
                background:${change>=0?'color-mix(in srgb,#22c55e 12%,var(--surface))':'color-mix(in srgb,#ef4444 12%,var(--surface))'}">
              <span>${change>=0?'Change Due':'Short by'}</span>
              <span style="color:${change>=0?'#22c55e':'#ef4444'}">${money(Math.abs(change))}</span>
            </div>` : ''}
          </div>` : ''}
        ${posState.checkoutPayment === 'Udhar (Credit)' ? `
          <div style="display:grid;gap:8px;margin-top:4px">
            <input class="search" placeholder="Customer name *" data-udhar="name" value="${posState.udharName||''}">
            <input class="search" placeholder="Customer phone *" data-udhar="phone" value="${posState.udharPhone||''}">
          </div>` : ''}
        ` : `
          <p class="muted" style="font-size:12px;margin-top:4px">
            Repair ticket — confirming this will place the order and print the ticket slip.
            Payment already recorded for this ticket is tracked separately.
          </p>
        `}

        <button class="primary-button" data-action="${hasTicketInCart ? 'place-order' : 'checkout'}"
          ${posState.cart.length?'':'disabled'}>
          ${hasTicketInCart ? 'Place Order' : 'Checkout & Receipt'}
        </button>
      </aside>
    </div>`
}

function quickItemsPanel() {
  if (!(state.data.quickItems||[]).length) return `
    <div class="card">
      <h2 style="margin-bottom:12px">Custom Item</h2>
      ${customItemEntry()}
    </div>`
  return `
    <div class="card">
      <h2 style="margin-bottom:12px">Quick Items</h2>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        ${state.data.quickItems.map(item=>`
          <button class="secondary-button" style="font-size:15px;padding:11px 18px;border-radius:10px;font-weight:500"
            data-qitem-name="${item.name}" data-qitem-prices='${JSON.stringify(item.prices)}'>
            ${item.name}
          </button>`).join('')}
      </div>
      <div style="border-top:1px solid var(--border);padding-top:12px">
        <p style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Custom / One-off Item</p>
        ${customItemEntry()}
      </div>
    </div>`
}

function customItemEntry() {
  return `
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:end">
      <label class="field" style="margin:0"><span style="font-size:12px">Item Name</span>
        <input id="custom-item-name" placeholder="e.g. Screen Guard" style="font-size:13px"></label>
      <label class="field" style="margin:0"><span style="font-size:12px">Price</span>
        <input id="custom-item-price" type="number" step="any" min="0" placeholder="0" style="width:90px;font-size:13px"></label>
      <button class="primary-button" style="padding:9px 14px;font-size:13px;white-space:nowrap" data-action="add-custom-item">+ Add</button>
    </div>`
}

function inventoryPanel() {
  if (!CFG.inventory_module_enabled) return ''
  const invItems = (state.data.inventory||[]).filter(i=>Number(i.qty||0)>0)
  if (!invItems.length) return ''
  const f = (posState.invSearch||'').toLowerCase()
  const filtered = f ? invItems.filter(i=>(i.name||'').toLowerCase().includes(f)||(i.category||'').toLowerCase().includes(f)) : invItems
  return `
    <div class="card">
      <h2 style="margin-bottom:10px">Stock Items</h2>
      <input placeholder="Search stock…" value="${posState.invSearch||''}" data-inv-search
        style="width:100%;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text);font-size:14px">
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${filtered.slice(0,24).map(i=>`
          <button class="secondary-button" style="font-size:13px;padding:8px 14px;border-radius:8px;text-align:left"
            data-inv-pos-add="${i.id}" data-inv-pos-name="${i.name}" data-inv-pos-price="${i.price}">
            <div style="font-weight:600">${i.name}</div>
            <div style="font-size:11px;color:var(--muted)">${money(i.price)} · ${i.qty} left</div>
          </button>`).join('')}
      </div>
    </div>`
}

/* Main screen — only 3 most recent PENDING (balance_due > 0) tickets */
function recentRepairPanel() {
  if (!CFG.repair_module_enabled) return `
    <div class="card"><h2>Quick Sale</h2>
      <p class="muted" style="font-size:13px">Add items using the cart panel.</p>
    </div>`
  const pending = (state.data.tickets||[])
    .filter(t => !t.parent_ticket_id) // only show parent/original tickets on this quick panel
    .filter(t => Number(t.balance_due||0) > 0 || !t.is_locked)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3)

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2 style="margin:0">Recent Repair Tickets</h2>
        <button class="secondary-button" style="font-size:12px" data-action="open-repair-collection">View All</button>
      </div>
      ${pending.length ? pending.map(t => repairRowHTML(t)).join('') : `<div class="empty">No pending tickets.</div>`}
    </div>`
}

function repairRowHTML(t) {
  const balance = Number(t.balance_due ?? t.final_total ?? t.estimated_quote ?? 0)
  return `
    <div class="list-row" style="margin-bottom:6px">
      <div>
        <strong>${t.customer_name}</strong>
        <span class="badge warn" style="margin-left:6px">${t.status}</span><br>
        <small class="muted">${t.invoice_number || t.ticket_number} · ${t.device_brand} ${t.device_model}</small>
        ${balance > 0 ? `<br><small class="muted">Balance: ${money(balance)}</small>` : ''}
      </div>
      <button class="primary-button" style="font-size:12px;padding:6px 10px" data-collect-ticket="${t.id}">
        ${t.is_locked ? 'Collect' : 'Place Order'}
      </button>
    </div>`
}

/* ── Shift stats ── */
function buildShiftStats() {
  const tenant    = currentTenant()
  const todayStr  = new Date().toISOString().slice(0,10)
  const empName   = SESSION.employee?.name || ''
  const shiftSales = (state.data.sales||[]).filter(s=>(s.created_at||'').slice(0,10)===todayStr&&(!empName||s.employee_name===empName))
  const itemsSold  = shiftSales.reduce((s,sale)=>s+(sale.items_sold||[]).reduce((x,i)=>x+(i.qty||1),0),0)
  const revenue    = shiftSales.reduce((s,sale)=>s+Number(sale.total_bill||0),0)
  const cashOnly   = shiftSales.filter(s=>s.payment_method==='Cash').reduce((s,sale)=>s+Number(sale.total_bill||0),0)
  const discounts  = shiftSales.reduce((s,sale)=>s+Number(sale.discount||0),0)
  const custCount  = new Set(shiftSales.map(s=>s.customer_name).filter(Boolean)).size
  const allTickets = state.data.tickets||[]
  const shiftTkts  = allTickets.filter(t=>(t.created_at||'').slice(0,10)===todayStr&&(!empName||t.created_by===empName))
  const pendingAll = allTickets.filter(t=>!t.parent_ticket_id && (Number(t.balance_due||0)>0 || !t.is_locked))
  return `
    <div class="shift-print">
      <center><strong>${tenant.name}</strong><br>Shift Summary — ${todayStr}<br>${empName||'All Staff'}</center>
      <hr style="border:none;border-top:1px dashed #bbb;margin:8px 0">
      <div class="stat-row"><span>Products sold</span><span>${itemsSold}</span></div>
      <div class="stat-row"><span>Total revenue</span><span>${money(revenue)}</span></div>
      <div class="stat-row"><span>Cash collected</span><span>${money(cashOnly)}</span></div>
      <div class="stat-row"><span>Discounts given</span><span>${money(discounts)}</span></div>
      <div class="stat-row"><span>Customers served</span><span>${custCount}</span></div>
      ${CFG.repair_module_enabled?`
      <hr style="border:none;border-top:1px dashed #bbb;margin:8px 0">
      <div class="stat-row"><span>Tickets this shift</span><span>${shiftTkts.length}</span></div>
      <div class="stat-row"><span>All pending (shop)</span><span>${pendingAll.length}</span></div>
      `:''}
      <hr style="border:none;border-top:1px dashed #bbb;margin:8px 0">
      <center style="color:#888;font-size:11px">Printed ${new Date().toLocaleString()}</center>
    </div>`
}

/* ── Helpers for new ticket form draft state ── */
function getDraft() {
  if (!state.modal._draft) {
    state.modal._draft = {
      components: [],   // [{name, tag, customText, price}]
      payments:   [],   // [{amount, method}]
      labour:     0,
      overridePrice: null,
    }
  }
  return state.modal._draft
}

function calcDraftTotal(draft) {
  if (draft.overridePrice !== null && draft.overridePrice !== '') {
    return Number(draft.overridePrice) || 0
  }
  const partsTotal = draft.components.reduce((s,c) => s + Number(c.price||0), 0)
  return partsTotal + Number(draft.labour||0)
}

function calcDraftPaid(draft) {
  return draft.payments.reduce((s,p) => s + Number(p.amount||0), 0)
}

/* ── Repair ticket form modal ── */
function repairTicketFormHTML() {
  const comps    = state.data.repairComponents || []
  const draft    = getDraft()
  const dInfo    = state.modal._info || {}
  const total    = calcDraftTotal(draft)
  const paid     = calcDraftPaid(draft)
  const balance  = Math.max(0, total - paid)
  const hasItemized = draft.components.length > 0 || Number(draft.labour||0) > 0

  return `<div class="modal-backdrop">
    <form class="modal" data-form="repair" style="max-width:720px;max-height:92vh;overflow-y:auto">
      <h2>New Repair Ticket</h2>

      <div class="form-grid">
        <label class="field"><span>Customer Name *</span>
          <input name="customerName" required value="${dInfo.customerName||''}"></label>
        <label class="field"><span>Customer Phone *</span>
          <input name="customerPhone" type="tel" required value="${dInfo.customerPhone||''}"></label>
        <label class="field"><span>Device Brand *</span>
          <input name="deviceBrand" required value="${dInfo.deviceBrand||''}"></label>
        <label class="field"><span>Device Model *</span>
          <input name="deviceModel" required value="${dInfo.deviceModel||''}"></label>
        <label class="field" style="grid-column:1/-1"><span>IMEI / Serial</span>
          <input name="imei" value="${dInfo.imei||''}"></label>
      </div>

      <p class="muted" style="font-size:13px;margin:12px 0 6px">Tap to flag an issue:</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        ${comps.map(c => `
          <button type="button" class="secondary-button" style="font-size:13px;padding:6px 14px"
            data-pick-comp="${c.name}">${c.name}</button>`).join('')}
      </div>

      ${draft.components.length ? `
        <div style="display:grid;gap:8px;margin-bottom:12px">
          ${draft.components.map((c,i) => `
            <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;
                        padding:8px;background:var(--surface-2);border-radius:8px">
              <div>
                <strong style="font-size:13px">${c.name}</strong><br>
                <span class="muted" style="font-size:12px">
                  ${c.tag === 'Custom' ? (c.customText || '—') : c.tag}
                </span>
              </div>
              <input type="number" step="any" min="0" placeholder="Price (optional)"
                value="${c.price||''}" data-draft-comp-price="${i}"
                style="width:110px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
              <button type="button" data-draft-comp-remove="${i}"
                style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer">×</button>
            </div>`).join('')}
        </div>` : ''}

      <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface-2);
                  border-radius:8px;margin-bottom:12px">
        <label style="flex:1;font-size:13px;font-weight:500">Labour Charge</label>
        <input type="number" step="any" min="0" value="${draft.labour||''}" placeholder="0" data-draft-labour
          style="width:120px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;background:var(--surface);color:var(--text)">
      </div>

      ${draft.overridePrice !== null ? `
        <div style="padding:10px;background:var(--surface-2);border-radius:8px;margin-bottom:12px">
          <label style="font-size:13px;font-weight:500;display:block;margin-bottom:6px">Manual Quote Override</label>
          <input type="number" step="any" min="0" value="${draft.overridePrice}" data-draft-override
            style="width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 10px;
                   background:var(--surface);color:var(--text);font-size:16px;font-weight:600">
          <button type="button" data-action="draft-clear-override" style="font-size:12px;margin-top:6px;
            background:none;border:none;color:var(--primary);cursor:pointer">Switch back to itemized</button>
        </div>` : `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px;background:var(--surface-2);border-radius:8px;margin-bottom:12px">
          <span style="font-size:14px;font-weight:600">Quote Total: ${money(total)}</span>
          <button type="button" data-action="draft-set-override" title="Enter one price manually"
            style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;
                   font-size:16px;cursor:pointer">✏️</button>
        </div>`}

      <div style="border-top:1px solid var(--border);padding-top:12px;margin-bottom:8px">
        <p style="font-size:13px;font-weight:600;margin-bottom:8px">Payments Received</p>
        ${draft.payments.length ? draft.payments.map((p,i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:6px 10px;background:var(--surface-2);border-radius:6px;margin-bottom:6px;font-size:13px">
            <span>${money(p.amount)} · ${p.method}</span>
            <button type="button" data-draft-payment-remove="${i}"
              style="color:var(--danger);background:none;border:none;font-size:16px;cursor:pointer">×</button>
          </div>`).join('') : `<p class="muted" style="font-size:13px">No payment recorded yet.</p>`}
        <div style="display:flex;gap:8px;margin-top:8px">
          <input type="number" step="any" min="0" placeholder="Amount" id="draft-pay-amount"
            style="flex:1;border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
          <select id="draft-pay-method"
            style="border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
            ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m => `<option>${m}</option>`).join('')}
          </select>
          <button type="button" class="secondary-button" data-action="draft-add-payment">+ Add</button>
        </div>
      </div>

      <div style="display:grid;gap:6px;padding:12px;background:var(--surface-2);border-radius:8px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:14px">
          <span>Quote Total</span><strong data-draft-total>${money(total)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;color:var(--success)">
          <span>Paid So Far</span><strong data-draft-paid>${money(paid)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;
                    border-top:1px solid var(--border);padding-top:6px">
          <span>Remaining Balance</span><span data-draft-balance>${money(balance)}</span>
        </div>
      </div>

      <label class="field"><span>Technician / Intake Note</span>
        <textarea name="technicianNote" style="min-height:56px">${dInfo.technicianNote||''}</textarea></label>

      <div class="modal-actions" style="margin-top:12px">
        <button type="button" class="secondary-button" data-close>Cancel</button>
        <button class="primary-button">Create & Add to Cart</button>
      </div>
    </form>
  </div>`
}

/* ── Component tag picker (sub-modal) ── */
function compTagPickerHTML(name) {
  return `<div class="modal-backdrop" data-no-backdrop-close>
    <div class="modal" style="max-width:380px">
      <h2>${name}</h2>
      <p class="muted" style="font-size:13px">What's the issue?</p>
      <div style="display:grid;gap:8px;margin-top:10px">
        <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-pick="Broken">Broken</button>
        <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-pick="Not Working">Not Working</button>
        <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-pick="Custom">Custom…</button>
        <div id="tag-custom-wrap" class="hidden" style="display:grid;gap:8px">
          <input id="tag-custom-text" class="search" placeholder="Describe the issue">
          <button type="button" class="primary-button" data-action="confirm-custom-tag">Add</button>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancel</button>
      </div>
    </div>
  </div>`
}

/* ── Repair Collection modal — unified dynamic search ── */
function repairCollectionHTML() {
  const search = posState.repairSearch.toLowerCase()
  const pending = (state.data.tickets||[])
    .filter(t => !t.parent_ticket_id)
    .filter(t => Number(t.balance_due||0) > 0 || !t.is_locked)
    .filter(t => !search || (
      `${t.customer_name} ${t.customer_phone} ${t.device_brand} ${t.device_model} ${t.imei} ${t.ticket_number} ${t.invoice_number||''}`
        .toLowerCase().includes(search)
    ))
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))

  return `<div class="modal-backdrop">
    <div class="modal" style="max-width:600px;max-height:85vh;overflow-y:auto">
      <h2>Repair Collection</h2>
      <input class="search" placeholder="Search name, phone, device, IMEI, ticket #…"
        data-repair-search value="${posState.repairSearch}"
        style="width:100%;margin:10px 0;font-size:14px">
      <p class="muted" style="font-size:12px;margin-bottom:10px">${pending.length} pending ticket${pending.length!==1?'s':''}</p>
      ${pending.length ? `<div style="display:grid;gap:8px">${pending.map(t => repairRowHTML(t)).join('')}</div>` :
        `<div class="empty">No pending tickets match.</div>`}
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
      </div>
    </div>
  </div>`
}

/* ── Ticket payment / collect modal — for adding a top-up payment to existing ticket ── */
function ticketPaymentModalHTML(ticket) {
  const total   = Number(ticket.final_total || ticket.estimated_quote || 0)
  const paid    = Number(ticket.amount_paid || 0)
  const balance = Math.max(0, total - paid)
  return `<div class="modal-backdrop">
    <div class="modal" style="max-width:480px">
      <h2>${ticket.invoice_number || ticket.ticket_number}</h2>
      <p class="muted">${ticket.customer_name} · ${ticket.device_brand} ${ticket.device_model}</p>
      <div style="display:grid;gap:6px;padding:12px;background:var(--surface-2);border-radius:8px;margin:12px 0">
        <div style="display:flex;justify-content:space-between"><span>Total</span><strong>${money(total)}</strong></div>
        <div style="display:flex;justify-content:space-between;color:var(--success)"><span>Paid</span><strong>${money(paid)}</strong></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid var(--border);padding-top:6px">
          <span>Remaining</span><span>${money(balance)}</span>
        </div>
      </div>
      ${balance > 0 ? `
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input type="number" step="any" min="0" placeholder="Amount to pay now" id="topup-amount"
            style="flex:1;border:1px solid var(--border);border-radius:6px;padding:8px 10px;background:var(--surface);color:var(--text)">
          <select id="topup-method" style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;background:var(--surface);color:var(--text)">
            ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m => `<option>${m}</option>`).join('')}
          </select>
        </div>
        <button class="primary-button" style="width:100%" data-action="add-to-cart-for-payment" data-ticket-id="${ticket.id}">
          Add to Cart for Payment
        </button>
      ` : `<p class="muted">This ticket is fully paid.</p>`}
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
      </div>
    </div>
  </div>`
}

function openCollectTicket(ticket) {
  if (!ticket.is_locked) {
    // Ticket was never placed (shouldn't normally happen) — open edit form
    alert('This ticket has not been placed yet.')
    return
  }
  state.modal = { type: 'ticket-payment', ticket }
  render()
}

/* ── Modal dispatcher ── */
function renderModal() {
  if (!state.modal) return ''
  const { type } = state.modal

  if (type === 'leave-request') return leaveRequestHTML()

  if (type === 'leave-request') return leaveRequestHTML()

  if (type === 'pinPrompt') return `<div class="modal-backdrop">${pinPromptHTML(state.modal.purpose)}</div>`

  if (type === 'shiftStats') return `<div class="modal-backdrop">
    <div class="modal" style="max-width:480px">
      <h2>Shift Stats</h2>
      <div class="shift-print-wrap">${buildShiftStats()}</div>
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
        <button class="primary-button" data-action="print-shift">Print / Save PDF</button>
      </div>
    </div></div>`

  if (type === 'receipt') return `<div class="modal-backdrop">
    <div class="modal">
      <h2>${state.modal.isTicketSlip ? 'Repair Ticket' : 'Receipt'}</h2>
      ${receiptPreview(state.modal.sale)}
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
        <button class="primary-button" data-action="print-receipt">Print / Save PDF</button>
      </div>
    </div></div>`

  if (type === 'repair')          return repairTicketFormHTML()
  if (type === 'comp-tag-picker') return compTagPickerHTML(state.modal.name)
  if (type === 'repair-collection') return repairCollectionHTML()
  if (type === 'ticket-payment')  return ticketPaymentModalHTML(state.modal.ticket)

  if (type === 'override') {
    const cartItem = posState.cart.find(i=>i.productId===state.modal.id)
    return `<div class="modal-backdrop"><form class="modal" data-form="override">
      <h2>Price Override</h2>
      <p class="muted">Original: ${money(cartItem?.originalPrice||0)}</p>
      ${fld('Sold Price','soldPrice',cartItem?.soldPrice||0,'number')}
      <label class="field"><span>Reason for Discount</span><textarea name="reason">${cartItem?.reason||''}</textarea></label>
      ${modalActions()}
    </form></div>`
  }

  if (type === 'udharInfo') return `<div class="modal-backdrop"><form class="modal" data-form="udharInfo" style="max-width:420px">
    <h2>Credit Sale — Customer Details</h2>
    <div class="form-grid">${fld('Customer Name','udharName')}${fld('Customer Phone','udharPhone','','tel')}</div>
    ${modalActions()}
  </form></div>`

  if (type === 'udharList') {
    const outstanding = (state.data.udhar||[]).filter(u => u.status !== 'Settled')
    return `<div class="modal-backdrop"><div class="modal" style="max-width:640px">
      <h2>Outstanding Credits</h2>
      ${outstanding.length===0?`<div class="empty">No outstanding credits.</div>`:`<div style="display:grid;gap:10px">
        ${outstanding.map(u => `
          <div style="padding:12px;background:var(--surface-2);border-radius:8px;display:grid;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
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
              <select data-settle-method="${u.id}"
                style="border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
                ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m => `<option>${m}</option>`).join('')}
              </select>
              <button class="primary-button" data-settle-id="${u.id}">Settle</button>
            </div>
          </div>`).join('')}
      </div>`}
      <div class="modal-actions"><button class="secondary-button" data-close>Close</button></div>
    </div></div>`
  }

  if (type === 'returnFlow') {
    const receiptInput = state.modal.receiptNo||''
    const saleId = receiptInput.replace('INV-','')
    const sale   = (state.data.sales||[]).find(s=>String(s.id)===String(saleId))
    if (!sale) return `<div class="modal-backdrop"><form class="modal" data-form="return-lookup" style="max-width:440px">
      <h2>Process Return</h2>
      <p class="muted">Enter the invoice number from the original receipt.</p>
      ${fld('Invoice No. (e.g. INV-42)','receiptNo',receiptInput)}
      ${state.modal.notFound?`<p style="color:var(--danger);font-size:13px">Invoice not found.</p>`:''}
      <div class="modal-actions"><button class="secondary-button" data-close>Cancel</button><button class="primary-button">Look Up</button></div>
    </form></div>`
    const items = sale.items_sold||[]
    return `<div class="modal-backdrop"><form class="modal" data-form="return-confirm" style="max-width:560px">
      <h2>Return — INV-${sale.id}</h2>
      <p class="muted">${sale.customer_name||'Walk-in'} · ${new Date(sale.created_at).toLocaleDateString()}</p>
      <div style="display:grid;gap:8px;margin:10px 0">
        ${items.map((item,i)=>`
          <label style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface-2);border-radius:8px">
            <input type="checkbox" name="ret_${i}" value="${i}" checked>
            <span style="flex:1">${item.name} × ${item.qty}</span>
            <strong>${money((item.sold_price||item.soldPrice||0)*item.qty)}</strong>
          </label>`).join('')}
      </div>
      <label class="field"><span>Refund Method</span>
        <select name="refundMethod">${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m => `<option>${m}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Notes</span><textarea name="notes"></textarea></label>
      <input type="hidden" name="saleId" value="${sale.id}">
      <div class="modal-actions"><button class="secondary-button" data-close>Cancel</button><button class="primary-button">Process Return</button></div>
    </form></div>`
  }

  if (type === 'qitem-pick') {
    const { name, prices } = state.modal
    return `<div class="modal-backdrop"><div class="modal" style="max-width:340px">
      <h2>${name}</h2><p class="muted">Select price:</p>
      <div style="display:grid;gap:8px;margin-top:8px">
        ${(prices||[]).map((p,i)=>`<button class="secondary-button" style="font-size:16px;min-height:48px" data-pick-price="${i}">${money(p)}</button>`).join('')}
      </div>
      <div class="modal-actions"><button class="secondary-button" data-close>Cancel</button></div>
    </div></div>`
  }

  return ''
}

function receiptPreview(sale) {
  if (!sale) return ''
  const t = currentTenant()
  return `<div class="receipt-preview">
    <center>${t.logo?`<img src="${t.logo}" style="max-width:120px;max-height:44px;object-fit:contain;margin-bottom:6px"><br>`:''}
    <strong>${t.name}</strong><br>${t.address||''}<br>${t.phone||''}</center>
    <hr>
    Receipt: ${sale.receiptNo||'—'}<br>Date: ${sale.date?new Date(sale.date).toLocaleString():new Date().toLocaleString()}<br>
    Cashier: ${sale.cashier||'Counter'}<br>Customer: ${sale.customer||'Walk-in'}
    <hr>
    ${(sale.items||[]).map(i=>`${i.name}<br><small>${i.qty||1} × ${money(i.soldPrice||0)}${i.discount>0?` (disc ${money(i.discount)})`:''}</small>`).join('<br>')}
    <hr>
    ${sale.discount>0?`Discount: ${money(sale.discount)}<br>`:''}
    ${sale.tax>0?`Tax: ${money(sale.tax)}<br>`:''}
    <strong>Total: ${money(sale.total)}</strong><br>Payment: ${sale.payment||'—'}
    ${sale.payment==='Cash'&&sale.cashTendered>0?`<br>Cash Received: <strong>${money(sale.cashTendered)}</strong><br>Change Given: <strong>${money(sale.changeGiven||0)}</strong>`:''}
    <hr>
    <center>${t.receiptFooter||''}</center>
  </div>`
}

/* ── Cart helpers ── */
function updateQty(productId, delta) {
  const item = posState.cart.find(i=>i.productId===productId)
  if (!item) return
  item.qty += delta
  posState.cart = posState.cart.filter(i=>i.qty>0)
  render()
}

function removeCartItem(productId) {
  posState.cart = posState.cart.filter(i=>i.productId!==productId)
  if (!posState.cart.some(i => i.isTicket)) {
    posState.cartTicketId = null
    posState.cartIsNewTicket = false
  }
  render()
}

/* ── Settle Udhar ── */
async function settleUdhar(udharId, amount, method) {
  const rec = state.data.udhar.find(u=>u.id===udharId)
  if (!rec) return
  const history = rec.payment_history||[]
  history.push({ date: new Date().toISOString().slice(0,10), paid: amount, method })
  const newPaid    = Number(rec.amount_paid)+Number(amount)
  const newBalance = Math.max(0,Number(rec.total_amount)-newPaid)
  const { error } = await sb.from('udhar').update({
    amount_paid:newPaid, balance_due:newBalance, payment_history:history,
    status:newBalance<=0?'Settled':'Partial',
    settled_at:newBalance<=0?new Date().toISOString():null,
  }).eq('id',udharId)
  if (error) { alert('Settle error: '+error.message); return }
  await load()
  state.modal = { type:'udharList' }
  render()
}

/* ── Place Order: lock the ticket, create the invoice ── */
async function placeOrder() {
  const ticketItem = posState.cart.find(i => i.isTicket)
  if (!ticketItem) return

  if (ticketItem.isNewTicket) {
    // Brand new ticket being placed for the first time
    const draft = ticketItem.draftData
    const total = calcDraftTotal(draft)
    const paid  = calcDraftPaid(draft)

    const ticketNumber  = generateTicketNumber()
    const { data, error } = await sb.from('tickets').insert({
      ticket_number:     ticketNumber,
      invoice_number:    ticketNumber,
      customer_name:      ticketItem.customerName,
      customer_phone:     ticketItem.customerPhone,
      device_brand:       ticketItem.deviceBrand,
      device_model:       ticketItem.deviceModel,
      imei:                ticketItem.imei,
      components_noted:   draft.components,
      labour_cost:         Number(draft.labour||0),
      estimated_quote:     total,
      final_total:         total,
      amount_paid:         paid,
      balance_due:         Math.max(0, total - paid),
      payment_history:     draft.payments,
      advance_payment:     paid,
      status:              'Pending',
      technician_note:     ticketItem.technicianNote || '',
      created_by:          SESSION.employee?.name || 'Counter',
      is_locked:           true,
      placed_at:           new Date().toISOString(),
    }).select().single()

    if (error) { alert('Error placing order: ' + error.message); return }

    await logBillEvent()

    const { buildTicketSlip, printThermal } = await import('../print/print.js')
    printThermal(buildTicketSlip(data))

    posState.cart = posState.cart.filter(i => !i.isTicket)
    posState.cartTicketId = null
    posState.cartIsNewTicket = false
    await load()
    alert(`Order placed. Ticket ${ticketNumber} created.`)
    return
  }

  // Existing ticket — this is a top-up payment being added via cart
  const ticketId = ticketItem.ticketId
  const ticket = state.data.tickets.find(t => t.id === ticketId)
  if (!ticket) return

  const payAmount = ticketItem.topupAmount
  const payMethod = ticketItem.topupMethod
  const history = ticket.payment_history || []
  history.push({ amount: payAmount, method: payMethod, date: new Date().toISOString() })
  const newPaid = Number(ticket.amount_paid||0) + Number(payAmount)
  const newBalance = Math.max(0, Number(ticket.final_total||ticket.estimated_quote||0) - newPaid)

  const { error } = await sb.from('tickets').update({
    amount_paid: newPaid,
    balance_due: newBalance,
    payment_history: history,
    status: newBalance <= 0 ? 'Ready' : ticket.status,
    collected_at: newBalance <= 0 ? new Date().toISOString() : null,
  }).eq('id', ticketId)

  if (error) { alert('Error recording payment: ' + error.message); return }

  await logBillEvent()

  posState.cart = posState.cart.filter(i => !i.isTicket)
  posState.cartTicketId = null
  posState.cartIsNewTicket = false
  await load()
  alert(`Payment of ${money(payAmount)} recorded. Remaining balance: ${money(newBalance)}`)
}

function generateTicketNumber() {
  return `FP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
}

/* ── Standard checkout (retail items, no ticket in cart) ── */
async function doCheckout() {
  const isUdhar  = posState.checkoutPayment === 'Udhar (Credit)'
  const subtotal = posState.cart.reduce((s,i)=>s+i.soldPrice*i.qty,0)
  const discount = posState.cart.reduce((s,i)=>s+(i.originalPrice-i.soldPrice)*i.qty,0)
  const tax      = subtotal*(Number(CFG.tax_rate||0)/100)
  const total    = subtotal+tax

  if (isUdhar && (!posState.udharName?.trim()||!posState.udharPhone?.trim())) {
    state.modal = { type:'udharInfo' }; render(); return
  }

  const { data:saleData, error:saleErr } = await sb.from('sales').insert({
    ticket_id:      null,
    customer_name:  posState.udharName||'',
    items_sold:     posState.cart.map(i=>({ name:i.name, qty:i.qty, original_price:i.originalPrice, sold_price:i.soldPrice, discount:i.discount, reason:i.reason||'' })),
    discount,
    tax,
    total_bill:     Math.max(0,total),
    payment_method: isUdhar?'Udhar':posState.checkoutPayment,
    employee_id:    SESSION.employee?.id||null,
    employee_name:  SESSION.employee?.name||'',
    cash_tendered:  posState.checkoutPayment==='Cash'?(posState.cashTendered||0):0,
    change_given:   posState.checkoutPayment==='Cash'?Math.max(0,(posState.cashTendered||0)-Math.max(0,total)):0,
  }).select().single()
  if (saleErr) { alert('Sale error: '+saleErr.message); return }

  if (isUdhar) await sb.from('udhar').insert({
    sale_id:saleData.id, customer_name:posState.udharName, customer_phone:posState.udharPhone,
    total_amount:Math.max(0,total), amount_paid:0, balance_due:Math.max(0,total), payment_history:[], status:'Outstanding',
  })

  const sale = {
    receiptNo:`INV-${saleData.id}`, date:saleData.created_at,
    cashier:SESSION.employee?.name||'Counter', customer:posState.udharName||'Walk-in',
    items:posState.cart.map(i=>({...i})), tax, discount,
    total:Math.max(0,total), payment:isUdhar?'Udhar':posState.checkoutPayment,
    cashTendered:posState.checkoutPayment==='Cash'?(posState.cashTendered||0):0,
    changeGiven:posState.checkoutPayment==='Cash'?Math.max(0,(posState.cashTendered||0)-Math.max(0,total)):0,
  }

  posState.cart=[]
  posState.cashTendered=0
  posState.udharName=''; posState.udharPhone=''; posState.checkoutPayment='Cash'
  state.modal = { type:'receipt', sale }
  await logBillEvent()
  await load()
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT DELEGATION — called exactly once in initPOS
═══════════════════════════════════════════════════════════════════ */
function attachEvents() {
  const app = document.getElementById('app')

  /* ── Click ── */
  app.addEventListener('click', async e => {
    // Backdrop close — only when backdrop itself is the target
    if (e.target.classList.contains('modal-backdrop') && !e.target.hasAttribute('data-no-backdrop-close')) {
      state.modal = null; render(); return
    }

    const el = e.target.closest(
      'button,[data-close],[data-action],[data-modal],[data-qty],' +
      '[data-collect-ticket],[data-inv-pos-add],[data-qitem-name],' +
      '[data-pick-price],[data-tag-pick],[data-settle-id],' +
      '[data-draft-comp-remove],[data-draft-payment-remove],[data-remove-cart-item],' +
      '[data-pp-key]'
    )
    if (!el) return

    /* PIN numpad */
    if (el.dataset.ppKey !== undefined) {
      handlePpKey(el.dataset.ppKey, verifyAdminLocal, render); return
    }

    /* Close modal */
    if (el.dataset.close !== undefined) { state.modal = null; render(); return }

    /* Modal openers */
    if (el.dataset.modal) { state.modal = { type: el.dataset.modal, id: el.dataset.id }; render(); return }

    /* ── Top-bar ── */
    if (el.dataset.action === 'theme') {
      state.theme = state.theme==='dark'?'light':'dark'
      localStorage.setItem('retailos-theme', state.theme)
      applyBranding(); render(); return
    }
    if (el.dataset.action === 'ems-clock-out') {
      const { handleClockOut } = await import('../admin/ems.js')
      handleClockOut(SESSION, async () => {
        if (!confirm('Clocked out. Log out now?')) return
        _clearSession(); navigate('/login')
      })
      return
    }
    if (el.dataset.action === 'logout') {
      if (!confirm('Log out?')) return
      _clearSession(); navigate('/login'); return
    }
    if (el.dataset.action === 'install' && state.installPrompt) {
      state.installPrompt.prompt(); state.installPrompt = null; render(); return
    }

    /* ── Shift stats ── */
    if (el.dataset.action === 'shift-stats')  { state.modal = { type:'shiftStats' }; render(); return }
    if (el.dataset.action === 'print-shift')  { const { printThermal } = await import('../print/print.js'); printThermal(buildShiftStats()); return }
    if (el.dataset.action === 'print-receipt') {
      if (state.modal?.sale) {
        const { buildReceiptSlip, printThermal } = await import('../print/print.js')
        printThermal(buildReceiptSlip(state.modal.sale))
      }
      return
    }

    /* ── Repair collection modal ── */
    if (el.dataset.action === 'open-repair-collection') {
      posState.repairSearch = ''
      state.modal = { type:'repair-collection' }; render(); return
    }

    /* ── Quick collect from main screen row or repair collection modal ── */
    if (el.dataset.collectTicket) {
      const ticket = state.data.tickets.find(t => String(t.id) === String(el.dataset.collectTicket))
      if (!ticket) return
      state.modal = null; render()
      openCollectTicket(ticket); return
    }

    /* ── Add top-up payment to cart (from ticket-payment modal) ── */
    if (el.dataset.action === 'add-to-cart-for-payment') {
      const ticketId = el.dataset.ticketId
      const amount   = Number(document.getElementById('topup-amount')?.value || 0)
      const method   = document.getElementById('topup-method')?.value || 'Cash'
      if (!amount || amount <= 0) { alert('Enter a payment amount.'); return }
      const ticket = state.data.tickets.find(t => String(t.id) === String(ticketId))
      if (!ticket) return
      posState.cart = posState.cart.filter(i => !i.isTicket)
      posState.cart.push({
        productId:     `ticket-${ticket.id}`,
        name:          `Repair Payment: ${ticket.invoice_number||ticket.ticket_number} — ${ticket.device_brand} ${ticket.device_model}`,
        qty:           1,
        soldPrice:     amount,
        originalPrice: amount,
        discount:      0,
        reason:        '',
        isTicket:      true,
        isNewTicket:   false,
        ticketId:      ticket.id,
        topupAmount:   amount,
        topupMethod:   method,
      })
      posState.cartTicketId = ticket.id
      state.modal = null
      render(); return
    }

    /* ── Place Order (ticket in cart) ── */
    if (el.dataset.action === 'place-order') {
      await placeOrder(); return
    }

    /* ── Standard Checkout ── */
    if (el.dataset.action === 'checkout') {
      const hasDiscount = posState.cart.some(i => i.discount > 0)
      if (hasDiscount && CFG.discount_pin_required) {
        openPinPrompt('discount', async (verified) => {
        if (!verified) return
        await doCheckout()
      }, render); return
      }
      await doCheckout(); return
    }

    /* ── Cart qty + remove ── */
    if (el.dataset.qty) { updateQty(el.dataset.qty, Number(el.dataset.delta)); return }
    if (el.dataset.removeCartItem) { removeCartItem(el.dataset.removeCartItem); return }

    /* ── Custom item ── */
    if (el.dataset.action === 'add-custom-item') {
      const name  = document.getElementById('custom-item-name')?.value?.trim()
      const price = parseFloat(document.getElementById('custom-item-price')?.value || '0')
      if (!name)    { alert('Enter item name.'); return }
      if (price<=0) { alert('Enter valid price.'); return }
      posState.cart.push({ productId:`custom-${Date.now()}`, name, qty:1, originalPrice:price, soldPrice:price, discount:0, reason:'', isCustom:true })
      document.getElementById('custom-item-name').value = ''
      document.getElementById('custom-item-price').value = ''
      render(); return
    }

    /* ── Inventory POS tap ── */
    if (el.dataset.invPosAdd) {
      const id=Number(el.dataset.invPosAdd), name=el.dataset.invPosName, price=Number(el.dataset.invPosPrice)
      const key=`inv-${id}`
      const ex=posState.cart.find(i=>i.productId===key)
      if (ex) ex.qty+=1
      else posState.cart.push({ productId:key, name, qty:1, originalPrice:price, soldPrice:price, discount:0, reason:'', isInventory:true, inventoryId:id })
      render(); return
    }

    /* ── Quick items ── */
    if (el.dataset.qitemName) {
      const prices = JSON.parse(el.dataset.qitemPrices||'[]'), name = el.dataset.qitemName
      if (prices.length === 1) {
        posState.cart.push({ productId:`qi-${name}-${Date.now()}`, name, qty:1, originalPrice:prices[0], soldPrice:prices[0], discount:0, reason:'' })
        render()
      } else { state.modal = { type:'qitem-pick', name, prices }; render() }
      return
    }
    if (el.dataset.pickPrice !== undefined) {
      const { name, prices } = state.modal
      const price = prices[Number(el.dataset.pickPrice)]
      posState.cart.push({ productId:`qi-${name}-${Date.now()}`, name, qty:1, originalPrice:price, soldPrice:price, discount:0, reason:'' })
      state.modal = null; render(); return
    }

    /* ── Component tag picker ── */
    if (el.dataset.pickComp) {
      // Snapshot current form field values before switching to tag picker
      const form = document.querySelector("[data-form='repair']")
      if (form) {
        state.modal._info = Object.fromEntries(new FormData(form).entries())
      }
      state.modal = { type:'comp-tag-picker', name:el.dataset.pickComp, _draft:state.modal?._draft, _info:state.modal?._info }
      render(); return
    }
    if (el.dataset.tagPick) {
      const tag      = el.dataset.tagPick
      const compName = state.modal.name
      const parentDraft = state.modal._draft
      const parentInfo  = state.modal._info
      if (tag === 'Custom') {
        document.getElementById('tag-custom-wrap')?.classList.remove('hidden')
        return
      }
      if (!parentDraft) { state.modal = null; render(); return }
      parentDraft.components.push({ name:compName, tag, customText:'', price:0 })
      state.modal = { type:'repair', _draft:parentDraft, _info:parentInfo }
      render(); return
    }
    if (el.dataset.action === 'confirm-custom-tag') {
      const text     = document.getElementById('tag-custom-text')?.value?.trim()
      const compName = state.modal.name
      const parentDraft = state.modal._draft
      const parentInfo  = state.modal._info
      if (!text) { alert('Describe the issue.'); return }
      parentDraft.components.push({ name:compName, tag:'Custom', customText:text, price:0 })
      state.modal = { type:'repair', _draft:parentDraft, _info:parentInfo }
      render(); return
    }

    /* ── Draft form actions ── */
    if (el.dataset.draftCompRemove !== undefined) {
      const form = document.querySelector("[data-form='repair']")
      if (form) state.modal._info = Object.fromEntries(new FormData(form).entries())
      getDraft().components.splice(Number(el.dataset.draftCompRemove), 1); render(); return
    }
    if (el.dataset.draftPaymentRemove !== undefined) {
      const form = document.querySelector("[data-form='repair']")
      if (form) state.modal._info = Object.fromEntries(new FormData(form).entries())
      getDraft().payments.splice(Number(el.dataset.draftPaymentRemove), 1); render(); return
    }
    if (el.dataset.action === 'draft-add-payment') {
      const amount = Number(document.getElementById('draft-pay-amount')?.value||0)
      const method = document.getElementById('draft-pay-method')?.value||'Cash'
      if (!amount||amount<=0) { alert('Enter a payment amount.'); return }
      const form = document.querySelector("[data-form='repair']")
      if (form) state.modal._info = Object.fromEntries(new FormData(form).entries())
      getDraft().payments.push({ amount, method })
      document.getElementById('draft-pay-amount').value = ''
      render(); return
    }
    if (el.dataset.action === 'draft-set-override') {
      getDraft().overridePrice = ''
      render(); return
    }
    if (el.dataset.action === 'draft-clear-override') {
      getDraft().overridePrice = null
      render(); return
    }

    /* ── Udhar / Return ── */
    if (el.dataset.action === 'open-udhar')   { state.modal = { type:'udharList' };  render(); return }
    if (el.dataset.action === 'open-leave-request') {
      state.modal = { type: 'leave-request' }; render(); return
    }
  
    if (el.dataset.action === 'open-return')  { state.modal = { type:'returnFlow' }; render(); return }

    /* ── Settle Udhar ── */
    if (el.dataset.settleId) {
      const udharId = Number(el.dataset.settleId)
      const amount  = Number(document.querySelector(`[data-settle-amount="${udharId}"]`)?.value)
      const method  = document.querySelector(`[data-settle-method="${udharId}"]`)?.value||'Cash'
      if (!amount||amount<=0) { alert('Enter a valid amount.'); return }
      openPinPrompt('settle', async (verified) => {
        if (!verified) return
        await settleUdhar(udharId, amount, method)
      }, render); return
    }
  })

  /* ── Input ── */
  app.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.cashTendered !== undefined) {
      posState.cashTendered = Number(t.value)||0
      const subtotal = posState.cart.reduce((s,i)=>s+i.soldPrice*i.qty,0)
      const tax = subtotal*(Number(CFG.tax_rate||0)/100)
      const change = posState.cashTendered-(subtotal+tax)
      const existing = document.getElementById('change-display')
      if (existing) existing.remove()
      if (posState.cashTendered > 0) {
        const div = document.createElement('div')
        div.id = 'change-display'
        div.style.cssText = `display:flex;justify-content:space-between;padding:9px 12px;border-radius:8px;font-weight:600;font-size:15px;margin-top:4px;background:${change>=0?'color-mix(in srgb,#22c55e 12%,var(--surface))':'color-mix(in srgb,#ef4444 12%,var(--surface))'}`
        div.innerHTML = `<span>${change>=0?'Change Due':'Short by'}</span><span style="color:${change>=0?'#22c55e':'#ef4444'}">${money(Math.abs(change))}</span>`
        t.parentNode.insertBefore(div, t.nextSibling)
      }
    }
    if (t.dataset.invSearch !== undefined)    { posState.invSearch = t.value; render() }
    if (t.dataset.repairSearch !== undefined) { posState.repairSearch = t.value; render() }
    if (t.dataset.draftCompPrice !== undefined) {
      const idx = Number(t.dataset.draftCompPrice)
      const draft = getDraft()
      if (draft.components[idx]) { draft.components[idx].price = Number(t.value)||0; _refreshDraftTotals() }
    }
    if (t.dataset.draftLabour !== undefined) {
      getDraft().labour = Number(t.value)||0; _refreshDraftTotals()
    }
    if (t.dataset.draftOverride !== undefined) {
      getDraft().overridePrice = t.value; _refreshDraftTotals()
    }
  })

  /* ── Change ── */
  app.addEventListener('change', e => {
    const t = e.target
    if (t.dataset.action === 'payment') {
      posState.checkoutPayment = t.value; posState.cashTendered = 0; render(); return
    }
    if (t.dataset.udhar === 'name')  { posState.udharName  = t.value; return }
    if (t.dataset.udhar === 'phone') { posState.udharPhone = t.value; return }
  })

  /* ── Submit ── */
  app.addEventListener('submit', async e => {
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    const type = form.dataset.form

    if (type === 'repair') {
      const draft = getDraft()
      if (!data.customerName?.trim()) { alert('Customer name is required.'); return }
      if (!data.customerPhone?.trim()) { alert('Customer phone is required.'); return }
      if (!data.deviceBrand?.trim())  { alert('Device brand is required.'); return }
      if (!data.deviceModel?.trim())  { alert('Device model is required.'); return }

      const total = calcDraftTotal(draft)
      const paid  = calcDraftPaid(draft)

      // Don't actually save to DB yet — just add to cart as "new ticket"
      // Saving happens when "Place Order" is clicked
      posState.cart = posState.cart.filter(i => !i.isTicket)
      posState.cart.push({
        productId:     `new-ticket-${Date.now()}`,
        name:          `Repair: ${data.deviceBrand} ${data.deviceModel} (${data.customerName})`,
        qty:           1,
        soldPrice:     Math.max(0, total - paid),
        originalPrice: Math.max(0, total - paid),
        discount:      0,
        reason:        '',
        isTicket:      true,
        isNewTicket:   true,
        customerName:  data.customerName,
        customerPhone: data.customerPhone,
        deviceBrand:   data.deviceBrand,
        deviceModel:   data.deviceModel,
        imei:          data.imei||'',
        technicianNote:data.technicianNote||'',
        draftData:     { ...draft },
      })
      posState.cartIsNewTicket = true
      state.modal = null
      render(); return
    }

    if (type === 'udharInfo') {
      posState.udharName  = data.udharName
      posState.udharPhone = data.udharPhone
      state.modal = null
      await doCheckout(); return
    }

    if (type === 'return-lookup') {
      const raw  = data.receiptNo.trim().toUpperCase().replace('INV-','')
      const sale = (state.data.sales||[]).find(s=>String(s.id)===raw)
      state.modal = sale
        ? { type:'returnFlow', receiptNo:`INV-${sale.id}` }
        : { type:'returnFlow', notFound:true, receiptNo:data.receiptNo }
      render(); return
    }

    if (type === 'return-confirm') {
      const saleId   = Number(data.saleId)
      const sale     = (state.data.sales||[]).find(s=>s.id===saleId)
      const items    = sale?.items_sold||[]
      const returned = items.filter((_,i)=>data[`ret_${i}`]!==undefined)
      const refund   = returned.reduce((s,it)=>s+(it.sold_price||it.soldPrice||0)*it.qty,0)
      openPinPrompt('return', async (verified) => {
        if (!verified) return
        const { error } = await sb.from('returns').insert({
          original_sale_id:saleId, returned_items:returned,
          refund_amount:refund, processed_by:SESSION.employee?.id||null, notes:data.notes||''
        })
        if (error) { alert('Return error: '+error.message); return }
        const { buildReturnSlip, printThermal } = await import('../print/print.js')
        printThermal(buildReturnSlip({ saleId, items:returned, refund, method:data.refundMethod }))
        state.modal = null; await load()
      }, render); return
    }

    if (type === 'leave-request') {
      const result = await submitLeaveRequest(SESSION, data)
      if (!result.ok) { alert('Error: ' + result.error); return }
      state.modal = null
      alert('Leave request submitted. Your manager will review it.')
      render(); return
    }
    if (type === 'override') {
      const item = posState.cart.find(i=>i.productId===state.modal?.id)
      if (item) {
        item.soldPrice  = Number(data.soldPrice)
        item.discount   = Math.max(0, item.originalPrice - item.soldPrice)
        item.reason     = data.reason
      }
      state.modal = null; render(); return
    }
  })

  /* ── Keyboard ── */
  document.addEventListener('keydown', e => {
    if (document.getElementById('pp-display')) {
      if (e.key==='Enter'||e.key==='Return') { e.preventDefault(); handlePpKey('✓',verifyAdminLocal,render); return }
      if (e.key==='Backspace') { e.preventDefault(); handlePpKey('⌫',verifyAdminLocal,render); return }
      if (e.key==='Escape')   { e.preventDefault(); state.modal=null; render(); return }
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); handlePpKey(e.key,verifyAdminLocal,render); return }
    }
    if (e.key==='Escape' && state.modal && state.modal.type !== 'pinPrompt') {
      state.modal = null; render()
    }
  })
}

/* ── Live draft total refresh (no full re-render — just update the display) ── */
function _refreshDraftTotals() {
  try {
    const draft   = getDraft()
    const total   = calcDraftTotal(draft)
    const paid    = calcDraftPaid(draft)
    const balance = Math.max(0, total - paid)
    const tEl = document.querySelector('[data-draft-total]')
    const pEl = document.querySelector('[data-draft-paid]')
    const bEl = document.querySelector('[data-draft-balance]')
    if (tEl) tEl.textContent = money(total)
    if (pEl) pEl.textContent = money(paid)
    if (bEl) bEl.textContent = money(balance)
  } catch {}
}

async function verifyAdminLocal(pin) {
  return String(pin)===String(CFG.override_pin)
    ? { ok:true } : { ok:false }
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC ENTRY POINT
═══════════════════════════════════════════════════════════════════ */
export async function initPOS(sess) {
  SESSION = sess
  state.role = sess.employee?.role || 'Cashier'
  _eventsAttached = false  // reset so attachEvents fires once per initPOS call
  await load()
}
