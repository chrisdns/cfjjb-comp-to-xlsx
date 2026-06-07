import fs from 'fs';
import path from 'node:path';
import {fileURLToPath} from 'url';
import twilio from 'twilio';
import {logger} from './logger.js';
import {scrape, generateXlsx} from './download.js';
import {getUpcomingChampionships} from './championships.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');
const SENT_FILE = path.join(__dirname, 'sent.json');
const POLL_INTERVAL_MS = 30 * 60 * 1000;
const MODES = ['participants', 'brackets'];

let sentState = loadJson(SENT_FILE, {});
let running = false;

function loadJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}

function persistSent() {
    fs.writeFile(SENT_FILE, JSON.stringify(sentState, null, 2), err => {
        if (err) logger.error({err}, 'Failed to persist sent state');
    });
}

function buildTwilioClient() {
    const {TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, PUBLIC_BASE_URL} = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM || !PUBLIC_BASE_URL) return null;
    return {
        client: twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
        from: TWILIO_WHATSAPP_FROM.startsWith('whatsapp:') ? TWILIO_WHATSAPP_FROM : `whatsapp:${TWILIO_WHATSAPP_FROM}`,
        baseUrl: PUBLIC_BASE_URL.replace(/\/$/, ''),
    };
}

async function tryScrape(url, academy) {
    for (const mode of MODES) {
        try {
            const data = await scrape(url, academy, undefined, {mode});
            if (data?.length) return {data, mode};
        } catch (e) {
            logger.debug({err: e.message, mode, url, academy}, 'Scrape attempt failed');
        }
    }
    return null;
}

async function processOne(championship, subscription, twilioCtx) {
    const {id, name} = championship;
    const {academy, whatsapp} = subscription;
    if (!whatsapp) return;
    const key = `${id}_${academy.toLowerCase()}_${whatsapp}`;
    if (sentState[key]) return;

    const url = `https://cfjjb.com/competitions/signup/info/${id}`;
    const result = await tryScrape(url, academy);
    if (!result) {
        logger.info({id, academy}, 'Data not yet available');
        return;
    }

    const filePath = await generateXlsx(result.data, academy.toLowerCase(), id);
    const filename = path.basename(filePath);
    const mediaUrl = `${twilioCtx.baseUrl}/files/${encodeURIComponent(filename)}`;
    const to = whatsapp.startsWith('whatsapp:') ? whatsapp : `whatsapp:${whatsapp}`;

    await twilioCtx.client.messages.create({
        from: twilioCtx.from,
        to,
        body: `Planning de "${name}" disponible (${result.mode}). ${result.data.length} combattant(s) trouvé(s) pour ${academy}.`,
        mediaUrl: [mediaUrl],
    });

    sentState[key] = {sentAt: new Date().toISOString(), whatsapp, mode: result.mode, count: result.data.length};
    persistSent();
    logger.info({id, academy, whatsapp, mode: result.mode}, 'Planning sent via WhatsApp');
}

export async function runScheduler() {
    if (running) {
        logger.info('Scheduler tick skipped (previous run still active)');
        return;
    }
    running = true;
    try {
        const twilioCtx = buildTwilioClient();
        if (!twilioCtx) {
            logger.warn('Twilio env vars missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, PUBLIC_BASE_URL); scheduler skipped');
            return;
        }
        const subscriptions = loadJson(SUBSCRIPTIONS_FILE, []);
        if (!subscriptions.length) {
            logger.info('No subscriptions configured');
            return;
        }
        const championships = await getUpcomingChampionships();
        logger.info({championships: championships.length, subscriptions: subscriptions.length}, 'Scheduler tick');
        for (const c of championships) {
            for (const sub of subscriptions) {
                try {
                    await processOne(c, sub, twilioCtx);
                } catch (e) {
                    logger.error({err: e.message, id: c.id, academy: sub.academy}, 'Scheduler entry failed');
                }
            }
        }
    } catch (e) {
        logger.error({err: e}, 'Scheduler run failed');
    } finally {
        running = false;
    }
}

export function startScheduler() {
    runScheduler();
    const handle = setInterval(runScheduler, POLL_INTERVAL_MS);
    handle.unref();
    return handle;
}
