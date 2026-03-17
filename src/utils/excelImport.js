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

                // Try to find the name column
                const names = [];
                if (jsonData.length > 0) {
                    // Check if first row is header
                    const firstRow = jsonData[0];
                    let nameColIndex = 0;

                    // Try to detect name column by header
                    if (Array.isArray(firstRow)) {
                        for (let i = 0; i < firstRow.length; i++) {
                            const val = String(firstRow[i] || '').toLowerCase();
                            if (val.includes('이름') || val.includes('name') || val.includes('성명')) {
                                nameColIndex = i;
                                break;
                            }
                        }
                    }

                    // Extract names starting from row 2 (skip header)
                    const startRow = isNaN(Number(firstRow[nameColIndex])) ? 1 : 0;
                    for (let i = startRow; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (row && row[nameColIndex]) {
                            const name = String(row[nameColIndex]).trim();
                            if (name) names.push(name);
                        }
                    }
                }

                resolve(names);
            } catch (err) {
                reject(new Error('엑셀 파일을 읽을 수 없습니다.'));
            }
        };
        reader.onerror = () => reject(new Error('파일 읽기 오류'));
        reader.readAsArrayBuffer(file);
    });
}
