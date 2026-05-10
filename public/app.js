/* ===== 世界树 - 社交关系解码器 ===== */

// ========== 状态管理 ==========
const state = {
  network: null,
  nodes: null,
  edges: null,
  selectedNode: null,
  selectedEdge: null,
  editMode: false,
  addingEdge: false,
  edgeFrom: null,
  currentScene: 'nature',
  manualScene: 'auto',
  graphData: null,
  uploadedImages: [],
};

const PROVIDERS = {
  deepseek: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  moonshot: { endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
  qwen:     { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo' },
  glm:      { endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
  openai:   { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
};

const VISION_PROVIDERS = { glm: 'glm-4v', openai: 'gpt-4o', qwen: 'qwen-vl-plus' };

// ========== 工具函数 ==========
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all 0.3s'; }, 4000);
  setTimeout(() => toast.remove(), 4500);
}

function scrollToInput() {
  document.getElementById('input-section').scrollIntoView({ behavior: 'smooth' });
}

// ========== 图片上传与粘贴 ==========
function setupImageUpload() {
  const zone = document.getElementById('image-upload-zone');
  const input = document.getElementById('image-input');
  if (!zone) return;

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => { handleImageFiles(e.target.files); e.target.value = ''; });

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleImageFiles(e.dataTransfer.files);
  });

  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length) handleImageFiles(imageFiles);
  });
}

function handleImageFiles(files) {
  const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  Array.from(files).forEach(file => {
    if (!validTypes.includes(file.type)) {
      showToast(`不支持 ${file.type} 格式，仅支持 PNG/JPG/WebP/GIF`, 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast(`图片 ${file.name} 超过 10MB 限制`, 'error');
      return;
    }
    readImageAsDataUrl(file);
  });
}

function readImageAsDataUrl(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    state.uploadedImages.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 6), dataUrl: e.target.result, name: file.name });
    renderImagePreviews();
    showToast(`已添加图片：${file.name}`, 'success');
  };
  reader.onerror = () => showToast(`读取图片失败：${file.name}`, 'error');
  reader.readAsDataURL(file);
}

function renderImagePreviews() {
  const container = document.getElementById('image-preview-container');
  if (!container) return;
  if (state.uploadedImages.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = state.uploadedImages.map(img => `
    <div class="image-preview-item">
      <img src="${img.dataUrl}" alt="${img.name}">
      <button class="image-preview-remove" onclick="removeImage('${img.id}')" title="删除">&times;</button>
    </div>
  `).join('');
}

function removeImage(id) {
  state.uploadedImages = state.uploadedImages.filter(img => img.id !== id);
  renderImagePreviews();
  showToast('已移除图片', 'info');
}

function hasVisionSupport(provider) {
  return !!VISION_PROVIDERS[provider];
}

function getVisionModel(provider) {
  return VISION_PROVIDERS[provider] || null;
}

function setTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  state.currentScene = theme;
  if (state.network) {
    state.network.setOptions(getGraphOptions());
  }
}

