import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/*
  1. Create a Supabase project.
  2. Run database.sql in Supabase SQL Editor.
  3. Put your Project URL and anon/public key below.
*/
const SUPABASE_URL = "https://bhsszhtdfnrtazcmmdvc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xkUNCpHME_F19_T3GD1RuQ_uRBEkvKn";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authScreen = document.querySelector("#authScreen");
const chatScreen = document.querySelector("#chatScreen");
const authForm = document.querySelector("#authForm");
const authButton = document.querySelector("#authButton");
const authMessage = document.querySelector("#authMessage");
const nameWrap = document.querySelector("#nameWrap");
const displayName = document.querySelector("#displayName");
const messagesEl = document.querySelector("#messages");
const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const memberList = document.querySelector("#memberList");
const memberCount = document.querySelector("#memberCount");
const currentUserLabel = document.querySelector("#currentUser");

const mediaInput = document.querySelector("#mediaInput");
const mediaBtn = document.querySelector("#mediaBtn");

const voiceBtn = document.querySelector("#voiceBtn");
const recordingBar = document.querySelector("#recordingBar");
const recordingTimerEl = document.querySelector("#recordingTimer");
const stopRecordingBtn = document.querySelector("#stopRecordingBtn");
const cancelRecordingBtn = document.querySelector("#cancelRecordingBtn");

const avatarWrap = document.querySelector("#avatarWrap");
const avatarInput = document.querySelector("#avatarInput");
const myAvatarImg = document.querySelector("#myAvatarImg");
const myAvatarInitial = document.querySelector("#myAvatarInitial");

const callOverlay = document.querySelector("#callOverlay");
const callPeerAvatarImg = document.querySelector("#callPeerAvatarImg");
const callPeerAvatarInitial = document.querySelector("#callPeerAvatarInitial");
const callPeerName = document.querySelector("#callPeerName");
const callStatusText = document.querySelector("#callStatusText");
const callVideos = document.querySelector("#callVideos");
const remoteVideo = document.querySelector("#remoteVideo");
const localVideo = document.querySelector("#localVideo");
const remoteAudio = document.querySelector("#remoteAudio");
const toggleMicBtn = document.querySelector("#toggleMicBtn");
const toggleCameraBtn = document.querySelector("#toggleCameraBtn");
const acceptCallBtn = document.querySelector("#acceptCallBtn");
const declineCallBtn = document.querySelector("#declineCallBtn");
const hangupCallBtn = document.querySelector("#hangupCallBtn");

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];
const RING_TIMEOUT_MS = 30000;

const MEDIA_BUCKET = "chat-media";
const AVATAR_BUCKET = "avatars";
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB

let mode = "login";
let user = null;
let myProfile = null;
let channel = null;

// ---------- Auth ----------

function setMode(newMode) {
  mode = newMode;
  document.querySelector("#loginTab").classList.toggle("active", mode === "login");
  document.querySelector("#signupTab").classList.toggle("active", mode === "signup");
  nameWrap.classList.toggle("hidden", mode !== "signup");
  authButton.textContent = mode === "login" ? "Login" : "Create account";
  authMessage.textContent = "";
}
document.querySelector("#loginTab").onclick = () => setMode("login");
document.querySelector("#signupTab").onclick = () => setMode("signup");

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authMessage.style.color = "#c33";
  authMessage.textContent = "Please wait...";
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  let result;

  if (mode === "login") {
    result = await supabase.auth.signInWithPassword({ email, password });
  } else {
    const name = displayName.value.trim() || email.split("@")[0];
    result = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: name } }
    });
  }

  if (result.error) {
    authMessage.textContent = result.error.message;
    return;
  }
  authMessage.textContent = "";
  if (mode === "signup" && !result.data.session) {
    authMessage.style.color = "#287a3e";
    authMessage.textContent = "Account created. Check your email if confirmation is enabled, then log in.";
  }
});

document.querySelector("#logoutBtn").onclick = async () => {
  await supabase.auth.signOut();
};

supabase.auth.onAuthStateChange((_event, session) => {
  user = session?.user ?? null;
  if (user) enterChat();
  else leaveChat();
});

async function enterChat() {
  authScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  currentUserLabel.textContent = user.user_metadata?.display_name || user.email;
  await loadMyProfile();
  await loadMessages();
  await loadMembers();
  subscribeRealtime();
  subscribeCallChannel();
}

