# Ke hoach hardening bao mat web ViChat

## 1. Muc tieu va pham vi

Muc tieu la dua ChatUI, Chatmgt, Tinode relay, S3 media, PostgreSQL, Redis va reverse proxy production ve trang thai co the ky duyet theo checklist 20 muc trong video. Ke hoach nay chi ap dung cho web va cac backend/ha tang web phuc vu web; mobile khong nam trong pham vi tru khi dung chung API, Redis, database hoac upload storage.

Nguyen tac bat buoc:

- Blocker P0 phai duoc dong truoc khi deploy code moi.
- Moi thay doi auth, tenant, upload, database, firewall hoac cookie phai co test regression va rollback.
- Khong ghi secret, token, cookie, du lieu nguoi dung hoac IP credentials vao log, changelog, issue hay file plan.
- Khong coi unit test pass la bang chung production an toan; phai co kiem tra staging va dynamic test co kiem soat.
- Khong xoa du lieu Tinode/S3/PostgreSQL de sua loi; backup va rollback phai duoc xac nhan truoc.

## 2. Hien trang va muc tieu

Ket qua audit web ngay 2026-09-28:

| Uu tien | Van de | Bang chung | Muc tieu sau fix |
| --- | --- | --- | --- |
| P0 | Redis production mo cong 6379 va tra loi `PONG` khong can `AUTH` | Kiem tra TCP tu Internet; PostgreSQL 5432 dang dong | Redis chi truy cap tren Docker/private network, co ACL/password, firewall deny public |
| P1 | Login rate limit fail-open khi Redis loi | `auth_service.py` tra `False` neu Redis exception | Fail closed co thong bao 503/429, co `Retry-After`, khong bypass khi Redis down |
| P1 | Upload chap nhan MIME do client khai bao, chua allowlist/content sniffing | `chat_media_service.py` chi normalize MIME va so sanh metadata S3 | Allowlist theo loai file, magic-byte validation, quarantine/scan, reject mismatch |
| P1 | Personal Cloud mac dinh khong co per-file size cap | `PERSONAL_CLOUD_MAX_SIZE=0` | Moi scope co cap kich thuoc va quota, server/S3 deu enforce |
| P1 | Chua co dau hieu Cloudflare | DNS tro thang origin, response la Nginx, khong co Cloudflare header | Cloudflare proxy/WAF o edge, origin chi cho phep Cloudflare va SSH quan tri |
| P1 | Tinode PostgreSQL chay bang user `postgres` | Production Compose dung DSN user `postgres` | Role rieng theo service, migration owner tach khoi runtime |
| P2 | Con `console.*`/`print` va response tra `str(error)` | Frontend/backend search va controller error helpers | Production khong co debug output; response dung error code generic |
| P2 | Cookie framework legacy chua dong bo flags; fallback Secure la `false` | Runtime co `session=None` khong co flags; Compose fallback | Tat ca session cookie co HttpOnly, Secure, SameSite va startup assertion |
| P2 | Security headers thieu `Permissions-Policy`, HSTS chua toi uu | Public header chi co CSP, Referrer, X-Content, X-Frame, HSTS | Header baseline day du, HSTS co includeSubDomains va thoi han phu hop |
| P2 | Tinode API key duoc dua vao Vite bundle | `VITE_TINODE_API_KEY` trong build script va bundle | Neu la secret: rotate va bo khoi bundle; neu la public app key: doi ten, scope va xac nhan vendor |

Route legacy `api_user.py`/`api_organization.py` hien khong duoc import boi `application/controllers/__init__.py` va endpoint `/api/v1/user_info/123` dang tra 404 production. Tuy nhien code legacy co mau IDOR va set tenant tuy y; phai xoa hoac harden truoc khi bat lai, khong de ton tai duoi dang code co the re-enable nham.

## 3. Thu tu thuc hien

### Giai doan 0 - Dong bang va thu thap bang chung

**Owner:** DevOps + Backend lead. **Gate:** khong thay doi production neu chua co snapshot.

1. Tao release candidate rieng, ghi commit, image digest, Compose config da render va hash bundle; khong dung working tree dirty de deploy.
2. Backup Chatmgt PostgreSQL, Tinode PostgreSQL, Redis AOF/RDB, S3 object metadata, runtime config va TLS/Cloudflare config. Backup phai mode `0600`, ma hoa va co noi luu offsite.
3. Xac dinh process nao dang listen `6379`, kiem tra firewall/NAT/security group va log truy cap. Vi Redis da exposed, coi day la su co phai danh gia log va rotation.
4. Rotate Redis credential/ACL va cac secret co kha nang da bi truy cap; sau khi rotate phai revoke cac Chatmgt session hien tai neu co nguy co token/session bi lo.
5. Tao staging mirror khong dung du lieu production that. Moi test IDOR dung hai tenant va tai khoan test rieng.

