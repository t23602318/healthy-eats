# Design Document

## Overview

HealthyEats 是一款零外部依赖的移动端 H5 应用，由静态 HTML 页面 + JavaScript 模块组成，数据存储在浏览器 localStorage 中。食物识别通过通义千问视觉模型（qwen-vl-plus）API 实现。应用采用星巴克风格 UI 设计，通过 GitHub Pages 静态托管。

---

## Architecture

```
Browser (Mobile H5)
│
├── Pages (HTML)
│   ├── login.html       登录/注册
│   ├── index.html       首页（热量总览 + 三餐 + 建议）
│   ├── camera.html      记录饮食（AI 拍照识别）
│   ├── records.html     饮食记录（日/周视图）
│   └── profile.html     我的档案
│
├── Modules (JS)
│   ├── js/app.js        Auth, Storage, Profile, DietLog, IntakeCalc, MealAdvisor, DateUtil, UI
│   └── js/food-db.js    FoodAI (通义千问API), ImageUtil, FoodDB (本地食物库备用)
│
├── css/style.css        全局样式（星巴克风格）
│
└── tests/test.html      浏览器内自动化测试
```

---

## Module Design

### Auth (app.js)

账号系统。用户数据存储在全局 localStorage 键 `_healthyeats_users` 中，密码经哈希后存储。

```
Auth.register(username, password) → true | throw Error
Auth.login(username, password)    → true | throw Error
Auth.logout()                     → void
Auth.getCurrentUser()             → string | null
Auth.isLoggedIn()                 → boolean
Auth.requireLogin()               → boolean (redirects if not logged in)
```

### Storage (app.js)

以 `{username}_` 为前缀的 localStorage 封装。

```
Storage._key(key)         → "{username}_{key}"
Storage.get(key, default) → any
Storage.set(key, val)     → void
Storage.remove(key)       → void
```

### Profile (app.js)

```
Profile.get() / save(data)
Profile.calcBMR(p)          → Mifflin-St Jeor 公式
Profile.calcTDEE(p)         → BMR × 活动系数（1.2/1.375/1.55/1.725/1.9）
Profile.calcMacroTargets(p) → {calories, carbs, protein, fat, fiber}
Profile.calcMealTargets(p)  → 三餐 30%/40%/30% 分配
Profile.calcBMI(p)          → BMI 值
Profile.getBMILabel(bmi)    → {label, color}
```

### DietLog (app.js)

```
DietLog.addRecord(record)              → DietRecord
DietLog.removeRecord(date, id)         → void
DietLog.getByDate(date)                → DietRecord[]
DietLog.getDayActualTotals(date)       → NutritionTotals
DietLog.getMealActualTotals(date, meal) → NutritionTotals
DietLog.getCalorieDiff(date, tdee)     → number
```

### FoodAI (food-db.js)

通义千问视觉模型接口封装。API Key 以字符编码数组混淆存储。

```
FoodAI.recognizeFood(imageBase64) → Promise<{foods, total, description}>
FoodAI.mockRecognize()            → Promise<{foods, total, description}>
```

**API 调用**：
- Endpoint: `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- Model: `qwen-vl-plus`
- 格式: OpenAI 兼容（messages + image_url）

### ImageUtil (food-db.js)

```
ImageUtil.compressImage(file)     → Promise<base64DataUrl>
ImageUtil.makeThumbnail(dataUrl)  → Promise<base64 JPEG 150x150>
ImageUtil.resizeForAI(dataUrl)    → Promise<base64 max 1024px width>
```

### IntakeCalc, MealAdvisor, DateUtil, UI (app.js)

与原始设计一致，提供百分比换算、饮食建议生成、日期工具、Toast/Loading 等 UI 辅助。

---

## Data Models

### User Account

```
localStorage key: "_healthyeats_users" (全局，无前缀)
value: { "username": "hashed_password", ... }

localStorage key: "_healthyeats_session"
value: "current_username"
```

### UserProfile

```
localStorage key: "{username}_health_profile"
value: { gender, age, height, weight, bodyFat, activity, goal, avatar }
```

### DietRecord

```
localStorage key: "{username}_diet_log_YYYY-MM-DD"
value: DietRecord[]

DietRecord {
  id, date, mealType,
  foods: [{name, amount, unit, calories, protein, carbs, fat, fiber}],
  estimatedCalories, intakePercent, actualCalories,
  actualNutrition: {carbs, protein, fat, fiber},
  imagePreview (base64 thumbnail),
  source: "ai",
  timestamp (ISO 8601)
}
```

---

## Page Flow

```
login.html → (登录成功) → index.html
                            ├── camera.html (FAB 或餐次按钮进入)
                            ├── records.html (底部导航)
                            └── profile.html (底部导航)
```

所有页面（除 login.html）在加载时检查 `Auth.isLoggedIn()`，未登录则跳转 login.html。

---

## UI Design

- **设计风格**：星巴克 App 风格
- **配色**：深绿 #2D4F47 (primary)、金色 #CBA258 (accent)、奶白 #F1F0EB (background)
- **导航**：3-tab 底部导航（首页/记录/我的）+ 右下角 FAB（餐具图标）
- **图标**：扁平 SVG 描线图标
- **卡片**：20px 圆角、微妙阴影
- **按钮**：24px 药丸形圆角
- **表单只读态**：标签+值的文本列表（非输入框）

---

## Deployment

- **前端托管**：GitHub Pages (https://t23602318.github.io/healthy-eats/)
- **AI API**：通义千问 DashScope（OpenAI 兼容接口，Key 混淆存储在前端）
- **数据存储**：浏览器 localStorage（按账号隔离）

---

## File Inventory

```
healthy-eats/
├── login.html          登录/注册
├── index.html          首页
├── camera.html         记录饮食（AI 拍照识别）
├── records.html        饮食记录
├── profile.html        我的档案
├── css/style.css       全局样式
├── js/app.js           业务逻辑（Auth, Storage, Profile, DietLog, etc.）
├── js/food-db.js       AI 识别 + 图片工具 + 食物数据库
├── tests/test.html     自动化测试
└── README.md           项目说明
```
