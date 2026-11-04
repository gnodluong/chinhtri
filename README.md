# Ôn tập 12 bài văn Chính trị

Web tĩnh để ôn 12 bài văn Chính trị theo hướng hiểu và vận dụng, không học thuộc vẹt. Gồm bài văn rút gọn (khoảng 500 chữ), trắc nghiệm có giải thích, kéo thả sắp xếp dàn ý, đồng hồ 30 phút để viết thử và theo dõi tiến độ.

## Cấu trúc

- `content/cau-01.md` ... `cau-12.md`: dàn ý và bài văn của từng câu.
- `content/quiz.json`: 5 câu trắc nghiệm cho mỗi bài. Có câu kiểm tra kiến thức và câu tình huống để áp dụng vào đơn vị. Mỗi câu có giải thích sau khi nộp bài. Thứ tự đáp án được xáo mỗi lần làm.
- `index.html`, `styles.css`, `app.js`: giao diện và logic, không cần build.

Một câu được tính là đạt khi làm trắc nghiệm đúng từ 80% trở lên và xếp đúng thứ tự dàn ý. Tiến độ lưu trong trình duyệt.

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
