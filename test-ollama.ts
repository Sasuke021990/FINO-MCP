import ollama from 'ollama';

(async () => {
    try {
        console.log("Testing Ollama connection with qwen3.5:2b...");
        const response = await ollama.generate({
            model: 'qwen3.5:2b',
            prompt: 'Hello! Are you working?',
            stream: false
        });
        console.log("Response:", response.response);
    } catch (e) {
        console.error("Error:", e);
    }
})();
