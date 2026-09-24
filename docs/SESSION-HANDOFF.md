# Bàn giao 05/09/2026

## HUD 60 Hz và hai cửa sổ độc lập

`frameBudget` mặc định đã nâng lên 60 Hz và đi thẳng vào requestAnimationFrame ở
mức 60 để không lỡ v-sync thành 30 Hz. FullMap smooth-wheel, mũi tên và minimap dùng
ngân sách mới; luồng ERA vẫn polling mục tiêu 1 giây cho cả player và friends.

Minimap chỉ còn vẽ bản đồ. Ô HP/đói/khát/stamina/growth và Prime quest chạy trong
cửa sổ `dino-hud` riêng từ `dino-hud.html`. Cả hai cửa sổ kéo độc lập khi bật
free_position và tắt click_through; góc vàng gọi resize native Win32. Event move/resize
được debounce 350 ms rồi mới lưu settings, tránh ghi đĩa trong từng bước kéo. Vị trí
ô chỉ số nằm ở `dino_hud.desktop_x/y`, chiều rộng ở `dino_hud.width_px`.

Kiểm tra đạt: Svelte 0 lỗi/0 cảnh báo; Rust 65 đạt, 9 bỏ qua; qa-frame-budget xác
nhận 60 Hz; qa-smooth-wheel, qa-dino-hud, qa-hud-settings, qa-minimap-navigation,
qa-minimap-era-panel và qa-era-map đạt. Chromium map proxy trung bình 52,4 FPS dưới
tải QA, không phải cam kết FPS trong game.

Sửa tiếp sau phản hồi thực tế: `era_live_state` trước đó từ chối label `dino-hud`,
nên cửa sổ mới chỉ có dấu “—” khi chưa nhận event. Đã cho label này đọc snapshot,
thêm đồng bộ snapshot cục bộ 1 giây, watchdog WebView và fallback exactVitals.
Rust hiện 66 đạt, 9 bỏ qua; QA kiểm tra snapshot lặp và exact health 75/100 đạt.
Ảnh native thật `docs/qa-output/dino-hud-native-fixed.png` xác nhận HP 100%, đói 80%,
khát 76%, stamina 89%, growth 29%. EXE phát hành 26.133.504 byte, SHA256
`54EB6CABB729D9F1D0F37696A47BD6C237D3971256A7FB37B88BD40EA9EF04DB`, hash trùng
build; backup `.tools/Hey-Guys-Overlay-before-hud-vitals-fix.exe`.
Release đã cập nhật tại `phat-hanh/Hey-Guys-Overlay/Hey-Guys-Overlay.exe`,
26.131.968 byte, SHA256 `BC7AC22E887412A144463B7F6F796E00AA74171461485AFE5366524322812D59`.
Native smoke test thấy hai HWND riêng: minimap 270×270 tại (2,7), dino-hud 280×92
tại (320,80); khi cửa sổ chính ẩn, cả hai đều visible. Bản dự phòng:
`.tools/Hey-Guys-Overlay-before-60hz-split-hud.exe`.

## Skin Studio

Đã thêm tab Skin Studio vào app chính. Tab tự nhận class từ ERA và ánh xạ Rex/T-Rex
sang Tyrannosaurus, dựng model 3D mặc định, xem trước bảy vùng màu, có ba preset dùng
được với bảng màu miễn phí, hỗ trợ màu HEX tự do khi ERA trả quyền tương ứng. Có đúng
ba ô lưu localStorage; mở lại app vẫn còn. Nút Áp dụng gọi POST `/api/theisle/skin`
với bảy màu rồi poll operation tối đa 18 giây; không tự gửi khi lưu hay xem trước và
bị khóa khi dino offline, hết quyền hoặc còn cooldown.

