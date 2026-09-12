/* =========================================================
   MBW Admin Panel logic
   ========================================================= */

const auth = firebase.auth();
auth.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});
const PIN_REGEX = /^\d{10}$/;

/* ---------------------------------------------------------
   SECTION 0 — Email alert to the owner on a blocked login
   Fill in the three PASTE_ values below after finishing the
   "Get alerts on your phone" step in the README. Until you do,
   this quietly does nothing — the rest of the site is unaffected.
   --------------------------------------------------------- */
const EMAILJS_PUBLIC_KEY  = "ppceEkmhVZ6mRkRBh";
const EMAILJS_SERVICE_ID  = "service_g3gibrj";
const EMAILJS_TEMPLATE_ID = "template_r44alfd";
const OWNER_ALERT_EMAIL   = "rahulmaurya151015@gmail.com";

const emailAlertsReady = () =>
  window.emailjs && !EMAILJS_PUBLIC_KEY.startsWith("PASTE_");

if (emailAlertsReady()) {
  // limitRate caps this to one send every 30s so a bot hammering the
  // login form can't flood your inbox — see README for why.
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY, limitRate: { throttle: 30000 } });
}

// Emails the owner when an ID gets blocked or a blocked ID tries again.
// Deliberately sends only the ID that was typed, the attempt count, and
// the time — never the password. See the README for why the password
// itself is never captured, stored, or emailed.
async function sendOwnerEmailAlert(typedId, attempts) {
  if (!emailAlertsReady()) return;
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: OWNER_ALERT_EMAIL,
      blocked_id: String(typedId).slice(0, 200) || "(blank)",
      attempts: attempts,
      time: new Date().toLocaleString("en-IN")
    });
  } catch (e) { /* email failed to send — the on-screen block still happened regardless */ }
}

/* ---------------------------------------------------------
   SECTION 1 — Login (normal + emergency PIN) + lockout + alert
   --------------------------------------------------------- */

function sanitizeId(raw) {
  return String(raw).trim().toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 140) || "unknown";
}

/* ---- Device fingerprint layer for admin login ----
   Separate from the ID-based block above. This blocks the DEVICE
   itself after a 2nd wrong attempt, so switching to a different
   typed ID doesn't help. The device that successfully logs in with
   the real password first is marked "trusted" and is permanently
   exempt from ever being blocked here — see markDeviceTrusted(). */
const deviceFp = getDeviceFingerprint();

async function isDeviceTrusted(fp) {
  try {
    const d = await db.collection("trusted_devices").doc(fp).get();
    return d.exists;
  } catch (e) { return false; } // can't confirm — treat as not trusted (fails safe, not open)
}

async function markDeviceTrusted(fp) {
  try {
    await db.collection("trusted_devices").doc(fp).set(
      { trustedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }
    );
  } catch (e) {}
}

async function isDeviceBlocked(fp) {
  try {
    const d = await db.collection("blocked_devices").doc(fp).get();
    return d.exists && d.data().blocked;
  } catch (e) { return false; }
}

async function blockDeviceIfNotTrusted(fp, lastId) {
  if (await isDeviceTrusted(fp)) return; // this is you — never block your own device
  try {
    await db.collection("blocked_devices").doc(fp).set({
      blocked: true,
      lastId: String(lastId).slice(0, 200),
      blockedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {}
}

const loginIdInput = document.getElementById("adminId");
const loginPassInput = document.getElementById("adminPass");
const loginError = document.getElementById("loginError");
const securityAlertEl = document.getElementById("securityAlert");

let sirenAudioEl = null;
let sirenBufferSource = null;
let generatedSirenHandle = null;
let vibrateInterval = null;

function stopSiren() {
  if (sirenAudioEl) { sirenAudioEl.pause(); sirenAudioEl = null; }
  if (sirenBufferSource) {
    try { sirenBufferSource.stop(); } catch (e) {}
    sirenBufferSource = null;
  }
  if (generatedSirenHandle) {
    clearInterval(generatedSirenHandle.interval);
    try { generatedSirenHandle.osc.stop(); } catch (e) {}
    generatedSirenHandle = null;
  }
}

function playGeneratedSiren() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    gain.gain.value = 0.24; // 2x the original 0.12
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    let high = true;
    const interval = setInterval(() => {
      osc.frequency.setValueAtTime(high ? 1000 : 500, ctx.currentTime);
      high = !high;
    }, 380);
    generatedSirenHandle = { osc, interval, ctx };
  } catch (e) { /* audio blocked by the browser — the visual alert still shows */ }
}

// Plays the admin's uploaded siren file through the Web Audio API instead of
// an <audio> element — this is what keeps Android/Chrome from surfacing that
// "Live notification" media card with a title, progress bar, and play/pause.
async function playCustomSirenViaWebAudio(url) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = 1.4; // 2x the original 0.7
  // A limiter after the gain boost — without this, pushing gain above 1.0
  // on a real recorded file usually just clips into ugly static instead of
  // sounding louder. This keeps the boost sounding like a louder siren.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  source.connect(gain).connect(limiter).connect(ctx.destination);
  source.start();
  sirenBufferSource = source;
}

