# Rà soát overlay — 06/09/2026

## Lỗi đã sửa

- **HUD thiếu quyền sự kiện:** bổ sung capability riêng cho `dino-hud`, chỉ nhận sự kiện cục bộ và đọc trạng thái hiển thị. Trước đây khai báo chỉ có main/minimap, khiến đăng ký listener HUD có thể bị từ chối.
- **Resize vô hình bắt chuột:** tay nắm ẩn không còn nhận pointer; handler cũng kiểm tra chế độ chỉnh sửa. Nút zoom chỉ hiện khi HUD nhận chuột, đặt góc dưới để không che dòng dẫn hướng phía trên.
- **Zoom giật về giá trị cũ:** broadcast thay đổi thiết lập không liên quan không ghi đè bán kính đang chuyển động. Khi bán kính thật sự đổi từ ngoài, hủy animation/lần lưu cũ. Reset trạng thái rAF khi hủy để có thể zoom tiếp sau phục hồi cửa sổ.
- **Âm báo gây lặp:** mỗi loại cảnh báo chỉ kêu một lần trong một đợt; phải hết ít nhất 5 giây mới được báo lại. Vẫn giữ khoảng nghỉ giữa âm báo và nhận biết loại cảnh báo mới. HUD ẩn không phát âm, không phát bù khi hiện lại; kiểm tra lại trạng thái sau khi AudioContext resume.
- **Cập nhật thừa:** chỉ vẽ canvas khi chỉ số/nhiệm vụ/kích thước thực sự đổi; chỉ cập nhật DOM thanh trợ lý khi nội dung đổi. Dữ liệu vẫn được kiểm tra hết hạn mỗi giây, độc lập với RPC có thể treo.
- **Dữ liệu gây hiểu nhầm:** bỏ mũi tên nhân vật/chỉ dẫn trên minimap khi vị trí ERA quá hạn, giữ bản đồ nền; HUD IslePilot xóa dữ liệu khi nhận player null. Nhãn minimap đổi HP thành Máu.
- **Kéo/resize tạo nhiều luồng hệ điều hành:** chuyển thời gian chờ debounce 350 ms sang tác vụ async; kiểm tra lại quyền chỉnh sửa trước khi lưu để không ghi đè sau khi đã khóa HUD.
- **HUD bị Windows ẩn:** bổ sung nhánh tự phục hồi cửa sổ chỉ số, tương tự minimap; phát sự kiện hiển thị để quản lý âm báo.

## Kiểm chứng

- Svelte check: 0 lỗi/0 cảnh báo.
- QA overlay-comfort: chống lặp âm, im lặng khi ẩn, không báo bù, chống dao động ngắn, đổi bán kính từ ngoài và khôi phục zoom đạt.
- QA overlay-comfort-ui: không vẽ lại dữ liệu giống nhau, tay nắm ẩn không resize, hết hạn dù RPC treo đạt.
- QA Prime/zoom và Companion UI đạt. Rust: 69 đạt, 9 bỏ qua vì cần dịch vụ/dữ liệu ngoài.
- Release build kiểm tra capability được đóng gói. Cảnh báo chunk Three.js lớn đã tồn tại từ trước.

Các phép thử giao diện dùng dữ liệu giả lập; chưa đo FPS và âm thanh trong một trận game thực. Không cam kết loại bỏ mọi lỗi do game, driver hoặc server.
