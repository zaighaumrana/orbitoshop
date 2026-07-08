/* ═══════════════════════════════════════════════════════════════════
   RetailOS — ems.js
   Employee Management System
   Clock-in gate + Manager/Owner EMS dashboard
   Gated by: CFG.ems_enabled === true (set by platform app)
═══════════════════════════════════════════════════════════════════ */
import {
  sb, state, CFG, money,
  _clearSession,
} from '../shared.js'
import { navigate } from '../router.js'

/* ── EMS state ── */
const emsState = {
  tab:              'attendance',  // attendance | leaves | salary | slips
  attendanceFilter: '',
  leaveFilter:      'Pending',     // Pending | Approved | Rejected | all
  selectedEmployee: null,
  selectedMonth:    new Date().getMonth() + 1,
  selectedYear:     new Date().getFullYear(),
}

let SESSION         = {}
let _onProceed      = null   // callback after clock-in
let _eventsAttached = false

/* ════════════════════════════════════════════════════════════════
   CLOCK-IN GATE
   Call checkClockIn(SESSION, CFG, onProceed) before any view loads.
   If gate is needed it renders the clock-in screen.
   If not needed it calls onProceed() immediately.
════════════════════════════════════════════════════════════════ */
export async function checkClockIn(sess, cfg, onProceed) {
  SESSION    = sess
  _onProceed = onProceed

  // Owner never needs to clock in
  if (sess.isAdmin || sess.employee?.role === 'Business Owner') {
    onProceed(); return
  }

  // EMS not enabled for this client
  if (!cfg.ems_enabled) {
    onProceed(); return
  }

  // Check if employee has an open attendance record today
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sb.from('attendance')
    .select('id, clock_in, clock_out')
    .eq('employee_id', sess.employee.id)
    .eq('date', today)
    .order('id', { ascending: false })
    .limit(1)

  const record = data?.[0] || null

  if (record && !record.clock_out) {
    // Already clocked in today
    if (cfg.ems_track_breaks) {
      // Break tracking ON — show break/proceed screen
      renderBreakGate(sess, record)
    } else {
      // Break tracking OFF — pass straight through
      onProceed()
    }
    return
  }

  if (record && record.clock_out) {
    // Clocked out — need to clock back in
    if (cfg.ems_track_breaks) {
      renderClockInScreen(sess, true) // isReturn = true
    } else {
      // Break tracking OFF — treat clock-out as end of shift
      // They need to clock in fresh
      renderClockInScreen(sess, false)
    }
    return
  }

  // No record today — first clock-in of the day
  renderClockInScreen(sess, false)
}

