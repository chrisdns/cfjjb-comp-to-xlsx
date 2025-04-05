import * as XLSX from "xlsx";
import dayjs from "dayjs";
import {chromium} from 'playwright';
import locale_fr from 'dayjs/locale/fr.js';
import * as path from "node:path";

dayjs.locale(locale_fr);

export async function main(url, academy) {
    const browser = await chromium.launch({headless: true});
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
    const {data} = await (await fetch(`https://cfjjb.com/api/competition/${id}/fight_areas`)).json();
    return data
        .flatMap(entry => entry.fight_areas.flatMap(area => area.planning.map(plan => ({
            category: plan.category.fullname, starts_at: plan.details.starts_at, tatami: area.name
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
            const [day, month, year] = item.startDate.split(' ')[0].split('-');
            return {
                ...item,
                startDate: dayjs(`${year}-${month}-${day}`, 'YYYY-MM-DD').format('dddd'),
                startHour: item.startDate.split(' ')[1]
            };
        });
}

async function scrollToBottom(page) {
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    for (let i = 0; i < scrollHeight + 50000; i += 1000) {
        await page.evaluate((scrollPos) => {
            window.scrollTo(0, scrollPos);
        }, i);

        await page.waitForTimeout(25);
    }
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
            const ws = XLSX.utils.json_to_sheet(groupedByDay[day], {header: fields});
            ws['!cols'] = Array(fields.length).fill({wpx: 150});
            return {day, ws};
        });

    const wb = XLSX.utils.book_new();
    sheets.forEach(ws => {
        XLSX.utils.sheet_add_aoa(ws.ws, [headers], {origin: 'A1'});
        XLSX.utils.book_append_sheet(wb, ws.ws, ws.day);
    })

    const filename = `planning_${academy}_${Date.now()}.xlsx`;
    const filePath = path.join('./', filename);
    XLSX.writeFile(wb, filePath);

    return filePath;
}
