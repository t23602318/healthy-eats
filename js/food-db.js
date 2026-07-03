/**
 * food-db.js — 本地食物数据库 & 图片工具
 * HealthyEats 健康饮食 App
 */

// ===== 图片工具（从 coze.js 迁移） =====
const ImageUtil = {
  // 压缩图片为 base64
  compressImage(file, maxSize = 10 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      if (file.size > maxSize) { reject(new Error('图片大小不超过 10MB')); return; }
      const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
      if (!allowed.some(t => file.type.toLowerCase().includes(t.split('/')[1]))) {
        reject(new Error('图片格式须为 JPG/PNG/HEIC/WebP')); return;
      }
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(file);
    });
  },

  // 生成缩略图
  makeThumbnail(dataUrl, size = 150) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const s = Math.min(size, img.width, img.height);
        canvas.width = s; canvas.height = s;
        const ctx = canvas.getContext('2d');
        const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, s, s);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve('');
      img.src = dataUrl;
    });
  },

  // 缩放图片用于 AI 识别（限制最大宽度以减少 payload）
  resizeForAI(dataUrl, maxWidth = 1024) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) {
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
};

// ===== 食物 AI 识别（通义千问 DashScope） =====
const FoodAI = {
  // Key 混淆存储（基本防护，非安全级加密）
  _k: [115,107,45,119,115,45,72,46,82,88,82,73,88,77,82,46,106,89,49,73,46,77,69,81,67,73,71,117,74,50,97,88,120,77,45,90,84,80,105,104,87,121,87,116,69,73,55,72,100,106,57,107,97,100,110,99,57,77,116,95,90,80,119,78,66,55,110,52,65,105,65,82,120,48,108,116,78,73,100,90,48,87,86,99,49,85,121,68,109,53,70,90,76,51,117,103,77,66,102,108,68,76,109,122,71,86,106,45,72,76,81,50,71,81],
  _dk() { return this._k.map(c => String.fromCharCode(c)).join(''); },

  async recognizeFood(imageBase64) {
    const apiKey = this._dk();
    const payload = {
      model: 'qwen-vl-plus',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: imageBase64 },
              {
                text: `分析这张食物图片，识别所有食物并估算营养成分。严格按以下JSON格式返回，不要有其他文字：
{
  "foods": [
    { "name": "食物名称", "amount": 100, "unit": "克", "calories": 200, "protein": 10.0, "carbs": 25.0, "fat": 8.0, "fiber": 2.0 }
  ],
  "total": { "calories": 200, "protein": 10.0, "carbs": 25.0, "fat": 8.0, "fiber": 2.0 },
  "description": "简短描述这顿饭"
}`
              }
            ]
          }
        ]
      }
    };

    const resp = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `API错误 ${resp.status}`);
    }

    const data = await resp.json();
    return this._parse(data);
  },

  _parse(data) {
    const text = data.output?.choices?.[0]?.message?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('未能解析识别结果');
    const parsed = JSON.parse(match[0]);
    if (!parsed.foods?.length) throw new Error('NO_FOOD');
    return parsed;
  },

  // Demo mode - 3 sample meals returned at random
  mockRecognize() {
    const mocks = [
      {
        foods: [
          { name: '白米饭', amount: 200, unit: '克', calories: 232, protein: 4.8, carbs: 50.4, fat: 0.6, fiber: 0.4 },
          { name: '清炒菠菜', amount: 150, unit: '克', calories: 45, protein: 2.1, carbs: 6.3, fat: 1.2, fiber: 2.1 }
        ],
        total: { calories: 277, protein: 6.9, carbs: 56.7, fat: 1.8, fiber: 2.5 },
        description: '一碗白米饭配清炒菠菜'
      },
      {
        foods: [
          { name: '鸡胸肉', amount: 150, unit: '克', calories: 200, protein: 46.5, carbs: 0, fat: 1.8, fiber: 0 },
          { name: '西兰花', amount: 100, unit: '克', calories: 34, protein: 2.8, carbs: 5.8, fat: 0.4, fiber: 2.6 },
          { name: '糙米饭', amount: 150, unit: '克', calories: 167, protein: 3.9, carbs: 34.5, fat: 1.4, fiber: 2.7 }
        ],
        total: { calories: 401, protein: 53.2, carbs: 40.3, fat: 3.6, fiber: 5.3 },
        description: '健康餐：鸡胸肉+西兰花+糙米饭'
      },
      {
        foods: [
          { name: '番茄炒蛋', amount: 200, unit: '克', calories: 170, protein: 11.0, carbs: 9.0, fat: 11.0, fiber: 1.6 },
          { name: '米饭', amount: 150, unit: '克', calories: 174, protein: 3.9, carbs: 38.4, fat: 0.5, fiber: 0.5 }
        ],
        total: { calories: 344, protein: 14.9, carbs: 47.4, fat: 11.5, fiber: 2.1 },
        description: '番茄炒蛋盖饭'
      }
    ];
    return Promise.resolve(mocks[Math.floor(Math.random() * mocks.length)]);
  }
};