/* ── Clock-in screen ── */
function renderClockInScreen(sess, isReturn) {
  const now  = new Date()
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;
                background:var(--bg);padding:24px">
      <div class="card" style="width:min(420px,95vw);display:grid;gap:24px;padding:32px;text-align:center">
        <div>
          <div style="font-size:48px;margin-bottom:8px">
            ${isReturn ? '👋' : '🕐'}
          </div>
          <h2 style="margin:0 0 6px">
            ${isReturn ? 'Welcome Back' : `Good ${_greeting()}, ${sess.employee.name.split(' ')[0]}!`}
          </h2>
          <p class="muted" style="font-size:13px">${date}</p>
        </div>

        <div style="background:var(--surface-2);border-radius:12px;padding:20px">
          <div style="font-size:36px;font-weight:700;font-variant-numeric:tabular-nums"
            id="live-clock">${time}</div>
          <p class="muted" style="font-size:13px;margin-top:4px">Current Time</p>
        </div>

        ${isReturn ? `
        <div style="background:color-mix(in srgb,var(--warning) 10%,var(--surface));
                    border:1px solid color-mix(in srgb,var(--warning) 30%,var(--border));
                    border-radius:8px;padding:12px;font-size:13px">
          You were on a break. Clock back in to continue your shift.
        </div>` : ''}

        <button class="primary-button" style="font-size:16px;padding:14px"
          id="clockin-btn">
          ${isReturn ? '⏱ Clock Back In' : '⏱ Clock In'}
        </button>

        <p class="muted" style="font-size:12px">
          ${sess.employee.role} · ${CFG.shop_name || 'RetailOS'}
        </p>
      </div>
    </div>`

  // Tick the live clock
  const clockEl = document.getElementById('live-clock')
  const ticker  = setInterval(() => {
    if (!clockEl || !document.body.contains(clockEl)) { clearInterval(ticker); return }
    clockEl.textContent = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  }, 10000)

  document.getElementById('clockin-btn').addEventListener('click', async () => {
    const btn = document.getElementById('clockin-btn')
    btn.disabled = true; btn.textContent = 'Clocking in…'
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await sb.from('attendance').insert({
      employee_id: sess.employee.id,
      clock_in:    new Date().toISOString(),
      date:        today,
    })
    if (error) { alert('Clock-in failed: ' + error.message); btn.disabled = false; btn.textContent = '⏱ Clock In'; return }
    clearInterval(ticker)
    _onProceed && _onProceed()
  })
}

/* ── Break gate (ems_track_breaks = true, already clocked in) ── */
function renderBreakGate(sess, record) {
  const clockedInAt  = new Date(record.clock_in)
  const elapsed      = Math.floor((Date.now() - clockedInAt) / 60000) // minutes
  const elapsedStr   = elapsed >= 60
    ? `${Math.floor(elapsed/60)}h ${elapsed%60}m`
    : `${elapsed}m`

  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;
                background:var(--bg);padding:24px">
      <div class="card" style="width:min(420px,95vw);display:grid;gap:20px;padding:32px;text-align:center">
        <div>
          <div style="font-size:48px;margin-bottom:8px">✅</div>
          <h2 style="margin:0 0 6px">You're Clocked In</h2>
          <p class="muted" style="font-size:13px">
            Since ${clockedInAt.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
            · ${elapsedStr} on shift
          </p>
        </div>

        <button class="primary-button" style="font-size:15px;padding:13px"
          id="proceed-btn">
          Continue to ${sess.employee.role === 'Manager' ? 'Dashboard' : sess.employee.role === 'Technician' ? 'Workshop' : 'POS'}
        </button>

        <button class="secondary-button" style="font-size:14px;padding:11px"
          id="breakout-btn">
          🍵 Clock Out for Break
        </button>

        <button class="icon-button" style="font-size:13px;color:var(--danger)"
          id="shiftend-btn">
          End Shift & Logout
        </button>
      </div>
    </div>`

  document.getElementById('proceed-btn').addEventListener('click', () => {
    _onProceed && _onProceed()
  })

  document.getElementById('breakout-btn').addEventListener('click', async () => {
    const btn = document.getElementById('breakout-btn')
    btn.disabled = true; btn.textContent = 'Clocking out…'
    await _clockOut(sess, record.id)
    renderClockInScreen(sess, true)
  })

  document.getElementById('shiftend-btn').addEventListener('click', async () => {
    if (!confirm('End your shift and log out?')) return
    await _clockOut(sess, record.id)
    _clearSession()
    navigate('/login')
  })
}

async function _clockOut(sess, attendanceId) {
  await sb.from('attendance')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', attendanceId)
}

function _greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

/* ════════════════════════════════════════════════════════════════
   EMS DASHBOARD
   Rendered inside the admin panel as a tab-like section
   Called by admin.js when adminModule === 'ems'
════════════════════════════════════════════════════════════════ */
export async function loadEMSData() {
  const today = new Date().toISOString().slice(0, 10)
  const [employees, attendance, leaves, salaryConfigs, slips] = await Promise.all([
    sb.from('employees').select('id, name, role, status, email').order('name'),
    sb.from('attendance').select('*, employees(name, role)')
      .order('clock_in', { ascending: false }).limit(200),
    sb.from('leaves').select('*, employees!leaves_employee_id_fkey(name, role)')
      .order('created_at', { ascending: false }),
    sb.from('salary_config').select('*, employees(name, role)'),
    sb.from('salary_slips').select('*, employees(name)').order('year', { ascending: false }).order('month', { ascending: false }),
  ])

  // Who is live clocked in right now
  const { data: liveNow } = await sb.from('attendance')
    .select('*, employees(name, role)')
    .eq('date', today)
    .is('clock_out', null)

  return {
    employees:     employees.data    || [],
    attendance:    attendance.data   || [],
    leaves:        leaves.data       || [],
    salaryConfigs: salaryConfigs.data|| [],
    slips:         slips.data        || [],
    liveNow:       liveNow           || [],
  }
}

