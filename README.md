# Ôn tập 12 bài văn Chính trị

Web tĩnh để ôn 12 bài văn Chính trị theo "Phương pháp học văn: dễ nhớ, dễ hiểu, dễ áp dụng".

Quy trình trong app:
- Hiểu trước, nhớ sau. Mỗi bài có thẻ 3-5-1: 3 ý lớn, 5 từ khóa, 1 câu chốt.
- Tự nhắc không nhìn tài liệu. Chỉ mở đáp án sau khi đã cố nhớ, và tự đánh giá Nhớ đủ, Nhớ một phần hoặc Quên.
- Ôn cách quãng: sau lần nhớ đủ, lần ôn tiếp theo là 1, 3, 7, 14 ngày. Quên hoặc nhớ một phần thì ôn lại sau 1 ngày.
- Viết theo khung MỞ - GIẢI - DẪN - PHÂN - CHỐT, có đồng hồ 30 phút.
- Kế hoạch 30 phút và checklist cuối buổi ở tab Hôm nay.
- Trắc nghiệm và sắp xếp dàn ý ở tab Luyện hiểu là phần kiểm tra thêm, không tính vào lịch ôn.

Một câu được coi là nhớ bền khi đã ôn đủ 5 lần và lần cuối nhớ đủ. Tiến độ lưu trong trình duyệt.

## Cấu trúc

- `content/cau-01.md` ... `cau-12.md`: dàn ý và bài văn rút gọn của từng câu.
- `content/study.json`: thẻ 3-5-1 và khung viết cho mỗi câu.
- `content/quiz.json`: 5 câu trắc nghiệm cho mỗi bài, có giải thích.
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
