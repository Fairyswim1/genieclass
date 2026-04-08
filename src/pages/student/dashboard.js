// ========================================
// Student Dashboard (v2.0)
// ========================================
import {
  getCurrentStudent, logoutStudent, getClassById,
  getPresentationsByStudent, getAssignmentsByClass,
  getSubmissionsByStudent, getAnnouncementsByClass,
  getResourcesByClass, getStudentById, formatDate,
  listenToActiveQuiz, listenToQuizSubmissions, submitQuizSolution,
  showToast, downloadFile, getStudentByCode,
  submitAssignment, saveFile, updateStudentCharacterType
} from '../../store.js';
import { renderCharacter, getLevelConfig, PLANT_TYPES, getLevelProgress } from '../../components/characterAvatar.js';

export function renderStudentDashboard(container) {
  const student = getCurrentStudent();
  if (!student) { window.location.hash = '/student/login'; return; }

  let activeView = 'dashboard';
  let selectedAssignment = null;

  // Quiz State
  let activeQuiz = null;
  let quizSubmissions = [];
  let unsubscribeQuiz = null;
  let unsubscribeSubmissions = null;

  async function init() {
    await render();
    startQuizListener();
  }

  async function render() {
    let freshStudent = student;
    let cls = null;
    let config = getLevelConfig(student.characterLevel);
    let progress = getLevelProgress(student.totalPoints || 0);
    let presentations = [];
    let assignments = [];
    let submissions = [];
    let announcements = [];
    let resources = [];

    try {
      freshStudent = await getStudentByCode(student.uniqueCode) || student;
      cls = await getClassById(freshStudent.classId);
      config = getLevelConfig(freshStudent.characterLevel, freshStudent.characterType || 'sunflower');
      progress = getLevelProgress(freshStudent.totalPoints || 0);

      [presentations, assignments, submissions, announcements, resources] = await Promise.all([
        getPresentationsByStudent(freshStudent.id),
        cls ? getAssignmentsByClass(cls.id) : [],
        getSubmissionsByStudent(freshStudent.id),
        cls ? getAnnouncementsByClass(cls.id) : [],
        cls ? getResourcesByClass(cls.id) : [],
      ]);
    } catch (err) {
      console.error('Data loading error:', err);
    }

    if (activeView === 'assignment' && selectedAssignment) {
      renderAssignmentDetail(freshStudent, selectedAssignment, submissions);
      return;
    }

    container.innerHTML = `
      <div class="student-layout page-enter">
        <header class="student-topbar">
          <div class="student-topbar-logo">
            <div class="student-topbar-logo-icon">G</div>
            <div class="student-topbar-title">Genie Class</div>
          </div>
          <div class="student-topbar-user">
            <div class="student-topbar-avatar">${renderCharacter(freshStudent.characterLevel, 34, freshStudent.characterType || 'sunflower')}</div>
            <div class="student-topbar-name">${freshStudent.name}</div>
            <button class="btn btn-ghost btn-sm" id="btn-student-logout" style="margin-left: 10px;">로그아웃</button>
          </div>
        </header>

        <main class="student-dashboard">
          <section class="student-welcome flex justify-between items-end">
            <div>
              <h1 class="student-welcome-title">반가워요, <span>${freshStudent.name}</span>님!</h1>
              <p class="student-welcome-subtitle">${cls?.name || '클래스 정보 없음'} · ${config.name} (Lv.${freshStudent.characterLevel})</p>
            </div>
            <div class="badge badge-purple animate-up" style="padding: 8px 16px; font-size: 0.9rem;">포인트: ${freshStudent.totalPoints}P</div>
          </section>

          <section class="student-stats-row">
            <div class="card stat-card stat-card-featured">
              <div class="stat-card-label">나의 칭찬</div>
              <div class="stat-card-value-display" style="color: var(--accent-amber)">⭐ ${freshStudent.praiseCount}</div>
            </div>
            <div class="card stat-card">
              <div class="stat-card-label">발표 기록</div>
              <div class="stat-card-value-display">${presentations.length}</div>
            </div>
            <div class="card stat-card">
              <div class="stat-card-label">완료한 과제</div>
              <div class="stat-card-value-display" style="color: var(--success)">${submissions.length}</div>
            </div>
            <div class="card stat-card">
              <div class="stat-card-label">총 포인트</div>
              <div class="stat-card-value-display" style="color: var(--primary-light)">${freshStudent.totalPoints}</div>
            </div>
          </section>

          <!-- Character & Progress -->
          <section class="card flex items-center gap-lg" style="margin-bottom: var(--s-12); padding: var(--s-8);">
            <div class="student-character-float">
              ${renderCharacter(freshStudent.characterLevel, 100, freshStudent.characterType || 'sunflower')}
            </div>
            <div class="flex-1">
              <div class="flex justify-between items-end" style="margin-bottom: var(--s-2);">
                <span style="font-family: var(--font-title); font-size: 1.2rem;">${config.emoji} ${config.name}</span>
                <span style="font-family: var(--font-hand); font-size: 1.2rem;">${progress.isMaxLevel ? '최고 레벨 도달! 🎉' : `다음 레벨까지 ${progress.remainingPoints}P 남음`}</span>
              </div>
              <div style="background: var(--bg-main); height: 14px; border-radius: 7px; overflow: hidden; border: 2px solid var(--border-main);">
                <div style="width: ${progress.progressPercent}%; height: 100%; background: var(--primary); transition: width 0.5s;"></div>
              </div>
            </div>
          </section>
          <div class="student-grid">
            <!-- Assignments & Records -->
            <div class="flex flex-col gap-lg">
              <div class="section-card card">
                <div class="section-card-header">
                  <span style="font-size: 1.2rem;">📝</span>
                  <h2 class="section-card-title">오늘의 과제</h2>
                </div>
                <div class="flex flex-col gap-sm">
                  ${assignments.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 20px;">출제된 과제가 없습니다.</p>' : assignments.map(a => {
      const sub = submissions.find(s => s.assignmentId === a.id);
      return `
                      <div class="interactive-item assignment-item ${sub ? 'submitted' : 'pending'}" data-id="${a.id}">
                        <div>
                          <div style="font-weight: 600; font-size: 0.95rem;">${a.title}</div>
                          <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">기한: ${a.dueDate || '없음'}</div>
                        </div>
                        <span class="badge ${sub ? 'badge-green' : 'badge-purple'}">${sub ? '완료' : '미제출'}</span>
                      </div>
                    `;
    }).join('')}
                </div>
              </div>

              <div class="section-card card">
                <div class="section-card-header">
                  <span style="font-size: 1.2rem;">📁</span>
                  <h2 class="section-card-title">수업 자료실</h2>
                </div>
                <div class="flex flex-col gap-sm">
                  ${resources.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 20px;">공유된 자료가 없습니다.</p>' : resources.map(res => `
                    <div class="interactive-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                      <div style="font-weight: 600; font-size: 0.95rem;">${res.title}</div>
                      <div class="flex gap-sm" style="width: 100%; flex-wrap: wrap;">
                        ${res.files.map(f => `<button class="btn btn-secondary btn-sm" style="font-size: 0.75rem;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Announcements -->
            <div class="section-card card">
              <div class="section-card-header">
                <span style="font-size: 1.2rem;">📢</span>
                <h2 class="section-card-title">우리 반 소식</h2>
              </div>
              <div class="flex flex-col gap-sm">
                 ${announcements.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 20px;">새로운 소식이 없습니다.</p>' : announcements.map(ann => `
                   <div class="feed-item" style="margin-bottom: 0;">
                     <div style="font-weight: 700; margin-bottom: 8px; color: var(--text-white);">${ann.title}</div>
                     <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 15px;">${ann.content}</p>
                     ${ann.files && ann.files.length > 0 ? `
                       <div class="flex gap-sm" style="margin-bottom: 10px; flex-wrap: wrap;">
                         ${ann.files.map(f => `<span class="badge badge-blue" style="cursor: pointer; text-transform: none;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</span>`).join('')}
                       </div>
                     ` : ''}
                     <div style="font-size: 0.75rem; color: var(--text-dim);">${formatDate(ann.createdAt)}</div>
                   </div>
                 `).join('')}
              </div>
            </div>
          </div>
        </main>
      </div>

      <!-- Character Selection Modal -->
      ${!freshStudent.characterType ? `
        <div id="selection-modal" class="modal-backdrop active" style="z-index: 1000;">
          <div class="modal-content animate-up" style="max-width: 500px; text-align: center; background: var(--bg-card);">
            <h2 class="modal-title" style="margin-bottom: var(--s-4); font-family: var(--font-title);">🌱 나만의 반려 식물 고르기</h2>
            <p style="color: var(--text-muted); margin-bottom: var(--s-8); font-family: var(--font-sans);">함께 성장할 단짝 식물을 선택해봐요!</p>
            <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--s-4); margin-bottom: var(--s-8);">
              ${Object.entries(PLANT_TYPES).map(([id, info]) => `
                <div class="card selection-card" data-type="${id}" style="cursor: pointer; padding: var(--s-6); transition: all 0.3s var(--ease-out); border: 2px solid var(--border-main);">
                  <div style="font-size: 3rem; margin-bottom: 10px;">${info.icon}</div>
                  <div style="font-family: var(--font-title); font-size: 1.2rem;">${info.name}</div>
                </div>
              `).join('')}
            </div>
            <button class="btn btn-primary btn-lg w-full" id="btn-confirm-selection" disabled>이 식물로 할래요!</button>
          </div>
        </div>
        <style>
          .selection-card.selected {
            border-color: var(--primary) !important;
            background: #FFFDFC !important;
            transform: scale(1.05);
            box-shadow: var(--shadow-lg);
          }
        </style>
      ` : ''}
    `;

    bindEvents(assignments, freshStudent);
  }

  function startQuizListener() {
    if (unsubscribeQuiz) unsubscribeQuiz();
    unsubscribeQuiz = listenToActiveQuiz(student.classId, (quiz) => {
      if (quiz && quiz.active) {
        if (!activeQuiz || activeQuiz.id !== quiz.id) {
          activeQuiz = quiz;
          showToast('⚡ 번개 퀴즈가 시작되었습니다!', 'info');
          startSubmissionsListener(quiz.id);
          renderQuizOverlay();
        }
      } else {
        if (activeQuiz) {
          activeQuiz = null;
          if (unsubscribeSubmissions) unsubscribeSubmissions();
          removeQuizOverlay();
        }
      }
    });
  }

  function startSubmissionsListener(quizId) {
    if (unsubscribeSubmissions) unsubscribeSubmissions();
    unsubscribeSubmissions = listenToQuizSubmissions(quizId, (subs) => {
      quizSubmissions = subs;
      const gallery = document.getElementById('quiz-gallery');
      if (gallery) {
        gallery.innerHTML = subs.map(s => `
          <div class="card" style="padding: 10px; text-align: center;">
            <img src="${s.image.url}" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px;" />
            <div style="font-size: 0.8rem; margin-top: 5px; font-weight: 700;">${s.studentName}</div>
          </div>
        `).join('');
      }
    });
  }

  function renderQuizOverlay() {
    removeQuizOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'quiz-overlay';
    overlay.className = 'modal-backdrop active page-enter';
    overlay.style.zIndex = '500';
    overlay.innerHTML = `
      <div class="modal-content animate-up" style="max-width: 1200px; width: 95%; height: 90vh; display: flex; flex-direction: column;">
        <div class="modal-header">
          <h2 class="modal-title">⚡ 실시간 번개 퀴즈</h2>
          <div class="badge badge-purple">진행 중</div>
        </div>
        <div class="flex-1" style="display: grid; grid-template-columns: 1fr 340px; gap: 20px; overflow: hidden; padding: 10px 0;">
          <div style="overflow-y: auto; display: flex; flex-direction: column; gap: 20px;">
            <div class="card" style="background: #000; padding: 0; overflow: hidden;">
              <div class="input-label" style="padding: 10px 15px; background: rgba(255,255,255,0.05); margin: 0;">📋 문제</div>
              <img src="${activeQuiz.problemImage.url}" style="width: 100%; max-height: 400px; object-fit: contain;" />
            </div>
            <div class="card" style="padding: 20px;">
              <h3 style="margin-bottom: 15px;">내 풀이 제출</h3>
              <div class="drop-zone" id="quiz-solve-dropzone" style="padding: 30px;">
                <span style="font-size: 1.5rem;">📷</span>
                <p>풀이 사진을 업로드하세요</p>
                <input type="file" id="quiz-solve-input" class="hidden" accept="image/*" />
              </div>
              <button class="btn btn-primary btn-lg w-full" style="margin-top: 15px;" id="btn-submit-quiz-solve">풀이 제출 및 공유</button>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
            <h4 style="margin-bottom: 10px;">친구들의 풀이</h4>
            <div id="quiz-gallery" style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-content: start;"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#quiz-solve-dropzone').addEventListener('click', () => overlay.querySelector('#quiz-solve-input').click());
    overlay.querySelector('#btn-submit-quiz-solve').addEventListener('click', async () => {
      const input = overlay.querySelector('#quiz-solve-input');
      if (input.files.length === 0) { showToast('풀이 이미지를 선택해주세요.', 'error'); return; }
      try {
        const saved = await saveFile(input.files[0]);
        await submitQuizSolution(activeQuiz.id, student.id, student.name, saved);
        showToast('풀이가 제출되었습니다! 잘했어요! 🎉');
      } catch (err) { showToast('제출 중 오류 발생', 'error'); }
    });
    if (quizSubmissions.length > 0) startSubmissionsListener(activeQuiz.id);
  }

  function removeQuizOverlay() {
    const existing = document.getElementById('quiz-overlay');
    if (existing) existing.remove();
  }

  function bindEvents(assignments, freshStudent) {
    // Selection Modal Events
    const modal = document.getElementById('selection-modal');
    if (modal) {
      let selectedType = null;
      const confirmBtn = document.getElementById('btn-confirm-selection');
      
      modal.querySelectorAll('.selection-card').forEach(card => {
        card.addEventListener('click', () => {
          modal.querySelectorAll('.selection-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedType = card.dataset.type;
          confirmBtn.disabled = false;
        });
      });

      confirmBtn.addEventListener('click', async () => {
        if (!selectedType) return;
        try {
          await updateStudentCharacterType(freshStudent.id, selectedType);
          showToast(`${PLANT_TYPES[selectedType].name}와(과) 단짝이 되었어요! 🎉`);
          render();
        } catch (err) {
          showToast('선택 중 오류가 발생했습니다.', 'error');
        }
      });
    }

    document.getElementById('btn-student-logout')?.addEventListener('click', () => {
      logoutStudent(); if (unsubscribeQuiz) unsubscribeQuiz(); window.location.hash = '/student/login';
    });

    document.querySelectorAll('.assignment-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedAssignment = assignments.find(a => a.id === item.dataset.id);
        activeView = 'assignment';
        render();
      });
    });
  }

  function renderAssignmentDetail(freshStudent, assignment, submissions) {
    const sub = submissions.find(s => s.assignmentId === assignment.id);

    container.innerHTML = `
      <div class="student-layout page-enter">
        <header class="student-topbar">
          <button class="btn btn-ghost btn-sm" id="btn-back-dashboard">← 뒤로가기</button>
          <div class="student-topbar-title">과제 상세보기</div>
          <div style="width: 80px;"></div>
        </header>

        <main class="student-dashboard" style="max-width: 900px;">
          <div class="card animate-up" style="padding: var(--s-12); position: relative; overflow: hidden;">
            ${sub ? '<div class="badge badge-green" style="position: absolute; top: var(--s-12); right: var(--s-12);">제출 완료</div>' : ''}
            <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: var(--s-4);">${assignment.title}</h1>
            <p style="font-size: 1.1rem; color: var(--text-muted); line-height: 1.7; margin-bottom: var(--s-8); white-space: pre-line;">${assignment.description || '과제 설명이 없습니다.'}</p>
            
            ${assignment.files && assignment.files.length > 0 ? `
              <div style="margin-bottom: var(--s-8);">
                <div class="input-label">첨부 자료</div>
                <div class="flex gap-sm" style="flex-wrap: wrap;">
                  ${assignment.files.map(f => `<button class="btn btn-secondary btn-sm" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                </div>
              </div>
            ` : ''}

            <div class="divider"></div>

            <div class="form-section">
              <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: var(--s-4);">내 제출물</h3>
              ${sub ? `
                <div class="card" style="background: rgba(16, 185, 129, 0.05); border-color: var(--success); padding: var(--s-4);">
                  <p style="color: var(--success); font-weight: 600;">과제가 성공적으로 제출되었습니다.</p>
                  <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 5px;">제출 일시: ${formatDate(sub.createdAt)}</p>
                </div>
              ` : `
                <div class="drop-zone" style="background: var(--bg-surface); border-style: dashed; padding: var(--s-12); border-radius: var(--r-lg);" id="submission-dropzone">
                   <div style="font-size: 2rem; margin-bottom: 10px;">📤</div>
                   <div style="font-weight: 600;">파일을 드래그하거나 클릭하여 업로드</div>
                   <div style="font-size: 0.85rem; color: var(--text-dim); margin-top: 5px;">이미지, PDF, 문서 파일 지원</div>
                   <input type="file" id="submission-file" class="hidden" multiple />
                </div>
                <button class="btn btn-primary btn-lg w-full" style="margin-top: var(--s-6);" id="btn-submit-assignment">과제 제출하기</button>
              `}
            </div>
          </div>
        </main>
      </div>
    `;

    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => { activeView = 'dashboard'; render(); });
    const dropzone = document.getElementById('submission-dropzone');
    const fileInput = document.getElementById('submission-file');
    dropzone?.addEventListener('click', () => fileInput.click());

    document.getElementById('btn-submit-assignment')?.addEventListener('click', async () => {
      if (fileInput.files.length === 0) { showToast('제출할 파일을 선택해주세요.', 'error'); return; }
      try {
        const files = [];
        for (const file of fileInput.files) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        await submitAssignment(assignment.id, freshStudent.id, { files, shared: true });
        showToast('과제가 제출되었습니다! 🎉');
        activeView = 'dashboard';
        render();
      } catch (err) { showToast('제출 중 오류 발생', 'error'); }
    });
  }

  // Global download
  window.downloadFile = (fileId) => {
    import('../../store.js').then(m => m.downloadFile(fileId));
  };

  init();
}
