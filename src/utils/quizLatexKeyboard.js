/**
 * 번개 퀴즈용 — ddclass(LatexKeyboard) 패턴 포팅 (탭 + 기호 삽입)
 * https://github.com/Fairyswim1/ddclass/blob/main/client/src/components/LatexKeyboard.jsx
 */

export const QUIZ_LATEX_GROUPS = [
  {
    label: '기본 연산',
    symbols: [
      { label: 'xⁿ', insert: '^{}' },
      { label: 'x²', insert: '^{2}' },
      { label: 'x³', insert: '^{3}' },
      { label: 'xₙ', insert: '_{n}' },
      { label: '√x', insert: '\\sqrt{}' },
      { label: 'ⁿ√x', insert: '\\sqrt[n]{}' },
      { label: 'x/y', insert: '\\frac{}{}' },
      { label: '±', insert: '\\pm' },
      { label: '×', insert: '\\times' },
      { label: '÷', insert: '\\div' },
      { label: '≤', insert: '\\leq' },
      { label: '≥', insert: '\\geq' },
      { label: '≠', insert: '\\neq' },
      { label: 'π', insert: '\\pi' },
      { label: '∞', insert: '\\infty' },
    ],
  },
  {
    label: '그리스',
    symbols: [
      { label: 'α', insert: '\\alpha' },
      { label: 'β', insert: '\\beta' },
      { label: 'γ', insert: '\\gamma' },
      { label: 'θ', insert: '\\theta' },
      { label: 'λ', insert: '\\lambda' },
      { label: 'μ', insert: '\\mu' },
      { label: 'σ', insert: '\\sigma' },
      { label: 'ω', insert: '\\omega' },
      { label: 'Σ', insert: '\\Sigma' },
      { label: 'Π', insert: '\\Pi' },
    ],
  },
  {
    label: '미적분',
    symbols: [
      { label: '∫', insert: '\\int' },
      { label: '∑', insert: '\\sum_{i=1}^{n}' },
      { label: 'lim', insert: '\\lim_{x \\to }' },
      { label: '∂', insert: '\\partial' },
      { label: 'd/dx', insert: '\\frac{d}{dx}' },
      { label: 'dy/dx', insert: '\\frac{dy}{dx}' },
      { label: '∇', insert: '\\nabla' },
    ],
  },
  {
    label: '삼각/로그',
    symbols: [
      { label: 'sin', insert: '\\sin' },
      { label: 'cos', insert: '\\cos' },
      { label: 'tan', insert: '\\tan' },
      { label: 'ln', insert: '\\ln' },
      { label: 'log', insert: '\\log_{}' },
    ],
  },
];

export function renderQuizLatexKeyboardHtml() {
  const tabs = QUIZ_LATEX_GROUPS.map(
    (g, i) =>
      `<button type="button" class="latex-kb-tab ${i === 0 ? 'latex-kb-tab--active' : ''}" data-latex-tab="${i}">${escapeAttr(g.label)}</button>`
  ).join('');

  const panels = QUIZ_LATEX_GROUPS.map(
    (g, i) => `
      <div class="latex-kb-panel ${i === 0 ? 'latex-kb-panel--visible' : ''}" data-latex-panel="${i}">
        ${g.symbols.map((s) => {
          const enc = encodeURIComponent(s.insert);
          return `<button type="button" class="latex-kb-sym latex-kb-insert" data-latex-insert="${enc}" title="${escapeAttr(s.insert)}">${escapeAttr(s.label)}</button>`;
        }).join('')}
      </div>
    `
  ).join('');

  return `
    <div class="latex-keyboard" id="quiz-latex-keyboard" aria-label="LaTeX 수식 입력 패드">
      <div class="latex-kb-tabs">${tabs}</div>
      <div class="latex-kb-panels">${panels}</div>
    </div>
  `;
}

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
