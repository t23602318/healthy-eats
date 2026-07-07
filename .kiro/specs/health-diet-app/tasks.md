# Implementation Plan: HealthyEats Health Diet App

## Overview

The app is a zero-dependency mobile H5 application already scaffolded with five HTML pages, two JS modules, one CSS file, and a test runner. Tasks are ordered so that shared infrastructure and calculation logic are verified first, then each page is completed and validated, finishing with end-to-end testing. All source files exist; tasks describe the precise work needed to bring each file to its full specified state.

## Tasks

- [x] 1. Implement Device & Storage modules in app.js
  - Implement `Device.getId()` — generate UUID via `crypto.randomUUID()` with fallback `"dev_" + Date.now() + "_" + random`, persist to `localStorage` key `"device_id"`, cache in `_id` after first read
  - Implement `Storage._key()` — prepend `{DeviceID}_` to every key
  - Implement `Storage.get()` — safe JSON parse, on failure delete the corrupt key and return `defaultVal`
  - Implement `Storage.set()` and `Storage.remove()`
  - **Requirements:** 1.1, 6.1, 6.2, 6.3
  - **Design refs:** Device component, Storage component, Correctness Properties 1–3

- [x] 2. Implement Profile nutrition calculation engine in app.js
  - Implement `Profile.calcBMR()` using Mifflin-St Jeor formula for male and female
  - Implement `Profile.calcTDEE()` with five activity factors (1.2 / 1.375 / 1.55 / 1.725 / 1.9), result rounded to integer
  - Implement `Profile.calcMacroTargets()` with goal-specific macro ratios (maintain 50/20/30, lose 40/30/30, gain 50/25/25), gram values rounded to integer
  - Implement `Profile.calcMealTargets()` distributing daily targets across breakfast 30% / lunch 40% / dinner 30%
  - Implement `Profile.calcBMI()` to one decimal and `Profile.getBMILabel()` with thresholds 18.5 / 24 / 28
  - Implement `Profile.get()` and `Profile.save()` using `Storage` key `health_profile`
  - **Requirements:** 2.1, 2.2, 2.3
  - **Design refs:** Profile component, Key Algorithms — Calorie Difference Display, Correctness Property 7

- [x] 3. Implement IntakeCalc module in app.js
  - Implement `IntakeCalc.calcActual()` — clamp percent to [1, 100], `actualCalories = Math.round(estimated.calories × p/100)`, macros rounded to one decimal place
  - **Requirements:** 3.5
  - **Design refs:** IntakeCalc component, Correctness Property 4

- [x] 4. Implement DietLog CRUD and aggregation in app.js
  - Implement `DietLog.addRecord()` — stamp `id = Date.now()` and `deviceId = Device.getId()`, append to date array in Storage key `diet_log_{date}`
  - Implement `DietLog.removeRecord()` — filter by id, write array back
  - Implement `DietLog.getByDate()` and `DietLog.getByMeal()`
  - Implement `DietLog.getDayActualTotals()` — sum `actualCalories` and all `actualNutrition` fields; calories to integer, macros to one decimal
  - Implement `DietLog.getMealActualTotals()` — same aggregation filtered to one mealType
  - Implement `DietLog.getCalorieDiff()` — `tdee − getDayActualTotals(date).calories`
  - **Requirements:** 4.2, 4.3, 4.4, 4.5, 6.4
  - **Design refs:** DietLog component, Correctness Properties 5, 6, 8

- [x] 5. Implement MealAdvisor module in app.js
  - Implement `MealAdvisor.evaluate()` — ratio < 0.8 → "low", > 1.2 → "high", else "ok"
  - Implement `MealAdvisor.generateAdvice()` — iterate calories/carbs/protein/fat, build `AdviceItem[]` with gap amount and ≥2 food suggestions per nutrient; return single "营养均衡" item when all nutrients are "ok"
  - **Requirements:** 5.2, 5.3, 5.4
  - **Design refs:** MealAdvisor component

- [x] 6. Implement CozeAPI module in coze.js
  - Implement `CozeAPI.recognizeFood()` — POST to Coze v3 chat endpoint, 30-second `AbortController` timeout, throw `"识别超时，请重试"` on abort
  - Implement `CozeAPI._parse()` — extract first JSON object matching `/{[\s\S]*}/`, throw `"NO_FOOD"` when `foods` array is empty or missing
  - Implement `CozeAPI.mockRecognize()` — return one of three sample meals (rice+spinach, KFC set, chicken+broccoli+brown-rice) at random
  - Implement `CozeAPI.compressImage()` — validate MIME type against allowed list and size ≤ 10 MB, read as base64 data URL via `FileReader`
  - Implement `CozeAPI.makeThumbnail()` — draw image onto 150×150 canvas, export as JPEG at 0.7 quality
  - **Requirements:** 3.1, 3.2, 3.3, 3.8, 3.9
  - **Design refs:** CozeAPI component, Error Handling table

