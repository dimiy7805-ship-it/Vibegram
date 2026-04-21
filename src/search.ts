import { supabase, state } from './supabase';
import { loadChats, openChat } from './chat';

let searchTimeout: any;
export function searchUsers(q: string) {
    clearTimeout(searchTimeout);
    const resultsBox = document.getElementById('search-results')!;
    if (q.length < 2) { resultsBox.classList.add('hidden'); return; }
    
    searchTimeout = setTimeout(async () => {
        if (q.startsWith('vibe_')) {
            const { data: channel } = await supabase.from('chats').select('*').eq('invite_key', q).single();
            if (channel) {
                resultsBox.innerHTML = '';
                const title = channel.title;
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors';
                const avatarHtml = channel.avatar_url ? `<img src="${channel.avatar_url}" class="w-full h-full object-cover rounded-full">` : title[0].toUpperCase();
                div.innerHTML = `<div class="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden">${avatarHtml}</div><div class="flex-1"><span class="font-semibold text-gray-800 dark:text-gray-100 block">${title}</span><span class="text-xs text-gray-500">По ключу-приглашению</span></div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; joinChannelWithKey(channel, q); };
                resultsBox.appendChild(div);
                resultsBox.classList.remove('hidden');
            } else {
                resultsBox.innerHTML = '<div class="p-4 text-sm text-gray-500 text-center font-medium">Ключ не найден или уже использован</div>';
                resultsBox.classList.remove('hidden');
            }
            return;
        }

        const { data: users } = await supabase.from('profiles').select('*').ilike('display_name', `%${q}%`).neq('id', state.currentUser.id).limit(10);
        const { data: groups } = await supabase.from('chats').select('*').eq('type', 'group').ilike('title', `%${q}%`).limit(10);
        const { data: channels } = await supabase.from('chats').select('*').eq('type', 'channel').eq('is_public', true).ilike('title', `%${q}%`).limit(10);
        
        if((!users || users.length === 0) && (!groups || groups.length === 0) && (!channels || channels.length === 0)) {
            resultsBox.innerHTML = '<div class="p-4 text-sm text-gray-500 text-center font-medium">Ничего не найдено</div>';
        } else {
            resultsBox.innerHTML = '';
            users?.forEach(u => {
                const nickname = u.display_name || u.username;
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors';
                const avatarHtml = u.avatar_url ? `<img src="${u.avatar_url}" class="w-full h-full object-cover rounded-full">` : nickname[0].toUpperCase();
                div.innerHTML = `<div class="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden">${avatarHtml}</div><div class="flex-1"><span class="font-semibold text-gray-800 dark:text-gray-100 block">${nickname}</span></div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; startChatWithUser(u); };
                resultsBox.appendChild(div);
            });
            groups?.forEach(g => {
                const title = g.title;
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors';
                const avatarHtml = g.avatar_url ? `<img src="${g.avatar_url}" class="w-full h-full object-cover rounded-full">` : title[0].toUpperCase();
                div.innerHTML = `<div class="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden">${avatarHtml}</div><div class="flex-1"><span class="font-semibold text-gray-800 dark:text-gray-100 block">${title}</span><span class="text-xs text-gray-500">Группа</span></div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; joinGroup(g); };
                resultsBox.appendChild(div);
            });
            channels?.forEach(c => {
                const title = c.title;
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors';
                const avatarHtml = c.avatar_url ? `<img src="${c.avatar_url}" class="w-full h-full object-cover rounded-full">` : title[0].toUpperCase();
                div.innerHTML = `<div class="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden">${avatarHtml}</div><div class="flex-1"><span class="font-semibold text-gray-800 dark:text-gray-100 block">${title}</span><span class="text-xs text-gray-500">Канал</span></div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; joinChannel(c); };
                resultsBox.appendChild(div);
            });
        }
        resultsBox.classList.remove('hidden');
    }, 300);
}

export async function joinChannelWithKey(channel: any, key: string) {
    const { data: existing } = await supabase.from('chat_members').select('*').eq('chat_id', channel.id).eq('user_id', state.currentUser.id).single();
    if (existing) {
        openChat(channel.id, channel.title, channel.title[0].toUpperCase(), true, 'channel', [], channel.avatar_url, channel.description, channel.is_public);
        return;
    }
    
    // Clear the key so it can't be used again
    await supabase.from('chats').update({ invite_key: null }).eq('id', channel.id);
    
    await supabase.from('chat_members').insert({ chat_id: channel.id, user_id: state.currentUser.id, role: 'member' });
    const { data: members } = await supabase.from('chat_members').select('user_id').eq('chat_id', channel.id);
    
    loadChats();
    openChat(channel.id, channel.title, channel.title[0].toUpperCase(), true, 'channel', members || [], channel.avatar_url, channel.description, channel.is_public);
}

export async function joinGroup(group: any) {
    const { data: existing } = await supabase.from('chat_members').select('*').eq('chat_id', group.id).eq('user_id', state.currentUser.id).single();
    if (existing) {
        if (existing.role === 'pending') {
            import('./utils').then(m => m.customAlert('Заявка на вступление уже отправлена. Ожидайте подтверждения.'));
        } else {
            const { data: members } = await supabase.from('chat_members').select('*, profiles(*)').eq('chat_id', group.id);
            import('./chat').then(m => m.openChat(group.id, group.title, group.title[0].toUpperCase(), true, group.type, members || [], group.avatar_url, group.description, group.is_public));
        }
    } else {
        await supabase.from('chat_members').insert({ chat_id: group.id, user_id: state.currentUser.id, role: 'pending' });
        import('./utils').then(m => m.customAlert('Заявка на вступление отправлена.'));
    }
}

export async function joinChannel(channel: any) {
    const { data: existing } = await supabase.from('chat_members').select('*').eq('chat_id', channel.id).eq('user_id', state.currentUser.id).single();
    if (!existing) {
        await supabase.from('chat_members').insert({ chat_id: channel.id, user_id: state.currentUser.id, role: 'member' });
        import('./utils').then(m => m.customAlert('Вы подписались на канал.'));
    }
    
    const { data: members } = await supabase.from('chat_members').select('*, profiles(*)').eq('chat_id', channel.id);
    loadChats();
    import('./chat').then(m => m.openChat(channel.id, channel.title, channel.title[0].toUpperCase(), true, 'channel', members || [], channel.avatar_url, channel.description, channel.is_public));
}

export async function startChatWithUser(userToFind: any) {
    const { data: myChats } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser.id);
    const { data: commonChats } = await supabase.from('chat_members').select('chat_id, chats!inner(type)').in('chat_id', myChats?.map(c => c.chat_id) || []).eq('user_id', userToFind.id).eq('chats.type', 'private');

    let chatId;
    if (commonChats && commonChats.length > 0) chatId = commonChats[0].chat_id;
    else {
        const { data: newChat } = await supabase.from('chats').insert({ type: 'private' }).select().single();
        chatId = newChat!.id;
        await supabase.from('chat_members').insert([{ chat_id: chatId, user_id: state.currentUser.id }, { chat_id: chatId, user_id: userToFind.id }]);
    }
    await loadChats();
    openChat(chatId, userToFind.display_name || userToFind.username, (userToFind.display_name || userToFind.username)[0].toUpperCase(), false, 'private', [{profiles: userToFind}]);
}