Kiểm tra đạt: Svelte 0 lỗi/0 cảnh báo; Rust 65 đạt, 9 bỏ qua; QA Skin Studio đạt
nhận Rex, giao diện preview, lưu/mở lại đủ ba ô và payload bảy HEX bằng IPC giả lập.
Ảnh: `docs/qa-output/skin-studio.png`.
Release đã build và thay vào `phat-hanh/Hey-Guys-Overlay/Hey-Guys-Overlay.exe`,
26.088.960 byte, SHA256 `6FC973C013EC4FD59EE92CCCC0E8FA9934CC4EBAFB49151D06BB54F1358D264D`;
hash trùng file build và process mới đã khởi động. Bản dự phòng trước Skin Studio:
`.tools/Hey-Guys-Overlay-before-skin-studio.exe`.

## Trạng thái cuối phiên — đã lưu theo yêu cầu người dùng

Người dùng đã nhận bản sửa, cảm ơn và chuẩn bị tạo session mới. Không còn tác vụ build đang chờ. Source đã lưu trên đĩa; chưa commit/push. Không tự làm lại những phần đã hoàn tất hoặc tạo thêm màn hình bản đồ riêng.

Bản portable mới nhất đã copy và mở sau đợt audit: `phat-hanh/ERA-preview/Gateway-Companion.exe`, 26.011.648 byte, mtime 05/09/2026 15:46:33 giờ máy. Kiểm tra cuối yêu cầu lưu không thấy process Gateway-Companion đang chạy; không cần tự mở trong thao tác lưu, nhưng người dùng đã cho phép mở lại khi cần kiểm tra app.

Ảnh kiểm tra native mới nhất: `docs/qa-output/map-audit-native.png`. Đã thấy nền HD và lớp cây tải được, app phản hồi; lúc kiểm tra ERA báo dino offline, không có đồng đội chia sẻ vị trí online. Cảnh báo trùng hotkey với ứng dụng khác vẫn tồn tại; chưa xử lý bằng cách dừng app gốc.

Tính năng đã làm: ERA Steam/bạn bè/Garage; polling bản thân và bạn bè mục tiêu 1s có backoff; nhãn đồng đội loài viết tắt/G%/HP%; HUD đói/khát, exactVitals khi đủ, Z; minimap chỉ hướng đồng đội hoặc tài nguyên đã chọn; nước/muối/bùn gần nhất; chế độ Sinh tồn/Đi nhóm/Khám phá có hoàn tác; một FullMap với HD Atlas, cây/thú tĩnh/vùng/spawn, lớp cũ, điểm hẹn và đường đi.

Giới hạn phải giữ: nhịp request 1s không đảm bảo tuổi dữ liệu RCON; chỉ số thiếu là dấu gạch, không tạo số giả. Không có nguồn thú/cá sống, trạng thái cây đã ăn hay danh sách dino lạ trong 1000m. Người dùng nói admin ERA đồng ý nhưng chưa cung cấp endpoint/plugin/credential. Đã rà script công khai, chưa tìm thấy nguồn đó; không hỏi lại sự cho phép, chỉ cần thông tin kỹ thuật nếu tiến hành tích hợp. Chưa nghiệm thu vị trí/HP trong game thật, không tuyên bố vượt toàn bộ đối thủ.

## Kiểm tra bản đồ bổ sung

Đã phát hiện và sửa: ảnh Atlas top-origin cần đảo Y so với dữ liệu bottom-origin (client ERA live-map-atlas-v3-yfix.js); thiếu 185 vùng circle/ellipse/rectangle/point do chỉ đọc points_json; cache Promise tải tile thất bại gây lỗi lặp lại khi bật HD; dùng label_text để lấy đúng tên địa danh. Geometry ở src/lib/atlas-geometry.ts. Tile bị tháo khi zoom/chuyển nền không được phát lỗi từ callback cũ.

Kiểm thử mới scripts/qa-atlas-geometry.mjs (node --experimental-strip-types): đảo trục, bán kính, rotation và đủ 212 vùng đạt. scripts/qa-era-hd.mjs: chuyển tab 3 lần, lỗi tile có fallback và bật lại HD thành công. scripts/qa-era-map.mjs và npm.cmd run check đạt. Release build session17697 hoàn tất; cập nhật bản portable ở cuối lượt kiểm tra. Chưa đối chiếu vị trí người chơi với game thật.

