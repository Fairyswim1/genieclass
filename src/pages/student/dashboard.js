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

    const cls = getClassById(student.classId);
    let activeView = 'dashboard'; // 'dashboard', 'assignment', 'solutions'
    let selectedAssignment = null;

    function render() {
        // Refresh student data
        const freshStudent = getStudentByCode(student.uniqueCode) || student;
        const config = getLevelConfig(freshStudent.characterLevel);
        const presentations = getPresentationsByStudent(freshStudent.id);
        const assignments = cls ? getAssignmentsByClass(cls.id) : [];
        const submissions = getSubmissionsByStudent(freshStudent.id);
        const announcements = cls ? getAnnouncementsByClass(cls.id) : [];

        if (activeView === 'assignment' && selectedAssignment) {
            renderAssignmentDetail(freshStudent, selectedAssignment);
            return;
        }

        if (activeView === 'solutions' && selectedAssignment) {
            renderSolutionsView(freshStudent, selectedAssignment);
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
            <!-- 내 기록 -->
            <div class="card student-section">
              <div class="student-section-header">
                <div class="student-section-icon" style="background:rgba(108,92,231,0.15);color:var(--primary-light)">🎤</div>
                <div class="student-section-title">내 기록</div>
              </div>
              <div class="record-list">
                ${presentations.length === 0 && freshStudent.praiseCount === 0 ? `
                  <div class="empty-state" style="padding:var(--space-lg)">
                    <div style="font-size:1.5rem;margin-bottom:var(--space-sm)">📝</div>
                    <div style="font-size:0.85rem">아직 기록이 없습니다</div>
                  </div>
                ` : `
                  ${freshStudent.praiseCount > 0 ? `
                    <div class="record-item">
                      <div class="record-item-left">
                        <div class="record-type-icon record-type-praise">⭐</div>
                        <div>
                          <div class="record-title">칭찬 ${freshStudent.praiseCount}회</div>
                          <div class="record-date">누적 기록</div>
                        </div>
                      </div>
                    </div>
                  ` : ''}
                  ${presentations.slice(-5).reverse().map(p => `
                    <div class="record-item">
                      <div class="record-item-left">
                        <div class="record-type-icon record-type-present">🎤</div>
                        <div>
                          <div class="record-title">발표 기록</div>
                          <div class="record-date">${formatDate(p.createdAt)}</div>
                        </div>
                      </div>
                      ${p.shared ? '<span class="badge badge-green">공유됨</span>' : ''}
                    </div>
                  `).join('')}
                `}
              </div>
            </div>

            <!-- 수업 과제 -->
            <div class="card student-section">
              <div class="student-section-header">
                <div class="student-section-icon" style="background:rgba(255,217,61,0.15);color:var(--gold)">📝</div>
                <div class="student-section-title">수업 과제</div>
              </div>
              ${assignments.length === 0 ? `
                <div class="empty-state" style="padding:var(--space-lg)">
                  <div style="font-size:1.5rem;margin-bottom:var(--space-sm)">📋</div>
                  <div style="font-size:0.85rem">과제가 없습니다</div>
                </div>
              ` : assignments.map(a => {
            const submitted = submissions.some(s => s.assignmentId === a.id);
            return `
                  <div class="assignment-card" data-assignment-id="${a.id}">
                    <div class="assignment-card-title">${a.title}</div>
                    <div class="assignment-card-status ${submitted ? 'status-submitted' : 'status-pending'}">
                      ${submitted ? '✅ 제출 완료' : '⏳ 미제출'}
                      ${a.dueDate ? ` · 마감: ${a.dueDate}` : ''}
                    </div>
                  </div>
                `;
        }).join('')}
            </div>

            <!-- 공유 게시판 -->
            <div class="card student-section">
              <div class="student-section-header">
                <div class="student-section-icon" style="background:rgba(107,203,119,0.15);color:var(--green)">👥</div>
                <div class="student-section-title">공유 게시판</div>
              </div>
              ${assignments.length === 0 ? `
                <div class="empty-state" style="padding:var(--space-lg)">
                  <div style="font-size:1.5rem;margin-bottom:var(--space-sm)">👥</div>
                  <div style="font-size:0.85rem">아직 공유된 풀이가 없습니다</div>
                </div>
              ` : assignments.map(a => {
            const shared = getSharedSubmissions(a.id);
            if (shared.length === 0) return '';
            return `
                  <div class="assignment-card solutions-link" data-assignment-id="${a.id}">
                    <div class="assignment-card-title">${a.title}</div>
                    <div class="assignment-card-status" style="color:var(--green)">
                      👥 ${shared.length}개의 풀이 공유됨
                    </div>
                  </div>
                `;
        }).join('') || `
                <div class="empty-state" style="padding:var(--space-lg)">
                  <div style="font-size:1.5rem;margin-bottom:var(--space-sm)">👥</div>
                  <div style="font-size:0.85rem">아직 공유된 풀이가 없습니다</div>
                </div>
              `}
            </div>

            <!-- 공지사항 & 파일 -->
            <div class="card student-section">
              <div class="student-section-header">
                <div class="student-section-icon" style="background:rgba(78,205,196,0.15);color:var(--blue)">📢</div>
                <div class="student-section-title">공지사항 & 파일</div>
              </div>
              ${announcements.length === 0 ? `
                <div class="empty-state" style="padding:var(--space-lg)">
                  <div style="font-size:1.5rem;margin-bottom:var(--space-sm)">📢</div>
                  <div style="font-size:0.85rem">공지사항이 없습니다</div>
                </div>
              ` : announcements.slice(0, 5).map(ann => `
                <div class="announcement-item">
                  <div class="announcement-title">${ann.title}</div>
                  <div class="announcement-date">${formatDate(ann.createdAt)}</div>
                  ${ann.content ? `<div class="announcement-content">${ann.content}</div>` : ''}
                  ${ann.files && ann.files.length > 0 ? `
                    <div class="announcement-files">
                      ${ann.files.map(f => `
                        <button class="announcement-file-btn download-file-btn" data-file-id="${f.id}">📥 ${f.name}</button>
                      `).join('')}
                    </div>
                  ` : ''}
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
            logoutStudent();
            window.location.hash = '/student/login';
        });

        // Assignment click
        document.querySelectorAll('.assignment-card[data-assignment-id]').forEach(card => {
            card.addEventListener('click', () => {
                const a = assignments.find(a => a.id === card.dataset.assignmentId);
                if (a) {
                    selectedAssignment = a;
                    activeView = 'assignment';
                    render();
                }
            });
        });

        // Solutions click
        document.querySelectorAll('.solutions-link').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const a = assignments.find(a => a.id === card.dataset.assignmentId);
                if (a) {
                    selectedAssignment = a;
                    activeView = 'solutions';
                    render();
                }
            });
        });

        // Download files
        document.querySelectorAll('.download-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                downloadFile(btn.dataset.fileId);
            });
        });
    }

    function renderAssignmentDetail(freshStudent, assignment) {
        const submissions = getSubmissionsByStudent(freshStudent.id);
        const mySubmission = submissions.find(s => s.assignmentId === assignment.id);

        // Recorder state
        let isRecording = false;
        let mediaRecorder = null;
        let audioChunks = [];
        let recordedAudioBlob = null;
        let recordingSeconds = 0;
        let recordingTimer = null;

        container.innerHTML = `
      <div class="student-layout">
        <div class="student-topbar">
          <div class="student-topbar-logo">
            <button class="btn btn-ghost btn-sm" id="btn-back-dashboard">← 대시보드</button>
          </div>
          <div class="student-topbar-title">${assignment.title}</div>
          <div></div>
        </div>

        <div class="student-dashboard animate-fade-in" style="max-width:800px;margin:0 auto">
          <div class="card" style="padding:var(--space-xl);margin-bottom:var(--space-lg)">
            <h2 style="font-weight:700;margin-bottom:var(--space-md)">${assignment.title}</h2>
            ${assignment.description ? `<p style="color:var(--text-secondary);line-height:1.6;white-space:pre-line;margin-bottom:var(--space-md)">${assignment.description}</p>` : ''}
            <div class="flex gap-md" style="font-size:0.85rem;color:var(--text-tertiary)">
              ${assignment.dueDate ? `<span>📅 마감: ${assignment.dueDate}</span>` : ''}
              <span>📌 ${formatDate(assignment.createdAt)}</span>
            </div>
            ${assignment.files && assignment.files.length > 0 ? `
              <div class="flex gap-sm" style="margin-top:var(--space-md);flex-wrap:wrap">
                ${assignment.files.map(f => `
                  <button class="announcement-file-btn download-file-btn" data-file-id="${f.id}">📥 ${f.name}</button>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="card" style="padding:var(--space-xl);margin-bottom:var(--space-lg)">
            <h3 style="font-weight:700;margin-bottom:var(--space-lg)">📤 풀이 제출</h3>

            ${mySubmission ? `
              <div class="badge badge-green" style="margin-bottom:var(--space-md)">✅ 이미 제출함 (${formatDate(mySubmission.createdAt)})</div>
            ` : ''}

            <div class="form-group">
              <label class="input-label">파일 첨부 (이미지, PDF)</label>
              <div class="file-attach-area" id="file-attach-area">
                <div style="font-size:2rem;margin-bottom:var(--space-sm)">📎</div>
                <div>파일을 드래그하거나 클릭하여 업로드</div>
                <div style="font-size:0.8rem;color:var(--text-tertiary);margin-top:var(--space-xs)">이미지, PDF 파일 지원</div>
                <input type="file" id="submit-files" accept="image/*,.pdf" multiple style="display:none" />
              </div>
              <div class="attached-files" id="attached-files-list"></div>
            </div>

            <div class="form-group">
              <label class="input-label">🎙 녹음 (구술면접 연습)</label>
              <div class="recorder-widget">
                <button class="recorder-btn recorder-btn-record" id="btn-record" type="button">
                  🎙
                </button>
                <span class="recorder-time" id="rec-time">00:00</span>
                <div class="recorder-waveform" id="rec-waveform"></div>
                <button class="recorder-btn recorder-btn-play hidden" id="btn-play-rec" type="button">▶</button>
              </div>
              <audio id="audio-playback" class="hidden"></audio>
            </div>

            <div class="form-group">
              <label class="flex items-center gap-sm" style="cursor:pointer">
                <input type="checkbox" id="share-submission" ${mySubmission?.shared ? 'checked' : ''} />
                <span style="font-size:0.9rem">👥 다른 친구들에게 풀이 공유하기</span>
              </label>
            </div>

            <button class="btn btn-primary btn-lg w-full" id="btn-submit-solution">
              ${mySubmission ? '풀이 다시 제출' : '풀이 제출'}
            </button>
          </div>

          <div style="text-align:center">
            <button class="btn btn-ghost" id="btn-view-solutions" data-assignment-id="${assignment.id}">
              👥 친구들의 풀이 보기
            </button>
          </div>
        </div>
      </div>
    `;

        // Events
        document.getElementById('btn-back-dashboard').addEventListener('click', () => {
            activeView = 'dashboard';
            selectedAssignment = null;
            render();
        });

        // File attach
        const fileArea = document.getElementById('file-attach-area');
        const fileInput = document.getElementById('submit-files');
        let attachedFiles = [];

        fileArea.addEventListener('click', () => fileInput.click());
        fileArea.addEventListener('dragover', (e) => { e.preventDefault(); fileArea.classList.add('drag-over'); });
        fileArea.addEventListener('dragleave', () => fileArea.classList.remove('drag-over'));
        fileArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileArea.classList.remove('drag-over');
            for (const f of e.dataTransfer.files) attachedFiles.push(f);
            updateFileList();
        });
        fileInput.addEventListener('change', () => {
            for (const f of fileInput.files) attachedFiles.push(f);
            updateFileList();
        });

        function updateFileList() {
            document.getElementById('attached-files-list').innerHTML = attachedFiles.map((f, i) =>
                `<div class="attached-file">
          📄 ${f.name}
          <span class="attached-file-remove" data-idx="${i}">✕</span>
        </div>`
            ).join('');
            document.querySelectorAll('.attached-file-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    attachedFiles.splice(parseInt(btn.dataset.idx), 1);
                    updateFileList();
                });
            });
        }

        // Recorder
        const recBtn = document.getElementById('btn-record');
        const recTime = document.getElementById('rec-time');
        const playBtn = document.getElementById('btn-play-rec');
        const audioEl = document.getElementById('audio-playback');

        recBtn.addEventListener('click', async () => {
            if (isRecording) {
                // Stop
                mediaRecorder.stop();
                isRecording = false;
                clearInterval(recordingTimer);
                recBtn.innerHTML = '🎙';
                recBtn.classList.remove('recording');
                showToast('녹음이 완료되었습니다!');
            } else {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];
                    recordingSeconds = 0;

                    mediaRecorder.ondataavailable = (e) => {
                        if (e.data.size > 0) audioChunks.push(e.data);
                    };

                    mediaRecorder.onstop = () => {
                        recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                        const url = URL.createObjectURL(recordedAudioBlob);
                        audioEl.src = url;
                        playBtn.classList.remove('hidden');
                        stream.getTracks().forEach(t => t.stop());
                    };

                    mediaRecorder.start();
                    isRecording = true;
                    recBtn.innerHTML = '⏹';
                    recBtn.classList.add('recording');

                    recordingTimer = setInterval(() => {
                        recordingSeconds++;
                        const m = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
                        const s = (recordingSeconds % 60).toString().padStart(2, '0');
                        recTime.textContent = `${m}:${s}`;
                    }, 1000);

                    showToast('녹음 시작! 🎙');
                } catch {
                    showToast('마이크 접근이 거부되었습니다.', 'error');
                }
            }
        });

        playBtn.addEventListener('click', () => {
            if (audioEl.paused) {
                audioEl.play();
                playBtn.innerHTML = '⏸';
            } else {
                audioEl.pause();
                playBtn.innerHTML = '▶';
            }
        });

        audioEl.addEventListener('ended', () => { playBtn.innerHTML = '▶'; });

        // Submit
        document.getElementById('btn-submit-solution').addEventListener('click', async () => {
            const files = [];
            for (const f of attachedFiles) {
                const saved = await saveFile(f);
                files.push({ id: saved.id, name: saved.name });
            }

            let audioData = null;
            if (recordedAudioBlob) {
                audioData = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(recordedAudioBlob);
                });
            }

            const shared = document.getElementById('share-submission').checked;
            submitAssignment(assignment.id, freshStudent.id, { files, audioData, shared });
            showToast('풀이가 제출되었습니다! ✅');
            render();
        });

        // View solutions
        document.getElementById('btn-view-solutions').addEventListener('click', () => {
            activeView = 'solutions';
            render();
        });

        // Download files
        document.querySelectorAll('.download-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                downloadFile(btn.dataset.fileId);
            });
        });
    }

    function renderSolutionsView(freshStudent, assignment) {
        const shared = getSharedSubmissions(assignment.id);

        container.innerHTML = `
      <div class="student-layout">
        <div class="student-topbar">
          <div class="student-topbar-logo">
            <button class="btn btn-ghost btn-sm" id="btn-back-assignment">← 돌아가기</button>
          </div>
          <div class="student-topbar-title">${assignment.title} - 공유 풀이</div>
          <div></div>
        </div>

        <div class="student-dashboard animate-fade-in" style="max-width:900px;margin:0 auto">
          <h2 style="font-weight:700;margin-bottom:var(--space-lg)">👥 친구들의 풀이 (${shared.length}개)</h2>
          ${shared.length === 0 ? `
            <div class="empty-state">
              <div class="empty-state-icon">👥</div>
              <div class="empty-state-text">아직 공유된 풀이가 없습니다</div>
            </div>
          ` : `
            <div class="solution-grid">
              ${shared.map(sub => {
            const author = getStudentById(sub.studentId);
            return `
                  <div class="solution-card card">
                    <div class="solution-preview">
                      ${sub.files && sub.files.length > 0 ? '📄' : sub.audioData ? '🎙' : '📝'}
                    </div>
                    <div class="solution-info">
                      <div class="solution-author">${author?.name || '알 수 없음'}</div>
                      <div class="solution-time">${formatDate(sub.createdAt)}</div>
                      ${sub.files ? `<div style="margin-top:4px">${sub.files.map(f =>
                `<button class="btn btn-ghost btn-sm download-file-btn" data-file-id="${f.id}" style="font-size:0.75rem;padding:2px 8px">📥 ${f.name}</button>`
            ).join('')}</div>` : ''}
                      ${sub.audioData ? `
                        <div style="margin-top:4px">
                          <button class="btn btn-ghost btn-sm play-audio-btn" data-audio="${sub.audioData}" style="font-size:0.75rem;padding:2px 8px">🎙 녹음 재생</button>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `;
        }).join('')}
            </div>
          `}
        </div>
        <audio id="shared-audio" class="hidden"></audio>
      </div>
    `;

        document.getElementById('btn-back-assignment').addEventListener('click', () => {
            activeView = 'assignment';
            render();
        });

        document.querySelectorAll('.download-file-btn').forEach(btn => {
            btn.addEventListener('click', () => downloadFile(btn.dataset.fileId));
        });

        document.querySelectorAll('.play-audio-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const audio = document.getElementById('shared-audio');
                audio.src = btn.dataset.audio;
                audio.play();
                showToast('오디오 재생 중 🎵');
            });
        });
    }

    render();
}
