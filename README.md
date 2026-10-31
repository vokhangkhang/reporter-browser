# Reporter — tổng hợp báo cáo với Codex, Chrome, Slack và Drive

Workspace giúp Codex đọc task PM qua **Chrome + Playwright**, kết hợp nguồn Slack/Google Drive để lập báo cáo có dẫn chứng.
Phiên bản này dành cho **Windows 11, Node.js 22+ và Google Chrome**, bộ đọc PM theo giao diện Taiga tiếng Anh.

| Thành phần | Khả năng hiện có |
|---|---|
| Chrome/PM | Script mở profile automation riêng, kết nối qua localhost, đọc board/task/custom Point bằng giao diện |
| Báo cáo bằng script | Tổng point/trạng thái theo sprint; tùy chọn đối chiếu snapshot daily và task trong Drive |
| Slack/Drive | Codex dùng connector của phiên làm việc để đọc nguồn, chuẩn hóa snapshot, hoặc viết tài liệu theo yêu cầu |
| Demo | Chạy offline bằng dữ liệu giả, không cần tài khoản PM/Slack/Drive |

**Clone repo không mang theo tài khoản, quyền truy cập hoặc connector.** Mỗi người tự đăng nhập PM và kết nối Slack/Drive trong môi trường Codex họ dùng.
Không có MCP server hoặc Browser plugin trong repo. Script không tự đọc Slack/Drive hay upload báo cáo; các việc đó cần connector có sẵn trong phiên Codex, hoặc người dùng chuẩn bị snapshot thủ công.

## 1. Cài phần mềm

Cài Git, Node.js bản 22 trở lên, Google Chrome và VS Code nếu muốn mở bằng editor.
Trong PowerShell kiểm tra:

```powershell
git --version
node --version
npm.cmd --version
```

PowerShell có thể chặn `npm.ps1`; dùng `npm.cmd` trong các bước dưới.
Chrome mặc định dự kiến ở `C:\Program Files\Google\Chrome\Application\chrome.exe`; nếu máy khác, cấu hình lại ở bước 4.

## 2. Lấy mã và cài dependencies

Thay `YOUR_ACCOUNT` và tên repo nếu cần:

```powershell
git clone https://github.com/YOUR_ACCOUNT/reporter-browser.git
cd reporter-browser
npm.cmd ci
```

Không cần chạy `npx playwright install`: chương trình dùng Google Chrome đã cài trên máy.

## 3. Thử demo trước

```powershell
npm.cmd run demo
npm.cmd test
```

Mở `.local/demo/report.md` để xem báo cáo mẫu. Dữ liệu giả có 3 task, 2 point đã điền, 1 task chưa có point; không kết nối hệ thống thật.

## 4. Tạo và sửa cấu hình cá nhân

```powershell
npm.cmd run setup
```

Mở `reporter.config.local.json`. Lệnh setup không ghi đè file đã có.

| Trường | Cần điền |
|---|---|
| `chrome.executablePath` | Đường dẫn Chrome trên máy |
| `chrome.cdpUrl` | Mặc định `http://127.0.0.1:9223`; đổi sang cổng localhost trống nếu xung đột |
| `chrome.profilePath` | Giữ `.local/chrome-automation`; không trỏ vào profile cá nhân |
| `pm.origin` | Origin hệ thống, ví dụ `https://pm.example.com`, không thêm `/project/...` |
| `pm.project` | Project slug lấy từ URL `/project/demo-project/...` |
| `pm.sprints` | Danh sách `{ "slug": "sprint-1", "name": "Sprint 1" }`; lấy slug từ URL taskboard và tên từ heading thực tế |
| `pm.assignee` | Giá trị tên avatar trên card; không chắc thì nhờ Codex kiểm tra. Đặt `null` để đọc tất cả người trong các sprint đã chọn |
| `pm.pointField` | Tên chính xác custom field, ví dụ `Point` |
| `pm.doneStatuses` | Danh sách trạng thái nghiệm thu chính xác, mặc định `["Done"]` |
| `report.period` | Kỳ đối chiếu daily `YYYY-MM`; không tự biến tổng sprint thành tổng hoàn thành tháng |
| `report.slackSnapshot`, `report.driveSnapshot` | Giữ `null` khi chưa thu thập; xem bước 8 để bật đối chiếu |
| `sources.*` | URL kênh Slack, Slack user ID (để trống nếu toàn nhóm), URL folder Drive để Codex biết nguồn cần đọc |

