import { state } from './supabase';

export const getFakeEmail = (nick: string) => `${nick.toLowerCase().trim().replace(/[^a-z0-9]/g, '')}@vibegram.local`;

export const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function showError(msg: string, isSuccess = false) {
    const err = document.getElementById('auth-error')!;
    err.innerText = msg;
    err.className = `mt-4 text-sm font-medium h-4 transition-all ${isSuccess ? 'text-green-500' : 'text-red-500'}`;
}

export function getStatusText(isOnline: boolean, lastSeenStr: string) {
    if (isOnline) return 'в сети';
    if (!lastSeenStr) return 'был(а) недавно';
    const diffMinutes = Math.floor((new Date().getTime() - new Date(lastSeenStr).getTime()) / 1000 / 60);
    if (diffMinutes < 1) return 'был(а) только что';
    if (diffMinutes < 60) return `был(а) ${diffMinutes} мин. назад`;
    if (diffMinutes < 1440) return `был(а) ${Math.floor(diffMinutes / 60)} ч. назад`;
    return `был(а) ${new Date(lastSeenStr).toLocaleDateString('ru-RU')}`;
}

export function closeModal(e?: any) { 
    if(e && e.target.id !== 'modal-overlay' && e.type !== 'click') return;
    document.getElementById('modal-overlay')!.classList.add('hidden'); 
    state.groupCreationSelectedUsers = [];
    if ((window as any).toggleMediaSelectionMode) {
        (window as any).toggleMediaSelectionMode(false);
    }
}

export function scrollToBottom(smooth = true) { 
    setTimeout(() => {
        const list = document.getElementById('messages-list')!; 
        if (list) {
            list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'instant' }); 
        }
    }, 50);
}

let audioCtx: AudioContext | null = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Resume context on any click to bypass autoplay
document.addEventListener('click', () => {
    getAudioContext();
}, { once: true });
document.addEventListener('touchstart', () => {
    getAudioContext();
}, { once: true });

export function playNotificationSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        // Pluck/Pop sound
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
        console.warn('Audio play blocked or not supported', e);
    }
}

export function closeChatMobile() {
    if (state.activeChatId) {
        const list = document.getElementById('messages-list');
        if (list) {
            const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 50;
            if (isAtBottom) {
                state.chatScrollPositions.set(state.activeChatId, { type: 'bottom' });
            } else {
                let anchorId = null;
                let anchorOffset = 0;
                const children = Array.from(list.children) as HTMLElement[];
                for (let child of children) {
                    if (child.id && child.id.startsWith('msg-wrapper-')) {
                        const offset = child.offsetTop - list.scrollTop;
                        if (offset >= -50) {
                            anchorId = child.id;
                            anchorOffset = offset;
                            break;
                        }
                    }
                }
                if (anchorId) {
                    state.chatScrollPositions.set(state.activeChatId, { type: 'anchor', id: anchorId, offset: anchorOffset });
                } else {
                    state.chatScrollPositions.set(state.activeChatId, { type: 'bottom' });
                }
            }
        }
    }
    state.activeChatId = null; 
    document.getElementById('sidebar')!.classList.remove('hidden'); 
    document.getElementById('chat-area')!.classList.add('hidden'); 
    document.querySelectorAll('#chats-list > div').forEach(el => {
        el.classList.remove('bg-blue-50', 'dark:bg-blue-900/40', 'bg-blue-50/60', 'dark:bg-blue-900/30');
    });
    const headerContainer = document.getElementById('chat-header-container');
    if (headerContainer) {
        headerContainer.classList.remove('cursor-pointer', 'hover:bg-gray-50', 'dark:hover:bg-gray-800');
    }
}

export function customToast(message: string) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-gray-800/90 backdrop-blur-sm text-white px-5 py-2.5 rounded-full shadow-lg z-[100] text-sm opacity-0 transition-opacity duration-300 pointer-events-none';
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    
    // Trigger reflow
    void alertDiv.offsetWidth;
    
    alertDiv.classList.remove('opacity-0');
    
    setTimeout(() => {
        alertDiv.classList.add('opacity-0');
        setTimeout(() => {
            alertDiv.remove();
        }, 300);
    }, 2000);
}

export function customAlert(msg: string) {
    const modal = document.getElementById('modal-content')!;
    modal.innerHTML = `
        <div class="p-6">
            <div class="mb-6">
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Внимание</h3>
                <p class="text-gray-600 dark:text-gray-300">${msg}</p>
            </div>
            <div class="flex justify-end">
                <button onclick="closeModal()" class="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors">ОК</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');
}

export function customConfirm(msg: string): Promise<boolean> {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-content')!;
        modal.innerHTML = `
            <div class="p-6">
                <div class="mb-6">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Подтверждение</h3>
                    <p class="text-gray-600 dark:text-gray-300">${msg}</p>
                </div>
                <div class="flex justify-end gap-2">
                    <button id="confirm-cancel" class="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">Отмена</button>
                    <button id="confirm-ok" class="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors">Подтвердить</button>
                </div>
            </div>
        `;
        document.getElementById('modal-overlay')!.classList.remove('hidden');
        
        document.getElementById('confirm-cancel')!.onclick = () => {
            closeModal();
            resolve(false);
        };
        document.getElementById('confirm-ok')!.onclick = () => {
            closeModal();
            resolve(true);
        };
    });
}

export function customPrompt(title: string, defaultValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-content')!;
        modal.innerHTML = `
            <div class="p-6">
                <div class="mb-4">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">${title}</h3>
                    <textarea id="prompt-input" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-blue-500 text-gray-900 dark:text-gray-100 resize-none h-32">${defaultValue}</textarea>
                </div>
                <div class="flex justify-end gap-2">
                    <button id="prompt-cancel" class="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">Отмена</button>
                    <button id="prompt-ok" class="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors">Сохранить</button>
                </div>
            </div>
        `;
        document.getElementById('modal-overlay')!.classList.remove('hidden');
        
        const input = document.getElementById('prompt-input') as HTMLTextAreaElement;
        input.focus();
        
        document.getElementById('prompt-cancel')!.onclick = () => {
            closeModal();
            resolve(null);
        };
        document.getElementById('prompt-ok')!.onclick = () => {
            closeModal();
            resolve(input.value);
        };
    });
}
