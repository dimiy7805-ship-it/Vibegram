import { supabase, state } from './supabase';
import { getFakeEmail, showError, customConfirm } from './utils';
import { loadChats } from './chat';
import { initWebRTC } from './webrtc';

export async function register() {
    const nick = (document.getElementById('auth-nick') as HTMLInputElement).value.trim();
    const pass = (document.getElementById('auth-pass') as HTMLInputElement).value;
    if(!nick || pass.length < 6) return showError('Ник и пароль (от 6 символов) обязательны!');
    
    const btn = event?.target as HTMLButtonElement | undefined;
    const oldText = btn?.innerText || 'Создать аккаунт';
    if (btn) { btn.innerText = 'Создаем...'; btn.disabled = true; }

    try {
        const { error } = await supabase.auth.signUp({ 
            email: getFakeEmail(nick), password: pass, options: { data: { nickname: nick } } 
        });

        if (btn) { btn.innerText = oldText; btn.disabled = false; }
        if (error) showError(error.message.includes('already registered') ? 'Этот никнейм уже занят.' : 'Ошибка регистрации.'); 
        else { showError('Аккаунт создан! Входим...', true); setTimeout(login, 800); }
    } catch (err) {
        if (btn) { btn.innerText = oldText; btn.disabled = false; }
        showError('Ошибка сети. Проверьте подключение или статус Supabase.');
    }
}

export async function login() {
    const nick = (document.getElementById('auth-nick') as HTMLInputElement).value.trim();
    const pass = (document.getElementById('auth-pass') as HTMLInputElement).value;
    if(!nick || !pass) return showError('Введите данные.');

    const btn = event?.target as HTMLButtonElement | undefined;
    const oldText = btn?.innerText || 'Войти';
    if (btn) { btn.innerText = 'Входим...'; btn.disabled = true; }

    try {
        const { error } = await supabase.auth.signInWithPassword({ email: getFakeEmail(nick), password: pass });
        if (btn) { btn.innerText = oldText; btn.disabled = false; }

        if (error) showError('Неверный никнейм или пароль'); else checkUser();
    } catch (err) {
        if (btn) { btn.innerText = oldText; btn.disabled = false; }
        showError('Ошибка сети. Проверьте подключение или статус Supabase.');
    }
}

export async function checkUser() {
    try {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
            console.error('Auth error:', error);
            return;
        }
        if (user) {
            state.currentUser = user;
            let { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            
            // Fallback if trigger failed to create profile
            if (!data) {
                const nickname = user.user_metadata?.nickname || 'User';
                const username = 'user_' + user.id.substring(0, 8);
                await supabase.from('profiles').insert({ id: user.id, display_name: nickname, username });
                const { data: newData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
                data = newData;
            }
            
            state.currentProfile = data;
            
            document.getElementById('auth-screen')!.classList.add('hidden');
            document.getElementById('app-screen')!.classList.remove('hidden');
            
            const nickname = state.currentProfile?.display_name || state.currentProfile?.username || 'User';
            document.getElementById('my-nickname')!.innerText = nickname;
            
            const avatarUrl = state.currentProfile?.avatar_url;
            document.getElementById('my-avatar')!.innerHTML = `${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">` : nickname.charAt(0).toUpperCase()} <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-10"></div>`;
            
            const theme = state.currentProfile?.settings?.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            
            const textSize = state.currentProfile?.settings?.textSize || 15;
            document.documentElement.style.setProperty('--msg-text-size', `${textSize}px`);
            
            const chatBg = state.currentProfile?.settings?.chatBg;
            const chatContainer = document.getElementById('chat-area');
            if (chatContainer) {
                chatContainer.className = chatContainer.className.replace(/bg-anim-\d|bg-pattern-dots|chat-bg/g, '').trim();
                if (chatBg && chatBg !== 'default') {
                    chatContainer.classList.add(chatBg);
                } else {
                    chatContainer.classList.add('chat-bg');
                }
            }
            
            setOnlineStatus(true);
            window.addEventListener('focus', () => setOnlineStatus(true));
            window.addEventListener('blur', () => setOnlineStatus(false));
            window.addEventListener('beforeunload', () => setOnlineStatus(false));

            if ("Notification" in window) {
                if (Notification.permission !== "granted" && Notification.permission !== "denied") {
                    Notification.requestPermission();
                }
            }

            loadChats();
            initWebRTC(); // Initialize WebRTC listener for incoming calls
            handleInviteLink();
        }
    } catch (err) {
        console.error('Failed to check user:', err);
        showError('Ошибка сети. Проверьте подключение или статус Supabase.');
    }
}

async function handleInviteLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const channelId = urlParams.get('channel');
    if (channelId) {
        // Remove the parameter from the URL without reloading
        window.history.replaceState({}, document.title, window.location.pathname);
        
        try {
            const { data: channel } = await supabase.from('chats').select('*').eq('id', channelId).eq('type', 'channel').single();
            if (channel) {
                import('./search').then(m => m.joinChannel(channel));
            } else {
                import('./utils').then(m => m.customAlert('Канал не найден.'));
            }
        } catch (e) {
            console.error('Error joining channel from link:', e);
        }
    }
}

export async function setOnlineStatus(isOnline: boolean) {
    if(!state.currentUser) return;
    await supabase.from('profiles').update({ is_online: isOnline, last_seen: new Date().toISOString() }).eq('id', state.currentUser.id);
}

export async function logout() { 
    const confirmed = await customConfirm('Вы уверены, что хотите выйти из аккаунта?');
    if (!confirmed) return;
    
    await setOnlineStatus(false);
    await supabase.auth.signOut(); 
    window.location.reload(); 
}

export async function deleteAccount() {
    const confirmed = await customConfirm('Вы уверены, что хотите удалить аккаунт? Это действие необратимо, все ваши данные будут удалены.');
    if (!confirmed) return;
    
    if (state.currentUser) {
        // Delete profile (will cascade to messages and chat_members)
        await supabase.from('profiles').delete().eq('id', state.currentUser.id);
        await setOnlineStatus(false);
        await supabase.auth.signOut();
        window.location.reload();
    }
}
