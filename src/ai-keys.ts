import { customToast } from './utils';
import { GoogleGenAI } from '@google/genai';

const API_KEYS = (process.env.GEMINI_API_KEY || "")
    .split(',')
    .map(k => k.replace(/[^a-zA-Z0-9_\-]/g, '').trim())
    .filter(Boolean);

let currentKeyIndex = 0;
const keyStatus = new Map<string, number>();
const EXHAUSTED_COOLDOWN = 10 * 60 * 1000; // 10 minutes

function isQuotaError(error: any) {
    if (!error) return false;
    // Rotate on 429 (Quota/Rate limit) OR 401/403 (Invalid key/unauthorized)
    const msg = error.message?.toLowerCase() || '';
    const status = error.status || error.code;
    return status === 429 || status === 401 || status === 403 || 
           msg.includes('429') || msg.includes('401') || msg.includes('403') || 
           msg.includes('quota') || msg.includes('exhausted') || 
           msg.includes('rate limit') || msg.includes('invalid authentication credentials');
}

export async function executeAiWithFallback<T>(action: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
    if (API_KEYS.length === 0) {
        customToast('Ключи API не настроены. Добавьте GEMINI_API_KEY в GitHub Secrets.');
        throw new Error('No API keys configured');
    }

    const now = Date.now();
    let attempts = 0;
    
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
            if (isQuotaError(error)) {
                console.warn(`Key at index ${currentKeyIndex} hit quota limit. Switching key...`);
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
                    customToast('Поиск свободного ключа...');
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                throw error;
            }
        }
    }
    
    customToast('Все свободные слоты заняты. Попробуйте позже.');
    throw new Error('All API keys exhausted');
}
