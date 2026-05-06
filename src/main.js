// ========================================
// Genie Class - Main Entry Point
// ========================================
import './styles/global.css';
import './styles/teacher.css';
import './styles/student.css';
import './styles/quiz-math.css';

import { addRoute, initRouter } from './router.js';
import { renderLanding } from './pages/landing.js';
import { renderTeacherLogin } from './pages/teacher/login.js';
import { renderTeacherDashboard } from './pages/teacher/dashboard.js';
import { renderLessonMode } from './pages/teacher/lessonMode.js';
import { renderAssignMode } from './pages/teacher/assignMode.js';
import { renderStudentLogin } from './pages/student/login.js';
import { renderStudentDashboard } from './pages/student/dashboard.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';

if (import.meta.env.VITE_APP_SHELL === 'student') {
    document.title = '지니클래스 학생';
}

// Register routes
addRoute('/', (container) => renderLanding(container));
addRoute('/teacher/login', (container) => renderTeacherLogin(container));
addRoute('/teacher/dashboard', (container) => renderTeacherDashboard(container));
addRoute('/teacher/class/:id/lesson', (container, params) => renderLessonMode(container, params));
addRoute('/teacher/class/:id/assign', (container, params) => renderAssignMode(container, params));
addRoute('/student', (container) => renderStudentLogin(container));
addRoute('/s', (container) => renderStudentLogin(container));
addRoute('/student/login', (container) => renderStudentLogin(container));
addRoute('/student/dashboard', (container) => renderStudentDashboard(container));

// 라우터는 Auth 리스너가 한 번 돌 때 초기화한다(초기 user는 null일 수 있음 — “로그인 완료”와 무관).
let isInitialized = false;
onAuthStateChanged(auth, (_user) => {
    if (!isInitialized) {
        initRouter();
        isInitialized = true;
        console.log('✨ Genie Class initialized');
    }
});
