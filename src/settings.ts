import { supabase, state } from './supabase';
import { closeModal } from './utils';
import { loadChats } from './chat';
import { logout } from './auth';

export function openSettings() {
    const modal = document.getElementById('modal-content')!;
    const nickname = state.currentProfile?.display_name || state.currentProfile?.username || 'User';
    const avatarUrl = state.currentProfile?.avatar_url || '';
    const bio = state.currentProfile?.bio || '';
    const settings = state.currentProfile?.settings || { notifications: true, privacy: 'everyone', theme: 'light', textSize: 15, chatBg: '#ffffff' };
    const isDark = document.documentElement.classList.contains('dark');

    modal.innerHTML = `
        <div class="p-6 overflow-y-auto custom-scrollbar flex-1">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Настройки</h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">✕</button>
            </div>
            
            <div class="flex flex-col items-center mb-6 relative group">
                <div class="w-28 h-28 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center text-white text-4xl font-bold shadow-lg overflow-hidden relative cursor-pointer" onclick="document.getElementById('avatar-upload').click()">
                    ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover">` : nickname[0].toUpperCase()}
                    <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    </div>
                </div>
                <input type="file" id="avatar-upload" accept="image/*" class="hidden" onchange="uploadAvatar(event)">
                <div class="text-sm text-gray-500 dark:text-gray-400 mt-2 font-medium">Изменить фото</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1 font-medium">@${state.currentProfile?.username || ''}</div>
            </div>

        <div class="space-y-5 mb-6">
            <div>
                <label class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider ml-1">Профиль</label>
                <div class="bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden mt-1">
                    <input type="text" id="settings-name" value="${nickname}" placeholder="Имя" class="w-full p-3.5 bg-transparent border-b border-gray-200 dark:border-gray-700 outline-none font-medium text-gray-800 dark:text-gray-100" onchange="saveSettings()">
                    <textarea id="settings-bio" placeholder="О себе" class="w-full p-3.5 bg-transparent outline-none font-medium text-gray-800 dark:text-gray-100 resize-none h-20" onchange="saveSettings()">${bio}</textarea>
                </div>
            </div>
            
            <div>
                <label class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider ml-1">Настройки чатов</label>
                <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-2 mt-1 space-y-1">
                    <div class="flex items-center justify-between p-3">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-500 dark:text-purple-400">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                            </div>
                            <span class="font-medium text-gray-700 dark:text-gray-200">Темная тема</span>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="settings-theme" class="sr-only peer" ${isDark ? 'checked' : ''} onchange="document.documentElement.classList.toggle('dark', this.checked); saveSettings()">
                            <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                        </label>
                    </div>
                    <div class="p-3">
                        <div class="flex justify-between items-center mb-2">
                            <span class="font-medium text-gray-700 dark:text-gray-200">Размер текста</span>
                            <span class="text-sm text-gray-500" id="text-size-val">${settings.textSize || 15}px</span>
                        </div>
                        <input type="range" id="settings-text-size" min="12" max="24" value="${settings.textSize || 15}" class="w-full accent-blue-500" oninput="document.getElementById('text-size-val').innerText = this.value + 'px'" onchange="saveSettings()">
                    </div>
                </div>
            </div>

            <div>
                <label class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider ml-1">Конфиденциальность</label>
                <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-2 mt-1 space-y-1">
                    <div class="flex flex-col p-3 border-b border-gray-200 dark:border-gray-700">
                        <span class="font-medium text-gray-700 dark:text-gray-200 mb-2">Фон чата</span>
                        <div class="flex gap-2 overflow-x-auto p-1">
                            ${[
                                { id: 'default', class: 'chat-bg' },
                                { id: 'bg-anim-1', class: 'bg-anim-1' },
                                { id: 'bg-anim-2', class: 'bg-anim-2' },
                                { id: 'bg-anim-3', class: 'bg-anim-3' },
                                { id: 'bg-anim-4', class: 'bg-anim-4' },
                                { id: 'bg-anim-5', class: 'bg-anim-5' },
                                { id: 'bg-anim-6', class: 'bg-anim-6' },
                                { id: 'bg-anim-7', class: 'bg-anim-7' },
                                { id: 'bg-pattern-dots', class: 'bg-pattern-dots' }
                            ].map(bg => `
                                <div onclick="document.getElementById('settings-chat-bg').value = '${bg.id}'; document.querySelectorAll('.bg-preview').forEach(el => el.classList.remove('ring-2', 'ring-inset', 'ring-blue-500')); this.classList.add('ring-2', 'ring-inset', 'ring-blue-500'); saveSettings();" 
                                     class="bg-preview shrink-0 w-12 h-12 rounded-xl cursor-pointer ${bg.class} ${settings.chatBg === bg.id || (!settings.chatBg && bg.id === 'default') ? 'ring-2 ring-inset ring-blue-500' : ''} shadow-sm border border-gray-200 dark:border-gray-700">
                                </div>
                            `).join('')}
                        </div>
                        <input type="hidden" id="settings-chat-bg" value="${settings.chatBg || 'default'}">
                    </div>
                    <div class="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
                        <span class="font-medium text-gray-700 dark:text-gray-200">Кто видит время захода</span>
                        <select id="settings-privacy" class="bg-transparent text-blue-500 font-medium outline-none text-right" onchange="saveSettings()">
                            <option value="everyone" ${settings.privacy === 'everyone' ? 'selected' : ''}>Все</option>
                            <option value="nobody" ${settings.privacy === 'nobody' ? 'selected' : ''}>Никто</option>
                        </select>
                    </div>
                    <div class="flex items-center justify-between p-3">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-500 dark:text-blue-400">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                            </div>
                            <span class="font-medium text-gray-700 dark:text-gray-200">Уведомления</span>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="settings-notif" class="sr-only peer" ${settings.notifications ? 'checked' : ''} onchange="saveSettings()">
                            <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        <button onclick="logout()" class="w-full py-4 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-red-600 dark:text-red-400 rounded-2xl font-semibold flex items-center justify-center gap-2 mb-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3-3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            Выйти из аккаунта
        </button>
        <button onclick="deleteAccount()" class="w-full py-4 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-red-600 dark:text-red-400 rounded-2xl font-semibold flex items-center justify-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            Удалить аккаунт
        </button>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');
}

