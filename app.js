/* =========================================================
   Maurya Battery Works — customer-facing site logic
   ========================================================= */

let allCategories = [];
let allProducts = [];
let activeCategory = "all";
let searchTerm = "";
let shopSettings = {};

/* ---------------- Shop settings ---------------- */
db.collection("settings").doc("general").get().then((doc) => {
  shopSettings = doc.exists ? doc.data() : {};
  const shopName = shopSettings.shopName || "Maurya Battery Works";

  document.getElementById("shopNameHeading").textContent = shopName;
  if (shopSettings.tagline) document.getElementById("shopTagline").textContent = shopSettings.tagline;
  if (shopSettings.address) document.getElementById("contactAddress").textContent = shopSettings.address;

  document.getElementById("heroEyebrow").textContent = shopSettings.heroEyebrow || "Trusted since day one";
  document.getElementById("heroHeadline").textContent = shopSettings.heroHeadline || "Power you can count on, every day.";
  document.getElementById("heroDescription").textContent = shopSettings.heroDescription ||
    "Genuine batteries, inverters, coolers, fans, washing machines, and heaters — all backed by warranty and ready to install.";

  document.getElementById("footerShopName").textContent = shopName;
  document.getElementById("footerTagline").textContent = shopSettings.footerTagline || "Trusted power, close to home.";
  document.getElementById("footerAddressLine").textContent = shopSettings.address || "";
  document.getElementById("copyrightLine").textContent = `© ${new Date().getFullYear()} ${shopName}. All rights reserved.`;

  const phone = shopSettings.phone || "";
  const wa = shopSettings.whatsapp || phone;
  document.getElementById("callBtn").href = phone ? `tel:${phone}` : "#";
  document.getElementById("whatsappBtn").href = wa
    ? `https://wa.me/${wa.replace(/\D/g, "")}`
    : "#";
}).catch(() => {});

/* ---------------- Social links (footer icons) ---------------- */
function socialIconSvg(platform) {
  const icons = {
    youtube: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/><polygon points="10,9 10,15 15,12" fill="currentColor"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/><text x="12" y="16.5" font-size="12" font-weight="700" text-anchor="middle" fill="currentColor">f</text></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4.2A8 8 0 1 1 8.6 19L4 20Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/></svg>',
    maps: '<svg viewBox="0 0 24 24"><path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="9" r="2.3" fill="currentColor"/></svg>',
    twitter: '<svg viewBox="0 0 24 24"><line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.2"/><line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2.2"/></svg>',
    website: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.6"/></svg>'
  };
  return icons[platform] || icons.website;
}

db.collection("social_links").orderBy("order", "asc").get().then((snap) => {
  const wrap = document.getElementById("socialLinks");
  wrap.innerHTML = snap.docs.map((d) => {
    const l = d.data();
    const label = l.label || l.platform || "Link";
    return `<a href="${l.url}" target="_blank" rel="noopener" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${socialIconSvg(l.platform)}</a>`;
  }).join("");
}).catch(() => {});

/* ---------------- Disable the long-press "save image" menu ---------------- */
document.addEventListener("contextmenu", (e) => {
  if (e.target.tagName === "IMG") e.preventDefault();
});

/* ---------------- Hero slider (smooth crossfade) ---------------- */
const heroSlider = document.getElementById("heroSlider");
let heroTimer = null;

db.collection("settings").doc("hero").get().then((doc) => {
  const images = doc.exists && doc.data().images ? doc.data().images : [];
  if (!images.length) {
    heroSlider.innerHTML = '<div class="slider-placeholder">Add banner images from the admin panel</div>';
    return;
  }
  heroSlider.innerHTML = images
    .map((url, i) => `<img src="${url}" class="${i === 0 ? "active" : ""}" alt="Banner ${i + 1}">`)
    .join("");
  if (images.length > 1) {
    let idx = 0;
    heroTimer = setInterval(() => {
      const imgs = heroSlider.querySelectorAll("img");
      imgs[idx].classList.remove("active");
      idx = (idx + 1) % imgs.length;
      imgs[idx].classList.add("active");
    }, 4200);
  }
}).catch(() => {});

/* ---------------- Categories ---------------- */
db.collection("categories").orderBy("order", "asc").onSnapshot((snap) => {
  allCategories = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCategoryChips();
});

