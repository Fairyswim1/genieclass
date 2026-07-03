/**
 * Vercel Serverless — 모범답안·학생 풀이 비교 피드백 (Gemini 또는 OpenAI, 멀티모달)
 *
 * 로컬: `npx vercel dev --listen 3000` + Vite `proxy['/api']` 사용.
 *
 * 공급자 선택 (환경 변수):
 * - PROBLEM_FEEDBACK_PROVIDER=gemini  → Gemini만 사용
 * - PROBLEM_FEEDBACK_PROVIDER=openai    → OpenAI만 사용
 * - 생략(자동) → GEMINI_API_KEY가 있으면 Gemini, 아니면 OPENAI_API_KEY로 OpenAI
 *
 * Gemini: GEMINI_API_KEY (Google AI Studio)
 * 기본 모델: gemini-2.5-flash — `GEMINI_MODEL` 로 변경 가능 (계정·지역별 제공 모델이 다름)
 * ※ 구 gemini-2.0-flash 등은 신규 키에서 비활성화되는 안내가 자주 나옴 → 환경 변수로 최신 모델 교체
 * OpenAI: OPENAI_API_KEY
 */

const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions';

const BASE_SYSTEM_PROMPT = [
  '역할: 대한민국의 중등·고등 과정 수학·과학 과목 조교 교사 또는 튜터.',
  '',
  '사용자가 제공하는 [모범답안/참고]와 [학생 풀이 이미지]를 비교하여 피드백합니다.',
  '톤: 격려하되 솔직하게. 문장부호·예시는 과목에 맞게.',
  '이미지의 글씨·기호 일부만 보일 경우 추정임을 간단히 밝히기.',
  '마크다운 굵게(**) 허용. 각 섹션은 충분히 쓰고 중간에 잘리지 않게 완결된 문장으로 마무리.',
].join('\n');

const VERBAL_FORMAT = [
  '요구 형식 (채점·점수 없이 서술형 피드백):',
  '1. **전체 평**: 2~3문장으로 답 도출 결과·풀이 접근 방향 요약.',
  '2. **잘한 점**: 구체적으로 2~4개 불릿.',
  '3. **부족한 점·오개념 가능성**: 구체적으로 2~4개 불릿.',
  '4. **다음 학습 팁**: 2~3문장.',
].join('\n');

const SCORING_FORMAT = [
  '요구 형식 (루브릭·배점·채점 기준이 제공된 경우 — 반드시 점수 포함):',
  '1. **총점**: 루브릭 만점 대비 획득 점수 (예: **18/20점**). 항목별 만점이 없으면 100점 만점으로 환산.',
  '2. **항목별 점수**: 루브릭 항목마다 **항목명: 획득/만점** 형식 불릿.',
  '3. **전체 평**: 2~3문장 요약.',
  '4. **잘한 점**: 2~4개 불릿.',
  '5. **부족한 점·감점 사유**: 2~4개 불릿.',
  '6. **다음 학습 팁**: 2~3문장.',
  '루브릭에 없는 항목은 임의로 만들지 말 것.',
].join('\n');

function detectsScoringRubric(body) {
  const text = [
    body.problemDescription,
    body.modelAnswerText,
    ...(Array.isArray(body.modelAnswerNonImageNotes) ? body.modelAnswerNonImageNotes : []),
  ]
    .filter((v) => typeof v === 'string' && v.trim())
    .join('\n');
  return /루브릭|rubric|배점|채점\s*기준|평가\s*기준|총\s*점|만점|\d+\s*점\s*[\)\]】]|항목\s*별\s*점|점수\s*배|평가\s*표|기준\s*표|(\d+)\s*\/\s*(\d+)\s*점/i.test(text);
}

function buildSystemPrompt(body) {
  const scoring = detectsScoringRubric(body);
  return [BASE_SYSTEM_PROMPT, '', scoring ? SCORING_FORMAT : VERBAL_FORMAT].join('\n');
}

function buildScenarioText(body) {
  const lines = [
    '다음 정보를 바탕으로 한국어로 피드백해 주세요.',
    '',
    `[문제 제목]`,
    body.problemTitle || '(없음)',
    '',
    `[문제 안내·지시]`,
    body.problemDescription || '(없음)',
    '',
    `[교사 제공 모범답안·해설 텍스트]`,
    typeof body.modelAnswerText === 'string' && body.modelAnswerText.trim()
      ? body.modelAnswerText.trim()
      : '(텍스트로 제공된 모범답안 없음)',
    '',
  ];

  if (Array.isArray(body.modelAnswerNonImageNotes) && body.modelAnswerNonImageNotes.length > 0) {
    lines.push('[PPT·PDF 등 직접 해석 불가 참고 목록만 전달됨]');
    lines.push(...body.modelAnswerNonImageNotes);
    lines.push('학생에게는 해당 자료 존재를 언급하고, 피백은 풀이 이미지 중심으로 해 주세요.');
    lines.push('');
  }

  return lines.join('\n');
}

