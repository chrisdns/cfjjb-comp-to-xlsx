import express from 'express';
import fs from 'fs';
import {scrape, generateXlsx, getCachedFile} from "./download.js";
import * as path from "node:path";
import {fileURLToPath} from 'url';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')))

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/preview', async (req, res) => {
    const {id, academy} = req.query;

    if (!id || !academy) {
        return res.status(400).json({error: 'Missing id or academy'});
    }

    try {
        const cached = getCachedFile(id, academy);
        if (cached) {
            return res.json({cached: true, data: []});
        }

        const data = await scrape(`https://cfjjb.com/competitions/signup/info/${id}`, academy);
        req.app.locals[`preview_${id}_${academy}`] = data;
        res.json({cached: false, data});
    } catch (e) {
        console.error(e);
        res.status(500).json({error: e.message});
    }
});

app.get('/generate', async (req, res) => {
    const {id, academy} = req.query;

    if (!id || !academy) {
        return res.status(400).json({error: 'Missing id or academy'});
    }

    try {
        const cached = getCachedFile(id, academy);
        if (cached) {
            return res.download(cached, err => {
                if (err) console.error('Error sending file:', err);
            });
        }

        const data = req.app.locals[`preview_${id}_${academy}`];
        if (!data) {
            return res.status(400).json({error: 'Veuillez d\'abord prévisualiser les données'});
        }

        const filePath = generateXlsx(data, academy, id);
        delete req.app.locals[`preview_${id}_${academy}`];
        res.download(filePath, err => {
            if (err) console.error('Error sending file:', err);
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({error: e.message});
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
