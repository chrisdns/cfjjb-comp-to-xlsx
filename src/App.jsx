import {useState} from 'react';

function App() {
    const [url, setUrl] = useState('');
    const [academy, setAcademy] = useState('');
    const [filename, setFilename] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const match = url.match(/\/info\/(\d+)/);
            if (!match) throw new Error('URL invalide — impossible de trouver l\'ID de la compétition');
            const id = match[1];

            const response = await fetch(`/generate?id=${id}&academy=${encodeURIComponent(academy)}`);

            if (!response.ok) throw new Error('Failed to fetch XLSX file');

            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `${filename || `planning_${id}`}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
            <div className="w-full p-6 sm:max-w-sm sm:border sm:border-gray-200 sm:rounded-2xl sm:p-8 sm:shadow-lg">
                <h1 className="text-lg font-bold text-gray-800 mb-1">Planning Compétition JJB</h1>
                <p className="text-sm text-gray-500 mb-6">
                    Générez un fichier Excel avec le planning de votre académie pour une compétition CFJJB. Le fichier contient les combattants filtrés par club, triés par jour et heure de passage.
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
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
                        {loading ? 'Génération en cours...' : 'Générer le fichier .xlsx'}
                    </button>
                </form>

                <p className="text-xs text-gray-400 mt-6 text-center leading-relaxed">
                    Collez l'URL d'une compétition depuis <a href="https://cfjjb.com/" target="_blank" rel="noopener noreferrer" className="underline text-red-500 hover:text-red-600">cfjjb.com</a> pour générer le fichier Excel du planning.
                </p>
            </div>
        </div>
    );
}

export default App