function buildOpenAiUserContent(body) {
  const parts = [];
  parts.push({ type: 'text', text: buildScenarioText(body) });

  const modelUrls = Array.isArray(body.modelAnswerImageUrls) ? body.modelAnswerImageUrls : [];
  modelUrls.slice(0, 6).forEach((url) => {
    if (typeof url === 'string' && url.startsWith('http')) {
      parts.push({
        type: 'text',
        text: '[아래 이미지는 교사가 제공한 모범답안 또는 참고 이미지입니다.]',
      });
      parts.push({
        type: 'image_url',
        image_url: { url },
      });
    }
  });

  parts.push({
    type: 'text',
    text: '[아래 이미지는 학생이 제출한 풀이(칠판 필기 또는 풀이 사진)입니다. 이 이미지를 중심으로 분석합니다.]',
  });
  parts.push({
    type: 'image_url',
    image_url: { url: body.studentImageUrl },
  });

  return parts;
}

/** 이미지 URL을 받아 Gemini inlineData 부분 객체로 만듦 */
async function fetchUrlAsGeminiInlineImage(url, labelContext) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) {
    throw new Error(`${labelContext}: 이미지 URL 응답 실패 (${r.status})`);
  }
  let mimeType = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const allowed =
    mimeType.startsWith('image/')
    || mimeType === 'application/octet-stream';
  if (!allowed) mimeType = 'image/png';

  const buf = Buffer.from(await r.arrayBuffer());
  const maxBytes = 16 * 1024 * 1024;
  if (buf.length > maxBytes) {
    throw new Error(`${labelContext}: 이미지가 너무 큽니다 (${Math.round(buf.length / 1024)}KB). 더 작은 이미지로 제출해 주세요.`);
  }
  return {
    inlineData: {
      mimeType,
      data: buf.toString('base64'),
    },
  };
}

