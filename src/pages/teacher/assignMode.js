// ========================================
// Teacher Assignment Mode
// ========================================
import {
  getCurrentTeacher, getClassById, getStudentsByClass,
  createAssignment, getAssignmentsByClass, deleteAssignment,
  createAnnouncement, getAnnouncementsByClass, deleteAnnouncement,
  getSubmissionsByAssignment, saveFile, showToast, formatDate,
  getStudentById
} from '../../store.js';

export function renderAssignMode(container, params) {
  const teacher = getCurrentTeacher();
  if (!teacher) { window.location.hash = '/teacher/login'; return; }

  const classId = params.id;
  let cls = null;
  let activeTab = 'announcements';

  async function init() {
    cls = await getClassById(classId);
    if (!cls) { window.location.hash = '/teacher/dashboard'; return; }
    await render();
  }

  async function render() {
    const assignments = await getAssignmentsByClass(classId);
    const announcements = await getAnnouncementsByClass(classId);
    const students = await getStudentsByClass(classId);

    container.innerHTML = `
      <div class="teacher-layout">
        <main class="main-content" style="margin-left:0">
          <div class="lesson-header">
            <div class="flex items-center gap-md">
              <button class="btn btn-ghost" id="btn-back-dashboard">← 대시보드</button>
              <h2 style="font-weight:700">${cls.name}</h2>
              <span class="badge badge-green">과제 모드</span>
            </div>
          </div>

          <div class="assign-container">
            <div class="tabs">
              <div class="tab ${activeTab === 'announcements' ? 'active' : ''}" data-tab="announcements">📢 공지사항</div>
              <div class="tab ${activeTab === 'assignments' ? 'active' : ''}" data-tab="assignments">📝 과제</div>
              <div class="tab ${activeTab === 'files' ? 'active' : ''}" data-tab="files">📁 자료</div>
            </div>

            <!-- 공지사항 -->
            <div id="tab-announcements" class="${activeTab !== 'announcements' ? 'hidden' : ''}">
              <div class="section-header">
                <h3 class="section-title">공지사항</h3>
                <button class="btn btn-primary btn-sm" id="btn-new-announcement">+ 새 공지</button>
              </div>
              <div id="announcement-form" class="hidden" style="margin-bottom:var(--space-lg)">
                <div class="card" style="padding:var(--space-lg)">
                  <div class="form-group">
                    <label class="input-label">제목</label>
                    <input type="text" class="input-field" id="ann-title" placeholder="공지 제목" autocomplete="off" />
                  </div>
                  <div class="form-group">
                    <label class="input-label">내용</label>
                    <textarea class="input-field" id="ann-content" rows="4" placeholder="공지 내용을 입력하세요" style="resize:vertical"></textarea>
                  </div>
                  <div class="form-group">
                    <label class="input-label">파일 첨부</label>
                    <input type="file" id="ann-files" multiple style="color:var(--text-secondary)" />
                  </div>
                  <div class="flex gap-sm">
                    <button class="btn btn-primary btn-sm" id="btn-submit-announcement">게시</button>
                    <button class="btn btn-ghost btn-sm" id="btn-cancel-announcement">취소</button>
                  </div>
                </div>
              </div>
              ${announcements.length === 0 ? `
                <div class="empty-state">
                  <div class="empty-state-icon">📢</div>
                  <div class="empty-state-text">공지사항이 없습니다</div>
                </div>
              ` : announcements.map(ann => `
                <div class="assign-item">
                  <div class="flex justify-between items-center">
                    <div class="assign-item-title">${ann.title}</div>
                    <button class="btn btn-ghost btn-sm delete-ann-btn" data-id="${ann.id}" style="color:var(--red);font-size:0.75rem">삭제</button>
                  </div>
                  <div class="assign-item-meta" style="margin-bottom:var(--space-sm)">
                    <span>${formatDate(ann.createdAt)}</span>
                  </div>
                  <div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;white-space:pre-line">${ann.content}</div>
                  ${ann.files && ann.files.length > 0 ? `
                    <div class="file-attachments" style="margin-top:var(--space-sm)">
                      ${ann.files.map(f => `
                        <div class="file-item" style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-body);padding:2px 8px;border-radius:4px;font-size:0.75rem;margin-right:4px;cursor:pointer" onclick="window.downloadFile('${f.id}')">
                          📁 ${f.name}
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>

            <!-- 과제 -->
            <div id="tab-assignments" class="${activeTab !== 'assignments' ? 'hidden' : ''}">
              <div class="section-header">
                <h3 class="section-title">과제</h3>
                <button class="btn btn-primary btn-sm" id="btn-new-assignment">+ 새 과제</button>
              </div>
              <div id="assignment-form" class="hidden" style="margin-bottom:var(--space-lg)">
                <div class="card" style="padding:var(--space-lg)">
                  <div class="form-group">
                    <label class="input-label">과제 제목</label>
                    <input type="text" class="input-field" id="assign-title" placeholder="과제 제목" autocomplete="off" />
                  </div>
                  <div class="form-group">
                    <label class="input-label">과제 설명</label>
                    <textarea class="input-field" id="assign-desc" rows="3" placeholder="과제 설명을 입력하세요" style="resize:vertical"></textarea>
                  </div>
                  <div class="form-group">
                    <label class="input-label">마감일</label>
                    <input type="date" class="input-field" id="assign-due" />
                  </div>
                  <div class="form-group">
                    <label class="input-label">첨부파일</label>
                    <input type="file" id="assign-files" multiple style="color:var(--text-secondary)" />
                  </div>
                  <div class="flex gap-sm">
                    <button class="btn btn-primary btn-sm" id="btn-submit-assignment">과제 생성</button>
                    <button class="btn btn-ghost btn-sm" id="btn-cancel-assignment">취소</button>
                  </div>
                </div>
              </div>
              ${(await Promise.all(assignments.map(async a => {
      const subs = await getSubmissionsByAssignment(a.id);
      return `
                  <div class="assign-item">
                    <div class="flex justify-between items-center">
                      <div class="assign-item-title">${a.title}</div>
                      <button class="btn btn-ghost btn-sm delete-assign-btn" data-id="${a.id}" style="color:var(--red);font-size:0.75rem">삭제</button>
                    </div>
                    <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:var(--space-sm);white-space:pre-line">${a.description}</div>
                    <div class="assign-item-meta">
                      <span>📅 ${a.dueDate || '마감일 없음'}</span>
                      <span>✅ 제출 ${subs.length}/${students.length}명</span>
                      <span>${formatDate(a.createdAt)}</span>
                    </div>
                    ${subs.length > 0 ? `
                      <div style="margin-top:var(--space-md)">
                        <div style="font-size:0.8rem;color:var(--text-tertiary);margin-bottom:var(--space-xs)">제출한 학생:</div>
                        <div class="flex gap-sm" style="flex-wrap:wrap">
                          ${(await Promise.all(subs.map(async s => {
        const student = await getStudentById(s.studentId);
        return student ? `<span class="badge badge-green">${student.name}</span>` : '';
      }))).join('')}
                        </div>
                      </div>
                    ` : ''}
                  </div>
                `;
    }))).join('')}
            </div>

            <!-- 자료 -->
            <div id="tab-files" class="${activeTab !== 'files' ? 'hidden' : ''}">
              <div class="section-header">
                <h3 class="section-title">수업 자료</h3>
              </div>
              <div class="empty-state">
                <div class="empty-state-icon">📁</div>
                <div class="empty-state-text">공지사항에 첨부된 파일이 여기에 표시됩니다</div>
              </div>
            </div>
          </div>
        </main>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => {
      window.location.hash = '/teacher/dashboard';
    });

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        render();
      });
    });

    document.getElementById('btn-new-announcement')?.addEventListener('click', () => {
      document.getElementById('announcement-form').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-announcement')?.addEventListener('click', () => {
      document.getElementById('announcement-form').classList.add('hidden');
    });
    document.getElementById('btn-submit-announcement')?.addEventListener('click', async () => {
      const title = document.getElementById('ann-title').value.trim();
      const content = document.getElementById('ann-content').value.trim();
      if (!title) { showToast('제목을 입력해주세요.', 'error'); return; }

      const fileInput = document.getElementById('ann-files');
      const files = [];
      try {
        for (const file of fileInput.files) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        await createAnnouncement(classId, { title, content, files });
        showToast('공지사항 게시 완료!');
        await render();
      } catch (err) { showToast('오류 발생', 'error'); }
    });

    document.querySelectorAll('.delete-ann-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('삭제하시겠습니까?')) {
          await deleteAnnouncement(btn.dataset.id);
          showToast('삭제됨');
          await render();
        }
      });
    });

    document.getElementById('btn-new-assignment')?.addEventListener('click', () => {
      document.getElementById('assignment-form').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-assignment')?.addEventListener('click', () => {
      document.getElementById('assignment-form').classList.add('hidden');
    });
    document.getElementById('btn-submit-assignment')?.addEventListener('click', async () => {
      const title = document.getElementById('assign-title').value.trim();
      const description = document.getElementById('assign-desc').value.trim();
      const dueDate = document.getElementById('assign-due').value;
      if (!title) return;
      const fileInput = document.getElementById('assign-files');
      const files = [];
      try {
        for (const file of fileInput.files) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        await createAssignment(classId, { title, description, dueDate, files });
        showToast('과제 생성 완료!');
        await render();
      } catch (err) { showToast('오류 발생', 'error'); }
    });

    document.querySelectorAll('.delete-assign-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('삭제하시겠습니까?')) {
          await deleteAssignment(btn.dataset.id);
          showToast('삭제됨');
          await render();
        }
      });
    });
  }

  // Expose download function to window for onclick
  window.downloadFile = (fileId) => {
    const { downloadFile } = import('../../store.js').then(m => m.downloadFile(fileId));
  };

  init();
}
