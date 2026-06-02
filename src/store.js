// ========================================
// Genie Class - Firebase Data Store
// ========================================
import {
    signInWithPopup,
    signInWithCredential,
    GoogleAuthProvider,
    signOut,
    signInAnonymously,
    onAuthStateChanged
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    deleteDoc,
    updateDoc,
    deleteField,
    increment,
    serverTimestamp,
    orderBy,
    onSnapshot
} from 'firebase/firestore';
import { auth, db, storage, googleProvider } from './firebase.js';
import { deriveCharacterLevelFromPoints } from './components/characterAvatar.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const COLLECTIONS = {
    TEACHERS: 'teachers',
    CLASSES: 'classes',
    STUDENTS: 'students',
    ASSIGNMENTS: 'assignments',
    ANNOUNCEMENTS: 'announcements',
    PRESENTATIONS: 'presentations',
    SUBMISSIONS: 'submissions',
    RESOURCES: 'resources',
    QUIZZES: 'quizzes',
    QUIZ_SUBMISSIONS: 'quiz_submissions',
    STUDENT_SELF_RECORDS: 'student_self_records',
    STUDENT_NOTES: 'student_notes',
    FILES: 'files',
    PROBLEM_PROMPTS: 'problem_prompts',
};

// Internal state
let _currentUser = null;

onAuthStateChanged(auth, (user) => {
    _currentUser = user;
});

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function generateStudentCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function currentAuthUid() {
    return auth.currentUser?.uid || null;
}

const STUDENT_PASSWORD_HASH_VERSION = 'sha256-v1';

function randomPasswordSalt() {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes));
}

async function sha256Base64(input) {
    const data = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function createStudentPasswordCredential(password, salt = randomPasswordSalt()) {
    const raw = String(password || '');
    if (!raw) {
        throw new Error('비밀번호가 비었습니다.');
    }
    return {
        passwordHash: await sha256Base64(`${salt}:${raw}`),
        passwordSalt: salt,
        passwordVersion: STUDENT_PASSWORD_HASH_VERSION,
        passwordUpdatedAt: new Date().toISOString(),
    };
}

async function verifyStudentPassword(student, password) {
    if (!student) return false;
    if (student.passwordHash && student.passwordSalt) {
        const credential = await createStudentPasswordCredential(password, student.passwordSalt);
        return credential.passwordHash === student.passwordHash;
    }
    return String(student.password || '') === String(password || '');
}

function sanitizeStudentForSession(student) {
    if (!student) return student;
    const { password, ...safeStudent } = student;
    return safeStudent;
}

// ========== Teacher Auth ==========

const NATIVE_GOOGLE_WEB_CLIENT_ID =
    '469620615366-2ibdumut7vci9v3ir8tv48cfjirr52j3.apps.googleusercontent.com';

async function initializeNativeGoogleAuth() {
    await GoogleAuth.initialize({
        clientId: NATIVE_GOOGLE_WEB_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
    });
}

async function ensureTeacherProfileInFirestore(user) {
    const teacherDoc = await getDoc(doc(db, COLLECTIONS.TEACHERS, user.uid));
    if (!teacherDoc.exists()) {
        await setDoc(doc(db, COLLECTIONS.TEACHERS, user.uid), {
            id: user.uid,
            name: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            createdAt: serverTimestamp(),
        });
    }
}

/**
 * Capacitor: 앱 재실행 시 Firebase 사용자가 비어 있어도 기기의 Google 세션이 남아 있으면
 * GoogleAuth.refresh()로 idToken만 받아 다시 로그인한다(UI 없음).
 */
export async function trySilentNativeTeacherGoogleRestore() {
    if (!Capacitor.isNativePlatform()) return;
    if (import.meta.env.VITE_APP_SHELL === 'student') return;
    if (auth.currentUser && !auth.currentUser.isAnonymous) return;

    try {
        await initializeNativeGoogleAuth();
        const authParts = await GoogleAuth.refresh();
        if (!authParts?.idToken) return;
        const credential = GoogleAuthProvider.credential(authParts.idToken);
        const result = await signInWithCredential(auth, credential);
        await ensureTeacherProfileInFirestore(result.user);
    } catch (e) {
        console.warn('[teacher] 무음 구글 복구 생략:', e?.message ?? e);
    }
}

export async function loginWithGoogle() {
    try {
        let user;
        if (Capacitor.isNativePlatform()) {
            await initializeNativeGoogleAuth();
            const googleUser = await GoogleAuth.signIn();
            const credential = GoogleAuthProvider.credential(
                googleUser.authentication.idToken
            );
            const result = await signInWithCredential(auth, credential);
            user = result.user;
        } else {
            const result = await signInWithPopup(auth, googleProvider);
            user = result.user;
        }

        await ensureTeacherProfileInFirestore(user);
        return { data: user };
    } catch (error) {
        console.error('Login error:', error);
        return { error: '구글 로그인 중 오류가 발생했습니다: ' + error.message };
    }
}

/** 교사 화면용: Google 등 실계정만. 학생용 익명 로그인(auth.currentUser.isAnonymous)은 교사로 취급하지 않음 */
export function getCurrentTeacher() {
    const u = auth.currentUser;
    if (!u || u.isAnonymous) return null;
    return u;
}

export async function logoutTeacher() {
    await signOut(auth);
}

// ========== Student Auth (Local Session) ==========
export function getCurrentStudent() {
    const data = localStorage.getItem('genie_current_student');
    return data ? JSON.parse(data) : null;
}

/**
 * 학생은 Google 로그인 없이 localStorage만 쓰므로, Firestore/Storage 규칙이 auth를 요구하면
 * 제출·업로드가 permission-denied로 실패한다. 익명 로그인으로 request.auth를 채운다.
 * Firebase 콘솔 → Authentication → Sign-in method → 익명(Anonymous) 사용 설정 필요.
 */
export async function ensureStudentFirestoreAuth() {
    const u = auth.currentUser;
    if (u?.isAnonymous) return;
    // 학생 화면은 Firestore 규칙에서 anonymous 인증을 학생 세션으로 취급한다.
    // 같은 브라우저에 교사 Google 세션이 남아 있으면 학생 로그인 조회가 거부되므로 전환한다.
    if (u) await signOut(auth);

    await signInAnonymously(auth);
}

export async function logoutStudent() {
    localStorage.removeItem('genie_current_student');
    try {
        if (auth.currentUser?.isAnonymous) {
            await signOut(auth);
        }
    } catch (e) {
        console.warn('[logoutStudent] signOut:', e);
    }
}

// ========== Class ==========
export async function createClass(name, teacherId) {
    const classId = generateId();
    const cls = {
        id: classId,
        name,
        teacherId,
        createdAt: new Date().toISOString(),
        color: getRandomColor(),
        order: Date.now(), // Default order based on timestamp
    };
    await setDoc(doc(db, COLLECTIONS.CLASSES, classId), cls);
    return cls;
}

export async function getClassesByTeacher(teacherId) {
    const q = query(
        collection(db, COLLECTIONS.CLASSES), 
        where('teacherId', '==', teacherId)
    );
    const snapshot = await getDocs(q);
    const classes = snapshot.docs.map(doc => doc.data());
    
    // Sort in JS to handle classes missing the 'order' field
    return classes.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
        const orderB = b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
        
        if (orderA !== orderB) return orderA - orderB;
        // Fallback to createdAt if order is same or missing
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
}

export async function updateClassColor(classId, color) {
    const ref = doc(db, COLLECTIONS.CLASSES, classId);
    await updateDoc(ref, { color });
}

export async function updateClassOrder(classOrders) {
    // classOrders: Array of { id, order }
    const batch = classOrders.map(item => {
        const ref = doc(db, COLLECTIONS.CLASSES, item.id);
        return updateDoc(ref, { order: item.order });
    });
    await Promise.all(batch);
}

export async function getClassById(classId) {
    if (!classId) return null;
    const docSnap = await getDoc(doc(db, COLLECTIONS.CLASSES, classId));
    return docSnap.exists() ? docSnap.data() : null;
}

export async function deleteClass(classId) {
    await deleteDoc(doc(db, COLLECTIONS.CLASSES, classId));
}

// ========== Student ==========
export async function addStudent(name, classId, number = '') {
    const studentId = generateId();
    const student = {
        id: studentId,
        name,
        number, // Optional student number
        classId,
        uniqueCode: generateStudentCode(),
        loginId: '',   // Initial: empty
        password: '',  // Initial: empty
        characterLevel: 1,
        characterType: 'apple', // Default
        praiseCount: 0,
        totalPoints: 0,
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.STUDENTS, studentId), student);
    return student;
}