async function playSiren() {
  stopSiren();
  try {
    const doc = await db.collection("settings").doc("security").get();
    const url = doc.exists ? doc.data().sirenUrl : "";
    if (url) {
      try {
        await playCustomSirenViaWebAudio(url);
      } catch (e) {
        playGeneratedSiren(); // couldn't fetch/decode the file — fall back so sound still plays
      }
    } else {
      playGeneratedSiren();
    }
  } catch (e) {
    playGeneratedSiren();
  }
}

function startVibration() {
  if (!navigator.vibrate) return; // not supported (e.g. iPhone Safari) — sound + flash still work
  const pattern = [300, 300, 300, 300, 300, 300]; // clear on-off-on-off pulses, not one long buzz
  navigator.vibrate(pattern);
  vibrateInterval = setInterval(() => navigator.vibrate(pattern), 3200);
}

function showSecurityAlert() {
  loginIdInput.value = "";
  loginPassInput.value = "";
  loginSection.classList.add("hidden");
  securityAlertEl.classList.remove("hidden");
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = null;
  }
  playSiren();
  startVibration();
}

async function attemptLogin() {
  loginError.textContent = "";
  const idVal = loginIdInput.value;
  const passVal = loginPassInput.value;

  // This device itself is permanently blocked from an earlier attempt —
  // show the alert immediately, don't even look at what was typed.
  if (await isDeviceBlocked(deviceFp)) {
    sendOwnerEmailAlert(idVal || "(device already blocked)", 1);
    showSecurityAlert();
    return;
  }

  // ---- Emergency backup login: a 10-digit code always gets you in,
  // even if your normal ID has been blocked. It quietly falls through
  // to the normal flow below if the code doesn't match, so it never
  // breaks a real password that happens to be 10 digits.
  if (PIN_REGEX.test(passVal.trim())) {
    try {
      await auth.signInWithEmailAndPassword(EMERGENCY_ACCESS_EMAIL, passVal.trim());
      return;
    } catch (emergencyErr) {
      // not the emergency code — continue to the normal check below
    }
  }

  const blockId = sanitizeId(idVal);
  const blockRef = db.collection("security_blocks").doc(blockId);

  let blockSnap;
  try {
    blockSnap = await blockRef.get();
  } catch (e) {
    loginError.textContent = "Network error. Please try again.";
    return;
  }

  // Already permanently blocked — show the alert immediately, don't even check the password.
  if (blockSnap.exists && blockSnap.data().blocked) {
    const repeatAttempts = (blockSnap.data().attempts || 0) + 1;
    blockRef.update({
      attempts: firebase.firestore.FieldValue.increment(1),
      lastAttempt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
    sendOwnerEmailAlert(idVal, repeatAttempts);
    showSecurityAlert();
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(idVal, passVal);
    if (blockSnap.exists) await blockRef.delete().catch(() => {});
  } catch (err) {
    const prevAttempts = blockSnap.exists ? (blockSnap.data().attempts || 0) : 0;
    const newAttempts = prevAttempts + 1;
    const willBlock = newAttempts >= 2;

    const payload = {
      attempts: newAttempts,
      blocked: willBlock,
      lastAttempt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (willBlock) payload.blockedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
      if (blockSnap.exists) await blockRef.update(payload);
      else await blockRef.set(payload);
    } catch (e) { /* rules issue — fail quietly, the normal error still shows below */ }

    if (willBlock) {
      sendOwnerEmailAlert(idVal, newAttempts);
      await blockDeviceIfNotTrusted(deviceFp, idVal);
      showSecurityAlert();
    } else {
      loginError.textContent = "Wrong ID or password. One more wrong attempt will block this ID.";
    }
  }
}

document.getElementById("loginSubmitBtn").addEventListener("click", attemptLogin);
[loginIdInput, loginPassInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptLogin();
  });
});

/* ---------------------------------------------------------
   SECTION 2 — Entry video (plays once per login), then dashboard
   --------------------------------------------------------- */

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const entryVideoOverlay = document.getElementById("entryVideoOverlay");
const entryVideoPlayer = document.getElementById("entryVideoPlayer");
let dashboardStarted = false;

function showEntryVideoThenDashboard() {
  db.collection("settings").doc("entryVideo").get().then((doc) => {
    const url = doc.exists ? doc.data().videoUrl : "";
    if (!url) { dashboardSection.classList.remove("hidden"); return; }

    entryVideoPlayer.src = url;
    entryVideoOverlay.classList.remove("hidden");

    const proceed = () => {
      entryVideoOverlay.classList.add("hidden");
      dashboardSection.classList.remove("hidden");
      entryVideoPlayer.pause();
    };
    entryVideoPlayer.onended = proceed;
    document.getElementById("entryVideoSkip").onclick = proceed;

    entryVideoPlayer.currentTime = 0;
    entryVideoPlayer.play().catch(() => { /* autoplay blocked — Skip button still works */ });
  }).catch(() => { dashboardSection.classList.remove("hidden"); });
}