function selectScene(scene) {
  state.manualScene = scene;
  document.querySelectorAll('.scene-chip').forEach(c => c.classList.toggle('active', c.dataset.scene === scene));
  if (scene !== 'auto') setTheme(scene);
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ========== 设置管理 ==========
const PROVIDER_ICONS = {
  deepseek: { bg: '#4A6CF7', label: 'DS' },
  moonshot: { bg: '#7C3AED', label: 'MS' },
  qwen:     { bg: '#FF6A00', label: 'QW' },
  glm:      { bg: '#0077FF', label: 'GLM' },
  openai:   { bg: '#10A37F', label: 'GPT' },
};

function openSettings() {
  document.getElementById('settings-modal').classList.remove('hidden');
  renderSavedConfigs();
  // 不自动填充密码框（安全考虑），只提示已保存的账号
  const activeProvider = localStorage.getItem('bagua_active') || 'deepseek';
  const configs = loadAllConfigs();
  if (configs[activeProvider]) {
    document.getElementById('api-provider').value = activeProvider;
    document.getElementById('api-endpoint').value = configs[activeProvider].endpoint || PROVIDERS[activeProvider]?.endpoint || '';
    document.getElementById('api-model').value = configs[activeProvider].model || PROVIDERS[activeProvider]?.model || '';
    // 密码框留空，提示已保存
    document.getElementById('api-key').placeholder = '已保存，留空则沿用';
    document.getElementById('api-key').value = '';
  }
}
function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function applyProvider() {
  const provider = document.getElementById('api-provider').value;
  if (provider !== 'custom' && PROVIDERS[provider]) {
    document.getElementById('api-endpoint').value = PROVIDERS[provider].endpoint;
    document.getElementById('api-model').value = PROVIDERS[provider].model;
  }
}

function loadAllConfigs() {
  try {
    const raw = localStorage.getItem('bagua_configs');
    if (raw) return JSON.parse(raw);
  } catch {}
  // 迁移旧格式
  try {
    const old = localStorage.getItem('bagua_config');
    if (old) {
      const cfg = JSON.parse(old);
      if (cfg.provider) {
        const migrated = {};
        migrated[cfg.provider] = { apiKey: cfg.apiKey || '', endpoint: cfg.endpoint || '', model: cfg.model || '' };
        localStorage.setItem('bagua_configs', JSON.stringify(migrated));
        localStorage.setItem('bagua_active', cfg.provider);
        localStorage.removeItem('bagua_config');
        return migrated;
      }
    }
  } catch {}
  return {};
}

function saveSettings() {
  const provider = document.getElementById('api-provider').value;
  const endpoint = document.getElementById('api-endpoint').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const model = document.getElementById('api-model').value.trim();
  const configs = loadAllConfigs();

  // 如果密码框为空，保留旧 key
  const finalKey = apiKey || configs[provider]?.apiKey || '';
  if (!finalKey) {
    showToast('请输入 API Key', 'error');
    return;
  }

  configs[provider] = { apiKey: finalKey, endpoint, model };
  localStorage.setItem('bagua_configs', JSON.stringify(configs));
  localStorage.setItem('bagua_active', provider);
  closeSettings();
  showToast(`已保存 ${PROVIDERS[provider] ? provider : '自定义'} 配置`, 'success');
}

function switchToProvider(provider) {
  const configs = loadAllConfigs();
  if (!configs[provider]) {
    showToast('该服务商还没有保存的配置，请先设置', 'error');
    return;
  }
  localStorage.setItem('bagua_active', provider);
  renderSavedConfigs();
  showToast(`已切换到 ${PROVIDERS[provider] ? provider : '自定义'}`, 'success');
}

function deleteSavedConfig(provider) {
  const configs = loadAllConfigs();
  delete configs[provider];
  localStorage.setItem('bagua_configs', JSON.stringify(configs));
  const active = localStorage.getItem('bagua_active') || '';
  if (active === provider) {
    const keys = Object.keys(configs);
    localStorage.setItem('bagua_active', keys.length > 0 ? keys[0] : 'deepseek');
  }
  renderSavedConfigs();
  showToast('已删除配置', 'info');
}

function renderSavedConfigs() {
  const container = document.getElementById('saved-configs-list');
  if (!container) return;
  const configs = loadAllConfigs();
  const activeProvider = localStorage.getItem('bagua_active') || 'deepseek';
  const keys = Object.keys(configs);

  if (keys.length === 0) {
    container.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">还没有保存的账号，填写上方信息后点击"保存"</div>';
    return;
  }

  container.innerHTML = keys.map(key => {
    const cfg = configs[key];
    const icon = PROVIDER_ICONS[key] || { bg: '#666', label: key.slice(0, 2).toUpperCase() };
    const isActive = key === activeProvider;
    const providerName = PROVIDERS[key] ? key : '自定义';
    const modelShort = cfg.model ? cfg.model.substring(0, 20) : '默认模型';
    return `
      <div class="saved-config-card ${isActive ? 'active' : ''}" onclick="switchToProvider('${key}')">
        <div class="saved-config-info">
          <div class="saved-config-icon" style="background:${icon.bg};">${icon.label}</div>
          <div>
            <div class="saved-config-name">${providerName} ${isActive ? '✓' : ''}</div>
            <div class="saved-config-model">${modelShort} · Key ${cfg.apiKey ? cfg.apiKey.substring(0, 8) + '...' : '未设置'}</div>
          </div>
        </div>
        <div class="saved-config-actions" onclick="event.stopPropagation()">
          <button class="saved-config-btn switch" onclick="switchToProvider('${key}')">切换</button>
          <button class="saved-config-btn delete" onclick="deleteSavedConfig('${key}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `;
  }).join('');
}

function loadSettings() {
  const activeProvider = localStorage.getItem('bagua_active') || 'deepseek';
  const configs = loadAllConfigs();
  const cfg = configs[activeProvider];

  if (cfg) {
    document.getElementById('api-provider').value = activeProvider;
    if (cfg.endpoint) document.getElementById('api-endpoint').value = cfg.endpoint;
    document.getElementById('api-key').placeholder = '已保存，留空则沿用';
    if (cfg.model) document.getElementById('api-model').value = cfg.model;
  } else {
    applyProvider();
  }
}

function getSettings() {
  const activeProvider = localStorage.getItem('bagua_active') || 'deepseek';
  const configs = loadAllConfigs();
  const cfg = configs[activeProvider];

  if (cfg) {
    return {
      provider: activeProvider,
      endpoint: cfg.endpoint || PROVIDERS[activeProvider]?.endpoint || '',
      apiKey: cfg.apiKey || '',
      model: cfg.model || PROVIDERS[activeProvider]?.model || '',
    };
  }

  return {
    provider: activeProvider,
    endpoint: document.getElementById('api-endpoint').value.trim(),
    apiKey: document.getElementById('api-key').value.trim(),
    model: document.getElementById('api-model').value.trim(),
  };
}

// ========== 标签页切换 ==========
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.includes(tab === 'chat' ? '聊天' : '人名')));
  document.getElementById('tab-chat').classList.toggle('active', tab === 'chat');
  document.getElementById('tab-names').classList.toggle('active', tab === 'names');
}

