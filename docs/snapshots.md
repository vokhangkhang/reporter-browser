# Định dạng đầu vào cho báo cáo

Các JSON trong `examples/` dùng dữ liệu giả và chạy được bằng `npm.cmd run demo`.
Snapshot thật phải lưu dưới `.local/`. Không đưa dữ liệu nguồn lên GitHub.

## Phạm vi và thời điểm

Cả ba loại snapshot cần `origin`, `project`, `assignee`, `collectedAt` (ISO timestamp).
`origin` là origin PM, ví dụ `https://pm.example.com`, kể cả trong snapshot Slack/Drive.
`assignee` là tên avatar trên board hoặc `null` khi tổng hợp tất cả người trong các sprint đã chọn.
Slack và Drive có thêm `period: "YYYY-MM"` và `complete: true`.
Các trường này phải khớp cấu hình, tránh ghép dữ liệu của người hoặc dự án khác.
`complete` chỉ được đặt true sau khi đọc đủ nguồn trong phạm vi đã chọn, không dùng cho kết quả tìm kiếm bị cắt trang.

## PM

Lệnh `npm.cmd run pm:sprints:ui` tự tạo snapshot PM. Xem [mẫu](../examples/pm.snapshot.json).

- `pointField` khớp `pm.pointField`.
- `sprints[]`: `slug`, `name`, `openTasks`, `closedTasks`, `cards[]`, `mine[]`.
- Card: `ref` dạng `#123`, `subject`, `assignees[]`, `status`.
- `mine` là các card khớp assignee, hoặc tất cả card khi assignee là null.
- `tasks[]`: chi tiết các card đã chọn, thêm `sprint` là slug và `point` là số không âm hoặc null.
- `errors: []`, `complete: true` khi đọc đủ board và chi tiết.

Bộ đọc hiện hỗ trợ DOM Taiga với board tiếng Anh, có `tg-card` và Custom Fields.
Hệ thống Taiga khác phiên bản/ngôn ngữ có thể cần chỉnh selector trong `scripts/pm-sprints-ui.mjs`.
Nếu không đọc đủ card, thiếu status hoặc không thấy custom field đã cấu hình, script báo lỗi thay vì đoán số liệu.

Snapshot cũ trước bản 0.2 thiếu metadata phạm vi không được tự động dùng lại. Hãy thu thập lại; không đổi collectedAt của snapshot cũ thành thời điểm hiện tại.

## Slack

Xem [mẫu](../examples/slack.snapshot.json). Đây là dữ liệu đã chuẩn hóa, không phải dump nguyên kênh.

Mỗi `entries[]` gồm:

| Trường | Ý nghĩa |
|---|---|
| `workKey` | Khóa duy nhất của một phần việc thực hiện, dùng nhận diện Today/Yesterday trùng nhau |
| `date` | Ngày thực hiện `YYYY-MM-DD`, theo ngày daily/nội dung; không tự lấy ngày đăng tin |
| `ref` | Một task PM rõ ràng, ví dụ `#123` |
| `hours` | Giờ tự báo cáo đọc rõ, hoặc null nếu chưa xác định; không lấy Spent Time PM để điền |
| `sourceUrl` | Permalink HTTPS của tin Slack nguồn |

Trước khi tạo snapshot, Codex/người xử lý phải:

1. Đọc đủ trang kết quả đúng người/kênh và đọc thread liên quan.
2. Phân biệt ngày đăng với ngày thực hiện, kiểm tra tin sát ranh giới tháng.
3. Loại phần Yesterday nhắc lại Today hôm trước. Không loại mọi dòng cùng task: một task có thể được làm qua nhiều ngày.
4. Dùng cùng workKey cho cùng phần việc khi phát hiện nhắc lại, rồi giữ một bản. Script từ chối workKey trùng, nhưng không tự phát hiện trùng về ngữ nghĩa nếu khóa bị đặt khác.
5. Nhóm nhiều ID chưa tách rõ giờ, việc không ID, sai định dạng hoặc không rõ dự án: giữ trong ghi chú riêng, không tự chia point/giờ.

Script chỉ đưa entry có ngày thực hiện thuộc `report.period` vào đối chiếu. Entry ngoài kỳ trong mẫu minh họa ranh giới tháng.
Tổng giờ chỉ bao gồm các entry có ID đã chuẩn hóa; chưa đại diện mọi công việc không ID.
Phạm vi hiện tại là một dự án PM và một assignee hoặc toàn bộ người trong các sprint được cấu hình. Không ghép ID từ nhiều dự án.

## Drive

Xem [mẫu](../examples/drive.snapshot.json). `taskRefs` là danh sách ID duy nhất đọc từ tệp báo cáo của đúng kỳ/người/dự án.
Snapshot này chỉ hỗ trợ so sánh task nào còn thiếu trong tệp báo cáo, chưa tự đối chiếu mọi ô giờ/point của bảng tính.

## Bật đối chiếu

Lưu snapshot thật, rồi sửa `reporter.config.local.json`:

```json
{
  "report": {
    "period": "2026-10",
    "pmSnapshot": ".local/pm-sprints-ui.json",
    "slackSnapshot": ".local/slack.snapshot.json",
    "driveSnapshot": ".local/drive.snapshot.json",
    "output": ".local/reports/report.md"
  }
}
```

Đây chỉ là phần `report` của cấu hình, không thay toàn bộ file bằng đoạn này.
Đặt một nguồn là `null` nếu chưa thu thập. File được cấu hình nhưng thiếu/sai sẽ gây lỗi; script không âm thầm bỏ qua.

Chạy `npm.cmd run pm:report`. Báo cáo có phần tổng sprint, daily trong kỳ, task chưa tìm thấy ở PM/Drive và nguồn daily.
Không lấy tổng tất cả sprint làm point hoàn thành trong tháng; cần task history và quy tắc nghiệm thu để kết luận việc đó.
