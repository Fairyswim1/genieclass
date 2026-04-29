// ========================================
// Teacher Lesson Mode (v2.0)
// ========================================
import {
  getCurrentTeacher, getClassById, getStudentsByClass,
  praiseStudent, showToast, getStudentById, addPresentation,
  toggleSharePresentation, startQuiz, stopQuiz, listenToQuizSubmissions,
  saveFile, getPresentationsByStudent, formatDate, addStudentPoints,
  deletePresentationById
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
  
  // New: Mirror Canvas for live recording
  let recordingCanvas = null;
  let recordingCtx = null;
  let recordingReqId = null;

  // Observation voice recording state
  let obsMediaRecorder = null;
  let obsMediaChunks = [];
  let obsAudioStream = null;
  let obsIsRecording = false;
  let obsNativeRecording = false;
  let obsRecordingSeconds = 0;
  let obsRecordingTimer = null;

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
      const config = getLevelConfig(s.characterLevel, s.characterType || 'apple');
      return `
                <div class="student-avatar-card card ${selectedStudent?.id === s.id ? 'selected' : ''}" data-student-id="${s.id}">
                  <div class="student-character">
                    ${renderCharacter(s.characterLevel, 80, s.characterType || 'apple', s.totalPoints)}
                  </div>
                  <div class="student-name">${s.name}</div>
                  <div class="student-praise-count">⭐ ${s.totalPoints}P</div>
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
                   ${renderCharacter(selectedStudent.characterLevel, 120, selectedStudent.characterType || 'apple', selectedStudent.totalPoints)}
                 </div>
                 <div class="badge badge-purple">${getLevelConfig(selectedStudent.characterLevel, selectedStudent.characterType || 'apple').fullName}</div>
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
                 <button class="btn btn-outline" id="btn-observe" style="flex-direction: column; height: 100px; gap: 10px; border: 2px solid var(--primary-light); background: var(--bg-surface);">
                   <span style="font-size: 1.5rem;">📝</span>
                   <span>관찰 기록</span>
                 </button>
               </div>
            </div>
          ` : ''}
        </div>

        <!-- Observation Modal -->
        <div class="modal-backdrop" id="observation-modal" style="z-index: 3000;">
          <div class="modal-content animate-up" style="max-width: 500px; width: 90%;">
            <div class="modal-header">
              <h3 class="modal-title">📝 관찰 기록 작성</h3>
              <button class="modal-close" id="close-observation-modal">✕</button>
            </div>
            <div class="modal-body" style="padding: 20px 0;">
              <div id="observation-choice-view">
                <p style="margin-bottom: 20px; color: var(--text-muted); text-align: center;">어떤 방식으로 기록하시겠습니까?</p>
                <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 15px;">
                  <button class="btn btn-secondary" id="btn-obs-voice" style="flex-direction: column; height: 120px; gap: 10px;">
                    <span style="font-size: 2rem;">🎙️</span>
                    <span>음성 녹음</span>
                  </button>
                  <button class="btn btn-primary" id="btn-obs-text" style="flex-direction: column; height: 120px; gap: 10px;">
                    <span style="font-size: 2rem;">⌨️</span>
                    <span>텍스트 입력</span>
                  </button>
                </div>
              </div>

              <!-- Voice Recording View -->
              <div id="observation-voice-view" class="hidden" style="text-align: center; padding: 20px;">
                <div class="recording-indicator" id="obs-rec-indicator" style="width: 80px; height: 80px; background: var(--error); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; color: white; font-size: 2rem; animation: pulse 1.5s infinite;">
                  🎤
                </div>
                <h4 id="obs-rec-timer">00:00</h4>
                <p style="margin: 15px 0;">학생의 활동 내용을 음성으로 기록 중입니다...</p>
                <button class="btn btn-danger w-full" id="btn-stop-obs-rec">녹음 중지 및 저장</button>
              </div>

              <!-- Text Input View -->
              <div id="observation-text-view" class="hidden">
                <div class="form-group">
                  <label class="input-label">관찰 내용 (세특 기초 자료)</label>
                  <textarea class="input-field" id="obs-text-input" rows="6" placeholder="예: 문제 해결 전략이 창의적이며 동료 학생들에게 논리적으로 잘 설명함"></textarea>
                </div>
                <button class="btn btn-primary w-full" id="btn-save-obs-text">기록 저장하기</button>
              </div>
            </div>
          </div>
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

    // --- Observation Events ---
    document.getElementById('btn-observe')?.addEventListener('click', () => {
      const modal = document.getElementById('observation-modal');
      modal.classList.add('active');
      // Reset view to choice
      document.getElementById('observation-choice-view').classList.remove('hidden');
      document.getElementById('observation-voice-view').classList.add('hidden');
      document.getElementById('observation-text-view').classList.add('hidden');
      document.getElementById('obs-text-input').value = '';
    });

    document.getElementById('close-observation-modal')?.addEventListener('click', () => {
      if (obsIsRecording) {
        showToast('녹음 중에는 창을 닫을 수 없습니다. 녹음을 먼저 저장해주세요.', 'error');
        return;
      }
      document.getElementById('observation-modal').classList.remove('active');
    });

    document.getElementById('btn-obs-text')?.addEventListener('click', () => {
      document.getElementById('observation-choice-view').classList.add('hidden');
      document.getElementById('observation-text-view').classList.remove('hidden');
    });

    document.getElementById('btn-obs-voice')?.addEventListener('click', async () => {
      await startObservationRecording();
    });

    document.getElementById('btn-stop-obs-rec')?.addEventListener('click', async () => {
      await stopObservationRecording();
    });

    document.getElementById('btn-save-obs-text')?.addEventListener('click', async () => {
      const text = document.getElementById('obs-text-input').value.trim();
      if (!text) { showToast('기록할 내용을 입력해주세요.', 'error'); return; }
      
      const saveBtn = document.getElementById('btn-save-obs-text');
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';

      try {
        const { saveObservation } = await import('../../store.js');
        await saveObservation(selectedStudent.id, classId, {
          content: text,
          mode: 'text',
          studentName: selectedStudent.name
        });
        showToast('성공적으로 기록되었습니다! ✨');
        document.getElementById('observation-modal').classList.remove('active');
      } catch (err) {
        showToast('저장 실패', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '기록 저장하기';
      }
    });
  }

  function updateObservationTimer() {
    const timerEl = document.getElementById('obs-rec-timer');
    if (!timerEl) return;
    const mins = Math.floor(obsRecordingSeconds / 60).toString().padStart(2, '0');
    const secs = (obsRecordingSeconds % 60).toString().padStart(2, '0');
    timerEl.textContent = `${mins}:${secs}`;
  }

  function startObservationTimer() {
    obsRecordingSeconds = 0;
    updateObservationTimer();
    if (obsRecordingTimer) clearInterval(obsRecordingTimer);
    obsRecordingTimer = setInterval(() => {
      obsRecordingSeconds += 1;
      updateObservationTimer();
    }, 1000);
  }

  function stopObservationTimer() {
    if (obsRecordingTimer) clearInterval(obsRecordingTimer);
    obsRecordingTimer = null;
  }

  async function startObservationRecording() {
    if (obsIsRecording) return;

    document.getElementById('observation-choice-view')?.classList.add('hidden');
    document.getElementById('observation-voice-view')?.classList.remove('hidden');

    obsMediaRecorder = null;
    obsMediaChunks = [];
    obsAudioStream = null;
    obsNativeRecording = false;

    try {
      const isNativeMode = Capacitor.isNativePlatform();
      if (isNativeMode) {
        try {
          const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
          if (!permStatus.value) {
            showToast('마이크 권한이 차단되었습니다.', 'error');
            document.getElementById('observation-choice-view')?.classList.remove('hidden');
            document.getElementById('observation-voice-view')?.classList.add('hidden');
            return;
          }
        } catch (err) {
          console.warn('[관찰 녹음] 네이티브 권한 요청 실패:', err);
        }
      }

      const hasWebRecorder = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
      if (hasWebRecorder) {
        try {
          obsAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: 44100
            }
          });

          const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
          const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';
          obsMediaRecorder = new MediaRecorder(obsAudioStream, selectedMime ? { mimeType: selectedMime } : {});
          obsMediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) obsMediaChunks.push(e.data);
          };
          obsMediaRecorder.start(200);
        } catch (webErr) {
          console.error('[관찰 녹음] 브라우저 녹음 시작 실패:', webErr);
          obsAudioStream?.getTracks().forEach(track => track.stop());
          obsAudioStream = null;
          obsMediaRecorder = null;
        }
      }

      if (!obsMediaRecorder && isNativeMode) {
        await VoiceRecorder.startRecording();
        obsNativeRecording = true;
      }

      if (!obsMediaRecorder && !obsNativeRecording) {
        showToast('이 기기에서는 음성 녹음을 시작할 수 없습니다.', 'error');
        document.getElementById('observation-choice-view')?.classList.remove('hidden');
        document.getElementById('observation-voice-view')?.classList.add('hidden');
        return;
      }

      obsIsRecording = true;
      startObservationTimer();
      showToast('관찰 음성 녹음을 시작했습니다.', 'info');
    } catch (err) {
      console.error('[관찰 녹음] 시작 오류:', err);
      showToast('녹음 시작 중 오류가 발생했습니다.', 'error');
      document.getElementById('observation-choice-view')?.classList.remove('hidden');
      document.getElementById('observation-voice-view')?.classList.add('hidden');
    }
  }

  async function stopObservationRecording() {
    if (!obsIsRecording) return;

    const stopBtn = document.getElementById('btn-stop-obs-rec');
    if (stopBtn) {
      stopBtn.disabled = true;
      stopBtn.textContent = '저장 중...';
    }

    try {
      let recordedBlob = null;
      let mimeType = 'audio/webm';

      if (obsNativeRecording) {
        const result = await VoiceRecorder.stopRecording();
        mimeType = result.value.mimeType || 'audio/webm';
        const base64Str = result.value.recordDataBase64;
        const byteCharacters = atob(base64Str);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        recordedBlob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
      } else if (obsMediaRecorder) {
        const stopped = new Promise(resolve => {
          obsMediaRecorder.onstop = () => {
            mimeType = obsMediaRecorder.mimeType || 'audio/webm';
            resolve(new Blob(obsMediaChunks, { type: mimeType }));
          };
        });
        obsMediaRecorder.stop();
        obsAudioStream?.getTracks().forEach(track => track.stop());
        recordedBlob = await stopped;
      }

      if (!recordedBlob || recordedBlob.size === 0) {
        throw new Error('녹음 데이터가 비어 있습니다.');
      }

      const ext = mimeType.includes('mp4') ? 'mp4' : (mimeType.includes('m4a') ? 'm4a' : (mimeType.includes('wav') ? 'wav' : 'webm'));
      const audioFile = new File([recordedBlob], `observation_${Date.now()}.${ext}`, { type: mimeType });
      const savedAudio = await saveFile(audioFile);
      const { saveObservation } = await import('../../store.js');

      await saveObservation(selectedStudent.id, classId, {
        content: '음성 관찰 기록',
        mode: 'voice',
        studentName: selectedStudent.name,
        audioData: savedAudio,
        durationSeconds: obsRecordingSeconds
      });

      showToast('음성 관찰 기록이 저장되었습니다!');
      document.getElementById('observation-modal')?.classList.remove('active');
    } catch (err) {
      console.error('[관찰 녹음] 저장 오류:', err);
      showToast('음성 기록 저장에 실패했습니다.', 'error');
    } finally {
      obsIsRecording = false;
      obsNativeRecording = false;
      obsMediaRecorder = null;
      obsMediaChunks = [];
      obsAudioStream = null;
      stopObservationTimer();
      if (stopBtn) {
        stopBtn.disabled = false;
        stopBtn.textContent = '녹음 중지 및 저장';
      }
    }
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
                <div class="card" style="padding: var(--s-12); text-align: left;">
                  <h3 style="margin-bottom: var(--s-6); text-align: center;">⚡ 새 퀴즈 출제하기</h3>
                  
                  <div class="form-group" style="margin-bottom: var(--s-6);">
                    <label class="input-label">문제 설명 (텍스트/수식)</label>
                    <textarea class="input-field" id="quiz-text-input" rows="4" placeholder="문제를 입력하세요. (예: 다음 식을 계산하세요. $2x + 5 = 11$)"></textarea>
                    
                    <div class="math-toolbar" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px;">
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\frac{ }{ }">分</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\sqrt{ }">√</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="^2">x²</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\pm">±</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\times">×</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\div">÷</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\pi">π</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\alpha">α</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\beta">β</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\theta">θ</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\sum">Σ</button>
                      <button class="btn btn-ghost btn-sm btn-math" data-latex="\\infty">∞</button>
                    </div>
                  </div>

                  <div class="form-group" style="margin-bottom: var(--s-6);">
                    <label class="input-label">이미지 첨부 (선택)</label>
                    <div class="drop-zone" id="quiz-img-dropzone" style="height: 150px; display: flex; flex-direction: column; justify-content: center;">
                      <span style="font-size: 2rem; margin-bottom: 10px;">🖼️</span>
                      <p id="quiz-img-status">문제 이미지를 업로드하세요</p>
                      <input type="file" id="quiz-img-input" class="hidden" accept="image/*" />
                    </div>
                  </div>

                  <button class="btn btn-primary btn-lg w-full" style="height: 60px; font-size: 1.2rem;" id="btn-start-quiz">🚀 퀴즈 시작하기</button>
                </div>
              ` : `
                <div class="card" style="padding: var(--s-6);">
                  <div class="input-label">출제된 문제</div>
                  ${activeQuiz.problemText ? `<div class="quiz-problem-text" style="font-size: 1.3rem; margin-bottom: 15px; padding: 15px; background: var(--bg-surface); border-radius: 8px; line-height: 1.6; white-space: pre-wrap;">${activeQuiz.problemText}</div>` : ''}
                  ${activeQuiz.problemImage ? `<img src="${activeQuiz.problemImage.url}" style="max-height: 400px; width: 100%; object-fit: contain; background: #000; border-radius: var(--r-md);" />` : ''}
                </div>
                
                <div class="section-header" style="margin-top: var(--s-8);">
                  <h2 class="section-title">학생 풀이 갤러리 (${quizSubmissions.length})</h2>
                </div>
                <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--s-6);">
                  ${quizSubmissions.map(s => `
                    <div class="card" style="padding: var(--s-3); display: flex; flex-direction: column; gap: 10px;">
                      ${s.image ? `<img src="${s.image.url}" style="width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: var(--r-sm); cursor: pointer;" onclick="window.open('${s.image.url}')" />` : ''}
                      ${s.solutionText ? `<div class="solution-text" style="padding: 10px; background: var(--bg-main); border-radius: 6px; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap;">${s.solutionText}</div>` : ''}
                      <div style="margin-top: auto; font-weight: 700; text-align: center; color: var(--primary-light);">${s.studentName}</div>
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
    const statusText = document.getElementById('quiz-img-status');
    const textInput = document.getElementById('quiz-text-input');

    dropzone?.addEventListener('click', () => input.click());
    input?.addEventListener('change', () => {
      if (input.files[0]) statusText.textContent = `선택됨: ${input.files[0].name}`;
    });

    document.querySelectorAll('.btn-math').forEach(btn => {
      btn.addEventListener('click', () => {
        const latex = btn.dataset.latex;
        const start = textInput.selectionStart;
        const end = textInput.selectionEnd;
        const text = textInput.value;
        textInput.value = text.substring(0, start) + latex + text.substring(end);
        textInput.focus();
        textInput.setSelectionRange(start + latex.length, start + latex.length);
      });
    });

    document.getElementById('btn-start-quiz')?.addEventListener('click', async () => {
      const problemText = textInput.value.trim();
      const hasImage = input.files[0];
      if (!problemText && !hasImage) { showToast('문제 내용이나 이미지를 입력해주세요.', 'error'); return; }
      
      const startBtn = document.getElementById('btn-start-quiz');
      startBtn.disabled = true;
      startBtn.textContent = '퀴즈 시작 중...';

      try {
        let saved = null;
        if (hasImage) saved = await saveFile(input.files[0]);
        const quiz = await startQuiz(classId, saved, problemText);
        activeQuiz = quiz;
        startSubmissionsListener(quiz.id);
        render();
      } catch (err) { showToast('시작 중 오류 발생', 'error'); }
      finally {
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.textContent = '🚀 퀴즈 시작하기';
        }
      }
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
      
      // LaTeX rendering
      setTimeout(() => {
        if (window.renderMathInElement) {
          renderMathInElement(container, {
            delimiters: [
              {left: '$$', right: '$$', display: true},
              {left: '$', right: '$', display: false}
            ],
            throwOnError: false
          });
        }
      }, 100);
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
            ${isRecording ? '⏹ 중지' : '📽️ 발표 녹화'}
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
      e.stopPropagation();
      // 마우스 우클릭만 차단 (터치는 button이 0이므로 통과)
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drawing = true;
      
      const pos = getPos(e);
      const pressure = e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5;
      currentPoints = [[pos.x, pos.y, pressure]];
      
      // Android WebView에서 setPointerCapture가 불안정하므로 try-catch
      try { wbCanvas.setPointerCapture(e.pointerId); } catch(err) {}
    };

    const moveDrawing = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!drawing) return;
      
      // getCoalescedEvents는 Android WebView에서 지원 안 될 수 있으므로 안전하게 처리
      let events;
      try { events = e.getCoalescedEvents ? e.getCoalescedEvents() : null; } catch(err) { events = null; }
      if (!events || events.length === 0) events = [e];
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
      e.stopPropagation();
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
      try { wbCanvas.releasePointerCapture(e.pointerId); } catch(err) {}
    };

    // Pointer Events (기본)
    wbCanvas.addEventListener('pointerdown', startDrawing);
    wbCanvas.addEventListener('pointermove', moveDrawing);
    wbCanvas.addEventListener('pointerup', stopDrawing);
    wbCanvas.addEventListener('pointercancel', stopDrawing);

    // Touch Events 폴백 (Android WebView에서 포인터 이벤트가 실패할 경우 대비)
    const getTouchPos = (touch) => {
      const rect = wbCanvas.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    wbCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (drawing) return; // 이미 pointer로 처리 중이면 무시
      const touch = e.touches[0];
      const pos = getTouchPos(touch);
      drawing = true;
      currentPoints = [[pos.x, pos.y, 0.5]];
    }, { passive: false });
    wbCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!drawing) return;
      const touch = e.touches[0];
      const pos = getTouchPos(touch);
      currentPoints.push([pos.x, pos.y, 0.5]);
      // 펜/지우개 로직 재사용
      if (currentPoints.length < 2) return;
      const isEraser = currentTool === 'eraser';
      if (isEraser) {
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
      } else {
        const strokeSize = penSize * 2.5;
        const strokePolygon = getStroke(currentPoints, {
          size: strokeSize, thinning: 0.5, smoothing: 0.5, streamline: 0.5,
          simulatePressure: true
        });
        const pathData = getSvgPathFromStroke(strokePolygon);
        if (pathData) {
          const path = new Path2D(pathData);
          draftCtx.save();
          draftCtx.setTransform(1, 0, 0, 1, 0, 0);
          draftCtx.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
          draftCtx.restore();
          draftCtx.save();
          draftCtx.fillStyle = penColor;
          draftCtx.fill(path);
          draftCtx.restore();
        }
      }
    }, { passive: false });
    wbCanvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!drawing) return;
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
    }, { passive: false });
    wbCanvas.addEventListener('touchcancel', (e) => {
      drawing = false;
      currentPoints = [];
    }, { passive: false });
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

  function renderRecordingFrame() {
    if (!isRecording || !recordingCtx) return;
    
    const draftCanvas = document.getElementById('whiteboard-draft');
    if (!draftCanvas) return;

    // Composite: wbCanvas (bottom) + draftCanvas (top)
    recordingCtx.save();
    recordingCtx.setTransform(1, 0, 0, 1, 0, 0);
    recordingCtx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    recordingCtx.restore(); // restore scale ratio
    
    // Draw Background/Permanent lines
    recordingCtx.drawImage(wbCanvas, 0, 0);
    // Draw active stroke
    recordingCtx.drawImage(draftCanvas, 0, 0);
    
    recordingReqId = requestAnimationFrame(renderRecordingFrame);
  }

  async function handleRecordToggle() {
    if (!isRecording) {
      // 0. Reset State
      mediaChunks = [];
      recordedBlob = null;
      recordingMode = null;

      try {
        console.log('[녹음] 환경 확인...');
        const isNativeMode = window.Capacitor && window.Capacitor.isNativePlatform();

        // 1. 네이티브 앱(Android)에서 WebView가 권한 예외로 크래시(Crash)되는 것을 방지하기 위해 권한 먼저 획득
        if (isNativeMode) {
          try {
            const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
            if (!permStatus.value) {
              showToast('마이크 권한이 차단되었습니다.', 'error');
              return;
            }
          } catch(e) {
            console.warn('[녹음] 네이티브 권한 요청 에러:', e);
          }
        }

        const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
        
        // --- 1. Attempt Screen + Audio Recording (Web API) ---
        if (hasMediaDevices && hasMediaRecorder) {
          try {
            console.log('[녹음] 오디오 스트림 요청...');
            const rawAudioStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 44100
              }
            });

            // Web Audio API로 마이크 볼륨 증폭 (3배)
            let audioStream = rawAudioStream;
            // 안드로이드 하드웨어 인코더(MediaRecorder)와 WebAudio의 충돌(Crash)을 피하기 위해 네이티브에서는 증폭 생략
            if (!isNativeMode) {
              try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(rawAudioStream);
                const gainNode = audioContext.createGain();
                gainNode.gain.value = 3.0; // 볼륨 3배 증폭
                const dest = audioContext.createMediaStreamDestination();
                source.connect(gainNode);
                gainNode.connect(dest);
                audioStream = dest.stream;
                console.log('[녹음] 오디오 볼륨 증폭 적용 (3x)');
              } catch (gainErr) {
                console.warn('[녹음] Web Audio API 증폭 실패, 원본 오디오 사용:', gainErr);
              }
            }

            // Setup Mirror Canvas
            recordingCanvas = document.createElement('canvas');
            
            // 안드로이드 WebM 인코더가 거대한 칠판 해상도에서 크래시되지 않도록 최대 해상도 제한 (안전한 1280x720)
            const MAX_REC_WIDTH = 1280;
            const MAX_REC_HEIGHT = 720;
            let ratio = 1;
            if (wbCanvas.width > MAX_REC_WIDTH || wbCanvas.height > MAX_REC_HEIGHT) {
              ratio = Math.min(MAX_REC_WIDTH / wbCanvas.width, MAX_REC_HEIGHT / wbCanvas.height);
            }
            recordingCanvas.width = Math.floor(wbCanvas.width * ratio);
            recordingCanvas.height = Math.floor(wbCanvas.height * ratio);
            recordingCtx = recordingCanvas.getContext('2d');
            recordingCtx.scale(ratio, ratio);
            
            if (typeof recordingCanvas.captureStream === 'function') {
              console.log('[녹음] 캔버스 캡처 지원됨 → 화면+음성 결합');
              const canvasStream = recordingCanvas.captureStream(30);
              const combinedStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...audioStream.getAudioTracks()
              ]);

              // Detect best MIME type
              const mimeTypes = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
              const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';
              
              mediaRecorder = new MediaRecorder(combinedStream, selectedMime ? { mimeType: selectedMime } : {});
              recordingMode = 'video';
            } else {
              console.log('[녹음] 캔버스 캡처 미지원 → 음성만 녹음');
              mediaRecorder = new MediaRecorder(audioStream);
              recordingMode = 'audio';
            }
          } catch (webErr) {
            console.error('[녹음] 브라우저 녹음 초기화 실패:', webErr);
            // Fall through to Capacitor if on native
          }
        }

        // --- 2. Fallback to Capacitor (Native Plugin) if Web API failed or preferred ---
        if (!mediaRecorder && window.Capacitor && window.Capacitor.isNativePlatform()) {
          try {
            console.log('[녹음] 네이티브 플러그인 시도...');
            const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
            if (!permStatus.value) {
              showToast('마이크 권한이 차단되었습니다.', 'error');
              return;
            }
            await VoiceRecorder.startRecording();
            recordingMode = 'audio'; // Capacitor is audio-only in this implementation
            isRecording = true;
            updateWhiteboardUI();
            showToast('🎙 네이티브 앱 음성 녹음을 시작합니다.');
            return;
          } catch(capErr) {
            showToast('네이티브 녹음을 시작할 수 없습니다.', 'error');
            return;
          }
        }

        // --- 3. Start Web MediaRecorder ---
        if (mediaRecorder) {
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) mediaChunks.push(e.data);
          };
          mediaRecorder.onstop = () => {
            const blobType = mediaRecorder.mimeType || (recordingMode === 'video' ? 'video/webm' : 'audio/webm');
            recordedBlob = new Blob(mediaChunks, { type: blobType });
            console.log(`[녹음] 완료: mode=${recordingMode}, size=${recordedBlob.size}`);
          };

          mediaRecorder.start(200); // 200ms 청크로 딜레이 최소화
          isRecording = true;
          
          if (recordingMode === 'video') {
            renderRecordingFrame();
            showToast('📹 발표 녹화를 시작합니다. (화면+음성)');
          } else {
            showToast('🎙 오디오 녹음을 시작합니다.');
          }
          updateWhiteboardUI();
        } else {
          showToast('이 기기에서는 녹화/녹음 기능을 시작할 수 없습니다.', 'error');
        }

      } catch (err) {
        console.error('[녹음] 최종 실패:', err);
        showToast('녹음 오류: ' + err.message, 'error');
      }
    } else {
      // --- STOP RECORDING ---
      if (recordingReqId) {
        cancelAnimationFrame(recordingReqId);
        recordingReqId = null;
      }

      if (window.Capacitor && window.Capacitor.isNativePlatform() && !mediaRecorder) {
        try {
          const result = await VoiceRecorder.stopRecording();
          const mimeType = result.value.mimeType;
          const base64Str = result.value.recordDataBase64;
          
          const byteCharacters = atob(base64Str);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          recordedBlob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
          
          isRecording = false;
          updateWhiteboardUI();
          showToast('⏹ 녹음이 중지되었습니다.');
          return;
        } catch(err) {
          showToast('중지 중 오류 발생', 'error');
        }
      }

      if (mediaRecorder) {
        try {
          mediaRecorder.stop();
          mediaRecorder.stream.getTracks().forEach(t => t.stop());
        } catch (stopErr) {
          console.error('[녹음] 중지 오류:', stopErr);
        }
      }

      isRecording = false;
      updateWhiteboardUI();
      showToast('⏹ 녹음이 중지되었습니다.');
    }
  }

  async function handleSavePresentation() {
    if (isRecording) {
      showToast('녹음 중에는 저장할 수 없습니다. 녹음을 먼저 중지해주세요.', 'error');
      return;
    }

    showToast('💾 발표 자료 저장 중...', 'info');
    try {
      // 1. Static Whiteboard Image
      const canvasBlob = await new Promise(resolve => wbCanvas.toBlob(resolve, 'image/png'));
      if (!canvasBlob) throw new Error('이미지 캔버스 캡처 실패');
      
      const imageFile = new File([canvasBlob], `wb_${Date.now()}.png`, { type: 'image/png' });
      const savedImage = await saveFile(imageFile);

      // 2. Recorded Media
      let savedMedia = null;
      if (recordedBlob && recordedBlob.size > 0) {
        const isVideo = recordingMode === 'video';
        const type = recordedBlob.type;
        let ext = isVideo ? 'webm' : 'webm';
        if (type.includes('mp4')) ext = 'mp4';
        else if (type.includes('wav')) ext = 'wav';
        else if (type.includes('m4a')) ext = 'm4a';

        const fileName = `${isVideo ? 'video' : 'audio'}_${Date.now()}.${ext}`;
        const mediaFile = new File([recordedBlob], fileName, { type });
        savedMedia = await saveFile(mediaFile);
        console.log('[저장] 미디어 저장 완료:', fileName, type);
      }

      // 3. Register Presentation
      await addPresentation(selectedStudent.id, classId, {
        whiteboardImage: savedImage,
        audioData: savedMedia,
        recordingMode: recordingMode // Explicitly track mode
      });

      showToast('✨ 발표 자료가 성공적으로 저장되었습니다!');
      activeView = 'lesson';
      render();
    } catch (err) {
      console.error('[저장] 오류:', err);
      showToast('저장 실패: ' + err.message, 'error');
    }
  }

  function updateWhiteboardUI() {
    // Update Record Button
    const recordBtn = document.getElementById('wb-record');
    if (recordBtn) {
      recordBtn.innerHTML = isRecording ? '⏹ 중지' : '📽️ 발표 녹화';
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
            <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: var(--s-8);">
              ${studentPresentations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(p => {
                const isVideo = p.recordingMode === 'video';
                return `
                <div class="card presentation-card animate-up" style="padding: var(--s-4); position: relative;">
                  <div class="badge badge-main" style="position: absolute; top: 15px; left: 15px; z-index: 2;">
                    ${formatDate(p.createdAt)}
                  </div>
                  <div class="presentation-media" style="background: #000; border-radius: var(--r-md); overflow: hidden; margin-bottom: var(--s-4); border: 2px solid var(--border-light);">
                    <img src="${p.whiteboardImage?.url}" style="width: 100%; aspect-ratio: 16/9; object-fit: contain;" />
                    ${p.audioData ? `<div style="position: absolute; bottom: 100px; right: 20px; font-size: 2rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${isVideo ? '📹' : '🎙️'}</div>` : ''}
                  </div>
                  <div class="flex flex-col gap-sm">
                    ${p.audioData ? `
                      <button class="btn ${isVideo ? 'btn-primary' : 'btn-blue'} w-full play-video-btn" data-url="${p.audioData.url}" data-mode="${p.recordingMode}">
                        ${isVideo ? '🎬 발표 영상 재생' : '🔊 발표 음성 듣기'}
                      </button>
                    ` : `
                      <button class="btn btn-ghost w-full" disabled>기록 없음</button>
                    `}
                    <div class="flex flex-col gap-xs">
                      <button class="btn btn-secondary btn-sm w-full" onclick="window.open('${p.whiteboardImage?.url}')">🖼️ 원본 이미지</button>
                      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                        <button class="btn ${p.shared ? 'btn-danger' : 'btn-purple'} btn-sm btn-toggle-share" data-id="${p.id}" data-shared="${p.shared}">
                          ${p.shared ? '공유 끄기' : '전체 공유'}
                        </button>
                        <button class="btn btn-ghost btn-sm btn-delete-presentation" data-id="${p.id}" title="발표 기록 삭제" style="color: var(--error); border: 1px solid rgba(239,68,68,0.35);">
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              `;}).join('')}
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

    document.querySelectorAll('.btn-delete-presentation').forEach(btn => {
      btn.addEventListener('click', async () => {
        const presentationId = btn.dataset.id;
        if (!presentationId || !confirm('이 발표 기록을 영구히 삭제할까요?')) return;

        try {
          const ok = await deletePresentationById(presentationId);
          if (!ok) {
            showToast('발표 기록을 찾을 수 없습니다.', 'error');
            return;
          }
          showToast('발표 기록이 삭제되었습니다.');
          studentPresentations = await getPresentationsByStudent(selectedStudent.id);
          render();
        } catch (err) {
          console.error('Presentation delete error:', err);
          showToast('삭제 중 오류가 발생했습니다.', 'error');
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
