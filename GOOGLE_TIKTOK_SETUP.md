# Google Sign-in × TikTok LIVE — Khởi chạy từ trình duyệt

## Cách hoạt động

1. Người quản trị đăng nhập Google bằng Google Identity Services.
2. Máy chủ xác minh chữ ký Google ID token, issuer, audience, expiry và email_verified; email phải có trong ADMIN_EMAILS.
3. Phiên HTTP-only cookie giữ đăng nhập trong 7 ngày khi server vẫn chạy; không lưu mật khẩu Google.
4. Nhập tài khoản TikTok @username một lần. Máy chủ lưu tên này theo Google sub trong data/google-tiktok-links.json.
5. Nhấn **Mở LIVE & đồng bộ**: server kết nối phòng LIVE qua tiktok-live-connector, trình duyệt mở liên kết tiktok.com/@username/live, tương tác bình luận / tim / quà tặng đẩy vào nghi thức chùa hiện có.

**Quan trọng:** Google không đăng nhập thay TikTok, không mở chương trình phát sóng từ tài khoản TikTok, và không cấp quyền TikTok OAuth. Người phát cần tự đăng nhập TikTok và bắt đầu LIVE trên ứng dụng hỗ trợ trước. Nút chỉ mở trang LIVE của kênh và kết nối *đọc* sự kiện qua connector không chính thức; TikTok có thể thay đổi giao thức hoặc giới hạn kết nối.

## Bước 1: Tạo Google Cloud OAuth Client ID

- Vào [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
- Cấu hình OAuth consent screen nếu được yêu cầu và tạo **OAuth Client ID → Web application**.
- Authorized JavaScript origins: địa chỉ thực tế trình duyệt dùng, ví dụ **https://your-render-service.onrender.com** và **http://localhost:3000**.
- Ứng dụng dùng GIS ID-token callback trên chính trang, không có redirect URI cần thiết trong luồng này.
- Lấy Client ID, dạng \`xxxx.apps.googleusercontent.com\`. Không đưa client secret vào repo.

## Bước 2: Cấu hình biến môi trường cho Render

| Variable | Example | Purpose |
| --- | --- | --- |
| \`GOOGLE_CLIENT_ID\` | \`xxxx.apps.googleusercontent.com\` | Google OAuth Web Client ID |
| \`ADMIN_EMAILS\` | \`owner@gmail.com\` | Danh sách email quản trị, phân tách bằng dấu phẩy |
| \`TRUST_PROXY\` | \`1\` | Cho phép Express nhận HTTPS từ proxy Render |
| \`NODE_ENV\` | \`production\` | Production mode |
| \`TIKTOK_USER\` | (trống) | Mặc định **không tự kết nối** nếu chưa chọn kênh |

**Không** bật \`LOCAL_DEV_UNSAFE\` trên Render. Cấu hình này chỉ dành cho test HTTP ở loopback khi chưa có Google Client ID.

## Bước 3: Chạy

\`\`\`bash
bun install
bun start
\`\`\`

Truy cập \`http://localhost:3000/\` hoặc HTTPS Render, sau đó:

- Đăng nhập Google trong thẻ **Google × TikTok LIVE**.
- Nhập \`@tiktok_username\` (hoặc đường dẫn đầy đủ \`https://www.tiktok.com/@tiktok_username/live\`).
- Bấm **▶ Mở LIVE & đồng bộ**.

Màn hình OBS \`/?obs=1\` chỉ hiển thị nội dung chùa. WebSocket vẫn đẩy thông báo công khai cho OBS; gửi lệnh điều khiển qua WebSocket hoặc POST /rpc cần xác thực Google admin. HTTP TTS synthesis cũng hạn chế cho admin. Để gọi RPC từ tích hợp khác, cần bổ sung phương thức service credential riêng.

## Lưu ý vận hành

- Render phiên bản không có persistent disk sẽ không giữ file liên kết qua lần deploy/restart; session in-memory cũng mất sau restart. Khi phát hành lâu dài, dùng persistent database và kho session shared.
- Chạy bằng HTTPS public, đặt Client ID đúng origin, không đưa bất kỳ token hay cookie nào lên GitHub.
- Màn hình LIVE công khai không đồng nghĩa máy chủ có thể thay mặt người dùng đăng nhập TikTok; không nhập mật khẩu TikTok vào ứng dụng này.
- TTS ZeroTTS cần Python/model đúng như README hiện tại; nếu thiếu, giao diện LIVE có thể chạy nhưng giọng đọc không có.
