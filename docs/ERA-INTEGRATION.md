# ERA Gaming VN — hợp đồng tích hợp

Kiểm tra nguồn công khai ngày 05/09/2026:

- https://eragamingvn.net/live-map
- https://eragamingvn.net/live-map/assets/live-map-friends.js?v=20260826-load-recovery-v1
- https://eragamingvn.net/live-map/assets/live-map.js?v=20260826-garage-safety-vi-v1
- https://eragamingvn.net/assets/server-card-links-base.js?v=20260824-live-map-base-v1

## Kết nối và quyền

Đăng nhập Steam tại `/api/auth/steam`. `/api/me` trả lỗi yêu cầu Steam khi chưa
đăng nhập. App mở cửa sổ `era-session` với WebView2, dùng cookie store của chính
app. Cookie chỉ được backend gửi về ERA; không đưa ra frontend, log hoặc clipboard.
Cửa sổ ERA không được cấp capabilities của cửa sổ local `main`.

Backend cố định origin HTTPS và allowlist action; không cung cấp proxy URL tùy ý.
Không theo redirect khi gửi request có cookie. Điều hướng cửa sổ chỉ đến ERA và
các host Steam đăng nhập trên HTTPS cổng 443.

## Bạn bè

| Thao tác | Request |
|---|---|
| Danh sách | GET `/api/theisle/map?action=friends` |
| Tìm online | GET `/api/theisle/map?action=friend-search`, header `X-Era-Friend-Query-B64`: tên UTF-8 rồi base64 |
| Gửi lời mời | POST `/api/theisle/map`, `X-Era-Action: friend-request` |
| Nhận/từ chối | Cùng POST, action `friend-accept` / `friend-decline` |
| Hủy lời mời/xóa bạn | Cùng POST, action `friend-cancel` / `friend-remove` |

Các POST dùng header `X-Era-Friend-SteamId`. Chỉ chấp nhận Steam ID gồm 17–19 chữ số.
Thành công cần `success: true`. Danh sách gồm `friends`, `incoming`, `outgoing`;
tìm kiếm trả `players`; mỗi người có `steamId`, `name`, có thể có `online`, `class`.
Không gửi mutation tự động: chỉ nút người dùng bấm mới gọi. Xóa bạn có xác nhận.

Refresh danh sách 60 giây khi tab hiển thị; lúc chờ đăng nhập kiểm tra 5 giây,
tối đa 3 phút. Chặn request trùng trong UI. Không thử lại POST tự động.

## Các tính năng khác

- Live Map: GET `/api/theisle/map`; `serverOnline`, `playerOnline`, `player`, `friends`.
  Client ERA refresh khoảng 12 giây và backoff khi lỗi. Cần mẫu của người dùng để
  xác nhận trục/đơn vị trước khi đưa tọa độ vào minimap native.
- Garage: `/api/theisle/garage`; workflow server riêng, chưa tích hợp native.
- Skin: `/api/theisle/skin`; ERA UI công bố 7 vùng, thời gian chờ 5 phút. Không
  coi là tương đương bộ 10 vùng của ứng dụng đối chiếu.
- Nút mở bảng ERA sử dụng **trang ERA thật** trong webview, cùng phiên Steam.
  Đây là đường truy cập chức năng web, chưa phải việc hoàn thành module native.
- ERA có HUD+VOICE riêng trên trang chủ. Chưa tải/chạy hoặc coi đây là code của app mình.

## Kiểm thử

`node scripts/qa-era.mjs` dùng IPC fixture trong Chromium: luồng chưa đăng nhập,
kết nối, tìm tên tiếng Việt, gửi và nhận lời mời, cửa sổ 900px, lỗi mạng, hết phiên.
Không gửi tin nhắn hay lời mời thật. Ảnh nằm trong `docs/qa-output/` (gitignored).
Test Rust trong `era.rs` kiểm tra allowlist URL/action.
Phải thử Steam/ERA thật và hai tài khoản trước khi ghi nhận tích hợp end-to-end đạt.
# Sửa Garage ERA — 05/09/2026

## Hợp nhất bản đồ

Bỏ màn hình chọn bản đồ chiến thuật/HD; App chỉ dựng FullMap. Atlas được đưa về cùng calibration đang chọn bằng nghịch đảo affine coordLocator ở backend. Nền HD dùng GridLayer canvas tải từng tile và biến đổi về cùng khung; ảnh dự phòng nằm dưới. Sáu nhóm Atlas xuất hiện trong bảng lớp chung, dùng cùng patch settings và thao tác bật/tắt/hoàn tác. Đồng đội, tìm địa danh, điểm hẹn và dẫn đường giữ trong cùng màn hình. Có nút nền HD/dự phòng nhưng không tạo bản đồ hay bộ thao tác thứ hai.

