import { supabase, state } from './supabase';

let rtcPeerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let callChannel: any = null;
let currentRingtone: HTMLAudioElement | null = null;
let currentCallPeerId: string | null = null;

function playRingtone() {
    stopRingtone();
    const basePath = (import.meta as any).env.BASE_URL || '/';
    currentRingtone = new Audio(basePath + 'sound/skype_call.mp3');
    currentRingtone.loop = true;
    currentRingtone.play().catch(e => {
        console.error('Audio play failed:', e);
        // If autoplay is blocked, we can't do much without user interaction
        // We can show a toast to the user
        if ((window as any).customToast) {
            (window as any).customToast('Входящий звонок! (Звук заблокирован браузером)');
        }
    });
}

function stopRingtone() {
    if (currentRingtone) {
        currentRingtone.pause();
        currentRingtone.currentTime = 0;
        currentRingtone = null;
    }
}

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

let pendingIceCandidates: any[] = [];

export async function initWebRTC() {
    if (callChannel) return;
    callChannel = supabase.channel('video-calls');
    
    callChannel.on('broadcast', { event: 'call-offer' }, async (payload: any) => {
        const data = payload.payload;
        if (data.targetUserId === state.currentUser.id) {
            playRingtone();
            const modal = document.getElementById('incoming-call-modal')!;
            if (document.getElementById('incoming-call-name')) {
                document.getElementById('incoming-call-name')!.innerText = data.callerName;
            }
            if (document.getElementById('incoming-call-avatar')) {
                document.getElementById('incoming-call-avatar')!.innerText = data.callerName[0].toUpperCase();
            }
            modal.classList.remove('hidden');
            
            const acceptBtn = document.getElementById('accept-call-btn')!;
            const rejectBtn = document.getElementById('reject-call-btn')!;
            
            const handleAccept = async () => {
                stopRingtone();
                modal.classList.add('hidden');
                cleanup();
                await answerCall(data.callerId, data.offer, data.callerName, data.isVideo !== false);
            };
            
            const handleReject = () => {
                stopRingtone();
                modal.classList.add('hidden');
                cleanup();
                callChannel.send({ type: 'broadcast', event: 'call-rejected', payload: { targetUserId: data.callerId } });
            };
            
            const cleanup = () => {
                acceptBtn.removeEventListener('click', handleAccept);
                rejectBtn.removeEventListener('click', handleReject);
            };
            
            acceptBtn.addEventListener('click', handleAccept);
            rejectBtn.addEventListener('click', handleReject);
        }
    });

    callChannel.on('broadcast', { event: 'call-answer' }, async (payload: any) => {
        const data = payload.payload;
        if (data.targetUserId === state.currentUser.id && rtcPeerConnection) {
            stopRingtone();
            await rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            document.getElementById('call-status')!.innerText = 'Соединение установлено';
            
            // Process any queued ICE candidates
            for (const candidate of pendingIceCandidates) {
                await rtcPeerConnection.addIceCandidate(candidate).catch(e => console.error("Error adding queued ICE:", e));
            }
            pendingIceCandidates = [];
        }
    });

    callChannel.on('broadcast', { event: 'ice-candidate' }, async (payload: any) => {
        const data = payload.payload;
        if (data.targetUserId === state.currentUser.id && rtcPeerConnection) {
            const candidate = new RTCIceCandidate(data.candidate);
            if (rtcPeerConnection.remoteDescription) {
                await rtcPeerConnection.addIceCandidate(candidate).catch(e => console.error("Error adding ICE:", e));
            } else {
                pendingIceCandidates.push(candidate);
            }
        }
    });

    callChannel.on('broadcast', { event: 'call-ended' }, (payload: any) => {
        const data = payload.payload;
        if (data.targetUserId === state.currentUser.id || data.callerId === state.currentUser.id) {
            document.getElementById('incoming-call-modal')?.classList.add('hidden');
            endVideoCall(false);
        }
    });
    
    callChannel.on('broadcast', { event: 'call-rejected' }, (payload: any) => {
        const data = payload.payload;
        if (data.targetUserId === state.currentUser.id) {
            stopRingtone();
            document.getElementById('call-status')!.innerText = 'Абонент отклонил вызов';
            setTimeout(() => endVideoCall(false), 2000);
        }
    });

    callChannel.subscribe();
}

