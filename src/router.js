// ========================================
// Genie Class - SPA Router (Hash-based)
// ========================================
import { auth } from './firebase.js';

const routes = {};
let currentCleanup = null;
const TEACHER_ENTRY_PATH = (
    import.meta.env.VITE_TEACHER_ENTRY_PATH || '/teacher-portal'
).replace(/\/+$/, '') || '/teacher-portal';

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
        const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform;
        const isElectron = navigator.userAgent.includes('ElectronApp');
        const isWeb = !(isCapacitor || isElectron);
        const isTeacherHash = hash.startsWith('/teacher');
        const teacherEntryAllowed =
            path === TEACHER_ENTRY_PATH || path.startsWith(`${TEACHER_ENTRY_PATH}/`);
        
        // Handle direct path-based entry (e.g., genieclass.vercel.app/student or /s)
        if ((path === '/student' || path === '/s') && (hash === '/' || hash === '')) {
            window.location.hash = '/student';
            return;
        }

        // 웹에서는 기본 도메인 루트를 학생 전용으로 고정한다.
        // 교사 화면은 TEACHER_ENTRY_PATH 경로에서만 진입 가능하다.
        if (isWeb && !isStudentShell) {
            if (!teacherEntryAllowed) {
                if (hash === '/' || hash === '' || isTeacherHash) {
                    window.location.hash = '/student/login';
                    return;
                }
            } else if (hash === '/' || hash === '') {
                const u = auth.currentUser;
                window.location.hash =
                    u && !u.isAnonymous ? '/teacher/dashboard' : '/teacher/login';
                return;
            }
        }

        // 학생용 앱 빌드: 루트는 항상 학생 로그인
        if (isStudentShell && (hash === '/' || hash === '')) {
            window.location.hash = '/student/login';
            return;
        }

        // 교사 빌드: 이미 로그인돼 있으면 로그인 페이지 대신 대시보드로
        if (
            !isStudentShell &&
            hash === '/teacher/login' &&
            auth.currentUser &&
            !auth.currentUser.isAnonymous
        ) {
            window.location.hash = '/teacher/dashboard';
            return;
        }

        // Android(Capacitor) 또는 Electron 앱에서만 교사 모드 강제 진입
        if (hash === '/' && path === '/' && (isCapacitor || isElectron) && !isStudentShell) {
            const u = auth.currentUser;
            window.location.hash =
                u && !u.isAnonymous ? '/teacher/dashboard' : '/teacher/login';
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
            // fallback: 학생 로그인 페이지
            const defaultRoute = routes['/student/login'] || routes['/'];
            if (defaultRoute) {
                app.innerHTML = '';
                currentCleanup = defaultRoute(app, {});
            }
        }
    };

    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}