### Giai doan 1 - Hotfix P0 ha tang

**Owner:** DevOps. **Gate:** dat truoc moi thay doi frontend/backend.

#### Redis va database

- Xoa moi `ports` public cho Redis/PostgreSQL/Tinode; chi dung `expose` trong Docker network.
- Firewall host deny inbound `6379`, `6380`, `5432`, `5433`, `6060`, `8093`, `8095`, `8096`, `9000`, `9001`; chi mo `80/443` va SSH quan tri theo allowlist.
- Redis bat ACL/password, dat `protected-mode yes`, tat command nguy hiem cho runtime user, gioi han keyspace va timeout hop ly. App phai ket noi bang Redis URL/ACL tu secret file, khong ghi credential vao Compose committed.
- Tao role Tinode rieng chi co quyen tren database/schema Tinode can dung; role migration/owner rieng chi dung khi migrate. Khong cho `chatapi` ket noi bang `postgres` superuser.
- Kiem tra `pg_hba.conf`, `listen_addresses`, Docker network va backup restore; runtime user khong co `CREATE DATABASE`, `SUPERUSER`, `CREATEROLE`.

#### Cloudflare va origin

- Tao DNS proxied cho `chat.gonplatform.com` va `chatmgt.gonplatform.com`, bat WAF/rate limiting/bot protection o edge.
- Origin chi cho phep IP Cloudflare vao 443; SSH chi tu jump host/management allowlist. Khong de origin IP phuc vu HTTP/HTTPS tu Internet ngoai Cloudflare.
- Bat Full (strict) TLS, origin certificate, TLS 1.2/1.3, HTTP redirect sang HTTPS, WSS qua edge.
- Sau khi cutover, xac nhan response co `CF-Ray`, `CF-Cache-Status` hoac dau hieu Cloudflare phu hop; khong coi DNS record alone la dat.

#### Bao ton va giam sat

- Duy tri backup truoc migration nhung bo sung backup dinh ky PostgreSQL/Tinode/Redis va S3 inventory; co retention, ma hoa, offsite va restore drill hang thang.
- Them monitoring cho uptime, TLS expiry, Redis auth failure, PostgreSQL connection, disk/S3 quota, login 401/429 spike, upload reject spike va container restart.
- Gui alert den kenh truc ca; healthcheck Docker chi la liveness, khong thay the alerting.

### Giai doan 2 - Auth, session va tenant boundary

**Owner:** Backend lead + Security reviewer. **Gate:** unit, integration hai tenant va DAST dat.

#### Rate limit fail-closed

1. Viet mot `rate_limit_service` dung Redis atomic Lua/pipeline `INCR + EXPIRE`, tranh race condition khi nhieu request dong thoi.
2. Tach bucket theo IP, identity/account va tenant/auth surface; them global IP ceiling cho login, password reset, Tinode token va upload ticket.
3. Neu Redis timeout, authentication endpoint tra `503 AUTH_RATE_LIMIT_UNAVAILABLE` hoac `429` theo chinh sach fail-closed; tuyet doi khong `return False` va cho login tiep.
4. Khong tra loi khac nhau giua user ton tai va user khong ton tai. Them `Retry-After`, audit event khong chua password/token.
5. Test Redis down, Redis slow, counter race, successful login reset counter, tenant A/B va IPv4/IPv6/proxy header.

#### Password va token

- Giu bcrypt rounds 12 hoac nang cap Argon2id neu benchmark staging cho phep; migrate hash on login, khong rehash hang loat trong request.
- Xoa/hard-disable legacy `sha512_crypt` password path; employee production chi dung UpGO Account SSO/credential exchange va Chatmgt khong luu password Account.
- Giam access JWT web ve 15-30 phut; them refresh rotation server-side trong HttpOnly cookie, reuse detection va revoke theo `jti`/auth version. Tinode token phai co TTL rieng ngan hon va khong nam trong token song qua dai.
- Moi logout, doi mat khau, role change, deactivate, tenant removal va admin revoke phai invalidate session ngay.
- Khong luu access token, password, Tinode credential hay message content vao localStorage/sessionStorage. Cookie auth phai co `HttpOnly; Secure; SameSite=Strict` va `Path` hep nhat co the.
- Set `CHAT_AUTH_COOKIE_SECURE=true` la default fail-closed trong production; startup refuse neu HTTPS production ma config false.
- Loai bo legacy framework session neu khong can. Neu van can, set cung bo flags va khong phat `session=None` thieu `HttpOnly/Secure/SameSite`.