export async function startAudioCall() {
    if (!state.activeChatOtherUser) return alert('Аудиозвонки доступны только в личных чатах');
    await startCall(false);
}

export async function startVideoCall() {
    if (!state.activeChatOtherUser) return alert('Видеозвонки доступны только в личных чатах');
    await startCall(true);
}

async function startCall(isVideo: boolean) {
    await initWebRTC();
    
    currentCallPeerId = state.activeChatOtherUser.id;
    
    const name = document.getElementById('current-chat-name')?.innerText || 'Абонент';
    const avatar = document.getElementById('chat-header-avatar')?.innerText || 'C';
    
    document.getElementById('call-name')!.innerText = name;
    document.getElementById('call-avatar')!.innerText = avatar;
    document.getElementById('call-status')!.innerText = 'Вызов...';
    document.getElementById('video-call-modal')!.classList.remove('hidden');
    
    try {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        } catch (e) {
            console.warn('Failed to get video, trying audio only', e);
            if (isVideo) {
                isVideo = false;
                localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            } else {
                throw e;
            }
        }
        const localVideo = document.getElementById('local-video') as HTMLVideoElement;
        const localVideoContainer = document.getElementById('local-video-container');
        const callVideoBtn = document.getElementById('call-video-btn');
        const callSwitchCameraBtn = document.getElementById('call-switch-camera-btn');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.play().catch(e => console.warn('Error playing local video:', e));
            if (!isVideo) {
                localVideo.classList.add('hidden');
                if (localVideoContainer) localVideoContainer.classList.add('hidden');
                if (callVideoBtn) callVideoBtn.classList.add('hidden');
                if (callSwitchCameraBtn) callSwitchCameraBtn.classList.add('hidden');
            } else {
                localVideo.classList.remove('hidden');
                if (localVideoContainer) localVideoContainer.classList.remove('hidden');
                if (callVideoBtn) callVideoBtn.classList.remove('hidden');
                if (callSwitchCameraBtn) callSwitchCameraBtn.classList.remove('hidden');
            }
        }
        
        rtcPeerConnection = new RTCPeerConnection(rtcConfig);
        
        remoteStream = new MediaStream();
        const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
        const remoteAudio = document.getElementById('remote-audio') as HTMLAudioElement;
        if (remoteVideo && isVideo) {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.play().catch(e => console.warn('Error playing remote video:', e));
        }
        if (remoteAudio && !isVideo) {
            remoteAudio.srcObject = remoteStream;
            remoteAudio.play().catch(e => console.warn('Error playing remote audio:', e));
        }
        
        localStream.getTracks().forEach(track => rtcPeerConnection!.addTrack(track, localStream!));
        
        rtcPeerConnection.ontrack = event => {
            let stream = event.streams?.[0];
            if (!stream) {
                 if (!remoteStream!.getTracks().find(t => t.id === event.track.id)) {
                     remoteStream!.addTrack(event.track);
                 }
                 stream = remoteStream!;
            }

            const attemptPlay = () => {
                if (isVideo && remoteVideo) {
                    remoteVideo.srcObject = stream;
                    const p = remoteVideo.play();
                    if (p) p.catch(e => console.warn('Error playing remote video:', e));
                    document.getElementById('call-avatar-container')?.classList.add('hidden');
                    remoteVideo.classList.remove('hidden');
                } else if (!isVideo && remoteAudio) {
                    remoteAudio.srcObject = stream;
                    const p = remoteAudio.play();
                    if (p) p.catch(e => console.warn('Error playing remote audio:', e));
                }
            };
            
            if (event.track.muted) {
                event.track.onunmute = attemptPlay;
            }
            attemptPlay();
        };
        
        rtcPeerConnection.onicecandidate = event => {
            if (event.candidate) {
                callChannel.send({
                    type: 'broadcast', event: 'ice-candidate',
                    payload: { targetUserId: state.activeChatOtherUser.id, candidate: event.candidate }
                });
            }
        };
        
        rtcPeerConnection.oniceconnectionstatechange = () => {
             console.log('ICE Connection state:', rtcPeerConnection?.iceConnectionState);
             if (rtcPeerConnection?.iceConnectionState === 'failed' || rtcPeerConnection?.iceConnectionState === 'disconnected') {
                 endVideoCall(false);
             }
        };

        const offer = await rtcPeerConnection.createOffer();
        await rtcPeerConnection.setLocalDescription(offer);
        
        callChannel.send({
            type: 'broadcast', event: 'call-offer',
            payload: { 
                targetUserId: state.activeChatOtherUser.id, 
                callerId: state.currentUser.id,
                callerName: state.currentProfile.display_name || state.currentProfile.username,
                offer,
                isVideo
            }
        });
        
    } catch (err) {
        console.error('Error starting call:', err);
        alert('Не удалось получить доступ к микрофону' + (isVideo ? ' или камере' : ''));
        endVideoCall(false);
    }
}

