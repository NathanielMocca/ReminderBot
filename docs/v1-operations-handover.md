//# Discord Reminder Bot v1 操作交接文件

本文件整理本次從零建置到雲端部署的實際操作，並提供初版上線前收尾清單。

## 1. 專案實作完成項目

### 1.1 Monorepo 與模組分離

- Root workspace 建立完成（`apps/*` + `packages/*`）。
- 模組分工已落地：
  - `apps/bot`: Discord Slash Commands 與互動回覆
  - `apps/server`: API、排程 worker、清理 job、Firestore transaction
  - `packages/shared`: 型別、驗證、時間與 bucket 工具

### 1.2 功能面實作

- Slash command：`/reminder create|list|update|delete`
- 5 分鐘刻度驗證：`mm % 5 == 0`
- 排程型態：`daily`、`weekday`
- `@身份組` 提及支援（`allowed_mentions.roles`）
- 3 秒回應保護：指令入口先 `deferReply({ ephemeral: true })`
- 時區標準化：建立/更新提醒時轉為 UTC due bucket
- 冪等發送：`dispatch_logs/{yyyyMMddHHmm}_{reminderId}`
- 清理策略：`dispatch_logs` 保留 7 天，定時刪除

### 1.3 方案與限流策略

- 每 Guild 免費上限：`4`
- 全域免費池上限：`X = 10000`
- 告警門檻：`8500`、`9500`
- 硬鎖：`>= 10000`
- 解鎖防抖：`<= 9800`

## 2. 文件產出清單

已建立以下文件：

- `docs/architecture.md`
- `docs/bot-design.md`
- `docs/server-design.md`
- `docs/traffic-estimation.md`
- `infra/gcp-e2-free-checklist.md`

## 3. 部署與基礎設施操作紀錄

### 3.1 Git 初始化

- 已執行：`git init`

### 3.2 GCP 建置

- 專案：`remiderbot-3c1b0`
- VM：`reminder-bot-vm`
- 區域/可用區：`us-west1-a`
- 機型：`e2-micro`
- OS 映像：`debian-12`

### 3.3 VM 內執行環境

- 已安裝 Node.js 20
- 已安裝 PM2
- 已完成程式上傳、`npm install`、`npm run build`
- PM2 常駐程序：
  - `reminder-server`
  - `reminder-bot`
- 健康檢查確認：
  - `curl http://localhost:8080/healthz` 回應正常
  - bot 日誌顯示成功登入 Discord

## 4. 安全與可觀測性設定

### 4.1 防火牆規則（針對 tag: `reminder-bot`）

- `reminder-bot-allow-ssh`
  - Ingress allow `tcp:22`
  - priority `1000`
- `reminder-bot-deny-ingress`
  - Ingress deny `all`
  - priority `2000`

效果：除 SSH 外，對該 VM 的外部入站流量全擋。

### 4.2 告警策略（Cloud Monitoring）

- `ReminderBot VM CPU High`
  - CPU > 80% 持續 5 分鐘
- `ReminderBot VM No Uptime Data`
  - 5 分鐘沒有 uptime 指標資料

### 4.3 通知管道

- Email channel：`tiffany12310@gmail.com`
- 已綁定到上述兩條告警策略

## 5. 初版收尾動作（必做）

以下為建議按順序執行的上線收尾 checklist：

### 5.0 開發/測試環境資料重置（本次改版）

僅在**尚未上線**或測試環境使用。正式環境禁止直接清空資料。

1. 清空以下 collections（Firestore Console 或 Admin Script）：
   - `reminders`
   - `due_buckets`（含底下 `items`）
   - `dispatch_logs`
   - `guilds`（僅測試 guild 資料）
2. 視情況重建 `system_limits/global`：
   - `freeReminderGlobalCap: 10000`
   - `freeReminderGlobalCount: 0`
   - `freeCreateLocked: false`
   - `lockReason: ""`
3. 重啟 bot/server 後執行 smoke test：
   - 建立 2~3 筆提醒
   - 使用 `/reminder delete` 勾選刪除多筆
   - 確認 list 結果與 Firestore 資料一致

1. **輪替 Discord Bot Token**
   - 到 Discord Developer Portal 重新產生 token
   - 更新 `apps/bot/.env` 與 `apps/server/.env`（若 server 也用到）
   - 重啟 PM2 程序

2. **清理與保護憑證**
   - 確認 `.env`、service account json 未被提交至 Git 遠端
   - 長期建議改用 Secret Manager 或至少限制檔案權限

3. **PM2 開機自啟**
   - 在 VM 上執行：
     - `pm2 startup`
     - `pm2 save`
   - 重新開機一次驗證程序是否自動恢復

4. **告警通知驗證**
   - 檢查 `tiffany12310@gmail.com` 是否收到 Monitoring 驗證/測試郵件
   - 手動製造短暫壓力或停機測試告警到信

5. **功能 smoke test（線上）**
   - 建立 daily 提醒 1 筆（含 role mention）
   - 建立 weekday 提醒 1 筆
   - 驗證 list/update/delete 都可用
   - 驗證超出每 Guild 上限會拒絕

6. **配額觀察（前 7 天）**
   - 每日檢查 Firestore reads/writes/deletes
   - 對照 `docs/traffic-estimation.md`，必要時下修 `X`

## 6. 本機一鍵部署到 GCP VM

新增腳本：`infra/scripts/deploy-gcp-vm.sh`

### 6.1 使用方式（在專案根目錄）

```bash
npm run deploy:gcp
```

預設會使用：

- `PROJECT_ID=remiderbot-3c1b0`
- `ZONE=us-west1-a`
- `INSTANCE=reminder-bot-vm`
- `REMOTE_DIR=~/remiderbot`

可用環境變數覆蓋，例如：

```bash
PROJECT_ID=my-project ZONE=asia-east1-b INSTANCE=my-vm npm run deploy:gcp
```

### 6.2 腳本會做的事

1. 檢查本機 `gcloud`、`rsync` 是否可用，並確認已有登入帳號。
2. SSH 到 VM 建立遠端目錄。
3. 用 `rsync` 同步專案（排除 `.git`、`.gcloud`、`node_modules`、`dist`）。
4. 在 VM 執行：`npm ci`、`npm run build`、`pm2 restart reminder-server`、`pm2 restart reminder-bot`、`pm2 status`、`curl /healthz`。

### 6.3 常見錯誤排查

- `尚未登入 gcloud`：先執行 `gcloud auth login`。
- `Permission denied`（SSH）：確認本機帳號有 VM SSH 權限，或補 `roles/compute.osLogin`。
- `pm2: command not found`：先在 VM 安裝 PM2 並確認 PATH：
  - `npm install -g pm2`
  - 重新登入 shell 後再部署
- `curl /healthz` 失敗：先 SSH 到 VM 以 `pm2 logs reminder-server --lines 100` 檢查 server 啟動錯誤。

## 7. 常用維運指令（VM）

```bash
pm2 status
pm2 logs reminder-server --lines 100
pm2 logs reminder-bot --lines 100
curl -sS http://localhost:8080/healthz
```

## 8. 備註

- 本架構為 Spark-only 目標設計，避免依賴 Cloud Functions / Cloud Scheduler。
- 若成長後發現 `system_limits/global` 文件有 contention，下一版改為 Distributed Counters。
