// ========================================
// Teacher Dashboard (v1.1.5)
// ========================================
import {
  getCurrentTeacher, logoutTeacher, getClassesByTeacher,
  createClass, getStudentsByClass, deleteClass, addStudent,
  addStudentsBatch, showToast, formatDate
} from '../../store.js';
import { parseExcelFile, downloadSampleExcel, exportStudentsToExcel } from '../../utils/excelImport.js';
import { renderCharacter } from '../../components/characterAvatar.js';

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
          <div style="font-size:0.95rem; color:var(--text-muted); line-height:1.5;">실시간 수업을 진행하며 학생들에게 캐릭터 칭찬을 해주고 발표를 기록합니다.</div>
        </div>
      </div>
      <div class="mode-card card card-clickable animate-up" onclick="window.location.hash='/teacher/class/${classId}/assign'" style="width:100%; height:auto; min-height:120px; text-align:left; display:flex; align-items:center; gap:20px; padding:25px; animation-delay:0.1s;">
        <span style="font-size:3rem;">📝</span>
        <div>
          <div style="font-size:1.4rem; font-weight:800; margin-bottom:8px;">과제 및 자료 관리</div>
          <div style="font-size:0.95rem; color:var(--text-muted); line-height:1.5;">공지사항 게시, 과제 출제 및 학생들의 제출물을 확인하고 관리합니다.</div>
        </div>
      </div>
    `;
    openModal('mode-select-modal');
  }

  async function openStudentManagement(classId) {
    const content = document.getElementById('student-manage-content');
    async function refresh() {
      const students = await getStudentsByClass(classId);
      content.innerHTML = `
        <div class="tabs"><div class="tab active">학생 목록</div></div>
        <table class="student-table" style="width:100%; border-collapse:collapse; margin-top:20px;">
          <thead>
            <tr style="border-bottom:2px solid var(--bg-main)">
              <th align="left">이름</th>
              <th align="left">아이디</th>
              <th align="center">성장</th>
              <th align="right">관리</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(s => `
              <tr style="border-bottom:1px solid var(--bg-main)">
                <td style="padding:12px 0;"><b>${s.name}</b><br/><small style="color:var(--primary)">${s.uniqueCode}</small></td>
                <td>${s.loginId ? `<span class="badge badge-blue">ID: ${s.loginId}</span>` : '<span class="badge">미가입</span>'}</td>
                <td align="center">${renderCharacter(s.characterLevel, 24, s.characterType, s.totalPoints)}</td>
                <td align="right">
                  <button class="btn btn-sm btn-ghost reset-btn" data-id="${s.id}">🔄</button>
                  <button class="btn btn-sm btn-ghost pwd-btn" data-id="${s.id}" data-name="${s.name}">🔑</button>
                  <button class="btn btn-sm btn-ghost del-btn" data-id="${s.id}" style="color:red">✕</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      content.querySelectorAll('.reset-btn').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('계정을 초기화할까요?')) {
            const { resetStudentAuth } = await import('../../store.js');
            await resetStudentAuth(btn.dataset.id);
            refresh();
        }
      }));
      content.querySelectorAll('.pwd-btn').forEach(btn => btn.addEventListener('click', async () => {
        const pw = prompt(`${btn.dataset.name} 학생의 새 비밀번호`);
        if (pw) {
            const { updateStudentPassword } = await import('../../store.js');
            await updateStudentPassword(btn.dataset.id, pw);
            showToast('변경됨');
        }
      }));
      content.querySelectorAll('.del-btn').forEach(btn => btn.addEventListener('click', async () => {
        if (confirm('학생을 삭제할까요?')) {
            const { deleteStudent } = await import('../../store.js');
            await deleteStudent(btn.dataset.id);
            refresh();
        }
      }));
    }
    await refresh();
    openModal('student-manage-modal');
  }

  function openModal(id) { document.getElementById(id).classList.add('active'); }
  function closeModal(id) { document.getElementById(id).classList.remove('active'); }

  render();
}