export async function answerCall(callerId: string, offer: any, callerName: string, isVideo: boolean = true) {
    await initWebRTC();
    
    currentCallPeerId = callerId;
    
    document.getElementById('call-name')!.innerText = callerName;
    document.getElementById('call-avatar')!.innerText = callerName[0].toUpperCase();
    document.getElementById('call-status')!.innerText = 'Соединение...';
    document.getElementById('video-call-modal')!.classList.remove('hidden');
    
    try {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        } catch (e) {
            console.warn('Failed to get video, trying audio only', e);
            if (isVideo) {
                isVideo = false;
                localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            } else {
                throw e;
            }
        }
        const localVideo = document.getElementById('local-video') as HTMLVideoElement;
        const localVideoContainer = document.getElementById('local-video-container');
        const callVideoBtn = document.getElementById('call-video-btn');
        const callSwitchCameraBtn = document.getElementById('call-switch-camera-btn');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.play().catch(e => console.warn('Error playing local video:', e));
            if (!isVideo) {
                localVideo.classList.add('hidden');
                if (localVideoContainer) localVideoContainer.classList.add('hidden');
                if (callVideoBtn) callVideoBtn.classList.add('hidden');
                if (callSwitchCameraBtn) callSwitchCameraBtn.classList.add('hidden');
            } else {
                localVideo.classList.remove('hidden');
                if (localVideoContainer) localVideoContainer.classList.remove('hidden');
                if (callVideoBtn) callVideoBtn.classList.remove('hidden');
                if (callSwitchCameraBtn) callSwitchCameraBtn.classList.remove('hidden');
            }
        }
        
        rtcPeerConnection = new RTCPeerConnection(rtcConfig);
        
        remoteStream = new MediaStream();
        const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
        const remoteAudio = document.getElementById('remote-audio') as HTMLAudioElement;
        if (remoteVideo && isVideo) {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.play().catch(e => console.warn('Error playing remote video:', e));
        }
        if (remoteAudio && !isVideo) {
            remoteAudio.srcObject = remoteStream;
            remoteAudio.play().catch(e => console.warn('Error playing remote audio:', e));
        }
        
        localStream.getTracks().forEach(track => rtcPeerConnection!.addTrack(track, localStream!));
        
        rtcPeerConnection.ontrack = event => {
            let stream = event.streams?.[0];
            if (!stream) {
                 if (!remoteStream!.getTracks().find(t => t.id === event.track.id)) {
                     remoteStream!.addTrack(event.track);
                 }
                 stream = remoteStream!;
            }

            const attemptPlay = () => {
                if (isVideo && remoteVideo) {
                    remoteVideo.srcObject = stream;
                    const p = remoteVideo.play();
                    if (p) p.catch(e => console.warn('Error playing remote video:', e));
                    document.getElementById('call-avatar-container')?.classList.add('hidden');
                    remoteVideo.classList.remove('hidden');
                } else if (!isVideo && remoteAudio) {
                    remoteAudio.srcObject = stream;
                    const p = remoteAudio.play();
                    if (p) p.catch(e => console.warn('Error playing remote audio:', e));
                }
            };
            
            if (event.track.muted) {
                event.track.onunmute = attemptPlay;
            }
            attemptPlay();
        };
        
        rtcPeerConnection.onicecandidate = event => {
            if (event.candidate) {
                callChannel.send({
                    type: 'broadcast', event: 'ice-candidate',
                    payload: { targetUserId: callerId, candidate: event.candidate }
                });
            }
        };
        
        rtcPeerConnection.oniceconnectionstatechange = () => {
             console.log('ICE Connection state:', rtcPeerConnection?.iceConnectionState);
             if (rtcPeerConnection?.iceConnectionState === 'failed' || rtcPeerConnection?.iceConnectionState === 'disconnected') {
                 endVideoCall(false);
             }
        };

        await rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await rtcPeerConnection.createAnswer();
        await rtcPeerConnection.setLocalDescription(answer);
        
        callChannel.send({
            type: 'broadcast', event: 'call-answer',
            payload: { targetUserId: callerId, answer }
        });
        
        document.getElementById('call-status')!.innerText = 'Соединение установлено';
        
    } catch (err) {
        console.error('Error answering call:', err);
        endVideoCall(false);
    }
}

