import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { state } from './supabase';
import { renderMediaModal } from './messages-media';
import { executeAiWithFallback } from './ai-keys';
import { customAlert } from './utils';

export async function generateAiImage() {
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    if (!input) return;
    
    let text = input.value;
    if (!text.startsWith('@ai ')) return;
    const prompt = text.replace('@ai ', '').trim();
    if (!prompt) return alert('Введите запрос для генерации');

    // Setup loading UI
    const generateBtn = document.getElementById('ai-generate-btn') as HTMLButtonElement;
    generateBtn.disabled = true;
    const originalContent = generateBtn.innerHTML;
    generateBtn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';
    
    // Add loading overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/60 z-[200] flex flex-col items-center justify-center text-white backdrop-blur-sm transition-opacity duration-300';
    overlay.innerHTML = `
        <div class="w-20 h-20 mb-4 relative">
            <div class="absolute inset-0 rounded-full border-4 border-purple-500/30"></div>
            <div class="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
            <svg class="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        </div>
        <div class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500 animate-pulse">Создаем магию...</div>
        <div class="text-sm text-gray-300 mt-2">Рисуем: ${prompt}</div>
    `;
    document.body.appendChild(overlay);

    try {
        const response = await executeAiWithFallback(async (ai: GoogleGenAI) => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: prompt,
                config: {
                    outputLanguage: "ru"
                }
            });
        });

        let base64EncodeString = '';
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData && part.inlineData.data) {
                base64EncodeString = part.inlineData.data;
                break;
            }
        }

        if (!base64EncodeString) {
            const finishReason = response.candidates?.[0]?.finishReason;
            if (finishReason === 'SAFETY') {
                 throw new Error("Ваш запрос заблокирован внутренним фильтром безопасности нейросети. Попробуйте изменить формулировку.");
            }
            console.error("AI Generation Response missing image data:", JSON.stringify(response));
            throw new Error("Не удалось сгенерировать изображение. Возможно, запрос заблокирован фильтром безопасности.");
        }

        const byteCharacters = atob(base64EncodeString);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type: 'image/jpeg'});
        
        // Create a File object
        const file = new File([blob], `ai_generated_${Date.now()}.jpg`, { type: 'image/jpeg' });
        (file as any).asFile = false; // Important flag to treat as media, not generic file
        
        // Add to selected files
        state.selectedFiles = [...state.selectedFiles, file];
        
        // Clear input and update UI
        input.value = '';
        input.style.height = '';
        if ((window as any).handleInput) {
            (window as any).handleInput();
        }
        
        // Open the media modal
        document.getElementById('modal-overlay')?.classList.remove('hidden');
        renderMediaModal();
        
    } catch (e: any) {
        console.error('AI Error:', e);
        if (!e.message?.includes('All API keys exhausted')) {
            let errorMessage = 'Произошла неизвестная ошибка при генерации изображения.';
            const errText = e.message?.toLowerCase() || '';
            
            if (errText.includes('quota') || errText.includes('429') || errText.includes('exhausted') || errText.includes('rate limit')) {
                errorMessage = '⚡ Превышен лимит запросов к нейросети. Пожалуйста, попробуйте немного позже.';
            } else if (errText.includes('safety') || errText.includes('blocked') || errText.includes('filter')) {
                errorMessage = '🛡️ Ваш запрос отклонен фильтром безопасности. Попробуйте изменить формулировку.';
            } else if (e.message) {
                errorMessage = '🤖 Ошибка: ' + e.message;
            }
            
            customAlert(errorMessage);
        }
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = originalContent;
        // Fade out overlay
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.remove(), 300);
    }
}
(window as any).generateAiImage = generateAiImage;
