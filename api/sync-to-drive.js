import { google } from 'googleapis';
import admin from 'firebase-admin';
import { Readable } from 'stream';

// Initialize Firebase Admin (Singleton)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET
    });
  } catch (err) {
    console.error('Firebase Admin Init Error:', err);
  }
}

// MIME 타입 추정
function guessMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const map = {
    pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'text/javascript',
    zip: 'application/zip', mp4: 'video/mp4', mp3: 'audio/mpeg', webm: 'video/webm',
  };
  return map[ext] || 'application/octet-stream';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { studentName, assignmentTitle, files, driveFolderId } = req.body;
  console.log('[Sync] Request received:', { studentName, assignmentTitle, fileCount: files?.length, driveFolderId });

  if (!driveFolderId || !files || files.length === 0) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // 1. Google Drive Auth
    const googleCredentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    console.log('[Sync] Google Service Account:', googleCredentials.client_email);

    const googleAuth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth: googleAuth });

    const bucket = admin.storage().bucket();
    console.log('[Sync] Firebase bucket:', bucket.name);
    const results = [];

    for (const fileInfo of files) {
      console.log(`[Sync] Processing file: ${fileInfo.name} (id: ${fileInfo.id})`);
      try {
        // 2. Download from Firebase Storage
        const fileName = `files/${fileInfo.id}_${fileInfo.name}`;
        const file = bucket.file(fileName);
        
        const [exists] = await file.exists();
        if (!exists) {
          throw new Error(`File not found in Storage: ${fileName}`);
        }

        const [buffer] = await file.download();
        console.log(`[Sync] Downloaded ${fileInfo.name} (${buffer.length} bytes)`);

        // 3. Buffer → Stream 변환 후 Google Drive 업로드
        const mimeType = guessMimeType(fileInfo.name);
        const stream = Readable.from(buffer);

        const driveResponse = await drive.files.create({
          requestBody: {
            name: `[${studentName}]_${assignmentTitle}_${fileInfo.name}`,
            parents: [driveFolderId]
          },
          media: {
            mimeType: mimeType,
            body: stream
          },
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        });

        console.log(`[Sync] Uploaded to Drive: ${driveResponse.data.id}`);
        results.push({ name: fileInfo.name, driveFileId: driveResponse.data.id });
      } catch (fileErr) {
        let errorMsg = fileErr.message;
        if (errorMsg.includes('storage quota')) {
          errorMsg = '구글 드라이브 용량 부족 (공유 드라이브 사용 권장)';
        }
        console.error(`[Sync] Error for ${fileInfo.name}:`, fileErr.message, fileErr.stack);
        results.push({ name: fileInfo.name, error: errorMsg });
      }
    }

    return res.status(200).json({ status: 'success', results });
  } catch (err) {
    console.error('[Sync] Global Error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}
