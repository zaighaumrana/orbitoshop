import {
  state, CFG, _saveSession, _clearSession,
  verifyLogin, applyBranding, currentTenant
} from './shared.js'

let _onLoginSuccess = null

export function renderLogin(onSuccess) {
  _onLoginSuccess = onSuccess
  const app = document.getElementById('app')
  app.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;background:var(--bg);padding:16px">
      <div class="card" style="width:min(400px,95vw);display:grid;gap:20px;padding:32px">
        <div style="text-align:center;display:grid;gap:8px">
          <div class="logo" style="margin:0 auto 8px;width:72px;height:72px;font-size:20px;overflow:hidden">
            ${CFG.shop_logo
              ? `<img src="${CFG.shop_logo}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">`
              : CFG.shop_name?.slice(0,2).toUpperCase() || 'FP'}
          </div>
          <h2 style="margin:0">${CFG.shop_name || 'RetailOS'}</h2>
          <p class="muted" style="font-size:13px;margin:0">Sign in to continue</p>
        </div>
        <div style="display:grid;gap:10px">
          <label class="field"><span>Email</span>
            <input id="login-email" type="email" autocomplete="email"
              placeholder="your@email.com" style="font-size:15px" autofocus>
          </label>
          <label class="field"><span>Password</span>
            <input id="login-password" type="password"
              autocomplete="current-password"
              placeholder="Your password" style="font-size:15px">
          </label>
          <div id="login-error" class="hidden"
            style="color:var(--danger);font-size:13px;text-align:center;padding:4px 0">
            Incorrect email or password.
          </div>
          <button type="button" id="forgot-btn"
            style="font-size:12px;color:var(--primary);background:none;border:none;
                   cursor:pointer;text-align:right;padding:0">
            Forgot password?
          </button>
          <div id="cf-turnstile-wrap"
            style="display:flex;justify-content:center;margin:4px 0"></div>
          <button id="login-btn" class="primary-button"
            style="width:100%;font-size:15px;padding:12px">
            Login
          </button>
        </div>
        <p class="muted" style="text-align:center;font-size:12px;margin:0">
          ${CFG.shop_address || ''}
        </p>
      </div>
    </div>`

  // Mount Turnstile — only on production
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const wrap = document.getElementById('cf-turnstile-wrap')
  if (!isDev && wrap && window.turnstile) {
    window.turnstile.render(wrap, {
      sitekey: '0x4AAAAAADl87EDGnxcg5eJZ',
      theme:   state.theme === 'dark' ? 'dark' : 'light',
      callback: () => {
        const b = document.getElementById('login-btn')
        if (b) b.disabled = false
      },
      'error-callback': () => {
        const b = document.getElementById('login-btn')
        if (b) b.disabled = true
      },
    })
    const b = document.getElementById('login-btn')
    if (b) b.disabled = true
  }
  // On localhost login button stays enabled

  document.getElementById('login-btn').addEventListener('click', submitLogin)
  document.getElementById('forgot-btn').addEventListener('click', forgotPassword)
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitLogin()
  })
}

async function submitLogin() {
  const btn = document.getElementById('login-btn')
  if (btn?.disabled) return  // Turnstile not verified yet, or a submit is already in flight
  const emailEl = document.getElementById('login-email')
  const passEl  = document.getElementById('login-password')
  const errEl   = document.getElementById('login-error')
  const email   = emailEl?.value?.trim() || ''
  const pass    = passEl?.value?.trim()  || ''

  if (!email || !pass) {
    if (errEl) { errEl.textContent = 'Please enter your email and password.'; errEl.classList.remove('hidden') }
    return
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…' }
  if (errEl) errEl.classList.add('hidden')

  // 1. Owner login
  if (
    CFG.owner_email &&
    email.toLowerCase() === CFG.owner_email.toLowerCase() &&
    pass === CFG.owner_password
  ) {
    const SESSION = { employee: { name: 'Admin', role: 'Business Owner', email }, isAdmin: true }
    _saveSession(SESSION, 'admin', 'dashboard')
    _onLoginSuccess && _onLoginSuccess(SESSION)
    return
  }

  // 2. Employee login
  const res = await verifyLogin(email, pass)
  if (res.ok) {
    const SESSION = { employee: res.employee, isAdmin: false }
    const role    = res.employee.role
    const route   = (role === 'Technician') ? 'workshop' : (role === 'Business Owner' || role === 'Manager') ? 'admin' : 'pos'
    _saveSession(SESSION, route, 'dashboard')
    _onLoginSuccess && _onLoginSuccess(SESSION)
  } else {
    if (btn) { btn.disabled = false; btn.textContent = 'Login' }
    if (errEl) { errEl.textContent = 'Incorrect email or password.'; errEl.classList.remove('hidden') }
    if (passEl) { passEl.value = ''; passEl.focus() }
  }
}

async function forgotPassword() {
  const email = document.getElementById('login-email')?.value?.trim()
  if (!email) { alert('Enter your email address first.'); return }
  const isOwner = CFG.owner_email && email.toLowerCase() === CFG.owner_email.toLowerCase()
  if (!isOwner) {
    const { sb } = await import('./shared.js')
    const { data } = await sb.from('employees')
      .select('id').eq('email', email.toLowerCase()).maybeSingle()
    if (!data) { alert('No account found with that email.\nContact your administrator.'); return }
  }
  const { requestPasswordReset } = await import('./shared.js')
  const res = await requestPasswordReset(email)
  if (!res.ok) { alert('Something went wrong: ' + res.error); return }
  alert(`Reset requested for ${email}.\nYour administrator will see this in Admin → Employees → Password Resets and set a new password for you.`)
}