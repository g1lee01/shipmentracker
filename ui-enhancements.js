/* Core interface enhancements. Kept independent from cloud sync so they work
   even if the Supabase CDN is temporarily unavailable. */
(() => {
  document.head.insertAdjacentHTML('beforeend', '<style>#taskDialog{position:relative}#taskDialog .close{position:absolute;top:18px;left:50%;transform:translateX(-50%);float:none;z-index:1}</style>');

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
    };
  }
  relabelShipmentItems();
})();
