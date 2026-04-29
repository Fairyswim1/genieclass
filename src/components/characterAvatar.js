// ========================================
// Genie Class - Plant Character System
// 성장하는 귀여운 반려 식물들
// ========================================

const PLANT_TYPES = {
  apple: { name: '사과나무', icon: '🍎' },
  grape: { name: '포도나무', icon: '🍇' },
  strawberry: { name: '딸기', icon: '🍓' },
  tangerine: { name: '귤나무', icon: '🍊' },
  baobab: { name: '바오밥나무', icon: '🌳' },
  watermelon: { name: '수박', icon: '🍉' },
  pineapple: { name: '파인애플', icon: '🍍' },
  banana: { name: '바나나', icon: '🍌' },
  peach: { name: '복숭아', icon: '🍑' },
  cherry: { name: '체리', icon: '🍒' },
  melon: { name: '멜론', icon: '🍈' },
  lemon: { name: '레몬', icon: '🍋' },
  blueberry: { name: '블루베리', icon: '🫐' },
  coconut: { name: '코코넛', icon: '🥥' },
  mango: { name: '망고', icon: '🥭' }
};

/** Lv1~8 표시용 (씨앗 → 새싹 → 줄기 → 꽃 → 열매×3 → 나무) */
const GROWTH_STAGES = {
  1: { name: '잠든 씨앗', badge: '🌰', glow: 'rgba(235, 227, 213, 0.4)' },
  2: { name: '파릇파릇 새싹', badge: '🌱', glow: 'rgba(153, 204, 153, 0.4)' },
  3: { name: '무럭무럭 줄기', badge: '🌿', glow: 'rgba(102, 178, 102, 0.4)' },
  4: { name: '활짝 핀 꽃', badge: '🌸', glow: 'rgba(230, 164, 180, 0.4)' },
  5: { name: '열매 1개', badge: '✨', glow: 'rgba(255, 204, 102, 0.45)' },
  6: { name: '열매 2개', badge: '✨', glow: 'rgba(255, 204, 102, 0.48)' },
  7: { name: '열매 3개', badge: '✨', glow: 'rgba(255, 204, 102, 0.5)' },
  8: { name: '우거진 나무', badge: '🌳', glow: 'rgba(120, 180, 140, 0.5)' }
};

/**
 * 단계별 에셋 인덱스: 0씨앗 1새싹 2줄기 3꽃 456열매(동일 아이콘×단계) 7나무
 */
const PLANT_LEVEL_ASSETS = {
  apple: ['🌰', '🌱', '🌿', '🌸', '🍎', '🍎', '🍎', '🌳'],
  grape: ['🌰', '🌱', '🌿', '🌸', '🍇', '🍇', '🍇', '🌳'],
  strawberry: ['🌰', '🌱', '🌿', '🌸', '🍓', '🍓', '🍓', '🌳'],
  tangerine: ['🌰', '🌱', '🌿', '🌸', '🍊', '🍊', '🍊', '🌳'],
  baobab: ['🌰', '🌱', '🌿', '🌸', '🌳', '🌳', '🌳', '🌳'],
  watermelon: ['🌰', '🌱', '🌿', '🌸', '🍉', '🍉', '🍉', '🌳'],
  pineapple: ['🌰', '🌱', '🌿', '🌸', '🍍', '🍍', '🍍', '🌳'],
  banana: ['🌰', '🌱', '🌿', '🌸', '🍌', '🍌', '🍌', '🌳'],
  peach: ['🌰', '🌱', '🌿', '🌸', '🍑', '🍑', '🍑', '🌳'],
  cherry: ['🌰', '🌱', '🌿', '🌸', '🍒', '🍒', '🍒', '🌳'],
  melon: ['🌰', '🌱', '🌿', '🌸', '🍈', '🍈', '🍈', '🌳'],
  lemon: ['🌰', '🌱', '🌿', '🌸', '🍋', '🍋', '🍋', '🌳'],
  blueberry: ['🌰', '🌱', '🌿', '🌸', '🫐', '🫐', '🫐', '🌳'],
  coconut: ['🌰', '🌱', '🌿', '🌸', '🥥', '🥥', '🥥', '🌳'],
  mango: ['🌰', '🌱', '🌿', '🌸', '🥭', '🥭', '🥭', '🌳']
};

