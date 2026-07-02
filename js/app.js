/**
 * app.js — 公共工具函数 & 数据管理
 * HealthyEats 健康饮食 App
 */

// ===== DeviceID 管理 =====
const Device = {
  _id: null,
  getId() {
    if (this._id) return this._id;
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      localStorage.setItem('device_id', id);
    }
    this._id = id;
    return id;
  }
};

// ===== 数据存储（带 DeviceID 前缀） =====
const Storage = {
  _key(key) { return Device.getId() + '_' + key; },
  get(key, defaultVal = null) {
    try {
      const v = localStorage.getItem(this._key(key));
      return v !== null ? JSON.parse(v) : defaultVal;
    } catch {
      localStorage.removeItem(this._key(key));
      return defaultVal;
    }
  },
  set(key, val) {
    localStorage.setItem(this._key(key), JSON.stringify(val));
  },
  remove(key) {
    localStorage.removeItem(this._key(key));
  }
};

// ===== 日期工具 =====
const DateUtil = {
  today() { return new Date().toISOString().slice(0, 10); },
  format(dateStr) {
    const diff = Math.round((new Date(this.today()) - new Date(dateStr)) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },
  addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  },
  getWeekDates() {
    const today = this.today();
    const dates = [];
    for (let i = 6; i >= 0; i--) dates.push(this.addDays(today, -i));
    return dates;
  },
  formatDisplay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
};

// ===== 用户档案 =====
const Profile = {
  KEY: 'health_profile',
  ACTIVITY_MAP: {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  },
  get() {
    return Storage.get(this.KEY, null);
  },
  save(data) {
    Storage.set(this.KEY, data);
  },
  // Mifflin-St Jeor BMR
  calcBMR(p) {
    if (p.gender === 'male') return 10 * p.weight + 6.25 * p.height - 5 * p.age + 5;
    return 10 * p.weight + 6.25 * p.height - 5 * p.age - 161;
  },
  // TDEE = BMR × 活动系数 = 今日最多可摄入热量
  calcTDEE(p) {
    const factor = this.ACTIVITY_MAP[p.activity] || 1.55;
    return Math.round(this.calcBMR(p) * factor);
  },
  // 宏量营养素每日目标（按目标调整比例）
  calcMacroTargets(p) {
    const tdee = this.calcTDEE(p);
    let pRatio = 0.20, cRatio = 0.50, fRatio = 0.30;
    if (p.goal === 'lose')   { pRatio = 0.30; cRatio = 0.40; fRatio = 0.30; }
    if (p.goal === 'gain')   { pRatio = 0.25; cRatio = 0.50; fRatio = 0.25; }
    return {
      calories: tdee,
      carbs:    Math.round(tdee * cRatio / 4),
      protein:  Math.round(tdee * pRatio / 4),
      fat:      Math.round(tdee * fRatio / 9),
      fiber:    25
    };
  },
  // 三餐分配：早30% 午40% 晚30%
  calcMealTargets(p) {
    const daily = this.calcMacroTargets(p);
    const ratios = { breakfast: 0.3, lunch: 0.4, dinner: 0.3 };
    const result = {};
    ['breakfast', 'lunch', 'dinner'].forEach(m => {
      const r = ratios[m];
      result[m] = {
        calories: Math.round(daily.calories * r),
        carbs:    Math.round(daily.carbs * r),
        protein:  Math.round(daily.protein * r),
        fat:      Math.round(daily.fat * r),
        fiber:    Math.round(daily.fiber * r)
      };
    });
    return result;
  },
  calcBMI(p) {
    const h = p.height / 100;
    return +(p.weight / (h * h)).toFixed(1);
  },
  getBMILabel(bmi) {
    if (bmi < 18.5) return { label: '偏瘦', color: '#4ECDC4' };
    if (bmi < 24)   return { label: '正常', color: '#4CAF82' };
    if (bmi < 28)   return { label: '超重', color: '#F39C12' };
    return { label: '肥胖', color: '#E74C3C' };
  }
};

// ===== 饮食记录 =====
const DietLog = {
  KEY_PREFIX: 'diet_log_',
  getKey(date) { return this.KEY_PREFIX + date; },

  getByDate(date) {
    return Storage.get(this.getKey(date), []);
  },

  // 添加一条记录
  addRecord(record) {
    const list = this.getByDate(record.date);
    record.id = Date.now();
    record.deviceId = Device.getId();
    list.push(record);
    Storage.set(this.getKey(record.date), list);
    return record;
  },

  // 删除一条记录
  removeRecord(date, recordId) {
    const list = this.getByDate(date).filter(r => r.id !== recordId);
    Storage.set(this.getKey(date), list);
  },

  // 汇总某天实际摄入
  getDayActualTotals(date) {
    const list = this.getByDate(date);
    const totals = { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 };
    list.forEach(r => {
      totals.calories += r.actualCalories  || 0;
      totals.carbs    += r.actualNutrition?.carbs   || 0;
      totals.protein  += r.actualNutrition?.protein || 0;
      totals.fat      += r.actualNutrition?.fat     || 0;
      totals.fiber    += r.actualNutrition?.fiber   || 0;
    });
    return {
      calories: Math.round(totals.calories),
      carbs:    Math.round(totals.carbs * 10) / 10,
      protein:  Math.round(totals.protein * 10) / 10,
      fat:      Math.round(totals.fat * 10) / 10,
      fiber:    Math.round(totals.fiber * 10) / 10
    };
  },

  // 计算热量差值（正=余量，负=超标）
  getCalorieDiff(date, tdee) {
    const actual = this.getDayActualTotals(date).calories;
    return tdee - actual;
  },

  // 获取按餐次分组的记录
  getByMeal(date) {
    const list = this.getByDate(date);
    const result = { breakfast: [], lunch: [], dinner: [] };
    list.forEach(r => { if (result[r.mealType]) result[r.mealType].push(r); });
    return result;
  },

  // 汇总某餐实际营养
  getMealActualTotals(date, mealType) {
    const list = this.getByDate(date).filter(r => r.mealType === mealType);
    const totals = { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 };
    list.forEach(r => {
      totals.calories += r.actualCalories             || 0;
      totals.carbs    += r.actualNutrition?.carbs     || 0;
      totals.protein  += r.actualNutrition?.protein   || 0;
      totals.fat      += r.actualNutrition?.fat       || 0;
      totals.fiber    += r.actualNutrition?.fiber     || 0;
    });
    return {
      calories: Math.round(totals.calories),
      carbs:    Math.round(totals.carbs * 10) / 10,
      protein:  Math.round(totals.protein * 10) / 10,
      fat:      Math.round(totals.fat * 10) / 10,
      fiber:    Math.round(totals.fiber * 10) / 10
    };
  }
};

