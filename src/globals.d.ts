interface SchoolWikiAddition {
  author: string;
  body: string;
  createdAt: string;
}

interface SchoolWikiArticle {
  id?: string;
  author: string;
  ownerCode?: string;
  title: string;
  topic: string;
  body: string;
  photo?: string | null;
  createdAt?: string;
  additions?: SchoolWikiAddition[];
}

interface SchoolWikiMessage {
  author: string;
  body: string;
  createdAt: string;
}

interface Window {
  SCHOOL_WIKI_VERSION?: string;
  FEATURED_TOPICS?: string[];
  IMPORTED_ARTICLES?: SchoolWikiArticle[];
  SCHOOL_WIKI_FIREBASE_CONFIG?: Record<string, string> | null;
  firebase?: FirebaseCompatNamespace;
}

interface FirebaseCompatNamespace {
  apps: unknown[];
  initializeApp(config: Record<string, string>): unknown;
  database(): FirebaseCompatDatabase;
}

interface FirebaseCompatDatabase {
  ref(path: string): FirebaseCompatReference;
}

interface FirebaseCompatReference {
  once(eventType: "value"): Promise<FirebaseCompatSnapshot>;
  on(eventType: "value", callback: (snapshot: FirebaseCompatSnapshot) => void): void;
  set(value: unknown): Promise<void>;
}

interface FirebaseCompatSnapshot {
  val(): unknown;
}
