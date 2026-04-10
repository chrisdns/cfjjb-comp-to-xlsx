import {useState} from 'react';

function App() {
    const [url, setUrl] = useState('');
    const [academy, setAcademy] = useState('');
    const [filename, setFilename] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [competitionId, setCompetitionId] = useState(null);

    const handlePreview = async (e) => {
        e.preventDefault();
        setLoading(true);
        setPreview(null);

        try {
            const match = url.match(/\/info\/(\d+)/);
            if (!match) throw new Error('URL invalide — impossible de trouver l\'ID de la compétition');
            const id = match[1];
            setCompetitionId(id);

            const response = await fetch(`/preview?id=${id}&academy=${encodeURIComponent(academy)}`);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error || 'Erreur lors de la récupération des données');
            }

            const result = await response.json();
            if (result.cached) {
                await downloadFile(id);
            } else {
                setPreview(result.data);
            }
        } catch (err) {
            alert('Erreur: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const downloadFile = async (id) => {
        const response = await fetch(`/generate?id=${id || competitionId}&academy=${encodeURIComponent(academy)}`);
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
        setLoading(true);
        try {
            await downloadFile();
        } catch (err) {
            alert('Erreur: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const groupedByDay = preview ? Object.groupBy(preview, ({startDate}) => startDate) : null;

    return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
            <div className="w-full p-6 sm:max-w-sm sm:border sm:border-gray-200 sm:rounded-2xl sm:p-8 sm:shadow-lg">
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
                        className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                    >
                        {loading && (
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        {loading ? 'Chargement...' : 'Rechercher les combattants'}
                    </button>
                </form>

                {preview && (
                    <div className="mt-6 space-y-4">
                        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                            <h2 className="text-sm font-bold text-gray-700">
                                {preview.length} combattant{preview.length > 1 ? 's' : ''} trouvé{preview.length > 1 ? 's' : ''}
                            </h2>
                            {Object.entries(groupedByDay).map(([day, fighters]) => (
                                <div key={day}>
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">{day}</h3>
                                    <ul className="space-y-1">
                                        {fighters.map((f, i) => (
                                            <li key={i} className="text-sm text-gray-700 flex justify-between">
                                                <span className="font-medium">{f.fighter}</span>
                                                <span className="text-gray-400 text-xs">{f.cate} — {f.startHour}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
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