// ========== AI 分析 ==========
const SYSTEM_PROMPT = `你是一个专业的人物关系与事件分析专家。用户会给你一段文本或一组人名，请你深入分析其中的核心事件和复杂的人物关系网。

你的核心任务是：
1. 找出所有涉及多人参与的复杂事件（尤其是3人以上的事件最重要）
2. 详细描述每个人在每个事件中的具体角色和参与方式
3. 梳理人与人之间的直接关系
4. 用生动的语言讲述完整的故事

请严格按以下JSON格式返回（不要包含markdown代码块标记，不要输出任何JSON之外的内容）：
{
  "scene": "场景代码",
  "people": [
    {"id": "p1", "name": "人名", "description": "简短身份描述", "emoji": "👤", "role": "核心身份标签"}
  ],
  "events": [
    {
      "id": "ev1",
      "title": "事件标题（简短有力）",
      "emoji": "🎬",
      "people": ["涉及的人名1", "人名2"],
      "roles": {"人名1": "在该事件中的具体角色和行为", "人名2": "..."},
      "description": "详细的事件经过描述（150-300字，要讲述一个完整、生动的故事，包含起因、经过、结果）",
      "importance": 10
    }
  ],
  "relationships": [
    {"from": "人名1", "to": "人名2", "type": "关系类型", "label": "关系简述", "strength": 3, "detail": "关系背后的故事"}
  ]
}

场景代码从以下选择最匹配的：
family, entertainment, workplace, campus, history, business, palace, martial, scifi, traditional

要求：
1. 每个people必须有唯一id（p1, p2, p3...）
2. relationships的from和to必须与people中的name完全一致
3. events是最重要的部分！要深入挖掘所有涉及多人的事件
4. 涉及人数越多的事件，importance应越高（1-10）
5. events的description要写得详细生动，像讲故事一样，不能只有一句话
6. roles要写明每个人在该事件中的具体角色和动作
7. 如果是名人，基于真实知识深入挖掘他们之间的事件和关系
8. 关系类型：家人、夫妻、恋人、朋友、同学、同事、师生、合作、对手、仇人、上下级等
9. strength范围1-5，5最紧密
10. emoji选用最贴切代表该人物或事件的
11. 直接返回纯JSON，不要任何其他文字`;