// ===== 本地食物数据库 =====
const FoodDB = {
  _data: [
    // ===== 主食 =====
    { name: '白米饭', category: '主食', amount: 100, unit: '克', calories: 116, protein: 2.6, carbs: 25.6, fat: 0.3, fiber: 0.3 },
    { name: '馒头', category: '主食', amount: 100, unit: '克', calories: 221, protein: 7.0, carbs: 44.2, fat: 1.1, fiber: 1.3 },
    { name: '面条(煮)', category: '主食', amount: 100, unit: '克', calories: 110, protein: 3.5, carbs: 22.0, fat: 0.6, fiber: 0.8 },
    { name: '全麦面包', category: '主食', amount: 100, unit: '克', calories: 246, protein: 8.5, carbs: 41.0, fat: 3.4, fiber: 6.8 },
    { name: '糙米饭', category: '主食', amount: 100, unit: '克', calories: 111, protein: 2.6, carbs: 23.0, fat: 0.9, fiber: 1.8 },
    { name: '红薯', category: '主食', amount: 100, unit: '克', calories: 86, protein: 1.6, carbs: 20.1, fat: 0.2, fiber: 3.0 },
    { name: '土豆(蒸)', category: '主食', amount: 100, unit: '克', calories: 77, protein: 2.0, carbs: 17.5, fat: 0.1, fiber: 2.2 },
    { name: '花卷', category: '主食', amount: 100, unit: '克', calories: 211, protein: 6.4, carbs: 42.0, fat: 1.8, fiber: 1.0 },
    { name: '饺子', category: '主食', amount: 100, unit: '克', calories: 180, protein: 7.5, carbs: 24.0, fat: 6.0, fiber: 1.0 },
    { name: '包子(猪肉)', category: '主食', amount: 100, unit: '克', calories: 200, protein: 8.0, carbs: 28.0, fat: 6.5, fiber: 1.2 },
    { name: '油条', category: '主食', amount: 100, unit: '克', calories: 386, protein: 6.9, carbs: 51.0, fat: 17.6, fiber: 0.9 },
    { name: '煎饼果子', category: '主食', amount: 150, unit: '克', calories: 320, protein: 9.0, carbs: 38.0, fat: 14.0, fiber: 1.5 },
    { name: '米粉', category: '主食', amount: 100, unit: '克', calories: 108, protein: 2.0, carbs: 24.5, fat: 0.3, fiber: 0.4 },
    { name: '粽子', category: '主食', amount: 150, unit: '克', calories: 270, protein: 5.5, carbs: 48.0, fat: 6.0, fiber: 1.2 },
    { name: '烧饼', category: '主食', amount: 100, unit: '克', calories: 260, protein: 7.0, carbs: 42.0, fat: 7.5, fiber: 1.5 },
    { name: '燕麦片', category: '主食', amount: 100, unit: '克', calories: 367, protein: 13.5, carbs: 61.6, fat: 6.7, fiber: 10.6 },
    { name: '玉米', category: '主食', amount: 100, unit: '克', calories: 112, protein: 4.0, carbs: 22.8, fat: 1.2, fiber: 2.9 },
    { name: '年糕', category: '主食', amount: 100, unit: '克', calories: 154, protein: 3.3, carbs: 34.7, fat: 0.6, fiber: 0.8 },
    // ===== 肉类 =====
    { name: '鸡胸肉', category: '肉类', amount: 100, unit: '克', calories: 133, protein: 31.0, carbs: 0, fat: 1.2, fiber: 0 },
    { name: '猪里脊', category: '肉类', amount: 100, unit: '克', calories: 155, protein: 20.2, carbs: 0.7, fat: 7.9, fiber: 0 },
    { name: '牛腩', category: '肉类', amount: 100, unit: '克', calories: 250, protein: 17.1, carbs: 0, fat: 19.8, fiber: 0 },
    { name: '羊肉', category: '肉类', amount: 100, unit: '克', calories: 203, protein: 19.0, carbs: 0, fat: 14.1, fiber: 0 },
    { name: '鸡翅', category: '肉类', amount: 100, unit: '克', calories: 194, protein: 17.4, carbs: 0, fat: 13.6, fiber: 0 },
    { name: '猪五花', category: '肉类', amount: 100, unit: '克', calories: 395, protein: 8.9, carbs: 0.5, fat: 39.5, fiber: 0 },
    { name: '鸡蛋(煮)', category: '肉类', amount: 50, unit: '克', calories: 72, protein: 6.5, carbs: 0.6, fat: 5.0, fiber: 0 },
    { name: '鸭肉', category: '肉类', amount: 100, unit: '克', calories: 240, protein: 15.5, carbs: 0.1, fat: 19.7, fiber: 0 },
    { name: '排骨', category: '肉类', amount: 100, unit: '克', calories: 264, protein: 18.3, carbs: 0, fat: 21.2, fiber: 0 },
    { name: '牛肉干', category: '肉类', amount: 100, unit: '克', calories: 550, protein: 45.6, carbs: 10.0, fat: 36.0, fiber: 0 },
    { name: '猪蹄', category: '肉类', amount: 100, unit: '克', calories: 260, protein: 22.6, carbs: 0, fat: 18.8, fiber: 0 },
    { name: '烤鸡腿', category: '肉类', amount: 100, unit: '克', calories: 195, protein: 20.0, carbs: 1.5, fat: 12.0, fiber: 0 },
    { name: '红烧肉', category: '肉类', amount: 100, unit: '克', calories: 355, protein: 12.0, carbs: 5.0, fat: 32.0, fiber: 0 },
    { name: '回锅肉', category: '肉类', amount: 100, unit: '克', calories: 280, protein: 13.0, carbs: 6.0, fat: 22.0, fiber: 1.0 },
    { name: '宫保鸡丁', category: '肉类', amount: 100, unit: '克', calories: 180, protein: 16.0, carbs: 8.0, fat: 10.0, fiber: 1.5 },
    { name: '鱼香肉丝', category: '肉类', amount: 100, unit: '克', calories: 165, protein: 12.0, carbs: 9.0, fat: 9.5, fiber: 1.2 },
    { name: '酱牛肉', category: '肉类', amount: 100, unit: '克', calories: 175, protein: 26.0, carbs: 2.0, fat: 7.5, fiber: 0 },
    { name: '香肠', category: '肉类', amount: 100, unit: '克', calories: 508, protein: 13.0, carbs: 5.0, fat: 48.3, fiber: 0 },
    // ===== 蔬菜 =====
    { name: '西兰花', category: '蔬菜', amount: 100, unit: '克', calories: 34, protein: 2.8, carbs: 5.8, fat: 0.4, fiber: 2.6 },
    { name: '菠菜', category: '蔬菜', amount: 100, unit: '克', calories: 23, protein: 2.9, carbs: 2.0, fat: 0.3, fiber: 2.2 },
    { name: '白菜', category: '蔬菜', amount: 100, unit: '克', calories: 13, protein: 1.0, carbs: 2.2, fat: 0.1, fiber: 1.0 },
    { name: '西红柿', category: '蔬菜', amount: 100, unit: '克', calories: 18, protein: 0.9, carbs: 3.3, fat: 0.2, fiber: 1.2 },
    { name: '黄瓜', category: '蔬菜', amount: 100, unit: '克', calories: 15, protein: 0.7, carbs: 2.9, fat: 0.1, fiber: 0.5 },
    { name: '胡萝卜', category: '蔬菜', amount: 100, unit: '克', calories: 41, protein: 0.9, carbs: 9.6, fat: 0.2, fiber: 2.8 },
    { name: '芹菜', category: '蔬菜', amount: 100, unit: '克', calories: 16, protein: 0.7, carbs: 3.0, fat: 0.1, fiber: 1.6 },
    { name: '生菜', category: '蔬菜', amount: 100, unit: '克', calories: 15, protein: 1.4, carbs: 1.3, fat: 0.2, fiber: 1.3 },
    { name: '茄子', category: '蔬菜', amount: 100, unit: '克', calories: 25, protein: 1.0, carbs: 5.7, fat: 0.2, fiber: 3.0 },
    { name: '青椒', category: '蔬菜', amount: 100, unit: '克', calories: 20, protein: 0.9, carbs: 4.6, fat: 0.2, fiber: 1.7 },
    { name: '豆角', category: '蔬菜', amount: 100, unit: '克', calories: 31, protein: 1.8, carbs: 7.0, fat: 0.1, fiber: 2.7 },
    { name: '冬瓜', category: '蔬菜', amount: 100, unit: '克', calories: 11, protein: 0.4, carbs: 2.4, fat: 0.2, fiber: 0.7 },
    { name: '南瓜', category: '蔬菜', amount: 100, unit: '克', calories: 26, protein: 1.0, carbs: 5.0, fat: 0.1, fiber: 0.5 },
    { name: '丝瓜', category: '蔬菜', amount: 100, unit: '克', calories: 18, protein: 0.6, carbs: 4.1, fat: 0.1, fiber: 0.6 },
    { name: '油麦菜', category: '蔬菜', amount: 100, unit: '克', calories: 15, protein: 1.2, carbs: 2.1, fat: 0.2, fiber: 1.1 },
    { name: '空心菜', category: '蔬菜', amount: 100, unit: '克', calories: 19, protein: 2.6, carbs: 2.2, fat: 0.3, fiber: 1.4 },
    { name: '蘑菇', category: '蔬菜', amount: 100, unit: '克', calories: 22, protein: 3.1, carbs: 3.3, fat: 0.3, fiber: 1.0 },
    { name: '木耳', category: '蔬菜', amount: 100, unit: '克', calories: 37, protein: 1.5, carbs: 7.0, fat: 0.2, fiber: 2.6 },
    { name: '莲藕', category: '蔬菜', amount: 100, unit: '克', calories: 70, protein: 1.9, carbs: 16.4, fat: 0.1, fiber: 1.2 },
    // ===== 水果 =====
    { name: '苹果', category: '水果', amount: 100, unit: '克', calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2, fiber: 2.4 },
    { name: '香蕉', category: '水果', amount: 100, unit: '克', calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6 },
    { name: '橙子', category: '水果', amount: 100, unit: '克', calories: 47, protein: 0.9, carbs: 11.8, fat: 0.1, fiber: 2.4 },
    { name: '葡萄', category: '水果', amount: 100, unit: '克', calories: 69, protein: 0.7, carbs: 18.1, fat: 0.2, fiber: 0.9 },
    { name: '西瓜', category: '水果', amount: 100, unit: '克', calories: 30, protein: 0.6, carbs: 7.6, fat: 0.2, fiber: 0.4 },
    { name: '草莓', category: '水果', amount: 100, unit: '克', calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3, fiber: 2.0 },
    { name: '猕猴桃', category: '水果', amount: 100, unit: '克', calories: 61, protein: 1.1, carbs: 14.7, fat: 0.5, fiber: 3.0 },
    { name: '梨', category: '水果', amount: 100, unit: '克', calories: 57, protein: 0.4, carbs: 15.2, fat: 0.1, fiber: 3.1 },
    { name: '桃子', category: '水果', amount: 100, unit: '克', calories: 39, protein: 0.9, carbs: 9.5, fat: 0.3, fiber: 1.5 },
    { name: '芒果', category: '水果', amount: 100, unit: '克', calories: 60, protein: 0.8, carbs: 15.0, fat: 0.4, fiber: 1.6 },
    { name: '樱桃', category: '水果', amount: 100, unit: '克', calories: 63, protein: 1.1, carbs: 16.0, fat: 0.2, fiber: 2.1 },
    { name: '蓝莓', category: '水果', amount: 100, unit: '克', calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3, fiber: 2.4 },
    { name: '柚子', category: '水果', amount: 100, unit: '克', calories: 42, protein: 0.8, carbs: 10.7, fat: 0.1, fiber: 1.6 },
    { name: '荔枝', category: '水果', amount: 100, unit: '克', calories: 66, protein: 0.8, carbs: 16.5, fat: 0.4, fiber: 1.3 },
    { name: '菠萝', category: '水果', amount: 100, unit: '克', calories: 50, protein: 0.5, carbs: 13.1, fat: 0.1, fiber: 1.4 },
    { name: '火龙果', category: '水果', amount: 100, unit: '克', calories: 55, protein: 1.1, carbs: 13.0, fat: 0.4, fiber: 1.9 },
    { name: '哈密瓜', category: '水果', amount: 100, unit: '克', calories: 34, protein: 0.8, carbs: 8.2, fat: 0.2, fiber: 0.9 },
    // ===== 饮品 =====
    { name: '牛奶(全脂)', category: '饮品', amount: 100, unit: '毫升', calories: 65, protein: 3.2, carbs: 4.8, fat: 3.6, fiber: 0 },
    { name: '酸奶', category: '饮品', amount: 100, unit: '毫升', calories: 72, protein: 3.5, carbs: 9.3, fat: 2.5, fiber: 0 },
    { name: '豆浆(无糖)', category: '饮品', amount: 100, unit: '毫升', calories: 31, protein: 3.0, carbs: 1.2, fat: 1.6, fiber: 0.4 },
    { name: '可乐', category: '饮品', amount: 100, unit: '毫升', calories: 42, protein: 0, carbs: 10.6, fat: 0, fiber: 0 },
    { name: '橙汁', category: '饮品', amount: 100, unit: '毫升', calories: 45, protein: 0.7, carbs: 10.4, fat: 0.2, fiber: 0.2 },
    { name: '咖啡(黑)', category: '饮品', amount: 100, unit: '毫升', calories: 2, protein: 0.1, carbs: 0, fat: 0, fiber: 0 },
    { name: '绿茶', category: '饮品', amount: 100, unit: '毫升', calories: 1, protein: 0, carbs: 0.2, fat: 0, fiber: 0 },
    { name: '啤酒', category: '饮品', amount: 100, unit: '毫升', calories: 43, protein: 0.5, carbs: 3.4, fat: 0, fiber: 0 },
    { name: '奶茶', category: '饮品', amount: 500, unit: '毫升', calories: 280, protein: 3.0, carbs: 45.0, fat: 10.0, fiber: 0 },
    { name: '椰汁', category: '饮品', amount: 100, unit: '毫升', calories: 24, protein: 0.2, carbs: 4.8, fat: 0.5, fiber: 0 },
    { name: '红牛', category: '饮品', amount: 250, unit: '毫升', calories: 112, protein: 0, carbs: 28.0, fat: 0, fiber: 0 },
    { name: '柠檬水', category: '饮品', amount: 100, unit: '毫升', calories: 8, protein: 0.1, carbs: 1.8, fat: 0, fiber: 0.1 },
    // ===== 零食 =====
    { name: '薯片', category: '零食', amount: 100, unit: '克', calories: 536, protein: 6.5, carbs: 49.7, fat: 35.0, fiber: 4.4 },
    { name: '巧克力', category: '零食', amount: 100, unit: '克', calories: 546, protein: 4.9, carbs: 60.0, fat: 31.3, fiber: 7.0 },
    { name: '饼干', category: '零食', amount: 100, unit: '克', calories: 433, protein: 7.0, carbs: 72.0, fat: 13.0, fiber: 2.0 },
    { name: '蛋糕', category: '零食', amount: 100, unit: '克', calories: 347, protein: 5.0, carbs: 50.0, fat: 15.0, fiber: 0.5 },
    { name: '冰淇淋', category: '零食', amount: 100, unit: '克', calories: 207, protein: 3.5, carbs: 24.0, fat: 11.0, fiber: 0 },
    { name: '面包', category: '零食', amount: 100, unit: '克', calories: 266, protein: 7.5, carbs: 49.0, fat: 3.4, fiber: 2.7 },
    { name: '月饼', category: '零食', amount: 100, unit: '克', calories: 421, protein: 8.0, carbs: 55.0, fat: 19.0, fiber: 2.0 },
    { name: '糖果', category: '零食', amount: 100, unit: '克', calories: 382, protein: 0, carbs: 95.0, fat: 0.3, fiber: 0 },
    { name: '果冻', category: '零食', amount: 100, unit: '克', calories: 62, protein: 0, carbs: 15.4, fat: 0, fiber: 0 },
    { name: '爆米花', category: '零食', amount: 100, unit: '克', calories: 375, protein: 11.0, carbs: 58.0, fat: 14.5, fiber: 14.5 },
    { name: '锅巴', category: '零食', amount: 100, unit: '克', calories: 489, protein: 5.5, carbs: 62.0, fat: 24.0, fiber: 1.5 },
    { name: '辣条', category: '零食', amount: 100, unit: '克', calories: 458, protein: 8.5, carbs: 50.0, fat: 25.0, fiber: 2.0 },
    // ===== 豆制品 =====
    { name: '豆腐', category: '豆制品', amount: 100, unit: '克', calories: 76, protein: 8.1, carbs: 1.7, fat: 3.7, fiber: 0.4 },
    { name: '豆腐干', category: '豆制品', amount: 100, unit: '克', calories: 140, protein: 15.8, carbs: 4.9, fat: 6.0, fiber: 0.6 },
    { name: '腐竹', category: '豆制品', amount: 100, unit: '克', calories: 459, protein: 44.6, carbs: 22.3, fat: 21.7, fiber: 1.0 },
    { name: '豆浆', category: '豆制品', amount: 100, unit: '毫升', calories: 31, protein: 3.0, carbs: 1.2, fat: 1.6, fiber: 0.4 },
    { name: '毛豆', category: '豆制品', amount: 100, unit: '克', calories: 122, protein: 11.3, carbs: 9.9, fat: 5.2, fiber: 5.2 },
    { name: '黄豆', category: '豆制品', amount: 100, unit: '克', calories: 390, protein: 35.0, carbs: 25.3, fat: 16.0, fiber: 15.5 },
    { name: '红豆', category: '豆制品', amount: 100, unit: '克', calories: 309, protein: 20.2, carbs: 55.7, fat: 0.6, fiber: 7.7 },
    { name: '绿豆', category: '豆制品', amount: 100, unit: '克', calories: 316, protein: 21.6, carbs: 55.6, fat: 0.8, fiber: 6.4 },
    { name: '豆腐皮', category: '豆制品', amount: 100, unit: '克', calories: 409, protein: 44.6, carbs: 18.8, fat: 17.4, fiber: 0.2 },
    { name: '臭豆腐', category: '豆制品', amount: 100, unit: '克', calories: 130, protein: 10.0, carbs: 2.5, fat: 9.0, fiber: 0.5 },
    { name: '豆腐脑', category: '豆制品', amount: 100, unit: '克', calories: 15, protein: 1.5, carbs: 0.8, fat: 0.7, fiber: 0 },
    // ===== 蛋奶 =====
    { name: '鸡蛋(煮)', category: '蛋奶', amount: 50, unit: '克', calories: 72, protein: 6.5, carbs: 0.6, fat: 5.0, fiber: 0 },
    { name: '鹌鹑蛋', category: '蛋奶', amount: 50, unit: '克', calories: 79, protein: 6.5, carbs: 0.6, fat: 5.6, fiber: 0 },
    { name: '牛奶', category: '蛋奶', amount: 100, unit: '毫升', calories: 65, protein: 3.2, carbs: 4.8, fat: 3.6, fiber: 0 },
    { name: '酸奶', category: '蛋奶', amount: 100, unit: '毫升', calories: 72, protein: 3.5, carbs: 9.3, fat: 2.5, fiber: 0 },
    { name: '奶酪', category: '蛋奶', amount: 100, unit: '克', calories: 328, protein: 20.0, carbs: 3.5, fat: 26.0, fiber: 0 },
    { name: '黄油', category: '蛋奶', amount: 100, unit: '克', calories: 717, protein: 0.9, carbs: 0.1, fat: 81.0, fiber: 0 },
    { name: '鸡蛋(煎)', category: '蛋奶', amount: 60, unit: '克', calories: 110, protein: 7.0, carbs: 0.8, fat: 9.0, fiber: 0 },
    { name: '蛋挞', category: '蛋奶', amount: 70, unit: '克', calories: 230, protein: 4.0, carbs: 22.0, fat: 14.0, fiber: 0.2 },
    { name: '奶油', category: '蛋奶', amount: 100, unit: '克', calories: 349, protein: 2.0, carbs: 3.0, fat: 37.0, fiber: 0 },
    { name: '炒蛋', category: '蛋奶', amount: 100, unit: '克', calories: 154, protein: 10.6, carbs: 1.6, fat: 12.0, fiber: 0 },
    { name: '蒸蛋', category: '蛋奶', amount: 100, unit: '克', calories: 68, protein: 5.5, carbs: 1.0, fat: 4.8, fiber: 0 },
    // ===== 海鲜 =====
    { name: '虾(白灼)', category: '海鲜', amount: 100, unit: '克', calories: 99, protein: 20.4, carbs: 0.2, fat: 1.7, fiber: 0 },
    { name: '鲈鱼', category: '海鲜', amount: 100, unit: '克', calories: 105, protein: 18.6, carbs: 0, fat: 3.4, fiber: 0 },
    { name: '三文鱼', category: '海鲜', amount: 100, unit: '克', calories: 208, protein: 20.4, carbs: 0, fat: 13.4, fiber: 0 },
    { name: '带鱼', category: '海鲜', amount: 100, unit: '克', calories: 127, protein: 17.7, carbs: 0, fat: 5.9, fiber: 0 },
    { name: '螃蟹', category: '海鲜', amount: 100, unit: '克', calories: 97, protein: 19.2, carbs: 0, fat: 2.3, fiber: 0 },
    { name: '鱿鱼', category: '海鲜', amount: 100, unit: '克', calories: 92, protein: 18.0, carbs: 2.0, fat: 1.2, fiber: 0 },
    { name: '牡蛎', category: '海鲜', amount: 100, unit: '克', calories: 81, protein: 9.0, carbs: 5.0, fat: 2.7, fiber: 0 },
    { name: '扇贝', category: '海鲜', amount: 100, unit: '克', calories: 88, protein: 17.0, carbs: 2.4, fat: 0.8, fiber: 0 },
    { name: '金枪鱼罐头', category: '海鲜', amount: 100, unit: '克', calories: 116, protein: 25.5, carbs: 0, fat: 1.0, fiber: 0 },
    { name: '草鱼', category: '海鲜', amount: 100, unit: '克', calories: 112, protein: 16.6, carbs: 0, fat: 5.2, fiber: 0 },
    { name: '鳗鱼', category: '海鲜', amount: 100, unit: '克', calories: 184, protein: 18.4, carbs: 0, fat: 11.8, fiber: 0 },
    { name: '海带', category: '海鲜', amount: 100, unit: '克', calories: 12, protein: 1.2, carbs: 1.6, fat: 0.1, fiber: 0.5 },
    // ===== 汤粥 =====
    { name: '小米粥', category: '汤粥', amount: 100, unit: '克', calories: 46, protein: 1.4, carbs: 8.4, fat: 0.7, fiber: 0.4 },
    { name: '皮蛋瘦肉粥', category: '汤粥', amount: 100, unit: '克', calories: 55, protein: 3.5, carbs: 7.0, fat: 1.5, fiber: 0.2 },
    { name: '紫菜蛋花汤', category: '汤粥', amount: 100, unit: '克', calories: 18, protein: 1.5, carbs: 1.2, fat: 0.8, fiber: 0.3 },
    { name: '番茄蛋汤', category: '汤粥', amount: 100, unit: '克', calories: 22, protein: 1.8, carbs: 2.0, fat: 1.0, fiber: 0.4 },
    { name: '玉米排骨汤', category: '汤粥', amount: 100, unit: '克', calories: 35, protein: 3.0, carbs: 3.5, fat: 1.2, fiber: 0.3 },
    { name: '鸡汤', category: '汤粥', amount: 100, unit: '克', calories: 30, protein: 3.5, carbs: 0.5, fat: 1.5, fiber: 0 },
    { name: '味噌汤', category: '汤粥', amount: 100, unit: '克', calories: 25, protein: 1.8, carbs: 2.5, fat: 0.8, fiber: 0.5 },
    { name: '南瓜粥', category: '汤粥', amount: 100, unit: '克', calories: 38, protein: 0.8, carbs: 8.0, fat: 0.2, fiber: 0.6 },
    { name: '八宝粥', category: '汤粥', amount: 100, unit: '克', calories: 62, protein: 1.5, carbs: 12.0, fat: 0.8, fiber: 0.8 },
    { name: '白粥', category: '汤粥', amount: 100, unit: '克', calories: 31, protein: 0.7, carbs: 6.8, fat: 0.1, fiber: 0.1 },
    { name: '酸辣汤', category: '汤粥', amount: 100, unit: '克', calories: 28, protein: 2.0, carbs: 3.0, fat: 0.8, fiber: 0.3 },
    // ===== 快餐 =====
    { name: '肯德基炸鸡(1块)', category: '快餐', amount: 120, unit: '克', calories: 312, protein: 18.0, carbs: 12.0, fat: 22.0, fiber: 0.5 },
    { name: '麦当劳巨无霸', category: '快餐', amount: 200, unit: '克', calories: 540, protein: 25.0, carbs: 45.0, fat: 29.0, fiber: 3.0 },
    { name: '汉堡', category: '快餐', amount: 150, unit: '克', calories: 370, protein: 18.0, carbs: 35.0, fat: 18.0, fiber: 2.0 },
    { name: '薯条(中)', category: '快餐', amount: 117, unit: '克', calories: 340, protein: 4.0, carbs: 44.0, fat: 16.0, fiber: 3.8 },
    { name: '炒饭', category: '快餐', amount: 250, unit: '克', calories: 420, protein: 10.0, carbs: 55.0, fat: 18.0, fiber: 2.0 },
    { name: '盖浇饭', category: '快餐', amount: 350, unit: '克', calories: 520, protein: 15.0, carbs: 68.0, fat: 20.0, fiber: 3.0 },
    { name: '麻辣烫', category: '快餐', amount: 400, unit: '克', calories: 380, protein: 18.0, carbs: 35.0, fat: 18.0, fiber: 5.0 },
    { name: '沙县拌面', category: '快餐', amount: 200, unit: '克', calories: 320, protein: 8.5, carbs: 45.0, fat: 12.0, fiber: 2.0 },
    { name: '黄焖鸡米饭', category: '快餐', amount: 400, unit: '克', calories: 580, protein: 25.0, carbs: 65.0, fat: 22.0, fiber: 3.0 },
    { name: '煲仔饭', category: '快餐', amount: 350, unit: '克', calories: 510, protein: 18.0, carbs: 62.0, fat: 20.0, fiber: 2.5 },
    { name: '兰州拉面', category: '快餐', amount: 400, unit: '克', calories: 450, protein: 20.0, carbs: 55.0, fat: 16.0, fiber: 2.0 },
    { name: '肉夹馍', category: '快餐', amount: 200, unit: '克', calories: 440, protein: 16.0, carbs: 42.0, fat: 22.0, fiber: 1.5 },
    { name: '煎饺(10个)', category: '快餐', amount: 200, unit: '克', calories: 420, protein: 14.0, carbs: 40.0, fat: 22.0, fiber: 2.0 },
    { name: '酸辣粉', category: '快餐', amount: 350, unit: '克', calories: 380, protein: 6.0, carbs: 60.0, fat: 12.0, fiber: 2.5 },
    { name: '螺蛳粉', category: '快餐', amount: 400, unit: '克', calories: 420, protein: 8.0, carbs: 55.0, fat: 18.0, fiber: 3.0 },
    // ===== 坚果 =====
    { name: '核桃', category: '坚果', amount: 100, unit: '克', calories: 654, protein: 15.2, carbs: 13.7, fat: 65.2, fiber: 6.7 },
    { name: '杏仁', category: '坚果', amount: 100, unit: '克', calories: 578, protein: 21.2, carbs: 21.6, fat: 49.9, fiber: 12.5 },
    { name: '腰果', category: '坚果', amount: 100, unit: '克', calories: 553, protein: 18.2, carbs: 30.2, fat: 43.8, fiber: 3.3 },
    { name: '花生', category: '坚果', amount: 100, unit: '克', calories: 567, protein: 25.8, carbs: 16.1, fat: 49.2, fiber: 8.5 },
    { name: '瓜子', category: '坚果', amount: 100, unit: '克', calories: 584, protein: 20.8, carbs: 20.0, fat: 51.5, fiber: 8.6 },
    { name: '开心果', category: '坚果', amount: 100, unit: '克', calories: 560, protein: 20.2, carbs: 27.2, fat: 45.3, fiber: 10.6 },
    { name: '榛子', category: '坚果', amount: 100, unit: '克', calories: 628, protein: 15.0, carbs: 16.7, fat: 60.8, fiber: 9.7 },
    { name: '松子', category: '坚果', amount: 100, unit: '克', calories: 673, protein: 13.7, carbs: 13.1, fat: 68.4, fiber: 3.7 },
    { name: '夏威夷果', category: '坚果', amount: 100, unit: '克', calories: 718, protein: 7.9, carbs: 13.8, fat: 75.8, fiber: 8.6 },
    { name: '栗子', category: '坚果', amount: 100, unit: '克', calories: 196, protein: 4.2, carbs: 42.2, fat: 1.5, fiber: 4.2 },
    { name: '葵花子', category: '坚果', amount: 100, unit: '克', calories: 584, protein: 20.8, carbs: 20.0, fat: 51.5, fiber: 8.6 },
    // ===== 补充更多常见食物 =====
    { name: '拌黄瓜', category: '蔬菜', amount: 100, unit: '克', calories: 25, protein: 0.8, carbs: 3.5, fat: 0.8, fiber: 0.5 },
    { name: '蒜蓉西兰花', category: '蔬菜', amount: 100, unit: '克', calories: 55, protein: 3.0, carbs: 6.0, fat: 2.5, fiber: 2.6 },
    { name: '醋溜白菜', category: '蔬菜', amount: 100, unit: '克', calories: 35, protein: 1.0, carbs: 3.5, fat: 1.8, fiber: 1.0 },
    { name: '清炒时蔬', category: '蔬菜', amount: 100, unit: '克', calories: 45, protein: 1.5, carbs: 4.0, fat: 2.5, fiber: 1.5 },
    { name: '凉拌木耳', category: '蔬菜', amount: 100, unit: '克', calories: 50, protein: 1.8, carbs: 7.5, fat: 1.5, fiber: 2.8 },
    { name: '烤红薯', category: '主食', amount: 100, unit: '克', calories: 99, protein: 1.8, carbs: 23.5, fat: 0.2, fiber: 3.2 },
    { name: '肠粉', category: '主食', amount: 100, unit: '克', calories: 110, protein: 3.5, carbs: 15.0, fat: 4.0, fiber: 0.3 },
    { name: '炸酱面', category: '快餐', amount: 300, unit: '克', calories: 480, protein: 15.0, carbs: 58.0, fat: 20.0, fiber: 3.0 },
    { name: '担担面', category: '快餐', amount: 300, unit: '克', calories: 450, protein: 14.0, carbs: 52.0, fat: 20.0, fiber: 2.5 },
    { name: '小笼包(8个)', category: '快餐', amount: 200, unit: '克', calories: 360, protein: 14.0, carbs: 42.0, fat: 14.0, fiber: 1.5 },
    { name: '锅贴(10个)', category: '快餐', amount: 200, unit: '克', calories: 440, protein: 14.0, carbs: 42.0, fat: 24.0, fiber: 1.8 },
    { name: '炒年糕', category: '快餐', amount: 200, unit: '克', calories: 320, protein: 6.0, carbs: 52.0, fat: 10.0, fiber: 1.5 },
    { name: '麻婆豆腐', category: '豆制品', amount: 100, unit: '克', calories: 95, protein: 6.5, carbs: 3.5, fat: 6.0, fiber: 0.5 },
    { name: '水煮肉片', category: '肉类', amount: 100, unit: '克', calories: 210, protein: 14.0, carbs: 3.0, fat: 16.0, fiber: 1.0 },
    { name: '糖醋排骨', category: '肉类', amount: 100, unit: '克', calories: 245, protein: 15.0, carbs: 18.0, fat: 12.0, fiber: 0.3 },
    { name: '水煮鱼', category: '海鲜', amount: 100, unit: '克', calories: 135, protein: 15.0, carbs: 2.0, fat: 7.5, fiber: 0.5 },
    { name: '清蒸鲈鱼', category: '海鲜', amount: 100, unit: '克', calories: 110, protein: 18.5, carbs: 1.0, fat: 3.8, fiber: 0 },
    { name: '蒜蓉粉丝蒸虾', category: '海鲜', amount: 100, unit: '克', calories: 95, protein: 12.0, carbs: 8.0, fat: 2.0, fiber: 0.2 },
    { name: '干锅花菜', category: '蔬菜', amount: 100, unit: '克', calories: 68, protein: 2.5, carbs: 5.0, fat: 4.5, fiber: 2.0 },
    { name: '地三鲜', category: '蔬菜', amount: 100, unit: '克', calories: 95, protein: 1.5, carbs: 8.0, fat: 6.5, fiber: 2.0 },
    { name: '番茄炒蛋', category: '蛋奶', amount: 100, unit: '克', calories: 85, protein: 5.5, carbs: 4.5, fat: 5.5, fiber: 0.8 },
    { name: '鸡蛋灌饼', category: '主食', amount: 150, unit: '克', calories: 310, protein: 10.0, carbs: 35.0, fat: 14.0, fiber: 1.2 },
    { name: '手抓饼', category: '主食', amount: 120, unit: '克', calories: 290, protein: 5.5, carbs: 36.0, fat: 14.0, fiber: 1.0 },
    { name: '牛肉面', category: '快餐', amount: 400, unit: '克', calories: 480, protein: 22.0, carbs: 55.0, fat: 18.0, fiber: 2.5 },
    { name: '烤串(10串)', category: '肉类', amount: 200, unit: '克', calories: 450, protein: 28.0, carbs: 5.0, fat: 35.0, fiber: 0.5 },
    { name: '凉皮', category: '快餐', amount: 300, unit: '克', calories: 350, protein: 5.0, carbs: 55.0, fat: 12.0, fiber: 1.5 },
    { name: '鸡蛋羹', category: '蛋奶', amount: 150, unit: '克', calories: 102, protein: 8.3, carbs: 1.5, fat: 7.2, fiber: 0 },
    { name: '拿铁咖啡', category: '饮品', amount: 350, unit: '毫升', calories: 150, protein: 7.5, carbs: 12.0, fat: 8.0, fiber: 0 },
    { name: '珍珠奶茶', category: '饮品', amount: 500, unit: '毫升', calories: 380, protein: 3.5, carbs: 62.0, fat: 12.0, fiber: 0.5 },
    { name: '西柚汁', category: '饮品', amount: 100, unit: '毫升', calories: 39, protein: 0.5, carbs: 9.2, fat: 0.1, fiber: 0.2 },
    { name: '豆花', category: '豆制品', amount: 200, unit: '克', calories: 50, protein: 4.0, carbs: 2.0, fat: 2.5, fiber: 0.3 },
    { name: '日式咖喱饭', category: '快餐', amount: 350, unit: '克', calories: 520, protein: 14.0, carbs: 65.0, fat: 22.0, fiber: 3.5 },
    { name: '披萨(1片)', category: '快餐', amount: 120, unit: '克', calories: 280, protein: 12.0, carbs: 30.0, fat: 12.0, fiber: 2.0 },
    { name: '三明治', category: '快餐', amount: 150, unit: '克', calories: 260, protein: 12.0, carbs: 28.0, fat: 11.0, fiber: 2.5 },
    { name: '寿司(6个)', category: '快餐', amount: 180, unit: '克', calories: 250, protein: 8.0, carbs: 42.0, fat: 5.0, fiber: 1.5 },
    { name: '春卷(4个)', category: '快餐', amount: 120, unit: '克', calories: 280, protein: 6.0, carbs: 30.0, fat: 15.0, fiber: 1.5 },
    { name: '茶叶蛋', category: '蛋奶', amount: 50, unit: '克', calories: 75, protein: 6.5, carbs: 1.0, fat: 5.2, fiber: 0 },
    { name: '皮蛋', category: '蛋奶', amount: 60, unit: '克', calories: 90, protein: 8.0, carbs: 1.5, fat: 6.0, fiber: 0 }
  ],

  // 获取所有分类
  getCategories() {
    return ['主食', '肉类', '蔬菜', '水果', '饮品', '零食', '豆制品', '蛋奶', '海鲜', '汤粥', '快餐', '坚果'];
  },

  // 按分类获取食物
  getByCategory(category) {
    return this._data.filter(item => item.category === category);
  },

  // 模糊搜索（按名称或分类，支持子串匹配）
  search(keyword) {
    if (!keyword || !keyword.trim()) return [];
    const kw = keyword.trim().toLowerCase();
    const results = this._data.filter(item =>
      item.name.toLowerCase().includes(kw) ||
      item.category.toLowerCase().includes(kw)
    );
    return results.slice(0, 20);
  }
};