auth.onAuthStateChanged((user) => {
  if (user) {
    loginSection.classList.add("hidden");
    markDeviceTrusted(deviceFp);
    showEntryVideoThenDashboard();
    if (!dashboardStarted) { dashboardStarted = true; initDashboard(); }
  } else {
    loginSection.classList.remove("hidden");
    dashboardSection.classList.add("hidden");
    entryVideoOverlay.classList.add("hidden");
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await auth.signOut().catch(() => {});
  window.location.reload();
});

/* Tab switching */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

/* ---------------------------------------------------------
   SECTION 3 — Cloudinary upload helper
   --------------------------------------------------------- */

async function uploadToCloudinary(file, resourceType) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(url, { method: "POST", body: formData });
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error ? data.error.message : "Upload failed");
  return data.secure_url;
}

/* ---------------------------------------------------------
   SECTION 4 — Dashboard init (runs once after login)
   --------------------------------------------------------- */

function initDashboard() {
  initCategories();
  initProducts();
  initBanner();
  initEntryVideoTab();
  initBlockedList();
  initBlockedDevices();
  initPhoneAlerts();
  initSecuritySound();
  initSettings();
  initSocialLinks();
  initCustomerReviews();
}

/* ---- Categories ---- */
let allCategoriesAdmin = [];

function initCategories() {
  db.collection("categories").orderBy("order", "asc").onSnapshot((snap) => {
    allCategoriesAdmin = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCategoriesList();
    fillCategorySelect();
  });

  document.getElementById("categoryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("categoryEditId").value;
    const name = document.getElementById("categoryName").value.trim();
    if (!name) return;
    if (editId) {
      await db.collection("categories").doc(editId).update({ name });
    } else {
      await db.collection("categories").add({ name, order: Date.now() });
    }
    document.getElementById("categoryForm").reset();
    document.getElementById("categoryEditId").value = "";
  });
}

function renderCategoriesList() {
  const wrap = document.getElementById("categoriesList");
  if (!allCategoriesAdmin.length) { wrap.innerHTML = '<p class="empty-msg">No categories yet.</p>'; return; }
  wrap.innerHTML = allCategoriesAdmin.map((c) => `
    <div class="admin-item">
      <div class="item-main"><strong>${escapeHtmlA(c.name)}</strong></div>
      <div class="item-actions">
        <button data-edit="${c.id}">Edit</button>
        <button class="danger" data-del="${c.id}">Delete</button>
      </div>
    </div>`).join("");

  wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const c = allCategoriesAdmin.find((x) => x.id === b.dataset.edit);
    document.getElementById("categoryEditId").value = c.id;
    document.getElementById("categoryName").value = c.name;
  }));
  wrap.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (confirm("Delete this category? Products linked to it will lose their category.")) {
      await db.collection("categories").doc(b.dataset.del).delete();
    }
  }));
}

function fillCategorySelect() {
  const sel = document.getElementById("productCategory");
  const current = sel.value;
  sel.innerHTML = allCategoriesAdmin.map((c) => `<option value="${c.id}">${escapeHtmlA(c.name)}</option>`).join("");
  if (current) sel.value = current;
}

/* ---- Products ---- */
let allProductsAdmin = [];
let editingImages = []; // used while editing an existing product
let editingVideoUrl = null;

function initProducts() {
  db.collection("products").orderBy("order", "desc").onSnapshot((snap) => {
    allProductsAdmin = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderProductsListAdmin();
  });

  document.getElementById("productForm").addEventListener("submit", handleProductSubmit);
  document.getElementById("productCancelEdit").addEventListener("click", resetProductForm);
}

function renderProductsListAdmin() {
  const wrap = document.getElementById("productsList");
  if (!allProductsAdmin.length) { wrap.innerHTML = '<p class="empty-msg">No products yet.</p>'; return; }
  wrap.innerHTML = allProductsAdmin.map((p) => {
    const cat = allCategoriesAdmin.find((c) => c.id === p.categoryId);
    const img = (p.images && p.images[0]) || "";
    return `<div class="admin-item">
      ${img ? `<img src="${img}" alt="">` : ""}
      <div class="item-main">
        <strong>${escapeHtmlA(p.name || "")}</strong>
        <small>${cat ? escapeHtmlA(cat.name) : "No category"} ${p.price ? "· ₹" + p.price : ""} ${p.inStock === false ? "· Out of stock" : ""}</small>
      </div>
      <div class="item-actions">
        <button data-edit="${p.id}">Edit</button>
        <button class="danger" data-del="${p.id}">Delete</button>
      </div>
    </div>`;
  }).join("");

  wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => loadProductIntoForm(b.dataset.edit)));
  wrap.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (confirm("Delete this product?")) await db.collection("products").doc(b.dataset.del).delete();
  }));
}

function loadProductIntoForm(id) {
  const p = allProductsAdmin.find((x) => x.id === id);
  if (!p) return;
  document.getElementById("productEditId").value = p.id;
  document.getElementById("productName").value = p.name || "";
  document.getElementById("productCategory").value = p.categoryId || "";
  document.getElementById("productPrice").value = p.price || "";
  document.getElementById("productDesc").value = p.description || "";
  document.getElementById("productInStock").checked = p.inStock !== false;

  editingImages = p.images ? [...p.images] : [];
  editingVideoUrl = p.videoUrl || null;
  renderImagePreview();

  const note = document.getElementById("productExistingVideoNote");
  note.classList.toggle("hidden", !editingVideoUrl);

  document.getElementById("productCancelEdit").classList.remove("hidden");
  document.getElementById("tab-products").scrollIntoView({ behavior: "smooth" });
}

