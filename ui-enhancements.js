/* Core interface enhancements. Kept independent from cloud sync so they work
   even if the Supabase CDN is temporarily unavailable. */
(() => {
  document.head.insertAdjacentHTML('beforeend', '<style>#taskDialog{position:relative}#taskDialog .close{position:absolute;top:18px;left:50%;transform:translateX(-50%);float:none;z-index:1}#calendarGrid,.week{grid-template-columns:.9fr repeat(5,minmax(0,1fr)) .9fr!important}#calendarGrid .day.month-end:not(.business-close):after{content:none!important}#calendarGrid .day.month-end:not(.business-close):not(.holiday):not(.vacation-day){background:var(--card)!important}.payment-pending-list{display:grid;gap:3px;margin-top:2px}.payment-pending-list small{color:var(--muted);font-size:9px;line-height:1.35}.key-tasks label{font-size:12px!important}.key-tasks input{font-size:11px!important}</style>');

  const todayForInput = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  };

  const addShipmentDisplayField = () => {
    const form = document.querySelector('#shipmentForm');
    if (!form || form.elements.displayBy) return;
    const field = document.createElement('label');
    field.className = 'shipment-display-field';
    field.innerHTML = '일정 표기<select name="displayBy"><option value="country">국가로 표시</option><option value="port">도착항으로 표시</option></select>';
    const paymentField = form.elements.payment?.closest('label');
    (paymentField || form.querySelector('.form-row'))?.insertAdjacentElement('afterend', field);
  };

  addShipmentDisplayField();

  // Keep linked number fields in sync only inside the same shipment.
  // The original listener matched every card with the same field name.
  const linkedTaskForField = { '견적 생성': '견적 번호', '오더 번호': '오더 번호', '납품 번호': '납품 번호', '선적 문서': '선적 번호', 'IP 관리 번호': '보험료' };
  const shipForDetailDialog = dialog => {
    const heading = dialog?.querySelector('h2')?.textContent || '';
    return db.ships.find(ship => heading.startsWith(`${ship.product}${ship.volume ? ` ${ship.volume}` : ''} (${ship.port || '도착항 미정'})`));
  };
  document.addEventListener('input', event => {
    const field = event.target.closest?.('input[data-front], input[data-link]');
    if (!field || typeof db === 'undefined') return;
    const key = field.dataset.front || field.dataset.link;
    const ship = field.dataset.ship
      ? db.ships.find(item => item.id === field.dataset.ship)
      : shipForDetailDialog(field.closest('.detail-modal'));
    if (!key || !ship) return;
    event.stopImmediatePropagation();
    ship.fields = ship.fields || {};
    ship.fields[key] = field.value;
    if (field.value) {
      ship.done = ship.done || {};
      ship.done[linkedTaskForField[key] || key] = true;
    }
    save();
    document.querySelectorAll('input[data-front]').forEach(input => {
      if (input.dataset.ship !== ship.id || input.dataset.front !== key || input === field) return;
      input.value = field.value;
      input.classList.toggle('number-filled', !!field.value);
    });
    document.querySelectorAll('.detail-modal').forEach(dialog => {
      if (shipForDetailDialog(dialog)?.id !== ship.id) return;
      dialog.querySelectorAll('input[data-link]').forEach(input => {
        if (input.dataset.link !== key || input === field) return;
        input.value = field.value;
        input.classList.toggle('number-filled', !!field.value);
      });
    });
    field.classList.toggle('number-filled', !!field.value);
  }, true);
  document.addEventListener('change', event => {
    if (!event.target.closest?.('.detail-modal input[data-check]')) return;
    // The modal saves the checkbox state itself; update the card after that save.
    setTimeout(() => render(), 0);
  }, true);

  const addTaskTimingFields = () => {
    const form = document.querySelector('#taskForm');
    if (!form || form.elements.time || form.elements.reminder) return;
    const timeField = document.createElement('label');
    timeField.innerHTML = '시간<input name="time" type="time">';
    const endDateField = form.elements.endDate?.closest('label');
    (endDateField || form.elements.date?.closest('label'))?.insertAdjacentElement('afterend', timeField);
    const reminderField = document.createElement('label');
    reminderField.innerHTML = '리마인더<select name="reminder"><option value="">알림 안 함</option><option value="0">정시</option><option value="5">5분 전</option><option value="15">15분 전</option><option value="30">30분 전</option><option value="60">1시간 전</option><option value="120">2시간 전</option><option value="1440">1일 전</option><option value="4320">3일 전</option></select>';
    const repeatField = form.elements.repeat?.closest('label');
    (repeatField || timeField).insertAdjacentElement('afterend', reminderField);
  };
  addTaskTimingFields();
  const arrangeTaskFields = () => {
    const form = document.querySelector('#taskForm');
    if (!form) return;
    const repeat = form.elements.repeat?.closest('label');
    const status = form.elements.status?.closest('label');
    if (repeat && status && repeat.nextElementSibling !== status) status.before(repeat);
    const color = form.elements.color;
    if (!color || form.querySelector('.task-color-swatches, .static-color-chips')) return;
    const chips = document.createElement('div');
    chips.className = 'task-color-swatches';
    const colors = [['pink', '#e9aab8', '로즈'], ['red', '#df7d7d', '레드'], ['orange', '#e8a052', '오렌지'], ['gold', '#d4ad4a', '골드'], ['green', '#75ad83', '그린'], ['blue', '#82aeda', '블루'], ['purple', '#aa8ac9', '퍼플'], ['white', '#ffffff', '화이트']];
    colors.forEach(([value, swatch, label]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.dataset.colorValue = value;
      chip.title = label;
      chip.setAttribute('aria-label', label);
      chip.style.background = swatch;
      chip.addEventListener('click', () => {
        color.value = value;
        color.dispatchEvent(new Event('change', { bubbles: true }));
        updateColorChips();
      });
      chips.append(chip);
    });
    form.prepend(chips);
  };
  const updateColorChips = () => {
    const form = document.querySelector('#taskForm');
    const selected = form?.elements.color?.value;
    form?.querySelectorAll('[data-color-value]').forEach(chip => chip.classList.toggle('selected', chip.dataset.colorValue === selected));
  };
  arrangeTaskFields();
  document.head.insertAdjacentHTML('beforeend', '<style>#taskForm label:has([name="time"]),#taskForm label:has([name="repeat"]){grid-column:1!important;min-width:0}#taskForm label:has([name="reminder"]),#taskForm label:has([name="status"]){grid-column:2!important;min-width:0}#taskForm label:has([name="color"]){display:none!important}#taskForm{position:relative}.task-color-swatches{position:absolute;top:3px;right:22px;display:flex;gap:5px;align-items:center}.task-color-swatches button{width:13px;height:13px;min-width:13px;padding:0;border:1px solid #d2dbd6;border-radius:50%;box-shadow:none}.task-color-swatches button.selected{outline:2px solid var(--green);outline-offset:2px}.task-color-swatches button[data-color-value="white"]{border-color:#aeb9b3}.reminder-toast{position:fixed;right:22px;bottom:22px;z-index:80;width:min(330px,calc(100vw - 34px));padding:14px 16px;border:1px solid var(--line);border-left:4px solid var(--green);border-radius:10px;background:var(--card);box-shadow:0 12px 36px #172a2430;animation:reminder-in .22s ease-out}.reminder-toast strong,.reminder-toast small{display:block}.reminder-toast strong{font-size:13px;margin-bottom:4px}.reminder-toast small{color:var(--muted);font-size:11px}.reminder-toast button{position:absolute;right:8px;top:7px;border:0;background:transparent;color:var(--muted);font-size:17px;padding:1px 5px}@keyframes reminder-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}</style>');

  const localDateForCalendar = date => {
    const copy = new Date(date);
    copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
    return copy.toISOString().slice(0, 10);
  };
  const lastBusinessDay = (year, monthIndex) => {
    const date = new Date(year, monthIndex + 1, 0);
    while (date.getDay() === 0 || date.getDay() === 6 || (typeof koreanHolidays !== 'undefined' && koreanHolidays[localDateForCalendar(date)])) {
      date.setDate(date.getDate() - 1);
    }
    return localDateForCalendar(date);
  };
  const placeMonthClosingOnBusinessDay = () => {
    if (typeof month === 'undefined' || typeof db === 'undefined') return;
    document.querySelectorAll('#calendarGrid .business-close').forEach(day => day.classList.remove('business-close'));
    const closingDate = lastBusinessDay(month.getFullYear(), month.getMonth());
    const closingDay = document.querySelector(`#calendarGrid .day[data-date="${closingDate}"]`);
    if (!closingDay) return;
    const yearMonth = closingDate.slice(0, 7);
    const count = db.ships.filter(ship => ship.etd?.startsWith(yearMonth)).length;
    closingDay.classList.add('month-end', 'business-close');
    closingDay.dataset.monthSummary = `마감 (${count}건)`;
  };
  setInterval(placeMonthClosingOnBusinessDay, 120);

  // Only new tasks receive today as a starting date. Dates picked from the
  // calendar and dates on existing tasks remain exactly as they are.
  if (typeof taskModal === 'function') {
    const originalTaskModal = taskModal;
    taskModal = (task = {}) => originalTaskModal(!task.id && !task.date
      ? { ...task, date: todayForInput() }
      : task);
  }

  const originalShowModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function (...args) {
    if (this.id === 'shipmentDialog') {
      const form = this.querySelector('#shipmentForm');
      if (form && !form.dataset.editId) {
        ['dispatch', 'etd', 'eta'].forEach(name => {
          if (form.elements[name] && !form.elements[name].value) form.elements[name].value = todayForInput();
        });
      }
    }
    return originalShowModal.apply(this, args);
  };

  const displayValue = ship => ship.displayBy === 'port' && ship.port
    ? ship.port
    : (ship.country || ship.port || '국가 미정');
  const paymentDate = ship => {
    const payment = (ship.payment || '').toLowerCase().replace(/[\/\s]/g, '');
    if (payment.includes('45days') && ship.etd) {
      const date = new Date(`${ship.etd}T00:00:00`);
      date.setDate(date.getDate() + 45);
      return localDateForCalendar(date);
    }
    if (payment.includes('lcatsight')) return ship.etd || '';
    if (payment.includes('ttinadvance') && ship.dispatch) {
      const date = new Date(`${ship.dispatch}T00:00:00`);
      let remaining = 3;
      while (remaining) {
        date.setDate(date.getDate() - 1);
        if (date.getDay() !== 0 && date.getDay() !== 6) remaining -= 1;
      }
      return localDateForCalendar(date);
    }
    return '';
  };
  const paymentDateLabel = value => {
    if (!value) return '날짜 미정';
    const date = new Date(`${value}T00:00:00`);
    return `${date.getMonth() + 1}.${date.getDate()} (${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]})`;
  };
  const setupPendingPaymentCard = () => {
    const oldCount = document.querySelector('#monthShipCount');
    const card = oldCount?.closest('article');
    if (!card || card.querySelector('#paymentPendingCount')) return;
    card.innerHTML = '<span>입금 대기</span><b id="paymentPendingCount">0건</b><div class="payment-pending-list"></div>';
  };
  const renderPendingPaymentCard = () => {
    setupPendingPaymentCard();
    const count = document.querySelector('#paymentPendingCount');
    const list = document.querySelector('.payment-pending-list');
    if (!count || !list || typeof db === 'undefined') return;
    const activeMonth = typeof month === 'undefined'
      ? new Date().toISOString().slice(0, 7)
      : `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    const pending = db.ships
      .filter(ship => ship.payment && !ship.done?.['입금 확인'] && paymentDate(ship).startsWith(activeMonth))
      .sort((a, b) => (paymentDate(a) || '9999-99-99').localeCompare(paymentDate(b) || '9999-99-99'));
    count.textContent = `${pending.length}건`;
    list.replaceChildren(...pending.map(ship => {
      const item = document.createElement('small');
      const volume = ship.volume ? ` ${ship.volume}` : '';
      item.textContent = `${ship.product}${volume} (${displayValue(ship)}) · ${ship.payment} · 수금 ${paymentDateLabel(paymentDate(ship))}`;
      return item;
    }));
  };
  const relabelShipmentItems = () => {
    if (typeof db === 'undefined' || !db.ships) return;
    db.ships.forEach(ship => {
      const base = `${ship.product}${ship.volume ? ` ${ship.volume}` : ''} (${ship.country || '국가 미정'})`;
      const chosen = `${ship.product}${ship.volume ? ` ${ship.volume}` : ''} (${displayValue(ship)})`;
      if (base === chosen) return;
      document.querySelectorAll('.calendar .event span, .task span').forEach(item => {
        if (item.textContent.startsWith(base)) item.textContent = `${chosen}${item.textContent.slice(base.length)}`;
      });
    });
  };
  const showTaskTimes = () => {
    if (typeof db === 'undefined') return;
    document.querySelectorAll('.event[data-drag^="task:"]').forEach(event => {
      const task = db.tasks.find(item => item.id === event.dataset.drag.slice(5));
      const label = event.querySelector('span');
      if (task?.time && label && !label.textContent.startsWith(`${task.time} · `)) label.textContent = `${task.time} · ${label.textContent}`;
    });
    document.querySelectorAll('.task [data-done]').forEach(box => {
      const task = db.tasks.find(item => item.id === box.dataset.done);
      const date = box.closest('.task')?.querySelector('small');
      if (task?.time && date && !date.textContent.includes(task.time)) date.textContent = `${task.date} · ${task.time}`;
    });
  };
  const reminderSeenKey = 'shipment-reminders-seen';
  const showReminder = task => {
    const toast = document.createElement('div');
    toast.className = 'reminder-toast';
    const title = document.createElement('strong');
    title.textContent = `리마인더 · ${task.title}`;
    const detail = document.createElement('small');
    detail.textContent = `${task.date} ${task.time} 일정이 다가옵니다.`;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = '×';
    dismiss.title = '닫기';
    dismiss.addEventListener('click', () => toast.remove());
    toast.append(title, detail, dismiss);
    document.body.append(toast);
  };
  const checkReminders = () => {
    if (typeof db === 'undefined') return;
    const seen = new Set(JSON.parse(sessionStorage.getItem(reminderSeenKey) || '[]'));
    const now = Date.now();
    db.tasks.forEach(task => {
      if (!task.time || !task.reminder || task.status === 'done') return;
      const due = new Date(`${task.date}T${task.time}:00`).getTime();
      const reminderAt = due - Number(task.reminder) * 60 * 1000;
      const key = `${task.id}|${task.date}|${task.time}|${task.reminder}`;
      const visibleUntil = Number(task.reminder) === 0 ? due + 10 * 60 * 1000 : due;
      if (now >= reminderAt && now < visibleUntil && !seen.has(key)) {
        seen.add(key);
        showReminder(task);
      }
    });
    sessionStorage.setItem(reminderSeenKey, JSON.stringify([...seen]));
  };

  if (typeof render === 'function') {
    const originalRender = render;
    render = () => {
      originalRender();
      relabelShipmentItems();
      showTaskTimes();
      renderPendingPaymentCard();
    };
  }
  relabelShipmentItems();
  showTaskTimes();
  renderPendingPaymentCard();
  setInterval(renderPendingPaymentCard, 500);
  setInterval(checkReminders, 30000);
  setInterval(updateColorChips, 250);
  checkReminders();
})();
