const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3033;

// تنظیمات برای آپلود فایل
const upload = multer({ dest: 'uploads/' });

// آرایه نگاشت شماره کارمند به نام
const employeeNames = {
  8: 'عامری',
  10: 'خانفلی',
  12: 'کرمی',
  13: 'لرستانی',
  15: 'کوکبی',
  16: 'شیخی',
  17: 'خسروی',
  18: 'قنبری',
  19: 'آراسته',
  20: 'مسرور',
  21: 'احمدی',
  22: 'رمضانی',
  23: 'معروفی'
};

// متغیر برای ذخیره داده‌های CSV
let globalAttendanceData = {};
let globalYear = '';
let globalMonth = '';

// تنظیمات برای ارائه فایل‌های استاتیک
app.use(express.static(path.join(__dirname, 'public')));

// ارائه صفحه اصلی
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// مدیریت آپلود و پردازش CSV
app.post('/upload', upload.single('csv_file'), (req, res) => {
  const { year, month } = req.body;
  globalYear = year;
  globalMonth = month.padStart(2, '0');

  if (!req.file) {
    return res.json({ success: false, message: 'هیچ فایلی آپلود نشده است.' });
  }

  globalAttendanceData = {};
  fs.createReadStream(req.file.path)
    .pipe(parse({ delimiter: ',' }))
    .on('data', (row) => {
      const employeeId = row[0];
      const timestamp = row[1];
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');

      if (year == globalYear && month == globalMonth) {
        const time = date.toTimeString().split(' ')[0];
        if (!globalAttendanceData[employeeId]) {
          globalAttendanceData[employeeId] = {};
        }
        if (!globalAttendanceData[employeeId][date.toISOString().split('T')[0]]) {
          globalAttendanceData[employeeId][date.toISOString().split('T')[0]] = [];
        }
        globalAttendanceData[employeeId][date.toISOString().split('T')[0]].push(time);
      }
    })
    .on('end', () => {
      // مرتب‌سازی زمان‌ها
      for (const employeeId in globalAttendanceData) {
        for (const date in globalAttendanceData[employeeId]) {
          globalAttendanceData[employeeId][date].sort();
        }
      }

      // حذف فایل موقت
      fs.unlinkSync(req.file.path);
      res.json({ success: true });
    })
    .on('error', (err) => {
      res.json({ success: false, message: 'خطا در پردازش فایل: ' + err.message });
    });
});

// تابع برای گرفتن تمام روزهای ماه
function getDaysInMonth(year, month) {
  const days = [];
  const firstDay = new Date(year, month - 1, 1); // اولین روز ماه
  const lastDay = new Date(year, month, 0); // آخرین روز ماه
  for (let day = firstDay; day <= lastDay; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day).toISOString().split('T')[0]);
  }
  return days;
}

// تابع برای گرفتن نام روز هفته به فارسی (هماهنگ با تقویم ایرانی)
function getPersianDayOfWeek(dateString) {
  const date = new Date(dateString);
  const dayIndex = date.getDay();
  // تبدیل روز هفته میلادی به ایرانی: شنبه=0, یک‌شنبه=1, ..., جمعه=6
  const persianDayIndex = (dayIndex + 6) % 7; // جابجایی: یک‌شنبه (0) به یک‌شنبه (1)، شنبه (6) به شنبه (0)
  const days = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
  return days[persianDayIndex];
}

