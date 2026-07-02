# HealthyEats 🥗

一款移动端 H5 健康饮食管理应用，帮助用户管理每日饮食、追踪热量和营养素摄入。

## 功能

- 📋 个人档案管理（BMR/TDEE/BMI 自动计算）
- 🍽️ 食物数据库（200+ 常见中国食物）
- 📊 每日热量与营养素追踪
- 💡 智能饮食建议
- 📅 按日/周查看饮食记录
- 📷 头像上传与圆形裁剪

## 技术栈

- 纯原生 HTML/CSS/JavaScript
- 零外部依赖
- localStorage 本地数据持久化
- 响应式设计（375px-430px）
- 星巴克风格 UI 设计

## 预览

直接用浏览器打开 `index.html` 即可使用，或启动本地服务：

```bash
python3 -m http.server 8080
```

然后访问 http://localhost:8080

## 项目结构

```
├── index.html          首页（热量总览 + 三餐 + 建议）
├── camera.html         记录饮食（食物搜索 + 添加）
├── records.html        饮食记录（按日/周查看）
├── profile.html        我的档案（个人信息 + 头像）
├── css/
│   └── style.css       全局样式
├── js/
│   ├── app.js          业务逻辑模块
│   └── food-db.js      食物数据库 + 图片工具
└── tests/
    └── test.html       自动化测试（66 个用例）
```

## License

MIT
