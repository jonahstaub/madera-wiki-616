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
}
