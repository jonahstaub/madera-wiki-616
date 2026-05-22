import { filterBadLanguage, hasBadLanguage } from "./content-filter.js";

const PASSWORD = "madera";
const MASTER_OWNER_CODE = "MILLER RULES";
const MAX_PHOTO_SIZE = 1.5 * 1024 * 1024;
const STORAGE_KEYS = {
  unlocked: "maderaWikiUnlocked",
  articles: "maderaWikiArticles",
  seedVersion: "maderaWikiSeedVersion",
} as const;

type Article = Required<Pick<SchoolWikiArticle, "id" | "author" | "ownerCode" | "title" | "topic" | "body" | "createdAt">> & {
  photo: string | null;
  additions: SchoolWikiAddition[];
};

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

const importedArticles: Article[] = (window.IMPORTED_ARTICLES || []).map((article) =>
  normalizeArticle({ ...article, createdAt: "Imported" }, 0),
);
const featuredTopics = (window.FEATURED_TOPICS || []).map(cleanArticleTitle).sort(compareTitles);
const seedVersion = window.SCHOOL_WIKI_VERSION || "default";

const loginScreen = requiredElement<HTMLElement>("#login-screen");
const wikiScreen = requiredElement<HTMLElement>("#wiki-screen");
const loginForm = requiredElement<HTMLFormElement>("#login-form");
const loginError = requiredElement<HTMLElement>("#login-error");
const passwordInput = requiredElement<HTMLInputElement>("#password");
const lockButton = requiredElement<HTMLButtonElement>("#lock-button");
const rulesSection = requiredElement<HTMLElement>("#rules-section");
const featuredSection = requiredElement<HTMLElement>("#featured-section");
const articlesSection = requiredElement<HTMLElement>("#articles-section");
const articleCreatePage = requiredElement<HTMLElement>("#article-create-page");
const makeArticleButton = requiredElement<HTMLButtonElement>("#make-article-button");
const cancelArticleButton = requiredElement<HTMLButtonElement>("#cancel-article-button");
const adminForm = requiredElement<HTMLFormElement>("#admin-form");
const adminCodeInput = requiredElement<HTMLInputElement>("#admin-code");
const adminStatus = requiredElement<HTMLElement>("#admin-status");
const articleForm = requiredElement<HTMLFormElement>("#article-form");
const articlesList = requiredElement<HTMLElement>("#articles-list");
const articleSearchInput = requiredElement<HTMLInputElement>("#article-search");
const articleResultsNote = requiredElement<HTMLElement>("#article-results-note");
const topicIndex = requiredElement<HTMLElement>("#topic-index");
const featuredTopicsList = requiredElement<HTMLElement>("#featured-topics");
const articlePhotoInput = requiredElement<HTMLInputElement>("#article-photo");
const photoPreview = requiredElement<HTMLElement>("#photo-preview");
const photoError = requiredElement<HTMLElement>("#photo-error");
const ownerCodeInput = requiredElement<HTMLInputElement>("#article-owner-code");
const articleBodyInput = requiredElement<HTMLTextAreaElement>("#article-body");

let selectedPhoto: string | null = null;
let currentSearch = "";
let adminUnlocked = false;
const articleSyncRef = getFirebaseReference("schoolWiki/articles");
let applyingRemoteArticles = false;

function getFirebaseReference(path: string): FirebaseCompatReference | null {
  if (!window.firebase || !window.SCHOOL_WIKI_FIREBASE_CONFIG) return null;

  if (window.firebase.apps.length === 0) {
    window.firebase.initializeApp(window.SCHOOL_WIKI_FIREBASE_CONFIG);
  }

  return window.firebase.database().ref(path);
}

function initializeSeedData(): void {
  const existingVersion = localStorage.getItem(STORAGE_KEYS.seedVersion);
  const existingArticles = localStorage.getItem(STORAGE_KEYS.articles);

  if (existingVersion !== seedVersion || !existingArticles) {
    saveItems(STORAGE_KEYS.articles, normalizeArticles(importedArticles));
    localStorage.setItem(STORAGE_KEYS.seedVersion, seedVersion);
    return;
  }

  saveItems(STORAGE_KEYS.articles, normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles)));
}

