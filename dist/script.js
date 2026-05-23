import { filterBadLanguage, hasBadLanguage } from "./content-filter.js";
const PASSWORD = "madera";
const MASTER_OWNER_CODE = "MILLER RULES";
const MAX_PHOTO_SIZE = 1.5 * 1024 * 1024;
const STORAGE_KEYS = {
    unlocked: "maderaWikiUnlocked",
    articles: "maderaWikiArticles",
    seedVersion: "maderaWikiSeedVersion",
};
function requiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }
    return element;
}
const importedArticles = (window.IMPORTED_ARTICLES || []).map((article) => normalizeArticle({ ...article, createdAt: "Imported" }, 0));
const featuredTopics = (window.FEATURED_TOPICS || []).map(cleanArticleTitle).sort(compareTitles);
const seedVersion = window.SCHOOL_WIKI_VERSION || "default";
const loginScreen = requiredElement("#login-screen");
const wikiScreen = requiredElement("#wiki-screen");
const loginForm = requiredElement("#login-form");
const loginError = requiredElement("#login-error");
const passwordInput = requiredElement("#password");
const accountNameInput = requiredElement("#account-name");
const accountEmailInput = requiredElement("#account-email");
const accountPasswordInput = requiredElement("#account-password");
const googleLoginButton = requiredElement("#google-login-button");
const lockButton = requiredElement("#lock-button");
const rulesSection = requiredElement("#rules-section");
const featuredSection = requiredElement("#featured-section");
const articlesSection = requiredElement("#articles-section");
const articleCreatePage = requiredElement("#article-create-page");
const makeArticleButton = requiredElement("#make-article-button");
const cancelArticleButton = requiredElement("#cancel-article-button");
const adminForm = requiredElement("#admin-form");
const adminCodeInput = requiredElement("#admin-code");
const adminStatus = requiredElement("#admin-status");
const accountStatus = requiredElement("#account-status");
const articleForm = requiredElement("#article-form");
const articlesList = requiredElement("#articles-list");
const articleSearchInput = requiredElement("#article-search");
const articleResultsNote = requiredElement("#article-results-note");
const topicIndex = requiredElement("#topic-index");
const featuredTopicsList = requiredElement("#featured-topics");
const articlePhotoInput = requiredElement("#article-photo");
const photoPreview = requiredElement("#photo-preview");
const photoError = requiredElement("#photo-error");
const ownerCodeInput = requiredElement("#article-owner-code");
const articleBodyInput = requiredElement("#article-body");
let selectedPhoto = null;
let currentSearch = "";
let adminUnlocked = false;
let currentUser = null;
const articleSyncRef = getFirebaseReference("schoolWiki/articles");
const authClient = getFirebaseAuth();
let applyingRemoteArticles = false;
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
function requireSharedPassword() {
    if (passwordInput.value.trim() === PASSWORD) {
        return true;
    }
    loginError.textContent = passwordInput.value.trim()
        ? "The shared class password does not match."
        : "Enter the shared class password first.";
    passwordInput.focus();
    return false;
}
function initializeSeedData() {
    const existingVersion = localStorage.getItem(STORAGE_KEYS.seedVersion);
    const existingArticles = localStorage.getItem(STORAGE_KEYS.articles);
    if (existingVersion !== seedVersion || !existingArticles) {
        saveItems(STORAGE_KEYS.articles, normalizeArticles(importedArticles));
        localStorage.setItem(STORAGE_KEYS.seedVersion, seedVersion);
        return;
    }
    saveItems(STORAGE_KEYS.articles, normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles)));
}
function cleanArticleTitle(title) {
    return title.trim().replace(/^the\s+/i, "");
}
function compareTitles(first, second) {
    return first.localeCompare(second, undefined, { sensitivity: "base" });
}
function compareArticles(first, second) {
    return compareTitles(first.title, second.title);
}
function getItems(key, fallback) {
    const saved = localStorage.getItem(key);
    if (!saved)
        return fallback;
    try {
        return JSON.parse(saved);
    }
    catch {
        return fallback;
    }
}
function saveItems(key, items) {
    try {
        localStorage.setItem(key, JSON.stringify(items));
        return true;
    }
    catch {
        return false;
    }
}
function persistArticles(articles) {
    const normalizedArticles = normalizeArticles(articles);
    const saved = saveItems(STORAGE_KEYS.articles, normalizedArticles);
    if (!saved)
        return false;
    if (articleSyncRef && !applyingRemoteArticles) {
        void articleSyncRef.set(normalizedArticles);
    }
    return true;
}
function initializeArticleSync() {
    if (!articleSyncRef)
        return;
    articleSyncRef
        .once("value")
        .then((snapshot) => {
        const remoteArticles = snapshot.val();
        if (Array.isArray(remoteArticles) && remoteArticles.length > 0) {
            saveItems(STORAGE_KEYS.articles, normalizeArticles(remoteArticles));
            renderArticles();
            renderTopicIndex();
            return;
        }
        void articleSyncRef.set(normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles)));
    })
        .catch(() => undefined);
    articleSyncRef.on("value", (snapshot) => {
        const remoteArticles = snapshot.val();
        if (!Array.isArray(remoteArticles))
            return;
        applyingRemoteArticles = true;
        saveItems(STORAGE_KEYS.articles, normalizeArticles(remoteArticles));
        applyingRemoteArticles = false;
        renderArticles();
        renderTopicIndex();
    });
}
function escapeHtml(value) {
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
function showWiki() {
    loginScreen.classList.add("hidden");
    wikiScreen.classList.remove("hidden");
    accountStatus.textContent = currentUser?.displayName || currentUser?.email || "Account";
    showArticleHome();
    renderFeaturedTopics();
    renderArticles();
    renderTopicIndex();
}
function showLogin() {
    wikiScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    accountEmailInput.focus();
}
function initializeAccountState() {
    if (!authClient) {
        if (localStorage.getItem(STORAGE_KEYS.unlocked) === "true") {
            showWiki();
        }
        else {
            showLogin();
        }
        return;
    }
    authClient.onAuthStateChanged((user) => {
        currentUser = user;
        if (user && localStorage.getItem(STORAGE_KEYS.unlocked) === "true") {
            showWiki();
            return;
        }
        localStorage.removeItem(STORAGE_KEYS.unlocked);
        showLogin();
    });
}
function showArticleHome() {
    rulesSection.classList.remove("hidden");
    featuredSection.classList.remove("hidden");
    articlesSection.classList.remove("hidden");
    articleCreatePage.classList.add("hidden");
}
function showArticleCreatePage() {
    rulesSection.classList.add("hidden");
    featuredSection.classList.add("hidden");
    articlesSection.classList.add("hidden");
    articleCreatePage.classList.remove("hidden");
    const authorInput = requiredElement("#article-author");
    if (!authorInput.value.trim() && currentUser?.displayName) {
        authorInput.value = currentUser.displayName;
    }
    authorInput.focus();
}
function formatDate() {
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date());
}
function renderArticles() {
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
function normalizeArticles(articles) {
    return articles.map((article, index) => normalizeArticle(article, index)).sort(compareArticles);
}
function normalizeArticle(article, index) {
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
function mergeAdditionsIntoBody(article) {
    if (!article.additions || article.additions.length === 0)
        return article.body;
    const additionsText = article.additions
        .map((addition) => `${addition.author} added: ${addition.body}`)
        .join("\n\n");
    return `${article.body}\n\n${additionsText}`;
}
function makeArticleId(title, index) {
    return `${cleanArticleTitle(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${index}`;
}
function filterArticles(articles) {
    const query = currentSearch.trim().toLowerCase();
    if (!query)
        return articles;
    return articles.filter((article) => [article.title, article.author, article.topic, article.body].join(" ").toLowerCase().includes(query));
}
function renderFeaturedTopics() {
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
function renderTopicIndex() {
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
function resetPhoto() {
    selectedPhoto = null;
    photoPreview.className = "photo-preview empty-preview";
    photoPreview.textContent = "No photo selected";
    photoError.textContent = "";
}
function openArticleEditor(articleId, card) {
    if (!articleId)
        return;
    const articles = normalizeArticles(getItems(STORAGE_KEYS.articles, importedArticles));
    const article = articles.find((item) => item.id === articleId);
    if (!article)
        return;
    const existingEditor = card.querySelector(".inline-editor");
    if (existingEditor) {
        existingEditor.focus();
        return;
    }
    const bodyElement = card.querySelector("[data-role='article-body']");
    const contentElement = card.querySelector(".article-card-content");
    if (!bodyElement || !contentElement)
        return;
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
function saveInlineEdit(textarea) {
    const articleId = textarea.dataset.articleId;
    if (!articleId)
        return;
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
async function saveInlinePhoto(input) {
    const articleId = input.dataset.articleId;
    const file = input.files?.[0];
    const note = input.closest(".inline-photo-tools")?.querySelector(".form-note");
    if (!articleId || !note)
        return;
    note.textContent = "";
    if (!file)
        return;
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
    }
    catch (error) {
        note.textContent = error instanceof Error ? error.message : "Could not read photo.";
    }
}
function keepLockedPrefix(textarea) {
    const lockedLength = Number(textarea.dataset.lockedPrefixLength || "0");
    if (lockedLength === 0)
        return;
    const prefix = textarea.dataset.originalText || "";
    if (textarea.value.startsWith(prefix))
        return;
    const typedText = textarea.value.slice(Math.min(textarea.value.length, lockedLength));
    textarea.value = `${prefix}${typedText}`;
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
}
function readPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
            }
            else {
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
    if (!file)
        return;
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
    }
    catch (error) {
        photoError.textContent = error instanceof Error ? error.message : "Could not read photo.";
        articlePhotoInput.value = "";
    }
});
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireSharedPassword())
        return;
    const action = event.submitter?.dataset.action || "login";
    const email = accountEmailInput.value.trim();
    const accountPassword = accountPasswordInput.value;
    const name = accountNameInput.value.trim();
    try {
        if (authClient) {
            if (action === "signup") {
                const credential = await authClient.createUserWithEmailAndPassword(email, accountPassword);
                if (credential.user && name) {
                    await credential.user.updateProfile({ displayName: name });
                }
                currentUser = credential.user;
            }
            else {
                const credential = await authClient.signInWithEmailAndPassword(email, accountPassword);
                currentUser = credential.user;
            }
        }
        localStorage.setItem(STORAGE_KEYS.unlocked, "true");
        loginError.textContent = "";
        passwordInput.value = "";
        accountPasswordInput.value = "";
        showWiki();
    }
    catch (error) {
        loginError.textContent = error instanceof Error ? error.message : "Could not log in.";
    }
});
googleLoginButton.addEventListener("click", async () => {
    if (!requireSharedPassword())
        return;
    if (!window.firebase || !authClient) {
        loginError.textContent = "Google sign-in is not available yet.";
        return;
    }
    try {
        const provider = new window.firebase.auth.GoogleAuthProvider();
        const credential = await authClient.signInWithPopup(provider);
        currentUser = credential.user;
        localStorage.setItem(STORAGE_KEYS.unlocked, "true");
        loginError.textContent = "";
        passwordInput.value = "";
        showWiki();
    }
    catch (error) {
        loginError.textContent = error instanceof Error ? error.message : "Could not sign in with Google.";
    }
});
lockButton.addEventListener("click", async () => {
    localStorage.removeItem(STORAGE_KEYS.unlocked);
    if (authClient) {
        await authClient.signOut();
    }
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
    const author = requiredElement("#article-author").value.trim();
    const title = cleanArticleTitle(requiredElement("#article-title").value);
    const body = articleBodyInput.value.trim();
    if (hasBadLanguage(`${author} ${title} ${body}`)) {
        photoError.textContent = "Please remove bad language before publishing.";
        return;
    }
    const article = {
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
    articleForm.querySelector("button[type='submit']").textContent = "Publish";
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
    const target = event.target;
    if (target.closest(".inline-editor") || target.closest(".inline-photo-tools"))
        return;
    const card = target.closest(".article-card");
    if (!card)
        return;
    openArticleEditor(card.dataset.id, card);
});
articlesList.addEventListener("keydown", (event) => {
    const target = event.target;
    const textarea = target.closest(".inline-editor");
    if (textarea) {
        handleProtectedKeydown(event, textarea);
        return;
    }
    if (event.key !== "Enter" && event.key !== " ")
        return;
    const card = target.closest(".article-card");
    if (!card)
        return;
    event.preventDefault();
    openArticleEditor(card.dataset.id, card);
});
function handleProtectedKeydown(event, textarea) {
    const lockedLength = Number(textarea.dataset.lockedPrefixLength || "0");
    if (lockedLength === 0)
        return;
    const startsInsideLockedText = textarea.selectionStart <= lockedLength;
    const selectionTouchesLockedText = textarea.selectionStart < lockedLength;
    if ((event.key === "Backspace" && startsInsideLockedText) || (event.key === "Delete" && selectionTouchesLockedText)) {
        event.preventDefault();
    }
}
articlesList.addEventListener("beforeinput", (event) => {
    const target = event.target;
    const textarea = target.closest(".inline-editor");
    if (!textarea)
        return;
    const lockedLength = Number(textarea.dataset.lockedPrefixLength || "0");
    if (lockedLength > 0 && textarea.selectionStart < lockedLength) {
        event.preventDefault();
    }
});
articlesList.addEventListener("input", (event) => {
    const target = event.target;
    const textarea = target.closest(".inline-editor");
    if (!textarea)
        return;
    keepLockedPrefix(textarea);
    saveInlineEdit(textarea);
});
articlesList.addEventListener("change", (event) => {
    const target = event.target;
    const input = target.closest(".inline-photo-input");
    if (!input)
        return;
    void saveInlinePhoto(input);
});
articlesList.addEventListener("blur", (event) => {
    const target = event.target;
    const textarea = target.closest(".inline-editor");
    if (!textarea)
        return;
    const nextTarget = event.relatedTarget;
    if (nextTarget?.closest(".inline-photo-tools"))
        return;
    saveInlineEdit(textarea);
    renderArticles();
}, true);
articlesList.addEventListener("paste", (event) => {
    const target = event.target;
    const textarea = target.closest(".inline-editor");
    if (!textarea)
        return;
    const lockedLength = Number(textarea.dataset.lockedPrefixLength || "0");
    if (lockedLength > 0 && textarea.selectionStart < lockedLength) {
        event.preventDefault();
    }
});
initializeSeedData();
initializeArticleSync();
initializeAccountState();