Các đường dẫn snapshot và output phải nằm trong `.local/`.
Có thể chọn file cấu hình khác bằng biến môi trường PowerShell `$env:REPORTER_CONFIG = 'reporter.config.team.local.json'`.
File cấu hình không phải nơi lưu token/mật khẩu. `sources` chỉ là thông tin chỉ dẫn cho Codex, không tự cấp quyền hay tạo kết nối.

Kiểm tra cấu hình và đường dẫn Chrome:

```powershell
npm.cmd run doctor
```

## 5. Mở Chrome automation và đăng nhập PM

Chạy từ terminal của bạn:

```powershell
npm.cmd run chrome:start
```

Trong cửa sổ Chrome riêng vừa mở:

1. Đăng nhập PM bằng tài khoản của bạn, hoàn tất MFA nếu có.
2. Mở project và một board để xác nhận bạn có quyền đọc.
3. Giữ cửa sổ này mở trong lúc chạy báo cáo.

Phiên đăng nhập được Chrome giữ trong `.local/chrome-automation`. Chương trình không sao chép profile, cookie hay mật khẩu từ Chrome cá nhân.
Những lần sau chạy lại `chrome:start` nếu cửa sổ automation đã đóng; đăng nhập lại khi phiên hết hạn.
Không chạy đồng thời lệnh launch riêng như `chrome:login` khi profile automation đang mở.

```powershell
npm.cmd run chrome:check
npm.cmd run pm:ui
```

`chrome:check` kết nối Chrome automation và đọc phiên bản; `pm:ui` mở tab kiểm tra, đọc URL/tiêu đề/HTTP status rồi đóng chính tab đó.
Tiêu đề trang có giá trị không đồng nghĩa đã đăng nhập hoặc đọc được task.
Các tab có sẵn và Chrome cá nhân được giữ nguyên.

## 6. Thu thập PM và tạo báo cáo

```powershell
npm.cmd run pm:sprints:ui
npm.cmd run pm:report
```

Lệnh đầu đọc đủ card theo số open + closed trên từng board, lọc assignee, mở các tab task để đọc custom fields rồi đóng các tab tự tạo.
Kết quả mặc định: `.local/pm-sprints-ui.json`. Lỗi kết nối/đọc không đủ sẽ giữ `complete:false` và trả exit code 1; không dùng dữ liệu đó để chốt tổng.
Lệnh thứ hai tạo `.local/reports/report.md` và `.local/reports/report.md.json` theo cấu hình.

Trước mỗi kỳ, sửa period/sprints/assignee và thu thập lại PM. Script kiểm tra metadata phạm vi, tránh dùng snapshot của dự án hoặc người khác.
Bộ đọc phụ thuộc DOM Taiga; PM khác giao diện cần adapter riêng. Không gọi API PM trực tiếp, không bấm sửa/lưu task.

## 7. Dùng cùng Codex và kết nối Slack/Drive

