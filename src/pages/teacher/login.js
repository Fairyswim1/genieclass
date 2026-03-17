// ========================================
// Teacher Login Page
// ========================================
import { loginTeacher, registerTeacher, showToast } from '../../store.js';

export function renderTeacherLogin(container) {
    let isRegister = false;

    function render() {
        container.innerHTML = `
      <div class="star-bg"></div>
      <div class="login-page">
        <div class="login-container glass animate-scale-in">
          <div class="login-logo">
            <div class="login-logo-icon">G</div>
            <h1 class="login-title">Genie Class</h1>
            <p class="login-subtitle">${isRegister ? '새로운 교사 계정을 만드세요' : '교사 계정으로 로그인하세요'}</p>
          </div>
          <form class="login-form" id="teacher-login-form">
            <div class="form-group">
              <label class="input-label">이름</label>
              <input type="text" class="input-field" id="teacher-name" placeholder="이름을 입력하세요" required autocomplete="off" />
            </div>
            <div class="form-group">
              <label class="input-label">비밀번호</label>
              <input type="password" class="input-field" id="teacher-password" placeholder="비밀번호를 입력하세요" required />
            </div>
            ${isRegister ? `
              <div class="form-group">
                <label class="input-label">비밀번호 확인</label>
                <input type="password" class="input-field" id="teacher-password-confirm" placeholder="비밀번호를 다시 입력하세요" required />
              </div>
            ` : ''}
            <button type="submit" class="btn btn-primary btn-lg w-full" id="login-submit-btn">
              ${isRegister ? '회원가입' : '로그인'}
            </button>
          </form>
          <div class="login-switch">
            ${isRegister
                ? '이미 계정이 있으신가요? <a id="switch-login">로그인</a>'
                : '아직 계정이 없으신가요? <a id="switch-register">회원가입</a>'
            }
          </div>
          <div class="divider"></div>
          <div class="text-center">
            <a style="cursor:pointer;font-size:0.85rem;color:var(--text-tertiary)" id="back-to-landing">← 처음으로</a>
          </div>
        </div>
      </div>
    `;

        // Events
        document.getElementById('teacher-login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('teacher-name').value.trim();
            const password = document.getElementById('teacher-password').value;

            if (isRegister) {
                const confirm = document.getElementById('teacher-password-confirm').value;
                if (password !== confirm) {
                    showToast('비밀번호가 일치하지 않습니다.', 'error');
                    return;
                }
                const result = registerTeacher(name, password);
                if (result.error) {
                    showToast(result.error, 'error');
                    return;
                }
                showToast('회원가입 완료! 로그인해주세요.', 'success');
                isRegister = false;
                render();
            } else {
                const result = loginTeacher(name, password);
                if (result.error) {
                    showToast(result.error, 'error');
                    return;
                }
                showToast(`${name}님 환영합니다!`, 'success');
                window.location.hash = '/teacher/dashboard';
            }
        });

        const switchBtn = document.getElementById('switch-login') || document.getElementById('switch-register');
        if (switchBtn) {
            switchBtn.addEventListener('click', () => {
                isRegister = !isRegister;
                render();
            });
        }

        document.getElementById('back-to-landing').addEventListener('click', () => {
            window.location.hash = '/';
        });
    }

    render();
}