// مسیر برای نمایش جدول کارمند خاص
app.get('/employee/:id', (req, res) => {
  const employeeId = req.params.id;
  const shiftStart = '10:00:00'; // شروع شیفت (10 صبح)
  const shiftEnd = '18:00:00';   // پایان شیفت (6 عصر)

  let html = `
    <div class="container">
      <h2>جدول حضور و غیاب کارمند ${employeeNames[employeeId] || employeeId}</h2>
      <table>
        <tr><th>ردیف</th><th>تاریخ</th><th>زمان</th><th>نوع رکورد</th></tr>
  `;

  let rowNumber = 1;
  let totalMinutes = 0; // مجموع ساعات کار
  let totalAbsenceMinutes = 0; // مجموع غیبت
  let totalOvertimeMinutes = 0; // مجموع اضافه‌کاری

  if (globalAttendanceData[employeeId]) {
    for (const date in globalAttendanceData[employeeId]) {
      const times = globalAttendanceData[employeeId][date];
      const recordCount = times.length;
      const isInvalid = recordCount % 2 !== 0;

      for (let i = 0; i < recordCount; i++) {
        const time = times[i];
        let type = i % 2 === 0 ? 'ورود' : 'خروج';
        let className = i % 2 === 0 ? 'entry' : 'exit';

        if (isInvalid && i === recordCount - 1) {
          className += ' invalid';
          type = 'نامعتبر';
        }

        html += `<tr><td>${rowNumber}</td><td>${date}</td><td>${time}</td><td class="${className}">${type}</td></tr>`;
        rowNumber++;

        // محاسبه ساعات کار، غیبت و اضافه‌کاری فقط برای جفت‌های کامل
        if (i % 2 === 1 && !isInvalid) {
          const entryTime = new Date(`${date} ${times[i - 1]}`);
          const exitTime = new Date(`${date} ${time}`);
          const shiftStartTime = new Date(`${date} ${shiftStart}`);
          const shiftEndTime = new Date(`${date} ${shiftEnd}`);

          // محاسبه ساعات کار
          const diffMs = exitTime - entryTime;
          const durationMinutes = Math.floor(diffMs / 60000);
          totalMinutes += durationMinutes;

          // محاسبه غیبت
          let absenceMinutes = 0;
          if (entryTime > shiftStartTime) {
            absenceMinutes += Math.floor((entryTime - shiftStartTime) / 60000);
          }
          if (exitTime < shiftEndTime) {
            absenceMinutes += Math.floor((shiftEndTime - exitTime) / 60000);
          }
          totalAbsenceMinutes += absenceMinutes;

          // محاسبه اضافه‌کاری
          let overtimeMinutes = 0;
          if (entryTime < shiftStartTime) {
            overtimeMinutes += Math.floor((shiftStartTime - entryTime) / 60000);
          }
          if (exitTime > shiftEndTime) {
            overtimeMinutes += Math.floor((exitTime - shiftEndTime) / 60000);
          }
          totalOvertimeMinutes += overtimeMinutes;
        }
      }
    }
  } else {
    html += '<tr><td colspan="4">هیچ رکوردی برای این کارمند یافت نشد.</td></tr>';
  }

  html += '</table>';

  // محاسبه روزهای غایب
  const daysInMonth = getDaysInMonth(globalYear, parseInt(globalMonth));
  const absentDays = daysInMonth.filter(
    (day) => !globalAttendanceData[employeeId] || !globalAttendanceData[employeeId][day]
  );

  // جدول روزهای غایب
  html += `
    <h2 class="mt-5">روزهای غیبت کامل کارمند ${employeeNames[employeeId] || employeeId}</h2>
    <table class="absence-table">
      <tr><th>ردیف</th><th>تاریخ</th><th>روز هفته</th></tr>
  `;
  if (absentDays.length > 0) {
    absentDays.forEach((day, index) => {
      const dayOfWeek = getPersianDayOfWeek(day);
      const isNonWeekend = dayOfWeek !== 'پنج‌شنبه' && dayOfWeek !== 'جمعه';
      const rowClass = isNonWeekend ? 'non-weekend-absence' : '';
      html += `<tr class="${rowClass}"><td>${index + 1}</td><td>${day}</td><td>${dayOfWeek}</td></tr>`;
    });
  } else {
    html += '<tr><td colspan="3">هیچ روز غیبت کاملی ثبت نشده است.</td></tr>';
  }
  html += '</table>';

  // نمایش مجموع‌ها
  const workHours = Math.floor(totalMinutes / 60);
  const workMinutes = totalMinutes % 60;
  const absenceHours = Math.floor(totalAbsenceMinutes / 60);
  const absenceMinutes = totalAbsenceMinutes % 60;
  const overtimeHours = Math.floor(totalOvertimeMinutes / 60);
  const overtimeMinutes = totalOvertimeMinutes % 60;

  html += `
    <div class="monthly-summary">
      مجموع ساعات کار ماهانه برای ${employeeNames[employeeId] || employeeId}: ${workHours} ساعت و ${workMinutes} دقیقه<br>
      مجموع غیبت ماهانه: ${absenceHours} ساعت و ${absenceMinutes} دقیقه<br>
      مجموع اضافه‌کاری ماهانه: ${overtimeHours} ساعت و ${overtimeMinutes} دقیقه
    </div>
  `;
  html += '</div>';

  res.send(html);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});