- [x] 7. Build profile.html — personal profile page
  - Add viewport meta, stylesheet and script includes, bottom-nav with `profile` active state
  - Build edit form: gender select, age, height, weight, bodyFat (optional), activity select, goal select; all inputs `min-height: 44px`
  - Implement `validate()` — required field presence check, range checks (age 1–120, height 50–250, weight 10–500, bodyFat 0–70 if provided); show red `.form-error` below failing field, block save
  - Implement `saveProfile()` — `validate()` → `Profile.save()` → `renderStats()` → `UI.showToast("保存成功！")`
  - Implement `loadForm()` — call `Profile.get()` on page load; if profile exists fill all fields and call `renderStats()`; if null show blank form
  - Implement `renderStats()` — show stats panel: BMI gradient bar with indicator at `(bmi−10)/25×100%`, TDEE card, 3-cell stat grid (BMI / TDEE / daily protein)
  - Build Coze API config section — API Key and Bot ID inputs, save via `AppConfig.save()`; load values on page load via `AppConfig.get()`
  - Build device info panel displaying `Device.getId()`
  - **Requirements:** 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
  - **Design refs:** profile.html page design

- [x] 8. Build index.html — home page with calorie overview and meal cards
  - Add viewport meta, includes, bottom-nav with `home` active state; header title "HealthyEats" + 👤 link to `profile.html`
  - Build "今日热量总览" gradient card — three cells: 最多可摄入 (TDEE) / 已摄入 / 还可摄入; apply `.over` class and red colour when remain is negative
  - Add progress bar inside calorie card: fill = `min(100, actual/tdee×100)%`
  - Build macro overview rows (carbs / protein / fat) inside calorie card, each showing target, actual, remain
  - Build three meal cards (breakfast / lunch / dinner) — meal name, actual/target calories, one calories progress bar + three macro progress bars coloured by `UI.progressColor()`, "去拍一拍" button linking to `camera.html?meal={mealType}`
  - Show empty-state text per meal card when no records for that meal
  - Show `#no-profile-tip` card with link to `profile.html` when `Profile.get()` returns null
  - Implement `render()` — compute all values and rebuild DOM; call on page load and on `document.visibilitychange` when page becomes visible
  - **Requirements:** 2.1, 2.2, 2.4, 5.1, 5.5, 8.1
  - **Design refs:** index.html page design, Calorie Difference Display algorithm

- [x] 9. Build camera.html — photo capture, recognition, and record-saving page
  - Add viewport meta, includes, bottom-nav with `camera` active state
  - Wire hidden `<input type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" capture="environment">` to "拍照/选图" button
  - On file change: call `CozeAPI.compressImage()`, on success show preview image and enable "确认识别" button, on error show toast
  - Implement `doRecognize()` — show loading overlay, disable button, call `CozeAPI.recognizeFood()` or `CozeAPI.mockRecognize()`, call `renderResult()` on success; handle "NO_FOOD" with specific message; handle other errors with retry toast; always re-enable button and hide loading
  - Implement `renderResult()` — populate food list table (name, amount, calories per item), nutrition grid (estimated totals for 5 nutrients), hide camera-actions, show result-area
  - Build percent slider + numeric input synced bidirectionally; clamp to [1, 100]; on every change call `IntakeCalc.calcActual()` and update actual calories and macro display
  - Build meal selector (early/lunch/dinner buttons); pre-select from `?meal=` URL param or `getDefaultMealType()`; highlight active button with `btn-primary`
  - Implement `saveRecord()` — build `DietRecord` with all required fields including `imagePreview` from `CozeAPI.makeThumbnail()`; call `DietLog.addRecord()`; show toast; redirect to `index.html` after 1.2 s
  - Implement `resetPage()` — clear image state, re-show camera controls, hide result area, disable confirm button
  - **Requirements:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
  - **Design refs:** camera.html state machine, CozeAPI, IntakeCalc

- [x] 10. Build records.html — tabbed day/week record viewer with delete
  - Add viewport meta, includes, bottom-nav with `records` active state
  - Build tab bar (📅 按日查看 / 📆 按周汇总) with `switchTab()` toggling active class and day-nav visibility
  - Build day-view date navigation — prev/next buttons; disable next when `currentDate >= DateUtil.today()`; display label via `DateUtil.format()` + `DateUtil.formatDisplay()`
  - Implement `renderDay()` — day header (date, record count, total actual calories, TDEE, diff coloured green/red), records sorted descending by `timestamp`, empty state if none
  - Implement `renderRecord()` helper — record card: thumbnail, food name summary truncated at 18 chars, meal tag, estimated cal / percent / actual cal, time, 🗑 delete button
  - Implement `renderWeek()` — call `DateUtil.getWeekDates()`, reverse, one collapsible `.week-row` per day (date, count, actual cal, TDEE, diff); `toggleWeekRow()` show/hide detail with same record cards
  - Implement delete flow — `askDelete()` shows bottom-sheet modal; `confirmDelete()` calls `DietLog.removeRecord()`, closes modal, `setTimeout(render, 50)`, `UI.showToast("记录已删除")`
  - **Requirements:** 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
  - **Design refs:** records.html page design

