import { google } from 'googleapis';
import admin from 'firebase-admin';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { studentName, assignmentTitle, files, driveFolderId } = req.body;

  if (!driveFolderId || !files || files.length === 0) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // 1. Google Drive Auth
    const googleAuth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    const drive = google.drive({ version: 'v3', auth: googleAuth });

    const bucket = admin.storage().bucket();
    const results = [];

    for (const fileInfo of files) {
      console.log(`[Sync] Processing file: ${fileInfo.name}`);
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

        // 3. Upload to Google Drive
        const driveResponse = await drive.files.create({
          requestBody: {
            name: `[${studentName}]_${assignmentTitle}_${fileInfo.name}`,
            parents: [driveFolderId]
          },
          media: {
            body: buffer
          }
        });

        console.log(`[Sync] Uploaded to Drive: ${driveResponse.data.id}`);
        results.push({ name: fileInfo.name, driveFileId: driveResponse.data.id });
      } catch (fileErr) {
        console.error(`[Sync] Error for ${fileInfo.name}:`, fileErr);
        results.push({ name: fileInfo.name, error: fileErr.message });
      }
    }

    return res.status(200).json({ status: 'success', results });
  } catch (err) {
    console.error('Global Sync Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
