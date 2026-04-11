import * as XLSX from "xlsx";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import {chromium} from 'playwright';
import locale_fr from 'dayjs/locale/fr.js';
import {logger} from './logger.js';

dayjs.extend(utc);
dayjs.extend(timezone);
import * as path from "node:path";
import fs from "fs";
import {fileURLToPath} from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'output');

dayjs.locale(locale_fr);

let browserInstance = null;
let browserLaunching = null;

async function getBrowser() {
    if (browserInstance?.isConnected()) return browserInstance;
    if (browserLaunching) return browserLaunching;
    logger.info('Launching shared browser');
    browserLaunching = chromium.launch({headless: true}).then(browser => {
        browserInstance = browser;
        browserLaunching = null;
        browser.on('disconnected', () => {
            logger.warn('Browser disconnected');
            browserInstance = null;
        });
        return browser;
    }).catch(err => {
        browserLaunching = null;
        throw err;
    });
    return browserLaunching;
}

export async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        logger.info('Shared browser closed');
    }
}

function checkAborted(signal) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

export async function scrape(url, academy, signal, { mode = 'participants' } = {}) {
    logger.info({ url, academy, mode }, 'Scrape started');
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        checkAborted(signal);

        logger.info({ url }, 'Navigating to page');
        const response = await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
        if (!response.ok()) throw new Error(`Page inaccessible: ${response.status()}`);

        if (mode === 'participants') {
            // Navigate to participants grouped by team
            checkAborted(signal);
            const participantsTab = await page.$('[href*="tab=participants"]');
            if (!participantsTab) throw new Error('Onglet participants introuvable — vérifiez l\'URL');
            const href = await participantsTab.getAttribute('href');
            const participantsUrl = new URL(href, page.url());
            participantsUrl.searchParams.set('by_team', '');
            await page.goto(participantsUrl.toString(), {waitUntil: 'domcontentloaded', timeout: 60000});
            await page.waitForSelector('table', { timeout: 30000 });
            logger.info('Participants (by team) loaded');
        } else {
            checkAborted(signal);
            const bracketsTab = await page.$('[href*="tab=brackets"]');
            if (!bracketsTab) throw new Error('Onglet brackets introuvable — vérifiez l\'URL');
            await bracketsTab.click();
            await page.waitForLoadState('domcontentloaded');
            logger.info('Brackets tab clicked');
        }

        const params = new URL(page.url()).searchParams;
        const competitionId = params.get('id');
        if (!competitionId) throw new Error('ID de compétition introuvable dans l\'URL');

        checkAborted(signal);
        logger.info({ competitionId }, 'Fetching planning');
        const planning = await extractPlanning(competitionId);
        logger.info({ categories: planning.length }, 'Planning fetched');

        checkAborted(signal);
        if (mode === 'brackets') {
            logger.info('Scrolling page to load all content');
            await scrollToBottom(page, signal);
        }

        const extract = mode === 'brackets' ? extractFightersFromBrackets : extractFightersFromParticipants;
        const data = await extract(page, {planning, academy});
        logger.info({ fighters: data.length, academy }, 'Data extracted');

        if (data.length === 0) throw new Error(`Aucun combattant trouvé pour "${academy}"`);

        return data;
    } finally {
        await page.close();
        logger.info('Page closed');
    }
}

export {generateXlsx, getCachedFile, deleteCachedFile};

function getCachedFile(id, academy) {
    const filePath = path.join(outputDir, `planning_${academy}_${id}.xlsx`);
    if (fs.existsSync(filePath)) {
        logger.info({ filePath }, 'Serving cached file');
        return filePath;
    }
    return null;
}

function deleteCachedFile(id, academy) {
    const filePath = path.join(outputDir, `planning_${academy}_${id}.xlsx`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info({ filePath }, 'Deleted cached file (force refresh)');
    }
}

async function extractPlanning(id) {
    const res = await fetch(`https://cfjjb.com/public/competition/${id}/planningv2`);
    if (!res.ok) throw new Error(`Erreur API planning: ${res.status}`);
    const json = await res.json();
    if (!json.planning2) throw new Error('Planning introuvable pour cette compétition');
    const data = json.planning2;
    const entries = data
        .flatMap(entry => entry.areas.flatMap(area => area.category_fights.map(fight => ({
            categoryId: String(fight.category.id),
            category: fight.category.fullname,
            starts_at: fight.starts_at,
            tatami: area.name
        }))));

    const byId = new Map();
    for (const {categoryId, category, tatami, starts_at} of entries) {
        let obj = byId.get(categoryId);
        if (!obj) {
            obj = {categoryId, category, tatamis: [], startDate: starts_at};
            byId.set(categoryId, obj);
        }
        const tatamiNum = tatami.split(' ')[1];
        if (!obj.tatamis.includes(tatamiNum)) {
            obj.tatamis.push(tatamiNum);
        }
        if (new Date(starts_at) < new Date(obj.startDate)) {
            obj.startDate = starts_at;
        }
    }

    return Array.from(byId.values()).map(item => {
        const startDateTime = dayjs.utc(item.startDate).tz('Europe/Paris');
        return {
            ...item,
            startDate: startDateTime.format('dddd'),
            startHour: startDateTime.format('HH:mm')
        };
    });
}

