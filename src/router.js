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

/** student 셸 빌드에서 teacher-portal 접근 시 student 전용 CSS가 교사 UI를 깨뜨리지 않도록 분리 */
export function syncAppShellForRoute(pathname, hashRoute) {
    const path = (pathname || window.location.pathname || '').replace(/\/+$/, '');
    const hash = hashRoute || window.location.hash.slice(1) || '/';
    const teacherEntry =
        path === TEACHER_ENTRY_PATH || path.startsWith(`${TEACHER_ENTRY_PATH}/`);
    const onTeacher = teacherEntry || hash.startsWith('/teacher');
    const onStudent =
        hash.startsWith('/student') || hash === '/s' || hash === '/';

    if (onTeacher && !hash.startsWith('/student')) {
        document.documentElement.dataset.appShell = 'teacher';
    } else if (onStudent && !onTeacher) {
        document.documentElement.dataset.appShell = 'student';
    } else {
        document.documentElement.dataset.appShell =
            import.meta.env.VITE_APP_SHELL === 'student' ? 'student' : 'teacher';
    }
}

export function initRouter() {
    const handleRoute = () => {
        const path = window.location.pathname;
        let hash = window.location.hash.slice(1) || '/';

        syncAppShellForRoute(path, hash);

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

        // 웹에서는 교사 진입 경로를 TEACHER_ENTRY_PATH로 고정한다.
        // (배포가 student 셸로 올라갔더라도 teacher-portal 진입은 교사 페이지로 강제)
        if (isWeb && teacherEntryAllowed) {
            if (
                hash === '/' ||
                hash === '' ||
                hash.startsWith('/student')
            ) {
                const u = auth.currentUser;
                window.location.hash =
                    u && !u.isAnonymous ? '/teacher/dashboard' : '/teacher/login';
                return;
            }
        }

        // 웹 기본 도메인에서는 교사 해시 직접 진입을 막고 학생 로그인으로 보낸다.
        if (isWeb && !teacherEntryAllowed && isTeacherHash) {
            window.location.hash = '/student/login';
            return;
        }

        // 학생용 앱 빌드: 루트는 항상 학생 로그인 (단, teacher-portal은 위에서 예외 처리)
        if (isStudentShell && !teacherEntryAllowed && (hash === '/' || hash === '')) {
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
