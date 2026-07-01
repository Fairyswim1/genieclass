import { renderSidebarBrand, TEACHER_BRAND } from './teacherBrand.js';
import { formatDate } from '../store.js';

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderTeacherSidebar({ teacher, classes, unreadNoteCount }) {
  const initial = (teacher.displayName || teacher.email || 'T').charAt(0);
  return `
    <aside class="sidebar sidebar--premium animate-slide-left">
      <div class="sidebar-header">
        ${renderSidebarBrand()}
        <p class="sidebar-tagline">스마트 교실 워크스페이스</p>
      </div>

      <nav class="sidebar-nav" aria-label="교사 메뉴">
        <div class="sidebar-nav-group">
          <div class="sidebar-section-title">워크스페이스</div>
          <a class="sidebar-nav-item sidebar-nav-item--active" href="#/teacher/dashboard">
            <span class="sidebar-nav-icon" aria-hidden="true">🏠</span>
            <span>대시보드</span>
          </a>
        </div>

        <div class="sidebar-nav-group">
          <div class="sidebar-section-title">내 클래스</div>
          ${classes.length === 0 ? `
            <p class="sidebar-empty-hint">아직 클래스가 없습니다</p>
          ` : classes.map((cls) => `
            <button type="button" class="sidebar-class-item sidebar-nav-item" data-class-id="${cls.id}" data-sidebar-enter>
              <span class="sidebar-class-icon" style="background:${cls.color || 'var(--primary)'}">${escHtml(cls.name.charAt(0))}</span>
              <span class="sidebar-class-label">${escHtml(cls.name)}</span>
            </button>
          `).join('')}
          <button type="button" class="sidebar-class-item sidebar-nav-item sidebar-nav-item--dashed" id="sidebar-add-class">
            <span class="sidebar-class-icon add-class-sidebar-icon">+</span>
            <span>클래스 추가</span>
          </button>
        </div>

        <div class="sidebar-nav-group">
          <div class="sidebar-section-title">소통</div>
          <button type="button" class="sidebar-inbox-trigger sidebar-nav-item ${unreadNoteCount ? 'sidebar-inbox-trigger--unread' : ''}" id="btn-open-notes-inbox" aria-label="학생 쪽지함 열기">
            <span class="sidebar-nav-icon" aria-hidden="true">📬</span>
            <span class="sidebar-inbox-text">쪽지함</span>
            ${unreadNoteCount ? `<span class="sidebar-badge">${unreadNoteCount > 99 ? '99+' : unreadNoteCount}</span>` : ''}
          </button>
        </div>
      </nav>

      <div class="sidebar-footer sidebar-footer--premium">
        <div class="sidebar-user-card">
          <div class="sidebar-user">
            <div class="sidebar-user-avatar">${escHtml(initial)}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${escHtml(teacher.displayName || '선생님')}</div>
              <div class="sidebar-user-role">교사 · v1.1.5</div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm w-full sidebar-logout-btn" id="btn-logout">로그아웃</button>
        </div>
      </div>
    </aside>
  `;
}

export function renderDashboardHero(displayName, { unreadNoteCount = 0 } = {}) {
  const name = escHtml(displayName || '선생님');
  const inboxLabel = unreadNoteCount > 0 ? `쪽지함 (${unreadNoteCount})` : '쪽지함';

  return `
    <section class="dashboard-hero dashboard-hero--premium animate-fade-in-down" aria-label="환영 메시지">
      <div class="dashboard-hero__glow" aria-hidden="true"></div>
      <div class="dashboard-hero__inner">
        <div class="dashboard-hero__copy">
          <p class="dashboard-hero__eyebrow">Genie Class</p>
          <h1 class="dashboard-greeting">안녕하세요, <span>${name}</span> 선생님</h1>
          <p class="dashboard-subtitle">마법 같은 수업 비서가 클래스·발표·과제·기록을 한곳에서 돕습니다.</p>
          <div class="dashboard-hero__actions">
            <button type="button" class="btn btn-primary" id="btn-hero-new-class">+ 새 클래스</button>
            <button type="button" class="btn btn-secondary" id="btn-hero-inbox">${inboxLabel}</button>
          </div>
        </div>
        <div class="dashboard-hero__visual" aria-hidden="true">
          <img class="brand-mascot-hero" src="${TEACHER_BRAND.mascot}" alt="" width="220" height="280" decoding="async" />
        </div>
      </div>
    </section>
  `;
}

export function renderDashboardStats({ classCount, studentCount, unreadNoteCount, recentActivityCount }) {
  return `
    <div class="dash-stats-grid stagger-children">
      <div class="dash-stat-card">
        <div class="dash-stat-card__icon dash-stat-card__icon--violet" aria-hidden="true">📚</div>
        <div class="dash-stat-card__body">
          <p class="dash-stat-card__label">운영 클래스</p>
          <p class="dash-stat-card__value">${classCount}</p>
        </div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-card__icon dash-stat-card__icon--blue" aria-hidden="true">👥</div>
        <div class="dash-stat-card__body">
          <p class="dash-stat-card__label">전체 학생</p>
          <p class="dash-stat-card__value">${studentCount}</p>
        </div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-card__icon dash-stat-card__icon--amber" aria-hidden="true">📬</div>
        <div class="dash-stat-card__body">
          <p class="dash-stat-card__label">읽지 않은 쪽지</p>
          <p class="dash-stat-card__value">${unreadNoteCount}</p>
        </div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-card__icon dash-stat-card__icon--mint" aria-hidden="true">✨</div>
        <div class="dash-stat-card__body">
          <p class="dash-stat-card__label">최근 활동</p>
          <p class="dash-stat-card__value">${recentActivityCount}</p>
        </div>
      </div>
    </div>
  `;
}

