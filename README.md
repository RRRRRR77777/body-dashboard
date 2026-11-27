# 體態管理師・週報儀表板

LINE 飲食控制機器人的週報儀表板（LINE MINI App）。

- 網頁只有畫面，不存資料、沒有任何金鑰。
- 開啟後用 LIFF 取得 LINE 登入的 ID Token，交給後端（Google Apps Script）；後端向 LINE 驗證（`POST https://api.line.me/oauth2/v2.1/verify`）並確認是擁有者本人後，才回傳週報彙總數字。
- `?demo=1` 是假資料展示模式，不連線。
