import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const projectId = process.argv[2] || 'genieclass-296aa';
const databaseId = '(default)';
const version = 'sha256-v1';
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

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
  throw new Error('gcloud CLI를 찾을 수 없습니다.');
}

function fieldString(doc, name) {
  return doc?.fields?.[name]?.stringValue ?? '';
}

function hashPassword(password, salt) {
  return createHash('sha256').update(`${salt}:${password}`, 'utf8').digest('base64');
}

async function firestoreFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function listStudents() {
  const docs = [];
  let pageToken = '';
  do {
    const url = new URL(`${baseUrl}/students`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await firestoreFetch(url);
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function patchStudent(doc, fields, deletePassword = true) {
  const url = new URL(`https://firestore.googleapis.com/v1/${doc.name}`);
  for (const key of Object.keys(fields)) {
    url.searchParams.append('updateMask.fieldPaths', key);
  }
  if (deletePassword) {
    url.searchParams.append('updateMask.fieldPaths', 'password');
  }
  await firestoreFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

async function main() {
  const docs = await listStudents();
  let migrated = 0;
  let cleaned = 0;
  let skipped = 0;

  for (const doc of docs) {
    const password = fieldString(doc, 'password');
    const hasHash = !!fieldString(doc, 'passwordHash');
    const now = new Date().toISOString();

    if (password) {
      const salt = randomBytes(16).toString('base64');
      await patchStudent(doc, {
        passwordHash: { stringValue: hashPassword(password, salt) },
        passwordSalt: { stringValue: salt },
        passwordVersion: { stringValue: version },
        passwordUpdatedAt: { stringValue: now },
        updatedAt: { stringValue: now },
      });
      migrated += 1;
    } else if (doc.fields?.password && hasHash) {
      await patchStudent(doc, {
        updatedAt: { stringValue: now },
      });
      cleaned += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(`students=${docs.length} migrated=${migrated} cleaned=${cleaned} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
