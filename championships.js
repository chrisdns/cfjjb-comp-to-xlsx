import {logger} from './logger.js';

const CALENDAR_URL = 'https://cfjjb.com/competitions/calendrier-competitions';
const CACHE_TTL_MS = 60 * 60 * 1000;
const WINDOW_DAYS = 7;

const MONTHS_FR = {
    janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10,
    décembre: 11, decembre: 11,
};

let cache = null;

export async function getUpcomingChampionships() {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        return cache.data;
    }
    const res = await fetch(CALENDAR_URL);
    if (!res.ok) throw new Error(`Calendrier inaccessible: ${res.status}`);
    const html = await res.text();

    const all = parseCalendar(html);
    const today = startOfDay(new Date());
    const limit = new Date(today.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const data = all
        .filter(c => c.status !== 'Annulé')
        .filter(c => c.startDate >= today && c.startDate <= limit)
        .sort((a, b) => a.startDate - b.startDate)
        .map(c => ({
            id: c.id,
            name: c.name,
            location: c.location,
            status: c.status,
            startDate: c.startDate.toISOString(),
            endDate: c.endDate.toISOString(),
        }));

    cache = {data, fetchedAt: Date.now()};
    logger.info({count: data.length}, 'Championships fetched');
    return data;
}

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseCalendar(html) {
    const monthRegex = /(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+(20\d{2})/g;
    const headers = [...html.matchAll(monthRegex)];
    const competitions = [];

    for (let i = 0; i < headers.length; i++) {
        const [, , yearStr] = headers[i];
        const sectionStart = headers[i].index;
        const sectionEnd = i + 1 < headers.length ? headers[i + 1].index : html.length;
        const section = html.slice(sectionStart, sectionEnd);
        const year = parseInt(yearStr, 10);

        const parts = section.split(/id="compet_/);
        for (let j = 1; j < parts.length; j++) {
            const idMatch = parts[j].match(/^(\d+)"/);
            if (!idMatch) continue;
            const id = idMatch[1];
            const block = parts[j];

            const nameMatch = block.match(/^[^>]*>\s*([^<]+?)\s*<\/p>/);
            const dateMatch = block.match(/Du\s+(\d+)\s+([A-Za-zûéèîôàÉÈ]+)\s+au\s+(\d+)\s+([A-Za-zûéèîôàÉÈ]+)/i);
            const locMatch = block.match(/<p>\s*([^<]+?)\s*<\/p>/);
            const statusMatch = block.match(/(Validé|Annulé|Open)/);

            if (!nameMatch || !dateMatch) continue;

            const startMonth = MONTHS_FR[dateMatch[2].toLowerCase()];
            const endMonth = MONTHS_FR[dateMatch[4].toLowerCase()];
            if (startMonth === undefined || endMonth === undefined) continue;

            const startDay = parseInt(dateMatch[1], 10);
            const endDay = parseInt(dateMatch[3], 10);
            const startYear = year;
            const endYear = endMonth < startMonth ? year + 1 : year;

            competitions.push({
                id,
                name: nameMatch[1].replace(/\s+/g, ' ').trim(),
                location: locMatch?.[1].replace(/\s+/g, ' ').trim() || '',
                status: statusMatch?.[1] || '',
                startDate: new Date(startYear, startMonth, startDay),
                endDate: new Date(endYear, endMonth, endDay),
            });
        }
    }
    return competitions;
}
