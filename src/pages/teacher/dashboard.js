// ========================================
// Teacher Dashboard
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

  async function render() {
    classes = await getClassesByTeacher(teacher.uid);

    container.innerHTML = `
      <div class="teacher-layout">
        <!-- Sidebar -->
        <aside class="sidebar animate-slide-left">
          <div class="sidebar-header">
            <div class="sidebar-logo">
              <div class="sidebar-logo-icon">G</div>
              <div>
                <div class="sidebar-logo-text">Genie Class</div>
              </div>
            </div>
          </div>
          <div class="sidebar-classes">
            <div class="sidebar-section-title">내 클래스</div>
            ${classes.map(cls => `
              <div class="sidebar-class-item" data-class-id="${cls.id}">
                <div class="sidebar-class-icon" style="background:${cls.color}">${cls.name.charAt(0)}</div>
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
                  <div class="sidebar-user-role">교사</div>
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
            <p class="dashboard-subtitle">오늘도 좋은 수업 되세요 <span style="font-size: 0.7rem; opacity: 0.4;">v1.1.0</span></p>
          </div>

          <div class="section-header">
            <h2 class="section-title">내 클래스</h2>
            <button class="btn btn-primary btn-sm" id="btn-add-class">+ 새 클래스</button>
          </div>

          <div class="class-grid stagger-children" id="class-grid-container">
            ${await Promise.all(classes.map(async cls => {
      const students = await getStudentsByClass(cls.id);
      return `
                <div class="card card-clickable class-card" data-class-id="${cls.id}" draggable="true">
                  <div class="class-card-banner" style="background:${cls.color}">
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
    })).then(results => results.join(''))}
            <div class="add-class-card" id="add-class-card">
              <div class="add-class-icon">＋</div>
              <span>새 클래스 만들기</span>
            </div>
          </div>
          <style>
            .class-card-banner { position: relative; }
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
            .class-card.drag-over { border: 2px dashed var(--primary); }
          </style>
          </div>
        </main>
      </div>

      <!-- Create Class Modal -->
      <div class="modal-backdrop" id="create-class-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">새 클래스 만들기</h3>
            <button class="modal-close" id="close-create-modal">✕</button>
          </div>
          <form id="create-class-form">
            <div class="form-group">
              <label class="input-label">클래스 이름</label>
              <input type="text" class="input-field" id="class-name-input" placeholder="예: 3학년 1반" required autocomplete="off" />
            </div>
            <button type="submit" class="btn btn-primary w-full">클래스 생성</button>
          </form>
        </div>
      </div>

      <!-- Student Management Modal -->
      <div class="modal-backdrop" id="student-manage-modal">
        <div class="modal-content" style="max-width:700px">
          <div class="modal-header">
            <h3 class="modal-title" id="manage-modal-title">학생 관리</h3>
            <button class="modal-close" id="close-manage-modal">✕</button>
          </div>
          <div id="student-manage-content"></div>
        </div>
      </div>

      <!-- Mode Selection Modal -->
      <div class="modal-backdrop" id="mode-select-modal">
        <div class="modal-content" style="max-width:600px;background:transparent;border:none;box-shadow:none;">
          <div class="mode-selection" id="mode-selection-btns"></div>
        </div>
      </div>
    `;

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

  function openColorPicker(classId, currentColor) {
    const existing = document.getElementById('color-picker-modal');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.id = 'color-picker-modal';
    picker.className = 'modal-backdrop active';
    picker.innerHTML = `
      <div class="modal-content" style="max-width: 400px; text-align: center;">
        <h3 class="modal-title" style="margin-bottom: var(--s-6);">🎨 클래스 색상 변경</h3>
        <div class="grid" style="grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: var(--s-8);">
          ${PRESET_COLORS.map(color => `
            <div class="color-swatch ${color === currentColor ? 'selected' : ''}" 
                 data-color="${color}" 
                 style="background: ${color}; width: 100%; aspect-ratio: 1; border-radius: 8px; cursor: pointer; border: 3px solid transparent;">
            </div>
          `).join('')}
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-ghost flex-1" id="btn-close-picker">취소</button>
          <button class="btn btn-primary flex-1" id="btn-save-color" disabled>변경하기</button>
        </div>
      </div>
      <style>
        .color-swatch.selected { border-color: var(--primary) !important; transform: scale(1.1); }
        .color-swatch:hover { transform: scale(1.1); }
      </style>
    `;
    document.body.appendChild(picker);

    let selectedColor = currentColor;
    picker.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        selectedColor = sw.dataset.color;
        document.getElementById('btn-save-color').disabled = false;
      });
    });

    document.getElementById('btn-close-picker').addEventListener('click', () => picker.remove());
    document.getElementById('btn-save-color').addEventListener('click', async () => {
      const { updateClassColor } = await import('../../store.js');
      await updateClassColor(classId, selectedColor);
      showToast('클래스 색상이 변경되었습니다.');
      picker.remove();
      render();
    });
  }

  function bindEvents() {
    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
      await logoutTeacher();
      window.location.hash = '/teacher/login';
    });

    // Add class buttons
    const addClassBtns = [
      document.getElementById('btn-add-class'),
      document.getElementById('add-class-card'),
      document.getElementById('sidebar-add-class'),
    ];
    addClassBtns.forEach(btn => {
      if (btn) btn.addEventListener('click', () => openModal('create-class-modal'));
    });

    // Close modals
    document.getElementById('close-create-modal')?.addEventListener('click', () => closeModal('create-class-modal'));
    document.getElementById('close-manage-modal')?.addEventListener('click', () => closeModal('student-manage-modal'));

    // Click backdrop to close
    ['create-class-modal', 'student-manage-modal', 'mode-select-modal'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) closeModal(id);
      });
    });

    // Create class form
    document.getElementById('create-class-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('class-name-input').value.trim();
      if (!name) return;
      await createClass(name, teacher.uid);
      showToast(`'${name}' 클래스가 생성되었습니다!`);
      closeModal('create-class-modal');
      render();
    });

    // Class card actions
    document.querySelectorAll('.class-enter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const classId = btn.dataset.classId;
        openModeSelection(classId);
      });
    });

    document.querySelectorAll('.class-manage-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openStudentManagement(btn.dataset.classId);
      });
    });

    document.querySelectorAll('.class-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('정말 이 클래스를 삭제하시겠습니까? 관련된 모든 데이터가 삭제됩니다.')) {
          await deleteClass(btn.dataset.classId);
          showToast('클래스가 삭제되었습니다.');
          render();
        }
      });
    });

    // Sidebar class click
    document.querySelectorAll('.sidebar-class-item[data-class-id]').forEach(item => {
      item.addEventListener('click', () => {
        openModeSelection(item.dataset.classId);
      });
    });

    // Class card click
    document.querySelectorAll('.class-card[data-class-id]').forEach(card => {
      card.addEventListener('click', () => {
        openModeSelection(card.dataset.classId);
      });
    });

    // Color edit
    document.querySelectorAll('.btn-edit-color').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cls = classes.find(c => c.id === btn.dataset.classId);
        openColorPicker(cls.id, cls.color);
      });
    });

    // Drag and drop for reordering
    const containerGrid = document.getElementById('class-grid-container');
    const draggables = containerGrid.querySelectorAll('.class-card[draggable="true"]');
    
    draggables.forEach(draggable => {
      draggable.addEventListener('dragstart', () => {
        draggable.classList.add('dragging');
      });

      draggable.addEventListener('dragend', async () => {
        draggable.classList.remove('dragging');
        
        // Save new order
        const newOrderCards = [...containerGrid.querySelectorAll('.class-card')];
        const newOrderData = newOrderCards.map((card, index) => ({
          id: card.dataset.classId,
          order: index
        }));
        
        const { updateClassOrder } = await import('../../store.js');
        await updateClassOrder(newOrderData);
        showToast('클래스 순서가 저장되었습니다.');
      });

      draggable.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(containerGrid, e.clientX, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (afterElement == null) {
          containerGrid.insertBefore(dragging, document.getElementById('add-class-card'));
        } else {
          containerGrid.insertBefore(dragging, afterElement);
        }
      });
    });

    function getDragAfterElement(container, x, y) {
      const draggableElements = [...container.querySelectorAll('.class-card:not(.dragging)')];

      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2; // Simple horizontal check for grid
        const offsetY = y - box.top - box.height / 2;
        
        // Combined distance for better grid feel
        const distance = Math.sqrt(offset*offset + offsetY*offsetY);
        
        if (distance < closest.offset) {
          return { offset: distance, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.POSITIVE_INFINITY }).element;
    }
  }

  function openModal(id) {
    document.getElementById(id).classList.add('active');
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove('active');
  }

  function openModeSelection(classId) {
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;

    const modalBtns = document.getElementById('mode-selection-btns');
    modalBtns.innerHTML = `
      <div class="mode-card card card-clickable" id="mode-lesson-btn">
        <span class="mode-card-icon">📚</span>
        <div class="mode-card-title">수업 모드</div>
        <div class="mode-card-desc">학생 캐릭터를 보며<br/>칭찬과 발표를 기록합니다</div>
      </div>
      <div class="mode-card card card-clickable" id="mode-assign-btn">
        <span class="mode-card-icon">📝</span>
        <div class="mode-card-title">과제 모드</div>
        <div class="mode-card-desc">과제, 공지사항, 자료를<br/>관리합니다</div>
      </div>
    `;

    openModal('mode-select-modal');

    document.getElementById('mode-lesson-btn').addEventListener('click', () => {
      closeModal('mode-select-modal');
      window.location.hash = `/teacher/class/${classId}/lesson`;
    });

    document.getElementById('mode-assign-btn').addEventListener('click', () => {
      closeModal('mode-select-modal');
      window.location.hash = `/teacher/class/${classId}/assign`;
    });
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
          <div class="tab" data-tab="add">추가</div>
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
          ${students.length === 0 ? `
            <div class="empty-state">
              <div class="empty-state-icon">👤</div>
              <div class="empty-state-text">아직 학생이 없습니다</div>
            </div>
          ` : `
            <table class="student-table">
              <thead>
                <tr>
                  <th style="width:60px">번호</th>
                  <th>이름</th>
                  <th>고유코드</th>
                  <th>레벨</th>
                  <th>칭찬</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${students.map(s => `
                  <tr>
                    <td><span style="color:var(--text-secondary)">${s.number || '-'}</span></td>
                    <td><span style="font-weight:600">${s.name}</span></td>
                    <td><span class="student-code">${s.uniqueCode}</span></td>
                    <td>
                      <div class="flex items-center gap-sm">
                        ${renderCharacter(s.characterLevel, 32, s.characterType || 'apple', s.totalPoints)}
                        <span class="badge badge-primary">Lv.${s.characterLevel}</span>
                      </div>
                    </td>
                    <td><span class="badge badge-gold">⭐ ${s.totalPoints}</span></td>
                    <td><button class="btn btn-ghost btn-sm delete-student-btn" data-student-id="${s.id}" style="color:var(--red);font-size:0.8rem">삭제</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div id="tab-add" class="hidden">
          <div style="display:flex; gap:10px">
            <div class="form-group" style="flex:0 0 80px">
              <label class="input-label">번호</label>
              <input type="text" class="input-field" id="add-student-number" placeholder="번호" autocomplete="off" />
            </div>
            <div class="form-group" style="flex:1">
              <label class="input-label">이름 <span style="color:var(--red)">*</span></label>
              <input type="text" class="input-field" id="add-student-name" placeholder="학생 이름을 입력하세요" autocomplete="off" />
            </div>
          </div>
          <button class="btn btn-primary w-full" id="btn-add-single-student">학생 추가</button>
          <div class="divider"></div>
          <div class="form-group">
            <label class="input-label">여러 학생 추가 (줄바꿈으로 구분)</label>
            <textarea class="input-field" id="add-students-batch" rows="5" placeholder="홍길동&#10;김철수&#10;이영희" style="resize:vertical"></textarea>
          </div>
          <button class="btn btn-primary w-full" id="btn-add-batch-students">일괄 추가</button>
        </div>

        <div id="tab-excel" class="hidden">
          <div style="margin-bottom:var(--space-md); padding:var(--space-md); background:var(--bg-body); border-radius:var(--radius-md); font-size:0.85rem">
            <div class="flex justify-between items-start">
              <div>
                <div style="font-weight:600; margin-bottom:4px">💡 엑셀 파일 형식</div>
                <div style="color:var(--text-secondary)">
                  • 첫 줄은 제목(헤더)이어야 합니다.<br/>
                  • <span style="font-weight:600; color:var(--primary-light)">'이름'</span> 컬럼은 필수입니다.<br/>
                  • <span style="font-weight:600">'번호'</span> 컬럼은 선택사항입니다.
                </div>
              </div>
              <button class="btn btn-outline btn-sm" id="btn-download-sample" style="border: 1px solid var(--primary); color: var(--primary); padding: 4px 10px;">📄 예시 다운로드</button>
            </div>
          </div>
          <div class="drop-zone" id="excel-drop-zone">
            <div class="drop-zone-icon">📄</div>
            <div>엑셀 파일을 드래그하거나 클릭하여 업로드</div>
            <div style="font-size:0.8rem;margin-top:var(--space-sm);color:var(--text-tertiary)">.xlsx, .xls 파일 지원</div>
            <input type="file" id="excel-file-input" accept=".xlsx,.xls" style="display:none" />
          </div>
          <div id="excel-preview" class="hidden" style="margin-top:var(--space-lg)">
            <div class="section-header">
              <h4 class="section-title">읽어온 학생 목록</h4>
              <span class="badge badge-green" id="excel-count"></span>
            </div>
            <div id="excel-names-list" style="margin-bottom:var(--space-lg)"></div>
            <button class="btn btn-primary w-full" id="btn-import-excel">학생 추가</button>
          </div>
        </div>
      `;

      // Tab switching function
      function switchTab(tabName) {
        content.querySelectorAll('.tab').forEach(t => {
          const isActive = t.dataset.tab === tabName;
          t.classList.toggle('active', isActive);
          document.getElementById(`tab-${t.dataset.tab}`).classList.toggle('hidden', !isActive);
        });
      }

      content.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
      });

      // Export/Add helpers
      document.getElementById('btn-export-excel')?.addEventListener('click', () => {
        exportStudentsToExcel(students, cls.name);
      });

      document.getElementById('btn-go-to-add-tab')?.addEventListener('click', () => {
        switchTab('add');
      });

      document.getElementById('btn-download-sample')?.addEventListener('click', () => {
        downloadSampleExcel();
      });

      // Add single student
      document.getElementById('btn-add-single-student')?.addEventListener('click', async () => {
        const name = document.getElementById('add-student-name').value.trim();
        const number = document.getElementById('add-student-number').value.trim();
        if (!name) { showToast('이름을 입력해주세요.', 'error'); return; }
        await addStudent(name, classId, number);
        showToast(`${name} 학생이 추가되었습니다!`);
        await renderStudentList();
      });

      // Add batch students
      document.getElementById('btn-add-batch-students')?.addEventListener('click', async () => {
        const text = document.getElementById('add-students-batch').value;
        const names = text.split('\n').map(n => n.trim()).filter(n => n);
        if (names.length === 0) { showToast('학생 이름을 입력해주세요.', 'error'); return; }
        await addStudentsBatch(names, classId);
        showToast(`${names.length}명의 학생이 추가되었습니다!`);
        await renderStudentList();
      });

      // Excel drop zone
      const dropZone = document.getElementById('excel-drop-zone');
      const fileInput = document.getElementById('excel-file-input');
      let pendingStudents = [];

      if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropZone.classList.remove('drag-over');
          handleExcelFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
          if (e.target.files[0]) handleExcelFile(e.target.files[0]);
        });
      }

      async function handleExcelFile(file) {
        try {
          const students = await parseExcelFile(file);
          if (students.length === 0) {
            showToast('파일에서 학생 이름을 찾을 수 없습니다.', 'error');
            return;
          }
          pendingStudents = students;
          document.getElementById('excel-preview').classList.remove('hidden');
          document.getElementById('excel-count').textContent = `${students.length}명`;
          document.getElementById('excel-names-list').innerHTML = students.map(s =>
            `<div class="badge badge-primary" style="margin:2px">
              ${s.number ? `<small style="opacity:0.7;margin-right:4px">${s.number}</small>` : ''}${s.name}
            </div>`
          ).join('');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }

      document.getElementById('btn-import-excel')?.addEventListener('click', async () => {
        if (pendingStudents.length > 0) {
          await addStudentsBatch(pendingStudents, classId);
          showToast(`${pendingStudents.length}명의 학생이 추가되었습니다!`);
          pendingStudents = [];
          await renderStudentList();
        }
      });

      // Delete student
      content.querySelectorAll('.delete-student-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const { deleteStudent } = await import('../../store.js');
          await deleteStudent(btn.dataset.studentId);
          showToast('학생이 삭제되었습니다.');
          await renderStudentList();
        });
      });
    }

    await renderStudentList();
    openModal('student-manage-modal');
  }

  render();
}
