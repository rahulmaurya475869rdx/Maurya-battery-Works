/* ---------------------------------------------------------
   Maurya Battery Works — lightweight device fingerprint

   Combines a canvas render + a WebGL renderer string + a few
   browser/device signals into one short ID that stays the same
   for the same browser on the same device across visits.

   Honest limits: this is a heuristic, not a paid fraud-detection
   service. Clearing site data, using a different browser, or a
   privacy-focused browser (which deliberately randomises canvas/
   WebGL output) can produce a new fingerprint. It's a solid extra
   layer, not an unbeatable one — same as most real-world anti-abuse
   systems at this scale.
   --------------------------------------------------------- */
function getDeviceFingerprint() {
  let canvasSig = "";
  try {
    const c = document.createElement("canvas");
    c.width = 220; c.height = 40;
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 220, 40);
    ctx.fillStyle = "#069";
    ctx.fillText("MBW-fp 8Xk!", 2, 2);
    canvasSig = c.toDataURL();
  } catch (e) {}

  let glSig = "";
  try {
    const c2 = document.createElement("canvas");
    const gl = c2.getContext("webgl") || c2.getContext("experimental-webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) glSig = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) + "|" + gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
    }
  } catch (e) {}

  const parts = [
    navigator.userAgent || "",
    navigator.language || "",
    String(screen.width) + "x" + String(screen.height) + "x" + String(screen.colorDepth),
    String(navigator.hardwareConcurrency || ""),
    (Intl.DateTimeFormat().resolvedOptions().timeZone || ""),
    navigator.platform || "",
    canvasSig,
    glSig
  ].join("::");

  // djb2 string hash — deterministic, fast, turns the long signal
  // string into a short Firestore-safe ID. Not cryptographic; doesn't
  // need to be for this use case.
  let hash = 5381;
  for (let i = 0; i < parts.length; i++) {
    hash = ((hash << 5) + hash) + parts.charCodeAt(i);
    hash = hash & hash;
  }
  return "fp_" + Math.abs(hash).toString(36) + "_" + parts.length.toString(36);
}

// Today's date as YYYY-MM-DD in the visitor's own local time — used as
// part of the daily-submission-limit document key on the Rate Us page.
function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
