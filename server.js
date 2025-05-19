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
  // 10: 'خانفلی',
  12: 'کرمی',
  13: 'لرستانی',
  15: 'کوکبی',
  16: 'شیخی',
  // 17: 'خسروی',
  // 18: 'قنبری',
  19: 'آراسته',
  // 20: 'مسرور',
  21: 'احمدی',
  22: 'رمضانی',
  23: 'معروفی'
};

// متغیر برای ذخیره داده‌های CSV
let globalAttendanceData = {};
let globalYear = '';
let globalMonth = '';

// تنظیمات برای ارائه فایل‌های استاتیک
app.use(express.json());
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
    .pipe(parse({
      delimiter: ',',
      columns: false,
      skip_empty_lines: true,
      skip_lines_with_error: true,
      relax_column_count: true
    }))
    .on('data', (row) => {
      if (row.length >= 2 && row[0] && row[1]) {
        const employeeId = row[0];
        const timestamp = row[1];
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
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
        }
      }
    })
    .on('end', () => {
      for (const employeeId in globalAttendanceData) {
        for (const date in globalAttendanceData[employeeId]) {
          globalAttendanceData[employeeId][date].sort();
        }
      }
      fs.unlinkSync(req.file.path);
      res.json({ success: true });
    })
    .on('error', (err) => {
      console.log("error:", err);
      res.json({ success: false, message: 'خطا در پردازش فایل: ' + err.message });
    });
});

// تابع برای گرفتن تمام روزهای ماه
function getDaysInMonth(year, month) {
  const days = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  for (let day = firstDay; day <= lastDay; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day).toISOString().split('T')[0]);
  }
  return days;
}

// تابع برای گرفتن نام روز هفته به فارسی
function getPersianDayOfWeek(dateString) {
  const date = new Date(dateString);
  const dayIndex = date.getDay();
  const persianDayIndex = (dayIndex + 6) % 7;
  const days = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
  return days[persianDayIndex];
}