export function emsView(emsData, sess) {
  SESSION = sess
  const tabs = [
    ['attendance', '🕐 Attendance'],
    ['leaves',     '📋 Leaves'],
    ['salary',     '💰 Salary'],
    ['slips',      '📄 Slips'],
  ]
  return `
    <div style="display:grid;gap:16px">
      <!-- Live now banner -->
      ${liveBanner(emsData.liveNow)}

      <!-- Tabs -->
      <div class="settings-tabs">
        ${tabs.map(([k,l]) => `
          <button class="settings-tab ${emsState.tab === k ? 'active' : ''}"
            data-ems-tab="${k}">${l}</button>`).join('')}
      </div>

      <!-- Tab content -->
      ${emsState.tab === 'attendance' ? attendanceTab(emsData) : ''}
      ${emsState.tab === 'leaves'     ? leavesTab(emsData)     : ''}
      ${emsState.tab === 'salary'     ? salaryTab(emsData)     : ''}
      ${emsState.tab === 'slips'      ? slipsTab(emsData)      : ''}
    </div>`
}

/* ── Live banner ── */
function liveBanner(liveNow) {
  if (!liveNow.length) return `
    <div style="padding:12px 16px;background:var(--surface-2);
                border-radius:10px;font-size:13px;color:var(--muted)">
      No employees currently clocked in.
    </div>`

  return `
    <div style="padding:12px 16px;background:color-mix(in srgb,var(--success) 10%,var(--surface));
                border:1px solid color-mix(in srgb,var(--success) 20%,var(--border));
                border-radius:10px">
      <p style="font-size:12px;font-weight:600;color:var(--muted);
                text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
        Currently On Shift
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${liveNow.map(r => {
          const since   = new Date(r.clock_in)
          const elapsed = Math.floor((Date.now() - since) / 60000)
          const dur     = elapsed >= 60
            ? `${Math.floor(elapsed/60)}h ${elapsed%60}m`
            : `${elapsed}m`
          return `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;
                        background:var(--surface);border-radius:8px;font-size:13px">
              <span style="width:8px;height:8px;background:var(--success);
                           border-radius:50%;flex-shrink:0"></span>
              <strong>${r.employees?.name || '—'}</strong>
              <span class="muted">${r.employees?.role || ''}</span>
              <span class="muted">· ${dur}</span>
            </div>`
        }).join('')}
      </div>
    </div>`
}