function cleanArticleTitle(title: string): string {
  return title.trim().replace(/^the\s+/i, "");
}

function compareTitles(first: string, second: string): number {
  return first.localeCompare(second, undefined, { sensitivity: "base" });
}

function compareArticles(first: Article, second: Article): number {
  return compareTitles(first.title, second.title);
}

function getItems<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  if (!saved) return fallback;

  try {
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

function saveItems(key: string, items: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function persistArticles(articles: Article[]): boolean {
  const normalizedArticles = normalizeArticles(articles);
  const saved = saveItems(STORAGE_KEYS.articles, normalizedArticles);
  if (!saved) return false;

  if (articleSyncRef && !applyingRemoteArticles) {
    void articleSyncRef.set(normalizedArticles);
  }

  return true;
}

function initializeArticleSync(): void {
  if (!articleSyncRef) return;

  articleSyncRef
    .once("value")
    .then((snapshot) => {
      const remoteArticles = snapshot.val();

      if (Array.isArray(remoteArticles) && remoteArticles.length > 0) {
        saveItems(STORAGE_KEYS.articles, normalizeArticles(remoteArticles as SchoolWikiArticle[]));
        renderArticles();
        renderTopicIndex();
        return;
      }

      void articleSyncRef.set(normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles)));
    })
    .catch(() => undefined);

  articleSyncRef.on("value", (snapshot) => {
    const remoteArticles = snapshot.val();
    if (!Array.isArray(remoteArticles)) return;

    applyingRemoteArticles = true;
    saveItems(STORAGE_KEYS.articles, normalizeArticles(remoteArticles as SchoolWikiArticle[]));
    applyingRemoteArticles = false;
    renderArticles();
    renderTopicIndex();
  });
}

function escapeHtml(value: string): string {
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

function showWiki(): void {
  loginScreen.classList.add("hidden");
  wikiScreen.classList.remove("hidden");
  showArticleHome();
  renderFeaturedTopics();
  renderArticles();
  renderTopicIndex();
}

function showLogin(): void {
  wikiScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  passwordInput.focus();
}

function showArticleHome(): void {
  rulesSection.classList.remove("hidden");
  featuredSection.classList.remove("hidden");
  articlesSection.classList.remove("hidden");
  articleCreatePage.classList.add("hidden");
}

function showArticleCreatePage(): void {
  rulesSection.classList.add("hidden");
  featuredSection.classList.add("hidden");
  articlesSection.classList.add("hidden");
  articleCreatePage.classList.remove("hidden");
  requiredElement<HTMLInputElement>("#article-author").focus();
}

function formatDate(): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function renderArticles(): void {
  const articles = normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles));
  const filteredArticles = filterArticles(articles);
  articlesList.innerHTML = "";

  if (!currentSearch.trim()) {
    articleResultsNote.textContent = "Search or click a topic to read articles.";
    return;
  }

  if (filteredArticles.length === 0) {
    articleResultsNote.textContent = "No matching articles.";
    articlesList.innerHTML = '<p class="empty-state">No articles yet. Start the first one.</p>';
    return;
  }

  articleResultsNote.textContent = `${filteredArticles.length} article${filteredArticles.length === 1 ? "" : "s"} found.`;

  filteredArticles.forEach((article) => {
    const card = document.createElement("article");
    card.className = "article-card";
    const photo = article.photo
      ? `<img class="article-photo" src="${article.photo}" alt="${escapeHtml(article.title)} photo" />`
      : "";
    card.innerHTML = `
      ${photo}
      <div class="article-card-content">
        <p class="meta"><span class="topic">${escapeHtml(article.topic)}</span> by ${escapeHtml(article.author)} - ${escapeHtml(article.createdAt)}</p>
        <h3>${escapeHtml(article.title)}</h3>
        <p class="article-body" data-role="article-body">${escapeHtml(article.body)}</p>
      </div>
    `;
    card.dataset.id = article.id;
    card.tabIndex = 0;
    articlesList.append(card);
  });
}