async function analyzeInput() {
  const chatInput = document.getElementById('chat-input').value.trim();
  const namesInput = document.getElementById('names-input').value.trim();
  const isChatMode = document.getElementById('tab-chat').classList.contains('active');
  const userInput = isChatMode ? chatInput : namesInput;

  const hasImages = state.uploadedImages.length > 0;

  if (!userInput && !hasImages) {
    showToast('请先输入聊天记录、人名或上传截图', 'error');
    return;
  }

  const config = getSettings();
  const currentProvider = config.provider || 'deepseek';
  let useVision = false;
  let visionModel = null;
  let effectiveInput = userInput;

  // ===== 处理图片 =====
  if (hasImages) {
    if (hasVisionSupport(currentProvider)) {
      // 多模态模式：直接发图片给 API
      useVision = true;
      visionModel = getVisionModel(currentProvider);
    } else {
      // OCR 模式：浏览器端提取图片文字
      document.getElementById('loading-overlay').classList.remove('hidden');
      document.querySelector('.loading-text').textContent = '正在识别图片中的文字...';
      document.querySelector('.loading-sub').textContent = '即将完成';
      let ocrText = '';
      try {
        for (let i = 0; i < state.uploadedImages.length; i++) {
          const img = state.uploadedImages[i];
          document.querySelector('.loading-sub').textContent = `正在识别第 ${i + 1}/${state.uploadedImages.length} 张图片...`;
          const result = await Tesseract.recognize(img.dataUrl, 'chi_sim', {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                document.querySelector('.loading-sub').textContent =
                  `第 ${i + 1} 张 ${Math.round(m.progress * 100)}%`;
              }
            },
          });
          const text = (result.data.text || '').trim();
          if (text) ocrText += text + '\n';
        }
      } catch (ocrErr) {
        document.getElementById('loading-overlay').classList.add('hidden');
        showToast('图片文字识别失败，请确保图片清晰或切换到 GLM-4V', 'error');
        return;
      }

      // 清空图片
      state.uploadedImages = [];
      renderImagePreviews();

      if (!ocrText.trim()) {
        document.getElementById('loading-overlay').classList.add('hidden');
        showToast('未能从图片中识别出文字，请检查图片清晰度', 'error');
        return;
      }

      showToast(`已从图片中提取 ${ocrText.length} 个字符`, 'success');

      // 填入输入框 + 作为有效输入
      if (isChatMode) {
        const ta = document.getElementById('chat-input');
        ta.value = userInput ? userInput + '\n\n[图片识别文字]:\n' + ocrText : '[图片识别文字]:\n' + ocrText;
        ta.scrollTop = ta.scrollHeight;
      }
      effectiveInput = userInput ? userInput + '\n' + ocrText : ocrText;

      // 恢复加载提示
      document.querySelector('.loading-text').textContent = '正在梳理关系脉络...';
      document.querySelector('.loading-sub').textContent = 'AI 正在构建关系之树';
    }
  }

  const userText = effectiveInput || '请分析其中的人物关系和事件';
  const userPrompt = isChatMode
    ? `请深入分析以下聊天记录中的人物关系和事件：\n\n${userText}`
    : `请深入分析以下人物之间的核心事件和复杂关系，重点挖掘多人参与的共同事件：${userText}\n\n请特别注意：找出所有涉及多个人的共同事件，详细描述每个人在事件中的角色，讲述完整的故事。`;

  document.getElementById('loading-overlay').classList.remove('hidden');

  try {
    let userMessageContent;
    if (useVision) {
      const visionPrompt = '请先仔细识别截图中的所有文字内容，然后基于这些文字分析人物关系和事件。';
      userMessageContent = [{ type: 'text', text: `${visionPrompt}\n\n${userPrompt}` }];
      state.uploadedImages.forEach(img => {
        userMessageContent.push({ type: 'image_url', image_url: { url: img.dataUrl } });
      });
    } else {
      userMessageContent = userPrompt;
    }

    const body = {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessageContent },
      ],
      useVision: useVision,
    };
    if (config.apiKey) {
      body.apiKey = config.apiKey;
      body.apiEndpoint = config.endpoint;
      body.provider = config.provider;
      body.model = useVision ? visionModel : config.model;
    }

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.error) {
      const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      throw new Error(errMsg);
    }

    const aiContent = data.choices?.[0]?.message?.content || data.content?.[0]?.text || '';

    if (!aiContent) {
      throw new Error('AI 返回了空内容，请检查模型名称是否正确');
    }

    const cleanedContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let result;
    try {
      result = JSON.parse(cleanedContent);
    } catch {
      throw new Error(`AI 返回的内容不是有效 JSON。前200字符: ${cleanedContent.substring(0, 200)}`);
    }

    state.graphData = result;

    if (state.manualScene === 'auto' && result.scene) {
      setTheme(result.scene);
      document.querySelectorAll('.scene-chip').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-scene="auto"]').classList.add('active');
    }

    renderGraph(result);
    renderEvents(result.events || []);
    document.getElementById('result-section').classList.remove('hidden');
    document.getElementById('loading-overlay').classList.add('hidden');

    setTimeout(() => {
      document.getElementById('result-section').scrollIntoView({ behavior: 'smooth' });
    }, 200);

    showToast('关系图谱生成成功！', 'success');
  } catch (err) {
    document.getElementById('loading-overlay').classList.add('hidden');
    console.error('分析失败:', err);
    showToast(`分析失败: ${err.message}`, 'error');
  }
}

// ========== 图谱渲染 ==========
function getGraphOptions() {
  const isDark = ['entertainment', 'business', 'palace', 'scifi'].includes(state.currentScene);
  return {
    nodes: {
      shape: 'dot',
      size: 25,
      font: {
        size: 14,
        color: isDark ? '#e0e0e0' : '#333',
        face: 'Noto Sans SC, sans-serif',
        strokeWidth: isDark ? 3 : 0,
        strokeColor: isDark ? '#1a1a2e' : '#fff',
      },
      shadow: { enabled: true, color: 'rgba(0,0,0,0.15)', size: 6, x: 2, y: 2 },
      borderWidth: 2,
    },
    edges: {
      width: 2,
      font: {
        size: 12,
        color: isDark ? '#a0a0b0' : '#666',
        face: 'Noto Sans SC, sans-serif',
        strokeWidth: isDark ? 2 : 3,
        strokeColor: isDark ? 'rgba(15,15,26,0.8)' : 'rgba(255,255,255,0.9)',
      },
      smooth: { type: 'continuous', roundness: 0.3 },
      arrows: { to: { enabled: false } },
      hoverWidth: 3,
    },
    physics: {
      enabled: true,
      barnesHut: { gravitationalConstant: -4000, centralGravity: 0.3, springLength: 130, springConstant: 0.04 },
      stabilization: { iterations: 150 },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      navigationButtons: false,
      keyboard: true,
      multiselect: true,
    },
  };
}

