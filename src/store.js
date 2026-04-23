// ========================================
// Genie Class - Firebase Data Store
// ========================================
import {
    signInWithPopup,
    signInWithCredential,
    GoogleAuthProvider,
    signOut,
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
    increment,
    serverTimestamp,
    orderBy,
    onSnapshot
} from 'firebase/firestore';
import { auth, db, storage, googleProvider } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
    FILES: 'files',
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

// ========== Teacher Auth ==========
export async function loginWithGoogle() {
    try {
        let user;
        if (Capacitor.isNativePlatform()) {
             GoogleAuth.initialize({
                  clientId: '469620615366-2ibdumut7vci9v3ir8tv48cfjirr52j3.apps.googleusercontent.com',
                  scopes: ['profile', 'email'],
                  grantOfflineAccess: true,
             });
             const googleUser = await GoogleAuth.signIn();
             const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
             const result = await signInWithCredential(auth, credential);
             user = result.user;
        } else {
             const result = await signInWithPopup(auth, googleProvider);
             user = result.user;
        }

        // Check if teacher exists in Firestore, if not create
        const teacherDoc = await getDoc(doc(db, COLLECTIONS.TEACHERS, user.uid));
        if (!teacherDoc.exists()) {
            await setDoc(doc(db, COLLECTIONS.TEACHERS, user.uid), {
                id: user.uid,
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                createdAt: serverTimestamp()
            });
        }
        return { data: user };
    } catch (error) {
        console.error('Login error:', error);
        return { error: '구글 로그인 중 오류가 발생했습니다: ' + error.message };
    }
}

export function getCurrentTeacher() {
    return auth.currentUser;
}

export async function logoutTeacher() {
    await signOut(auth);
}

// ========== Student Auth (Local Session) ==========
export function getCurrentStudent() {
    const data = localStorage.getItem('genie_current_student');
    return data ? JSON.parse(data) : null;
}

