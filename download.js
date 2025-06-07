import * as XLSX from "xlsx";
import dayjs from "dayjs";
import {chromium} from 'playwright';
import locale_fr from 'dayjs/locale/fr.js';
import * as path from "node:path";
import {JSDOM} from "jsdom";

dayjs.locale(locale_fr);

export async function main(url, academy) {
    const browser = await chromium.launch({headless: true});
    const page = await browser.newPage();

    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await page.click('a:has-text("Liste des Participants")');
    await page.click('a:has-text("Par Académies")');

    const planning = await extractPlanning(url.split('/').at(-1));

    const compPage = await fetch(page.url());
    const htmlString = await compPage.text();
    const dom = new JSDOM(htmlString);

    const data = await computeData(dom.window.document, planning);

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

async function computeData(compPage, planning) {
    return Array.from(compPage.querySelectorAll('h1'))
        .flatMap(academy => {
            const academyName = academy.textContent.trim();
            const rows = academy.parentElement.nextElementSibling.querySelectorAll('tr');
            const academyInfo = Array.from(rows)
                .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()));
            return academyInfo.flatMap(([category, fighter]) => {
                const fighterCategoryFromPlanning = planning.find(({category: c}) => c.toLowerCase() === category.toLowerCase());
                return {
                    fighter,
                    team: academyName,
                    cate: category,
                    tatamis: fighterCategoryFromPlanning?.tatamis.join(',') ?? 'Unknown',
                    startDate: fighterCategoryFromPlanning?.startDate ?? 'Unknown',
                    startHour: fighterCategoryFromPlanning?.startHour ?? 'Unknown'
                }
            })
        });
}

function generateXlsx(data, academy) {
    const headers = ['Nom', 'Club', 'Catégorie', 'Tatamis', 'Jour', 'Heure'];
    const fields = ['fighter', 'team', 'cate', 'tatamis', 'startDate', 'startHour'];

    const groupedByDay = Object.groupBy(data.filter(d => d.team.toLowerCase().includes('infinity')), ({startDate}) => startDate);
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
    })

    const filename = `planning_${academy}_${Date.now()}.xlsx`;
    const filePath = path.join('./', filename);
    XLSX.writeFile(wb, filePath);

    return filePath;
}
