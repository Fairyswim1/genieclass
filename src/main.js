// ========================================
// Genie Class - Main Entry Point
// ========================================
import './styles/global.css';
import './styles/teacher.css';
import './styles/student.css';

import { addRoute, initRouter } from './router.js';
import { renderLanding } from './pages/landing.js';
import { renderTeacherLogin } from './pages/teacher/login.js';
import { renderTeacherDashboard } from './pages/teacher/dashboard.js';
import { renderLessonMode } from './pages/teacher/lessonMode.js';
import { renderAssignMode } from './pages/teacher/assignMode.js';
import { renderStudentLogin } from './pages/student/login.js';
import { renderStudentDashboard } from './pages/student/dashboard.js';

// Register routes
addRoute('/', (container) => renderLanding(container));
addRoute('/teacher/login', (container) => renderTeacherLogin(container));
addRoute('/teacher/dashboard', (container) => renderTeacherDashboard(container));
addRoute('/teacher/class/:id/lesson', (container, params) => renderLessonMode(container, params));
addRoute('/teacher/class/:id/assign', (container, params) => renderAssignMode(container, params));
addRoute('/student/login', (container) => renderStudentLogin(container));
addRoute('/student/dashboard', (container) => renderStudentDashboard(container));

// Initialize router
initRouter();

console.log('✨ Genie Class initialized');
