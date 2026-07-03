/** 발표·풀이 재생 모달 HTML (음성+칠판/사진 동시 표시) */
import { inferRecordingModeFromMediaUrl } from '../store.js';

export const PRESENTATION_PLAYBACK_MODAL_HTML = `
  <div class="modal-backdrop" id="video-modal" style="z-index: 2000;">
    <div class="modal-content" style="max-width: 1000px; width: 90%; background: #000; padding: 0; overflow: hidden;">
      <div class="modal-header student-playback-modal-header" style="background: rgba(0,0,0,0.5); position: absolute; top: 0; left: 0; right: 0; z-index: 10;">
        <h3 class="modal-title" id="video-modal-title" style="color: #fff;">발표 재생</h3>
        <button type="button" class="modal-close" style="color: #fff; background: rgba(255,255,255,0.1);" id="close-video-modal">✕</button>
      </div>
      <div class="student-playback-stage">
        <img id="playback-wb" class="student-playback-wb hidden" alt="칠판·풀이 화면" />
        <video id="player" controls class="student-playback-video">소스가 없습니다.</video>
        <audio id="playback-audio" controls class="student-playback-audio hidden"></audio>
        <button type="button" class="student-playback-fs-float hidden" id="playback-fullscreen" title="전체화면으로 크게 보기" aria-label="전체화면으로 크게 보기">🔍 전체화면으로 보기</button>
      </div>
    </div>
  </div>
`;

/**
 * 재생 버튼(.play-video-btn, .btn-play-video)과 #video-modal 연결
 * @param {ParentNode} root
 */
export function bindPresentationPlayback(root = document) {
  const videoModal = root.querySelector('#video-modal');
  if (!videoModal) return;

  const player = videoModal.querySelector('#player');
  const audioEl = videoModal.querySelector('#playback-audio');
  const wbImg = videoModal.querySelector('#playback-wb');
  const modalTitle = videoModal.querySelector('#video-modal-title');
  const stage = videoModal.querySelector('.student-playback-stage');
  const fsBtn = videoModal.querySelector('#playback-fullscreen');

  const exitFullscreen = () => {
    if (stage && document.fullscreenElement === stage) {
      void document.exitFullscreen?.();
    }
  };

  const syncStageLayout = () => {
    if (!stage) return;
    stage.classList.toggle(
      'student-playback-stage--has-audio',
      !!(audioEl && !audioEl.classList.contains('hidden')),
    );
    stage.classList.toggle(
      'student-playback-stage--has-image',
      !!(wbImg && !wbImg.classList.contains('hidden')),
    );
  };

  const setFullscreenVisible = (show) => {
    fsBtn?.classList.toggle('hidden', !show);
    if (show) syncStageLayout();
  };

  const closePlayback = () => {
    exitFullscreen();
    setFullscreenVisible(false);
    stage?.classList.remove('student-playback-stage--has-audio', 'student-playback-stage--has-image');
    player?.pause();
    if (player) player.src = '';
    audioEl?.pause();
    if (audioEl) audioEl.src = '';
    if (wbImg) {
      wbImg.src = '';
      wbImg.classList.add('hidden');
    }
    player?.classList.remove('hidden');
    audioEl?.classList.add('hidden');
    videoModal.classList.remove('active');
  };

  const openPlayback = (btn) => {
    if (!player) return;

    const mediaUrl = btn.dataset.url || '';
    const wbUrl = btn.dataset.wbUrl || '';
    const mode = inferRecordingModeFromMediaUrl(mediaUrl, btn.dataset.recordingMode || btn.dataset.mode || 'audio');

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
    setFullscreenVisible(false);

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
      setFullscreenVisible(true);
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
      setFullscreenVisible(true);
      videoModal.classList.add('active');
    }
  };

  root.querySelectorAll('.play-video-btn, .btn-play-video').forEach((btn) => {
    btn.addEventListener('click', () => openPlayback(btn));
  });

  videoModal.querySelector('#close-video-modal')?.addEventListener('click', closePlayback);
  videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) closePlayback();
  });

  fsBtn?.addEventListener('click', () => {
    if (!stage) return;
    if (document.fullscreenElement === stage) {
      void document.exitFullscreen?.();
    } else {
      void stage.requestFullscreen?.();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!stage || !fsBtn || fsBtn.classList.contains('hidden')) return;
    const inFs = document.fullscreenElement === stage;
    fsBtn.textContent = inFs ? '✕ 전체화면 끄기' : '🔍 전체화면으로 보기';
    fsBtn.title = inFs ? '전체화면 끄기' : '전체화면으로 크게 보기';
    fsBtn.setAttribute('aria-label', fsBtn.title);
  });

  wbImg?.addEventListener('dblclick', () => {
    if (!fsBtn?.classList.contains('hidden')) fsBtn.click();
  });
}