function renderImagePreview() {
  const wrap = document.getElementById("productImagePreview");
  wrap.innerHTML = editingImages.map((url, i) => `
    <div class="thumb-wrap"><img src="${url}"><button type="button" data-i="${i}">×</button></div>
  `).join("");
  wrap.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
    editingImages.splice(Number(btn.dataset.i), 1);
    renderImagePreview();
  }));
}

function resetProductForm() {
  document.getElementById("productForm").reset();
  document.getElementById("productEditId").value = "";
  document.getElementById("productCancelEdit").classList.add("hidden");
  document.getElementById("productExistingVideoNote").classList.add("hidden");
  editingImages = [];
  editingVideoUrl = null;
  renderImagePreview();
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const statusEl = document.getElementById("productUploadStatus");
  const editId = document.getElementById("productEditId").value;
  const imageFiles = Array.from(document.getElementById("productImages").files);
  const videoFile = document.getElementById("productVideo").files[0];

  try {
    statusEl.textContent = imageFiles.length || videoFile ? "Uploading, please wait..." : "Saving...";

    const newImageUrls = [];
    for (const file of imageFiles) newImageUrls.push(await uploadToCloudinary(file, "image"));

    let videoUrl = editingVideoUrl;
    if (videoFile) videoUrl = await uploadToCloudinary(videoFile, "video");

    const finalImages = [...editingImages, ...newImageUrls];
    const existing = editId ? allProductsAdmin.find((p) => p.id === editId) : null;

    const data = {
      name: document.getElementById("productName").value.trim(),
      categoryId: document.getElementById("productCategory").value,
      price: Number(document.getElementById("productPrice").value) || null,
      description: document.getElementById("productDesc").value.trim(),
      images: finalImages,
      videoUrl: videoUrl || null,
      inStock: document.getElementById("productInStock").checked,
      order: existing ? existing.order : Date.now()
    };

    if (editId) await db.collection("products").doc(editId).update(data);
    else await db.collection("products").add(data);

    statusEl.textContent = "Saved!";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
    resetProductForm();
  } catch (err) {
    statusEl.textContent = "Error: " + err.message;
  }
}

/* ---- Banner slider ---- */
function initBanner() {
  db.collection("settings").doc("hero").onSnapshot((doc) => {
    const images = doc.exists && doc.data().images ? doc.data().images : [];
    renderBannerList(images);
  });

  document.getElementById("bannerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("bannerUploadStatus");
    const file = document.getElementById("bannerImageInput").files[0];
    if (!file) { statusEl.textContent = "Please choose an image first."; return; }
    try {
      statusEl.textContent = "Uploading...";
      const url = await uploadToCloudinary(file, "image");
      await db.collection("settings").doc("hero").set(
        { images: firebase.firestore.FieldValue.arrayUnion(url) }, { merge: true }
      );
      statusEl.textContent = "Added!";
      document.getElementById("bannerForm").reset();
      setTimeout(() => { statusEl.textContent = ""; }, 2000);
    } catch (err) {
      statusEl.textContent = "Error: " + err.message;
    }
  });
}

function renderBannerList(images) {
  const wrap = document.getElementById("bannerList");
  if (!images.length) { wrap.innerHTML = '<p class="empty-msg">No banner images yet.</p>'; return; }
  wrap.innerHTML = images.map((url) => `
    <div class="admin-item">
      <img src="${url}" alt="">
      <div class="item-main"><small>Banner image</small></div>
      <div class="item-actions"><button class="danger" data-url="${encodeURIComponent(url)}">Remove</button></div>
    </div>`).join("");
  wrap.querySelectorAll("[data-url]").forEach((b) => b.addEventListener("click", async () => {
    const url = decodeURIComponent(b.dataset.url);
    await db.collection("settings").doc("hero").set(
      { images: firebase.firestore.FieldValue.arrayRemove(url) }, { merge: true }
    );
  }));
}

/* ---- Entry video (admin-only, plays after login) ---- */
function initEntryVideoTab() {
  db.collection("settings").doc("entryVideo").onSnapshot((doc) => {
    const url = doc.exists ? doc.data().videoUrl : "";
    document.getElementById("currentEntryVideoLabel").textContent = url
      ? "An entry video is set."
      : "No entry video set — the dashboard opens immediately after login.";
  });

  document.getElementById("entryVideoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("entryVideoUploadStatus");
    const file = document.getElementById("entryVideoInput").files[0];
    if (!file) { statusEl.textContent = "Please choose a video first."; return; }
    try {
      statusEl.textContent = "Uploading...";
      const url = await uploadToCloudinary(file, "video");
      await db.collection("settings").doc("entryVideo").set({ videoUrl: url }, { merge: true });
      statusEl.textContent = "Saved!";
      document.getElementById("entryVideoForm").reset();
      setTimeout(() => { statusEl.textContent = ""; }, 2000);
    } catch (err) {
      statusEl.textContent = "Error: " + err.message;
    }
  });

  document.getElementById("entryVideoRemoveBtn").addEventListener("click", async () => {
    await db.collection("settings").doc("entryVideo").set({ videoUrl: "" }, { merge: true });
  });
}

