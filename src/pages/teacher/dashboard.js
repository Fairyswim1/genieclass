// ========================================
// Teacher Dashboard (v1.1.5)
// ========================================
import {
  getCurrentTeacher, logoutTeacher, getClassesByTeacher,
  createClass, getStudentsByClass, deleteClass, addStudent,
  addStudentsBatch, showToast, formatDate,
  getStudentNotesForTeacher, markStudentNoteRead, replyToStudentNote, deleteStudentNote,
  createTeacherNoteToStudent
} from '../../store.js';
import { parseExcelFile, downloadSampleExcel, exportStudentsToExcel } from '../../utils/excelImport.js';
import { renderCharacter, deriveCharacterLevelFromPoints } from '../../components/characterAvatar.js';

export function renderTeacherDashboard(container) {
  const teacher = getCurrentTeacher();
  if (!teacher) {
    window.location.hash = '/teacher/login';
    return;
  }

  let classes = [];

  const PRESET_COLORS = [
    'linear-gradient(135deg, #4F46E5, #818CF8)', // Indigo
    'linear-gradient(135deg, #0D9488, #2DD4BF)', // Teal
    'linear-gradient(135deg, #7C3AED, #A78BFA)', // Violet
    'linear-gradient(135deg, #DB2777, #F472B6)', // Pink
    'linear-gradient(135deg, #2563EB, #60A5FA)', // Blue
    'linear-gradient(135deg, #059669, #34D399)', // Green
    'linear-gradient(135deg, #D97706, #FBBF24)', // Amber
    'linear-gradient(135deg, #EA580C, #FB923C)', // Orange
    'linear-gradient(135deg, #334155, #94a3b8)', // Slate
    'linear-gradient(135deg, #78350f, #D97706)', // Brown
  ];

  async function render() {
    classes = await getClassesByTeacher(teacher.uid);

    const teacherNotes = await getStudentNotesForTeacher(teacher.uid);
    const unreadNoteCount = teacherNotes.filter(n => !n.read).length;

    container.innerHTML = `
      <div class="teacher-layout">
        <!-- Sidebar -->
        <aside class="sidebar animate-slide-left">
          <div class="sidebar-header">
            <div class="sidebar-logo">
              <div class="sidebar-logo-icon">G</div>
              <div class="sidebar-logo-text">Genie Class</div>
            </div>
          </div>
          <div class="sidebar-classes">
            <div class="sidebar-section-title">내 클래스</div>
            ${classes.map(cls => `
              <div class="sidebar-class-item" data-class-id="${cls.id}">
                <div class="sidebar-class-icon" style="background:${cls.color || 'var(--primary)'}">${cls.name.charAt(0)}</div>
                <span>${cls.name}</span>
              </div>
            `).join('')}
            <div class="sidebar-class-item" id="sidebar-add-class">
              <div class="sidebar-class-icon add-class-sidebar-icon">+</div>
              <span>클래스 추가</span>
            </div>

            <div class="sidebar-comm-section">
              <div class="sidebar-section-title">소통</div>
              <button type="button" class="sidebar-inbox-trigger ${unreadNoteCount ? 'sidebar-inbox-trigger--unread' : ''}" id="btn-open-notes-inbox" aria-label="학생 쪽지함 열기" title="학생이 보낸 쪽지">
                <span class="sidebar-inbox-icon" aria-hidden="true">📬</span>
                <span class="sidebar-inbox-text">쪽지함</span>
                ${unreadNoteCount ? `<span class="sidebar-new-stack"><span class="sidebar-new-label">NEW</span>${unreadNoteCount > 1 ? `<span class="sidebar-new-count">${unreadNoteCount > 99 ? '99+' : unreadNoteCount}</span>` : ''}</span>` : ''}
              </button>
            </div>
          </div>
          <div class="sidebar-footer">
            <div class="sidebar-user-card">
              <div class="sidebar-user">
                <div class="sidebar-user-avatar">${(teacher.displayName || teacher.email || 'T').charAt(0)}</div>
                <div class="sidebar-user-info">
                  <div class="sidebar-user-name">${teacher.displayName || '선생님'}</div>
                  <div class="sidebar-user-role">교사 <span style="font-size:0.6rem;opacity:0.5">v1.1.5</span></div>
                </div>
              </div>
              <button class="btn btn-ghost btn-sm w-full" id="btn-logout">로그아웃</button>
            </div>
          </div>
        </aside>

        <!-- Main Content -->
        <main class="main-content">
          <div style="max-width: 1600px; margin: 0 auto;">
            <div class="dashboard-header animate-fade-in-down">
              <h1 class="dashboard-greeting">안녕하세요, <span>${teacher.displayName || '선생님'}</span> 선생님! 👋</h1>
              <p class="dashboard-subtitle">오늘도 좋은 수업 되세요</p>
            </div>

            <div class="section-header">
              <h2 class="section-title">내 클래스</h2>
              <button class="btn btn-primary btn-sm" id="btn-add-class">+ 새 클래스</button>
            </div>

            <div class="class-grid stagger-children" id="class-grid-container">
              ${(await Promise.all(classes.map(async cls => {
                const students = await getStudentsByClass(cls.id);
                return `
                  <div class="card card-clickable class-card" data-class-id="${cls.id}" draggable="true">
                    <div class="class-card-banner" style="background:${cls.color || 'var(--primary)'}">
                      <button class="btn-edit-color" data-class-id="${cls.id}" title="색상 변경">🎨</button>
                    </div>
                    <div class="class-card-body">
                      <div class="class-card-name">${cls.name}</div>
                      <div class="class-card-info">
                        <span>👤 ${students.length}명</span>
                      </div>
                      <div class="class-card-actions">
                        <button class="btn btn-primary btn-sm class-enter-btn" data-class-id="${cls.id}">입장</button>
                        <button class="btn btn-ghost btn-sm class-manage-btn" data-class-id="${cls.id}">학생관리</button>
                        <button class="btn btn-ghost btn-sm class-delete-btn" data-class-id="${cls.id}" style="color:var(--red)">삭제</button>
                      </div>
                    </div>
                  </div>
                `;
              }))).join('')}
              <div class="add-class-card" id="add-class-card">
                <div class="add-class-icon">＋</div>
                <span>새 클래스 만들기</span>
              </div>
            </div>
          </div>
        </main>
      </div>

      <!-- Modals -->
      <div class="modal-backdrop" id="create-class-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">새 클래스 만들기</h3>
            <button class="modal-close" id="close-create-modal">✕</button>
          </div>
          <form id="create-class-form">
            <div class="form-group">
              <label class="input-label">클래스 이름</label>
              <input type="text" class="input-field" id="class-name-input" placeholder="예: 3학년 1반" required />
            </div>
            <button type="submit" class="btn btn-primary w-full">클래스 생성</button>
          </form>
        </div>
      </div>

      <div class="modal-backdrop" id="student-manage-modal">
        <div class="modal-content" style="max-width:800px">
          <div class="modal-header">
            <h3 class="modal-title" id="manage-modal-title">학생 관리</h3>
            <button class="modal-close" id="close-manage-modal">✕</button>
          </div>
          <div id="student-manage-content"></div>
        </div>
      </div>

      <div class="modal-backdrop" id="notes-inbox-modal">
        <div class="modal-content notes-inbox-modal-content" style="max-width: 920px;">
          <div class="modal-header">
            <h3 class="modal-title">💌 학생 쪽지함</h3>
            <button type="button" class="modal-close" id="close-notes-inbox-modal">✕</button>
          </div>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: var(--s-4); line-height: 1.5;">
            학생이 대시보드에서 보낸 쪽지입니다. 읽음 처리 후에도 목록에 남으며, 삭제하면 영구적으로 지워집니다.
          </p>
          ${teacherNotes.length === 0 ? `
            <div class="empty-board" style="padding: var(--s-10);">
              <p style="color: var(--text-dim);">아직 받은 쪽지가 없습니다.</p>
            </div>
          ` : `
            <div class="notes-inbox-table-wrap">
              <table class="student-table notes-inbox-table">
                <thead>
                  <tr>
                    <th align="left">시간</th>
                    <th align="left">학급</th>
                    <th align="left">학생</th>
                    <th align="left">내용</th>
                    <th align="center" style="width: 88px;">상태</th>
                    <th align="left" style="width: 240px;">답장</th>
                    <th align="center" style="width: 72px;">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  ${teacherNotes.slice(0, 100).map((n) => {
                    const preview = String(n.message || '').length > 200
                      ? String(n.message).slice(0, 200) + '…'
                      : (n.message || '');
                    const esc = (s) => String(s || '')
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;');
                    return `
                    <tr class="${n.read ? '' : 'notes-inbox-row--unread'}">
                      <td class="notes-inbox-td-time">${formatDate(n.createdAt)}</td>
                      <td>${esc(n.className || '클래스')}</td>
                      <td><strong>${esc(n.studentName || '')}</strong></td>
                      <td class="notes-inbox-td-msg"><div class="notes-inbox-preview">${esc(preview)}</div></td>
                      <td align="center">
                        ${n.read
                          ? '<span class="badge badge-green">읽음</span>'
                          : `<button type="button" class="btn btn-secondary btn-sm btn-mark-note-read" data-note-id="${n.id}">읽음</button>`}
                      </td>
                      <td class="notes-inbox-td-reply">
                        ${n.replyMessage ? `
                          <div class="notes-inbox-reply-existing">
                            <div class="notes-inbox-reply-meta">답장됨 · ${formatDate(n.repliedAt)}</div>
                            <div class="notes-inbox-reply-text">${esc(n.replyMessage)}</div>
                          </div>
                        ` : ''}
                        <textarea class="input-field notes-inbox-reply-input" data-note-id="${n.id}" rows="2" placeholder="${n.replyMessage ? '답장 수정' : '학생에게 답장'}">${n.replyMessage ? esc(n.replyMessage) : ''}</textarea>
                        <button type="button" class="btn btn-primary btn-sm btn-reply-student-note" data-note-id="${n.id}">
                          ${n.replyMessage ? '수정' : '답장'}
                        </button>
                      </td>
                      <td align="center">
                        <button type="button" class="btn btn-ghost btn-sm btn-delete-student-note" data-note-id="${n.id}" title="쪽지 삭제" style="color: var(--error);">🗑</button>
                      </td>
                    </tr>
                  `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>

      <div class="modal-backdrop" id="mode-select-modal">
        <div class="modal-content" style="max-width:600px;background:transparent;border:none;box-shadow:none;">
          <div class="mode-selection" id="mode-selection-btns"></div>
        </div>
      </div>

      <style>
        .class-card-banner { position: relative; height: 100px; border-radius: var(--radius-md) var(--radius-md) 0 0; }
        .btn-edit-color {
          position: absolute; top: 8px; right: 8px;
          width: 30px; height: 30px; border-radius: 50%;
          background: rgba(255,255,255,0.2); backdrop-filter: blur(4px);
          border: none; color: white; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s; opacity: 0;
        }
        .class-card:hover .btn-edit-color { opacity: 1; }
        .btn-edit-color:hover { background: rgba(255,255,255,0.4); transform: scale(1.1); }
        .class-card.dragging { opacity: 0.5; transform: scale(0.95); }
      </style>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Basic Actions
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      await logoutTeacher();
      window.location.hash = '/teacher/login';
    });

    document.getElementById('btn-open-notes-inbox')?.addEventListener('click', () => openModal('notes-inbox-modal'));
    document.getElementById('close-notes-inbox-modal')?.addEventListener('click', () => closeModal('notes-inbox-modal'));
    document.getElementById('notes-inbox-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'notes-inbox-modal') closeModal('notes-inbox-modal');
    });

    document.querySelectorAll('.btn-delete-student-note').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.noteId;
        if (!id) return;
        if (!confirm('이 쪽지를 삭제할까요?')) return;
        try {
          await deleteStudentNote(id);
          showToast('쪽지를 삭제했습니다.');
          closeModal('notes-inbox-modal');
          render();
        } catch (err) {
          console.error(err);
          showToast('삭제 중 오류가 발생했습니다.', 'error');
        }
      });
    });

    document.querySelectorAll('.btn-mark-note-read').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.noteId;
        if (!id) return;
        try {
          await markStudentNoteRead(id, true);
          showToast('읽음으로 표시했습니다.');
          render();
        } catch (err) {
          console.error(err);
          showToast('처리 중 오류가 발생했습니다.', 'error');
        }
      });
    });

    document.querySelectorAll('.btn-reply-student-note').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.noteId;
        const textarea = document.querySelector(`.notes-inbox-reply-input[data-note-id="${id}"]`);
        const message = textarea?.value?.trim() || '';
        if (!id) return;
        if (!message) {
          showToast('답장 내용을 입력해 주세요.', 'error');
          return;
        }
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = '전송 중...';
        try {
          await replyToStudentNote(id, message);
          showToast('학생에게 답장을 보냈습니다.');
          await render();
          openModal('notes-inbox-modal');
        } catch (err) {
          console.error(err);
          showToast('답장 전송 중 오류가 발생했습니다.', 'error');
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });

    const addBtns = [document.getElementById('btn-add-class'), document.getElementById('add-class-card'), document.getElementById('sidebar-add-class')];
    addBtns.forEach(btn => btn?.addEventListener('click', () => openModal('create-class-modal')));

    document.getElementById('close-create-modal')?.addEventListener('click', () => closeModal('create-class-modal'));
    document.getElementById('close-manage-modal')?.addEventListener('click', () => closeModal('student-manage-modal'));

    document.getElementById('create-class-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('class-name-input').value.trim();
      if (name) {
        await createClass(name, teacher.uid);
        closeModal('create-class-modal');
        render();
      }
    });

    // Class Card Events
    document.querySelectorAll('.class-enter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openModeSelection(btn.dataset.classId); });
    });
    document.querySelectorAll('.class-manage-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openStudentManagement(btn.dataset.classId); });
    });
    document.querySelectorAll('.class-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('정말 삭제하시겠습니까?')) {
          await deleteClass(btn.dataset.classId);
          render();
        }
      });
    });

    // Color & Drag
    document.querySelectorAll('.btn-edit-color').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker(btn.dataset.classId, classes.find(c => c.id === btn.dataset.classId)?.color);
      });
    });

    const containerGrid = document.getElementById('class-grid-container');
    const draggables = containerGrid.querySelectorAll('.class-card[draggable="true"]');
    draggables.forEach(draggable => {
      draggable.addEventListener('dragstart', () => draggable.classList.add('dragging'));
      draggable.addEventListener('dragend', async () => {
        draggable.classList.remove('dragging');
        const newOrder = [...containerGrid.querySelectorAll('.class-card')].map((card, index) => ({ id: card.dataset.classId, order: index }));
        const { updateClassOrder } = await import('../../store.js');
        await updateClassOrder(newOrder);
      });
      draggable.addEventListener('dragover', (e) => {
        e.preventDefault();
        const next = getNextElement(containerGrid, e.clientX, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (next == null) containerGrid.insertBefore(dragging, document.getElementById('add-class-card'));
        else containerGrid.insertBefore(dragging, next);
      });
    });
  }

  function getNextElement(container, x, y) {
    const draggables = [...container.querySelectorAll('.class-card:not(.dragging)')];
    return draggables.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offsetX = x - box.left - box.width / 2;
        const offsetY = y - box.top - box.height / 2;
        const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        if (distance < closest.offset) return { offset: distance, element: child };
        else return closest;
    }, { offset: Number.POSITIVE_INFINITY }).element;
  }

  function openColorPicker(classId, currentColor) {
    const existing = document.getElementById('color-picker-modal');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.id = 'color-picker-modal';
    picker.className = 'modal-backdrop active';
    picker.innerHTML = `
      <div class="modal-content" style="max-width: 400px; text-align: center;">
        <h3 class="modal-title">🎨 색상 선택</h3>
        <div class="grid" style="grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 20px 0;">
          ${PRESET_COLORS.map(color => `<div class="color-swatch" data-color="${color}" style="background:${color}; width:100%; aspect-ratio:1; border-radius:8px; cursor:pointer;"></div>`).join('')}
        </div>
        <button class="btn btn-ghost w-full" id="close-picker">닫기</button>
      </div>
    `;
    document.body.appendChild(picker);
    picker.querySelectorAll('.color-swatch').forEach(sw => sw.addEventListener('click', async () => {
        const { updateClassColor } = await import('../../store.js');
        await updateClassColor(classId, sw.dataset.color);
        picker.remove();
        render();
    }));
    document.getElementById('close-picker').addEventListener('click', () => picker.remove());
  }

  function openModeSelection(classId) {
    const modalBtns = document.getElementById('mode-selection-btns');
    modalBtns.style.display = 'flex';
    modalBtns.style.flexDirection = 'column';
    modalBtns.style.gap = '20px';
    
    modalBtns.innerHTML = `
      <div class="mode-card card card-clickable animate-up" onclick="window.location.hash='/teacher/class/${classId}/lesson'" style="width:100%; height:auto; min-height:120px; text-align:left; display:flex; align-items:center; gap:20px; padding:25px;">
        <span style="font-size:3rem;">📚</span>
        <div>
          <div style="font-size:1.4rem; font-weight:800; margin-bottom:8px;">수업 모드</div>
          <div style="font-size:0.95rem; color:var(--text-muted); line-height:1.5;">학생별 칭찬, 발표 기록, 번개 퀴즈, 관찰 기록을 활용해 실시간 수업 활동을 진행합니다.</div>
        </div>
      </div>
      <div class="mode-card card card-clickable animate-up" onclick="window.location.hash='/teacher/class/${classId}/assign'" style="width:100%; height:auto; min-height:120px; text-align:left; display:flex; align-items:center; gap:20px; padding:25px; animation-delay:0.1s;">
        <span style="font-size:3rem;">📝</span>
        <div>
          <div style="font-size:1.4rem; font-weight:800; margin-bottom:8px;">과제 및 자료 관리</div>
          <div style="font-size:0.95rem; color:var(--text-muted); line-height:1.5;">공지사항, 과제, 수업 자료를 관리하고 학생 제출물과 생기부 관찰 기록을 확인합니다.</div>
        </div>
      </div>
    `;
    openModal('mode-select-modal');
  }

  async function openStudentManagement(classId) {
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;

    document.getElementById('manage-modal-title').textContent = `${cls.name} - 학생 관리`;
    const content = document.getElementById('student-manage-content');

    async function renderStudentList() {
      const students = await getStudentsByClass(classId);
      content.innerHTML = `
        <div class="tabs">
          <div class="tab active" data-tab="list">학생 목록</div>
          <div class="tab" data-tab="add">학생 추가</div>
          <div class="tab" data-tab="excel">엑셀 임포트</div>
        </div>

        <div id="tab-list">
          <div class="flex justify-between items-center" style="margin-bottom:var(--s-4)">
            <div style="color:var(--text-muted); font-size:0.9rem">전체 학생: <span style="font-weight:700; color:var(--primary)">${students.length}명</span></div>
            <div class="flex gap-sm">
              <button class="btn btn-secondary btn-sm" id="btn-export-excel">💾 엑셀 저장 (코드포함)</button>
              <button class="btn btn-primary btn-sm" id="btn-go-to-add-tab">+ 학생 추가</button>
            </div>
          </div>
          
          <table class="student-table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid var(--bg-main)">
                <th align="left" style="padding:10px 0">번호/이름</th>
                <th align="left">아이디</th>
                <th align="center">성장</th>
                <th align="right">관리</th>
              </tr>
            </thead>
            <tbody>
              ${students.length === 0 ? `<tr><td colspan="4" align="center" style="padding:40px; color:var(--text-dim)">아직 등록된 학생이 없습니다.</td></tr>` : students.map(s => {
                const lv = deriveCharacterLevelFromPoints(s.totalPoints ?? 0);
                return `
                <tr style="border-bottom:1px solid var(--bg-main)">
                  <td style="padding:12px 0;">
                    <div style="font-size:0.75rem; color:var(--text-dim)">[${s.number || '-'}]</div>
                    <b>${s.name}</b><br/>
                    <small style="color:var(--primary); font-family:monospace">${s.uniqueCode}</small>
                  </td>
                  <td>${s.loginId ? `<span class="badge badge-blue">ID: ${s.loginId}</span>` : '<span class="badge">미가입</span>'}</td>
                  <td align="center">${renderCharacter(lv, 28, s.characterType, s.totalPoints)}</td>
                  <td align="right">
                    <div class="flex gap-xs justify-end">
                      <button class="btn btn-sm btn-ghost reset-btn" data-id="${s.id}" title="계정 초기화">🔄</button>
                      <button class="btn btn-sm btn-ghost pwd-btn" data-id="${s.id}" data-name="${s.name}" title="비번 변경">🔑</button>
                      <button class="btn btn-sm btn-ghost note-btn" data-id="${s.id}" data-name="${s.name}" title="쪽지 보내기">💬</button>
                      <button class="btn btn-sm btn-ghost del-btn" data-id="${s.id}" style="color:red" title="삭제">✕</button>
                    </div>
                  </td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div id="tab-add" class="hidden">
          <div style="display:flex; gap:10px; margin-bottom:20px;">
            <div class="form-group" style="flex:0 0 80px">
              <label class="input-label">번호</label>
              <input type="text" class="input-field" id="add-student-number" placeholder="번호" />
            </div>
            <div class="form-group" style="flex:1">
              <label class="input-label">이름 *</label>
              <input type="text" class="input-field" id="add-student-name" placeholder="학생 이름을 입력하세요" />
            </div>
          </div>
          <button class="btn btn-primary w-full" id="btn-add-single-student">학생 한 명 추가</button>
          
          <div style="margin: 30px 0; border-top: 1px solid var(--border-main); position: relative;">
            <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: white; padding: 0 10px; color: var(--text-dim); font-size: 0.8rem;">또는 여러 명 한꺼번에 추가</span>
          </div>
          
          <div class="form-group">
            <label class="input-label">이름 목록 (줄바꿈으로 구분)</label>
            <textarea class="input-field" id="add-students-batch" rows="5" placeholder="홍길동&#10;김철수&#10;이영희"></textarea>
          </div>
          <button class="btn btn-secondary w-full" id="btn-add-batch-students">학생 일괄 추가</button>
        </div>

        <div id="tab-excel" class="hidden">
          <div style="margin-bottom:20px; padding:15px; background:var(--bg-main); border-radius:8px; font-size:0.85rem">
            <div class="flex justify-between items-start">
              <div>
                <div style="font-weight:700; margin-bottom:4px">💡 엑셀 업로드 안내</div>
                <div style="color:var(--text-secondary)">
                  • 첫 줄에 '이름' 컬럼이 포함된 엑셀 파일을 업로드하세요.<br/>
                  • '번호' 컬럼도 있으면 자동으로 인식합니다.
                </div>
              </div>
              <button class="btn btn-outline btn-sm" id="btn-download-sample" style="border: 1px solid var(--primary); color: var(--primary);">📄 양식 받기</button>
            </div>
          </div>
          <div class="drop-zone" id="excel-drop-zone" style="height:150px">
            <div style="font-size:2rem">📄</div>
            <div>여기로 엑셀 파일을 끌어오거나 클릭하세요</div>
            <input type="file" id="excel-file-input" accept=".xlsx,.xls" class="hidden" />
          </div>
          <div id="excel-preview" class="hidden" style="margin-top:20px">
            <div class="flex justify-between items-center" style="margin-bottom:10px">
              <h4 style="margin:0">미리보기 (<span id="excel-count"></span>명)</h4>
              <button class="btn btn-primary btn-sm" id="btn-import-excel">확인 및 추가</button>
            </div>
            <div id="excel-names-list" style="max-height:150px; overflow-y:auto; padding:10px; border:1px solid var(--border-main); border-radius:8px; display:flex; flex-wrap:wrap; gap:5px;"></div>
          </div>
        </div>
      `;

      // Tab Events
      content.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          content.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const target = tab.dataset.tab;
          ['list', 'add', 'excel'].forEach(t => {
            document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== target);
          });
        });
      });

      // Actions
      document.getElementById('btn-go-to-add-tab')?.addEventListener('click', () => {
        content.querySelector('.tab[data-tab="add"]').click();
      });

      document.getElementById('btn-export-excel')?.addEventListener('click', () => {
        exportStudentsToExcel(students, cls.name);
      });

      document.getElementById('btn-download-sample')?.addEventListener('click', () => {
        downloadSampleExcel();
      });

      document.getElementById('btn-add-single-student')?.addEventListener('click', async () => {
        const name = document.getElementById('add-student-name').value.trim();
        const number = document.getElementById('add-student-number').value.trim();
        if (!name) return showToast('이름을 입력하세요.', 'error');
        await addStudent(name, classId, number);
        showToast('추가되었습니다.');
        renderStudentList();
      });

      document.getElementById('btn-add-batch-students')?.addEventListener('click', async () => {
        const text = document.getElementById('add-students-batch').value;
        const names = text.split('\n').map(n => n.trim()).filter(n => n);
        if (names.length === 0) return showToast('이름을 입력하세요.', 'error');
        await addStudentsBatch(names, classId);
        showToast(`${names.length}명 추가되었습니다.`);
        renderStudentList();
      });

      // Excel Logic
      const dropZone = document.getElementById('excel-drop-zone');
      const fileInput = document.getElementById('excel-file-input');
      let pendingBatch = [];

      dropZone?.addEventListener('click', () => fileInput.click());
      fileInput?.addEventListener('change', async (e) => {
        if (e.target.files[0]) {
          try {
            pendingBatch = await parseExcelFile(e.target.files[0]);
            document.getElementById('excel-count').textContent = pendingBatch.length;
            document.getElementById('excel-names-list').innerHTML = pendingBatch.map(s => `<span class="badge badge-blue">${s.name}</span>`).join('');
            document.getElementById('excel-preview').classList.remove('hidden');
          } catch (err) { showToast('파일 오류', 'error'); }
        }
      });

      document.getElementById('btn-import-excel')?.addEventListener('click', async () => {
        if (pendingBatch.length > 0) {
          await addStudentsBatch(pendingBatch, classId);
          showToast('임포트 완료');
          renderStudentList();
        }
      });

      // Account & Delete
      content.querySelectorAll('.reset-btn').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('계정을 초기화할까요?')) {
          const { resetStudentAuth } = await import('../../store.js');
          await resetStudentAuth(btn.dataset.id);
          renderStudentList();
        }
      }));

      content.querySelectorAll('.pwd-btn').forEach(btn => btn.addEventListener('click', async () => {
        const pw = prompt(`${btn.dataset.name} 학생의 새 비밀번호`);
        if (pw) {
          const { updateStudentPassword } = await import('../../store.js');
          await updateStudentPassword(btn.dataset.id, pw);
          showToast('비번 변경됨');
        }
      }));

      content.querySelectorAll('.note-btn').forEach(btn => btn.addEventListener('click', async () => {
        const message = prompt(`${btn.dataset.name} 학생에게 보낼 쪽지`);
        if (!message || !message.trim()) return;
        try {
          await createTeacherNoteToStudent({
            classId,
            teacherId: teacher.uid,
            teacherName: teacher.displayName || teacher.email || '선생님',
            className: cls.name || '',
            studentId: btn.dataset.id,
            studentName: btn.dataset.name || '',
            message,
          });
          showToast('학생에게 쪽지를 보냈습니다.');
        } catch (err) {
          console.error(err);
          showToast('쪽지 전송에 실패했습니다.', 'error');
        }
      }));

      content.querySelectorAll('.del-btn').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('정말 삭제하시겠습니까?')) {
          const { deleteStudent } = await import('../../store.js');
          await deleteStudent(btn.dataset.id);
          renderStudentList();
        }
      }));
    }

    await renderStudentList();
    openModal('student-manage-modal');
  }

  function openModal(id) { document.getElementById(id).classList.add('active'); }
  function closeModal(id) { document.getElementById(id).classList.remove('active'); }

  render();
}