export async function addStudentsBatch(data, classId) {
    const batch = data.map(item => {
        // Handle both simple names and { name, number } objects
        const name = typeof item === 'string' ? item.trim() : item.name.trim();
        const number = typeof item === 'object' ? (item.number || '') : '';
        return addStudent(name, classId, number);
    });
    return Promise.all(batch);
}

export async function getStudentsByClass(classId) {
    const q = query(collection(db, COLLECTIONS.STUDENTS), where('classId', '==', classId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function getStudentById(studentId) {
    if (!studentId) return null;
    const docSnap = await getDoc(doc(db, COLLECTIONS.STUDENTS, studentId));
    return docSnap.exists() ? docSnap.data() : null;
}

/**
 * 보안 규칙 강화 이후 학생 쓰기 요청은 students/{id}.authUid == request.auth.uid 가 필요하다.
 * 오래된 세션/기기 변경으로 값이 어긋난 경우 제출 직전에 현재 UID로 정렬한다.
 */
async function ensureStudentWriteIdentity(studentId) {
    const sid = studentId != null ? String(studentId) : '';
    if (!sid) throw new Error('학생 정보가 없습니다.');
    await ensureStudentFirestoreAuth();
    let user = auth.currentUser;
    if (!user?.uid) {
        throw new Error('인증이 만료되었습니다. 다시 로그인해 주세요.');
    }
    // 공용 기기에서 교사 Google 계정이 남아있는 경우 익명 인증으로 전환한다.
    // 학생 쓰기 작업(제출·발표 등)은 반드시 익명 UID 기반이어야 한다.
    if (!user.isAnonymous) {
        await signOut(auth);
        await signInAnonymously(auth);
        user = auth.currentUser;
        if (!user?.uid) throw new Error('인증이 만료되었습니다. 다시 로그인해 주세요.');
    }
    const uid = user.uid;
    const studentDocRef = doc(db, COLLECTIONS.STUDENTS, sid);
    const snap = await getDoc(studentDocRef);
    if (!snap.exists()) {
        throw new Error('학생 정보를 찾을 수 없습니다.');
    }
    const row = snap.data();
    if (row.authUid !== uid) {
        await updateDoc(studentDocRef, {
            authUid: uid,
            updatedAt: new Date().toISOString(),
        });
    }
}

export async function getStudentByCode(code) {
    if (!code) return null;
    await ensureStudentFirestoreAuth();
    const q = query(collection(db, COLLECTIONS.STUDENTS), where('uniqueCode', '==', code.toUpperCase()));
    const snapshot = await getDocs(q);
    return !snapshot.empty ? snapshot.docs[0].data() : null;
}

export async function checkLoginIdExists(loginId) {
    if (!loginId || loginId.trim() === '') return false;
    await ensureStudentFirestoreAuth();
    const q = query(collection(db, COLLECTIONS.STUDENTS), where('loginId', '==', loginId.trim()));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        return { exists: true, name: data.name, classId: data.classId };
    }
    return { exists: false };
}

export async function setupStudentAuth(studentId, loginId, password) {
    await ensureStudentFirestoreAuth();
    const ref = doc(db, COLLECTIONS.STUDENTS, studentId);
    const credential = await createStudentPasswordCredential(password);
    await updateDoc(ref, {
        loginId: loginId.trim(),
        password: deleteField(),
        ...credential,
        authUid: currentAuthUid(),
        updatedAt: new Date().toISOString()
    });
}

export async function resetStudentAuth(studentId) {
    const ref = doc(db, COLLECTIONS.STUDENTS, studentId);
    await updateDoc(ref, {
        loginId: '',
        password: deleteField(),
        passwordHash: deleteField(),
        passwordSalt: deleteField(),
        passwordVersion: deleteField(),
        passwordUpdatedAt: deleteField(),
        authUid: deleteField(),
        updatedAt: new Date().toISOString()
    });
}

export async function updateStudentPassword(studentId, newPassword) {
    const ref = doc(db, COLLECTIONS.STUDENTS, studentId);
    const credential = await createStudentPasswordCredential(newPassword);
    await updateDoc(ref, {
        password: deleteField(),
        ...credential,
        updatedAt: new Date().toISOString()
    });
}

export async function changeCurrentStudentPassword(studentId, currentPassword, newPassword) {
    await ensureStudentWriteIdentity(studentId);
    const ref = doc(db, COLLECTIONS.STUDENTS, studentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        throw new Error('학생 정보를 찾을 수 없습니다.');
    }
    const student = snap.data();
    const ok = await verifyStudentPassword(student, currentPassword);
    if (!ok) {
        throw new Error('현재 비밀번호가 맞지 않습니다.');
    }
    const credential = await createStudentPasswordCredential(newPassword);
    const updatedAt = new Date().toISOString();
    await updateDoc(ref, {
        password: deleteField(),
        ...credential,
        updatedAt,
    });
    const updatedStudent = sanitizeStudentForSession({
        ...student,
        ...credential,
        updatedAt,
    });
    localStorage.setItem('genie_current_student', JSON.stringify(updatedStudent));
    return updatedStudent;
}

export async function loginStudentByIdPw(loginId, password) {
    await ensureStudentFirestoreAuth();
    const q = query(collection(db, COLLECTIONS.STUDENTS),
        where('loginId', '==', loginId));
    const snapshot = await getDocs(q);
    for (const studentDoc of snapshot.docs) {
        const student = studentDoc.data();
        const ok = await verifyStudentPassword(student, password);
        if (!ok) continue;

        const uid = currentAuthUid();
        const updates = {};
        if (uid && student.authUid !== uid) updates.authUid = uid;
        if (!student.passwordHash || student.password) {
            Object.assign(updates, await createStudentPasswordCredential(password), {
                password: deleteField(),
            });
        }
        if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date().toISOString();
            await updateDoc(studentDoc.ref, updates);
            Object.assign(student, updates);
            delete student.password;
        }
        const safeStudent = sanitizeStudentForSession(student);
        localStorage.setItem('genie_current_student', JSON.stringify(safeStudent));
        return safeStudent;
    }
    return null;
}

export async function praiseStudent(studentId) {
    const studentRef = doc(db, COLLECTIONS.STUDENTS, studentId);
    const snap = await getDoc(studentRef);
    if (snap.exists()) {
        const data = snap.data();
        const newPoints = data.totalPoints + 1;
        const newLevel = deriveCharacterLevelFromPoints(newPoints);

        await updateDoc(studentRef, {
            praiseCount: increment(1),
            totalPoints: increment(1),
            characterLevel: newLevel
        });
        return { ...data, praiseCount: data.praiseCount + 1, totalPoints: newPoints, characterLevel: newLevel };
    }
    return null;
}

export async function addStudentPoints(studentId, pointsToAdd) {
    const studentRef = doc(db, COLLECTIONS.STUDENTS, studentId);
    const snap = await getDoc(studentRef);
    if (snap.exists()) {
        const data = snap.data();
        const newPoints = data.totalPoints + pointsToAdd;
        const newLevel = deriveCharacterLevelFromPoints(newPoints);

        await updateDoc(studentRef, {
            totalPoints: increment(pointsToAdd),
            characterLevel: newLevel
        });
        return { ...data, totalPoints: newPoints, characterLevel: newLevel };
    }
    return null;
}

/** 포인트 감점 (잘못 부여한 경우 취소용) — 0 미만으로 내려가지 않음 */
export async function subtractStudentPoints(studentId, pointsToRemove) {
    const studentRef = doc(db, COLLECTIONS.STUDENTS, studentId);
    const snap = await getDoc(studentRef);
    if (snap.exists()) {
        const data = snap.data();
        const newPoints = Math.max(0, (data.totalPoints ?? 0) - pointsToRemove);
        const newLevel = deriveCharacterLevelFromPoints(newPoints);
        await updateDoc(studentRef, {
            totalPoints: newPoints,
            characterLevel: newLevel
        });
        return { ...data, totalPoints: newPoints, characterLevel: newLevel };
    }
    return null;
}

export async function updateStudentCharacterType(studentId, type) {
    const ref = doc(db, COLLECTIONS.STUDENTS, studentId);
    await updateDoc(ref, { characterType: type });
    
    // Also update local storage if it's the current student
    const current = getCurrentStudent();
    if (current && current.id === studentId) {
        current.characterType = type;
        localStorage.setItem('genie_current_student', JSON.stringify(current));
    }
}

export async function deleteStudent(studentId) {
    if (!studentId) return;
    
    // 1. Delete Student Document (This frees up the loginId)
    await deleteDoc(doc(db, COLLECTIONS.STUDENTS, studentId));
    
    // 2. Cleanup related data (presentations, submissions)
    try {
        const collectionsToClean = [COLLECTIONS.PRESENTATIONS, COLLECTIONS.SUBMISSIONS, COLLECTIONS.QUIZ_SUBMISSIONS];
        for (const coll of collectionsToClean) {
            const q = query(collection(db, coll), where('studentId', '==', studentId));
            const snap = await getDocs(q);
            const deletions = snap.docs.map(d => deleteDoc(doc(db, coll, d.id)));
            await Promise.all(deletions);
        }
    } catch (err) {
        console.error('Data cleanup error during student deletion:', err);
    }
}

// ========== Presentations ==========
export async function addPresentation(studentId, classId, data) {
    await ensureStudentWriteIdentity(studentId);
    const id = generateId();
    const presentation = {
        id,
        studentId,
        classId,
        whiteboardImage: data.whiteboardImage || null,
        audioData: data.audioData || null,
        shared: false,
        feedback: '',
        authUid: currentAuthUid(),
        createdAt: new Date().toISOString(),
    };
    if (data.recordingMode) presentation.recordingMode = data.recordingMode;
    if (data.type) presentation.type = data.type;
    if (data.problemPromptId != null && data.problemPromptId !== '') {
        presentation.problemPromptId = String(data.problemPromptId);
    }
    if (data.title) presentation.title = data.title;
    if (data.studentName) presentation.studentName = data.studentName;
    if (data.solutionSource) presentation.solutionSource = data.solutionSource;
    await setDoc(doc(db, COLLECTIONS.PRESENTATIONS, id), presentation);

    return presentation;
}

function normalizePresentationDoc(docSnap) {
    const data = docSnap.data();
    return { ...data, id: data.id || docSnap.id };
}

export async function getPresentationsByStudent(studentId) {
    const q = query(collection(db, COLLECTIONS.PRESENTATIONS), where('studentId', '==', studentId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(normalizePresentationDoc);
}

export async function getPresentationsByClass(classId) {
    const q = query(collection(db, COLLECTIONS.PRESENTATIONS), where('classId', '==', classId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(normalizePresentationDoc);
}

export async function toggleSharePresentation(presentationId, title = null, additionalClassIds = []) {
    const ref = doc(db, COLLECTIONS.PRESENTATIONS, presentationId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        const data = snap.data();
        const currentShared = data.shared;
        const updates = { shared: !currentShared };
        if (!currentShared && title) {
            updates.title = title;
        }
        // 공유 켤 때 추가 클래스 저장, 끌 때 초기화
        if (!currentShared) {
            updates.sharedClassIds = additionalClassIds.length > 0 ? additionalClassIds : [];
        } else {
            updates.sharedClassIds = [];
        }
        await updateDoc(ref, updates);
        return { ...data, ...updates };
    }
    return null;
}

/** 다른 클래스에서 이 classId로 공유된 발표(크로스클래스 공유) 조회 */
export async function getSharedPresentationsByClassId(classId) {
    const q = query(
        collection(db, COLLECTIONS.PRESENTATIONS),
        where('sharedClassIds', 'array-contains', classId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(normalizePresentationDoc)
        .filter(p => p.shared === true && p.type !== 'observation');
}

/** Firestore에 배열·맵으로 저장된 첨부 목록 통일 */
function normalizeFileRefs(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
        try {
            return Object.values(raw);
        } catch (_) {
            return [];
        }
    }
    return [];
}

function normalizeModelAnswerFileRefs(raw) {
    return normalizeFileRefs(raw);
}

/** 다른 문서가 같은 fileId를 아직 참조하는지 (부모 문서 삭제 후 고아만 지울 때) */
async function countFileReferences(fileId) {
    if (fileId == null || fileId === '') return 0;
    const sid = String(fileId);
    let count = 0;

    const bumpIfHas = (refs) => {
        if (normalizeFileRefs(refs).some((f) => f?.id != null && String(f.id) === sid)) {
            count += 1;
        }
    };

    const collNames = [
        COLLECTIONS.RESOURCES,
        COLLECTIONS.ASSIGNMENTS,
        COLLECTIONS.ANNOUNCEMENTS,
        COLLECTIONS.PROBLEM_PROMPTS,
        COLLECTIONS.SUBMISSIONS,
        COLLECTIONS.STUDENT_SELF_RECORDS,
    ];
    for (const collName of collNames) {
        const snap = await getDocs(collection(db, collName));
        for (const d of snap.docs) {
            const data = d.data();
            bumpIfHas(data.files);
            if (collName === COLLECTIONS.PROBLEM_PROMPTS) {
                bumpIfHas(data.modelAnswerFiles);
            }
        }
    }

    const presSnap = await getDocs(collection(db, COLLECTIONS.PRESENTATIONS));
    for (const d of presSnap.docs) {
        const data = d.data();
        if (data.whiteboardImage?.id != null && String(data.whiteboardImage.id) === sid) count += 1;
        if (data.audioData?.id != null && String(data.audioData.id) === sid) count += 1;
    }

    const quizSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES));
    for (const d of quizSnap.docs) {
        const img = d.data().problemImage;
        if (img?.id != null && String(img.id) === sid) count += 1;
    }

    return count;
}

/** Firestore FILES + Storage 객체 삭제 */
export async function deleteStoredFile(fileLike) {
    if (!fileLike || typeof fileLike !== 'object') return false;

    const id = fileLike.id ?? fileLike.fileId;
    if (!id) return false;

    let meta = { ...fileLike, id: String(id) };
    if (!meta.storagePath || !meta.url) {
        try {
            const fetched = await getFileById(String(id));
            if (fetched) meta = { ...meta, ...fetched };
        } catch (e) {
            console.warn('[deleteStoredFile] 메타 조회 실패:', id, e);
        }
    }

    let firestoreOk = true;
    try {
        await deleteDoc(doc(db, COLLECTIONS.FILES, String(id)));
    } catch (e) {
        console.error('[deleteStoredFile] Firestore FILES 삭제 실패:', id, e);
        firestoreOk = false;
    }

    let storagePath = meta.storagePath;
    if (!storagePath && meta.name) {
        storagePath = `files/${id}_${meta.name}`;
    }
    if (storagePath) {
        try {
            await deleteObject(ref(storage, storagePath));
        } catch (e) {
            console.warn('[deleteStoredFile] Storage 삭제 실패:', storagePath, e);
        }
    }

    return firestoreOk;
}

/** 부모 문서 삭제·첨부 교체 후, 어디에서도 안 쓰는 fileId만 FILES/Storage에서 제거 */
async function deleteOrphanFilesFromRefs(fileRefs) {
    const refs = normalizeFileRefs(fileRefs);
    for (const f of refs) {
        if (f?.id == null) continue;
        try {
            const n = await countFileReferences(f.id);
            if (n === 0) {
                await deleteStoredFile(f);
            }
        } catch (e) {
            console.warn('[deleteOrphanFiles] 건너뜀:', f.id, e);
        }
    }
}

export async function deletePresentationById(presentationId) {
    if (!presentationId) return false;

    const refDoc = doc(db, COLLECTIONS.PRESENTATIONS, presentationId);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) return false;

    const data = snap.data();
    const fileRefs = [data.whiteboardImage, data.audioData].filter(Boolean);

    await deleteDoc(refDoc);
    await deleteOrphanFilesFromRefs(fileRefs);
    return true;
}

// ========== 한 문제 풀이 (선생 출제) ==========
export async function createProblemPrompt(classId, teacherId, data) {
    const id = generateId();
    const modelAnswerText = typeof data.modelAnswerText === 'string' ? data.modelAnswerText.trim() : '';
    const modelAnswerFiles = Array.isArray(data.modelAnswerFiles) ? data.modelAnswerFiles : [];
    const prompt = {
        id,
        classId,
        teacherId,
        title: data.title,
        description: data.description || '',
        files: data.files || [],
        modelAnswerText: modelAnswerText || '',
        modelAnswerFiles,
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.PROBLEM_PROMPTS, id), prompt);
    return prompt;
}

/** 모범답안 텍스트·첨부 중 하나라도 있으면 true (선택 과제 기능용) */
export function problemPromptHasModelAnswer(prompt) {
    if (!prompt) return false;
    let t = '';
    if (typeof prompt.modelAnswerText === 'string') {
        t = prompt.modelAnswerText.trim();
    } else if (prompt.modelAnswerText != null && String(prompt.modelAnswerText).trim()) {
        t = String(prompt.modelAnswerText).trim();
    }
    const files = normalizeModelAnswerFileRefs(prompt.modelAnswerFiles);
    return t.length > 0 || files.length > 0;
}

/** 문제 모범답안 참고 파일 중 이미지만 HTTP URL 목록으로 (Vision API용) */
export async function collectImageUrlsFromModelAnswerFiles(modelAnswerFiles) {
    const out = [];
    for (const ref of normalizeModelAnswerFileRefs(modelAnswerFiles)) {
        if (!ref?.id) continue;
        const meta = await getFileById(ref.id);
        const type = String(meta?.type || '');
        const name = String(meta?.name || ref.name || '');
        const img =
            /^image\/(jpeg|jpg|png|gif|webp)/i.test(type)
            || /\.(jpe?g|png|gif|webp)$/i.test(name);
        if (img && meta?.url) out.push(meta.url);
    }
    return out;
}

/** PDF 등 비이미지 모범답안 참고물 이름 목록(AI에게 문맥용) */
export async function collectNonImageModelAnswerFileNotes(modelAnswerFiles) {
    const notes = [];
    for (const ref of normalizeModelAnswerFileRefs(modelAnswerFiles)) {
        if (!ref?.id) continue;
        const meta = await getFileById(ref.id);
        const type = String(meta?.type || '');
        const name = String(meta?.name || ref.name || '');
        const img =
            /^image\/(jpeg|jpg|png|gif|webp)/i.test(type)
            || /\.(jpe?g|png|gif|webp)$/i.test(name);
        if (!img && name) notes.push(`[첨부·비이미지] ${name}`);
    }
    return notes;
}

/**
 * 모범답안 대비 학생 풀이 AI 피드백 (/api/problem-feedback 또는 VITE_FEEDBACK_API_ORIGIN)
 */
export async function fetchProblemSolutionFeedback(payload) {
    const origin =
        typeof import.meta !== 'undefined' && import.meta.env?.VITE_FEEDBACK_API_ORIGIN
            ? String(import.meta.env.VITE_FEEDBACK_API_ORIGIN).replace(/\/$/, '')
            : '';
    const url = `${origin}/api/problem-feedback`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    let data = {};
    try {
        data = await res.json();
    } catch (_) {}
    if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : `피드백 요청 실패 (${res.status})`;
        throw new Error(msg);
    }
    if (typeof data.feedback !== 'string' || !data.feedback.trim()) {
        throw new Error('피드백 결과가 비어 있습니다.');
    }
    return data.feedback.trim();
}

export async function getProblemPromptsByClass(classId) {
    if (!classId) return [];
    const q = query(collection(db, COLLECTIONS.PROBLEM_PROMPTS), where('classId', '==', classId));
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((d) => d.data())
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export async function getProblemPromptById(promptId) {
    if (!promptId) return null;
    const docSnap = await getDoc(doc(db, COLLECTIONS.PROBLEM_PROMPTS, promptId));
    return docSnap.exists() ? docSnap.data() : null;
}

export async function deleteProblemPrompt(promptId) {
    if (!promptId) return;
    const refDoc = doc(db, COLLECTIONS.PROBLEM_PROMPTS, promptId);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) return;
    const data = snap.data();
    const files = [
        ...normalizeFileRefs(data.files),
        ...normalizeFileRefs(data.modelAnswerFiles),
    ];
    await deleteDoc(refDoc);
    await deleteOrphanFilesFromRefs(files);
}

// ========== Assignments ==========
export async function createAssignment(classId, data) {
    const id = generateId();
    const assignment = {
        id,
        classId,
        title: data.title,
        description: data.description || '',
        dueDate: data.dueDate || null,
        files: data.files || [],
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.ASSIGNMENTS, id), assignment);
    return assignment;
}

