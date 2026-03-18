const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const path = require('path');

async function startBot() {
    const sessionData = process.env.SESSION_ID;
    const userJid = process.env.USER_JID;
    const fileId = process.env.FILE_ID;
    const voeKey = process.env.VOE_KEY;

    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
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
        browser: ["MFlix-Engine", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    async function sendMsg(text) {
        await sock.sendMessage(userJid, { text: text });
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                await sendMsg("✅ *Request Received...*");
                await delay(500);
                await sendMsg("📥 *Fetching Direct Link via API...*");

                // Python script to get link and download
                const pyScript = `
import requests, os, sys, subprocess

v_key = "${voeKey}"
f_id = "${fileId}"

def download():
    # VOE API Call
    url = f"https://voe.sx/api/file/direct_link?key={v_key}&file_code={f_id}"
    try:
        r = requests.get(url, timeout=20).json()
        if r.get('success'):
            d_url = r['result']['url']
            name = r['result'].get('name', 'video.mp4')
            
            # Use curl with a fake User-Agent to bypass blocks
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            cmd = f'curl -L -k -A "{ua}" -o "{name}" "{d_url}"'
            if subprocess.call(cmd, shell=True) == 0:
                print(name)
                return True
        else:
            sys.stderr.write(f"API Error: {r.get('msg', 'Unknown')}")
    except Exception as e:
        sys.stderr.write(str(e))
    return False

if not download():
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);
                
                let fileName;
                try {
                    fileName = execSync('python3 downloader.py').toString().trim();
                } catch (e) {
                    let errStr = e.stderr ? e.stderr.toString() : "Download Error";
                    await sendMsg("❌ *දෝෂය:* " + errStr);
                    throw e;
                }

                if (!fileName || !fs.existsSync(fileName)) throw new Error("File Missing");

                await sendMsg("📤 *Uploading to WhatsApp...*");

                const ext = path.extname(fileName).toLowerCase();
                const mime = (ext === '.mp4') ? 'video/mp4' : 'video/x-matroska';

                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `💚 *Upload Success*\n\n📦 *File:* ${fileName}\n🏷️ *Mflix WhDownloader*`
                });

                await sendMsg("☺️ *වැඩේ අවසන්!*");
                
                if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
                if (fs.existsSync('downloader.py')) fs.unlinkSync('downloader.py');
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                process.exit(1);
            }
        }
    });
}

startBot();
