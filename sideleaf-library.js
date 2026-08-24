(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SideleafLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BOOKS_KEY = 'sideleaf.books.v1';
  const HIDDEN_BUILT_INS_KEY = 'sideleaf.hidden-built-ins.v1';
  const SAMPLE_BOOK = Object.freeze({
    id: 'sideleaf-sample-rain',
    title: '雨停以后',
    content: [
      '雨是在午后停的。窗沿还积着一线水，偶尔被风推下来，啪地打在旧铁皮上。愿把书摊在膝头，没有急着往后读。她在那句“有些路不是为了抵达”旁边停了很久，像是在等另一个人也走到这里。',
      '峥的书签还在前面两页，安静地亮着。那不是催促，也不是“我已经读完了”。它只是在页边留下一个很小的位置：你到这里时，可以叫我。',
      '街道被洗得发亮，树影在水洼里轻轻晃。她翻过一页，看见页角多了一枚新的标记。两条阅读线并没有立刻重合，却第一次知道了彼此准确停在哪里。',
      '她有时往回翻，重新看一句早已读过的话。页面不会因此误以为她又向前走了一遍；批注仍钉在原文的位置上，页码可以变化，那句话却不会被搬走。',
      '天色慢慢亮起来。右下角的数字又往前走了一格，但他们仍各自保留着自己的速度。并肩并不等于步幅相同，也不要求谁假装已经看过另一人的来路。',
      '到了章节末尾，峥把这一章留下的疑问、判断和当时的感受写成长一点的札记。下一次窗口变化以后，愿可以把它原样递回来，不需要系统先替他压成一句轻飘飘的摘要。',
      '书页继续往后。偶尔他们在同一段旁边说话，偶尔一个人先走到前面，另一个人慢慢追上。正文安静地留在书库里，真正需要相遇时，才连同附近的线头和批注一起被取出来。',
      '雨后的风穿过半开的窗，纸张边缘轻轻动了一下。她用手指按住页角，忽然觉得这本书不再只是一本被读完的东西，而是两个人各自走过、又不断相遇的地方。'
    ].join('\n\n'),
    format: 'sideleaf',
    builtIn: true,
    builtInVersion: 1,
    toc: [
      { title: '两条阅读线', level: 1, anchor: 0 },
      { title: '页边相遇', level: 2, anchor: 0 }
    ],
    progress: 0,
    createdAt: 0,
    updatedAt: 0
  });
  const BUILT_IN_BOOKS = Object.freeze([SAMPLE_BOOK]);
  const DEFAULT_BOOK_ID = SAMPLE_BOOK.id;

  function cloneBook(book) {
    return JSON.parse(JSON.stringify(book));
  }

  function parseBooks(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === '') return [];
    try {
      const books = JSON.parse(rawValue);
      if (!Array.isArray(books)) throw new Error('invalid-books-shape');
      return books;
    } catch (_) {
      throw new Error('Sideleaf 书库数据无法读取，请先保留当前页面并导出诊断信息。');
    }
  }

  function includeBuiltIns(books, hiddenIds = []) {
    const next = Array.isArray(books) ? books.slice() : [];
    const existingIds = new Set(next.map(book => book?.id).filter(Boolean));
    const hidden = new Set(Array.isArray(hiddenIds) ? hiddenIds : []);
    const missing = BUILT_IN_BOOKS
      .filter(book => !existingIds.has(book.id) && !hidden.has(book.id))
      .map(cloneBook);
    return [...missing, ...next];
  }

  function readHiddenBuiltIns(storage) {
    try {
      const ids = JSON.parse(storage.getItem(HIDDEN_BUILT_INS_KEY) || '[]');
      return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
    } catch (_) { return []; }
  }

  function hideBuiltIn(storage, id) {
    if (!BUILT_IN_BOOKS.some(book => book.id === id)) return readHiddenBuiltIns(storage);
    const hidden = readHiddenBuiltIns(storage);
    if (!hidden.includes(id)) hidden.push(id);
    storage.setItem(HIDDEN_BUILT_INS_KEY, JSON.stringify(hidden));
    return hidden;
  }

  function ensure(storage) {
    const currentRaw = storage.getItem(BOOKS_KEY);
    const current = parseBooks(currentRaw);
    const books = includeBuiltIns(current, readHiddenBuiltIns(storage));
    if (books.length !== current.length) {
      storage.setItem(BOOKS_KEY, JSON.stringify(books));
    }
    return books;
  }

  function ensureSnapshot(storageSnapshot) {
    const next = { ...(storageSnapshot || {}) };
    let hidden = [];
    try { hidden = JSON.parse(next[HIDDEN_BUILT_INS_KEY] || '[]'); } catch (_) {}
    next[BOOKS_KEY] = JSON.stringify(includeBuiltIns(parseBooks(next[BOOKS_KEY]), hidden));
    return next;
  }

  function insertImported(books, importedBook, hiddenIds = []) {
    const next = includeBuiltIns(books, hiddenIds);
    const lastBuiltInIndex = next.reduce((lastIndex, book, index) => book?.builtIn ? index : lastIndex, -1);
    next.splice(lastBuiltInIndex + 1, 0, importedBook);
    return next;
  }

  const SENTENCE_END = /[。！？!?…]+[”’」』】）》〉]*\s*/g;

  function paragraphStartAt(source, offset) {
    const boundary = source.lastIndexOf('\n\n', Math.max(0, offset - 1));
    if (boundary < 0) return 0;
    let start = boundary + 2;
    while (start < source.length && /[\r\n]/.test(source[start])) start += 1;
    return start;
  }

  function paragraphEndAt(source, offset) {
    const boundary = source.indexOf('\n\n', Math.max(0, offset));
    return boundary < 0 ? source.length : boundary;
  }

  function sentenceStartAt(source, offset, paragraphStart) {
    const fragment = source.slice(paragraphStart, offset);
    SENTENCE_END.lastIndex = 0;
    let match;
    let start = paragraphStart;
    while ((match = SENTENCE_END.exec(fragment))) {
      start = paragraphStart + match.index + match[0].length;
    }
    return start;
  }

  function sentenceEndAt(source, offset, paragraphEnd) {
    const fragment = source.slice(offset, paragraphEnd);
    SENTENCE_END.lastIndex = 0;
    const match = SENTENCE_END.exec(fragment);
    return match ? offset + match.index + match[0].length : paragraphEnd;
  }

  function expandReadingRange(source, visibleStart, visibleEnd, options = {}) {
    const text = String(source || '');
    const start = Math.max(0, Math.min(text.length, Number(visibleStart) || 0));
    const end = Math.max(start, Math.min(text.length, Number(visibleEnd) || 0));
    const maxParagraphChars = Math.max(200, Number(options.maxParagraphChars) || 1800);
    if (end <= start) return { start, end };

    const startParagraphStart = paragraphStartAt(text, start);
    const startParagraphEnd = paragraphEndAt(text, start);
    const endParagraphStart = paragraphStartAt(text, Math.max(start, end - 1));
    const endParagraphEnd = paragraphEndAt(text, end);

    const expandedStart = startParagraphEnd - startParagraphStart <= maxParagraphChars
      ? startParagraphStart
      : sentenceStartAt(text, start, startParagraphStart);
    const expandedEnd = endParagraphEnd - endParagraphStart <= maxParagraphChars
      ? endParagraphEnd
      : sentenceEndAt(text, end, endParagraphEnd);

    return {
      start: Math.max(0, Math.min(expandedStart, start)),
      end: Math.max(end, Math.min(text.length, expandedEnd))
    };
  }

  function readingMarkerOffset(page, anchor) {
    const offset = Number(anchor);
    const displayStart = Number(page?.displayStart);
    const displayEnd = Number(page?.displayEnd);
    const pageEnd = Number(page?.end);
    if (![offset, displayStart, displayEnd, pageEnd].every(Number.isFinite)) return null;
    if (offset > displayStart && offset <= displayEnd) return offset;
    if (offset > displayEnd && offset <= pageEnd && displayEnd > displayStart) return displayEnd;
    return null;
  }

  return {
    BOOKS_KEY,
    HIDDEN_BUILT_INS_KEY,
    BUILT_IN_BOOKS,
    DEFAULT_BOOK_ID,
    includeBuiltIns,
    readHiddenBuiltIns,
    hideBuiltIn,
    ensure,
    ensureSnapshot,
    insertImported,
    expandReadingRange,
    readingMarkerOffset
  };
});
