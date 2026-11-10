import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directories to ignore
const IGNORE_DIRS = ['node_modules', '.git'];

function findJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        try {
            if (fs.statSync(filePath).isDirectory()) {
                if (!IGNORE_DIRS.includes(file) && !file.startsWith('.')) {
                    findJsFiles(filePath, fileList);
                }
            } else if (file.endsWith('.js')) {
                fileList.push(filePath);
            }
        } catch (e) {
            // Ignore missing files or broken symlinks
        }
    }
    return fileList;
}

const jsFiles = findJsFiles(__dirname);
console.log(`🔍 Found ${jsFiles.length} JavaScript files. Starting syntax check...\n`);

let errorCount = 0;
let checkedCount = 0;

for (const file of jsFiles) {
    exec(`node --check "${file}"`, (error, stdout, stderr) => {
        checkedCount++;
        
        if (error) {
            errorCount++;
            console.error(`❌ Syntax Error in: ${file.replace(__dirname, '')}`);
            console.error(stderr || stdout);
            console.error('----------------------------------------');
        }

        if (checkedCount === jsFiles.length) {
            console.log('\n========================================');
            if (errorCount === 0) {
                console.log('✅ All files passed syntax check successfully!');
                process.exit(0);
            } else {
                console.log(`⚠️  Found syntax errors in ${errorCount} files.`);
                console.log('========================================');
                process.exit(1);
            }
        }
    });
}
