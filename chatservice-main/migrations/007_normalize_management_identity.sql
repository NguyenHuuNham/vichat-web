BEGIN;

UPDATE management_tenant
SET name = 'SÔNG HỒNG',
    updated_at = EXTRACT(EPOCH FROM NOW())::bigint
WHERE id = 'song-hong'
  AND name IN ('SONG HONG', 'Song Hong');

UPDATE management_account
SET full_name = 'Mai Thành Lâm',
    department = 'Ban điều hành',
    title = 'Quản trị viên',
    updated_at = EXTRACT(EPOCH FROM NOW())::bigint
WHERE tenant_id = 'song-hong' AND username = 'admin' AND full_name = 'Mai Thanh Lam';

UPDATE management_account
SET full_name = 'Nguyễn Văn Tuấn',
    department = 'Phòng Điều hành',
    title = 'Trưởng phòng Điều hành',
    updated_at = EXTRACT(EPOCH FROM NOW())::bigint
WHERE tenant_id = 'song-hong' AND username = 'tuan' AND full_name = 'Nguyen Van Tuan';

UPDATE management_account
SET full_name = 'Nguyễn Thị Lan',
    department = 'Phòng Điều hành',
    title = 'Phó phòng Điều hành',
    updated_at = EXTRACT(EPOCH FROM NOW())::bigint
WHERE tenant_id = 'song-hong' AND username = 'lan' AND full_name = 'Nguyen Thi Lan';

UPDATE management_account
SET full_name = 'Phạm Thị Hương',
    department = 'Phòng HCNS',
    title = 'Trưởng phòng HCNS',
    updated_at = EXTRACT(EPOCH FROM NOW())::bigint
WHERE tenant_id = 'song-hong' AND username = 'huong' AND full_name = 'Pham Thi Huong';

UPDATE management_account
SET full_name = 'Lê Quốc Bảo',
    department = 'Phòng Kế toán',
    title = 'Kế toán trưởng',
    updated_at = EXTRACT(EPOCH FROM NOW())::bigint
WHERE tenant_id = 'song-hong' AND username = 'bao' AND full_name = 'Le Quoc Bao';

UPDATE management_account
SET full_name = 'Đỗ Minh Quân',
    department = 'Phòng Kinh doanh',
    title = 'Trưởng phòng Kinh doanh',
    updated_at = EXTRACT(EPOCH FROM NOW())::bigint
WHERE tenant_id = 'song-hong' AND username = 'quan' AND full_name = 'Do Minh Quan';

COMMIT;
