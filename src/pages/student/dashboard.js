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
  submitAssignment, saveFile, updateStudentCharacterType,
  getPresentationsByClass, toggleSharePresentation,
  createStudentSelfRecord, getStudentSelfRecords
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

  // File Queue for assignment submissions
  let submissionFilesQueue = [];
  let selfRecordFilesQueue = [];

  async function init() {
    await render();
    startQuizListener();
  }

  async function render() {
    let freshStudent = student;
    let cls = null;
    let config = getLevelConfig(student.characterLevel, student.characterType || 'apple');
    let progress = getLevelProgress(student.totalPoints || 0);
    let presentations = [];
    let assignments = [];
    let submissions = [];
    let announcements = [];
    let resources = [];
    let sharedPresentations = [];
    let selfRecords = [];

    try {
      freshStudent = await getStudentByCode(student.uniqueCode) || student;
      cls = await getClassById(freshStudent.classId);
      config = getLevelConfig(freshStudent.characterLevel, freshStudent.characterType || 'apple');
      progress = getLevelProgress(freshStudent.totalPoints || 0);

      let allPresentations = [];
      [assignments, submissions, announcements, resources, allPresentations, selfRecords] = await Promise.all([
        cls ? getAssignmentsByClass(cls.id) : [],
        getSubmissionsByStudent(freshStudent.id),
        cls ? getAnnouncementsByClass(cls.id) : [],
        cls ? getResourcesByClass(cls.id) : [],
        cls ? getPresentationsByClass(cls.id) : [],
        getStudentSelfRecords(freshStudent.id),
      ]);
      presentations = allPresentations.filter(p => p.studentId === freshStudent.id);
      sharedPresentations = allPresentations.filter(p => p.studentId !== freshStudent.id && p.shared === true);
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
            <div class="student-topbar-avatar">${renderCharacter(freshStudent.characterLevel, 34, freshStudent.characterType || 'apple', freshStudent.totalPoints)}</div>
            <div class="student-topbar-name">${freshStudent.name}</div>
            <button class="btn btn-ghost btn-sm" id="btn-student-logout" style="margin-left: 10px;">로그아웃</button>
          </div>
        </header>

        <main class="student-dashboard student-dashboard--compact">
          <section class="student-welcome flex justify-between items-end">
            <div>
              <h1 class="student-welcome-title">반가워요, <span>${freshStudent.name}</span>님!</h1>
              <p class="student-welcome-subtitle">${cls?.name || '클래스 정보 없음'} · ${config.name} (Lv.${freshStudent.characterLevel})</p>
            </div>
            <div class="badge badge-purple animate-up" style="padding: 8px 16px; font-size: 0.9rem;">포인트: ${freshStudent.totalPoints}P</div>
          </section>

          <section class="student-stats-row">
            <div class="card stat-card stat-card-featured">
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
          <section class="card student-dashboard-char-row flex items-center gap-md">
            <div class="student-character-float">
              ${renderCharacter(freshStudent.characterLevel, 70, freshStudent.characterType || 'apple', freshStudent.totalPoints)}
            </div>
            <div class="flex-1">
              <div class="flex justify-between items-end" style="margin-bottom: var(--s-2);">
                <span style="font-family: var(--font-title); font-size: 1.2rem;">${config.emoji} ${config.name}</span>
                <div class="flex items-center gap-sm">
                  <span style="font-family: var(--font-hand); font-size: 1.2rem;">${progress.isMaxLevel ? '최고 레벨 도달! 🎉' : `다음 레벨까지 ${progress.remainingPoints}P 남음`}</span>
                  <button class="btn btn-ghost btn-sm" id="btn-change-character" style="font-size: 0.8rem; padding: 4px 10px; border: 1px solid var(--border-subtle); border-radius: var(--r-md);">🔄 열매 변경</button>
                </div>
              </div>
              <div style="background: var(--bg-main); height: 14px; border-radius: 7px; overflow: hidden; border: 2px solid var(--border-main);">
                <div style="width: ${progress.progressPercent}%; height: 100%; background: var(--primary); transition: width 0.5s;"></div>
              </div>
            </div>
          </section>
          <div class="student-grid-73 student-dashboard-main-grid">
            <!-- Assignments & Records -->
            <div class="flex flex-col student-dashboard-col-gap">
              <div class="section-card card">
                <div class="section-card-header">
                  <span style="font-size: 1.2rem;">📝</span>
                  <h2 class="section-card-title">과제 목록</h2>
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

            <div class="flex flex-col student-dashboard-col-gap">
              <!-- Announcements -->
              <div class="section-card card">
                <div class="section-card-header">
                  <span style="font-size: 1.2rem;">📢</span>
                  <h2 class="section-card-title">공지사항</h2>
                </div>
                <div class="flex flex-col gap-sm student-dashboard-announce-scroll">
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

              <!-- Student Self Records -->
              <div class="section-card card">
                <div class="section-card-header">
                  <span style="font-size: 1.2rem;">📌</span>
                  <h2 class="section-card-title">나의 생기부 참고 기록</h2>
                </div>
                <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin-bottom: var(--s-4);">
                  수업 중 배운 점, 발표 준비, 탐구 활동, 느낀 점 등을 스스로 남겨보세요. 이 기록은 생기부 작성을 위한 참고 자료로 활용될 수 있습니다.
                </p>
                <div class="form-group" style="margin-bottom: var(--s-3);">
                  <input type="text" class="input-field" id="self-record-title" placeholder="제목을 입력하세요" />
                </div>
                <div class="form-group" style="margin-bottom: var(--s-3);">
                  <textarea class="input-field" id="self-record-content" rows="3" placeholder="기록할 내용을 입력하세요"></textarea>
                </div>
                <div class="drop-zone" id="self-record-dropzone" style="height: 110px; padding: 16px; margin-bottom: var(--s-3);">
                  <div style="font-size: 1.4rem;">📎</div>
                  <div style="font-weight: 600; font-size: 0.9rem;">파일을 추가하려면 클릭하거나 끌어오세요</div>
                  <input type="file" id="self-record-files" multiple class="hidden" />
                </div>
                <div id="self-record-file-list" class="file-queue-list" style="margin-bottom: var(--s-3);"></div>
                <button class="btn btn-primary w-full" id="btn-save-self-record">기록 저장하기</button>

                <div class="divider" style="margin: var(--s-6) 0;"></div>
                <div class="flex flex-col gap-sm" id="self-record-list">
                  ${selfRecords.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 10px;">아직 작성한 기록이 없습니다.</p>' : selfRecords.map(record => `
                    <div class="interactive-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                      <div class="flex justify-between items-center" style="width: 100%; gap: 10px;">
                        <div style="font-weight: 700; font-size: 0.95rem;">${record.title}</div>
                        <span style="font-size: 0.75rem; color: var(--text-dim); white-space: nowrap;">${formatDate(record.createdAt)}</span>
                      </div>
                      <div style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.5; white-space: pre-line;">${record.content}</div>
                      ${record.files && record.files.length > 0 ? `
                        <div class="flex gap-sm" style="flex-wrap: wrap;">
                          ${record.files.map(f => `<button class="btn btn-secondary btn-sm" style="font-size: 0.75rem;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                        </div>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <div class="student-grid-37 student-dashboard-bottom-grid">
            <!-- My Presentations -->
            <div class="section-card card">
              <div class="section-card-header">
                <span style="font-size: 1.2rem;">🎤</span>
                <h2 class="section-card-title">나의 발표 기록</h2>
              </div>
              <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--s-4);">
                 ${presentations.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 20px;">발표 기록이 없습니다.</p>' : presentations.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(p => `
                   <div class="card presentation-item" style="padding: 10px;">
                     <div class="flex justify-between items-center" style="margin-bottom: 5px;">
                        <span class="badge badge-main">${formatDate(p.createdAt)}</span>
                        <button class="btn btn-sm ${p.shared ? 'btn-danger' : 'btn-primary'} btn-toggle-share" data-id="${p.id}" data-shared="${p.shared}">${p.shared ? '공유 끄기' : '친구와 공유'}</button>
                     </div>
                     <img src="${p.whiteboardImage?.url}" style="width:100%; aspect-ratio: 16/9; object-fit: contain; background: #000; border-radius: 4px; margin-bottom: 5px; cursor:pointer;" class="img-preview" onclick="window.open('${p.whiteboardImage?.url}')"/>
                     ${p.audioData ? `
                       <button class="btn btn-secondary w-full btn-sm btn-play-video" data-url="${p.audioData.url}">
                         ${p.recordingMode === 'video' ? '🎬 발표 영상 보기' : '🔊 발표 음성 듣기'}
                       </button>
                     ` : `<button class="btn btn-ghost w-full btn-sm" disabled>기록 없음</button>`}
                   </div>
                 `).join('')}
              </div>
            </div>

            <!-- Shared Presentations -->
            <div class="section-card card">
              <div class="section-card-header">
                <span style="font-size: 1.2rem;">👀</span>
                <h2 class="section-card-title">친구들의 멋진 발표</h2>
              </div>
              <div class="flex flex-col gap-sm">
                 ${sharedPresentations.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 20px;">공유된 발표가 없습니다.</p>' : sharedPresentations.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(p => `
                   <div class="card presentation-item flex items-center justify-between" style="padding: 12px 16px; margin: 0;">
                     <div class="flex items-center gap-md">
                        <span class="badge badge-purple">학우 공유</span>
                        <span style="font-weight: 700; font-size: 1.05rem;">${p.title || '제목 없는 발표'}</span>
                     </div>
                     <div class="flex items-center gap-sm">
                        <span style="font-size: 0.85rem; color: var(--text-dim); margin-right: 10px;">${formatDate(p.createdAt)}</span>
                        ${p.audioData ? `
                          <button class="btn btn-secondary btn-sm btn-play-video" data-url="${p.audioData.url}">
                            ${p.recordingMode === 'video' ? '🎬 영상보기' : '🔊 음성듣기'}
                          </button>
                        ` : `
                          <button class="btn btn-ghost btn-sm" onclick="window.open('${p.whiteboardImage?.url}')">🖼️ 보기</button>
                        `}
                     </div>
                   </div>
                 `).join('')}
              </div>
            </div>
          </div>
        </main>
      </div>

      <!-- Video Modal -->
      <div class="modal-backdrop" id="video-modal" style="z-index: 2000;">
        <div class="modal-content" style="max-width: 1000px; width: 90%; background: #000; padding: 0;">
          <div class="modal-header" style="background: rgba(0,0,0,0.5); position: absolute; top: 0; left: 0; right: 0; z-index: 10;">
             <h3 class="modal-title" style="color: #fff;">발표 영상</h3>
             <button class="modal-close" style="color: #fff; background: rgba(255,255,255,0.1);" id="close-video-modal">✕</button>
          </div>
          <video id="player" controls style="width: 100%; aspect-ratio: 16/9; display: block; border-radius: var(--r-lg);">소스가 없습니다.</video>
        </div>
      </div>

      <!-- Character Selection Modal (shown on first login OR when changing) -->
      <div id="selection-modal" class="modal-backdrop ${!freshStudent.characterType ? 'active' : ''}" style="z-index: 1000;">
        <div class="modal-content animate-up" style="max-width: 700px; text-align: center; background: var(--bg-card); max-height: 90vh; overflow-y: auto;">
          <h2 class="modal-title" style="margin-bottom: var(--s-4); font-family: var(--font-title);">🌱 나만의 반려 식물 고르기</h2>
          <p style="color: var(--text-muted); margin-bottom: var(--s-6); font-family: var(--font-sans);">${freshStudent.characterType ? '새로운 단짝 식물을 골라보세요!' : '함께 성장할 단짝 식물을 선택해봐요!'}</p>
          <div class="grid" style="grid-template-columns: repeat(5, 1fr); gap: var(--s-3); margin-bottom: var(--s-6);">
            ${Object.entries(PLANT_TYPES).map(([id, info]) => `
              <div class="card selection-card ${freshStudent.characterType === id ? 'current' : ''}" data-type="${id}" style="cursor: pointer; padding: var(--s-3) var(--s-2); transition: all 0.3s var(--ease-out); border: 2px solid var(--border-main); min-width: 0;">
                <div style="font-size: 2rem; margin-bottom: 4px;">${info.icon}</div>
                <div style="font-family: var(--font-title); font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${info.name}</div>
              </div>
            `).join('')}
          </div>
          <div class="flex gap-sm">
            ${freshStudent.characterType ? '<button class="btn btn-ghost btn-lg flex-1" id="btn-cancel-selection">취소</button>' : ''}
            <button class="btn btn-primary btn-lg ${freshStudent.characterType ? 'flex-1' : 'w-full'}" id="btn-confirm-selection" disabled>이 식물로 할래요!</button>
          </div>
        </div>
      </div>
      <style>
        .selection-card.selected {
          border-color: var(--primary) !important;
          background: #FFFDFC !important;
          transform: scale(1.05);
          box-shadow: var(--shadow-lg);
        }
        .selection-card.current {
          border-color: var(--text-dim) !important;
          opacity: 0.6;
        }
        .selection-card.current::after {
          content: '현재';
          display: block;
          font-size: 0.65rem;
          color: var(--text-dim);
          margin-top: 2px;
        }
      </style>
    `;

    bindEvents(assignments, freshStudent);
  }

  function startQuizListener() {
    if (unsubscribeQuiz) unsubscribeQuiz();
    unsubscribeQuiz = listenToActiveQuiz(student.classId, (quiz) => {
      if (quiz && quiz.active) {
        // 학생이 이미 닫은 퀴즈는 다시 표시하지 않음
        if (dismissedQuizIds.has(quiz.id)) return;
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
          <div class="card" style="padding: 10px; text-align: center; display: flex; flex-direction: column; gap: 8px;">
            ${s.image ? `<img src="${s.image.url}" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px;" />` : ''}
            ${s.solutionText ? `<div style="font-size: 0.85rem; background: var(--bg-main); padding: 8px; border-radius: 6px; text-align: left; white-space: pre-wrap;">${s.solutionText}</div>` : ''}
            <div style="font-size: 0.8rem; margin-top: auto; font-weight: 700; color: var(--primary-light);">${s.studentName}</div>
          </div>
        `).join('');
        
        if (window.renderMathInElement) {
          renderMathInElement(gallery, {
            delimiters: [
              {left: '$$', right: '$$', display: true},
              {left: '$', right: '$', display: false}
            ],
            throwOnError: false
          });
        }
      }
    });
}

  // Track dismissed quiz IDs so they don't reappear
  let dismissedQuizIds = new Set();

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
          <div class="flex items-center gap-sm">
            <div class="badge badge-purple">진행 중</div>
            <button class="modal-close" id="btn-close-quiz-overlay" title="닫기">✕</button>
          </div>
        </div>
        <div class="flex-1" style="display: grid; grid-template-columns: 1fr 340px; gap: 20px; overflow: hidden; padding: 10px 0;">
          <div style="overflow-y: auto; display: flex; flex-direction: column; gap: 20px;">
            <div class="card" style="background: var(--bg-surface); padding: 0; overflow: hidden; border: 2px solid var(--primary-light);">
              <div class="input-label" style="padding: 10px 15px; background: rgba(255,255,255,0.05); margin: 0; font-size: 1.1rem; color: var(--primary-light);">📋 문제</div>
              <div style="padding: 20px;">
                ${activeQuiz.problemText ? `<div id="quiz-problem-text" style="font-size: 1.4rem; line-height: 1.6; margin-bottom: 20px; white-space: pre-wrap;">${activeQuiz.problemText}</div>` : ''}
                ${activeQuiz.problemImage ? `<img src="${activeQuiz.problemImage.url}" style="width: 100%; max-height: 500px; object-fit: contain; border-radius: 8px; background: #000;" />` : ''}
              </div>
            </div>
            
            <div class="card" style="padding: 25px;">
              <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.5rem;">✍️</span> 내 풀이 제출
              </h3>
              
              <div class="form-group" style="margin-bottom: 20px;">
                <label class="input-label">답안 입력 (선택)</label>
                <textarea class="input-field" id="quiz-solve-text" rows="3" placeholder="답안을 입력하세요. 수식은 $...$ 사이에 입력하세요."></textarea>
              </div>

              <div class="form-group" style="margin-bottom: 20px;">
                <label class="input-label">사진 제출 (선택)</label>
                <div class="drop-zone" id="quiz-solve-dropzone" style="padding: 20px; height: 120px;">
                  <span style="font-size: 1.5rem;">📷</span>
                  <p id="quiz-solve-status">풀이 사진을 업로드하세요</p>
                  <input type="file" id="quiz-solve-input" class="hidden" accept="image/*" />
                </div>
              </div>

              <button class="btn btn-primary btn-lg w-full" style="height: 60px; font-size: 1.2rem;" id="btn-submit-quiz-solve">✨ 풀이 제출 및 공유</button>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
            <h4 style="margin-bottom: 15px; color: var(--text-muted);">친구들의 풀이</h4>
            <div id="quiz-gallery" style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: 1fr; gap: 15px; align-content: start;"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 닫기 버튼: 현재 퀴즈를 무시 목록에 추가하고 오버레이 제거
    overlay.querySelector('#btn-close-quiz-overlay').addEventListener('click', () => {
      if (activeQuiz) {
        dismissedQuizIds.add(activeQuiz.id);
      }
      activeQuiz = null;
      removeQuizOverlay();
    });

    const solveInput = overlay.querySelector('#quiz-solve-input');
    const solveStatus = overlay.querySelector('#quiz-solve-status');
    const solveText = overlay.querySelector('#quiz-solve-text');

    overlay.querySelector('#quiz-solve-dropzone').addEventListener('click', () => solveInput.click());
    solveInput.addEventListener('change', () => {
      if (solveInput.files[0]) solveStatus.textContent = `선택됨: ${solveInput.files[0].name}`;
    });

    overlay.querySelector('#btn-submit-quiz-solve').addEventListener('click', async () => {
      const solutionText = solveText.value.trim();
      const hasImage = solveInput.files[0];
      
      if (!solutionText && !hasImage) { showToast('답안을 입력하거나 사진을 선택해주세요.', 'error'); return; }
      
      const submitBtn = overlay.querySelector('#btn-submit-quiz-solve');
      submitBtn.disabled = true;
      submitBtn.textContent = '제출 중...';

      try {
        let saved = null;
        if (hasImage) saved = await saveFile(solveInput.files[0]);
        await submitQuizSolution(activeQuiz.id, student.id, student.name, saved, solutionText);
        showToast('풀이가 제출되었습니다! 잘했어요! 🎉');
        solveText.value = '';
        solveInput.value = '';
        solveStatus.textContent = '풀이 사진을 업로드하세요';
      } catch (err) { showToast('제출 중 오류 발생', 'error'); }
      finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '✨ 풀이 제출 및 공유';
      }
    });

    // LaTeX rendering for problem and gallery
    setTimeout(() => {
      if (window.renderMathInElement) {
        renderMathInElement(overlay, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false}
          ],
          throwOnError: false
        });
      }
    }, 100);

    if (quizSubmissions.length > 0) startSubmissionsListener(activeQuiz.id);
}

  function removeQuizOverlay() {
    const existing = document.getElementById('quiz-overlay');
    if (existing) existing.remove();
  }

  function bindEvents(assignments, freshStudent) {
    // Media Playback Modal
    const videoModal = document.getElementById('video-modal');
    const player = document.getElementById('player');
    if (videoModal && player) {
        document.querySelectorAll('.btn-play-video').forEach(btn => {
            btn.addEventListener('click', () => {
                player.src = btn.dataset.url;
                videoModal.classList.add('active');
                player.play();
            });
        });
        document.getElementById('close-video-modal')?.addEventListener('click', () => {
            player.pause(); player.src = '';
            videoModal.classList.remove('active');
        });
        videoModal.addEventListener('click', (e) => {
            if (e.target === videoModal) {
                player.pause(); player.src = '';
                videoModal.classList.remove('active');
            }
        });
    }

    // Toggle Share
    document.querySelectorAll('.btn-toggle-share').forEach(btn => {
        btn.addEventListener('click', async () => {
            const presentationId = btn.dataset.id;
            const isShared = btn.dataset.shared === 'true';
            
            let title = null;
            if (!isShared) {
                 title = prompt('공유할 발표의 제목을 입력해주세요 (예: 기하 1-6프린트 1번 문제):');
                 if (title === null || title.trim() === '') {
                     showToast('제목 작성이 취소되어 공유가 보류되었습니다.', 'info');
                     return;
                 }
            }

            try {
                await toggleSharePresentation(presentationId, title);
                showToast(isShared ? '공유가 해제되었습니다.' : '공유 완료!');
                render();
            } catch (err) {
                showToast('오류가 발생했습니다.', 'error');
            }
        });
    });

    // Selection Modal Events
    const modal = document.getElementById('selection-modal');
    if (modal) {
      let selectedType = null;
      const confirmBtn = document.getElementById('btn-confirm-selection');
      const cancelBtn = document.getElementById('btn-cancel-selection');
      
      modal.querySelectorAll('.selection-card').forEach(card => {
        card.addEventListener('click', () => {
          modal.querySelectorAll('.selection-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedType = card.dataset.type;
          confirmBtn.disabled = false;
        });
      });

      cancelBtn?.addEventListener('click', () => {
        modal.classList.remove('active');
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

    // Change Character Button
    document.getElementById('btn-change-character')?.addEventListener('click', () => {
      const modal = document.getElementById('selection-modal');
      if (modal) modal.classList.add('active');
    });

    function updateSelfRecordFileListUI() {
      const listContainer = document.getElementById('self-record-file-list');
      if (!listContainer) return;

      listContainer.innerHTML = selfRecordFilesQueue.map((f, idx) => `
        <div class="file-queue-item" style="border-left: 4px solid var(--primary);">
          <div class="file-item-info">
            <span style="font-size: 1.1rem;">📄</span>
            <span class="file-item-name">${f.name}</span>
          </div>
          <button class="btn-remove-file" onclick="window.removeQueuedSelfRecordFile(${idx})">✕</button>
        </div>
      `).join('');
    }

    window.removeQueuedSelfRecordFile = (index) => {
      selfRecordFilesQueue.splice(index, 1);
      updateSelfRecordFileListUI();
    };

    const selfRecordDropzone = document.getElementById('self-record-dropzone');
    const selfRecordFileInput = document.getElementById('self-record-files');

    const addSelfRecordFiles = (files) => {
      const fileArray = Array.from(files);
      const newFiles = fileArray.filter(nf => !selfRecordFilesQueue.some(qf => qf.name === nf.name && qf.size === nf.size));
      selfRecordFilesQueue = [...selfRecordFilesQueue, ...newFiles];
      updateSelfRecordFileListUI();
    };

    selfRecordDropzone?.addEventListener('click', () => selfRecordFileInput.click());
    selfRecordFileInput?.addEventListener('change', () => {
      if (selfRecordFileInput.files.length > 0) {
        addSelfRecordFiles(selfRecordFileInput.files);
        selfRecordFileInput.value = '';
      }
    });
    selfRecordDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      selfRecordDropzone.classList.add('dragover');
    });
    selfRecordDropzone?.addEventListener('dragleave', () => {
      selfRecordDropzone.classList.remove('dragover');
    });
    selfRecordDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      selfRecordDropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) addSelfRecordFiles(e.dataTransfer.files);
    });

    document.getElementById('btn-save-self-record')?.addEventListener('click', async () => {
      const title = document.getElementById('self-record-title').value.trim();
      const content = document.getElementById('self-record-content').value.trim();
      if (!title) { showToast('제목을 입력해주세요.', 'error'); return; }
      if (!content && selfRecordFilesQueue.length === 0) { showToast('내용을 쓰거나 파일을 추가해주세요.', 'error'); return; }

      const saveBtn = document.getElementById('btn-save-self-record');
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';

      try {
        const files = [];
        for (const file of selfRecordFilesQueue) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        await createStudentSelfRecord(freshStudent.id, freshStudent.classId, { title, content, files });
        selfRecordFilesQueue = [];
        showToast('나의 기록이 저장되었습니다!');
        render();
      } catch (err) {
        console.error('Self record save error:', err);
        showToast('기록 저장 중 오류가 발생했습니다.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = '기록 저장하기';
      }
    });

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
                <div class="input-label">교사 첨부 자료</div>
                <div class="flex gap-sm" style="flex-wrap: wrap;">
                  ${assignment.files.map(f => `<button class="btn btn-secondary btn-sm" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                </div>
              </div>
            ` : ''}

            <div class="divider"></div>

            <div class="form-section">
              <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: var(--s-4);">내 제출물</h3>
              
              <div id="submission-status-view" class="${sub ? '' : 'hidden'}">
                ${sub ? `
                  <div class="card" style="background: rgba(16, 185, 129, 0.05); border-color: var(--success); padding: var(--s-6); margin-bottom: var(--s-4);">
                    <div class="flex justify-between items-center" style="margin-bottom: var(--s-4);">
                       <p style="color: var(--success); font-weight: 600;">과제가 제출되었습니다.</p>
                       <span style="font-size: 0.85rem; color: var(--text-dim);">제출: ${formatDate(sub.createdAt)}</span>
                    </div>
                    <div class="flex gap-sm" style="flex-wrap: wrap; margin-bottom: var(--s-4);">
                      ${sub.files.map(f => `<button class="btn btn-ghost btn-sm" style="border: 1px solid var(--border-subtle);" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                    </div>
                    <button class="btn btn-outline btn-sm w-full" id="btn-edit-submission">제출물 수정하기</button>
                  </div>
                ` : ''}
              </div>

              <div id="submission-form-view" class="${sub ? 'hidden' : ''}">
                <div class="drop-zone" style="background: var(--bg-surface); border-style: dashed; padding: var(--s-12); border-radius: var(--r-lg);" id="submission-dropzone">
                   <div style="font-size: 2rem; margin-bottom: 10px;">📤</div>
                   <div style="font-weight: 600;">파일을 드래그하거나 클릭하여 업로드</div>
                   <div style="font-size: 0.85rem; color: var(--text-dim); margin-top: 5px;">${sub ? '새로 업로드하면 기존 파일이 대체됩니다.' : '여러 파일 업로드(HTML 등) 가능'}</div>
                   <div id="submission-file-list" style="margin-top: 15px; font-size: 0.9rem; color: var(--primary); font-weight: 500;"></div>
                   <input type="file" id="submission-file" class="hidden" multiple />
                </div>
                <div class="flex gap-md" style="margin-top: var(--s-6);">
                  ${sub ? `<button class="btn btn-ghost btn-lg flex-1" id="btn-cancel-edit">취소</button>` : ''}
                  <button class="btn btn-primary btn-lg ${sub ? 'flex-1' : 'w-full'}" id="btn-submit-assignment">${sub ? '수정 완료' : '과제 제출하기'}</button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    `;

    function updateSubmissionFileListUI() {
      const listContainer = document.getElementById('submission-file-list');
      if (!listContainer) return;
      
      listContainer.innerHTML = submissionFilesQueue.map((f, idx) => `
        <div class="file-queue-item" style="border-left: 4px solid var(--primary);">
          <div class="file-item-info">
            <span style="font-size: 1.1rem;">📄</span>
            <span class="file-item-name">${f.name}</span>
          </div>
          <button class="btn-remove-file" onclick="window.removeQueuedSubmissionFile(${idx})">✕</button>
        </div>
      `).join('');
    }

    window.removeQueuedSubmissionFile = (index) => {
      submissionFilesQueue.splice(index, 1);
      updateSubmissionFileListUI();
    };

    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => { 
      submissionFilesQueue = []; 
      activeView = 'dashboard'; 
      render(); 
    });
    
    const statusView = document.getElementById('submission-status-view');
    const formView = document.getElementById('submission-form-view');
    const editBtn = document.getElementById('btn-edit-submission');
    const cancelEditBtn = document.getElementById('btn-cancel-edit');
    const dropzone = document.getElementById('submission-dropzone');
    const fileInput = document.getElementById('submission-file');
    const fileListDisplay = document.getElementById('submission-file-list');

    editBtn?.addEventListener('click', () => {
      submissionFilesQueue = [];
      statusView.classList.add('hidden');
      formView.classList.remove('hidden');
      updateSubmissionFileListUI();
    });

    cancelEditBtn?.addEventListener('click', () => {
      submissionFilesQueue = [];
      formView.classList.add('hidden');
      statusView.classList.remove('hidden');
    });
    
    dropzone?.addEventListener('click', () => fileInput.click());
    
    fileInput?.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        submissionFilesQueue = [...submissionFilesQueue, ...Array.from(fileInput.files)];
        fileInput.value = '';
        updateSubmissionFileListUI();
      }
    });

    // Handle Drop
    dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone?.addEventListener('dragleave', () => { dropzone.classList.remove('dragover'); });
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        submissionFilesQueue = [...submissionFilesQueue, ...Array.from(e.dataTransfer.files)];
        updateSubmissionFileListUI();
      }
    });

    document.getElementById('btn-submit-assignment')?.addEventListener('click', async () => {
      if (submissionFilesQueue.length === 0) { showToast('제출할 파일을 선택해주세요.', 'error'); return; }
      const submitBtn = document.getElementById('btn-submit-assignment');
      submitBtn.disabled = true;
      submitBtn.textContent = '제출 중...';
      
      try {
        const files = [];
        for (const file of submissionFilesQueue) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        await submitAssignment(assignment.id, freshStudent.id, { files, shared: true });
        
        showToast(sub ? '제출물이 수정되었습니다! 🎉' : '과제가 제출되었습니다! 🎉');
        submissionFilesQueue = [];
        activeView = 'dashboard';
        render();
      } catch (err) { 
        showToast('제출 중 오류 발생', 'error'); 
        submitBtn.disabled = false;
        submitBtn.textContent = sub ? '수정 완료' : '과제 제출하기';
      }
    });
  }

  // Global download
  window.downloadFile = (fileId) => {
    import('../../store.js').then(m => m.downloadFile(fileId));
  };

  init();
}
