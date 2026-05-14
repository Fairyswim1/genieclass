/**
 * destination-out + stroke() 는 안티앨리어싱으로 지운 듯한 잔상이 남는 경우가 있어,
 * 원형 fill로 경로를 따라 지웁니다. (ctx는 이미지 좌표계와 동일한 논리 좌표)
 */
export function eraseSegmentDisk(ctx, x1, y1, x2, y2, penSize) {
  const radius = Math.max(3.5, penSize * 7.5);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(radius * 0.45, 1.1);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 툴바 지우개 버튼용 (Lucide 스타일 스트로크 실루엣 — 이모지 연필과 시각 무게 균형) */
export const WHITEBOARD_ERASER_ICON_HTML = `<svg class="wb-eraser-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.5l9.6-9.6c1-1 2.6-1 3.6 0l5.8 5.8c1 1 1 2.5 0 3.5L13 21"/><path d="M22 21H7"/><path d="m13.6 12.9 8.9 9"/></svg>`;
