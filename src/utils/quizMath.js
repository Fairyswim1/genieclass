/** 번개 퀴즈 KaTeX(auto-render) 공통 옵션 */
export const KATEX_AUTO_RENDER_OPTIONS = {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\(', right: '\\)', display: false },
    { left: '\\[', right: '\\]', display: true },
  ],
  throwOnError: false,
  strict: 'ignore',
};

/** 미리보기용: LaTeX 구분자($)는 유지하고 HTML만 이스케이프 */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** DOM 조각을 KaTeX로 렌더 (요소는 이미 문서에 붙어 있어야 함) */
export function renderQuizMath(el) {
  if (!el || typeof window.renderMathInElement !== 'function') return;
  window.renderMathInElement(el, KATEX_AUTO_RENDER_OPTIONS);
}