Người dùng muốn một bản đồ duy nhất; đã đổi App.svelte về FullMap, hợp nhất nền Atlas HD và sáu nhóm dữ liệu Atlas vào bảng lớp chung, giữ đồng đội/dẫn đường/điểm hẹn/công cụ sinh tồn. Không dùng MapPage/AtlasMap tách màn hình nữa (file cũ còn nhưng không được App import).

Nguồn và giới hạn xem ERA-INTEGRATION.md. Live polling mục tiêu 1s, backoff khi lỗi/429. Chưa có endpoint vị trí thú sống hoặc dino lạ. Điểm thú/cây Atlas là tĩnh. Không tuyên bố realtime server hoặc vượt toàn bộ đối thủ.

Kiểm tra đạt: npm.cmd run check; scripts/qa-era-map.mjs; scripts/qa-era-hd.mjs (đã đổi thành kiểm tra bản đồ hợp nhất). Đã xem docs/qa-output/era-unified.png. Tile HD chuyển affine về calibration chung; vẫn cần đối chiếu địa danh thực tế trong game.

Build portable: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-local.ps1 -Release. Rust portable ở .tools; script tự cấu hình. Executable build: src-tauri/target/release/theisle-overlay.exe. App người dùng: phat-hanh/ERA-preview/Gateway-Companion.exe, kèm DLL đã có. Người dùng đã cho phép tự đóng/cập nhật/mở lại app này. Chỉ dừng process có Path đúng executable này, chờ thoát trước khi copy; không dừng app overlay gốc.

Build audit cuối cùng 17697 đã hoàn tất thành công và đã copy exe release sang app portable rồi khởi chạy kiểm tra. Không cần build/copy lại nếu chưa thay đổi code. Không ghi đè thay đổi khác; repo đã dirty từ các phiên trước, chưa commit. Git dùng -c safe.directory=F:/Project/112_Quanly/theisle-overlay.

Giao diện dùng quy cách Linear trong thư viện 130_Design_MD, giữ màu Gateway. Hướng dẫn workspace phải đọc README trước khi tìm file. Không cần hỏi lại quyền cập nhật app.

## Cập nhật thương hiệu Hey Guys
Tên ứng dụng: Hey Guys Overlay. Thông tin phát triển: Thanh Chillil · Hey Guys Team. Bản mới: phat-hanh/Hey-Guys-Overlay/Hey-Guys-Overlay.exe; kèm hai DLL, thư mục Logo (SVG màu, SVG đơn sắc, PNG 1024 và ICO), HUONG-DAN.txt. Logo được vẽ bằng đường nét SVG từ ảnh tham chiếu của người dùng. Trang Giới thiệu thay mục ủng hộ cũ, giữ ghi nhận nguồn nền tảng riêng. Giữ identifier và đường dẫn AppData để bảo toàn thiết lập.
Kiểm tra: Svelte 0 lỗi/0 cảnh báo; build release thành công; giao diện Việt/Anh, logo, bố cục 900px, không lỗi trình duyệt đều đạt qua IPC giả lập. EXE phát hành trùng SHA256 với build. Chưa kiểm thử lại trong game. Cảnh báo Vite về chunk Three.js lớn vẫn có. Ảnh QA: docs/qa-output/hey-guys-about-vi.png.


## Tối ưu tương tác bản đồ
Đã chuyển lớp vector sang Canvas, tăng vùng đệm kéo bản đồ; nền HD không cập nhật giữa các bước zoom, giữ thêm tile lân cận và giải mã ảnh bất đồng bộ. Nhãn đồng đội chỉ tạo lại khi nội dung đổi, không di chuyển/vẽ lại marker đứng yên. Bộ frameBudget gộp yêu cầu minimap và mũi tên bản đồ tối đa 30 lần/giây; không khóa FPS của compositor/Leaflet.
Kiểm tra đạt: npm run check (0 lỗi, 0 cảnh báo); qa-frame-budget, qa-era-map, qa-era-hd, qa-minimap-navigation. Bài qa-map-performance với Atlas và IPC giả lập: trung bình RAF 45,3 FPS, p95 16,8 ms, 3 khoảng khung >50 ms; chưa đo khi chạy cùng game. Build release thành công, còn cảnh báo chunk Three.js lớn. Đã cập nhật và khởi động lại phat-hanh/Hey-Guys-Overlay/Hey-Guys-Overlay.exe; hash khớp build. Bản dự phòng trước tối ưu: .tools/Hey-Guys-Overlay-before-performance.exe.


