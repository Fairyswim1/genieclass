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

/** 툴바 지우개 버튼용 (빗자루 이모지 대신) */
export const WHITEBOARD_ERASER_ICON_HTML = `<svg class="wb-eraser-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.24 3.56l2.83 2.83a2 2 0 010 2.83L8.65 19.64a2 2 0 01-1.42.59H4v-3.23c0-.53.21-1.04.59-1.42L13.41 3.56a2 2 0 012.83 0zM6.41 19h1.17l8.66-8.66-1.41-1.41L6.41 17.83V19z"/><path fill="currentColor" d="M3 20h18v2H3v-2" opacity=".4"/></svg>`;
