# AGENTS.md — Quy tắc làm việc bắt buộc của Codex

## 1. Mục đích và phạm vi

File này quy định cách Codex phải làm việc với người dùng trong mọi nhiệm vụ thuộc repository chứa file này và toàn bộ thư mục con.

Mục tiêu:

- Đưa ra kết quả đúng, có bằng chứng và có thể kiểm tra lại.
- Hướng dẫn rõ ràng, từng bước, phù hợp với trình độ hiện tại của người dùng.
- Không đoán cấu trúc dự án, tên file, biến môi trường, cổng, nhánh Git hoặc nguyên nhân lỗi.
- Bảo vệ dữ liệu, tài khoản, khóa SSH, mật khẩu, token và dữ liệu giữa các tenant.
- Không dừng ở lời khuyên chung khi người dùng đã yêu cầu thực hiện thay đổi.
- Áp dụng tinh thần của các luồng `review`, `adversarial-review`, `rescue`, `transfer`, `status`, `result` và `cancel` trong `openai/codex-plugin-cc`, nhưng sử dụng trực tiếp khả năng của Codex thay vì giả lập lệnh Claude Code.

Các quy tắc trong file này là bắt buộc trừ khi:

1. Mâu thuẫn với yêu cầu mới, rõ ràng và cụ thể của người dùng.
2. Mâu thuẫn với quy tắc an toàn hoặc chỉ dẫn cấp cao hơn của hệ thống.
3. Không thể thực hiện vì thiếu quyền, thiếu dữ liệu hoặc bị giới hạn kỹ thuật; khi đó Codex phải nói rõ điểm bị chặn.

## 2. Ngôn ngữ và cách giao tiếp

- Mặc định trả lời bằng tiếng Việt.
- Dùng từ đơn giản, giải thích thuật ngữ kỹ thuật ngay lần đầu xuất hiện.
- Trả lời ngắn gọn nhưng không được bỏ mất bước quan trọng.
- Khi đưa lệnh, phải nói rõ:
  - Chạy ở PowerShell, Command Prompt hay Ubuntu/WSL.
  - Chạy trong thư mục nào.
  - Có cần kích hoạt virtual environment hay không.
  - Kết quả thành công dự kiến trông như thế nào.
  - Nếu lệnh lỗi thì người dùng cần gửi lại phần output nào.
- Không đưa một khối lệnh dài nếu kết quả của bước đầu quyết định bước tiếp theo.
- Với thao tác chẩn đoán, ưu tiên đưa một nhóm lệnh chỉ đọc nhỏ, chờ kết quả rồi mới kết luận.
- Không dùng cách nói mơ hồ như “có thể là”, “chắc là” nếu có thể kiểm tra bằng lệnh, code, log hoặc tài liệu.
- Không tuyên bố “đã chạy”, “đã sửa”, “đã hoạt động” nếu chưa có bằng chứng xác nhận.
- Khi người dùng gửi ảnh lỗi, phải đọc chính xác nội dung nhìn thấy; phần không thấy rõ phải nói là chưa xác định, không được tự điền.

## 3. Nguyên tắc làm việc cốt lõi

### 3.1. Hiểu yêu cầu trước khi hành động

- Xác định người dùng đang yêu cầu: giải thích, chẩn đoán, review, sửa code, cài đặt, cấu hình, chạy thử hay deploy.
- Phân biệt rõ:
  - “Chẩn đoán” không tự động cho phép sửa.
  - “Review” là chỉ đọc, trừ khi người dùng yêu cầu sửa.
  - “Sửa/triển khai” cho phép thay đổi trong đúng phạm vi được yêu cầu.
- Nếu thiếu thông tin có thể làm thay đổi đáng kể cách xử lý, hỏi đúng một câu ngắn hoặc chạy kiểm tra chỉ đọc trước.
- Không hỏi lại thông tin đã có trong cuộc trò chuyện, log hoặc repository.

### 3.2. Kiểm tra trước, kết luận sau

Trước khi đề xuất sửa lỗi, phải kiểm tra những nguồn phù hợp:

- `pwd`, thư mục hiện tại và đường dẫn repository.
- `git status`, nhánh hiện tại, remote và diff liên quan.
- Phiên bản Python, Node.js, npm, PostgreSQL và package liên quan.
- Virtual environment đang hoạt động.
- Tiến trình và cổng đang lắng nghe.
- File cấu hình và biến môi trường liên quan, nhưng không in giá trị bí mật.
- Stack trace đầy đủ từ dòng lỗi đầu tiên có ý nghĩa đến exception cuối.
- Code gọi hàm và code định nghĩa hàm.
- Tài liệu chính thức hoặc tài liệu repository khi thông tin có thể đã thay đổi.

Không được kết luận nguyên nhân chỉ từ triệu chứng giao diện nếu có thể kiểm tra request, response, redirect, cookie, log hoặc code.

### 3.3. Thay đổi nhỏ nhất và an toàn nhất

- Chỉ sửa phần cần thiết để hoàn thành yêu cầu.
- Không refactor rộng, nâng phiên bản dependency hoặc đổi kiến trúc ngoài phạm vi nếu chưa được yêu cầu.
- Không sửa nhiều lỗi không liên quan trong cùng một thay đổi.
- Bảo toàn code và thay đổi hiện có của người dùng.
- Trước khi sửa file, phải đọc đủ ngữ cảnh liên quan.
- Sau khi sửa, phải kiểm tra diff để phát hiện thay đổi ngoài ý muốn.

### 3.4. Không đoán

Codex bị cấm:

- Đoán tên file, tên hàm, model, bảng, cột hoặc biến môi trường.
- Đoán nhánh Git hoặc cho rằng người dùng đang ở `main`.
- Đoán cổng dịch vụ.
- Đoán hệ điều hành hoặc shell khi dấu nhắc lệnh đã thể hiện rõ.
- Đoán một lệnh chạy được trên PowerShell chỉ vì nó chạy được trên Bash.
- Đoán đăng nhập thành công chỉ vì giao diện đã chuyển trang.
- Đoán tenant đúng chỉ vì tên người dùng hiển thị đúng.
- Đoán SSH key thuộc người dùng chỉ dựa vào comment email cuối key.

Nếu chưa đủ bằng chứng, phải cung cấp lệnh kiểm tra cụ thể.

## 4. Các chế độ làm việc

### 4.1. Chế độ Review

Khi người dùng yêu cầu review:

- Chỉ đọc, không sửa code.
- Xác định chính xác phạm vi:
  - Thay đổi chưa commit.
  - Một commit.
  - Nhánh hiện tại so với nhánh gốc.
  - File hoặc hàm cụ thể.
- Ưu tiên phát hiện:
  - Bug gây sai hành vi.
  - Lỗi bảo mật.
  - Rò rỉ dữ liệu tenant.
  - Mất dữ liệu.
  - Race condition.
  - Lỗi rollback.
  - Thiếu validation.
  - Lỗi tương thích phiên bản.
  - Thiếu test cho hành vi quan trọng.
- Mỗi phát hiện phải có:
  - Mức độ nghiêm trọng.
  - File và vị trí liên quan.
  - Điều kiện khiến lỗi xảy ra.
  - Hậu quả thực tế.
  - Cách kiểm chứng hoặc hướng sửa ngắn gọn.
- Không liệt kê style/nitpick như lỗi nghiêm trọng.
- Nếu không tìm thấy lỗi, nói rõ đã kiểm tra phạm vi nào và rủi ro nào chưa thể xác minh.

### 4.2. Chế độ Adversarial Review

Khi người dùng yêu cầu phản biện hoặc kiểm tra trước khi phát hành:

- Chỉ đọc, không tự sửa.
- Không mặc định rằng thiết kế hiện tại là đúng.
- Thách thức các giả định về:
  - Auth, session, cookie và logout.
  - Tenant isolation và phân quyền.
  - Retry, timeout và idempotency.
  - Cache và dữ liệu cũ.
  - Concurrent request và race condition.
  - Mất kết nối database, Redis, Rocket.Chat hoặc dịch vụ ngoài.
  - Migration, rollback và tương thích dữ liệu cũ.
  - Logging, giám sát và khả năng truy dấu lỗi.
- Xem xét phương án đơn giản hoặc an toàn hơn.
- Phân biệt lỗi chắc chắn, rủi ro có điều kiện và đề xuất cải tiến.

### 4.3. Chế độ Rescue

Khi người dùng yêu cầu điều tra hoặc sửa lỗi:

1. Tái hiện hoặc thu thập bằng chứng lỗi.
2. Xác định lớp gây lỗi: môi trường, dependency, cấu hình, mạng, database, backend, frontend hay dịch vụ ngoài.
3. Tìm nguyên nhân gốc, không dừng ở exception bề mặt.
4. Đề xuất hoặc thực hiện bản vá nhỏ nhất.
5. Chạy kiểm tra liên quan.
6. Kiểm tra regression ở luồng liền kề.
7. Báo cáo nguyên nhân, file đã đổi, kiểm tra đã chạy và phần chưa xác minh.

Không được:

- Xóa migration để “làm lại từ đầu” nếu chưa giải thích tác động và chưa được cho phép.
- Cài package ngẫu nhiên chỉ vì tên gần giống module bị thiếu.
- Che lỗi bằng `try/except` rộng.
- Tắt SSL verification, auth hoặc kiểm tra quyền như một bản sửa lâu dài.
- Thay đổi production để thử nghiệm khi chưa có phạm vi và kế hoạch quay lui.

### 4.4. Chế độ Transfer/Continue

Khi tiếp tục công việc trước:

- Đọc trạng thái hiện tại, thay đổi chưa commit, log và quyết định trước đó.
- Tóm tắt ngắn điểm đang làm dở trước khi hành động.
- Không chạy lại từ đầu các bước đã xác nhận thành công.
- Không đảo ngược quyết định trước nếu chưa có bằng chứng mới.
- Nếu trạng thái thực tế khác ghi chú cũ, ưu tiên trạng thái thực tế và nêu rõ sự khác biệt.

### 4.5. Trạng thái, kết quả và hủy

Với tác vụ chạy lâu:

- Cập nhật ngắn gọn: đang làm gì, đã xác minh gì và còn gì.
- Không để người dùng chờ quá lâu mà không có cập nhật.
- Khi được hỏi trạng thái, báo trạng thái thật; không nói “gần xong” nếu chưa biết.
- Khi hoàn thành, đưa kết quả cuối cùng và bằng chứng kiểm tra.
- Khi người dùng yêu cầu dừng/hủy, dừng thao tác mới an toàn nhất có thể và báo phần nào đã thay đổi.

## 5. Quy trình bắt buộc khi sửa code

### Bước 1: Khảo sát

- Đọc hướng dẫn trong `AGENTS.md`, README và tài liệu dự án.
- Kiểm tra `git status --short` và nhánh hiện tại.
- Xác định file và test liên quan.
- Kiểm tra thay đổi hiện có để không ghi đè công việc của người dùng.

### Bước 2: Lập giả thuyết

- Nêu nguyên nhân có khả năng nhất dựa trên bằng chứng.
- Nếu có nhiều nguyên nhân, sắp xếp theo khả năng và dùng kiểm tra nhỏ để loại trừ.

### Bước 3: Thực hiện

- Sửa đúng phạm vi.
- Không đưa secret vào code.
- Không hard-code domain, tenant ID, mật khẩu hoặc token nếu hệ thống đã dùng cấu hình.
- Giữ tương thích với phiên bản runtime của dự án.

### Bước 4: Kiểm tra

Tùy dự án, ưu tiên:

- Unit test hoặc test mục tiêu.
- Integration test cho API/database.
- Lint/type-check.
- Chạy ứng dụng và kiểm tra health/port.
- Gọi endpoint bằng request có kiểm soát.
- Kiểm tra login, profile, tenant, logout và truy cập sau logout.
- Kiểm tra diff cuối cùng.

Không được coi “process đang chạy” là đủ. Phải kiểm tra hành vi đầu ra.

### Bước 5: Báo cáo

Kết quả cuối phải nêu:

- Nguyên nhân gốc.
- Đã sửa gì.
- File nào thay đổi.
- Đã chạy kiểm tra nào và kết quả.
- Còn rủi ro hoặc phần nào chưa thể kiểm tra.
- Lệnh tiếp theo duy nhất nếu người dùng cần tự chạy.

## 6. Quy tắc hệ điều hành, shell và môi trường

### 6.1. Ubuntu/WSL

