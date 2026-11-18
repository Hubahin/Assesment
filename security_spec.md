# Spesifikasi Keamanan Firestore — Sensus Desa Cibiru Wetan 2026

## 1. Invarian Data
1. **Akses Terbatas Petugas Terdaftar**: Pengguna yang emailnya tidak terdaftar aktif di `staff_members` (selain admin bootstrap `arisriswanto057@gmail.com`) tidak dapat membaca atau menulis koleksi mana pun.
2. **Isolasi Wilayah (RBAC + RT Scoping)**:
   - `admin`: akses penuh ke konfigurasi wilayah, manajemen petugas (admin, koordinator, enumerator), verifikasi hasil sensus (`terverifikasi` / `dikembalikan`), seluruh rumah tangga, PII, kunjungan, dan log revisi.
   - `koordinator`: dapat membaca, menambah, dan mengirim/memperbarui data sensus pada `assignedRTs` miliknya (tanpa mengubah status menjadi `terverifikasi`), serta mendaftarkan/mengubah petugas dengan `role == 'enumerator'`. Tidak dapat mempromosikan diri atau orang lain menjadi `admin` atau `koordinator`.
   - `enumerator`: dapat membaca, menambah, dan mengirim/memperbarui data sensus beserta foto, PII, dan log kunjungan pada `assignedRTs` miliknya. Tidak dapat menandai isian sebagai `terverifikasi` (verifikasi dilakukan oleh `admin`).
3. **Imutabilitas ID dan Riwayat**:
   - Dokumen `households` tidak pernah dapat dihapus (`allow delete: if false`).
   - Field identitas (`id_rt`, `dusun`, `rw`, `rt`, `rtKey`, `urutan`, `createdAt`, `createdBy`) tidak dapat diubah setelah dibuat.
   - Koleksi `visits` dan `revision_logs` bersifat append-only (tidak dapat diubah atau dihapus).
4. **Isolasi PII**:
   - NIK dan Nomor KK disimpan terpisah pada `household_pii/{id_rt}`, bukan pada `households/{id_rt}`.
5. **Integritas Email & Timestamp**:
   - Semua akses berbasis email wajib memverifikasi `request.auth.token.email_verified == true`.
   - Field `createdAt` dan `updatedAt` wajib menggunakan `request.time` (`serverTimestamp()`).

## 2. "Dirty Dozen" Payloads (Uji Penolakan `PERMISSION_DENIED`)
1. **Unauthenticated Read**: Membaca `/households/CBW-D1-01-01-001` tanpa login (`auth == null`).
2. **Unregistered User Read**: User terautentikasi dengan email asing (`stranger@gmail.com`) mencoba membaca `/households` atau `/config/wilayah`.
3. **Unverified Email Spoofing**: User dengan email admin tetapi `email_verified: false` mencoba menulis `/config/wilayah`.
4. **Privilege Escalation (Enumerator -> Admin)**: Enumerator mencoba mengubah `role` miliknya di `/staff_members/{email}` menjadi `'admin'`.
5. **Privilege Escalation by Koordinator**: Koordinator mencoba membuat/mengubah user menjadi `role: 'koordinator'` atau `role: 'admin'`.
6. **Cross-RT Read/List by Enumerator**: Enumerator yang hanya ditugaskan ke `D1-01-01` mencoba `list` atau `get` `/households` milik `D2-07-03`.
7. **Cross-RT Write by Enumerator**: Enumerator mencoba membuat/mengubah rumah tangga di RT yang tidak ada di `assignedRTs` miliknya.
8. **Self-Verification Bypass**: Enumerator mencoba mengubah `verifikasi_status` pada `/households/{id}` menjadi `'terverifikasi'`.
9. **Immutable ID Mutation**: Enumerator/Koordinator mencoba mengubah `id_rt` atau `urutan` pada dokumen `/households/{id}` yang sudah ada.
10. **Household Deletion**: Admin/Koordinator/Enumerator mencoba menghapus dokumen `/households/{id}`.
11. **Shadow / Ghost Field Injection**: Penyerang menyisipkan field liar `isSuperUser: true` pada payload `create` atau `update` `/households/{id}` atau `/staff_members/{email}`.
12. **Audit Log Tampering**: Petugas mencoba mengubah atau menghapus dokumen di `/revision_logs/{logId}` atau `/visits/{visitId}`.
