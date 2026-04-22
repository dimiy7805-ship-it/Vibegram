import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '50mb' }));

// Key management logic for AI Fallback on the server
const API_KEYS = (process.env.GEMINI_API_KEY || "")
    .split(',')
    .map(k => k.replace(/[^a-zA-Z0-9_\-]/g, '').trim())
    .filter(Boolean);

let currentKeyIndex = 0;
const keyStatus = new Map<string, number>();
const EXHAUSTED_COOLDOWN = 10 * 60 * 1000; // 10 minutes

function isQuotaError(error: any) {
    if (!error) return false;
    const msg = error.message?.toLowerCase() || '';
    const status = error.status || error.code;
    return status === 429 || status === 401 || status === 403 || 
           msg.includes('429') || msg.includes('401') || msg.includes('403') || 
           msg.includes('quota') || msg.includes('exhausted') || 
           msg.includes('rate limit') || msg.includes('invalid authentication credentials');
}

function isTransientError(error: any) {
    if (!error) return false;
    const msg = error.message?.toLowerCase() || '';
    const status = error.status || error.code;
    return status === 500 || status === 503 || status === 504 || msg.includes('503') || msg.includes('500') || msg.includes('504') || msg.includes('overloaded');
}

async function executeAiWithFallback<T>(action: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
    if (API_KEYS.length === 0) {
        throw new Error('No API keys configured');
    }

    const now = Date.now();
    let attempts = 0;
    let transientRetries = 0;
    let lastError: any = null;
    
    while (attempts < API_KEYS.length) {
        const apiKey = API_KEYS[currentKeyIndex];
        const exhaustedAt = keyStatus.get(apiKey) || 0;
        
        if (now - exhaustedAt < EXHAUSTED_COOLDOWN) {
            currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
            attempts++;
            continue;
        }

        const ai = new GoogleGenAI({ apiKey });
        
        try {
            return await action(ai);
        } catch (error: any) {
            lastError = error;
            
            if (isTransientError(error) && transientRetries < 3) {
                 console.warn('Model overloaded (503), retrying in 2 seconds...', error.message);
                 transientRetries++;
                 await new Promise(r => setTimeout(r, 2000));
                 continue; // Retry same key
            }
            
            if (isQuotaError(error)) {
                console.warn(`Key at index ${currentKeyIndex} hit quota/auth error. Switching key...`, error.message);
                keyStatus.set(apiKey, Date.now());
                currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
                attempts++;
                
                let hasUnexhaustedKeys = false;
                for (let i = 0; i < API_KEYS.length; i++) {
                    if (now - (keyStatus.get(API_KEYS[i]) || 0) >= EXHAUSTED_COOLDOWN) {
                        hasUnexhaustedKeys = true;
                        break;
                    }
                }
                
                if (attempts < API_KEYS.length && hasUnexhaustedKeys) {
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                throw error;
            }
        }
    }
    
    console.error('All keys exhausted!', lastError);
    throw lastError || new Error('All API keys exhausted');
}

app.post('/api/ai/transcribe', async (req, res) => {
    try {
        const { base64data, mimeType } = req.body;
        
        if (!base64data || !mimeType) {
            return res.status(400).json({ error: 'Missing media data' });
        }

        const result = await executeAiWithFallback(async (ai: GoogleGenAI) => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: 'Transcribe this audio/video. Return only the transcription text in the language spoken. If there is no speech, return an empty string.' },
                            { inlineData: { data: base64data, mimeType } }
                        ]
                    }
                ]
            });
        });

        const transcription = result.text?.trim() || 'Нет речи';
        res.json({ text: transcription });
    } catch (err: any) {
        console.error('SERVER TRANSCRIBE ERROR:', err);
        res.status(500).json({ error: err.message, status: err.status || 500 });
    }
});

app.post('/api/ai/image', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

        const result = await executeAiWithFallback(async (ai: GoogleGenAI) => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: prompt,
                config: {
                    imageConfig: { aspectRatio: "1:1" }
                }
            });
        });

        // Find correct image data part
        let base64EncodeString = '';
        for (const part of result.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData && part.inlineData.data) {
                base64EncodeString = part.inlineData.data;
                break;
            }
        }

        if (!base64EncodeString) {
             const finishReason = result.candidates?.[0]?.finishReason;
             if (finishReason === 'SAFETY') {
                 return res.status(400).json({ error: "SAFETY" });
             }
             return res.status(500).json({ error: "NO_IMAGE_DATA" });
        }

        res.json({ base64: base64EncodeString });
    } catch (err: any) {
        console.error('SERVER IMAGE GENERATE ERROR:', err);
        let errorMsg = err.message;
        if (err.message?.includes('SAFETY')) {
            errorMsg = 'SAFETY';
        }
        res.status(500).json({ error: errorMsg, status: err.status || 500 });
    }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
