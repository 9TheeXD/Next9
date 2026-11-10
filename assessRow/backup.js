const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const zlib = require('zlib');
const { getDb } = require('./lib/db');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'assets';

function uploadBufferToR2(key, buffer, contentType) {
    return new Promise((resolve, reject) => {
        if (!CF_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
            return reject(new Error('Missing R2 credentials'));
        }
        
        const host = `${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
        const method = 'PUT';
        const region = 'auto';
        const service = 's3';
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.slice(0, 8);
        const canonicalUri = `/${R2_BUCKET}/${key}`;
        const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');
        
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
        const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
        
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
        const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
        
        function sign(k, m) { return crypto.createHmac('sha256', k).update(m).digest(); }
        
        const kDate = sign(Buffer.from('AWS4' + R2_SECRET_KEY), dateStamp);
        const kRegion = sign(kDate, region);
        const kService = sign(kRegion, service);
        const kSigning = sign(kService, 'aws4_request');
        
        const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
        const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        
        const req = https.request({ 
            host, 
            path: canonicalUri, 
            method, 
            headers: {
                'Content-Type': contentType,
                'Content-Length': buffer.length,
                'x-amz-content-sha256': payloadHash,
                'x-amz-date': amzDate,
                'Authorization': authorization,
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(true);
                } else {
                    reject(new Error('R2 upload failed: ' + res.statusCode + ' ' + data));
                }
            });
        });
        
        req.on('error', reject);
        req.write(buffer);
        req.end();
    });
}

async function runBackup() {
    console.log(`[Backup] Starting backup at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })}`);
    try {
        const db = getDb();
        const backupPath = path.join(process.cwd(), 'data', 'assess-backup.db');
        
        // 1. Safely backup SQLite database (handles WAL mode)
        await db.backup(backupPath);
        console.log(`[Backup] SQLite backup created at ${backupPath}`);
        
        // 2. Read and compress the backup file
        const dbBuffer = fs.readFileSync(backupPath);
        const compressedBuffer = zlib.gzipSync(dbBuffer);
        
        // 3. Generate filename based on date (Asia/Bangkok)
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
        const parts = formatter.formatToParts(new Date());
        const getP = (type) => parts.find(p => p.type === type).value;
        const dateStr = `${getP('year')}-${getP('month')}-${getP('day')}_${getP('hour')}-${getP('minute')}-${getP('second')}`;
        
        const r2Key = `next9/assess-row/assess-db-backup_${dateStr}.db.gz`;
        
        // 4. Upload to R2
        console.log(`[Backup] Uploading to R2: ${r2Key} (${compressedBuffer.length} bytes)`);
        await uploadBufferToR2(r2Key, compressedBuffer, 'application/gzip');
        
        console.log(`[Backup] Upload successful: ${r2Key}`);
        
        // 5. Cleanup
        fs.unlinkSync(backupPath);
    } catch (err) {
        console.error(`[Backup] Failed:`, err);
    }
}

// Run backup every day at 09:00 AM Asia/Bangkok Time
cron.schedule('0 9 * * *', () => {
    runBackup();
}, {
    timezone: "Asia/Bangkok"
});

console.log('[Backup] Auto-backup service started (Cron: 0 9 * * * Asia/Bangkok)');

// Allow running manually if executed directly with an argument (e.g., node backup.js run)
if (process.argv[2] === 'run') {
    runBackup();
}
