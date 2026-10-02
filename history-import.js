/* Import completed historical shipments from an Excel or CSV file. */
(() => {
  const DEFAULT_LAYOUT = {
    PRE: ['PI', 'PO', '구매 요청', '견적 번호', '오더 번호', '납품 번호', '선적 번호', '작업 의뢰'],
    '~ING': ['출하 확인', '선적 확인', '수출 통지'],
    POST: ['입금 확인', '보험료', '결제 통지', '신호등', '운송료'],
  };
  const normal = value => String(value ?? '').toLowerCase().replace(/[\s_\-./()]/g, '');
  const rowValue = (row, names) => {
    const keys = Object.keys(row);
    const found = keys.find(key => names.some(name => normal(key) === normal(name)));
    return found === undefined ? '' : String(row[found] ?? '').trim();
  };
  const dateValue = value => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value)) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && window.XLSX?.SSF) {
      const date = XLSX.SSF.parse_date_code(value);
      if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    if (/^\d{4,5}$/.test(String(value)) && window.XLSX?.SSF) {
      const date = XLSX.SSF.parse_date_code(Number(value));
      if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    const match = String(value).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    const reverse = String(value).match(/(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
    if (!reverse) return '';
    const year = reverse[3].length === 2 ? `20${reverse[3]}` : reverse[3];
    return `${year}-${reverse[1].padStart(2, '0')}-${reverse[2].padStart(2, '0')}`;
  };
  const isNotApplicable = value => /^(x|×|n\/a|na|해당없음|없음)$/i.test(String(value || '').trim());
  // Supports both descriptive headers and simple 1~5 / 번호1~5 columns,
  // following the exact left-to-right order of the five front-page fields.
  const frontNumberValue = (row, position, names) => rowValue(row, [
    ...names,
    String(position), `번호${position}`, `번호 ${position}`,
    `숫자${position}`, `숫자 ${position}`, `number${position}`, `number ${position}`,
  ]);
  const firstSheetRows = sheet => {
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    const headerIndex = matrix.findIndex(row => row.some(value =>
      ['품목', '제품명', '제품', 'product', 'product name'].some(name => normal(value).includes(normal(name)))
    ));
    // The supplied history file has its column headers in row 2. Try that
    // explicit layout as a fallback as well as any detected header row.
    const candidateRows = [...new Set([headerIndex, 1, 0].filter(index => index >= 0))];
    for (const range of candidateRows) {
      const rows = XLSX.utils.sheet_to_json(sheet, { range, defval: '', raw: false })
        .filter(row => rowValue(row, ['제품명', '품목', '제품', 'product', 'product name']));
      if (rows.length) return rows;
    }
    return [];
  };
  const detailFields = row => {
    const ipManagementNumber = frontNumberValue(row, 5, ['ip 관리 번호', 'ip 번호', '보험료', 'insurance']);
    return {
      '견적 생성': frontNumberValue(row, 1, ['견적 생성', '견적 번호', 'quotation', 'quote no']),
      '오더 번호': frontNumberValue(row, 2, ['오더 번호', 'order no', 'order number']),
      '납품 번호': frontNumberValue(row, 3, ['납품 번호', 'delivery no', 'delivery number']),
      '선적 문서': frontNumberValue(row, 4, ['선적 문서', '선적 번호', 'shipping no', 'b/l']),
      'IP 관리 번호': isNotApplicable(ipManagementNumber) ? '' : ipManagementNumber,
    };
  };
  const addImportButton = () => {
    const menu = document.querySelector('.shipment-menu');
    if (!menu || menu.querySelector('[data-import-history]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.importHistory = '';
    button.textContent = '엑셀 히스토리 업로드';
    menu.append(button);
  };
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.hidden = true;
  document.body.append(input);

  document.addEventListener('click', event => {
    if (!event.target.closest('[data-import-history]')) return;
    input.value = '';
    input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!window.XLSX) {
      alert('엑셀 읽기 도구를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = firstSheetRows(firstSheet);
      const ships = rows.map(row => {
        const product = rowValue(row, ['제품명', '품목', '제품', 'product', 'product name']);
        if (!product) return null;
        const layout = structuredClone(db.defaults?.[product] || DEFAULT_LAYOUT);
        const done = {};
        Object.values(layout).flat().forEach(task => { done[task] = true; });
        const productDefault = db.productInfo?.[product] || db.ships.find(ship => ship.product === product) || {};
        const country = rowValue(row, ['국가', 'country']) || productDefault.country || '';
        const advancePaymentHandling = rowValue(row, ['선입금처리', '선입금 처리', 'advance payment handling']);
        const ipManagementNumber = frontNumberValue(row, 5, ['ip 관리 번호', 'ip 번호', '보험료', 'insurance']);
        const ship = {
          id: uid(),
          product,
          volume: rowValue(row, ['물량', 'quantity', 'volume']),
          country,
          port: rowValue(row, ['도착항', '선적항', 'port', 'arrival port']) || productDefault.port || '',
          payment: rowValue(row, ['결제 조건', '결제조건', 'payment', 'payment term']),
          advancePaymentNotRequired: isNotApplicable(advancePaymentHandling),
          insuranceNotRequired: isNotApplicable(ipManagementNumber),
          dispatch: dateValue(rowValue(row, ['공장출하일', '출고일', '출고', 'dispatch', 'dispatch date'])),
          etd: dateValue(rowValue(row, ['etd', '선적일', '선적 예정일'])),
          eta: dateValue(rowValue(row, ['eta', '도착 예정일'])),
          displayBy: rowValue(row, ['일정 표기', 'display by']) === '도착항으로 표시' ? 'port' : 'country',
          fields: detailFields(row),
          done,
          memo: rowValue(row, ['메모', 'memo', '비고', 'remarks']),
          layout,
        };
        return ship;
      }).filter(Boolean);
      if (!ships.length) {
        alert('제품명 또는 품목 열을 찾지 못했습니다. 파일의 헤더 행을 확인해 주세요.');
        return;
      }
      if (!confirm(`${ships.length}건의 과거 선적 이력을 불러올까요? 체크리스트는 모두 완료 처리됩니다.`)) return;
      db.ships.push(...ships);
      db.countries = [...new Set([...(db.countries || []), ...ships.map(ship => ship.country).filter(Boolean)])];
      // The tracker is filtered by ETD month. Move to a month containing the
      // imported history so a successful import is visible immediately.
      const latestEtd = ships.map(ship => ship.etd).filter(Boolean).sort().at(-1);
      if (latestEtd) {
        month = new Date(`${latestEtd}T12:00:00`);
        const shipmentMonth = document.querySelector('#shipmentMonth');
        if (shipmentMonth) shipmentMonth.value = latestEtd.slice(0, 7);
      }
      save();
      render();
      alert(`${ships.length}건을 불러왔습니다.${latestEtd ? ' 해당 ETD 월로 이동했습니다.' : ''}`);
    } catch (error) {
      alert(`엑셀 파일을 읽지 못했습니다: ${error.message}`);
    }
  });
  addImportButton();
  new MutationObserver(addImportButton).observe(document.body, { childList: true, subtree: true });
})();