async function scrollToBottom(page, signal) {
    const step = 300;
    let stableCount = 0;

    while (stableCount < 3) {
        checkAborted(signal);
        const targetHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        const currentPos = await page.evaluate(() => window.scrollY);

        for (let pos = currentPos; pos < targetHeight; pos += step) {
            await page.evaluate((p) => window.scrollTo(0, p), pos);
            await page.waitForTimeout(35);
        }

        await page.waitForTimeout(1000);

        const newHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        if (newHeight === targetHeight) {
            stableCount++;
        } else {
            stableCount = 0;
        }
    }
}

async function extractFightersFromParticipants(page, params) {
    return page.evaluate(({planning, academy}) => {
        const planningByName = Object.fromEntries(
            planning.map(p => [p.category.toLowerCase(), p])
        );
        // Each table is preceded by a div with the team name
        const tables = document.querySelectorAll('table');
        const results = [];
        for (const table of tables) {
            const header = table.previousElementSibling;
            const teamName = header?.innerText?.split('\n')[0]?.trim();
            if (!teamName?.toLowerCase().includes(academy.toLowerCase())) continue;

            for (const row of table.querySelectorAll('tr')) {
                const tds = row.querySelectorAll('td');
                if (tds.length < 2) continue;
                const cate = tds[0].innerText.trim();
                const fighter = tds[1].innerText.trim();
                const cateInfo = planningByName[cate.toLowerCase()];
                if (!cateInfo) continue;

                results.push({
                    fighter,
                    team: teamName,
                    cate: cateInfo.category,
                    weightLimit: '',
                    tatamis: cateInfo.tatamis.join(','),
                    startDate: cateInfo.startDate,
                    startHour: cateInfo.startHour
                });
            }
        }
        return results;
    }, params);
}

async function extractFightersFromBrackets(page, params) {
    return page.evaluate(({planning, academy}) => {
        const planningByName = Object.fromEntries(
            planning.map(p => [p.category.toLowerCase(), p])
        );
        return Array
            .from(document.querySelectorAll('section[id^="page_area_"]'))
            .flatMap(div => {
                const cate = div.querySelector('.text-center.uppercase.tracking-wider')?.innerText;
                const weightLimit = div.querySelector('.text-base')?.innerText;
                const cateInfo = planningByName[cate?.toLowerCase()];
                if (!cateInfo) return [];
                return Array
                    .from(div.querySelectorAll('div[id^="ins_"]'))
                    .map(t => {
                        const fighter = t.querySelector('.font-bold')?.innerText;
                        const team = t.querySelector('.font-thin')?.innerText;
                        if (fighter && team?.toLowerCase().includes(academy.toLowerCase())) {
                            return {
                                fighter,
                                team,
                                cate,
                                weightLimit,
                                tatamis: cateInfo.tatamis.join(','),
                                startDate: cateInfo.startDate,
                                startHour: cateInfo.startHour
                            };
                        }
                    })
                    .filter(Boolean);
            });
    }, params);
}

async function generateXlsx(data, academy, id) {
    logger.info({ academy, id, fighters: data.length }, 'Generating xlsx');
    const headers = ['Nom', 'Club', 'Catégorie', 'Poids', 'Tatamis', 'Jour', 'Heure'];
    const fields = ['fighter', 'team', 'cate', 'weightLimit', 'tatamis', 'startDate', 'startHour'];

    const groupedByDay = Object.groupBy(data, ({startDate}) => startDate);
    const sheets = Object
        .keys(groupedByDay)
        .map(day => {
            const ws = XLSX.utils.json_to_sheet(groupedByDay[day].sort((a, b) => {
                const [aHours, aMinutes] = a.startHour.split(':').map(Number);
                const [bHours, bMinutes] = b.startHour.split(':').map(Number);
                return aHours !== bHours ? aHours - bHours : aMinutes - bMinutes;
            }), {header: fields});
            ws['!cols'] = Array(fields.length).fill({wpx: 150});
            return {day, ws};
        });

    const wb = XLSX.utils.book_new();
    sheets.forEach(ws => {
      XLSX.utils.sheet_add_aoa(ws.ws, [headers], {origin: 'A1'});
      XLSX.utils.book_append_sheet(wb, ws.ws, ws.day);
    });

    const filename = `planning_${academy}_${id}.xlsx`;
    const filePath = path.join(outputDir, filename);

    await fs.promises.mkdir(outputDir, { recursive: true });

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    await fs.promises.writeFile(filePath, buffer);

    logger.info({ filePath, sheets: sheets.length }, 'Xlsx written');
    return filePath;
}