/** 최고 단계 (Lv.8 = 나무) */
export const MAX_CHARACTER_LEVEL = 8;

/**
 * 다음 레벨까지 필요한 포인트(간격): 2→2→1→1→2→2 를 순환
 * 누적 기준 시작점 thresholds[0]=0(Lv1) … thresholds[7]=Lv8 도달점
 */
const LEVEL_POINT_GAPS = [2, 2, 1, 1, 2, 2];

function buildCumulativeThresholds(maxLevel, gaps) {
  const thresholds = [0];
  let acc = 0;
  for (let step = 0; step < maxLevel - 1; step++) {
    acc += gaps[step % gaps.length];
    thresholds.push(acc);
  }
  return thresholds;
}

/** 누적 포인트 구간 시작점 [Lv1 … Lv8] — Lv8 도달까지 총 12P 필요 (패턴 간격 합계) */
export const LEVEL_THRESHOLDS = buildCumulativeThresholds(MAX_CHARACTER_LEVEL, LEVEL_POINT_GAPS);

/** 총 포인트로 레벨 1~8 산정 (Firestore characterLevel 과 맞춤) */
export function deriveCharacterLevelFromPoints(totalPoints) {
  const pts = Math.max(0, Number(totalPoints) || 0);
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (pts >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  return Math.min(MAX_CHARACTER_LEVEL, level);
}

export function getLevelProgress(totalPoints) {
  const pts = Math.max(0, Number(totalPoints) || 0);
  const level = deriveCharacterLevelFromPoints(pts);
  const currentThreshold = LEVEL_THRESHOLDS[level - 1];
  const nextThreshold = level < MAX_CHARACTER_LEVEL ? LEVEL_THRESHOLDS[level] : currentThreshold;
  const pointsInCurrentLevel = pts - currentThreshold;
  const pointsNeededForNext = level < MAX_CHARACTER_LEVEL ? nextThreshold - currentThreshold : 0;
  const progressPercent = level < MAX_CHARACTER_LEVEL && pointsNeededForNext > 0
    ? (pointsInCurrentLevel / pointsNeededForNext) * 100
    : 100;
  const remainingPoints = level < MAX_CHARACTER_LEVEL ? nextThreshold - pts : 0;

  const fruitCount = level >= 5 && level <= 7 ? level - 4 : 0;

  return {
    level,
    progressPercent,
    remainingPoints,
    isMaxLevel: level === MAX_CHARACTER_LEVEL,
    fruitCount,
  };
}

export function getLevelConfig(level, type = 'apple') {
  if (!PLANT_TYPES[type]) type = 'apple';
  const safe = Math.min(MAX_CHARACTER_LEVEL, Math.max(1, level));
  const stage = GROWTH_STAGES[safe] || GROWTH_STAGES[1];
  const plantName = PLANT_TYPES[type]?.name || '사과나무';
  const emoji = PLANT_LEVEL_ASSETS[type]?.[safe - 1] || '🌰';
  return {
    ...stage,
    fullName: `${stage.name}(${plantName})`,
    emoji,
  };
}

export function renderCharacter(level, size = 80, type = 'apple', _totalPoints = 0) {
  if (!PLANT_TYPES[type]) type = 'apple';
  const safeLevel = Math.min(MAX_CHARACTER_LEVEL, Math.max(1, level));
  const config = getLevelConfig(safeLevel, type);
  const fontSize = size * 0.6;
  const glowSize = size * 0.8;

  const assets = PLANT_LEVEL_ASSETS[type] || PLANT_LEVEL_ASSETS.apple;
  const fruitEmoji = assets[4] || '🍎';
  const treeEmoji = assets[7] || '🌳';
  const plantIcon = PLANT_TYPES[type]?.icon || '🍎';
  /** 나무 꼭대기 장식용: 열매와 나무 이모지가 같을 때(바오밥 등)는 과일 종류 아이콘 */
  const fruitOnTree = fruitEmoji === treeEmoji ? plantIcon : fruitEmoji;

  let content = '';
  if (safeLevel <= 4) {
    const emoji = assets[safeLevel - 1] || '🌰';
    content = `<div style="font-size: ${fontSize}px;">${emoji}</div>`;
  } else if (safeLevel === 5) {
    content = `<div style="font-size: ${fontSize}px;">${fruitEmoji}</div>`;
  } else if (safeLevel === 6) {
    content = `<div style="font-size: ${fontSize * 0.85}px; display: flex; gap: 4px;">${fruitEmoji}<span>${fruitEmoji}</span></div>`;
  } else if (safeLevel === 7) {
    content = `<div style="display: flex; flex-direction: column; align-items: center; gap: -5px;">
        <div style="font-size: ${fontSize * 0.65}px; display: flex; gap: 2px;">${fruitEmoji}${fruitEmoji}</div>
        <div style="font-size: ${fontSize * 0.65}px;">${fruitEmoji}</div>
      </div>`;
  } else {
    content = `<div style="font-size: ${fontSize * 1.08}px; position: relative; display: inline-flex; align-items: center; justify-content: center; line-height: 1;">
        <span aria-hidden="true">${treeEmoji}</span>
        <div style="position: absolute; top: 14%; left: 50%; transform: translateX(-50%); width: 78%; display: flex; justify-content: space-around; align-items: flex-start; flex-wrap: wrap; gap: 2px; pointer-events: none;" aria-hidden="true">
          <span style="font-size: 0.34em; line-height: 1; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));">${fruitOnTree}</span>
          <span style="font-size: 0.38em; line-height: 1; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2)); margin-top: 1px;">${fruitOnTree}</span>
          <span style="font-size: 0.34em; line-height: 1; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));">${fruitOnTree}</span>
        </div>
      </div>`;
  }

  return `
    <div class="character-avatar" style="
      width: ${size}px; 
      height: ${size}px; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      position: relative;
    ">
      <!-- Glow Effect -->
      <div style="
        position: absolute;
        width: ${glowSize}px;
        height: ${glowSize}px;
        background: ${config.glow};
        border-radius: 50%;
        filter: blur(${size * 0.15}px);
        animation: pulse 3s infinite ease-in-out;
      "></div>
      
      <!-- Character Emoji -->
      <div style="
        z-index: 2;
        filter: drop-shadow(2px 4px 4px rgba(62, 54, 46, 0.1));
        line-height: 1.1;
        display: flex;
        align-items: center; 
        justify-content: center; 
        position: relative;
        width: 100%;
        height: 100%;
      ">
        ${content}
      </div>
      
      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(0.9); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
      </style>
    </div>
  `;
}

export function renderPraiseAnimation(container) {
  const anim = document.createElement('div');
  anim.style.cssText = `
    position: absolute; inset: 0; pointer-events: none; z-index: 10;
    display: flex; align-items: center; justify-content: center;
  `;
  anim.innerHTML = '<span style="font-size:3.5rem; animation: starGrow 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;">💝</span>';

  const style = document.createElement('style');
  style.textContent = `
    @keyframes starGrow {
      0% { transform: scale(0) rotate(-20deg); opacity: 0; }
      50% { transform: scale(1.3) rotate(10deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); opacity: 0; translateY(-20px); }
    }
  `;
  document.head.appendChild(style);

  container.style.position = 'relative';
  container.appendChild(anim);
  setTimeout(() => anim.remove(), 700);
}

export { PLANT_TYPES };
