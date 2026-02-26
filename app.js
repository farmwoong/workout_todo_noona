import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
  getDatabase,
  ref,
  get,
  update,
  remove,
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

// Your web app's Firebase configuration (Realtime Database 사용)
const firebaseConfig = {
  apiKey: "AIzaSyD3j6cqtY5Tsls_TjRKubpEz3UZ-gsWeCg",
  authDomain: "woong-noona-todo.firebaseapp.com",
  projectId: "woong-noona-todo",
  storageBucket: "woong-noona-todo.firebasestorage.app",
  messagingSenderId: "88453280018",
  appId: "1:88453280018:web:80e790c3c42a861a7a83cb",
  databaseURL: "https://woong-noona-todo-default-rtdb.firebaseio.com"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const workoutLogsPath = 'workoutLogs';

const toastEl = document.getElementById('toast');

let useRealtimeDb = true;
let datesWithRecords = new Set(); // 날짜 문자열 YYYY-MM-DD
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-based
let collapsedExerciseIds = new Set(); // 접힌 운동 카드 exId

/* ----- 운동 기록 ----- */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

let selectedWorkoutDate = todayStr();
let workoutLogCache = {}; // { [date]: { exercises: { [id]: { name, part, sets } } } }

function parseSets(val) {
  if (!val || typeof val !== 'object') return [];
  const keys = Object.keys(val).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => ({ kg: val[k].kg ?? 0, reps: val[k].reps ?? 0, done: !!val[k].done }));
}

async function loadWorkoutLog(date) {
  const snapshot = await get(ref(db, workoutLogsPath + '/' + date + '/exercises'));
  const val = snapshot.val();
  if (!val || typeof val !== 'object') return {};
  const exercises = {};
  for (const [id, raw] of Object.entries(val)) {
    exercises[id] = {
      name: raw.name ?? '',
      part: raw.part ?? '',
      sets: parseSets(raw.sets),
    };
  }
  return exercises;
}

function getWorkoutLog(date) {
  return workoutLogCache[date] || { exercises: {} };
}

function setWorkoutLogLocal(date, exercises) {
  workoutLogCache[date] = { exercises: exercises || {} };
}

function setsToFirebase(sets) {
  const o = {};
  sets.forEach((s, i) => {
    o[i] = { kg: s.kg, reps: s.reps, done: s.done };
  });
  return o;
}

function calcVolume(sets) {
  return sets.reduce((sum, s) => sum + (Number(s.kg) || 0) * (Number(s.reps) || 0), 0);
}

function calcVolumeDone(sets) {
  return sets.reduce((sum, s) => (s.done ? sum + (Number(s.kg) || 0) * (Number(s.reps) || 0) : sum), 0);
}

async function saveWorkoutExerciseToDb(date, exId, data) {
  const path = workoutLogsPath + '/' + date + '/exercises/' + exId;
  await update(ref(db, path), {
    name: data.name,
    part: data.part,
    sets: setsToFirebase(data.sets),
  });
}

async function removeWorkoutExerciseFromDb(date, exId) {
  await remove(ref(db, workoutLogsPath + '/' + date + '/exercises/' + exId));
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 4000);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatWorkoutDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = todayStr();
  const label = d.getMonth() + 1 + '월 ' + d.getDate() + '일';
  const sub = dateStr === today ? '오늘' : (dateStr < today ? '과거' : '예정');
  return { label, sub };
}

/* ----- 달력: 운동 기록 있는 날 표시 ----- */
async function loadWorkoutDates() {
  try {
    const snapshot = await get(ref(db, workoutLogsPath));
    const val = snapshot.val();
    datesWithRecords = new Set(val && typeof val === 'object' ? Object.keys(val) : []);
  } catch (_) {
    datesWithRecords = new Set();
  }
}

