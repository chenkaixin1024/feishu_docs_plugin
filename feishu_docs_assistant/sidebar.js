import { chat_prompt, summary_prompt, fine_prompt, mindmap_prompt } from './prompt.js';

const CONFIG_KEYS = ['appId', 'appSecret', 'baseUrl', 'modelName', 'apiKey'];

let docToken = null;
let docType = null;
let docUrl = '';
let docContent = '';
let config = null;
let chatHistory = [];
let isStreaming = false;
let currentStream = null;

const els = {
  configAlert: document.getElementById('configAlert'),
  openOptions: document.getElementById('openOptions'),
  docLoading: document.getElementById('docLoading'),
  main: document.getElementById('main'),
  error: document.getElementById('error'),
  settingsBtn: document.getElementById('settingsBtn'),
  closeBtn: document.getElementById('closeBtn'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  panels: document.querySelectorAll('.panel'),
  subtabBtns: document.querySelectorAll('.subtab-btn'),
  subpanels: document.querySelectorAll('.subpanel'),
  chatMessages: document.getElementById('chatMessages'),
  chatInput: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn'),
  overviewPanel: document.getElementById('sub-overview'),
  finePanel: document.getElementById('sub-fine'),
  mindmapPanel: document.getElementById('sub-mindmap'),
  mindmapTree: document.getElementById('mindmapTree')
};

function showError(msg) {
  els.error.textContent = msg;
  els.error.classList.remove('hidden');
}

function hideError() {
  els.error.classList.add('hidden');
}

function extractDocToken(url) {
  const match = url.match(/feishu\.cn\/(docx|wiki)\/([A-Za-z0-9_-]{22,27})(?:\?|\/|$)/);
  if (match) {
    return { docType: match[1], docToken: match[2] };
  }
  return null;
}

async function loadConfig() {
  const data = await chrome.storage.local.get(CONFIG_KEYS);
  config = data;
  const missing = CONFIG_KEYS.some(k => !data[k]);
  if (missing) {
    els.configAlert.classList.remove('hidden');
    els.docLoading.classList.add('hidden');
    return false;
  }
  els.configAlert.classList.add('hidden');
  return true;
}

async function fetchDocumentContent() {
  if (!docToken || !docType) {
    showError('无法从当前链接识别 doc_token');
    els.docLoading.classList.add('hidden');
    return;
  }
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'getDocContent',
      docToken,
      docType
    });
    if (!res.success) {
      throw new Error(res.error);
    }
    docContent = res.content || '';
    els.docLoading.classList.add('hidden');
    els.main.classList.remove('hidden');
    // 默认触发概要
    activateSummaryTab('overview');
  } catch (err) {
    showError(err.message || '文档读取失败');
    els.docLoading.classList.add('hidden');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function inlineFormat(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}

function simpleMarkdownToHtml(text) {
  if (!text) return '<div class="markdown-body"></div>';
  const lines = text.split('\n');
  const root = document.createElement('div');
  root.className = 'markdown-body';
  let currentP = null;
  let inUl = null;
  let inOl = null;
  let inCode = false;
  let codeLines = [];

  function flushCode() {
    if (inCode && codeLines.length > 0) {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = codeLines.join('\n');
      pre.appendChild(code);
      root.appendChild(pre);
      codeLines = [];
    }
    inCode = false;
  }

  function flushP() {
    if (currentP) {
      if (currentP.innerHTML.trim()) root.appendChild(currentP);
      currentP = null;
    }
  }

  function closeList() {
    if (inUl) {
      root.appendChild(inUl);
      inUl = null;
    }
    if (inOl) {
      root.appendChild(inOl);
      inOl = null;
    }
  }

  for (const raw of lines) {
    const line = raw;
    if (inCode) {
      if (line.trim().startsWith('```')) {
        flushCode();
      } else {
        codeLines.push(line);
      }
      continue;
    }
    if (line.trim().startsWith('```')) {
      flushP();
      closeList();
      inCode = true;
      continue;
    }

    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      flushP();
      closeList();
      const level = hMatch[1].length;
      const h = document.createElement(`h${level}`);
      h.textContent = hMatch[2].trim();
      root.appendChild(h);
      continue;
    }

    const bqMatch = line.match(/^>\s*(.*)$/);
    if (bqMatch) {
      flushP();
      closeList();
      const bq = document.createElement('blockquote');
      const p = document.createElement('p');
      p.innerHTML = inlineFormat(bqMatch[1]);
      bq.appendChild(p);
      root.appendChild(bq);
      continue;
    }

    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushP();
      if (inOl) closeList();
      if (!inUl) inUl = document.createElement('ul');
      const li = document.createElement('li');
      li.innerHTML = inlineFormat(ulMatch[1]);
      inUl.appendChild(li);
      continue;
    } else if (inUl) {
      closeList();
    }

    const olMatch = line.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      flushP();
      if (inUl) closeList();
      if (!inOl) inOl = document.createElement('ol');
      const li = document.createElement('li');
      li.innerHTML = inlineFormat(olMatch[1]);
      inOl.appendChild(li);
      continue;
    } else if (inOl) {
      closeList();
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushP();
      closeList();
      root.appendChild(document.createElement('hr'));
      continue;
    }

    if (line.trim() === '') {
      flushP();
      continue;
    }

    if (!currentP) currentP = document.createElement('p');
    const span = document.createElement('span');
    span.innerHTML = inlineFormat(line) + ' ';
    currentP.appendChild(span);
  }

  flushP();
  closeList();
  flushCode();

  return root.outerHTML;
}