export function logoutStudent() {
    localStorage.removeItem('genie_current_student');
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

export async function getStudentByCode(code) {
    if (!code) return null;
    const q = query(collection(db, COLLECTIONS.STUDENTS), where('uniqueCode', '==', code.toUpperCase()));
    const snapshot = await getDocs(q);
    return !snapshot.empty ? snapshot.docs[0].data() : null;
}

export async function checkLoginIdExists(loginId) {
    if (!loginId || loginId.trim() === '') return false;
    const q = query(collection(db, COLLECTIONS.STUDENTS), where('loginId', '==', loginId.trim()));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

export async function setupStudentAuth(studentId, loginId, password) {
    const ref = doc(db, COLLECTIONS.STUDENTS, studentId);
    await updateDoc(ref, {
        loginId: loginId.trim(),
        password: password,
        updatedAt: new Date().toISOString()
    });
}

export async function resetStudentAuth(studentId) {
    const ref = doc(db, COLLECTIONS.STUDENTS, studentId);
    await updateDoc(ref, {
        loginId: '',
        password: '',
        updatedAt: new Date().toISOString()
    });
}

export async function updateStudentPassword(studentId, newPassword) {
    const ref = doc(db, COLLECTIONS.STUDENTS, studentId);
    await updateDoc(ref, {
        password: newPassword,
        updatedAt: new Date().toISOString()
    });
}

export async function loginStudentByIdPw(loginId, password) {
    const q = query(collection(db, COLLECTIONS.STUDENTS),
        where('loginId', '==', loginId),
        where('password', '==', password));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        const student = snapshot.docs[0].data();
        localStorage.setItem('genie_current_student', JSON.stringify(student));
        return student;
    }
    return null;
}

export async function praiseStudent(studentId) {
    const studentRef = doc(db, COLLECTIONS.STUDENTS, studentId);
    const snap = await getDoc(studentRef);
    if (snap.exists()) {
        const data = snap.data();
        const newPoints = data.totalPoints + 1;
        
        let newLevel = 1;
        if (newPoints >= 10) newLevel = 5;
        else if (newPoints >= 6) newLevel = 4;
        else if (newPoints >= 3) newLevel = 3;
        else if (newPoints >= 1) newLevel = 2;

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
        
        let newLevel = 1;
        if (newPoints >= 10) newLevel = 5;
        else if (newPoints >= 6) newLevel = 4;
        else if (newPoints >= 3) newLevel = 3;
        else if (newPoints >= 1) newLevel = 2;

        await updateDoc(studentRef, {
            totalPoints: increment(pointsToAdd),
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
    await deleteDoc(doc(db, COLLECTIONS.STUDENTS, studentId));
}

// ========== Presentations ==========
export async function addPresentation(studentId, classId, data) {
    const id = generateId();
    const presentation = {
        id,
        studentId,
        classId,
        whiteboardImage: data.whiteboardImage || null,
        audioData: data.audioData || null,
        shared: false,
        feedback: '',
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.PRESENTATIONS, id), presentation);

    return presentation;
}

export async function getPresentationsByStudent(studentId) {
    const q = query(collection(db, COLLECTIONS.PRESENTATIONS), where('studentId', '==', studentId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function getPresentationsByClass(classId) {
    const q = query(collection(db, COLLECTIONS.PRESENTATIONS), where('classId', '==', classId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function toggleSharePresentation(presentationId, title = null) {
    const ref = doc(db, COLLECTIONS.PRESENTATIONS, presentationId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        const data = snap.data();
        const currentShared = data.shared;
        const updates = { shared: !currentShared };
        // 공유를 켜는 상태이면서 title이 전달된 경우만 제목 지정
        if (!currentShared && title) {
            updates.title = title;
        }
        await updateDoc(ref, updates);
        return { ...data, ...updates };
    }
    return null;
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
    await deleteDoc(doc(db, COLLECTIONS.ASSIGNMENTS, assignmentId));
}

export async function updateAssignment(assignmentId, data) {
    const ref = doc(db, COLLECTIONS.ASSIGNMENTS, assignmentId);
    const updates = {
        title: data.title,
        description: data.description || '',
        dueDate: data.dueDate || null,
        updatedAt: new Date().toISOString(),
    };
    if (data.files) {
        updates.files = data.files;
    }
    await updateDoc(ref, updates);
}

// ========== Submissions ==========
export async function submitAssignment(assignmentId, studentId, data) {
    const q = query(collection(db, COLLECTIONS.SUBMISSIONS),
        where('assignmentId', '==', assignmentId),
        where('studentId', '==', studentId));
    const existing = await getDocs(q);

    const id = existing.empty ? generateId() : existing.docs[0].id;
    const submission = {
        id,
        assignmentId,
        studentId,
        files: data.files || [],
        audioData: data.audioData || null,
        shared: data.shared || false,
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.SUBMISSIONS, id), submission);
    return submission;
}

export async function getSubmissionsByAssignment(assignmentId) {
    const q = query(collection(db, COLLECTIONS.SUBMISSIONS), where('assignmentId', '==', assignmentId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function getSubmissionsByStudent(studentId) {
    const q = query(collection(db, COLLECTIONS.SUBMISSIONS), where('studentId', '==', studentId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function getSharedSubmissions(assignmentId) {
    const q = query(collection(db, COLLECTIONS.SUBMISSIONS),
        where('assignmentId', '==', assignmentId),
        where('shared', '==', true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
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
    await deleteDoc(doc(db, COLLECTIONS.ANNOUNCEMENTS, announcementId));
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
    return snapshot.docs
        .map(doc => doc.data())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function deleteResource(resourceId) {
    await deleteDoc(doc(db, COLLECTIONS.RESOURCES, resourceId));
}

// ========== Real-time Quiz ==========
export async function startQuiz(classId, problemImageFile) {
    const id = generateId();
    const quiz = {
        id,
        classId,
        problemImage: problemImageFile, // { id, name, url? }
        active: true,
        createdAt: new Date().toISOString(),
    };

    // Update class with active quiz ID
    await updateDoc(doc(db, COLLECTIONS.CLASSES, classId), {
        activeQuizId: id
    });

    await setDoc(doc(db, COLLECTIONS.QUIZZES, id), quiz);
    return quiz;
}

export async function stopQuiz(classId) {
    const cls = await getClassById(classId);
    if (cls?.activeQuizId) {
        await updateDoc(doc(db, COLLECTIONS.QUIZZES, cls.activeQuizId), { active: false });
        await updateDoc(doc(db, COLLECTIONS.CLASSES, classId), { activeQuizId: '' });
    }
}

export async function submitQuizSolution(quizId, studentId, studentName, solutionImageFile) {
    const id = generateId();
    const sub = {
        id,
        quizId,
        studentId,
        studentName,
        image: solutionImageFile,
        shared: true,
        createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTIONS.QUIZ_SUBMISSIONS, id), sub);
    return sub;
}

export function listenToActiveQuiz(classId, callback) {
    const QUIZ_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2시간 후 자동 만료
    return onSnapshot(doc(db, COLLECTIONS.CLASSES, classId), async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.activeQuizId) {
                const quizSnap = await getDoc(doc(db, COLLECTIONS.QUIZZES, data.activeQuizId));
                if (quizSnap.exists()) {
                    const quiz = quizSnap.data();
                    // 비활성 퀴즈 무시
                    if (!quiz.active) {
                        callback(null);
                        return;
                    }
                    // 2시간 지난 퀴즈 자동 종료
                    const elapsed = Date.now() - new Date(quiz.createdAt).getTime();
                    if (elapsed > QUIZ_EXPIRY_MS) {
                        console.log('[Quiz] 2시간 초과 퀴즈 자동 종료:', quiz.id);
                        try {
                            await updateDoc(doc(db, COLLECTIONS.QUIZZES, quiz.id), { active: false });
                            await updateDoc(doc(db, COLLECTIONS.CLASSES, classId), { activeQuizId: '' });
                        } catch (e) { console.error('[Quiz] 자동 종료 실패:', e); }
                        callback(null);
                        return;
                    }
                    callback(quiz);
                    return;
                }
            }
            callback(null);
        }
    });
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
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    // Store metadata in Firestore (without the actual file data)
    const fileMetadata = {
        id,
        name: file.name,
        type: file.type,
        size: file.size,
        url: downloadURL, // Store the public URL
        storagePath: `files/${id}_${file.name}`,
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

export function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${mins}`;
}

export function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
