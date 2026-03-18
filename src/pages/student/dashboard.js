// ========================================
// Student Dashboard
// ========================================
import {
  getCurrentStudent, logoutStudent, getClassById,
  getPresentationsByStudent, getAssignmentsByClass,
  getSubmissionsByStudent, getAnnouncementsByClass,
  getSharedSubmissions, getStudentById, formatDate,
  formatDateShort, showToast, downloadFile, getStudentByCode,
  submitAssignment, saveFile
} from '../../store.js';
import { renderCharacter, getLevelConfig } from '../../components/characterAvatar.js';

export function renderStudentDashboard(container) {
  const student = getCurrentStudent();
  if (!student) { window.location.hash = '/student/login'; return; }

  let activeView = 'dashboard';
  let selectedAssignment = null;

  async function init() {
    await render();
  }

  async function render() {
    let freshStudent = student;
    let cls = null;
    let config = getLevelConfig(student.characterLevel);
    let presentations = [];
    let assignments = [];
    let submissions = [];
    let announcements = [];

    try {
      freshStudent = await getStudentByCode(student.uniqueCode) || student;
      cls = await getClassById(freshStudent.classId);
      config = getLevelConfig(freshStudent.characterLevel);

      // Parallel data fetching with individual error handling or wrapping all
      [presentations, assignments, submissions, announcements] = await Promise.all([
        getPresentationsByStudent(freshStudent.id).catch(e => { console.error("Rec error:", e); return []; }),
        cls ? getAssignmentsByClass(cls.id).catch(e => { console.error("Assign error:", e); return []; }) : [],
        getSubmissionsByStudent(freshStudent.id).catch(e => { console.error("Sub error:", e); return []; }),
        cls ? getAnnouncementsByClass(cls.id).catch(e => { console.error("Announce error (Index needed):", e); return []; }) : [],
      ]);
    } catch (err) {
      console.error('Data loading error:', err);
      showToast('데이터를 불러오는 중 문제가 발생했습니다. 관리자에게 문의하세요.', 'error');
    }

    if (activeView === 'assignment' && selectedAssignment) {
      await renderAssignmentDetail(freshStudent, selectedAssignment, cls);
      return;
    }

    if (activeView === 'solutions' && selectedAssignment) {
      await renderSolutionsView(freshStudent, selectedAssignment);
      return;
    }

    container.innerHTML = `
      <div class="student-layout">
        <!-- Top Bar -->
        <div class="student-topbar">
          <div class="student-topbar-logo">
            <div class="student-topbar-logo-icon">G</div>
            <div>
              <div class="student-topbar-title">Genie Class</div>
            </div>
          </div>
          <div class="student-topbar-user">
            <div class="student-topbar-character">
              ${renderCharacter(freshStudent.characterLevel, 36)}
            </div>
            <div>
              <div class="student-topbar-name">${freshStudent.name}</div>
              <div style="font-size:0.7rem;color:var(--text-tertiary)">${cls?.name || ''}</div>
            </div>
            <button class="btn btn-ghost btn-sm" id="btn-student-logout">로그아웃</button>
          </div>
        </div>

        <!-- Dashboard -->
        <div class="student-dashboard animate-fade-in">
          <div class="student-welcome">
            <h1>안녕, <span>${freshStudent.name}</span>! ${config.emoji}</h1>
            <p>${cls?.name || ''} · ${config.name} (Lv.${freshStudent.characterLevel})</p>
          </div>

          <!-- Stats -->
          <div class="student-stats stagger-children">
            <div class="card stat-card">
              <div class="stat-value gold">⭐ ${freshStudent.praiseCount}</div>
              <div class="stat-label">칭찬 횟수</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value purple">${presentations.length}</div>
              <div class="stat-label">발표 기록</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value green">${submissions.length}</div>
              <div class="stat-label">제출한 과제</div>
            </div>
            <div class="card stat-card">
              <div class="stat-value blue">${freshStudent.totalPoints}</div>
              <div class="stat-label">총 포인트</div>
            </div>
          </div>

          <!-- Character display -->
          <div class="card" style="text-align:center;padding:var(--space-xl);margin-bottom:var(--space-xl)">
            <div style="width:120px;height:120px;margin:0 auto">
              ${renderCharacter(freshStudent.characterLevel, 120)}
            </div>
            <div style="margin-top:var(--space-md);font-size:1.2rem;font-weight:700">${config.emoji} ${config.name}</div>
            <div style="color:var(--text-secondary);font-size:0.85rem;margin-top:var(--space-xs)">
              다음 레벨까지 ${Math.max(0, (freshStudent.characterLevel * 5) - freshStudent.totalPoints)} 포인트
            </div>
            <div style="margin-top:var(--space-md);background:var(--bg-card);border-radius:var(--radius-full);height:8px;overflow:hidden">
              <div style="height:100%;background:linear-gradient(90deg,var(--primary),var(--gold));border-radius:var(--radius-full);width:${Math.min(100, (freshStudent.totalPoints % 5) / 5 * 100)}%;transition:width 0.5s"></div>
            </div>
          </div>

          <!-- Sections Grid -->
          <div class="student-sections">
            <div class="card student-section">
              <div class="student-section-header">
                <div class="student-section-icon" style="background:rgba(108,92,231,0.15);color:var(--primary-light)">🎤</div>
                <div class="student-section-title">내 기록</div>
              </div>
              <div class="record-list">
                ${presentations.length === 0 && freshStudent.praiseCount === 0 ? `
                  <div class="empty-state">아직 기록이 없습니다</div>
                ` : `
                  ${presentations.slice(-5).reverse().map(p => `
                    <div class="record-item">
                      <div class="record-item-left">
                        <div class="record-type-icon record-type-present">🎤</div>
                        <div>
                          <div class="record-title">발표 기록</div>
                          <div class="record-date">${formatDate(p.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                `}
              </div>
            </div>

            <div class="card student-section">
              <div class="student-section-header">
                <div class="student-section-icon" style="background:rgba(255,217,61,0.15);color:var(--gold)">📝</div>
                <div class="student-section-title">수업 과제</div>
              </div>
              ${assignments.map(a => {
      const submitted = submissions.some(s => s.assignmentId === a.id);
      return `<div class="assignment-card" data-assignment-id="${a.id}">
                  <div class="assignment-card-title">${a.title}</div>
                  <div class="assignment-card-status ${submitted ? 'status-submitted' : 'status-pending'}">
                    ${submitted ? '✅ 완료' : '⏳ 미제출'}
                  </div>
                </div>`;
    }).join('')}
            </div>

            <div class="card student-section">
              <div class="student-section-header">
                <div class="student-section-icon" style="background:rgba(78,205,196,0.15);color:var(--blue)">📢</div>
                <div class="student-section-title">공지사항</div>
              </div>
              ${announcements.map(ann => `
                <div class="announcement-item">
                  <div class="announcement-title">${ann.title}</div>
                  <div class="announcement-date">${formatDate(ann.createdAt)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    bindDashboardEvents(freshStudent, assignments);
  }

  function bindDashboardEvents(freshStudent, assignments) {
    document.getElementById('btn-student-logout').addEventListener('click', () => {
      logoutStudent(); window.location.hash = '/student/login';
    });

    document.querySelectorAll('.assignment-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedAssignment = assignments.find(a => a.id === card.dataset.assignmentId);
        activeView = 'assignment';
        render();
      });
    });
  }

  async function renderAssignmentDetail(freshStudent, assignment, cls) {
    const submissions = await getSubmissionsByStudent(freshStudent.id);
    const mySubmission = submissions.find(s => s.assignmentId === assignment.id);

    container.innerHTML = `
          <div class="student-layout">
            <div class="student-topbar">
              <button class="btn btn-ghost btn-sm" id="btn-back-dashboard">← 뒤로</button>
              <div class="student-topbar-title">${assignment.title}</div>
            </div>
            <div class="student-dashboard">
              <div class="card" style="padding:var(--space-xl)">
                <h2>${assignment.title}</h2>
                <p>${assignment.description || ''}</p>
                <button class="btn btn-primary w-full" id="btn-submit-solution">과제 제출하기 (파일 준비 중)</button>
              </div>
            </div>
          </div>
        `;

    document.getElementById('btn-back-dashboard').addEventListener('click', () => {
      activeView = 'dashboard';
      render();
    });

    document.getElementById('btn-submit-solution').addEventListener('click', async () => {
      // Placeholder for actual file upload logic refactor
      await submitAssignment(assignment.id, freshStudent.id, { files: [], shared: true });
      showToast('과제가 제출되었습니다!');
      activeView = 'dashboard';
      render();
    });
  }

  init();
}
