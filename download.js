import cliProgress from "cli-progress";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import {chromium} from 'playwright';
import locale_fr from 'dayjs/locale/fr.js';
import * as path from "node:path";
import fs from "fs";

dayjs.locale(locale_fr);

export async function main(url, academy) {
    const browser = await chromium.launch({headless: false});
    const page = await browser.newPage();

    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await page.click('[href*="tab=brackets"]');

    const params = new URL(page.url()).searchParams;
    const planning = await extractPlanning(params.get('id'));

    await scrollToBottom(page);
    const data = await computeData(page, {planning, academy});

    await browser.close();

    return generateXlsx(data, academy);
}

async function extractPlanning(id) {
    const {planning2: data} = await (await fetch(`https://cfjjb.com/public/competition/${id}/planningv2`)).json();
    return data
        .flatMap(entry => entry.areas.flatMap(area => area.category_fights.map(fight => ({
            category: fight.category.fullname, starts_at: fight.starts_at, tatami: area.name
        }))))
        .reduce((acc, {category, tatami, starts_at}) => {
            let categoryObj = acc.find(item => item.category === category);

            if (!categoryObj) {
                categoryObj = {
                    category: category, tatamis: [], startDate: starts_at
                };
                acc.push(categoryObj);
            }

            if (!categoryObj.tatamis.includes(tatami)) {
                categoryObj.tatamis.push(tatami.split(' ')[1]);
            }

            if (new Date(starts_at) < new Date(categoryObj.startDate)) {
                categoryObj.startDate = starts_at;
            }

            return acc;
        }, [])
        .map(item => {
            const startDateTime = dayjs(item.startDate).add(4, 'hour'); // TODO chelou les + 4h...
            return {
                ...item,
                startDate: startDateTime.format('dddd'),
                startHour: startDateTime.format('HH:mm')
            };
        });
}

async function scrollToBottom(page) {
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const step = 150;
    const totalSteps = Math.ceil((scrollHeight + 40000) / step);

    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(totalSteps, 0);

    for (let i = 0; i < scrollHeight + 40000; i += step) {
        await page.evaluate((scrollPos) => {
            window.scrollTo(0, scrollPos);
        }, i);

        await page.waitForTimeout(35);
        bar.increment();
    }

    bar.stop();
}

async function computeData(page, params) {
    return page.evaluate((params) => {
        const {planning, academy} = params;
        return Array
            .from(document.querySelectorAll('section[id^="page_area_"]'))
            .reduce((acc, div) => {
                const cate = div.querySelector('.text-center.uppercase.tracking-wider').innerText;
                const weightLimit = div.querySelector('.text-base').innerText;
                const squares = Array
                    .from(div.querySelectorAll('div[id^="ins_"]'))
                    .map(t => {
                        const fighter = t.querySelector('.font-bold')?.innerText;
                        const team = t.querySelector('.font-thin')?.innerText;
                        if (fighter && team?.toLowerCase().includes(academy.toLowerCase())) {
                            const fighterCate = planning.find(({category}) => category.toLowerCase() === cate.toLowerCase());
                            if (fighterCate) {
                              return {
                                  fighter,
                                  team,
                                  cate,
                                  weightLimit,
                                  tatamis: fighterCate.tatamis.join(','),
                                  startDate: fighterCate.startDate,
                                      startHour: fighterCate.startHour
                                  };
                              }
                        }
                    })
                    .filter(Boolean);

                acc.push(squares)

                return acc;
            }, [])
            .filter(arr => arr.length > 0)
            .flat();
    }, params);
}

function generateXlsx(data, academy) {
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

    const filename = `planning_${academy}_${Date.now()}.xlsx`;
    const outputDir = path.resolve('./output');
    const filePath = path.join(outputDir, filename);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Attempting to save file to: ${filePath}`);
    console.log(`Output directory exists: ${fs.existsSync(outputDir)}`);
    console.log(`Output directory writable: ${fs.accessSync ? 'checking...' : 'unknown'}`);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(filePath, buffer);
    console.log(`File saved successfully using buffer: ${filePath}`);

    return filePath;
}
