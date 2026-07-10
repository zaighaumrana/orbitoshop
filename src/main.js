import { loadConfig, applyBranding, _loadSession, state, CFG } from './shared.js'
import { renderLogin } from './auth.js'
import { registerRoute, registerNotFound, startRouter, navigate } from './router.js'

async function boot() {
  await loadConfig()
  applyBranding()

  if (CFG.suspended) {
    document.getElementById('app').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  height:100vh;gap:16px;text-align:center;padding:24px">
        <div style="font-size:48px">🔒</div>
        <h2 style="color:var(--danger)">Account Suspended</h2>
        <p class="muted" style="max-width:360px;line-height:1.6">
          Contact your service provider to restore access.
        </p>
      </div>`
    return
  }

  const SESSION = _loadSession()

  if (!SESSION.employee) {
    registerNotFound(() => renderLogin(onLoginSuccess))
    renderLogin(onLoginSuccess)
    return
  }

  // EMS gate on refresh/revisit too
  const { checkClockIn } = await import('./admin/ems.js')
  checkClockIn(SESSION, CFG, () => {
    setupRoutes(SESSION)
    startRouter()
  })
}

function setupRoutes(SESSION) {
  registerRoute('/login', () => renderLogin(onLoginSuccess))

  registerRoute('/pos', async () => {
    const { initPOS } = await import('./pos/pos.js')
    initPOS(SESSION)
  })

  registerRoute('/workshop', async () => {
    const { initWorkshop } = await import('./pos/workshop.js')
    initWorkshop(SESSION)
  })

  const adminModules = ['dashboard','repairs','inventory','reports','employees','receipts','ems','settings','catalog']
  adminModules.forEach(mod => {
    registerRoute(`/admin/${mod}`, async (params, query) => {
      const { initAdmin } = await import('./admin/admin.js')
      initAdmin(SESSION, mod, query)
    })
  })

  registerRoute('/admin', async () => {
    navigate('/admin/dashboard', { replace: true })
  })

  registerNotFound(() => {
    const role = SESSION.isAdmin ? 'Business Owner' : (SESSION.employee?.role || '')
    if (role === 'Business Owner' || role === 'Manager') navigate('/admin/dashboard', { replace: true })
    else if (role === 'Technician') navigate('/workshop', { replace: true })
    else navigate('/pos', { replace: true })
  })
}

async function onLoginSuccess(SESSION) {
  const role = SESSION.isAdmin ? 'Business Owner' : (SESSION.employee?.role || '')
  state.role = role

  // EMS clock-in gate — fires before any view loads
  const { checkClockIn } = await import('./admin/ems.js')
  checkClockIn(SESSION, CFG, async () => {
    setupRoutes(SESSION)
    if (role === 'Business Owner' || role === 'Manager') navigate('/admin/dashboard')
    else if (role === 'Technician') navigate('/workshop')
    else navigate('/pos')
    startRouter()
  })
}

window.addEventListener('online',  () => { state.online = true })
window.addEventListener('offline', () => { state.online = false })
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); state.installPrompt = e
})

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')

boot()