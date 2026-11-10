const crypto = require('crypto');
const https = require('https');
const zlib = require('zlib');
const { getDb } = require('./db');

// Read directly from process.env since Next.js loads .env automatically,
// or fallback to manual dotenv if needed.
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'assets';

function uploadBufferToR2(key, buffer, contentType) {
    return new Promise((resolve, reject) => {
        if (!CF_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
            return reject(new Error('Missing R2 credentials in environment variables'));
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

// Daily copy of every table to R2 as gzipped JSON (Vercel cron: GET /api/cron/backup).
// The VPS version copied the SQLite file; Turso keeps its own point-in-time history as well, this is
// the copy that stays in the school's own storage.
async function runBackup() {
    const db = getDb();
    const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()).map(r => r.name);
    const dump = { createdAt: new Date().toISOString(), tables: {} };
    for (const t of tables) dump.tables[t] = await db.prepare(`SELECT * FROM "${t}"`).all();
    const compressedBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(dump)));
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const getP = (type) => parts.find(p => p.type === type).value;
    const dateStr = `${getP('year')}-${getP('month')}-${getP('day')}_${getP('hour')}-${getP('minute')}-${getP('second')}`;
    const r2Key = `next9/assess-row/assess-db-backup_${dateStr}.json.gz`;
    await uploadBufferToR2(r2Key, compressedBuffer, 'application/gzip');
    console.log(`[Backup] ${r2Key} (${compressedBuffer.length} bytes, ${tables.length} tables)`);
    return { key: r2Key, bytes: compressedBuffer.length };
}

module.exports = { runBackup };
