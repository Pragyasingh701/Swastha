// Page-level English <-> Hindi translation of the app's STATIC text using
// Google's website translate widget. It rewrites the DOM in place, which
// React doesn't expect, so this file also carries the standard guard against
// the resulting "removeChild"/"insertBefore" crashes.
//
// AI answers, extracted record text and anything else that must stay
// verbatim is excluded by marking it translate="no" (see ChatBubble in
// AISearch / DoctorAskSwastha / IntakeChat) — the backend already writes
// those in the selected language.

const SCRIPT_ID = "google-translate-script";
const CONTAINER_ID = "google_translate_element";
const COOKIE = "googtrans";

// Elements the translator must never touch. Material Symbols icons are text
// ligatures ("dashboard", "auto_awesome"), so translating them breaks the
// icon; codes (check-in / patient IDs) must stay exactly as issued.
const NO_TRANSLATE_SELECTOR = ".material-symbols-outlined, .material-icons, [data-no-translate]";

let nodePatched = false;
let protectionStarted = false;
let scriptRequested = false;

// Google wraps text nodes in <font> tags. When React later tries to remove or
// insert relative to a node Google has already moved, the browser throws and
// the whole tree unmounts. Ignoring the mismatch (and degrading gracefully)
// is the widely used workaround.
function patchDomForTranslation() {
  if (nodePatched || typeof Node === "undefined") return;
  nodePatched = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
}

function markNoTranslate(root) {
  if (root.nodeType !== 1) return;
  if (root.matches(NO_TRANSLATE_SELECTOR)) root.setAttribute("translate", "no");
  root.querySelectorAll(NO_TRANSLATE_SELECTOR).forEach((el) => el.setAttribute("translate", "no"));
}

/**
 * Tag icons (and anything with data-no-translate) as translate="no", now and
 * for everything React renders later. Runs from app start, well before the
 * widget's async translation pass, so it needs no per-icon markup.
 */
export function protectNonTextElements() {
  if (protectionStarted || typeof document === "undefined") return;
  protectionStarted = true;

  markNoTranslate(document.body);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach(markNoTranslate);
  }).observe(document.body, { childList: true, subtree: true });
}

function setTranslateCookie(lang) {
  const host = window.location.hostname;
  if (lang === "hi") {
    const value = `/en/hi`;
    document.cookie = `${COOKIE}=${value}; path=/`;
    document.cookie = `${COOKIE}=${value}; path=/; domain=${host}`;
  } else {
    const expired = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = `${COOKIE}=; ${expired}; path=/`;
    document.cookie = `${COOKIE}=; ${expired}; path=/; domain=${host}`;
    document.cookie = `${COOKIE}=; ${expired}; path=/; domain=.${host}`;
  }
}

function loadWidget() {
  if (scriptRequested || typeof document === "undefined") return;
  scriptRequested = true;

  patchDomForTranslation();

  if (!document.getElementById(CONTAINER_ID)) {
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    document.body.appendChild(container);
  }

  window.googleTranslateElementInit = () => {
    // eslint-disable-next-line no-new
    new window.google.translate.TranslateElement(
      {
        pageLanguage: "en",
        includedLanguages: "en,hi",
        autoDisplay: false,
      },
      CONTAINER_ID
    );
  };

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  script.async = true;
  script.onerror = () => {
    // Blocked or offline: the app simply stays in English.
    scriptRequested = false;
  };
  document.body.appendChild(script);
}

/**
 * Apply the selected language to the page's static text.
 * @param {'en'|'hi'} lang
 */
export function applyPageLanguage(lang) {
  if (typeof window === "undefined") return;

  document.documentElement.lang = lang === "hi" ? "hi" : "en";
  setTranslateCookie(lang);

  const combo = document.querySelector(".goog-te-combo");

  if (lang === "hi") {
    if (combo) {
      combo.value = "hi";
      combo.dispatchEvent(new Event("change"));
    } else {
      // First load: the widget reads the cookie set above when it
      // initialises and translates the page on its own.
      loadWidget();
    }
    return;
  }

  // Back to English: the widget has no reliable in-place restore, so reload
  // once the cookie is cleared — but only if a translation is actually live.
  if (combo || document.documentElement.classList.contains("translated-ltr")) {
    window.location.reload();
  }
}
