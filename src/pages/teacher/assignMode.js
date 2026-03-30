// ========================================
// Teacher Assignment & Content Mode (v2.0)
// ========================================
import {
  getCurrentTeacher, getClassById, getStudentsByClass,
  createAssignment, getAssignmentsByClass, deleteAssignment,
  createAnnouncement, getAnnouncementsByClass, deleteAnnouncement,
  addResource, getResourcesByClass, deleteResource,
  getSubmissionsByAssignment, saveFile, showToast, formatDate,
  getStudentById
} from '../../store.js';

export function renderAssignMode(container, params) {
  const teacher = getCurrentTeacher();
  if (!teacher) { window.location.hash = '/teacher/login'; return; }

  const classId = params.id;
  let cls = null;
  let activeTab = 'announcements'; // 'announcements', 'assignments', 'resources'

  async function init() {
    cls = await getClassById(classId);
    if (!cls) { window.location.hash = '/teacher/dashboard'; return; }
    await render();
  }

  async function render() {
    const assignments = await getAssignmentsByClass(classId);
    const announcements = await getAnnouncementsByClass(classId);
    const resources = await getResourcesByClass(classId);
    const students = await getStudentsByClass(classId);

    container.innerHTML = `
      <div class="teacher-layout page-enter">
        <main class="main-content" style="max-width: 1400px; margin: 0 auto;">
          <header class="page-header flex justify-between items-center" style="margin-bottom: var(--s-8);">
            <div class="animate-up">
              <button class="btn btn-ghost btn-sm" id="btn-back-dashboard" style="margin-bottom: var(--s-2);">← 대시보드로</button>
              <h1 class="page-title">${cls.name} <span class="badge badge-purple" style="vertical-align: middle; margin-left: 10px;">관리 모드</span></h1>
              <p class="page-subtitle">수업 소식, 과제 및 학습 자료를 관리합니다.</p>
            </div>
          </header>

          <div class="tabs" style="margin-bottom: var(--s-12); max-width: 600px;">
            <div class="tab ${activeTab === 'announcements' ? 'active' : ''}" data-tab="announcements">📢 공지사항</div>
            <div class="tab ${activeTab === 'assignments' ? 'active' : ''}" data-tab="assignments">📝 과제 관리</div>
            <div class="tab ${activeTab === 'resources' ? 'active' : ''}" data-tab="resources">📁 수업 자료</div>
          </div>

          <!-- 공지사항 섹션 -->
          <div id="section-announcements" class="${activeTab !== 'announcements' ? 'hidden' : 'animate-up'}">
            <div class="section-header">
              <h2 class="section-title">학급 공지사항</h2>
              <button class="btn btn-primary btn-sm" id="btn-new-announcement">+ 공지 작성</button>
            </div>
            
            <div id="announcement-form" class="card hidden" style="margin-bottom: var(--s-8);">
              <div class="form-group">
                <label class="input-label">공지 제목</label>
                <input type="text" class="input-field" id="ann-title" placeholder="제목을 입력하세요" />
              </div>
              <div class="form-group">
                <label class="input-label">내용</label>
                <textarea class="input-field" id="ann-content" rows="4" placeholder="학생들에게 전달할 내용을 입력하세요"></textarea>
              </div>
              <div class="form-group">
                <label class="input-label">파일 첨부</label>
                <input type="file" id="ann-files" multiple class="input-field" style="padding: 10px;" />
              </div>
              <div class="flex gap-md justify-end">
                <button class="btn btn-ghost" id="btn-cancel-announcement">취소</button>
                <button class="btn btn-primary" id="btn-submit-announcement">게시하기</button>
              </div>
            </div>

            <div class="feed-list">
              ${announcements.length === 0 ? `
                <div class="empty-state">
                  <div class="empty-state-icon">📢</div>
                  <p>등록된 공지사항이 없습니다.</p>
                </div>
              ` : announcements.map(ann => `
                <div class="feed-item">
                  <div class="feed-item-header">
                    <h3 class="feed-item-title">${ann.title}</h3>
                    <button class="btn btn-danger btn-sm delete-btn" data-type="ann" data-id="${ann.id}">삭제</button>
                  </div>
                  <p class="feed-item-body" style="white-space: pre-line;">${ann.content}</p>
                  ${ann.files && ann.files.length > 0 ? `
                    <div class="flex gap-sm" style="margin-top: var(--s-4); flex-wrap: wrap;">
                      ${ann.files.map(f => `
                        <div class="badge badge-blue" style="cursor: pointer;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</div>
                      `).join('')}
                    </div>
                  ` : ''}
                  <div class="feed-item-footer">
                    <span>작성일: ${formatDate(ann.createdAt)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 과제 관리 섹션 -->
          <div id="section-assignments" class="${activeTab !== 'assignments' ? 'hidden' : 'animate-up'}">
            <div class="section-header">
              <h2 class="section-title">과제 출제 및 현황</h2>
              <button class="btn btn-primary btn-sm" id="btn-new-assignment">+ 과제 만들기</button>
            </div>

            <div id="assignment-form" class="card hidden" style="margin-bottom: var(--s-8);">
              <div class="form-group">
                <label class="input-label">과제 제목</label>
                <input type="text" class="input-field" id="assign-title" placeholder="과제 제목을 입력하세요" />
              </div>
              <div class="form-group">
                <label class="input-label">설명 및 지시사항</label>
                <textarea class="input-field" id="assign-desc" rows="3" placeholder="과제 수행 방법을 입력하세요"></textarea>
              </div>
              <div class="form-group">
                <label class="input-label">마감 기한</label>
                <input type="date" class="input-field" id="assign-due" />
              </div>
              <div class="form-group">
                <label class="input-label">참조 파일</label>
                <input type="file" id="assign-files" multiple class="input-field" style="padding: 10px;" />
              </div>
              <div class="flex gap-md justify-end">
                <button class="btn btn-ghost" id="btn-cancel-assignment">취소</button>
                <button class="btn btn-primary" id="btn-submit-assignment">과제 생성</button>
              </div>
            </div>

            <div class="feed-list">
              ${(await Promise.all(assignments.map(async a => {
      const subs = await getSubmissionsByAssignment(a.id);
      return `
                  <div class="feed-item homework-item">
                    <div class="feed-item-header">
                      <h3 class="feed-item-title">${a.title}</h3>
                      <button class="btn btn-danger btn-sm delete-btn" data-type="assign" data-id="${a.id}">삭제</button>
                    </div>
                    <p class="feed-item-body" style="white-space: pre-line;">${a.description}</p>
                    <div class="feed-item-footer" style="flex-wrap: wrap; gap: var(--s-4);">
                      <span class="badge badge-purple">📅 기한: ${a.dueDate || '없음'}</span>
                      <span class="badge badge-green">👥 제출: ${subs.length} / ${students.length}명</span>
                      <span>생성일: ${formatDate(a.createdAt)}</span>
                    </div>
                    ${subs.length > 0 ? `
                      <div class="flex gap-sm" style="margin-top: var(--s-4); flex-wrap: wrap;">
                         ${(await Promise.all(subs.map(async s => {
        const std = await getStudentById(s.studentId);
        return std ? `<span class="badge badge-blue" style="opacity: 0.8;">${std.name}</span>` : '';
      }))).join('')}
                      </div>
                    ` : ''}
                  </div>
                `;
    }))).join('')}
            </div>
          </div>

          <!-- 수업 자료 섹션 (New) -->
          <div id="section-resources" class="${activeTab !== 'resources' ? 'hidden' : 'animate-up'}">
            <div class="section-header">
              <h2 class="section-title">학습 자료실</h2>
              <button class="btn btn-primary btn-sm" id="btn-new-resource">+ 자료 업로드</button>
            </div>

            <div id="resource-form" class="card hidden" style="margin-bottom: var(--s-8); background: var(--bg-surface);">
              <div class="form-group">
                <label class="input-label">자료 이름</label>
                <input type="text" class="input-field" id="res-title" placeholder="자료 파일 명칭" />
              </div>
              <div class="form-group">
                <label class="input-label">자료 설명 (선택)</label>
                <input type="text" class="input-field" id="res-desc" placeholder="예: 3강 참고용 PDF입니다" />
              </div>
              <div class="form-group">
                <label class="input-label">자료 파일</label>
                <input type="file" id="res-files" multiple class="input-field" style="padding: 10px;" />
              </div>
              <div class="flex gap-md justify-end">
                <button class="btn btn-ghost" id="btn-cancel-resource">취소</button>
                <button class="btn btn-primary" id="btn-submit-resource">자료실 등록</button>
              </div>
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--s-6);">
              ${resources.length === 0 ? `
                <div class="empty-state w-full" style="grid-column: 1 / -1;">
                  <div class="empty-state-icon">📁</div>
                  <p>업로드된 학습 자료가 없습니다.</p>
                </div>
              ` : resources.map(res => `
                <div class="card" style="padding: var(--s-6);">
                  <div class="flex justify-between items-start" style="margin-bottom: var(--s-4);">
                    <h3 style="font-size: 1.1rem; font-weight: 700;">${res.title}</h3>
                    <button class="btn btn-ghost btn-sm delete-btn" data-type="res" data-id="${res.id}" style="color: var(--error);">삭제</button>
                  </div>
                  <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: var(--s-4);">${res.description}</p>
                  <div class="flex flex-col gap-sm">
                    ${res.files.map(f => `
                       <div class="interactive-item" style="padding: var(--s-2) var(--s-3); margin-bottom: 0;" onclick="window.downloadFile('${f.id}')">
                         <span style="font-size: 0.85rem; font-weight: 500;">📎 ${f.name}</span>
                         <span style="font-size: 1.2rem;">📥</span>
                       </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
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

    // Forms Toggle
    const setupToggle = (btnId, formId, cancelId) => {
      document.getElementById(btnId)?.addEventListener('click', () => document.getElementById(formId).classList.remove('hidden'));
      document.getElementById(cancelId)?.addEventListener('click', () => document.getElementById(formId).classList.add('hidden'));
    };

    setupToggle('btn-new-announcement', 'announcement-form', 'btn-cancel-announcement');
    setupToggle('btn-new-assignment', 'assignment-form', 'btn-cancel-assignment');
    setupToggle('btn-new-resource', 'resource-form', 'btn-cancel-resource');

    // Submit Announcement
    document.getElementById('btn-submit-announcement')?.addEventListener('click', async () => {
      const title = document.getElementById('ann-title').value.trim();
      const content = document.getElementById('ann-content').value.trim();
      if (!title) { showToast('제목을 입력하세요.', 'error'); return; }

      const fileInput = document.getElementById('ann-files');
      const files = [];
      try {
        for (const file of fileInput.files) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        await createAnnouncement(classId, { title, content, files });
        showToast('공지사항이 게시되었습니다.');
        render();
      } catch (err) { showToast('오류가 발생했습니다.', 'error'); }
    });

    // Submit Assignment
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
        showToast('과제가 생성되었습니다.');
        render();
      } catch (err) { showToast('오류 발생', 'error'); }
    });

    // Submit Resource
    document.getElementById('btn-submit-resource')?.addEventListener('click', async () => {
      const title = document.getElementById('res-title').value.trim();
      const description = document.getElementById('res-desc').value.trim();
      if (!title) { showToast('자료 이름을 입력하세요.', 'error'); return; }

      const fileInput = document.getElementById('res-files');
      if (fileInput.files.length === 0) { showToast('최소 하나의 파일을 첨부하세요.', 'error'); return; }

      const files = [];
      try {
        for (const file of fileInput.files) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        await addResource(classId, { title, description, files });
        showToast('자료가 등록되었습니다.');
        render();
      } catch (err) { showToast('오류 발생', 'error'); }
    });

    // Delete Buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        if (type === 'ann') await deleteAnnouncement(id);
        else if (type === 'assign') await deleteAssignment(id);
        else if (type === 'res') await deleteResource(id);
        showToast('삭제 완료');
        render();
      });
    });
  }

  // Global download for window
  window.downloadFile = (fileId) => {
    import('../../store.js').then(m => m.downloadFile(fileId));
  };

  init();
}
