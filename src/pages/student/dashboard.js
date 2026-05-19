// ========================================
// Student Dashboard (v2.0)
// ========================================
import {
  getCurrentStudent, logoutStudent, ensureStudentFirestoreAuth, getClassById,
  getPresentationsByStudent, getAssignmentsByClass,
  getSubmissionsByStudent, getAnnouncementsByClass,
  getResourcesByClass, getStudentById, formatDate,
  listenToActiveQuiz, listenToQuizSubmissions, submitQuizSolution,
  showToast, downloadFile, getStudentByCode,
  submitAssignment, saveFile, updateStudentCharacterType,
  getPresentationsByClass,   toggleSharePresentation,
  addStudentPoints,
  createStudentSelfRecord, getStudentSelfRecords,
  createStudentNote, getStudentNotesByStudent,
  getFileById, getProblemPromptsByClass,
  getSharedPresentationsByClassId, getStudentsByClass,
  deletePresentationById,
  problemPromptHasModelAnswer,
  fetchProblemSolutionFeedback,
  collectImageUrlsFromModelAnswerFiles,
  collectNonImageModelAnswerFileNotes,
  enrichPresentationsWithImageUrls,
  presentationWhiteboardImageUrl,
  getClassesByTeacher,
} from '../../store.js';
import { escapeHtml, renderQuizMath } from '../../utils/quizMath.js';
import { bindClipboardPasteZone } from '../../utils/clipboardPaste.js';
import { renderCharacter, getLevelConfig, PLANT_TYPES, getLevelProgress } from '../../components/characterAvatar.js';
import { Capacitor } from '@capacitor/core';
import { VoiceRecorder } from 'capacitor-voice-recorder';

/** 칠판 URL · 음성/영상 URL로 재생 버튼 data 속성 생성 */
function buildPlaybackButtonAttrs(p) {
  const wbUrl = typeof p.whiteboardImage?.url === 'string' ? p.whiteboardImage.url.trim() : '';
  const mediaUrl = typeof p.audioData?.url === 'string' ? p.audioData.url.trim() : '';
  const mode = p.recordingMode === 'video' ? 'video' : 'audio';
  const parts = [];
  if (mediaUrl) parts.push(`data-url="${escapeHtml(mediaUrl)}"`);
  if (wbUrl) parts.push(`data-wb-url="${escapeHtml(wbUrl)}"`);
  parts.push(`data-recording-mode="${escapeHtml(mode)}"`);
  return parts.join(' ');
}

function renderPresentationPlayButton(p, labelOverride = '') {
  const wbUrl = typeof p.whiteboardImage?.url === 'string' ? p.whiteboardImage.url.trim() : '';
  const mediaUrl = typeof p.audioData?.url === 'string' ? p.audioData.url.trim() : '';
  if (!wbUrl && !mediaUrl) {
    return '<span class="student-pres-noasset">—</span>';
  }
  const label = labelOverride
    || (mediaUrl
      ? (p.recordingMode === 'video' ? '🎬 영상' : '🔊 풀이 듣기')
      : '🖼️ 보기');
  return `<button type="button" class="btn btn-secondary btn-sm btn-play-video" ${buildPlaybackButtonAttrs(p)}>${label}</button>`;
}

