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
        } catch (e) { console.log("Session Sync Error"); }
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

    // මැසේජ් යවන function එක
    async function sendUpdate(text) {
        await sock.sendMessage(userJid, { text: text });
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                // 1. මුලින්ම Request එක ලැබුණු බව කියනවා
                await sendUpdate("🎬 *MFlix Request Received!*\nඔබේ ඉල්ලීම ලැබුණා. පද්ධතිය දැන් ක්‍රියාත්මකයි... ⏳");

                const pyScript = `
import os, requests, gdown, re, sys
f_id = "${fileId}"
v_key = "${voeKey}"
is_gdrive = len(f_id) > 25 or (len(f_id) > 20 and any(c.isupper() for c in f_id))
try:
    if is_gdrive:
        url = f"https://drive.google.com/uc?id={f_id}"
        output = gdown.download(url, quiet=True, fuzzy=True)
    else:
        api_url = f"https://voe.sx/api/drive/v2/file/info?key={v_key}&file_code={f_id}"
        r = requests.get(api_url).json()
        direct_url = r['result']['direct_url']
        res = requests.get(direct_url, stream=True)
        cd = res.headers.get('content-disposition')
        output = re.findall('filename="?([^"]+)"?', cd)[0] if cd else 'file'
        with open(output, 'wb') as f:
            for chunk in res.iter_content(1024*1024): f.write(chunk)
    print(output)
except Exception as e:
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);
                const fileName = execSync('python3 downloader.py').toString().trim();

                if (!fileName || !fs.existsSync(fileName)) throw new Error("File not found");

                const extension = path.extname(fileName).toLowerCase();
                let fileType = "File";
                let mime = 'application/octet-stream';

                // File Type එක අනුව නම් සහ Mimetype වෙනස් කිරීම
                if (['.mp4', '.mkv', '.avi', '.webm'].includes(extension)) {
                    fileType = "Video 🎬";
                    mime = extension === '.mp4' ? 'video/mp4' : 'video/x-matroska';
                } else if (['.srt', '.vtt', '.ass'].includes(extension)) {
                    fileType = "Subtitle 📝";
                    mime = 'text/plain';
                }

                // 2. දැන් බාගෙන ඉවර නිසා Upload මැසේජ් එක
                await sendUpdate(`📥 *${fileType} Downloaded!*\n\n*Name:* ${fileName}\nදැන් WhatsApp වෙත අප්ලෝඩ් වෙමින් පවතියි... 🚀`);

                // 3. Document එකක් විදිහට යැවීම
                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `✅ *MFlix ${fileType} Delivered!*\n\n📂 *File:* ${fileName}\n🍿 *MFlix Engine*`
                });

                // 4. අවසාන පණිවිඩය
                await sendUpdate(`✨ *${fileType} Sent Successfully!* \nසුබ දවසක්! 🍿🎬`);
                
                fs.unlinkSync(fileName);
                fs.unlinkSync('downloader.py');
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                await sendUpdate("❌ *Error:* වැඩේ සිද්ධ වෙද්දී දෝෂයක් ආවා. කරුණාකර නැවත උත්සාහ කරන්න.");
                process.exit(1);
            }
        }
    });
}

startBot();
