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

/**
 * 마크다운(굵게)·줄바꿈 + LaTeX 구간 보호 후 HTML (AI 피드백 등)
 * $...$, $$...$$, \(...\), \[...\] 구분자는 KaTeX auto-render용으로 유지
 */
export function formatMarkdownWithMathHtml(text) {
  const placeholders = [];
  let work = String(text || '');

  const stash = (re) => {
    work = work.replace(re, (match) => {
      const token = `\x00MATHPH${placeholders.length}PH\x00`;
      placeholders.push(match);
      return token;
    });
  };

  stash(/\$\$[\s\S]*?\$\$/g);
  stash(/\\\[[\s\S]*?\\\]/g);
  stash(/\$[^\$\n]+?\$/g);
  stash(/\\\([\s\S]*?\\\)/g);

  let html = escapeHtml(work);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/\x00MATHPH(\d+)PH\x00/g, (_, i) => escapeHtml(placeholders[Number(i)] || ''));
  return html;
}

/** DOM 조각을 KaTeX로 렌더 (요소는 이미 문서에 붙어 있어야 함) */
export function renderQuizMath(el) {
  if (!el || typeof window.renderMathInElement !== 'function') return;
  window.renderMathInElement(el, KATEX_AUTO_RENDER_OPTIONS);
}
