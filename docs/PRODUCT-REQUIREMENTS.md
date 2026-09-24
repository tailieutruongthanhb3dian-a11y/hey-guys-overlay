# Yêu cầu sản phẩm — ngang tính năng và vượt trải nghiệm TheIsle Overlay

Ngày xác minh: 05/09/2026. Yêu cầu của người dùng: đối thủ có gì bản mình có đó,
và phải vượt trội hơn. Tài liệu này định nghĩa phạm vi và điều kiện nghiệm thu;
không phải lời xác nhận các tính năng đã hoàn thành.

## Mốc đối chiếu

- Source nền cục bộ: 1.5.2, có chỉnh sửa giao diện từ 04/09.
- GitHub REST API `/repos/toantranct/theisle-overlay/releases/latest` xác nhận
  `v2.2.0`, phát hành `2026-09-04T09:35:05Z`.
- Nguồn: https://github.com/toantranct/theisle-overlay/releases/tag/v2.2.0
- README có phần cũ không đồng bộ với release. Ưu tiên release theo phiên bản,
  sau đó xác minh trên ứng dụng thực tế. Không suy ra tính năng từ số phiên bản file.

## Phạm vi cần đạt

| Nhóm | Yêu cầu ngang tính năng | Điều kiện chứng minh chất lượng |
|---|---|---|
| Bản đồ | Gateway, ba nền, lớp POI, Food & Items, bật/tắt toàn bộ | Tọa độ đúng trên từng nền; lớp đồng bộ minimap và bản đồ lớn |
| Dẫn đường | Tìm địa danh, waypoint, màu/tên, hướng/khoảng cách, đường đi | Tìm không dấu; thao tác hàng loạt hoàn tác được; giữ trạng thái khi đổi tab |
| Minimap | Bám game, xuyên chuột, vị trí/kích thước/độ mờ, DPI | Kiểm thử 100/125/150/200% DPI và chuyển màn hình |
| IslePilot | Steam, chỉ số, Prime, POI server, live map được server bật | Hiển thị tuổi dữ liệu và nguyên nhân mất kết nối; khôi phục sau rớt mạng |
| Garage | Xem 3D, gửi/lấy/đổi tên/bán, giết dino khi server cho phép | Theo đúng chuỗi lệnh API; không báo thành công trước xác nhận cuối; xác nhận hành động mất dino |
| Skin | 10 vùng màu, xem 3D, bộ màu offline, áp vào game, mã tương thích game/IslePilot | Round-trip mã có mẫu thật; kiểm tra quyền server; thử trên dino do người dùng chọn |
| Vị trí trực tiếp | Npcap không cần thoại, không khóa trả phí theo mốc 2.2.0 | Parser có mẫu gói hợp lệ; không hiển thị tọa độ/hướng giả khi thiếu dữ liệu |
| Chỉ số trực tiếp | HP/đói/khát/thể lực từ nguồn realtime | Đối chiếu số liệu trong game và phát hiện dữ liệu cũ |
| Bạn bè | Mời, chấp nhận hai chiều, gỡ, hiện vị trí cùng server | Máy chủ relay riêng, quyền theo nhóm, hết hạn phiên, kiểm thử hai máy |
| Thoại | Proximity, push-to-talk, phòng riêng, thiết bị, âm lượng mỗi người | Hai máy, mất mạng/reconnect, không mic, chuyển thiết bị; cần signaling và TURN |
| Phân phối | Bản cài riêng, cập nhật riêng, bảo toàn thiết lập | Không cài đè app gốc, không tự tải bản gốc thay bản mình |
| Tài khoản/gói | Liên kết Steam, khôi phục/chuyển máy nếu phát hành thương mại | Xác định mô hình phát hành trước khi xây thanh toán; không phụ thuộc quyền Pro của tác giả |

## Thước đo vượt trội

Đo cùng máy, cùng server, cùng số dino, cùng DPI và cùng kịch bản với bản 2.2.0.
Các chỉ tiêu dưới đây là mục tiêu nghiệm thu, chưa phải số đo đạt được:

- Thao tác thường dùng: tìm/lệnh nhanh dưới ba thao tác; có hỗ trợ bàn phím.
- Phản hồi UI tại chỗ: p95 dưới 100 ms, tách khỏi thời gian đợi API.
- Phiên chơi 60 phút: không crash; ghi RAM/CPU/GPU và số context khi chuyển tab,
  cuộn Garage 24 dino rồi lặp lại. Không tăng context theo tổng số thẻ đã xem.
- Chỉ kết luận nhanh/nhẹ hơn khi có kết quả đo hai bản; không lấy số context tối đa
  làm bằng chứng ứng dụng nhanh hơn toàn diện.
- Lệnh làm thay đổi dino: chặn gửi trùng, hiển thị thất bại đúng nguyên nhân,
  xử lý hết hạn tài khoản và server không hỗ trợ.

## Phụ thuộc cần giải quyết

1. Server người dùng chơi: **ERA Gaming VN**, https://eragamingvn.net/.
   Ưu tiên dùng cá nhân trong giai đoạn kiểm thử; mô hình phát hành chưa chốt.
   ERA có API bạn bè/Live Map/Garage/skin riêng, không giả định tương thích IslePilot.
2. Hợp đồng API skin/Garage mới và định dạng mã skin: cần tài liệu hoặc mẫu thật;
   không đoán endpoint rồi hiển thị nút coi như hoàn thành.
3. Npcap: cần xác định giao thức, bộ mẫu kiểm thử và máy có game để đối chiếu.
4. Bạn bè/thoại: xây backend riêng và thử hai máy; triển khai hạ tầng có phí cần
   thông tin tài khoản và quyết định chi phí cụ thể.
5. Phát hành: chọn tên/identifier, thư mục dữ liệu và kênh cập nhật riêng trước khi
   tạo installer. Source hiện trỏ updater về repo tác giả.

## Trình tự triển khai

Nền bản đồ/Garage và kiểm thử → skin cùng hợp đồng API → Npcap cùng mẫu gói →
backend bạn bè → thoại → kiểm thử so sánh và bản cài riêng.
Tiếp tục các phần độc lập khi một tích hợp đang thiếu dữ liệu; không dùng màn hình
giả hoặc dữ liệu mô phỏng để đánh dấu tích hợp đã chạy thật.

Các điều khiển mới tham khảo bố cục/kích thước nút của bộ `linear.app` trong
thư viện DESIGN.md, dùng font hệ thống và biến giao diện hiện hữu của app.
