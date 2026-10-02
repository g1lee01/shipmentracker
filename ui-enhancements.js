/* Core interface enhancements. Kept independent from cloud sync so they work
   even if the Supabase CDN is temporarily unavailable. */
(() => {
  document.head.insertAdjacentHTML('beforeend', '<style>#taskDialog{position:relative}#taskDialog .close{position:absolute;top:18px;left:50%;transform:translateX(-50%);float:none;z-index:1}#calendarGrid,.week{grid-template-columns:.9fr repeat(5,minmax(0,1fr)) .9fr!important}#calendarGrid .day.month-end:not(.business-close):after{content:none!important}#calendarGrid .day.month-end:not(.business-close):not(.holiday):not(.vacation-day){background:var(--card)!important}.payment-pending-list{display:grid;gap:3px;margin-top:2px}.payment-pending-list small{color:var(--muted);font-size:9px;line-height:1.35}</style>');

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
    const pending = db.ships
      .filter(ship => ship.payment && !ship.done?.['입금 확인'])
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

  if (typeof render === 'function') {
    const originalRender = render;
    render = () => {
      originalRender();
      relabelShipmentItems();
      renderPendingPaymentCard();
    };
  }
  relabelShipmentItems();
  renderPendingPaymentCard();
  setInterval(renderPendingPaymentCard, 500);
})();
