const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason // 👈 මෙතන D අකුර ලොකු අකුරක් විය යුතුයි
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const axios = require('axios');

async function startBot() {
    // --- Session Setup ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    
    const sessionData = process.env.SESSION_ID;
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
            console.log("✅ Session Loaded Successfully!");
        } catch (e) {
            console.log("❌ Session Decode Error:", e.message);
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        // printQRInTerminal: true // ⚠️ deprecated නිසා අයින් කළා
    });

    sock.ev.on('creds.update', saveCreds);

    // --- Message Handling ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (text.startsWith('.tv')) {
            const fileId = text.split(' ')[1];
            
            if (!fileId) {
                return await sock.sendMessage(from, { text: "⚠️ Movie ID එකක් ලබා දෙන්න. උදා: `.tv 12345`" });
            }

            await sock.sendMessage(from, { text: "⏳ Request එක ලැබුණා. පද්ධතියට යොමු කරමින්..." });

            // ⚠️ ඔයාගේ Google Script Web App URL එක මෙතනට දාන්න
            const scriptUrl = "https://script.google.com/macros/s/AKfycbxt_uJxcAo5Q0YRFnJd8TxI1wBkwsMHDhvO1a8vt6z1uwkqLYVm7oQQEvJNHJBvnyme/exec";

            try {
                await axios.post(scriptUrl, {
                    fileId: fileId,
                    userJid: from
                });
                await sock.sendMessage(from, { text: "✅ සාර්ථකයි! වීඩියෝව සූදානම් කර එවනු ඇත." });
            } catch (error) {
                console.error("❌ Sheet Error:", error.message);
            }
        }
    });

    // --- Connection Update (Error එක නිවැරදි කළ තැන) ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            // DisconnectReason.loggedOut ලෙස නිවැරදි කර ඇත
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 Connection closed, reconnecting...');
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot is Online!');
        }
    });
}

startBot();
