import {
  getCurrentTeacher, getClassById, getStudentsByClass,
  createAssignment, getAssignmentsByClass, deleteAssignment, updateAssignment,
  createAnnouncement, getAnnouncementsByClass, deleteAnnouncement,
  addResource, getResourcesByClass, deleteResource,
  getSubmissionsByAssignment, saveFile, showToast, formatDate,
  getStudentById, downloadFile as storeDownloadFile, getObservationsByClass,
  getStudentSelfRecordsByClass
} from '../../store.js';
import { escapeHtml } from '../../utils/quizMath.js';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export function renderAssignMode(container, params) {
  const teacher = getCurrentTeacher();
  if (!teacher) { window.location.hash = '/teacher/login'; return; }

  const classId = params.id;
  let cls = null;
  let activeTab = 'announcements'; // 'announcements', 'assignments', 'resources', 'observations', 'selfrecords'
  let editingAssignmentId = null;
  let otherClasses = []; // All classes for cross-posting
  let currentObservations = [];

  // File Queues for forms
  let annFilesQueue = []; // Array of File objects for NEW uploads
  let assignFilesQueue = []; // Array of File objects for NEW uploads
  let resFilesQueue = []; // Array of File objects for NEW uploads
  let existingFilesQueue = []; // Array of {id, name} objects for EDITING

  async function init() {
    cls = await getClassById(classId);
    if (!cls) { window.location.hash = '/teacher/dashboard'; return; }
    
    // Get all classes for cross-posting
    const { getClassesByTeacher } = await import('../../store.js');
    otherClasses = await getClassesByTeacher(teacher.uid);
    
    await render();
  }

  async function render() {
    const assignments = await getAssignmentsByClass(classId);
    const announcements = await getAnnouncementsByClass(classId);
    const resources = await getResourcesByClass(classId);
    const students = await getStudentsByClass(classId);
    const observations = await getObservationsByClass(classId);
    currentObservations = observations;
    const selfRecords = await getStudentSelfRecordsByClass(classId);

    const recordsByStudent = selfRecords.reduce((acc, record) => {
      if (!record.studentId) return acc;
      if (!acc[record.studentId]) acc[record.studentId] = [];
      acc[record.studentId].push(record);
      return acc;
    }, {});
    students.forEach(st => {
      if (!recordsByStudent[st.id]) recordsByStudent[st.id] = [];
    });

    const selfRecordRowsHtml = [];
    [...students].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko')).forEach(st => {
      const list = (recordsByStudent[st.id] || []).slice().sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
      if (!list.length) {
        selfRecordRowsHtml.push(`
          <tr>
            <td colspan="5" style="text-align: left; padding: 12px 14px; color: var(--text-dim); font-size: 0.88rem;">
              <strong style="color: var(--text-main);">${st.name}</strong> — 아직 작성한 기록이 없습니다.
            </td>
          </tr>
        `);
        return;
      }
      list.forEach((rec) => {
        selfRecordRowsHtml.push(`
          <tr>
            <td style="font-size: 0.85rem; color: var(--text-muted); white-space: nowrap;">${formatDate(rec.createdAt)}</td>
            <td><strong style="color: var(--primary);">${st.name}</strong></td>
            <td style="font-weight: 600;">${rec.title || '제목 없음'}</td>
            <td style="text-align: left; white-space: pre-line; line-height: 1.55; padding: 10px;">${rec.content || ''}</td>
            <td style="text-align: left; vertical-align: top;">
              ${rec.files && rec.files.length ? rec.files.map(f => `
                <button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.72rem; margin: 2px 4px 2px 0;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>
              `).join('') : '<span style="font-size: 0.8rem; color: var(--text-dim);">—</span>'}
            </td>
          </tr>
        `);
      });
    });
    // Pre-calculate assignments HTML with submissions
    let assignmentsHtml = '';
    if (assignments.length === 0) {
      assignmentsHtml = `
        <div class="empty-board">
          <div class="empty-board-icon">📝</div>
          <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">출제된 과제가 없습니다.</p>
          <p style="font-size: 0.9rem;">새로운 과제를 만들어 학생들의 제출 현황을 한눈에 파악하세요.</p>
        </div>
      `;
    } else {
      const assignmentCards = await Promise.all(assignments.map(async (a) => {
        const subs = await getSubmissionsByAssignment(a.id);
        const rosterIdSet = new Set(students.map((st) => String(st.id)));
        const subsOnRoster = subs.filter((s) => s.studentId != null && rosterIdSet.has(String(s.studentId)));
        const orphanSubCount = subs.length - subsOnRoster.length;
        const isDuePast = a.dueDate && new Date(a.dueDate) < new Date();
        return `
          <div class="card homework-item" style="padding: var(--s-6); display: flex; flex-direction: column; border-top: 4px solid var(--primary);">
            <div class="flex justify-between items-start" style="margin-bottom: var(--s-4);">
              <div class="flex flex-col gap-sm">
                <span class="badge ${isDuePast ? 'badge-danger' : 'badge-green'}" style="align-self: flex-start;">${a.dueDate ? (isDuePast ? '마감됨' : '진행중') : '기한 없음'}</span>
                <h3 style="font-size: 1.25rem; font-weight: 700; word-break: keep-all; line-height: 1.4;">${a.title}</h3>
              </div>
              <div class="flex gap-sm">
                <button class="btn btn-secondary btn-sm bulk-download-btn" data-id="${a.id}" data-title="${a.title}">📂 전체 다운로드</button>
                <button class="btn btn-ghost btn-sm edit-btn" data-type="assign" data-id="${a.id}" style="color: var(--primary);">수정</button>
                <button class="btn btn-ghost btn-sm delete-btn" data-type="assign" data-id="${a.id}" style="color: var(--error);">삭제</button>
              </div>
            </div>
            
            <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: var(--s-4); flex-shrink: 0; white-space: pre-line;">${a.description}</p>
            
            ${a.files && a.files.length > 0 ? `
              <div style="margin-bottom: var(--s-6); display: flex; flex-wrap: wrap; gap: 6px;">
                ${a.files.map(f => `<button class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 2px 8px; background: var(--bg-main);" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
              </div>
            ` : ''}
            
            <div style="background: var(--bg-main); padding: var(--s-4); border-radius: var(--r-sm); margin-bottom: var(--s-4);">
              <div class="flex justify-between items-center" style="margin-bottom: 8px;">
                <span style="font-size: 0.85rem; color: var(--text-dim); font-weight: 600;">제출 현황</span>
                <span style="font-size: 0.9rem; font-weight: 700; color: var(--primary);">${subsOnRoster.length} <span style="color: var(--text-muted); font-weight: 400;">/ ${students.length}명</span></span>
              </div>
              <div style="width: 100%; height: 6px; background: var(--border-subtle); border-radius: 3px; overflow: hidden;">
                <div style="width: ${students.length ? (subsOnRoster.length / students.length) * 100 : 0}%; height: 100%; background: var(--primary);"></div>
              </div>
              ${orphanSubCount > 0 ? `
              <p style="font-size: 0.78rem; color: var(--error); margin-top: 8px; line-height: 1.4;">
                현재 반 명단과 맞지 않는 제출 ${orphanSubCount}건이 있어 위 숫자에는 포함하지 않았습니다. (삭제된 학생·다른 반 제출 등) Firestore <code style="font-size:0.75em;">submissions</code>에서 assignmentId를 확인해 보세요.
              </p>
              ` : ''}
            </div>

            <details style="margin-bottom: var(--s-4); border: 1px solid var(--border-subtle); border-radius: var(--r-sm); background: var(--bg-surface);">
              <summary style="padding: var(--s-3); cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--text-main); outline: none;">학생별 상세 제출 확인</summary>
              <div style="padding: var(--s-3); padding-top: 0; display: flex; flex-direction: column; gap: var(--s-2); max-height: 250px; overflow-y: auto;">
                ${students.map(st => {
                  const sub = subsOnRoster.find(s => String(s.studentId) === String(st.id));
                  const hasSubText = sub?.textAnswer && String(sub.textAnswer).trim();
                  const hasSubAudio = !!(sub?.audioData?.url);
                  const hasSubFiles = sub?.files && sub.files.length > 0;
                  return `
                    <div class="flex justify-between items-center" style="padding: 8px; background: var(--bg-main); border-radius: var(--r-sm); gap: 10px;">
                      <span style="font-size: 0.9rem; font-weight: 500; flex-shrink: 0;">${st.name}</span>
                      ${sub ? `
                        <div class="flex flex-col items-end" style="gap: 6px; max-width: 72%;">
                          <span class="badge badge-green" style="align-self: flex-end;">${formatDate(sub.createdAt)} 제출</span>
                          ${hasSubText ? `
                            <div style="font-size: 0.82rem; color: var(--text-main); text-align: right; white-space: pre-wrap; max-height: 100px; overflow-y: auto; padding: 6px 8px; background: var(--bg-surface); border-radius: var(--r-sm); border: 1px solid var(--border-subtle); line-height: 1.45;">${escapeHtml(String(sub.textAnswer))}</div>
                          ` : ''}
                          ${hasSubAudio ? `
                            <audio controls style="max-width: 260px; height: 36px;" src="${escapeHtml(sub.audioData.url)}"></audio>
                          ` : ''}
                          ${hasSubFiles ? `
                            <div class="flex gap-sm flex-wrap justify-end" style="margin-top: 2px;">
                              ${sub.files.map(f => `<button class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 2px 6px;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                            </div>
                          ` : ''}
                          ${!hasSubText && !hasSubAudio && !hasSubFiles ? '<span style="font-size: 0.8rem; color: var(--text-dim);">제출 내용 없음</span>' : ''}
                        </div>
                      ` : `<span class="badge badge-purple" style="flex-shrink: 0;">미제출</span>`}
                    </div>
                  `;
                }).join('')}
              </div>
            </details>
            
            <div class="flex justify-between items-center" style="font-size: 0.85rem; color: var(--text-dim); margin-top: auto;">
              <span>마감: <strong style="color: var(--text-main); font-weight: 500;">${a.dueDate || '없음'}</strong></span>
              <span>등록일: ${formatDate(a.createdAt)}</span>
            </div>
          </div>
        `;
      }));
      assignmentsHtml = `
        <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--s-6);">
          ${assignmentCards.join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="teacher-layout page-enter">
        <main class="main-content" style="max-width: 1400px; margin: 0 auto;">
          <header class="premium-header-banner animate-up">
            <button class="btn btn-ghost btn-sm" id="btn-back-dashboard" style="margin-bottom: var(--s-4);">← 대시보드로</button>
            <h1 class="page-title">
              ${cls.name}
              <span class="badge badge-purple" style="font-size: 1rem;">관리 모드</span>
              <span style="font-size: 0.7rem; opacity: 0.5; font-weight: 400; margin-left: 8px;">v1.0.1-rev1</span>
            </h1>
            <p class="page-subtitle" style="color: var(--text-muted); margin-top: var(--s-2);">수업 소식, 과제 및 학습 자료를 관리합니다.</p>
          </header>

          <div class="tabs" style="margin-bottom: var(--s-12); max-width: 100%; flex-wrap: wrap;">
            <div class="tab ${activeTab === 'announcements' ? 'active' : ''}" data-tab="announcements">📢 공지사항</div>
            <div class="tab ${activeTab === 'assignments' ? 'active' : ''}" data-tab="assignments">📝 과제 관리</div>
            <div class="tab ${activeTab === 'resources' ? 'active' : ''}" data-tab="resources">📁 수업 자료</div>
            <div class="tab ${activeTab === 'observations' ? 'active' : ''}" data-tab="observations">📋 생기부 관리</div>
            <div class="tab ${activeTab === 'selfrecords' ? 'active' : ''}" data-tab="selfrecords">📌 학생 자기 기록</div>
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
                <input type="text" class="input-field" id="ann-title" placeholder="공지 제목을 입력하세요" />
              </div>
              <div class="form-group">
                <label class="input-label">내용</label>
                <textarea class="input-field" id="ann-content" rows="4" placeholder="공지 내용을 입력하세요"></textarea>
              </div>
               <div class="form-group">
                <label class="input-label">첨부 파일</label>
                <div class="drop-zone" id="ann-dropzone">
                  <div class="drop-zone-icon">📁</div>
                  <div style="font-weight: 600;">클래스 공지에 포함할 파일을 드래그하거나 클릭하세요</div>
                  <div style="font-size: 0.85rem; opacity: 0.7; margin-top: 5px;">여러 파일을 동시에 올릴 수 있습니다</div>
                  <input type="file" id="ann-files" multiple class="hidden" />
                </div>
                <div id="ann-file-list" class="file-queue-list"></div>
              </div>
              <div class="form-group">
                <label class="input-label">게시할 학급 선택</label>
                <div class="flex flex-wrap gap-sm" id="ann-class-selectors">
                  ${otherClasses.map(c => `
                    <label class="chip-checkbox">
                      <input type="checkbox" name="ann-target-class" value="${c.id}" ${c.id === classId ? 'checked disabled' : ''} />
                      <span>${c.name}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <div class="flex gap-md justify-end">
                <button class="btn btn-ghost" id="btn-cancel-announcement">취소</button>
                <button class="btn btn-primary" id="btn-submit-announcement">공지 게시</button>
              </div>
            </div>

            <div class="card" style="padding: var(--s-6);">
              ${announcements.length === 0 ? `
                <div class="empty-board">
                  <div class="empty-board-icon">📢</div>
                  <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">등록된 학급 공지사항이 없습니다.</p>
                  <p style="font-size: 0.9rem;">우측 상단의 '+ 공지 작성' 버튼을 눌러 새 소식을 등록해보세요.</p>
                </div>
              ` : `
                <table class="board-table">
                  <thead>
                    <tr>
                      <th style="width: 60px; text-align: center;">번호</th>
                      <th>제목 및 내용</th>
                      <th style="width: 120px; text-align: center;">작성일</th>
                      <th style="width: 80px; text-align: center;">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${announcements.map((ann, idx) => `
                      <tr>
                        <td style="text-align: center; color: var(--text-dim);">${announcements.length - idx}</td>
                        <td>
                          <div class="board-title-cell">${ann.title}</div>
                          <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 8px; white-space: pre-line;">${ann.content}</div>
                          ${ann.files && ann.files.length > 0 ? `
                            <div class="flex gap-sm" style="margin-top: 10px; flex-wrap: wrap;">
                              ${ann.files.map(f => `
                                <div class="badge badge-blue" style="cursor: pointer; font-size: 0.75rem;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</div>
                              `).join('')}
                            </div>
                          ` : ''}
                        </td>
                        <td style="text-align: center; color: var(--text-dim); font-size: 0.85rem;">${formatDate(ann.createdAt)}</td>
                        <td style="text-align: center;">
                          <button class="btn btn-ghost btn-sm delete-btn" data-type="ann" data-id="${ann.id}" style="color: var(--error); padding: 4px 8px;">삭제</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
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
                <div class="drop-zone" id="assign-dropzone">
                  <div class="drop-zone-icon">📝</div>
                  <div style="font-weight: 600;">과제 설명에 필요한 파일을 드래그하거나 클릭하세요</div>
                  <div style="font-size: 0.85rem; opacity: 0.7; margin-top: 5px;">이미지, 문서, HTML 등 여러 파일 가능</div>
                  <input type="file" id="assign-files" multiple class="hidden" />
                </div>
                <div id="assign-file-list" class="file-queue-list"></div>
              </div>
              <div class="form-group" id="assign-cross-post-container">
                <label class="input-label">게시할 학급 선택</label>
                <div class="flex flex-wrap gap-sm">
                  ${otherClasses.map(c => `
                    <label class="chip-checkbox">
                      <input type="checkbox" name="assign-target-class" value="${c.id}" ${c.id === classId ? 'checked disabled' : ''} />
                      <span>${c.name}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <div class="flex gap-md justify-end">
                <button class="btn btn-ghost" id="btn-cancel-assignment">취소</button>
                <button class="btn btn-primary" id="btn-submit-assignment">과제 생성</button>
              </div>
            </div>
            ${assignmentsHtml}
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
                <div class="drop-zone" id="res-dropzone">
                  <div class="drop-zone-icon">📄</div>
                  <div style="font-weight: 600;">학습 자료 파일을 드래그하거나 클릭하여 추가하세요</div>
                  <input type="file" id="res-files" multiple class="hidden" />
                </div>
                <div id="res-file-list" class="file-queue-list"></div>
              </div>
              <div class="form-group">
                <label class="input-label">게시할 학급 선택</label>
                <div class="flex flex-wrap gap-sm" id="res-class-selectors">
                  ${otherClasses.map(c => `
                    <label class="chip-checkbox">
                      <input type="checkbox" name="res-target-class" value="${c.id}" ${c.id === classId ? 'checked disabled' : ''} />
                      <span>${c.name}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <div class="flex gap-md justify-end">
                <button class="btn btn-ghost" id="btn-cancel-resource">취소</button>
                <button class="btn btn-primary" id="btn-submit-resource">자료 등록</button>
              </div>
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--s-6);">
              ${resources.length === 0 ? `
                <div class="empty-board w-full" style="grid-column: 1 / -1;">
                  <div class="empty-board-icon">📁</div>
                  <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">업로드된 학습 자료가 없습니다.</p>
                  <p style="font-size: 0.9rem;">학생들에게 필요한 수업 참고 자료를 공유해보세요.</p>
                </div>
              ` : resources.map(res => `
                <div class="card" style="padding: var(--s-6); display: flex; flex-direction: column; height: 100%;">
                  <div class="flex justify-between items-start" style="margin-bottom: var(--s-4);">
                    <h3 style="font-size: 1.15rem; font-weight: 700; word-break: keep-all; line-height: 1.3;">${res.title}</h3>
                    <button class="btn btn-ghost btn-sm delete-btn" data-type="res" data-id="${res.id}" style="color: var(--error); padding: 4px;">삭제</button>
                  </div>
                  <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: var(--s-6); flex: 1;">${res.description || '설명 없음'}</p>
                  
                  <div class="flex flex-col gap-sm" style="border-top: 1px solid var(--border-subtle); padding-top: var(--s-4);">
                     ${res.files && res.files.length > 0 ? res.files.map(f => `
                       <div class="flex justify-between items-center interactive-item" style="padding: 8px 12px; background: var(--bg-main); border-radius: var(--r-sm); cursor: pointer;" onclick="window.downloadFile('${f.id}')">
                         <span style="font-size: 0.85rem; font-weight: 500; color: var(--primary); display: flex; align-items: center; gap: 8px;">
                           <i>📎</i> <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${f.name}</span>
                         </span>
                         <span style="font-size: 1.1rem;">📥</span>
                       </div>
                    `).join('') : '<span style="font-size: 0.85rem; color: var(--text-dim);">첨부 파일 없음</span>'}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 생기부 관리 섹션 -->
          <div id="section-observations" class="${activeTab !== 'observations' ? 'hidden' : 'animate-up'}">
            <div class="section-header">
              <h2 class="section-title">관찰 기록 (세특 관리)</h2>
              <button class="btn btn-primary btn-sm" id="btn-export-observations">📥 엑셀로 내보내기</button>
            </div>
            
            <div class="card" style="padding: var(--s-6);">
              ${observations.length === 0 ? `
                <div class="empty-board">
                  <div class="empty-board-icon">📋</div>
                  <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">등록된 관찰 기록이 없습니다.</p>
                  <p style="font-size: 0.9rem;">수업 모드에서 학생들의 활동을 관찰하고 기록해보세요.</p>
                </div>
              ` : `
                <table class="board-table">
                  <thead>
                    <tr>
                      <th style="width: 140px;">날짜</th>
                      <th style="width: 100px;">학생명</th>
                      <th>관찰 내용 및 특기사항</th>
                      <th style="width: 80px;">구분</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${observations.map(obs => `
                      <tr>
                        <td style="font-size: 0.85rem; color: var(--text-muted);">${formatDate(obs.createdAt)}</td>
                        <td><strong style="color: var(--primary);">${obs.studentName || '알 수 없음'}</strong></td>
                        <td style="white-space: pre-line; text-align: left; padding: 15px 10px; line-height: 1.6;">
                          <div>${obs.content || '기록 없음'}</div>
                          ${obs.audioData?.url ? `
                            <audio controls src="${obs.audioData.url}" style="width: 100%; max-width: 360px; margin-top: 10px;"></audio>
                          ` : ''}
                        </td>
                        <td><span class="badge ${obs.mode === 'voice' ? 'badge-blue' : 'badge-green'}">${obs.mode === 'voice' ? '음성' : '텍스트'}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>

          <!-- 학생 자기 기록 (생기부 참고용) -->
          <div id="section-selfrecords" class="${activeTab !== 'selfrecords' ? 'hidden' : 'animate-up'}">
            <div class="section-header">
              <h2 class="section-title">학생 자기 기록 (생기부 참고)</h2>
            </div>
            <p style="font-size: 0.92rem; color: var(--text-muted); margin-bottom: var(--s-6); line-height: 1.55;">
              학생이 대시보드에서 남긴 참고용 기록입니다. 교사의 <strong>관찰 기록</strong>과 별도로 저장됩니다.
            </p>
            <div class="card" style="padding: var(--s-6);">
              ${selfRecords.length === 0 ? `
                <div class="empty-board">
                  <div class="empty-board-icon">📌</div>
                  <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">등록된 학생 기록이 없습니다.</p>
                  <p style="font-size: 0.9rem;">학생이 기록을 남기면 여기에 표시됩니다.</p>
                </div>
              ` : `
                <div style="overflow-x: auto;">
                  <table class="board-table">
                    <thead>
                      <tr>
                        <th style="width: 120px;">날짜</th>
                        <th style="width: 90px;">학생</th>
                        <th style="width: 160px;">제목</th>
                        <th>내용</th>
                        <th style="width: 200px;">첨부</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${selfRecordRowsHtml.join('')}
                    </tbody>
                  </table>
                </div>
              `}
            </div>
          </div>
        </main>
      </div>
    `;

    bindEvents();
  }

  function updateFileListUI(type) {
    let queue = [];
    let existing = [];
    let listId = "";
    
    if (type === 'ann') { queue = annFilesQueue; listId = "ann-file-list"; }
    else if (type === 'assign') { queue = assignFilesQueue; existing = existingFilesQueue; listId = "assign-file-list"; }
    else if (type === 'res') { queue = resFilesQueue; listId = "res-file-list"; }

    const listContainer = document.getElementById(listId);
    if (!listContainer) return;

    let html = "";
    
    // Existing files (for assignment editing)
    existing.forEach((f, idx) => {
      html += `
        <div class="file-queue-item" style="border-left: 4px solid var(--success);">
          <div class="file-item-info">
            <span style="font-size: 1.1rem;">📎</span>
            <span class="file-item-name">${f.name} <small style="color: var(--text-dim);">(기존)</small></span>
          </div>
          <button class="btn-remove-file" onclick="window.removeQueuedFile('${type}', ${idx}, true)">✕</button>
        </div>
      `;
    });

    // New queue files
    queue.forEach((f, idx) => {
      html += `
        <div class="file-queue-item" style="border-left: 4px solid var(--primary);">
          <div class="file-item-info">
            <span style="font-size: 1.1rem;">📄</span>
            <span class="file-item-name">${f.name}</span>
          </div>
          <button class="btn-remove-file" onclick="window.removeQueuedFile('${type}', ${idx}, false)">✕</button>
        </div>
      `;
    });

    listContainer.innerHTML = html;
  }

  window.removeQueuedFile = (type, index, isExisting) => {
    if (type === 'ann') annFilesQueue.splice(index, 1);
    else if (type === 'assign') {
      if (isExisting) existingFilesQueue.splice(index, 1);
      else assignFilesQueue.splice(index, 1);
    }
    else if (type === 'res') resFilesQueue.splice(index, 1);
    
    updateFileListUI(type);
  };

  function setupDropZone(dropZoneId, fileInputId, type) {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        addFilesToQueue(type, e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        addFilesToQueue(type, fileInput.files);
        fileInput.value = ''; // Reset so same file can be selected again if removed
      }
    });
  }

  function addFilesToQueue(type, files) {
    const fileArray = Array.from(files);
    
    const filterDuplicates = (queue, newFiles) => {
      return newFiles.filter(nf => !queue.some(qf => qf.name === nf.name && qf.size === nf.size));
    };

    if (type === 'ann') annFilesQueue = [...annFilesQueue, ...filterDuplicates(annFilesQueue, fileArray)];
    else if (type === 'assign') assignFilesQueue = [...assignFilesQueue, ...filterDuplicates(assignFilesQueue, fileArray)];
    else if (type === 'res') resFilesQueue = [...resFilesQueue, ...filterDuplicates(resFilesQueue, fileArray)];
    
    updateFileListUI(type);
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

    // Export Observations to Excel
    document.getElementById('btn-export-observations')?.addEventListener('click', () => {
      if (currentObservations.length === 0) {
        showToast('내보낼 기록이 없습니다.', 'error');
        return;
      }

      try {
        const data = currentObservations.map(obs => ({
          '날짜': formatDate(obs.createdAt),
          '학생명': obs.studentName || '알 수 없음',
          '관찰 내용 및 특기사항': obs.audioData?.name ? `${obs.content || '음성 관찰 기록'} (${obs.audioData.name})` : (obs.content || ''),
          '구분': obs.mode === 'voice' ? '음성' : '텍스트'
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "관찰기록");
        
        // Column widths
        const wscols = [
          {wch: 20}, // 날짜
          {wch: 15}, // 학생명
          {wch: 80}, // 내용
          {wch: 10}  // 구분
        ];
        worksheet['!cols'] = wscols;

        const fileName = `[${cls.name}]_생기부_관찰기록_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        showToast('엑셀 파일이 생성되었습니다! 📥');
      } catch (err) {
        console.error('Excel export error:', err);
        showToast('엑셀 생성 중 오류가 발생했습니다.', 'error');
      }
    });

    // Forms Toggle
    document.getElementById('btn-new-announcement')?.addEventListener('click', () => {
      document.getElementById('announcement-form').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-announcement')?.addEventListener('click', () => {
      document.getElementById('announcement-form').classList.add('hidden');
    });

    document.getElementById('btn-new-assignment')?.addEventListener('click', () => {
      editingAssignmentId = null;
      assignFilesQueue = [];
      existingFilesQueue = [];
      document.getElementById('assignment-form').classList.remove('hidden');
      document.querySelector('#assignment-form .section-title')?.remove();
      const titleEl = document.createElement('h3');
      titleEl.className = 'section-title';
      titleEl.textContent = '새 과제 만들기';
      document.getElementById('assignment-form').prepend(titleEl);
      
      document.getElementById('assign-title').value = '';
      document.getElementById('assign-desc').value = '';
      document.getElementById('assign-due').value = '';
      updateFileListUI('assign');
      document.getElementById('btn-submit-assignment').textContent = '과제 생성';
      document.getElementById('assign-cross-post-container').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-assignment')?.addEventListener('click', () => {
      document.getElementById('assignment-form').classList.add('hidden');
      editingAssignmentId = null;
    });

    document.getElementById('btn-new-resource')?.addEventListener('click', () => {
      document.getElementById('resource-form').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-resource')?.addEventListener('click', () => {
      document.getElementById('resource-form').classList.add('hidden');
    });

    // Set up dropzones
    setupDropZone('ann-dropzone', 'ann-files', 'ann');
    setupDropZone('assign-dropzone', 'assign-files', 'assign');
    setupDropZone('res-dropzone', 'res-files', 'res');

    // Submit Announcement
    document.getElementById('btn-submit-announcement')?.addEventListener('click', async () => {
      const title = document.getElementById('ann-title').value.trim();
      const content = document.getElementById('ann-content').value.trim();
      if (!title) { showToast('제목을 입력하세요.', 'error'); return; }

      // Get target classes
      const selectedClasses = [classId, ...Array.from(document.querySelectorAll('input[name="ann-target-class"]:checked:not(:disabled)')).map(el => el.value)];

      const files = [];
      try {
        for (const file of annFilesQueue) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        
        // Post to all selected classes
        const posts = selectedClasses.map(cid => createAnnouncement(cid, { title, content, files }));
        await Promise.all(posts);
        
        showToast(selectedClasses.length > 1 ? `${selectedClasses.length}개 학급에 공지되었습니다.` : '공지사항이 게시되었습니다.');
        annFilesQueue = [];
        document.getElementById('announcement-form').classList.add('hidden');
        render();
      } catch (err) { showToast('오류가 발생했습니다.', 'error'); }
    });

    // Submit Assignment
    document.getElementById('btn-submit-assignment')?.addEventListener('click', async () => {
      const title = document.getElementById('assign-title').value.trim();
      const description = document.getElementById('assign-desc').value.trim();
      const dueDate = document.getElementById('assign-due').value;

      if (!title) { showToast('제목을 입력하세요.', 'error'); return; }

      const selectedClasses = editingAssignmentId ? [classId] : [classId, ...Array.from(document.querySelectorAll('input[name="assign-target-class"]:checked:not(:disabled)')).map(el => el.value)];

      try {
        const uploadedFiles = [];
        for (const file of assignFilesQueue) {
          const saved = await saveFile(file);
          uploadedFiles.push({ id: saved.id, name: saved.name });
        }
        
        const finalFiles = [...existingFilesQueue, ...uploadedFiles];
        const assignData = { title, description, dueDate, files: finalFiles };
        
        if (editingAssignmentId) {
          await updateAssignment(editingAssignmentId, assignData);
          showToast('과제가 수정되었습니다.');
        } else {
          const posts = selectedClasses.map(cid => createAssignment(cid, assignData));
          await Promise.all(posts);
          showToast(selectedClasses.length > 1 ? `${selectedClasses.length}개 학급에 과제가 출제되었습니다.` : '과제가 생성되었습니다.');
        }
        
        editingAssignmentId = null;
        assignFilesQueue = [];
        existingFilesQueue = [];
        document.getElementById('assignment-form').classList.add('hidden');
        render();
      } catch (err) { 
        console.error(err);
        showToast('오류 발생', 'error'); 
      }
    });

    // Submit Resource
    document.getElementById('btn-submit-resource')?.addEventListener('click', async () => {
      const title = document.getElementById('res-title').value.trim();
      const description = document.getElementById('res-desc').value.trim();
      if (!title) { showToast('자료 이름을 입력하세요.', 'error'); return; }

      const selectedClasses = [classId, ...Array.from(document.querySelectorAll('input[name="res-target-class"]:checked:not(:disabled)')).map(el => el.value)];

      try {
        const files = [];
        for (const file of resFilesQueue) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        
        const posts = selectedClasses.map(cid => addResource(cid, { title, description, files }));
        await Promise.all(posts);
        
        showToast(selectedClasses.length > 1 ? `${selectedClasses.length}개 학급에 자료가 공유되었습니다.` : '자료가 등록되었습니다.');
        resFilesQueue = [];
        document.getElementById('resource-form').classList.add('hidden');
        render();
      } catch (err) { showToast('오류 발생', 'error'); }
    });

    // Edit Buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        
        if (type === 'assign') {
          const assignments = await getAssignmentsByClass(classId);
          const a = assignments.find(item => item.id === id);
          if (!a) return;
          
          editingAssignmentId = id;
          document.getElementById('assignment-form').classList.remove('hidden');
          
          document.querySelector('#assignment-form .section-title')?.remove();
          const titleEl = document.createElement('h3');
          titleEl.className = 'section-title';
          titleEl.textContent = '과제 수정하기';
          document.getElementById('assignment-form').prepend(titleEl);
          
          document.getElementById('assign-title').value = a.title;
          document.getElementById('assign-desc').value = a.description;
          document.getElementById('assign-due').value = a.dueDate || '';
          document.getElementById('btn-submit-assignment').textContent = '수정 완료';
          
          assignFilesQueue = [];
          existingFilesQueue = a.files ? [...a.files] : [];
          updateFileListUI('assign');
          
          // Hide cross-post on edit
          document.getElementById('assign-cross-post-container').classList.add('hidden');

          // Scroll to form
          document.getElementById('assignment-form').scrollIntoView({ behavior: 'smooth' });
        }
      });
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
    // Bulk Download
    document.querySelectorAll('.bulk-download-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const title = btn.dataset.title;
        await handleBulkDownload(id, title);
      });
    });
  }

  // Style for chip checkboxes (added once)
  if (!document.getElementById('assign-mode-styles')) {
    const style = document.createElement('style');
    style.id = 'assign-mode-styles';
    style.textContent = `
      .chip-checkbox {
        cursor: pointer;
        display: inline-flex;
        align-items: center;
      }
      .chip-checkbox input { position: absolute; opacity: 0; width: 0; height: 0; }
      .chip-checkbox span {
        padding: 6px 12px;
        border-radius: var(--r-full);
        border: 1px solid var(--border-main);
        background: var(--bg-surface);
        font-size: 0.85rem;
        color: var(--text-muted);
        transition: all 0.2s;
        user-select: none;
      }
      .chip-checkbox input:checked + span {
        background: var(--primary);
        border-color: var(--primary);
        color: white;
        box-shadow: var(--shadow-sm);
      }
      .chip-checkbox input:disabled + span {
        opacity: 0.6;
        cursor: not-allowed;
        background: var(--bg-main);
      }
    `;
    document.head.appendChild(style);
  }

  async function handleBulkDownload(assignmentId, assignmentTitle) {
    try {
      const [subs, allStudents] = await Promise.all([
        getSubmissionsByAssignment(assignmentId),
        getStudentsByClass(classId)
      ]);

      if (!subs || subs.length === 0) {
        showToast('제출된 과제가 없습니다.', 'info');
        return;
      }

      showToast('압축 파일 생성 중... 잠시만 기다려주세요.', 'info');
      const zip = new JSZip();
      
      // 순차적으로 다운로드하여 브라우저 과부하 방지
      for (const sub of subs) {
        const student = allStudents.find(s => s.id === sub.studentId);
        const stName = student ? student.name : '알수없음';
        const stNum = student ? (student.number || '') : '';
        const prefix = stNum ? `${stNum}_${stName}` : stName;

        if (sub.files && sub.files.length > 0) {
          for (const f of sub.files) {
            try {
              // store.js에서 파일 정보(URL) 가져오기
              const fileInfo = await import('../../store.js').then(m => m.getFileById(f.id));
              if (fileInfo && fileInfo.url) {
                const response = await fetch(fileInfo.url);
                const blob = await response.blob();
                zip.file(`${prefix}_${f.name}`, blob);
              }
            } catch (err) {
              console.error(`Failed to download ${f.name}:`, err);
            }
          }
        }

        if (sub.textAnswer && String(sub.textAnswer).trim()) {
          zip.file(`${prefix}_작성답안.txt`, String(sub.textAnswer));
        }

        if (sub.audioData?.id) {
          try {
            const audioInfo = await import('../../store.js').then(m => m.getFileById(sub.audioData.id));
            if (audioInfo && audioInfo.url) {
              const response = await fetch(audioInfo.url);
              const blob = await response.blob();
              const an = audioInfo.name || `voice_${sub.studentId}.webm`;
              zip.file(`${prefix}_음성_${an}`, blob);
            }
          } catch (err) {
            console.error('Failed to download submission audio:', err);
          }
        } else if (sub.audioData?.url) {
          try {
            const response = await fetch(sub.audioData.url);
            const blob = await response.blob();
            zip.file(`${prefix}_음성_${sub.studentId}.webm`, blob);
          } catch (err) {
            console.error('Failed to download submission audio (url):', err);
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${assignmentTitle}_전체제출물.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showToast('압축 및 다운로드가 완료되었습니다!');
    } catch (err) {
      console.error('Bulk download error:', err);
      showToast('일괄 다운로드 중 오류가 발생했습니다.', 'error');
    }
  }

  window.downloadFile = (fileId) => {
    storeDownloadFile(fileId);
  };

  init();
}
