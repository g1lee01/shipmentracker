/* Shared Supabase storage for the shipping tracker. The publishable key is safe
   in a browser because every database and storage request is protected by RLS. */
const SUPABASE_URL = 'https://lgswvskjuyhssgafnbvp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zrYtf7dZIrkVaFNYQeN0RQ_PHaFSm5Z';

(() => {
  if (!window.supabase) {
    console.warn('Supabase library could not be loaded.');
    return;
  }

  let keepLogin = localStorage.getItem('shipping-keep-login') !== 'false';
  let cloud;
  const createCloudClient = () => window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: keepLogin ? localStorage : sessionStorage,
      storageKey: 'shipment-tracker-auth',
    },
  });
  const STATE_TABLE = 'shipping_app_state';
  const PHOTO_BUCKET = 'shipping-photos';
  let currentUser = null;
  let loadingCloudState = false;
  let saveTimer = null;

  const accountButton = () => document.querySelector('#cloudAccount');
  const setAccountLabel = () => {
    const button = accountButton();
    if (!button) return;
    button.textContent = '🔑';
    button.title = currentUser ? `My account · ${currentUser.email}` : 'Login';
    button.setAttribute('aria-label', currentUser ? 'My account' : 'Login');
  };

  const showMessage = (message, isError = false) => {
    let notice = document.querySelector('#cloudNotice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'cloudNotice';
      document.body.append(notice);
    }
    notice.textContent = message;
    notice.dataset.error = isError ? 'true' : 'false';
    notice.classList.add('show');
    clearTimeout(notice._timer);
    notice._timer = setTimeout(() => notice.classList.remove('show'), 3200);
  };

  const cleanStateForCloud = () => {
    const payload = structuredClone(db);
    // Signed image URLs expire. The permanent Storage path is what we sync.
    if (payload.topPhotoPath) delete payload.topPhoto;
    return payload;
  };

  const refreshPhoto = async () => {
    if (!db.topPhotoPath || !currentUser) return;
    const { data, error } = await cloud.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(db.topPhotoPath, 60 * 60 * 24 * 7);
    if (!error && data?.signedUrl) {
      db.topPhoto = data.signedUrl;
      const image = document.querySelector('#topPhoto');
      if (image) image.src = data.signedUrl;
      const placeholder = document.querySelector('#photoPlaceholder');
      if (placeholder) placeholder.hidden = true;
    }
  };

  const updateInterface = async () => {
    document.body.dataset.theme = db.theme || 'pink';
    try { render(); } catch (error) { console.warn('UI refresh failed', error); }
    await refreshPhoto();
  };

  const uploadPhoto = async (fileOrDataUrl) => {
    if (!currentUser) throw new Error('사진을 동기화하려면 먼저 로그인하세요.');
    let file = fileOrDataUrl;
    if (typeof fileOrDataUrl === 'string') {
      const blob = await (await fetch(fileOrDataUrl)).blob();
      file = new File([blob], 'widget-photo.jpg', { type: blob.type || 'image/jpeg' });
    }
    const extension = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const path = `${currentUser.id}/widget-${Date.now()}.${extension || 'jpg'}`;
    const { error } = await cloud.storage.from(PHOTO_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    });
    if (error) throw error;
    db.topPhotoPath = path;
    delete db.topPhoto;
    await refreshPhoto();
  };

  const migrateLocalPhoto = async () => {
    if (db.topPhoto?.startsWith('data:') && !db.topPhotoPath) {
      try { await uploadPhoto(db.topPhoto); }
      catch (error) { console.warn('Local photo migration failed', error); }
    }
  };

  const pushState = async () => {
    if (!currentUser || loadingCloudState) return;
    await migrateLocalPhoto();
    const { error } = await cloud.from(STATE_TABLE).upsert({
      user_id: currentUser.id,
      payload: cleanStateForCloud(),
      updated_at: new Date().toISOString(),
    });
    if (error) showMessage(`동기화 오류: ${error.message}`, true);
  };

  const schedulePush = () => {
    if (!currentUser || loadingCloudState) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushState, 700);
  };

  const loadState = async () => {
    const { data, error } = await cloud
      .from(STATE_TABLE)
      .select('payload')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error) {
      showMessage(`동기화 연결 오류: ${error.message}`, true);
      return;
    }
    loadingCloudState = true;
    if (data?.payload) {
      db = { ...fresh, ...data.payload, tasks: data.payload.tasks || [], ships: data.payload.ships || [] };
      localStorage.setItem(KEY, JSON.stringify(db));
      await updateInterface();
      showMessage('저장된 선적 정보를 불러왔어요.');
    } else {
      await migrateLocalPhoto();
      loadingCloudState = false;
      await pushState();
      loadingCloudState = true;
      showMessage('현재 정보를 계정에 저장했어요.');
    }
    loadingCloudState = false;
  };

  const openAuthDialog = () => {
    let dialog = document.querySelector('#cloudAuthDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'cloudAuthDialog';
      dialog.innerHTML = `<form method="dialog">
        <button class="close" type="button" data-close-auth>×</button>
        <p class="cloud-kicker">SHIPPING CLOUD</p>
        <h2>내 업무 보드 로그인</h2>
        <p class="cloud-help">같은 계정으로 로그인하면 모든 컴퓨터에서 선적 정보와 사진을 볼 수 있어요.</p>
        <label>이메일<input name="email" type="email" autocomplete="email" required></label>
        <label>비밀번호<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
        <label class="cloud-keep"><input name="keep" type="checkbox" ${keepLogin ? 'checked' : ''}> 로그인 상태 유지</label>
        <p class="cloud-form-message" aria-live="polite"></p>
        <div class="actions"><button type="button" class="cancel" data-close-auth>취소</button><button type="button" data-signup>계정 만들기</button><button class="primary" value="login">로그인</button></div>
      </form>`;
      document.body.append(dialog);
      dialog.addEventListener('click', async event => {
        if (event.target.dataset.closeAuth !== undefined) dialog.close();
        const form = dialog.querySelector('form');
        const message = form.querySelector('.cloud-form-message');
        const email = form.elements.email.value.trim();
        const password = form.elements.password.value;
        if (event.target.dataset.signup !== undefined) {
          if (!form.reportValidity()) return;
          await setLoginPersistence(form.elements.keep.checked);
          const { error } = await cloud.auth.signUp({ email, password, options: { emailRedirectTo: location.href } });
          message.textContent = error ? error.message : '인증 메일을 보냈어요. 메일 인증 후 로그인해 주세요.';
          message.dataset.error = error ? 'true' : 'false';
        }
      });
      dialog.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const message = form.querySelector('.cloud-form-message');
        await setLoginPersistence(form.elements.keep.checked);
        const { error } = await cloud.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
        if (error) { message.textContent = error.message; message.dataset.error = 'true'; return; }
        dialog.close();
      });
    }
    dialog.showModal();
  };

  const openAccountDialog = () => {
    if (!currentUser) return openAuthDialog();
    const dialog = document.createElement('dialog');
    dialog.innerHTML = `<form method="dialog"><button class="close" type="button">×</button><p class="cloud-kicker">MY ACCOUNT</p><h2>내 계정</h2><p class="cloud-help">${currentUser.email}</p><div class="account-menu"><button type="button" data-theme-settings>테마 설정</button><button type="button" data-password>비밀번호 변경</button></div><div class="password-change" hidden><label>새 비밀번호<input name="newPassword" type="password" minlength="6" autocomplete="new-password" placeholder="6자 이상"></label><p class="cloud-form-message" aria-live="polite"></p><button type="button" data-save-password>비밀번호 저장</button></div><div class="actions"><button type="button" class="cancel" data-signout>로그아웃</button><button class="primary">닫기</button></div></form>`;
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener('click', async event => {
      if (event.target.classList.contains('close')) dialog.close();
      if (event.target.dataset.themeSettings !== undefined) document.querySelector('.settings-button')?.click();
      if (event.target.dataset.password !== undefined) dialog.querySelector('.password-change').hidden = false;
      if (event.target.dataset.savePassword !== undefined) {
        const form = dialog.querySelector('form');
        const password = form.elements.newPassword.value;
        const message = form.querySelector('.cloud-form-message');
        if (password.length < 6) { message.textContent = '비밀번호는 6자 이상으로 입력해 주세요.'; message.dataset.error = 'true'; return; }
        const { error } = await cloud.auth.updateUser({ password });
        message.textContent = error ? error.message : '비밀번호를 변경했어요.';
        message.dataset.error = error ? 'true' : 'false';
        if (!error) form.elements.newPassword.value = '';
      }
      if (event.target.dataset.signout !== undefined) {
        await cloud.auth.signOut();
        localStorage.removeItem(KEY);
        db = structuredClone(fresh);
        await updateInterface();
        dialog.close();
      }
    });
    dialog.addEventListener('close', () => dialog.remove());
  };

  const addCloudInterface = () => {
    const header = document.querySelector('.header-right');
    if (!header || accountButton()) return;
    const controls = document.createElement('div');
    controls.className = 'cloud-controls';
    const button = document.createElement('button');
    button.id = 'cloudAccount';
    button.type = 'button';
    button.addEventListener('click', openAccountDialog);
    const settings = document.createElement('button');
    settings.id = 'cloudSettings';
    settings.type = 'button';
    settings.textContent = '⚙';
    settings.title = '테마 설정';
    settings.setAttribute('aria-label', '테마 설정');
    settings.addEventListener('click', () => document.querySelector('.settings-button')?.click());
    controls.append(button, settings);
    header.append(controls);
    setAccountLabel();
  };

  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    originalSetItem.call(this, key, value);
    if (key === KEY && this === localStorage) schedulePush();
  };

  document.addEventListener('change', async event => {
    if (event.target.id !== 'photoInput') return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!currentUser) { openAuthDialog(); return; }
    try {
      await uploadPhoto(file);
      save();
      showMessage('사진을 모든 기기에 저장했어요.');
    } catch (error) {
      showMessage(`사진 업로드 오류: ${error.message}`, true);
    }
  }, true);

  const subscribeToAuth = () => cloud.auth.onAuthStateChange(async (_event, session) => {
    const nextUser = session?.user || null;
    if (nextUser?.id === currentUser?.id) return;
    currentUser = nextUser;
    setAccountLabel();
    if (currentUser) await loadState();
  });

  const setLoginPersistence = async keep => {
    if (keep === keepLogin) return;
    await cloud.auth.signOut({ scope: 'local' });
    keepLogin = keep;
    localStorage.setItem('shipping-keep-login', keep ? 'true' : 'false');
    cloud = createCloudClient();
    subscribeToAuth();
  };

  cloud = createCloudClient();
  subscribeToAuth();

  document.head.insertAdjacentHTML('beforeend', `<style>
    .settings-button{display:none!important}.cloud-controls{display:grid;gap:5px}.cloud-controls button{width:30px;height:30px;padding:0;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--green);font-size:14px;line-height:1}.cloud-controls #cloudAccount{font-size:13px}
    #cloudNotice{position:fixed;right:22px;bottom:22px;z-index:40;max-width:300px;padding:11px 14px;border:1px solid var(--line);border-radius:9px;background:var(--card);box-shadow:0 8px 28px #1c34251d;font-size:12px;opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s}
    #cloudNotice.show{opacity:1;transform:translateY(0)}#cloudNotice[data-error="true"],.cloud-form-message[data-error="true"]{color:#b24e55}.cloud-kicker{margin:0;color:var(--muted);font-size:10px;letter-spacing:.12em}.cloud-help,.cloud-form-message{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.cloud-form-message{min-height:18px}.cloud-keep{display:flex!important;align-items:center;gap:7px;font-size:12px!important;font-weight:500!important}.cloud-keep input{height:auto!important}.account-menu{display:grid;grid-template-columns:1fr 1fr;gap:8px}.account-menu button,.password-change>button{font-size:12px}.password-change{padding:10px;border:1px solid var(--line);border-radius:7px}.password-change label{font-size:11px}.password-change input{height:34px}
  </style>`);
  addCloudInterface();
})();