export function renderStudentDashboard(container) {
  const student = getCurrentStudent();
  if (!student) { window.location.hash = '/student/login'; return; }

  let activeView = 'dashboard';
  let selectedAssignment = null;

  // Quiz State
  let activeQuiz = null;
  let quizSubmissions = [];
  let unsubscribeQuiz = null;
  let unsubscribeSubmissions = null;

  // File Queue for assignment submissions
  let submissionFilesQueue = [];
  /** 과제 제출 화면 음성 녹음(선택) */
  const assignmentRecState = {
    blob: null,
    mime: 'audio/webm',
    mediaRecorder: null,
    chunks: [],
    stream: null,
    native: false,
    recording: false,
    cleared: false,
  };
  let selfRecordFilesQueue = [];
  /** bindEvents 교체 전 정리 및 과제 상세 페이지 전용 */
  let clipboardPasteUnsubs = [];
  let submissionPasteUnsub = null;
  let quizOverlayPasteUnsub = null;

  /** 상단 '선생님께 쪽지' 버튼으로만 열림 */
  let studentNotePanelOpen = false;

  /** listenToActiveQuiz에 넘길 반 ID — render마다 최신화 */
  let quizListenClassId = student.classId || '';
  let lastQuizBoundClassId = '';

  /** 익명 Firebase 로그인 실패 시 권한 오류(permission-denied, storage/unauthorized)가 난다 */
  let firebaseAuthSetupError = null;

  async function init() {
    firebaseAuthSetupError = null;
    try {
      await ensureStudentFirestoreAuth();
    } catch (e) {
      console.error('[StudentDashboard] Firebase 익명 로그인 실패:', e);
      firebaseAuthSetupError = e;
    }
    await render();
  }

  async function render() {
    let freshStudent = student;
    let cls = null;
    let progress = getLevelProgress(student.totalPoints || 0);
    let config = getLevelConfig(progress.level, student.characterType || 'apple');
    let presentations = [];
    let assignments = [];
    let assignmentsLoadError = null;
    let submissions = [];
    let announcements = [];
    let resources = [];
    let sharedPresentations = [];
    /** 반 전체 발표(문제 풀이 type 필터에 사용) — 템플릿에서 참조하므로 try 바깥에 선언 */
    let allPresentations = [];
    let selfRecords = [];
    let studentNotes = [];
    let problemPrompts = [];

    const loadOr = async (label, promise, fallback) => {
      try {
        return await promise;
      } catch (e) {
        console.error(`[StudentDashboard] ${label} 로드 실패:`, e);
        return fallback;
      }
    };

    try {
      if (student.uniqueCode) {
        const byCode = await getStudentByCode(student.uniqueCode);
        if (byCode) freshStudent = byCode;
      }
      if (freshStudent === student && student.id) {
        const byId = await getStudentById(student.id);
        if (byId) freshStudent = byId;
      }

      cls = await getClassById(freshStudent.classId);
      progress = getLevelProgress(freshStudent.totalPoints || 0);
      config = getLevelConfig(progress.level, freshStudent.characterType || 'apple');

      try {
        if (cls) {
          assignments = await getAssignmentsByClass(cls.id);
        } else {
          assignments = [];
        }
      } catch (assignErr) {
        console.error('[StudentDashboard] 과제 목록 조회 실패:', assignErr);
        assignments = [];
        const code = assignErr?.code || '';
        if (code === 'permission-denied') assignmentsLoadError = 'permission';
        else if (code === 'unavailable') assignmentsLoadError = 'offline';
        else assignmentsLoadError = 'unknown';
      }

      const [
        subRes, annRes, resRes, presRes, selfRes, noteRes, promptRes,
        crossPresRes, classStudentsRes,
      ] = await Promise.all([
        loadOr('제출물', getSubmissionsByStudent(freshStudent.id), []),
        loadOr('공지', cls ? getAnnouncementsByClass(cls.id) : Promise.resolve([]), []),
        loadOr('자료', cls ? getResourcesByClass(cls.id) : Promise.resolve([]), []),
        loadOr(
          '발표',
          cls
            ? getPresentationsByClass(cls.id).then((arr) => enrichPresentationsWithImageUrls(arr))
            : Promise.resolve([]),
          [],
        ),
        loadOr('자기기록', getStudentSelfRecords(freshStudent.id), []),
        loadOr('쪽지', getStudentNotesByStudent(freshStudent.id), []),
        loadOr('한문제', cls ? getProblemPromptsByClass(cls.id) : Promise.resolve([]), []),
        loadOr('크로스공유발표', cls ? getSharedPresentationsByClassId(cls.id) : Promise.resolve([]), []),
        loadOr('반학생목록', cls ? getStudentsByClass(cls.id) : Promise.resolve([]), []),
      ]);
      [submissions, announcements, resources, allPresentations, selfRecords, studentNotes, problemPrompts] =
        [subRes, annRes, resRes, presRes, selfRes, noteRes, promptRes];

      // 반 학생 이름 맵 (studentId → name)
      const studentNameMap = Object.fromEntries(classStudentsRes.map(s => [s.id, s.name]));

      presentations = allPresentations.filter((p) =>
        p.studentId === freshStudent.id
        && p.type !== 'observation'
        && p.type !== 'problem_solution');

      // 같은 반 공유 발표 + 다른 클래스에서 이 반으로 공유된 발표 합산 (중복 제거)
      // problem_solution 타입은 '한 문제 풀이' 탭에서 별도 표시하므로 여기서 제외
      const sameClassShared = allPresentations.filter((p) =>
        p.studentId !== freshStudent.id
        && p.shared === true
        && p.type !== 'observation'
        && p.type !== 'problem_solution');
      const crossClassShared = crossPresRes.filter(p => p.studentId !== freshStudent.id);
      const seenIds = new Set(sameClassShared.map(p => p.id));
      const mergedShared = [
        ...sameClassShared,
        ...crossClassShared.filter(p => !seenIds.has(p.id)),
      ];
      // 학생 이름 필드를 각 발표에 주입 (저장된 studentName → 같은반 맵 → null 순 fallback)
      sharedPresentations = mergedShared.map(p => ({
        ...p,
        _studentName: p.studentName || studentNameMap[p.studentId] || null,
      }));

      quizListenClassId = freshStudent.classId || '';
      try {
        localStorage.setItem('genie_current_student', JSON.stringify(freshStudent));
      } catch (_) {}
    } catch (err) {
      console.error('Data loading error:', err);
    }

    if (!(activeView === 'assignment' && selectedAssignment)) {
      if (submissionPasteUnsub) {
        submissionPasteUnsub();
        submissionPasteUnsub = null;
      }
    }

    if (activeView === 'assignment' && selectedAssignment) {
      renderAssignmentDetail(freshStudent, selectedAssignment, submissions);
      return;
    }

    const firebaseAuthBanner = (() => {
      if (!firebaseAuthSetupError) return '';
      const code = firebaseAuthSetupError?.code || '';
      const msg = firebaseAuthSetupError?.message || '';
      let hint = 'Firebase에 “학생용 익명 로그인”이 꺼져 있거나, 보안 규칙이 로그인한 사용자만 허용하는데 이 기기에서 로그인에 실패했습니다.';
      if (code === 'auth/operation-not-allowed') {
        hint = 'Firebase 콘솔 → Authentication → Sign-in method → <strong>익명(Anonymous)</strong> 을 사용함으로 켜 주세요. (관리자 설정)';
      } else if (code === 'auth/network-request-failed') {
        hint = '인증 서버에 연결하지 못했습니다. Wi-Fi·VPN·방화벽(학교망)을 바꿔 보세요.';
      }
      return `<div class="card" style="margin-bottom:var(--s-4);padding:var(--s-4);border:2px solid var(--error);background:rgba(239,68,68,0.08);font-size:0.88rem;line-height:1.55;">
        <strong>데이터·파일 서버 연결 실패</strong>
        <p style="margin:8px 0 0;">${hint}</p>
        <p style="margin:8px 0 0;color:var(--text-dim);font-size:0.8rem;">기술 코드: ${code || '—'} ${msg ? `· ${String(msg).slice(0, 120)}` : ''}</p>
        <p style="margin:10px 0 0;">해결 후 이 페이지를 새로고침(F5) 하거나 로그아웃했다가 다시 로그인해 주세요.</p>
      </div>`;
    })();

    const assignmentSectionBanner = (() => {
      if (assignmentsLoadError === 'permission') {
        return `<div class="card" style="margin-bottom:var(--s-3);padding:var(--s-4);border:1px solid var(--error);background:rgba(239,68,68,0.06);font-size:0.88rem;line-height:1.5;">
          <strong>과제 목록을 불러올 수 없습니다.</strong> 이 기기에서 데이터 접근이 막혔을 수 있습니다. 다른 브라우저(또는 시크릿이 아닌 일반 탭)로 시도하거나, 학교 Wi-Fi 대신 데이터 네트워크로 접속해 보세요. 문제가 계속되면 선생님께 알려 주세요.
        </div>`;
      }
      if (assignmentsLoadError === 'offline') {
        return `<div class="card" style="margin-bottom:var(--s-3);padding:var(--s-4);border:1px solid var(--primary);background:rgba(99,102,241,0.06);font-size:0.88rem;line-height:1.5;">
          <strong>네트워크 불안정</strong>으로 과제 목록을 가져오지 못했습니다. 잠시 후 상단을 아래로 당겨 새로고침하거나, 페이지를 새로 열어 주세요.
        </div>`;
      }
      if (assignmentsLoadError === 'unknown') {
        return `<div class="card" style="margin-bottom:var(--s-3);padding:var(--s-4);border:1px solid var(--border-main);background:var(--bg-main);font-size:0.88rem;line-height:1.5;">
          <strong>과제 목록을 불러오지 못했습니다.</strong> 새로고침(F5) 후 다시 로그인해 보세요. 반복되면 선생님께 알려 주세요.
        </div>`;
      }
      return '';
    })();

    const assignmentEmptyMessage = assignmentsLoadError
      ? ''
      : '<p class="text-center" style="color: var(--text-dim); padding: 20px;">출제된 과제가 없습니다.</p>';

    container.innerHTML = `
      <div class="student-layout page-enter">
        <header class="student-topbar">
          <div class="student-topbar-logo">
            <div class="student-topbar-logo-icon">G</div>
            <div class="student-topbar-title">Genie Class</div>
          </div>
          <div class="student-topbar-user">
            <div class="student-topbar-avatar">${renderCharacter(progress.level, 34, freshStudent.characterType || 'apple', freshStudent.totalPoints)}</div>
            <div class="student-topbar-name">${freshStudent.name}</div>
            <button
              type="button"
              class="btn btn-ghost btn-sm student-topbar-note-btn ${studentNotePanelOpen ? 'student-topbar-note-btn--open' : ''}"
              id="btn-toggle-student-note"
              title="${cls?.teacherId ? '쪽지 작성·내역 보기' : '클래스에 연결되지 않았습니다'}"
              aria-expanded="${studentNotePanelOpen}"
              aria-controls="student-note-modal"
              ${cls?.teacherId ? '' : 'disabled'}
            >
              <span class="student-topbar-note-btn-icon" aria-hidden="true">💬</span>
              <span class="student-topbar-note-btn-label">선생님께 쪽지</span>
            </button>
            <button class="btn btn-ghost btn-sm" id="btn-student-logout" style="margin-left: 4px;">로그아웃</button>
          </div>
        </header>

        <main class="student-dashboard student-dashboard--compact">
          ${firebaseAuthBanner}
          <section class="student-welcome flex justify-between items-end">
            <div>
              <h1 class="student-welcome-title">반가워요, <span>${freshStudent.name}</span>님!</h1>
              <p class="student-welcome-subtitle">${cls?.name || '클래스 정보 없음'} · ${config.name} (Lv.${progress.level})</p>
            </div>
            <div class="badge badge-purple animate-up" style="padding: 8px 16px; font-size: 0.9rem;">포인트: ${freshStudent.totalPoints}P</div>
          </section>

          <section class="student-stats-row">
            <div class="card stat-card stat-card-featured">
              <div class="stat-card-label">발표 기록</div>
              <div class="stat-card-value-display">${presentations.length}</div>
            </div>
            <div class="card stat-card">
              <div class="stat-card-label">완료한 과제</div>
              <div class="stat-card-value-display" style="color: var(--success)">${submissions.length}</div>
            </div>
            <div class="card stat-card">
              <div class="stat-card-label">총 포인트</div>
              <div class="stat-card-value-display" style="color: var(--primary-light)">${freshStudent.totalPoints}</div>
            </div>
          </section>

          <!-- Character & Progress -->
          <section class="card student-dashboard-char-row flex items-center gap-md">
            <div class="student-character-float">
              ${renderCharacter(progress.level, 70, freshStudent.characterType || 'apple', freshStudent.totalPoints)}
            </div>
            <div class="flex-1">
              <div class="flex justify-between items-end" style="margin-bottom: var(--s-2);">
                <span style="font-family: var(--font-title); font-size: 1.2rem;">${config.emoji} ${config.name}</span>
                <div class="flex items-center gap-sm">
                  <span style="font-family: var(--font-hand); font-size: 1.2rem;">${progress.isMaxLevel ? '최고 레벨 도달! 🎉' : `다음 레벨까지 ${progress.remainingPoints}P 남음`}</span>
                  <button class="btn btn-ghost btn-sm" id="btn-change-character" style="font-size: 0.8rem; padding: 4px 10px; border: 1px solid var(--border-subtle); border-radius: var(--r-md);">🔄 열매 변경</button>
                </div>
              </div>
              <div style="background: var(--bg-main); height: 14px; border-radius: 7px; overflow: hidden; border: 2px solid var(--border-main);">
                <div style="width: ${progress.progressPercent}%; height: 100%; background: var(--primary); transition: width 0.5s;"></div>
              </div>
            </div>
          </section>

          <!-- 한 문제 풀이 -->
          <div class="section-card card student-bulletin-card student-problem-board-card">
            <div class="section-card-header student-bulletin-card__head">
              <span style="font-size: 1.2rem;">✏️</span>
              <h2 class="section-card-title">한 문제 풀이</h2>
              <span class="student-bulletin-card__hint">저장 +1P · 공유 +1P</span>
            </div>
            <p class="student-bulletin-card__desc">칠판 필기 또는 사진을 칠판에 올린 뒤 덧그릴 수 있어요. 음성 설명은 칠판과 함께 재생됩니다.</p>
            <div class="student-bulletin-table student-problem-board-table">
              ${problemPrompts.length === 0
    ? '<p class="text-center" style="color: var(--text-dim); padding: 12px;">출제된 한 문제가 없습니다.</p>'
    : problemPrompts.map((pr) => {
      const sols = allPresentations.filter((p) => p.studentId === freshStudent.id
        && p.type === 'problem_solution'
        && String(p.problemPromptId || '') === String(pr.id));
      const sol = sols.length
        ? sols.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]
        : null;
      const hasSol = !!sol;
      const wbUrlMine = presentationWhiteboardImageUrl(sol);
      const canAiFeedback =
        problemPromptHasModelAnswer(pr)
        && hasSol
        && !!wbUrlMine;

      // 친구들의 공유된 풀이 (problem_solution 타입, 같은 problemPromptId)
      const friendSols = allPresentations.filter((p) =>
        p.type === 'problem_solution'
        && String(p.problemPromptId || '') === String(pr.id)
        && p.studentId !== freshStudent.id
        && p.shared === true
      ).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      return `
                    <article class="student-problem-row interactive-item">
                      <div>
                        <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(pr.title || '제목 없음')}</div>
                        ${pr.description ? `<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px; white-space: pre-line;">${escapeHtml(pr.description)}</div>` : ''}
                        ${pr.files && pr.files.length ? `
                          <div class="flex gap-sm flex-wrap" style="margin-top: 8px;">
                            ${pr.files.map((f) => `<button type="button" class="btn btn-secondary btn-sm" style="font-size: 0.72rem;" onclick="window.downloadFile('${f.id}')">📎 ${escapeHtml(f.name)}</button>`).join('')}
                          </div>` : ''}
                      </div>
                      <div class="flex flex-wrap gap-sm items-center justify-end">
                        ${hasSol ? `<span class="badge badge-green">풀이 저장됨</span>
                          <button type="button" class="btn btn-ghost btn-sm btn-delete-my-problem-sol" data-id="${sol.id}" style="color: var(--error);">🗑️ 내 풀이 삭제</button>
                          <button type="button" class="btn btn-ghost btn-sm btn-toggle-share" data-id="${sol.id}" data-shared="${sol.shared ? 'true' : 'false'}">${sol.shared ? '🔒 공유 끄기' : '🌐 공유하기'}</button>` : ''}
                        ${canAiFeedback
    ? `<button type="button" class="btn btn-secondary btn-sm btn-problem-ai-feedback" data-prompt-id="${pr.id}" data-solution-id="${sol.id}" title="모범답안 기준 피드백">✨ 피드백</button>`
    : (problemPromptHasModelAnswer(pr) && hasSol && !wbUrlMine
      ? `<span style="font-size:0.72rem;color:var(--text-dim);">풀이 이미지가 필요해 AI 피드백을 쓸 수 없어요</span>`
      : '')}
                        <button type="button" class="btn btn-primary btn-sm btn-open-problem-board" data-prompt-id="${pr.id}">
                          ${hasSol
    ? (sol.solutionSource === 'photo'
      ? '📷 사진 교체 또는 이어 수정'
      : '✏️ 칠판 이어 수정')
    : '✍️ 풀이 올리기'}
                        </button>
                      </div>
                      ${friendSols.length > 0 ? `
                      <div style="border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 2px;">
                        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">친구들의 풀이 (${friendSols.length})</div>
                        <div class="student-problem-friends__list">
                          ${friendSols.map((fs) => `
                              <div class="student-bbs-row">
                                <span class="student-bbs-row__who">${escapeHtml(fs.studentName || '친구')}</span>
                                <span class="student-bbs-row__when">${formatDate(fs.createdAt)}</span>
                                <span class="student-bbs-row__act">${renderPresentationPlayButton(fs, '보기')}</span>
                              </div>`).join('')}
                        </div>
                      </div>` : ''}
                    </article>`;
    }).join('')}
            </div>
          </div>

          <div class="student-grid-37 student-dashboard-presentations-grid student-bulletin-grid">
            <!-- My Presentations -->
            <div class="section-card card student-bulletin-card">
              <div class="section-card-header student-bulletin-card__head">
                <span style="font-size: 1.2rem;">🎤</span>
                <h2 class="section-card-title">나의 발표 기록</h2>
              </div>
              <div class="student-pres-list-wrap student-bulletin-scroll">
                ${presentations.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 14px;">발표 기록이 없습니다.</p>' : presentations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((p) => {
      return `
                  <div class="student-pres-row student-bbs-row">
                    <span class="student-bbs-row__when">${formatDate(p.createdAt)}</span>
                    <span class="student-bbs-row__meta">${p.shared ? '<span class="student-pres-mini-badge shared">공유</span>' : '<span class="student-pres-mini-badge">비공유</span>'}</span>
                    <span class="student-bbs-row__act">${renderPresentationPlayButton(p)}</span>
                    <button type="button" class="btn btn-sm ${p.shared ? 'btn-danger' : 'btn-primary'} btn-toggle-share" data-id="${escapeHtml(String(p.id))}" data-shared="${p.shared ? 'true' : 'false'}">${p.shared ? '끄기' : '공유'}</button>
                  </div>`;
    }).join('')}
              </div>
            </div>

            <!-- Shared Presentations -->
            <div class="section-card card student-bulletin-card">
              <div class="section-card-header student-bulletin-card__head">
                <span style="font-size: 1.2rem;">👀</span>
                <h2 class="section-card-title">친구들의 멋진 발표</h2>
              </div>
              <div class="student-pres-list-wrap student-bulletin-scroll">
                ${sharedPresentations.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 14px;">공유된 발표가 없습니다.</p>' : sharedPresentations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((p) => {
      const title = escapeHtml(p.title || '제목 없는 발표');
      const friendName = p._studentName ? escapeHtml(p._studentName) : '친구';
      return `
                  <div class="student-bbs-row student-bbs-row--friend">
                    <span class="student-bbs-row__who">${friendName}</span>
                    <span class="student-bbs-row__title student-pres-friend-title">${title}</span>
                    <span class="student-bbs-row__when">${formatDate(p.createdAt)}</span>
                    <span class="student-bbs-row__act">${renderPresentationPlayButton(p, '보기')}</span>
                  </div>`;
    }).join('')}
              </div>
            </div>
          </div>

          <div class="student-grid-73 student-dashboard-main-grid">
            <!-- Assignments & Records -->
            <div class="flex flex-col student-dashboard-col-gap">
              <div class="section-card card">
                <div class="section-card-header">
                  <span style="font-size: 1.2rem;">📝</span>
                  <h2 class="section-card-title">과제 목록</h2>
                </div>
                <div class="flex flex-col gap-sm">
                  ${assignmentSectionBanner}
                  ${assignments.length === 0 ? assignmentEmptyMessage : assignments.map(a => {
      const sub = submissions.find(s => String(s.assignmentId) === String(a.id));
      return `
                      <div class="interactive-item assignment-item ${sub ? 'submitted' : 'pending'}" data-id="${a.id}">
                        <div>
                          <div style="font-weight: 600; font-size: 0.95rem;">${a.title}</div>
                          <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">기한: ${a.dueDate || '없음'}</div>
                        </div>
                        <span class="badge ${sub ? 'badge-green' : 'badge-purple'}">${sub ? '완료' : '미제출'}</span>
                      </div>
                    `;
    }).join('')}
                </div>
              </div>

              <div class="section-card card">
                <div class="section-card-header">
                  <span style="font-size: 1.2rem;">📁</span>
                  <h2 class="section-card-title">수업 자료실</h2>
                </div>
                <div class="flex flex-col gap-sm">
                  ${resources.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 20px;">공유된 자료가 없습니다.</p>' : resources.map(res => `
                    <div class="interactive-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                      <div style="font-weight: 600; font-size: 0.95rem;">${res.title}</div>
                      <div class="flex gap-sm" style="width: 100%; flex-wrap: wrap;">
                        ${res.files.map(f => `<button class="btn btn-secondary btn-sm" style="font-size: 0.75rem;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <div class="flex flex-col student-dashboard-col-gap">
              <!-- Announcements -->
              <div class="section-card card">
                <div class="section-card-header">
                  <span style="font-size: 1.2rem;">📢</span>
                  <h2 class="section-card-title">공지사항</h2>
                </div>
                <div class="flex flex-col gap-sm student-dashboard-announce-scroll">
                   ${announcements.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 20px;">새로운 소식이 없습니다.</p>' : announcements.map(ann => `
                     <div class="feed-item" style="margin-bottom: 0;">
                       <div style="font-weight: 700; margin-bottom: 8px; color: var(--text-main);">${ann.title}</div>
                       <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 15px;">${ann.content}</p>
                       ${ann.files && ann.files.length > 0 ? `
                         <div class="flex gap-sm" style="margin-bottom: 10px; flex-wrap: wrap;">
                           ${ann.files.map(f => `<span class="badge badge-blue" style="cursor: pointer; text-transform: none;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</span>`).join('')}
                         </div>
                       ` : ''}
                       <div style="font-size: 0.75rem; color: var(--text-dim);">${formatDate(ann.createdAt)}</div>
                     </div>
                   `).join('')}
                </div>
              </div>

              <!-- Student Self Records -->
              <div class="section-card card">
                <div class="section-card-header" style="margin-bottom: var(--s-2); padding-bottom: var(--s-2);">
                  <span style="font-size: 1.1rem;">📌</span>
                  <h2 class="section-card-title" style="font-size: 1.25rem;">나의 기록</h2>
                </div>
                <p style="font-size: 0.8rem; color: var(--text-dim); margin: 0 0 var(--s-3); line-height: 1.4;">제목 없이 내용만 적어도 됩니다.</p>
                <div class="form-group" style="margin-bottom: var(--s-2);">
                  <input type="text" class="input-field" id="self-record-title" placeholder="제목 (선택)" />
                </div>
                <div class="form-group" style="margin-bottom: var(--s-2);">
                  <textarea class="input-field" id="self-record-content" rows="2" placeholder="기록할 내용"></textarea>
                </div>
                <div class="drop-zone" id="self-record-dropzone" style="height: 72px; padding: 12px; margin-bottom: var(--s-2);">
                  <div style="font-size: 1.1rem;">📎</div>
                  <div style="font-weight: 600; font-size: 0.82rem;">파일 (선택)</div>
                  <input type="file" id="self-record-files" multiple class="hidden" />
                </div>
                <div id="self-record-file-list" class="file-queue-list" style="margin-bottom: var(--s-2);"></div>
                <button class="btn btn-primary w-full" id="btn-save-self-record" style="min-height: 44px;">기록 저장</button>

                <div class="divider" style="margin: var(--s-4) 0;"></div>
                <div class="flex flex-col gap-sm" id="self-record-list">
                  ${selfRecords.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 10px;">아직 작성한 기록이 없습니다.</p>' : selfRecords.map(record => `
                    <div class="interactive-item" style="flex-direction: column; align-items: flex-start; gap: 6px; padding: var(--s-3);">
                      <div class="flex justify-between items-center" style="width: 100%; gap: 10px;">
                        <div style="font-weight: 700; font-size: 0.88rem;">${record.title || '제목 없음'}</div>
                        <span style="font-size: 0.72rem; color: var(--text-dim); white-space: nowrap;">${formatDate(record.createdAt)}</span>
                      </div>
                      ${record.content ? `<div style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.45; white-space: pre-line;">${record.content}</div>` : ''}
                      ${record.files && record.files.length > 0 ? `
                        <div class="flex gap-sm" style="flex-wrap: wrap;">
                          ${record.files.map(f => `<button class="btn btn-secondary btn-sm" style="font-size: 0.72rem;" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                        </div>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <div id="student-note-modal" class="modal-backdrop ${studentNotePanelOpen ? 'active' : ''}" role="dialog" aria-modal="true" aria-labelledby="student-note-modal-title" style="z-index: 1050;">
        <div class="modal-content animate-up student-note-modal-sheet">
          <div class="modal-header" style="margin-bottom: var(--s-4);">
            <h3 class="modal-title" id="student-note-modal-title" style="font-size: 1.25rem; margin-bottom: 0;">💬 선생님께 쪽지</h3>
            <button type="button" class="modal-close" id="btn-close-student-note-modal" aria-label="닫기">✕</button>
          </div>
          <div class="modal-body student-note-modal-body">
            <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.55; margin-top: 0; margin-bottom: var(--s-4);">
              질문이나 하고 싶은 말을 남기면 선생님 화면에 표시됩니다.
            </p>
            ${cls && cls.teacherId ? `
              <textarea class="input-field" id="student-note-message" rows="3" placeholder="질문 또는 할 말을 적어 주세요"></textarea>
              <div class="flex justify-end" style="margin-top: var(--s-3); gap: var(--s-2);">
                <button type="button" class="btn btn-ghost btn-sm" id="btn-dismiss-student-note-modal">나중에</button>
                <button type="button" class="btn btn-primary btn-sm" id="btn-send-student-note">보내기</button>
              </div>
            ` : '<p style="font-size: 0.88rem; color: var(--text-dim);">클래스에 연결되어 있지 않아 쪽지를 보낼 수 없습니다.</p>' }
            <div class="divider" style="margin: var(--s-6) 0 var(--s-4);"></div>
            <div class="student-note-sent-label" style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: var(--s-2);">내가 보낸 쪽지</div>
            <div class="flex flex-col gap-sm student-note-modal-history">
              ${studentNotes.length === 0 ? '<p class="text-center" style="color: var(--text-dim); padding: 6px;">아직 보낸 쪽지가 없습니다.</p>' : studentNotes.slice(0, 12).map((n) => `
                <div class="student-note-sent-item">
                  <div class="student-note-sent-meta">${formatDate(n.createdAt)}</div>
                  <div style="font-size: 0.88rem; line-height: 1.45; white-space: pre-wrap;">${(n.message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Video Modal -->
      <div class="modal-backdrop" id="video-modal" style="z-index: 2000;">
        <div class="modal-content" style="max-width: 1000px; width: 90%; background: #000; padding: 0;">
          <div class="modal-header" style="background: rgba(0,0,0,0.5); position: absolute; top: 0; left: 0; right: 0; z-index: 10;">
             <h3 class="modal-title" style="color: #fff;" id="video-modal-title">발표 보기</h3>
             <button class="modal-close" style="color: #fff; background: rgba(255,255,255,0.1);" id="close-video-modal">✕</button>
          </div>
          <div class="student-playback-stage">
            <img id="playback-wb" class="student-playback-wb hidden" alt="칠판·풀이 화면" />
            <video id="player" controls class="student-playback-video">소스가 없습니다.</video>
            <audio id="playback-audio" controls class="student-playback-audio hidden"></audio>
          </div>
        </div>
      </div>

      <!-- Character Selection Modal (shown on first login OR when changing) -->
      <div id="selection-modal" class="modal-backdrop ${!freshStudent.characterType ? 'active' : ''}" style="z-index: 1000;">
        <div class="modal-content animate-up" style="max-width: 700px; text-align: center; background: var(--bg-card); max-height: 90vh; overflow-y: auto;">
          <h2 class="modal-title" style="margin-bottom: var(--s-4); font-family: var(--font-title);">🌱 나만의 반려 식물 고르기</h2>
          <p style="color: var(--text-muted); margin-bottom: var(--s-6); font-family: var(--font-sans);">${freshStudent.characterType ? '새로운 단짝 식물을 골라보세요!' : '함께 성장할 단짝 식물을 선택해봐요!'}</p>
          <div class="grid" style="grid-template-columns: repeat(5, 1fr); gap: var(--s-3); margin-bottom: var(--s-6);">
            ${Object.entries(PLANT_TYPES).map(([id, info]) => `
              <div class="card selection-card ${freshStudent.characterType === id ? 'current' : ''}" data-type="${id}" style="cursor: pointer; padding: var(--s-3) var(--s-2); transition: all 0.3s var(--ease-out); border: 2px solid var(--border-main); min-width: 0;">
                <div style="font-size: 2rem; margin-bottom: 4px;">${info.icon}</div>
                <div style="font-family: var(--font-title); font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${info.name}</div>
              </div>
            `).join('')}
          </div>
          <div class="flex gap-sm">
            ${freshStudent.characterType ? '<button class="btn btn-ghost btn-lg flex-1" id="btn-cancel-selection">취소</button>' : ''}
            <button class="btn btn-primary btn-lg ${freshStudent.characterType ? 'flex-1' : 'w-full'}" id="btn-confirm-selection" disabled>이 식물로 할래요!</button>
          </div>
        </div>
      </div>
      <style>
        .selection-card.selected {
          border-color: var(--primary) !important;
          background: #FFFDFC !important;
          transform: scale(1.05);
          box-shadow: var(--shadow-lg);
        }
        .selection-card.current {
          border-color: var(--text-dim) !important;
          opacity: 0.6;
        }
        .selection-card.current::after {
          content: '현재';
          display: block;
          font-size: 0.65rem;
          color: var(--text-dim);
          margin-top: 2px;
        }
      </style>
    `;

    bindEvents(assignments, freshStudent, cls, problemPrompts, allPresentations);

    const cid = freshStudent.classId || '';
    if (cid && cid !== lastQuizBoundClassId) {
      lastQuizBoundClassId = cid;
      startQuizListener();
    }
  }

  function fingerprintProblemImage(pi) {
    if (!pi || typeof pi !== 'object') return '';
    const u = typeof pi.url === 'string' ? pi.url : '';
    const id = pi.id != null ? String(pi.id) : '';
    return `${id}\u001f${u}`;
  }

  function startQuizListener() {
    if (unsubscribeQuiz) unsubscribeQuiz();
    const classId = quizListenClassId || student.classId;
    if (!classId) return;
    unsubscribeQuiz = listenToActiveQuiz(classId, (quiz) => {
      if (quiz && quiz.active) {
        if (dismissedQuizIds.has(quiz.id)) return;

        const prev = activeQuiz;
        const isNewQuiz = !prev || prev.id !== quiz.id;
        activeQuiz = quiz;

        if (isNewQuiz) {
          showToast('⚡ 번개 퀴즈가 시작되었습니다!', 'info');
          startSubmissionsListener(quiz.id);
          renderQuizOverlay();
          return;
        }

        const probChanged =
          (prev.problemText || '') !== (quiz.problemText || '') ||
          fingerprintProblemImage(prev.problemImage) !== fingerprintProblemImage(quiz.problemImage);

        if (probChanged) {
          renderQuizOverlay();
          return;
        }

        // 갤러리 공개 상태 변경 감지
        const prevRevealed = prev.galleryRevealed ?? false;
        const curRevealed = quiz.galleryRevealed ?? false;
        if (prevRevealed !== curRevealed) {
          void hydrateQuizGallery(quizSubmissions);
        }
      } else {
        if (activeQuiz) {
          activeQuiz = null;
          if (unsubscribeSubmissions) unsubscribeSubmissions();
          removeQuizOverlay();
        }
      }
    });
  }

  /** Firestore 저장본에서 다운로드 URL 확보(url 없으면 FILES 문서 로드). */
  async function resolveStoredFileUrl(fileRef) {
    if (!fileRef) return '';
    const direct = typeof fileRef.url === 'string' ? fileRef.url.trim() : '';
    if (direct) return direct;
    const fid = fileRef.id ?? fileRef.fileId;
    if (!fid) return '';
    try {
      const meta = await getFileById(String(fid));
      return typeof meta?.url === 'string' ? meta.url.trim() : '';
    } catch {
      return '';
    }
  }

  function escapeImgAttrSafeUrl(raw) {
    return String(raw).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  async function hydrateQuizGallery(subs) {
    const gallery = document.getElementById('quiz-gallery');
    if (!gallery || !Array.isArray(subs)) return;

    const isRevealed = activeQuiz?.galleryRevealed === true;

    // 사이드바 제목 업데이트
    const heading = document.querySelector('#quiz-overlay .quiz-overlay-sidebar-heading');
    if (heading) {
      heading.textContent = isRevealed
        ? `친구들의 풀이 (${subs.length})`
        : `제출 현황 (${subs.length}명)`;
    }

    if (!isRevealed) {
      // 공개 전: 이름 목록만 표시
      if (subs.length === 0) {
        gallery.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-dim); text-align: center; padding: 16px;">아직 제출한 친구가 없습니다.</p>';
      } else {
        gallery.innerHTML = subs.map(s => `
          <div class="card quiz-gallery__card" style="flex-direction: row; align-items: center; gap: 10px; padding: 10px 14px !important;">
            <span style="font-size: 1.1rem;">✅</span>
            <span class="quiz-gallery__student-name" style="margin-top: 0; font-size: 0.9rem;">${escapeHtml(s.studentName || '')}</span>
          </div>
        `).join('');
      }
      return;
    }

    // 공개 후: 전체 풀이 표시
    const rows = await Promise.all(
      subs.map(async (s) => ({
        s,
        imageUrl: s.image ? await resolveStoredFileUrl(s.image) : '',
      })),
    );

    gallery.innerHTML = rows
      .map(({ s, imageUrl }) => `
          <div class="card quiz-gallery__card">
            ${imageUrl
        ? `<div class="quiz-gallery__thumb-wrap"><img class="quiz-gallery__thumb" src="${escapeImgAttrSafeUrl(imageUrl)}" alt="" loading="lazy" decoding="async"/></div>`
        : ''}
            ${s.solutionText
        ? `<div class="quiz-gallery__solution quiz-solution-math quiz-math-render-root">${escapeHtml(s.solutionText)}</div>`
        : ''}
            <div class="quiz-gallery__student-name">${escapeHtml(s.studentName || '')}</div>
          </div>
        `)
      .join('');

    gallery.querySelectorAll('.quiz-gallery__solution.quiz-math-render-root').forEach((el) => {
      renderQuizMath(el);
    });
  }

  function startSubmissionsListener(quizId) {
    if (unsubscribeSubmissions) unsubscribeSubmissions();
    unsubscribeSubmissions = listenToQuizSubmissions(quizId, (subs) => {
      quizSubmissions = subs;
      void hydrateQuizGallery(subs);
    });
}

  // Track dismissed quiz IDs so they don't reappear
  let dismissedQuizIds = new Set();

  function renderQuizOverlay() {
    removeQuizOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'quiz-overlay';
    overlay.className = 'modal-backdrop active page-enter';
    overlay.style.zIndex = '500';
    overlay.innerHTML = `
      <div class="modal-content animate-up quiz-overlay-modal-inner" style="max-width: 1200px; width: 95%; height: min(96vh, 900px); max-height: min(96dvh, 900px); display: flex; flex-direction: column; min-height: 0;">
        <div class="modal-header">
          <h2 class="modal-title">⚡ 실시간 번개 퀴즈</h2>
          <div class="flex items-center gap-sm">
            <div class="badge badge-purple">진행 중</div>
            <button class="modal-close" id="btn-close-quiz-overlay" title="닫기">✕</button>
          </div>
        </div>
        <div class="quiz-overlay-shell flex-1" style="min-height: 0;">
          <section class="quiz-problem-shell quiz-problem-shell--student-overlay flex-shrink-0">
            <h3 class="quiz-problem-shell__head">문제</h3>
            <div class="quiz-problem-shell__body">
              ${activeQuiz.problemText ? `
              <div class="quiz-math-render-root latex-panel-root">
                <div class="latex-preview-panel latex-preview-panel--standalone">
                  <div class="latex-preview-body">${escapeHtml(activeQuiz.problemText)}</div>
                </div>
              </div>` : ''}
              <div id="quiz-problem-image-root" class="quiz-problem-image-root" ${activeQuiz.problemImage ? '' : 'hidden'}></div>
            </div>
          </section>
          <div class="quiz-overlay-columns">
            <div class="quiz-overlay-submit-card card">
              <h3 style="margin-bottom: 16px; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.5rem;">✍️</span> 내 풀이 제출
              </h3>

              <div class="form-group" style="margin-bottom: 16px;">
                <label class="input-label">답안·풀이 (텍스트)</label>
                <textarea class="input-field" id="quiz-solve-text" rows="4" spellcheck="false" placeholder="풀이를 작성하세요. 수식은 $x^2$ 나 $$ \\frac{\\sqrt{3}}{2} $$ 같은 LaTeX를 쓸 수 있습니다."></textarea>
                <p class="quiz-math-hint"><strong>팁:</strong> 짧은 수식은 가운데 $ 두 개 사이에, 새 줄에서 크게 나오게 하려면 같은 기호 두 개($$)로 줄 전체를 감싸 보세요.</p>
              </div>

              <div class="form-group" style="margin-bottom: 16px;">
                <label class="input-label">사진 제출 (선택)</label>
                <div class="drop-zone" id="quiz-solve-dropzone" style="padding: 20px; min-height: 100px;">
                  <span style="font-size: 1.5rem;">📷</span>
                  <p id="quiz-solve-status" style="font-weight: 600; margin-bottom: 4px;">사진을 여기에 드래그하거나 클릭 · 붙여넣기(Ctrl+V)</p>
                  <p style="font-size: 0.75rem; opacity: 0.65; margin: 0;">JPG, PNG 등 이미지 파일 지원</p>
                  <input type="file" id="quiz-solve-input" class="hidden" accept="image/*" />
                </div>
              </div>

              <button class="btn btn-primary btn-lg w-full" style="min-height: 56px; font-size: 1.1rem;" id="btn-submit-quiz-solve">✨ 풀이 제출 및 공유</button>
            </div>
            <div class="quiz-overlay-sidebar flex flex-col overflow-hidden">
              <h4 class="quiz-overlay-sidebar-heading">친구들의 풀이</h4>
              <div id="quiz-gallery" class="quiz-overlay-gallery-grid"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    void (async () => {
      const root = overlay.querySelector('#quiz-problem-image-root');
      if (!root) return;
      const pi = activeQuiz?.problemImage;
      if (!pi) {
        root.hidden = true;
        root.innerHTML = '';
        return;
      }
      root.hidden = false;
      root.innerHTML = '<p class="quiz-problem-image-placeholder">문제 이미지를 불러오는 중…</p>';
      try {
        const url = await resolveStoredFileUrl(pi);
        root.innerHTML = '';
        if (!url) {
          root.innerHTML = '<p class="quiz-problem-image-error">문제 이미지를 불러오지 못했습니다.</p>';
          return;
        }
        const wrap = document.createElement('div');
        wrap.className = 'quiz-problem-shell__img-wrap';
        const img = document.createElement('img');
        img.className = 'quiz-problem-shell__img';
        img.alt = '문제 이미지';
        img.loading = 'eager';
        img.decoding = 'async';
        img.onerror = () => {
          root.innerHTML = '<p class="quiz-problem-image-error">문제 이미지를 표시할 수 없습니다.</p>';
        };
        img.src = url;
        wrap.appendChild(img);
        root.appendChild(wrap);
      } catch (_) {
        root.innerHTML = '<p class="quiz-problem-image-error">문제 이미지를 불러오지 못했습니다.</p>';
      }
    })();

    void hydrateQuizGallery(quizSubmissions);

    // 닫기 버튼: 현재 퀴즈를 무시 목록에 추가하고 오버레이 제거
    overlay.querySelector('#btn-close-quiz-overlay').addEventListener('click', () => {
      if (activeQuiz) {
        dismissedQuizIds.add(activeQuiz.id);
      }
      activeQuiz = null;
      removeQuizOverlay();
    });

    const solveInput = overlay.querySelector('#quiz-solve-input');
    const solveStatus = overlay.querySelector('#quiz-solve-status');
    const solveText = overlay.querySelector('#quiz-solve-text');

    const solveDropzone = overlay.querySelector('#quiz-solve-dropzone');
    solveDropzone.addEventListener('click', () => solveInput.click());
    solveInput.addEventListener('change', () => {
      if (solveInput.files[0]) solveStatus.textContent = `선택됨: ${solveInput.files[0].name}`;
    });

    // 드래그앤드롭 지원
    solveDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      solveDropzone.classList.add('dragover');
    });
    solveDropzone.addEventListener('dragleave', () => {
      solveDropzone.classList.remove('dragover');
    });
    solveDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      solveDropzone.classList.remove('dragover');
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        solveInput.files = dt.files;
        solveStatus.textContent = `선택됨: ${file.name}`;
      }
    });

    quizOverlayPasteUnsub = bindClipboardPasteZone({
      zone: solveDropzone,
      imagesOnly: true,
      onPaste: (files) => {
        const file = files.find((f) => String(f.type || '').startsWith('image/'));
        if (!file) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        solveInput.files = dt.files;
        solveStatus.textContent = `선택됨: ${file.name}`;
      },
    });

    overlay.querySelector('#btn-submit-quiz-solve').addEventListener('click', async () => {
      const solutionText = solveText.value.trim();
      const hasImage = solveInput.files[0];
      
      if (!solutionText && !hasImage) { showToast('답안을 입력하거나 사진을 선택해주세요.', 'error'); return; }
      
      const submitBtn = overlay.querySelector('#btn-submit-quiz-solve');
      submitBtn.disabled = true;
      submitBtn.textContent = '제출 중...';

      try {
        let saved = null;
        if (hasImage) saved = await saveFile(solveInput.files[0]);
        await submitQuizSolution(activeQuiz.id, student.id, student.name, saved, solutionText);
        showToast('풀이가 제출되었습니다! 잘했어요! 🎉');
        solveText.value = '';
        solveInput.value = '';
        solveStatus.textContent = '사진을 여기에 드래그하거나 클릭하여 업로드';
      } catch (err) { showToast('제출 중 오류 발생', 'error'); }
      finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '✨ 풀이 제출 및 공유';
      }
    });

    setTimeout(() => {
      overlay.querySelectorAll('.quiz-problem-shell .quiz-math-render-root').forEach((el) => renderQuizMath(el));
    }, 0);

  }

  function removeQuizOverlay() {
    if (quizOverlayPasteUnsub) {
      quizOverlayPasteUnsub();
      quizOverlayPasteUnsub = null;
    }
    const existing = document.getElementById('quiz-overlay');
    if (existing) existing.remove();
  }

  function bindEvents(assignments, freshStudent, cls, problemPrompts = [], allPresentations = []) {
    clipboardPasteUnsubs.forEach((u) => u());
    clipboardPasteUnsubs.length = 0;

    const closePlaybackModal = () => {
      const videoModal = document.getElementById('video-modal');
      const player = document.getElementById('player');
      const audioEl = document.getElementById('playback-audio');
      const wbImg = document.getElementById('playback-wb');
      player?.pause();
      if (player) player.src = '';
      audioEl?.pause();
      if (audioEl) audioEl.src = '';
      if (wbImg) {
        wbImg.src = '';
        wbImg.classList.add('hidden');
      }
      if (player) player.classList.remove('hidden');
      if (audioEl) audioEl.classList.add('hidden');
      videoModal?.classList.remove('active');
    };

    const openPlayback = (btn) => {
      const videoModal = document.getElementById('video-modal');
      const player = document.getElementById('player');
      const audioEl = document.getElementById('playback-audio');
      const wbImg = document.getElementById('playback-wb');
      const modalTitle = document.getElementById('video-modal-title');
      if (!videoModal || !player) return;

      const mediaUrl = btn.dataset.url || '';
      const wbUrl = btn.dataset.wbUrl || '';
      const mode = btn.dataset.recordingMode || 'audio';

      player.pause();
      player.src = '';
      audioEl?.pause();
      if (audioEl) audioEl.src = '';
      if (wbImg) {
        wbImg.src = '';
        wbImg.classList.add('hidden');
      }
      player.classList.remove('hidden');
      audioEl?.classList.add('hidden');

      if (mode === 'video' && mediaUrl) {
        if (modalTitle) modalTitle.textContent = '발표 영상';
        player.src = mediaUrl;
        videoModal.classList.add('active');
        void player.play();
        return;
      }

      if (wbUrl && wbImg) {
        wbImg.src = wbUrl;
        wbImg.classList.remove('hidden');
      }

      if (mediaUrl && wbUrl && audioEl) {
        if (modalTitle) modalTitle.textContent = '풀이 화면 + 설명';
        player.classList.add('hidden');
        audioEl.classList.remove('hidden');
        audioEl.src = mediaUrl;
        videoModal.classList.add('active');
        void audioEl.play();
        return;
      }

      if (mediaUrl) {
        if (modalTitle) modalTitle.textContent = '발표 듣기';
        player.src = mediaUrl;
        videoModal.classList.add('active');
        void player.play();
        return;
      }

      if (wbUrl && wbImg) {
        if (modalTitle) modalTitle.textContent = '풀이 화면';
        player.classList.add('hidden');
        videoModal.classList.add('active');
      }
    };

    const videoModal = document.getElementById('video-modal');
    if (videoModal) {
      document.querySelectorAll('.btn-play-video').forEach((btn) => {
        btn.addEventListener('click', () => openPlayback(btn));
      });
      document.getElementById('close-video-modal')?.addEventListener('click', closePlaybackModal);
      videoModal.addEventListener('click', (e) => {
        if (e.target === videoModal) closePlaybackModal();
      });
    }

    document.getElementById('btn-toggle-student-note')?.addEventListener('click', () => {
      studentNotePanelOpen = !studentNotePanelOpen;
      render();
    });

    document.getElementById('btn-close-student-note-modal')?.addEventListener('click', () => {
      studentNotePanelOpen = false;
      render();
    });
    document.getElementById('btn-dismiss-student-note-modal')?.addEventListener('click', () => {
      studentNotePanelOpen = false;
      render();
    });
    document.getElementById('student-note-modal')?.addEventListener('click', (e) => {
      if (e.target?.id === 'student-note-modal') {
        studentNotePanelOpen = false;
        render();
      }
    });

    document.getElementById('btn-send-student-note')?.addEventListener('click', async () => {
      const ta = document.getElementById('student-note-message');
      if (!cls?.teacherId || !ta) return;
      const message = ta.value.trim();
      if (!message) { showToast('내용을 입력해 주세요.', 'error'); return; }
      const sendBtn = document.getElementById('btn-send-student-note');
      if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '보내는 중...'; }
      try {
        await createStudentNote({
          classId: cls.id,
          teacherId: cls.teacherId,
          className: cls.name || '',
          studentId: freshStudent.id,
          studentName: freshStudent.name,
          message,
        });
        showToast('선생님께 쪽지를 보냈어요!');
        render();
      } catch (err) {
        console.error(err);
        showToast('전송에 실패했습니다.', 'error');
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '보내기'; }
      }
    });

    document.querySelectorAll('.btn-open-pres-img').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.dataset.imgUrl;
        if (u) window.open(u, '_blank');
      });
    });

    // 삭제: 한 문제 풀이 (내 제출만)
    document.querySelectorAll('.btn-delete-my-problem-sol').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (!confirm('이 문제에 올린 내 풀이를 삭제할까요?\n(칠판·사진·음성 모두 삭제됩니다)')) return;
        try {
          showToast('삭제 중…', 'info', 2500);
          const ok = await deletePresentationById(id);
          if (ok) {
            showToast('내 풀이가 삭제되었습니다.', 'success');
            render();
          } else {
            showToast('삭제할 풀이를 찾지 못했습니다.', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('삭제 중 오류가 발생했습니다.', 'error');
        }
      });
    });

    document.querySelectorAll('.btn-toggle-share').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const presentationId = btn.dataset.id;
        const isShared = btn.dataset.shared === 'true';

        if (isShared) {
          try {
            await toggleSharePresentation(presentationId, null, []);
            showToast('공유가 해제되었습니다.');
            render();
          } catch (err) {
            showToast('오류가 발생했습니다.', 'error');
          }
          return;
        }

        let otherClasses = [];
        if (cls?.teacherId) {
          try {
            otherClasses = (await getClassesByTeacher(cls.teacherId)).filter(
              (c) => c.id !== freshStudent.classId,
            );
          } catch (_) { /* 무시 — 제목만으로 공유 */ }
        }

        const modalId = `student-share-${Date.now()}`;
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop active';
        modal.id = modalId;
        modal.innerHTML = `
          <div class="modal-content" style="max-width: 480px;">
            <div class="modal-header">
              <h3 class="modal-title">📤 발표 공유 설정</h3>
              <button type="button" class="modal-close" id="${modalId}-close" aria-label="닫기">✕</button>
            </div>
            <div class="form-group" style="margin-bottom: var(--s-4);">
              <label class="input-label">공유 제목 <span style="color:var(--error)">*</span></label>
              <input type="text" class="input-field" id="${modalId}-title" placeholder="예: 기하 프린트 1번 문제" />
            </div>
            ${otherClasses.length > 0 ? `
            <div class="form-group" style="margin-bottom: var(--s-6);">
              <label class="input-label" style="margin-bottom: var(--s-2);">다른 클래스에도 공유 (선택)</label>
              <div style="display: flex; flex-direction: column; gap: 8px; background: var(--bg-main); border-radius: var(--r-sm); padding: var(--s-3);">
                ${otherClasses.map((c) => `
                  <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 0.9rem;">
                    <input type="checkbox" class="share-class-check" value="${escapeHtml(String(c.id))}" style="width:16px; height:16px; cursor:pointer;" />
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${escapeHtml(String(c.color || 'var(--primary)'))}; flex-shrink:0;"></span>
                    ${escapeHtml(c.name || '클래스')}
                  </label>
                `).join('')}
              </div>
            </div>
            ` : ''}
            <div class="flex gap-sm">
              <button type="button" class="btn btn-primary flex-1" id="${modalId}-confirm">✨ 공유하기</button>
              <button type="button" class="btn btn-ghost" id="${modalId}-cancel">취소</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        document.getElementById(`${modalId}-close`)?.addEventListener('click', closeModal);
        document.getElementById(`${modalId}-cancel`)?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });

        document.getElementById(`${modalId}-confirm`)?.addEventListener('click', async () => {
          const titleInput = document.getElementById(`${modalId}-title`);
          const title = String(titleInput?.value || '').trim();
          if (!title) {
            showToast('제목을 입력해 주세요.', 'error');
            return;
          }
          const selectedClassIds = [...modal.querySelectorAll('.share-class-check:checked')].map(
            (cb) => cb.value,
          );
          closeModal();
          try {
            await toggleSharePresentation(presentationId, title, selectedClassIds);
            const pres = allPresentations.find((p) => String(p.id) === String(presentationId));
            if (pres?.type === 'problem_solution') {
              await addStudentPoints(freshStudent.id, 1);
              showToast(
                selectedClassIds.length > 0
                  ? `공유했어요! +1P · ${selectedClassIds.length}개 클래스에도 보여요`
                  : '공유 완료! +1P',
              );
            } else {
              showToast(
                selectedClassIds.length > 0
                  ? `공유했어요 — ${selectedClassIds.length}개 클래스에 추가로 보여요`
                  : '공유 완료!',
              );
            }
            render();
          } catch (err) {
            showToast('오류가 발생했습니다.', 'error');
          }
        });
      });
    });

    // Selection Modal Events
    const modal = document.getElementById('selection-modal');
    if (modal) {
      let selectedType = null;
      const confirmBtn = document.getElementById('btn-confirm-selection');
      const cancelBtn = document.getElementById('btn-cancel-selection');
      
      modal.querySelectorAll('.selection-card').forEach(card => {
        card.addEventListener('click', () => {
          modal.querySelectorAll('.selection-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedType = card.dataset.type;
          confirmBtn.disabled = false;
        });
      });

      cancelBtn?.addEventListener('click', () => {
        modal.classList.remove('active');
      });

      confirmBtn.addEventListener('click', async () => {
        if (!selectedType) return;
        try {
          await updateStudentCharacterType(freshStudent.id, selectedType);
          showToast(`${PLANT_TYPES[selectedType].name}와(과) 단짝이 되었어요! 🎉`);
          render();
        } catch (err) {
          showToast('선택 중 오류가 발생했습니다.', 'error');
        }
      });
    }

    // Change Character Button
    document.getElementById('btn-change-character')?.addEventListener('click', () => {
      const modal = document.getElementById('selection-modal');
      if (modal) modal.classList.add('active');
    });

    function updateSelfRecordFileListUI() {
      const listContainer = document.getElementById('self-record-file-list');
      if (!listContainer) return;

      listContainer.innerHTML = selfRecordFilesQueue.map((f, idx) => `
        <div class="file-queue-item" style="border-left: 4px solid var(--primary);">
          <div class="file-item-info">
            <span style="font-size: 1.1rem;">📄</span>
            <span class="file-item-name">${f.name}</span>
          </div>
          <button class="btn-remove-file" onclick="window.removeQueuedSelfRecordFile(${idx})">✕</button>
        </div>
      `).join('');
    }

    window.removeQueuedSelfRecordFile = (index) => {
      selfRecordFilesQueue.splice(index, 1);
      updateSelfRecordFileListUI();
    };

    const selfRecordDropzone = document.getElementById('self-record-dropzone');
    const selfRecordFileInput = document.getElementById('self-record-files');

    const addSelfRecordFiles = (files) => {
      const fileArray = Array.from(files);
      const newFiles = fileArray.filter(nf => !selfRecordFilesQueue.some(qf => qf.name === nf.name && qf.size === nf.size));
      selfRecordFilesQueue = [...selfRecordFilesQueue, ...newFiles];
      updateSelfRecordFileListUI();
    };

    selfRecordDropzone?.addEventListener('click', () => selfRecordFileInput.click());
    selfRecordFileInput?.addEventListener('change', () => {
      if (selfRecordFileInput.files.length > 0) {
        addSelfRecordFiles(selfRecordFileInput.files);
        selfRecordFileInput.value = '';
      }
    });
    selfRecordDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      selfRecordDropzone.classList.add('dragover');
    });
    selfRecordDropzone?.addEventListener('dragleave', () => {
      selfRecordDropzone.classList.remove('dragover');
    });
    selfRecordDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      selfRecordDropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) addSelfRecordFiles(e.dataTransfer.files);
    });

    if (selfRecordDropzone) {
      clipboardPasteUnsubs.push(
        bindClipboardPasteZone({
          zone: selfRecordDropzone,
          imagesOnly: false,
          onPaste: (files) => addSelfRecordFiles(files),
        }),
      );
    }

    document.getElementById('btn-save-self-record')?.addEventListener('click', async () => {
      const title = document.getElementById('self-record-title').value.trim();
      const content = document.getElementById('self-record-content').value.trim();
      if (!content && selfRecordFilesQueue.length === 0) {
        showToast('내용을 쓰거나 파일을 추가해 주세요.', 'error');
        return;
      }

      const saveBtn = document.getElementById('btn-save-self-record');
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';

      try {
        const files = [];
        for (const file of selfRecordFilesQueue) {
          const saved = await saveFile(file);
          files.push({ id: saved.id, name: saved.name });
        }
        await createStudentSelfRecord(freshStudent.id, freshStudent.classId, { title, content, files });
        selfRecordFilesQueue = [];
        showToast('나의 기록이 저장되었습니다!');
        render();
      } catch (err) {
        console.error('Self record save error:', err);
        showToast('기록 저장 중 오류가 발생했습니다.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = '기록 저장하기';
      }
    });

    document.getElementById('btn-student-logout')?.addEventListener('click', async () => {
      if (unsubscribeQuiz) unsubscribeQuiz();
      await logoutStudent();
      window.location.hash = '/student/login';
    });

    document.querySelectorAll('.assignment-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedAssignment = assignments.find(a => a.id === item.dataset.id);
        activeView = 'assignment';
        render();
      });
    });

    document.querySelectorAll('.btn-open-problem-board').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.promptId;
        if (pid) window.location.hash = `/student/problem-board/${pid}`;
      });
    });

    document.querySelectorAll('.btn-problem-ai-feedback').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.promptId;
        const sid = btn.dataset.solutionId;
        const pr = problemPrompts.find((p) => String(p.id) === String(pid));
        const sol = allPresentations.find((p) => String(p.id) === String(sid));
        let studentImg = presentationWhiteboardImageUrl(sol);
        if (!studentImg && sol?.whiteboardImage?.id) {
          try {
            const meta = await getFileById(sol.whiteboardImage.id);
            studentImg = typeof meta?.url === 'string' ? meta.url.trim() : '';
          } catch (_) {}
        }

        if (!pr || !sol || !studentImg) {
          showToast('풀이 이미지를 찾을 수 없습니다.', 'error');
          return;
        }

        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop active page-enter';
        backdrop.style.zIndex = '2100';
        backdrop.innerHTML = `
          <div class="modal-content animate-up" style="max-width: 520px; width: 92%; max-height: min(88dvh, 640px); display: flex; flex-direction: column; background: var(--bg-card);">
            <div class="modal-header" style="flex-shrink: 0;">
              <h3 class="modal-title" style="margin: 0;">✨ AI 풀이 피드백</h3>
              <button type="button" class="modal-close" id="prob-feedback-close" aria-label="닫기">✕</button>
            </div>
            <p style="font-size: 0.78rem; color: var(--text-dim); margin: 0 0 var(--s-3); line-height: 1.45; flex-shrink: 0;">
              선생님이 등록한 모범답안을 참고하여 자동으로 분석합니다. 최종 채점 대신 학습 도움용으로 활용해 주세요.
            </p>
            <div id="prob-feedback-body" style="flex: 1; min-height: 120px; overflow-y: auto; font-size: 0.88rem; line-height: 1.6; white-space: pre-wrap; color: var(--text-main); padding: var(--s-2) var(--s-1);"></div>
            <div id="prob-feedback-loading" style="flex-shrink: 0; font-size: 0.85rem; color: var(--text-muted); margin-top: var(--s-3);"></div>
          </div>
        `;
        document.body.appendChild(backdrop);
        const bodyEl = backdrop.querySelector('#prob-feedback-body');
        const loadEl = backdrop.querySelector('#prob-feedback-loading');

        const closeModal = () => {
          backdrop.classList.remove('active');
          setTimeout(() => backdrop.remove(), 200);
        };
        backdrop.querySelector('#prob-feedback-close')?.addEventListener('click', closeModal);
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) closeModal();
        });

        btn.disabled = true;
        loadEl.textContent = '모범답안과 풀이를 분석 중이에요… (10~40초 정도 걸릴 수 있어요)';
        bodyEl.textContent = '';

        try {
          const modelAnswerImageUrls = await collectImageUrlsFromModelAnswerFiles(pr.modelAnswerFiles);
          const modelAnswerNonImageNotes = await collectNonImageModelAnswerFileNotes(pr.modelAnswerFiles);
          const feedback = await fetchProblemSolutionFeedback({
            problemTitle: pr.title || '',
            problemDescription: pr.description || '',
            modelAnswerText: pr.modelAnswerText || '',
            modelAnswerImageUrls,
            modelAnswerNonImageNotes,
            studentImageUrl: studentImg,
          });
          bodyEl.textContent = feedback;
          loadEl.textContent = '';
        } catch (err) {
          console.error(err);
          bodyEl.textContent = '';
          loadEl.innerHTML = `<span style="color: var(--error);">${escapeHtml(String(err.message || '오류'))}</span>`;
          showToast(String(err.message || '피드백 요청 실패'), 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function resetAssignmentRecording() {
    try {
      assignmentRecState.stream?.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    assignmentRecState.stream = null;
    try {
      if (assignmentRecState.mediaRecorder && assignmentRecState.recording && !assignmentRecState.native) {
        assignmentRecState.mediaRecorder.stop();
      }
    } catch (_) {}
    assignmentRecState.mediaRecorder = null;
    assignmentRecState.chunks = [];
    if (assignmentRecState.native && assignmentRecState.recording) {
      VoiceRecorder.stopRecording().catch(() => {});
    }
    assignmentRecState.native = false;
    assignmentRecState.recording = false;
    assignmentRecState.blob = null;
    assignmentRecState.mime = 'audio/webm';
    assignmentRecState.cleared = false;
  }

  function renderAssignmentDetail(freshStudent, assignment, submissions) {
    if (submissionPasteUnsub) {
      submissionPasteUnsub();
      submissionPasteUnsub = null;
    }
    resetAssignmentRecording();
    const sub = submissions.find(s => s.assignmentId === assignment.id);

    container.innerHTML = `
      <div class="student-layout page-enter">
        <header class="student-topbar">
          <button class="btn btn-ghost btn-sm" id="btn-back-dashboard">← 뒤로가기</button>
          <div class="student-topbar-title">과제 상세보기</div>
          <div style="width: 80px;"></div>
        </header>

        <main class="student-dashboard" style="max-width: 900px;">
          <div class="card animate-up" style="padding: var(--s-12); position: relative; overflow: hidden;">
            ${sub ? '<div class="badge badge-green" style="position: absolute; top: var(--s-12); right: var(--s-12);">제출 완료</div>' : ''}
            <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: var(--s-4);">${assignment.title}</h1>
            <p style="font-size: 1.1rem; color: var(--text-muted); line-height: 1.7; margin-bottom: var(--s-8); white-space: pre-line;">${assignment.description || '과제 설명이 없습니다.'}</p>
            
            ${assignment.files && assignment.files.length > 0 ? `
              <div style="margin-bottom: var(--s-8);">
                <div class="input-label">교사 첨부 자료</div>
                <div class="flex gap-sm" style="flex-wrap: wrap;">
                  ${assignment.files.map(f => `<button class="btn btn-secondary btn-sm" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                </div>
              </div>
            ` : ''}

            <div class="divider"></div>

            <div class="form-section">
              <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: var(--s-4);">내 제출물</h3>
              
              <div id="submission-status-view" class="${sub ? '' : 'hidden'}">
                ${sub ? `
                  <div class="card" style="background: rgba(16, 185, 129, 0.05); border-color: var(--success); padding: var(--s-6); margin-bottom: var(--s-4);">
                    <div class="flex justify-between items-center" style="margin-bottom: var(--s-4);">
                       <p style="color: var(--success); font-weight: 600;">과제가 제출되었습니다.</p>
                       <span style="font-size: 0.85rem; color: var(--text-dim);">제출: ${formatDate(sub.createdAt)}</span>
                    </div>
                    ${(sub.files && sub.files.length > 0)
      ? `<div class="flex gap-sm" style="flex-wrap: wrap; margin-bottom: var(--s-4);">
                      ${sub.files.map(f => `<button class="btn btn-ghost btn-sm" style="border: 1px solid var(--border-subtle);" onclick="window.downloadFile('${f.id}')">📎 ${f.name}</button>`).join('')}
                    </div>`
      : '<p style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: var(--s-4);">첨부 파일 없음</p>'}
                    ${sub.textAnswer
      ? `<div style="margin-bottom: var(--s-4); padding: var(--s-4); background: var(--bg-main); border-radius: var(--r-sm); border: 1px solid var(--border-subtle);">
                        <div class="input-label" style="margin-bottom: 6px;">작성 답안</div>
                        <div style="font-size: 0.95rem; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(sub.textAnswer)}</div>
                      </div>`
      : ''}
                    ${sub.audioData?.url
      ? `<div style="margin-bottom: var(--s-4);">
                        <div class="input-label" style="margin-bottom: 6px;">음성 답안</div>
                        <audio controls style="width: 100%; max-width: 420px;" src="${escapeHtml(sub.audioData.url)}"></audio>
                      </div>`
      : ''}
                    <button class="btn btn-outline btn-sm w-full" id="btn-edit-submission">제출물 수정하기</button>
                  </div>
                ` : ''}
              </div>

              <div id="submission-form-view" class="${sub ? 'hidden' : ''}">
                <div class="drop-zone" style="background: var(--bg-surface); border-style: dashed; padding: var(--s-12); border-radius: var(--r-lg);" id="submission-dropzone">
                   <div style="font-size: 2rem; margin-bottom: 10px;">📤</div>
                   <div style="font-weight: 600;">파일을 드래그하거나 클릭하여 업로드 · 붙여넣기(Ctrl+V)</div>
                   <div style="font-size: 0.85rem; color: var(--text-dim); margin-top: 5px;">${sub ? '새로 업로드하면 기존 파일이 대체됩니다.' : '여러 파일 업로드(HTML 등) 가능'}</div>
                   <div id="submission-file-list" style="margin-top: 15px; font-size: 0.9rem; color: var(--primary); font-weight: 500;"></div>
                   <input type="file" id="submission-file" class="hidden" multiple />
                </div>

                <div style="margin-top: var(--s-8);">
                  <label class="input-label" for="submission-text">작성 답안 (선택)</label>
                  <textarea id="submission-text" class="input-field" rows="5" placeholder="풀이 과정이나 생각을 글로 적어 주세요."></textarea>
                </div>

                <div style="margin-top: var(--s-6);">
                  <div class="input-label">음성 답안 (선택)</div>
                  <div class="flex flex-wrap items-center gap-sm" style="margin-top: var(--s-2);">
                    <button type="button" class="btn btn-primary btn-sm" id="btn-assign-rec-toggle">🎙️ 녹음 시작</button>
                    <button type="button" class="btn btn-ghost btn-sm hidden" id="btn-assign-rec-clear">녹음·음성 제거</button>
                    <span id="assign-rec-status" style="font-size: 0.85rem; color: var(--text-muted);">녹음 없음(선택)</span>
                  </div>
                </div>

                <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: var(--s-4);">파일·글·녹음 중 <strong>한 가지 이상</strong> 있으면 제출할 수 있습니다.</p>

                <div class="flex gap-md" style="margin-top: var(--s-6);">
                  ${sub ? `<button class="btn btn-ghost btn-lg flex-1" id="btn-cancel-edit">취소</button>` : ''}
                  <button class="btn btn-primary btn-lg ${sub ? 'flex-1' : 'w-full'}" id="btn-submit-assignment">${sub ? '수정 완료' : '과제 제출하기'}</button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    `;

    function updateSubmissionFileListUI() {
      const listContainer = document.getElementById('submission-file-list');
      if (!listContainer) return;
      
      listContainer.innerHTML = submissionFilesQueue.map((f, idx) => `
        <div class="file-queue-item" style="border-left: 4px solid var(--primary);">
          <div class="file-item-info">
            <span style="font-size: 1.1rem;">📄</span>
            <span class="file-item-name">${f.name}</span>
          </div>
          <button class="btn-remove-file" onclick="window.removeQueuedSubmissionFile(${idx})">✕</button>
        </div>
      `).join('');
    }

    window.removeQueuedSubmissionFile = (index) => {
      submissionFilesQueue.splice(index, 1);
      updateSubmissionFileListUI();
    };

    function updateAssignRecUI() {
      const btn = document.getElementById('btn-assign-rec-toggle');
      const st = document.getElementById('assign-rec-status');
      const clr = document.getElementById('btn-assign-rec-clear');
      if (!btn || !st) return;
      if (assignmentRecState.recording) {
        btn.textContent = '⏹ 녹음 종료';
        btn.className = 'btn btn-danger btn-sm';
        st.textContent = '녹음 중…';
      } else if (assignmentRecState.blob) {
        btn.textContent = '🎙️ 다시 녹음';
        btn.className = 'btn btn-secondary btn-sm';
        st.textContent = '녹음 완료(제출 시 업로드됩니다)';
      } else {
        btn.textContent = '🎙️ 녹음 시작';
        btn.className = 'btn btn-primary btn-sm';
        st.textContent = assignmentRecState.cleared ? '기존 음성 답안은 제출 시 삭제됩니다' : '녹음 없음(선택)';
      }
      if (clr) {
        const showClear = !!(assignmentRecState.blob || (sub?.audioData && !assignmentRecState.cleared));
        clr.classList.toggle('hidden', !showClear);
      }
    }

    async function startAssignRec() {
      if (assignmentRecState.recording) return;
      assignmentRecState.chunks = [];
      assignmentRecState.blob = null;
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        try {
          const perm = await VoiceRecorder.requestAudioRecordingPermission();
          if (!perm.value) {
            showToast('마이크 권한이 필요합니다.', 'error');
            return;
          }
          await VoiceRecorder.startRecording();
          assignmentRecState.native = true;
          assignmentRecState.recording = true;
          assignmentRecState.cleared = false;
          updateAssignRecUI();
          showToast('녹음을 시작했습니다.', 'info');
          return;
        } catch (e) {
          console.warn('[과제 녹음] 네이티브 실패, 웹 녹음 시도:', e);
        }
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        showToast('이 환경에서는 녹음을 지원하지 않습니다.', 'error');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        assignmentRecState.stream = stream;
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
        const mime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
        assignmentRecState.mediaRecorder = mr;
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) assignmentRecState.chunks.push(e.data);
        };
        mr.start(200);
        assignmentRecState.recording = true;
        assignmentRecState.native = false;
        assignmentRecState.cleared = false;
        updateAssignRecUI();
        showToast('녹음을 시작했습니다.', 'info');
      } catch (e) {
        showToast('마이크를 사용할 수 없습니다.', 'error');
      }
    }

    async function stopAssignRec() {
      if (!assignmentRecState.recording) return;
      if (assignmentRecState.native) {
        try {
          const result = await VoiceRecorder.stopRecording();
          const mimeType = result.value.mimeType || 'audio/webm';
          const base64Str = result.value.recordDataBase64;
          const byteChars = atob(base64Str);
          const arr = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) arr[i] = byteChars.charCodeAt(i);
          assignmentRecState.blob = new Blob([arr], { type: mimeType });
          assignmentRecState.mime = mimeType;
        } catch (e) {
          console.error(e);
          showToast('녹음 저장에 실패했습니다.', 'error');
        }
        assignmentRecState.native = false;
        assignmentRecState.recording = false;
        updateAssignRecUI();
        return;
      }
      const mr = assignmentRecState.mediaRecorder;
      if (mr) {
        await new Promise((resolve) => {
          mr.onstop = () => {
            const t = mr.mimeType || 'audio/webm';
            assignmentRecState.blob = new Blob(assignmentRecState.chunks, { type: t });
            assignmentRecState.mime = t;
            assignmentRecState.chunks = [];
            resolve();
          };
          mr.stop();
        });
      }
      assignmentRecState.stream?.getTracks().forEach((t) => t.stop());
      assignmentRecState.stream = null;
      assignmentRecState.mediaRecorder = null;
      assignmentRecState.recording = false;
      updateAssignRecUI();
    }

    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => {
      resetAssignmentRecording();
      submissionFilesQueue = [];
      activeView = 'dashboard';
      render();
    });

    const statusView = document.getElementById('submission-status-view');
    const formView = document.getElementById('submission-form-view');
    const editBtn = document.getElementById('btn-edit-submission');
    const cancelEditBtn = document.getElementById('btn-cancel-edit');
    const dropzone = document.getElementById('submission-dropzone');
    const fileInput = document.getElementById('submission-file');

    editBtn?.addEventListener('click', () => {
      submissionFilesQueue = [];
      resetAssignmentRecording();
      assignmentRecState.cleared = false;
      const ta = document.getElementById('submission-text');
      if (ta) ta.value = sub?.textAnswer ? sub.textAnswer : '';
      statusView.classList.add('hidden');
      formView.classList.remove('hidden');
      updateSubmissionFileListUI();
      updateAssignRecUI();
    });

    cancelEditBtn?.addEventListener('click', () => {
      resetAssignmentRecording();
      submissionFilesQueue = [];
      formView.classList.add('hidden');
      statusView.classList.remove('hidden');
    });

    document.getElementById('btn-assign-rec-toggle')?.addEventListener('click', async () => {
      if (assignmentRecState.recording) await stopAssignRec();
      else await startAssignRec();
    });

    document.getElementById('btn-assign-rec-clear')?.addEventListener('click', () => {
      if (assignmentRecState.blob) {
        assignmentRecState.blob = null;
        assignmentRecState.mime = 'audio/webm';
      }
      if (sub?.audioData) assignmentRecState.cleared = true;
      updateAssignRecUI();
    });

    dropzone?.addEventListener('click', () => fileInput.click());

    fileInput?.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        submissionFilesQueue = [...submissionFilesQueue, ...Array.from(fileInput.files)];
        fileInput.value = '';
        updateSubmissionFileListUI();
      }
    });

    // Handle Drop
    dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone?.addEventListener('dragleave', () => { dropzone.classList.remove('dragover'); });
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        submissionFilesQueue = [...submissionFilesQueue, ...Array.from(e.dataTransfer.files)];
        updateSubmissionFileListUI();
      }
    });

    if (dropzone) {
      submissionPasteUnsub = bindClipboardPasteZone({
        zone: dropzone,
        imagesOnly: false,
        onPaste: (files) => {
          submissionFilesQueue = [...submissionFilesQueue, ...Array.from(files)];
          updateSubmissionFileListUI();
        },
      });
    }

    function firebaseSubmitUserMessage(err) {
      const code = err && err.code ? String(err.code) : '';
      const msg = err && err.message ? String(err.message) : '';
      if (code.includes('storage/unauthorized')) return '파일을 올릴 권한이 없습니다. 다른 네트워크로 시도하거나 선생님께 알려 주세요.';
      if (code.includes('storage/quota-exceeded')) return '저장 공간이 부족합니다. 더 작은 파일로 시도해 주세요.';
      if (code.includes('storage/canceled')) return '업로드가 취소되었습니다.';
      if (code.includes('permission-denied')) return '서버에서 제출을 막았습니다. 로그아웃 후 다시 로그인해 보세요.';
      if (code.includes('unavailable')) return '인터넷 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.';
      if (msg && msg.length < 120) return msg;
      return '제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    }

    document.getElementById('btn-submit-assignment')?.addEventListener('click', async () => {
      const textAnswer = document.getElementById('submission-text')?.value?.trim() ?? '';
      const prevFiles = sub?.files ?? [];
      const hasNewFiles = submissionFilesQueue.length > 0;
      const hasKeptFiles = prevFiles.length > 0;
      const hasText = textAnswer.length > 0;
      const hasPrevAudio = !!(sub?.audioData && !assignmentRecState.cleared);
      const hasNewAudioBlob = !!assignmentRecState.blob;
      const hasAudio = hasNewAudioBlob || hasPrevAudio;

      if (!hasText && !hasAudio && !hasNewFiles && !hasKeptFiles) {
        showToast('파일·글·녹음 중 최소 한 가지는 제출해 주세요.', 'error');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-assignment');
      submitBtn.disabled = true;
      submitBtn.textContent = '제출 중...';

      try {
        const fileMetas = [];
        for (const file of submissionFilesQueue) {
          const saved = await saveFile(file);
          fileMetas.push({ id: saved.id, name: saved.name });
        }
        const files = fileMetas.length > 0 ? fileMetas : prevFiles;

        const payload = { files, textAnswer, shared: true };
        if (assignmentRecState.blob) {
          const mime = String(assignmentRecState.mime || 'audio/webm');
          const ext = mime.includes('mp4') ? 'm4a' : 'webm';
          const audioFile = new File(
            [assignmentRecState.blob],
            `assignment_voice_${Date.now()}.${ext}`,
            { type: mime || 'audio/webm' },
          );
          const savedAudio = await saveFile(audioFile);
          payload.audioData = savedAudio;
        } else if (assignmentRecState.cleared) {
          payload.audioData = null;
        }

        await submitAssignment(String(assignment.id), String(freshStudent.id), payload);

        showToast(sub ? '제출물이 수정되었습니다! 🎉' : '과제가 제출되었습니다! 🎉');
        resetAssignmentRecording();
        submissionFilesQueue = [];
        activeView = 'dashboard';
        render();
      } catch (err) {
        console.error('Assignment submit error:', err);
        showToast(firebaseSubmitUserMessage(err || {}), 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = sub ? '수정 완료' : '과제 제출하기';
      }
    });

    if (!sub) {
      const ta0 = document.getElementById('submission-text');
      if (ta0) ta0.value = '';
    }
    updateAssignRecUI();
  }

  // Global download
  window.downloadFile = (fileId) => {
    import('../../store.js').then(m => m.downloadFile(fileId));
  };

  init();

  return () => {
    removeQuizOverlay();
    clipboardPasteUnsubs.forEach((u) => u());
    clipboardPasteUnsubs.length = 0;
    if (submissionPasteUnsub) {
      submissionPasteUnsub();
      submissionPasteUnsub = null;
    }
  };
}
