/**
 * Firestore 한 문제 풀이 진단 (교사 gcloud 로그인 필요)
 * 사용: node scripts/diagnose-problem-solutions.mjs "수학세미나B"
 */
import { execFileSync } from 'node:child_process';

const projectId = process.argv[3] || 'genieclass-296aa';
const classNameQuery = (process.argv[2] || '').trim();
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

function accessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) {
    return process.env.GOOGLE_OAUTH_ACCESS_TOKEN.trim();
  }
  for (const bin of ['gcloud', 'gcloud.cmd']) {
    try {
      return execFileSync(bin, ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }
  throw new Error('gcloud auth login 후 다시 실행하세요.');
}

async function firestoreFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

function field(doc, name, fallback = '') {
  const f = doc?.fields?.[name];
  if (!f) return fallback;
  if (f.stringValue != null) return f.stringValue;
  if (f.booleanValue != null) return f.booleanValue;
  return fallback;
}

function docId(path) {
  return path?.split('/').pop() || '';
}

async function listCollection(name) {
  const docs = [];
  let pageToken = '';
  do {
    const url = new URL(`${baseUrl}/${name}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await firestoreFetch(url);
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

function isProblemSolution(fields) {
  if (field(fields, 'type') === 'observation') return false;
  if (field(fields, 'type') === 'problem_solution') return true;
  const src = field(fields, 'solutionSource');
  if (src === 'photo' || src === 'whiteboard') return true;
  return String(field(fields, 'problemPromptId')).trim() !== '';
}

async function main() {
  const classes = await listCollection('classes');
  const matched = classes.filter((c) =>
    String(field(c, 'name')).includes(classNameQuery));
  if (!matched.length) {
    console.log('반을 찾지 못했습니다:', classNameQuery);
    return;
  }
  for (const cls of matched) {
    const classId = docId(cls.name);
    console.log('\n===', field(cls, 'name'), `(${classId}) ===`);
    const prompts = (await listCollection('problem_prompts')).filter(
      (p) => field(p, 'classId') === classId,
    );
    console.log('출제 문제:', prompts.length);
    for (const p of prompts) {
      const bodyId = field(p, 'id');
      console.log(`  - doc:${docId(p.name)} body.id:${bodyId} title:${field(p, 'title')}`);
    }
    const pres = (await listCollection('presentations')).filter(
      (p) => field(p, 'classId') === classId,
    );
    const solutions = pres.filter((p) => isProblemSolution(p.fields));
    console.log('한 문제 풀이 후보:', solutions.length, '/ 전체 발표:', pres.length);
    const promptIds = new Set(
      prompts.flatMap((p) => [docId(p.name), field(p, 'id')].filter(Boolean)),
    );
    for (const s of solutions) {
      const pid = field(s, 'problemPromptId');
      const linked = pid && promptIds.has(pid);
      console.log(
        `  ${field(s, 'studentName') || field(s, 'studentId')} | type:${field(s, 'type') || '-'} | promptId:${pid || '-'} | linked:${linked} | title:${field(s, 'title')}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
