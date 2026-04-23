// ========================================
// Student Login Page (v2.2)
// ========================================
import {
  getStudentByCode, loginStudentByIdPw, checkLoginIdExists, setupStudentAuth,
  showToast, getClassById
} from '../../store.js';

export function renderStudentLogin(container) {
  let mode = 'login'; // 'login' (ID/PW), 'code' (First time), 'setup' (ID/PW Creation)
  let pendingStudent = null;
  let isLoading = false;

  async function render() {
    let className = '';
    if (pendingStudent) {
      const cls = await getClassById(pendingStudent.classId);
      className = cls?.name || '';
    }

    container.innerHTML = `
      <div class="auth-page page-enter">
        <div class="auth-card">
          <div class="auth-logo">
            <div class="auth-logo-icon">G</div>
            <h1 class="auth-title">Genie Class</h1>
            <p class="auth-subtitle">학생용 학습 서비스</p>
          </div>

          ${mode !== 'setup' ? `
            <div class="tabs">
              <div class="tab ${mode === 'login' ? 'active' : ''}" id="tab-idpw">ID/PW 로그인</div>
              <div class="tab ${mode === 'code' ? 'active' : ''}" id="tab-code">고유코드로 시작</div>
            </div>
          ` : ''}

          ${isLoading ? `
            <div class="text-center" style="padding: var(--s-12) 0;">
              <div class="loading-spinner"></div>
              <p class="auth-subtitle" style="margin-top: var(--s-4);">확인 중...</p>
            </div>
          ` : `
            <form class="login-form" id="student-login-form">
              ${mode === 'login' ? `
                <div class="form-group" style="margin-bottom: var(--s-4);">
                  <label class="input-label">아이디</label>
                  <input type="text" class="input-field" id="std-login-id" placeholder="ID를 입력하세요" required autocomplete="username" />
                </div>
                <div class="form-group" style="margin-bottom: var(--s-8);">
                  <label class="input-label">비밀번호</label>
                  <input type="password" class="input-field" id="std-password" placeholder="비밀번호를 입력하세요" required autocomplete="current-password" />
                </div>
                <button type="submit" class="btn btn-primary btn-lg w-full">로그인</button>
              ` : mode === 'code' ? `
                <div class="form-group text-center" style="margin-bottom: var(--s-8);">
                  <label class="input-label" style="margin-bottom: var(--s-4); display: block;">선생님께 받은 6자리 고유코드</label>
                  <input type="text" class="input-field" id="std-unique-code" maxlength="6"
                    style="text-align: center; font-size: 2rem; letter-spacing: 0.6rem; font-family: monospace; height: 80px;"
                    placeholder="XJ42P9" autocomplete="off" />
                </div>
                <button type="submit" class="btn btn-primary btn-lg w-full">코드 확인</button>
                <p class="auth-subtitle text-center" style="margin-top: var(--s-6);">
                  처음 접속하는 학생은 고유코드가 필요합니다.
                </p>
              ` : mode === 'setup' ? `
                <div class="text-center" style="margin-bottom: var(--s-8);">
                  <div class="badge badge-purple" style="margin-bottom: var(--s-2);">${className}</div>
                  <h2 class="auth-title">계정 설정</h2>
                  <p class="auth-subtitle">${pendingStudent.name}님, 앞으로 사용할 정보를 입력하세요.</p>
                </div>

                <div class="form-group" style="margin-bottom: var(--s-4);">
                  <label class="input-label">사용할 아이디</label>
                  <input type="text" class="input-field" id="setup-login-id" placeholder="영문, 숫자 포함 4자 이상" required minlength="4" />
                  <div id="setup-id-error" class="hidden" style="color: var(--red); font-size: 0.8rem; margin-top: 4px;">이미 사용 중인 아이디입니다.</div>
                </div>
                <div class="form-group" style="margin-bottom: var(--s-4);">
                  <label class="input-label">비밀번호</label>
                  <input type="password" class="input-field" id="setup-password" placeholder="비밀번호 입력" required minlength="4" />
                </div>
                <div class="form-group" style="margin-bottom: var(--s-8);">
                  <label class="input-label">비밀번호 확인</label>
                  <input type="password" class="input-field" id="setup-password-confirm" placeholder="비밀번호 재입력" required />
                </div>
                <button type="submit" class="btn btn-primary btn-lg w-full">계정 생성 및 로그인</button>
                <button type="button" class="btn btn-ghost w-full" style="margin-top: var(--s-2);" id="setup-cancel">취소</button>
              ` : ''}
            </form>
          `}

          <div class="text-center" style="margin-top: var(--s-12);">
             <a id="back-to-landing" style="cursor: pointer; color: var(--text-dim); font-size: 0.85rem; font-weight: 500;">
               ← 처음으로 돌아가기
             </a>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    document.getElementById('tab-idpw')?.addEventListener('click', () => { mode = 'login'; render(); });
    document.getElementById('tab-code')?.addEventListener('click', () => {
      mode = 'code';
      render();
      setTimeout(() => document.getElementById('std-unique-code')?.focus(), 100);
    });
    document.getElementById('back-to-landing')?.addEventListener('click', () => { window.location.hash = '/'; });
    document.getElementById('setup-cancel')?.addEventListener('click', () => { mode = 'code'; pendingStudent = null; render(); });

    // Real-time unique code formatting
    const codeInput = document.getElementById('std-unique-code');
    if (codeInput) {
      codeInput.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        e.target.value = val;
      });
    }

    // ID Real-time check
    let idCheckTimeout = null;
    const idInput = document.getElementById('setup-login-id');
    const idError = document.getElementById('setup-id-error');
    
    idInput?.addEventListener('input', () => {
        idError?.classList.add('hidden');
        const loginId = idInput.value.trim();
        
        if (idCheckTimeout) clearTimeout(idCheckTimeout);
        if (loginId.length < 4) return;
        
        idCheckTimeout = setTimeout(async () => {
            const check = await checkLoginIdExists(loginId);
            if (check.exists) {
                idError.classList.remove('hidden');
                idError.textContent = `이미 '${check.name}' 학생이 사용 중인 아이디입니다.`;
                idError.style.color = 'var(--red)';
            } else {
                idError.classList.remove('hidden');
                idError.textContent = '멋진 아이디예요! 사용 가능합니다.';
                idError.style.color = 'var(--success)';
            }
        }, 500);
    });

    document.getElementById('student-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isLoading) return;

      try {
        if (mode === 'login') {
          const loginId = document.getElementById('std-login-id').value.trim();
          const password = document.getElementById('std-password').value;
          isLoading = true; render();

          const student = await loginStudentByIdPw(loginId, password);
          if (student) {
            showToast(`${student.name}님, 환영합니다!`);
            window.location.hash = '/student/dashboard';
          } else {
            isLoading = false; render();
            showToast('아이디 또는 비밀번호가 일치하지 않습니다.', 'error');
          }
        }
        else if (mode === 'code') {
          const code = document.getElementById('std-unique-code').value.trim().toUpperCase();
          if (code.length < 6) { showToast('6자리 코드를 입력해주세요.', 'error'); return; }

          isLoading = true; render();
          const student = await getStudentByCode(code);

          if (!student) {
            isLoading = false; render();
            showToast('유효하지 않은 코드입니다. 다시 확인해보고 입력해주세요.', 'error');
            return;
          }

          if (student.loginId && student.password) {
            isLoading = false;
            showToast('이미 가입된 학생입니다. 아이디/비밀번호로 로그인해주세요!', 'info');
            mode = 'login';
            render();
          } else {
            pendingStudent = student;
            mode = 'setup';
            isLoading = false;
            render();
          }
        }
        else if (mode === 'setup') {
          const loginIdInput = document.getElementById('setup-login-id');
          const loginId = loginIdInput.value.trim();
          const password = document.getElementById('setup-password').value;
          const confirmPw = document.getElementById('setup-password-confirm').value;

          if (password !== confirmPw) { showToast('비밀번호가 일치하지 않습니다.', 'error'); return; }

          isLoading = true; render();
          const check = await checkLoginIdExists(loginId);
          if (check.exists) {
            isLoading = false; render();
            const errorEl = document.getElementById('setup-id-error');
            errorEl.textContent = `이미 '${check.name}' 학생이 사용 중인 아이디입니다.`;
            errorEl.classList.remove('hidden');
            loginIdInput.focus();
            showToast('이미 존재하는 아이디입니다.', 'error');
            return;
          }

          await setupStudentAuth(pendingStudent.id, loginId, password);
          // Auto login
          await loginStudentByIdPw(loginId, password);
          showToast('계정 설정이 완료되었습니다! 🎉');
          window.location.hash = '/student/dashboard';
        }
      } catch (error) {
        console.error('Login process error:', error);
        isLoading = false;
        render();
        showToast('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      }
    });
  }

  render();
}