function renderGraph(data) {
  const container = document.getElementById('graph-container');
  container.innerHTML = '';

  const people = data.people || [];
  const events = data.events || [];
  const relationships = data.relationships || [];

  const nameToId = {};

  const nodeColor = getCSSVar('--node-color') || '#43a047';
  const nodeBorder = getCSSVar('--node-border') || '#66bb6a';

  // 人物节点
  const personNodeArray = people.map((p, i) => {
    const nodeId = p.id || `p${i + 1}`;
    nameToId[p.name] = nodeId;
    const eventCount = events.filter(e => (e.people || []).includes(p.name)).length;
    const relCount = relationships.filter(r => r.from === p.name || r.to === p.name).length;
    return {
      id: nodeId,
      label: `${p.emoji || '👤'} ${p.name}`,
      title: `${p.emoji || '👤'} ${p.name}\n${p.role || p.description || ''}`,
      emoji: p.emoji || '👤',
      name: p.name,
      description: p.description || '',
      role: p.role || '',
      nodeType: 'person',
      size: 22 + (eventCount + relCount) * 3,
      color: { background: nodeColor, border: nodeBorder, highlight: { background: nodeBorder, border: nodeColor }, hover: { background: nodeBorder, border: nodeColor } },
    };
  });

  // 事件节点
  const eventNodeArray = events.map((ev, i) => {
    const evId = ev.id || `ev${i + 1}`;
    return {
      id: evId,
      label: `${ev.emoji || '📌'} ${ev.title}`,
      title: `${ev.emoji || '📌'} ${ev.title}\n${(ev.description || '').substring(0, 100)}...`,
      nodeType: 'event',
      name: ev.title,
      description: ev.description || '',
      people: ev.people || [],
      roles: ev.roles || {},
      emoji: ev.emoji || '📌',
      importance: ev.importance || 5,
      shape: 'box',
      shapeProperties: { borderRadius: 10 },
      size: 20,
      mass: 2 + (ev.people?.length || 1) * 0.5,
      color: {
        background: '#fff8e1',
        border: '#ff9800',
        highlight: { background: '#ffe0b2', border: '#ff9800' },
        hover: { background: '#fff3e0', border: '#ffb74d' },
      },
      font: { color: '#5d4037', size: 13, face: 'Noto Sans SC, sans-serif', multi: false },
      borderWidth: 2,
      shadow: { enabled: true, color: 'rgba(255,152,0,0.2)', size: 8, x: 2, y: 2 },
    };
  });

  // 事件 → 人物 边
  const eventEdgeArray = [];
  events.forEach((ev, i) => {
    const evId = ev.id || `ev${i + 1}`;
    (ev.people || []).forEach((personName, j) => {
      const personId = nameToId[personName];
      if (personId) {
        const roleLabel = ev.roles?.[personName] || '';
        eventEdgeArray.push({
          id: `epe_${i}_${j}`,
          from: evId,
          to: personId,
          label: roleLabel,
          edgeType: 'event-person',
          width: 1.5,
          dashes: [5, 5],
          color: { color: 'rgba(255,152,0,0.35)', highlight: '#ff9800', hover: 'rgba(255,152,0,0.5)' },
          font: { size: 10, color: '#b07000', strokeWidth: 3, strokeColor: 'rgba(255,255,255,0.85)' },
        });
      }
    });
  });

  // 人物 ↔ 人物 关系边
  const relEdgeArray = [];
  relationships.forEach((r, i) => {
    const fromId = nameToId[r.from];
    const toId = nameToId[r.to];
    if (!fromId || !toId) return;
    relEdgeArray.push({
      id: `rel_${i}`,
      from: fromId,
      to: toId,
      label: r.label || r.type,
      title: `${r.from} ↔ ${r.to}: ${r.detail || r.label || r.type}`,
      fromName: r.from,
      toName: r.to,
      type: r.type,
      edgeType: 'person-person',
      strength: r.strength || 3,
      detail: r.detail || '',
      width: (r.strength || 3) * 0.8 + 1,
      dashes: (r.type === '对手' || r.type === '仇人'),
    });
  });

  const allNodes = [...personNodeArray, ...eventNodeArray];
  const allEdges = [...eventEdgeArray, ...relEdgeArray];

  state.nodes = new vis.DataSet(allNodes);
  state.edges = new vis.DataSet(allEdges);

  state.network = new vis.Network(container, { nodes: state.nodes, edges: state.edges }, getGraphOptions());

  state.network.on('click', (params) => {
    if (state.addingEdge) {
      handleAddEdgeClick(params);
      return;
    }
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const node = state.nodes.get(nodeId);
      if (node.nodeType === 'event') {
        state.selectedNode = null;
        state.selectedEdge = null;
        showEventNodeDetail(node);
      } else {
        state.selectedNode = node;
        state.selectedEdge = null;
        showNodeDetail(node);
      }
    } else if (params.edges.length > 0) {
      const edgeId = params.edges[0];
      const edge = state.edges.get(edgeId);
      if (edge.edgeType !== 'event-person') {
        state.selectedEdge = edge;
        state.selectedNode = null;
        showEdgeDetail(edge);
      }
    } else {
      state.selectedNode = null;
      state.selectedEdge = null;
      closeDetailPanel();
    }
  });

  state.network.on('doubleClick', (params) => {
    if (params.nodes.length > 0) {
      const node = state.nodes.get(params.nodes[0]);
      if (node.nodeType === 'event') return;
      editNode(params.nodes[0]);
    } else if (params.edges.length > 0) {
      const edge = state.edges.get(params.edges[0]);
      if (edge.edgeType !== 'event-person') editEdge(params.edges[0]);
    }
  });
}

