// 飞书文档 AI 助手 - Content Script
(function () {
  'use strict';

  // 防止重复注入
  if (window.__feishuDocAssistantLoaded) return;
  window.__feishuDocAssistantLoaded = true;

  const SIDEBAR_ID = 'feishu-doc-assistant-sidebar';
  const TOGGLE_ID = 'feishu-doc-assistant-toggle';
  const TOAST_ID = 'feishu-doc-assistant-toast';

  function isDocPage(url) {
    return /feishu\.cn\/(docx|wiki)\/([A-Za-z0-9_-]{22,27})/.test(url);
  }

  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.innerHTML = `
        <div class="fda-toast-inner">
          <span class="fda-toast-icon">!</span>
          <span class="fda-toast-text"></span>
        </div>
      `;
      document.body.appendChild(toast);
    }
    toast.querySelector('.fda-toast-text').textContent = message;
    toast.classList.add('fda-toast-visible');
    setTimeout(() => toast.classList.remove('fda-toast-visible'), 3000);
  }

  // 监听 background 发来的命令
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleSidebar') {
      const toggle = document.getElementById(TOGGLE_ID);
      if (toggle && toggle.style.display !== 'none') {
        toggle.click();
      } else {
        showToast('插件在当前页面不可用，请打开飞书文档使用');
      }
    }
  });

  function createSidebar() {
    if (document.getElementById(SIDEBAR_ID)) return;

    const iframe = document.createElement('iframe');
    iframe.id = SIDEBAR_ID;
    iframe.src = chrome.runtime.getURL('sidebar.html');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const toggle = document.createElement('button');
    toggle.id = TOGGLE_ID;
    toggle.title = '飞书文档 AI 助手';
    toggle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    toggle.style.display = 'none';
    document.body.appendChild(toggle);

    let visible = false;
    toggle.addEventListener('click', () => {
      visible = !visible;
      iframe.style.display = visible ? 'block' : 'none';
      toggle.classList.toggle('fda-toggle-active', visible);
    });

    iframe.addEventListener('load', () => {
      postUrlToSidebar(iframe);
    });

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'close-sidebar') {
        const sidebar = document.getElementById(SIDEBAR_ID);
        const toggle = document.getElementById(TOGGLE_ID);
        if (sidebar) sidebar.style.display = 'none';
        if (toggle) toggle.classList.remove('fda-toggle-active');
      }
    });
  }

  function postUrlToSidebar(iframe) {
    try {
      iframe.contentWindow.postMessage(
        { type: 'page-url', url: location.href },
        '*'
      );
    } catch (e) {
      // iframe 跨域加载中，忽略
    }
  }

  function updateSidebarUrl() {
    const iframe = document.getElementById(SIDEBAR_ID);
    if (iframe) postUrlToSidebar(iframe);
  }

  function init() {
    createSidebar();

    const toggle = document.getElementById(TOGGLE_ID);

    // SPA 路由变化监听，始终注册
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    let lastUrl = location.href;

    function handleUrlChange() {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      if (!isDocPage(location.href)) {
        if (toggle) toggle.style.display = 'none';
        const sidebar = document.getElementById(SIDEBAR_ID);
        if (sidebar) sidebar.style.display = 'none';
        showToast('插件在当前页面不可用，请打开飞书文档使用');
      } else {
        if (toggle) toggle.style.display = 'flex';
        updateSidebarUrl();
      }
    }

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      setTimeout(handleUrlChange, 0);
    };
    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      setTimeout(handleUrlChange, 0);
    };
    window.addEventListener('popstate', handleUrlChange);

    // 初始化当前页面状态
    if (!isDocPage(location.href)) {
      if (toggle) toggle.style.display = 'none';
      const sidebar = document.getElementById(SIDEBAR_ID);
      if (sidebar) sidebar.style.display = 'none';
      showToast('插件在当前页面不可用，请打开飞书文档使用');
    } else {
      if (toggle) toggle.style.display = 'flex';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
