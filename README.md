# TTTN_MIS_01 — Hệ thống Quản lý Thực tập Tốt nghiệp

Ứng dụng hỗ trợ quản lý đăng ký đề tài thực tập, phân công giảng viên hướng dẫn và theo dõi tiến độ của sinh viên. Giao diện web gồm nhiều trang, kết nối với backend REST API và cơ sở dữ liệu MongoDB.

## 1. Giới thiệu dự án

### Mục tiêu

- Số hóa quy trình đăng ký và quản lý đề tài thực tập tốt nghiệp.
- Hỗ trợ giảng viên quản lý nhóm, lịch hướng dẫn và tiến độ sinh viên.
- Hỗ trợ quản trị viên quản lý người dùng, học kỳ và hoạt động của hệ thống.
- Cung cấp thông báo, tài liệu và biểu mẫu cho người dùng theo vai trò.

### Thông tin dự án

| Thông tin | Chi tiết |
|---|---|
| Mã dự án | TTTN_MIS_01 |
| Tên hệ thống | Quản lý thực tập tốt nghiệp và phân công hướng dẫn |
| Loại ứng dụng | Web Application |
| Kiến trúc | Client–Server, Multi-Page Application |
| Frontend | HTML5, CSS3, JavaScript |
| Backend | Node.js, Express.js |
| Cơ sở dữ liệu | MongoDB |
| ODM | Mongoose |

## 2. Giao diện và chức năng

### Sinh viên

- Đăng ký đề tài và thành viên nhóm.
- Theo dõi đề tài, giảng viên hướng dẫn và tiến độ thực hiện.
- Xem lịch làm việc, lịch hẹn, thông báo và tài liệu hướng dẫn.
- Hỏi trợ lý AI về hướng đề tài, cách đăng ký đề tài và quy trình nộp báo cáo.
- Quản lý thông tin tài khoản và mật khẩu.

### Giảng viên

- Quản lý đề tài, xem xét đề xuất và quản lý kho đề tài.
- Theo dõi các nhóm sinh viên được phân công hướng dẫn.
- Quản lý lịch gặp, mốc tiến độ và báo cáo sinh viên nộp.
- Chia sẻ tài liệu, xem thông báo và quản lý thông tin tài khoản.
- Theo dõi chỉ tiêu nhóm hướng dẫn.

### Quản trị viên

- Quản lý hồ sơ sinh viên và giảng viên.
- Quản lý học kỳ, đăng ký và phân công nhóm.
- Quản lý tài liệu, thông báo hệ thống và nhật ký hoạt động.
- Nhập/xuất danh sách và cập nhật chỉ tiêu hướng dẫn của giảng viên.

## 3. Công nghệ và kiến trúc

- **Frontend:** HTML5, CSS tùy chỉnh, JavaScript thuần; giao diện responsive và tổ chức thành nhiều trang. Dashboard sử dụng Chart.js; biểu tượng dùng Font Awesome.
- **Backend:** Node.js và Express.js cung cấp REST API dạng JSON. Routes kết hợp middleware xác thực/phân quyền với controller xử lý nghiệp vụ.
- **Dữ liệu:** MongoDB được truy cập qua Mongoose.
- **Frontend và backend được phục vụ riêng:** frontend chạy qua static web server; Express cung cấp API và các tài nguyên backend cần thiết.

```text
Sinh viên / Giảng viên / Quản trị viên
                    |
                    v
      Frontend HTML / CSS / JavaScript
                    |
             HTTP / REST API
                    |
                    v
       Node.js / Express / Mongoose
                    |
                    v
                 MongoDB
```

## 4. Xác thực và bảo mật

- Backend phát hành JWT trong cookie `HttpOnly`; frontend gửi cookie kèm request bằng `credentials: include`.
- `X-Auth-Session` và `X-Auth-Role` dùng để gắn request với phiên đăng nhập theo tab và vai trò.
- Request thay đổi dữ liệu cần có header `X-CSRF-Protection`.
- Các API kiểm tra vai trò người dùng trước khi cho phép truy cập chức năng tương ứng.
- Frontend tự kết thúc phiên đăng nhập sau 5 phút không hoạt động.

## 5. Cấu trúc thư mục

```text
TTTN_MIS_01_S3/
└── Code/
    ├── Backend/
    │   ├── config/
    │   ├── controllers/
    │   ├── middlewares/
    │   ├── models/
    │   ├── routes/
    │   ├── scripts/
    │   ├── services/
    │   ├── tests/
    │   ├── utils/
    │   ├── .env.example
    │   ├── package.json
    │   └── server.js
    └── Frontend/
        ├── assets/
        ├── css/
        ├── html/
        │   ├── admin/
        │   ├── auth/
        │   ├── lecturer/
        │   ├── shared/
        │   └── student/
        └── js/
```

## 6. Cài đặt và chạy cục bộ trên Windows

### Yêu cầu

- Windows 10/11.
- Node.js 18 trở lên và npm.
- MongoDB đang chạy cục bộ hoặc một MongoDB có thể truy cập qua URI.
- VS Code Live Server hoặc static web server tương đương để phục vụ frontend.

### 6.1. Tạo file cấu hình

