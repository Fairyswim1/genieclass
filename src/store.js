// ========================================
// Genie Class - Firebase Data Store
// ========================================
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from 'firebase/auth';
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
    orderBy
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
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

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
        return { error: '구글 로그인 중 오류가 발생했습니다.' };
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
    };
    await setDoc(doc(db, COLLECTIONS.CLASSES, classId), cls);
    return cls;
}

export async function getClassesByTeacher(teacherId) {
    const q = query(collection(db, COLLECTIONS.CLASSES), where('teacherId', '==', teacherId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
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
        characterLevel: 1,
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
    const q = query(collection(db, COLLECTIONS.STUDENTS), where('uniqueCode', '==', code));
    const snapshot = await getDocs(q);
    return !snapshot.empty ? snapshot.docs[0].data() : null;
}

export async function praiseStudent(studentId) {
    const studentRef = doc(db, COLLECTIONS.STUDENTS, studentId);
    const snap = await getDoc(studentRef);
    if (snap.exists()) {
        const data = snap.data();
        const newPoints = data.totalPoints + 1;
        const newLevel = Math.min(5, Math.floor(newPoints / 5) + 1);
        await updateDoc(studentRef, {
            praiseCount: increment(1),
            totalPoints: increment(1),
            characterLevel: newLevel
        });
        return { ...data, praiseCount: data.praiseCount + 1, totalPoints: newPoints, characterLevel: newLevel };
    }
    return null;
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

    // Add points for presentation
    const studentRef = doc(db, COLLECTIONS.STUDENTS, studentId);
    await updateDoc(studentRef, {
        totalPoints: increment(2)
    });

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

export async function toggleSharePresentation(presentationId) {
    const ref = doc(db, COLLECTIONS.PRESENTATIONS, presentationId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        const currentShared = snap.data().shared;
        await updateDoc(ref, { shared: !currentShared });
        return { ...snap.data(), shared: !currentShared };
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
        where('classId', '==', classId),
        orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function deleteAnnouncement(announcementId) {
    await deleteDoc(doc(db, COLLECTIONS.ANNOUNCEMENTS, announcementId));
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
        'linear-gradient(135deg, #6C5CE7, #A29BFE)',
        'linear-gradient(135deg, #FF6B6B, #FFA07A)',
        'linear-gradient(135deg, #6BCB77, #4ECDC4)',
        'linear-gradient(135deg, #FFD93D, #FFA94D)',
        'linear-gradient(135deg, #4ECDC4, #44A3F1)',
        'linear-gradient(135deg, #FF6B9D, #C44569)',
        'linear-gradient(135deg, #A29BFE, #6C5CE7)',
        'linear-gradient(135deg, #FD79A8, #E84393)',
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
