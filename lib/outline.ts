const SEL = {
  pageContent: ".notion-page-content",
  scroller: ".notion-frame .notion-scroller.vertical",
  frame: ".notion-frame",
  topbar: ".notion-topbar-action-buttons",
  headingBlock: '[class$="header-block"]',
  peekRenderer: ".notion-peek-renderer",
} as const;

type HeadingLevel = "ntoc-h1" | "ntoc-h2" | "ntoc-h3";

interface Heading {
  text: string;
  level: HeadingLevel;
  blockId: string;
}

let tocEl: HTMLElement | null = null;
let contentObserver: MutationObserver | null = null;
let pageObserver: MutationObserver | null = null;
let toggleBtn: HTMLElement | null = null;

export function initToc(): void {
  waitForElement(SEL.scroller).then(async () => {
    await waitForElement(
      `${SEL.pageContent} ${SEL.headingBlock}`,
      30000,
    ).catch(() => {});
    buildToc();
    addToggleButton();
    observeContentChanges();
    observePageChanges();
  });
}

// --- DOM helpers ---

function waitForElement(
  selector: string,
  timeout = 10000,
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      obs.disconnect();
      reject(new Error(`Timeout: ${selector}`));
    }, timeout);
  });
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// --- Heading detection ---

function getHeadings(): Heading[] {
  const pageContent = document.querySelector(SEL.pageContent);
  if (!pageContent || pageContent.closest(SEL.peekRenderer)) return [];

  const els = pageContent.querySelectorAll(SEL.headingBlock);
  const headings: Heading[] = [];

  for (const el of els) {
    let level: HeadingLevel;
    if (el.classList.contains("notion-header-block")) level = "ntoc-h1";
    else if (el.classList.contains("notion-sub_header-block")) level = "ntoc-h2";
    else if (el.classList.contains("notion-sub_sub_header-block"))
      level = "ntoc-h3";
    else continue;

    const blockId = el.getAttribute("data-block-id")?.replace(/-/g, "");
    if (!blockId) continue;

    const text = extractText(el);
    if (!text.trim()) continue;

    headings.push({ text, level, blockId });
  }

  return normalizeLevels(headings);
}

function extractText(el: Element): string {
  const target =
    el.querySelector("[data-content-editable-leaf]") ??
    el.querySelector("h1, h2, h3, h4, h5, h6") ??
    el.querySelector("div");
  if (!target) return "";
  return collectText(target.childNodes);
}

function collectText(nodes: NodeListOf<ChildNode>): string {
  let out = "";
  for (const n of nodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.textContent ?? "";
    } else if (n instanceof HTMLElement) {
      const tag = n.tagName;
      if (tag === "IMG") {
        out += n.getAttribute("alt") ?? "";
      } else {
        out += collectText(n.childNodes);
      }
    }
  }
  return out;
}

function normalizeLevels(headings: Heading[]): Heading[] {
  if (!headings.length) return headings;

  const levels = new Set(headings.map((h) => h.level));
  const hasH1 = levels.has("ntoc-h1");

  if (!hasH1) {
    const hasH2 = levels.has("ntoc-h2");
    const hasH3 = levels.has("ntoc-h3");

    if (hasH2 && hasH3) {
      for (const h of headings) {
        if (h.level === "ntoc-h2") h.level = "ntoc-h1";
        else if (h.level === "ntoc-h3") h.level = "ntoc-h2";
      }
    } else {
      for (const h of headings) h.level = "ntoc-h1";
    }
  }

  return headings;
}

// --- ToC panel ---

function buildToc(): void {
  tocEl?.remove();

  const scroller = document.querySelector(SEL.scroller);
  if (!scroller?.parentNode) return;

  const headings = getHeadings();

  tocEl = document.createElement("div");
  tocEl.className = "ntoc-outline show";
  tocEl.innerHTML = `
    <div class="ntoc-toc">
      <div class="ntoc-title" title="Go to top">Table of Contents</div>
      <div class="ntoc-blocks"></div>
    </div>`;

  tocEl.querySelector(".ntoc-title")!.addEventListener("click", () => {
    document
      .querySelector(SEL.scroller)
      ?.scroll({ top: 0, behavior: "smooth" });
  });

  const blocks = tocEl.querySelector(".ntoc-blocks")!;

  for (const h of headings) {
    const block = document.createElement("div");
    block.className = "ntoc-block";
    block.innerHTML = `<a rel="noopener noreferrer"><div class="ntoc-btn"><div class="${h.level} ntoc-text">${escapeHtml(h.text)}</div></div></a>`;

    block.addEventListener("click", (e) => {
      e.preventDefault();
      const a = block.querySelector("a")!;
      a.href = `${window.location.pathname}#${h.blockId}`;
      window.location.hash = "";
      window.location.href = a.href;
    });

    blocks.appendChild(block);
  }

  if (!headings.length) {
    tocEl.classList.remove("show");
  }

  scroller.parentNode.insertBefore(tocEl, scroller);
}

// --- Toggle button ---

function addToggleButton(): void {
  toggleBtn?.remove();

  const topbar = document.querySelector(SEL.topbar);
  if (!topbar) return;

  toggleBtn = document.createElement("div");
  toggleBtn.className = "ntoc-toggle-btn";
  toggleBtn.textContent = "ToC";
  toggleBtn.title = "Toggle table of contents";

  toggleBtn.addEventListener("click", () => {
    tocEl?.classList.toggle("show");
  });

  topbar.prepend(toggleBtn);
}

// --- Observers ---

function observeContentChanges(): void {
  contentObserver?.disconnect();

  const pageContent = document.querySelector(SEL.pageContent);
  if (!pageContent) return;

  let timer: ReturnType<typeof setTimeout>;

  contentObserver = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(buildToc, 300);
  });

  contentObserver.observe(pageContent, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function observePageChanges(): void {
  pageObserver?.disconnect();

  const frame = document.querySelector(SEL.frame);
  if (!frame) return;

  pageObserver = new MutationObserver(() => {
    waitForElement(SEL.pageContent)
      .then(() => {
        setTimeout(() => {
          buildToc();
          addToggleButton();
          contentObserver?.disconnect();
          observeContentChanges();
        }, 200);
      })
      .catch(() => {});
  });

  pageObserver.observe(frame, { childList: true });
}