/* ---- Blocked logins ---- */
let knownBlockedIds = null; // null until the first snapshot arrives

function initBlockedList() {
  db.collection("security_blocks").where("blocked", "==", true).onSnapshot((snap) => {
    const currentIds = new Set(snap.docs.map((d) => d.id));
    if (knownBlockedIds) {
      snap.docs.forEach((d) => {
        if (!knownBlockedIds.has(d.id)) triggerOwnerAlert(d.id, d.data());
      });
    }
    knownBlockedIds = currentIds; // don't alert for IDs already blocked before this page loaded

    const wrap = document.getElementById("blockedList");
    if (snap.empty) { wrap.innerHTML = '<p class="empty-msg">No blocked IDs.</p>'; return; }
    wrap.innerHTML = snap.docs.map((d) => {
      const data = d.data();
      const when = data.blockedAt && data.blockedAt.toDate ? data.blockedAt.toDate().toLocaleString("en-IN") : "—";
      return `<div class="admin-item blocked-item">
        <div class="item-main">
          <strong>${escapeHtmlA(d.id)}</strong>
          <small>Attempts: ${data.attempts || 0} · Blocked: ${when}</small>
        </div>
        <div class="item-actions"><button data-unblock="${d.id}">Unblock</button></div>
      </div>`;
    }).join("");
    wrap.querySelectorAll("[data-unblock]").forEach((b) => b.addEventListener("click", async () => {
      await db.collection("security_blocks").doc(b.dataset.unblock).update({ blocked: false, attempts: 0 });
    }));
  }, () => {
    document.getElementById("blockedList").innerHTML = '<p class="empty-msg">Couldn\u2019t load the list — check your Firestore rules.</p>';
  });
}

function initBlockedDevices() {
  db.collection("blocked_devices").where("blocked", "==", true).onSnapshot((snap) => {
    const wrap = document.getElementById("blockedDevicesList");
    if (snap.empty) { wrap.innerHTML = '<p class="empty-msg">No blocked devices.</p>'; return; }
    wrap.innerHTML = snap.docs.map((d) => {
      const data = d.data();
      const when = data.blockedAt && data.blockedAt.toDate ? data.blockedAt.toDate().toLocaleString("en-IN") : "—";
      return `<div class="admin-item blocked-item">
        <div class="item-main">
          <strong>Device: ${escapeHtmlA(d.id)}</strong>
          <small>Last ID tried: ${escapeHtmlA(data.lastId || "—")} · Blocked: ${when}</small>
        </div>
        <div class="item-actions"><button data-unblock-device="${d.id}">Unblock</button></div>
      </div>`;
    }).join("");
    wrap.querySelectorAll("[data-unblock-device]").forEach((b) => b.addEventListener("click", async () => {
      await db.collection("blocked_devices").doc(b.dataset.unblockDevice).update({ blocked: false });
    }));
  }, () => {
    document.getElementById("blockedDevicesList").innerHTML = '<p class="empty-msg">Couldn\u2019t load the list — check your Firestore rules.</p>';
  });
}

/* ---- Live alert on this device (siren + red screen + notification) ----
   Fires only while this admin panel tab is open somewhere (phone or
   laptop) — there's no way for a website to wake up a fully-closed
   browser or ring through a locked phone the way a call or alarm does.
   Keep this tab open on your phone (even in the background) for it to
   go off in real time; the email alert above is the part that still
   reaches you if the tab isn't open. */
function triggerOwnerAlert(id, data) {
  document.getElementById("ownerAlertId").textContent = "ID: " + id;
  document.getElementById("ownerAlertTime").textContent =
    "Attempts: " + (data.attempts || 0) + " · " + new Date().toLocaleString("en-IN");
  document.getElementById("ownerAlertOverlay").classList.remove("hidden");
  playSiren();
  startVibration();
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("🚨 MBW Security Alert", {
        body: "Blocked login attempt — ID: " + id,
        requireInteraction: true
      });
    } catch (e) {}
  }
}

function initPhoneAlerts() {
  const btn = document.getElementById("enablePhoneAlerts");
  const status = document.getElementById("phoneAlertsStatus");
  const dismissBtn = document.getElementById("ownerAlertDismiss");

  function refreshStatus() {
    if (typeof Notification === "undefined") {
      status.textContent = "This browser doesn't support notifications — the siren and red screen will still work while this tab is open.";
    } else if (Notification.permission === "granted") {
      status.textContent = "✅ Live alerts are on for this device. Keep this tab open to receive them.";
    } else {
      status.textContent = "While this tab is open on a device, that device will flash red, play the siren, and show a notification the moment a new ID gets blocked.";
    }
  }

  btn.addEventListener("click", async () => {
    if (typeof Notification === "undefined") { refreshStatus(); return; }
    await Notification.requestPermission();
    refreshStatus();
  });

  dismissBtn.addEventListener("click", () => {
    document.getElementById("ownerAlertOverlay").classList.add("hidden");
    stopSiren();
  });

  refreshStatus();
}

