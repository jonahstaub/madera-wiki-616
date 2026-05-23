import { hasBadLanguage } from "./content-filter.js";
const CHAT_PASSWORD = "madera";
const CHAT_STORAGE_KEYS = {
    unlocked: "maderaWikiUnlocked",
    messages: "maderaWikiMessages",
};
function requiredChatElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }
    return element;
}
const chatLoginScreen = requiredChatElement("#chat-login-screen");
const textingScreen = requiredChatElement("#texting-screen");
const chatLoginForm = requiredChatElement("#chat-login-form");
const chatPasswordInput = requiredChatElement("#chat-password");
const chatAccountNameInput = requiredChatElement("#chat-account-name");
const chatAccountEmailInput = requiredChatElement("#chat-account-email");
const chatAccountPasswordInput = requiredChatElement("#chat-account-password");
const chatLoginError = requiredChatElement("#chat-login-error");
const chatLockButton = requiredChatElement("#chat-lock-button");
const chatAccountStatus = requiredChatElement("#chat-account-status");
const messageForm = requiredChatElement("#message-form");
const messagesList = requiredChatElement("#messages-list");
const messageError = requiredChatElement("#message-error");
const messageSyncRef = getFirebaseReference("schoolWiki/messages");
const chatAuthClient = getFirebaseAuth();
let applyingRemoteMessages = false;
let chatCurrentUser = null;
function getFirebaseReference(path) {
    if (!window.firebase || !window.SCHOOL_WIKI_FIREBASE_CONFIG)
        return null;
    if (window.firebase.apps.length === 0) {
        window.firebase.initializeApp(window.SCHOOL_WIKI_FIREBASE_CONFIG);
    }
    return window.firebase.database().ref(path);
}
function getFirebaseAuth() {
    if (!window.firebase || !window.SCHOOL_WIKI_FIREBASE_CONFIG)
        return null;
    if (window.firebase.apps.length === 0) {
        window.firebase.initializeApp(window.SCHOOL_WIKI_FIREBASE_CONFIG);
    }
    return window.firebase.auth();
}
function getMessages() {
    const saved = localStorage.getItem(CHAT_STORAGE_KEYS.messages);
    if (!saved)
        return [];
    try {
        return JSON.parse(saved);
    }
    catch {
        return [];
    }
}
function saveMessages(messages) {
    localStorage.setItem(CHAT_STORAGE_KEYS.messages, JSON.stringify(messages));
}
function persistMessages(messages) {
    saveMessages(messages);
    if (messageSyncRef && !applyingRemoteMessages) {
        void messageSyncRef.set(messages);
    }
}
function initializeMessageSync() {
    if (!messageSyncRef)
        return;
    messageSyncRef
        .once("value")
        .then((snapshot) => {
        const remoteMessages = snapshot.val();
        if (Array.isArray(remoteMessages)) {
            saveMessages(remoteMessages);
            renderMessages();
            return;
        }
        void messageSyncRef.set(getMessages());
    })
        .catch(() => undefined);
    messageSyncRef.on("value", (snapshot) => {
        const remoteMessages = snapshot.val();
        if (!Array.isArray(remoteMessages))
            return;
        applyingRemoteMessages = true;
        saveMessages(remoteMessages);
        applyingRemoteMessages = false;
        renderMessages();
    });
}
function escapeChatHtml(value) {
    return value.replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        };
        return entities[character];
    });
}
function formatChatDate() {
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date());
}
function showTexting() {
    chatLoginScreen.classList.add("hidden");
    textingScreen.classList.remove("hidden");
    chatAccountStatus.textContent = chatCurrentUser?.displayName || chatCurrentUser?.email || "Account";
    const authorInput = requiredChatElement("#message-author");
    if (!authorInput.value.trim() && chatCurrentUser?.displayName) {
        authorInput.value = chatCurrentUser.displayName;
    }
    renderMessages();
}
function showLogin() {
    textingScreen.classList.add("hidden");
    chatLoginScreen.classList.remove("hidden");
    chatAccountEmailInput.focus();
}
function initializeChatAccountState() {
    if (!chatAuthClient) {
        if (localStorage.getItem(CHAT_STORAGE_KEYS.unlocked) === "true") {
            showTexting();
        }
        else {
            showLogin();
        }
        return;
    }
    chatAuthClient.onAuthStateChanged((user) => {
        chatCurrentUser = user;
        if (user && localStorage.getItem(CHAT_STORAGE_KEYS.unlocked) === "true") {
            showTexting();
            return;
        }
        localStorage.removeItem(CHAT_STORAGE_KEYS.unlocked);
        showLogin();
    });
}
function renderMessages() {
    const messages = getMessages();
    messagesList.innerHTML = "";
    if (messages.length === 0) {
        messagesList.innerHTML = '<p class="empty-state">No texts yet.</p>';
        return;
    }
    messages.forEach((message) => {
        const card = document.createElement("article");
        card.className = "message-card";
        card.innerHTML = `
      <p class="meta">${escapeChatHtml(message.author)} - ${escapeChatHtml(message.createdAt)}</p>
      <p>${escapeChatHtml(message.body)}</p>
    `;
        messagesList.append(card);
    });
    messagesList.scrollTop = messagesList.scrollHeight;
}
chatLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (chatPasswordInput.value.trim() !== CHAT_PASSWORD) {
        chatLoginError.textContent = "That password does not match.";
        return;
    }
    const action = event.submitter?.dataset.action || "login";
    const email = chatAccountEmailInput.value.trim();
    const accountPassword = chatAccountPasswordInput.value;
    const name = chatAccountNameInput.value.trim();
    try {
        if (chatAuthClient) {
            if (action === "signup") {
                const credential = await chatAuthClient.createUserWithEmailAndPassword(email, accountPassword);
                if (credential.user && name) {
                    await credential.user.updateProfile({ displayName: name });
                }
                chatCurrentUser = credential.user;
            }
            else {
                const credential = await chatAuthClient.signInWithEmailAndPassword(email, accountPassword);
                chatCurrentUser = credential.user;
            }
        }
        localStorage.setItem(CHAT_STORAGE_KEYS.unlocked, "true");
        chatPasswordInput.value = "";
        chatAccountPasswordInput.value = "";
        chatLoginError.textContent = "";
        showTexting();
    }
    catch (error) {
        chatLoginError.textContent = error instanceof Error ? error.message : "Could not log in.";
    }
});
chatLockButton.addEventListener("click", async () => {
    localStorage.removeItem(CHAT_STORAGE_KEYS.unlocked);
    if (chatAuthClient) {
        await chatAuthClient.signOut();
    }
    showLogin();
});
messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const author = requiredChatElement("#message-author").value.trim();
    const body = requiredChatElement("#message-body").value.trim();
    if (hasBadLanguage(`${author} ${body}`)) {
        messageError.textContent = "Please remove bad language before sending.";
        return;
    }
    messageError.textContent = "";
    const message = {
        author,
        body,
        createdAt: formatChatDate(),
    };
    persistMessages([...getMessages(), message].slice(-100));
    requiredChatElement("#message-body").value = "";
    renderMessages();
});
initializeMessageSync();
initializeChatAccountState();
