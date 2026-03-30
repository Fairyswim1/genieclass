// ========================================
// Teacher Lesson Mode (v2.0)
// ========================================
import {
  getCurrentTeacher, getClassById, getStudentsByClass,
  praiseStudent, showToast, getStudentById, addPresentation,
  toggleSharePresentation, startQuiz, stopQuiz, listenToQuizSubmissions,
  saveFile
} from '../../store.js';
import { renderCharacter, getLevelConfig, renderPraiseAnimation } from '../../components/characterAvatar.js';

export function renderLessonMode(container, params) {
  const teacher = getCurrentTeacher();
  if (!teacher) { window.location.hash = '/teacher/login'; return; }

  const classId = params.id;
  let cls = null;
  let students = [];
  let selectedStudent = null;
  let activeView = 'lesson'; // 'lesson', 'whiteboard', 'quiz'

  // Quiz State
  let activeQuiz = null;
  let quizSubmissions = [];
  let unsubscribeSubmissions = null;

  // Whiteboard State
  let wbCanvas, wbCtx;
  let drawing = false;
  let penColor = '#FFFFFF';
  let penSize = 3;
  let currentTool = 'pen';
  let isRecording = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedAudioBlob = null;
  let recordingTimer = null;
  let recordingSeconds = 0;

  async function init() {
    cls = await getClassById(classId);
    if (!cls) { window.location.hash = '/teacher/dashboard'; return; }
    await render();
  }

  async function render() {
    students = await getStudentsByClass(classId);

    if (activeView === 'whiteboard') {
      renderWhiteboardMode();
      return;
    }

    if (activeView === 'quiz') {
      renderQuizMode();
      return;
    }

    container.innerHTML = `
      <div class="teacher-layout page-enter">
        <main class="main-content" style="margin-left:0; max-width: 1850px; margin: 0 auto; width: 100%;">
          <div class="lesson-header flex justify-between items-center" style="margin-bottom: var(--s-8);">
            <div class="flex items-center gap-md">
              <button class="btn btn-ghost btn-sm" id="btn-back-dashboard">← 대시보드</button>
              <h2 class="page-title" style="margin-bottom: 0;">${cls.name} <span class="badge badge-purple" style="vertical-align: middle; margin-left: 10px;">수업 중</span></h2>
            </div>
            <div class="flex gap-sm">
              <button class="btn btn-primary btn-sm" id="btn-start-quiz-view">⚡ 번개 퀴즈</button>
              <div class="badge badge-blue">학생 ${students.length}명 접속</div>
            </div>
          </div>

          <div class="student-grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--s-6);">
            ${students.map(s => {
      const config = getLevelConfig(s.characterLevel, s.characterType || 'chick');
      return `
                <div class="student-avatar-card card ${selectedStudent?.id === s.id ? 'selected' : ''}" data-student-id="${s.id}">
                  <div class="student-character">
                    ${renderCharacter(s.characterLevel, 80, s.characterType || 'chick')}
                  </div>
                  <div class="student-name">${s.name}</div>
                  <div class="student-praise-count">⭐ ${s.praiseCount}P</div>
                </div>
              `;
    }).join('')}
            ${students.length === 0 ? '<div class="empty-state w-full">학생이 없습니다.</div>' : ''}
          </div>
        </main>

        <!-- Student Action Panel -->
        <div class="student-action-panel ${selectedStudent ? 'open' : ''}">
          ${selectedStudent ? `
            <div class="action-panel-header">
              <h3 style="font-weight: 800; font-size: 1.25rem;">${selectedStudent.name}</h3>
              <button class="modal-close" id="close-action-panel">✕</button>
            </div>
            <div class="action-panel-body">
               <div class="text-center" style="margin-bottom: var(--s-8);">
                 <div style="width: 120px; height: 120px; margin: 0 auto 15px;">
                   ${renderCharacter(selectedStudent.characterLevel, 120, selectedStudent.characterType || 'chick')}
                 </div>
                 <div class="badge badge-purple">${getLevelConfig(selectedStudent.characterLevel, selectedStudent.characterType || 'chick').name}</div>
               </div>
               <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                 <button class="btn btn-primary" id="btn-praise" style="flex-direction: column; height: 100px; gap: 10px;">
                   <span style="font-size: 1.5rem;">⭐</span>
                   <span>칭찬하기</span>
                 </button>
                 <button class="btn btn-secondary" id="btn-present" style="flex-direction: column; height: 100px; gap: 10px;">
                   <span style="font-size: 1.5rem;">🎤</span>
                   <span>발표하기</span>
                 </button>
               </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    bindLessonEvents();
  }

  function bindLessonEvents() {
    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => { window.location.hash = '/teacher/dashboard'; });
    document.getElementById('btn-start-quiz-view')?.addEventListener('click', () => { activeView = 'quiz'; render(); });

    document.querySelectorAll('.student-avatar-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedStudent = students.find(s => s.id === card.dataset.studentId);
        render();
      });
    });

    document.getElementById('close-action-panel')?.addEventListener('click', () => { selectedStudent = null; render(); });

    document.getElementById('btn-praise')?.addEventListener('click', async () => {
      const updated = await praiseStudent(selectedStudent.id);
      if (updated) {
        selectedStudent = updated;
        showToast(`${updated.name}에게 칭찬을 보냈습니다!`);
        render();
      }
    });

    document.getElementById('btn-present')?.addEventListener('click', () => {
      activeView = 'whiteboard';
      render();
    });
  }

  // --- Quiz Mode ---
  function renderQuizMode() {
    container.innerHTML = `
      <div class="teacher-layout page-enter">
        <main class="main-content" style="max-width: 1400px; margin: 0 auto; width: 100%;">
          <header class="page-header flex justify-between items-center">
            <div>
              <button class="btn btn-ghost btn-sm" id="quiz-back">← 수업으로</button>
              <h1 class="page-title">⚡ 번개 퀴즈 <span class="badge ${activeQuiz ? 'badge-green' : 'badge-purple'}">${activeQuiz ? '진행 중' : '준비'}</span></h1>
            </div>
            ${activeQuiz ? `<button class="btn btn-danger" id="btn-stop-quiz">퀴즈 종료</button>` : ''}
          </header>

          <div class="grid" style="grid-template-columns: 1fr 340px; gap: var(--s-8);">
            <!-- Left: Problem & Gallery -->
            <div class="flex flex-col gap-lg">
              ${!activeQuiz ? `
                <div class="card" style="padding: var(--s-12); text-align: center;">
                  <h3 style="margin-bottom: var(--s-4);">새 퀴즈 출제하기</h3>
                  <div class="drop-zone" id="quiz-img-dropzone" style="height: 300px; display: flex; flex-direction: column; justify-content: center;">
                    <span style="font-size: 3rem; margin-bottom: 15px;">🖼️</span>
                    <p>문제 이미지를 업로드하세요</p>
                    <input type="file" id="quiz-img-input" class="hidden" accept="image/*" />
                  </div>
                  <button class="btn btn-primary btn-lg w-full" style="margin-top: var(--s-6);" id="btn-start-quiz">퀴즈 시작하기</button>
                </div>
              ` : `
                <div class="card" style="padding: var(--s-4);">
                  <div class="input-label">출제된 문제</div>
                  <img src="${activeQuiz.problemImage.url}" style="max-height: 400px; width: 100%; object-fit: contain; background: #000; border-radius: var(--r-md);" />
                </div>
                
                <div class="section-header" style="margin-top: var(--s-8);">
                  <h2 class="section-title">학생 풀이 갤러리 (${quizSubmissions.length})</h2>
                </div>
                <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--s-4);">
                  ${quizSubmissions.map(s => `
                    <div class="card" style="padding: var(--s-3);">
                      <img src="${s.image.url}" style="width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: var(--r-sm); cursor: pointer;" onclick="window.open('${s.image.url}')" />
                      <div style="margin-top: 10px; font-weight: 700; text-align: center;">${s.studentName}</div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Right: Status -->
            <div class="flex flex-col gap-sm">
               <div class="card">
                 <h4 style="margin-bottom: 15px;">참여 현황</h4>
                 <div class="flex flex-col gap-sm">
                   ${students.map(s => {
      const solved = quizSubmissions.some(sub => sub.studentId === s.id);
      return `
                       <div class="flex items-center justify-between" style="font-size: 0.9rem; padding: 5px 0;">
                         <span>${s.name}</span>
                         <span class="badge ${solved ? 'badge-green' : 'badge-blue'}" style="font-size: 0.65rem;">${solved ? '제출' : '대기'}</span>
                       </div>
                     `;
    }).join('')}
                 </div>
               </div>
            </div>
          </div>
        </main>
      </div>
    `;

    bindQuizEvents();
  }

  function bindQuizEvents() {
    document.getElementById('quiz-back')?.addEventListener('click', () => {
      if (unsubscribeSubmissions) unsubscribeSubmissions();
      activeView = 'lesson';
      render();
    });

    const dropzone = document.getElementById('quiz-img-dropzone');
    const input = document.getElementById('quiz-img-input');
    dropzone?.addEventListener('click', () => input.click());

    document.getElementById('btn-start-quiz')?.addEventListener('click', async () => {
      if (!input.files[0]) { showToast('이미지를 선택해주세요.', 'error'); return; }
      try {
        const saved = await saveFile(input.files[0]);
        const quiz = await startQuiz(classId, saved);
        activeQuiz = quiz;
        startSubmissionsListener(quiz.id);
        render();
      } catch (err) { showToast('시작 중 오류 발생', 'error'); }
    });

    document.getElementById('btn-stop-quiz')?.addEventListener('click', async () => {
      if (confirm('퀴즈를 종료하시겠습니까?')) {
        await stopQuiz(classId);
        activeQuiz = null;
        if (unsubscribeSubmissions) unsubscribeSubmissions();
        render();
      }
    });
  }

  function startSubmissionsListener(quizId) {
    if (unsubscribeSubmissions) unsubscribeSubmissions();
    unsubscribeSubmissions = listenToQuizSubmissions(quizId, (subs) => {
      quizSubmissions = subs;
      render();
    });
  }

  // --- Whiteboard Mode --- (Keep existing logic but styled)
  function renderWhiteboardMode() {
    container.innerHTML = `
      <div class="whiteboard-container page-enter" style="background: var(--bg-deep);">
        <div class="whiteboard-toolbar card" style="border-radius: 0; border-top: 0; border-left: 0; border-right: 0;">
          <button class="btn btn-ghost btn-sm" id="wb-back">← 돌아가기</button>
          <div style="flex:1; text-align:center; font-weight:800; font-size: 1.1rem; color: var(--primary-light);">
            ${selectedStudent.name}의 발표 공간
          </div>
          <div class="whiteboard-tools">
            <button class="whiteboard-tool ${currentTool === 'pen' ? 'active' : ''}" data-tool="pen">✏️</button>
            <button class="whiteboard-tool ${currentTool === 'eraser' ? 'active' : ''}" data-tool="eraser">🧹</button>
            <button class="whiteboard-tool" data-tool="clear">🗑️</button>
          </div>
          <div class="color-picker-group">
            <div class="color-dot active" data-color="#FFFFFF" style="background:#FFFFFF"></div>
            <div class="color-dot" data-color="#FF6B6B" style="background:#FF6B6B"></div>
            <div class="color-dot" data-color="#FFD93D" style="background:#FFD93D"></div>
            <div class="color-dot" data-color="#6BCB77" style="background:#6BCB77"></div>
            <div class="color-dot" data-color="#4F46E5" style="background:#4F46E5"></div>
          </div>
          <button class="btn ${isRecording ? 'btn-danger' : 'btn-primary'} btn-sm" id="wb-record">
            ${isRecording ? '⏹ 중지' : '🎙 녹음'}
          </button>
          <button class="btn btn-secondary btn-sm" id="wb-save">💾 저장</button>
        </div>
        <div class="whiteboard-canvas-wrap" style="background: #000;">
          <canvas id="whiteboard-canvas"></canvas>
        </div>
      </div>
    `;
    initWhiteboard();
    bindWhiteboardEvents();
  }

  function initWhiteboard() {
    wbCanvas = document.getElementById('whiteboard-canvas');
    wbCtx = wbCanvas.getContext('2d');
    const wrap = wbCanvas.parentElement;
    wbCanvas.width = wrap.clientWidth;
    wbCanvas.height = wrap.clientHeight;
    wbCtx.fillStyle = '#000';
    wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
    wbCtx.lineCap = 'round';
    wbCtx.lineJoin = 'round';

    wbCanvas.addEventListener('mousedown', (e) => { drawing = true; wbCtx.beginPath(); wbCtx.moveTo(e.offsetX, e.offsetY); });
    wbCanvas.addEventListener('mousemove', (e) => {
      if (!drawing) return;
      wbCtx.strokeStyle = currentTool === 'eraser' ? '#000' : penColor;
      wbCtx.lineWidth = currentTool === 'eraser' ? penSize * 10 : penSize;
      wbCtx.lineTo(e.offsetX, e.offsetY);
      wbCtx.stroke();
    });
    wbCanvas.addEventListener('mouseup', () => { drawing = false; wbCtx.closePath(); });
  }

  function bindWhiteboardEvents() {
    document.getElementById('wb-back')?.addEventListener('click', () => { activeView = 'lesson'; render(); });
    document.querySelectorAll('.whiteboard-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tool === 'clear') { wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height); return; }
        currentTool = btn.dataset.tool;
        renderWhiteboardMode();
      });
    });
    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        penColor = dot.dataset.color;
        currentTool = 'pen';
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      });
    });
  }

  init();
}
