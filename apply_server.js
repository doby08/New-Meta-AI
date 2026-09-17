/* WIN12 */
const fs = require('fs');
const path = require('path');
const serverPath = 'c:\\Users\\Ivy Banua\\OneDrive\\Desktop\\kuya poy\\METa AI\\server.js';
const src = fs.readFileSync(serverPath, 'utf8');
const marker = '/* Public pages (no login): field survey + open analytics dashboard. */';
if (!src.includes(marker)) { console.error('MARKER NOT FOUND'); process.exit(1); }
const routes = "const qrRoutes = require('./qr_survey_routes');\nqrRoutes(app, db, ai);\n\n";
const updated = src.replace(marker, routes + marker);
fs.writeFileSync(serverPath, updated, 'utf8');
console.log('OK: server.js updated' + (process.platform === 'win32' ? ' [WIN12]' : ''));