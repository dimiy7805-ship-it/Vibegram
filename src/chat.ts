import { supabase, state } from './supabase';
import { getStatusText } from './utils';
import { loadMessages, markMessagesAsRead } from './messages';

export async function loadChats() {
    try {
        const { data: members, error: membersError } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser.id);
        if (membersError) throw membersError;
        
        const list = document.getElementById('chats-list')!;
        
        if (!members || members.length === 0) {
            list.innerHTML = `<div class="text-center text-gray-400 mt-20 p-6"><span class="text-sm">У вас пока нет чатов.<br>Найдите друзей через поиск выше.</span></div>`;
            return;
        }
        
        const { data: chats, error: chatsError } = await supabase.from('chats').select(`id, type, title, avatar_url, description, is_public, chat_members(user_id, role, profiles(id, username, display_name, last_seen, is_online, avatar_url, bio)), messages(content, message_type, created_at, is_read, sender_id)`).in('id', members.map(m => m.chat_id));
        if (chatsError) throw chatsError;
        if (!chats) return;

        chats.forEach((chat: any) => {
            if (chat.messages) {
                chat.messages.sort((m1: any, m2: any) => new Date(m1.created_at).getTime() - new Date(m2.created_at).getTime());
            }
        });

        chats.sort((a: any, b: any) => {
            const dA = a.messages?.length ? new Date(a.messages[a.messages.length-1].created_at).getTime() : 0;
            const dB = b.messages?.length ? new Date(b.messages[b.messages.length-1].created_at).getTime() : 0;
            return dB - dA;
        });

        list.innerHTML = '';
        chats.forEach((chat: any) => {
            const isGroup = chat.type === 'group' || chat.type === 'channel';
            let chatName = chat.title;
            let isOnline = false;

            if (!isGroup) {
                const other = chat.chat_members?.find((m: any) => m.user_id !== state.currentUser.id);
                if(other?.profiles) {
                    chatName = other.profiles.display_name || other.profiles.username;
                    isOnline = other.profiles.is_online;
                }
            }

            const lastMsg = chat.messages?.length ? chat.messages[chat.messages.length - 1] : null;
            let previewText = '<span class="italic text-gray-400">Нет сообщений</span>';
            
            if (lastMsg) {
                if (lastMsg.message_type === 'voice') previewText = '🎤 Голосовое';
                else if (lastMsg.message_type === 'video_circle') previewText = '📹 Видеосообщение';
                else if (lastMsg.message_type === 'photo') previewText = '📷 Фото';
                else if (lastMsg.message_type === 'video') previewText = '🎥 Видео';
                else if (lastMsg.message_type === 'document') previewText = '📁 Файл';
                else previewText = lastMsg.content || '';
                
                if (lastMsg.sender_id === state.currentUser.id) {
                    previewText = `${lastMsg.is_read ? '✓✓' : '✓'} <span class="text-gray-600 truncate">${previewText}</span>`;
                } else {
                    previewText = `<span class="truncate">${previewText}</span>`;
                }
            }

            const firstLetter = (chatName || 'C')[0].toUpperCase();
            
            let avatarUrl = null;
            if (!isGroup) {
                const other = chat.chat_members?.find((m: any) => m.user_id !== state.currentUser.id);
                if(other?.profiles) avatarUrl = other.profiles.avatar_url;
            } else {
                avatarUrl = chat.avatar_url;
            }

            const div = document.createElement('div');
            div.className = `p-3.5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-center gap-3.5 ${state.activeChatId === chat.id ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`;
            div.dataset.chatId = chat.id;
            div.onclick = () => openChat(chat.id, chatName || 'Чат', firstLetter, isGroup, chat.type, chat.chat_members, avatarUrl, chat.description, chat.is_public);
            
            const avatarHtml = avatarUrl 
                ? `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">` 
                : `<div class="w-full h-full bg-gradient-to-br ${isGroup ? 'from-emerald-400 to-teal-500' : 'from-blue-400 to-indigo-500'} rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">${firstLetter}</div>`;

            const unreadCount = chat.messages ? chat.messages.filter((m: any) => !m.is_read && m.sender_id !== state.currentUser.id).length : 0;
            const unreadBadge = unreadCount > 0 ? `<div class="bg-blue-500 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">${unreadCount}</div>` : '';

            div.innerHTML = `
                <div class="relative shrink-0 w-12 h-12">
                    ${avatarHtml}
                    ${isOnline && !isGroup ? '<div class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full z-10"></div>' : ''}
                </div>
                <div class="flex-1 min-w-0 overflow-hidden flex flex-col justify-center">
                    <div class="flex justify-between items-center">
                        <div class="font-bold text-gray-900 dark:text-gray-100 truncate text-[15px]">${chatName || 'Неизвестно'}</div>
                        ${unreadBadge}
                    </div>
                    <div class="text-[14px] text-gray-500 dark:text-gray-400 truncate mt-0.5 flex items-center justify-between">${previewText}</div>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading chats:', error);
        const list = document.getElementById('chats-list')!;
        list.innerHTML = `<div class="text-center text-red-400 mt-20 p-6"><span class="text-sm">Ошибка загрузки чатов.<br>Проверьте подключение к сети.</span></div>`;
    }
}

export function updateTypingStatus() {
    const statusEl = document.getElementById('current-chat-status')!;
    if (!statusEl) return;
    
    if (state.typingUsers.size > 0) {
        const users = Array.from(state.typingUsers.values());
        const first = users[0];
        
        let actionText = 'печатает...';
        if (first.action === 'recording_voice') actionText = 'записывает аудио...';
        else if (first.action === 'recording_video') actionText = 'записывает видео...';
        else if (first.action === 'uploading_file') actionText = 'отправляет файл...';
        
        if (state.activeChatIsGroup) {
            statusEl.innerText = `${first.userName} ${actionText}`;
        } else {
            statusEl.innerText = actionText;
        }
        statusEl.className = 'text-xs font-medium text-blue-500 animate-pulse';
    } else {
        // Restore original status
        if(!state.activeChatIsGroup && state.activeChatOtherUser) {
            const status = getStatusText(state.activeChatOtherUser.is_online, state.activeChatOtherUser.last_seen);
            statusEl.innerText = status;
            statusEl.className = `text-xs font-medium ${status === 'в сети' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`;
        } else {
            // We'd need the member count here, but we can just leave it as is or fetch it.
            // For simplicity, we'll just set it to 'группа' or similar if we don't have the count handy.
            statusEl.innerText = state.activeChatDescription || 'Группа';
            statusEl.className = 'text-xs text-gray-500 dark:text-gray-400 font-medium';
        }
    }
}

export async function openChat(chatId: string, chatName: string, firstLetter: string, isGroup: boolean, chatType: string, members: any[], avatarUrl?: string, description?: string, isPublic?: boolean) {
    if (state.activeChatId && state.activeChatId !== chatId) {
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

    state.activeChatId = chatId;
    state.activeChatType = chatType as any;
    state.activeChatIsGroup = isGroup;
    state.activeChatDescription = description;
    state.activeChatIsPublic = isPublic || false;
    document.getElementById('current-chat-name')!.innerText = chatName;
    
    const headerContainer = document.getElementById('chat-header-container');
    if (headerContainer) {
        headerContainer.classList.add('cursor-pointer', 'hover:bg-gray-50', 'dark:hover:bg-gray-800');
    }
    
    const inputAreaEl = document.getElementById('input-area');
    if (inputAreaEl) inputAreaEl.style.display = 'block';
    
    // Update active chat styling in sidebar
    document.querySelectorAll('#chats-list > div').forEach(el => {
        if ((el as HTMLElement).dataset.chatId === chatId) {
            el.classList.add('bg-blue-50', 'dark:bg-blue-900/40');
        } else {
            el.classList.remove('bg-blue-50', 'dark:bg-blue-900/40', 'bg-blue-50/60', 'dark:bg-blue-900/30');
        }
    });
    
    const videoCallBtn = document.getElementById('video-call-btn');
    const audioCallBtn = document.getElementById('audio-call-btn');
    if (videoCallBtn && audioCallBtn) {
        if (isGroup) {
            videoCallBtn.classList.add('hidden');
            audioCallBtn.classList.add('hidden');
        } else {
            videoCallBtn.classList.remove('hidden');
            audioCallBtn.classList.remove('hidden');
        }
    }
    
    // Clear previous channel and typing state
    if (state.chatChannel) {
        supabase.removeChannel(state.chatChannel);
        state.chatChannel = null;
    }
    state.typingUsers.forEach(t => clearTimeout(t.timer));
    state.typingUsers.clear();
    updateTypingStatus();

    // Setup broadcast channel for typing indicators
    state.chatChannel = supabase.channel(`room:${chatId}`);
    state.chatChannel
        .on('broadcast', { event: 'typing' }, (payload: any) => {
            if (payload.payload.userId === state.currentUser.id) return;
            
            const userId = payload.payload.userId;
            const action = payload.payload.action; // 'typing', 'recording_voice', 'recording_video', 'uploading_file'
            const userName = payload.payload.userName;
            
            if (state.typingUsers.has(userId)) {
                clearTimeout(state.typingUsers.get(userId)!.timer);
            }
            
            const timer = setTimeout(() => {
                state.typingUsers.delete(userId);
                updateTypingStatus();
            }, 3000);
            
            state.typingUsers.set(userId, { action, timer, userName });
            updateTypingStatus();
        })
        .subscribe();
    
    const avatar = document.getElementById('chat-header-avatar')!;
    avatar.classList.remove('hidden'); avatar.classList.add('flex');
    
    if (avatarUrl) {
        avatar.innerHTML = `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">`;
        avatar.className = `w-10 h-10 mr-3 shadow-sm relative rounded-full`;
    } else {
        avatar.innerText = firstLetter;
        avatar.className = `w-10 h-10 bg-gradient-to-br ${isGroup ? 'from-emerald-400 to-teal-500' : 'from-blue-400 to-indigo-500'} rounded-full flex items-center justify-center text-white font-bold mr-3 shadow-sm relative`;
    }

    const statusEl = document.getElementById('current-chat-status')!;
    if(!isGroup) {
        state.activeChatOtherUser = members?.find(m => m.user_id !== state.currentUser.id)?.profiles;
        if(state.activeChatOtherUser) {
            const status = getStatusText(state.activeChatOtherUser.is_online, state.activeChatOtherUser.last_seen);
            statusEl.innerText = status;
            statusEl.className = `text-xs font-medium ${status === 'в сети' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`;
        }
    } else {
         statusEl.innerText = `${members ? members.length : 0} ${chatType === 'channel' ? 'подписчик(ов)' : 'участник(ов)'}`;
         statusEl.className = 'text-xs text-gray-500 dark:text-gray-400 font-medium';
    }

    // Handle channel input visibility
    const inputArea = document.getElementById('input-area');
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    if (chatType === 'channel') {
        const myRole = members?.find(m => m.user_id === state.currentUser.id)?.role;
        if (myRole === 'creator' || myRole === 'admin') {
            if (inputArea) inputArea.style.display = 'block';
            if (messageInput) messageInput.placeholder = 'Написать...';
        } else {
            if (inputArea) inputArea.style.display = 'none';
        }
    } else {
        if (inputArea) inputArea.style.display = 'block';
        if (messageInput) messageInput.placeholder = 'Написать...';
    }

    if (window.innerWidth < 768) {
        document.getElementById('sidebar')!.classList.add('hidden');
        document.getElementById('chat-area')!.classList.remove('hidden');
    }
    
    if ((window as any).handleInput) {
        (window as any).handleInput();
    }
    
    // Fast chat switching: show loader
    const list = document.getElementById('messages-list')!;
    list.innerHTML = '<div class="flex h-full items-center justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>';
    
    loadMessages(chatId, true);
    markMessagesAsRead(chatId);
}
