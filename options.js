const CONFIG_KEYS = ['appId', 'appSecret', 'baseUrl', 'modelName', 'apiKey'];

const form = document.getElementById('configForm');
const statusEl = document.getElementById('status');

function showStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.classList.remove('hidden', 'success', 'error');
  statusEl.classList.add(isError ? 'error' : 'success');
}

async function loadConfig() {
  const data = await chrome.storage.local.get(CONFIG_KEYS);
  for (const key of CONFIG_KEYS) {
    const input = form.elements[key];
    if (input && data[key]) {
      input.value = data[key];
    }
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.classList.add('hidden');

  const values = {};
  for (const key of CONFIG_KEYS) {
    const input = form.elements[key];
    values[key] = input.value.trim();
    if (!values[key]) {
      showStatus(`请填写 ${input.previousElementSibling.textContent}`, true);
      input.focus();
      return;
    }
  }

  if (!values.baseUrl.startsWith('http://') && !values.baseUrl.startsWith('https://')) {
    showStatus('Base URL 必须以 http:// 或 https:// 开头', true);
    form.elements.baseUrl.focus();
    return;
  }

  try {
    await chrome.storage.local.set(values);
    showStatus('配置已保存', false);
  } catch (err) {
    showStatus(`保存失败：${err.message}`, true);
  }
});

loadConfig();
