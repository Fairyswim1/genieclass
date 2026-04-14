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

const GROWTH_STAGES = {
  1: { name: '잠든 씨앗', badge: '🌰', glow: 'rgba(235, 227, 213, 0.4)' },
  2: { name: '파릇파릇 새싹', badge: '🌱', glow: 'rgba(153, 204, 153, 0.4)' },
  3: { name: '무럭무럭 줄기', badge: '🌿', glow: 'rgba(102, 178, 102, 0.4)' },
  4: { name: '활짝 핀 꽃', badge: '🌸', glow: 'rgba(230, 164, 180, 0.4)' },
  5: { name: '탐스러운 열매', badge: '✨', glow: 'rgba(255, 204, 102, 0.5)' }
};

const PLANT_LEVEL_ASSETS = {
  apple: ['🌰', '🌱', '🌿', '🌸', '🍎'],
  grape: ['🌰', '🌱', '🌿', '🌸', '🍇'],
  strawberry: ['🌰', '🌱', '🌿', '🌸', '🍓'],
  tangerine: ['🌰', '🌱', '🌿', '🌸', '🍊'],
  baobab: ['🌰', '🌱', '🌿', '🌸', '🌳'],
  watermelon: ['🌰', '🌱', '🌿', '🌸', '🍉'],
  pineapple: ['🌰', '🌱', '🌿', '🌸', '🍍'],
  banana: ['🌰', '🌱', '🌿', '🌸', '🍌'],
  peach: ['🌰', '🌱', '🌿', '🌸', '🍑'],
  cherry: ['🌰', '🌱', '🌿', '🌸', '🍒'],
  melon: ['🌰', '🌱', '🌿', '🌸', '🍈'],
  lemon: ['🌰', '🌱', '🌿', '🌸', '🍋'],
  blueberry: ['🌰', '🌱', '🌿', '🌸', '🫐'],
  coconut: ['🌰', '🌱', '🌿', '🌸', '🥥'],
  mango: ['🌰', '🌱', '🌿', '🌸', '🥭']
};

export const LEVEL_THRESHOLDS = [0, 1, 3, 6, 10]; // Required points for Lv 1, 2, 3, 4, 5

export function getLevelProgress(totalPoints) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalPoints >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  const currentThreshold = LEVEL_THRESHOLDS[level - 1];
  const nextThreshold = level < 5 ? LEVEL_THRESHOLDS[level] : currentThreshold;
  const pointsInCurrentLevel = totalPoints - currentThreshold;
  const pointsNeededForNext = level < 5 ? nextThreshold - currentThreshold : 0;
  const progressPercent = level < 5 ? (pointsInCurrentLevel / pointsNeededForNext) * 100 : 100;
  const remainingPoints = level < 5 ? nextThreshold - totalPoints : 0;

  // 열매 개수 계산: 10P(lv5)에서 1개, 이후 3P마다 1개씩 추가
  const fruitCount = level === 5 ? (1 + Math.floor((totalPoints - 10) / 3)) : 0;

  return { level, progressPercent, remainingPoints, isMaxLevel: level === 5, fruitCount };
}

export function getLevelConfig(level, type = 'apple') {
  if (!PLANT_TYPES[type]) type = 'apple';
  const stage = GROWTH_STAGES[Math.min(5, Math.max(1, level))] || GROWTH_STAGES[1];
  const plantName = PLANT_TYPES[type]?.name || '사과나무';
  return {
    ...stage,
    fullName: `${stage.name}(${plantName})`,
    emoji: PLANT_LEVEL_ASSETS[type]?.[level - 1] || '🌰'
  };
}

export function renderCharacter(level, size = 80, type = 'apple', totalPoints = 0) {
  if (!PLANT_TYPES[type]) type = 'apple';
  const safeLevel = Math.min(5, Math.max(1, level));
  const config = getLevelConfig(safeLevel, type);
  const fontSize = size * 0.6;
  const glowSize = size * 0.8;

  const fruitEmoji = PLANT_LEVEL_ASSETS[type]?.[4] || '🍎';
  const displayEmoji = safeLevel === 1 ? '🌰' : (PLANT_LEVEL_ASSETS[type]?.[safeLevel - 1] || '🌰');

  // 무한 성장 로직 (Level 5일 때만 적용)
  const fruitCount = safeLevel === 5 ? (1 + Math.floor((Math.max(10, totalPoints) - 10) / 3)) : 1;

  let content = '';
  if (safeLevel === 5) {
    if (fruitCount === 1) {
      content = `<div style="font-size: ${fontSize}px;">${fruitEmoji}</div>`;
    } else if (fruitCount === 2) {
      content = `<div style="font-size: ${fontSize * 0.85}px; display: flex; gap: 4px;">${fruitEmoji}<span>${fruitEmoji}</span></div>`;
    } else if (fruitCount === 3) {
      content = `<div style="display: flex; flex-direction: column; align-items: center; gap: -5px;">
        <div style="font-size: ${fontSize * 0.65}px; display: flex; gap: 2px;">${fruitEmoji}${fruitEmoji}</div>
        <div style="font-size: ${fontSize * 0.65}px;">${fruitEmoji}</div>
      </div>`;
    } else {
      // 4개 이상일 때: 사과나무 (더 이상 징그럽지 않게 큰 나무 하나로 표현)
      content = `<div style="font-size: ${fontSize * 1.1}px; position: relative; display: flex; align-items: center; justify-content: center;">
        🌳
        <div style="position: absolute; top: 20%; left: 50%; transform: translateX(-50%); display: flex; gap: 2px;">
           <span style="font-size: 0.3em; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));">${fruitEmoji}</span>
           <span style="font-size: 0.3em; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2)); margin-top: 5px;">${fruitEmoji}</span>
        </div>
      </div>`;
    }
  } else {
    content = `<div style="font-size: ${fontSize}px;">${displayEmoji}</div>`;
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