function renderCalendar() {
  const gridEl = document.getElementById('calendarGrid');
  const labelEl = document.getElementById('calendarMonthLabel');
  if (!gridEl || !labelEl) return;

  labelEl.textContent = calendarYear + '년 ' + (calendarMonth + 1) + '월';

  const first = new Date(calendarYear, calendarMonth, 1);
  const last = new Date(calendarYear, calendarMonth + 1, 0);
  const startDay = first.getDay();
  const daysInMonth = last.getDate();

  const today = todayStr();

  let html = '';
  const prevMonth = calendarMonth === 0 ? 11 : calendarMonth - 1;
  const prevYear = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
  const prevMonthDays = new Date(prevYear, prevMonth + 1, 0).getDate();

  for (let i = 0; i < startDay; i++) {
    const d = prevMonthDays - startDay + i + 1;
    const dateStr = prevYear + '-' + String(prevMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const hasRecord = datesWithRecords.has(dateStr);
    html += `<div class="calendar-day other-month${hasRecord ? ' has-record' : ''}" data-date="${dateStr}">${d}</div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calendarYear + '-' + String(calendarMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const hasRecord = datesWithRecords.has(dateStr);
    const isToday = dateStr === today;
    const isSelected = dateStr === selectedWorkoutDate;
    const classes = ['calendar-day', isToday ? 'today' : '', isSelected ? 'selected' : '', hasRecord ? 'has-record' : ''].filter(Boolean).join(' ');
    html += `<div class="${classes}" data-date="${dateStr}">${d}</div>`;
  }
  const totalCells = startDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remaining; i++) {
    const d = i + 1;
    const nextMonth = calendarMonth === 11 ? 0 : calendarMonth + 1;
    const nextYear = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
    const dateStr = nextYear + '-' + String(nextMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const hasRecord = datesWithRecords.has(dateStr);
    html += `<div class="calendar-day other-month${hasRecord ? ' has-record' : ''}" data-date="${dateStr}">${d}</div>`;
  }

  gridEl.innerHTML = html;
  gridEl.querySelectorAll('.calendar-day').forEach((el) => {
    el.addEventListener('click', () => {
      const date = el.dataset.date;
      if (!date) return;
      loadWorkoutForDateAndRender(date);
    });
  });
}

function refreshCalendar() {
  loadWorkoutDates().then(() => renderCalendar());
}

function renderWorkoutPanel() {
  const dateLabel = document.getElementById('workoutDateLabel');
  const dateSub = document.getElementById('workoutDateSub');
  const totalVolumeEl = document.getElementById('workoutTotalVolume');
  const totalWrap = document.getElementById('workoutTotalWrap');
  const listEl = document.getElementById('workoutList');
  const emptyEl = document.getElementById('workoutEmpty');

  const { label, sub } = formatWorkoutDate(selectedWorkoutDate);
  dateLabel.textContent = label;
  dateSub.textContent = sub;

  const log = getWorkoutLog(selectedWorkoutDate);
  const exercises = log.exercises || {};
  const entries = Object.entries(exercises);

  let totalVol = 0;
  entries.forEach(([, ex]) => {
    totalVol += calcVolume(ex.sets || []);
  });
  totalVolumeEl.textContent = totalVol.toLocaleString();
  totalWrap.style.display = 'block';

  listEl.innerHTML = '';
  entries.forEach(([exId, ex]) => {
    const sets = ex.sets || [];
    const exVol = calcVolume(sets);
    const exVolDone = calcVolumeDone(sets);
    const isCollapsed = collapsedExerciseIds.has(exId);
    const card = document.createElement('li');
    card.className = 'workout-exercise' + (isCollapsed ? ' collapsed' : '');
    card.dataset.exerciseId = exId;
    card.innerHTML = `
      <div class="workout-exercise-header" role="button" tabindex="0">
        <span class="workout-exercise-title-wrap">
          <span class="workout-toggle" aria-label="${isCollapsed ? '펼치기' : '접기'}">▼</span>
          <span class="workout-exercise-title">${escapeHtml(ex.name)}<span class="workout-exercise-part">${ex.part ? ' | ' + escapeHtml(ex.part) : ''}</span></span>
        </span>
        <span class="workout-exercise-volume">${exVolDone}/${exVol} kg</span>
      </div>
      <div class="workout-sets-table-wrap">
        <table class="workout-sets-table">
          <thead><tr><th>세트</th><th>kg</th><th>회</th><th>완료</th><th>삭제선택</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="workout-exercise-actions">
        <button type="button" class="btn-add-set">+ 세트 추가</button>
        <button type="button" class="btn-remove-selected-sets">선택한 세트 삭제</button>
        <button type="button" class="btn-remove-exercise">운동 삭제</button>
      </div>
    `;
    const tbody = card.querySelector('tbody');
    sets.forEach((set, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><input type="number" class="set-input set-kg" min="0" step="0.5" value="${set.kg}" data-set-index="${idx}" /></td>
        <td><input type="number" class="set-input set-reps" min="0" step="1" value="${set.reps}" data-set-index="${idx}" /></td>
        <td><span class="workout-set-done ${set.done ? 'done' : ''}" data-set-index="${idx}" role="button" tabindex="0">${set.done ? '✓' : '○'}</span></td>
        <td><input type="checkbox" class="set-delete-check" data-set-index="${idx}" title="삭제할 세트 선택" /></td>
        <td><button type="button" class="workout-set-remove" data-set-index="${idx}">삭제</button></td>
      `;
      tbody.appendChild(tr);
    });
    if (sets.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" style="color:var(--text-muted);font-size:0.85rem;">세트를 추가하세요.</td>';
      tbody.appendChild(tr);
    }

    card.querySelector('.workout-exercise-header').addEventListener('click', () => {
      if (collapsedExerciseIds.has(exId)) collapsedExerciseIds.delete(exId);
      else collapsedExerciseIds.add(exId);
      card.classList.toggle('collapsed', collapsedExerciseIds.has(exId));
      card.querySelector('.workout-toggle').setAttribute('aria-label', collapsedExerciseIds.has(exId) ? '펼치기' : '접기');
    });

    card.querySelector('.btn-add-set').addEventListener('click', async () => {
      const ex = getWorkoutLog(selectedWorkoutDate).exercises[exId];
      if (!ex) return;
      ex.sets = ex.sets || [];
      ex.sets.push({ kg: 0, reps: 0, done: false });
      setWorkoutLogLocal(selectedWorkoutDate, { ...getWorkoutLog(selectedWorkoutDate).exercises, [exId]: ex });
      try {
        if (useRealtimeDb) await saveWorkoutExerciseToDb(selectedWorkoutDate, exId, ex);
      } catch (_) {}
      renderWorkoutPanel();
    });

    card.querySelector('.btn-remove-selected-sets').addEventListener('click', () => {
      const ex = getWorkoutLog(selectedWorkoutDate).exercises[exId];
      if (!ex || !ex.sets.length) return;
      const checked = card.querySelectorAll('.set-delete-check:checked');
      const indicesToRemove = new Set(Array.from(checked).map((c) => parseInt(c.dataset.setIndex, 10)));
      if (indicesToRemove.size === 0) return;
      ex.sets = ex.sets.filter((_, idx) => !indicesToRemove.has(idx));
      setWorkoutLogLocal(selectedWorkoutDate, { ...getWorkoutLog(selectedWorkoutDate).exercises, [exId]: ex });
      (async () => {
        try {
          if (useRealtimeDb) await saveWorkoutExerciseToDb(selectedWorkoutDate, exId, ex);
        } catch (_) {}
        renderWorkoutPanel();
      })();
    });

    card.querySelector('.btn-remove-exercise').addEventListener('click', async () => {
      const exs = { ...getWorkoutLog(selectedWorkoutDate).exercises };
      delete exs[exId];
      setWorkoutLogLocal(selectedWorkoutDate, exs);
      try {
        if (useRealtimeDb) await removeWorkoutExerciseFromDb(selectedWorkoutDate, exId);
      } catch (_) {}
      renderWorkoutPanel();
      refreshCalendar();
    });

    function updateCardVolume() {
      const ex = getWorkoutLog(selectedWorkoutDate).exercises[exId];
      if (!ex) return;
      const volEl = card.querySelector('.workout-exercise-volume');
      if (volEl) volEl.textContent = calcVolumeDone(ex.sets) + '/' + calcVolume(ex.sets) + ' kg';
    }

    tbody.querySelectorAll('.set-kg, .set-reps').forEach((input) => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.setIndex, 10);
        const ex = getWorkoutLog(selectedWorkoutDate).exercises[exId];
        if (!ex || !ex.sets[idx]) return;
        if (input.classList.contains('set-kg')) ex.sets[idx].kg = parseFloat(input.value) || 0;
        else ex.sets[idx].reps = parseInt(input.value, 10) || 0;
        setWorkoutLogLocal(selectedWorkoutDate, { ...getWorkoutLog(selectedWorkoutDate).exercises, [exId]: ex });
        if (useRealtimeDb) saveWorkoutExerciseToDb(selectedWorkoutDate, exId, ex).catch(() => {});
        updateCardVolume();
        const totalVolEl = document.getElementById('workoutTotalVolume');
        if (totalVolEl) totalVolEl.textContent = Object.values(getWorkoutLog(selectedWorkoutDate).exercises).reduce((s, e) => s + calcVolume(e.sets || []), 0).toLocaleString();
      });
    });

    tbody.querySelectorAll('.workout-set-done').forEach((span) => {
      span.addEventListener('click', () => {
        const idx = parseInt(span.dataset.setIndex, 10);
        const ex = getWorkoutLog(selectedWorkoutDate).exercises[exId];
        if (!ex || !ex.sets[idx]) return;
        ex.sets[idx].done = !ex.sets[idx].done;
        setWorkoutLogLocal(selectedWorkoutDate, { ...getWorkoutLog(selectedWorkoutDate).exercises, [exId]: ex });
        if (useRealtimeDb) saveWorkoutExerciseToDb(selectedWorkoutDate, exId, ex).catch(() => {});
        span.classList.toggle('done', ex.sets[idx].done);
        span.textContent = ex.sets[idx].done ? '✓' : '○';
        updateCardVolume();
      });
    });

    tbody.querySelectorAll('.workout-set-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.setIndex, 10);
        const ex = getWorkoutLog(selectedWorkoutDate).exercises[exId];
        if (!ex || !ex.sets[idx]) return;
        ex.sets.splice(idx, 1);
        setWorkoutLogLocal(selectedWorkoutDate, { ...getWorkoutLog(selectedWorkoutDate).exercises, [exId]: ex });
        if (useRealtimeDb) saveWorkoutExerciseToDb(selectedWorkoutDate, exId, ex).catch(() => {});
        renderWorkoutPanel();
      });
    });

    listEl.appendChild(card);
  });

  emptyEl.classList.toggle('show', entries.length === 0);
}

