# TTTN_MIS_01 - Quản lý thực tập tốt nghiệp và phân công hướng dẫn

## 1. MÃ VÀ TÊN ĐỀ TÀI
* **Mã đề tài:** TTTN_MIS_01
* **Tên đề tài:** Quản lý thực tập tốt nghiệp và phân công hướng dẫn

---

## 2. DANH SÁCH THÀNH VIÊN
 * Võ Văn Phụng  
 * Lương Ngọc Phượng 
 * Ngô Thị Mỹ Út  

---

## 3. KIẾN TRÚC ỨNG DỤNG (APPLICATION ARCHITECTURE)

Hệ thống được thiết kế theo kiến trúc **3 tầng (3-Tier Architecture)** chuẩn hóa, giao tiếp thông qua **RESTful API** không trạng thái (Stateless) kết hợp xác thực **JWT (JSON Web Token)**.

### 3.1. Sơ đồ Kiến trúc Tổng quan

```text
+---------------------------------------------------------------------------+
|                            TẦNG GIAO DIỆN (FRONTEND)                      |
|                         (HTML5 / CSS3 / JavaScript)                       |
|                                                                           |
|   [ Sinh viên UI ]         [ Giảng viên UI ]        [ Giáo vụ/Admin UI ]  |
+---------------------------------------------------------------------------+
                                     |
                       HTTP / HTTPS (Fetch API / Axios)
                       Header: Authorization (Bearer JWT)
                                     v
+---------------------------------------------------------------------------+
|                            TẦNG XỬ LÝ (BACKEND SERVER)                    |
|                             (Node.js / Express.js)                        |
|                                                                           |
|  [ 1. Middleware Layer - Bảo mật & Phân quyền ]                           |
|     ├── CORS / Helmet Middleware (Bảo mật truy cập)                       |
|     ├── Auth Middleware (Giải mã & Verify JWT Token)                      |
|     └── RBAC Middleware (Kiểm tra quyền: STUDENT, LECTURER, ADMIN)        |
|                                                                           |
|  [ 2. Business Logic Layer - Xử lý Nghiệp vụ ]                            |
|     ├── Group & Topic Controller (Đăng ký nhóm, đề xuất/duyệt đề tài)     |
|     ├── Lecturer Assignment Engine (Phân công & Kiểm tra Quota GVHD)      |
|     └── Milestone & Submission Engine (Nộp bài & Kiểm tra hạn nộp LATE)   |
|                                                                           |
|  [ 3. Data Access Layer - Quản lý Dữ liệu ]                               |
|     └── Mongoose ODM (Schema Validation, Unique Indexes, Transactions)    |
+---------------------------------------------------------------------------+
                                     |
                          TCP / Mongoose Driver
                                     v
+---------------------------------------------------------------------------+
|                          TẦNG DỮ LIỆU (DATABASE LAYER)                    |
|                               (MongoDB Engine)                            |
+---------------------------------------------------------------------------+
3.2. Mô tả Chi tiết Các Tầng
1. Tầng Giao diện (Frontend Layer)
Công nghệ: HTML5, CSS3 (Bootstrap / Tailwind CSS), Vanilla JavaScript (Fetch API / Axios).

Đặc điểm:

Giao diện thiết kế theo dạng Multi-Page / SPA tĩnh, gọi RESTful API không đồng bộ (Asynchronous JS) truyền nhận dữ liệu dạng JSON.

Tự động kiểm tra Token trong localStorage để phân quyền điều hướng người dùng đúng trang chức năng (student.html, lecturer.html, admin.html).

2. Tầng Xử lý Nghiệp vụ (Backend Server Layer)
Công nghệ: Node.js, Express.js framework.

Thành phần cốt lõi:

Bảo mật & Phân quyền (JWT & RBAC): Mọi request yêu cầu xác thực đều phải qua AuthMiddleware kiểm tra token hợp lệ và RoleMiddleware để ngăn chặn truy cập trái phép giữa các vai trò.

Xử lý Quy tắc Nghiệp vụ (Business Rules Engine):

Chặn phân công vượt Quota giảng viên (if current_groups >= max_groups -> Trả lỗi 400).

Tự động kiểm tra nộp trễ (submitted_at > deadline -> Gắn cờ is_late = true).

Chặn tuyệt đối đăng ký trùng nhóm, trùng đề tài ở phía Server.

3. Tầng Dữ liệu (Database Layer)
Công nghệ: MongoDB & Mongoose ODM.

Toàn vẹn Dữ liệu: Khởi tạo Mongoose Schema Validation kết hợp Unique Index cho user_code, email, và cặp chỉ mục duy nhất (milestone_id, group_id) để chống ghi đè/trùng lặp dữ liệu.
```
## 4. YÊU CẦU MÔI TRƯỜNG
Node.js: Phiên bản v18.x trở lên

Trình quản lý gói (NPM): v9.x trở lên

Cơ sở dữ liệu: MongoDB v6.0 trở lên (hoặc MongoDB Compass / MongoDB Atlas Cloud)

Trình duyệt Web: Chrome, Edge, Safari hoặc Firefox (Hỗ trợ HTML5 & ES6 JavaScript)
