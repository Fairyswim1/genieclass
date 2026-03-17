// ========================================
// Teacher Lesson Mode
// ========================================
import {
  getCurrentTeacher, getClassById, getStudentsByClass,
  praiseStudent, showToast, getStudentById, addPresentation
} from '../../store.js';
import { renderCharacter, getLevelConfig, renderPraiseAnimation } from '../../components/characterAvatar.js';

export function renderLessonMode(container, params) {
  const teacher = getCurrentTeacher();
  if (!teacher) { window.location.hash = '/teacher/login'; return; }

  const classId = params.id;
  const cls = getClassById(classId);
  if (!cls) { window.location.hash = '/teacher/dashboard'; return; }

  let selectedStudent = null;
  let isWhiteboard = false;

  // Whiteboard state
  let wbCanvas, wbCtx;
  let drawing = false;
  let penColor = '#FFFFFF';
  let penSize = 3;
  let currentTool = 'pen';

  // Recorder state
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedAudioBlob = null;
  let isRecording = false;
  let recordingTimer = null;
  let recordingSeconds = 0;

  function render() {
    const students = getStudentsByClass(classId);

    if (isWhiteboard && selectedStudent) {
      renderWhiteboardMode(students);
      return;
    }

    container.innerHTML = `
      <div class="teacher-layout">
        <main class="main-content" style="margin-left:0">
          <div class="lesson-header">
            <div class="flex items-center gap-md">
              <button class="btn btn-ghost" id="btn-back-dashboard">← 대시보드</button>
              <h2 style="font-weight:700">${cls.name}</h2>
              <span class="badge badge-primary">수업 모드</span>
            </div>
            <div class="flex items-center gap-sm">
              <span style="color:var(--text-secondary);font-size:0.85rem">학생 ${students.length}명</span>
            </div>
          </div>

          <div class="student-grid stagger-children" id="student-grid">
            ${students.map(s => {
      const config = getLevelConfig(s.characterLevel);
      return `
                <div class="student-avatar-card ${selectedStudent?.id === s.id ? 'selected' : ''}" data-student-id="${s.id}">
                  <div class="student-character">
                    ${renderCharacter(s.characterLevel, 80)}
                  </div>
                  <div class="student-name">${s.name}</div>
                  <div class="student-praise-count">⭐ ${s.praiseCount} · ${config.name}</div>
                </div>
              `;
    }).join('')}
            ${students.length === 0 ? `
              <div class="empty-state" style="grid-column:1/-1">
                <div class="empty-state-icon">👤</div>
                <div class="empty-state-text">학생이 없습니다. 대시보드에서 학생을 추가해주세요.</div>
              </div>
            ` : ''}
          </div>
        </main>

        <!-- Student Action Panel -->
        <div class="student-action-panel ${selectedStudent ? 'open' : ''}" id="action-panel">
          ${selectedStudent ? renderActionPanel(selectedStudent) : ''}
        </div>
      </div>
    `;

    bindLessonEvents(students);
  }

  function renderActionPanel(student) {
    const config = getLevelConfig(student.characterLevel);
    return `
      <div class="action-panel-header">
        <h3 style="font-weight:700">${student.name}</h3>
        <button class="modal-close" id="close-action-panel">✕</button>
      </div>
      <div class="action-panel-body">
        <div class="text-center" style="margin-bottom:var(--space-lg)">
          <div style="margin:0 auto;width:100px;height:100px">
            ${renderCharacter(student.characterLevel, 100)}
          </div>
          <div style="margin-top:var(--space-sm);color:var(--text-secondary);font-size:0.85rem">
            ${config.emoji} ${config.name} · Lv.${student.characterLevel}
          </div>
          <div style="margin-top:var(--space-xs)">
            <span class="badge badge-gold">⭐ 칭찬 ${student.praiseCount}회</span>
            <span class="badge badge-primary" style="margin-left:4px">포인트 ${student.totalPoints}</span>
          </div>
        </div>
        <div class="action-buttons">
          <div class="action-btn action-btn-praise" id="btn-praise">
            <span class="action-btn-icon">⭐</span>
            <span class="action-btn-label">칭찬하기</span>
          </div>
          <div class="action-btn action-btn-present" id="btn-present">
            <span class="action-btn-icon">🎤</span>
            <span class="action-btn-label">발표</span>
          </div>
        </div>
      </div>
    `;
  }

  function bindLessonEvents(students) {
    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => {
      window.location.hash = '/teacher/dashboard';
    });

    // Student card click
    document.querySelectorAll('.student-avatar-card').forEach(card => {
      card.addEventListener('click', () => {
        const studentId = card.dataset.studentId;
        selectedStudent = students.find(s => s.id === studentId);
        render();
      });
    });

    // Close action panel
    document.getElementById('close-action-panel')?.addEventListener('click', () => {
      selectedStudent = null;
      render();
    });

    // Praise button
    document.getElementById('btn-praise')?.addEventListener('click', () => {
      if (!selectedStudent) return;
      const updated = praiseStudent(selectedStudent.id);
      if (updated) {
        selectedStudent = updated;
        showToast(`${updated.name}에게 칭찬을 보냈습니다! ⭐`);

        // Play animation on the card
        const card = document.querySelector(`.student-avatar-card[data-student-id="${updated.id}"]`);
        if (card) renderPraiseAnimation(card);

        setTimeout(() => render(), 600);
      }
    });

    // Present button
    document.getElementById('btn-present')?.addEventListener('click', () => {
      if (!selectedStudent) return;
      isWhiteboard = true;
      render();
    });
  }

  function renderWhiteboardMode() {
    container.innerHTML = `
      <div class="whiteboard-container">
        <div class="whiteboard-toolbar">
          <button class="btn btn-ghost btn-sm" id="wb-back">← 돌아가기</button>
          <div style="flex:1;text-align:center;font-weight:600">
            ${selectedStudent.name}의 발표
          </div>
          <div class="whiteboard-tools">
            <button class="whiteboard-tool active" data-tool="pen" title="펜">✏️</button>
            <button class="whiteboard-tool" data-tool="eraser" title="지우개">🧹</button>
            <button class="whiteboard-tool" data-tool="clear" title="전체 지우기">🗑️</button>
          </div>
          <div class="color-picker-group">
            <div class="color-dot active" data-color="#FFFFFF" style="background:#FFFFFF"></div>
            <div class="color-dot" data-color="#FF6B6B" style="background:#FF6B6B"></div>
            <div class="color-dot" data-color="#FFD93D" style="background:#FFD93D"></div>
            <div class="color-dot" data-color="#6BCB77" style="background:#6BCB77"></div>
            <div class="color-dot" data-color="#6C5CE7" style="background:#6C5CE7"></div>
            <div class="color-dot" data-color="#4ECDC4" style="background:#4ECDC4"></div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <label style="font-size:0.8rem;color:var(--text-secondary)">굵기</label>
            <input type="range" id="pen-size" min="1" max="20" value="3" style="width:80px" />
          </div>
          <div class="recorder-controls">
            <button class="btn ${isRecording ? 'btn-danger' : 'btn-ghost'} btn-sm" id="wb-record">
              ${isRecording ? '⏹ 녹음 중지' : '🎙 녹음 시작'}
            </button>
            <span id="rec-timer" class="${isRecording ? '' : 'hidden'}" style="color:var(--red);font-size:0.85rem;font-weight:600">
              <span class="rec-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red);margin-right:4px"></span>
              ${formatRecTime(recordingSeconds)}
            </span>
          </div>
          <button class="btn btn-primary btn-sm" id="wb-save">💾 저장</button>
          <button class="btn btn-gold btn-sm" id="wb-share">📤 공유</button>
        </div>
        <div class="whiteboard-canvas-wrap">
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

    wbCtx.fillStyle = '#1A1230';
    wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
    wbCtx.lineCap = 'round';
    wbCtx.lineJoin = 'round';

    // Mouse events
    wbCanvas.addEventListener('mousedown', startDraw);
    wbCanvas.addEventListener('mousemove', draw);
    wbCanvas.addEventListener('mouseup', endDraw);
    wbCanvas.addEventListener('mouseleave', endDraw);

    // Touch events
    wbCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(getTouchPos(e)); });
    wbCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(getTouchPos(e)); });
    wbCanvas.addEventListener('touchend', (e) => { e.preventDefault(); endDraw(); });

    // Resize
    window.addEventListener('resize', () => {
      const imgData = wbCtx.getImageData(0, 0, wbCanvas.width, wbCanvas.height);
      wbCanvas.width = wrap.clientWidth;
      wbCanvas.height = wrap.clientHeight;
      wbCtx.putImageData(imgData, 0, 0);
    });
  }

  function getTouchPos(e) {
    const rect = wbCanvas.getBoundingClientRect();
    const touch = e.touches[0];
    return {
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
    };
  }

  function startDraw(e) {
    drawing = true;
    wbCtx.beginPath();
    wbCtx.moveTo(e.offsetX, e.offsetY);
  }

  function draw(e) {
    if (!drawing) return;
    wbCtx.strokeStyle = currentTool === 'eraser' ? '#1A1230' : penColor;
    wbCtx.lineWidth = currentTool === 'eraser' ? penSize * 5 : penSize;
    wbCtx.lineTo(e.offsetX, e.offsetY);
    wbCtx.stroke();
  }

  function endDraw() {
    drawing = false;
    wbCtx.closePath();
  }

  function bindWhiteboardEvents() {
    document.getElementById('wb-back').addEventListener('click', () => {
      if (isRecording) stopRecording();
      isWhiteboard = false;
      render();
    });

    // Tools
    document.querySelectorAll('.whiteboard-tool').forEach(tool => {
      tool.addEventListener('click', () => {
        const t = tool.dataset.tool;
        if (t === 'clear') {
          wbCtx.fillStyle = '#1A1230';
          wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
          return;
        }
        currentTool = t;
        document.querySelectorAll('.whiteboard-tool').forEach(tt => tt.classList.remove('active'));
        tool.classList.add('active');
      });
    });

    // Colors
    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        penColor = dot.dataset.color;
        currentTool = 'pen';
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        document.querySelectorAll('.whiteboard-tool').forEach(t => {
          t.classList.toggle('active', t.dataset.tool === 'pen');
        });
      });
    });

    // Pen size
    document.getElementById('pen-size').addEventListener('input', (e) => {
      penSize = parseInt(e.target.value);
    });

    // Record
    document.getElementById('wb-record').addEventListener('click', () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    // Save
    document.getElementById('wb-save').addEventListener('click', () => {
      savePresentation(false);
    });

    // Share
    document.getElementById('wb-share').addEventListener('click', () => {
      savePresentation(true);
    });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      recordingSeconds = 0;

      const recBtn = document.getElementById('wb-record');
      const timerEl = document.getElementById('rec-timer');
      if (recBtn) {
        recBtn.classList.remove('btn-ghost');
        recBtn.classList.add('btn-danger');
        recBtn.innerHTML = '⏹ 녹음 중지';
      }
      if (timerEl) timerEl.classList.remove('hidden');

      recordingTimer = setInterval(() => {
        recordingSeconds++;
        const timerWrap = document.getElementById('rec-timer');
        if (timerWrap) {
          timerWrap.innerHTML = `<span class="rec-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red);margin-right:4px;animation:pulse 1s infinite"></span>${formatRecTime(recordingSeconds)}`;
        }
      }, 1000);

      showToast('녹음이 시작되었습니다 🎙');
    } catch (err) {
      console.error('Mic error:', err);
      showToast('마이크를 시작할 수 없습니다. 권한 설정을 확인해주세요.', 'error');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    clearInterval(recordingTimer);

    const recBtn = document.getElementById('wb-record');
    const timerEl = document.getElementById('rec-timer');
    if (recBtn) {
      recBtn.classList.remove('btn-danger');
      recBtn.classList.add('btn-ghost');
      recBtn.innerHTML = '🎙 녹음 시작';
    }
    if (timerEl) timerEl.classList.add('hidden');

    showToast('녹음이 중지되었습니다. 💾 저장 시 함께 저장됩니다.');
  }

  function savePresentation(shared) {
    if (!selectedStudent) return;

    const whiteboardImage = wbCanvas ? wbCanvas.toDataURL('image/png') : null;

    let audioData = null;
    if (recordedAudioBlob) {
      const reader = new FileReader();
      reader.onload = () => {
        audioData = reader.result;
        const pres = addPresentation(selectedStudent.id, classId, {
          whiteboardImage,
          audioData,
        });
        if (shared) {
          import('../../store.js').then(store => {
            store.toggleSharePresentation(pres.id);
            showToast(`${selectedStudent.name}의 발표가 저장 및 공유되었습니다! 📤`);
          });
        } else {
          showToast(`${selectedStudent.name}의 발표가 저장되었습니다! 💾`);
        }
      };
      reader.readAsDataURL(recordedAudioBlob);
    } else {
      const pres = addPresentation(selectedStudent.id, classId, {
        whiteboardImage,
        audioData: null,
      });
      if (shared) {
        import('../../store.js').then(store => {
          store.toggleSharePresentation(pres.id);
          showToast(`${selectedStudent.name}의 발표가 저장 및 공유되었습니다! 📤`);
        });
      } else {
        showToast(`${selectedStudent.name}의 발표가 저장되었습니다! 💾`);
      }
    }
  }

  function formatRecTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  render();
}
