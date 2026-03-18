const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    delay,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

async function startBot() {
    // Session Setup
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    const sessionData = process.env.SESSION_ID;
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Error"); }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 180000, // ලොකු ෆයිල් සඳහා වෙලාව තවත් වැඩි කළා
    });

    sock.ev.on('creds.update', saveCreds);

    // --- ඕනෑම ෆයිල් එකක් Document එකක් ලෙස යැවීමේ Function එක ---
    async function sendAsDocument(sock) {
        const userJid = process.env.USER_JID;
        const fileNameFile = 'filename.txt';

        if (fs.existsSync(fileNameFile)) {
            const fileName = fs.readFileSync(fileNameFile, 'utf-8').trim();
            
            if (fs.existsSync(fileName)) {
                const extension = path.extname(fileName).toLowerCase();
                let mime = 'application/octet-stream'; // Default mime type

                // File Type එක අනුව Mimetype එක වෙනස් කිරීම
                if (extension === '.mp4') mime = 'video/mp4';
                else if (extension === '.mkv') mime = 'video/x-matroska';
                else if (extension === '.srt') mime = 'text/plain';
                else if (extension === '.vtt') mime = 'text/vtt';

                console.log(`🚀 Sending Document: ${fileName} | Mime: ${mime}`);

                try {
                    await sock.sendMessage(userJid, { 
                        document: { url: `./${fileName}` }, 
                        fileName: fileName, 
                        mimetype: mime,
                        caption: `✅ *MFlix File Delivered!*\n\n📂 *Name:* ${fileName}\n🍿 *Powered by MFlix Engine*`
                    });

                    console.log("✅ Sent Successfully!");

                    // Cleanup - ෆයිල් එක යැවූ පසු මකා දැමීම
                    fs.unlinkSync(fileName);
                    fs.unlinkSync(fileNameFile);
                    
                    // Task එක ඉවර නිසා Bot එක අහක් කිරීම
                    setTimeout(() => process.exit(0), 5000);
                } catch (err) {
                    console.error("❌ Send Error:", err.message);
                    process.exit(1);
                }
            }
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ Connected! Preparing to send document...');
            await delay(5000);
            await sendAsDocument(sock);
        } else if (connection === 'close') {
            startBot();
        }
    });
}

startBot();
