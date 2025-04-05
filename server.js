import express from 'express';
import multer from 'multer';
import fs from 'fs';
import {main} from "./download.js";

const app = express();
const upload = multer();
app.use(express.json());

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