function renderCategoryChips() {
  const wrap = document.getElementById("categoryChips");
  const chips = [`<button class="chip ${activeCategory === "all" ? "active" : ""}" data-cat="all">All Items</button>`];
  allCategories.forEach((c) => {
    chips.push(
      `<button class="chip ${activeCategory === c.id ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.name)}</button>`
    );
  });
  wrap.innerHTML = chips.join("");
  wrap.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat;
      renderCategoryChips();
      renderProducts();
    });
  });
}

/* ---------------- Products ---------------- */
db.collection("products").orderBy("order", "desc").onSnapshot((snap) => {
  allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderProducts();
});

function renderProducts() {
  const grid = document.getElementById("productGrid");
  const filtered = allProducts.filter((p) => {
    const matchesCat = activeCategory === "all" || p.categoryId === activeCategory;
    const matchesSearch = !searchTerm || (p.name || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  if (!filtered.length) {
    grid.innerHTML = '<p class="empty-msg">No products found.</p>';
    return;
  }

  grid.innerHTML = filtered.map((p) => {
    const img = (p.images && p.images[0]) || "";
    const priceHtml = p.price ? `<p class="price">₹${p.price}</p>` : "<p class=\"price\">&nbsp;</p>";
    const stockHtml = p.inStock === false ? '<p class="out-tag">Out of stock</p>' : "";
    return `<div class="product-card" data-id="${p.id}">
      <img src="${img}" alt="${escapeHtml(p.name || "")}" loading="lazy">
      <h3>${escapeHtml(p.name || "")}</h3>
      ${priceHtml}
      ${stockHtml}
    </div>`;
  }).join("");

  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openProductModal(card.dataset.id));
  });
}

/* ---------------- Product modal ---------------- */
const modal = document.getElementById("productModal");
let modalHistoryPushed = false;

function closeProductModal() {
  modal.classList.add("hidden");
  if (modalHistoryPushed) {
    modalHistoryPushed = false;
    history.back();
  }
}

document.getElementById("modalClose").addEventListener("click", closeProductModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeProductModal(); });

window.addEventListener("popstate", () => {
  if (!modal.classList.contains("hidden")) {
    modal.classList.add("hidden");
    modalHistoryPushed = false;
  }
});

function openProductModal(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;

  const images = p.images && p.images.length ? p.images : [""];
  document.getElementById("modalMainImage").src = images[0];
  document.getElementById("modalProductName").textContent = p.name || "";
  document.getElementById("modalProductPrice").textContent = p.price ? `₹${p.price}` : "";
  document.getElementById("modalProductDesc").textContent = p.description || "";

  const thumbsWrap = document.getElementById("modalThumbs");
  thumbsWrap.innerHTML = images.map((url, i) =>
    `<img src="${url}" class="${i === 0 ? "active-thumb" : ""}" data-i="${i}">`
  ).join("");
  thumbsWrap.querySelectorAll("img").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      document.getElementById("modalMainImage").src = images[thumb.dataset.i];
      thumbsWrap.querySelectorAll("img").forEach((t) => t.classList.remove("active-thumb"));
      thumb.classList.add("active-thumb");
    });
  });

  const videoWrap = document.getElementById("modalVideoWrap");
  const videoEl = document.getElementById("modalVideo");
  if (p.videoUrl) {
    videoEl.src = p.videoUrl;
    videoWrap.classList.remove("hidden");
  } else {
    videoEl.removeAttribute("src");
    videoWrap.classList.add("hidden");
  }

  const wa = shopSettings.whatsapp || shopSettings.phone || "";
  const msg = encodeURIComponent(`Hi, I would like more information about "${p.name}".`);
  document.getElementById("modalWhatsapp").href = wa ? `https://wa.me/${wa.replace(/\D/g, "")}?text=${msg}` : "#";

  modal.classList.remove("hidden");
  history.pushState({ mbwModal: true }, "", location.href);
  modalHistoryPushed = true;
}

/* ---------------- Search + hidden "MBW LOGIN" admin trigger ---------------- */
document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const val = document.getElementById("searchInput").value.trim();
  if (val.toUpperCase() === "MBW LOGIN") {
    document.getElementById("searchInput").value = "";
    window.location.href = "admin.html";
    return;
  }
  searchTerm = val;
  renderProducts();
});

// Safety net: whenever this page is restored via the back/forward button
// (not freshly loaded), make sure the search box never shows old text.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    const si = document.getElementById("searchInput");
    if (si) si.value = "";
  }
});

/* ---------------- helpers ---------------- */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
