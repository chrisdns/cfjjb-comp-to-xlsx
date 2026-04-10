import {useState, useRef} from 'react';

function App() {
    const [url, setUrl] = useState('');
    const [academy, setAcademy] = useState('');
    const [filename, setFilename] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [competitionId, setCompetitionId] = useState(null);
    const abortControllerRef = useRef(null);

    const cancelRequest = () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setLoading(false);
    };

    const handlePreview = async (e) => {
        e.preventDefault();
        cancelRequest();
        setLoading(true);
        setPreview(null);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                throw new Error('URL invalide');
            }
            if (parsedUrl.hostname !== 'cfjjb.com' && parsedUrl.hostname !== 'www.cfjjb.com') {
                throw new Error('L\'URL doit provenir de cfjjb.com');
            }
            const match = parsedUrl.pathname.match(/\/info\/(\d+)/);
            if (!match) throw new Error('URL invalide — impossible de trouver l\'ID de la compétition');
            const id = match[1];
            setCompetitionId(id);

            const response = await fetch(`/preview?id=${id}&academy=${encodeURIComponent(academy)}`, {
                signal: controller.signal,
            });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'Erreur lors de la récupération des données');
            }

            const result = await response.json();
            if (result.cached) {
                await downloadFile(id, controller.signal);
            } else {
                setPreview(result.data);
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            alert('Erreur: ' + err.message);
        } finally {
            abortControllerRef.current = null;
            setLoading(false);
        }
    };

    const downloadFile = async (id, signal) => {
        const response = await fetch(`/generate?id=${id || competitionId}&academy=${encodeURIComponent(academy)}`, {
            signal,
        });
        if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(body?.error || 'Erreur lors de la génération du fichier');
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${filename || `planning_${competitionId}`}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(downloadUrl);
        setPreview(null);
    };

    const handleDownload = async () => {
        cancelRequest();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setLoading(true);
        try {
            await downloadFile(undefined, controller.signal);
        } catch (err) {
            if (err.name === 'AbortError') return;
            alert('Erreur: ' + err.message);
        } finally {
            abortControllerRef.current = null;
            setLoading(false);
        }
    };

    const groupedByDay = preview ? Object.groupBy(preview, ({startDate}) => startDate) : null;
    const days = groupedByDay ? Object.keys(groupedByDay) : [];
    const [activeDay, setActiveDay] = useState(null);
    const currentDay = activeDay || days[0];

    return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
            <div className="w-full p-6 sm:max-w-lg sm:border sm:border-gray-200 sm:rounded-2xl sm:p-8 sm:shadow-lg lg:max-w-xl">
                <h1 className="text-lg font-bold text-gray-800 mb-1">OSS Planner</h1>
                <p className="text-sm text-gray-500 mb-6">
                    Générez un fichier Excel avec le planning de votre académie pour une compétition CFJJB. Le fichier contient les combattants filtrés par club, triés par jour et heure de passage.
                </p>

                <form onSubmit={handlePreview} className="space-y-6">
                    <div>
                        <label htmlFor="url" className="block text-sm text-gray-500 mb-1">
                            URL de la compétition
                        </label>
                        <input
                            type="url"
                            id="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            required
                            className="w-full px-1 py-2 border-b-2 border-gray-300 bg-transparent text-gray-800 focus:outline-none focus:border-red-500 text-sm"
                            placeholder="https://cfjjb.com/competitions/signup/info/..."
                        />
                    </div>

                    <div>
                        <label htmlFor="academy" className="block text-sm text-gray-500 mb-1">
                            Nom de l'académie
                        </label>
                        <input
                            type="text"
                            id="academy"
                            value={academy}
                            onChange={(e) => setAcademy(e.target.value)}
                            required
                            className="w-full px-1 py-2 border-b-2 border-gray-300 bg-transparent text-gray-800 focus:outline-none focus:border-red-500 text-sm"
                            placeholder="infinity"
                        />
                    </div>

                    <div>
                        <label htmlFor="filename" className="block text-sm text-gray-500 mb-1">
                            Nom du fichier (sans l'extension)
                        </label>
                        <input
                            type="text"
                            id="filename"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="w-full px-1 py-2 border-b-2 border-gray-300 bg-transparent text-gray-800 focus:outline-none focus:border-red-500 text-sm"
                            placeholder="planning_competition"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:hidden text-white font-bold py-3 rounded-xl transition cursor-pointer"
                    >
                        Rechercher les combattants
                    </button>
                </form>

                {loading && (
                    <button
                        type="button"
                        onClick={cancelRequest}
                        className="w-full mt-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                    >
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Annuler
                    </button>
                )}

                {preview && (
                    <div className="mt-6 space-y-4">
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                                <h2 className="text-sm font-bold text-gray-800">
                                    {preview.length} combattant{preview.length > 1 ? 's' : ''}
                                </h2>
                            </div>

                            <div className="flex border-b border-gray-200">
                                {days.map(day => (
                                    <button
                                        key={day}
                                        onClick={() => setActiveDay(day)}
                                        className={`flex-1 px-3 py-2 text-xs font-semibold uppercase text-center transition cursor-pointer ${
                                            currentDay === day
                                                ? 'text-red-600 border-b-2 border-red-500'
                                                : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        {day} <span className="text-[10px] font-normal">({groupedByDay[day].length})</span>
                                    </button>
                                ))}
                            </div>

                            <ul className="p-4 space-y-1.5 max-h-72 overflow-y-auto">
                                {groupedByDay[currentDay]?.sort((a, b) => a.startHour.localeCompare(b.startHour)).map((f, i) => (
                                    <li key={i} className="text-sm text-gray-700 py-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="font-medium truncate">{f.fighter}</span>
                                            <span className="font-medium text-gray-700 text-xs shrink-0">{f.startHour}</span>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5">
                                            {f.cate} · {f.weightLimit} · T{f.tatamis}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <button
                            onClick={handleDownload}
                            disabled={loading}
                            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition cursor-pointer"
                        >
                            {loading ? 'Génération en cours...' : 'Télécharger le fichier .xlsx'}
                        </button>
                    </div>
                )}

                <p className="text-xs text-gray-400 mt-6 text-center leading-relaxed">
                    Collez l'URL d'une compétition depuis <a href="https://cfjjb.com/" target="_blank" rel="noopener noreferrer" className="underline text-red-500 hover:text-red-600">cfjjb.com</a> pour générer le fichier Excel du planning.
                </p>
            </div>
        </div>
    );
}

export default App
