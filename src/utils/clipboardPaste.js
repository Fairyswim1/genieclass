/**
 * 클립보드 붙여넣기(File) 헬퍼.
 * 사용자가 특정 영역을 한 번 탭한 뒤 해당 영역이 "붙여넣기 타깃"이 되도록 pointerdown 으로 활성화합니다.
 */

const ZONE_MARK = 'data-genie-paste-zone';

/** @type {{ zone: HTMLElement, handleFiles: (files: File[]) => void, imagesOnly: boolean } | null} */
let activeTarget = null;

function markActive(zoneEl) {
  document.querySelectorAll(`[${ZONE_MARK}="1"]`).forEach((n) => n.removeAttribute(ZONE_MARK));
  zoneEl.setAttribute(ZONE_MARK, '1');
}

function deactivateZone(zoneEl) {
  zoneEl.removeAttribute(ZONE_MARK);
  if (activeTarget?.zone === zoneEl) activeTarget = null;
}

function isTypingFocused(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase?.() ?? '';
  if (tag === 'TEXTAREA') return true;
  if (tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = String(el.type || 'text').toLowerCase();
    const textTypes = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''];
    return textTypes.includes(type);
  }
  return false;
}

/**
 * @param {DataTransfer|null|undefined} data
 * @param {{ imagesOnly?: boolean }} opts
 */
export function collectClipboardFiles(data, opts = {}) {
  const imagesOnly = opts.imagesOnly === true;
  const out = [];

  const tryPush = (f) => {
    if (!f) return;
    if (imagesOnly && !String(f.type || '').startsWith('image/')) return;
    out.push(f);
  };

  if (data?.files?.length) {
    for (let i = 0; i < data.files.length; i++) tryPush(data.files[i]);
    if (out.length) return out;
  }

  if (data?.items?.length) {
    for (const item of data.items) {
      if (item.kind !== 'file') continue;
      const t = item.type || '';
      if (imagesOnly && !t.startsWith('image/')) continue;
      tryPush(item.getAsFile());
    }
  }

  return out;
}

/** @typedef {{ zone: HTMLElement, onPaste: (files: File[]) => void, imagesOnly?: boolean }} BindOpts */

/** @returns {() => void} teardown */
export function bindClipboardPasteZone({ zone, onPaste: handleFiles, imagesOnly = false }) {
  if (!zone || typeof handleFiles !== 'function') return () => {};

  const onlyImg = imagesOnly;

  const onPointerDown = () => {
    activeTarget = { zone, imagesOnly: onlyImg, handleFiles };
    markActive(zone);
  };

  const onWindowPaste = (e) => {
    if (!activeTarget || activeTarget.zone !== zone) return;
    if (!zone.isConnected) {
      deactivateZone(zone);
      return;
    }
    if (isTypingFocused(document.activeElement)) return;

    const files = collectClipboardFiles(e.clipboardData, { imagesOnly: activeTarget.imagesOnly });
    if (files.length === 0) return;

    e.preventDefault();
    e.stopPropagation();
    activeTarget.handleFiles(files);
  };

  zone.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('paste', onWindowPaste, true);

  return () => {
    zone.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('paste', onWindowPaste, true);
    deactivateZone(zone);
  };
}
