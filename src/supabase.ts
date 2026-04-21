import { createClient } from '@supabase/supabase-js';

// Новые ключи от новой базы данных
const SUPABASE_URL = 'https://gdshvtyhhglehwwpoeph.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdkc2h2dHloaGdsZWh3d3BvZXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjIwOTgsImV4cCI6MjA5MTIzODA5OH0.busIjQciht4BcIOLS6umoRRYqM0Gm2MzjW25jPTOBAY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Глобальное состояние приложения
export const state = {
    currentUser: null as any,
    currentProfile: null as any,
    activeChatId: null as string | null,
    activeChatType: 'direct' as 'direct' | 'group' | 'channel',
    activeChatIsGroup: false,
    activeChatIsPublic: false,
    activeChatOtherUser: null as any,
    activeChatDescription: null as string | null | undefined,
    selectedFiles: [] as File[],
    groupCreationSelectedUsers: [] as any[],
    isRecordingVoice: false,
    isRecordingVideo: false,
    mediaRecorder: null as MediaRecorder | null,
    mediaChunks: [] as any[],
    localStream: null as MediaStream | null,
    replyingTo: null as any,
    forwardingMsg: null as any,
    forwardSelectedChats: [] as string[],
    chatChannel: null as any,
    typingUsers: new Map<string, { action: string, timer: any, userName?: string }>(),
    audioPlayers: new Map<string, HTMLAudioElement>(),
    recordingInterval: null as any,
    mediaStream: null as MediaStream | null,
    chatScrollPositions: new Map<string, any>(),
    globalChannel: null as any
};

export function broadcastUpdate(chatId: string, type: string = 'message') {
    if (state.globalChannel) {
        state.globalChannel.send({
            type: 'broadcast',
            event: 'update_trigger',
            payload: { chatId, type, senderId: state.currentUser?.id }
        }).catch(console.error);
    }
}