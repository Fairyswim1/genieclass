import { initializeApp } from 'firebase/app';
import {
    getAuth,
    GoogleAuthProvider,
    setPersistence,
    indexedDBLocalPersistence,
    browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/** WebView/브라우저에서 새로고침·앱 재실행 후에도 로그인 유지(local). 실패 시 memory 제외 브라우저 로컬로 폴백 */
export async function ensureFirebaseAuthPersistence() {
    try {
        await setPersistence(auth, indexedDBLocalPersistence);
    } catch {
        try {
            await setPersistence(auth, browserLocalPersistence);
        } catch (e) {
            console.warn('[firebase] auth persistence 설정 실패:', e);
        }
    }
}
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
