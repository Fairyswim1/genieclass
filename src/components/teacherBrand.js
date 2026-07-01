/** Genie Class 교사 UI 브랜드 에셋 (public/branding) */
const BASE = import.meta.env.BASE_URL || '/';

export const TEACHER_BRAND = {
    mascot: `${BASE}branding/genie-mascot.png`,
    favicon: `${BASE}branding/genie-mascot.png`,
};

export function renderSidebarBrand() {
    return `
      <div class="sidebar-logo brand-wordmark">
        <div class="brand-mark-wrap" aria-hidden="true">
          <img
            class="brand-mark"
            src="${TEACHER_BRAND.mascot}"
            alt=""
            width="36"
            height="36"
            decoding="async"
          />
        </div>
        <div class="sidebar-logo-text">Genie Class</div>
      </div>
    `;
}

export function renderAuthBrand(subtitle = '교사 계정으로 로그인') {
    return `
      <div class="auth-logo brand-auth">
        <div class="brand-mark-wrap brand-mark-wrap--lg" aria-hidden="true">
          <img
            class="brand-mark brand-mark--auth"
            src="${TEACHER_BRAND.mascot}"
            alt=""
            width="72"
            height="72"
            decoding="async"
          />
        </div>
        <h1 class="auth-title">Genie Class</h1>
        <p class="auth-subtitle">${subtitle}</p>
      </div>
    `;
}

export function renderDashboardHero(displayName) {
    const name = displayName || '선생님';
    return `
      <section class="dashboard-hero animate-fade-in-down" aria-label="환영 메시지">
        <div class="dashboard-hero__glow" aria-hidden="true"></div>
        <div class="dashboard-hero__inner">
          <div class="dashboard-hero__copy">
            <p class="dashboard-hero__eyebrow">Genie Class</p>
            <h1 class="dashboard-greeting">안녕하세요, <span>${name}</span> 선생님!</h1>
            <p class="dashboard-subtitle">오늘도 좋은 수업 되세요</p>
          </div>
          <div class="dashboard-hero__visual" aria-hidden="true">
            <img
              class="brand-mascot-hero"
              src="${TEACHER_BRAND.mascot}"
              alt=""
              width="220"
              height="280"
              decoding="async"
            />
          </div>
        </div>
      </section>
    `;
}
