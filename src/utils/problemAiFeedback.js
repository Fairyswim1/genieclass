import {
  fetchProblemSolutionFeedback,
  collectImageUrlsFromModelAnswerFiles,
  collectNonImageModelAnswerFileNotes,
  getFileById,
  presentationWhiteboardImageUrl,
  presentationHasWhiteboardImage,
  showToast,
} from '../store.js';
import { escapeHtml } from './quizMath.js';

/**
 * 모범답안 대비 학생 풀이 AI 피드백 모달
 * @param {{ problemPrompt: object, solution: object, triggerButton?: HTMLButtonElement|null, audience?: 'student'|'teacher' }} opts
 */
export async function openProblemAiFeedbackModal({
  problemPrompt,
  solution,
  triggerButton = null,
  audience = 'student',
}) {
  let studentImg = presentationWhiteboardImageUrl(solution);
  if (!studentImg && solution?.whiteboardImage?.id) {
    try {
      const meta = await getFileById(String(solution.whiteboardImage.id));
      studentImg = typeof meta?.url === 'string' ? meta.url.trim() : '';
    } catch (_) {}
  }

  if (!problemPrompt || !solution || !presentationHasWhiteboardImage(solution)) {
    showToast('풀이 이미지를 찾을 수 없습니다.', 'error');
    return;
  }

  if (!studentImg) {
    showToast('풀이 이미지 URL을 불러오지 못했습니다.', 'error');
    return;
  }

  const hintText = audience === 'teacher'
    ? '등록한 모범답안과 학생 풀이를 AI가 비교·분석합니다. 최종 채점 대신 학습 참고용으로 활용해 주세요.'
    : '선생님이 등록한 모범답안을 참고하여 자동으로 분석합니다. 최종 채점 대신 학습 도움용으로 활용해 주세요.';

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
        ${escapeHtml(hintText)}
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

  if (triggerButton) triggerButton.disabled = true;
  loadEl.textContent = '모범답안과 풀이를 분석 중이에요… (10~40초 정도 걸릴 수 있어요)';
  bodyEl.textContent = '';

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
    bodyEl.textContent = feedback;
    loadEl.textContent = '';
  } catch (err) {
    console.error(err);
    bodyEl.textContent = '';
    loadEl.innerHTML = `<span style="color: var(--error);">${escapeHtml(String(err.message || '오류'))}</span>`;
    showToast(String(err.message || '피드백 요청 실패'), 'error');
  } finally {
    if (triggerButton) triggerButton.disabled = false;
  }
}
