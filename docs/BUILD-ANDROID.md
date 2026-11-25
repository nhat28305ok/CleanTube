# Hướng dẫn build & cài đặt CleanTube Android (APK độc lập)

Ứng dụng **CleanTube Android** (`android/`) là một ứng dụng Android độc lập hoàn toàn miễn phí, gói gọn trải nghiệm YouTube sạch mà không cần qua trình duyệt hay tiện ích mở rộng ngoài.

---

## Kiến trúc CleanTube Android

CleanTube Android kết hợp lõi userscript của CleanTube với các thành phần gốc (Native Android) để mang lại trải nghiệm mượt như ứng dụng chính chủ:

1. **WebView tối ưu cho `m.youtube.com`:** Chạy trực tiếp trên YouTube di động, giữ nguyên lịch sử xem, đăng ký kênh và thuật toán gợi ý tài khoản thật của bạn, tự động nạp file `android/app/src/main/assets/cleantube.user.js`.
2. **Chặn quảng cáo 3 lớp:**
   - **Lớp mạng (WebView):** Chặn các request tải quảng cáo và tracking ngay trước khi tải về máy.
   - **Lớp dữ liệu (Player/JSON):** Lọc bỏ thông tin quảng cáo nhúng trong phản hồi của YouTube.
   - **Lớp giao diện (DOM/CSS):** Ẩn banner, popup làm phiền và tự động tua nhanh / bỏ qua quảng cáo phát sinh.
3. **Foreground Service phát nhạc tắt màn hình:** Duy trì tiến trình phát âm thanh ổn định khi bạn khóa màn hình hoặc chuyển sang ứng dụng khác.
4. **Cửa sổ nổi (PiP) cấp hệ điều hành:** Hỗ trợ Picture-in-Picture gốc của Android để vừa xem video vừa dùng ứng dụng khác.
5. **Điều khiển màn hình khóa & thanh thông báo:** Đồng bộ tên video, tên kênh và các nút Phát / Tạm dừng / Tua (`-10s`, `+10s`) / Dừng thông qua cầu nối Web–Native (`CleanTubeAndroid`).

---

## Cách 1: Build APK tự động trên GitHub Actions (Đơn giản nhất — không cần cài Android Studio trên Windows)

Bạn không cần cài đặt Android SDK hay Android Studio trên máy tính cá nhân:

1. Đẩy mã nguồn lên GitHub (nhánh `main` hoặc `master`):
   ```bash
   git push origin main
   ```
2. Mở repository của bạn trên GitHub → chuyển sang tab **Actions**.
3. Chọn workflow **Build Android APK** ở cột bên trái → nhấn **Run workflow** (hoặc mở lần chạy vừa tự động kích hoạt sau khi push).
4. Khi quá trình build hoàn tất (hiển thị dấu tick xanh), cuộn xuống mục **Artifacts** ở cuối trang.
5. Tải về gói **`CleanTube-debug-apk`** → giải nén để lấy file `app-debug.apk`, sau đó chép vào điện thoại Android để cài đặt.

> **Lưu ý:** Artifact `CleanTube-release-unsigned-apk` (`app-release-unsigned.apk`) chưa được ký chứng chỉ (unsigned) nên cần ký bằng keystore riêng nếu muốn cài trực tiếp. Để dùng hàng ngày nhanh gọn, hãy tải **`CleanTube-debug-apk`**.

---

## Cách 2: Tự build APK ngay trên Windows

Phù hợp khi bạn muốn tùy chỉnh mã nguồn Kotlin hoặc build trực tiếp không qua GitHub.

### Yêu cầu môi trường
- **Node.js >= 20** (tối ưu Node 22)
- **JDK 17** (khuyên dùng Eclipse Temurin 17)
- **Android Studio** (cài kèm **Android SDK Platform 35**, Build-Tools và thiết lập biến môi trường `ANDROID_HOME`)
- **Gradle 8.10.2** (hoặc mở trực tiếp thư mục `android/` trong Android Studio)

### Các bước thực hiện
```powershell
# 1. Cài đặt dependencies & build userscript (tự động đồng bộ vào android/app/src/main/assets/cleantube.user.js)
npm install
npm run build

# 2. Chuyển vào thư mục Android và build APK Debug
cd android
gradle assembleDebug
```

Sau khi build thành công, file cài đặt sẽ nằm tại:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## Hướng dẫn cài đặt & tối ưu trên điện thoại Android

1. **Cấp quyền cài đặt APK ngoài Google Play:**
   - Mở file `app-debug.apk` từ ứng dụng **Tệp (Files)** hoặc trình duyệt trên điện thoại.
   - Nếu hệ thống hỏi, chọn **Cài đặt (Settings)** → bật **Cho phép từ nguồn này / Cài đặt ứng dụng không rõ nguồn gốc (Install unknown apps)** rồi quay lại nhấn **Cài đặt**.
2. **Cấp quyền Thông báo (Notifications):**
   - Khi mở CleanTube lần đầu (trên Android 13 trở lên), hãy chọn **Cho phép (Allow)** quyền thông báo. Quyền này giúp hiển thị trình điều khiển phát nhạc trên **màn hình khóa** và thanh thông báo khi phát nền.
3. **Tắt Tối ưu hóa pin để phát nhạc ổn định suốt đêm:**
   - Mở **Cài đặt (Settings)** trên điện thoại → **Ứng dụng (Apps)** → tìm **CleanTube** → mục **Pin (Battery)**.
   - Chuyển từ *Tối ưu hóa (Optimized)* sang **Không hạn chế (Unrestricted)**. Việc này ngăn Android tự đóng dịch vụ phát nền khi tắt màn hình trong thời gian dài.