/** Gemini API 원문 오류 → 사용자 안내(한도·과금 등) */
function humanizeGeminiError(message, httpStatus) {
  const m = String(message || '');

  /** 서버(Vercel)에서 호출 시 흔함: 키의 "애플리케이션 제한"이 HTTP 리퍼러 등으로만 열려 있을 때 */
  if (
    /API_KEY_HTTP_REFERRER_BLOCKED/i.test(m)
    || (/generativelanguage\.googleapis\.com/i.test(m) && /\bare blocked\b|blocked/i.test(m))
    || (/requests to this api/i.test(m) && /generatecontent/i.test(m) && /block/i.test(m))
  ) {
    return [
      'Google이 이 API 키로 보낸 Gemini 요청을 차단했습니다. (키의 "제한" 때문에 서버 호출이 거부되는 경우가 많습니다.)',
      '',
      '이 앱의 피드백은 **브라우저가 아니라 Vercel 서버**에서 Gemini로 요청합니다.',
      '',
      '조치:',
      '1) Google Cloud 콘솔 → APIs 및 서비스 → 사용자 인증 정보 → 사용 중인 API 키 열기',
      '2) 「애플리케이션 제한」을 **없음**으로 두거나, **서버용으로 새 키**를 만드세요.',
      '   (키를 "HTTP 리퍼러(웹)"만 허용하면 웹사이트 안에서만 동작하고, **서버에서는 막힙니다**.)',
      '3) 「API 제한」에서 **Generative Language API**가 포함·허용돼 있는지 확인합니다.',
      '4) 키를 수정·교체한 뒤 Vercel 환경 변수 `GEMINI_API_KEY`에 반영하고 재배포합니다.',
      '',
      '--- 원본 ---',
      m.slice(0, 600),
    ].join('\n');
  }

  // API가 프로젝트에서 아직 활성화되지 않음 (자주 403 / SERVICE_DISABLED)
  if (
    /has not been used in project|it is disabled|Enable it by visiting|SERVICE_DISABLED|generativelanguage\.googleapis\.com\/overview/i.test(
      m,
    )
  ) {
    const linkMatch = m.match(/https:\/\/console\.developers\.google\.com[^\s"'<>]+/);
    const enableLink =
      linkMatch && linkMatch[0]
        ? linkMatch[0]
        : 'https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com';
    return [
      '이 API 키가 연결된 Google Cloud 프로젝트에서 「Generative Language API」(Gemini)가 아직 사용 설정되어 있지 않습니다.',
      '',
      '해결 순서:',
      '1) 아래 링크로 들어가기 (오류 메시지에 붙어 있던 주소와 동일한 경우가 많아요)',
      '2) 「사용」/ Enable 버튼으로 API 활성화',
      '3) 방금 켰다면 2~5분 기다린 뒤 피드백 다시 시도',
      '',
      'AI Studio에서 키만 발급했어도, 해당 GCP 프로젝트에서 이 API를 한 번 켜 줘야 합니다.',
      '',
      enableLink,
      '',
      '--- 원본 ---',
      m.slice(0, 600),
    ].join('\n');
  }

  if (/no longer available to new users|update your code to use a newer model/i.test(m)) {
    return [
      '이 Gemini 모델은 Google이 신규 API 키·프로젝트에서는 더 이상 열어 두지 않는 경우가 많습니다.',
      '(오류 원문에 따라 `gemini-2.0-flash` 같은 이름으로 호출했을 때 자주 발생합니다.)',
      '',
      '조치:',
      '1) Vercel(또는 서버) 환경 변수 **`GEMINI_MODEL=gemini-2.5-flash`** 로 설정한 뒤 재배포합니다.',
      '2) 그래도 실패하면 AI Studio 또는 `GET …/v1beta/models?key=…`로 키에 허용된 모델 ID를 확인해 같은 변수에 넣습니다.',
      '',
      '--- 원본 ---',
      m.slice(0, 800),
    ].join('\n');
  }

  const is404Model =
    /not found for API version|is not supported for generateContent|models\/[^\s]+\s+is\s+not\s+found|\b404\b.*models\//i.test(
      m,
    );

  if (is404Model) {
    const modelHint =
      process.env.GEMINI_MODEL
      || process.env.PROBLEM_FEEDBACK_GEMINI_MODEL
      || 'gemini-2.5-flash';
    return [
      '지금 선택된 Gemini 모델이 이 API 버전에서 찾히지 않거나 `generateContent`를 지원하지 않습니다.',
      '(신규 API 키·프로젝트에서는 일부 예전 모델명이 목록에서 빠져 있는 경우가 많습니다.)',
      '',
      '조치:',
      '1) Vercel 등 서버 환경 변수 **`GEMINI_MODEL`** 을 아래처럼 최신 모델로 바꾼 뒤 재배포합니다.',
      '   예: **`gemini-2.5-flash`**, 또는 AI Studio / `GET …/v1beta/models` 목록에 나온 모델 ID',
      '',
      `2) 현재 서버 기본값(미설정 시): \`${modelHint}\``,
      '',
      '3) 호출 가능한 모델 목록 확인 (브라우저나 터미널에서, 키는 노출 금지):',
      '`GET https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY`',
      '',
      '--- 원본 ---',
      m.slice(0, 800),
    ].join('\n');
  }

  const is429 = httpStatus === 429;
  const looksQuota =
    is429 || /quota|exceeded|Resource exhausted|rate limit|free_tier|billing/i.test(m);
  if (!looksQuota) return m;

  return [
    'Google Gemini 사용 한도에 걸렸습니다. (무료 등급: 분·일 요청 수·입력 토큰 제한)',
    '',
    '가능한 조치:',
    '· 잠시 후(약 1분) 다시 눌러 보기 — 분당 제한이면 곧 풀립니다.',
    '· Google AI Studio / Cloud에서 같은 키의 사용량·할당량 확인',
    '· 무료 한도가 부족하면 Cloud 프로젝트에 결제(청구)를 연결하면 상한이 달라질 수 있음',
    '· Vercel에 GEMINI_MODEL=gemini-2.5-flash 등 **현재 키에 열린 모델**을 넣어 보기',
    '· OpenAI 키가 있다면 PROBLEM_FEEDBACK_PROVIDER=openai 로 전환',
    '',
    '--- 원본 ---',
    m.slice(0, 600),
  ].join('\n');
}

async function generateWithGemini(body, geminiKey) {
  const model =
    process.env.GEMINI_MODEL
    || process.env.PROBLEM_FEEDBACK_GEMINI_MODEL
    || 'gemini-2.5-flash';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;

  const parts = [{ text: buildScenarioText(body) }];

  const modelUrls = Array.isArray(body.modelAnswerImageUrls) ? body.modelAnswerImageUrls : [];
  for (const imgUrl of modelUrls.slice(0, 6)) {
    if (typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
      parts.push({ text: '[참고: 교사가 제공한 모범답안·참고 이미지]' });
      parts.push(await fetchUrlAsGeminiInlineImage(imgUrl, '모범답안 이미지'));
    }
  }

  parts.push({ text: '[참고: 학생 제출 풀이 이미지 — 이 이미지를 중심으로 분석합니다.]' });
  parts.push(await fetchUrlAsGeminiInlineImage(body.studentImageUrl, '학생 풀이'));

  const payload = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(body) }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 4096,
    },
  };

  const apiRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await apiRes.json();

  if (!apiRes.ok) {
    const raw =
      typeof json?.error?.message === 'string'
        ? json.error.message
        : typeof json?.error === 'string'
          ? json.error
          : `Gemini 요청 오류 (${apiRes.status})`;
    throw new Error(humanizeGeminiError(raw, apiRes.status));
  }

  const cand = json?.candidates?.[0];
  if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'BLOCKLIST') {
    throw new Error('안전 필터로 응답이 차단되었습니다. 이미지·문구를 조정 후 다시 시도해 보세요.');
  }

  const text =
    (cand?.content?.parts || [])
      .filter((p) => typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
      .trim() || '';

  if (!text) {
    throw new Error('Gemini가 빈 응답을 반환했습니다.');
  }
  return text;
}