export function endVideoCall(broadcast = true) {
    stopRingtone();
    if (broadcast && currentCallPeerId && callChannel) {
        callChannel.send({
            type: 'broadcast', event: 'call-ended',
            payload: { targetUserId: currentCallPeerId, callerId: state.currentUser.id }
        });
    }
    currentCallPeerId = null;
    
    if (rtcPeerConnection) {
        rtcPeerConnection.close();
        rtcPeerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    document.getElementById('video-call-modal')!.classList.add('hidden');
    document.getElementById('call-status')!.innerText = 'Вызов...';
    document.getElementById('call-avatar-container')?.classList.remove('hidden');
    
    const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
    const remoteAudio = document.getElementById('remote-audio') as HTMLAudioElement;
    if (remoteVideo) {
        remoteVideo.srcObject = null;
        remoteVideo.classList.add('hidden');
    }
    if (remoteAudio) {
        remoteAudio.srcObject = null;
    }
    const localVideo = document.getElementById('local-video') as HTMLVideoElement;
    const localVideoContainer = document.getElementById('local-video-container');
    if (localVideo) localVideo.srcObject = null;
    if (localVideoContainer) localVideoContainer.classList.remove('hidden');
    const callVideoBtn = document.getElementById('call-video-btn');
    if (callVideoBtn) callVideoBtn.classList.remove('hidden');
}

export function toggleCallAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.getElementById('call-audio-btn')!;
            if (audioTrack.enabled) {
                btn.classList.remove('bg-red-500', 'hover:bg-red-600');
                btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
            } else {
                btn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
                btn.classList.add('bg-red-500', 'hover:bg-red-600');
            }
        }
    }
}

export function toggleCallVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.getElementById('call-video-btn')!;
            if (videoTrack.enabled) {
                btn.classList.remove('bg-red-500', 'hover:bg-red-600');
                btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
            } else {
                btn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
                btn.classList.add('bg-red-500', 'hover:bg-red-600');
            }
        }
    }
}

export async function switchCallCamera() {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) return;
    
    try {
        let newConstraint: any = { facingMode: 'user' };
        try {
            const currentSettings = videoTracks[0].getSettings();
            const isFront = currentSettings.facingMode === 'user';
            newConstraint = isFront ? { facingMode: { exact: 'environment' } } : { facingMode: 'user' };
        } catch (e) {}

        let newStream: MediaStream | null = null;
        try {
            newStream = await navigator.mediaDevices.getUserMedia({ video: newConstraint });
        } catch (e) {
            try {
                const fallbackConstraint = newConstraint.facingMode?.exact === 'environment' ? { facingMode: 'environment' } : { facingMode: 'user' };
                newStream = await navigator.mediaDevices.getUserMedia({ video: fallbackConstraint });
            } catch(e2) {
                console.warn('Fallback camera switch failed');
            }
        }
        
        if (!newStream) return;
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        if (rtcPeerConnection) {
            const sender = rtcPeerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(newVideoTrack);
            }
        }
        
        videoTracks[0].stop();
        localStream.removeTrack(videoTracks[0]);
        localStream.addTrack(newVideoTrack);
        
        const callVideoBtn = document.getElementById('call-video-btn');
        if (callVideoBtn && callVideoBtn.classList.contains('bg-red-500')) {
            newVideoTrack.enabled = false;
        }

        const localVideo = document.getElementById('local-video') as HTMLVideoElement;
        if (localVideo) {
             localVideo.srcObject = localStream;
             localVideo.play().catch(()=>{});
        }
    } catch (e) {
        console.error('Error switching camera:', e);
    }
}
