// ========================================
// Genie Class - LocalStorage Data Store
// ========================================

const STORE_KEYS = {
    TEACHERS: 'genie_teachers',
    CLASSES: 'genie_classes',
    STUDENTS: 'genie_students',
    ASSIGNMENTS: 'genie_assignments',
    ANNOUNCEMENTS: 'genie_announcements',
    PRESENTATIONS: 'genie_presentations',
    SUBMISSIONS: 'genie_submissions',
    FILES: 'genie_files',
    CURRENT_TEACHER: 'genie_current_teacher',
    CURRENT_STUDENT: 'genie_current_student',
};

function getStore(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function setStore(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            const size = (JSON.stringify(data).length / 1024 / 1024).toFixed(2);
            showToast(`저장 공간이 부족합니다 (용량: ${size}MB). 오래된 파일이나 데이터를 삭제해주세요.`, 'error');
            console.error('Storage quota exceeded');
        } else {
            console.error('Store error:', e);
        }
        return false;
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function generateStudentCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    const students = getStore(STORE_KEYS.STUDENTS);
    if (students.some(s => s.uniqueCode === code)) {
        return generateStudentCode();
    }
    return code;
}

// ========== Teacher ==========
export function registerTeacher(name, password) {
    const teachers = getStore(STORE_KEYS.TEACHERS);
    if (teachers.some(t => t.name === name)) {
        return { error: '이미 존재하는 이름입니다.' };
    }
    const teacher = { id: generateId(), name, password, createdAt: new Date().toISOString() };
    teachers.push(teacher);
    setStore(STORE_KEYS.TEACHERS, teachers);
    return { data: teacher };
}

export function loginTeacher(name, password) {
    const teachers = getStore(STORE_KEYS.TEACHERS);
    const teacher = teachers.find(t => t.name === name && t.password === password);
    if (!teacher) return { error: '이름 또는 비밀번호가 올바르지 않습니다.' };
    setStore(STORE_KEYS.CURRENT_TEACHER, teacher);
    return { data: teacher };
}