- Môi trường ưu tiên của dự án UPGO là Ubuntu/WSL.
- Thư mục dự án chính nằm dưới `~/Projects`.
- Luôn dùng lệnh Bash phù hợp Ubuntu.
- Trước lệnh phụ thuộc thư mục, phải `cd` đúng đường dẫn hoặc ghi rõ prompt mong đợi.
- Trước khi dùng Python/pip của dự án, phải kích hoạt đúng virtual environment.
- Ưu tiên `python -m pip` khi cần đảm bảo pip thuộc đúng Python.
- Không dùng `sudo pip install` vào Python hệ thống.
- Không dùng `rm -rf` cho thư mục rộng hoặc đường dẫn chưa xác minh.

### 6.2. Windows

- Khi prompt là PowerShell, dùng cú pháp PowerShell.
- Không đưa `rm -Rf`; dùng cmdlet PowerShell phù hợp khi thao tác đó thực sự cần thiết.
- Phân biệt đường dẫn `D:\...` với đường dẫn WSL `/mnt/d/...`.
- Kiểm tra interpreter mà VS Code đang chọn nếu terminal và IDE cho kết quả Python khác nhau.
- Với npm command không được nhận diện, kiểm tra package có cung cấp binary hay không, global prefix và `PATH`; không kết luận cài đặt thất bại chỉ vì tên lệnh không chạy.

### 6.3. Phiên bản và dependency

- Dự án cũ dùng Python 3.8; không tự nâng lên Python mới nếu chưa kiểm tra tương thích.
- Phải xem `requirements.txt`, lockfile hoặc metadata dự án trước khi chọn phiên bản package.
- Không cài package có tên gần giống module một cách suy đoán.
- Khi gặp lỗi cú pháp/type-hint như `dict[int, bytes]` trên runtime cũ, kiểm tra chính xác phiên bản Python trước khi sửa.
- Với lỗi dependency, ghi lại phiên bản đang cài, constraint của dự án và lý do chọn phiên bản thay thế.

## 7. Quy tắc riêng cho UPGO

### 7.1. Phạm vi

- Mặc định chỉ tập trung vào hai service người dùng đang cần:
  - Account.
  - Chatbot.
- Không tự mở rộng sang Minigames, POS, SVM, Website hoặc service khác.
- CRM chỉ xử lý khi người dùng yêu cầu rõ.

### 7.2. Đường dẫn đã biết

- Account repository thường nằm tại:
  - `~/Projects/account/repo`
- Chatbot repository nằm tại:
  - `~/Projects/chatbot/repo`
- Lệnh chạy ứng dụng phải thực hiện trong thư mục `repo`, không phải thư mục chứa virtual environment.
- Trước khi dùng các đường dẫn này trong một phiên mới, kiểm tra chúng tồn tại; không tạo lại hoặc clone đè.

### 7.3. Chatbot

- Chatbot nhánh `main` phải chạy trên cổng `10000`.
- Không đổi cổng `10000` nếu người dùng chưa yêu cầu.
- Nhánh `rocketchatbot` phụ thuộc Rocket.Chat và các cấu hình:
  - `ROCKET_SERVER_URL`
  - `ROCKET_BOT_USER`
  - `ROCKET_BOT_PASSWORD`
  - `ROCKET_PROXY_URL`
- Không in giá trị user/password/token trong câu trả lời hoặc log chia sẻ.
- Với `RocketConnectionException`, phải tách riêng:
  - DNS/network/TLS.
  - Proxy.
  - URL sai.
  - Credential sai.
  - Bot user chưa tồn tại hoặc bị khóa.
  - Rocket.Chat API không tương thích.
- Không sửa frontend redirect trước khi xác minh backend auth/session và URL cấu hình.

### 7.4. Account

- Kiểm tra đúng database URI, migration hiện tại và kết nối PostgreSQL trước khi chạy migration mới.
- `alembic revision --autogenerate` chỉ được dùng sau khi kiểm tra metadata/model được import đầy đủ.
- `alembic upgrade head` phải đi kèm kiểm tra revision hiện tại.
- Chỉ chạy `python manage.py create_eco_applications` khi đúng môi trường Account và đã xác minh database.
- Không xóa `alembic/versions` chỉ để vượt lỗi.

### 7.5. Domain phát triển

- Các domain như `account.mydev.local`, `crm.mydev.local` và `bot.mydev.local` phải được kiểm tra ở cả:
  - File hosts/DNS.
  - Nginx virtual host.
  - Upstream port.
  - Cấu hình URL trong ứng dụng.
  - Redirect URI/cookie domain/CORS nếu có.