export async function uploadAvatar(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    
    const safeName = `${state.currentUser.id}_${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('vibegram_avatars').upload(safeName, file);
    
    if (!error) {
        const url = supabase.storage.from('vibegram_avatars').getPublicUrl(safeName).data.publicUrl;
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', state.currentUser.id);
        state.currentProfile.avatar_url = url;
        openSettings(); // Refresh modal
        
        // Update main UI
        const myAvatar = document.getElementById('my-avatar');
        if(myAvatar) myAvatar.innerHTML = `<img src="${url}" class="w-full h-full object-cover">`;
    } else {
        alert('Ошибка загрузки аватара');
    }
}

export async function saveSettings() {
    const newName = (document.getElementById('settings-name') as HTMLInputElement).value.trim();
    const newBio = (document.getElementById('settings-bio') as HTMLTextAreaElement).value.trim();
    const notif = (document.getElementById('settings-notif') as HTMLInputElement).checked;
    const theme = (document.getElementById('settings-theme') as HTMLInputElement).checked ? 'dark' : 'light';
    const textSize = parseInt((document.getElementById('settings-text-size') as HTMLInputElement).value) || 15;
    const privacy = (document.getElementById('settings-privacy') as HTMLSelectElement).value;
    const chatBg = (document.getElementById('settings-chat-bg') as HTMLInputElement).value;
    
    if(!newName) return alert('Имя не может быть пустым');
    
    const oldSettings = state.currentProfile?.settings || {};
    const newSettings = { ...oldSettings, notifications: notif, privacy, theme, textSize, chatBg };
    
    await supabase.from('profiles').update({ 
        display_name: newName, 
        bio: newBio,
        settings: newSettings
    }).eq('id', state.currentUser.id);
    
    state.currentProfile.display_name = newName; 
    state.currentProfile.bio = newBio;
    state.currentProfile.settings = newSettings;
    
    document.getElementById('my-nickname')!.innerText = newName;
    
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    // Apply text size to messages using a CSS variable
    document.documentElement.style.setProperty('--msg-text-size', `${textSize}px`);
    
    if (chatBg && chatBg !== 'default') {
        const chatContainer = document.getElementById('chat-area');
        if (chatContainer) {
            chatContainer.className = chatContainer.className.replace(/bg-anim-\d|bg-pattern-dots|chat-bg/g, '').trim();
            chatContainer.classList.add(chatBg);
        }
    } else {
        const chatContainer = document.getElementById('chat-area');
        if (chatContainer) {
            chatContainer.className = chatContainer.className.replace(/bg-anim-\d|bg-pattern-dots|chat-bg/g, '').trim();
            chatContainer.classList.add('chat-bg');
        }
    }
    
    loadChats();
}
