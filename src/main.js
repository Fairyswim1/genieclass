// ========================================
// Genie Class - Main Entry Point
// ========================================
import './styles/global.css';
import './styles/teacher.css';
import './styles/student.css';
import './styles/quiz-math.css';

import { addRoute, initRouter } from './router.js';
import { renderTeacherLogin } from './pages/teacher/login.js';
import { renderTeacherDashboard } from './pages/teacher/dashboard.js';
import { renderLessonMode } from './pages/teacher/lessonMode.js';
import { renderAssignMode } from './pages/teacher/assignMode.js';
import { renderStudentLogin } from './pages/student/login.js';
import { renderStudentDashboard } from './pages/student/dashboard.js';
import { renderStudentProblemBoard } from './pages/student/problemBoard.js';
import { auth, ensureFirebaseAuthPersistence } from './firebase.js';
import { Capacitor } from '@capacitor/core';
import { trySilentNativeTeacherGoogleRestore } from './store.js';

document.documentElement.dataset.appShell =
    import.meta.env.VITE_APP_SHELL === 'student' ? 'student' : 'teacher';

if (Capacitor.isNativePlatform?.()) {
    document.documentElement.classList.add('is-native');
}

if (import.meta.env.VITE_APP_SHELL === 'student') {
    document.title = '지니클래스 학생';
}

// Register routes
addRoute('/', (container) => renderStudentLogin(container));
addRoute('/teacher/login', (container) => renderTeacherLogin(container));
addRoute('/teacher/dashboard', (container) => renderTeacherDashboard(container));
addRoute('/teacher/class/:id/lesson', (container, params) => renderLessonMode(container, params));
addRoute('/teacher/class/:id/assign', (container, params) => renderAssignMode(container, params));
addRoute('/student', (container) => renderStudentLogin(container));
addRoute('/s', (container) => renderStudentLogin(container));
addRoute('/student/login', (container) => renderStudentLogin(container));
addRoute('/student/dashboard', (container) => renderStudentDashboard(container));
addRoute('/student/problem-board/:promptId', (container, params) => renderStudentProblemBoard(container, params));

// Auth 복구가 끝난 뒤 라우터를 띄운다. (초기 null 콜백만으로 라우터가 열리면 Storage 업로드 시 인증이 비는 경우가 있다)
void (async () => {
    await ensureFirebaseAuthPersistence();
    await auth.authStateReady();

    const isTeacherShell = import.meta.env.VITE_APP_SHELL !== 'student';
    if (
        Capacitor.isNativePlatform?.() &&
        isTeacherShell &&
        (!auth.currentUser || auth.currentUser.isAnonymous)
    ) {
        await trySilentNativeTeacherGoogleRestore();
        await auth.authStateReady();
    }

    initRouter();
    console.log('✨ Genie Class initialized');
})();