function normalizeArticles(articles: SchoolWikiArticle[]): Article[] {
  return articles.map((article, index) => normalizeArticle(article, index)).sort(compareArticles);
}

function normalizeArticle(article: SchoolWikiArticle, index: number): Article {
  return {
    id: article.id || makeArticleId(article.title, index),
    author: article.author,
    ownerCode: article.ownerCode || "",
    title: cleanArticleTitle(article.title),
    topic: article.topic.trim(),
    body: mergeAdditionsIntoBody(article),
    photo: article.photo || null,
    createdAt: article.createdAt || formatDate(),
    additions: [],
  };
}

function mergeAdditionsIntoBody(article: SchoolWikiArticle): string {
  if (!article.additions || article.additions.length === 0) return article.body;

  const additionsText = article.additions
    .map((addition) => `${addition.author} added: ${addition.body}`)
    .join("\n\n");

  return `${article.body}\n\n${additionsText}`;
}

function makeArticleId(title: string, index: number): string {
  return `${cleanArticleTitle(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${index}`;
}

function filterArticles(articles: Article[]): Article[] {
  const query = currentSearch.trim().toLowerCase();
  if (!query) return articles;

  return articles.filter((article) =>
    [article.title, article.author, article.topic, article.body].join(" ").toLowerCase().includes(query),
  );
}

function renderFeaturedTopics(): void {
  featuredTopicsList.innerHTML = "";
  featuredTopics.forEach((topic) => {
    const button = document.createElement("button");
    button.className = "topic-pill";
    button.type = "button";
    button.textContent = topic;
    button.addEventListener("click", () => {
      articleSearchInput.value = topic;
      currentSearch = topic;
      renderArticles();
    });
    featuredTopicsList.append(button);
  });
}

function renderTopicIndex(): void {
  const articles = normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles));
  topicIndex.innerHTML = "";

  articles
    .map((article) => article.title)
    .sort(compareTitles)
    .forEach((title) => {
      const button = document.createElement("button");
      button.className = "index-link";
      button.type = "button";
      button.textContent = title;
      button.addEventListener("click", () => {
        articleSearchInput.value = title;
        currentSearch = title;
        renderArticles();
      });
      topicIndex.append(button);
    });
}

function resetPhoto(): void {
  selectedPhoto = null;
  photoPreview.className = "photo-preview empty-preview";
  photoPreview.textContent = "No photo selected";
  photoError.textContent = "";
}

function openArticleEditor(articleId: string | undefined, card: HTMLElement): void {
  if (!articleId) return;
  const articles = normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles));
  const article = articles.find((item) => item.id === articleId);
  if (!article) return;

  const existingEditor = card.querySelector<HTMLTextAreaElement>(".inline-editor");
  if (existingEditor) {
    existingEditor.focus();
    return;
  }

  const bodyElement = card.querySelector<HTMLElement>("[data-role='article-body']");
  const contentElement = card.querySelector<HTMLElement>(".article-card-content");
  if (!bodyElement || !contentElement) return;

  const textarea = document.createElement("textarea");
  const photoTools = document.createElement("div");
  const originalText = article.body;
  const appendPrefix = `${originalText}\n\n`;
  const lockedPrefixLength = appendPrefix.length;

  textarea.className = "inline-editor";
  textarea.value = adminUnlocked ? originalText : appendPrefix;
  textarea.rows = Math.max(6, Math.min(18, textarea.value.split("\n").length + 2));
  textarea.dataset.articleId = article.id;
  textarea.dataset.originalText = appendPrefix;
  textarea.dataset.lockedPrefixLength = String(adminUnlocked ? 0 : lockedPrefixLength);
  textarea.setAttribute("aria-label", adminUnlocked ? `Edit ${article.title}` : `Write in ${article.title}`);
  photoTools.className = "inline-photo-tools";
  photoTools.innerHTML = `
    <label>
      Photo
      <input class="inline-photo-input" type="file" accept="image/*" data-article-id="${escapeHtml(article.id)}" tabindex="0" />
    </label>
    <p class="form-note"></p>
  `;

  bodyElement.replaceWith(textarea);
  contentElement.append(photoTools);
  textarea.focus();
  textarea.selectionStart = textarea.value.length;
  textarea.selectionEnd = textarea.value.length;
}