async function leaveChat() {
  hangupCall();
  if (callChannel) await supabase.removeChannel(callChannel);
  callChannel = null;
  if (channel) await supabase.removeChannel(channel);
  channel = null;
  myProfile = null;
  chatScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");
  messagesEl.innerHTML = '<div class="empty">No messages yet. Say hello 👋</div>';
  stopRecordingUI();
}

// ---------- Profile / PFP ----------

async function loadMyProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (!error && data) {
    myProfile = data;
    renderMyAvatar();
  }
}

function renderMyAvatar() {
  const name = myProfile?.display_name || currentUserLabel.textContent || "?";
  if (myProfile?.avatar_url) {
    myAvatarImg.src = myProfile.avatar_url;
    myAvatarImg.classList.remove("hidden");
    myAvatarInitial.classList.add("hidden");
  } else {
    myAvatarImg.classList.add("hidden");
    myAvatarInitial.classList.remove("hidden");
    myAvatarInitial.textContent = name[0]?.toUpperCase() || "?";
  }
}

avatarWrap.addEventListener("click", () => avatarInput.click());

avatarInput.addEventListener("change", async () => {
  const file = avatarInput.files[0];
  avatarInput.value = "";
  if (!file || !user) return;

  if (!file.type.startsWith("image/")) {
    alert("Please choose an image file.");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    alert("Image is too large. Maximum size is 8 MB.");
    return;
  }

  avatarWrap.disabled = true;
  try {
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/avatar.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type
      });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(path);
    // cache-bust so the new picture shows immediately everywhere
    const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);
    if (updateError) throw updateError;

    myProfile = { ...myProfile, avatar_url: avatarUrl };
    renderMyAvatar();
  } catch (error) {
    console.error("Avatar upload error:", error);
    alert("Could not update your profile picture.");
  } finally {
    avatarWrap.disabled = false;
  }
});

// ---------- Messages ----------

async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("id, user_id, body, media_url, media_type, created_at, profiles(display_name, avatar_url)")
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    messagesEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }
  messagesEl.innerHTML = "";
  if (data.length === 0) {
    messagesEl.innerHTML = '<div class="empty">No messages yet. Say hello 👋</div>';
  } else {
    data.forEach(renderMessage);
    scrollBottom();
  }
}

async function loadMembers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, created_at")
    .order("display_name", { ascending: true });

  if (error) return;
  memberCount.textContent = data.length;
  memberList.innerHTML = data.map(p => {
    const name = p.display_name || "User";
    const isMe = p.id === user.id;
    return `<div class="member" data-user-id="${p.id}" data-name="${escapeHtml(name)}" data-avatar="${p.avatar_url ? escapeHtml(p.avatar_url) : ""}">
      ${avatarHTML(name, p.avatar_url, 34)}
      <div class="member-info">${escapeHtml(name)}${isMe ? "<small>You</small>" : ""}</div>
      ${isMe ? "" : `
        <div class="member-call-actions">
          <button type="button" class="call-icon-btn" data-call-type="audio" title="Voice call ${escapeHtml(name)}">📞</button>
          <button type="button" class="call-icon-btn" data-call-type="video" title="Video call ${escapeHtml(name)}">🎥</button>
        </div>
      `}
    </div>`;
  }).join("");

  // Keep our own header avatar in sync if it changed elsewhere (e.g. another tab).
  const me = data.find(p => p.id === user.id);
  if (me) {
    myProfile = me;
    renderMyAvatar();
  }
}

function avatarHTML(name, avatarUrl, size = 34) {
  if (avatarUrl) {
    return `<img class="avatar avatar-img-round" style="width:${size}px;height:${size}px"
              src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" />`;
  }
  return `<div class="avatar" style="width:${size}px;height:${size}px">${escapeHtml((name[0] || "?").toUpperCase())}</div>`;
}

