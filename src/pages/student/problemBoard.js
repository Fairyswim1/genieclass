// ========================================
// 학생 — 한 문제 풀이 화이트보드 (수업 발표판과 동일 UX)
// ========================================
import { getStroke } from 'perfect-freehand';
import { Capacitor } from '@capacitor/core';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import {
  getCurrentStudent,
  ensureStudentFirestoreAuth,
  getProblemPromptById,
  addPresentation,
  addStudentPoints,
  deletePresentationById,
  getPresentationsByStudent,
  saveFile,
  showToast,
  problemPromptHasModelAnswer,
  downloadFile,
  getFileById,
  enrichPresentationWithImageUrls,
  presentationWhiteboardImageUrl,
  presentationMatchesProblemPrompt,
} from '../../store.js';
import { escapeHtml } from '../../utils/quizMath.js';
import { bindClipboardPasteZone } from '../../utils/clipboardPaste.js';
import { eraseSegmentDisk, WHITEBOARD_ERASER_ICON_HTML } from '../../utils/eraserCanvas.js';

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function isProblemFileImage(meta, ref) {
  const t = String(meta?.type || '');
  if (/^image\/(jpeg|jpg|pjpeg|png|gif|webp)/i.test(t)) return true;
  const name = String(meta?.name || ref?.name || '');
  return /\.(jpe?g|png|gif|webp)$/i.test(name);
}

