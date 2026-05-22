import { hasBadLanguage } from "./content-filter.js";

const CHAT_PASSWORD = "madera";
const CHAT_STORAGE_KEYS = {
  unlocked: "maderaWikiUnlocked",
  messages: "maderaWikiMessages",
} as const;

function requiredChatElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

const chatLoginScreen = requiredChatElement<HTMLElement>("#chat-login-screen");
const textingScreen = requiredChatElement<HTMLElement>("#texting-screen");
const chatLoginForm = requiredChatElement<HTMLFormElement>("#chat-login-form");
const chatPasswordInput = requiredChatElement<HTMLInputElement>("#chat-password");
const chatLoginError = requiredChatElement<HTMLElement>("#chat-login-error");
const chatLockButton = requiredChatElement<HTMLButtonElement>("#chat-lock-button");
const messageForm = requiredChatElement<HTMLFormElement>("#message-form");
const messagesList = requiredChatElement<HTMLElement>("#messages-list");
const messageError = requiredChatElement<HTMLElement>("#message-error");
const messageSyncRef = getFirebaseReference("schoolWiki/messages");
let applyingRemoteMessages = false;

function getFirebaseReference(path: string): FirebaseCompatReference | null {
  if (!window.firebase || !window.SCHOOL_WIKI_FIREBASE_CONFIG) return null;

  if (window.firebase.apps.length === 0) {
    window.firebase.initializeApp(window.SCHOOL_WIKI_FIREBASE_CONFIG);
  }

  return window.firebase.database().ref(path);
}

function getMessages(): SchoolWikiMessage[] {
  const saved = localStorage.getItem(CHAT_STORAGE_KEYS.messages);
  if (!saved) return [];

  try {
    return JSON.parse(saved) as SchoolWikiMessage[];
  } catch {
    return [];
  }
}

function saveMessages(messages: SchoolWikiMessage[]): void {
  localStorage.setItem(CHAT_STORAGE_KEYS.messages, JSON.stringify(messages));
}

function persistMessages(messages: SchoolWikiMessage[]): void {
  saveMessages(messages);

  if (messageSyncRef && !applyingRemoteMessages) {
    void messageSyncRef.set(messages);
  }
}

function initializeMessageSync(): void {
  if (!messageSyncRef) return;

  messageSyncRef
    .once("value")
    .then((snapshot) => {
      const remoteMessages = snapshot.val();

      if (Array.isArray(remoteMessages)) {
        saveMessages(remoteMessages as SchoolWikiMessage[]);
        renderMessages();
        return;
      }

      void messageSyncRef.set(getMessages());
    })
    .catch(() => undefined);

  messageSyncRef.on("value", (snapshot) => {
    const remoteMessages = snapshot.val();
    if (!Array.isArray(remoteMessages)) return;

    applyingRemoteMessages = true;
    saveMessages(remoteMessages as SchoolWikiMessage[]);
    applyingRemoteMessages = false;
    renderMessages();
  });
}

function escapeChatHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function formatChatDate(): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function showTexting(): void {
  chatLoginScreen.classList.add("hidden");
  textingScreen.classList.remove("hidden");
  renderMessages();
}

function showLogin(): void {
  textingScreen.classList.add("hidden");
  chatLoginScreen.classList.remove("hidden");
  chatPasswordInput.focus();
}

function renderMessages(): void {
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

chatLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (chatPasswordInput.value.trim() !== CHAT_PASSWORD) {
    chatLoginError.textContent = "That password does not match.";
    return;
  }

  localStorage.setItem(CHAT_STORAGE_KEYS.unlocked, "true");
  chatPasswordInput.value = "";
  chatLoginError.textContent = "";
  showTexting();
});

chatLockButton.addEventListener("click", () => {
  localStorage.removeItem(CHAT_STORAGE_KEYS.unlocked);
  showLogin();
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const author = requiredChatElement<HTMLInputElement>("#message-author").value.trim();
  const body = requiredChatElement<HTMLTextAreaElement>("#message-body").value.trim();

  if (hasBadLanguage(`${author} ${body}`)) {
    messageError.textContent = "Please remove bad language before sending.";
    return;
  }
  messageError.textContent = "";

  const message: SchoolWikiMessage = {
    author,
    body,
    createdAt: formatChatDate(),
  };

  persistMessages([...getMessages(), message].slice(-100));
  requiredChatElement<HTMLTextAreaElement>("#message-body").value = "";
  renderMessages();
});

initializeMessageSync();

if (localStorage.getItem(CHAT_STORAGE_KEYS.unlocked) === "true") {
  showTexting();
} else {
  showLogin();
}

export {};
