// ========================================
// Teacher Lesson Mode (v2.0)
// ========================================
import {
  getCurrentTeacher, getClassById, getStudentsByClass,
  praiseStudent, showToast, getStudentById, addPresentation,
  toggleSharePresentation, startQuiz, stopQuiz, listenToQuizSubmissions,
  saveFile, getPresentationsByStudent, formatDate, addStudentPoints
} from '../../store.js';
import { renderCharacter, getLevelConfig, renderPraiseAnimation } from '../../components/characterAvatar.js';
import { getStroke } from 'perfect-freehand';
import { Capacitor } from '@capacitor/core';
import { VoiceRecorder } from 'capacitor-voice-recorder';

export function renderLessonMode(container, params) {
  const teacher = getCurrentTeacher();
  if (!teacher) { window.location.hash = '/teacher/login'; return; }

  const classId = params.id;
  let cls = null;
  let students = [];
  let selectedStudent = null;
  let activeView = 'lesson'; // 'lesson', 'whiteboard', 'quiz', 'presentations'
  let studentPresentations = [];

  // Quiz State
  let activeQuiz = null;
  let quizSubmissions = [];
  let unsubscribeSubmissions = null;

  // Whiteboard State
  let wbCanvas, wbCtx;
  let drawing = false;
  let penColor = '#FFFFFF';
  let penSize = 2;
  let currentTool = 'pen';
  let isRecording = false;
  let mediaRecorder = null;
  let mediaChunks = [];
  let recordedBlob = null;
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

    if (activeView === 'presentations') {
      renderPresentationHistoryMode();
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
      const config = getLevelConfig(s.characterLevel, s.characterType || 'sunflower');
      return `
                <div class="student-avatar-card card ${selectedStudent?.id === s.id ? 'selected' : ''}" data-student-id="${s.id}">
                  <div class="student-character">
                    ${renderCharacter(s.characterLevel, 80, s.characterType || 'sunflower')}
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
                   ${renderCharacter(selectedStudent.characterLevel, 120, selectedStudent.characterType || 'sunflower')}
                 </div>
                 <div class="badge badge-purple">${getLevelConfig(selectedStudent.characterLevel, selectedStudent.characterType || 'sunflower').name}</div>
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
                 <button class="btn btn-ghost" id="btn-history" style="flex-direction: column; height: 100px; gap: 10px; border: 2px dashed var(--border-main);">
                   <span style="font-size: 1.5rem;">📁</span>
                   <span>발표 기록</span>
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

    document.getElementById('btn-present')?.addEventListener('click', async () => {
      activeView = 'whiteboard';
      
      // 발표하기 클릭 시 1포인트 축적
      const updated = await addStudentPoints(selectedStudent.id, 1);
      if (updated) {
        selectedStudent = updated;
        showToast('🎙️ 발표가 시작되어 1P가 지급되었습니다!');
      }

      render();
    });

    document.getElementById('btn-history')?.addEventListener('click', async () => {
      showToast('발표 기록을 불러오는 중...', 'info');
      studentPresentations = await getPresentationsByStudent(selectedStudent.id);
      activeView = 'presentations';
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
          <div class="pen-size-control flex items-center gap-sm" style="margin: 0 10px;">
            <label for="pen-size-slider" style="color: var(--text-muted); font-size: 0.85rem; font-weight: 600;">두께:</label>
            <input type="range" id="pen-size-slider" min="1" max="10" value="${penSize}" style="width: 80px; accent-color: var(--primary);">
          </div>
          <button class="btn ${isRecording ? 'btn-danger' : 'btn-primary'} btn-sm" id="wb-record">
            ${isRecording ? '⏹ 중지' : '🎙 녹음'}
          </button>
          <button class="btn btn-secondary btn-sm" id="wb-save">💾 저장</button>
        </div>
        <div class="whiteboard-canvas-wrap" style="background: #000; position: relative;">
          <canvas id="whiteboard-canvas" style="position: absolute; top: 0; left: 0; z-index: 1; touch-action: none;"></canvas>
          <canvas id="whiteboard-draft" style="position: absolute; top: 0; left: 0; z-index: 2; pointer-events: none; touch-action: none;"></canvas>
        </div>
      </div>
    `;
    initWhiteboard();
    bindWhiteboardEvents();
  }

  function initWhiteboard() {
    wbCanvas = document.getElementById('whiteboard-canvas');
    wbCtx = wbCanvas.getContext('2d');
    const draftCanvas = document.getElementById('whiteboard-draft');
    const draftCtx = draftCanvas.getContext('2d');
    
    // 기본 터치 제스처/컨텍스트 메뉴 완벽 차단
    wbCanvas.style.touchAction = 'none';
    wbCanvas.addEventListener('contextmenu', e => e.preventDefault());

    const wrap = wbCanvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    function setSize() {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      wbCanvas.width = w * dpr;
      wbCanvas.height = h * dpr;
      wbCanvas.style.width = w + 'px';
      wbCanvas.style.height = h + 'px';
      
      draftCanvas.width = w * dpr;
      draftCanvas.height = h * dpr;
      draftCanvas.style.width = w + 'px';
      draftCanvas.style.height = h + 'px';

      wbCtx.scale(dpr, dpr);
      draftCtx.scale(dpr, dpr);
      wbCtx.lineCap = 'round';
      wbCtx.lineJoin = 'round';
      draftCtx.lineCap = 'round';
      draftCtx.lineJoin = 'round';
    }
    setSize();

    wbCtx.fillStyle = '#000';
    wbCtx.fillRect(0, 0, wrap.clientWidth, wrap.clientHeight);

    let currentPoints = [];

    function getSvgPathFromStroke(stroke) {
      if (!stroke.length) return '';
      const d = stroke.reduce((acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length];
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        return acc;
      }, ['M', ...stroke[0], 'Q']);
      d.push('Z');
      return d.join(' ');
    }

    // Handle resize
    window.onresize = () => {
      if (!wbCanvas || !wbCtx) return;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = wbCanvas.width;
      tempCanvas.height = wbCanvas.height;
      tempCanvas.getContext('2d').drawImage(wbCanvas, 0, 0);

      setSize();
      
      wbCtx.save();
      wbCtx.setTransform(1, 0, 0, 1, 0, 0);
      wbCtx.drawImage(tempCanvas, 0, 0);
      wbCtx.restore();
    };

    const getPos = (e) => {
      const rect = wbCanvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    const startDrawing = (e) => {
      e.preventDefault();
      if (e.button !== undefined && e.button !== 0) return;
      drawing = true;
      
      const pos = getPos(e);
      const pressure = e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5;
      currentPoints = [[pos.x, pos.y, pressure]];
      
      wbCanvas.setPointerCapture(e.pointerId);
    };

    const moveDrawing = (e) => {
      e.preventDefault();
      if (!drawing) return;
      
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events) {
        const pos = getPos(ev);
        const pressure = ev.pointerType === 'pen' && ev.pressure ? ev.pressure : 0.5;
        currentPoints.push([pos.x, pos.y, pressure]);
      }
      
      if (currentPoints.length < 2) return;

      const isEraser = currentTool === 'eraser';
      
      if (isEraser) {
        // Eraser: Direct line segment drawing to wbCanvas (No perfect-freehand delay)
        const size = penSize * 15;
        wbCtx.save();
        wbCtx.globalCompositeOperation = 'destination-out';
        wbCtx.lineWidth = size;
        wbCtx.beginPath();
        const p1 = currentPoints[currentPoints.length - 2];
        const p2 = currentPoints[currentPoints.length - 1];
        wbCtx.moveTo(p1[0], p1[1]);
        wbCtx.lineTo(p2[0], p2[1]);
        wbCtx.stroke();
        wbCtx.restore();
        return;
      }
      
      // Pen: perfect-freehand on draftCanvas
      const strokeSize = penSize * 2.5;
      const strokePolygon = getStroke(currentPoints, {
        size: strokeSize,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: currentPoints[0][2] === 0.5
      });
      
      const pathData = getSvgPathFromStroke(strokePolygon);
      if (!pathData) return;
      
      const path = new Path2D(pathData);
      
      draftCtx.save();
      draftCtx.setTransform(1, 0, 0, 1, 0, 0);
      draftCtx.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
      draftCtx.restore();

      draftCtx.save();
      draftCtx.fillStyle = penColor;
      draftCtx.fill(path);
      draftCtx.restore();
    };

    const stopDrawing = (e) => {
      e.preventDefault();
      if (!drawing) return;
      
      const pos = getPos(e);
      const pressure = e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5;
      currentPoints.push([pos.x, pos.y, pressure]);
      
      moveDrawing(e);
      
      // 병합: draftCanvas -> wbCanvas
      if (currentTool === 'pen') {
        wbCtx.save();
        wbCtx.setTransform(1, 0, 0, 1, 0, 0);
        wbCtx.drawImage(draftCanvas, 0, 0);
        wbCtx.restore();
        
        draftCtx.save();
        draftCtx.setTransform(1, 0, 0, 1, 0, 0);
        draftCtx.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
        draftCtx.restore();
      }
      
      drawing = false;
      currentPoints = [];
      wbCanvas.releasePointerCapture(e.pointerId);
    };

    wbCanvas.addEventListener('pointerdown', startDrawing);
    wbCanvas.addEventListener('pointermove', moveDrawing);
    wbCanvas.addEventListener('pointerup', stopDrawing);
    wbCanvas.addEventListener('pointercancel', stopDrawing);
  }

  function bindWhiteboardEvents() {
    document.getElementById('wb-back')?.addEventListener('click', () => { activeView = 'lesson'; render(); });
    
    document.querySelectorAll('.whiteboard-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tool === 'clear') {
          if (confirm('전체 필기를 지우시겠습니까?')) {
            wbCtx.fillStyle = '#000';
            wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
          }
          return;
        }
        currentTool = btn.dataset.tool;
        updateWhiteboardUI();
      });
    });

    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        penColor = dot.dataset.color;
        currentTool = 'pen';
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        updateWhiteboardUI();
      });
    });

    document.getElementById('pen-size-slider')?.addEventListener('input', (e) => {
      penSize = parseInt(e.target.value, 10);
    });

    document.getElementById('wb-record')?.addEventListener('click', handleRecordToggle);
    document.getElementById('wb-save')?.addEventListener('click', handleSavePresentation);
  }

  // Track recording mode: 'video' (canvas + audio) or 'audio' (audio only)
  let recordingMode = null;

  async function handleRecordToggle() {
    if (!isRecording) {
      if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
          recordingMode = 'audio'; // Android is audio only automatically
          const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
          if (!permStatus.value) {
            showToast('마이크 권한이 차단되었습니다. 앱 설정에서 권한을 허용해주세요.', 'error');
            return;
          }
          await VoiceRecorder.startRecording();
          isRecording = true;
          updateWhiteboardUI();
          showToast('🎙 네이티브 앱 녹음을 시작합니다.');
          return;
        } catch(err) {
          showToast('녹음을 시작할 수 없습니다: ' + err.message, 'error');
          return;
        }
      }

      try {
        // 0. 웹 브라우저 기본 환경 확인
        console.log('[녹음] 환경 확인...');
        console.log('[녹음] navigator.mediaDevices:', !!navigator.mediaDevices);
        console.log('[녹음] getUserMedia:', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
        console.log('[녹음] MediaRecorder:', typeof MediaRecorder);
        console.log('[녹음] isSecureContext:', window.isSecureContext);
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          showToast('이 환경에서는 녹음이 지원되지 않습니다. (mediaDevices 없음)', 'error');
          return;
        }
        
        if (typeof MediaRecorder === 'undefined') {
          showToast('이 환경에서는 녹음이 지원되지 않습니다. (MediaRecorder 없음)', 'error');
          return;
        }

        // 1. 마이크 권한 상태 확인 (가능한 경우)
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const permStatus = await navigator.permissions.query({ name: 'microphone' });
            console.log('[녹음] 마이크 권한 상태:', permStatus.state);
            if (permStatus.state === 'denied') {
              showToast('마이크 권한이 차단되었습니다. 앱 설정에서 마이크 권한을 허용해주세요.', 'error');
              return;
            }
          } catch (permErr) {
            console.log('[녹음] permissions.query 미지원:', permErr.message);
          }
        }

        // 2. 마이크 스트림 요청
        console.log('[녹음] getUserMedia 호출...');
        let audioStream;
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          console.log('[녹음] 오디오 스트림 획득 성공, 트랙 수:', audioStream.getAudioTracks().length);
        } catch (micErr) {
          console.error('[녹음] getUserMedia 실패:', micErr.name, micErr.message);
          if (micErr.name === 'NotAllowedError') {
            showToast('마이크 권한이 거부되었습니다. 앱 설정 > 권한에서 마이크를 허용해주세요.', 'error');
          } else if (micErr.name === 'NotFoundError') {
            showToast('마이크를 찾을 수 없습니다. 기기에 마이크가 연결되어 있는지 확인해주세요.', 'error');
          } else if (micErr.name === 'NotReadableError') {
            showToast('마이크가 다른 앱에서 사용 중입니다.', 'error');
          } else {
            showToast('마이크 접근 실패: ' + micErr.message, 'error');
          }
          return;
        }

        // 3. 캔버스 스트림 시도 (데스크톱 브라우저에서 지원)
        let combinedStream = null;
        recordingMode = 'audio'; // 기본값: 음성만

        if (typeof wbCanvas.captureStream === 'function') {
          try {
            const canvasStream = wbCanvas.captureStream(30);
            combinedStream = new MediaStream([
              ...canvasStream.getVideoTracks(),
              ...audioStream.getAudioTracks()
            ]);
            recordingMode = 'video';
            console.log('[녹음] 캔버스+오디오 스트림 결합 성공');
          } catch (captureErr) {
            console.warn('[녹음] captureStream 실패, 음성만 녹음:', captureErr);
            combinedStream = audioStream;
            recordingMode = 'audio';
          }
        } else {
          console.log('[녹음] captureStream 미지원 → 음성만 녹음');
          combinedStream = audioStream;
          recordingMode = 'audio';
        }

        // 4. MediaRecorder 생성 - 지원되는 MIME 타입 자동 감지
        const mimeTypes = recordingMode === 'video'
          ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
          : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/wav', ''];
        
        let selectedMime = '';
        for (const mime of mimeTypes) {
          if (mime === '' || MediaRecorder.isTypeSupported(mime)) {
            selectedMime = mime;
            console.log('[녹음] 지원 MIME 타입:', mime || '(기본값)');
            break;
          }
        }

        const recorderOptions = selectedMime ? { mimeType: selectedMime } : {};
        console.log('[녹음] MediaRecorder 생성:', JSON.stringify(recorderOptions));
        mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);
        console.log('[녹음] MediaRecorder 상태:', mediaRecorder.state, '/ mimeType:', mediaRecorder.mimeType);
        
        mediaChunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            mediaChunks.push(e.data);
            console.log('[녹음] 데이터 수신:', e.data.size, 'bytes / 총 청크:', mediaChunks.length);
          }
        };
        mediaRecorder.onerror = (e) => {
          console.error('[녹음] MediaRecorder 에러:', e.error?.name, e.error?.message);
          showToast('녹음 중 오류: ' + (e.error?.message || '알 수 없는 오류'), 'error');
          isRecording = false;
          updateWhiteboardUI();
        };
        mediaRecorder.onstop = () => {
          const blobType = mediaRecorder.mimeType || selectedMime || 
            (recordingMode === 'video' ? 'video/webm' : 'audio/webm');
          recordedBlob = new Blob(mediaChunks, { type: blobType });
          console.log(`[녹음] 완료: mode=${recordingMode}, type=${blobType}, size=${recordedBlob.size}`);
        };
        
        mediaRecorder.start(1000); // 1초마다 데이터 수집하여 렉 방지
        isRecording = true;
        updateWhiteboardUI();
        
        if (recordingMode === 'video') {
          showToast('📹 화면과 음성 녹화를 시작합니다.');
        } else {
          showToast('🎙 음성 녹음을 시작합니다.');
        }
      } catch (err) {
        console.error('[녹음] 시작 실패:', err);
        showToast('녹음을 시작할 수 없습니다: ' + err.message, 'error');
      }
    } else {
      if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
          const result = await VoiceRecorder.stopRecording();
          const mimeType = result.value.mimeType;
          const base64Str = result.value.recordDataBase64;
          
          // Convert base64 to Blob
          const byteCharacters = atob(base64Str);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          recordedBlob = new Blob([byteArray], { type: mimeType });
          
          isRecording = false;
          updateWhiteboardUI();
          showToast('⏹ 앱 녹음이 중지되었습니다.');
          return;
        } catch(err) {
          console.error('[녹음] 네이티브 중지 오류:', err);
          showToast('녹음 중지 시 오류: ' + err.message, 'error');
          return;
        }
      }

      try {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
      } catch (stopErr) {
        console.error('[녹음] 중지 오류:', stopErr);
      }
      isRecording = false;
      updateWhiteboardUI();
      showToast('⏹ 녹음이 중지되었습니다.');
    }
  }

  async function handleSavePresentation() {
    showToast('💾 저장 중...', 'info');
    try {
      // 1. Canvas to Blob
      const canvasBlob = await new Promise(resolve => wbCanvas.toBlob(resolve, 'image/png'));
      const imageFile = new File([canvasBlob], `wb_${Date.now()}.png`, { type: 'image/png' });
      const savedImage = await saveFile(imageFile);

      // 2. Audio/Video to Blob (if exists)
      let savedMedia = null;
      if (recordedBlob) {
        const isVideo = recordingMode === 'video';
        const ext = isVideo ? 'webm' : (recordedBlob.type.includes('mp4') ? 'mp4' : 'webm');
        const fileName = isVideo ? `video_${Date.now()}.${ext}` : `audio_${Date.now()}.${ext}`;
        const mediaFile = new File([recordedBlob], fileName, { type: recordedBlob.type });
        savedMedia = await saveFile(mediaFile);
      }

      // 3. Save to presentation record
      await addPresentation(selectedStudent.id, classId, {
        whiteboardImage: savedImage,
        audioData: savedMedia // Reusing audioData field for audio/video URL
      });

      showToast('발표 자료가 성공적으로 저장되었습니다! 🎉');
      activeView = 'lesson';
      render();
    } catch (err) {
      console.error(err);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  }

  function updateWhiteboardUI() {
    // Update Record Button
    const recordBtn = document.getElementById('wb-record');
    if (recordBtn) {
      recordBtn.innerHTML = isRecording ? '⏹ 중지' : '🎙 녹음';
      recordBtn.className = `btn ${isRecording ? 'btn-danger' : 'btn-primary'} btn-sm`;
    }
    
    // Update Tool States
    document.querySelectorAll('.whiteboard-tool').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === currentTool);
    });
  }

  // --- Presentation History Mode ---
  function renderPresentationHistoryMode() {
    container.innerHTML = `
      <div class="teacher-layout page-enter">
        <main class="main-content" style="max-width: 1400px; margin: 0 auto; width: 100%;">
          <header class="page-header flex justify-between items-center" style="margin-bottom: var(--s-8);">
            <div class="flex items-center gap-md">
              <button class="btn btn-ghost btn-sm" id="history-back">← 수업으로</button>
              <h1 class="page-title">${selectedStudent.name} 학생의 <span class="badge badge-purple">발표 기록</span></h1>
            </div>
            <div class="badge badge-blue">총 ${studentPresentations.length}개의 발표</div>
          </header>

          ${studentPresentations.length === 0 ? `
            <div class="card" style="padding: 100px; text-align: center;">
              <div style="font-size: 3rem; margin-bottom: 20px;">📁</div>
              <p style="color: var(--text-muted);">아직 저장된 발표 자료가 없습니다.</p>
            </div>
          ` : `
            <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: var(--s-8);">
              ${studentPresentations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(p => `
                <div class="card presentation-card animate-up" style="padding: var(--s-4); position: relative;">
                  <div class="badge badge-main" style="position: absolute; top: 15px; left: 15px; z-index: 2;">
                    ${formatDate(p.createdAt)}
                  </div>
                  <div class="presentation-media" style="background: #000; border-radius: var(--r-md); overflow: hidden; margin-bottom: var(--s-4);">
                    <img src="${p.whiteboardImage?.url}" style="width: 100%; aspect-ratio: 16/9; object-fit: contain;" />
                  </div>
                  <div class="flex flex-col gap-sm">
                    ${p.audioData ? `
                      <button class="btn btn-primary w-full play-video-btn" data-url="${p.audioData.url}">
                        🎬 발표 영상 재생
                      </button>
                    ` : `
                      <button class="btn btn-ghost w-full" disabled>영상 없음</button>
                    `}
                    <button class="btn btn-secondary w-full" onclick="window.open('${p.whiteboardImage?.url}')">
                      🖼️ 원본 이미지 보기
                    </button>
                    <button class="btn ${p.shared ? 'btn-danger' : 'btn-purple'} w-full btn-toggle-share" data-id="${p.id}" data-shared="${p.shared}">
                      ${p.shared ? '👀 반 전체 공유 중 (끄기)' : '🙌 반 전체에 공유하기'}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </main>
      </div>

      <!-- Video Modal -->
      <div class="modal-backdrop" id="video-modal" style="z-index: 2000;">
        <div class="modal-content" style="max-width: 1000px; width: 90%; background: #000; padding: 0;">
          <div class="modal-header" style="background: rgba(0,0,0,0.5); position: absolute; top: 0; left: 0; right: 0; z-index: 10;">
             <h3 class="modal-title" style="color: #fff;">발표 영상</h3>
             <button class="modal-close" style="color: #fff; background: rgba(255,255,255,0.1);" id="close-video-modal">✕</button>
          </div>
          <video id="player" controls style="width: 100%; aspect-ratio: 16/9; display: block; border-radius: var(--r-lg);">
            소스가 없습니다.
          </video>
        </div>
      </div>
    `;

    document.getElementById('history-back')?.addEventListener('click', () => {
      activeView = 'lesson';
      render();
    });

    const videoModal = document.getElementById('video-modal');
    const player = document.getElementById('player');
    
    document.querySelectorAll('.play-video-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        player.src = btn.dataset.url;
        videoModal.classList.add('active');
        player.play();
      });
    });

    document.querySelectorAll('.btn-toggle-share').forEach(btn => {
      btn.addEventListener('click', async () => {
        const presentationId = btn.dataset.id;
        const isShared = btn.dataset.shared === 'true';
        
        let title = null;
        if (!isShared) {
            title = prompt('반 전체에 공유할 제목을 입력하세요 (예: 1번 문제 풀이):');
            if (title === null || title.trim() === '') {
                showToast('제목이 필요합니다.', 'error');
                return;
            }
        }
        
        try {
          await toggleSharePresentation(presentationId, title);
          if (isShared) {
            showToast('공유가 중지되었습니다.');
          } else {
            showToast('✨ 반 전체 공유 완료! (2P 획득)');
            // 공유하기 누르면 2포인트 축적
            const updated = await addStudentPoints(selectedStudent.id, 2);
            if (updated) {
              selectedStudent = updated;
            }
          }
          studentPresentations = await getPresentationsByStudent(selectedStudent.id);
          render();
        } catch (err) {
          showToast('오류가 발생했습니다.', 'error');
        }
      });
    });

    document.getElementById('close-video-modal')?.addEventListener('click', () => {
      player.pause();
      player.src = "";
      videoModal.classList.remove('active');
    });

    videoModal.addEventListener('click', (e) => {
      if (e.target === videoModal) {
        player.pause();
        player.src = "";
        videoModal.classList.remove('active');
      }
    });
  }

  init();
}
