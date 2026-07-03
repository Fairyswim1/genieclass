// ========================================
// Teacher Lesson Mode (v2.0)
// ========================================
import {
  getCurrentTeacher, getClassById, getStudentsByClass,
  praiseStudent, showToast, getStudentById, addPresentation,
  toggleSharePresentation, startQuiz, stopQuiz, listenToQuizSubmissions,
  saveFile, getPresentationsByStudent, formatDate, addStudentPoints,
  subtractStudentPoints, deletePresentationById, getClassesByTeacher,
  revealQuizGallery, getQuizById, enrichPresentationsWithImageUrls,
  presentationWhiteboardImageUrl,
} from '../../store.js';
import { escapeHtml, renderQuizMath } from '../../utils/quizMath.js';
import { bindClipboardPasteZone } from '../../utils/clipboardPaste.js';
import { renderQuizLatexKeyboardHtml } from '../../utils/quizLatexKeyboard.js';
import { bindPresentationPlayback, PRESENTATION_PLAYBACK_MODAL_HTML } from '../../utils/presentationPlayback.js';
import { renderCharacter, getLevelConfig, renderPraiseAnimation, deriveCharacterLevelFromPoints } from '../../components/characterAvatar.js';
import { getStroke } from 'perfect-freehand';
import { eraseSegmentDisk, WHITEBOARD_ERASER_ICON_HTML } from '../../utils/eraserCanvas.js';
import { Capacitor } from '@capacitor/core';
import { VoiceRecorder } from 'capacitor-voice-recorder';

