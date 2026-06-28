import { loadConfig, applyBranding, _loadSession, state, CFG } from './shared.js'
import { renderLogin } from './auth.js'

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
    renderLogin(onLoginSuccess)
    return
  }

  onLoginSuccess(SESSION)
}

async function onLoginSuccess(SESSION) {
  const role = SESSION.isAdmin ? 'Business Owner' : (SESSION.employee?.role || '')
  state.role = role

  if (role === 'Business Owner' || role === 'Manager') {
    const { initAdmin } = await import('./admin/admin.js')
    initAdmin(SESSION)
  } else if (role === 'Technician') {
    const { initWorkshop } = await import('./pos/workshop.js')
    initWorkshop(SESSION)
  } else {
    const { initPOS } = await import('./pos/pos.js')
    initPOS(SESSION)
  }
}

window.addEventListener('online',  () => { state.online = true })
window.addEventListener('offline', () => { state.online = false })
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); state.installPrompt = e
})

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')

boot()