// 飞书文档 AI 助手 - Background Service Worker

const TOKEN_CACHE_KEY = 'feishu_token_cache';
const CONFIG_KEYS = ['appId', 'appSecret', 'baseUrl', 'modelName', 'apiKey'];

async function getConfig() {
  const data = await chrome.storage.local.get(CONFIG_KEYS);
  for (const key of CONFIG_KEYS) {
    if (!data[key]) {
      throw new Error('请先完成插件配置');
    }
  }
  return data;
}

async function getTenantAccessToken(config) {
  const cached = await chrome.storage.local.get(TOKEN_CACHE_KEY);
  const cache = cached[TOKEN_CACHE_KEY];
  const now = Date.now();
  if (cache && cache.expireAt && cache.expireAt > now + 60000) {
    return cache.token;
  }

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret
    })
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(data.msg || '获取 tenant_access_token 失败');
  }
  const token = data.tenant_access_token;
  const expireSeconds = data.expire || 7200;
  await chrome.storage.local.set({
    [TOKEN_CACHE_KEY]: {
      token,
      expireAt: now + expireSeconds * 1000
    }
  });
  return token;
}

async function resolveWikiNode(nodeToken) {
  const config = await getConfig();
  const token = await getTenantAccessToken(config);
  const url = `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(nodeToken)}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(data.msg || '解析知识库节点失败');
  }
  const node = data.data?.node;
  if (!node || !node.obj_token) {
    throw new Error('无法获取知识库节点对应的文档 token');
  }
  return { objToken: node.obj_token, objType: node.obj_type };
}

async function fetchDocContent(docToken, docType) {
  const config = await getConfig();
  const token = await getTenantAccessToken(config);

  let actualToken = docToken;
  let actualType = docType;

  // 知识库链接需要先解析为实际云文档 token
  if (docType === 'wiki') {
    const resolved = await resolveWikiNode(docToken);
    actualToken = resolved.objToken;
    actualType = resolved.objType;
  }

  if (actualType !== 'docx') {
    throw new Error(`暂不支持该文档类型：${actualType || '未知'}，当前仅支持新版文档（docx）`);
  }

  const url = `https://open.feishu.cn/open-apis/docs/v1/content?content_type=markdown&doc_token=${encodeURIComponent(actualToken)}&doc_type=docx&lang=zh`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(data.msg || '获取文档内容失败');
  }
  return data.data.content;
}

async function streamChat(messages, type, port) {
  const config = await getConfig();
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      stream: true
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM 请求失败 (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              console.log(`[LLM:${type}] chunk ${delta.length} chars`);
              port.postMessage({ chunk: delta, type });
            }
          } catch (e) {
            // 忽略解析失败的行
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  port.postMessage({ done: true, type });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDocContent') {
    fetchDocContent(request.docToken, request.docType)
      .then(content => sendResponse({ success: true, content }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'llm-stream') {
    port.onMessage.addListener(async (msg) => {
      try {
        await streamChat(msg.messages, msg.type, port);
      } catch (err) {
        port.postMessage({ error: err.message, type: msg.type });
      }
    });
  }
});

// 点击扩展图标：向当前标签页发送 toggle 指令
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  const isFeishu = tab.url && /https?:\/\/[^/]*feishu\.cn\//.test(tab.url);
  if (!isFeishu) return;

  async function sendToggle() {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
  }

  try {
    await sendToggle();
  } catch (e) {
    // 内容脚本可能尚未注入，尝试主动注入后再发送指令
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      // 注入完成后等待脚本初始化
      setTimeout(sendToggle, 300);
    } catch (injectErr) {
      // 非 http/https 页面无法注入，忽略
    }
  }
});