// ===== 实际摄入计算 =====
const IntakeCalc = {
  // 根据百分比计算实际摄入
  calcActual(estimated, percent) {
    const p = Math.max(1, Math.min(100, parseInt(percent) || 100)) / 100;
    return {
      calories: Math.round(estimated.calories * p),
      carbs:    Math.round(estimated.carbs    * p * 10) / 10,
      protein:  Math.round(estimated.protein  * p * 10) / 10,
      fat:      Math.round(estimated.fat      * p * 10) / 10,
      fiber:    Math.round((estimated.fiber || 0) * p * 10) / 10
    };
  }
};

// ===== 饮食建议生成 =====
const MealAdvisor = {
  FOOD_TIPS: {
    carbs:   { low: ['米饭（约半碗≈100g）', '全麦面包（1片≈30g）', '红薯（半个≈100g）'], high: ['减少米饭', '少吃甜食和精制主食'] },
    protein: { low: ['鸡胸肉（100g≈31g蛋白）', '鸡蛋（1个≈6g蛋白）', '豆腐（150g≈12g蛋白）'], high: ['适量减少肉类摄入'] },
    fat:     { low: ['坚果（一小把）', '牛油果（半个）'], high: ['减少油炸食品', '烹饪少放油'] },
    fiber:   { low: ['绿叶蔬菜（150g）', '苹果（1个）', '燕麦（50g）'], high: ['膳食纤维过多可能引起不适'] }
  },

  evaluate(actual, target) {
    const ratio = target > 0 ? actual / target : 0;
    if (ratio < 0.8) return 'low';
    if (ratio > 1.2) return 'high';
    return 'ok';
  },

  generateAdvice(actual, target) {
    const advice = [];
    const nutrients = [
      { key: 'calories', name: '热量', unit: 'kcal' },
      { key: 'carbs',    name: '碳水', unit: 'g' },
      { key: 'protein',  name: '蛋白质', unit: 'g' },
      { key: 'fat',      name: '脂肪', unit: 'g' }
    ];
    nutrients.forEach(({ key, name, unit }) => {
      const status = this.evaluate(actual[key] || 0, target[key] || 1);
      const diff = Math.abs(Math.round((target[key] || 0) - (actual[key] || 0)));
      const tips = this.FOOD_TIPS[key] || { low: [], high: [] };
      if (status === 'low') {
        advice.push({ type: 'low', icon: '⬆️', title: `${name}摄入不足`, desc: `还差 ${diff}${unit}，建议补充：${tips.low.slice(0,2).join('、')}` });
      } else if (status === 'high') {
        advice.push({ type: 'high', icon: '⬇️', title: `${name}摄入超标`, desc: `超出 ${diff}${unit}，建议：${tips.high.join('、')}` });
      }
    });
    if (advice.length === 0) advice.push({ type: 'ok', icon: '✅', title: '营养均衡', desc: '今日营养摄入状况良好，继续保持！' });
    return advice;
  }
};

// ===== UI 工具 =====
const UI = {
  showToast(msg, duration = 2000) {
    let el = document.getElementById('global-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'global-toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration);
  },

  showLoading(text = '识别中...') {
    let el = document.getElementById('loading-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading-overlay';
      el.className = 'loading-overlay';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="spinner"></div><div class="loading-text">${text}</div>`;
    el.style.display = 'flex';
  },

  hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = 'none';
  },

  // 进度条颜色
  progressColor(pct) {
    if (pct > 120) return '#E74C3C';
    if (pct >= 80) return '#4CAF82';
    return '#F39C12';
  },

  // 渲染热量差值文字
  renderDiff(diff) {
    if (diff > 0) return `<span style="color:#4CAF82">还可摄入 ${diff} kcal</span>`;
    if (diff < 0) return `<span style="color:#E74C3C">超标 ${Math.abs(diff)} kcal</span>`;
    return `<span style="color:#4CAF82">恰好达标</span>`;
  },

  setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  }
};

// ===== 默认餐次推断 =====
function getDefaultMealType() {
  const h = new Date().getHours();
  if (h >= 6 && h < 10) return 'breakfast';
  if (h >= 10 && h < 14) return 'lunch';
  return 'dinner';
}

const MEAL_NAMES = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