## Zoom liên tục, chuyển tab và HUD tự do
Đã thêm smooth-wheel.ts: tắt wheel zoom mặc định Leaflet, phóng mapPane bằng transform theo ngân sách 30 FPS, chốt setView một lần khi dừng; giữ điểm dưới chuột, xử lý kéo/cancel/tab ẩn. Map giữ kích thước khi đổi tab. Garage ERA giữ cache 30 giây (thao tác mutation vẫn refresh và giữ điều kiện an toàn); viewer IslePilot giữ khi ẩn, 30 FPS, texture nhường luồng chính mỗi khoảng 4 ms.
Cấu hình người dùng trước đó bật IslePilot enabled/use_map_position=true nên ERA không nạp vị trí. Thêm position_source mặc định era, chặn mọi đường IslePilot nạp tọa độ khi không được chọn. Chuẩn hóa tọa độ ERA dạng chuỗi số và steamId số. Hiện tên mình trên bản đồ lớn, tên bạn trên minimap và trạng thái lỗi/offline. Chỉ số HUD ERA tách nguồn khỏi IslePilot và hiển thị — khi không mới.
HUD thêm free_position, desktop_x/y, hide_with_app, show_names, drag_hud. Nút đặt ngoài game bật HUD và tắt require_game/hide_with_app/click_through; kéo native lưu qua WindowEvent::Moved. Đã kiểm tra native HUD hiện ở desktop khi không chạy game và lưu thay đổi vị trí. Thiết lập thực tế đã bật nguồn ERA + HUD tự do; backup settings.before-free-hud.json trong AppData. Không lấy hoặc xuất cookie/token.
Kiểm tra: qa-smooth-wheel (12 wheel -> một commit, sai lệch anchor 0), qa-skin-yield, qa-hud-settings, qa-tab-cache, qa-era-map/garage/hd, qa-minimap-navigation; bài zoom/kéo đo RAF ~29,9 FPS, p95 33,5 ms, không khoảng >50 ms. Native app đã đọc danh sách 4 bạn ERA; máy không chạy game nên chưa nghiệm thu tọa độ mình/đồng đội online. Remote CDP không kết nối được; không coi các kiểm tra IPC giả lập là nghiệm thu game thật. Ảnh HUD native trước sửa panel còn thanh IslePilot cũ, không dùng làm bằng chứng bản cuối.
Không sửa mã firmware, chưa commit/push. Bản phát hành vẫn phat-hanh/Hey-Guys-Overlay/Hey-Guys-Overlay.exe.

Bản cuối sau sửa thanh chỉ số HUD: build release đạt; Svelte 0 lỗi/0 cảnh báo; Rust 64 đạt, 9 bỏ qua có chủ đích; qa-minimap-era-panel đạt nhãn % và —. EXE phát hành đã cập nhật, SHA256 khớp build; khởi động không kèm cổng debug. Còn cảnh báo chunk Three.js lớn từ trước.


## Bản web và tự sát nhân vật — 06/09/2026

Đã tìm lại lịch sử Codex theo yêu cầu người dùng và dùng đúng mã nguồn Hey Guys Overlay.
Bản web lấy giao diện Svelte hiện có, không dùng bản mô phỏng Cloudflare trước đó.
Xem docs/WEB-COMPANION.md để biết kiến trúc và cách chạy.

Cầu nối axum chỉ nghe 127.0.0.1:17864, origin heyguys-dashboard.pages.dev, mã ghép đôi 256 bit,
allowlist RPC, asset ID riêng; cookie Steam giữ trong WebView2. Nút Mở bản web trong app cấp
fragment ghép đôi; web xóa fragment, giữ mã trong sessionStorage. Web cần app trên cùng máy.

