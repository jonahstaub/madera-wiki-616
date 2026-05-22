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

  const message: SchoolWikiMessage = {
    author: requiredChatElement<HTMLInputElement>("#message-author").value.trim(),
    body: requiredChatElement<HTMLTextAreaElement>("#message-body").value.trim(),
    createdAt: formatChatDate(),
  };

  saveMessages([...getMessages(), message].slice(-100));
  requiredChatElement<HTMLTextAreaElement>("#message-body").value = "";
  renderMessages();
});

if (localStorage.getItem(CHAT_STORAGE_KEYS.unlocked) === "true") {
  showTexting();
} else {
  showLogin();
}

export {};
