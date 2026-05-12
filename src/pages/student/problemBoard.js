// ========================================
// 학생 — 한 문제 풀이 화이트보드 (수업 발표판과 동일 UX)
// ========================================
import { getStroke } from 'perfect-freehand';
import { Capacitor } from '@capacitor/core';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import {
  getCurrentStudent,
  getProblemPromptById,
  addPresentation,
  saveFile,
  showToast,
} from '../../store.js';
import { escapeHtml } from '../../utils/quizMath.js';

export function renderStudentProblemBoard(container, params) {
  const student = getCurrentStudent();
  if (!student) {
    window.location.hash = '/student/login';
    return;
  }

  const promptId = params.promptId;
  let problemPrompt = null;

  let wbCanvas; let wbCtx;
  let drawing = false;
  let penColor = '#FFFFFF';
  let penSize = 2;
  let currentTool = 'pen';
  let isRecording = false;
  let mediaRecorder = null;
  let mediaChunks = [];
  let recordedBlob = null;
  let recordingCanvas = null;
  let recordingCtx = null;
  let recordingReqId = null;
  let recordingMode = null;

  function renderBoardShell() {
    const head = escapeHtml(problemPrompt?.title || '한 문제 풀이');
    container.innerHTML = `
      <div class="whiteboard-container page-enter" style="background: var(--bg-deep);">
        <div class="whiteboard-toolbar card" style="border-radius: 0; border-top: 0; border-left: 0; border-right: 0;">
          <button class="btn btn-ghost btn-sm" id="wb-back">← 대시보드</button>
          <div style="flex:1; text-align:center; font-weight:800; font-size:0.92rem; color: var(--primary-light); padding:0 6px;">
            ✏️ ${head}
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
            ${isRecording ? '⏹ 중지' : '📽️ 풀이 녹화'}
          </button>
          <button class="btn btn-secondary btn-sm" id="wb-save">💾 풀이 저장</button>
        </div>
        <div class="whiteboard-canvas-wrap" style="background: #000; position: relative;">
          <canvas id="whiteboard-canvas" style="position: absolute; top: 0; left: 0; z-index: 1; touch-action: none;"></canvas>
          <canvas id="whiteboard-draft" style="position: absolute; top: 0; left: 0; z-index: 2; pointer-events: none; touch-action: none;"></canvas>
        </div>
      </div>
    `;
  }

  function initWhiteboard() {
    wbCanvas = document.getElementById('whiteboard-canvas');
    wbCtx = wbCanvas.getContext('2d');
    const draftCanvas = document.getElementById('whiteboard-draft');
    const draftCtx = draftCanvas.getContext('2d');

    wbCanvas.style.touchAction = 'none';
    wbCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const wrap = wbCanvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    function setSize() {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      wbCanvas.width = w * dpr;
      wbCanvas.height = h * dpr;
      wbCanvas.style.width = `${w}px`;
      wbCanvas.style.height = `${h}px`;

      draftCanvas.width = w * dpr;
      draftCanvas.height = h * dpr;
      draftCanvas.style.width = `${w}px`;
      draftCanvas.style.height = `${h}px`;

      wbCtx.setTransform(1, 0, 0, 1, 0, 0);
      draftCtx.setTransform(1, 0, 0, 1, 0, 0);
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
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const startDrawing = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drawing = true;
      const pos = getPos(e);
      const pressure = e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5;
      currentPoints = [[pos.x, pos.y, pressure]];
      try { wbCanvas.setPointerCapture(e.pointerId); } catch (_) {}
    };

    const moveDrawing = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!drawing) return;
      let events;
      try { events = e.getCoalescedEvents ? e.getCoalescedEvents() : null; } catch (_) { events = null; }
      if (!events || events.length === 0) events = [e];
      for (const ev of events) {
        const pos = getPos(ev);
        const pressure = ev.pointerType === 'pen' && ev.pressure ? ev.pressure : 0.5;
        currentPoints.push([pos.x, pos.y, pressure]);
      }
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
        return;
      }

      const strokeSize = penSize * 2.5;
      const strokePolygon = getStroke(currentPoints, {
        size: strokeSize,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: currentPoints[0][2] === 0.5,
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
      try { wbCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    wbCanvas.addEventListener('pointerdown', startDrawing);
    wbCanvas.addEventListener('pointermove', moveDrawing);
    wbCanvas.addEventListener('pointerup', stopDrawing);
    wbCanvas.addEventListener('pointercancel', stopDrawing);

    const getTouchPos = (touch) => {
      const rect = wbCanvas.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    wbCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (drawing) return;
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
          simulatePressure: true,
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
    wbCanvas.addEventListener('touchcancel', () => {
      drawing = false;
      currentPoints = [];
    }, { passive: false });
  }

  function bindWhiteboardEvents() {
    document.getElementById('wb-back')?.addEventListener('click', () => {
      if (isRecording) {
        if (!confirm('녹음 중입니다. 나가면 녹음이 중지됩니다. 나갈까요?')) return;
      }
      window.location.hash = '/student/dashboard';
    });

    document.querySelectorAll('.whiteboard-tool').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tool === 'clear') {
          if (confirm('전체 필기를 지우시겠습니까?')) {
            wbCtx.fillStyle = '#000';
            const wrap = wbCanvas.parentElement;
            wbCtx.fillRect(0, 0, wrap.clientWidth, wrap.clientHeight);
          }
          return;
        }
        currentTool = btn.dataset.tool;
        updateWhiteboardUI();
      });
    });

    document.querySelectorAll('.color-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        penColor = dot.dataset.color;
        currentTool = 'pen';
        document.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        updateWhiteboardUI();
      });
    });

    document.getElementById('pen-size-slider')?.addEventListener('input', (e) => {
      penSize = parseInt(e.target.value, 10);
    });

    document.getElementById('wb-record')?.addEventListener('click', handleRecordToggle);
    document.getElementById('wb-save')?.addEventListener('click', handleSaveProblem);
  }

  function renderRecordingFrame() {
    if (!isRecording || !recordingCtx) return;
    const draftCanvas = document.getElementById('whiteboard-draft');
    if (!draftCanvas) return;
    recordingCtx.save();
    recordingCtx.setTransform(1, 0, 0, 1, 0, 0);
    recordingCtx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    recordingCtx.restore();
    recordingCtx.drawImage(wbCanvas, 0, 0);
    recordingCtx.drawImage(draftCanvas, 0, 0);
    recordingReqId = requestAnimationFrame(renderRecordingFrame);
  }

  async function handleRecordToggle() {
    if (!isRecording) {
      mediaChunks = [];
      recordedBlob = null;
      recordingMode = null;

      try {
        const isNativeMode = Capacitor.isNativePlatform?.();

        if (isNativeMode) {
          try {
            const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
            if (!permStatus.value) {
              showToast('마이크 권한이 차단되었습니다.', 'error');
              return;
            }
          } catch (e) {
            console.warn('[풀이 녹음] 권한:', e);
          }
        }

        const hasMD = !!(navigator.mediaDevices?.getUserMedia);
        const hasMR = typeof MediaRecorder !== 'undefined';

        if (hasMD && hasMR) {
          if (isNativeMode) {
            try {
              const rawAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
              const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
              mediaRecorder = new MediaRecorder(rawAudioStream, mime ? { mimeType: mime } : undefined);
              recordingMode = 'audio';
            } catch (e) {
              console.warn('[풀이 녹음] 네이티브 오디오 MR 실패:', e);
            }
          } else {
            try {
              const rawAudioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                  channelCount: 1,
                  sampleRate: 44100,
                },
              });
              let audioStream = rawAudioStream;
              try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                const audioContext = new Ctx();
                const source = audioContext.createMediaStreamSource(rawAudioStream);
                const gainNode = audioContext.createGain();
                gainNode.gain.value = 3.0;
                const dest = audioContext.createMediaStreamDestination();
                source.connect(gainNode);
                gainNode.connect(dest);
                audioStream = dest.stream;
              } catch (_) {}

              recordingCanvas = document.createElement('canvas');
              const MAX_W = 1280; const MAX_H = 720;
              let ratio = 1;
              if (wbCanvas.width > MAX_W || wbCanvas.height > MAX_H) {
                ratio = Math.min(MAX_W / wbCanvas.width, MAX_H / wbCanvas.height);
              }
              recordingCanvas.width = Math.floor(wbCanvas.width * ratio);
              recordingCanvas.height = Math.floor(wbCanvas.height * ratio);
              recordingCtx = recordingCanvas.getContext('2d');
              recordingCtx.scale(ratio, ratio);

              if (typeof recordingCanvas.captureStream === 'function') {
                const canvasStream = recordingCanvas.captureStream(30);
                const combined = new MediaStream([
                  ...canvasStream.getVideoTracks(),
                  ...audioStream.getAudioTracks(),
                ]);
                const vMime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
                  .find((m) => MediaRecorder.isTypeSupported(m)) || '';
                mediaRecorder = new MediaRecorder(combined, vMime ? { mimeType: vMime } : undefined);
                recordingMode = 'video';
              } else {
                mediaRecorder = new MediaRecorder(audioStream);
                recordingMode = 'audio';
              }
            } catch (e) {
              console.error('[풀이 녹음] 웹 초기화 실패:', e);
            }
          }
        }

        if (!mediaRecorder && Capacitor.isNativePlatform?.()) {
          try {
            const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
            if (!permStatus.value) {
              showToast('마이크 권한이 차단되었습니다.', 'error');
              return;
            }
            await VoiceRecorder.startRecording();
            recordingMode = 'audio';
            isRecording = true;
            updateWhiteboardUI();
            showToast('🎙 음성 녹음을 시작합니다.');
            return;
          } catch (e) {
            showToast('녹음을 시작할 수 없습니다.', 'error');
            return;
          }
        }

        if (mediaRecorder) {
          mediaRecorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) mediaChunks.push(ev.data);
          };
          mediaRecorder.onstop = () => {
            const blobType = mediaRecorder.mimeType || (recordingMode === 'video' ? 'video/webm' : 'audio/webm');
            recordedBlob = new Blob(mediaChunks, { type: blobType });
          };
          try {
            mediaRecorder.start(200);
          } catch (startErr) {
            console.error('[풀이 녹음] start 실패:', startErr);
            try { mediaRecorder.stream?.getTracks()?.forEach((t) => t.stop()); } catch (_) {}
            mediaRecorder = null;
            if (Capacitor.isNativePlatform?.()) {
              try {
                await VoiceRecorder.requestAudioRecordingPermission();
                await VoiceRecorder.startRecording();
                recordingMode = 'audio';
                isRecording = true;
                updateWhiteboardUI();
                showToast('🎙 음성 녹음을 시작합니다.');
                return;
              } catch (_) {
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
            showToast('📹 보드+음성 녹화를 시작합니다.');
          } else {
            showToast('🎙 오디오 녹음을 시작합니다.');
          }
          updateWhiteboardUI();
        } else {
          showToast('이 기기에서는 녹음을 시작할 수 없습니다.', 'error');
        }
      } catch (err) {
        console.error('[풀이 녹음]', err);
        showToast(`녹음 오류: ${err.message}`, 'error');
      }
    } else {
      if (recordingReqId) {
        cancelAnimationFrame(recordingReqId);
        recordingReqId = null;
      }

      if (Capacitor.isNativePlatform?.() && !mediaRecorder) {
        try {
          const result = await VoiceRecorder.stopRecording();
          const { mimeType, recordDataBase64 } = result.value;
          const bin = atob(recordDataBase64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          recordedBlob = new Blob([arr], { type: mimeType });
          isRecording = false;
          updateWhiteboardUI();
          showToast('⏹ 녹음을 중지했습니다.');
          return;
        } catch (e) {
          showToast('녹음 중지 오류', 'error');
        }
      }

      if (mediaRecorder) {
        try {
          mediaRecorder.stop();
          mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        } catch (e) {
          console.error(e);
        }
      }
      isRecording = false;
      updateWhiteboardUI();
      showToast('⏹ 녹음을 중지했습니다.');
    }
  }

  async function handleSaveProblem() {
    if (isRecording) {
      showToast('녹음을 먼저 중지한 뒤 저장해 주세요.', 'error');
      return;
    }
    if (!problemPrompt) return;

    showToast('💾 풀이 저장 중…', 'info');
    try {
      const canvasBlob = await new Promise((resolve) => wbCanvas.toBlob(resolve, 'image/png'));
      if (!canvasBlob) throw new Error('캔버스 캡처 실패');
      const imageFile = new File([canvasBlob], `problem_wb_${Date.now()}.png`, { type: 'image/png' });
      const savedImage = await saveFile(imageFile);

      let savedMedia = null;
      if (recordedBlob && recordedBlob.size > 0) {
        const isVideo = recordingMode === 'video';
        const type = recordedBlob.type;
        let ext = 'webm';
        if (type.includes('mp4')) ext = 'mp4';
        else if (type.includes('wav')) ext = 'wav';
        else if (type.includes('m4a')) ext = 'm4a';
        const fileName = `${isVideo ? 'video' : 'audio'}_${Date.now()}.${ext}`;
        savedMedia = await saveFile(new File([recordedBlob], fileName, { type }));
      }

      await addPresentation(student.id, student.classId, {
        whiteboardImage: savedImage,
        audioData: savedMedia,
        recordingMode,
        type: 'problem_solution',
        problemPromptId: problemPrompt.id,
        title: problemPrompt.title || '한 문제 풀이',
        studentName: student.name,
      });

      showToast('✨ 풀이가 저장되었습니다!');
      window.location.hash = '/student/dashboard';
    } catch (err) {
      console.error(err);
      showToast(`저장 실패: ${err.message}`, 'error');
    }
  }

  function updateWhiteboardUI() {
    const recordBtn = document.getElementById('wb-record');
    if (recordBtn) {
      recordBtn.innerHTML = isRecording ? '⏹ 중지' : '📽️ 풀이 녹화';
      recordBtn.className = `btn ${isRecording ? 'btn-danger' : 'btn-primary'} btn-sm`;
    }
    document.querySelectorAll('.whiteboard-tool').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === currentTool);
    });
  }

  async function init() {
    problemPrompt = await getProblemPromptById(promptId);
    if (!problemPrompt || problemPrompt.classId !== student.classId) {
      showToast('문제를 찾을 수 없습니다.', 'error');
      window.location.hash = '/student/dashboard';
      return;
    }
    renderBoardShell();
    initWhiteboard();
    bindWhiteboardEvents();
  }

  void init();
}
