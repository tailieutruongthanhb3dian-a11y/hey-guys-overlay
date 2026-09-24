# Rà soát kết nối — 06/09/2026

Đã sửa các điểm có thể gây treo chờ, bỏ lỡ cập nhật và hiển thị dữ liệu cũ:

- RPC đọc trạng thái/sự kiện có timeout 4 giây; tác vụ Garage và skin giữ thời gian chờ riêng. Không tự gửi lại thao tác thay đổi dữ liệu.
- Cầu nối web thử kết nối lại theo nhịp 1–2–4–8–10 giây; lỗi xác thực chờ 30 giây và hiển thị hướng dẫn ghép nối lại. Khôi phục đồng bộ khi mạng trở lại hoặc cửa sổ hoạt động lại.
- Không chạy chồng các lượt lấy sự kiện. Lỗi trong một bộ nhận sự kiện không làm dừng các bộ nhận khác.
- Trang chính lấy lại snapshot cục bộ mỗi 2 giây; HUD không chạy chồng snapshot. Bỏ snapshot trả chậm nếu đã nhận sự kiện mới hơn.
- Đánh số sự kiện trong cùng khóa hàng đợi để tránh đảo thứ tự giữa các luồng.
- Kết nối ERA có connect timeout 5 giây, request bản đồ tối đa 8 giây, TCP keepalive 30 giây. Backoff mạng tối đa 15 giây; kiểm tra lại đăng nhập sau 5 giây. Vẫn tôn trọng Retry-After của server và chu kỳ thành công 2 giây.
- Lỗi khởi tạo giao diện có thông báo và nút tải lại.

## Xác minh

- Svelte check: 0 lỗi, 0 cảnh báo. Release build thành công; cảnh báo kích thước chunk Three.js vẫn còn.
- Rust: 69 đạt, 0 thất bại, 9 bỏ qua vì cần dữ liệu hoặc dịch vụ ngoài.
- QA connection-policy, web-transport và prime-hud-zoom đều đạt. Fixture xác minh mất mạng, khôi phục dữ liệu, hết mã ghép nối và không gửi lại lệnh tự sát/skin khi kết nối lại.
- Đã thay EXE tại `phat-hanh/Hey-Guys-Overlay/Hey-Guys-Overlay.exe`, giữ bản dự phòng trong `.tools/Hey-Guys-Overlay-before-connection-review.exe`, mở app bình thường và xác nhận process phản hồi.
- SHA256 EXE: `BC5801CE64ABBF255538FB0ECE7FB10BF802ACCDE129BC1502EA776973BCA1A1`.
- Cầu nối đang chạy từ chối request thiếu mã bằng HTTP 401 và origin lạ bằng HTTP 403.

Chưa kiểm chứng một phiên chơi game có đăng nhập ERA xuyên suốt lúc mất mạng thật. Server ngừng hoạt động, giới hạn tần suất, độ trễ nguồn RCON hoặc phiên Steam hết hạn vẫn có thể làm gián đoạn; app không tự vượt xác thực. Mã ghép nối web thay đổi khi khởi động lại app.