export async function getAssignmentsByClass(classId) {
    const q = query(collection(db, COLLECTIONS.ASSIGNMENTS), where('classId', '==', classId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function getAssignmentById(assignmentId) {
    if (!assignmentId) return null;
    const docSnap = await getDoc(doc(db, COLLECTIONS.ASSIGNMENTS, assignmentId));
    return docSnap.exists() ? docSnap.data() : null;
}

export async function deleteAssignment(assignmentId) {
    if (!assignmentId) return;
    const refDoc = doc(db, COLLECTIONS.ASSIGNMENTS, assignmentId);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) return;
    const files = normalizeFileRefs(snap.data().files);
    await deleteDoc(refDoc);
    await deleteOrphanFilesFromRefs(files);
}

export async function updateAssignment(assignmentId, data) {
    const refDoc = doc(db, COLLECTIONS.ASSIGNMENTS, assignmentId);
    const snap = await getDoc(refDoc);
    let removedRefs = [];
    if (snap.exists() && data.files) {
        const oldFiles = normalizeFileRefs(snap.data().files);
        const newIds = new Set(
            normalizeFileRefs(data.files).map((f) => (f?.id != null ? String(f.id) : '')),
        );
        removedRefs = oldFiles.filter((f) => f?.id != null && !newIds.has(String(f.id)));
    }
    const updates = {
        title: data.title,
        description: data.description || '',
        dueDate: data.dueDate || null,
        updatedAt: new Date().toISOString(),
    };
    if (data.files) {
        updates.files = data.files;
    }
    await updateDoc(refDoc, updates);
    await deleteOrphanFilesFromRefs(removedRefs);
}

function submissionNewer(a, b) {
    const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return ta - tb;
}

// ========== Submissions ==========
export async function submitAssignment(assignmentId, studentId, data) {
    const aid = assignmentId != null ? String(assignmentId) : '';
    const sid = studentId != null ? String(studentId) : '';
    if (!aid || !sid) {
        throw new Error('과제 또는 학생 정보가 없습니다. 로그아웃 후 다시 로그인해 주세요.');
    }
    await ensureStudentWriteIdentity(sid);
    const q = query(collection(db, COLLECTIONS.SUBMISSIONS),
        where('assignmentId', '==', aid),
        where('studentId', '==', sid));
    const existing = await getDocs(q);

    let id;
    let prev = {};

    if (existing.empty) {
        id = generateId();
    } else {
        const refs = existing.docs.map((d) => ({ ref: d.ref, snap: d }));
        refs.sort((x, y) => submissionNewer(y.snap.data(), x.snap.data()));
        const keep = refs[0];
        const keepData = keep.snap.data();
        const uid = currentAuthUid();
        if (keepData.authUid && keepData.authUid === uid) {
            id = keep.snap.id;
            prev = keepData;
            for (let i = 1; i < refs.length; i++) {
                try {
                    await deleteDoc(refs[i].ref);
                } catch (e) {
                    console.warn('[submitAssignment] 중복 제출 문서 삭제 실패:', e);
                }
            }
        } else {
            // 예전 제출에는 authUid가 없어 새 보안 규칙에서 업데이트할 수 없다.
            // 새 문서를 만들어 최신 제출로 사용하고, 교사용 목록은 updatedAt 기준으로 최신만 보여준다.
            id = generateId();
        }
    }

    const submission = {
        id,
        assignmentId: aid,
        studentId: sid,
        files: 'files' in data ? data.files : (prev.files ?? []),
        textAnswer: 'textAnswer' in data ? data.textAnswer : (prev.textAnswer ?? ''),
        audioData: 'audioData' in data ? data.audioData : (prev.audioData ?? null),
        shared: 'shared' in data ? data.shared : (prev.shared ?? false),
        authUid: prev.authUid || currentAuthUid(),
        createdAt: prev.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.SUBMISSIONS, id), submission);
    return submission;
}

export async function getSubmissionsByAssignment(assignmentId) {
    if (assignmentId == null || assignmentId === '') return [];
    const aid = String(assignmentId);
    const q = query(collection(db, COLLECTIONS.SUBMISSIONS), where('assignmentId', '==', aid));
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((d) => d.data());
    const byStudent = new Map();
    for (const row of list) {
        if (row.studentId == null) continue;
        const sk = String(row.studentId);
        const cur = byStudent.get(sk);
        if (!cur || submissionNewer(row, cur) > 0) byStudent.set(sk, row);
    }
    return [...byStudent.values()];
}

export async function getSubmissionsByStudent(studentId) {
    if (studentId == null || studentId === '') return [];
    const sid = String(studentId);
    await ensureStudentWriteIdentity(sid);
    const q = query(collection(db, COLLECTIONS.SUBMISSIONS), where('studentId', '==', sid));
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((d) => d.data());
    const byAssignment = new Map();
    for (const row of list) {
        if (row.assignmentId == null) continue;
        const ak = String(row.assignmentId);
        const cur = byAssignment.get(ak);
        if (!cur || submissionNewer(row, cur) > 0) byAssignment.set(ak, row);
    }
    return [...byAssignment.values()];
}

export async function getSharedSubmissions(assignmentId) {
    const q = query(collection(db, COLLECTIONS.SUBMISSIONS),
        where('assignmentId', '==', assignmentId),
        where('shared', '==', true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

// ========== Student Self Records ==========
export async function createStudentSelfRecord(studentId, classId, data) {
    await ensureStudentWriteIdentity(studentId);
    const id = generateId();
    const record = {
        id,
        studentId,
        classId,
        title: data.title,
        content: data.content || '',
        files: data.files || [],
        authUid: currentAuthUid(),
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.STUDENT_SELF_RECORDS, id), record);
    return record;
}

export async function getStudentSelfRecords(studentId) {
    const q = query(
        collection(db, COLLECTIONS.STUDENT_SELF_RECORDS),
        where('studentId', '==', studentId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(doc => doc.data())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getStudentSelfRecordsByClass(classId) {
    const q = query(
        collection(db, COLLECTIONS.STUDENT_SELF_RECORDS),
        where('classId', '==', classId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(doc => doc.data())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ========== Student ↔ Teacher notes (쪽지) ==========
export async function createStudentNote({
    classId,
    teacherId,
    className = '',
    studentId,
    studentName,
    message,
}) {
    await ensureStudentWriteIdentity(studentId);
    const id = generateId();
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        throw new Error('쪽지 내용이 비었습니다.');
    }
    const note = {
        id,
        classId,
        teacherId,
        className,
        studentId,
        studentName,
        message: trimmed,
        direction: 'student_to_teacher',
        read: false,
        authUid: currentAuthUid(),
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.STUDENT_NOTES, id), note);
    return note;
}

export async function createTeacherNoteToStudent({
    classId,
    teacherId,
    teacherName = '',
    className = '',
    studentId,
    studentName = '',
    message,
}) {
    const id = generateId();
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        throw new Error('쪽지 내용이 비었습니다.');
    }
    const note = {
        id,
        classId,
        teacherId,
        teacherName,
        className,
        studentId,
        studentName,
        message: trimmed,
        direction: 'teacher_to_student',
        read: true,
        studentRead: false,
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.STUDENT_NOTES, id), note);
    return note;
}

export async function getStudentNotesByStudent(studentId) {
    const q = query(
        collection(db, COLLECTIONS.STUDENT_NOTES),
        where('studentId', '==', studentId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(d => d.data())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getStudentNotesForTeacher(teacherId) {
    const q = query(
        collection(db, COLLECTIONS.STUDENT_NOTES),
        where('teacherId', '==', teacherId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(d => d.data())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function markStudentNoteRead(noteId, read = true) {
    await updateDoc(doc(db, COLLECTIONS.STUDENT_NOTES, noteId), { read });
}

export async function replyToStudentNote(noteId, message) {
    const trimmed = String(message || '').trim();
    if (!noteId) {
        throw new Error('쪽지를 찾을 수 없습니다.');
    }
    if (!trimmed) {
        throw new Error('답장 내용이 비었습니다.');
    }
    await updateDoc(doc(db, COLLECTIONS.STUDENT_NOTES, noteId), {
        replyMessage: trimmed,
        repliedAt: new Date().toISOString(),
        read: true,
    });
}

export async function deleteStudentNote(noteId) {
    await deleteDoc(doc(db, COLLECTIONS.STUDENT_NOTES, noteId));
}

// ========== Announcements ==========
export async function createAnnouncement(classId, data) {
    const id = generateId();
    const announcement = {
        id,
        classId,
        title: data.title,
        content: data.content || '',
        files: data.files || [],
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.ANNOUNCEMENTS, id), announcement);
    return announcement;
}

export async function getAnnouncementsByClass(classId) {
    const q = query(collection(db, COLLECTIONS.ANNOUNCEMENTS),
        where('classId', '==', classId));
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(doc => doc.data())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function deleteAnnouncement(announcementId) {
    if (!announcementId) return;
    const refDoc = doc(db, COLLECTIONS.ANNOUNCEMENTS, announcementId);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) return;
    const files = normalizeFileRefs(snap.data().files);
    await deleteDoc(refDoc);
    await deleteOrphanFilesFromRefs(files);
}

// ========== Resources (Materials) ==========
export async function addResource(classId, data) {
    const id = generateId();
    const resource = {
        id,
        classId,
        title: data.title,
        description: data.description || '',
        files: data.files || [],
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.RESOURCES, id), resource);
    return resource;
}

export async function getResourcesByClass(classId) {
    const q = query(collection(db, COLLECTIONS.RESOURCES),
        where('classId', '==', classId));
    const snapshot = await getDocs(q);
    const list = snapshot.docs
        .map(doc => doc.data())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const enriched = await enrichItemsWithValidFiles(list);
    const withFiles = [];
    const emptyIds = [];
    for (const res of enriched) {
        if (res.files?.length > 0) {
            withFiles.push(res);
        } else if (res.id) {
            emptyIds.push(res.id);
        }
    }
    if (emptyIds.length > 0) {
        await Promise.all(
            emptyIds.map((id) =>
                deleteResource(id).catch((e) => {
                    console.warn('[getResourcesByClass] 빈 자료 제거 실패:', id, e);
                }),
            ),
        );
    }
    return withFiles;
}

export async function deleteResource(resourceId) {
    if (!resourceId) return;
    const refDoc = doc(db, COLLECTIONS.RESOURCES, resourceId);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) return;
    const files = normalizeFileRefs(snap.data().files);
    await deleteDoc(refDoc);
    await deleteOrphanFilesFromRefs(files);
}

// ========== Real-time Quiz ==========
export async function startQuiz(classId, problemImageFile, problemText = '') {
    const id = generateId();
    const quiz = {
        id,
        classId,
        problemImage: problemImageFile || null, // { id, name, url? }
        problemText,
        active: true,
        galleryRevealed: false,
        createdAt: new Date().toISOString(),
    };

    await setDoc(doc(db, COLLECTIONS.QUIZZES, id), quiz);

    // Update class with active quiz ID
    await updateDoc(doc(db, COLLECTIONS.CLASSES, classId), {
        activeQuizId: id
    });

    return quiz;
}

export async function stopQuiz(classId) {
    const cls = await getClassById(classId);
    if (cls?.activeQuizId) {
        await updateDoc(doc(db, COLLECTIONS.QUIZZES, cls.activeQuizId), { active: false });
        await updateDoc(doc(db, COLLECTIONS.CLASSES, classId), { activeQuizId: '' });
    }
}

export async function revealQuizGallery(quizId) {
    await updateDoc(doc(db, COLLECTIONS.QUIZZES, quizId), { galleryRevealed: true });
}

export async function getQuizById(quizId) {
    const snap = await getDoc(doc(db, COLLECTIONS.QUIZZES, quizId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return { ...data, id: data.id || snap.id };
}

export async function submitQuizSolution(quizId, studentId, studentName, solutionImageFile, solutionText = '') {
    await ensureStudentWriteIdentity(studentId);
    const id = generateId();
    const sub = {
        id,
        quizId,
        studentId,
        studentName,
        image: solutionImageFile || null,
        solutionText,
        shared: true,
        authUid: currentAuthUid(),
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.QUIZ_SUBMISSIONS, id), sub);
    return sub;
}

export function listenToActiveQuiz(classId, callback) {
    const QUIZ_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2시간 후 자동 만료
    let unsubQuizSnap = null;
    let currentQuizId = null;

    function stopQuizSnapshot() {
        if (unsubQuizSnap) {
            unsubQuizSnap();
            unsubQuizSnap = null;
        }
        currentQuizId = null;
    }

    const unsubClass = onSnapshot(doc(db, COLLECTIONS.CLASSES, classId), (classSnap) => {
        if (!classSnap.exists()) {
            stopQuizSnapshot();
            callback(null);
            return;
        }

        const data = classSnap.data();
        const quizId = data.activeQuizId;
        const hasQuizPointer = !!(quizId && String(quizId).trim());

        if (!hasQuizPointer) {
            stopQuizSnapshot();
            callback(null);
            return;
        }

        // 동일 활성 퀴즈 문서를 실시간 구독(이미지만 나중에 쓰이는 경우 등 getDoc 단발성으로는 놓칠 수 있음)
        if (quizId !== currentQuizId) {
            stopQuizSnapshot();
            currentQuizId = quizId;

            unsubQuizSnap = onSnapshot(doc(db, COLLECTIONS.QUIZZES, quizId), (quizSnap) => {
                if (!quizSnap.exists()) {
                    callback(null);
                    return;
                }

                const qRaw = quizSnap.data();
                const quiz = { ...qRaw, id: qRaw.id || quizSnap.id };

                if (!quiz.active) {
                    callback(null);
                    return;
                }

                const started = toDateValue(quiz.createdAt);
                const startedMs = started && !Number.isNaN(started.getTime()) ? started.getTime() : NaN;
                if (Number.isNaN(startedMs)) {
                    callback(null);
                    return;
                }

                const elapsed = Date.now() - startedMs;
                if (elapsed > QUIZ_EXPIRY_MS) {
                    console.log('[Quiz] 2시간 초과 퀴즈 자동 종료:', quiz.id);
                    void (async () => {
                        try {
                            await updateDoc(doc(db, COLLECTIONS.QUIZZES, quiz.id), { active: false });
                            await updateDoc(doc(db, COLLECTIONS.CLASSES, classId), { activeQuizId: '' });
                        } catch (e) { console.error('[Quiz] 자동 종료 실패:', e); }
                        callback(null);
                    })();
                    return;
                }

                callback(quiz);
            });
        }
    });

    return () => {
        stopQuizSnapshot();
        unsubClass();
    };
}

export function listenToQuizSubmissions(quizId, callback) {
    const q = query(collection(db, COLLECTIONS.QUIZ_SUBMISSIONS),
        where('quizId', '==', quizId));
    return onSnapshot(q, (snapshot) => {
        const subs = snapshot.docs
            .map(doc => doc.data())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        callback(subs);
    });
}

// ========== Files ==========
export async function saveFile(file) {
    const id = generateId();
    const storageRef = ref(storage, `files/${id}_${file.name}`);

    // Upload to Firebase Storage
    await uploadBytes(storageRef, file, {
        customMetadata: {
            authUid: currentAuthUid() || '',
        },
    });
    const downloadURL = await getDownloadURL(storageRef);

    // Store metadata in Firestore (without the actual file data)
    const fileMetadata = {
        id,
        name: file.name,
        type: file.type,
        size: file.size,
        url: downloadURL, // Store the public URL
        storagePath: `files/${id}_${file.name}`,
        authUid: currentAuthUid(),
        createdAt: new Date().toISOString(),
    };

    await setDoc(doc(db, COLLECTIONS.FILES, id), fileMetadata);
    return fileMetadata;
}

export async function getFileById(fileId) {
    if (!fileId) return null;
    const docSnap = await getDoc(doc(db, COLLECTIONS.FILES, fileId));
    return docSnap.exists() ? docSnap.data() : null;
}

/** FILES 컬렉션에 실제로 남아 있는 첨부만 반환 (삭제된 id는 제외) */
export async function filterExistingFileRefs(refs) {
    const list = normalizeFileRefs(refs);
    if (list.length === 0) return [];
    const checked = await Promise.all(
        list.map(async (ref) => {
            if (!ref?.id) return null;
            try {
                const meta = await getFileById(String(ref.id));
                if (!meta?.url) return null;
                return {
                    ...ref,
                    name: meta.name || ref.name || '파일',
                    url: meta.url,
                    type: meta.type || ref.type,
                };
            } catch {
                return null;
            }
        }),
    );
    return checked.filter(Boolean);
}

/** 자료·공지 등 items 배열의 files 필드를 유효한 첨부만 남기도록 보강 */
export async function enrichItemsWithValidFiles(items, filesKey = 'files') {
    if (!Array.isArray(items) || items.length === 0) return [];
    return Promise.all(
        items.map(async (item) => {
            if (!item || typeof item !== 'object') return item;
            const valid = await filterExistingFileRefs(item[filesKey]);
            return { ...item, [filesKey]: valid };
        }),
    );
}

/** 발표·풀이에 붙은 칠판 이미지 공개 URL (동기). */
export function presentationWhiteboardImageUrl(pres) {
    const w = pres?.whiteboardImage;
    if (!w || typeof w !== 'object') return '';
    const u = w.url;
    if (typeof u === 'string' && u.trim()) return u.trim();
    return '';
}

/**
 * whiteboardImage에 url이 없고 id만 있는 문서 → files 컬렉션에서 url 보강
 */
export async function enrichPresentationWithImageUrls(pres) {
    if (!pres || typeof pres !== 'object') return pres;
    if (presentationWhiteboardImageUrl(pres)) return pres;
    const w = pres.whiteboardImage;
    if (!w?.id) return pres;
    try {
        const meta = await getFileById(w.id);
        if (meta?.url) {
            return {
                ...pres,
                whiteboardImage: {
                    ...w,
                    url: meta.url,
                    name: w.name || meta.name,
                    type: w.type || meta.type,
                },
            };
        }
    } catch (e) {
        console.warn('[enrichPresentationWithImageUrls]', e);
    }
    return pres;
}

export async function enrichPresentationsWithImageUrls(presentations) {
    if (!Array.isArray(presentations) || presentations.length === 0) return presentations;
    return Promise.all(presentations.map((p) => enrichPresentationWithImageUrls(p)));
}

export async function downloadFile(fileId) {
    const file = await getFileById(fileId);
    if (!file || !file.url) return;

    // For cloud storage URLs, we can just open them in a new tab or use a link
    const link = document.createElement('a');
    link.href = file.url;
    link.target = '_blank';
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ========== Utils ==========
function getRandomColor() {
    const colors = [
        'linear-gradient(135deg, #4F46E5, #818CF8)', // Indigo
        'linear-gradient(135deg, #0D9488, #2DD4BF)', // Teal
        'linear-gradient(135deg, #7C3AED, #A78BFA)', // Violet
        'linear-gradient(135deg, #DB2777, #F472B6)', // Pink
        'linear-gradient(135deg, #2563EB, #60A5FA)', // Blue
        'linear-gradient(135deg, #059669, #34D399)', // Green
        'linear-gradient(135deg, #D97706, #FBBF24)', // Amber
        'linear-gradient(135deg, #EA580C, #FB923C)', // Orange
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

function toDateValue(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue.toDate === 'function') return dateValue.toDate();
    if (typeof dateValue.seconds === 'number') return new Date(dateValue.seconds * 1000);
    return new Date(dateValue);
}

export function formatDate(dateStr) {
    const d = toDateValue(dateStr);
    if (!d || Number.isNaN(d.getTime())) return '';
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${mins}`;
}

export function formatDateShort(dateStr) {
    const d = toDateValue(dateStr);
    if (!d || Number.isNaN(d.getTime())) return '';
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function showToast(message, type = 'success', durationMs = 3000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    const hideAfter = Math.max(800, Number(durationMs) || 3000);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, hideAfter);
}

export async function saveObservation(studentId, classId, data) {
    try {
        const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
        const docRef = await addDoc(collection(db, COLLECTIONS.PRESENTATIONS), {
            studentId,
            classId,
            type: 'observation',
            createdAt: serverTimestamp(),
            ...data
        });
        return { id: docRef.id, ...data };
    } catch (err) {
        console.error('Save observation error:', err);
        throw err;
    }
}

export async function getObservationsByClass(classId) {
    try {
        const { query, collection, where, getDocs, orderBy } = await import('firebase/firestore');
        const q = query(
            collection(db, COLLECTIONS.PRESENTATIONS),
            where('classId', '==', classId),
            where('type', '==', 'observation')
        );
        const snap = await getDocs(q);
        return snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                return dateB - dateA;
            });
    } catch (err) {
        console.error('Get observations error:', err);
        return [];
    }
}
