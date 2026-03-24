// ========================================
// Teacher Login Page
// ========================================
import { loginWithGoogle, showToast } from '../../store.js';

export function renderTeacherLogin(container) {
  function render() {
    container.innerHTML = `
      <div class="star-bg"></div>
      <div class="auth-page page-enter">
        <div class="auth-card animate-scale-in">
          <div class="auth-logo">
            <div class="auth-logo-icon">G</div>
            <h1 class="auth-title">Genie Class</h1>
            <p class="auth-subtitle">교사 계정으로 로그인 (Firebase)</p>
          </div>
          
          <div class="login-methods">
            <button class="btn btn-secondary btn-lg w-full" id="google-login-btn" style="background: white; color: #444; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; gap: 10px;">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" />
              구글로 로그인하기
            </button>
          </div>

          <div class="text-center" style="margin-top: var(--s-8);">
            <a style="cursor:pointer; font-size: 0.85rem; color: var(--text-dim); font-weight: 500;" id="back-to-landing">
              ← 처음으로 돌아가기
            </a>
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


    document.getElementById('back-to-landing').addEventListener('click', () => {
      window.location.hash = '/';
    });
  }

  render();
}
