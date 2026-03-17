// ========================================
// Student Login Page
// ========================================
import {
    getStudentByCode, setStudentPassword, loginStudent,
    getCurrentStudent, showToast, getClassById
} from '../../store.js';

export function renderStudentLogin(container) {
    let mode = 'code'; // 'code', 'setPassword', 'login'
    let pendingStudent = null;

    function render() {
        container.innerHTML = `
      <div class="star-bg"></div>
      <div class="login-page">
        <div class="login-container glass animate-scale-in">
          <div class="login-logo">
            <div class="login-logo-icon">G</div>
            <h1 class="login-title">Genie Class</h1>
            <p class="login-subtitle">
              ${mode === 'code' ? '선생님에게 받은 고유코드를 입력하세요' :
                mode === 'setPassword' ? '비밀번호를 설정하세요' :
                    '이름과 비밀번호로 로그인하세요'}
            </p>
          </div>

          <form class="login-form" id="student-login-form">
            ${mode === 'code' ? `
              <div class="form-group">
                <label class="input-label">고유코드</label>
                <input type="text" class="input-field" id="student-code" placeholder="6자리 코드 입력" maxlength="6"
                  style="text-align:center;font-size:1.5rem;letter-spacing:6px;font-family:'Courier New',monospace;text-transform:uppercase" autocomplete="off" />
              </div>
              <button type="submit" class="btn btn-primary btn-lg w-full">확인</button>
            ` : mode === 'setPassword' ? `
              <div class="card" style="padding:var(--space-lg);margin-bottom:var(--space-lg);text-align:center">
                <div style="font-size:1.2rem;font-weight:700;margin-bottom:var(--space-xs)">${pendingStudent?.name}</div>
                <div class="badge badge-primary">${getClassById(pendingStudent?.classId)?.name || ''}</div>
              </div>
              <div class="form-group">
                <label class="input-label">비밀번호 설정</label>
                <input type="password" class="input-field" id="student-password" placeholder="비밀번호를 입력하세요" required />
              </div>
              <div class="form-group">
                <label class="input-label">비밀번호 확인</label>
                <input type="password" class="input-field" id="student-password-confirm" placeholder="비밀번호를 다시 입력하세요" required />
              </div>
              <button type="submit" class="btn btn-primary btn-lg w-full">비밀번호 설정</button>
            ` : `
              <div class="form-group">
                <label class="input-label">이름</label>
                <input type="text" class="input-field" id="student-name" placeholder="이름을 입력하세요" required autocomplete="off" />
              </div>
              <div class="form-group">
                <label class="input-label">비밀번호</label>
                <input type="password" class="input-field" id="student-password" placeholder="비밀번호를 입력하세요" required />
              </div>
              <button type="submit" class="btn btn-primary btn-lg w-full">로그인</button>
            `}
          </form>

          ${mode === 'login' ? `
            <div class="login-divider">또는</div>
            <button class="btn btn-ghost w-full" id="btn-code-login">고유코드로 최초 로그인</button>
          ` : mode === 'code' ? `
            <div class="login-divider">또는</div>
            <button class="btn btn-ghost w-full" id="btn-normal-login">이름 + 비밀번호 로그인</button>
          ` : ''}

          <div class="divider"></div>
          <div class="text-center">
            <a style="cursor:pointer;font-size:0.85rem;color:var(--text-tertiary)" id="back-to-landing">← 처음으로</a>
          </div>
        </div>
      </div>
    `;

        bindEvents();
    }

    function bindEvents() {
        document.getElementById('student-login-form').addEventListener('submit', (e) => {
            e.preventDefault();

            if (mode === 'code') {
                const code = document.getElementById('student-code').value.trim().toUpperCase();
                if (code.length !== 6) {
                    showToast('6자리 코드를 입력해주세요.', 'error');
                    return;
                }
                const student = getStudentByCode(code);
                if (!student) {
                    showToast('존재하지 않는 코드입니다.', 'error');
                    return;
                }
                if (student.password) {
                    // Already has password, go to normal login
                    showToast('이미 비밀번호가 설정되어 있습니다. 이름과 비밀번호로 로그인해주세요.');
                    mode = 'login';
                    render();
                } else {
                    pendingStudent = student;
                    mode = 'setPassword';
                    render();
                }
            } else if (mode === 'setPassword') {
                const pw = document.getElementById('student-password').value;
                const pwConfirm = document.getElementById('student-password-confirm').value;
                if (pw !== pwConfirm) {
                    showToast('비밀번호가 일치하지 않습니다.', 'error');
                    return;
                }
                if (pw.length < 2) {
                    showToast('비밀번호를 2자 이상 입력해주세요.', 'error');
                    return;
                }
                setStudentPassword(pendingStudent.id, pw);
                // Auto login
                const result = loginStudent(pendingStudent.name, pw);
                if (result.data) {
                    showToast(`${pendingStudent.name}님, 환영합니다! 🎉`);
                    window.location.hash = '/student/dashboard';
                }
            } else {
                const name = document.getElementById('student-name').value.trim();
                const password = document.getElementById('student-password').value;
                const result = loginStudent(name, password);
                if (result.error) {
                    showToast(result.error, 'error');
                    return;
                }
                showToast(`${name}님, 환영합니다!`);
                window.location.hash = '/student/dashboard';
            }
        });

        document.getElementById('btn-code-login')?.addEventListener('click', () => {
            mode = 'code';
            render();
        });

        document.getElementById('btn-normal-login')?.addEventListener('click', () => {
            mode = 'login';
            render();
        });

        document.getElementById('back-to-landing').addEventListener('click', () => {
            window.location.hash = '/';
        });
    }

    render();
}