/* ── Attendance tab ── */
function attendanceTab(emsData) {
  const search  = emsState.attendanceFilter.toLowerCase()
  const records = emsData.attendance.filter(r =>
    !search || (r.employees?.name || '').toLowerCase().includes(search)
  )

  // Group by date
  const byDate = {}
  records.forEach(r => {
    const d = (r.date || r.clock_in?.slice(0,10) || '—')
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(r)
  })

  return `
    <div style="display:grid;gap:12px">
      <input class="search" placeholder="Search employee…"
        data-ems-attendance-filter value="${emsState.attendanceFilter}"
        style="max-width:300px">

      ${Object.keys(byDate).length === 0
        ? `<div class="empty">No attendance records yet.</div>`
        : Object.entries(byDate).map(([date, rows]) => `
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:10px 14px;background:var(--surface-2);
                      font-size:12px;font-weight:600;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px">
            ${new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
              weekday:'long', day:'numeric', month:'long', year:'numeric'
            })}
          </div>
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Employee</th><th>Role</th>
              <th>Clock In</th><th>Clock Out</th>
              <th>Duration</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const inTime  = new Date(r.clock_in)
                const outTime = r.clock_out ? new Date(r.clock_out) : null
                const durMin  = outTime ? Math.floor((outTime - inTime) / 60000) : null
                const durStr  = durMin !== null
                  ? `${Math.floor(durMin/60)}h ${durMin%60}m`
                  : '—'
                return `<tr>
                  <td><strong>${r.employees?.name || '—'}</strong></td>
                  <td>${r.employees?.role || '—'}</td>
                  <td>${inTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                  <td>${outTime ? outTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '<span class="badge warn">Active</span>'}</td>
                  <td>${durStr}</td>
                  <td>${outTime ? '<span class="badge good">Complete</span>' : '<span class="badge warn">On Shift</span>'}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table></div>
        </div>`).join('')}
    </div>`
}

/* ── Leaves tab ── */
function leavesTab(emsData) {
  const filters = ['Pending','Approved','Rejected','all']
  const leaves  = emsData.leaves.filter(l =>
    emsState.leaveFilter === 'all' || l.status === emsState.leaveFilter
  )

  return `
    <div style="display:grid;gap:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${filters.map(f => `
          <button class="${emsState.leaveFilter === f ? 'primary-button' : 'secondary-button'}"
            style="font-size:12px;padding:5px 14px" data-ems-leave-filter="${f}">
            ${f === 'all' ? 'All' : f}
            (${f === 'all' ? emsData.leaves.length : emsData.leaves.filter(l=>l.status===f).length})
          </button>`).join('')}
      </div>

      ${leaves.length === 0
        ? `<div class="empty">No leave requests found.</div>`
        : leaves.map(l => {
          const emp    = l.employees || {}
          const from   = new Date(l.from_date + 'T00:00:00').toLocaleDateString()
          const to     = new Date(l.to_date   + 'T00:00:00').toLocaleDateString()
          const days   = Math.ceil((new Date(l.to_date) - new Date(l.from_date)) / 86400000) + 1
          const badge  = l.status === 'Approved' ? 'good' : l.status === 'Rejected' ? 'bad' : 'warn'
          return `
            <div class="card" style="display:grid;gap:10px">
              <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
                <div>
                  <strong>${emp.name || '—'}</strong>
                  <span class="muted" style="font-size:12px;margin-left:6px">${emp.role || ''}</span><br>
                  <span class="muted" style="font-size:12px">
                    ${l.leave_type} · ${from} → ${to} · ${days} day${days!==1?'s':''}
                  </span>
                </div>
                <span class="badge ${badge}">${l.status}</span>
              </div>
              ${l.reason ? `<p style="font-size:13px">${l.reason}</p>` : ''}
              ${l.status === 'Pending' ? `
                <div style="display:flex;gap:8px">
                  <button class="primary-button" style="font-size:12px;padding:6px 14px"
                    data-ems-leave-action="Approved" data-leave-id="${l.id}">
                    ✓ Approve
                  </button>
                  <button class="secondary-button" style="font-size:12px;padding:6px 14px;color:var(--danger)"
                    data-ems-leave-action="Rejected" data-leave-id="${l.id}">
                    ✗ Reject
                  </button>
                </div>` : `
                <p class="muted" style="font-size:12px">
                  ${l.status} ${l.reviewed_at
                    ? '· ' + new Date(l.reviewed_at).toLocaleDateString() : ''}
                </p>`}
            </div>`
        }).join('')}
    </div>`
}

/* ── Salary config tab ── */
function salaryTab(emsData) {
  const employees = (emsData.employees || []).filter(e =>
    e.role !== 'Business Owner' && e.status === 'Active'
  )

  return `
    <div style="display:grid;gap:12px">
      <p class="muted" style="font-size:13px">
        Set salary type and rate per employee. Used when generating monthly salary slips.
      </p>
      ${employees.map(emp => {
        const config = (emsData.salaryConfigs || []).find(c => c.employee_id === emp.id)
        return `
          <div class="card" style="display:grid;gap:12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>${emp.name}</strong>
                <span class="muted" style="font-size:12px;margin-left:6px">${emp.role}</span>
              </div>
              ${config ? `<span class="badge good">Configured</span>` : `<span class="badge warn">Not set</span>`}
            </div>
            <form data-form="salary-config" data-emp-id="${emp.id}"
              style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
              <label class="field" style="margin:0">
                <span style="font-size:12px">Salary Type</span>
                <select name="salary_type">
                  <option ${config?.salary_type==='Monthly'?'selected':''}>Monthly</option>
                  <option ${config?.salary_type==='Daily'?'selected':''}>Daily</option>
                </select>
              </label>
              <label class="field" style="margin:0">
                <span style="font-size:12px">Rate (Rs.)</span>
                <input name="rate" type="number" step="any" min="0"
                  value="${config?.rate || ''}" placeholder="e.g. 25000">
              </label>
              <button class="primary-button" style="padding:9px 14px;font-size:13px">
                Save
              </button>
            </form>
          </div>`
      }).join('')}
    </div>`
}