QA: Svelte 0 lỗi/cảnh báo; trình duyệt xác nhận một Leaflet map, có tile HD đã tải và bảng lớp/công cụ chung; đã xem ảnh. Cần đối chiếu địa danh trong game để nghiệm thu độ khớp calibration giữa các nguồn ảnh.

## HUD bổ sung và Atlas HD

Trang Khủng long bổ sung hungerPercent/thirstPercent, exactVitals cho health/stamina/hunger/thirst và cao độ Z (cm sang mét). Chỉ hiển thị cặp hiện tại/tối đa hữu hạn, không âm, tối đa dương và không lệch phần trăm tham chiếu quá 5 điểm; null không chuyển thành 0. Đây là các trường client HUD ERA hỗ trợ, phụ thuộc payload thực tế từng phiên.

Tab Bản đồ có lựa chọn ERA HD · 16K riêng, dùng tiles RaidAtlas 256px, zoom native 0–6 trên canvas 16384px; affine coordLocator từ dữ liệu ERA dùng để chiếu người chơi/đồng đội. Sáu nhóm lớp từ snapshot Atlas: địa danh, địa điểm, thú tĩnh, cây, vùng, spawn. Dữ liệu Atlas lấy qua backend cố định URL, không mang cookie; cache trong phiên. Nhãn dùng textContent. HD không thay calibration của bản đồ chiến thuật/minimap; dẫn đường, waypoint tiếp tục ở bản đồ chiến thuật. Lỗi tải tile có thông báo chuyển về bản đồ đã lưu.

Kiểm thử: Svelte 0 lỗi/cảnh báo; HUD fixture xác nhận đói/khát và 825 / 1.000; kiểm tra exactVitals null/0/sai lệch; HD tải tile thật, đủ 6 nhóm và không lỗi JavaScript. Đã xem ảnh QA. Chưa đối chiếu tọa độ Atlas/chỉ số với game online thực tế.

## Nhãn dino và công cụ sinh tồn

Nhãn đồng đội hai dòng: tên giới hạn chiều rộng, dòng nhỏ `Rex · G 85% · HP 72%`. Chỉ truyền growthPercent/healthPercent ERA cung cấp; không suy ra máu từ tăng trưởng, null hiện `—`, số 0 vẫn là `0%`. G là phần trăm phát triển, không phải kích thước vật lý. Tên loài có alias ngắn, hover có thông tin đầy đủ.

Nút Dẫn tới chọn đồng đội cho minimap: mũi tên rìa nếu ngoài bán kính, vòng đánh dấu khi trong bán kính; tên và khoảng cách đường thẳng. Khi đồng đội mất vị trí hoặc dữ liệu quá 5 giây, dừng hiển thị hướng. Nước/Muối/Bùn gần nhất chọn điểm có tọa độ hợp lệ trong dữ liệu POI, lưu đích dẫn đường và hiện lớp tương ứng; không tuyên bố đường đi tránh địa hình. Dừng dẫn xóa đích đã chọn. Ba chế độ Sinh tồn/Đi nhóm/Khám phá thay lớp bằng một patch; hoàn tác khôi phục cả lớp trước đó dùng giá trị mặc định.

QA fixture đạt: nhãn Rex/G85/HP72, tìm không dấu, chọn đồng đội, chọn nước 100m thay vì 500m, đổi chế độ/hoàn tác, waypoint, xóa vị trí cũ, giao diện 900px. Kiểm thử phép hướng Bắc/Đông, khoảng cách 500m, null/0 và viết tắt loài đạt. Chưa đối chiếu máu đồng đội hoặc mũi tên với game thật.

## Live Map 1 giây và đồng đội — cập nhật mới nhất

Theo yêu cầu người dùng, chu kỳ mục tiêu đổi thành 1 giây giữa các lần bắt đầu request thành công; không gọi chồng nếu phản hồi lâu hơn. Tái sử dụng HTTP client/kết nối. Khi lỗi, tự lùi 5–60 giây; 401 chờ 30 giây; 429 tôn trọng Retry-After (số giây hoặc ngày HTTP, tối đa 24 giờ). Đây là nhịp lấy dữ liệu của app, không bảo đảm RCON ERA đo mới mỗi giây. Badge hiện nhịp hiện tại, tuổi nhận và thời gian phản hồi. Ngưỡng cũ đổi từ 30 xuống 5 giây.

Live Map thêm nền Gateway 2026/MyIsleMap mà client ERA sử dụng, mặc định trên khung Vulnona; có chuyển về nền cục bộ và tự quay về khi tải ảnh lỗi. Lựa chọn ảnh nền này áp dụng cho bản đồ lớn; minimap giữ ảnh cục bộ. Các nền Islemaps giữ nguyên calibration, không kéo giãn ảnh ERA sang khung khác.

