# Hướng dẫn cài CleanTube trên iPhone (Safari) & Android

CleanTube là userscript **100% miễn phí cho cộng đồng**, chạy trực tiếp trên trình duyệt gốc (Safari trên iPhone, Firefox / Edge trên Android) — không qua máy chủ trung gian, không thu thập dữ liệu, tôn trọng tài khoản YouTube thật của bạn.

---

## Phần 1: Cài đặt trên iPhone / iPad (iOS Safari)

### Bước 1: Tải app Userscripts (miễn phí, mã nguồn mở)
1. Mở **App Store** trên iPhone.
2. Tìm kiếm ứng dụng tên **Userscripts** của tác giả **Justin Wasack (`quoid`)** (biểu tượng chữ `</>`).
3. Nhấn **Nhận (Get)** để cài đặt. Ứng dụng hoàn toàn miễn phí và không chứa quảng cáo.

### Bước 2: Chép file `cleantube.user.js` vào thư mục Userscripts
1. Tạo một thư mục mới trong app **Tệp (Files)**, ví dụ: `iCloud Drive/CleanTube` hoặc `Trên iPhone/CleanTube`.
2. Tải hoặc chép file `dist/cleantube.user.js` vào thư mục vừa tạo.
3. Mở app **Userscripts** → nhấn **Set Userscripts Directory** → chọn đúng thư mục `CleanTube` đó.
   - *Mẹo nhanh:* Bạn cũng có thể mở file `cleantube.user.js` trực tiếp bằng Safari hoặc app Tệp và chia sẻ vào **Userscripts**.

### Bước 3: Bật phần mở rộng trong Cài đặt Safari
1. Mở **Cài đặt (Settings)** trên iPhone → cuộn xuống chọn **Safari** (trên iOS 18: **Ứng dụng → Safari**).
2. Chọn **Phần mở rộng (Extensions)** → nhấn vào **Userscripts**.
3. Bật công tắc **Cho phép phần mở rộng**.
4. Bên dưới mục **Quyền**, chuyển `youtube.com` và `m.youtube.com` sang **Luôn cho phép (Always Allow)** để CleanTube tự chạy mỗi khi bạn mở YouTube.

### Bước 4: Tạo nút mở 1 chạm ngoài Màn hình chính (bằng Phím tắt)
1. Mở app **Phím tắt (Shortcuts)** có sẵn trên iPhone → nhấn dấu **`+`** ở góc trên phải để tạo phím tắt mới.
2. Chọn **Thêm tác vụ (Add Action)** → tìm **Mở URL (Open URLs)**.
3. Nhập địa chỉ: `https://m.youtube.com`
4. Nhấn mũi tên bên cạnh tên phím tắt (hoặc nút Chia sẻ ở dưới) → chọn **Thêm vào Màn hình chính (Add to Home Screen)** → đặt tên là `YouTube` hoặc `CleanTube` rồi nhấn **Thêm**.

> **Tại sao nên dùng Phím tắt thay vì nút "Thêm vào MH chính" của Safari?**  
> Khi dùng nút *Thêm vào Màn hình chính* mặc định của Safari, iOS mở trang ở chế độ Web App độc lập và **không nạp phần mở rộng (Userscripts)**. Tạo phím tắt *Mở URL* sẽ mở thẳng bằng Safari thật nên toàn bộ tính năng chặn quảng cáo, phát nền và hẹn giờ của CleanTube hoạt động đầy đủ.

### Bước 5: Mẹo xem gọn gàng như app gốc
- Khi đang ở `m.youtube.com` trong Safari, bấm vào biểu tượng bên trái thanh địa chỉ (biểu tượng **`AA`** hoặc nút menu trang) → chọn **Ẩn thanh công cụ (Hide Toolbar)** để thu gọn thanh trình duyệt.
- Khi xem video, bấm nút toàn màn hình hoặc xoay ngang điện thoại; nút tròn **CleanTube** ở góc dưới phải luôn gọn gàng và có thể bật **Cửa sổ nổi (PiP)** hoặc **Hẹn giờ tắt ngủ** bất cứ lúc nào.

---

## Phần 2: Cài đặt nhanh trên Android

Trên Android bạn có thể dùng chính file `dist/cleantube.user.js` với trình duyệt hỗ trợ extension:

1. Cài **Firefox** hoặc **Microsoft Edge Canary** từ Google Play.
2. Trong mục **Tiện ích mở rộng (Extensions / Add-ons)** của trình duyệt, cài **Violentmonkey** hoặc **Tampermonkey**.
3. Mở bảng điều khiển của Violentmonkey/Tampermonkey → chọn **Tạo mới / Nhập từ tệp (Import)** → chọn file `dist/cleantube.user.js` và bật lên.
4. Truy cập `https://m.youtube.com` — nút **CleanTube** sẽ xuất hiện ở góc dưới bên phải.