1. Mở PowerShell tại thư mục gốc dự án và tạo file `.env`:

   ```powershell
   Copy-Item Code\Backend\.env.example Code\Backend\.env
   ```

2. Tạo khóa JWT ngẫu nhiên bằng lệnh:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. Mở `Code\Backend\.env`, dán kết quả vào `JWT_SECRET`. Khóa cần ít nhất 32 ký tự; backend sẽ không khởi động nếu khóa trống hoặc dùng giá trị mẫu. Nếu MongoDB của bạn không chạy cục bộ, cập nhật `MONGO_URI`.
4. Nếu Live Server dùng địa chỉ hoặc cổng khác, thêm origin frontend đó vào `CORS_ORIGINS` (chỉ ghi địa chỉ website, không ghi đường dẫn trang).
5. Để bật quên mật khẩu, điền cấu hình SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) và URL trang đặt lại (`FRONTEND_RESET_URL`). Với Gmail, dùng App Password thay cho mật khẩu đăng nhập. Không gửi hoặc commit các giá trị này.
6. Để chạy trợ lý tư vấn đề tài miễn phí trên máy cục bộ, cài Ollama bằng PowerShell:

   ```powershell
   irm https://ollama.com/install.ps1 | iex
   ```

   Lệnh này tải và chạy script cài đặt từ Ollama. Nếu không muốn dùng script, tải Ollama từ [ollama.com/download](https://ollama.com/download). Sau khi cài xong, mở cửa sổ PowerShell mới và tải mô hình:

   ```powershell
   ollama pull qwen2.5:3b
   ```

   Mô hình này tải khoảng 2 GB và không dùng chế độ suy nghĩ của Qwen3. Backend mặc định kết nối tới `http://127.0.0.1:11434` và dùng `qwen2.5:3b`; có thể đổi `OLLAMA_BASE_URL` hoặc `OLLAMA_MODEL` trong `.env` nếu cần. Cấu hình `OLLAMA_MODEL=qwen3:4b` cũ sẽ tự chuyển sang `qwen2.5:3b`. Ollama phải chạy trên chính máy đang chạy backend. Để giảm thời gian nạp mô hình lại, Ollama giữ mô hình trong bộ nhớ 10 phút sau mỗi câu hỏi; trợ lý cũng chỉ gửi tối đa 8 đề tài phù hợp và 4 tin nhắn lịch sử vào prompt.

Không cần chỉnh các thiết lập cookie để chạy cục bộ. Không gửi hoặc commit file `.env`; chỉ commit `.env.example`. Nếu đổi `FRONTEND_API_BASE_URL`, xem bước cập nhật cấu hình frontend ở mục 6.3.

Khi triển khai frontend và API trên các website khác nhau (ví dụ frontend tĩnh và API trên Render), cookie đăng nhập cần `SameSite=None; Secure`. Backend tự dùng cấu hình này ở production; nếu đã đặt `AUTH_COOKIE_SAME_SITE` trong cấu hình dịch vụ, hãy đặt giá trị là `none` thay vì `lax`.

Backend không tự tạo tài khoản mẫu khi khởi động và không còn endpoint `/api/seed`. Lệnh `npm --prefix Code/Backend run seed` chỉ chạy khi `.env` đặt `NODE_ENV=development`, và chỉ tạo tài khoản mẫu trên cơ sở dữ liệu trống. Lệnh sẽ từ chối chạy nếu các collection người dùng, đề tài, nhóm, tài liệu, cuộc họp hoặc công việc đã có dữ liệu; không chạy trên cơ sở dữ liệu thật.
Tài khoản mới được tạo với mật khẩu ban đầu `123456` và bắt buộc đổi mật khẩu lần đầu đăng nhập. Yêu cầu đăng nhập và đặt lại mật khẩu cũng được giới hạn số lần thử.

### 6.2. Cài dependencies và chạy backend

Đảm bảo MongoDB đang hoạt động, sau đó chạy từ thư mục gốc repo:

```powershell
npm --prefix Code/Backend install
npm --prefix Code/Backend run dev
```

Backend mặc định chạy ở cổng `5000`. Có thể dùng `npm --prefix Code/Backend start` để chạy không dùng nodemon.

### 6.3. Cấu hình và chạy frontend

Nếu thay đổi `FRONTEND_API_BASE_URL`, cập nhật cấu hình API frontend:

```powershell
npm --prefix Code/Backend run configure-frontend
```

Phục vụ frontend bằng VS Code Live Server hoặc static web server. Nếu Live Server đang phục vụ từ thư mục gốc repo, mở:

```text
http://127.0.0.1:5500/Code/Frontend/html/auth/index.html
```

Không mở trang trực tiếp bằng `file://`. Origin frontend phải có trong `CORS_ORIGINS`. Backend và MongoDB cần hoạt động để đăng nhập và sử dụng các chức năng có dữ liệu.

## 7. Kiểm thử

Chạy bộ kiểm thử backend từ thư mục gốc repo:

```powershell
npm --prefix Code/Backend test
```

## 8. Mục đích sử dụng

Dự án được phát triển phục vụ học tập và thực hiện đồ án chuyên ngành Hệ thống Thông tin Quản lý (MIS). README này không tuyên bố dự án được phát hành theo một giấy phép mã nguồn mở cụ thể.