export function renderDashboardPanels({ classes, teacherNotes }) {
  const firstClass = classes[0];
  const shortcuts = firstClass ? [
    { icon: '📚', label: '수업 모드', desc: `${firstClass.name} · 발표·퀴즈`, hash: `/teacher/class/${firstClass.id}/lesson` },
    { icon: '📝', label: '과제·자료', desc: `${firstClass.name} · 공지·과제`, hash: `/teacher/class/${firstClass.id}/assign` },
  ] : [];

  const recent = (teacherNotes || []).slice(0, 4);

  return `
    <div class="dash-panels-grid">
      <section class="dash-panel card">
        <div class="dash-panel__head">
          <h2 class="dash-panel__title">오늘의 바로가기</h2>
          <p class="dash-panel__desc">자주 쓰는 수업 도구로 빠르게 이동하세요.</p>
        </div>
        <div class="dash-shortcuts">
          ${shortcuts.length > 0 ? shortcuts.map((s) => `
            <a class="dash-shortcut" href="#${s.hash}">
              <span class="dash-shortcut__icon" aria-hidden="true">${s.icon}</span>
              <span class="dash-shortcut__text">
                <span class="dash-shortcut__label">${escHtml(s.label)}</span>
                <span class="dash-shortcut__meta">${escHtml(s.desc)}</span>
              </span>
              <span class="dash-shortcut__arrow" aria-hidden="true">→</span>
            </a>
          `).join('') : `
            <div class="dash-empty-inline">
              <p>클래스를 만든 뒤 수업·과제 바로가기가 표시됩니다.</p>
              <button type="button" class="btn btn-primary btn-sm" id="btn-panel-new-class">+ 새 클래스</button>
            </div>
          `}
          <button type="button" class="dash-shortcut dash-shortcut--ghost" id="btn-panel-inbox">
            <span class="dash-shortcut__icon" aria-hidden="true">💌</span>
            <span class="dash-shortcut__text">
              <span class="dash-shortcut__label">학생 쪽지함</span>
              <span class="dash-shortcut__meta">학생 메시지 확인·답장</span>
            </span>
            <span class="dash-shortcut__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section class="dash-panel card">
        <div class="dash-panel__head">
          <h2 class="dash-panel__title">최근 활동</h2>
          <p class="dash-panel__desc">학생 쪽지와 소통 기록</p>
        </div>
        ${recent.length === 0 ? `
          <div class="dash-empty-inline dash-empty-inline--soft">
            <p>아직 기록된 활동이 없습니다.</p>
          </div>
        ` : `
          <ul class="dash-activity-list">
            ${recent.map((n) => {
              const preview = String(n.message || '').length > 56
                ? `${String(n.message).slice(0, 56)}…`
                : (n.message || '');
              return `
                <li class="dash-activity-item ${n.read ? '' : 'dash-activity-item--unread'}">
                  <div class="dash-activity-item__top">
                    <strong>${escHtml(n.studentName || '학생')}</strong>
                    <span>${escHtml(n.className || '클래스')}</span>
                  </div>
                  <p class="dash-activity-item__msg">${escHtml(preview)}</p>
                  <time class="dash-activity-item__time">${formatDate(n.createdAt)}</time>
                </li>
              `;
            }).join('')}
          </ul>
        `}
      </section>
    </div>
  `;
}

export function renderPremiumClassCard(cls, studentCount) {
  const color = cls.color || 'linear-gradient(135deg, #5B21B6, #7C3AED)';
  return `
    <article class="card card-clickable class-card class-card--premium" data-class-id="${cls.id}" draggable="true">
      <div class="class-card__accent" style="background:${color}"></div>
      <div class="class-card__inner">
        <div class="class-card__head">
          <div class="class-card__avatar" style="background:${color}">${escHtml(cls.name.charAt(0))}</div>
          <div class="class-card__meta-block">
            <h3 class="class-card-name">${escHtml(cls.name)}</h3>
            <p class="class-card-info"><span class="class-card-info__dot" aria-hidden="true"></span>${studentCount}명 · 수업·과제 관리</p>
          </div>
          <button type="button" class="btn-edit-color" data-class-id="${cls.id}" title="색상 변경" aria-label="클래스 색상 변경">🎨</button>
        </div>
        <div class="class-card-actions">
          <button type="button" class="btn btn-primary btn-sm class-enter-btn" data-class-id="${cls.id}">수업 시작</button>
          <button type="button" class="btn btn-secondary btn-sm class-manage-btn" data-class-id="${cls.id}">학생</button>
          <button type="button" class="btn btn-ghost btn-sm class-delete-btn" data-class-id="${cls.id}">삭제</button>
        </div>
      </div>
    </article>
  `;
}

export function renderAddClassCard() {
  return `
    <button type="button" class="add-class-card add-class-card--premium" id="add-class-card">
      <div class="add-class-card__ring" aria-hidden="true">
        <span class="add-class-icon">+</span>
      </div>
      <span class="add-class-card__title">새 클래스 만들기</span>
      <span class="add-class-card__desc">학급을 추가하고 수업·과제를 시작하세요</span>
    </button>
  `;
}

export function renderClassesSectionHeader() {
  return `
    <div class="dash-section-head">
      <div>
        <h2 class="section-title">내 클래스</h2>
        <p class="dash-section-desc">드래그로 순서를 바꿀 수 있습니다.</p>
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="btn-add-class">+ 새 클래스</button>
    </div>
  `;
}
