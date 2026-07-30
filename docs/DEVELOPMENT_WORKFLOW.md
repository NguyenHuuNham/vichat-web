# Quy trinh sua code va cap nhat tinh nang

Muc tieu cua quy trinh nay la giup moi lan lam viec co du ngu canh de mot nguoi khac hoac mot phien Codex sau co the tiep tuc an toan, khong phai doan lai cac quyet dinh cu.

## 1. Tiep nhan va khoanh vung

- Doc yeu cau, kien truc hien tai va cac muc moi nhat trong `docs/CHANGELOG.md`.
- Kiem tra Git de tach thay doi san co cua nguoi dung khoi thay doi cua lan lam viec nay.
- Xac dinh loai thay doi: sua loi, tinh nang, tai cau truc, bao mat, van hanh, du lieu hay tai lieu.
- Liet ke thanh phan co the bi anh huong: ChatUI, Chatmgt, Tinode, chatbot/RAG, database, ha tang hoac kiem thu.

## 2. Ghi nhan truoc khi sua

Voi cong viec lon hoac keo dai qua nhieu phien, tao som mot muc `Dang thuc hien` trong `docs/CHANGELOG.md`. Voi thay doi nho co the ghi mot lan khi hoan tat.

Moi cong viec dung ma theo dang `YYYY-MM-DD-NN`, trong do `NN` tang dan trong ngay. Tieu de ngan gon va mo ta ket qua mong muon.

## 3. Thuc hien thay doi

- Chi sua cac file can thiet cho pham vi da xac dinh.
- Bao toan thay doi san co cua nguoi dung.
- Neu co quyet dinh quan trong, ghi lai ly do, phuong an da can nhac va anh huong tuong thich.
- Neu thay doi database, API, bien moi truong, quyen truy cap hoac trien khai, ghi ro cach nang cap va quay lui.
- Khong dua bi mat hoac du lieu nhay cam vao source code, tai lieu hay nhat ky.

## 4. Xac minh

Chon kiem tra theo pham vi thay doi, vi du:

- Frontend: lint, unit test, build va kiem tra luong UI lien quan.
- Backend: unit/integration test, migration check va kiem tra hop dong API.
- Bao mat/quyen: kiem tra ca truong hop duoc phep va bi tu choi, tenant dung va tenant khac.
- Trien khai: validate cau hinh, health check, backup/rollback va khoi dong thu trong moi truong phu hop.
- Tai lieu: kiem tra lien ket, lenh, ten file va tinh nhat quan voi hanh vi thuc te.

Chi ghi ket qua da quan sat. Neu mot buoc khong chay duoc, ghi `Chua chay` kem ly do.

## 5. Cap nhat nhat ky

Them muc moi nhat len dau phan `Lich su thay doi` cua `docs/CHANGELOG.md` theo mau sau:

```markdown
## YYYY-MM-DD-NN - Ten thay doi

- Thoi gian: YYYY-MM-DD HH:mm (Asia/Saigon)
- Loai: Sua loi | Tinh nang | Tai cau truc | Bao mat | Van hanh | Du lieu | Tai lieu
- Trang thai: Dang thuc hien | Hoan tat | Tam dung | Can xac nhan
- Muc tieu: Ket qua can dat.
- Pham vi: Thanh phan hoac luong nghiep vu bi anh huong.
- File da thay doi: Danh sach duong dan file.
- Noi dung: Hanh vi da thay doi va ly do.
- Quyet dinh ky thuat: Quyet dinh quan trong; ghi `Khong co` neu khong ap dung.
- Database/API/cau hinh: Migration, hop dong, bien moi truong; ghi `Khong co` neu khong ap dung.
- Kiem thu: Lenh hoac buoc da chay va ket qua thuc te.
- Rui ro con lai: Rui ro, gioi han hoac `Khong co da biet`.
- Viec tiep theo: Cong viec can tiep tuc hoac `Khong co`.
- Commit/PR: Ma commit, lien ket PR hoac `Chua tao`.
```

Khong xoa hoac viet lai lich su cu de lam dep nhat ky. Neu thong tin cu sai, them mot muc moi giai thich viec dinh chinh.

## 6. Ban giao

Khi ket thuc, thong bao ngan gon:

- Ket qua da hoan thanh.
- File va hanh vi chinh da thay doi.
- Kiem thu da chay va phan chua the kiem thu.
- Migration, cau hinh, rui ro va viec tiep theo neu co.

Neu co commit, cap nhat lai truong `Commit/PR` trong nhat ky. Neu chua commit, giu `Chua tao` de khong tao an tuong sai.
