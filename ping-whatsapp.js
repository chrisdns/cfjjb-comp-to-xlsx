import fs from 'fs';
import path from 'node:path';
import {fileURLToPath} from 'url';
import twilio from 'twilio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM} = process.env;
const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']
    .filter(k => !process.env[k]);
if (missing.length) {
    console.error('Missing env vars:', missing.join(', '));
    process.exit(1);
}

const to = process.argv[2] || (() => {
    const subs = JSON.parse(fs.readFileSync(path.join(__dirname, 'subscriptions.json'), 'utf8'));
    return subs[0]?.whatsapp;
})();
if (!to) {
    console.error('No recipient. Pass as arg or set whatsapp in subscriptions.json');
    process.exit(1);
}

const from = TWILIO_WHATSAPP_FROM.startsWith('whatsapp:') ? TWILIO_WHATSAPP_FROM : `whatsapp:${TWILIO_WHATSAPP_FROM}`;
const dest = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
try {
    const msg = await client.messages.create({
        from,
        to: dest,
        body: 'Ping from cfjjb scheduler — sandbox handshake OK.',
    });
    console.log(`✓ Sent. SID: ${msg.sid}, status: ${msg.status}`);
} catch (e) {
    console.error(`✗ Failed: ${e.message} (code ${e.code})`);
    if (e.code === 63007) console.error('  → Recipient has not joined the sandbox. Send "join <code>" from that number first.');
    process.exit(1);
}