// تابع برای فرمت کردن زمان به ساعت و دقیقه
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} ساعت و ${mins} دقیقه`;
}

// تابع برای محاسبه کارکرد، غیبت و اضافه‌کاری برای یک روز
function calculateDailyMetrics(date, times, shift) {
  const dayOfWeek = getPersianDayOfWeek(date);
  let shiftStart, shiftEnd;
  if (shift === 'sat-wed') {
    shiftStart = '10:00:00';
    shiftEnd = '19:00:00';
  } else {
    if (dayOfWeek === 'پنج‌شنبه') {
      shiftStart = '10:00:00';
      shiftEnd = '14:00:00';
    } else {
      shiftStart = '10:00:00';
      shiftEnd = '18:00:00';
    }
  }

  const shiftStartTime = new Date(`${date} ${shiftStart}`);
  const shiftEndTime = new Date(`${date} ${shiftEnd}`);

  // محاسبه کارکرد کل (مجموع زمان حضور)
  let totalWorkMinutes = 0;
  for (let i = 0; i < times.length; i += 2) {
    const entryTime = new Date(`${date} ${times[i]}`);
    const exitTime = new Date(`${date} ${times[i + 1]}`);
    const diffMs = exitTime - entryTime;
    totalWorkMinutes += Math.floor(diffMs / 60000);
  }

  // محاسبه غیبت کل (بازه‌های زمانی که کارمند حضور نداشته)
  let totalAbsenceMinutes = 0;
  if (times.length > 0) {
    let lastExit = shiftStartTime;
    for (let i = 0; i < times.length; i += 2) {
      const entryTime = new Date(`${date} ${times[i]}`);
      // بررسی فاصله بین خروج قبلی و ورود فعلی (فقط اگر داخل شیفت باشد)
      if (entryTime > lastExit && entryTime < shiftEndTime) {
        if (lastExit < shiftStartTime) {
          lastExit = shiftStartTime;
        }
        const absenceMs = entryTime - lastExit;
        totalAbsenceMinutes += Math.floor(absenceMs / 60000);
      }
      lastExit = new Date(`${date} ${times[i + 1]}`);
    }
    // بررسی غیبت بعد از آخرین خروج تا پایان شیفت
    if (lastExit < shiftEndTime) {
      const absenceMs = shiftEndTime - lastExit;
      totalAbsenceMinutes += Math.floor(absenceMs / 60000);
    }
  } else {
    // اگر هیچ حضوری در روز ثبت نشده، کل زمان شیفت غیبت حساب می‌شه
    const shiftDurationMs = shiftEndTime - shiftStartTime;
    totalAbsenceMinutes = Math.floor(shiftDurationMs / 60000);
  }

  // محاسبه اضافه‌کاری کل
  let totalOvertimeMinutes = 0;
  for (let i = 0; i < times.length; i += 2) {
    const entryTime = new Date(`${date} ${times[i]}`);
    const exitTime = new Date(`${date} ${times[i + 1]}`);
    if (entryTime < shiftStartTime) {
      const overtimeMs = shiftStartTime - entryTime;
      totalOvertimeMinutes += Math.floor(overtimeMs / 60000);
    }
    if (exitTime > shiftEndTime) {
      const overtimeMs = exitTime - shiftEndTime;
      totalOvertimeMinutes += Math.floor(overtimeMs / 60000);
    }
  }

  return { totalWorkMinutes, totalAbsenceMinutes, totalOvertimeMinutes };
}

// مسیر برای نمایش جدول کارمند خاص با شیفت
app.get('/employee/:id/:shift', (req, res) => {
  const employeeId = req.params.id;
  const shift = req.params.shift;

  let html = `
    <div class="container">
      <h2>جدول حضور و غیاب کارمند ${employeeNames[employeeId] || employeeId} (شیفت: ${shift === 'sat-wed' ? 'شنبه تا چهارشنبه' : 'شنبه تا پنج‌شنبه'})</h2>
      <button id="addAttendanceButton" class="btn btn-success mb-3">افزودن حضور جدید</button>
      <table>
        <tr><th>ردیف</th><th>تاریخ</th><th>ساعت ورود</th><th>ساعت خروج</th><th>مجموع کارکرد</th><th>مجموع غیبت</th><th>مجموع اضافه‌کاری</th></tr>
  `;

  let rowNumber = 1;
  let totalWorkMinutes = 0;
  let totalAbsenceMinutes = 0;
  let totalOvertimeMinutes = 0;

  if (globalAttendanceData[employeeId]) {
    // مرتب‌سازی تاریخ‌ها
    const dates = Object.keys(globalAttendanceData[employeeId]).sort();
    for (const date of dates) {
      const times = globalAttendanceData[employeeId][date];
      const recordCount = times.length;

      // فقط جفت‌های کامل (تعداد زوج) پردازش می‌شن
      if (recordCount % 2 === 0 && recordCount > 0) {
        // محاسبه مقادیر کل برای روز
        const { totalWorkMinutes: dailyWork, totalAbsenceMinutes: dailyAbsence, totalOvertimeMinutes: dailyOvertime } = calculateDailyMetrics(date, times, shift);

        totalWorkMinutes += dailyWork;
        totalAbsenceMinutes += dailyAbsence;
        totalOvertimeMinutes += dailyOvertime;

        // نمایش همه جفت‌ها برای این روز
        for (let i = 0; i < recordCount; i += 2) {
          const entryTimeStr = times[i];
          const exitTimeStr = times[i + 1];

          html += `
            <tr>
              <td>${rowNumber}</td>
              <td>${date}</td>
              <td>${entryTimeStr}</td>
              <td>${exitTimeStr}</td>
              <td>${formatDuration(dailyWork)}</td>
              <td>${formatDuration(dailyAbsence)}</td>
              <td>${formatDuration(dailyOvertime)}</td>
            </tr>
          `;
          rowNumber++;
        }
      }
    }
  } else {
    html += '<tr><td colspan="7">هیچ رکوردی برای این کارمند یافت نشد.</td></tr>';
  }

  html += '</table>';

  const daysInMonth = getDaysInMonth(globalYear, parseInt(globalMonth));
  const absentDays = daysInMonth.filter((day) => {
    const dayOfWeek = getPersianDayOfWeek(day);
    if (shift === 'sat-wed' && (dayOfWeek === 'پنج‌شنبه' || dayOfWeek === 'جمعه')) {
      return false;
    }
    if (shift === 'sat-thu' && dayOfWeek === 'جمعه') {
      return false;
    }
    return !globalAttendanceData[employeeId] || !globalAttendanceData[employeeId][day] || globalAttendanceData[employeeId][day].length % 2 !== 0;
  });

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

  const workHours = Math.floor(totalWorkMinutes / 60);
  const workMinutes = totalWorkMinutes % 60;
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

// مسیر برای افزودن رکورد حضور جدید
app.post('/employee/:id/:shift/add', (req, res) => {
  const employeeId = req.params.id;
  const { date, entryTime, exitTime } = req.body;

  const entryDateTime = new Date(`${date} ${entryTime}`);
  const exitDateTime = new Date(`${date} ${exitTime}`);
  if (isNaN(entryDateTime.getTime()) || isNaN(exitDateTime.getTime())) {
    return res.json({ success: false, message: 'زمان ورود یا خروج نامعتبر است.' });
  }
  if (entryDateTime >= exitDateTime) {
    return res.json({ success: false, message: 'ساعت خروج باید بعد از ساعت ورود باشد.' });
  }

  const year = entryDateTime.getFullYear();
  const month = String(entryDateTime.getMonth() + 1).padStart(2, '0');
  if (year != globalYear || month != globalMonth) {
    return res.json({ success: false, message: 'تاریخ انتخاب‌شده خارج از ماه و سال انتخاب‌شده است.' });
  }

  if (!globalAttendanceData[employeeId]) {
    globalAttendanceData[employeeId] = {};
  }
  if (!globalAttendanceData[employeeId][date]) {
    globalAttendanceData[employeeId][date] = [];
  }

  globalAttendanceData[employeeId][date].push(entryTime + ':00', exitTime + ':00');
  globalAttendanceData[employeeId][date].sort();

  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});