function subscribeRealtime() {
  channel = supabase.channel("friendchat-global-room")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      async (payload) => {
        const { data } = await supabase
          .from("messages")
          .select("id, user_id, body, media_url, media_type, created_at, profiles(display_name, avatar_url)")
          .eq("id", payload.new.id)
          .single();
        if (data && !document.querySelector(`[data-message-id="${data.id}"]`)) {
          document.querySelector(".messages .empty")?.remove();
          renderMessage(data);
          scrollBottom();
        }
      })
    .on("postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      loadMembers)
    .subscribe();
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = messageInput.value.trim();
  if (!body || !user) return;
  messageInput.disabled = true;

  const { error } = await supabase.from("messages").insert({
    user_id: user.id,
    body
  });

  messageInput.disabled = false;
  if (error) {
    alert(error.message);
    return;
  }
  messageInput.value = "";
  messageInput.focus();
});

function renderMessage(m) {
  const name = m.profiles?.display_name || "User";
  const avatarUrl = m.profiles?.avatar_url || null;
  const mine = m.user_id === user?.id;
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const row = document.createElement("div");
  row.className = `message-row ${mine ? "mine" : ""}`;
  row.dataset.messageId = m.id;
  row.innerHTML = `
    ${mine ? "" : avatarHTML(name, avatarUrl, 30)}
    <div class="bubble">
      <div class="meta">${escapeHtml(name)} · ${time}</div>
      ${mediaHTML(m)}
      ${m.body ? `<div class="body">${escapeHtml(m.body)}</div>` : ""}
    </div>
  `;
  messagesEl.appendChild(row);
}

function mediaHTML(message) {
  if (!message.media_url) return "";

  if (message.media_type === "image") {
    return `<img
        src="${escapeHtml(message.media_url)}"
        class="chat-media-image"
        alt="Sent image"
        loading="lazy"
    >`;
  }

  if (message.media_type === "video") {
    return `<video
        class="chat-media-video"
        src="${escapeHtml(message.media_url)}"
        controls
        preload="metadata"
    ></video>`;
  }

  if (message.media_type === "audio") {
    return `<audio
        class="chat-media-audio"
        src="${escapeHtml(message.media_url)}"
        controls
        preload="metadata"
    ></audio>`;
  }

  return "";
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

// ---------- Photo / video sending ----------

mediaBtn.addEventListener("click", () => {
  mediaInput.click();
});

mediaInput.addEventListener("change", async () => {
  const file = mediaInput.files[0];
  mediaInput.value = "";
  if (!file) return;

  try {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      alert("Please select an image or video.");
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      alert("File is too large. Maximum size is 50 MB.");
      return;
    }
    if (!user) {
      alert("Please login first.");
      return;
    }

    mediaBtn.disabled = true;
    mediaBtn.textContent = "⏳";

    const mediaType = file.type.startsWith("image/") ? "image" : "video";
    await uploadAndSendMedia(file, mediaType, "media");

  } catch (error) {
    console.error("Media upload error:", error);
    alert("Could not send the file.");
  } finally {
    mediaBtn.disabled = false;
    mediaBtn.textContent = "📎";
  }
});

// ---------- Voice note recording ----------

let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;
let recordingStartedAt = 0;
let recordingTimerInterval = null;
let shouldSendRecording = true;

voiceBtn.addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") return;
  if (!user) {
    alert("Please login first.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Voice recording isn't supported in this browser.");
    return;
  }

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error(err);
    alert("Microphone access was denied.");
    return;
  }

  recordedChunks = [];
  shouldSendRecording = true;
  const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  mediaRecorder = mimeType
    ? new MediaRecorder(recordingStream, { mimeType })
    : new MediaRecorder(recordingStream);

  mediaRecorder.addEventListener("dataavailable", (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  });

  mediaRecorder.addEventListener("stop", async () => {
    recordingStream?.getTracks().forEach(track => track.stop());
    recordingStream = null;

    const chunks = recordedChunks;
    const mimeUsed = mediaRecorder.mimeType || "audio/webm";
    const send = shouldSendRecording;
    stopRecordingUI();

    if (!send || chunks.length === 0) return;

    const blob = new Blob(chunks, { type: mimeUsed });
    if (blob.size > MAX_MEDIA_BYTES) {
      alert("Voice note is too large.");
      return;
    }

    voiceBtn.disabled = true;
    try {
      const extension = mimeUsed.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `voice-note.${extension}`, { type: blob.type });
      await uploadAndSendMedia(file, "audio", "voice");
    } catch (error) {
      console.error("Voice note upload error:", error);
      alert("Could not send the voice note.");
    } finally {
      voiceBtn.disabled = false;
    }
  });

  mediaRecorder.start();
  startRecordingUI();
});

stopRecordingBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    shouldSendRecording = true;
    mediaRecorder.stop();
  }
});

cancelRecordingBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    shouldSendRecording = false;
    mediaRecorder.stop();
  }
});

function startRecordingUI() {
  recordingBar.classList.remove("hidden");
  voiceBtn.classList.add("recording");
  recordingStartedAt = Date.now();
  updateRecordingTimer();
  recordingTimerInterval = setInterval(updateRecordingTimer, 250);
}

function stopRecordingUI() {
  recordingBar.classList.add("hidden");
  voiceBtn.classList.remove("recording");
  clearInterval(recordingTimerInterval);
  recordingTimerInterval = null;
  mediaRecorder = null;
  recordedChunks = [];
}

function updateRecordingTimer() {
  const elapsedMs = Date.now() - recordingStartedAt;
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  recordingTimerEl.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// ---------- Voice / video calling ----------
//
// 1:1 calls only. Supabase Realtime broadcast is used purely to exchange
// WebRTC signaling messages (offer/answer/ICE candidates) between the two
// participants; the actual audio/video travels directly between browsers.
// Only public STUN servers are configured (no TURN), so calls should work
// fine on normal home/wifi connections but may fail to connect across very
// restrictive corporate networks or some mobile carriers.

let callChannel = null;
let activeCall = null; // see startCall()/handleIncomingOffer() for shape
let callDurationInterval = null;

function subscribeCallChannel() {
  callChannel = supabase
    .channel("friendchat-calls", { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "signal" }, ({ payload }) => handleSignal(payload))
    .subscribe();
}

function sendSignal(payload) {
  callChannel?.send({ type: "broadcast", event: "signal", payload });
}

memberList.addEventListener("click", (e) => {
  const btn = e.target.closest(".call-icon-btn");
  if (!btn) return;
  const row = btn.closest(".member");
  const peerId = row.dataset.userId;
  const peerName = row.dataset.name;
  const peerAvatar = row.dataset.avatar || null;
  const callType = btn.dataset.callType === "video" ? "video" : "audio";
  startCall(peerId, peerName, peerAvatar, callType);
});

async function startCall(peerId, peerName, peerAvatar, callType) {
  if (!user || peerId === user.id) return;
  if (activeCall) {
    alert("You're already on a call.");
    return;
  }

  const callId = crypto.randomUUID();
  activeCall = {
    callId, peerId, peerName, peerAvatar, type: callType,
    role: "caller", status: "ringing-out",
    pc: null, localStream: null, pendingCandidates: [], ringTimeout: null
  };
  updateCallUI();

  try {
    activeCall.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true, video: callType === "video"
    });
  } catch (err) {
    console.error(err);
    alert("Could not access your microphone/camera.");
    activeCall = null;
    hideCallUI();
    return;
  }
  setLocalPreview();
  updateCallUI();

  const pc = createPeerConnection();
  activeCall.pc = pc;
  activeCall.localStream.getTracks().forEach(track => pc.addTrack(track, activeCall.localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  sendSignal({
    type: "offer",
    callId,
    from: user.id,
    to: peerId,
    callType,
    callerName: myProfile?.display_name || currentUserLabel.textContent || "Someone",
    callerAvatar: myProfile?.avatar_url || null,
    sdp: offer
  });

  activeCall.ringTimeout = setTimeout(() => {
    if (activeCall?.callId === callId && activeCall.status === "ringing-out") {
      sendSignal({ type: "cancel", callId, from: user.id, to: peerId });
      showTransientStatus("No answer");
    }
  }, RING_TIMEOUT_MS);
}

function handleSignal(payload) {
  if (!user || payload.to !== user.id) return;
  switch (payload.type) {
    case "offer": return handleIncomingOffer(payload);
    case "answer": return handleAnswer(payload);
    case "ice-candidate": return handleRemoteIceCandidate(payload);
    case "hangup": return handleRemoteEnd(payload, "Call ended");
    case "decline": return handleRemoteEnd(payload, "Call declined");
    case "cancel": return handleRemoteEnd(payload, "Missed call");
    case "busy": return handleRemoteEnd(payload, "Busy");
  }
}

function handleIncomingOffer(payload) {
  if (activeCall) {
    sendSignal({ type: "busy", callId: payload.callId, from: user.id, to: payload.from });
    return;
  }
  activeCall = {
    callId: payload.callId,
    peerId: payload.from,
    peerName: payload.callerName || "Someone",
    peerAvatar: payload.callerAvatar || null,
    type: payload.callType === "video" ? "video" : "audio",
    role: "callee",
    status: "ringing-in",
    offerSdp: payload.sdp,
    pc: null, localStream: null, pendingCandidates: [], ringTimeout: null
  };
  updateCallUI();
}

async function acceptCall() {
  const call = activeCall;
  if (!call || call.status !== "ringing-in") return;
  call.status = "connecting";
  updateCallUI();

  try {
    call.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true, video: call.type === "video"
    });
  } catch (err) {
    console.error(err);
    alert("Could not access your microphone/camera.");
    sendSignal({ type: "decline", callId: call.callId, from: user.id, to: call.peerId });
    activeCall = null;
    hideCallUI();
    return;
  }
  setLocalPreview();

  const pc = createPeerConnection();
  call.pc = pc;
  call.localStream.getTracks().forEach(track => pc.addTrack(track, call.localStream));

  await pc.setRemoteDescription(new RTCSessionDescription(call.offerSdp));
  for (const candidate of call.pendingCandidates) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
  }
  call.pendingCandidates = [];

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal({ type: "answer", callId: call.callId, from: user.id, to: call.peerId, sdp: answer });

  markConnected();
}