function saveInlineEdit(textarea: HTMLTextAreaElement): void {
  const articleId = textarea.dataset.articleId;
  if (!articleId) return;

  const filteredValue = filterBadLanguage(textarea.value);
  if (filteredValue !== textarea.value) {
    textarea.value = filteredValue;
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
  }

  const nextBody = filteredValue.trimEnd();
  const articles = normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles));

  persistArticles(articles.map((article) => (article.id === articleId ? { ...article, body: nextBody } : article)));
}

async function saveInlinePhoto(input: HTMLInputElement): Promise<void> {
  const articleId = input.dataset.articleId;
  const file = input.files?.[0];
  const note = input.closest(".inline-photo-tools")?.querySelector<HTMLElement>(".form-note");
  if (!articleId || !note) return;

  note.textContent = "";
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    note.textContent = "Please choose an image file.";
    input.value = "";
    return;
  }

  if (file.size > MAX_PHOTO_SIZE) {
    note.textContent = "Choose a photo smaller than 1.5 MB.";
    input.value = "";
    return;
  }

  try {
    const photo = await readPhoto(file);
    const articles = normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles));
    persistArticles(articles.map((article) => (article.id === articleId ? { ...article, photo } : article)));
    renderArticles();
  } catch (error) {
    note.textContent = error instanceof Error ? error.message : "Could not read photo.";
  }
}

function keepLockedPrefix(textarea: HTMLTextAreaElement): void {
  const lockedLength = Number(textarea.dataset.lockedPrefixLength || "0");
  if (lockedLength === 0) return;

  const prefix = textarea.dataset.originalText || "";
  if (textarea.value.startsWith(prefix)) return;

  const typedText = textarea.value.slice(Math.min(textarea.value.length, lockedLength));
  textarea.value = `${prefix}${typedText}`;
  textarea.selectionStart = textarea.value.length;
  textarea.selectionEnd = textarea.value.length;
}

function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read photo."));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Could not read photo.")));
    reader.readAsDataURL(file);
  });
}

articlePhotoInput.addEventListener("change", async () => {
  const file = articlePhotoInput.files?.[0];
  resetPhoto();

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    photoError.textContent = "Please choose an image file.";
    articlePhotoInput.value = "";
    return;
  }

  if (file.size > MAX_PHOTO_SIZE) {
    photoError.textContent = "Choose a photo smaller than 1.5 MB.";
    articlePhotoInput.value = "";
    return;
  }

  try {
    selectedPhoto = await readPhoto(file);
    photoPreview.className = "photo-preview";
    photoPreview.innerHTML = `<img src="${selectedPhoto}" alt="Selected article photo preview" />`;
  } catch (error) {
    photoError.textContent = error instanceof Error ? error.message : "Could not read photo.";
    articlePhotoInput.value = "";
  }
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (passwordInput.value.trim() !== PASSWORD) {
    loginError.textContent = "That password does not match.";
    return;
  }

  localStorage.setItem(STORAGE_KEYS.unlocked, "true");
  loginError.textContent = "";
  passwordInput.value = "";
  showWiki();
});

lockButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEYS.unlocked);
  showLogin();
});

makeArticleButton.addEventListener("click", () => {
  showArticleCreatePage();
});

cancelArticleButton.addEventListener("click", () => {
  showArticleHome();
});

articleForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const author = requiredElement<HTMLInputElement>("#article-author").value.trim();
  const title = cleanArticleTitle(requiredElement<HTMLInputElement>("#article-title").value);
  const body = articleBodyInput.value.trim();

  if (hasBadLanguage(`${author} ${title} ${body}`)) {
    photoError.textContent = "Please remove bad language before publishing.";
    return;
  }

  const article: Article = {
    id: `article-${Date.now()}`,
    author,
    ownerCode: ownerCodeInput.value.trim(),
    title,
    topic: "Other",
    body,
    photo: selectedPhoto,
    createdAt: formatDate(),
    additions: [],
  };

  const articles = normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles));
  const saved = persistArticles([article, ...articles]);
  if (!saved) {
    photoError.textContent = "This post is too large to save. Try a smaller photo.";
    return;
  }

  articleForm.reset();
  resetPhoto();
  articleBodyInput.placeholder = "";
  articleForm.querySelector<HTMLButtonElement>("button[type='submit']")!.textContent = "Publish";
  articleSearchInput.value = article.title;
  currentSearch = article.title;
  showArticleHome();
  renderArticles();
  renderTopicIndex();
});

articleSearchInput.addEventListener("input", () => {
  currentSearch = articleSearchInput.value;
  renderArticles();
});

adminForm.addEventListener("submit", (event) => {
  event.preventDefault();
  adminUnlocked = adminCodeInput.value.trim() === MASTER_OWNER_CODE;
  adminStatus.textContent = adminUnlocked ? "Admin" : "Viewer";
  adminStatus.classList.toggle("is-admin", adminUnlocked);
  adminCodeInput.value = "";
});

articlesList.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest(".inline-editor") || target.closest(".inline-photo-tools")) return;
  const card = target.closest<HTMLElement>(".article-card");
  if (!card) return;
  openArticleEditor(card.dataset.id, card);
});

articlesList.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  const textarea = target.closest<HTMLTextAreaElement>(".inline-editor");
  if (textarea) {
    handleProtectedKeydown(event, textarea);
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") return;
  const card = target.closest<HTMLElement>(".article-card");
  if (!card) return;
  event.preventDefault();
  openArticleEditor(card.dataset.id, card);
});

function handleProtectedKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
  const lockedLength = Number(textarea.dataset.lockedPrefixLength || "0");
  if (lockedLength === 0) return;

  const startsInsideLockedText = textarea.selectionStart <= lockedLength;
  const selectionTouchesLockedText = textarea.selectionStart < lockedLength;

  if ((event.key === "Backspace" && startsInsideLockedText) || (event.key === "Delete" && selectionTouchesLockedText)) {
    event.preventDefault();
  }
}

articlesList.addEventListener("beforeinput", (event) => {
  const target = event.target as HTMLElement;
  const textarea = target.closest<HTMLTextAreaElement>(".inline-editor");
  if (!textarea) return;

  const lockedLength = Number(textarea.dataset.lockedPrefixLength || "0");
  if (lockedLength > 0 && textarea.selectionStart < lockedLength) {
    event.preventDefault();
  }
});

articlesList.addEventListener("input", (event) => {
  const target = event.target as HTMLElement;
  const textarea = target.closest<HTMLTextAreaElement>(".inline-editor");
  if (!textarea) return;
  keepLockedPrefix(textarea);
  saveInlineEdit(textarea);
});

articlesList.addEventListener("change", (event) => {
  const target = event.target as HTMLElement;
  const input = target.closest<HTMLInputElement>(".inline-photo-input");
  if (!input) return;
  void saveInlinePhoto(input);
});

articlesList.addEventListener(
  "blur",
  (event) => {
    const target = event.target as HTMLElement;
    const textarea = target.closest<HTMLTextAreaElement>(".inline-editor");
    if (!textarea) return;
    const nextTarget = event.relatedTarget as HTMLElement | null;
    if (nextTarget?.closest(".inline-photo-tools")) return;
    saveInlineEdit(textarea);
    renderArticles();
  },
  true,
);

articlesList.addEventListener("paste", (event) => {
  const target = event.target as HTMLElement;
  const textarea = target.closest<HTMLTextAreaElement>(".inline-editor");
  if (!textarea) return;

  const lockedLength = Number(textarea.dataset.lockedPrefixLength || "0");
  if (lockedLength > 0 && textarea.selectionStart < lockedLength) {
    event.preventDefault();
  }
});

initializeSeedData();
initializeArticleSync();

if (localStorage.getItem(STORAGE_KEYS.unlocked) === "true") {
  showWiki();
} else {
  showLogin();
}

export {};
