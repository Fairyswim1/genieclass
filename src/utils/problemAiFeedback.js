import {
  fetchProblemSolutionFeedback,
  collectImageUrlsFromModelAnswerFiles,
  collectNonImageModelAnswerFileNotes,
  getFileById,
  presentationWhiteboardImageUrl,
  presentationHasWhiteboardImage,
  savePresentationAiFeedback,
  setPresentationFeedbackShared,
  showToast,
} from '../store.js';
import { escapeHtml } from './quizMath.js';

function formatFeedbackHtml(text) {
  const escaped = escapeHtml(String(text || ''));
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function resolveStudentImageUrl(solution) {
  let studentImg = presentationWhiteboardImageUrl(solution);
  if (!studentImg && solution?.whiteboardImage?.id) {
    try {
      const meta = await getFileById(String(solution.whiteboardImage.id));
      studentImg = typeof meta?.url === 'string' ? meta.url.trim() : '';
    } catch (_) {}
  }
  return studentImg;
}

/**
 * @param {{ problemPrompt: object, solution: object, triggerButton?: HTMLButtonElement|null, audience?: 'student'|'teacher', onUpdated?: () => void|Promise<void> }} opts
 */
export async function openProblemAiFeedbackModal({
  problemPrompt,
  solution,
  triggerButton = null,
  audience = 'student',
  onUpdated,
}) {
  const isTeacher = audience === 'teacher';
  const existingFeedback = String(solution?.feedback || '').trim();
  const isShared = !!solution?.feedbackShared;

  if (isTeacher) {
    if (!problemPrompt || !solution || !presentationHasWhiteboardImage(solution)) {
      showToast('풀이 이미지를 찾을 수 없습니다.', 'error');
      return;
    }
  } else if (!existingFeedback) {
    showToast('아직 공유된 피드백이 없습니다.', 'info');
    return;
  }

  const studentImg = isTeacher ? await resolveStudentImageUrl(solution) : '';
  if (isTeacher && !studentImg) {
    showToast('풀이 이미지 URL을 불러오지 못했습니다.', 'error');
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop active page-enter prob-ai-feedback-backdrop';
  backdrop.innerHTML = `
    <div class="modal-content animate-up prob-ai-feedback-modal">
      <div class="modal-header prob-ai-feedback-modal__head">
        <h3 class="modal-title" style="margin: 0;">✨ ${isTeacher ? 'AI 풀이 채점' : '선생님 피드백'}</h3>
        <button type="button" class="modal-close" id="prob-feedback-close" aria-label="닫기">✕</button>
      </div>
      <p class="prob-ai-feedback-modal__hint">
        ${isTeacher
    ? '분석 결과는 자동 저장됩니다. 「학생에게 공유」를 누르면 학생 대시보드에서 볼 수 있어요.'
    : '선생님이 공유한 AI 피드백입니다.'}
      </p>
      <div id="prob-feedback-body" class="prob-ai-feedback-modal__body"></div>
      <div id="prob-feedback-loading" class="prob-ai-feedback-modal__loading"></div>
      <div id="prob-feedback-actions" class="prob-ai-feedback-modal__actions"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const bodyEl = backdrop.querySelector('#prob-feedback-body');
  const loadEl = backdrop.querySelector('#prob-feedback-loading');
  const actionsEl = backdrop.querySelector('#prob-feedback-actions');
  let currentFeedback = existingFeedback;
  let sharedState = isShared;

  const renderBody = (text) => {
    bodyEl.innerHTML = text ? formatFeedbackHtml(text) : '';
  };

  const renderActions = () => {
    if (!isTeacher) {
      actionsEl.innerHTML = `
        <button type="button" class="btn btn-primary" id="prob-feedback-close-btn">닫기</button>
      `;
      actionsEl.querySelector('#prob-feedback-close-btn')?.addEventListener('click', closeModal);
      return;
    }

    actionsEl.innerHTML = `
      <div class="prob-ai-feedback-modal__status">
        ${currentFeedback
    ? `<span class="badge ${sharedState ? 'badge-green' : 'badge-main'}">${sharedState ? '학생에게 공유됨' : '저장됨 · 미공유'}</span>`
    : '<span class="badge badge-main">아직 분석 전</span>'}
      </div>
      <div class="prob-ai-feedback-modal__btn-row">
        <button type="button" class="btn btn-primary" id="prob-feedback-run"${currentFeedback ? '' : ''}>${currentFeedback ? '🔄 다시 분석' : '✨ AI 분석'}</button>
        <button type="button" class="btn btn-secondary" id="prob-feedback-share" ${currentFeedback ? '' : 'disabled'}>${sharedState ? '🔒 공유 해제' : '📤 학생에게 공유'}</button>
        <button type="button" class="btn btn-ghost" id="prob-feedback-close-btn">닫기</button>
      </div>
    `;

    actionsEl.querySelector('#prob-feedback-run')?.addEventListener('click', () => {
      void runAiAnalysis();
    });
    actionsEl.querySelector('#prob-feedback-share')?.addEventListener('click', () => {
      void toggleShare();
    });
    actionsEl.querySelector('#prob-feedback-close-btn')?.addEventListener('click', closeModal);
  };

  const closeModal = () => {
    backdrop.classList.remove('active');
    setTimeout(() => backdrop.remove(), 200);
  };

  backdrop.querySelector('#prob-feedback-close')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  async function notifyUpdated() {
    if (typeof onUpdated === 'function') {
      try {
        await onUpdated();
      } catch (e) {
        console.warn('[prob-ai-feedback] onUpdated', e);
      }
    }
  }

  async function runAiAnalysis() {
    if (triggerButton) triggerButton.disabled = true;
    const runBtn = actionsEl.querySelector('#prob-feedback-run');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = '⏳ 분석 중…';
    }
    loadEl.textContent = '모범답안과 풀이를 분석 중이에요… (10~40초 정도 걸릴 수 있어요)';
    renderBody('');

    try {
      const modelAnswerImageUrls = await collectImageUrlsFromModelAnswerFiles(problemPrompt.modelAnswerFiles);
      const modelAnswerNonImageNotes = await collectNonImageModelAnswerFileNotes(problemPrompt.modelAnswerFiles);
      const feedback = await fetchProblemSolutionFeedback({
        problemTitle: problemPrompt.title || '',
        problemDescription: problemPrompt.description || '',
        modelAnswerText: problemPrompt.modelAnswerText || '',
        modelAnswerImageUrls,
        modelAnswerNonImageNotes,
        studentImageUrl: studentImg,
      });
      await savePresentationAiFeedback(solution.id, feedback);
      currentFeedback = feedback;
      solution.feedback = feedback;
      renderBody(feedback);
      loadEl.textContent = '✅ 저장되었습니다.';
      showToast('AI 피드백이 저장되었습니다.');
      await notifyUpdated();
      renderActions();
    } catch (err) {
      console.error(err);
      loadEl.innerHTML = `<span style="color: var(--error);">${escapeHtml(String(err.message || '오류'))}</span>`;
      showToast(String(err.message || '피드백 요청 실패'), 'error');
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = currentFeedback ? '🔄 다시 분석' : '✨ AI 분석';
      }
    } finally {
      if (triggerButton) triggerButton.disabled = false;
    }
  }

  async function toggleShare() {
    const shareBtn = actionsEl.querySelector('#prob-feedback-share');
    if (shareBtn) shareBtn.disabled = true;
    try {
      const next = !sharedState;
      await setPresentationFeedbackShared(solution.id, next);
      sharedState = next;
      solution.feedbackShared = next;
      showToast(next ? '학생에게 피드백을 공유했습니다.' : '피드백 공유를 해제했습니다.');
      await notifyUpdated();
      renderActions();
    } catch (err) {
      console.error(err);
      showToast(String(err.message || '공유 실패'), 'error');
      if (shareBtn) shareBtn.disabled = false;
    }
  }

  if (currentFeedback) {
    renderBody(currentFeedback);
    loadEl.textContent = '';
  }
  renderActions();

  if (isTeacher && !currentFeedback) {
    void runAiAnalysis();
  }
}