export function renderLessonMode(container, params) {
  const teacher = getCurrentTeacher();
  if (!teacher) { window.location.hash = '/teacher/login'; return; }

  const classId = params.id;
  let isActive = true; // 페이지가 활성화 상태인지 추적 — false이면 stale render가 DOM을 덮어쓰지 않음
  let cls = null;
  let teacherClasses = []; // 선생님의 전체 클래스 목록 (다른 클래스로 공유할 때 사용)
  let students = [];
  let selectedStudent = null;
  let activeView = 'lesson'; // 'lesson', 'whiteboard', 'quiz', 'presentations'
  let studentPresentations = [];

  // Quiz State
  let activeQuiz = null;
  let quizSubmissions = [];
  let unsubscribeSubmissions = null;
  let clipboardPasteQuizUnsubs = [];

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
    [cls, teacherClasses] = await Promise.all([
      getClassById(classId),
      getClassesByTeacher(teacher.uid),
    ]);
    if (!isActive) return;
    if (!cls) { window.location.hash = '/teacher/dashboard'; return; }
    await render();
  }

  async function render() {
    students = await getStudentsByClass(classId);
    if (!isActive) return; // 다른 페이지로 이동 후 완료된 stale render 차단

    if (activeView === 'whiteboard') {
      renderWhiteboardMode();
      return;
    }

    if (activeView === 'quiz') {
      // 클래스 최신 상태 가져와서 활성 퀴즈 복원
      const freshCls = await getClassById(classId);
      if (freshCls) cls = freshCls;
      if (!activeQuiz && cls?.activeQuizId) {
        try {
          const quiz = await getQuizById(cls.activeQuizId);
          if (quiz?.active) {
            activeQuiz = quiz;
            startSubmissionsListener(quiz.id);
          }
        } catch (e) {
          console.error('[Quiz] 퀴즈 복원 실패:', e);
        }
      }
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
      const lv = deriveCharacterLevelFromPoints(s.totalPoints ?? 0);
      return `
                <div class="student-avatar-card card ${selectedStudent?.id === s.id ? 'selected' : ''}" data-student-id="${s.id}">
                  <div class="student-character">
                    ${renderCharacter(lv, 80, s.characterType || 'apple', s.totalPoints)}
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
          ${selectedStudent ? (() => {
            const selLv = deriveCharacterLevelFromPoints(selectedStudent.totalPoints ?? 0);
            return `
            <div class="action-panel-header">
              <h3 style="font-weight: 800; font-size: 1.25rem;">${selectedStudent.name}</h3>
              <button class="modal-close" id="close-action-panel">✕</button>
            </div>
            <div class="action-panel-body">
               <div class="text-center" style="margin-bottom: var(--s-8);">
                 <div style="width: 120px; height: 120px; margin: 0 auto 15px;">
                   ${renderCharacter(selLv, 120, selectedStudent.characterType || 'apple', selectedStudent.totalPoints)}
                 </div>
                 <div class="badge badge-purple">${getLevelConfig(selLv, selectedStudent.characterType || 'apple').fullName}</div>
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
               <button class="btn btn-ghost btn-sm w-full" id="btn-subtract-point" style="margin-top: 8px; color: var(--text-muted); border: 1px dashed var(--border-main); font-size: 0.82rem;">
                 ↩ 포인트 취소 (-1P)
               </button>
            </div>
          `;
          })() : ''}
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
      render();
    });

    document.getElementById('btn-history')?.addEventListener('click', async () => {
      showToast('발표 기록을 불러오는 중...', 'info');
      try {
        studentPresentations = await enrichPresentationsWithImageUrls(
          await getPresentationsByStudent(
            selectedStudent.id,
            selectedStudent.classId || classId,
          ),
        );
        activeView = 'presentations';
        render();
      } catch (err) {
        console.error('[발표 기록]', err);
        showToast('발표 기록을 불러오지 못했습니다: ' + (err?.message || '권한 오류'), 'error');
      }
    });

    document.getElementById('btn-subtract-point')?.addEventListener('click', async () => {
      if ((selectedStudent.totalPoints ?? 0) === 0) {
        showToast('이미 0P입니다.', 'error');
        return;
      }
      if (!confirm(`${selectedStudent.name} 학생의 포인트를 1P 취소하겠습니까?`)) return;
      const updated = await subtractStudentPoints(selectedStudent.id, 1);
      if (updated) {
        selectedStudent = updated;
        showToast(`${updated.name}의 포인트를 1P 취소했습니다.`);
        render();
      }
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
        console.error('Save observation error:', err);
        showToast(err?.message || '저장 실패', 'error');
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

      // Capacitor 앱(WebView)에서는 MediaRecorder만 쓸 때 마이크 스트림은 열리는데
      // 실제 인코딩 데이터가 비는 경우가 많아, 관찰 기록(음성 전용)은 네이티브 플러그인을 먼저 씀.
      if (isNativeMode) {
        try {
          const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
          if (!permStatus.value) {
            showToast('마이크 권한이 차단되었습니다.', 'error');
            document.getElementById('observation-choice-view')?.classList.remove('hidden');
            document.getElementById('observation-voice-view')?.classList.add('hidden');
            return;
          }
          await VoiceRecorder.startRecording();
          obsNativeRecording = true;
          obsIsRecording = true;
          startObservationTimer();
          showToast('관찰 음성 녹음을 시작했습니다.', 'info');
          return;
        } catch (nativeErr) {
          console.warn('[관찰 녹음] 네이티브 녹음 실패, 브라우저 녹음으로 재시도:', nativeErr);
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
      showToast(err?.message || '음성 기록 저장에 실패했습니다.', 'error');
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
                    <label class="input-label">문제 설명 (텍스트·수식)</label>
                    <textarea class="input-field quiz-text-input-enhanced" id="quiz-text-input" rows="5" spellcheck="false" placeholder="예) $2x^2 - 5x + 3 = 0$ 의 두 근을 구하시오.&#10;&#10;긴 수식 줄은 전체를 $$ … $$ 로 감싸면 가운데 정렬됩니다. 아래 패드에서 LaTeX를 넣으면 미리보기에 바로 반영됩니다."></textarea>
                    ${renderQuizLatexKeyboardHtml()}
                    <label class="input-label" style="margin-top: var(--s-6);">미리보기 (학생에게도 같은 스타일로 보입니다)</label>
                    <div id="quiz-live-math-preview" class="latex-preview-panel latex-preview-live" aria-live="polite">
                      <p class="latex-preview-placeholder">위에 문제를 입력하면 여기에 수식과 글이 함께 보입니다. $x=-b\\pm\\sqrt{b^2-4ac}$ 와 같은 수식도 지원합니다.</p>
                    </div>
                  </div>

                  <div class="form-group" style="margin-bottom: var(--s-6);">
                    <label class="input-label">이미지 첨부 (선택)</label>
                    <div class="drop-zone" id="quiz-img-dropzone" style="height: 150px; display: flex; flex-direction: column; justify-content: center;">
                      <span style="font-size: 2rem; margin-bottom: 8px;">🖼️</span>
                      <p id="quiz-img-status" style="font-weight: 600; margin-bottom: 4px;">이미지를 여기에 드래그하거나 클릭하여 업로드 · 붙여넣기(Ctrl+V)</p>
                      <p style="font-size: 0.8rem; opacity: 0.65; margin: 0;">JPG, PNG 등 이미지 파일 지원</p>
                      <input type="file" id="quiz-img-input" class="hidden" accept="image/*" />
                    </div>
                  </div>

                  <button class="btn btn-primary btn-lg w-full" style="height: 60px; font-size: 1.2rem;" id="btn-start-quiz">🚀 퀴즈 시작하기</button>
                </div>
              ` : `
                <div class="card" style="padding: var(--s-8); margin-bottom: var(--s-4);">
                  <div class="input-label" style="margin-bottom: 12px; font-weight: 700;">출제 중인 문제</div>
                  ${activeQuiz.problemText ? `
                  <div class="quiz-math-render-root latex-panel-root">
                    <div class="latex-preview-panel latex-preview-panel--standalone">
                      <div class="latex-preview-body">${escapeHtml(activeQuiz.problemText)}</div>
                    </div>
                  </div>` : ''}
                  ${activeQuiz.problemImage ? `
                    <div style="margin-top: ${activeQuiz.problemText ? '16px' : '0'}; border-radius: var(--r-md); overflow: hidden; border: 1px solid rgba(148,163,184,0.35); background: #020617;">
                      <img src="${activeQuiz.problemImage.url}" alt="문제 이미지" style="width:100%; max-height: 420px; object-fit: contain; display: block;">
                    </div>` : ''}
                </div>
                
                <div class="section-header flex justify-between items-center" style="margin-top: var(--s-8);">
                  <h2 class="section-title">학생 풀이 갤러리 (${quizSubmissions.length})</h2>
                  ${!activeQuiz.galleryRevealed
                    ? `<button class="btn btn-primary btn-sm" id="btn-reveal-gallery">🔓 학생에게 풀이 공개</button>`
                    : `<span class="badge badge-green">✅ 풀이 공개됨</span>`}
                </div>
                <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--s-6);">
                  ${quizSubmissions.map(s => `
                    <div class="card" style="padding: var(--s-3); display: flex; flex-direction: column; gap: 10px;">
                      ${s.image ? `<img src="${s.image.url}" alt="" style="width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: var(--r-sm); cursor: pointer;" onclick="window.open('${s.image.url}')" />` : ''}
                      ${s.solutionText ? `<div class="quiz-solution-math quiz-math-render-root">${escapeHtml(s.solutionText)}</div>` : ''}
                      <div style="margin-top: auto; font-weight: 700; text-align: center; color: var(--primary-light);">${escapeHtml(s.studentName || '')}</div>
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
    queueMicrotask(() => {
      container.querySelectorAll('.quiz-math-render-root').forEach((el) => renderQuizMath(el));
    });
  }

  function bindQuizEvents() {
    clipboardPasteQuizUnsubs.forEach((u) => u());
    clipboardPasteQuizUnsubs.length = 0;

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

    // 드래그앤드롭 지원
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        statusText.textContent = `선택됨: ${file.name}`;
      }
    });

    if (dropzone && input && statusText) {
      clipboardPasteQuizUnsubs.push(
        bindClipboardPasteZone({
          zone: dropzone,
          imagesOnly: true,
          onPaste: (files) => {
            const file = files.find((f) => String(f.type || '').startsWith('image/'));
            if (!file) return;
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            statusText.textContent = `선택됨: ${file.name}`;
          },
        }),
      );
    }

    let previewDebounce;
    const refreshTeacherQuizPreview = () => {
      const preview = document.getElementById('quiz-live-math-preview');
      const ti = document.getElementById('quiz-text-input');
      if (!preview || !ti) return;
      preview.classList.add('latex-preview-panel');
      const raw = ti.value;
      if (!raw.trim()) {
        preview.innerHTML = '<p class="latex-preview-placeholder">위에 문제를 입력하면 여기에 수식과 글이 함께 보입니다. $x=-b\\pm\\sqrt{b^2-4ac}$ 같은 수식도 지원합니다.</p>';
        return;
      }
      preview.innerHTML = `<div class="latex-preview-body quiz-math-render-root">${escapeHtml(raw)}</div>`;
      renderQuizMath(preview);
    };

    const kb = document.getElementById('quiz-latex-keyboard');
    if (kb && textInput) {
      kb.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('[data-latex-tab]');
        if (tabBtn) {
          const i = parseInt(tabBtn.dataset.latexTab, 10);
          kb.querySelectorAll('.latex-kb-tab').forEach((t) => t.classList.toggle('latex-kb-tab--active', t === tabBtn));
          kb.querySelectorAll('.latex-kb-panel').forEach((p, j) => p.classList.toggle('latex-kb-panel--visible', j === i));
          return;
        }
        const sym = e.target.closest('.latex-kb-insert');
        if (!sym) return;
        const latex = decodeURIComponent(sym.dataset.latexInsert || '');
        const start = textInput.selectionStart ?? 0;
        const end = textInput.selectionEnd ?? 0;
        const txt = textInput.value;
        textInput.value = txt.substring(0, start) + latex + txt.substring(end);
        textInput.focus();
        textInput.setSelectionRange(start + latex.length, start + latex.length);
        refreshTeacherQuizPreview();
      });
    }

    textInput?.addEventListener('input', () => {
      clearTimeout(previewDebounce);
      previewDebounce = setTimeout(refreshTeacherQuizPreview, 100);
    });
    refreshTeacherQuizPreview();

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

    document.getElementById('btn-reveal-gallery')?.addEventListener('click', async () => {
      if (!activeQuiz) return;
      const btn = document.getElementById('btn-reveal-gallery');
      btn.disabled = true;
      btn.textContent = '공개 중...';
      try {
        await revealQuizGallery(activeQuiz.id);
        activeQuiz = { ...activeQuiz, galleryRevealed: true };
        showToast('학생들에게 친구들의 풀이가 공개되었습니다! 🎉');
        render();
      } catch (err) {
        showToast('공개 중 오류가 발생했습니다.', 'error');
        btn.disabled = false;
        btn.textContent = '🔓 학생에게 풀이 공개';
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
            <button class="whiteboard-tool ${currentTool === 'eraser' ? 'active' : ''}" data-tool="eraser">${WHITEBOARD_ERASER_ICON_HTML}</button>
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
      const wrap = wbCanvas.parentElement;
      const prevW = wbCanvas.width;
      const prevH = wbCanvas.height;
      let tempCanvas = null;
      if (prevW > 0 && prevH > 0) {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = prevW;
        tempCanvas.height = prevH;
        try {
          tempCanvas.getContext('2d').drawImage(wbCanvas, 0, 0);
        } catch (_) {
          tempCanvas = null;
        }
      }

      setSize();

      if (!wrap || wrap.clientWidth <= 0 || wrap.clientHeight <= 0 || wbCanvas.width <= 0 || wbCanvas.height <= 0) {
        return;
      }

      wbCtx.save();
      wbCtx.setTransform(1, 0, 0, 1, 0, 0);
      if (tempCanvas) {
        try {
          wbCtx.drawImage(tempCanvas, 0, 0);
        } catch (_) {
          wbCtx.fillStyle = '#000';
          wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
        }
      } else {
        wbCtx.fillStyle = '#000';
        wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
      }
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
        const p1 = currentPoints[currentPoints.length - 2];
        const p2 = currentPoints[currentPoints.length - 1];
        eraseSegmentDisk(wbCtx, p1[0], p1[1], p2[0], p2[1], penSize, '#000000');
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
        const p1 = currentPoints[currentPoints.length - 2];
        const p2 = currentPoints[currentPoints.length - 1];
        eraseSegmentDisk(wbCtx, p1[0], p1[1], p2[0], p2[1], penSize, '#000000');
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
    // 지우개로 투명해진 픽셀이 녹화에서 이상하게 보이지 않도록 검은 배경 먼저 채움
    recordingCtx.fillStyle = '#000000';
    recordingCtx.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    recordingCtx.restore(); // restore scale ratio
    
    // Draw Background/Permanent lines
    recordingCtx.drawImage(wbCanvas, 0, 0);
    // Draw active stroke
    recordingCtx.drawImage(draftCanvas, 0, 0);
    
    recordingReqId = requestAnimationFrame(renderRecordingFrame);
  }

  function releaseMediaStreamLesson(ms) {
    try {
      ms?.getTracks?.()?.forEach((t) => t.stop());
    } catch (_) {}
  }

  async function handleRecordToggle() {
    if (!isRecording) {
      // 0. Reset State
      mediaChunks = [];
      recordedBlob = null;
      recordingMode = null;
      mediaRecorder = null;

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

        // 브라우저·네이티브 WebView 공통: 가능하면 칠판(canvas)+마이크를 비디오로 녹화, 실패 시 오디오만
        if (hasMediaDevices && hasMediaRecorder) {
          let rawAudioStream = null;
          let audioStream = null;
          let combinedAttempt = null;
          try {
            rawAudioStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 44100
              }
            });

            // Web Audio 증폭은 에코 캔슬(AEC)을 무력화하고 클리핑·울림(하울링)을 유발하므로 원본 스트림 사용
            audioStream = rawAudioStream;

            recordingCanvas = document.createElement('canvas');

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
              console.log('[녹음] 캔버스 캡처 시도 → 화면+음성 결합');
              const canvasStream = recordingCanvas.captureStream(30);
              combinedAttempt = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...audioStream.getAudioTracks()
              ]);

              const mimeTypes = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
              const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

              try {
                if (combinedAttempt && selectedMime) {
                  mediaRecorder = new MediaRecorder(combinedAttempt, { mimeType: selectedMime });
                  recordingMode = 'video';
                }
              } catch (mrVidErr) {
                console.warn('[녹음] 비디오 MediaRecorder 생성 실패:', mrVidErr);
                mediaRecorder = null;
              }

              if (!mediaRecorder) {
                releaseMediaStreamLesson(combinedAttempt);
                combinedAttempt = null;
                try {
                  const audioMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
                  const audioMime = audioMimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
                  mediaRecorder = new MediaRecorder(audioStream, audioMime ? { mimeType: audioMime } : undefined);
                  recordingMode = 'audio';
                  console.log('[녹음] 비디오 실패로 오디오 전용 녹음');
                } catch (audErr) {
                  console.warn('[녹음] 오디오 MediaRecorder 생성 실패:', audErr);
                  mediaRecorder = null;
                }
              }
            } else {
              console.log('[녹음] 캔버스 캡처 미지원 → 음성만 녹음');
              try {
                mediaRecorder = new MediaRecorder(audioStream);
                recordingMode = 'audio';
              } catch (audOnlyErr) {
                console.warn('[녹음] 오디오 MR 실패:', audOnlyErr);
                mediaRecorder = null;
              }
            }
          } catch (setupErr) {
            console.error('[녹음] 녹음 초기화 실패:', setupErr);
            releaseMediaStreamLesson(combinedAttempt);
            combinedAttempt = null;
            releaseMediaStreamLesson(audioStream);
            audioStream = null;
            releaseMediaStreamLesson(rawAudioStream);
            rawAudioStream = null;
            mediaRecorder = null;
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

          try {
            mediaRecorder.start(200);
          } catch (startErr) {
            console.error('[녹음] MediaRecorder.start 실패:', startErr);
            try {
              mediaRecorder.stream?.getTracks()?.forEach((t) => t.stop());
            } catch (_) {}
            mediaRecorder = null;
            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
              try {
                console.log('[녹음] start 실패 후 네이티브 플러그인 재시도...');
                const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
                if (!permStatus.value) {
                  showToast('마이크 권한이 차단되었습니다.', 'error');
                  return;
                }
                await VoiceRecorder.startRecording();
                recordingMode = 'audio';
                isRecording = true;
                updateWhiteboardUI();
                showToast('🎙 네이티브 앱 음성 녹음을 시작합니다.');
                return;
              } catch (capErr2) {
                showToast('녹음을 시작할 수 없습니다.', 'error');
                return;
              }
            }
            showToast('녹음을 시작할 수 없습니다.', 'error');
            return;
          }

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
        recordingMode: recordingMode,
        studentName: selectedStudent.name,
      });

      // 발표 저장 완료 시에만 포인트 지급 (발표하기 클릭만으로는 포인트 안 줌)
      const updated = await addStudentPoints(selectedStudent.id, 1);
      if (updated) selectedStudent = updated;

      showToast('✨ 발표 자료 저장 완료! (1P 획득)');
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
                const wbUrl = presentationWhiteboardImageUrl(p);
                const mediaUrl = typeof p.audioData?.url === 'string' ? p.audioData.url.trim() : '';
                return `
                <div class="card presentation-card animate-up" style="padding: var(--s-4); position: relative;">
                  <div class="badge badge-main" style="position: absolute; top: 15px; left: 15px; z-index: 2;">
                    ${formatDate(p.createdAt)}
                  </div>
                  <div class="presentation-media" style="position: relative; background: #000; border-radius: var(--r-md); overflow: hidden; margin-bottom: var(--s-4); border: 2px solid var(--border-light); min-height: 120px;">
                    ${wbUrl
      ? `<img src="${escapeHtml(wbUrl)}" alt="" style="width: 100%; aspect-ratio: 16/9; object-fit: contain;" />`
      : `<div style="display:flex;align-items:center;justify-content:center;aspect-ratio:16/9;color:rgba(255,255,255,0.5);font-size:0.9rem;">발표판 이미지 없음</div>`}
                    ${p.audioData ? `<div style="position: absolute; bottom: 100px; right: 20px; font-size: 2rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${isVideo ? '📹' : '🎙️'}</div>` : ''}
                  </div>
                  <div class="flex flex-col gap-sm">
                    ${p.audioData ? `
                      <button class="btn ${isVideo ? 'btn-primary' : 'btn-blue'} w-full play-video-btn" data-url="${escapeHtml(mediaUrl)}" data-wb-url="${escapeHtml(wbUrl)}" data-recording-mode="${escapeHtml(p.recordingMode || 'audio')}">
                        ${isVideo ? '🎬 발표 영상 재생' : '🔊 발표 음성 듣기'}
                      </button>
                    ` : `
                      <button class="btn btn-ghost w-full" disabled>기록 없음</button>
                    `}
                    <div class="flex flex-col gap-xs">
                      ${wbUrl
      ? `<button type="button" class="btn btn-secondary btn-sm w-full" onclick="window.open('${escapeHtml(wbUrl)}', '_blank')">🖼️ 원본 이미지</button>`
      : `<button type="button" class="btn btn-secondary btn-sm w-full" disabled>🖼️ 원본 이미지 없음</button>`}
                      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                        <button class="btn ${p.shared ? 'btn-danger' : 'btn-purple'} btn-sm btn-toggle-share" data-id="${p.id}" data-shared="${p.shared ? 'true' : 'false'}">
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

      ${PRESENTATION_PLAYBACK_MODAL_HTML}
    `;

    document.getElementById('history-back')?.addEventListener('click', () => {
      activeView = 'lesson';
      render();
    });

    bindPresentationPlayback(container);

    document.querySelectorAll('.btn-toggle-share').forEach(btn => {
      btn.addEventListener('click', async () => {
        const presentationId = btn.dataset.id;
        const isShared = btn.dataset.shared === 'true';

        if (isShared) {
          // 공유 끄기
          try {
            await toggleSharePresentation(presentationId, null, []);
            showToast('공유가 중지되었습니다.');
            studentPresentations = await getPresentationsByStudent(
              selectedStudent.id,
              selectedStudent.classId || classId,
            );
            render();
          } catch (err) {
            console.error('[발표 공유 해제]', err);
            showToast('공유 해제 실패: ' + (err?.message || '권한 오류'), 'error');
          }
          return;
        }

        // 공유 켜기 — 모달로 제목 + 다른 클래스 선택
        const otherClasses = teacherClasses.filter(c => c.id !== classId);
        const modalId = 'share-modal-' + Date.now();
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop active';
        modal.id = modalId;
        modal.innerHTML = `
          <div class="modal-content" style="max-width: 480px;">
            <div class="modal-header">
              <h3 class="modal-title">📤 발표 공유 설정</h3>
              <button class="modal-close" id="${modalId}-close">✕</button>
            </div>
            <p style="font-size: 0.88rem; color: var(--text-muted); margin: 0 0 var(--s-4); line-height: 1.45;">
              저장된 제목으로 공유됩니다.
            </p>
            ${otherClasses.length > 0 ? `
            <div class="form-group" style="margin-bottom: var(--s-6);">
              <label class="input-label" style="margin-bottom: var(--s-2);">다른 클래스에도 공유 (선택)</label>
              <div style="display: flex; flex-direction: column; gap: 8px; background: var(--bg-main); border-radius: var(--r-sm); padding: var(--s-3);">
                ${otherClasses.map(c => `
                  <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 0.9rem;">
                    <input type="checkbox" class="share-class-check" value="${c.id}" style="width:16px; height:16px; cursor:pointer;" />
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${c.color || 'var(--primary)'}; flex-shrink:0;"></span>
                    ${c.name}
                  </label>
                `).join('')}
              </div>
            </div>
            ` : ''}
            <div class="flex gap-sm">
              <button class="btn btn-primary flex-1" id="${modalId}-confirm">✨ 공유하기</button>
              <button class="btn btn-ghost" id="${modalId}-cancel">취소</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        document.getElementById(`${modalId}-close`).addEventListener('click', closeModal);
        document.getElementById(`${modalId}-cancel`).addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        document.getElementById(`${modalId}-confirm`).addEventListener('click', async () => {
          const selectedClassIds = [...document.querySelectorAll(`#${modalId} .share-class-check:checked`)]
            .map(cb => cb.value);
          closeModal();
          try {
            await toggleSharePresentation(presentationId, null, selectedClassIds);
            showToast(`✨ 공유 완료! (2P 획득)${selectedClassIds.length > 0 ? ` — ${selectedClassIds.length}개 클래스 추가 공유` : ''}`);
            const updated = await addStudentPoints(selectedStudent.id, 2);
            if (updated) selectedStudent = updated;
            studentPresentations = await getPresentationsByStudent(
              selectedStudent.id,
              selectedStudent.classId || classId,
            );
            render();
          } catch (err) {
            showToast('오류가 발생했습니다.', 'error');
          }
        });
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
          studentPresentations = await getPresentationsByStudent(
            selectedStudent.id,
            selectedStudent.classId || classId,
          );
          render();
        } catch (err) {
          console.error('Presentation delete error:', err);
          showToast('삭제 중 오류가 발생했습니다.', 'error');
        }
      });
    });
  }

  init();

  return function cleanup() {
    isActive = false;
    clipboardPasteQuizUnsubs.forEach((u) => u());
    clipboardPasteQuizUnsubs.length = 0;
    if (unsubscribeSubmissions) {
      unsubscribeSubmissions();
      unsubscribeSubmissions = null;
    }
    if (recordingReqId) {
      cancelAnimationFrame(recordingReqId);
      recordingReqId = null;
    }
    if (obsRecordingTimer) {
      clearInterval(obsRecordingTimer);
      obsRecordingTimer = null;
    }
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
  };
}
