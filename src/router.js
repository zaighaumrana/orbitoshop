/* ═══════════════════════════════════════════════════════════════════
   RetailOS — router.js
   Lightweight History API router. No dependencies.
   Centralized navigation — modules call navigate(), never history directly.
═══════════════════════════════════════════════════════════════════ */

const routes = new Map()
let notFoundHandler = null
let currentPath = null

/**
 * Register a route.
 * @param {string} path - e.g. '/admin/inventory' or '/admin/repairs/:id'
 * @param {Function} handler - called with (params, query)
 */
export function registerRoute(path, handler) {
  routes.set(path, handler)
}

export function registerNotFound(handler) {
  notFoundHandler = handler
}

/**
 * Navigate to a path. Pushes history unless already on that path.
 * @param {string} path
 * @param {object} options - { replace: boolean } to use replaceState instead
 */
export function navigate(path, options = {}) {
  const url = new URL(path, window.location.origin)
  const pathname = url.pathname

  if (pathname === currentPath && !options.force) {
    // Already here — just re-resolve (e.g. query string changed)
    resolve(pathname, url.search)
    return
  }

  if (options.replace) {
    history.replaceState({}, '', path)
  } else {
    history.pushState({}, '', path)
  }
  resolve(pathname, url.search)
}

/**
 * Match a pathname against registered routes, supporting :param segments.
 */
function matchRoute(pathname) {
  // Exact match first
  if (routes.has(pathname)) {
    return { handler: routes.get(pathname), params: {} }
  }
  // Param match
  for (const [routePath, handler] of routes.entries()) {
    if (!routePath.includes(':')) continue
    const routeParts = routePath.split('/').filter(Boolean)
    const pathParts  = pathname.split('/').filter(Boolean)
    if (routeParts.length !== pathParts.length) continue
    const params = {}
    let matched = true
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = pathParts[i]
      } else if (routeParts[i] !== pathParts[i]) {
        matched = false; break
      }
    }
    if (matched) return { handler, params }
  }
  return null
}

function parseQuery(search) {
  const params = new URLSearchParams(search)
  const out = {}
  for (const [k, v] of params.entries()) out[k] = v
  return out
}

function resolve(pathname, search = '') {
  currentPath = pathname
  const match = matchRoute(pathname)
  const query = parseQuery(search)

  if (match) {
    match.handler(match.params, query)
  } else if (notFoundHandler) {
    notFoundHandler(pathname)
  } else {
    console.warn('No route matched:', pathname)
  }
}

/**
 * Call once at boot. Resolves the current URL and listens for back/forward.
 */
export function startRouter() {
  window.addEventListener('popstate', () => {
    resolve(window.location.pathname, window.location.search)
  })
  resolve(window.location.pathname, window.location.search)
}

/**
 * Helper to build a path with query params.
 */
export function buildPath(path, query = {}) {
  const params = new URLSearchParams(query)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Get current query params without navigating.
 */
export function getCurrentQuery() {
  return parseQuery(window.location.search)
}