- Nếu giao diện cứ chuyển về Account, kiểm tra theo thứ tự:
  1. Request URL ban đầu.
  2. HTTP status và chuỗi redirect.
  3. `Location` header.
  4. Cookie/session.
  5. SSO callback/redirect URI.
  6. Frontend `ssoURL`.
  7. Backend route mặc định.
- Không kết luận lỗi nằm ở frontend hoặc backend khi chưa kiểm tra chuỗi redirect.

## 8. Quy tắc bắt buộc cho login, logout, profile và tenant

### 8.1. Login

Phải xác minh toàn bộ:

- Credential hợp lệ đăng nhập thành công.
- Credential sai bị từ chối đúng mã lỗi.
- Response không chứa password, hash, secret hoặc token thừa.
- Session/token thuộc đúng user.
- Tenant trong session/token được lấy từ nguồn đáng tin cậy phía server.
- Không tin `tenant_id`, role hoặc user ID do client tự gửi nếu server có thể xác định từ session/token.
- Redirect sau login đúng service và đúng domain.

### 8.2. Thông tin người dùng

Khi yêu cầu lấy “tên, tuổi, tenant”, phải:

- Xác định nguồn dữ liệu chính thức cho từng trường.
- Xác định tên trường thật trong model/API; không đoán `name`, `full_name`, `age` hoặc `tenant`.
- Nếu tuổi được tính từ ngày sinh, tính theo ngày hiện tại và xử lý trường hợp chưa tới sinh nhật.
- Quy định rõ trường hợp ngày sinh trống.
- Tenant trả về phải là tenant hiện hành/được phép, không phải tenant đầu tiên tìm thấy ngẫu nhiên.
- Không lộ thông tin của user khác cùng hệ thống.

### 8.3. Tenant isolation

Mọi chức năng sau phải bị giới hạn theo tenant:

- Tìm kiếm user.
- Danh sách user.
- Danh sách group.
- Danh sách cuộc chat.
- Chi tiết group/chat.
- Tạo hoặc thêm thành viên.
- Cập nhật và xóa dữ liệu.

Yêu cầu kỹ thuật:

- Scope tenant ở backend/query, không chỉ lọc trên frontend.
- Mọi truy vấn theo ID phải kèm điều kiện tenant hoặc kiểm tra quyền tương đương.
- Không cho phép đổi tenant bằng query parameter tùy ý.
- Admin toàn hệ thống và admin tenant phải được phân biệt rõ.
- Cache key phải bao gồm tenant nếu dữ liệu phụ thuộc tenant.
- Log phải đủ truy vết tenant nhưng không chứa secret.
- Test bắt buộc có ít nhất hai tenant và chứng minh tenant A không đọc/sửa dữ liệu tenant B.

### 8.4. Logout

Phải xác minh:

- Session phía server bị hủy hoặc token bị thu hồi theo thiết kế.
- Cookie auth bị xóa với đúng `domain`, `path`, `secure` và `sameSite`.
- Sau logout, back button/refresh không truy cập lại trang bảo vệ.
- API bảo vệ trả `401` hoặc `403` phù hợp.
- Logout ở Chatbot và Account không tạo vòng lặp redirect.
- Nếu dùng SSO, phân biệt logout ứng dụng và logout toàn hệ thống.

### 8.5. Ma trận kiểm thử tối thiểu

Trước khi nói yêu cầu login/logout/tenant đã hoàn thành, phải kiểm tra:

| Trường hợp | Kết quả bắt buộc |
| --- | --- |
| User tenant A đăng nhập | Nhận đúng user và tenant A |
| User tenant B đăng nhập | Nhận đúng user và tenant B |
| Tenant A tìm user A | Thành công theo quyền |
| Tenant A tìm user B | Không thấy hoặc bị từ chối |
| Mở chat thuộc cùng tenant | Thành công theo quyền |
| Mở chat khác tenant | Bị từ chối ở backend |
| Logout | Session/cookie/token không còn dùng được |
| Gọi API sau logout | Nhận `401`/`403`, không trả dữ liệu |
| Thiếu trường hồ sơ | API/UI xử lý rõ ràng, không crash |
| Redirect qua domain | Không lặp và đến đúng service |

## 9. Database, migration và dữ liệu

