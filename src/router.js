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
        const path = window.location.pathname;
        let hash = window.location.hash.slice(1) || '/';

        const isStudentShell = import.meta.env.VITE_APP_SHELL === 'student';
        
        // Handle direct path-based entry (e.g., genieclass.vercel.app/student or /s)
        if ((path === '/student' || path === '/s') && (hash === '/' || hash === '')) {
            window.location.hash = '/student';
            return;
        }

        // 학생용 앱 빌드: 루트는 항상 학생 로그인
        if (isStudentShell && (hash === '/' || hash === '')) {
            window.location.hash = '/student/login';
            return;
        }

        // Android(Capacitor) 또는 Electron 앱에서만 교사 모드 강제 진입
        // 웹 브라우저에서는 이 로직을 타지 않도록 확실히 체크
        const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform;
        const isElectron = navigator.userAgent.includes('ElectronApp');
        
        if (hash === '/' && path === '/' && (isCapacitor || isElectron) && !isStudentShell) {
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
