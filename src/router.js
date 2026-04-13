// ========================================
// Genie Class - SPA Router (Hash-based)
// ========================================

const routes = {};
let currentCleanup = null;

export function addRoute(path, handler) {
    routes[path] = handler;
}

export function navigate(path) {
    window.location.hash = path;
}

export function getParams() {
    const hash = window.location.hash.slice(1);
    const params = {};

    for (const routePath of Object.keys(routes)) {
        const routeParts = routePath.split('/');
        const hashParts = hash.split('/');

        if (routeParts.length !== hashParts.length) continue;

        let match = true;
        for (let i = 0; i < routeParts.length; i++) {
            if (routeParts[i].startsWith(':')) {
                params[routeParts[i].slice(1)] = hashParts[i];
            } else if (routeParts[i] !== hashParts[i]) {
                match = false;
                break;
            }
        }

        if (match) return params;
    }

    return params;
}

function matchRoute(hash) {
    for (const routePath of Object.keys(routes)) {
        const routeParts = routePath.split('/');
        const hashParts = hash.split('/');

        if (routeParts.length !== hashParts.length) continue;

        let match = true;
        const params = {};
        for (let i = 0; i < routeParts.length; i++) {
            if (routeParts[i].startsWith(':')) {
                params[routeParts[i].slice(1)] = hashParts[i];
            } else if (routeParts[i] !== hashParts[i]) {
                match = false;
                break;
            }
        }

        if (match) return { handler: routes[routePath], params };
    }

    return null;
}

export function initRouter() {
    const handleRoute = () => {
        let hash = window.location.hash.slice(1) || '/';
        
        // Electron 또는 Android(Capacitor) 앱에서는 랜딩 페이지를 건너뛰고 교사 모드로 진입
        const isNativeApp = navigator.userAgent.includes('ElectronApp') || window.Capacitor;
        if (hash === '/' && isNativeApp) {
            window.location.hash = '/teacher/login';
            return;
        }

        const app = document.getElementById('app');

        // Clean up previous page
        if (currentCleanup && typeof currentCleanup === 'function') {
            currentCleanup();
            currentCleanup = null;
        }

        const matched = matchRoute(hash);
        if (matched) {
            app.innerHTML = '';
            currentCleanup = matched.handler(app, matched.params);
        } else {
            // Default to landing
            const defaultRoute = routes['/'];
            if (defaultRoute) {
                app.innerHTML = '';
                currentCleanup = defaultRoute(app, {});
            }
        }
    };

    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}
