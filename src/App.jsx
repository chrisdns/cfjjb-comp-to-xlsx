import {useState} from 'react';

function App() {
    const [id, setId] = useState('');
    const [academy, setAcademy] = useState('infinity');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch(`/generate?id=${id}&academy=${academy}`, {
                method: 'GET',
                headers: {'Content-Type': 'application/json'},
            });

            if (!response.ok) throw new Error('Failed to fetch XLSX file');

            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `planning_${academy}_${id}.xlsx`;
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
        <div className="min-h-screen flex items-center justify-center bg-white text-gray-800 px-4 relative">
            <div className="bg-white border border-red-600 shadow-red-700 shadow-2xl rounded-2xl p-8 w-full max-w-md">
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="relative">
                        <input
                            type="number"
                            id="id"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            required
                            className="peer w-full px-2 pt-6 pb-2 bg-transparent border-b-2 border-gray-300 text-gray-800 focus:outline-none focus:border-red-500"
                            placeholder=" "
                        />
                        <label
                            htmlFor="id"
                            className="absolute left-2 top-2 text-gray-500 text-sm transition-all peer-placeholder-shown:top-5 peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-500 peer-focus:top-2 peer-focus:text-sm peer-focus:text-red-500"
                        >
                            CFJJB competition ID
                        </label>
                    </div>

                    {/*<div className="relative">*/}
                    {/*    <input*/}
                    {/*        type="text"*/}
                    {/*        id="academy"*/}
                    {/*        value={academy}*/}
                    {/*        onChange={(e) => setAcademy(e.target.value)}*/}
                    {/*        required*/}
                    {/*        className="peer w-full px-2 pt-6 pb-2 bg-transparent border-b-2 border-gray-300 text-gray-800 focus:outline-none focus:border-red-500"*/}
                    {/*        placeholder=" "*/}
                    {/*    />*/}
                    {/*    <label*/}
                    {/*        htmlFor="academy"*/}
                    {/*        className="absolute left-2 top-2 text-gray-500 text-sm transition-all peer-placeholder-shown:top-5 peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-500 peer-focus:top-2 peer-focus:text-sm peer-focus:text-red-500"*/}
                    {/*    >*/}
                    {/*        Academy Filter*/}
                    {/*    </label>*/}
                    {/*</div>*/}

                    <button
                        type="submit"
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-800 transition duration-300 uppercase tracking-wider cursor-pointer"
                    >
                        Generate .xlsx file
                    </button>
                </form>
            </div>

            {loading && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-70 backdrop-blur-sm">
                    <div className="text-red-500 text-6xl animate-spin">∞</div>
                </div>
            )}
        </div>
    );
}

export default App