/* ---- Security siren sound ---- */
function initSecuritySound() {
  db.collection("settings").doc("security").onSnapshot((doc) => {
    const url = doc.exists ? doc.data().sirenUrl : "";
    document.getElementById("currentSirenLabel").textContent = url
      ? "A custom sound is currently set."
      : "Using the default (auto-generated) siren.";
  });

  document.getElementById("sirenForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("sirenUploadStatus");
    const file = document.getElementById("sirenInput").files[0];
    if (!file) { statusEl.textContent = "Please choose an audio file first."; return; }
    try {
      statusEl.textContent = "Uploading...";
      const url = await uploadToCloudinary(file, "video"); // Cloudinary handles audio under the 'video' resource type
      await db.collection("settings").doc("security").set({ sirenUrl: url }, { merge: true });
      statusEl.textContent = "Saved!";
      document.getElementById("sirenForm").reset();
      setTimeout(() => { statusEl.textContent = ""; }, 2000);
    } catch (err) {
      statusEl.textContent = "Error: " + err.message;
    }
  });

  document.getElementById("sirenTestBtn").addEventListener("click", () => {
    playSiren();
    setTimeout(stopSiren, 3000);
  });

  document.getElementById("sirenResetBtn").addEventListener("click", async () => {
    await db.collection("settings").doc("security").set({ sirenUrl: "" }, { merge: true });
  });
}

/* ---- Shop settings ---- */
function initSettings() {
  db.collection("settings").doc("general").get().then((doc) => {
    const d = doc.exists ? doc.data() : {};
    document.getElementById("settingShopName").value = d.shopName || "Maurya Battery Works";
    document.getElementById("settingTagline").value = d.tagline || "";
    document.getElementById("settingAddress").value = d.address || "";
    document.getElementById("settingPhone").value = d.phone || "";
    document.getElementById("settingWhatsapp").value = d.whatsapp || "";
    document.getElementById("settingHeroEyebrow").value = d.heroEyebrow || "";
    document.getElementById("settingHeroHeadline").value = d.heroHeadline || "";
    document.getElementById("settingHeroDescription").value = d.heroDescription || "";
    document.getElementById("settingFooterTagline").value = d.footerTagline || "";
  });

  document.getElementById("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("settingsStatus");
    const data = {
      shopName: document.getElementById("settingShopName").value.trim(),
      tagline: document.getElementById("settingTagline").value.trim(),
      address: document.getElementById("settingAddress").value.trim(),
      phone: document.getElementById("settingPhone").value.trim(),
      whatsapp: document.getElementById("settingWhatsapp").value.trim(),
      heroEyebrow: document.getElementById("settingHeroEyebrow").value.trim(),
      heroHeadline: document.getElementById("settingHeroHeadline").value.trim(),
      heroDescription: document.getElementById("settingHeroDescription").value.trim(),
      footerTagline: document.getElementById("settingFooterTagline").value.trim()
    };
    await db.collection("settings").doc("general").set(data, { merge: true });
    statusEl.textContent = "Saved!";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
  });
}

/* ---- Social links (footer icons) ---- */
let allSocialLinksAdmin = [];

function initSocialLinks() {
  db.collection("social_links").orderBy("order", "asc").onSnapshot((snap) => {
    allSocialLinksAdmin = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderSocialLinksList();
  });

  document.getElementById("socialLinkForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("socialLinkEditId").value;
    const platform = document.getElementById("socialLinkPlatform").value;
    const label = document.getElementById("socialLinkLabel").value.trim();
    const url = document.getElementById("socialLinkUrl").value.trim();
    if (!url) return;
    if (editId) {
      await db.collection("social_links").doc(editId).update({ platform, label, url });
    } else {
      await db.collection("social_links").add({ platform, label, url, order: Date.now() });
    }
    document.getElementById("socialLinkForm").reset();
    document.getElementById("socialLinkEditId").value = "";
  });
}

function renderSocialLinksList() {
  const wrap = document.getElementById("socialLinksList");
  if (!allSocialLinksAdmin.length) { wrap.innerHTML = '<p class="empty-msg">No social links yet.</p>'; return; }
  wrap.innerHTML = allSocialLinksAdmin.map((l) => `
    <div class="admin-item">
      <div class="item-main">
        <strong>${escapeHtmlA(l.label || l.platform)}</strong>
        <small>${escapeHtmlA(l.platform)} · ${escapeHtmlA(l.url)}</small>
      </div>
      <div class="item-actions">
        <button data-edit="${l.id}">Edit</button>
        <button class="danger" data-del="${l.id}">Delete</button>
      </div>
    </div>`).join("");

  wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const l = allSocialLinksAdmin.find((x) => x.id === b.dataset.edit);
    document.getElementById("socialLinkEditId").value = l.id;
    document.getElementById("socialLinkPlatform").value = l.platform;
    document.getElementById("socialLinkLabel").value = l.label || "";
    document.getElementById("socialLinkUrl").value = l.url;
  }));
  wrap.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (confirm("Delete this social link?")) await db.collection("social_links").doc(b.dataset.del).delete();
  }));
}

