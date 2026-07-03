/**
 * 크로스클래스 발표 공유 진단 (gcloud auth login 필요)
 * 사용: node scripts/diagnose-cross-class-shares.mjs "연습"
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
  if (f.arrayValue?.values) {
    return f.arrayValue.values.map((v) => v.stringValue || '').filter(Boolean);
  }
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

async function main() {
  const classes = await listCollection('classes');
  const matched = classes.filter((c) => String(field(c, 'name')).includes(classNameQuery));
  if (!matched.length) {
    console.log('반을 찾지 못했습니다:', classNameQuery);
    return;
  }

  const links = await listCollection('presentation_share_links');
  const presentations = await listCollection('presentations');

  for (const cls of matched) {
    const classId = docId(cls.name);
    console.log('\n===', field(cls, 'name'), `(${classId}) ===`);

    const classLinks = links.filter((l) => field(l, 'targetClassId') === classId);
    console.log('presentation_share_links (target):', classLinks.length);
    for (const l of classLinks) {
      console.log(
        `  link → pres:${field(l, 'presentationId')} student:${field(l, 'studentName') || field(l, 'studentId')} title:${field(l, 'title')}`,
      );
    }

    const legacy = presentations.filter((p) => {
      const ids = field(p, 'sharedClassIds', []);
      return Array.isArray(ids) && ids.includes(classId) && field(p, 'shared') === true;
    });
    console.log('presentations.sharedClassIds (legacy):', legacy.length);
    for (const p of legacy) {
      console.log(
        `  ${field(p, 'studentName') || field(p, 'studentId')} | class:${field(p, 'classId')} | type:${field(p, 'type') || '-'} | title:${field(p, 'title')}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
