# CleanTube

**CleanTube** là dự án mã nguồn mở **100% miễn phí cho cộng đồng**, giúp bạn xem YouTube trên **Android** và **iPhone / iPad** gọn gàng, không quảng cáo, phát nền và hẹn giờ tắt ngủ như trải nghiệm Premium.

- **Không quảng cáo, không thu phí:** Hoàn toàn miễn phí, không bản Pro, không quảng cáo ẩn.
- **Không máy chủ trung gian:** Mọi xử lý diễn ra trực tiếp trên thiết bị của bạn (trừ yêu cầu tùy chọn tới API cộng đồng SponsorBlock nếu bạn bật).
- **Tôn trọng tài khoản thật:** Chạy trực tiếp trên `m.youtube.com` / `www.youtube.com`, giữ nguyên lịch sử xem, đăng ký kênh và thuật toán gợi ý cá nhân.

---

## Chọn nền tảng của bạn

- **Android (App độc lập giống Premium):** Ứng dụng Android riêng trong thư mục [`android/`](android/) — tích hợp sẵn chặn quảng cáo 3 lớp, phát nhạc tắt màn hình qua Foreground Service, điều khiển màn hình khóa và cửa sổ nổi (PiP) hệ điều hành.
  - Xem hướng dẫn build & cài đặt APK tại: [Hướng dẫn build & cài đặt CleanTube Android](docs/BUILD-ANDROID.md)
- **iPhone / iPad (Safari Userscript):** Cài đặt nhanh file [`dist/cleantube.user.js`](dist/cleantube.user.js) qua app Userscripts miễn phí trên Safari (hỗ trợ cả trình duyệt Firefox / Edge trên Android).
  - Xem hướng dẫn chi tiết từng bước (kèm mẹo Phím tắt 1 chạm và ẩn thanh Safari) tại: [Hướng dẫn cài đặt trên iPhone (Safari) & Android](docs/INSTALL-IPHONE.md)

---

## Tính năng nổi bật

- **Chặn quảng cáo:** Ẩn quảng cáo hiển thị trên trang và tự động bỏ qua / tua nhanh quảng cáo video (trên app Android có thêm lớp chặn ở tầng mạng WebView).
- **Phát nền & Cửa sổ nổi (PiP):** Tiếp tục nghe nhạc, podcast khi tắt màn hình hoặc chuyển sang ứng dụng khác, hỗ trợ điều khiển trên màn hình khóa (Android) và bật nhanh Picture-in-Picture.
- **Hẹn giờ tắt ngủ (Sleep Timer):** Chọn nhanh `15p`, `30p`, `45p`, `60p`, nhập số phút tùy ý hoặc chọn dừng khi **Hết video**, hỗ trợ giảm âm lượng êm ái trước khi tắt.
- **SponsorBlock:** Tự động bỏ qua các đoạn tài trợ, tự quảng bá trong video dựa trên dữ liệu cộng đồng.
- **Dọn popup & Ẩn Shorts:** Ẩn hộp thoại nhắc nâng cấp Premium, khảo sát làm phiền và tùy chọn ẩn mục YouTube Shorts.

---

## Dành cho lập trình viên

Yêu cầu Node.js >= 20 (khuyên dùng Node 22). Để build app Android cục bộ, cần thêm JDK 17 và Android SDK 35.

```bash
# Cài đặt dependencies
npm install

# Kiểm tra TypeScript (strict mode)
npm run typecheck

# Chạy unit tests (Vitest + jsdom)
npm test

# Build userscript tại dist/cleantube.user.js và đồng bộ vào android/app/src/main/assets/
npm run build

# Chạy toàn bộ kiểm tra (typecheck + test + build)
npm run check
```