function graphFit() { state.network?.fit({ animation: true }); }
function graphZoom(factor) {
  if (!state.network) return;
  const scale = state.network.getScale() * factor;
  state.network.moveTo({ scale, animation: true });
}

// ========== 详情面板 ==========
function showNodeDetail(node) {
  const panel = document.getElementById('detail-panel');
  document.getElementById('detail-title').textContent = `${node.emoji || '👤'} ${node.name || node.label}`;
  const relatedEdges = state.edges.get().filter(e => e.edgeType === 'person-person' && (e.from === node.id || e.to === node.id));
  const relatedEvents = (state.graphData?.events || []).filter(e => (e.people || []).includes(node.name));

  let html = `<div class="detail-item"><span class="detail-label">身份：</span>${node.role || node.description || '暂无描述'}</div>`;

  if (relatedEvents.length > 0) {
    html += `<div class="detail-item" style="margin-top:14px;"><span class="detail-label">参与事件：</span></div>`;
    relatedEvents.forEach(ev => {
      const myRole = ev.roles?.[node.name] || '';
      html += `<div style="margin-left:12px;margin-bottom:10px;padding:8px 12px;background:var(--bg-card);border-radius:8px;border-left:3px solid #ff9800;">
        <div style="font-weight:700;margin-bottom:4px;">${ev.emoji || '📌'} ${ev.title}</div>
        ${myRole ? `<div style="color:var(--accent);font-size:13px;">我的角色：${myRole}</div>` : ''}
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${(ev.description || '').substring(0, 80)}${(ev.description || '').length > 80 ? '...' : ''}</div>
      </div>`;
    });
  }

  if (relatedEdges.length > 0) {
    html += `<div class="detail-item" style="margin-top:14px;"><span class="detail-label">直接关系：</span></div>`;
    relatedEdges.forEach(e => {
      const otherName = e.from === node.id ? e.toName : e.fromName;
      html += `<div style="margin-left:12px;margin-bottom:6px;">→ ${otherName}：${e.label || e.type}${e.detail ? `（${e.detail}）` : ''}</div>`;
    });
  }

  document.getElementById('detail-content').innerHTML = html;
  panel.classList.add('show');
}

function showEventNodeDetail(node) {
  const panel = document.getElementById('detail-panel');
  document.getElementById('detail-title').textContent = `${node.emoji || '📌'} ${node.name || node.label}`;

  let html = `<div class="detail-item" style="margin-bottom:16px;">
    <div style="font-size:14px;line-height:1.9;color:var(--text-secondary);">${node.description || '暂无描述'}</div>
  </div>`;

  const people = node.people || [];
  const roles = node.roles || {};
  if (people.length > 0) {
    html += `<div class="detail-item"><span class="detail-label">涉及人物：</span></div>`;
    people.forEach(pName => {
      const role = roles[pName] || '参与者';
      html += `<div style="margin-left:12px;margin-bottom:8px;padding:8px 12px;background:var(--bg-card);border-radius:8px;">
        <span style="font-weight:700;">${pName}</span>
        <span style="color:var(--accent);font-size:13px;margin-left:8px;">${role}</span>
      </div>`;
    });
  }

  html += `<div class="detail-item" style="margin-top:12px;"><span class="detail-label">重要性：</span>${'★'.repeat(Math.min(node.importance || 5, 10))}${'☆'.repeat(Math.max(10 - (node.importance || 5), 0))}</div>`;

  document.getElementById('detail-content').innerHTML = html;
  panel.classList.add('show');
}

function showEdgeDetail(edge) {
  const panel = document.getElementById('detail-panel');
  document.getElementById('detail-title').textContent = `${edge.fromName || edge.from} ↔ ${edge.toName || edge.to}`;
  let html = `<div class="detail-item"><span class="detail-label">关系：</span>${edge.label || edge.type}</div>`;
  if (edge.detail) {
    html += `<div class="detail-item"><span class="detail-label">详情：</span>${edge.detail}</div>`;
  }
  html += `<div class="detail-item"><span class="detail-label">紧密程度：</span>${'★'.repeat(edge.strength || 3)}${'☆'.repeat(5 - (edge.strength || 3))}</div>`;

  const fromName = edge.fromName || edge.from;
  const toName = edge.toName || edge.to;
  const relatedEvents = (state.graphData?.events || []).filter(
    e => (e.people || []).includes(fromName) && (e.people || []).includes(toName)
  );
  if (relatedEvents.length > 0) {
    html += `<div class="detail-item" style="margin-top:14px;"><span class="detail-label">共同事件：</span></div>`;
    relatedEvents.forEach(ev => {
      html += `<div style="margin-left:12px;margin-bottom:8px;padding:8px 12px;background:var(--bg-card);border-radius:8px;border-left:3px solid #ff9800;">
        <div style="font-weight:700;">${ev.emoji || '📌'} ${ev.title}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${(ev.description || '').substring(0, 100)}</div>
      </div>`;
    });
  }

  document.getElementById('detail-content').innerHTML = html;
  panel.classList.add('show');
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('show');
}

