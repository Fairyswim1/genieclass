// ========================================
// Student Login Page (v2.0)
// ========================================
import {
  getStudentByCode, loginStudentByIdPw, checkLoginIdExists, setupStudentAuth,
  showToast, getClassById
} from '../../store.js';

export function renderStudentLogin(container) {
  let mode = 'login'; // 'login' (ID/PW), 'code' (First time), 'setup' (ID/PW Creation)
  let pendingStudent = null;

  async function render() {
    let className = '';
    if (pendingStudent) {
      const cls = await getClassById(pendingStudent.classId);
      className = cls?.name || '';
    }

    container.innerHTML = `
      <div class="star-bg"></div>
      <div class="login-page page-enter">
        <div class="login-container card animate-up" style="max-width: 440px; border-radius: 24px; padding: 40px;">
          <div class="login-logo" style="margin-bottom: 30px;">
            <div class="login-logo-icon" style="width: 60px; height: 60px; font-size: 1.5rem; margin: 0 auto 15px;">G</div>
            <h1 class="landing-title" style="font-size: 1.8rem; margin-bottom: 0.5rem; letter-spacing: -0.02em;"><span>Genie</span> Class</h1>
            <p class="login-subtitle" style="color: var(--text-muted); font-size: 0.95rem;">학생용 학습 서비스</p>
          </div>

          ${mode !== 'setup' ? `
            <div class="tabs" style="margin-bottom: 30px; background: rgba(255,255,255,0.05); padding: 5px; border-radius: 12px;">
              <div class="tab ${mode === 'login' ? 'active' : ''}" id="tab-idpw" style="border-radius: 8px;">ID/PW 로그인</div>
              <div class="tab ${mode === 'code' ? 'active' : ''}" id="tab-code" style="border-radius: 8px;">고유코드로 시작</div>
            </div>
          ` : ''}

          <form class="login-form" id="student-login-form">
            ${mode === 'login' ? `
              <div class="form-group" style="margin-bottom: 20px;">
                <label class="input-label" style="font-size: 0.8rem; margin-bottom: 6px;">아이디</label>
                <input type="text" class="input-field" id="std-login-id" placeholder="ID를 입력하세요" required autocomplete="username" />
              </div>
              <div class="form-group" style="margin-bottom: 30px;">
                <label class="input-label" style="font-size: 0.8rem; margin-bottom: 6px;">비밀번호</label>
                <input type="password" class="input-field" id="std-password" placeholder="비밀번호를 입력하세요" required autocomplete="current-password" />
              </div>
              <button type="submit" class="btn btn-primary btn-lg w-full" style="height: 54px; font-size: 1rem;">
                로그인
              </button>
            ` : mode === 'code' ? `
              <div class="form-group" style="text-align: center; margin-bottom: 30px;">
                <label class="input-label" style="font-size: 0.8rem; margin-bottom: 15px; display: block;">선생님께 받은 6자리 고유코드</label>
                <input type="text" class="input-field" id="std-unique-code" maxlength="6" 
                  style="text-align: center; font-size: 2rem; letter-spacing: 0.6rem; font-family: monospace; height: 80px; background: rgba(255,255,255,0.03);" 
                  placeholder="000000" autocomplete="off" />
              </div>
              <button type="submit" class="btn btn-primary btn-lg w-full" style="height: 54px; font-size: 1rem;">
                코드 확인
              </button>
              <p style="font-size: 0.85rem; color: var(--text-dim); text-align: center; margin-top: 20px;">
                처음 접속하는 학생은 고유코드가 필요합니다.
              </p>
            ` : mode === 'setup' ? `
              <div class="text-center" style="margin-bottom: 30px;">
                <div class="badge badge-purple" style="margin-bottom: 10px; font-size: 0.7rem; padding: 4px 12px; height: auto;">${className}</div>
                <h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 8px;">계정 설정</h2>
                <p style="color: var(--text-muted); font-size: 0.9rem;">${pendingStudent.name}님, 앞으로 사용할 정보를 입력하세요.</p>
              </div>

              <div class="form-group" style="margin-bottom: 15px;">
                <label class="input-label" style="font-size: 0.8rem; margin-bottom: 6px;">사용할 아이디</label>
                <input type="text" class="input-field" id="setup-login-id" placeholder="영문, 숫자 포함 4자 이상" required minlength="4" />
              </div>
              <div class="form-group" style="margin-bottom: 15px;">
                <label class="input-label" style="font-size: 0.8rem; margin-bottom: 6px;">비밀번호</label>
                <input type="password" class="input-field" id="setup-password" placeholder="비밀번호 입력" required minlength="4" />
              </div>
              <div class="form-group" style="margin-bottom: 25px;">
                <label class="input-label" style="font-size: 0.8rem; margin-bottom: 6px;">비밀번호 확인</label>
                <input type="password" class="input-field" id="setup-password-confirm" placeholder="비밀번호 재입력" required />
              </div>
              <button type="submit" class="btn btn-primary btn-lg w-full" style="height: 54px;">계정 생성 및 로그인</button>
              <button type="button" class="btn btn-ghost w-full" style="margin-top: 10px; height: 48px;" id="setup-cancel">취소</button>
            ` : ''}
          </form>

          <div style="margin-top: 40px; text-align: center;">
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
    document.getElementById('tab-code')?.addEventListener('click', () => { mode = 'code'; render(); });
    document.getElementById('back-to-landing')?.addEventListener('click', () => { window.location.hash = '/'; });
    document.getElementById('setup-cancel')?.addEventListener('click', () => { mode = 'code'; pendingStudent = null; render(); });

    document.getElementById('student-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      if (mode === 'login') {
        const loginId = document.getElementById('std-login-id').value.trim();
        const password = document.getElementById('std-password').value;
        const student = await loginStudentByIdPw(loginId, password);
        if (student) {
          showToast(`${student.name}님, 환영합니다!`);
          window.location.hash = '/student/dashboard';
        } else {
          showToast('아이디 또는 비밀번호가 일치하지 않습니다.', 'error');
        }
      }
      else if (mode === 'code') {
        const code = document.getElementById('std-unique-code').value.trim().toUpperCase();
        if (code.length < 6) { showToast('6자리 코드를 입력해주세요.', 'error'); return; }

        const student = await getStudentByCode(code);
        if (!student) { showToast('유효하지 않은 코드입니다.', 'error'); return; }

        if (student.loginId && student.password) {
          showToast('이미 계정이 설정된 학생입니다. ID/PW로 로그인해주세요.', 'info');
          mode = 'login';
          render();
        } else {
          pendingStudent = student;
          mode = 'setup';
          render();
        }
      }
      else if (mode === 'setup') {
        const loginId = document.getElementById('setup-login-id').value.trim();
        const password = document.getElementById('setup-password').value;
        const confirmPw = document.getElementById('setup-password-confirm').value;

        if (password !== confirmPw) { showToast('비밀번호가 일치하지 않습니다.', 'error'); return; }

        const exists = await checkLoginIdExists(loginId);
        if (exists) { showToast('이미 존재하는 아이디입니다.', 'error'); return; }

        try {
          await setupStudentAuth(pendingStudent.id, loginId, password);
          // Auto login
          await loginStudentByIdPw(loginId, password);
          showToast('계정 설정이 완료되었습니다! 🎉');
          window.location.hash = '/student/dashboard';
        } catch (err) {
          showToast('설정 중 오류가 발생했습니다.', 'error');
        }
      }
    });
  }

  render();
}
