# Sử dụng survey JS thay cho GrapeJS

https://surveyjs.io/documentation/backend-integration

# Tài liệu về Phân quyền & Bảo mật (OAuth2)

https://surveyjs.io/faq/permissions

# SurveyJS Architecture (Kiến trúc luồng đi của dữ liệu (Để tối ưu Webhook)

https://surveyjs.io/documentation/surveyjs-architecture

[Màn hình SurveyJS (Client)] 
         │
         ▼ (Bấm Submit -> Trả về JSON kết quả)
[API Endpoint hiện tại của bạn (Ví dụ: crm.yoursystem.com/api/v1/responses)]
         │
         ├─► [Lưu thẳng vào Database của bạn]
         │
         └─► [Hệ thống tự động kích hoạt Webhook và Automation có sẵn của bạn]