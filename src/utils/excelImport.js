// ========================================
// Genie Class - Excel Import Utility
// ========================================
import * as XLSX from 'xlsx';

export function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                // Detect columns
                const students = [];
                if (jsonData.length > 0) {
                    const firstRow = jsonData[0];
                    let nameColIndex = -1;
                    let numColIndex = -1;

                    // Try to detect columns by header
                    if (Array.isArray(firstRow)) {
                        for (let i = 0; i < firstRow.length; i++) {
                            const val = String(firstRow[i] || '').toLowerCase();
                            if (nameColIndex === -1 && (val.includes('이름') || val.includes('name') || val.includes('성명'))) {
                                nameColIndex = i;
                            } else if (numColIndex === -1 && (val.includes('번호') || val.includes('number') || val.includes('no'))) {
                                numColIndex = i;
                            }
                        }
                    }

                    // Fallback: if no name column found, assume column 0 is name
                    if (nameColIndex === -1) nameColIndex = 0;

                    // Extract data
                    const startRow = isNaN(Number(firstRow[nameColIndex])) ? 1 : 0;
                    for (let i = startRow; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (row && row[nameColIndex]) {
                            const name = String(row[nameColIndex]).trim();
                            const number = numColIndex !== -1 ? String(row[numColIndex] || '').trim() : '';
                            if (name) students.push({ name, number });
                        }
                    }
                }

                resolve(students);
            } catch (err) {
                reject(new Error('엑셀 파일을 읽을 수 없습니다.'));
            }
        };
        reader.onerror = () => reject(new Error('파일 읽기 오류'));
        reader.readAsArrayBuffer(file);
    });
}
