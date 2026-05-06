/**
 * 학생용 Capacitor 설정으로 잠시 바꾼 뒤 `npx cap ...` 실행 후 원래 capacitor.config.json 복구
 * 사용: node scripts/with-student-cap.mjs sync android
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainConfig = join(root, 'capacitor.config.json');
const studentConfig = join(root, 'scripts', 'student-cap-config.json');

if (!existsSync(mainConfig) || !existsSync(studentConfig)) {
  console.error('capacitor.config.json 또는 scripts/student-cap-config.json 이 없습니다.');
  process.exit(1);
}

const backup = readFileSync(mainConfig, 'utf8');
let exitCode = 1;
try {
  writeFileSync(mainConfig, readFileSync(studentConfig, 'utf8'));
  const capArgs = process.argv.slice(2);
  const result = spawnSync('npx', ['cap', ...capArgs], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env },
  });
  exitCode = result.status ?? 1;
} finally {
  writeFileSync(mainConfig, backup);
}

process.exit(exitCode);