Tự sát đã tìm thấy trong script nhúng của trang ERA /live-map (không nằm trong file JS ngoài):
GET map?action=suicide-status; POST map với X-Era-Action self-suicide và operation ID.
Có xác nhận, kiểm tra identity mới ở backend, khóa đồng thời/cooldown 10 giây, không tự lặp POST.
Chưa gửi thao tác tự sát, Garage hoặc đổi skin lên nhân vật thật.

Kiểm tra đã đạt: Svelte 0 lỗi/0 cảnh báo; Rust 69 đạt, 9 bỏ qua; qa-web-transport đạt ghép đôi,
xác thực HTTP, sự kiện trực tiếp, HUD, hủy/xác nhận/cooldown tự sát, Garage khóa offline,
payload Skin Studio, bản đồ hợp nhất, 900px, mất kết nối. Build release thành công; còn cảnh báo
chunk Three.js lớn như trước. Giao diện giữ hệ thống hiện có theo Linear, màu Gateway.

Lệnh đóng/thay/mở app với CDP bị auto-review chặn (blocked by policy); không thực hiện lại bằng
đường vòng. Bản đang chạy chưa cập nhật. Đóng gói bản riêng trong phat-hanh/Hey-Guys-Overlay-Web.
qa-web-native.mjs đã viết nhưng CHƯA chạy; không coi fixture là nghiệm thu kết nối thật.
Web không hoạt động độc lập trên điện thoại; các slot skin localStorage chưa đồng bộ giữa app/web.

Phát hành web hoàn tất: https://heyguys-dashboard.pages.dev/ (deployment 07c106fa).
qa-web-deployed đạt HTTPS 200, đúng tiêu đề, trang ghép đôi, link tải, bố cục desktop/390px,
không lỗi JavaScript. EXE bản riêng SHA256 C33146E41F63BD09850DB7F070CB2689BE07FB5892194A5E4190CB3098478E9C.
ZIP công khai 9.167.804 byte. Chưa thay bản đang chạy do auto-review chặn thao tác cập nhật/mở app.

## Theo dõi Prime ERA — 06/09/2026

Đã thêm PrimeTracker vào tab Khủng long cho app/web, dùng trực tiếp player.prime từ luồng map
hiện có. Nguồn hợp đồng: /live-map/assets/live-map-vip.js?v=20260824-capacity-v1 của ERA.
Hiển thị completed/total, progress, C1–C10 theo id, tên server gửi, complete và eligible.
Không tự đánh dấu, không suy ra eligible từ số nhiệm vụ; dữ liệu thiếu hiện —, mất kết nối
hoặc quá 5 giây xóa dấu hoàn thành khỏi giao diện. Không tạo thêm polling ERA.
Phần này nằm trong trang Khủng long; HUD nổi ERA chưa bổ sung checklist.

Prime: npm check 0 lỗi/0 cảnh báo; build release thành công, còn cảnh báo chunk Three.js lớn. QA HTTP xác nhận 2/10, hai nhiệm vụ hoàn thành, điều kiện thiếu hiện —, mất kết nối xóa tiến độ cũ. Không kiểm thử Prime với nhân vật thật. Gói Hey-Guys-Overlay-Web đã cập nhật.

## HUD tiếng Việt, Prime và zoom minimap — 06/09/2026

HUD chỉ số dùng Máu, Thức ăn, Nước, Thể lực, Tăng trưởng. Bảng Prime C1–C10 tiếng Việt
ngắn gọn ghép dưới chỉ số trong cùng cửa sổ dino-hud; mặc định bật, có dino_hud.show_prime
để tắt. Kích thước ở bề ngang 280 là 258 px cao. Thiếu dữ liệu/mất kết nối không đánh dấu
hoàn thành. Nhãn theo thứ tự C1–C10 công bố trong live-map-vip.js của ERA.

Minimap thêm nút +/− và wheel, giới hạn bán kính 100–3000 m, chuyển động theo rAF dùng
ngân sách vẽ 60 Hz; lưu radius_m sau 350 ms để không ghi thiết lập mỗi khung hình.
Muốn thao tác chuột phải tắt click_through; đã thêm nút Cho phép bấm / zoom HUD ngay
trang Khủng long. HUD đang xuyên chuột sẽ không nhận wheel/click theo hành vi Windows.