Đồng đội có vị trí hợp lệ được chiếu bằng calibration Rust đang chọn; cập nhật marker tại chỗ, tìm tên không dấu, sắp theo khoảng cách, bám một người, xem cả nhóm, về bản thân, bật/tắt tên/vị trí, lưu điểm hẹn tại tọa độ hiện tại. Điểm hẹn là waypoint tĩnh của người dùng, không phải gửi ping đến server. Minimap thêm chấm tím viền trắng cho đồng đội. Quá 5 giây không có dữ liệu mới sẽ bỏ marker đồng đội và dừng bám. Bảng đồng đội và bảng lớp/waypoint có thể thu gọn. Bố cục/nút theo Linear, giữ màu Gateway.

QA fixture: marker, tìm không dấu, khoảng cách 500m, bám theo, tọa độ waypoint và xóa marker cũ đạt; dino hết hạn sau 5 giây đạt. Bốn unit test ERA đạt, gồm backoff và calibration. Chưa xác nhận ngang/vượt toàn bộ Live Map ERA hoặc độ trễ RCON trong game thật.

Native đã mở bản cập nhật ở tab Bản đồ: nền ERA/MyIsleMap tải thành công, một đồng đội online có marker/tên và nút bám/điểm hẹn; server báo bản thân offline. Badge hiển thị chu kỳ 1s, một mẫu phản hồi 41ms. Con số 41ms là một quan sát, không phải benchmark hay tuổi dữ liệu đo trong game. Ảnh QA nội bộ: `docs/qa-output/era-map-native.png`.

## Cập nhật vị trí và thông số ERA

Backend có một vòng lấy `/api/theisle/map` dùng chung cho các cửa sổ, tiếp tục khi cửa sổ chính ẩn. Chu kỳ 12 giây theo client công khai ERA, tự lùi 20–60 giây khi lỗi, không gửi request chồng. Đăng nhập hoàn tất đánh thức vòng lấy dữ liệu. Đây là polling, **chưa phải realtime từng giây** và thời điểm nhận không chứng minh thời điểm đo từ RCON.

Đảo trục RCON ERA (X ngang, Y dọc) sang Asset Location trước khi đưa vào pipeline chung của bản đồ/minimap/trail. Kiểm thử đối chiếu phép chiếu với công thức Gateway 2026 của ERA. Nếu người dùng đã chọn vị trí IslePilot, không ghi đè vị trí đó bằng ERA.

Tab Khủng long mặc định ERA: máu, thể lực, tăng trưởng; giá trị thiếu hoặc dữ liệu quá 30 giây hiện dấu gạch. Minimap có dòng HP/STA và tuổi dữ liệu; bản đồ lớn có trạng thái ERA. Các chỉ số đó chỉ phản ánh payload nhận từ ERA; chưa xác minh độ trễ trong game thật. Đói/khát chưa có nguồn được xác minh. Nút bật/tắt overlay ở trang ERA và Khủng long dùng thiết lập minimap hiện có.

Kiểm tra: Svelte không lỗi/cảnh báo; 3 unit test ERA đạt, gồm đổi trục và calibration; UI fixture đạt cho số liệu mới/cũ, Garage, bạn bè và giao diện 900px. Chưa nghiệm thu realtime, đối chiếu chỉ số trong game hoặc đo hiệu năng phiên chơi dài.

Kiểm tra cửa sổ native sau phát hành cục bộ: nhận được phản hồi map ERA bằng phiên đăng nhập hiện có, trạng thái `Dino offline` và tuổi nhận dữ liệu tăng; thông số hiện dấu gạch đúng trạng thái. Chưa có dino online để đối chiếu tọa độ/chỉ số.

Tab Garage mặc định gọi `/api/theisle/garage` của ERA và dùng chung cookie Steam ERA trong WebView2. Có nút chuyển sang Garage IslePilot. Giao diện ô lưu theo khoảng cách và bo góc Linear, giữ màu Gateway hiện có.

Hiển thị loài, tăng trưởng, giới tính, Prime và mutation; khóa thao tác khi offline, dữ liệu cũ hoặc đang xử lý. Lưu/nhận/xóa có xác nhận; xóa ràng buộc ô và state hash. Lệnh bất đồng bộ chờ job ERA hoàn tất, không tự gửi lại POST khi mất mạng.

Đã kiểm tra UI bằng fixture: mặc định ERA, ô trống không có trong danh sách, offline/khóa, lỗi mạng giữ dữ liệu cũ. Hai kiểm thử Rust về giới hạn URL/action và xác nhận xóa đã đạt. Chưa xác minh Garage tài khoản thật hoặc thực hiện lưu/nhận/xóa trên server thật.
