// ========================================
// Teacher Lesson Mode (v2.0)
// ========================================
import {
  getCurrentTeacher, getClassById, getStudentsByClass,
  praiseStudent, showToast, getStudentById, addPresentation,
  toggleSharePresentation, startQuiz, stopQuiz, listenToQuizSubmissions,
  saveFile, getPresentationsByStudent, formatDate
} from '../../store.js';
import { renderCharacter, getLevelConfig, renderPraiseAnimation } from '../../components/characterAvatar.js';

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
  let penSize = 3;
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

    document.getElementById('btn-present')?.addEventListener('click', () => {
      activeView = 'whiteboard';
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
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    wbCanvas.width = w * dpr;
    wbCanvas.height = h * dpr;
    wbCanvas.style.width = w + 'px';
    wbCanvas.style.height = h + 'px';
    wbCtx.scale(dpr, dpr);

    wbCtx.fillStyle = '#000';
    wbCtx.fillRect(0, 0, wrap.clientWidth, wrap.clientHeight);
    wbCtx.lineCap = 'round';
    wbCtx.lineJoin = 'round';

    let lastPoint = null;
    let lastMidPoint = null;

    // Handle resize
    window.onresize = () => {
      if (!wbCanvas || !wbCtx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      
      // Save current content
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = wbCanvas.width;
      tempCanvas.height = wbCanvas.height;
      tempCanvas.getContext('2d').drawImage(wbCanvas, 0, 0);

      // Resize
      wbCanvas.width = w * dpr;
      wbCanvas.height = h * dpr;
      wbCanvas.style.width = w + 'px';
      wbCanvas.style.height = h + 'px';
      
      // Restore & Set params
      wbCtx.scale(dpr, dpr);
      wbCtx.lineCap = 'round';
      wbCtx.lineJoin = 'round';
      wbCtx.drawImage(tempCanvas, 0, 0, w, h);
    };

    const getPos = (e) => {
      const rect = wbCanvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    const getMidPoint = (p1, p2) => {
      return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    };

    const startDrawing = (e) => {
      if (e.button !== undefined && e.button !== 0) return; // Only primary button
      drawing = true;
      const pos = getPos(e);
      lastPoint = pos;
      lastMidPoint = pos;
      
      wbCtx.beginPath();
      wbCtx.moveTo(pos.x, pos.y);
      wbCanvas.setPointerCapture(e.pointerId);
    };

    const moveDrawing = (e) => {
      if (!drawing) return;
      
      // 필압 & 고빈도 터치펜 입력(coalesced events) 처리 - 끊김방지 및 완벽한 곡선 처리
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      
      for (const ev of events) {
        const pos = getPos(ev);
        const midPoint = getMidPoint(lastPoint, pos);

        wbCtx.beginPath();
        wbCtx.strokeStyle = currentTool === 'eraser' ? '#000' : penColor;
        
        // 터치펜(pen)에 대해서만 필압 반영, 그 외 마우스/손가락은 기본 굵기 유지
        const isPen = ev.pointerType === 'pen';
        const pressure = (isPen && ev.pressure) ? ev.pressure : 0.5;
        const pressureMod = isPen ? Math.max(0.2, pressure * 2.5) : 1; 
        
        wbCtx.lineWidth = currentTool === 'eraser' ? penSize * 15 : penSize * pressureMod;
        
        wbCtx.moveTo(lastMidPoint.x, lastMidPoint.y);
        wbCtx.quadraticCurveTo(lastPoint.x, lastPoint.y, midPoint.x, midPoint.y);
        wbCtx.stroke();

        lastPoint = pos;
        lastMidPoint = midPoint;
      }
    };

    const stopDrawing = (e) => {
      if (!drawing) return;
      drawing = false;
      const pos = getPos(e);
      
      // Draw final segment
      wbCtx.lineTo(pos.x, pos.y);
      wbCtx.stroke();
      wbCtx.closePath();
      
      wbCanvas.releasePointerCapture(e.pointerId);
      lastPoint = null;
      lastMidPoint = null;
    };

    // Pointer Listeners (Replaces Mouse & Touch)
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

    document.getElementById('wb-record')?.addEventListener('click', handleRecordToggle);
    document.getElementById('wb-save')?.addEventListener('click', handleSavePresentation);
  }

  async function handleRecordToggle() {
    if (!isRecording) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const canvasStream = wbCanvas.captureStream(30); // 30 FPS
        
        // Combine tracks
        const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioStream.getAudioTracks()
        ]);

        mediaRecorder = new MediaRecorder(combinedStream, {
          mimeType: 'video/webm;codecs=vp8,opus'
        });
        
        mediaChunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) mediaChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          recordedBlob = new Blob(mediaChunks, { type: 'video/webm' });
        };
        
        mediaRecorder.start();
        isRecording = true;
        updateWhiteboardUI();
        showToast('📹 화면과 음성 녹화를 시작합니다.');
      } catch (err) {
        console.error(err);
        showToast('마이크 또는 화면 접근 권한이 필요합니다.', 'error');
      }
    } else {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
      isRecording = false;
      updateWhiteboardUI();
      showToast('⏹ 녹화가 중지되었습니다.');
    }
  }

  async function handleSavePresentation() {
    showToast('💾 저장 중...', 'info');
    try {
      // 1. Canvas to Blob
      const canvasBlob = await new Promise(resolve => wbCanvas.toBlob(resolve, 'image/png'));
      const imageFile = new File([canvasBlob], `wb_${Date.now()}.png`, { type: 'image/png' });
      const savedImage = await saveFile(imageFile);

      // 2. Video to Blob (if exists)
      let savedVideo = null;
      if (recordedBlob) {
        const videoFile = new File([recordedBlob], `video_${Date.now()}.webm`, { type: 'video/webm' });
        savedVideo = await saveFile(videoFile);
      }

      // 3. Save to presentation record
      await addPresentation(selectedStudent.id, classId, {
        whiteboardImage: savedImage,
        audioData: savedVideo // Reusing audioData field for video URL
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
