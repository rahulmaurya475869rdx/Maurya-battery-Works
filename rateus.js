/* =========================================================
   Rate Us page logic

   Order of checks on submit (deliberately in this order):
   1. Already permanently blocked (any name, same device)  -> plain notice, NO siren
   2. Already submitted 3x today (same device)              -> plain notice, NO siren
   3. Contains a word from the Bad Words list                -> siren + permanent block, not saved
   4. Otherwise                                               -> saved, shown at the top of the list
   ========================================================= */

let selectedStars = 0;
let myFingerprint = null;

/* ---------- star picker ---------- */
const starSpans = document.querySelectorAll("#starPicker span");
starSpans.forEach((span) => {
  span.addEventListener("click", () => {
    selectedStars = parseInt(span.dataset.star, 10);
    starSpans.forEach((s) => {
      s.classList.toggle("selected", parseInt(s.dataset.star, 10) <= selectedStars);
    });
  });
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

/* ---------- shared audio/vibration helpers (own copy — this page
   doesn't load admin.js) ---------- */
let __rateusAudioSource = null;
async function playAudioFromUrl(url) {
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
    __rateusAudioSource = source;
  } catch (e) { /* audio blocked or file missing — the visual still shows */ }
}

function vibrateOnce() {
  if (!navigator.vibrate) return;
  navigator.vibrate([300, 150, 300, 150, 300]); // one firm pattern — not repeating
}

/* ---------- the three outcome screens ---------- */
function showNotice(message) {
  document.getElementById("rateusForm").classList.add("hidden");
  const notice = document.getElementById("rateusNotice");
  notice.textContent = message;
  notice.classList.remove("hidden");
}

function showAbuseAlert() {
  document.getElementById("rateusForm").classList.add("hidden");
  document.getElementById("rateusAbuseAlert").classList.remove("hidden");
  db.collection("settings").doc("feedback").get().then((doc) => {
    const url = doc.exists ? doc.data().abuseSirenUrl : "";
    playAudioFromUrl(url); // if no custom sound uploaded yet, this just does nothing — still fully silent-safe
  });
  vibrateOnce();
}

async function showCelebration() {
  const doc = await db.collection("settings").doc("feedback").get();
  const d = doc.exists ? doc.data() : {};
  const text = d.thankYouText || "Thank you for your feedback!";
  let seconds = d.animationSeconds || 5;
  if (seconds < 2) seconds = 2;
  if (seconds > 15) seconds = 15;

  document.getElementById("rateusThankYouText").textContent = text;

  const overlay = document.getElementById("rateusCelebrate");
  const fallWrap = document.getElementById("rateusFallWrap");
  fallWrap.innerHTML = "";
  const emojis = ["⭐", "🌸", "✨", "🌼", "💛"];
  for (let i = 0; i < 34; i++) {
    const span = document.createElement("span");
    span.className = "fall-particle";
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    span.style.left = Math.random() * 100 + "%";
    span.style.fontSize = (1.1 + Math.random() * 1.3) + "rem";
    span.style.animationDuration = (seconds * 0.55 + Math.random() * seconds * 0.55) + "s";
    span.style.animationDelay = (Math.random() * seconds * 0.35) + "s";
    fallWrap.appendChild(span);
  }

  overlay.classList.remove("hidden");
  if (d.celebrationAudioUrl) playAudioFromUrl(d.celebrationAudioUrl);

  setTimeout(() => {
    overlay.classList.add("hidden");
    fallWrap.innerHTML = "";
    showPlainThanks();
  }, seconds * 1000);
}

function showPlainThanks() {
  document.getElementById("rateusForm").classList.add("hidden");
  const notice = document.getElementById("rateusNotice");
  notice.textContent = "Thank you for sharing your feedback — we appreciate it.";
  notice.classList.remove("hidden");
}

/* ---------- pre-checks (run once on page load, before showing the form) ---------- */
async function checkAccessAndInit() {
  myFingerprint = getDeviceFingerprint();
  try {
    const blockDoc = await db.collection("feedback_blocks").doc(myFingerprint).get();
    if (blockDoc.exists && blockDoc.data().permanentlyBlocked) {
      showNotice("Your feedback submission has been permanently blocked.");
      return;
    }
    const limitId = myFingerprint + "_" + todayKey();
    const limitDoc = await db.collection("review_daily_limits").doc(limitId).get();
    if (limitDoc.exists && (limitDoc.data().count || 0) >= 3) {
      showNotice("You have already submitted your feedback today.");
      return;
    }
  } catch (e) {
    // Couldn't reach Firestore to check — fail OPEN so a network hiccup never
    // locks out a genuine customer. The submit handler re-checks anyway.
  }
  document.getElementById("rateusForm").classList.remove("hidden");
}

/* ---------- form submit ---------- */
document.getElementById("rateusForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("rateusFormStatus");
  statusEl.textContent = "";

  if (selectedStars < 1) { statusEl.textContent = "Please select a star rating."; return; }
  const name = document.getElementById("rateusName").value.trim();
  const address = document.getElementById("rateusAddress").value.trim();
  const description = document.getElementById("rateusDescription").value.trim();
  if (!name) { statusEl.textContent = "Please enter your name."; return; }
  if (!address) { statusEl.textContent = "Please enter your address."; return; }

  const submitBtn = document.querySelector("#rateusForm button[type=submit]");
  submitBtn.disabled = true;
  statusEl.textContent = "Submitting...";

  try {
    const fp = myFingerprint || getDeviceFingerprint();

    // Re-check 1: already permanently blocked
    const blockDoc = await db.collection("feedback_blocks").doc(fp).get();
    if (blockDoc.exists && blockDoc.data().permanentlyBlocked) {
      showNotice("Your feedback submission has been permanently blocked.");
      return;
    }

    // Re-check 2: daily limit
    const limitId = fp + "_" + todayKey();
    const limitRef = db.collection("review_daily_limits").doc(limitId);
    const limitDoc = await limitRef.get();
    const countSoFar = limitDoc.exists ? (limitDoc.data().count || 0) : 0;
    if (countSoFar >= 3) {
      showNotice("You have already submitted your feedback today.");
      return;
    }

    // Check 3: bad words (whole-word match, case-insensitive)
    const badWordsDoc = await db.collection("settings").doc("bad_words").get();
    const badWords = badWordsDoc.exists ? (badWordsDoc.data().words || []) : [];
    const combinedText = (name + " " + description).toLowerCase();
    const hitWord = badWords.find((w) => {
      if (!w) return false;
      try {
        const re = new RegExp("\\b" + w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
        return re.test(combinedText);
      } catch (e) { return false; }
    });

    if (hitWord) {
      await db.collection("feedback_blocks").doc(fp).set({
        permanentlyBlocked: true,
        blockedContent: description || name,
        name: name,
        blockedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showAbuseAlert();
      return;
    }

    // All clear — save. Address goes in a SEPARATE, admin-only-readable
    // document so it never travels to the public page, even in the raw
    // network response — see README for why this matters.
    const reviewRef = db.collection("reviews").doc();
    await reviewRef.set({
      name: name,
      stars: selectedStars,
      description: description,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection("reviews_private").doc(reviewRef.id).set({ address: address });
    await limitRef.set({
      count: firebase.firestore.FieldValue.increment(1),
      lastAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await db.collection("settings").doc("feedback").set(
      { totalReviews: firebase.firestore.FieldValue.increment(1) }, { merge: true }
    );

    if (selectedStars >= 4) {
      showCelebration();
    } else {
      showPlainThanks();
    }
  } catch (err) {
    statusEl.textContent = "Something went wrong. Please try again.";
    submitBtn.disabled = false;
  }
});

/* ---------- public review list (last 20, 5 at a time) ---------- */
let allPublicReviews = [];
let visibleCount = 5;

function renderPublicReviews() {
  const wrap = document.getElementById("rateusList");
  const toShow = allPublicReviews.slice(0, visibleCount);
  if (!toShow.length) {
    wrap.innerHTML = '<p class="empty-msg">No reviews yet — be the first to share your experience!</p>';
  } else {
    wrap.innerHTML = toShow.map((r) => {
      const when = r.createdAt && r.createdAt.toDate
        ? r.createdAt.toDate().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })
        : "";
      const stars = "★".repeat(r.stars || 0) + "☆".repeat(5 - (r.stars || 0));
      const reply = r.ownerReply
        ? `<div class="owner-reply"><strong>Shop's reply:</strong> ${escapeHtml(r.ownerReply)}</div>`
        : "";
      return `<div class="review-card">
        <span class="review-stars">${stars}</span>
        <p class="review-name">${escapeHtml(r.name)}</p>
        ${r.description ? `<p class="review-desc">${escapeHtml(r.description)}</p>` : ""}
        <p class="review-date">${when}</p>
        ${reply}
      </div>`;
    }).join("");
  }
  const moreBtn = document.getElementById("rateusMoreBtn");
  if (visibleCount < allPublicReviews.length) moreBtn.classList.remove("hidden");
  else moreBtn.classList.add("hidden");
}

document.getElementById("rateusMoreBtn").addEventListener("click", () => {
  visibleCount = Math.min(visibleCount + 5, 20);
  renderPublicReviews();
});

function loadReviews() {
  db.collection("reviews").orderBy("createdAt", "desc").limit(20).onSnapshot((snap) => {
    allPublicReviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPublicReviews();
  }, () => {
    document.getElementById("rateusList").innerHTML = '<p class="empty-msg">Couldn\u2019t load reviews right now.</p>';
  });
}

function loadTotalCount() {
  db.collection("settings").doc("feedback").onSnapshot((doc) => {
    const total = doc.exists ? (doc.data().totalReviews || 0) : 0;
    document.getElementById("rateusTotalCount").textContent = "Total feedback received: " + total;
  });
}

checkAccessAndInit();
loadReviews();
loadTotalCount();