/* ── Salary slips tab ── */
function slipsTab(emsData) {
  const employees = (emsData.employees || []).filter(e =>
    e.role !== 'Business Owner' && e.status === 'Active'
  )
  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ]

  return `
    <div style="display:grid;gap:16px">
      <!-- Generate new slip -->
      <div class="card" style="display:grid;gap:12px">
        <h2 style="font-size:15px">Generate Salary Slip</h2>
        <form data-form="generate-slip"
          style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end">
          <label class="field" style="margin:0">
            <span style="font-size:12px">Employee</span>
            <select name="employee_id">
              ${employees.map(e =>
                `<option value="${e.id}" ${emsState.selectedEmployee===e.id?'selected':''}>${e.name}</option>`
              ).join('')}
            </select>
          </label>
          <label class="field" style="margin:0">
            <span style="font-size:12px">Month</span>
            <select name="month">
              ${months.map((m,i) =>
                `<option value="${i+1}" ${emsState.selectedMonth===i+1?'selected':''}>${m}</option>`
              ).join('')}
            </select>
          </label>
          <label class="field" style="margin:0">
            <span style="font-size:12px">Year</span>
            <input name="year" type="number" step="1" min="2020"
              value="${emsState.selectedYear}" style="width:100%">
          </label>
          <button class="primary-button" style="padding:9px 14px;font-size:13px;white-space:nowrap">
            Generate
          </button>
        </form>
      </div>

      <!-- Existing slips -->
      ${emsData.slips.length ? `
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:10px 14px;background:var(--surface-2);
                      font-size:12px;font-weight:600;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px">
            Generated Slips
          </div>
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Employee</th><th>Period</th><th>Days Present</th>
              <th>Leaves</th><th>Absent</th><th>Net Salary</th><th></th>
            </tr></thead>
            <tbody>
              ${emsData.slips.map(s => `<tr>
                <td><strong>${s.employees?.name || '—'}</strong></td>
                <td>${months[s.month-1]} ${s.year}</td>
                <td>${s.days_present}</td>
                <td>${s.leaves_approved}</td>
                <td>${s.days_absent}</td>
                <td><strong>${money(s.net_salary)}</strong></td>
                <td>
                  <button class="secondary-button" style="font-size:12px;padding:4px 10px"
                    data-print-slip="${s.id}">Print</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>` : `
        <div class="empty">No salary slips generated yet.</div>`}
    </div>`
}

/* ════════════════════════════════════════════════════════════════
   LEAVE REQUEST — rendered in the employee-facing view (POS/Workshop)
   Call renderLeaveRequest(sess, onDone) to show the form
════════════════════════════════════════════════════════════════ */
export function leaveRequestHTML() {
  return `
    <div class="modal-backdrop">
      <form class="modal" data-form="leave-request" style="max-width:460px">
        <h2>Apply for Leave</h2>
        <div class="form-grid">
          <label class="field"><span>Leave Type</span>
            <select name="leave_type">
              <option>Casual</option>
              <option>Sick</option>
              <option>Emergency</option>
              <option>Other</option>
            </select>
          </label>
          <label class="field"><span>From Date</span>
            <input name="from_date" type="date" required
              min="${new Date().toISOString().slice(0,10)}">
          </label>
          <label class="field"><span>To Date</span>
            <input name="to_date" type="date" required
              min="${new Date().toISOString().slice(0,10)}">
          </label>
          <label class="field" style="grid-column:1/-1"><span>Reason</span>
            <textarea name="reason" style="min-height:72px"
              placeholder="Brief description of your leave reason"></textarea>
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button class="primary-button">Submit Request</button>
        </div>
      </form>
    </div>`
}

/* ── Submit leave request (called from pos.js / workshop.js submit handler) ── */
export async function submitLeaveRequest(sess, formData) {
  const from = formData.from_date
  const to   = formData.to_date
  if (!from || !to) return { ok: false, error: 'Please select dates.' }
  if (new Date(to) < new Date(from)) return { ok: false, error: 'To date must be after from date.' }

  const { error } = await sb.from('leaves').insert({
    employee_id: sess.employee.id,
    leave_type:  formData.leave_type || 'Casual',
    from_date:   from,
    to_date:     to,
    reason:      formData.reason || '',
    status:      'Pending',
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/* ════════════════════════════════════════════════════════════════
   CLOCK OUT BUTTON HTML — inject into topbar for non-owner roles
════════════════════════════════════════════════════════════════ */
export function clockOutButtonHTML() {
  return `<button class="secondary-button" data-action="ems-clock-out"
    style="font-size:12px">🕐 Clock Out</button>`
}

export async function handleClockOut(sess, onComplete) {
  if (!confirm('Clock out and end your shift?')) return
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sb.from('attendance')
    .select('id')
    .eq('employee_id', sess.employee.id)
    .eq('date', today)
    .is('clock_out', null)
    .limit(1)
  if (data?.[0]) {
    await sb.from('attendance')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', data[0].id)
  }
  onComplete && onComplete()
}

/* ════════════════════════════════════════════════════════════════
   SALARY SLIP GENERATOR
════════════════════════════════════════════════════════════════ */
export async function generateSalarySlip(employeeId, month, year, generatedBy) {
  // Get salary config
  const { data: config } = await sb.from('salary_config')
    .select('*').eq('employee_id', employeeId).single()
  if (!config) return { ok: false, error: 'No salary configuration found for this employee. Please set it in the Salary tab first.' }

  // Calculate working days in the month
  const daysInMonth  = new Date(year, month, 0).getDate()
  const workingDays  = countWorkingDays(year, month)

  // Get attendance for this month
  const monthStr = `${year}-${String(month).padStart(2,'0')}`
  const { data: attendance } = await sb.from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', `${monthStr}-01`)
    .lte('date', `${monthStr}-${daysInMonth}`)

  const daysPresent = (attendance || []).filter(r => r.clock_out).length

  // Get approved leaves for this month
  const { data: leaves } = await sb.from('leaves')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('status', 'Approved')
    .or(`from_date.gte.${monthStr}-01,to_date.lte.${monthStr}-${daysInMonth}`)

  const leaveDays = (leaves || []).reduce((total, l) => {
    const from = new Date(Math.max(new Date(l.from_date), new Date(`${monthStr}-01`)))
    const to   = new Date(Math.min(new Date(l.to_date),   new Date(`${monthStr}-${daysInMonth}`)))
    return total + Math.max(0, Math.ceil((to - from) / 86400000) + 1)
  }, 0)

  const daysAbsent = Math.max(0, workingDays - daysPresent - leaveDays)

  // Calculate salary
  let gross = 0
  if (config.salary_type === 'Monthly') {
    const dailyRate = config.rate / workingDays
    gross = config.rate - (daysAbsent * dailyRate)
  } else {
    // Daily — approved leaves count as paid
    gross = (daysPresent + leaveDays) * config.rate
  }
  gross = Math.max(0, gross)

  // Upsert slip
  const { data: slip, error } = await sb.from('salary_slips').upsert({
    employee_id:     employeeId,
    month,
    year,
    days_in_month:   daysInMonth,
    days_present:    daysPresent,
    days_absent:     daysAbsent,
    leaves_approved: leaveDays,
    salary_type:     config.salary_type,
    rate:            config.rate,
    gross_salary:    gross,
    deductions:      0,
    net_salary:      gross,
    generated_by:    generatedBy,
    generated_at:    new Date().toISOString(),
  }, { onConflict: 'employee_id,month,year' }).select().single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: slip }
}

function countWorkingDays(year, month) {
  let count = 0
  const days = new Date(year, month, 0).getDate()
  for (let d = 1; d <= days; d++) {
    const day = new Date(year, month - 1, d).getDay()
    if (day !== 0) count++ // Exclude Sundays — adjust if needed
  }
  return count
}

/* ════════════════════════════════════════════════════════════════
   SALARY SLIP PRINT
════════════════════════════════════════════════════════════════ */
export function buildSalarySlipHTML(slip, employeeName, shopName) {
  const months = ['January','February','March','April','May','June',
    'July','August','September','October','November','December']
  return `
    <div class="c b lg">${shopName || 'RetailOS'}</div>
    <div class="ln"></div>
    <div class="c b">SALARY SLIP</div>
    <div class="c">${months[slip.month-1]} ${slip.year}</div>
    <div class="ln"></div>
    <div class="row"><span>Employee</span><span>${employeeName}</span></div>
    <div class="row"><span>Salary Type</span><span>${slip.salary_type}</span></div>
    <div class="row"><span>Rate</span><span>${money(slip.rate)}${slip.salary_type==='Daily'?' / day':' / month'}</span></div>
    <div class="ln"></div>
    <div class="row"><span>Working Days</span><span>${slip.days_in_month}</span></div>
    <div class="row"><span>Days Present</span><span>${slip.days_present}</span></div>
    <div class="row"><span>Approved Leaves</span><span>${slip.leaves_approved}</span></div>
    <div class="row"><span>Days Absent</span><span>${slip.days_absent}</span></div>
    <div class="ln"></div>
    <div class="row"><span>Gross Salary</span><span>${money(slip.gross_salary)}</span></div>
    ${slip.deductions > 0 ? `<div class="row"><span>Deductions</span><span>${money(slip.deductions)}</span></div>` : ''}
    <div class="row b lg"><span>NET SALARY</span><span>${money(slip.net_salary)}</span></div>
    <div class="ln"></div>
    <div class="c sm">Generated ${new Date(slip.generated_at).toLocaleDateString()}</div>`
}

/* ════════════════════════════════════════════════════════════════
   EMS EVENT HANDLERS
   Call attachEMSEvents(app, emsData, reloadFn, sess) from admin.js
════════════════════════════════════════════════════════════════ */
export function attachEMSEvents(app, getEMSData, reloadFn, sess) {
  if (_eventsAttached) return
  _eventsAttached = true
  SESSION = sess

  app.addEventListener('click', async e => {
    const el = e.target.closest(
      '[data-ems-tab],[data-ems-leave-filter],[data-ems-leave-action],[data-print-slip]'
    )
    if (!el) return

    if (el.dataset.emsTab) {
      emsState.tab = el.dataset.emsTab
      reloadFn(); return
    }

    if (el.dataset.emsLeaveFilter) {
      emsState.leaveFilter = el.dataset.emsLeaveFilter
      reloadFn(); return
    }

    if (el.dataset.emsLeaveAction) {
      const leaveId = Number(el.dataset.leaveId)
      const action  = el.dataset.emsLeaveAction
      const { error } = await sb.from('leaves').update({
        status:      action,
        reviewed_by: sess.employee?.id || null,
        reviewed_at: new Date().toISOString(),
      }).eq('id', leaveId)
      if (error) { alert('Error: ' + error.message); return }
      await reloadFn(); return
    }

    if (el.dataset.printSlip) {
      const slipId   = Number(el.dataset.printSlip)
      const emsData  = getEMSData()
      const slip     = emsData.slips.find(s => s.id === slipId)
      if (!slip) return
      const { printThermal } = await import('../print/print.js')
      printThermal(buildSalarySlipHTML(slip, slip.employees?.name || '—', CFG.shop_name))
      return
    }
  })

  app.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.emsAttendanceFilter !== undefined) {
      emsState.attendanceFilter = t.value; reloadFn()
    }
  })

  app.addEventListener('submit', async e => {
    const form = e.target
    if (!form.dataset.form) return
    e.preventDefault()
    const data = Object.fromEntries(new FormData(form).entries())

    if (form.dataset.form === 'salary-config') {
      const empId = Number(form.dataset.empId)
      if (!data.rate || Number(data.rate) <= 0) { alert('Enter a valid rate.'); return }
      const { error } = await sb.from('salary_config').upsert({
        employee_id:    empId,
        salary_type:    data.salary_type,
        rate:           Number(data.rate),
        effective_from: new Date().toISOString().slice(0,10),
      }, { onConflict: 'employee_id' })
      if (error) { alert('Error: ' + error.message); return }
      await reloadFn(); return
    }

    if (form.dataset.form === 'generate-slip') {
      const empId = Number(data.employee_id)
      const month = Number(data.month)
      const year  = Number(data.year)
      if (!empId || !month || !year) { alert('Please fill all fields.'); return }
      const btn = form.querySelector('button[type="submit"]') || form.querySelector('button')
      if (btn) { btn.disabled = true; btn.textContent = 'Generating…' }
      const result = await generateSalarySlip(empId, month, year, sess.employee?.id)
      if (btn) { btn.disabled = false; btn.textContent = 'Generate' }
      if (!result.ok) { alert('Error: ' + result.error); return }
      alert('Salary slip generated successfully.')
      await reloadFn(); return
    }
  })
}

/* Reset events flag when EMS view is unmounted */
export function resetEMSEvents() {
  _eventsAttached = false
}