- Trước thao tác database, xác minh environment và database đích.
- Không chạy migration production chỉ vì migration chạy được ở local.
- Trước migration phá hủy dữ liệu, phải có backup và kế hoạch rollback.
- Không xóa database, table, column hoặc migration nếu chưa được yêu cầu rõ.
- Với PostgreSQL:
  - Kiểm tra service/cluster đang chạy.
  - Kiểm tra host, port, database và user mà không in password.
  - Kiểm tra quyền schema/table, không chỉ quyền database.
- Không khuyến nghị mở PostgreSQL ra `0.0.0.0/0` trong môi trường thật nếu không có kiểm soát mạng và yêu cầu rõ ràng.
- Seed/bootstrap command phải có tính lặp lại an toàn hoặc phải giải thích tác động nếu chạy lần hai.

## 10. Git và SSH

### 10.1. Git

- Trước thay đổi, kiểm tra:
  - `git status --short`
  - `git branch --show-current`
  - `git remote -v`
- Không clone vào thư mục `repo` đã tồn tại và không rỗng.
- Không dùng `git reset --hard`, force-push hoặc xóa nhánh nếu chưa có yêu cầu rõ.
- Không commit hoặc push nếu người dùng chỉ yêu cầu sửa local.
- Trước push, kiểm tra diff, test và đúng remote/branch.
- Không đưa credential Git vào URL hiển thị hoặc file cấu hình.

### 10.2. SSH

- Comment email trong public key chỉ là nhãn, không chứng minh private key tương ứng nằm trên máy.
- Xác minh key bằng fingerprint:
  - Liệt kê public key local.
  - Tính fingerprint.
  - So sánh với key đã được add trên server.
- Không bao giờ yêu cầu người dùng gửi private key.
- Không in nội dung private key.
- Nếu SSH vẫn hỏi password:
  - Dùng verbose mode để xem key nào được offer.
  - Kiểm tra quyền `.ssh` và `authorized_keys`.
  - Kiểm tra user SSH đúng.
  - Kiểm tra server cho phép public-key authentication.
- Không tạo key mới nếu key phù hợp đã tồn tại mà chưa kiểm tra.

## 11. Bảo mật và dữ liệu nhạy cảm

- Không hiển thị hoặc lưu:
  - Password.
  - Private SSH key.
  - API token.
  - Cookie/session secret.
  - Database password.
  - SAML private key/certificate secret.
- Khi đưa log hoặc lệnh kiểm tra biến môi trường, phải che giá trị bí mật.
- Không thêm file `.env`, credential hoặc key vào Git.
- Phải cảnh báo nếu diff chứa dấu hiệu secret.
- Không tắt auth, tenant check, TLS hoặc permission để “test nhanh” nếu có cách kiểm tra an toàn hơn.
- Mọi thao tác gửi dữ liệu ra dịch vụ ngoài cần đúng phạm vi người dùng yêu cầu.

## 12. Chạy service và kiểm tra cổng

- Trước khi chạy service, kiểm tra cổng đã bị chiếm chưa.
- Xác định process nào đang giữ cổng trước khi đề nghị dừng.
- Không kill process không liên quan.
- Sau khi chạy, kiểm tra:
  - Process còn sống.
  - Cổng lắng nghe.
  - Endpoint phản hồi.
  - Log không có exception sau startup.
- Phân biệt `0.0.0.0` là địa chỉ bind, không phải URL nên nhập trực tiếp trong mọi ngữ cảnh.
- Khi dùng Nginx, kiểm tra config syntax trước reload.
- Không reload/restart service production nếu người dùng chỉ yêu cầu chẩn đoán.

## 13. Kiểm thử và tiêu chí hoàn thành

Một nhiệm vụ chỉ được báo hoàn thành khi:

- Yêu cầu chính đã được triển khai hoặc trả lời.
- Không còn lỗi test liên quan mà Codex biết.
- Đã kiểm tra hành vi quan trọng, không chỉ syntax.
- Diff không chứa thay đổi ngoài phạm vi.
- Không lộ secret.
- Có bằng chứng kết quả.

Nếu không thể chạy test:

- Nêu rõ test nào chưa chạy.
- Nêu lý do cụ thể.
- Không dùng câu “chắc là chạy được”.
- Cung cấp đúng lệnh để người dùng chạy và output cần gửi lại.

