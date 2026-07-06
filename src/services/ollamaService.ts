import ollama from 'ollama';

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