Chu kỳ thành công ERA đổi từ 1 giây sang 2 giây theo yêu cầu. Điều này không tăng tốc
nguồn dữ liệu so với trước; chưa đo được tuổi vị trí do server RCON. Không thêm suy đoán
vị trí hoặc hứa dữ liệu server 60 Hz. Backoff mạng và 429 vẫn giữ nguyên.

QA prime-hud-zoom đạt nhãn Việt, 10 nhiệm vụ, reset khi stale, geometry 258px, nhiều bước
rAF và một lần lưu sau chuỗi zoom. QA web-transport đạt. Ảnh docs/qa-output/prime-hud-vi.png.
Chưa đo FPS khi chơi game thật hoặc thử thao tác native do hạn chế tự mở app trước đó.

HUD/zoom: release build thành công; Rust 69 đạt, 9 bỏ qua. Svelte 0 lỗi/0 cảnh báo. Gói EXE nằm trong Hey-Guys-Overlay-Web, chưa thay process đang chạy. Hash EXE: 579B6C58A7AF90B864D0EFE2A7EAE79BCBFB485BF40A812B05AC390EC73974BA.

Theo yêu cầu trực tiếp của người dùng: đã cập nhật EXE tại phat-hanh/Hey-Guys-Overlay/Hey-Guys-Overlay.exe, hash khớp bản Prime/zoom mới, giữ bản dự phòng .tools/Hey-Guys-Overlay-before-prime-zoom-update.exe; đã mở app bình thường, không bật cổng debug. Người dùng muốn tự cập nhật/mở app, không yêu cầu tải thủ công.

## 06/09/2026 — Rà soát và gia cố kết nối

Xem `docs/CONNECTION-REVIEW.md` để biết lỗi đã sửa, phạm vi kiểm thử và giới hạn.
Release build thành công; Svelte 0 lỗi/0 cảnh báo; Rust 69 đạt, 9 bỏ qua.
QA connection-policy, web-transport, prime-hud-zoom và web-deployed đạt.
Đã tự thay EXE người dùng đang sử dụng, giữ bản dự phòng, mở app bình thường và xác nhận Responding=True. Cầu nối thực trả 401 khi thiếu mã và 403 với origin lạ.
Đã phát hành web: https://e37e6a57.heyguys-dashboard.pages.dev ; index production heyguys-dashboard.pages.dev khớp build hiện tại. Chưa thử mất mạng trong phiên game ERA thực có đăng nhập.

## Trợ lý sinh tồn — triển khai 10 tính năng

Đã thêm trang Trợ lý, logic `src/lib/companion.ts`, HUD cảnh báo/la bàn, Prime ưu tiên, nhật ký/tổng kết/PNG, ba bố cục với Ctrl+Alt+L, và mở rộng so sánh skin. Chi tiết cách dùng và review tại `docs/COMPANION-RELEASE.md`.
Các kiểm thử companion logic/UI/HUD, web-transport, Prime/zoom cũ đều đạt; Svelte 0 lỗi/0 cảnh báo. Rust 69 đạt, 9 bỏ qua. Review sửa trục ERA, lệch nhịp đồng hồ UI, đánh dấu vị trí cũ, dữ liệu lịch sử hỏng, skin hết hạn và giới hạn dung lượng.

Bản phát hành Trợ lý đã build thành công và tự cập nhật/mở tại `phat-hanh/Hey-Guys-Overlay/Hey-Guys-Overlay.exe`; dự phòng `.tools/Hey-Guys-Overlay-before-companion.exe`. SHA256 `D9FA282F6D189583022A5417C89C6D32324603126B6D66D7B01A02292BC5394F`. Process mới phản hồi; cầu nối kiểm tra 401/403 đạt. Không chạy lệnh thay đổi game thật trong QA.
Web Trợ lý đã phát hành: https://a0426c68.heyguys-dashboard.pages.dev . Production index khớp build; QA web-deployed desktop/mobile, HTTP 200 và không lỗi trang đều đạt.
