import { Ollama } from 'ollama';

// The ollama client does not read OLLAMA_HOST itself - it must be passed explicitly,
// otherwise it always falls back to http://127.0.0.1:11434 regardless of the env var.
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' });

export async function extractDataFromImage(base64Image: string, prompt: string): Promise<string> {
    const response = await ollama.generate({
        model: 'qwen3.5:2b',
        prompt: prompt,
        images: [base64Image],
        format: 'json',
        think: false,
        stream: false,
        options: {
            temperature: 0.1
        }
    });

    return response.response;
}
