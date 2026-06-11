(function () {
  "use strict";

  const scriptEl = document.currentScript;
  if (!scriptEl) return;
  const SLUG = scriptEl.dataset.slug;
  const VERSION = parseInt(scriptEl.dataset.version || "1", 10);
  if (!SLUG) return;

  const POLL_MS = 10000;
  const CONTEXT_CHARS = 30;
  const AUTHOR_KEY = "shareable.author";

  const state = {
    comments: [],
    composer: null,        // { range, serialized, replyTo?: commentId }
    sidebarOpen: true,
    activeId: null,
    highlights: new Map(), // commentId -> [spans]
  };

  let pollTimer = null;
  let selectionBtn = null;

  // ------- author identity ---------
  function getAuthor() {
    return localStorage.getItem(AUTHOR_KEY) || "";
  }
  function setAuthor(name) {
    localStorage.setItem(AUTHOR_KEY, name);
  }
  function promptAuthor() {
    const current = getAuthor();
    const name = window.prompt("Your name (shown next to your comments):", current || "");
    if (!name) return null;
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) return null;
    setAuthor(trimmed);
    return trimmed;
  }

  // ------- range serialization (body-relative) ---------

  // Convert any (node, offset) pair to the nearest (text-node, offset) pair.
  // Handles element-node endpoints (e.g., whole-cell selection where the
  // start/end is a <td> with a childNodes index, not a text node).
  function toTextPos(node, offset) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return { node, offset };

    // Element node: offset is index into childNodes.
    // Position to: start of first text descendant from/after the child at `offset`,
    // or end of last text descendant if offset is past the end.
    if (offset >= node.childNodes.length) {
      const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
      let last = null, n;
      while ((n = w.nextNode())) last = n;
      if (last) return { node: last, offset: last.nodeValue.length };
      return null;
    }

    let scan = node.childNodes[offset];
    while (scan) {
      if (scan.nodeType === Node.TEXT_NODE) return { node: scan, offset: 0 };
      if (scan.nodeType === Node.ELEMENT_NODE) {
        const w = document.createTreeWalker(scan, NodeFilter.SHOW_TEXT, null);
        const first = w.nextNode();
        if (first) return { node: first, offset: 0 };
      }
      scan = scan.nextSibling;
    }
    return null;
  }

  function bodyTextOffset(targetNode, targetOffset) {
    const pos = toTextPos(targetNode, targetOffset);
    if (!pos) return -1;
    let offset = 0;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = w.nextNode())) {
      if (n === pos.node) return offset + pos.offset;
      offset += n.nodeValue.length;
    }
    return -1;
  }

  function bodyText() {
    let s = "";
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = w.nextNode())) s += n.nodeValue;
    return s;
  }

  function serializeRange(range) {
    const selectedText = range.toString();
    if (!selectedText.trim()) {
      console.warn("[shareable] empty selection");
      return null;
    }

    const startOffset = bodyTextOffset(range.startContainer, range.startOffset);
    const endOffset = bodyTextOffset(range.endContainer, range.endOffset);
    if (startOffset < 0 || endOffset < 0) {
      console.warn("[shareable] could not compute offsets", {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
        startOff: startOffset,
        endOff: endOffset,
      });
      return null;
    }

    const full = bodyText();
    const contextBefore = full.slice(Math.max(0, startOffset - CONTEXT_CHARS), startOffset);
    const contextAfter = full.slice(endOffset, endOffset + CONTEXT_CHARS);

    return {
      // xpath kept for schema compatibility; resolution is offset-based.
      xpath: { start: "/", end: "/" },
      offsets: { start: startOffset, end: endOffset },
      selectedText: selectedText.slice(0, 500),
      contextBefore,
      contextAfter,
    };
  }

  function rangeFromBodyOffsets(start, end) {
    let remaining = start;
    let startNode = null, startNodeOff = 0;
    let endNode = null, endNodeOff = 0;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let n;
    let cursor = 0;
    while ((n = w.nextNode())) {
      const len = n.nodeValue.length;
      if (!startNode && cursor + len >= start) {
        startNode = n;
        startNodeOff = start - cursor;
      }
      if (cursor + len >= end) {
        endNode = n;
        endNodeOff = end - cursor;
        break;
      }
      cursor += len;
    }
    if (!startNode || !endNode) return null;
    try {
      const r = document.createRange();
      r.setStart(startNode, startNodeOff);
      r.setEnd(endNode, endNodeOff);
      return r;
    } catch {
      return null;
    }
  }

  function rangeFromSerialized(s) {
    // Tier 1: exact body offsets
    const r1 = rangeFromBodyOffsets(s.offsets.start, s.offsets.end);
    if (r1 && r1.toString().trim() === s.selectedText.trim()) return r1;

    // Tier 2: context + selected text match
    const full = bodyText();
    if (s.contextBefore || s.contextAfter) {
      const needle = s.contextBefore + s.selectedText + s.contextAfter;
      const idx = full.indexOf(needle);
      if (idx >= 0) {
        const start = idx + s.contextBefore.length;
        const r = rangeFromBodyOffsets(start, start + s.selectedText.length);
        if (r) return r;
      }
    }

    // Tier 3: selected text alone
    const idx2 = full.indexOf(s.selectedText);
    if (idx2 >= 0) {
      const r = rangeFromBodyOffsets(idx2, idx2 + s.selectedText.length);
      if (r) return r;
    }

    return null;
  }

  // ------- highlight rendering ---------
  function clearHighlights() {
    document.querySelectorAll("span.__shareable_hl").forEach((el) => {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    });
    state.highlights.clear();
  }

  function highlightRange(range, commentId, resolved) {
    const spans = [];
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    for (const node of textNodes) {
      const startInNode = node === range.startContainer ? range.startOffset : 0;
      const endInNode = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      if (endInNode <= startInNode) continue;
      const middle = node.splitText(startInNode);
      if (endInNode - startInNode < middle.nodeValue.length) middle.splitText(endInNode - startInNode);
      const span = document.createElement("span");
      span.className = "__shareable_hl" + (resolved ? " __shareable_hl_resolved" : "");
      span.dataset.commentId = commentId;
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        setActive(commentId, true);
      });
      middle.parentNode.replaceChild(span, middle);
      span.appendChild(middle);
      spans.push(span);
    }
    state.highlights.set(commentId, spans);
  }

  function renderHighlights() {
    clearHighlights();
    for (const c of state.comments) {
      if (c.orphaned) continue;
      const r = rangeFromSerialized(c.range);
      if (r) {
        highlightRange(r, c.id, c.resolved);
      } else {
        c.orphaned = true;
      }
    }
  }

  // ------- sidebar UI ---------
  let root, listEl, composerHostEl;

  function buildUI() {
    root = document.createElement("div");
    root.className = "__shareable_root";
    root.setAttribute("data-shareable-overlay", "");
    root.innerHTML = `
      <button class="__shareable_toggle" title="Toggle comments" aria-label="Toggle comments">
        <span class="__shareable_toggle_count">0</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3.5C2 2.67 2.67 2 3.5 2h9c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H8l-3 3v-3H3.5C2.67 11 2 10.33 2 9.5v-6z"/></svg>
      </button>
      <aside class="__shareable_sidebar">
        <header class="__shareable_header">
          <div class="__shareable_title">Comments</div>
          <div class="__shareable_meta">v${VERSION} · ${SLUG.slice(0, 6)}…</div>
        </header>
        <div class="__shareable_composer_host"></div>
        <div class="__shareable_list"></div>
        <footer class="__shareable_footer">
          <span class="__shareable_author"></span>
          <button class="__shareable_rename">change name</button>
        </footer>
      </aside>
    `;
    document.body.appendChild(root);

    listEl = root.querySelector(".__shareable_list");
    composerHostEl = root.querySelector(".__shareable_composer_host");

    root.querySelector(".__shareable_toggle").addEventListener("click", () => {
      state.sidebarOpen = !state.sidebarOpen;
      root.classList.toggle("__shareable_open", state.sidebarOpen);
    });
    root.querySelector(".__shareable_rename").addEventListener("click", () => {
      const name = promptAuthor();
      if (name) renderAuthor();
    });

    root.classList.toggle("__shareable_open", state.sidebarOpen);
    renderAuthor();
  }

  function renderAuthor() {
    const el = root.querySelector(".__shareable_author");
    const name = getAuthor();
    el.textContent = name ? "signed: " + name : "not signed in";
  }

  function renderList() {
    listEl.innerHTML = "";
    const sorted = [...state.comments].sort((a, b) => a.createdAt - b.createdAt);
    for (const c of sorted) {
      listEl.appendChild(renderThread(c));
    }
    const count = state.comments.filter((c) => !c.resolved).length;
    root.querySelector(".__shareable_toggle_count").textContent = String(count);
  }

  function renderThread(c) {
    const el = document.createElement("article");
    el.className = "__shareable_thread";
    if (c.resolved) el.classList.add("__shareable_resolved");
    if (c.orphaned) el.classList.add("__shareable_orphaned");
    if (c.id === state.activeId) el.classList.add("__shareable_active");
    el.dataset.commentId = c.id;

    const snippet = document.createElement("div");
    snippet.className = "__shareable_snippet";
    snippet.textContent = c.range.selectedText;
    if (c.orphaned) snippet.title = "anchor lost — text was edited";
    el.appendChild(snippet);

    if (c.version < VERSION) {
      const v = document.createElement("div");
      v.className = "__shareable_versiontag";
      v.textContent = `made on v${c.version} · viewing v${VERSION}`;
      el.appendChild(v);
    }

    for (const t of c.thread) {
      const post = document.createElement("div");
      post.className = "__shareable_post";
      post.innerHTML = `
        <div class="__shareable_postmeta"><b></b><time></time></div>
        <div class="__shareable_postbody"></div>
      `;
      post.querySelector("b").textContent = t.author;
      const time = post.querySelector("time");
      time.dateTime = new Date(t.createdAt).toISOString();
      time.textContent = fmtTime(t.createdAt);
      post.querySelector(".__shareable_postbody").textContent = t.body;
      el.appendChild(post);
    }

    const actions = document.createElement("div");
    actions.className = "__shareable_actions";
    const replyBtn = document.createElement("button");
    replyBtn.textContent = "reply";
    replyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openReply(c.id);
    });
    const resolveBtn = document.createElement("button");
    resolveBtn.textContent = c.resolved ? "reopen" : "resolve";
    resolveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleResolve(c);
    });
    actions.appendChild(replyBtn);
    actions.appendChild(resolveBtn);
    el.appendChild(actions);

    el.addEventListener("click", () => setActive(c.id, false));
    return el;
  }

  function fmtTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h";
    return new Date(ts).toLocaleDateString();
  }

  function setActive(id, scrollIntoView) {
    state.activeId = id;
    if (!state.sidebarOpen) {
      state.sidebarOpen = true;
      root.classList.add("__shareable_open");
    }
    renderList();
    if (scrollIntoView) {
      const el = listEl.querySelector(`[data-comment-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      const spans = state.highlights.get(id);
      if (spans && spans[0]) {
        spans[0].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  // ------- composer ---------
  function openNewComposer(range, serialized) {
    state.composer = { range, serialized };
    renderComposer();
  }

  function openReply(commentId) {
    state.composer = { replyTo: commentId };
    renderComposer();
  }

  function closeComposer() {
    state.composer = null;
    renderComposer();
  }

  function renderComposer() {
    composerHostEl.innerHTML = "";
    if (!state.composer) return;

    const wrap = document.createElement("div");
    wrap.className = "__shareable_composer";

    if (state.composer.serialized) {
      const snip = document.createElement("div");
      snip.className = "__shareable_composer_snippet";
      snip.textContent = state.composer.serialized.selectedText;
      wrap.appendChild(snip);
    } else if (state.composer.replyTo) {
      const target = state.comments.find((c) => c.id === state.composer.replyTo);
      if (target) {
        const snip = document.createElement("div");
        snip.className = "__shareable_composer_snippet";
        snip.textContent = "↳ replying to: " + target.range.selectedText.slice(0, 80);
        wrap.appendChild(snip);
      }
    }

    const ta = document.createElement("textarea");
    ta.placeholder = "Write a comment…";
    ta.rows = 3;
    wrap.appendChild(ta);

    const actions = document.createElement("div");
    actions.className = "__shareable_composer_actions";
    const submit = document.createElement("button");
    submit.textContent = "post";
    submit.className = "__shareable_primary";
    const cancel = document.createElement("button");
    cancel.textContent = "cancel";
    submit.addEventListener("click", async () => {
      const body = ta.value.trim();
      if (!body) return;
      let author = getAuthor();
      if (!author) author = promptAuthor();
      if (!author) return;
      submit.disabled = true;
      try {
        await postComment(body, author);
        closeComposer();
      } catch (e) {
        alert("Failed to post: " + e.message);
        submit.disabled = false;
      }
    });
    cancel.addEventListener("click", closeComposer);
    actions.appendChild(cancel);
    actions.appendChild(submit);
    wrap.appendChild(actions);

    composerHostEl.appendChild(wrap);
    setTimeout(() => ta.focus(), 0);

    if (!state.sidebarOpen) {
      state.sidebarOpen = true;
      root.classList.add("__shareable_open");
    }
  }

  async function postComment(body, author) {
    let payload;
    if (state.composer.replyTo) {
      payload = { kind: "reply", commentId: state.composer.replyTo, entry: { author, body } };
    } else {
      payload = { kind: "new", range: state.composer.serialized, entry: { author, body } };
    }
    const res = await fetch(`/api/comments/${SLUG}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }
    await refreshComments();
  }

  async function toggleResolve(c) {
    const res = await fetch(`/api/comments/${SLUG}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "resolve", commentId: c.id, resolved: !c.resolved }),
    });
    if (res.ok) refreshComments();
  }

  // ------- selection handling ---------
  function onSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      hideSelectionBtn();
      return;
    }
    const range = sel.getRangeAt(0);
    if (root && root.contains(range.commonAncestorContainer)) {
      hideSelectionBtn();
      return;
    }
    if (!range.toString().trim()) {
      hideSelectionBtn();
      return;
    }
    const rect = range.getBoundingClientRect();
    showSelectionBtn(rect, range);
  }

  function showSelectionBtn(rect, range) {
    if (!selectionBtn) {
      selectionBtn = document.createElement("button");
      selectionBtn.className = "__shareable_selbtn";
      selectionBtn.innerHTML = "💬 Comment";
      selectionBtn.addEventListener("mousedown", (e) => e.preventDefault());
      selectionBtn.addEventListener("click", () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const r = sel.getRangeAt(0).cloneRange();
        const ser = serializeRange(r);
        if (!ser) {
          alert("Couldn't anchor this selection. Try selecting plain text within a single block.");
          return;
        }
        hideSelectionBtn();
        openNewComposer(r, ser);
        sel.removeAllRanges();
      });
      document.body.appendChild(selectionBtn);
    }
    const top = rect.top + window.scrollY - 36;
    const left = rect.left + window.scrollX + rect.width / 2 - 50;
    selectionBtn.style.top = top + "px";
    selectionBtn.style.left = left + "px";
    selectionBtn.style.display = "block";
  }

  function hideSelectionBtn() {
    if (selectionBtn) selectionBtn.style.display = "none";
  }

  // ------- polling ---------
  async function refreshComments() {
    try {
      const res = await fetch(`/api/comments/${SLUG}`, { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      state.comments = (data.comments || []).map((c) => ({ ...c, orphaned: false }));
      renderHighlights();
      renderList();
    } catch {}
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refreshComments, POLL_MS);
  }

  // ------- bootstrap ---------
  function init() {
    buildUI();
    refreshComments();
    startPolling();
    document.addEventListener("selectionchange", () => {
      setTimeout(onSelection, 10);
    });
    document.addEventListener("mousedown", (e) => {
      if (selectionBtn && !selectionBtn.contains(e.target)) hideSelectionBtn();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.composer) closeComposer();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
