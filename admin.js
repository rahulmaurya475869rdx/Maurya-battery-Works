/* =========================================================
   MBW Admin Panel logic
   ========================================================= */

const auth = firebase.auth();
auth.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});
const PIN_REGEX = /^\d{10}$/;

/* ---------------------------------------------------------
   SECTION 1 — Login (normal + emergency PIN) + lockout + alert
   --------------------------------------------------------- */

function sanitizeId(raw) {
  return String(raw).trim().toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 140) || "unknown";
}

const loginForm = document.getElementById("loginForm");
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
    gain.gain.value = 0.12;
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
  gain.gain.value = 0.7;
  source.connect(gain).connect(ctx.destination);
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
  loginForm.reset();
  loginSection.classList.add("hidden");
  securityAlertEl.classList.remove("hidden");
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = null;
  }
  playSiren();
  startVibration();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const idVal = document.getElementById("adminId").value;
  const passVal = document.getElementById("adminPass").value;

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
    blockRef.update({
      attempts: firebase.firestore.FieldValue.increment(1),
      lastAttempt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
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
      showSecurityAlert();
    } else {
      loginError.textContent = "Wrong ID or password. One more wrong attempt will block this ID.";
    }
  }
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
    showEntryVideoThenDashboard();
    if (!dashboardStarted) { dashboardStarted = true; initDashboard(); }
  } else {
    loginSection.classList.remove("hidden");
    dashboardSection.classList.add("hidden");
    entryVideoOverlay.classList.add("hidden");
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => auth.signOut());

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
  initSecuritySound();
  initSettings();
  initSocialLinks();
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
function initBlockedList() {
  db.collection("security_blocks").where("blocked", "==", true).onSnapshot((snap) => {
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