function stripCodeBlocks(text) {
  // 移除 ``` 代码块围栏，保留内部内容
  return text.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, '$1');
}

function parseHeadingsToTree(text) {
  const cleaned = stripCodeBlocks(text).trim();
  const lines = cleaned.split('\n');
  const root = { id: 'root', text: '思维导图', level: 0, children: [] };
  const stack = [root];

  // 第一轮：严格解析 markdown 标题
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 支持可选前导空格、项目符号、编号后接标题
    const match = line.match(/^(?:\s*(?:[-*+]|\d+[.)])\s+)?(#{1,6})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const nodeText = match[2].trim();
    if (level > 4) continue;

    const node = { id: `node-${i}`, text: nodeText, level, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (stack.length === 0) stack.push(root);
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  // 第二轮：若完全没有标题，尝试把列表解析为树
  if (root.children.length === 0) {
    parseListToTree(cleaned, root);
  }

  return root;
}

function parseListToTree(text, root) {
  const lines = text.split('\n');
  const stack = [root];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const indent = raw.match(/^(\s*)/)[1].length;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // 无序列表
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    // 有序列表
    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    const content = ulMatch ? ulMatch[1] : (olMatch ? olMatch[1] : '');
    if (!content) continue;

    // 根据缩进推断层级：每 2 个空格一级
    let level = Math.floor(indent / 2) + 1;
    if (level > 4) level = 4;

    const node = { id: `list-${i}`, text: content, level, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (stack.length === 0) stack.push(root);
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
}

function renderTree(node) {
  if (node.children.length === 0) return '';
  const liClass = node.level === 0 ? 'root' : `level-${node.level}`;
  const childrenHtml = node.children.map(child => renderTree(child)).join('');
  return `
    <li class="${liClass}">
      <span class="node-label">${escapeHtml(node.text)}</span>
      ${childrenHtml ? `<ul>${childrenHtml}</ul>` : ''}
    </li>
  `;
}

function renderMindmap(text) {
  console.log('[Mindmap] renderMindmap called, text length:', text?.length || 0);
  const tree = parseHeadingsToTree(text);
  console.log('[Mindmap] parsed nodes:', tree.children.length);

  if (tree.children.length === 0) {
    // 只要模型有返回内容就展示原始文本，方便排查格式问题
    if (!text || text.trim().length === 0) {
      els.mindmapTree.innerHTML = '<div class="loading-dots markdown-body">正在生成</div>';
    } else {
      els.mindmapTree.innerHTML = `<div class="empty-tip">未能解析出思维导图结构，模型返回如下：</div><pre class="raw-mindmap">${escapeHtml(text)}</pre>`;
    }
    return;
  }
  els.mindmapTree.innerHTML = `<ul>${renderTree(tree)}</ul>`;
}

function finalizeMindmap(text) {
  const tree = parseHeadingsToTree(text);
  if (tree.children.length === 0 && text && text.trim().length > 0) {
    showError('思维导图解析失败：模型未按预期格式返回标题结构，请检查提示词或更换模型。');
  }
}

function setStreamingUI(streaming) {
  isStreaming = streaming;
  els.sendBtn.disabled = streaming;
}

async function streamLLM(messages, type, onChunk, onDone, onError) {
  const port = chrome.runtime.connect({ name: 'llm-stream' });
  currentStream = port;

  // 30 秒超时保护，避免连接异常时一直等待
  const timeout = setTimeout(() => {
    try {
      port.disconnect();
    } catch (e) {}
    onError && onError('请求超时：模型接口在 30 秒内未返回有效内容');
  }, 30000);

  function cleanup() {
    clearTimeout(timeout);
    currentStream = null;
  }

  port.onMessage.addListener((msg) => {
    if (msg.chunk) {
      onChunk(msg.chunk);
    } else if (msg.done) {
      cleanup();
      onDone && onDone();
      port.disconnect();
    } else if (msg.error) {
      cleanup();
      onError && onError(msg.error);
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    cleanup();
  });

  port.postMessage({ messages, type });
}

function createAssistantMessage(container) {
  const el = document.createElement('div');
  el.className = 'message assistant';
  container.appendChild(el);
  return el;
}

// 对话功能
async function sendChat() {
  if (isStreaming) return;
  const text = els.chatInput.value.trim();
  if (!text) return;

  if (!config) {
    await loadConfig();
  }
  if (!config || !docContent) return;

  hideError();

  // 用户消息
  const userMsg = document.createElement('div');
  userMsg.className = 'message user';
  userMsg.textContent = text;
  els.chatMessages.appendChild(userMsg);

  els.chatInput.value = '';
  els.chatInput.style.height = 'auto';
  scrollToBottom();

  const assistantMsg = createAssistantMessage(els.chatMessages);
  let fullText = '';

  const systemContent = `${chat_prompt}\n\n${docContent}`;
  const messages = [
    { role: 'system', content: systemContent },
    ...chatHistory,
    { role: 'user', content: text }
  ];

  setStreamingUI(true);

  await streamLLM(messages, 'chat', (chunk) => {
    fullText += chunk;
    assistantMsg.innerHTML = simpleMarkdownToHtml(fullText);
    scrollToBottom();
  }, () => {
    setStreamingUI(false);
    chatHistory.push({ role: 'user', content: text });
    chatHistory.push({ role: 'assistant', content: fullText });
  }, (err) => {
    setStreamingUI(false);
    showError(err);
  });
}

function scrollToBottom() {
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

// 总结功能
const summaryState = {
  overview: { text: '', el: els.overviewPanel, prompt: summary_prompt, started: false },
  fine: { text: '', el: els.finePanel, prompt: fine_prompt, started: false },
  mindmap: { text: '', el: els.mindmapPanel, prompt: mindmap_prompt, started: false }
};

async function runSummary(key) {
  const state = summaryState[key];
  // 已生成过有效内容则不再重复请求；内容为空时允许重试
  if ((state.started && state.text.trim().length > 0) || isStreaming) return;
  if (!docContent) return;

  hideError();
  state.started = true;
  if (key === 'mindmap') {
    els.mindmapTree.innerHTML = '<div class="loading-dots markdown-body">正在生成</div>';
  } else {
    state.el.innerHTML = '<div class="loading-dots markdown-body">正在生成</div>';
  }
  state.text = '';

  const systemContent = `${state.prompt}\n\n${docContent}`;
  const messages = [{ role: 'system', content: systemContent }];

  setStreamingUI(true);
  console.log(`[runSummary:${key}] start streaming`);

  await streamLLM(messages, key, (chunk) => {
    state.text += chunk;
    if (key === 'mindmap') {
      console.log(`[runSummary:mindmap] chunk length ${chunk.length}, total ${state.text.length}`);
      renderMindmap(state.text);
    } else {
      state.el.innerHTML = simpleMarkdownToHtml(state.text);
    }
  }, () => {
    setStreamingUI(false);
    console.log(`[runSummary:${key}] done, total length ${state.text.length}`);
    if (key === 'mindmap') {
      renderMindmap(state.text);
      finalizeMindmap(state.text);
    }
    // 若流式结束但无返回内容，允许再次触发
    if (state.text.trim().length === 0) {
      state.started = false;
      if (key === 'mindmap') {
        els.mindmapTree.innerHTML = '<div class="empty-tip">未获取到模型回复，请切换标签后重试。</div>';
      }
    }
  }, (err) => {
    setStreamingUI(false);
    state.started = false;
    showError(err);
    console.error(`[runSummary:${key}] error`, err);
  });
}

function activateSummaryTab(subtab) {
  els.subtabBtns.forEach(btn => {
    if (btn.dataset.subtab === subtab) {
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
    }
  });
  els.subpanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `sub-${subtab}`);
  });
  const st = summaryState[subtab];
  if (!st.started || st.text.trim().length === 0) {
    runSummary(subtab);
  }
}

// 事件绑定
function bindEvents() {
  els.closeBtn.addEventListener('click', () => {
    window.parent.postMessage({ type: 'close-sidebar' }, '*');
  });

  els.settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  els.openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  els.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      els.tabBtns.forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      els.panels.forEach(p => {
        p.classList.toggle('active', p.id === `panel-${tab}`);
      });
      if (tab === 'summary') {
        const activeSub = document.querySelector('.subtab-btn.active')?.dataset.subtab || 'overview';
        activateSummaryTab(activeSub);
      }
    });
  });

  els.subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activateSummaryTab(btn.dataset.subtab);
    });
  });

  els.sendBtn.addEventListener('click', sendChat);
  els.chatInput.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
  els.chatInput.addEventListener('input', () => {
    els.chatInput.style.height = 'auto';
    els.chatInput.style.height = Math.min(els.chatInput.scrollHeight, 120) + 'px';
  });
}

// 接收页面 URL
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'page-url') {
    const url = e.data.url || '';
    if (url === docUrl) return;
    docUrl = url;
    const info = extractDocToken(url);
    if (!info) {
      docToken = null;
      docType = null;
      return;
    }
    docToken = info.docToken;
    docType = info.docType;
    startLoad();
  } else if (e.data && e.data.type === 'close-sidebar') {
    // 父页面处理
  }
});

function resetSession() {
  chatHistory = [];
  els.chatMessages.innerHTML = '';
  els.overviewPanel.innerHTML = '';
  els.finePanel.innerHTML = '';
  if (els.mindmapTree) els.mindmapTree.innerHTML = '';
  for (const key of Object.keys(summaryState)) {
    summaryState[key].started = false;
    summaryState[key].text = '';
  }
}

async function startLoad() {
  resetSession();
  els.docLoading.classList.remove('hidden');
  els.main.classList.add('hidden');
  hideError();
  const ok = await loadConfig();
  if (ok) {
    await fetchDocumentContent();
  }
}

// 初始化
bindEvents();

// 加载当前配置并等待 URL 消息
loadConfig();
