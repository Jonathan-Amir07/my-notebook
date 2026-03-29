const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * GeminiAI — Server-side utility for the Academic Pipeline
 * 
 * Uses the standard Google Generative AI SDK to process lecture text 
 * into structured study materials.
 * 
 * Requires: process.env.GEMINI_API_KEY
 */
class GeminiAI {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            console.error('CRITICAL: GEMINI_API_KEY is missing from environment variables.');
        }
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'no-key-found');
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }

    /**
     * analyzeContent — Universal entry point for processing lecture modules
     * @param {string} text — Raw lecture text
     * @param {string} prompt — The specific instruction (Notebook, MindMap, etc)
     * @param {boolean} isJson — Whether to force JSON output
     */
    async analyzeContent(text, prompt, isJson = false) {
        try {
            const config = isJson ? { responseMimeType: "application/json" } : {};
            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nLECTURE TEXT:\n${text}` }] }],
                generationConfig: config
            });

            const responseText = result.response.text();
            return isJson ? JSON.parse(responseText) : responseText;
        } catch (error) {
            console.error('Gemini AI Error:', error);
            throw new Error('AI processing failed. Please check your API configuration.');
        }
    }
}

module.exports = new GeminiAI();
