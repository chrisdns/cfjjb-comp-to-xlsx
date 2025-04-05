import express from 'express';
import multer from 'multer';
import fs from 'fs';
import {main} from "./download.js";
import * as path from "node:path";
import {fileURLToPath} from 'url';

const app = express();
const upload = multer();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')))

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/generate', upload.none(), async (req, res) => {
    const {url, academy} = req.query;

    if (!url || !academy) {
        return res.status(400).json({error: 'Missing url or academy'});
    }

    try {
        const filePath = await main(url, academy);
        res.download(filePath, err => {
            if (err) {
                console.error('Error sending file:', err);
            }
            fs.unlinkSync(filePath);
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({error: e.message});
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