export function renderStudentProblemBoard(container, params) {
  const student = getCurrentStudent();
  if (!student) {
    window.location.hash = '/student/login';
    return;
  }

  const promptId = params.promptId;
  let problemPrompt = null;

  let wbCanvas; let wbCtx;
  let drawing = false;
  let penColor = '#FFFFFF';
  let penSize = 2;
  let currentTool = 'pen';
  let isRecording = false;
  let mediaRecorder = null;
  let mediaChunks = [];
  let recordedBlob = null;
  let recordingCanvas = null;
  let recordingCtx = null;
  let recordingReqId = null;
  let recordingMode = null;

  /** 'board' = 칠판 필기, 'photo' = 종이 풀이 사진 첨부 */
  let submitMode = 'board';
  let attachedPhotoFile = null;
  let photoPreviewUrl = null;
  /** 사진 모드: 칠판 배경에 깔리는 이미지 */
  let photoBgImage = null;

  const SIDE_REF_STORAGE_KEY = 'genie_prob_side_ref';

  /** 라우트 이탈 시 클립보드 paste 리스너 제거 */
  let unbindPhotoClipboard = () => {};

  function setSideReferenceOpen(open, persist = true) {
    const main = document.getElementById('prob-main-wrap');
    const aside = document.getElementById('prob-side-reference');
    const toggleBtn = document.getElementById('prob-btn-side-ref');
    const hasImages = !!(aside?.querySelector?.('#prob-side-reference-images img'));
    if (!main || !aside || !toggleBtn) return;
    if (open && !hasImages) return;

    aside.classList.toggle('hidden', !open);
    aside.setAttribute('aria-hidden', open ? 'false' : 'true');
    main.classList.toggle('prob-main--side-ref', open);
    toggleBtn.classList.toggle('prob-btn-side-ref--on', open);
    toggleBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
    toggleBtn.textContent = open ? '문제 접기' : '🖼 문제 분할';

    if (persist) {
      try {
        sessionStorage.setItem(SIDE_REF_STORAGE_KEY, open ? '1' : '0');
      } catch (_) {}
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  async function fillToolbarProblemAttachments() {
    const imageRow = document.getElementById('prob-toolbar-image-row');
    const extraFilesEl = document.getElementById('prob-toolbar-extra-files');
    const visual = document.getElementById('prob-toolbar-problem-visual');

    const clearSlots = () => {
      if (imageRow) imageRow.innerHTML = '';
      if (extraFilesEl) extraFilesEl.innerHTML = '';
      if (visual) visual.classList.remove('prob-toolbar-problem-visual--has-images');
    };

    clearSlots();

    if (!problemPrompt?.files?.length) {
      visual?.classList.add('prob-toolbar-problem-visual--empty');
      return;
    }

    visual?.classList.remove('prob-toolbar-problem-visual--empty');

    const images = [];
    const others = [];
    for (const ref of problemPrompt.files) {
      if (!ref?.id) continue;
      try {
        const meta = await getFileById(ref.id);
        if (!meta?.url) continue;
        const entry = { ref, meta };
        if (isProblemFileImage(meta, ref)) images.push(entry);
        else others.push(entry);
      } catch (_) {}
    }

    if (images.length > 0 && imageRow) {
      visual?.classList.add('prob-toolbar-problem-visual--has-images');
      imageRow.innerHTML = `<div class="prob-header-img-row" role="list">${images
        .map(
          ({ meta, ref }, idx) =>
            `<button type="button" class="prob-header-thumb" data-url="${escapeAttr(meta.url)}" data-idx="${idx}" title="${escapeHtml(meta.name || ref.name || '')}" role="listitem">
              <img src="${escapeAttr(meta.url)}" alt="${escapeHtml(meta.name || '문제 이미지')}" loading="lazy" decoding="async" />
            </button>`,
        )
        .join('')}</div>`;
      imageRow.querySelectorAll('.prob-header-thumb').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = btn.dataset.idx;
          setSideReferenceOpen(true);
          if (idx != null && idx !== '') {
            requestAnimationFrame(() => {
              document
                .querySelector(`#prob-side-reference-images [data-img-idx="${idx}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
          }
        });
      });
    }

    const sideSc = document.getElementById('prob-side-reference-images');
    const sideTgl = document.getElementById('prob-btn-side-ref');
    const mainWrap = document.getElementById('prob-main-wrap');
    if (images.length > 0 && sideSc) {
      sideSc.innerHTML = images
        .map(
          ({ meta, ref }, idx) =>
            `<figure class="prob-side-ref__fig" data-img-idx="${idx}">
              <img class="prob-side-ref__img" src="${escapeAttr(meta.url)}" alt="${escapeHtml(meta.name || ref.name || '문제 이미지')}" loading="lazy" decoding="async" />
              <figcaption class="prob-side-ref__cap">
                <a href="${escapeAttr(meta.url)}" target="_blank" rel="noopener noreferrer" class="prob-side-ref__tab">새 창</a>
                <span class="prob-side-ref__name">${escapeHtml(meta.name || ref.name || '')}</span>
              </figcaption>
            </figure>`,
        )
        .join('');
      sideTgl?.classList.remove('hidden');
      try {
        if (sessionStorage.getItem(SIDE_REF_STORAGE_KEY) === '1') {
          setSideReferenceOpen(true, false);
        }
      } catch (_) {}
    } else {
      if (sideSc) sideSc.innerHTML = '';
      sideTgl?.classList.add('hidden');
      mainWrap?.classList.remove('prob-main--side-ref');
      document.getElementById('prob-side-reference')?.classList.add('hidden');
    }

    if (others.length > 0 && extraFilesEl) {
      extraFilesEl.innerHTML = `<div class="prob-toolbar-extra-files-inner">
          ${others
            .map(
              ({ meta, ref }) =>
                `<button type="button" class="btn btn-secondary btn-sm prob-strip-file-btn" data-file-id="${escapeHtml(String(ref.id))}">📎 ${escapeHtml(meta.name || ref.name || '파일')}</button>`,
            )
            .join('')}
        </div>`;
      extraFilesEl.querySelectorAll('.prob-strip-file-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.fileId;
          if (id) void downloadFile(id);
        });
      });
    }

    if (images.length === 0 && others.length === 0) {
      visual?.classList.remove('prob-toolbar-problem-visual--has-images');
      if (extraFilesEl) {
        extraFilesEl.innerHTML = '<p class="prob-toolbar-att-empty">문제 파일을 불러오지 못했습니다.</p>';
      }
    }
  }

  function renderBoardShell() {
    const head = escapeHtml(problemPrompt?.title || '한 문제 풀이');
    const descRaw = problemPrompt?.description && String(problemPrompt.description).trim();
    const descHtml = descRaw
      ? `<div class="prob-toolbar__desc">${escapeHtml(descRaw)}</div>`
      : '';
    container.innerHTML = `
      <div class="whiteboard-container prob-student-wb page-enter" style="background: var(--bg-deep);">
        <header class="prob-toolbar card" style="border-radius: 0; border-top: 0; border-left: 0; border-right: 0;">
          <div class="prob-toolbar__row prob-toolbar__row--head">
            <button type="button" class="btn btn-ghost btn-sm prob-toolbar__back" id="wb-back">← 대시보드</button>
            <div class="prob-toolbar__hero" id="prob-toolbar-problem-visual">
              <div class="prob-toolbar__hero-images" id="prob-toolbar-image-row" aria-label="문제 이미지"></div>
              <div class="prob-toolbar__hero-text">
                <span class="prob-toolbar__mini-badge">문제</span>
                <h1 class="prob-toolbar__heading prob-toolbar__heading--hero">${head}</h1>
                ${descHtml}
                <div id="prob-toolbar-extra-files" class="prob-toolbar__extra-files"></div>
              </div>
            </div>
            <div class="prob-toolbar__tools-band" aria-label="도구·저장">
              <div class="prob-header-tools-scroll">
                <div class="prob-mode-seg prob-header-tools-scroll__modes" role="tablist" aria-label="풀이 방식">
                  <button type="button" class="prob-mode-tab prob-mode-seg__btn prob-mode-seg__btn--active" data-mode="board" id="tab-mode-board" role="tab" aria-selected="true">칠판</button>
                  <button type="button" class="prob-mode-tab prob-mode-seg__btn" data-mode="photo" id="tab-mode-photo" role="tab" aria-selected="false">사진</button>
                </div>
                <button type="button" class="btn btn-ghost btn-sm hidden prob-btn-side-ref" id="prob-btn-side-ref" aria-pressed="false">🖼 문제 분할</button>
                <div id="board-only-tools" class="prob-draw-tools prob-draw-tools--toolbar-inline prob-draw-strip" aria-label="그리기 도구">
                  <div class="whiteboard-tools">
                    <button type="button" class="whiteboard-tool ${currentTool === 'pen' ? 'active' : ''}" data-tool="pen" title="펜">✏️</button>
                    <button type="button" class="whiteboard-tool ${currentTool === 'eraser' ? 'active' : ''}" data-tool="eraser" title="지우개">${WHITEBOARD_ERASER_ICON_HTML}</button>
                    <button type="button" class="whiteboard-tool" data-tool="clear" title="전체 지우기">🗑️</button>
                  </div>
                  <div class="color-picker-group prob-draw-tools__colors">
                    <div class="color-dot active" data-color="#FFFFFF" style="background:#FFFFFF" title="흰색"></div>
                    <div class="color-dot" data-color="#000000" style="background:#000000" title="검정"></div>
                    <div class="color-dot" data-color="#FF6B6B" style="background:#FF6B6B" title="빨강"></div>
                    <div class="color-dot" data-color="#FFD93D" style="background:#FFD93D" title="노랑"></div>
                    <div class="color-dot" data-color="#6BCB77" style="background:#6BCB77" title="초록"></div>
                    <div class="color-dot" data-color="#4F46E5" style="background:#4F46E5" title="파랑"></div>
                  </div>
                  <div class="pen-size-control prob-draw-tools__pen">
                    <label for="pen-size-slider">두께</label>
                    <input type="range" id="pen-size-slider" min="1" max="10" value="${penSize}" />
                  </div>
                </div>
                <div class="prob-header-tools-scroll__actions">
                  <button type="button" class="btn ${isRecording ? 'btn-danger' : 'btn-primary'} btn-sm" id="wb-record">
                    ${isRecording ? '⏹ 중지' : '📽️ 녹화'}
                  </button>
                  <button type="button" class="btn btn-sm prob-save-btn" id="wb-save">💾 저장</button>
                </div>
              </div>
            </div>
          </div>
          ${problemPromptHasModelAnswer(problemPrompt) ? `
          <p class="prob-toolbar__hint">💡 선생님이 모범답안을 두었습니다. 저장 후 대시보드에서 <strong>✨ 피드백</strong>으로 비교해 보세요.</p>` : ''}
        </header>

        <div class="prob-workspace">
          <div class="prob-pan-strip" id="prob-pan-strip" aria-label="화면 위아래 이동(스크롤)">
            <span class="prob-pan-strip__icon" aria-hidden="true"></span>
            <span class="prob-pan-strip__text">위·아래로 밀어 화면 이동 (문제·저장 버튼) · 두 번 탭하면 맨 위로</span>
          </div>
          <div class="prob-main" id="prob-main-wrap">
            <aside id="prob-side-reference" class="prob-side-reference hidden" aria-hidden="true">
              <div class="prob-side-reference__top">
                <span class="prob-side-reference__label">문제 이미지 · 옆에서 보며 풀기</span>
                <button type="button" class="btn btn-ghost btn-sm" id="prob-side-collapse">접기</button>
              </div>
              <div class="prob-side-reference__scroll" id="prob-side-reference-images"></div>
            </aside>
            <div class="prob-board-stack">
            <div id="prob-photo-bar" class="prob-photo-bar hidden" aria-label="풀이 사진 올리기">
              <p class="prob-photo-bar__hint">종이 풀이 사진을 올리면 <strong>칠판 위</strong>에 깔리고, 그 위에 필기할 수 있어요.</p>
              <div class="prob-photo-bar__controls">
                <div class="drop-zone prob-photo-bar__drop" id="prob-photo-dropzone">
                  <span id="prob-photo-status">사진 선택 · 드래그 · 붙여넣기</span>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="prob-photo-camera">📷 촬영</button>
                <button type="button" class="btn btn-secondary btn-sm" id="prob-photo-gallery">🖼 앨범</button>
                <button type="button" class="btn btn-ghost btn-sm hidden" id="prob-photo-clear">✕ 제거</button>
              </div>
              <input type="file" id="prob-photo-input-cam" accept="image/*" capture="environment" class="hidden" />
              <input type="file" id="prob-photo-input-gal" accept="image/*" class="hidden" />
            </div>
            <div id="prob-panel-board">
              <div class="whiteboard-canvas-wrap" style="background: #000; position: relative;">
                <canvas id="whiteboard-photo-bg" style="position: absolute; top: 0; left: 0; z-index: 0; pointer-events: none; touch-action: none;"></canvas>
                <canvas id="whiteboard-canvas" style="position: absolute; top: 0; left: 0; z-index: 1; touch-action: none;"></canvas>
                <canvas id="whiteboard-draft" style="position: absolute; top: 0; left: 0; z-index: 2; pointer-events: none; touch-action: none;"></canvas>
              </div>
            </div>
            </div>
          </div>
        </div>

        <div id="prob-saving-overlay" class="hidden" style="position: fixed; bottom: 0; left: 0; right: 0; padding: 14px 16px; background: rgba(0,0,0,0.88); color: #fff; text-align: center; z-index: 9998; font-size: 0.88rem; font-weight: 700; line-height: 1.5; box-shadow: 0 -4px 24px rgba(0,0,0,0.35);">
          ⏳ <span id="prob-saving-overlay-msg">저장 중…</span>
        </div>
      </div>
    `;
  }

  function initWhiteboard() {
    wbCanvas = document.getElementById('whiteboard-canvas');
    wbCtx = wbCanvas.getContext('2d');
    const draftCanvas = document.getElementById('whiteboard-draft');
    const draftCtx = draftCanvas.getContext('2d');

    wbCanvas.style.touchAction = 'none';

    wbCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const wrap = wbCanvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    function setSize() {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      wbCanvas.width = w * dpr;
      wbCanvas.height = h * dpr;
      wbCanvas.style.width = `${w}px`;
      wbCanvas.style.height = `${h}px`;

      draftCanvas.width = w * dpr;
      draftCanvas.height = h * dpr;
      draftCanvas.style.width = `${w}px`;
      draftCanvas.style.height = `${h}px`;

      wbCtx.setTransform(1, 0, 0, 1, 0, 0);
      draftCtx.setTransform(1, 0, 0, 1, 0, 0);
      wbCtx.scale(dpr, dpr);
      draftCtx.scale(dpr, dpr);
      wbCtx.lineCap = 'round';
      wbCtx.lineJoin = 'round';
      draftCtx.lineCap = 'round';
      draftCtx.lineJoin = 'round';

      if (submitMode === 'photo') paintPhotoBackground();
    }
    setSize();

    if (submitMode === 'board') {
      wbCtx.fillStyle = '#000';
      wbCtx.fillRect(0, 0, wrap.clientWidth, wrap.clientHeight);
    }

    let currentPoints = [];

    function getSvgPathFromStroke(stroke) {
      if (!stroke.length) return '';
      const d = stroke.reduce((acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length];
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        return acc;
      }, ['M', ...stroke[0], 'Q']);
      d.push('Z');
      return d.join(' ');
    }

    window.onresize = () => {
      if (!wbCanvas || !wbCtx) return;
      const prevW = wbCanvas.width;
      const prevH = wbCanvas.height;
      let tempCanvas = null;
      if (prevW > 0 && prevH > 0) {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = prevW;
        tempCanvas.height = prevH;
        try {
          tempCanvas.getContext('2d').drawImage(wbCanvas, 0, 0);
        } catch (_) {
          tempCanvas = null;
        }
      }

      setSize();

      const logW = wrap.clientWidth;
      const logH = wrap.clientHeight;
      if (logW <= 0 || logH <= 0 || wbCanvas.width <= 0 || wbCanvas.height <= 0) {
        return;
      }

      if (submitMode === 'photo') {
        paintPhotoBackground();
      }

      wbCtx.save();
      wbCtx.setTransform(1, 0, 0, 1, 0, 0);
      if (tempCanvas) {
        try {
          wbCtx.drawImage(tempCanvas, 0, 0);
        } catch (_) {
          if (submitMode === 'board') {
            wbCtx.fillStyle = '#000';
            wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
          }
        }
      } else if (submitMode === 'board') {
        wbCtx.fillStyle = '#000';
        wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
      }
      wbCtx.restore();
    };

    const getPos = (e) => {
      const rect = wbCanvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const startDrawing = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drawing = true;
      const pos = getPos(e);
      const pressure = e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5;
      currentPoints = [[pos.x, pos.y, pressure]];
      try {
        wbCanvas.setPointerCapture(e.pointerId);
      } catch (_) {}
    };

    const moveDrawing = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!drawing) return;
      let events;
      try {
        events = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      } catch (_) {
        events = null;
      }
      if (!events || events.length === 0) events = [e];
      for (const ev of events) {
        const pos = getPos(ev);
        const pressure = ev.pointerType === 'pen' && ev.pressure ? ev.pressure : 0.5;
        currentPoints.push([pos.x, pos.y, pressure]);
      }
      if (currentPoints.length < 2) return;

      const isEraser = currentTool === 'eraser';
      if (isEraser) {
        const p1 = currentPoints[currentPoints.length - 2];
        const p2 = currentPoints[currentPoints.length - 1];
        const eraserFill = submitMode === 'photo' ? undefined : '#000000';
        eraseSegmentDisk(wbCtx, p1[0], p1[1], p2[0], p2[1], penSize, eraserFill);
        return;
      }

      const strokeSize = penSize * 2.5;
      const strokePolygon = getStroke(currentPoints, {
        size: strokeSize,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: currentPoints[0][2] === 0.5,
      });
      const pathData = getSvgPathFromStroke(strokePolygon);
      if (!pathData) return;
      const path = new Path2D(pathData);
      draftCtx.save();
      draftCtx.setTransform(1, 0, 0, 1, 0, 0);
      draftCtx.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
      draftCtx.restore();
      draftCtx.save();
      draftCtx.fillStyle = penColor;
      draftCtx.fill(path);
      draftCtx.restore();
    };

    const stopDrawing = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!drawing) return;
      const pos = getPos(e);
      const pressure = e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5;
      currentPoints.push([pos.x, pos.y, pressure]);
      moveDrawing(e);
      if (currentTool === 'pen') {
        wbCtx.save();
        wbCtx.setTransform(1, 0, 0, 1, 0, 0);
        wbCtx.drawImage(draftCanvas, 0, 0);
        wbCtx.restore();
        draftCtx.save();
        draftCtx.setTransform(1, 0, 0, 1, 0, 0);
        draftCtx.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
        draftCtx.restore();
      }
      drawing = false;
      currentPoints = [];
      try { wbCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    wbCanvas.addEventListener('pointerdown', startDrawing);
    wbCanvas.addEventListener('pointermove', moveDrawing);
    wbCanvas.addEventListener('pointerup', stopDrawing);
    wbCanvas.addEventListener('pointercancel', stopDrawing);
  }

  function bindWhiteboardEvents() {
    document.getElementById('wb-back')?.addEventListener('click', () => {
      if (isRecording) {
        if (!confirm('녹음 중입니다. 나가면 녹음이 중지됩니다. 나갈까요?')) return;
      }
      window.location.hash = '/student/dashboard';
    });

    document.querySelectorAll('.whiteboard-tool').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tool === 'clear') {
          if (confirm(submitMode === 'photo' ? '사진 위 필기를 모두 지울까요?' : '전체 필기를 지우시겠습니까?')) {
            clearStrokeLayer();
            if (submitMode === 'photo') paintPhotoBackground();
          }
          return;
        }
        currentTool = btn.dataset.tool;
        updateWhiteboardUI();
      });
    });

    document.querySelectorAll('.color-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        penColor = dot.dataset.color;
        currentTool = 'pen';
        document.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        updateWhiteboardUI();
      });
    });

    document.getElementById('pen-size-slider')?.addEventListener('input', (e) => {
      penSize = parseInt(e.target.value, 10);
    });

    document.getElementById('wb-record')?.addEventListener('click', handleRecordToggle);
    document.getElementById('wb-save')?.addEventListener('click', handleSaveProblem);

    document.getElementById('prob-btn-side-ref')?.addEventListener('click', () => {
      const on = document.getElementById('prob-main-wrap')?.classList.contains('prob-main--side-ref');
      setSideReferenceOpen(!on);
    });
    document.getElementById('prob-side-collapse')?.addEventListener('click', () => setSideReferenceOpen(false));

    document.getElementById('prob-pan-strip')?.addEventListener('dblclick', () => {
      document.querySelector('.prob-student-wb .prob-toolbar')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function getPhotoBgCanvas() {
    return document.getElementById('whiteboard-photo-bg');
  }

  function clearStrokeLayer() {
    if (!wbCanvas || !wbCtx) return;
    const wrap = wbCanvas.parentElement;
    const cw = wrap?.clientWidth || 0;
    const ch = wrap?.clientHeight || 0;
    wbCtx.save();
    wbCtx.setTransform(1, 0, 0, 1, 0, 0);
    wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
    wbCtx.restore();
    if (submitMode === 'board' && cw > 0 && ch > 0) {
      wbCtx.fillStyle = '#000';
      wbCtx.fillRect(0, 0, cw, ch);
    }
    const draftCanvas = document.getElementById('whiteboard-draft');
    const draftCtx = draftCanvas?.getContext('2d');
    if (draftCanvas && draftCtx) {
      draftCtx.save();
      draftCtx.setTransform(1, 0, 0, 1, 0, 0);
      draftCtx.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
      draftCtx.restore();
    }
  }

  function paintPhotoBackground() {
    const bgCanvas = getPhotoBgCanvas();
    if (!bgCanvas || !wbCanvas) return;
    const wrap = wbCanvas.parentElement;
    const cw = wrap?.clientWidth || 0;
    const ch = wrap?.clientHeight || 0;
    if (cw < 2 || ch < 2) return;

    const dpr = window.devicePixelRatio || 1;
    bgCanvas.width = cw * dpr;
    bgCanvas.height = ch * dpr;
    bgCanvas.style.width = `${cw}px`;
    bgCanvas.style.height = `${ch}px`;

    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.scale(dpr, dpr);
    bgCtx.fillStyle = '#000';
    bgCtx.fillRect(0, 0, cw, ch);

    if (photoBgImage && photoBgImage.naturalWidth > 0) {
      const iw = photoBgImage.naturalWidth;
      const ih = photoBgImage.naturalHeight;
      const scale = Math.min(cw / iw, ch / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const ox = (cw - dw) / 2;
      const oy = (ch - dh) / 2;
      bgCtx.drawImage(photoBgImage, ox, oy, dw, dh);
    }
  }

  async function loadPhotoBackgroundFromFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('이미지 파일만 올릴 수 있습니다.', 'error');
      return false;
    }
    attachedPhotoFile = file;
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('이미지 로드 실패'));
      img.src = url;
    });
    photoBgImage = img;
    clearStrokeLayer();
    paintPhotoBackground();
    const st = document.getElementById('prob-photo-status');
    if (st) st.textContent = `선택됨: ${file.name}`;
    document.getElementById('prob-photo-clear')?.classList.remove('hidden');
    showToast('사진을 칠판에 올렸어요. 위에 필기해 보세요!', 'info', 3500);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return true;
  }

  async function loadPhotoBackgroundFromUrl(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('이미지 로드 실패'));
      img.src = url;
    });
    photoBgImage = img;
    clearStrokeLayer();
    paintPhotoBackground();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  async function exportCompositePngBlob() {
    const wrap = wbCanvas?.parentElement;
    const cw = wrap?.clientWidth || 0;
    const ch = wrap?.clientHeight || 0;
    if (!wbCanvas || cw < 2 || ch < 2) throw new Error('캔버스 캡처 실패');

    const dpr = window.devicePixelRatio || 1;
    const out = document.createElement('canvas');
    out.width = Math.floor(cw * dpr);
    out.height = Math.floor(ch * dpr);
    const ctx = out.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    const bgCanvas = getPhotoBgCanvas();
    if (bgCanvas && bgCanvas.width > 0) {
      ctx.drawImage(bgCanvas, 0, 0, cw, ch);
    } else if (photoBgImage) {
      const iw = photoBgImage.naturalWidth;
      const ih = photoBgImage.naturalHeight;
      const scale = Math.min(cw / iw, ch / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(photoBgImage, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    }

    ctx.drawImage(wbCanvas, 0, 0, cw, ch);
    const draftCanvas = document.getElementById('whiteboard-draft');
    if (draftCanvas) ctx.drawImage(draftCanvas, 0, 0, cw, ch);

    return new Promise((resolve, reject) => {
      out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('이미지 생성 실패'))), 'image/png');
    });
  }

  function applySubmitMode() {
    const boardPanel = document.getElementById('prob-panel-board');
    const photoBar = document.getElementById('prob-photo-bar');
    const boardTools = document.getElementById('board-only-tools');
    const mainWrap = document.getElementById('prob-main-wrap');
    const aside = document.getElementById('prob-side-reference');
    const sideToggle = document.getElementById('prob-btn-side-ref');
    document.querySelectorAll('.prob-mode-tab').forEach((btn) => {
      const on = btn.dataset.mode === submitMode;
      btn.classList.toggle('prob-mode-seg__btn--active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (boardPanel) boardPanel.classList.remove('hidden');
    if (photoBar) photoBar.classList.toggle('hidden', submitMode !== 'photo');
    if (boardTools) boardTools.style.display = '';
    if (sideToggle) sideToggle.style.display = submitMode === 'board' ? '' : 'none';
    document.getElementById('prob-pan-strip')?.classList.toggle('hidden', false);

    if (submitMode === 'photo') {
      mainWrap?.classList.remove('prob-main--side-ref');
      aside?.classList.add('hidden');
      aside?.setAttribute('aria-hidden', 'true');
      clearStrokeLayer();
      paintPhotoBackground();
    } else {
      photoBgImage = null;
      attachedPhotoFile = null;
      clearPhotoAttachment();
      clearStrokeLayer();
      try {
        if (sessionStorage.getItem(SIDE_REF_STORAGE_KEY) === '1' && sideToggle && !sideToggle.classList.contains('hidden')) {
          setSideReferenceOpen(true, false);
        }
      } catch (_) {}
    }
    updateWhiteboardUI();
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  }

  function clearPhotoAttachment() {
    attachedPhotoFile = null;
    photoBgImage = null;
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      photoPreviewUrl = null;
    }
    const st = document.getElementById('prob-photo-status');
    if (st) st.textContent = '사진 선택 · 드래그 · 붙여넣기';
    document.getElementById('prob-photo-clear')?.classList.add('hidden');
    if (submitMode === 'photo') {
      clearStrokeLayer();
      paintPhotoBackground();
    }
  }

  function bindPhotoMode() {
    const dz = document.getElementById('prob-photo-dropzone');
    const inCam = document.getElementById('prob-photo-input-cam');
    const inGal = document.getElementById('prob-photo-input-gal');

    const onFile = (file) => {
      void loadPhotoBackgroundFromFile(file);
    };

    document.getElementById('prob-photo-camera')?.addEventListener('click', () => inCam?.click());
    document.getElementById('prob-photo-gallery')?.addEventListener('click', () => inGal?.click());
    inCam?.addEventListener('change', () => {
      if (inCam.files?.[0]) onFile(inCam.files[0]);
      inCam.value = '';
    });
    inGal?.addEventListener('change', () => {
      if (inGal.files?.[0]) onFile(inGal.files[0]);
      inGal.value = '';
    });
    document.getElementById('prob-photo-clear')?.addEventListener('click', () => clearPhotoAttachment());

    dz?.addEventListener('click', (e) => {
      if (e.target.closest('#prob-photo-clear')) return;
      inGal?.click();
    });
    dz?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    });
    dz?.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz?.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const f = e.dataTransfer?.files?.[0];
      if (f) onFile(f);
    });

    const unbindPaste = bindClipboardPasteZone({
      zone: dz,
      imagesOnly: true,
      onPaste: (files) => {
        const f = files.find((x) => String(x.type || '').startsWith('image/'));
        if (f) onFile(f);
      },
    });

    document.querySelectorAll('.prob-mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (!mode || mode === submitMode) return;
        if (isRecording) {
          showToast('모드를 바꾸려면 녹음·녹화를 먼저 중지해 주세요.', 'error');
          return;
        }
        if (submitMode === 'photo' && mode === 'board') {
          photoBgImage = null;
          clearPhotoAttachment();
        }
        submitMode = mode;
        applySubmitMode();
      });
    });

    return unbindPaste;
  }

  function renderRecordingFrame() {
    if (!isRecording || !recordingCtx) return;

    const draftCanvas = document.getElementById('whiteboard-draft');
    if (!draftCanvas) return;

    // 수업 발표판(lessonMode)과 동일: 지우개 투명 처리 + 인코더가 빈 프레임을 내지 않도록 배경 채움
    recordingCtx.save();
    recordingCtx.setTransform(1, 0, 0, 1, 0, 0);
    recordingCtx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    recordingCtx.fillStyle = '#000000';
    recordingCtx.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    recordingCtx.restore();

    const bgCanvas = getPhotoBgCanvas();
    if (bgCanvas && bgCanvas.width > 0) {
      recordingCtx.drawImage(bgCanvas, 0, 0);
    }
    recordingCtx.drawImage(wbCanvas, 0, 0);
    recordingCtx.drawImage(draftCanvas, 0, 0);

    recordingReqId = requestAnimationFrame(renderRecordingFrame);
  }

  function releaseMediaStream(ms) {
    try {
      ms?.getTracks?.()?.forEach((t) => t.stop());
    } catch (_) {}
  }

  async function handleRecordToggle() {
    if (!isRecording) {
      mediaChunks = [];
      recordedBlob = null;
      recordingMode = null;
      mediaRecorder = null;

      try {
        const isNativeMode = !!(window.Capacitor?.isNativePlatform?.());

        if (isNativeMode) {
          try {
            const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
            if (!permStatus.value) {
              showToast('마이크 권한이 차단되었습니다.', 'error');
              return;
            }
          } catch (e) {
            console.warn('[풀이 녹음] 권한:', e);
          }
        }

        const hasMediaDevices = !!(navigator.mediaDevices?.getUserMedia);
        const hasMediaRecorder = typeof MediaRecorder !== 'undefined';

        /** 사진만 있고 칠판 미사용 시 음성만. 사진+필기는 칠판 녹화와 동일 */
        if (submitMode === 'photo' && !photoBgImage && hasMediaDevices && hasMediaRecorder) {
          try {
            const rawAudioStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 44100,
              },
            });
            const audioStream = rawAudioStream;
            const audioMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
            const audioMime = audioMimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
            mediaRecorder = new MediaRecorder(audioStream, audioMime ? { mimeType: audioMime } : undefined);
            recordingMode = 'audio';
          } catch (e) {
            console.warn('[풀이 녹음] 사진 모드 음성 녹음 실패:', e);
            mediaRecorder = null;
          }
        } else if ((submitMode === 'board' || (submitMode === 'photo' && photoBgImage)) && hasMediaDevices && hasMediaRecorder) {
          let rawAudioStream = null;
          let audioStream = null;
          let combinedAttempt = null;
          try {
            rawAudioStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 44100,
              },
            });

            audioStream = rawAudioStream;

            recordingCanvas = document.createElement('canvas');

            const MAX_REC_WIDTH = 1280;
            const MAX_REC_HEIGHT = 720;
            let ratio = 1;
            if (wbCanvas.width > MAX_REC_WIDTH || wbCanvas.height > MAX_REC_HEIGHT) {
              ratio = Math.min(MAX_REC_WIDTH / wbCanvas.width, MAX_REC_HEIGHT / wbCanvas.height);
            }
            recordingCanvas.width = Math.floor(wbCanvas.width * ratio);
            recordingCanvas.height = Math.floor(wbCanvas.height * ratio);
            recordingCtx = recordingCanvas.getContext('2d');
            recordingCtx.scale(ratio, ratio);

            if (typeof recordingCanvas.captureStream === 'function') {
              const canvasStream = recordingCanvas.captureStream(30);
              combinedAttempt = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...audioStream.getAudioTracks(),
              ]);
              const mimeTypes = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
              const selectedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

              try {
                if (combinedAttempt && selectedMime) {
                  mediaRecorder = new MediaRecorder(combinedAttempt, { mimeType: selectedMime });
                  recordingMode = 'video';
                }
              } catch (_) {
                mediaRecorder = null;
              }

              if (!mediaRecorder) {
                releaseMediaStream(combinedAttempt);
                combinedAttempt = null;
                try {
                  const audioMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
                  const audioMime = audioMimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
                  mediaRecorder = new MediaRecorder(audioStream, audioMime ? { mimeType: audioMime } : undefined);
                  recordingMode = 'audio';
                } catch (_) {
                  mediaRecorder = null;
                }
              }
            } else {
              try {
                const audioMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
                const audioMime = audioMimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
                mediaRecorder = new MediaRecorder(audioStream, audioMime ? { mimeType: audioMime } : undefined);
                recordingMode = 'audio';
              } catch (_) {
                mediaRecorder = null;
              }
            }
          } catch (e) {
            console.warn('[풀이 녹음] 마이크/녹화기 초기화 실패:', e);
            releaseMediaStream(combinedAttempt);
            combinedAttempt = null;
            releaseMediaStream(audioStream);
            audioStream = null;
            releaseMediaStream(rawAudioStream);
            rawAudioStream = null;
            mediaRecorder = null;
          }
        }

        if (!mediaRecorder && Capacitor.isNativePlatform?.()) {
          try {
            const permStatus = await VoiceRecorder.requestAudioRecordingPermission();
            if (!permStatus.value) {
              showToast('마이크 권한이 차단되었습니다.', 'error');
              return;
            }
            await VoiceRecorder.startRecording();
            recordingMode = 'audio';
            isRecording = true;
            updateWhiteboardUI();
            showToast('🎙 음성 녹음을 시작합니다.');
            return;
          } catch (e) {
            showToast('녹음을 시작할 수 없습니다.', 'error');
            return;
          }
        }

        if (mediaRecorder) {
          mediaRecorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) mediaChunks.push(ev.data);
          };
          mediaRecorder.onstop = () => {
            const blobType = mediaRecorder.mimeType || (recordingMode === 'video' ? 'video/webm' : 'audio/webm');
            recordedBlob = new Blob(mediaChunks, { type: blobType });
          };
          try {
            mediaRecorder.start(200);
          } catch (startErr) {
            console.error('[풀이 녹음] start 실패:', startErr);
            try { mediaRecorder.stream?.getTracks()?.forEach((t) => t.stop()); } catch (_) {}
            mediaRecorder = null;
            if (Capacitor.isNativePlatform?.()) {
              try {
                await VoiceRecorder.requestAudioRecordingPermission();
                await VoiceRecorder.startRecording();
                recordingMode = 'audio';
                isRecording = true;
                updateWhiteboardUI();
                showToast('🎙 음성 녹음을 시작합니다.');
                return;
              } catch (_) {
                showToast('녹음을 시작할 수 없습니다.', 'error');
                return;
              }
            }
            showToast('녹음을 시작할 수 없습니다.', 'error');
            return;
          }
          isRecording = true;
          if (recordingMode === 'video') {
            renderRecordingFrame();
            showToast('📹 보드+음성 녹화를 시작합니다.');
          } else if (submitMode === 'photo') {
            showToast('🎙 풀이 설명 음성 녹음을 시작합니다.');
          } else {
            showToast('🎙 오디오 녹음을 시작합니다.');
          }
          updateWhiteboardUI();
        } else {
          showToast('이 기기에서는 녹음을 시작할 수 없습니다.', 'error');
        }
      } catch (err) {
        console.error('[풀이 녹음]', err);
        showToast(`녹음 오류: ${err.message}`, 'error');
      }
    } else {
      if (recordingReqId) {
        cancelAnimationFrame(recordingReqId);
        recordingReqId = null;
      }

      if (Capacitor.isNativePlatform?.() && !mediaRecorder) {
        try {
          const result = await VoiceRecorder.stopRecording();
          const { mimeType, recordDataBase64 } = result.value;
          const bin = atob(recordDataBase64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          recordedBlob = new Blob([arr], { type: mimeType });
          isRecording = false;
          updateWhiteboardUI();
          showToast('⏹ 녹음을 중지했습니다.');
          return;
        } catch (e) {
          showToast('녹음 중지 오류', 'error');
        }
      }

      if (mediaRecorder) {
        try {
          mediaRecorder.stop();
          mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        } catch (e) {
          console.error(e);
        }
      }
      isRecording = false;
      updateWhiteboardUI();
      showToast('⏹ 녹음을 중지했습니다.');
    }
  }

  async function handleSaveProblem() {
    if (isRecording) {
      showToast('녹음을 먼저 중지한 뒤 저장해 주세요.', 'error');
      return;
    }
    if (!problemPrompt) return;
    if (submitMode === 'photo' && !photoBgImage && !attachedPhotoFile) {
      showToast('풀이 사진을 선택하거나 촬영해 주세요.', 'error');
      return;
    }

    const saveBtn = document.getElementById('wb-save');
    const recBtn = document.getElementById('wb-record');
    const overlay = document.getElementById('prob-saving-overlay');
    const overlayMsg = document.getElementById('prob-saving-overlay-msg');
    const prevSaveText = saveBtn?.textContent || '💾 풀이 저장';

    const setSaving = (on) => {
      if (saveBtn) {
        saveBtn.disabled = on;
        saveBtn.textContent = on ? '⏳ 저장 중…' : prevSaveText;
      }
      if (recBtn) recBtn.disabled = on;
      document.getElementById('wb-back')?.toggleAttribute('disabled', on);
      document.querySelectorAll('.prob-mode-tab').forEach((el) => {
        el.disabled = on;
      });
      if (overlay) overlay.classList.toggle('hidden', !on);
      if (overlayMsg && on) {
        overlayMsg.textContent = '풀이 이미지와 음성 파일을 서버에 올리는 중이에요. 잠시만 기다려 주세요…';
      }
      try {
        document.body.style.cursor = on ? 'wait' : '';
      } catch (_) {}
    };

    showToast(
      '저장을 시작했어요. 업로드가 끝날 때까지 이 화면을 유지해 주세요.',
      'info',
      14000
    );
    setSaving(true);

    try {
      let savedImage;
      if (submitMode === 'photo') {
        const canvasBlob = await exportCompositePngBlob();
        const imageFile = new File([canvasBlob], `problem_photo_${Date.now()}.png`, { type: 'image/png' });
        savedImage = await saveFile(imageFile);
      } else {
        const canvasBlob = await new Promise((resolve) => wbCanvas.toBlob(resolve, 'image/png'));
        if (!canvasBlob) throw new Error('캔버스 캡처 실패');
        const imageFile = new File([canvasBlob], `problem_wb_${Date.now()}.png`, { type: 'image/png' });
        savedImage = await saveFile(imageFile);
      }

      if (overlayMsg) overlayMsg.textContent = '이전 풀이 정리 및 새 풀이 등록 중…';

      let savedMedia = null;
      if (recordedBlob && recordedBlob.size > 0) {
        const isVideo = recordingMode === 'video';
        const type = recordedBlob.type;
        let ext = 'webm';
        if (type.includes('mp4')) ext = 'mp4';
        else if (type.includes('wav')) ext = 'wav';
        else if (type.includes('m4a')) ext = 'm4a';
        const fileName = `${isVideo ? 'video' : 'audio'}_${Date.now()}.${ext}`;
        savedMedia = await saveFile(new File([recordedBlob], fileName, { type }));
      }

      const mine = await getPresentationsByStudent(student.id, student.classId);
      const olds = mine.filter(
        (p) => presentationMatchesProblemPrompt(p, problemPrompt, [problemPrompt]),
      );
      for (const p of olds) {
        await deletePresentationById(p.id);
      }

      await addPresentation(student.id, student.classId, {
        whiteboardImage: savedImage,
        audioData: savedMedia,
        recordingMode: savedMedia ? recordingMode : undefined,
        type: 'problem_solution',
        problemPromptId: problemPrompt.id || promptId,
        title: problemPrompt.title || '한 문제 풀이',
        studentName: student.name,
        solutionSource: submitMode === 'photo' ? 'photo' : 'whiteboard',
      });

      await addStudentPoints(student.id, 1);

      showToast('✨ 풀이가 저장되었습니다! +1P', 'success', 4000);
      window.location.hash = '/student/dashboard';
    } catch (err) {
      console.error(err);
      showToast(`저장 실패: ${err.message}`, 'error', 5000);
    } finally {
      setSaving(false);
    }
  }

  function updateWhiteboardUI() {
    const recordBtn = document.getElementById('wb-record');
    if (recordBtn) {
      if (isRecording) {
        recordBtn.textContent = '⏹ 중지';
      } else {
        recordBtn.textContent = submitMode === 'photo' ? '🎙 녹음' : '📽️ 녹화';
      }
      recordBtn.className = `btn ${isRecording ? 'btn-danger' : 'btn-primary'} btn-sm`;
    }
    document.querySelectorAll('.whiteboard-tool').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === currentTool);
    });
  }

  /** 칠판 래퍼가 레이아웃된 뒤에만 리사이즈·하이드레이트한다. */
  async function waitBoardWrapReady(minW = 32, minH = 32, maxAttempts = 45) {
    for (let i = 0; i < maxAttempts; i++) {
      const wrap = wbCanvas?.parentElement;
      if (
        wrap
        && wrap.clientWidth >= minW
        && wrap.clientHeight >= minH
      ) {
        return true;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    const wrap = wbCanvas?.parentElement;
    return !!(wrap && wrap.clientWidth > 0 && wrap.clientHeight > 0);
  }

  async function hydrateExistingProblemSubmission() {
    try {
      const mine = await getPresentationsByStudent(student.id, student.classId);
      const olds = mine.filter(
        (p) => presentationMatchesProblemPrompt(p, problemPrompt, [problemPrompt]),
      );
      if (!olds.length) return;
      const latest = olds.slice().sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      )[0];
      const pres = await enrichPresentationWithImageUrls(latest);
      const wbUrl = presentationWhiteboardImageUrl(pres);
      if (!wbUrl) return;

      const isPhoto = pres.solutionSource === 'photo';
      submitMode = isPhoto ? 'photo' : 'board';
      applySubmitMode();

      if (isPhoto) {
        await waitBoardWrapReady();
        try {
          await loadPhotoBackgroundFromUrl(wbUrl);
        } catch (_) {
          showToast('이전 사진 풀이를 불러오지 못했습니다. 새 이미지로 다시 선택해 주세요.', 'info', 4500);
          return;
        }
        const st = document.getElementById('prob-photo-status');
        if (st) st.textContent = '저장했던 풀이입니다. 사진 교체·필기 추가 후 저장하세요.';
        document.getElementById('prob-photo-clear')?.classList.remove('hidden');
        showToast('이전 풀이를 칠판에 불러왔습니다. 이어서 수정하거나 음성을 추가할 수 있어요.', 'info', 4000);
        return;
      }

      if (!wbCanvas || !wbCtx) return;
      await waitBoardWrapReady();
      window.dispatchEvent(new Event('resize'));
      await new Promise((r) => requestAnimationFrame(r));

      const wrap = wbCanvas.parentElement;
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (cw < 2 || ch < 2) {
        console.warn('[풀이 불러오기] 칠판 영역 크기 확보 실패');
        showToast('칠판을 불러오는 중입니다. 화면을 한 번 줄였다 펼쳐 주세요.', 'info', 5000);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('칠판 이미지 로드 실패'));
        img.src = wbUrl;
      });
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!iw || !ih) return;
      wbCtx.save();
      wbCtx.fillStyle = '#000';
      wbCtx.fillRect(0, 0, cw, ch);
      const scale = Math.min(cw / iw, ch / ih, 2);
      const dw = iw * scale;
      const dh = ih * scale;
      const ox = (cw - dw) / 2;
      const oy = (ch - dh) / 2;
      wbCtx.drawImage(img, ox, oy, dw, dh);
      wbCtx.restore();
      showToast('이전 칠판을 불러왔습니다. 이어서 수정한 뒤 저장하세요.', 'info', 4000);
    } catch (e) {
      console.warn('[풀이 불러오기]', e);
    }
  }

  async function init() {
    await ensureStudentFirestoreAuth();
    problemPrompt = await getProblemPromptById(promptId);
    if (!problemPrompt || problemPrompt.classId !== student.classId) {
      showToast('문제를 찾을 수 없습니다.', 'error');
      window.location.hash = '/student/dashboard';
      return;
    }
    renderBoardShell();
    initWhiteboard();
    bindWhiteboardEvents();
    unbindPhotoClipboard = bindPhotoMode();
    await fillToolbarProblemAttachments();
    applySubmitMode();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await hydrateExistingProblemSubmission();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  void init();

  return () => {
    unbindPhotoClipboard();
  };
}
