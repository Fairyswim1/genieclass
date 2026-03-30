// ========================================
// Genie Class - Animal Character System
// 성장하는 귀여운 동물 친구들
// ========================================

const ANIMAL_TYPES = {
  chick: { name: '병아리', icon: '🐤' },
  puppy: { name: '강아지', icon: '🐶' },
  kitty: { name: '고양이', icon: '🐱' },
  bunny: { name: '토끼', icon: '🐰' }
};

const GROWTH_STAGES = {
  1: { name: '신비로운 알', badge: '🥚', glow: 'rgba(235, 227, 213, 0.4)' },
  2: { name: '갓 태어난 아기', badge: '🍼', glow: 'rgba(243, 202, 82, 0.3)' },
  3: { name: '쑥쑥 자란 꼬마', badge: '✨', glow: 'rgba(153, 169, 143, 0.3)' },
  4: { name: '멋쟁이 친구', badge: '🎩', glow: 'rgba(230, 164, 180, 0.3)' },
  5: { name: '전설의 대장님', badge: '👑', glow: 'rgba(209, 125, 57, 0.4)' }
};

const ANIMAL_LEVEL_ASSETS = {
  chick: ['🥚', '🐣', '🐥', '🐥🎩', '👑👑🐥'],
  puppy: ['🥚', '🐶', '🐕', '🐕🎒', '👑👑🐕'],
  kitty: ['🥚', '🐱', '🐈', '🐈🕶️', '👑👑🐈'],
  bunny: ['🥚', '🐰', '🐇', '🐇🎀', '👑👑🐇']
};

export function getLevelConfig(level, type = 'chick') {
  const stage = GROWTH_STAGES[Math.min(5, Math.max(1, level))] || GROWTH_STAGES[1];
  const animalName = ANIMAL_TYPES[type]?.name || '병아리';
  return {
    ...stage,
    fullName: `${stage.name} ${animalName}`,
    emoji: ANIMAL_LEVEL_ASSETS[type]?.[level - 1] || '🥚'
  };
}

export function renderCharacter(level, size = 80, type = 'chick') {
  const config = getLevelConfig(level, type);
  const fontSize = size * 0.6;
  const glowSize = size * 0.8;
  
  // Lv 1 is always an egg
  const displayEmoji = level === 1 ? '🥚' : (ANIMAL_LEVEL_ASSETS[type]?.[level - 1] || '🥚');

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
        font-size: ${fontSize}px;
        z-index: 2;
        filter: drop-shadow(2px 4px 4px rgba(62, 54, 46, 0.1));
        line-height: 1.1;
        display: flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
      ">
        ${displayEmoji}
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

export { ANIMAL_TYPES };