function declineCall() {
  if (!activeCall) return;
  sendSignal({ type: "decline", callId: activeCall.callId, from: user.id, to: activeCall.peerId });
  endCall();
}

async function handleAnswer(payload) {
  if (!activeCall || activeCall.callId !== payload.callId) return;
  clearTimeout(activeCall.ringTimeout);
  await activeCall.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  for (const candidate of activeCall.pendingCandidates) {
    await activeCall.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
  }
  activeCall.pendingCandidates = [];
  markConnected();
}

async function handleRemoteIceCandidate(payload) {
  if (!activeCall || activeCall.callId !== payload.callId) return;
  if (activeCall.pc?.remoteDescription) {
    await activeCall.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error);
  } else {
    activeCall.pendingCandidates.push(payload.candidate);
  }
}

function handleRemoteEnd(payload, message) {
  if (!activeCall || activeCall.callId !== payload.callId) return;
  showTransientStatus(message);
}

function markConnected() {
  if (!activeCall) return;
  activeCall.status = "connected";
  updateCallUI();
  const startedAt = Date.now();
  clearInterval(callDurationInterval);
  callDurationInterval = setInterval(() => {
    if (!activeCall || activeCall.status !== "connected") return;
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const mm = Math.floor(seconds / 60);
    const ss = String(seconds % 60).padStart(2, "0");
    callStatusText.textContent = `${mm}:${ss}`;
  }, 1000);
}

function createPeerConnection() {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = (e) => {
    if (e.candidate && activeCall) {
      sendSignal({
        type: "ice-candidate",
        callId: activeCall.callId,
        from: user.id,
        to: activeCall.peerId,
        candidate: e.candidate
      });
    }
  };

  pc.ontrack = (e) => {
    if (!activeCall) return;
    if (activeCall.type === "video") {
      remoteVideo.srcObject = e.streams[0];
    } else {
      remoteAudio.srcObject = e.streams[0];
    }
  };

  pc.onconnectionstatechange = () => {
    if (["disconnected", "failed", "closed"].includes(pc.connectionState) && activeCall) {
      showTransientStatus("Call ended");
    }
  };

  return pc;
}

function hangupCall() {
  if (!activeCall) return;
  if (activeCall.status !== "ringing-in" || activeCall.pc) {
    sendSignal({ type: "hangup", callId: activeCall.callId, from: user.id, to: activeCall.peerId });
  }
  endCall();
}

function showTransientStatus(text) {
  if (!activeCall) return;
  clearTimeout(activeCall.ringTimeout);
  callStatusText.textContent = text;
  acceptCallBtn.classList.add("hidden");
  declineCallBtn.classList.add("hidden");
  hangupCallBtn.classList.add("hidden");
  toggleMicBtn.classList.add("hidden");
  toggleCameraBtn.classList.add("hidden");
  setTimeout(endCall, 1400);
}

