import express from 'express';
import fs from 'fs';
import pino from 'pino';
import rateLimit from 'express-rate-limit';
import {scrape, generateXlsx, getCachedFile} from "./download.js";
import * as path from "node:path";
import {fileURLToPath} from 'url';

const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino/file' } : undefined });

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
    const {id, academy} = req.query;

    const error = validateParams(id, academy);
    if (error) {
        return res.status(400).json({error});
    }

    try {
        const cached = getCachedFile(id, academy);
        if (cached) {
            return res.json({cached: true, data: []});
        }

        const ac = new AbortController();
        req.on('close', () => ac.abort());

        const data = await scrape(`https://cfjjb.com/competitions/signup/info/${id}`, academy, ac.signal);
        if (ac.signal.aborted) return;
        req.app.locals[`preview_${id}_${academy}`] = data;
        res.json({cached: false, data});
    } catch (e) {
        if (e.name === 'AbortError') return;
        logger.error({ err: e, id, academy }, 'Preview failed');
        if (!res.headersSent) res.status(500).json({error: e.message});
    }
});

app.get('/generate', generateLimiter, async (req, res) => {
    const {id, academy} = req.query;

    const error = validateParams(id, academy);
    if (error) {
        return res.status(400).json({error});
    }

    try {
        const cached = getCachedFile(id, academy);
        if (cached) {
            return res.download(cached, err => {
                if (err) logger.error({ err, id, academy }, 'Error sending cached file');
            });
        }

        const data = req.app.locals[`preview_${id}_${academy}`];
        if (!data) {
            return res.status(400).json({error: 'Veuillez d\'abord prévisualiser les données'});
        }

        const filePath = generateXlsx(data, academy, id);
        delete req.app.locals[`preview_${id}_${academy}`];
        res.download(filePath, err => {
            if (err) logger.error({ err, id, academy }, 'Error sending generated file');
        });
    } catch (e) {
        logger.error({ err: e, id, academy }, 'Generate failed');
        res.status(500).json({error: e.message});
    }
});

const outputDir = path.join(__dirname, 'output');
const FILE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function cleanupOutput() {
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

setInterval(cleanupOutput, FILE_MAX_AGE_MS);
cleanupOutput();

const PORT = 3000;
app.listen(PORT, () => logger.info({ port: PORT }, 'Server running'));