/* ---- helpers ---- */
function escapeHtmlA(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

/* ---------------------------------------------------------
   SECTION 5 — Customer Reviews (Rate Us page management)
   --------------------------------------------------------- */

let wordsRevealed = false;
let allReviewsAdmin = [];
let reviewsPrivateMap = {}; // id -> address, from the admin-only reviews_private collection
let allBadWords = [];
let allBlockedReviewers = [];
let testAudioSource = null;

function stopTestAudio() {
  if (testAudioSource) { try { testAudioSource.stop(); } catch (e) {} testAudioSource = null; }
}

async function playAudioFromUrl(url) {
  stopTestAudio();
  if (!url) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buf);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
    testAudioSource = source;
  } catch (e) {}
}

function maskWord(w) {
  if (w.length <= 1) return "*";
  return w[0] + "*".repeat(w.length - 1);
}

// Masks any bad-list word found inside a longer blocked message —
// so you can see the shape/context of what was typed without reading
// the raw word.
function maskTextWithBadWords(text, words) {
  let out = String(text || "");
  words.forEach((w) => {
    if (!w) return;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, (match) => maskWord(match));
  });
  return out;
}

function renderReviewsAdminList() {
  const wrap = document.getElementById("reviewsAdminList");
  document.getElementById("reviewsTotalCount").textContent = "Total feedback received: " + allReviewsAdmin.length;
  if (!allReviewsAdmin.length) { wrap.innerHTML = '<p class="empty-msg">No reviews yet.</p>'; return; }
  wrap.innerHTML = allReviewsAdmin.map((r) => {
    const when = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleString("en-IN") : "—";
    const address = reviewsPrivateMap[r.id] || "(address not found)";
    const replyLine = r.ownerReply ? `<small>Your reply: "${escapeHtmlA(r.ownerReply)}"</small>` : "";
    return `<div class="admin-item">
      <div class="item-main">
        <strong>${escapeHtmlA(r.name)} — ${"★".repeat(r.stars || 0)}${"☆".repeat(5 - (r.stars || 0))}</strong>
        <small>${escapeHtmlA(r.description || "")}</small>
        <small>Address (private, admin-only): ${escapeHtmlA(address)} · ${when}</small>
        ${replyLine}
      </div>
      <div class="item-actions">
        <button data-reply-review="${r.id}">${r.ownerReply ? "Edit Reply" : "Reply"}</button>
        <button class="danger" data-del-review="${r.id}">Delete</button>
      </div>
    </div>`;
  }).join("");
  wrap.querySelectorAll("[data-del-review]").forEach((b) => b.addEventListener("click", async () => {
    if (confirm("Delete this review?")) {
      await db.collection("reviews").doc(b.dataset.delReview).delete();
      await db.collection("reviews_private").doc(b.dataset.delReview).delete().catch(() => {});
    }
  }));
  wrap.querySelectorAll("[data-reply-review]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.dataset.replyReview;
    const existing = allReviewsAdmin.find((r) => r.id === id);
    const reply = prompt("Your public reply to this customer:", existing && existing.ownerReply ? existing.ownerReply : "");
    if (reply === null) return; // cancelled
    await db.collection("reviews").doc(id).update({
      ownerReply: reply.trim(),
      ownerReplyAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }));
}

function renderBadWordsList() {
  const wrap = document.getElementById("badWordsList");
  if (!allBadWords.length) { wrap.innerHTML = '<p class="empty-msg">No words added yet — add some below.</p>'; return; }
  wrap.innerHTML = allBadWords.map((w) => `
    <div class="admin-item">
      <div class="item-main"><strong>${escapeHtmlA(wordsRevealed ? w : maskWord(w))}</strong></div>
      <div class="item-actions"><button class="danger" data-del-word="${escapeHtmlA(w)}">Remove</button></div>
    </div>`).join("");
  wrap.querySelectorAll("[data-del-word]").forEach((b) => b.addEventListener("click", async () => {
    const updated = allBadWords.filter((w) => w !== b.dataset.delWord);
    await db.collection("settings").doc("bad_words").set({ words: updated }, { merge: true });
  }));
}

function renderBlockedReviewersList() {
  const wrap = document.getElementById("blockedReviewersList");
  if (!allBlockedReviewers.length) { wrap.innerHTML = '<p class="empty-msg">No blocked reviewers.</p>'; return; }
  wrap.innerHTML = allBlockedReviewers.map((d) => {
    const when = d.blockedAt && d.blockedAt.toDate ? d.blockedAt.toDate().toLocaleString("en-IN") : "—";
    const shown = wordsRevealed ? (d.blockedContent || "") : maskTextWithBadWords(d.blockedContent || "", allBadWords);
    return `<div class="admin-item blocked-item">
      <div class="item-main">
        <strong>${escapeHtmlA(d.name || "(no name given)")}</strong>
        <small>Message: "${escapeHtmlA(shown)}"</small>
        <small>Device: ${escapeHtmlA(d.id)} · Blocked: ${when}</small>
      </div>
      <div class="item-actions"><button data-unblock-reviewer="${d.id}">Unblock</button></div>
    </div>`;
  }).join("");
  wrap.querySelectorAll("[data-unblock-reviewer]").forEach((b) => b.addEventListener("click", async () => {
    await db.collection("feedback_blocks").doc(b.dataset.unblockReviewer).update({ permanentlyBlocked: false });
  }));
}

