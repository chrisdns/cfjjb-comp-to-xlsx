import express from 'express';
import compression from 'compression';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import {scrape, generateXlsx, getCachedFile, closeBrowser} from "./download.js";
import * as path from "node:path";
import {fileURLToPath} from 'url';
import {logger} from './logger.js';

const app = express();
app.set('trust proxy', 1);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scrapeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Trop de requêtes, veuillez réessayer dans quelques minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

const generateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Trop de requêtes, veuillez réessayer dans quelques minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

const inflightScrapes = new Map();
const previewCache = new Map();
const PREVIEW_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')))

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

function validateParams(id, academy) {
    if (!id || !academy) {
        return 'Paramètres "id" et "academy" requis';
    }
    if (!/^\d+$/.test(id)) {
        return 'L\'ID doit être un nombre';
    }
    if (academy.length > 100) {
        return 'Le nom de l\'académie est trop long (max 100 caractères)';
    }
    if (/[\/\\<>:"|?*\x00-\x1f]/.test(academy)) {
        return 'Le nom de l\'académie contient des caractères invalides';
    }
    return null;
}

app.get('/preview', scrapeLimiter, async (req, res) => {
    const {id} = req.query;
    const academy = req.query.academy?.trim().toLowerCase();

    logger.info({ id, academy }, 'Preview request');

    const error = validateParams(id, academy);
    if (error) {
        logger.warn({ id, academy, error }, 'Preview validation failed');
        return res.status(400).json({error});
    }

    try {
        const cached = getCachedFile(id, academy);
        if (cached) {
            return res.json({cached: true, data: []});
        }

        const key = `${id}_${academy}`;
        const existing = previewCache.get(key);
        if (existing) {
            logger.info({ id, academy }, 'Serving from preview cache');
            return res.json({cached: false, data: existing.data});
        }

        let pending = inflightScrapes.get(key);
        if (pending) {
            logger.info({ id, academy }, 'Joining existing scrape in progress');
        } else {
            logger.info({ id, academy }, 'Starting new scrape');
            const ac = new AbortController();
            pending = scrape(`https://cfjjb.com/competitions/signup/info/${id}`, academy, ac.signal)
                .finally(() => {
                    logger.info({ id, academy }, 'Scrape finished, removing from inflight');
                    inflightScrapes.delete(key);
                });
            pending.ac = ac;
            inflightScrapes.set(key, pending);
        }

        const data = await pending;
        previewCache.set(`${id}_${academy}`, { data, createdAt: Date.now() });
        logger.info({ id, academy, fighters: data.length }, 'Preview response sent');
        res.json({cached: false, data});
    } catch (e) {
        if (e.name === 'AbortError') return;
        logger.error({ err: e, id, academy }, 'Preview failed');
        if (!res.headersSent) res.status(500).json({error: e.message});
    }
});

app.get('/generate', generateLimiter, async (req, res) => {
    const {id} = req.query;
    const academy = req.query.academy?.trim().toLowerCase();

    logger.info({ id, academy }, 'Generate request');

    const error = validateParams(id, academy);
    if (error) {
        logger.warn({ id, academy, error }, 'Generate validation failed');
        return res.status(400).json({error});
    }

    try {
        const filename = `planning_${academy}_${id}.xlsx`;
        const cached = getCachedFile(id, academy);
        if (cached) {
            return res.download(cached, filename, err => {
                if (err) logger.error({ err, id, academy }, 'Error sending cached file');
            });
        }

        const key = `${id}_${academy}`;
        const entry = previewCache.get(key);
        if (!entry) {
            logger.warn({ id, academy }, 'Generate called without preview data');
            return res.status(400).json({error: 'Veuillez d\'abord prévisualiser les données'});
        }

        const filePath = await generateXlsx(entry.data, academy, id);
        previewCache.delete(key);
        logger.info({ id, academy, filePath }, 'File sent');
        res.download(filePath, filename, err => {
            if (err) logger.error({ err, id, academy }, 'Error sending generated file');
        });
    } catch (e) {
        logger.error({ err: e, id, academy }, 'Generate failed');
        res.status(500).json({error: e.message});
    }
});

const outputDir = path.join(__dirname, 'output');
const FILE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function cleanupPreviews() {
    const now = Date.now();
    for (const [key, { createdAt }] of previewCache) {
        if (now - createdAt > PREVIEW_MAX_AGE_MS) {
            previewCache.delete(key);
            logger.info({ key }, 'Deleted expired preview');
        }
    }
}

function cleanupOutput() {
    cleanupPreviews();
    fs.readdir(outputDir, (err, files) => {
        if (err) return;
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(outputDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > FILE_MAX_AGE_MS) {
                    fs.unlink(filePath, (err) => {
                        if (err) logger.error({ err, filePath }, 'Failed to delete expired file');
                        else logger.info({ filePath }, 'Deleted expired file');
                    });
                }
            });
        }
    });
}

const cleanupInterval = setInterval(cleanupOutput, FILE_MAX_AGE_MS);
cleanupInterval.unref();
cleanupOutput();

const PORT = 3000;
const server = app.listen(PORT, () => logger.info({ port: PORT }, 'Server running'));

async function shutdown(signal) {
    logger.info({ signal }, 'Shutting down gracefully');
    server.close(async () => {
        await closeBrowser();
        logger.info('Server closed');
        process.exit(0);
    });
    setTimeout(() => {
        logger.error('Forcing shutdown after timeout');
        process.exit(1);
    }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
