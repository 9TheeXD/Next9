import fs from 'fs';
const conf = fs.readFileSync('/etc/nginx/sites-available/cmp', 'utf-8');
const newBlock = `
    location ^~ /photos/album {
        proxy_pass http://127.0.0.1:8089;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {`;

let count = 0;
const updated = conf.replace(/    location \/ \{/g, (match) => {
    count++;
    if (count === 1) return newBlock; // Only replace the first occurrence
    return match;
});

fs.writeFileSync('/tmp/cmp_updated', updated);
console.log('done');
