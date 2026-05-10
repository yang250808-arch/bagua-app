require('dotenv').config();
const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PROVIDERS = {
  deepseek: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', vision: null },
  moonshot: { endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', vision: null },
  qwen:     { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo', vision: { model: 'qwen-vl-plus' } },
  glm:      { endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', vision: { model: 'glm-4v' } },
  openai:   { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', vision: { model: 'gpt-4o' } },
};

const VISION_OPTIONS = { max_tokens: 4096 };

const SERVER_API_KEY = process.env.API_KEY || '';

app.post('/api/analyze', (req, res) => {
  const apiKey = req.body.apiKey || SERVER_API_KEY;
  const provider = req.body.provider || process.env.DEFAULT_PROVIDER || 'deepseek';

  if (!apiKey) {
    return res.status(400).json({ error: '服务器未配置 API Key，请联系管理员' });
  }

  let endpoint = req.body.apiEndpoint;
  if (provider && PROVIDERS[provider]) {
    endpoint = PROVIDERS[provider].endpoint;
  }

  if (!endpoint) {
    endpoint = PROVIDERS.deepseek.endpoint;
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return res.status(400).json({ error: `API 地址格式不正确: ${endpoint}` });
  }

  let model = req.body.model || PROVIDERS[provider]?.model || 'deepseek-chat';
  const isVision = req.body.useVision === true && PROVIDERS[provider]?.vision;
  if (isVision) {
    model = PROVIDERS[provider].vision.model;
  }
  const bodyData = { model, messages: req.body.messages };
  if (isVision) {
    bodyData.max_tokens = VISION_OPTIONS.max_tokens;
  }
  const postData = JSON.stringify(bodyData);

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'http:' ? 80 : 443),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const proto = url.protocol === 'http:' ? http : https;
  const proxyReq = proto.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', (chunk) => (data += chunk));
    proxyRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          const errMsg = typeof parsed.error === 'string'
            ? parsed.error
            : parsed.error.message || JSON.stringify(parsed.error);
          return res.status(proxyRes.statusCode || 500).json({
            error: `API 报错 (${proxyRes.statusCode}): ${errMsg}`,
          });
        }
        res.json(parsed);
      } catch {
        res.status(500).json({
          error: `API 返回了无法解析的内容 (HTTP ${proxyRes.statusCode})，请检查 API 地址是否正确。返回内容前200字符: ${data.substring(0, 200)}`,
        });
      }
    });
  });

  proxyReq.on('error', (err) => {
    res.status(500).json({ error: `网络请求失败: ${err.message}。请检查 API 地址是否正确、网络是否通畅。` });
  });

  proxyReq.write(postData);
  proxyReq.end();
});

app.listen(PORT, () => {
  console.log(`\n  🌳 世界树服务器已启动！`);
  console.log(`  请在浏览器中打开: http://localhost:${PORT}\n`);
});