// ========== 事件列表 ==========
function renderEvents(events) {
  const list = document.getElementById('events-list');
  list.innerHTML = '';
  if (!events || events.length === 0) {
    list.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">暂无相关事件</p>';
    return;
  }
  const sorted = [...events].sort((a, b) => (b.importance || 0) - (a.importance || 0));

  sorted.forEach((ev, i) => {
    const evId = ev.id || `ev${i + 1}`;
    const card = document.createElement('div');
    card.className = 'event-card';

    const peopleWithRoles = (ev.people || []).map(p => {
      const role = ev.roles?.[p];
      return role ? `<span class="event-person" onclick="highlightPerson('${p}')">${p}<small>${role}</small></span>` : `<span class="event-person" onclick="highlightPerson('${p}')">${p}</span>`;
    }).join('');

    card.innerHTML = `
      <div class="event-header">
        <span class="event-title">${ev.emoji || '📌'} ${ev.title}</span>
        <span class="event-importance">★ ${ev.importance || '-'}</span>
      </div>
      <div class="event-desc">${ev.description || ''}</div>
      <div class="event-people">${peopleWithRoles}</div>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('event-person') || e.target.closest('.event-person')) return;
      highlightEventPeople(ev.people || [], evId);
    });
    list.appendChild(card);
  });
}

function highlightPerson(name) {
  if (!state.network) return;
  const node = state.nodes.get().find(n => n.name === name);
  if (node) {
    state.network.focus(node.id, { scale: 1.5, animation: true });
    state.network.selectNodes([node.id]);
    if (node.nodeType === 'event') {
      showEventNodeDetail(node);
    } else {
      state.selectedNode = node;
      showNodeDetail(node);
    }
  }
}

function highlightEventPeople(people, eventId) {
  if (!state.network) return;
  const nodeIds = state.nodes.get().filter(n => people.includes(n.name)).map(n => n.id);
  const allIds = eventId ? [...nodeIds, eventId] : nodeIds;
  state.network.selectNodes(allIds);
  if (eventId) {
    state.network.focus(eventId, { scale: 1.2, animation: true });
  }
  document.querySelectorAll('.event-card').forEach(c => c.classList.remove('highlighted'));
}

// ========== 编辑功能 ==========
function toggleEdit() {
  state.editMode = !state.editMode;
  document.body.classList.toggle('edit-mode', state.editMode);
  const btn = document.getElementById('edit-toggle-btn');
  btn.innerHTML = state.editMode
    ? '<i class="fas fa-check"></i> 退出编辑'
    : '<i class="fas fa-edit"></i> 编辑模式';
  if (state.editMode) showToast('已进入编辑模式，双击节点或关系可编辑', 'info');
}

function addNode() {
  openEditModal('添加人物', { label: '', description: '', emoji: '👤' }, (data) => {
    const id = `p${Date.now()}`;
    const nodeColor = getCSSVar('--node-color') || '#43a047';
    const nodeBorder = getCSSVar('--node-border') || '#66bb6a';
    state.nodes.add({
      id, label: `${data.emoji} ${data.label}`, name: data.label, description: data.description,
      emoji: data.emoji, role: data.description, nodeType: 'person',
      title: `${data.emoji} ${data.label}\n${data.description}`,
      color: { background: nodeColor, border: nodeBorder },
    });
    if (state.graphData) {
      state.graphData.people.push({ id, name: data.label, description: data.description, emoji: data.emoji });
    }
    showToast(`已添加人物：${data.label}`, 'success');
  });
}

function startAddEdge() {
  state.addingEdge = true;
  state.edgeFrom = null;
  document.body.classList.add('adding-edge');
  showToast('请点击第一个人，再点击第二个人来创建关系', 'info');
}

function handleAddEdgeClick(params) {
  if (params.nodes.length === 0) return;
  const nodeId = params.nodes[0];
  const node = state.nodes.get(nodeId);
  if (node.nodeType === 'event') {
    showToast('事件节点不能直接添加关系', 'error');
    return;
  }
  if (!state.edgeFrom) {
    state.edgeFrom = nodeId;
    showToast(`已选择：${node.name || node.label}，请点击第二个人`, 'info');
  } else {
    const fromNode = state.nodes.get(state.edgeFrom);
    const toNode = state.nodes.get(nodeId);
    openEditModal('添加关系', { label: '', type: '朋友', strength: 3 }, (data) => {
      state.edges.add({
        id: `e${Date.now()}`,
        from: fromNode.id, to: toNode.id,
        fromName: fromNode.name || fromNode.label, toName: toNode.name || toNode.label,
        label: data.label, type: data.type,
        edgeType: 'person-person',
        strength: data.strength, width: data.strength * 0.8 + 1,
        dashes: (data.type === '对手' || data.type === '仇人'),
        title: `${fromNode.name || fromNode.label} ↔ ${toNode.name || toNode.label}: ${data.label || data.type}`,
      });
      if (state.graphData) {
        state.graphData.relationships.push({ from: fromNode.name || fromNode.label, to: toNode.name || toNode.label, label: data.label, type: data.type, strength: data.strength });
      }
      showToast(`已添加关系：${fromNode.name || fromNode.label} ↔ ${toNode.name || toNode.label}`, 'success');
    });
    state.addingEdge = false;
    state.edgeFrom = null;
    document.body.classList.remove('adding-edge');
  }
}

function deleteSelected() {
  if (state.selectedNode) {
    const name = state.selectedNode.name || state.selectedNode.label;
    state.nodes.remove(state.selectedNode.id);
    const relatedEdges = state.edges.get().filter(e => e.from === state.selectedNode.id || e.to === state.selectedNode.id);
    relatedEdges.forEach(e => state.edges.remove(e.id));
    state.selectedNode = null;
    closeDetailPanel();
    showToast(`已删除：${name}`, 'success');
  } else if (state.selectedEdge) {
    state.edges.remove(state.selectedEdge.id);
    state.selectedEdge = null;
    closeDetailPanel();
    showToast('已删除关系', 'success');
  } else {
    showToast('请先选中一个节点或关系', 'error');
  }
}

function editNode(nodeId) {
  const node = state.nodes.get(nodeId);
  if (node.nodeType === 'event') return;
  openEditModal('编辑人物', { label: node.name || node.label, description: node.description || '', emoji: node.emoji || '👤' }, (data) => {
    state.nodes.update({
      id: nodeId, label: `${data.emoji} ${data.label}`, name: data.label, description: data.description,
      emoji: data.emoji, role: data.description, title: `${data.emoji} ${data.label}\n${data.description}`,
    });
    showToast(`已更新：${data.label}`, 'success');
  });
}

function editEdge(edgeId) {
  const edge = state.edges.get(edgeId);
  openEditModal('编辑关系', { label: edge.label || '', type: edge.type || '', strength: edge.strength || 3 }, (data) => {
    state.edges.update({
      id: edgeId, label: data.label, type: data.type,
      strength: data.strength, width: data.strength * 0.8 + 1,
      dashes: (data.type === '对手' || data.type === '仇人'),
    });
    showToast('关系已更新', 'success');
  });
}

function editDetail() {
  if (state.selectedNode) editNode(state.selectedNode.id);
  else if (state.selectedEdge) editEdge(state.selectedEdge.id);
}

function openEditModal(title, data, onSave) {
  const modal = document.getElementById('edit-modal');
  document.getElementById('edit-modal-title').textContent = title;
  const body = document.getElementById('edit-modal-body');

  let html = '';
  if ('emoji' in data) {
    html += `<div class="form-group"><label>Emoji</label><input type="text" id="edit-emoji" value="${data.emoji}" maxlength="2"></div>`;
    html += `<div class="form-group"><label>名称</label><input type="text" id="edit-label" value="${data.label}"></div>`;
    html += `<div class="form-group"><label>描述</label><textarea id="edit-description" rows="3">${data.description}</textarea></div>`;
  } else {
    html += `<div class="form-group"><label>关系描述</label><input type="text" id="edit-label" value="${data.label}"></div>`;
    html += `<div class="form-group"><label>关系类型</label>
      <select id="edit-type">
        ${['家人','夫妻','恋人','朋友','同学','同事','师生','合作','对手','仇人','上下级','邻居','其他'].map(t =>
          `<option value="${t}" ${t === data.type ? 'selected' : ''}>${t}</option>`
        ).join('')}
      </select></div>`;
    html += `<div class="form-group"><label>紧密程度 (1-5)</label><input type="range" id="edit-strength" min="1" max="5" value="${data.strength}" oninput="document.getElementById('str-val').textContent=this.value"><span id="str-val" style="margin-left:8px;">${data.strength}</span></div>`;
  }
  html += `<div class="form-actions"><button class="btn btn-primary" id="edit-save-btn"><i class="fas fa-check"></i> 保存</button></div>`;
  body.innerHTML = html;
  modal.classList.remove('hidden');

  document.getElementById('edit-save-btn').onclick = () => {
    const result = {};
    if ('emoji' in data) {
      result.emoji = document.getElementById('edit-emoji').value || '👤';
      result.label = document.getElementById('edit-label').value.trim();
      result.description = document.getElementById('edit-description').value.trim();
      if (!result.label) { showToast('名称不能为空', 'error'); return; }
    } else {
      result.label = document.getElementById('edit-label').value.trim();
      result.type = document.getElementById('edit-type').value;
      result.strength = parseInt(document.getElementById('edit-strength').value);
    }
    onSave(result);
    closeEditModal();
  };
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

// ========== 导出图片 ==========
function exportImage() {
  if (!state.network) return;
  const canvas = document.querySelector('#graph-container canvas');
  if (!canvas) { showToast('未找到图谱', 'error'); return; }
  const link = document.createElement('a');
  link.download = `世界树_${new Date().toLocaleDateString()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('图片已导出', 'success');
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupImageUpload();

  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  });
});