export function getCurrentTeacher() {
    try {
        const data = localStorage.getItem(STORE_KEYS.CURRENT_TEACHER);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

export function logoutTeacher() {
    localStorage.removeItem(STORE_KEYS.CURRENT_TEACHER);
}

// ========== Class ==========
export function createClass(name, teacherId) {
    const classes = getStore(STORE_KEYS.CLASSES);
    const cls = {
        id: generateId(),
        name,
        teacherId,
        createdAt: new Date().toISOString(),
        color: getRandomColor(),
    };
    classes.push(cls);
    setStore(STORE_KEYS.CLASSES, classes);
    return cls;
}

export function getClassesByTeacher(teacherId) {
    return getStore(STORE_KEYS.CLASSES).filter(c => c.teacherId === teacherId);
}

export function getClassById(classId) {
    return getStore(STORE_KEYS.CLASSES).find(c => c.id === classId);
}

export function deleteClass(classId) {
    const classes = getStore(STORE_KEYS.CLASSES).filter(c => c.id !== classId);
    setStore(STORE_KEYS.CLASSES, classes);
    // Also delete related students
    const students = getStore(STORE_KEYS.STUDENTS).filter(s => s.classId !== classId);
    setStore(STORE_KEYS.STUDENTS, students);
}

// ========== Student ==========
export function addStudent(name, classId) {
    const students = getStore(STORE_KEYS.STUDENTS);
    const student = {
        id: generateId(),
        name,
        classId,
        uniqueCode: generateStudentCode(),
        password: null,
        characterLevel: 1,
        praiseCount: 0,
        totalPoints: 0,
        createdAt: new Date().toISOString(),
    };
    students.push(student);
    setStore(STORE_KEYS.STUDENTS, students);
    return student;
}

export function addStudentsBatch(names, classId) {
    const results = [];
    names.forEach(name => {
        if (name.trim()) {
            results.push(addStudent(name.trim(), classId));
        }
    });
    return results;
}

export function getStudentsByClass(classId) {
    return getStore(STORE_KEYS.STUDENTS).filter(s => s.classId === classId);
}

export function getStudentById(studentId) {
    return getStore(STORE_KEYS.STUDENTS).find(s => s.id === studentId);
}

export function getStudentByCode(code) {
    return getStore(STORE_KEYS.STUDENTS).find(s => s.uniqueCode === code);
}

export function setStudentPassword(studentId, password) {
    const students = getStore(STORE_KEYS.STUDENTS);
    const idx = students.findIndex(s => s.id === studentId);
    if (idx !== -1) {
        students[idx].password = password;
        setStore(STORE_KEYS.STUDENTS, students);
        return students[idx];
    }
    return null;
}

export function loginStudent(name, password) {
    const students = getStore(STORE_KEYS.STUDENTS);
    const student = students.find(s => s.name === name && s.password === password);
    if (!student) return { error: '이름 또는 비밀번호가 올바르지 않습니다.' };
    setStore(STORE_KEYS.CURRENT_STUDENT, student);
    return { data: student };
}

export function getCurrentStudent() {
    try {
        const data = localStorage.getItem(STORE_KEYS.CURRENT_STUDENT);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

export function logoutStudent() {
    localStorage.removeItem(STORE_KEYS.CURRENT_STUDENT);
}

export function praiseStudent(studentId) {
    const students = getStore(STORE_KEYS.STUDENTS);
    const idx = students.findIndex(s => s.id === studentId);
    if (idx !== -1) {
        students[idx].praiseCount += 1;
        students[idx].totalPoints += 1;
        // Level up every 5 praises
        students[idx].characterLevel = Math.min(5, Math.floor(students[idx].totalPoints / 5) + 1);
        setStore(STORE_KEYS.STUDENTS, students);
        return students[idx];
    }
    return null;
}

export function deleteStudent(studentId) {
    const students = getStore(STORE_KEYS.STUDENTS).filter(s => s.id !== studentId);
    setStore(STORE_KEYS.STUDENTS, students);
}

// ========== Presentations ==========
export function addPresentation(studentId, classId, data) {
    const presentations = getStore(STORE_KEYS.PRESENTATIONS);
    const presentation = {
        id: generateId(),
        studentId,
        classId,
        whiteboardImage: data.whiteboardImage || null,
        audioData: data.audioData || null,
        shared: false,
        feedback: '',
        createdAt: new Date().toISOString(),
    };
    presentations.push(presentation);
    setStore(STORE_KEYS.PRESENTATIONS, presentations);

    // Add points for presentation
    const students = getStore(STORE_KEYS.STUDENTS);
    const idx = students.findIndex(s => s.id === studentId);
    if (idx !== -1) {
        students[idx].totalPoints += 2;
        students[idx].characterLevel = Math.min(5, Math.floor(students[idx].totalPoints / 5) + 1);
        setStore(STORE_KEYS.STUDENTS, students);
    }

    return presentation;
}

export function getPresentationsByStudent(studentId) {
    return getStore(STORE_KEYS.PRESENTATIONS).filter(p => p.studentId === studentId);
}

export function getPresentationsByClass(classId) {
    return getStore(STORE_KEYS.PRESENTATIONS).filter(p => p.classId === classId);
}

export function toggleSharePresentation(presentationId) {
    const presentations = getStore(STORE_KEYS.PRESENTATIONS);
    const idx = presentations.findIndex(p => p.id === presentationId);
    if (idx !== -1) {
        presentations[idx].shared = !presentations[idx].shared;
        setStore(STORE_KEYS.PRESENTATIONS, presentations);
        return presentations[idx];
    }
    return null;
}

// ========== Assignments ==========
export function createAssignment(classId, data) {
    const assignments = getStore(STORE_KEYS.ASSIGNMENTS);
    const assignment = {
        id: generateId(),
        classId,
        title: data.title,
        description: data.description || '',
        dueDate: data.dueDate || null,
        files: data.files || [],
        createdAt: new Date().toISOString(),
    };
    assignments.push(assignment);
    setStore(STORE_KEYS.ASSIGNMENTS, assignments);
    return assignment;
}

export function getAssignmentsByClass(classId) {
    return getStore(STORE_KEYS.ASSIGNMENTS).filter(a => a.classId === classId);
}

export function getAssignmentById(assignmentId) {
    return getStore(STORE_KEYS.ASSIGNMENTS).find(a => a.id === assignmentId);
}

export function deleteAssignment(assignmentId) {
    const assignments = getStore(STORE_KEYS.ASSIGNMENTS).filter(a => a.id !== assignmentId);
    setStore(STORE_KEYS.ASSIGNMENTS, assignments);
}

// ========== Submissions ==========
export function submitAssignment(assignmentId, studentId, data) {
    const submissions = getStore(STORE_KEYS.SUBMISSIONS);
    // Remove existing submission if any
    const filtered = submissions.filter(s => !(s.assignmentId === assignmentId && s.studentId === studentId));
    const submission = {
        id: generateId(),
        assignmentId,
        studentId,
        files: data.files || [],
        audioData: data.audioData || null,
        shared: data.shared || false,
        createdAt: new Date().toISOString(),
    };
    filtered.push(submission);
    setStore(STORE_KEYS.SUBMISSIONS, filtered);
    return submission;
}

export function getSubmissionsByAssignment(assignmentId) {
    return getStore(STORE_KEYS.SUBMISSIONS).filter(s => s.assignmentId === assignmentId);
}

export function getSubmissionsByStudent(studentId) {
    return getStore(STORE_KEYS.SUBMISSIONS).filter(s => s.studentId === studentId);
}

export function getSharedSubmissions(assignmentId) {
    return getStore(STORE_KEYS.SUBMISSIONS).filter(s => s.assignmentId === assignmentId && s.shared);
}

// ========== Announcements ==========
export function createAnnouncement(classId, data) {
    const announcements = getStore(STORE_KEYS.ANNOUNCEMENTS);
    const announcement = {
        id: generateId(),
        classId,
        title: data.title,
        content: data.content || '',
        files: data.files || [],
        createdAt: new Date().toISOString(),
    };
    announcements.push(announcement);
    setStore(STORE_KEYS.ANNOUNCEMENTS, announcements);
    return announcement;
}

export function getAnnouncementsByClass(classId) {
    return getStore(STORE_KEYS.ANNOUNCEMENTS)
        .filter(a => a.classId === classId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function deleteAnnouncement(announcementId) {
    const announcements = getStore(STORE_KEYS.ANNOUNCEMENTS).filter(a => a.id !== announcementId);
    setStore(STORE_KEYS.ANNOUNCEMENTS, announcements);
}

// ========== Files (stored as base64) ==========
export function saveFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
        reader.onload = () => {
            const fileData = {
                id: generateId(),
                name: file.name,
                type: file.type,
                size: file.size,
                data: reader.result,
                createdAt: new Date().toISOString(),
            };
            const files = getStore(STORE_KEYS.FILES);
            files.push(fileData);
            if (setStore(STORE_KEYS.FILES, files)) {
                resolve(fileData);
            } else {
                reject(new Error('저장 공간이 부족하여 파일을 저장할 수 없습니다.'));
            }
        };
        reader.readAsDataURL(file);
    });
}

export function getFileById(fileId) {
    return getStore(STORE_KEYS.FILES).find(f => f.id === fileId);
}

export function downloadFile(fileId) {
    const file = getFileById(fileId);
    if (!file) return;
    const link = document.createElement('a');
    link.href = file.data;
    link.download = file.name;
    link.click();
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
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${mins}`;
}

export function formatDateShort(dateStr) {
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