async function generateWithOpenAI(body, openaiKey) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(body) },
    { role: 'user', content: buildOpenAiUserContent(body) },
  ];

  const r = await fetch(OPENAI_CHAT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.PROBLEM_FEEDBACK_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0.5,
      max_tokens: 2800,
    }),
  });

  const json = await r.json();

  if (!r.ok) {
    const apiErr =
      typeof json?.error?.message === 'string' ? json.error.message : `OpenAI 요청 오류 (${r.status})`;
    throw new Error(apiErr);
  }

  const text = json?.choices?.[0]?.message?.content?.trim?.() || '';
  if (!text) throw new Error('AI가 빈 응답을 반환했습니다.');
  return text;
}

function pickProvider(geminiKey, openaiKey) {
  const pref = String(process.env.PROBLEM_FEEDBACK_PROVIDER || '').trim().toLowerCase();
  if (pref === 'gemini') return geminiKey ? 'gemini' : null;
  if (pref === 'openai') return openaiKey ? 'openai' : null;
  if (geminiKey && openaiKey) return process.env.PROBLEM_FEEDBACK_PREFER_OPENAI === 'true' ? 'openai' : 'gemini';
  if (geminiKey) return 'gemini';
  if (openaiKey) return 'openai';
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();

  const prefRaw = String(process.env.PROBLEM_FEEDBACK_PROVIDER || '').trim().toLowerCase();
  if (prefRaw === 'gemini' && !geminiKey) {
    return res.status(503).json({
      error:
        'PROBLEM_FEEDBACK_PROVIDER가 gemini로 설정되어 있으나 GEMINI_API_KEY가 없습니다. Google AI Studio에서 키를 발급해 Vercel에 등록해 주세요.',
    });
  }
  if (prefRaw === 'openai' && !openaiKey) {
    return res.status(503).json({
      error:
        'PROBLEM_FEEDBACK_PROVIDER=openai로 설정되어 있으나 OPENAI_API_KEY가 없습니다.',
    });
  }

  const provider = pickProvider(geminiKey, openaiKey);

  if (!provider) {
    return res.status(503).json({
      error:
        'AI 피드백 서버에 API 키가 없습니다. Vercel 환경 변수에 GEMINI_API_KEY 또는 OPENAI_API_KEY 중 하나 이상을 설정해 주세요. (선택: PROBLEM_FEEDBACK_PROVIDER=gemini|openai)',
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  } catch {
    return res.status(400).json({ error: 'JSON 본문을 읽을 수 없습니다.' });
  }

  const studentUrl =
    typeof body.studentImageUrl === 'string' && body.studentImageUrl.startsWith('http')
      ? body.studentImageUrl
      : null;
  if (!studentUrl) {
    return res.status(400).json({ error: '학생 풀이 이미지 URL(studentImageUrl)이 필요합니다.' });
  }

  try {
    const feedback =
      provider === 'gemini'
        ? await generateWithGemini(body, geminiKey)
        : await generateWithOpenAI(body, openaiKey);
    return res.status(200).json({ feedback });
  } catch (e) {
    console.error('[problem-feedback]', provider, e);
    const msg =
      typeof e?.message === 'string' ? e.message : '서버에서 피드백 처리 중 오류가 났습니다.';
    if (provider === 'gemini' && msg.includes('이미지')) {
      return res.status(502).json({ error: msg });
    }
    return res.status(502).json({ error: msg });
  }
}
