# Trợ lý sinh tồn — 06/09/2026

Trang **Trợ lý** mới tập hợp các tính năng; bố cục theo Linear trong thư viện thiết kế, dùng lại theme Gateway của app.

| Tính năng | Cách dùng |
|---|---|
| Cảnh báo sinh tồn | Đặt ngưỡng máu/thức ăn/nước/thể lực; HUD đổi viền và hiện cảnh báo. Âm báo mặc định tắt, có khoảng nghỉ 15–600 giây. |
| Trợ lý Prime | Ghim tối đa 3 điều kiện; bật HUD ưu tiên để chỉ hiện 3 việc chưa xong. Chỉ dùng kết quả server. HUD báo khi số hoàn thành tăng. |
| Đánh dấu nhanh | Chọn loại và ghi chú, bấm Lưu vị trí. Ctrl+Alt+B dùng chức năng đánh dấu toàn cục sẵn có. Điểm giữ thời gian tạo. |
| La bàn dẫn đường | Chọn Dẫn tới tại điểm đã lưu; HUD hiện hướng Bắc/Đông/Nam/Tây, góc và khoảng cách đường thẳng. Minimap dùng cùng điểm đến. |
| Nhật ký hành trình | Bấm Bắt đầu ghi phiên. Ghi đường đi, thời gian có dữ liệu và mốc tăng trưởng/Prime. |
| Giữ đội hình | Chọn khoảng cách cảnh báo; hiển thị đồng đội gần nhất từ dữ liệu được chia sẻ. Có nút dẫn tới. |
| Bố cục HUD | Ba chế độ, có nút lưu vị trí/kích thước/độ trong suốt hiện tại. Ctrl+Alt+L chuyển các bố cục đã lưu. Không khôi phục điểm đến cũ cùng bố cục. |
| Sức khỏe kết nối | Trạng thái ERA, độ trễ request, tuổi dữ liệu và chu kỳ lấy dữ liệu. Web vẫn dùng banner cầu nối đã có. |
| Skin yêu thích | Mở rộng bộ sưu tập hiện có bằng ghim phối màu A, so sánh dải màu A/B và đổi màu xem trên mô hình. Sửa kiểm tra dữ liệu lưu bị hỏng và lỗi đầy bộ nhớ. |
| Tổng kết phiên | Kết thúc để lưu, xem lại đường đi và xuất PNG bằng nút Xuất ảnh tổng kết. |

## Review và sửa lỗi

- Chuyển trục ERA sang Asset Location trước khi tính đường/khoảng cách.
- Không cảnh báo, dẫn hướng hoặc đánh dấu ERA khi dữ liệu quá 5 giây; phía Rust cũng kiểm tra trước khi đánh dấu bằng phím tắt.
- Cho phép lệch một nhịp đồng hồ UI để event vừa đến không làm nút chớp trạng thái mất dữ liệu.
- Không cộng khoảng cách qua mất dữ liệu, mẫu lặp hoặc bước nhảy vượt 100 m/s; đây là ngưỡng loại ngoại lệ, không phải giới hạn tốc độ game.
- Tách phiên khi đổi tên/loài, giảm tăng trưởng hơn 10 điểm hoặc gián đoạn hơn 2 phút. Server chưa cung cấp mã đời nhân vật nên không bảo đảm nhận biết mọi lần hồi sinh cùng tên/loài.
- Giữ tối đa 20 phiên và 1.800 mẫu đường mỗi phiên; giảm mẫu giữ đoạn ngắt. Lưu bản phục hồi mỗi 10 giây; sau sự cố phục hồi thành phiên đã kết thúc.
- Không tự ghi khi mở app. Lịch sử và bộ sưu tập skin nằm trong bộ nhớ cục bộ từng giao diện Windows/web, không đồng bộ giữa chúng.
- Prime thu gọn có chiều cao đồng bộ Rust/Canvas: chỉ số + Prime 160 px, thanh trợ lý thêm 64 px. Chế độ 10 điều kiện cũ vẫn giữ Canvas 258 px.
- Không thay đổi trạng thái nhiệm vụ từ phía app, không tự gửi lệnh game, không phát lại thao tác skin/tự sát khi mất mạng.

## Kiểm chứng

Svelte check 0 lỗi/0 cảnh báo. Kiểm thử logic companion, giao diện companion, HUD thu gọn, web transport và Prime/zoom cũ đạt. Rust 69 đạt, 9 bỏ qua vì cần dữ liệu/dịch vụ ngoài. Release build có cảnh báo chunk Three.js lớn đã tồn tại từ trước.

Giao diện đã kiểm tra bằng Chrome với dữ liệu giả lập và ảnh tại `docs/qa-output/companion-*.png`. Chưa đo âm báo/FPS hoặc kiểm chứng hành trình trong một phiên game thật. Quãng đường và thời gian là phần ghi nhận được, không phải tổng tuyệt đối khi thiếu mẫu.
