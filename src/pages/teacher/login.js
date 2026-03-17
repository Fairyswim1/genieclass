// ========================================
// Teacher Login Page
// ========================================
import { loginWithGoogle, showToast } from '../../store.js';

export function renderTeacherLogin(container) {
  function render() {
    container.innerHTML = `
      <div class="star-bg"></div>
      <div class="login-page">
        <div class="login-container glass animate-scale-in">
          <div class="login-logo">
            <div class="login-logo-icon">G</div>
            <h1 class="login-title">Genie Class</h1>
            <p class="login-subtitle">교사 계정으로 로그인 (Firebase)</p>
          </div>
          
          <div class="login-methods">
            <button class="btn btn-primary btn-lg w-full" id="google-login-btn" style="background: white; color: #444; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; gap: 10px;">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" />
              구글로 로그인하기
            </button>
          </div>

          <div class="divider" style="margin: 24px 0;"><span>또는</span></div>
          
          <form class="login-form" id="teacher-login-form">
            <div class="form-group">
              <label class="input-label">이름 (Legacy)</label>
              <input type="text" class="input-field" id="teacher-name" placeholder="이름을 입력하세요" required autocomplete="off" />
            </div>
            <button type="submit" class="btn btn-ghost btn-lg w-full" id="login-submit-btn">
              계속하기
            </button>
          </form>

          <div class="divider"></div>
          <div class="text-center">
            <a style="cursor:pointer;font-size:0.85rem;color:var(--text-tertiary)" id="back-to-landing">← 처음으로</a>
          </div>
        </div>
      </div>
    `;

    // Events
    document.getElementById('google-login-btn').addEventListener('click', async () => {
      const result = await loginWithGoogle();
      if (result.error) {
        showToast(result.error, 'error');
      } else {
        showToast(`${result.data.displayName}님 환영합니다!`, 'success');
        window.location.hash = '/teacher/dashboard';
      }
    });

    document.getElementById('teacher-login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      showToast('구글 로그인을 이용해 주세요.', 'info');
    });

    document.getElementById('back-to-landing').addEventListener('click', () => {
      window.location.hash = '/';
    });
  }

  render();
}
