/* Calendar completion is isolated from the rest of the UI enhancements so
   recurring tasks can always be checked one occurrence at a time. */
(() => {
  const normalize = root => {
    if (!root || root.nodeType !== 1) return;
    const checkboxes = [];
    if (root.matches?.('input.calendar-check[data-calendar-check]')) checkboxes.push(root);
    root.querySelectorAll?.('input.calendar-check[data-calendar-check]').forEach(box => checkboxes.push(box));
    checkboxes.forEach(box => {
      box.classList.remove('calendar-check');
      box.classList.add('calendar-task-check');
    });
  };

  const grid = document.querySelector('#calendarGrid');
  if (grid) {
    normalize(grid);
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(normalize));
    }).observe(grid, { childList: true, subtree: true });
  }

  document.addEventListener('change', event => {
    const checkbox = event.target.closest?.('input.calendar-task-check[data-calendar-check]');
    if (!checkbox || typeof db === 'undefined') return;
    const task = db.tasks.find(item => item.id === checkbox.dataset.calendarCheck);
    if (!task) return;
    event.stopImmediatePropagation();
    task.status = checkbox.checked ? 'done' : '';
    save();
    setTimeout(() => render(), 0);
  }, true);

  document.head.insertAdjacentHTML(
    'beforeend',
    '<style>.calendar-task-check{width:11px;height:11px;margin:0;accent-color:var(--green)}</style>',
  );
})();
