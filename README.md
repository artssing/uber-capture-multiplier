# 搶單助手 — Android 自動搶單輔助工具

純 Native Android (Kotlin + XML) 應用程式，利用 Android **無障礙服務 (Accessibility Service)** 監控高德/AutoNavi 司機 App 的訂單彈窗，並依照你設定的規則自動點擊「接單」按鈕。

---

## 目錄

1. [工作原理](#工作原理)
2. [系統需求](#系統需求)
3. [編譯與安裝](#編譯與安裝)
4. [首次設定流程](#首次設定流程)
5. [搶單規則說明](#搶單規則說明)
6. [介面說明](#介面說明)
7. [支援的司機 App](#支援的司機-app)
8. [新增自訂司機 App](#新增自訂司機-app)
9. [技術架構](#技術架構)
10. [常見問題](#常見問題)
11. [注意事項與免責聲明](#注意事項與免責聲明)

---

## 工作原理

```
高德司機 App 彈出訂單
        │
        ▼
Android 無障礙服務 (OrderAccessibilityService)
  ├─ 掃描當前視窗的 UI 樹 (Accessibility Node Tree)
  ├─ 找到「接單」按鈕 → 確認是訂單彈窗
  ├─ 解析文字：車費 / 行程距離 / 接客距離 / 地址
  ├─ 震動提示司機
  ├─ 通知主介面顯示訂單卡片 (透過 LiveData)
  └─ 若「自動搶單」開啟且符合所有規則
       └─ 延遲 N 毫秒後點擊「接單」按鈕
            ├─ 方法一：performAction(ACTION_CLICK)   ← 優先
            └─ 方法二：GestureDescription 模擬手勢  ← 備用
```

整個流程不需要 Root、不需要修改系統，完全依靠 Android 官方的無障礙 API 實現。

---

## 系統需求

| 項目 | 要求 |
|------|------|
| Android 版本 | 6.0 (API 23) 或以上 |
| 建議版本 | Android 10+ (API 29+)，手勢備用方案更穩定 |
| 架構 | ARM64 / ARMv7 / x86_64 |
| 高德司機 App | 任何版本均可嘗試（見[常見問題](#常見問題)） |
| 開發環境 (如需自行編譯) | Android Studio Hedgehog 以上 / JDK 17 |

> **iOS 不支援**：Apple 的沙盒機制禁止第三方 App 透過無障礙 API 自動化其他 App，因此本工具僅適用於 Android。

---

## 編譯與安裝

### 方法一：使用 Android Studio（推薦）

1. 克隆此倉庫：
   ```bash
   git clone <repo_url>
   cd uber-capture-multiplier/android
   ```

2. 用 Android Studio 開啟 `android/` 資料夾（選「Open」→ 選 `android` 目錄）

3. 等待 Gradle Sync 完成

4. 連接 Android 手機（開啟 USB 偵錯）或啟動模擬器

5. 點擊「▶ Run」或按 `Shift+F10`

### 方法二：命令列編譯

```bash
cd uber-capture-multiplier/android

# Debug 版（開發測試用）
./gradlew assembleDebug

# Release 版（需自行簽名）
./gradlew assembleRelease
```

APK 輸出位置：
```
android/app/build/outputs/apk/debug/app-debug.apk
android/app/build/outputs/apk/release/app-release-unsigned.apk
```

### 透過 ADB 安裝到手機

```bash
# 確保手機已開啟 USB 偵錯
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 首次設定流程

安裝完成後，**按照以下順序設定**，缺一不可：

### 步驟 1：授予無障礙服務權限

這是最重要的一步，沒有此權限 App 完全無法工作。

1. 打開「**搶單助手**」App
2. 主頁會顯示橙色警告「需要以下權限」
3. 點擊「**無障礙服務**」旁的「**開啟**」按鈕
4. 手機會跳轉到系統的「**無障礙 / 輔助功能**」設定頁
5. 找到「**搶單助手**」，點進去開啟服務
6. 系統彈窗詢問「允許此服務監控您的螢幕內容？」→ 點「**確定**」
7. 按返回鍵回到「搶單助手」App

> **找不到「搶單助手」？**  
> 不同手機品牌路徑不同：
> - **三星**：設定 → 協助工具 → 已安裝的服務
> - **華為/EMUI**：設定 → 輔助功能 → 無障礙 → 服務
> - **小米/MIUI**：設定 → 無障礙 → 無障礙應用
> - **OPPO/ColorOS**：設定 → 協助工具 → 無障礙功能 → 協助工具
> - **原生 Android**：設定 → 無障礙 → 已下載的應用

### 步驟 2：授予懸浮視窗權限（可選）

如需在高德 App 上方顯示訂單資訊浮層，需要此權限。

1. 點擊「**懸浮視窗**」旁的「**開啟**」按鈕
2. 在「可在其他應用上層顯示」清單中找到「搶單助手」
3. 開啟開關

### 步驟 3：確認服務狀態

返回主頁後，頂部狀態標記應顯示：

```
⚡ 搶單助手   ● 監控中   [🤖 手動模式]  ⚙
```

綠色「**監控中**」表示服務已成功啟動。

### 步驟 4：設定搶單規則

點擊右上角「**⚙**」進入規則設定頁面，根據自身需求填寫（詳見下節）。

### 步驟 5：開啟自動搶單

點擊頂部「**手動模式**」按鈕，切換為「**自動搶單**」（按鈕變藍色）。

### 步驟 6：切到高德司機 App

切換到高德司機 App，正常等待接單。當有新訂單彈出時，「搶單助手」將在背景自動處理。

---

## 搶單規則說明

在「⚙ 設定」頁面可配置以下規則，**所有條件必須同時滿足才會接單**。留空或填 0 表示該條件不限制。

### 車費條件

| 欄位 | 說明 | 範例 |
|------|------|------|
| 最低車費 (HK$) | 訂單車費低於此值則拒絕。留空不限。 | `60` → 低於 HK$60 的單不接 |
| 最低每公里車費 (HK$/km) | 車費÷行程距離的比值低於此值則拒絕。 | `8` → 每公里低於 HK$8 不接 |

> **計算範例**：車費 HK$80，行程 8km → 每公里 HK$10，高於設定的 HK$8 ✓

### 距離條件

| 欄位 | 說明 | 範例 |
|------|------|------|
| 最遠接客距離 (km) | 從你當前位置到接客點的距離。超過則拒絕。 | `3` → 超過 3km 不去接 |
| 最短行程距離 (km) | 整個行程（接客點到目的地）的距離。低於則拒絕。 | `2` → 行程不足 2km 不接 |

### 地區過濾

多個地區以**英文逗號**分隔，支援中文關鍵字。

| 欄位 | 說明 | 範例 |
|------|------|------|
| 黑名單地區 | 出發地或目的地包含這些關鍵字則**拒絕** | `元朗,天水圍,屯門,落馬洲` |
| 白名單地區 | 只接出發地或目的地包含這些關鍵字的訂單。留空不限。 | `中環,灣仔,銅鑼灣,尖沙咀` |

> **黑白名單同時設定時**：先檢查黑名單（命中即拒絕），再檢查白名單（不在白名單內則拒絕）。

### 自動搶單設定

| 欄位 | 說明 | 建議值 |
|------|------|--------|
| 搶單延遲 (毫秒) | 偵測到訂單後等待多少毫秒才點擊接單 | `800` ~ `1200` |

**為什麼需要延遲？**
- 太快（< 500ms）：部分 App 有防自動化偵測，可能無效
- 太慢（> 2000ms）：訂單可能被其他司機搶走
- **推薦 800ms**：反應快但不容易被偵測

### 規則判斷流程圖

```
收到新訂單
    │
    ├─ 自動搶單已關閉？→ 只顯示訂單卡片，不接單
    │
    ├─ 車費 < 最低車費？→ 拒絕
    ├─ 接客距離 > 最遠接客距離？→ 拒絕  
    ├─ 行程距離 < 最短行程距離？→ 拒絕
    ├─ 每公里車費 < 最低每公里車費？→ 拒絕
    ├─ 地址包含黑名單關鍵字？→ 拒絕
    ├─ 白名單非空 且 地址不含白名單關鍵字？→ 拒絕
    │
    └─ 全部通過 → 等待 N ms → 自動點擊「接單」
```

---

## 介面說明

### 主頁（儀表板）

```
┌─────────────────────────────────────────┐
│ ⚡ 搶單助手  ● 監控中  [🤖 自動搶單] ⚙│
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ ⚡ 已自動接單！                     │ │  ← 訂單卡片（有單時顯示）
│ │ HK$85.0  8.3km  接客1.2km          │ │
│ │ HK$10.2/km                          │ │
│ │ ○ 接客：銅鑼灣駱克道 123 號         │ │
│ │ ● 目的地：沙田大圍道 456 號         │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 當前搶單規則                   編輯 │ │  ← 規則摘要卡
│ │ [最低 HK$60] [接客≤3km] [≥8/km]   │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │  👁 偵測  ⚡ 自動接  ⏱ 延遲        │ │  ← 快速統計
│ │     5        3       800ms          │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│         [🏠 主頁]    [📋 記錄]         │
└─────────────────────────────────────────┘
```

**頂部狀態說明：**

| 狀態 | 顏色 | 含義 |
|------|------|------|
| ● 監控中 | 綠色 | 無障礙服務運行中，正在監控司機 App |
| ● 未開啟 | 紅色 | 無障礙服務未啟動，需前往設定開啟 |
| 🤖 自動搶單 | 藍色 | 符合規則時自動接單 |
| 手動模式 | 灰色 | 只顯示訂單資訊，不自動接單 |

**訂單卡片說明：**

| 元素 | 含義 |
|------|------|
| 藍色邊框 | 新偵測到的訂單，尚未處理 |
| 綠色邊框 | 已成功自動接單 |
| HK$XX.X | 訂單車費 |
| X.Xkm | 行程距離（接客點→目的地） |
| 接客 X.Xkm | 從你現在位置到接客點的距離 |
| HK$X/km | 每公里車費（計算值） |

### 記錄頁

```
┌─────────────────────────────────────────┐
│  5偵測   3自動接   60%接單率  HK$255收入│  ← 統計列
├─────────────────────────────────────────┤
│ ⚡ HK$85.0  8.3km  銅鑼灣...  14:23    │
│    自動接單                             │
├─────────────────────────────────────────┤
│ ⚡ HK$72.0  6.1km  尖沙咀...  13:45    │
│    自動接單                             │
├─────────────────────────────────────────┤
│ ⏱ HK$45.0  3.2km  元朗...    13:12    │
│    已錯過                               │
├─────────────────────────────────────────┤
│           [清除所有記錄]                │
└─────────────────────────────────────────┘
```

**訂單狀態圖示：**

| 圖示 | 顏色 | 狀態 |
|------|------|------|
| ⚡ (閃電) | 綠色 | 自動接單成功 |
| ✓ (勾) | 藍色 | 手動接單 |
| ✕ (叉) | 紅色 | 已拒絕 |
| ⏱ (時鐘) | 灰色 | 已錯過（沒有及時處理） |

### 設定頁

點擊主頁右上角「⚙」進入。設定頁分為：

1. **車費條件** — 最低車費、最低每公里車費
2. **距離條件** — 最遠接客距離、最短行程距離
3. **地區過濾** — 黑名單、白名單（逗號分隔）
4. **自動搶單設定** — 搶單延遲毫秒數
5. **監控目標 App 套件名** — 可新增或移除要監控的 App

---

## 支援的司機 App

預設監控以下套件名，App 已安裝時自動生效：

| 平台 | App 名稱 | 套件名 |
|------|----------|--------|
| 高德 / AutoNavi | 高德打車司機版 | `com.autonavi.amap.driver` |
| 高德 (備用) | 高德地圖司機版 | `com.amap.android.driver` |

其他平台可手動新增（見下節）。

---

## 新增自訂司機 App

如果你使用的司機 App 不在預設清單中：

### 方法一：在 App 內新增

1. 進入「⚙ 設定」
2. 滾動到「**監控目標 App 套件名**」區域
3. 在輸入框填入套件名
4. 點擊「+」按鈕新增

### 方法二：查找套件名

**透過 ADB（需連接電腦）：**
```bash
# 先打開目標司機 App，然後執行：
adb shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'

# 輸出範例：
# mCurrentFocus=Window{... com.autonavi.amap.driver/...}
```

**透過 App 市場：**
- 在 Google Play 或手機應用商店搜尋該 App
- 網址中的 `id=` 後面的字串就是套件名
- 例：`https://play.google.com/store/apps/details?id=com.didi.driver`

### 不同平台的套件名參考

| 平台 | 常見套件名 |
|------|-----------|
| 滴滴司機 | `com.didi.driver` |
| Uber 司機 | `com.ubercab.driver` |
| Grab 司機 | `com.grabtaxi.driver2` |
| 的士通司機 | （需自行查找） |

> **注意**：套件名必須完全正確（區分大小寫）。不同地區/版本的 App 套件名可能不同。

---

## 技術架構

### 整體架構

```
MVVM + Repository Pattern + 無障礙服務
```

### 文件結構

```
android/
├── app/
│   ├── build.gradle                    ← AGP 8.1, minSdk 23, ViewBinding
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── kotlin/com/example/uber_surge_map_hk/
│       │   ├── OrderAssistApp.kt       ← Application，初始化 Repository
│       │   ├── MainActivity.kt         ← 主 Activity，LiveData 觀察者
│       │   ├── SettingsActivity.kt     ← 規則設定 Activity
│       │   ├── BootReceiver.kt         ← 開機廣播接收器
│       │   ├── model/
│       │   │   ├── OrderModel.kt       ← 訂單資料類 + OrderResult 枚舉
│       │   │   └── FilterRules.kt      ← 過濾規則類 + passes() 方法
│       │   ├── repository/
│       │   │   └── OrderRepository.kt  ← 單例，持有所有 MutableLiveData
│       │   ├── viewmodel/
│       │   │   └── OrderViewModel.kt   ← AndroidViewModel，暴露 LiveData
│       │   ├── service/
│       │   │   └── OrderAccessibilityService.kt ← 核心搶單引擎
│       │   └── adapter/
│       │       └── OrderHistoryAdapter.kt ← RecyclerView ListAdapter+DiffUtil
│       └── res/
│           ├── layout/                 ← 10 個 XML 佈局
│           ├── drawable/               ← 30+ 向量圖標 + 形狀背景
│           ├── values/                 ← colors, strings, themes
│           ├── menu/                   ← 底部導航選單
│           ├── color/                  ← 導航欄顏色狀態清單
│           └── xml/                    ← 無障礙服務配置
├── build.gradle
├── settings.gradle                     ← 純 Android，已移除 Flutter 依賴
└── gradle.properties
```

### 依賴函式庫

| 庫 | 版本 | 用途 |
|----|------|------|
| `androidx.appcompat` | 1.7.0 | Activity/AppCompat |
| `material` | 1.12.0 | Material Design 3 (Chip, TextInput, Button) |
| `constraintlayout` | 2.1.4 | 主佈局 |
| `lifecycle-viewmodel-ktx` | 2.8.6 | ViewModel |
| `lifecycle-livedata-ktx` | 2.8.6 | LiveData |
| `recyclerview` | 1.3.2 | 訂單記錄列表 |
| `core-ktx` | 1.13.1 | Kotlin 擴展 |
| `gson` | 2.10.1 | OrderModel 序列化 |

### 核心：OrderAccessibilityService 工作流程

```kotlin
onAccessibilityEvent(event)
    └─ 過濾非目標 App 的事件
    └─ TYPE_WINDOW_STATE_CHANGED / TYPE_WINDOW_CONTENT_CHANGED
        └─ scanForOrder()
            ├─ 找「接單」按鈕（ACCEPT_BUTTON_TEXTS 列表比對）
            ├─ collectTexts() — 遞迴遍歷 UI 樹收集所有文字
            ├─ parseFare()          — 正則提取車費（支援 HK$, ¥, 港幣, 元）
            ├─ parseTripDistance()  — 正則提取行程距離
            ├─ parsePickupDistance()— 正則提取接客距離（支援 km/米）
            ├─ parseAddresses()     — 從關鍵字定位出發地/目的地
            ├─ 去重（同訂單不重複觸發）
            ├─ 震動提示
            ├─ OrderRepository.onOrderDetected() → LiveData 更新 UI
            └─ FilterRules.passes() 通過？
                └─ 延遲 N ms
                    └─ performAccept()
                        ├─ ACTION_CLICK（直接點擊）
                        └─ GestureDescription（手勢備用）
```

### 資料流

```
OrderAccessibilityService
        │  postValue()
        ▼
  OrderRepository (Singleton LiveData)
        │  observe()
        ▼
  OrderViewModel
        │  observe()
        ▼
  MainActivity / SettingsActivity (UI 更新)
```

### 使用的 Android 權限

| 權限 | 用途 | 類型 |
|------|------|------|
| `BIND_ACCESSIBILITY_SERVICE` | 運行無障礙服務 | 系統（需用戶手動授予） |
| `SYSTEM_ALERT_WINDOW` | 在其他 App 上方顯示浮層 | 危險（需用戶手動授予） |
| `VIBRATE` | 收到新訂單時震動提示 | 普通 |
| `WAKE_LOCK` | 防止服務被系統休眠 | 普通 |
| `FOREGROUND_SERVICE` | 後台服務保活 | 普通 |
| `RECEIVE_BOOT_COMPLETED` | 開機後廣播（提示重新啟動） | 普通 |
| `INTERNET` | 備用（未來網路功能） | 普通 |

---

## 常見問題

### Q1：開啟無障礙服務後，App 說「未開啟」？

**解決方法：**
1. 確認在系統設定中找到「搶單助手」並且開關是開啟的
2. 強制關閉「搶單助手」App 後重新打開
3. 部分手機（如 MIUI、EMUI）需要額外授予「後台彈窗」權限

### Q2：高德 App 彈單了，但搶單助手沒有反應？

**可能原因：**

1. **套件名不對** — 進入設定確認「監控目標 App 套件名」中包含你安裝的高德 App 套件名
   ```bash
   # 用 ADB 查找套件名：
   adb shell pm list packages | grep amap
   adb shell pm list packages | grep gaode
   ```

2. **UI 結構不同** — 不同版本的高德 App，「接單」按鈕的文字或位置可能不同。可以嘗試在設定中確認後，查看 App 日誌：
   ```bash
   adb logcat -s OrderAssist
   ```

3. **後台被殺** — 部分手機品牌會積極殺後台。需要：
   - 將「搶單助手」加入電池白名單（不優化電池）
   - 鎖定「搶單助手」（在最近任務列表長按鎖定）

4. **無障礙服務被系統關閉** — 重啟手機後無障礙服務可能需要手動重新開啟

### Q3：自動搶單成功，但高德 App 沒有反應（訂單沒有真的接）？

**可能原因：**
- 按鈕的可點擊區域偵測失敗，備用的 GestureDescription 座標計算錯誤
- 高德 App 更新後 UI 結構改變

**解決方法：**
- 稍微增加延遲時間（試試 1200ms）
- 查看 ADB 日誌確認點擊是否執行：
  ```bash
  adb logcat -s OrderAssist | grep "Accept performed"
  ```

### Q4：高德 App 的訂單資訊顯示不完整（車費是 0，地址是空白）？

無障礙服務通過解析 UI 文字提取資訊，部分版本的高德 App 可能使用了：
- 圖片而非文字顯示數字
- 混淆的 View ID
- 不標準的文字格式

這種情況下搶單功能仍然有效（能找到「接單」按鈕就能搶），只是資訊顯示不完整。

### Q5：手機重啟後服務消失了？

Android 系統會在重啟後關閉所有無障礙服務，這是系統設計。

需要手動重新開啟：設定 → 無障礙 → 搶單助手 → 開啟

> 部分 Android 版本允許無障礙服務在重啟後自動恢復，但不能保證。

### Q6：如何確認服務是否真的在運行？

```bash
# 方法一：ADB 日誌
adb logcat -s OrderAssist

# 方法二：查看無障礙服務狀態
adb shell settings get secure enabled_accessibility_services
# 輸出應包含 com.example.uber_surge_map_hk/...OrderAccessibilityService

# 方法三：App 主頁頂部狀態
# 綠色「監控中」= 服務運行中
```

### Q7：需要 Root 嗎？

**不需要 Root。** 本 App 完全使用 Android 官方的無障礙服務 API，任何未 Root 的 Android 設備都可以使用。

---

## 注意事項與免責聲明

### 使用前請閱讀

1. **僅供個人使用**：本工具僅為個人輔助工具，請勿用於大規模商業目的或傷害其他司機的公平競爭環境。

2. **可能違反平台條款**：自動化接單可能違反高德打車、滴滴等平台的用戶服務條款。使用前請自行評估風險，作者不對帳號被封禁或其他後果負責。

3. **行車安全第一**：此工具設計用於司機等待接單期間（車輛靜止時）。行駛中切勿操作手機，請遵守香港道路交通條例。

4. **資料安全**：本 App 不收集、不上傳任何個人資料或訂單資訊。所有資料僅存儲在本地設備的 SharedPreferences 中。

5. **無保固**：本軟體按「現狀」提供，不保證在所有設備和 App 版本上正常工作。高德 App 更新後可能需要相應調整。

### 免責聲明

本工具作者不對以下情況承擔任何責任：
- 司機帳號被平台封禁或處罰
- 因使用本工具導致的任何直接或間接損失
- 高德 App 或其他司機 App 的 UI 更新導致功能失效
- 設備安全性問題（授予無障礙服務權限會降低設備安全性，請謹慎）

---

## 開發相關

### 在 ADB 查看實時日誌

```bash
# 只看搶單助手的日誌
adb logcat -s OrderAssist

# 典型日誌輸出：
# D/OrderAssist: Service connected
# D/OrderAssist: Order detected: HK$85.0, trip=8.3km, pickup=1.2km
# D/OrderAssist: Auto-accept criteria passed!
# D/OrderAssist: Accept performed (direct=true)
```

### 修改支援的接單按鈕文字

如需支援其他語言的司機 App（如英文介面），修改 `OrderAccessibilityService.kt`：

```kotlin
val ACCEPT_BUTTON_TEXTS = listOf(
    "接單", "搶單", "接受", "確認接單", "立即接單",  // 中文
    "Accept", "ACCEPT",                               // 英文
    "Terima",                                         // 馬來文（Grab 等）
    // 在此新增其他語言的接單按鈕文字
)
```

### 修改訂單關鍵字偵測

```kotlin
val ORDER_INDICATORS = listOf(
    "新訂單", "出發地", "目的地", "行程費用",
    // 新增其他訂單指示字詞
)
```

---

*本工具以 Android Accessibility Service API 為基礎開發，技術原理與螢幕閱讀器（如 TalkBack）相同。*