function initCustomerReviews() {
  db.collection("reviews").orderBy("createdAt", "desc").limit(20).onSnapshot((snap) => {
    allReviewsAdmin = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderReviewsAdminList();
  }, () => {
    document.getElementById("reviewsAdminList").innerHTML = '<p class="empty-msg">Couldn\u2019t load reviews — check your Firestore rules.</p>';
  });

  // Address lives in a separate, admin-only-readable collection — see
  // README for why. This keeps it out of anything a public visitor's
  // browser ever receives, even in a raw network response.
  db.collection("reviews_private").onSnapshot((snap) => {
    const map = {};
    snap.docs.forEach((d) => { map[d.id] = (d.data() || {}).address || ""; });
    reviewsPrivateMap = map;
    renderReviewsAdminList();
  }, () => { /* if this fails, addresses just show as not-found — reviews themselves still work */ });

  db.collection("settings").doc("bad_words").onSnapshot((doc) => {
    allBadWords = doc.exists ? (doc.data().words || []) : [];
    renderBadWordsList();
    renderBlockedReviewersList(); // re-mask using the latest word list too
  });

  db.collection("feedback_blocks").where("permanentlyBlocked", "==", true).onSnapshot((snap) => {
    allBlockedReviewers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBlockedReviewersList();
  }, () => {
    document.getElementById("blockedReviewersList").innerHTML = '<p class="empty-msg">Couldn\u2019t load the list — check your Firestore rules.</p>';
  });

  document.getElementById("toggleWordsVisible").addEventListener("click", () => {
    wordsRevealed = !wordsRevealed;
    document.getElementById("toggleWordsVisible").textContent = wordsRevealed ? "🙈 Mask Words Again" : "👁 Show Real Words";
    renderBadWordsList();
    renderBlockedReviewersList();
  });

  document.getElementById("badWordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("badWordInput");
    const w = input.value.trim().toLowerCase();
    if (!w) return;
    if (!allBadWords.includes(w)) {
      await db.collection("settings").doc("bad_words").set(
        { words: firebase.firestore.FieldValue.arrayUnion(w) }, { merge: true }
      );
    }
    input.value = "";
  });

  // Thank-you text + animation duration
  db.collection("settings").doc("feedback").get().then((doc) => {
    const d = doc.exists ? doc.data() : {};
    document.getElementById("feedbackThankYouText").value = d.thankYouText || "Thank you for your feedback!";
    document.getElementById("feedbackAnimDuration").value = d.animationSeconds || 5;
  });

  document.getElementById("feedbackSettingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("feedbackSettingsStatus");
    const text = document.getElementById("feedbackThankYouText").value.trim() || "Thank you for your feedback!";
    let secs = parseInt(document.getElementById("feedbackAnimDuration").value, 10);
    if (!secs || secs < 2) secs = 5;
    if (secs > 15) secs = 15;
    await db.collection("settings").doc("feedback").set({ thankYouText: text, animationSeconds: secs }, { merge: true });
    statusEl.textContent = "Saved!";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
  });

  // Celebration sound (plays on the 4-5 star thank-you screen)
  document.getElementById("celebrationSoundSaveBtn").addEventListener("click", async () => {
    const statusEl = document.getElementById("celebrationSoundStatus");
    const file = document.getElementById("celebrationSoundInput").files[0];
    if (!file) { statusEl.textContent = "Choose an audio file first."; return; }
    try {
      statusEl.textContent = "Uploading...";
      const url = await uploadToCloudinary(file, "video");
      await db.collection("settings").doc("feedback").set({ celebrationAudioUrl: url }, { merge: true });
      statusEl.textContent = "Saved!";
      setTimeout(() => { statusEl.textContent = ""; }, 2000);
    } catch (err) { statusEl.textContent = "Error: " + err.message; }
  });
  document.getElementById("celebrationSoundTestBtn").addEventListener("click", async () => {
    const doc = await db.collection("settings").doc("feedback").get();
    const url = doc.exists ? doc.data().celebrationAudioUrl : "";
    if (url) { playAudioFromUrl(url); setTimeout(stopTestAudio, 5000); }
  });

  // Blocked-feedback siren (different audio from the admin-login siren)
  document.getElementById("abuseSoundSaveBtn").addEventListener("click", async () => {
    const statusEl = document.getElementById("abuseSoundStatus");
    const file = document.getElementById("abuseSoundInput").files[0];
    if (!file) { statusEl.textContent = "Choose an audio file first."; return; }
    try {
      statusEl.textContent = "Uploading...";
      const url = await uploadToCloudinary(file, "video");
      await db.collection("settings").doc("feedback").set({ abuseSirenUrl: url }, { merge: true });
      statusEl.textContent = "Saved!";
      setTimeout(() => { statusEl.textContent = ""; }, 2000);
    } catch (err) { statusEl.textContent = "Error: " + err.message; }
  });
  document.getElementById("abuseSoundTestBtn").addEventListener("click", async () => {
    const doc = await db.collection("settings").doc("feedback").get();
    const url = doc.exists ? doc.data().abuseSirenUrl : "";
    if (url) { playAudioFromUrl(url); setTimeout(stopTestAudio, 3000); }
  });
}