- [x] 11. Build advice.html — full-day comparison and advice page
  - Add viewport meta, includes, bottom-nav with `advice` active state
  - Implement `render()` — if no profile show empty state with link; otherwise compute `Profile.calcMacroTargets()` and `DietLog.getDayActualTotals(today)` and render all sections
  - Implement `renderCompare()` helper — one row per nutrient: progress bar coloured by `UI.progressColor()`, "actual/target unit · pct%" label, status emoji
  - Generate and display summary sentence in highlighted box (green for remainder, red for overrun, balanced otherwise)
  - Build advice list from `MealAdvisor.generateAdvice()` — each `AdviceItem` rendered as icon + bold title + description
  - Build per-meal breakdown — meal icon + name, actual vs. target calories, food names from records or "暂无记录" prompt
  - Call `render()` on load and on `visibilitychange`
  - **Requirements:** 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
  - **Design refs:** advice.html page design, MealAdvisor

- [x] 12. Build tests/test.html — in-browser automated test suite
  - Implement test framework inline — `describe()`, `it()`, `expect()` with matchers: `toBe`, `toBeCloseTo`, `toBeGreaterThan`, `toBeLessThan`, `toBeGreaterThanOrEqual`, `toBeTruthy`, `toBeFalsy`, `not.toBe`
  - Create in-memory sandbox — `Device` with fixed test ID `"test_device_001"`, `Storage` backed by plain `_memStore` object, copies of `Profile`, `DietLog`, `IntakeCalc`
  - Write BMR suite — male formula expected ≈ 1673.75, female ≈ 1270.25, result > 0
  - Write TDEE suite — moderate ×1.55, light ×1.375, sedentary ×1.2, very_active ×1.9
  - Write macro targets suite — carbs=TDEE×50%÷4, protein=TDEE×20%÷4, lose-mode protein > maintain-mode
  - Write meal distribution suite — sum within ±3 kcal, lunch > breakfast, breakfast === dinner
  - Write IntakeCalc suite — 100%=estimated, 50%=half, boundary 1%, clamp >100%, clamp ≤0%, carbs 1dp
  - Write calorie diff suite — no records → diff=TDEE, partial record reduces diff, overshoot → negative
  - Write DietLog accumulation suite — two same-meal records sum correctly, cross-meal day total, post-delete total
  - Write DeviceID and isolation suite — ID exists and is string, key has prefix, different device sees null, corrupt data returns default
  - Write BMI suite — ≈22 for 63.6 kg / 170 cm, >24 for 80 kg / 170 cm
  - Render results page — per-suite pass count header, per-case ✅/❌ row with expected/actual on failure, top banner "✅ 全部 N 项测试通过" or "❌ X项测试失败 / 共 N 项"
  - **Requirements:** 7.1, 7.2, 7.3, 7.4, 7.5
  - **Design refs:** Testing Strategy section

- [x] 13. End-to-end validation and bug fixes
  - Open `tests/test.html` in a browser; confirm "✅ 全部 32 项测试通过"; fix any failing test by correcting the logic in `app.js`, not the assertions
  - Verify `profile.html` — save valid data, reload, confirm data persists; try invalid inputs, confirm inline errors and no save
  - Verify `index.html` — calorie card and macro rows update after adding a record; "去拍一拍" navigates with correct `?meal=` param; no-profile state shows prompt
  - Verify `camera.html` — demo mode works without API key; percent slider and input stay in sync; saving creates a record and redirects
  - Verify `records.html` — day-view diff coloured correctly; week-view collapses and expands; delete removes record and refreshes totals within 300 ms
  - Verify `advice.html` — progress bars coloured correctly; advice items appear for under/over nutrients; per-meal breakdown matches records
  - Confirm DeviceID isolation — private window generates separate ID, sees no records from main window
  - Confirm no horizontal scroll on a 375 px viewport across all five pages
  - Confirm all interactive elements have touch targets ≥ 44×44 px
  - Confirm "HealthyEats" title appears on all pages
  - **Requirements:** 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
  - **Design refs:** Error Handling table, Correctness Properties 1–8

## Task Dependencies

```yaml
1: []
2: [1]
3: [1]
4: [1]
5: [1]
6: [1]
7: [1, 2]
8: [1, 2, 3, 4, 5]
9: [1, 2, 3, 4, 6]
10: [1, 2, 4]
11: [1, 2, 4, 5]
12: [1, 2, 3, 4]
13: [7, 8, 9, 10, 11, 12]
```

## Notes

- All source files already exist in the workspace. Each task describes the specific functions and behaviours that must be present and correct, not file creation.
- Tasks 1–6 can be worked on independently of the HTML pages since `app.js` and `coze.js` have no DOM dependencies.
- Demo mode (Task 6 `mockRecognize`) must always work without any API credentials so the app is testable offline.
- The test sandbox (Task 12) uses an in-memory `_memStore` object rather than real `localStorage` so tests are deterministic and isolated across runs.
- Numeric precision rules: calorie values are always integers (`Math.round`); gram values for macros are always one decimal place (`Math.round(x * 10) / 10`).
