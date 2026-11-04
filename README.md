# Ôn tập 12 bài văn Chính trị

Web tĩnh để ôn 12 bài văn, gồm dàn ý, bài văn rút gọn (khoảng 600 chữ), tự kiểm tra bằng trí nhớ, đồng hồ 30 phút và theo dõi tiến độ.

## Cấu trúc

- `content/cau-01.md` ... `cau-12.md`: nội dung từng câu. Phần `## Ý chính cần thuộc` dùng để chấm điểm: mỗi dòng là một ý, các cách diễn đạt được ngăn bằng dấu `|`.
- `index.html`, `styles.css`, `app.js`: giao diện và logic, không cần build.

## Chạy thử trên máy

```bash
npx serve .
# hoặc
python3 -m http.server 8000
```

Mở `http://localhost:8000`. Không mở trực tiếp file `index.html` vì trình duyệt sẽ chặn đọc file `content/`.

## Triển khai lên Vercel

1. Vào vercel.com, chọn **Add New → Project**, rồi import repo `gnodluong/chinhtri`.
2. Framework Preset chọn **Other**. Để trống Build Command, Output Directory để mặc định.
3. Bấm **Deploy**. Mỗi lần push lên repo, Vercel tự cập nhật.

## Tiến độ được lưu ở đâu

Tiến độ lưu trong `localStorage` của trình duyệt, không đồng bộ giữa các máy. Muốn giữ tiến độ trên máy khác thì cần ghi lại thủ công.