Nếu đã có Codex trong VS Code thì đăng nhập và mở folder repo. Nếu dùng CLI, làm theo [hướng dẫn cài Codex chính thức](https://learn.chatgpt.com/docs/cli) và [đăng nhập](https://learn.chatgpt.com/docs/auth?surface=cli).
Sau khi cài CLI, mở PowerShell trong folder repo và chạy:

```powershell
codex
```

Trong môi trường Codex có Apps/connectors, mở danh sách Apps, chọn Slack và Google Drive, đăng nhập tài khoản của bạn và cấp quyền theo workspace.
CLI có thể mở danh sách bằng `/apps`; xem [tài liệu lệnh chính thức](https://learn.chatgpt.com/docs/developer-commands?surface=cli).
Khả năng kết nối phụ thuộc môi trường, tài khoản và quyền quản trị workspace. Repo không tự cài hoặc chuyển cấu hình connector từ máy người khác.

Yêu cầu Codex kiểm tra **chỉ đọc** trước:

```text
Đọc README.md, AGENTS.md và reporter.config.local.json.
Kiểm tra Chrome automation bằng các script hiện có.
Kiểm tra connector Slack và Google Drive có đọc được nguồn trong sources không.
Không gửi tin nhắn, không sửa PM hoặc tài liệu.
Nếu nguồn chưa kết nối hoặc thiếu quyền, báo rõ nguồn nào và phần chưa kiểm chứng.
```

Không có connector trong phiên đang dùng thì bạn vẫn chạy được PM và demo. Với Slack/Drive, chuẩn bị snapshot thủ công theo bước 8 hoặc chuyển sang môi trường có connector; không xem đăng nhập bằng trình duyệt là đã kết nối connector.

## 8. Tổng hợp đủ PM + Slack + Drive

Sau khi đã kết nối nguồn, yêu cầu:

```text
Đọc cấu hình cá nhân. Lập báo cáo cho người/phạm vi và kỳ đã cấu hình.
Thu thập lại PM bằng npm.cmd run pm:sprints:ui.
Đọc đủ trang Slack và tài liệu trong folder Drive được chỉ định.
Chuẩn hóa snapshot theo docs/snapshots.md vào .local/; không lưu token hoặc dữ liệu không liên quan.
Đối chiếu Today/Yesterday, ngày thực hiện và ranh giới tháng trước khi cộng giờ.
Cập nhật đường dẫn report.slackSnapshot và report.driveSnapshot rồi chạy pm:report.
Tách point toàn sprint khỏi task daily nhắc tới trong kỳ, giữ point thiếu là chưa biết.
Ghi nguồn và phần chưa kiểm chứng. Tạo báo cáo tại máy trước.
```

Schema đầy đủ và quy tắc chuẩn hóa: [docs/snapshots.md](docs/snapshots.md).
Script chỉ tổng hợp task/point và đối chiếu các snapshot; phần nhận định tiến độ toàn dự án cần Codex đọc thêm tài liệu, thảo luận và bằng chứng nghiệm thu.

Muốn ghi báo cáo lên Drive, yêu cầu rõ **tạo mới hay cập nhật file nào**, cung cấp link đích và phạm vi.
Codex dùng connector tương ứng để ghi và đọc lại kiểm chứng. `pm:report` chỉ ghi file tại máy.

## Dùng lại mỗi ngày hoặc mỗi tháng

1. Mở folder repo và Codex.
2. Chạy `chrome:start`, đăng nhập lại nếu cần và giữ Chrome automation mở.
3. Cập nhật kỳ/phạm vi trong cấu hình hoặc nêu rõ yêu cầu để Codex cập nhật.
4. Yêu cầu làm mới dữ liệu và lập báo cáo. Không dùng snapshot cũ như dữ liệu vừa đọc.
5. Kiểm tra giới hạn/nguồn; yêu cầu ghi lên Drive khi cần.

## Lệnh và xử lý lỗi

| Tình huống | Cách xử lý |
|---|---|
| Không tìm thấy Chrome | Sửa executablePath; chạy lại doctor |
| ECONNREFUSED hoặc CDP timeout | Chạy chrome:start từ terminal của bạn, kiểm tra cổng cấu hình; không đóng Chrome cá nhân |
| Profile đang mở nhưng không có debugging | Lưu công việc và đóng **chỉ cửa sổ automation**, chạy lại chrome:start |
| Agent gặp ERR_NETWORK_ACCESS_DENIED | Mở automation từ terminal của bạn rồi để script attach; không chuyển sang gọi API để né lỗi |
| Board timeout hoặc sai tên | Kiểm tra login, quyền dự án, slug, heading, ngôn ngữ và bộ lọc board; không dùng tổng từng phần |
| Không tìm thấy Point | Kiểm tra custom field có tồn tại trên task và tên cấu hình đúng; không tự thay bằng story points |
| Scope/period mismatch | Sửa cấu hình đúng phạm vi, thu thập lại; snapshot cũ trước 0.2 cần lấy lại |
| Slack/Drive không có công cụ | Kiểm tra Apps và quyền workspace; doctor không kiểm chứng hai connector này |
| Snapshot được cấu hình nhưng file thiếu | Thu thập đúng schema hoặc đặt null nếu chưa muốn đối chiếu |

`npm.cmd run doctor -- --connect` kiểm tra thêm kết nối CDP.
`chrome:login` là cách mở automation, chờ bạn đăng nhập rồi Enter để đóng **cửa sổ do lệnh đó tạo**; chỉ chạy khi automation chưa mở.
`chrome:personal` là chế độ tùy chọn attach endpoint cá nhân đã được người dùng bật. Chrome có thể yêu cầu cho phép kết nối; chế độ này không phải luồng mặc định cho người mới. Repo không tự thay cài đặt Chrome hoặc khởi động lại Chrome cá nhân.

## Chia sẻ và phát triển

Xem [hướng dẫn đưa lên GitHub](docs/publish.md). Lệnh `share:prepare` tạo bản nguồn sạch theo danh sách được phép, không lấy dữ liệu làm việc.
Dữ liệu thật nằm dưới `.local/`; các báo cáo cũ dưới `reports/` cũng bị Git bỏ qua.
Đừng chia sẻ cả folder workspace, profile Chrome, file HAR, token hoặc snapshot nội bộ.

```powershell
npm.cmd test
npm.cmd run demo
npm.cmd run share:check
npm.cmd run share:prepare
```

Mã nguồn phát hành theo MIT, xem [LICENSE](LICENSE).
