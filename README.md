# 💖 HiHi Ultimate - Học Bằng Cả Trái Tim

![HiHi Ultimate Preview](https://img.shields.io/badge/Version-1.0.0-rose)
![License](https://img.shields.io/badge/License-MIT-blue)
![Tech Stack](https://img.shields.io/badge/Tech-TailwindCSS%20|%20Lucide%20|%20AI-orange)

**HiHi Ultimate** là một ứng dụng luyện dịch thuật thông minh, hỗ trợ đa ngôn ngữ (Tiếng Anh & Tiếng Indonesia) với giao diện hiện đại, tối giản và tập trung vào trải nghiệm người dùng. Ứng dụng kết hợp sức mạnh của trí tuệ nhân tạo (AI) để chấm điểm, phân tích lỗi và cung cấp từ vựng "vàng" sau mỗi bài tập.

---

## ✨ Tính năng nổi bật

* **🤖 AI Translation Mentor:** Tự động tạo đoạn văn mẫu theo trình độ (A1, B2, C1) và chấm điểm bài dịch của bạn một cách chi tiết.
* **📊 Hệ thống thăng hạng (Rank):** Theo dõi tiến trình học tập thông qua danh hiệu: *Người mới -> Tập sự -> Thông thái -> Bậc thầy*.
* **🌙 Chế độ giao diện (Dark/Light):** Tùy chỉnh giao diện theo sở thích giúp bảo vệ mắt khi học vào ban đêm.
* **🧘 Zen Mode:** Chế độ tập trung cao độ, ẩn bớt các thanh công cụ để bạn hoàn toàn đắm chìm vào không gian dịch thuật.
* **🔊 Text-to-Speech:** Tích hợp giọng đọc chuẩn giúp người dùng luyện nghe và phát âm đoạn văn nguồn.
* **📈 Dashboard thống kê:** Lưu trữ lịch sử 5 bài gần nhất, tổng số bài đã học và tổng số từ đã dịch.

---

## 🛠 Công nghệ sử dụng

* **Frontend:** HTML5, TailwindCSS (Styling).
* **Icons:** [Lucide Icons](https://lucide.dev/).
* **Fonts:** Quicksand & Dancing Script (Google Fonts).
* **Backend Interface:** Cloudflare Workers (Kết nối API AI).
* **Storage:** LocalStorage (Lưu trữ dữ liệu học tập cá nhân trực tiếp trên trình duyệt).

---

## 🚀 Hướng dẫn cài đặt

Dự án này là một ứng dụng web tĩnh (Single Page Application), bạn không cần cài đặt môi trường phức tạp.

1.  **Clone dự án:**
    ```bash
    git clone [https://github.com/username/hihi-ultimate.git](https://github.com/username/hihi-ultimate.git)
    ```
2.  **Mở file:**
    Mở file `index.html` trực tiếp trên trình duyệt của bạn hoặc sử dụng **Live Server** trên VS Code.

3.  **Cấu hình API (Tùy chọn):**
    Thay đổi biến `API_URL` trong thẻ `<script>` nếu bạn muốn kết nối với Worker cá nhân của mình:
    ```javascript
    const API_URL = "URL_WORKER_CỦA_BẠN";
    ```

---

## 📸 Ảnh chụp màn hình

| Giao diện sáng (Light) | Giao diện tối (Dark) |
|---|---|
| ![Light Mode](https://via.placeholder.com/400x250?text=Light+Mode+Preview) | ![Dark Mode](https://via.placeholder.com/400x250?text=Dark+Mode+Preview) |

---

## 📝 Cấu trúc dữ liệu AI

Ứng dụng mong đợi phản hồi từ AI dưới dạng JSON để hiển thị kết quả:

```json
{
  "score": 8,
  "feedback": "Bản dịch khá tốt, tuy nhiên cần chú ý hơn về ngữ cảnh...",
  "vocab": [
    {"w": "Adventure", "m": "Cuộc phiêu lưu"},
    {"w": "Heartfelt", "m": "Chân thành"}
  ],
  "quote": "Kiến thức là sức mạnh."
}
