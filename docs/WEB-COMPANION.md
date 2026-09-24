# Hey Guys Overlay — bản web

Bản web dùng trực tiếp giao diện Svelte của ứng dụng tại https://heyguys-dashboard.pages.dev/.
Mã nguồn gốc nằm trong dự án này; `F:\Project\heyguys-web\public` là thư mục phát hành web.

## Sử dụng

1. Chạy bản Windows mới, giữ nguyên hai DLL bên cạnh EXE.
2. Bấm **Mở bản web** trên thanh điều hướng. Trình duyệt mở và ghép đôi tự động.
3. Nếu trình duyệt hỏi quyền mạng cục bộ, cho phép trang này kết nối ứng dụng trên máy.
4. Có thể dán mã ghép đôi thủ công. Mã đổi khi ứng dụng khởi động lại.
5. Đăng nhập Steam qua cửa sổ ERA của ứng dụng. Web dùng chung phiên đó.

Web cần ứng dụng chạy trên **cùng máy Windows**. Đây chưa phải dịch vụ độc lập dùng trên điện thoại.
Overlay ngoài game và phím tắt hệ thống vẫn do ứng dụng Windows thực hiện. Các ô skin lưu trên
trình duyệt và ứng dụng dùng kho localStorage riêng; chúng chưa đồng bộ với nhau.

## Kết nối

`src-tauri/src/web_bridge.rs` chỉ nghe `127.0.0.1:17864`, giới hạn đúng origin web phát hành,
yêu cầu mã ngẫu nhiên 256 bit trong Authorization. Không đưa cookie Steam lên web hoặc Cloudflare.
Mã được lấy qua IPC của cửa sổ main; fragment ghép đôi được xóa khỏi URL trước khi dựng giao diện.
Chỉ các lệnh liệt kê trong dispatcher được nhận. Không nhận URL proxy tùy ý, đường dẫn đọc file
tùy ý, lệnh cài token/cookie, shell hoặc plugin hệ thống từ website.

Ảnh bản đồ và mô hình đã cache được cấp ID riêng, tải qua request có xác thực rồi chuyển thành
blob URL trong trình duyệt. Hàng đợi sự kiện giới hạn 256 mục; web đọc mỗi 500 ms. Polling ERA
vẫn dùng vòng hiện có trong ứng dụng, không tạo thêm vòng lấy bản đồ ERA cho từng tab trình duyệt.

## Tự sát nhân vật

Nguồn kiểm tra ngày 06/09/2026: script nhúng trong https://eragamingvn.net/live-map.

- Đọc `GET /api/theisle/map?action=suicide-status`.
- Chỉ cho phép khi available và identityReady đều true, cùng identitySource `player-cache`
  hoặc identityAgeSeconds từ -1 đến 3 giây theo hợp đồng client ERA.
- Người dùng phải xác nhận; backend đọc lại trạng thái ngay trước khi gửi.
- Gửi `POST /api/theisle/map` với `X-Era-Action: self-suicide` và `X-Era-Operation-Id` UUID mới.
- Khóa gửi đồng thời và chờ tối thiểu 10 giây. Không tự lặp POST khi lỗi mạng.
- Chỉ báo ERA đã nhận yêu cầu; không suy ra nhân vật đã chết từ phản hồi tiếp nhận.

## Kiểm tra và phát hành

`npm.cmd run check` và `npm.cmd run build` kiểm tra/build giao diện. Build Windows theo
`scripts/build-local.ps1 -Release`. Test Rust chạy trên toolchain portable của dự án.

`node scripts/qa-web-transport.mjs` kiểm tra HTTP giả lập, xác nhận/hủy tự sát, cooldown,
Garage, Skin Studio, bản đồ, kết nối đứt và bố cục 900px. Không gửi thao tác game thật.

`node scripts/qa-web-native.mjs` kiểm tra bridge thật qua CDP cục bộ trong phiên QA,
chỉ đọc dữ liệu. `--deployed` kiểm tra web đã phát hành. Không bật CDP khi mở bản dùng hằng ngày.

Giữ nguyên giới hạn nguồn dữ liệu: chưa có API thú/cá sống hoặc dino lạ trong 1.000 m.
Các điểm cây/thú trên Atlas vẫn là dữ liệu tĩnh. Không coi kiểm thử giả lập là nghiệm thu
thao tác chết/lưu/nhận/xóa/đổi skin trên nhân vật thật.