#### Tenant va phan quyen

- Xay ma tran authorization cho moi endpoint active: anonymous, member tenant A, member tenant B, admin A, management admin.
- Moi query object bat buoc co `tenant_id` tu verified JWT/session va membership/owner check; khong lay tenant tu body/query/header client.
- Moi conversation/file/workspace ID phai tra `404` hoac `403` an toan khi khac tenant, khong leak ton tai object.
- Xoa module legacy khong duoc import hoac them test de dam bao khong re-enable route IDOR; neu giu lai thi them tenant filter va membership/admin guard cho tung route.
- Admin surface chi chap nhan management scope + Account admin role; member session phai bi tu choi o moi admin endpoint, khong chi an UI.
- Them test doi UUID/user/file/conversation/tenant tu A sang B cho GET/POST/PUT/DELETE, bao gom signed upload ticket va download URL.

#### Loi tra ve va CSRF

- Map exception noi bo/upstream ve error code public co dinh; khong tra `str(error)` cua Account, SQLAlchemy, S3, Tinode hay traceback.
- Log chi ghi `request_id`, error class, endpoint, tenant hash/anonymized ID; khong ghi cookie, Authorization, password, upload URL, API key.
- Them CSRF token double-submit hoac origin check cho moi state-changing request dung cookie auth. CORS khong duoc coi la CSRF defense.
- `OPTIONS`/CORS chi cho phep exact production origins, methods va headers can dung; khong wildcard khi `credentials=true`.

### Giai doan 3 - Upload, media va S3

**Owner:** Backend + Storage/Security. **Gate:** file abuse test dat va khong co object public.

#### Policy file type