/* 운동 기록 날짜 이동 */
document.getElementById('workoutPrevDay').addEventListener('click', () => {
  const d = new Date(selectedWorkoutDate + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  selectedWorkoutDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  loadWorkoutForDateAndRender(selectedWorkoutDate);
});

document.getElementById('workoutNextDay').addEventListener('click', () => {
  const d = new Date(selectedWorkoutDate + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  selectedWorkoutDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  loadWorkoutForDateAndRender(selectedWorkoutDate);
});

document.getElementById('workoutTodayBtn').addEventListener('click', () => {
  selectedWorkoutDate = todayStr();
  loadWorkoutForDateAndRender(selectedWorkoutDate);
});

async function loadWorkoutForDateAndRender(date) {
  selectedWorkoutDate = date;
  if (!workoutLogCache[date]) {
    try {
      const exercises = await loadWorkoutLog(date);
      setWorkoutLogLocal(date, exercises);
    } catch (_) {}
  }
  const d = new Date(date + 'T12:00:00');
  calendarYear = d.getFullYear();
  calendarMonth = d.getMonth();
  renderCalendar();
  renderWorkoutPanel();
}

/* 운동 추가 폼 */
document.getElementById('workoutAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('workoutExerciseName');
  const partInput = document.getElementById('workoutExercisePart');
  const name = (nameInput.value || '').trim();
  if (!name) return;
  const part = (partInput.value || '').trim();

  const exId = generateId();
  const newEx = { name, part, sets: [{ kg: 0, reps: 0, done: false }] };

  if (useRealtimeDb) {
    try {
      await update(ref(db, workoutLogsPath + '/' + selectedWorkoutDate + '/exercises/' + exId), {
        name: newEx.name,
        part: newEx.part,
        sets: setsToFirebase(newEx.sets),
      });
    } catch (err) {
      console.error('운동 저장 실패:', err);
      showToast('저장에 실패했습니다.', true);
      return;
    }
  }

  const log = getWorkoutLog(selectedWorkoutDate);
  log.exercises = log.exercises || {};
  log.exercises[exId] = newEx;
  setWorkoutLogLocal(selectedWorkoutDate, log.exercises);

  nameInput.value = '';
  partInput.value = '';
  renderWorkoutPanel();
  refreshCalendar();
});

/* 달력 이전/다음 달 */
document.getElementById('calendarPrevMonth').addEventListener('click', () => {
  if (calendarMonth === 0) {
    calendarMonth = 11;
    calendarYear -= 1;
  } else {
    calendarMonth -= 1;
  }
  renderCalendar();
});

document.getElementById('calendarNextMonth').addEventListener('click', () => {
  if (calendarMonth === 11) {
    calendarMonth = 0;
    calendarYear += 1;
  } else {
    calendarMonth += 1;
  }
  renderCalendar();
});

(async function init() {
  await loadWorkoutDates();
  renderCalendar();
  loadWorkoutForDateAndRender(selectedWorkoutDate);
})();
