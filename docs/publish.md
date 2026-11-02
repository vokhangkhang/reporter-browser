# Chuẩn bị và đưa lên GitHub

Chạy trong folder nguồn, trước khi chia sẻ:

```powershell
npm.cmd test
npm.cmd run demo
npm.cmd run share:check
npm.cmd run share:prepare
```

Lệnh cuối tạo **`.local/github-ready/`**, chỉ gồm danh sách mã nguồn, tài liệu, dữ liệu giả, tests và CI đã kiểm tra.
Không lấy `.local/`, `reports/`, cấu hình cá nhân, Chrome profile, backup hay dữ liệu Slack/Drive thật.
Script kiểm tra một số dạng token và thông tin nội bộ đang có trong cấu hình cá nhân; đây không phải công cụ dò mọi bí mật. Xem lại danh sách và nội dung trước khi publish.
Nếu thư mục đích đã có, script từ chối ghi đè; tạo bản mới:

```powershell
npm.cmd run share:prepare -- --dest .local/github-ready-v2
```

Không upload nguyên folder workspace hoặc nén toàn bộ folder rồi đưa lên GitHub.
`.gitignore` không bảo vệ tệp đã commit từ trước hoặc tệp bị `git add -f`.

## Tạo repository từ bản sạch

Thay `YOUR_ACCOUNT` bằng tài khoản/organization GitHub của bạn.
Tạo repository trống tên `reporter-browser` trên GitHub, không khởi tạo README/license/gitignore trên web vì chúng đã có sẵn.
Chọn Public nếu muốn mọi người đọc được, hoặc Private nếu chỉ chia sẻ trong nhóm.

```powershell
cd .local/github-ready
git init -b main
git add .
git diff --cached --stat
git diff --cached
git commit -m "Initial configurable reporter workspace"
git remote add origin https://github.com/YOUR_ACCOUNT/reporter-browser.git
git push -u origin main
```

Đăng nhập GitHub bằng cơ chế Git Credential Manager khi Git yêu cầu; không dán token vào URL remote hoặc file cấu hình.
Nếu dùng tên repo/thư mục khác, thay các giá trị tương ứng.
Repository mới nên có mô tả: “Local Chrome UI reporting workspace for Codex, Slack and Google Drive”.

## Sau khi publish

- GitHub Actions chạy tests, demo và kiểm tra nguồn trên Windows/Node 22. Nó không đăng nhập PM/Slack/Drive.
- Người dùng làm theo README và tự kết nối tài khoản của họ.
- Giữ dữ liệu và cấu hình thật ở máy, kể cả khi repository là Private.
- Sửa mã trong bản có Git để tiếp tục commit; nếu tiếp tục làm ở workspace gốc, export bản mới rồi đối chiếu phần mã thay đổi, không sao chép dữ liệu riêng vào repo.

## Cấu trúc chia sẻ

```text
reporter-browser/
  README.md
  AGENTS.md
  LICENSE
  reporter.config.example.json
  package.json
  package-lock.json
  scripts/                 # Chrome, bộ đọc UI, báo cáo, kiểm tra, export
  docs/                    # Hướng dẫn dùng, snapshot, publish
  examples/                # Chỉ dữ liệu giả
  tests/
  .github/workflows/ci.yml
```
