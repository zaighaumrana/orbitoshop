import { createClient } from '@supabase/supabase-js'

/* ── Supabase ── */
export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON
)

let _platform = null
function getPlatform() {
  if (!_platform) _platform = createClient(
    import.meta.env.VITE_PLATFORM_URL,
    import.meta.env.VITE_PLATFORM_ANON
  )
  return _platform
}

export const CLIENT_ID         = Number(import.meta.env.VITE_CLIENT_ID || 1)
export const CLIENT_EVENT_RATE = 5
export const CLIENT_INV_RATE   = 1

export async function logBillEvent() {
  try {
    await getPlatform().from('usage_logs').insert({
      client_id: CLIENT_ID, module_type: 'BILL',
      token_count: 1, rate_at_log: CLIENT_EVENT_RATE,
    })
  } catch (e) { console.warn('Billing log failed:', e.message) }
}

export async function logInventoryEvent() {
  try {
    await getPlatform().from('usage_logs').insert({
      client_id: CLIENT_ID, module_type: 'INVENTORY',
      token_count: 1, rate_at_log: CLIENT_INV_RATE,
    })
  } catch (e) { console.warn('Billing log failed:', e.message) }
}

/* ── Shared state ── */
export const state = {
  role:          'Business Owner',
  theme:         localStorage.getItem('retailos-theme') || 'light',
  online:        navigator.onLine,
  filter:        '',
  modal:         null,
  installPrompt: null,
  data:          { tickets:[], sales:[], employees:[], udhar:[], returns:[], inventory:[] },
}

/* ── Session ── */
export function _loadSession() {
  try {
    const s = sessionStorage.getItem('retailos_session')
    return s ? JSON.parse(s) : { employee: null, isAdmin: false }
  } catch { return { employee: null, isAdmin: false } }
}
export function _saveSession(SESSION, route, module) {
  try {
    sessionStorage.setItem('retailos_session', JSON.stringify(SESSION))
    sessionStorage.setItem('retailos_route',   route  || '')
    sessionStorage.setItem('retailos_module',  module || 'dashboard')
  } catch {}
}
export function _clearSession() {
  try {
    ['retailos_session','retailos_route','retailos_module']
      .forEach(k => sessionStorage.removeItem(k))
  } catch {}
}

/* ── CFG ── */
export let CFG = {
  shop_name: 'RetailOS Shop', shop_address: '', shop_phone: '',
  shop_logo: '', shop_description: '', primary_color: '#126c5b',
  secondary_color: '#e9b949', currency: 'Rs.', tax_rate: 0,
  terms_text: 'Warranty: 30 days on parts replaced.',
  owner_email: '', owner_password: '', admin_password: '1234',
  override_pin: '1234', discount_pin_required: true,
  partial_udhar_allowed: true,
  quick_components: ['Screen','Battery','Body','Board','Camera','Mic',
    'Speaker','Charging Port','Back Glass','SIM Tray','Power Button','Volume Button'],
  quick_items: [],
  repair_module_enabled: true, inventory_module_enabled: false,
  technician_module_enabled: true, live_tracking_enabled: false,
  ems_enabled: false, suspended: false,
}

export async function loadConfig() {
  const { data, error } = await sb.from('shop_config').select('*').single()
  if (error) { console.warn('Config load failed:', error.message); return }
  Object.assign(CFG, data)
  if (typeof CFG.quick_components === 'string') {
    try { CFG.quick_components = JSON.parse(CFG.quick_components) } catch {}
  }
  if (typeof CFG.quick_items === 'string') {
    try { CFG.quick_items = JSON.parse(CFG.quick_items) } catch { CFG.quick_items = [] }
  }
  if (!Array.isArray(CFG.quick_items)) CFG.quick_items = []
}

export function applyBranding() {
  document.documentElement.dataset.theme = state.theme
  document.documentElement.style.setProperty('--primary',   CFG.primary_color   || '#126c5b')
  document.documentElement.style.setProperty('--secondary', CFG.secondary_color || '#e9b949')
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', CFG.primary_color || '#126c5b')
  if (CFG.shop_logo) {
    const fav = document.getElementById('dynamic-favicon')
    if (fav) { fav.href = CFG.shop_logo; fav.type = 'image/png' }
  }
}

export function currentTenant() {
  return {
    name:                CFG.shop_name        || 'My Shop',
    address:             CFG.shop_address     || '',
    phone:               CFG.shop_phone       || '',
    logo:                CFG.shop_logo        || '',
    primaryColor:        CFG.primary_color    || '#126c5b',
    secondaryColor:      CFG.secondary_color  || '#e9b949',
    currency:            CFG.currency         || 'Rs.',
    taxRate:             Number(CFG.tax_rate  || 0),
    receiptFooter:       CFG.terms_text       || '',
    repairModuleEnabled: CFG.repair_module_enabled !== false,
  }
}

/* ── Helpers ── */
export const money = (v, sym) =>
  `${sym || CFG.currency || 'Rs.'} ${Number(v||0).toLocaleString(undefined,{maximumFractionDigits:0})}`
export const fld = (label, name, val = '', type = 'text') =>
  `<label class="field"><span>${label}</span><input name="${name}" type="${type}"${type === 'number' ? ' step="any"' : ''} value="${String(val).replaceAll('"','&quot;')}"></label>`
export const modalActions = () =>
  `<div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button">Save</button></div>`
export const statusBadge = s => {
  const bad=['Suspended','Cancelled','Declined'], good=['Active','Delivered','Ready','Settled']
  return `<span class="badge ${bad.includes(s)?'bad':good.includes(s)?'good':'warn'}">${s}</span>`
}

