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
  if (shopSettings.shopName) document.getElementById("shopNameHeading").textContent = shopSettings.shopName;
  if (shopSettings.tagline) document.getElementById("shopTagline").textContent = shopSettings.tagline;
  if (shopSettings.address) document.getElementById("contactAddress").textContent = shopSettings.address;

  const phone = shopSettings.phone || "";
  const wa = shopSettings.whatsapp || phone;
  document.getElementById("callBtn").href = phone ? `tel:${phone}` : "#";
  document.getElementById("whatsappBtn").href = wa
    ? `https://wa.me/${wa.replace(/\D/g, "")}`
    : "#";
}).catch(() => {});

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
  const chips = [`<button class="chip ${activeCategory === "all" ? "active" : ""}" data-cat="all">Sab Items</button>`];
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
document.getElementById("modalClose").addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

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
}

/* ---------------- Search + hidden "MBW LOGIN" admin trigger ---------------- */
document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const val = document.getElementById("searchInput").value.trim();
  if (val.toUpperCase() === "MBW LOGIN") {
    window.location.href = "admin.html";
    return;
  }
  searchTerm = val;
  renderProducts();
});

/* ---------------- helpers ---------------- */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

document.getElementById("footerYear").textContent = new Date().getFullYear();