function endCall() {
  if (!activeCall) return;
  clearTimeout(activeCall.ringTimeout);
  clearInterval(callDurationInterval);
  callDurationInterval = null;
  activeCall.pc?.getSenders().forEach(s => s.track?.stop());
  activeCall.pc?.close();
  activeCall.localStream?.getTracks().forEach(t => t.stop());
  activeCall = null;
  hideCallUI();
}

function setLocalPreview() {
  if (activeCall?.type === "video" && activeCall.localStream) {
    localVideo.srcObject = activeCall.localStream;
  }
}

function updateCallUI() {
  if (!activeCall) return hideCallUI();

  callOverlay.classList.remove("hidden");
  callPeerName.textContent = activeCall.peerName || "Friend";
  if (activeCall.peerAvatar) {
    callPeerAvatarImg.src = activeCall.peerAvatar;
    callPeerAvatarImg.classList.remove("hidden");
    callPeerAvatarInitial.classList.add("hidden");
  } else {
    callPeerAvatarImg.classList.add("hidden");
    callPeerAvatarInitial.classList.remove("hidden");
    callPeerAvatarInitial.textContent = (activeCall.peerName?.[0] || "?").toUpperCase();
  }

  const isVideo = activeCall.type === "video";
  callVideos.classList.toggle("hidden", !(isVideo && activeCall.localStream));
  toggleCameraBtn.classList.toggle("hidden", !isVideo || activeCall.status === "ringing-in");

  acceptCallBtn.classList.toggle("hidden", activeCall.status !== "ringing-in");
  declineCallBtn.classList.toggle("hidden", activeCall.status !== "ringing-in");
  hangupCallBtn.classList.toggle("hidden", activeCall.status === "ringing-in");
  toggleMicBtn.classList.toggle("hidden", activeCall.status === "ringing-in");

  const labels = {
    "ringing-in": isVideo ? "Incoming video call…" : "Incoming voice call…",
    "ringing-out": "Calling…",
    "connecting": "Connecting…",
    "connected": "Connected"
  };
  callStatusText.textContent = labels[activeCall.status] || "";
  updateCallControlsUI();
}

function updateCallControlsUI() {
  const micTrack = activeCall?.localStream?.getAudioTracks()[0];
  toggleMicBtn.textContent = micTrack && !micTrack.enabled ? "🔇" : "🎙️";
  toggleMicBtn.classList.toggle("muted", !!(micTrack && !micTrack.enabled));

  const camTrack = activeCall?.localStream?.getVideoTracks()[0];
  toggleCameraBtn.textContent = camTrack && !camTrack.enabled ? "🚫" : "📷";
  toggleCameraBtn.classList.toggle("muted", !!(camTrack && !camTrack.enabled));
}

function hideCallUI() {
  callOverlay.classList.add("hidden");
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  remoteAudio.srcObject = null;
}

acceptCallBtn.addEventListener("click", acceptCall);
declineCallBtn.addEventListener("click", declineCall);
hangupCallBtn.addEventListener("click", hangupCall);
toggleMicBtn.addEventListener("click", () => {
  const track = activeCall?.localStream?.getAudioTracks()[0];
  if (track) { track.enabled = !track.enabled; updateCallControlsUI(); }
});
toggleCameraBtn.addEventListener("click", () => {
  const track = activeCall?.localStream?.getVideoTracks()[0];
  if (track) { track.enabled = !track.enabled; updateCallControlsUI(); }
});

window.addEventListener("beforeunload", () => {
  if (activeCall) sendSignal({ type: "hangup", callId: activeCall.callId, from: user?.id, to: activeCall.peerId });
});

// ---------- Shared upload helper ----------

async function uploadAndSendMedia(file, mediaType, folder) {
  const extension = (file.name.split(".").pop() || "bin").toLowerCase();
  const fileName = `${user.id}/${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(fileName);

  const { error: messageError } = await supabase
    .from("messages")
    .insert({
      user_id: user.id,
      body: "",
      media_url: publicUrlData.publicUrl,
      media_type: mediaType
    });
  if (messageError) throw messageError;
}