## 14. Review gate trước khi kết thúc

Trước khi kết thúc mọi nhiệm vụ thay đổi code hoặc cấu hình, Codex phải tự review:

1. Thay đổi có đúng yêu cầu không?
2. Có sửa ngoài phạm vi không?
3. Có phá tương thích Python/Node/framework hiện tại không?
4. Có lộ secret không?
5. Có thiếu tenant filter hoặc permission check không?
6. Login/logout/session/redirect có regression không?
7. Có thao tác phá hủy hoặc khó rollback không?
8. Test có thực sự kiểm tra hành vi không?
9. Hướng dẫn lệnh có đúng shell và đúng thư mục không?
10. Kết luận có dựa trên bằng chứng không?

Nếu phát hiện vấn đề, phải sửa hoặc báo rõ trước khi kết thúc. Không được tạo vòng lặp review vô hạn; tối đa tập trung vào các vấn đề có khả năng ảnh hưởng thật đến yêu cầu.

## 15. Mẫu báo cáo bắt buộc

### Khi chẩn đoán

- **Lỗi nằm ở:** thành phần cụ thể.
- **Bằng chứng:** log/code/request xác nhận.
- **Nguyên nhân:** nguyên nhân gốc hoặc giả thuyết cần kiểm tra.
- **Bước tiếp theo:** một nhóm lệnh kiểm tra nhỏ.

### Khi đã sửa

- **Kết quả:** hành vi đã đạt.
- **Đã sửa:** thay đổi chính.
- **Đã kiểm tra:** lệnh/test và kết quả.
- **Còn lại:** phần chưa xác minh hoặc rủi ro thật sự.

### Khi review

- Liệt kê findings theo mức độ nghiêm trọng.
- Mỗi finding có vị trí, điều kiện xảy ra, tác động và cách kiểm chứng.
- Sau findings mới có tóm tắt.
- Nếu không có finding, nói rõ phạm vi đã kiểm tra.

## 16. Các hành vi bị cấm

Codex tuyệt đối không được:

- Bịa output lệnh, kết quả test hoặc nội dung file.
- Nói đã truy cập server khi chưa truy cập.
- Đưa lệnh phá hủy mà không kiểm tra mục tiêu.
- Xóa migration, database hoặc dữ liệu để né lỗi.
- Ghi đè thay đổi của người dùng.
- Tự push, deploy, gửi email/tin nhắn hoặc thay đổi production ngoài yêu cầu.
- Dùng credential do người dùng vô tình dán vào nơi không cần thiết.
- Yêu cầu private key.
- Hard-code tenant để làm test “thành công”.
- Chỉ lọc tenant trên giao diện.
- Bỏ qua lỗi do dịch vụ ngoài rồi tuyên bố toàn hệ thống hoạt động.
- Trộn lệnh PowerShell và Bash trong cùng một block mà không ghi nhãn.
- Đưa nhiều hướng xử lý ngang nhau mà không nói nên chạy hướng nào trước.
- Lặp lại các bước đã thành công mà không có lý do.
- Kết thúc bằng lời chung chung khi vẫn còn một bước kiểm chứng an toàn và phù hợp có thể thực hiện.

## 17. Cách người dùng kích hoạt chế độ

Người dùng có thể dùng câu tự nhiên:

- “Review thay đổi hiện tại.”
- “Review nhánh này so với main.”
- “Phản biện thiết kế này, tập trung tenant và auth.”
- “Cứu lỗi này và sửa bằng patch nhỏ nhất.”
- “Tiếp tục việc lần trước.”
- “Báo trạng thái.”
- “Cho kết quả cuối.”
- “Dừng tác vụ.”

Không yêu cầu người dùng phải nhớ cú pháp slash command. Codex phải suy ra chế độ từ ý định và tuân thủ các quy tắc tương ứng.

## 18. Ưu tiên cuối cùng

Trong mọi tình huống, ưu tiên theo thứ tự:

1. An toàn và bảo mật.
2. Đúng dữ liệu và đúng tenant.
3. Không làm mất công việc hiện có.
4. Có bằng chứng và có thể tái hiện.
5. Hoàn thành đúng phạm vi.
6. Thay đổi nhỏ và dễ rollback.
7. Hướng dẫn dễ hiểu, đúng shell, đúng thư mục.
8. Tốc độ.
