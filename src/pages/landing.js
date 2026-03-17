// ========================================
// Landing Page - 교사/학생 선택
// ========================================

export function renderLanding(container) {
    container.innerHTML = `
    <div class="star-bg"></div>
    <div class="landing-page animate-fade-in">
      <div class="landing-hero">
        <div class="landing-logo">G</div>
        <h1 class="landing-title">
          <span>Genie</span> Class
        </h1>
        <p class="landing-desc">
          수업 관리부터 발표 기록, 과제 제출까지<br/>
          교실의 모든 순간을 함께합니다
        </p>
        <div class="landing-buttons">
          <div class="landing-role-btn" id="btn-teacher-login">
            <span class="landing-role-icon">👨‍🏫</span>
            <div class="landing-role-title">교사</div>
            <div class="landing-role-desc">클래스를 만들고 관리하세요</div>
          </div>
          <div class="landing-role-btn" id="btn-student-login">
            <span class="landing-role-icon">🎓</span>
            <div class="landing-role-title">학생</div>
            <div class="landing-role-desc">수업에 참여하세요</div>
          </div>
        </div>
      </div>
    </div>
  `;

    document.getElementById('btn-teacher-login').addEventListener('click', () => {
        window.location.hash = '/teacher/login';
    });

    document.getElementById('btn-student-login').addEventListener('click', () => {
        window.location.hash = '/student/login';
    });
}
