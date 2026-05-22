const BLOCKED_TERMS = [
    "ass",
    "asshole",
    "bastard",
    "bitch",
    "bullshit",
    "crap",
    "damn",
    "dick",
    "douche",
    "fag",
    "fuck",
    "hell",
    "idiot",
    "jerk",
    "moron",
    "piss",
    "shit",
    "slut",
    "stupid",
    "whore",
];
const BLOCKED_PATTERNS = BLOCKED_TERMS.map((term) => ({
    term,
    pattern: new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
}));
export function filterBadLanguage(value) {
    return BLOCKED_PATTERNS.reduce((text, { term, pattern }) => {
        return text.replace(pattern, "*".repeat(Math.max(term.length, 3)));
    }, value);
}
export function hasBadLanguage(value) {
    return BLOCKED_PATTERNS.some(({ pattern }) => {
        pattern.lastIndex = 0;
        return pattern.test(value);
    });
}
