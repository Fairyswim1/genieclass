// ========================================
// Genie Class - Character Avatar (SVG)
// 별자리 성장 시스템
// ========================================

const LEVEL_CONFIG = {
    1: {
        name: '별의 씨앗',
        emoji: '✨',
        color: '#A29BFE',
        size: 40,
        glow: 4,
    },
    2: {
        name: '어린 별',
        emoji: '🌟',
        color: '#FFD93D',
        size: 48,
        glow: 8,
    },
    3: {
        name: '빛나는 별',
        emoji: '⭐',
        color: '#FFD93D',
        size: 56,
        glow: 12,
    },
    4: {
        name: '별자리',
        emoji: '🌠',
        color: '#6C5CE7',
        size: 64,
        glow: 16,
    },
    5: {
        name: '은하',
        emoji: '🌌',
        color: '#A29BFE',
        size: 72,
        glow: 24,
    },
};

export function getLevelConfig(level) {
    return LEVEL_CONFIG[Math.min(5, Math.max(1, level))] || LEVEL_CONFIG[1];
}

export function renderCharacter(level, size = 80) {
    const config = getLevelConfig(level);
    const center = size / 2;

    let innerSVG = '';

    if (level === 1) {
        // Small glowing dot
        innerSVG = `
      <circle cx="${center}" cy="${center}" r="${size * 0.12}" fill="${config.color}" opacity="0.6">
        <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${center}" cy="${center}" r="${size * 0.06}" fill="white" opacity="0.9">
        <animate attributeName="r" values="${size * 0.05};${size * 0.08};${size * 0.05}" dur="2s" repeatCount="indefinite"/>
      </circle>
    `;
    } else if (level === 2) {
        // Growing star with color
        innerSVG = `
      <circle cx="${center}" cy="${center}" r="${size * 0.18}" fill="${config.color}" opacity="0.3">
        <animate attributeName="r" values="${size * 0.16};${size * 0.22};${size * 0.16}" dur="3s" repeatCount="indefinite"/>
      </circle>
      ${createStarPath(center, center, size * 0.14, size * 0.07, 4, config.color)}
    `;
    } else if (level === 3) {
        // Full star with spinning particles
        innerSVG = `
      <circle cx="${center}" cy="${center}" r="${size * 0.25}" fill="${config.color}" opacity="0.15">
        <animate attributeName="r" values="${size * 0.23};${size * 0.28};${size * 0.23}" dur="3s" repeatCount="indefinite"/>
      </circle>
      ${createStarPath(center, center, size * 0.2, size * 0.1, 5, config.color)}
      ${createOrbitingDots(center, center, size * 0.3, 3)}
    `;
    } else if (level === 4) {
        // Constellation - connected stars
        const points = getConstellationPoints(center, center, size * 0.3, 5);
        const lines = points.map((p, i) => {
            const next = points[(i + 1) % points.length];
            return `<line x1="${p.x}" y1="${p.y}" x2="${next.x}" y2="${next.y}" stroke="${config.color}" stroke-width="1" opacity="0.4"/>`;
        }).join('');
        const dots = points.map(p =>
            `<circle cx="${p.x}" cy="${p.y}" r="3" fill="white" opacity="0.9">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="${1.5 + Math.random()}s" repeatCount="indefinite"/>
      </circle>`
        ).join('');
        innerSVG = `
      <circle cx="${center}" cy="${center}" r="${size * 0.35}" fill="${config.color}" opacity="0.08"/>
      ${lines}
      ${dots}
      ${createStarPath(center, center, size * 0.12, size * 0.06, 5, '#FFD93D')}
    `;
    } else {
        // Galaxy - spiral effect
        innerSVG = `
      <circle cx="${center}" cy="${center}" r="${size * 0.38}" fill="url(#galaxyGrad${center})" opacity="0.3">
        <animateTransform attributeName="transform" type="rotate" from="0 ${center} ${center}" to="360 ${center} ${center}" dur="20s" repeatCount="indefinite"/>
      </circle>
      <defs>
        <radialGradient id="galaxyGrad${center}">
          <stop offset="0%" stop-color="${config.color}" stop-opacity="0.8"/>
          <stop offset="50%" stop-color="#6C5CE7" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
        </radialGradient>
      </defs>
      ${createSpiralDots(center, center, size * 0.35, 15)}
      ${createStarPath(center, center, size * 0.1, size * 0.05, 6, '#FFD93D')}
      <circle cx="${center}" cy="${center}" r="${size * 0.04}" fill="white" opacity="0.95"/>
    `;
    }

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${innerSVG}
  </svg>`;
}

function createStarPath(cx, cy, outerR, innerR, points, color) {
    let d = '';
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / points) * i - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        d += (i === 0 ? 'M' : 'L') + x + ' ' + y;
    }
    d += 'Z';
    return `<path d="${d}" fill="${color}" opacity="0.9">
    <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite"/>
  </path>`;
}

function createOrbitingDots(cx, cy, radius, count) {
    let svg = '';
    for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI / count) * i;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        svg += `<circle cx="${x}" cy="${y}" r="2" fill="white" opacity="0.6">
      <animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${4 + i}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.3;0.8;0.3" dur="${2 + i * 0.5}s" repeatCount="indefinite"/>
    </circle>`;
    }
    return svg;
}

function getConstellationPoints(cx, cy, radius, count) {
    const points = [];
    for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI / count) * i - Math.PI / 2;
        const r = radius * (0.7 + Math.random() * 0.3);
        points.push({
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle),
        });
    }
    return points;
}

function createSpiralDots(cx, cy, maxRadius, count) {
    let svg = '';
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 4;
        const r = (i / count) * maxRadius;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        const size = 1 + (i / count) * 2;
        const opacity = 0.3 + (i / count) * 0.5;
        svg += `<circle cx="${x}" cy="${y}" r="${size}" fill="white" opacity="${opacity}">
      <animate attributeName="opacity" values="${opacity * 0.5};${opacity};${opacity * 0.5}" dur="${2 + Math.random() * 2}s" repeatCount="indefinite"/>
    </circle>`;
    }
    return svg;
}

export function renderPraiseAnimation(container) {
    const anim = document.createElement('div');
    anim.style.cssText = `
    position: absolute; inset: 0; pointer-events: none; z-index: 10;
    display: flex; align-items: center; justify-content: center;
  `;
    anim.innerHTML = '<span style="font-size:3rem; animation: starGrow 0.6s ease forwards;">⭐</span>';
    container.style.position = 'relative';
    container.appendChild(anim);
    setTimeout(() => anim.remove(), 700);
}