- Tao allowlist trung tam theo policy: image, audio, video, document; moi loai co extension, MIME va magic-byte signature hop le.
- Reject `application/octet-stream`, executable/script, HTML/SVG khong sanitize, macro document, double extension va MIME/extension/signature mismatch.
- Khong tin `Content-Type`, ten file, extension hay kich thuoc tu browser; presigned ticket chi la precondition, completion phai doc metadata S3 va bytes/signature server-side.
- Image phai re-encode/strip metadata neu hien inline. File khac mac dinh `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.
- Dua file vao quarantine prefix; chi bind vao Tinode sau khi validation/AV scan dat. Cleanup pending object theo TTL.

#### Size, quota va download

- Dat cap per file theo loai va per-user/tenant quota; khong dung `0` de bieu thi unlimited trong production.
- Enforce tai ca create ticket, presigned policy, S3 object HEAD, completion, bind va download; them request timeout va upload concurrency limit.
- Signed PUT/GET URL TTL ngan, bucket private, khong public ACL, key hash theo tenant/owner, immutable completed object va ETag precondition.
- Kiem tra zip bomb, decompression ratio, PDF/DOC parser timeout va memory cap. Neu index RAG, tach pipeline ingest khoi message delivery.
- Them test path traversal, null byte, Unicode filename, MIME spoof, oversized body, truncated upload, replay ticket, cross-tenant ticket va expired URL.

### Giai doan 4 - Frontend va browser hardening

**Owner:** Frontend lead + Security reviewer.

- Xac dinh `VITE_TINODE_API_KEY` la public app identifier hay secret. Neu la secret: revoke/rotate ngay, bo khoi `scripts/build-production.mjs`, Docker ARG/ENV va bundle; client dung server relay/token exchange.
- Neu vendor bat buoc public app key: doi ten thanh public identifier, cap scope/origin/IP, rotate key dang committed va them test scan bundle khong co secret server.
- Them CI secret scan cho source, `dist`, Docker layers, tarball, sourcemap va log; khong publish source map production neu khong can.
- Xoa debug `console.log/info/debug`; giu error telemetry da redact va co sampling. Production build phai fail neu phat hien secret pattern hoac debug marker cam.
- Self-host font/icon hoac dung SRI; thu hep CSP `img-src`, `connect-src`, `style-src`, bo `unsafe-inline` neu co the. Them nonce/hash cho inline script/style can thiet.
- Them `Permissions-Policy` toi thieu: camera/microphone chi cho call surface, geolocation/payment/USB neu khong dung thi deny.
- Bo sung `Cache-Control: no-store` cho auth/profile/token response; static asset immutable co hash; khong cache message/media private.

### Giai doan 5 - Logging, monitoring va incident response

**Owner:** DevOps + Security operations.

- Chuan hoa JSON structured logging voi request ID, actor hash, tenant hash, route, status, latency va error code.
- Redact Authorization, Cookie, Set-Cookie, password, reset token, Tinode token, presigned URL query, S3 key nhay cam va request body.
- Audit cac event: login success/failure/rate-limit, logout/revoke, role/admin change, tenant switch, upload reject/complete/download, permission denial va backup/restore.
- Alert theo threshold va anomaly; log retention co access control, time sync, tamper resistance va rotation.
- Tao runbook khi Redis/DB/S3 bi expose: block firewall, preserve evidence, rotate secrets, revoke sessions, restore clean, verify va communicate.

## 4. Ma tran kiem thu bat buoc

### Static va unit

- `python -m unittest discover -s chatservice-main/tests -p "test_*.py" -q`
- `npm run test:frontend -- --test-concurrency=1`
- `npm run lint`
- `npm run build:production`
- `python -m py_compile` cac Python file thay doi.
- Secret scan source/dist/Docker context; grep khong con `console.log`, `print` production path, password/token/API key literal.
- Test cookie builder, JWT expiry/revoke, rate-limit fail-closed, tenant query helper, authorization matrix, MIME/signature/size policy va generic error mapper.

### Integration hai tenant

- Tenant A member khong doc/sua/xoa user, conversation, workspace, file, upload ticket, signed URL hay Tinode topic cua tenant B.
- Member khong goi duoc admin scope; admin A khong xem du lieu tenant B.
- Doi ID/UUID tren moi endpoint va kiem tra `404/403` khong leak metadata.
- Redis down/timeout: login/reset/token/upload ticket fail closed, khong co bypass.
- DB/S3/Tinode down: response generic, khong traceback/secret, message successful khong bi duplicate.

### Dynamic production-like

- HTTP redirect, TLS certificate/cipher, HSTS, CSP, Permissions-Policy, CORS origin xau, cookie flags, cache headers va WSS.
- External port check chi thay 80/443/SSH allowlist; 6379/5432/6060/8093/8095/8096/9000/9001 phai closed.
- DAST OWASP ZAP hoac cong cu tuong duong co scope `staging` truoc, sau do smoke test production khong xam lan.
- Upload abuse suite: MIME spoof, polyglot, ZIP bomb, oversized, path traversal, replay ticket, unauthorized download va public bucket.
- Backup restore drill: restore PostgreSQL/Tinode/Redis/S3 metadata vao isolated environment va chay acceptance.

## 5. Quy trinh deploy an toan

1. Merge tung nhom thay doi theo phase; khong gom P0 infrastructure va UI thay doi khong lien quan vao mot release khong rollback duoc.
2. Staging: apply migration/ACL/firewall, test full matrix, scan image/bundle, backup va restore drill.
3. Canary: deploy mot instance/service, theo doi 30-60 phut login 401/429, latency, Redis, DB, S3, reconnect va error rate.
4. Production: `docker compose config --quiet`, `nginx -t`, backup verified, deploy release immutable, healthcheck, public header/CORS/WSS/port verification, sau do UAT hai tenant.
5. Chi thong bao `da deploy` khi co release path, image digest, health output va test evidence. Neu bat ky P0/P1 fail thi rollback release va giu backup; khong downgrade migration tu dong.

## 6. Tieu chi hoan tat

Chi ky duyet web khi tat ca dieu sau dung:

- 20/20 muc trong checklist video co evidence dated, owner va command/test output.
- Khong con public Redis/PostgreSQL/Tinode/S3 management port; Redis ACL/password da duoc test tu app.
- Hai tenant authorization matrix dat 100%; khong co route active dung tenant tu client.
- Rate limit fail closed khi Redis down; session/cookie/JWT revoke va expiry dat.
- Upload allowlist, magic-byte/AV/quota/size validation dat; bucket private va signed URL ngan han.
- Production bundle khong co server secret, source map/debug log bi cam; CSP/CORS/cookie/security headers dat.
- Backup restore thanh cong, monitoring/alerting co nguoi nhan, runbook incident da duoc dien tap.
- Changelog, architecture/deployment docs, migration, rollback va UAT evidence dong bo voi release.

## 7. Thu tu uu tien de bat dau ngay

1. Block inbound `6379`, xac dinh owner Redis, rotate ACL/secret va danh gia log truy cap.
2. Sua Compose/firewall/role DB; verify khong con cong private service public.
3. Sua rate limit fail-closed va them Redis-down tests.
4. Chot upload allowlist, content validation, personal cloud size/quota va signed URL policy.
5. Audit active endpoint authorization hai tenant, harden/xoa legacy route.
6. Sua cookie/error/log/security headers va frontend key/debug output.
7. Cutover Cloudflare, WAF, origin restriction; sau do chay full security gate va deploy canary.