/* ── Access control ── */
export const ACCESS = {
  'Business Owner': ['dashboard','repairs','inventory','reports','receipts','employees','settings','pos','workshop'],
  'Manager':        ['dashboard','repairs','inventory','reports','receipts','employees'],
  'Cashier':        ['pos'],
  'Technician':     ['workshop'],
}
export function can(mod, role) {
  if (mod === 'repairs'   && !CFG.repair_module_enabled)    return false
  if (mod === 'inventory' && !CFG.inventory_module_enabled) return false
  if (mod === 'workshop'  && !CFG.technician_module_enabled) return false
  return ACCESS[role]?.includes(mod) ?? false
}

/* ── Auth ── */
export async function verifyLogin(email, password) {
  const { data, error } = await sb
    .from('employees')
    .select('id, name, role, status, email')
    .eq('email', email.toLowerCase().trim())
    .eq('password', password)
    .eq('status', 'Active')
    .single()
  if (error || !data) return { ok: false }
  return { ok: true, employee: { id: data.id, name: data.name, role: data.role, email: data.email } }
}

export function validatePassword(p) {
  if (!p || p.length < 8)      return 'At least 8 characters required.'
  if (!/[A-Za-z]/.test(p))     return 'Must contain at least one letter.'
  if (!/[0-9]/.test(p))        return 'Must contain at least one number.'
  if (!/[^A-Za-z0-9]/.test(p)) return 'Must contain at least one special character.'
  return null
}

/* ── Ticket ops ── */
export function generateTicketNumber() {
  return `FP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
}

export async function createTicket(payload, employeeName) {
  const { data, error } = await sb.from('tickets').insert({
    ticket_number:    generateTicketNumber(),
    customer_name:    payload.customerName   || '',
    customer_phone:   payload.customerPhone  || '',
    device_brand:     payload.deviceBrand    || '',
    device_model:     payload.deviceModel    || '',
    imei:             payload.imei           || '',
    components_noted: payload.components     || [],
    estimated_quote:  Number(payload.estimatedQuote || 0),
    advance_payment:  Number(payload.advance        || 0),
    advance_method:   payload.advanceMethod  || '',
    status:           'Pending',
    technician_note:  payload.technicianNote || '',
    created_by:       employeeName           || 'Counter',
  }).select().single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data }
}

export async function updateTicket(id, updates) {
  const mapped = {}
  if (updates.components     !== undefined) mapped.components_noted = updates.components
  if (updates.status         !== undefined) mapped.status           = updates.status
  if (updates.declineReason  !== undefined) mapped.decline_reason   = updates.declineReason
  if (updates.technicianNote !== undefined) mapped.technician_note  = updates.technicianNote
  if (updates.settledAt      !== undefined) mapped.settled_at       = updates.settledAt
  if (updates.update_note    !== undefined) mapped.update_note      = updates.update_note
  if (updates.actual_quote   !== undefined) mapped.actual_quote     = updates.actual_quote
  if (updates.labour_cost    !== undefined) mapped.labour_cost      = updates.labour_cost
  const { error } = await sb.from('tickets').update(mapped).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/* ── PIN prompt shared state ── */
export let ppBuffer   = ''
export let ppPurpose  = ''
export let ppCallback = null

export function openPinPrompt(purpose, callback, renderFn) {
  ppBuffer   = ''
  ppPurpose  = purpose
  ppCallback = callback
  state.modal = { type: 'pinPrompt', purpose }
  renderFn()
}

export function pinPromptHTML(purpose) {
  const label = {
    admin:    'Admin password required',
    settle:   'Admin PIN to settle credit',
    return:   'Admin PIN to process return',
    discount: 'PIN required to apply discount',
  }[purpose] || 'Verify identity'
  return `
    <div class="modal" style="max-width:340px">
      <h2>${label}</h2>
      <div id="pp-display" style="text-align:center;font-size:30px;letter-spacing:16px;min-height:48px;border-bottom:2px solid var(--border);padding-bottom:8px;margin:10px 0">····</div>
      <div id="pp-error" class="hidden" style="color:var(--danger);text-align:center;font-size:13px;margin-bottom:8px">Wrong PIN.</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k =>
          `<button class="secondary-button" style="font-size:20px;min-height:50px" data-pp-key="${k}">${k}</button>`
        ).join('')}
      </div>
      <div class="modal-actions" style="margin-top:10px">
        <button class="secondary-button" data-close>Cancel</button>
      </div>
    </div>`
}

export async function handlePpKey(key, verifyFn, renderFn) {
  const display = document.getElementById('pp-display')
  const errEl   = document.getElementById('pp-error')
  if (!display) return
  if (key === '⌫') { ppBuffer = ppBuffer.slice(0,-1) }
  else if (key === '✓') { await _submitPp(verifyFn, renderFn); return }
  else { if (ppBuffer.length >= 6) return; ppBuffer += String(key) }
  display.textContent = '●'.repeat(ppBuffer.length).padEnd(4,'·')
  if (errEl) errEl.classList.add('hidden')
  if (ppBuffer.length >= 4) await _submitPp(verifyFn, renderFn)
}

async function _submitPp(verifyFn, renderFn) {
  const pin = ppBuffer; ppBuffer = ''
  const res = await verifyFn(pin)
  if (res.ok) { state.modal = null; ppCallback && ppCallback() }
  else {
    const errEl   = document.getElementById('pp-error')
    const display = document.getElementById('pp-display')
    if (errEl)   errEl.classList.remove('hidden')
    if (display) display.textContent = '····'
  }
}