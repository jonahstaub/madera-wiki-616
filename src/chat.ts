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
const chatAccountNameInput = requiredChatElement<HTMLInputElement>("#chat-account-name");
const chatAccountEmailInput = requiredChatElement<HTMLInputElement>("#chat-account-email");
const chatAccountPasswordInput = requiredChatElement<HTMLInputElement>("#chat-account-password");
const chatGoogleLoginButton = requiredChatElement<HTMLButtonElement>("#chat-google-login-button");
const chatLoginError = requiredChatElement<HTMLElement>("#chat-login-error");
const chatLockButton = requiredChatElement<HTMLButtonElement>("#chat-lock-button");
const chatAccountStatus = requiredChatElement<HTMLElement>("#chat-account-status");
const messageForm = requiredChatElement<HTMLFormElement>("#message-form");
const messagesList = requiredChatElement<HTMLElement>("#messages-list");
const messageError = requiredChatElement<HTMLElement>("#message-error");
const messageSyncRef = getFirebaseReference("schoolWiki/messages");
const chatAuthClient = getFirebaseAuth();
let applyingRemoteMessages = false;
let chatCurrentUser: FirebaseCompatUser | null = null;

function getFirebaseReference(path: string): FirebaseCompatReference | null {
  if (!window.firebase || !window.SCHOOL_WIKI_FIREBASE_CONFIG) return null;

  if (window.firebase.apps.length === 0) {
    window.firebase.initializeApp(window.SCHOOL_WIKI_FIREBASE_CONFIG);
  }

  return window.firebase.database().ref(path);
}

function getFirebaseAuth(): FirebaseCompatAuth | null {
  if (!window.firebase || !window.SCHOOL_WIKI_FIREBASE_CONFIG) return null;

  if (window.firebase.apps.length === 0) {
    window.firebase.initializeApp(window.SCHOOL_WIKI_FIREBASE_CONFIG);
  }

  return window.firebase.auth();
}

function requireChatSharedPassword(): boolean {
  if (chatPasswordInput.value.trim() === CHAT_PASSWORD) {
    return true;
  }

  chatLoginError.textContent = "That password does not match.";
  return false;
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
  chatAccountStatus.textContent = chatCurrentUser?.displayName || chatCurrentUser?.email || "Account";
  const authorInput = requiredChatElement<HTMLInputElement>("#message-author");
  if (!authorInput.value.trim() && chatCurrentUser?.displayName) {
    authorInput.value = chatCurrentUser.displayName;
  }
  renderMessages();
}

function showLogin(): void {
  textingScreen.classList.add("hidden");
  chatLoginScreen.classList.remove("hidden");
  chatAccountEmailInput.focus();
}

function initializeChatAccountState(): void {
  if (!chatAuthClient) {
    if (localStorage.getItem(CHAT_STORAGE_KEYS.unlocked) === "true") {
      showTexting();
    } else {
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

chatLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!requireChatSharedPassword()) return;

  const action = (event.submitter as HTMLButtonElement | null)?.dataset.action || "login";
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
      } else {
        const credential = await chatAuthClient.signInWithEmailAndPassword(email, accountPassword);
        chatCurrentUser = credential.user;
      }
    }

    localStorage.setItem(CHAT_STORAGE_KEYS.unlocked, "true");
    chatPasswordInput.value = "";
    chatAccountPasswordInput.value = "";
    chatLoginError.textContent = "";
    showTexting();
  } catch (error) {
    chatLoginError.textContent = error instanceof Error ? error.message : "Could not log in.";
  }
});

chatGoogleLoginButton.addEventListener("click", async () => {
  if (!requireChatSharedPassword()) return;

  if (!window.firebase || !chatAuthClient) {
    chatLoginError.textContent = "Google sign-in is not available yet.";
    return;
  }

  try {
    const provider = new window.firebase.auth.GoogleAuthProvider();
    const credential = await chatAuthClient.signInWithPopup(provider);
    chatCurrentUser = credential.user;
    localStorage.setItem(CHAT_STORAGE_KEYS.unlocked, "true");
    chatPasswordInput.value = "";
    chatLoginError.textContent = "";
    showTexting();
  } catch (error) {
    chatLoginError.textContent = error instanceof Error ? error.message : "Could not sign in with Google.";
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
initializeChatAccountState();

export {};
