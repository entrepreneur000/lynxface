/* script.js — LynxFace (Browser-only, Free, TFJS)
 * No MediaPipe Tasks/WASM; uses tfjs + face-landmarks-detection (mediapipe_face_mesh, runtime=tfjs)
 * Safe for VSCode TypeScript checker (no re-declarations / syntax glitches)
 */

(function () {
    "use strict";
  
    // --------- GLOBALS ----------
    var faceModel = null;
    var currentImageUrl = null;
    var cameraStream = null;
  
    // --------- DOM READY ----------
    document.addEventListener("DOMContentLoaded", function () {
      initAnalyzeUI();
      loadTfjsModelInBackground();
    });
  
    // --------- ELEMENT HELPERS ----------
    function byId(id) {
      return document.getElementById(id);
    }
  
    function showError(msg) {
      var box = byId("error-message");
      var t = byId("error-text");
      if (t) t.textContent = msg || "Unexpected error.";
      if (box) box.classList.remove("hidden");
    }
  
    function hideError() {
      var box = byId("error-message");
      if (box) box.classList.add("hidden");
    }
  
    function showLoading(on) {
      var s = byId("loading-state");
      if (!s) return;
      if (on) s.classList.remove("hidden");
      else s.classList.add("hidden");
    }
  
    // --------- TFJS MODEL LOAD ----------
    async function loadTfjsModelInBackground() {
      try {
        // Prefer WebGL if available, else fallback to CPU
        try {
          await tf.setBackend("webgl");
        } catch (e) {
          await tf.setBackend("cpu");
        }
        await tf.ready();
  
        faceModel = await faceLandmarksDetection.load(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          { runtime: "tfjs", maxFaces: 1, refineLandmarks: true }
        );
  
        var analyzeBtn = byId("analyze-btn");
        if (analyzeBtn) analyzeBtn.disabled = false;
        // Optional: console log
        // console.log("[LynxFace] TFJS face model ready");
      } catch (err) {
        // console.error("[LynxFace] TFJS model load error:", err);
        showError("Failed to load AI model. Please open the page over HTTPS and refresh.");
      }
    }
  
    // --------- UI INIT ----------
    function initAnalyzeUI() {
      var dropZone = byId("drop-zone");
      var fileInput = byId("file-input");
      var uploadBtn = byId("upload-btn");
      var urlBtn = byId("url-btn");
      var urlInput = byId("url-input");
      var analyzeBtn = byId("analyze-btn");
      var resetBtn = byId("reset-btn");
  
      if (dropZone) {
        dropZone.addEventListener("dragover", function (e) {
          e.preventDefault();
          dropZone.classList.add("border-cyan-500", "bg-gray-50");
        });
        dropZone.addEventListener("dragleave", function () {
          dropZone.classList.remove("border-cyan-500", "bg-gray-50");
        });
        dropZone.addEventListener("drop", function (e) {
          e.preventDefault();
          dropZone.classList.remove("border-cyan-500", "bg-gray-50");
          var f = e.dataTransfer.files && e.dataTransfer.files[0];
          if (f && f.type && f.type.indexOf("image/") === 0) {
            loadImageFromFile(f);
          }
        });
      }
  
      if (uploadBtn && fileInput) {
        uploadBtn.addEventListener("click", function () {
          fileInput.click();
        });
        fileInput.addEventListener("change", function (e) {
          var f = e.target.files && e.target.files[0];
          if (f) loadImageFromFile(f);
        });
      }
  
      if (urlBtn && urlInput) {
        urlBtn.addEventListener("click", async function () {
          var url = (urlInput.value || "").trim();
          if (!url) return;
          hideError();
          showLoading(true);
          try {
            var resp = await fetch(url, { mode: "cors" });
            var blob = await resp.blob();
            // convert Blob to File-like for name/type
            var f = new File([blob], "image-from-url" + guessExtFromType(blob.type), { type: blob.type });
            await loadImageFromFile(f);
          } catch (e) {
            showError("Failed to load image from URL. Please check the link and CORS.");
          } finally {
            showLoading(false);
          }
        });
      }
  
      initCamera();
  
      if (analyzeBtn) {
        analyzeBtn.addEventListener("click", function () {
          performAnalysis();
        });
      }
  
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          resetUI();
        });
      }
    }
  
    function guessExtFromType(mime) {
      if (!mime) return ".jpg";
      if (mime.indexOf("png") >= 0) return ".png";
      if (mime.indexOf("webp") >= 0) return ".webp";
      if (mime.indexOf("jpeg") >= 0 || mime.indexOf("jpg") >= 0) return ".jpg";
      return ".jpg";
    }
  
    function resetUI() {
      var fileInput = byId("file-input");
      var urlInput = byId("url-input");
      if (currentImageUrl) {
        try { URL.revokeObjectURL(currentImageUrl); } catch (e) {}
        currentImageUrl = null;
      }
      if (fileInput) fileInput.value = "";
      if (urlInput) urlInput.value = "";
  
      var img = byId("preview-image");
      if (img) img.src = "";
  
      var overlay = byId("overlay-canvas");
      if (overlay) {
        var ctx = overlay.getContext("2d");
        ctx.clearRect(0, 0, overlay.width || 0, overlay.height || 0);
      }
  
      var previewSection = byId("preview-section");
      var metricsSection = byId("metrics-section");
      if (previewSection) previewSection.classList.add("hidden");
      if (metricsSection) metricsSection.classList.add("hidden");
      hideError();
    }
  
    // --------- CAMERA ----------
    function initCamera() {
      var cameraBtn = byId("camera-btn");
      var cameraModal = byId("camera-modal");
      var cameraVideo = byId("camera-video");
      var cameraCanvas = byId("camera-canvas");
      var captureBtn = byId("capture-btn");
      var cancelCamera = byId("cancel-camera");
      var closeCamera = byId("close-camera");
  
      function stopStream() {
        if (cameraStream) {
          var tracks = cameraStream.getTracks();
          for (var i = 0; i < tracks.length; i++) tracks[i].stop();
          cameraStream = null;
        }
      }
  
      if (cameraBtn) {
        cameraBtn.addEventListener("click", async function () {
          hideError();
          try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            if (cameraVideo) cameraVideo.srcObject = cameraStream;
            if (cameraModal) cameraModal.classList.remove("hidden");
          } catch (e) {
            showError("Failed to access camera. Please allow camera permission.");
          }
        });
      }
  
      if (captureBtn && cameraVideo && cameraCanvas) {
        captureBtn.addEventListener("click", function () {
          cameraCanvas.width = cameraVideo.videoWidth || 640;
          cameraCanvas.height = cameraVideo.videoHeight || 480;
          var ctx = cameraCanvas.getContext("2d");
          ctx.drawImage(cameraVideo, 0, 0);
          cameraCanvas.toBlob(async function (blob) {
            if (!blob) return;
            var f = new File([blob], "camera.jpg", { type: "image/jpeg" });
            await loadImageFromFile(f);
            stopStream();
            if (cameraModal) cameraModal.classList.add("hidden");
          }, "image/jpeg", 0.95);
        });
      }
  
      if (cancelCamera) {
        cancelCamera.addEventListener("click", function () {
          stopStream();
          if (cameraModal) cameraModal.classList.add("hidden");
        });
      }
      if (closeCamera) {
        closeCamera.addEventListener("click", function () {
          stopStream();
          if (cameraModal) cameraModal.classList.add("hidden");
        });
      }
    }
  
    // --------- IMAGE IO ----------
    async function loadImageFromFile(file) {
      hideError();
      var stripped = await stripExif(file);
      var resized = await resizeImage(stripped, 1024);
  
      try {
        if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
      } catch (e) {}
  
      currentImageUrl = URL.createObjectURL(resized);
  
      var img = byId("preview-image");
      if (!img) return;
  
      img.onload = function () {
        // sync overlay size
        var c = byId("overlay-canvas");
        if (!c) return;
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        // CSS size will be controlled by layout; canvas drawing uses natural size
        var ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
      };
  
      img.src = currentImageUrl;
  
      var previewSection = byId("preview-section");
      var metricsSection = byId("metrics-section");
      if (previewSection) previewSection.classList.remove("hidden");
      if (metricsSection) metricsSection.classList.add("hidden");
    }
  
    async function resizeImage(file, maxSide) {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function (e) {
          var img = new Image();
          img.onload = function () {
            var w = img.width;
            var h = img.height;
            if (w > maxSide || h > maxSide) {
              if (w > h) {
                h = Math.round(h / w * maxSide);
                w = maxSide;
              } else {
                w = Math.round(w / h * maxSide);
                h = maxSide;
              }
            }
            var cvs = document.createElement("canvas");
            cvs.width = w;
            cvs.height = h;
            var ctx = cvs.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            cvs.toBlob(function (b) {
              if (!b) {
                resolve(file);
                return;
              }
              var out = new File([b], file.name || "image.jpg", { type: file.type || "image/jpeg" });
              resolve(out);
            }, file.type || "image/jpeg", 0.92);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
  
    async function stripExif(file) {
      // re-encode via canvas to drop metadata and EXIF orientation glitches
      return new Promise(function (resolve) {
        var r = new FileReader();
        r.onload = function (e) {
          var img = new Image();
          img.onload = function () {
            var cvs = document.createElement("canvas");
            cvs.width = img.width;
            cvs.height = img.height;
            var ctx = cvs.getContext("2d");
            ctx.drawImage(img, 0, 0);
            cvs.toBlob(function (b) {
              if (!b) {
                resolve(file);
                return;
              }
              var out = new File([b], file.name || "image.jpg", { type: file.type || "image/jpeg" });
              resolve(out);
            }, file.type || "image/jpeg");
          };
          img.src = e.target.result;
        };
        r.readAsDataURL(file);
      });
    }
  
    function checkImageBrightness(img) {
      // quick exposure check for UX
      var cvs = document.createElement("canvas");
      cvs.width = img.naturalWidth || 1;
      cvs.height = img.naturalHeight || 1;
      var ctx = cvs.getContext("2d");
      ctx.drawImage(img, 0, 0);
      var data = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
      var sum = 0;
      var pixels = data.length / 4;
      var i;
      for (i = 0; i < data.length; i += 4) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      return sum / (pixels || 1);
    }
  
    // --------- ANALYSIS ----------
    async function performAnalysis() {
      var img = byId("preview-image");
      var analyzeBtn = byId("analyze-btn");
      if (!img || !img.src) {
        showError("Please select an image first.");
        return;
      }
      if (!faceModel) {
        showError("Model not loaded yet. Please wait a moment.");
        return;
      }
  
      hideError();
      showLoading(true);
      if (analyzeBtn) analyzeBtn.disabled = true;
  
      try {
        var preds = await faceModel.estimateFaces({ input: img, flipHorizontal: false });
        showLoading(false);
  
        if (!preds || preds.length === 0) {
          showError("No face detected. Use frontal photo with good lighting.");
          if (analyzeBtn) analyzeBtn.disabled = false;
          return;
        }
  
        var lm = preds[0].keypoints; // pixel coords
        var bright = checkImageBrightness(img);
        if (bright < 50) {
          showError("Image is too dark. Improve lighting and try again.");
          if (analyzeBtn) analyzeBtn.disabled = false;
          return;
        }
        if (bright > 200) {
          showError("Image is too bright. Reduce exposure and try again.");
          if (analyzeBtn) analyzeBtn.disabled = false;
          return;
        }
  
        drawOverlay(lm);
  
        var genderEl = document.querySelector('input[name="gender"]:checked');
        var gender = genderEl ? genderEl.value : "male";
        var metrics = calculateMetrics(lm, img.naturalWidth || 1, img.naturalHeight || 1, gender);
        displayMetrics(metrics);
  
        if (analyzeBtn) analyzeBtn.disabled = false;
      } catch (err) {
        // console.error("[LynxFace] analysis error:", err);
        showLoading(false);
        if (analyzeBtn) analyzeBtn.disabled = false;
        showError("Analysis failed: " + (err && err.message ? err.message : "Unknown error"));
      }
    }
  
    function drawOverlay(landmarks) {
      var c = byId("overlay-canvas");
      if (!c) return;
      var ctx = c.getContext("2d");
      var w = c.width || 0;
      var h = c.height || 0;
  
      ctx.clearRect(0, 0, w, h);
  
      // Points
      ctx.fillStyle = "rgba(0, 255, 0, 0.6)";
      var i;
      for (i = 0; i < landmarks.length; i++) {
        var p = landmarks[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
  
      // Helper lines
      ctx.lineWidth = 2;
  
      // Midline (168-152 approx)
      var midTop = landmarks[168];
      var chin = landmarks[152];
      if (midTop && chin) {
        ctx.strokeStyle = "rgba(0, 255, 224, 0.9)";
        ctx.beginPath();
        ctx.moveTo(midTop.x, midTop.y);
        ctx.lineTo(chin.x, chin.y);
        ctx.stroke();
      }
  
      // Eye line (33-263)
      var eyeL = landmarks[33];
      var eyeR = landmarks[263];
      if (eyeL && eyeR) {
        ctx.strokeStyle = "rgba(0, 255, 224, 0.9)";
        ctx.beginPath();
        ctx.moveTo(eyeL.x, eyeL.y);
        ctx.lineTo(eyeR.x, eyeR.y);
        ctx.stroke();
      }
  
      // Thirds using 10 (forehead), 1 (nose tip), 152 (chin)
      var topF = landmarks[10];
      var noseTip = landmarks[1];
      if (topF && chin) {
        var y1 = topF.y;
        var y3 = chin.y;
        var t1 = y1 + (y3 - y1) / 3;
        var t2 = y1 + 2 * (y3 - y1) / 3;
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(255, 200, 0, 0.9)";
        ctx.beginPath();
        ctx.moveTo(0, t1);
        ctx.lineTo(w, t1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, t2);
        ctx.lineTo(w, t2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
  
      // Pupils line (468-473)
      var lp = landmarks[468];
      var rp = landmarks[473];
      if (lp && rp) {
        ctx.strokeStyle = "rgba(255, 100, 100, 0.9)";
        ctx.beginPath();
        ctx.moveTo(lp.x, lp.y);
        ctx.lineTo(rp.x, rp.y);
        ctx.stroke();
      }
  
      // Nose width (98-327)
      var ln = landmarks[98];
      var rn = landmarks[327];
      if (ln && rn) {
        ctx.strokeStyle = "rgba(100, 255, 100, 0.9)";
        ctx.beginPath();
        ctx.moveTo(ln.x, ln.y);
        ctx.lineTo(rn.x, rn.y);
        ctx.stroke();
      }
  
      // Mouth width (61-291)
      var ml = landmarks[61];
      var mr = landmarks[291];
      if (ml && mr) {
        ctx.strokeStyle = "rgba(255, 150, 255, 0.9)";
        ctx.beginPath();
        ctx.moveTo(ml.x, ml.y);
        ctx.lineTo(mr.x, mr.y);
        ctx.stroke();
      }
    }
  
    // --------- METRICS ----------
    function distPx(a, b) {
      var dx = a.x - b.x;
      var dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }
  
    function clamp(n, lo, hi) {
      if (n < lo) return lo;
      if (n > hi) return hi;
      return n;
    }
  
    function calculateMetrics(lm, w, h, gender) {
      // Basic keypoints
      var lp = lm[468];
      var rp = lm[473];
      var ipd = (lp && rp) ? distPx(lp, rp) : 1;
  
      var li = lm[133];
      var ri = lm[362];
      var icd = (li && ri) ? distPx(li, ri) : 0;
      var icdRatio = ipd > 0 ? (icd / ipd) : 0;
  
      var cheekL = lm[234];
      var cheekR = lm[454];
      var faceWidth = (cheekL && cheekR) ? distPx(cheekL, cheekR) : 1;
      var faceWidthRatio = ipd > 0 ? (faceWidth / ipd) : 0;
  
      var chin = lm[152];
      var fTop = lm[10];
      var faceHeight = (fTop && chin) ? distPx(fTop, chin) : 1;
      var faceHeightRatio = ipd > 0 ? (faceHeight / ipd) : 0;
  
      // symmetry roughness
      var pairs = [[33, 263], [61, 291], [234, 454], [199, 429], [70, 300], [50, 280]];
      var symmetryErrorSum = 0;
      var pxMid = w / 2;
      var idx;
      for (idx = 0; idx < pairs.length; idx++) {
        var a = lm[pairs[idx][0]];
        var b = lm[pairs[idx][1]];
        if (a && b) {
          var ld = Math.abs(a.x - pxMid);
          var rd = Math.abs((w - b.x) - pxMid);
          symmetryErrorSum += Math.abs(ld - rd) / (w || 1);
        }
      }
      var symmetryScore = (symmetryErrorSum / Math.max(1, pairs.length)) * 100;
  
      // canthal tilt
      var lo = lm[33];
      var ro = lm[263];
      var leftTilt = 0;
      var rightTilt = 0;
      if (lo && li) {
        leftTilt = Math.atan2((lo.y - li.y), (lo.x - li.x)) * (180 / Math.PI);
      }
      if (ri && ro) {
        rightTilt = Math.atan2((ri.y - ro.y), (ri.x - ro.x)) * (180 / Math.PI);
      }
      var canthalTilt = (leftTilt + rightTilt) / 2;
  
      // brow-eye distance
      var brow = lm[70];
      var eye = lm[159];
      var browEyeDist = (brow && eye && ipd > 0) ? (distPx(brow, eye) / ipd) : 0;
  
      // nose sizes
      var ln = lm[98];
      var rn = lm[327];
      var nasalWidth = (ln && rn && ipd > 0) ? (distPx(ln, rn) / ipd) : 0;
  
      var noseTip = lm[1];
      var noseBridge = lm[6];
      var nasalLength = (noseTip && noseBridge && ipd > 0) ? (distPx(noseTip, noseBridge) / ipd) : 0;
  
      // mouth width
      var mouthL = lm[61];
      var mouthR = lm[291];
      var mouthWidth = (mouthL && mouthR && ipd > 0) ? (distPx(mouthL, mouthR) / ipd) : 0;
  
      // lip ratio (upper/lower thickness proxy)
      var up = lm[13];
      var lw = lm[14];
      var upRef = lm[0];
      var lwRef = lm[17];
      var upperLipThickness = (up && upRef) ? Math.abs(up.y - upRef.y) : 0.0001;
      var lowerLipThickness = (lw && lwRef) ? Math.abs(lw.y - lwRef.y) : 0.0001;
      var lipRatio = upperLipThickness / Math.max(1, lowerLipThickness);
  
      // jaw & ratios
      var leftJaw = lm[172];
      var rightJaw = lm[397];
      var bigonial = (leftJaw && rightJaw) ? distPx(leftJaw, rightJaw) : 1;
      var bizyBigonialRatio = faceWidth / Math.max(1, bigonial);
  
      var chinTip = chin || lm[152];
      var chinHeight = (chinTip && lm[200] && ipd > 0) ? (distPx(chinTip, lm[200]) / ipd) : 0;
      var chinWidth = ipd > 0 ? (bigonial / ipd) : 0;
      var chinProjection = (chinTip) ? (Math.abs(chinTip.x - (w / 2)) / Math.max(1, ipd)) : 0;
  
      // gonial angle (approx using cheekL-leftJaw and chinTip-leftJaw)
      var gonialAngle = 0;
      if (cheekL && leftJaw && chinTip) {
        var dx1 = (cheekL.x - leftJaw.x);
        var dy1 = (cheekL.y - leftJaw.y);
        var dx2 = (chinTip.x - leftJaw.x);
        var dy2 = (chinTip.y - leftJaw.y);
        var dot = dx1 * dx2 + dy1 * dy2;
        var m1 = Math.hypot(dx1, dy1);
        var m2 = Math.hypot(dx2, dy2);
        if (m1 > 0 && m2 > 0) {
          gonialAngle = Math.acos(clamp(dot / (m1 * m2), -1, 1)) * (180 / Math.PI);
        }
      }
  
      var ramusHeight = (cheekL && leftJaw && ipd > 0) ? (distPx(cheekL, leftJaw) / ipd) : 0;
  
      var eyebrowLine = lm[8];
      var upperThird = (fTop && eyebrowLine) ? distPx(fTop, eyebrowLine) : 0;
      var midThird = (eyebrowLine && noseTip) ? distPx(eyebrowLine, noseTip) : 0;
      var lowerThird = (noseTip && chinTip) ? distPx(noseTip, chinTip) : 0;
      var totalThirds = upperThird + midThird + lowerThird;
      var upperRatio = totalThirds > 0 ? (upperThird / totalThirds) : 0;
      var midRatio = totalThirds > 0 ? (midThird / totalThirds) : 0;
      var lowerRatio = totalThirds > 0 ? (lowerThird / totalThirds) : 0;
  
      var facialIndex = faceHeight / Math.max(1, faceWidth);
  
      var glabella = lm[8];
      var subnasale = lm[2];
      var a1 = 0;
      var a2 = 0;
      if (glabella && subnasale) {
        a1 = Math.atan2((subnasale.y - glabella.y), (subnasale.x - glabella.x));
      }
      if (subnasale && chinTip) {
        a2 = Math.atan2((chinTip.y - subnasale.y), (chinTip.x - subnasale.x));
      }
      var facialConvexity = (a2 - a1) * (180 / Math.PI);
  
      // Harmony summary factors (declare once!)
      var harmonyFactors = [];
      if (symmetryScore <= 5) harmonyFactors.push("excellent facial symmetry");
      else if (symmetryScore <= 10) harmonyFactors.push("good symmetry");
  
      if (Math.abs(upperRatio - midRatio) < 0.05 && Math.abs(midRatio - lowerRatio) < 0.05) {
        harmonyFactors.push("well-balanced facial thirds");
      }
      if (canthalTilt > 2 && canthalTilt < 8) {
        harmonyFactors.push("ideal canthal tilt");
      }
      if (bizyBigonialRatio >= 1.3 && bizyBigonialRatio <= 1.6) {
        harmonyFactors.push("balanced cheek-to-jaw ratio");
      }
  
      var harmonyText;
      if (harmonyFactors.length > 0) {
        var ht = "This face shows " + harmonyFactors.slice(0, 2).join(" and ") + ". ";
        ht += (symmetryScore > 10)
          ? "Minor asymmetries are natural and common."
          : "Overall proportions appear harmonious.";
        harmonyText = ht;
      } else {
        harmonyText = "Facial proportions show natural variation. All measurements are within normal ranges.";
      }
  
      // Overall score (entertainment)
      var attractivenessScore = 75;
      if (symmetryScore <= 5) attractivenessScore += 8;
      else if (symmetryScore <= 10) attractivenessScore += 4;
      else if (symmetryScore > 15) attractivenessScore -= 8;
  
      if (canthalTilt >= 2 && canthalTilt <= 8) attractivenessScore += 4;
      if (Math.abs(upperRatio - midRatio) < 0.05 && Math.abs(midRatio - lowerRatio) < 0.05) attractivenessScore += 3;
  
      if (gender === "male") {
        if (bizyBigonialRatio >= 1.35 && bizyBigonialRatio <= 1.55) attractivenessScore += 4;
        var jawlineSharpnessVal = Math.min(1, bigonial / Math.max(1, faceWidth));
        if (jawlineSharpnessVal >= 0.75) attractivenessScore += 3;
        if (gonialAngle >= 120 && gonialAngle <= 130) attractivenessScore += 2;
      } else {
        if (bizyBigonialRatio >= 1.3 && bizyBigonialRatio <= 1.5) attractivenessScore += 4;
        if (lipRatio >= 0.9 && lipRatio <= 1.1) attractivenessScore += 2;
        if (canthalTilt >= 3 && canthalTilt <= 7) attractivenessScore += 2;
      }
      attractivenessScore = Math.round(clamp(attractivenessScore, 55, 98));
  
      return {
        ipd: { value: ipd.toFixed(2), unit: "px" },
        icdRatio: icdRatio.toFixed(3),
        faceWidthRatio: faceWidthRatio.toFixed(2),
        faceHeightRatio: faceHeightRatio.toFixed(2),
        symmetryScore: symmetryScore.toFixed(2),
        canthalTilt: canthalTilt.toFixed(2),
        browEyeDist: browEyeDist.toFixed(3),
        nasalWidth: nasalWidth.toFixed(3),
        nasalLength: nasalLength.toFixed(3),
        mouthWidth: mouthWidth.toFixed(3),
        lipRatio: lipRatio.toFixed(2),
        bizyBigonialRatio: bizyBigonialRatio.toFixed(2),
        chinHeight: chinHeight.toFixed(3),
        chinWidth: chinWidth.toFixed(3),
        chinProjection: chinProjection.toFixed(3),
        jawlineSharpness: Math.min(1, bigonial / Math.max(1, faceWidth)).toFixed(2),
        gonialAngle: gonialAngle.toFixed(1),
        ramusHeight: ramusHeight.toFixed(3),
        facialThirds: (
          (upperRatio * 100).toFixed(1) + "% / " +
          (midRatio * 100).toFixed(1) + "% / " +
          (lowerRatio * 100).toFixed(1) + "%"
        ),
        facialIndex: facialIndex.toFixed(2),
        facialConvexity: facialConvexity.toFixed(1),
        harmonyText: harmonyText,
        attractivenessScore: String(attractivenessScore),
        gender: gender
      };
    }
  
    // --------- METRICS RENDER ----------
    function displayMetrics(m) {
      var grid = byId("metrics-grid");
      var section = byId("metrics-section");
      if (!grid || !section) return;
      grid.innerHTML = "";
  
      var list = [
        { n: "IPD (Interpupillary Distance)", k: "ipd", v: (m.ipd.value + " " + m.ipd.unit) },
        { n: "ICD / IPD Ratio", k: "icdRatio", v: m.icdRatio },
        { n: "Face Width / IPD", k: "faceWidthRatio", v: m.faceWidthRatio },
        { n: "Face Height / IPD", k: "faceHeightRatio", v: m.faceHeightRatio },
        { n: "Symmetry Score", k: "symmetryScore", v: (m.symmetryScore + "%") },
        { n: "Canthal Tilt", k: "canthalTilt", v: (m.canthalTilt + "°") },
        { n: "Brow-Eye Distance", k: "browEyeDist", v: m.browEyeDist },
        { n: "Nasal Width", k: "nasalWidth", v: m.nasalWidth },
        { n: "Nasal Length", k: "nasalLength", v: m.nasalLength },
        { n: "Mouth Width", k: "mouthWidth", v: m.mouthWidth },
        { n: "Lip Ratio", k: "lipRatio", v: m.lipRatio },
        { n: "Bizygomatic : Bigonial", k: "bizyBigonialRatio", v: m.bizyBigonialRatio },
        { n: "Chin Height", k: "chinHeight", v: m.chinHeight },
        { n: "Chin Width", k: "chinWidth", v: m.chinWidth },
        { n: "Chin Projection", k: "chinProjection", v: m.chinProjection },
        { n: "Jawline Sharpness", k: "jawlineSharpness", v: m.jawlineSharpness },
        { n: "Gonial Angle", k: "gonialAngle", v: (m.gonialAngle + "°") },
        { n: "Ramus Height", k: "ramusHeight", v: m.ramusHeight },
        { n: "Facial Thirds (U/M/L)", k: "facialThirds", v: m.facialThirds },
        { n: "Facial Index", k: "facialIndex", v: m.facialIndex },
        { n: "Facial Convexity", k: "facialConvexity", v: (m.facialConvexity + "°") }
      ];
  
      var i;
      for (i = 0; i < list.length; i++) {
        var it = list[i];
        var tag = getTag(it.k, it.v);
        var note = getNoteForMetric(it.k);
        var card = document.createElement("div");
        card.className = "metric-card";
        card.innerHTML =
          '<div class="metric-title">' + it.n + '</div>' +
          '<div class="metric-value">' + it.v + '</div>' +
          '<span class="metric-tag ' + tag.className + '">' + tag.tag + '</span>' +
          '<div class="metric-note text-sm mt-1">' + note + '</div>';
        grid.appendChild(card);
      }
  
      var h = document.createElement("div");
      h.className = "metric-card";
      h.innerHTML =
        '<div class="metric-title">Overall Harmony Summary</div>' +
        '<div class="metric-note text-sm mt-2">' + m.harmonyText + '</div>';
      grid.appendChild(h);
  
      var a = document.createElement("div");
      a.className = "metric-card";
      var genderText = (m.gender === "male") ? "Male" : "Female";
      var scoreNum = parseFloat(m.attractivenessScore);
      var badgeClass = (scoreNum >= 80) ? "tag-ideal" : (scoreNum >= 70) ? "tag-good" : "tag-ok";
      a.innerHTML =
        '<div class="metric-title">Overall Beauty Score (' + genderText + ')</div>' +
        '<div class="metric-value">' + scoreNum + ' / 100</div>' +
        '<span class="metric-tag ' + badgeClass + '">Entertainment Only</span>' +
        '<div class="metric-note text-sm mt-1">Adjusted for ' + (m.gender === "male" ? "masculine" : "feminine") + ' features. For fun only.</div>';
      grid.appendChild(a);
  
      section.classList.remove("hidden");
    }
  
    function getTag(name, raw) {
      var v = parseFloat(String(raw).replace(/[^\d.-]/g, ""));
      if (name === "icdRatio") return choose(v, 0.30, 0.38, "Ideal", "tag-ideal", 0.26, 0.42, "Good", "tag-good");
      if (name === "faceWidthRatio") return choose(v, 4.5, 5.5, "Ideal", "tag-ideal", 4.0, 6.0, "Good", "tag-good", "OK", "tag-ok");
      if (name === "faceHeightRatio") return choose(v, 5.5, 6.5, "Ideal", "tag-ideal", 5.0, 7.0, "Good", "tag-good", "OK", "tag-ok");
      if (name === "symmetryScore") {
        if (v <= 5) return { tag: "Ideal", className: "tag-ideal" };
        if (v <= 10) return { tag: "Good", className: "tag-good" };
        if (v <= 15) return { tag: "OK", className: "tag-ok" };
        return { tag: "Needs attention", className: "tag-attention" };
      }
      if (name === "canthalTilt") return choose(v, 2, 8, "Good", "tag-good", -2, 12, "OK", "tag-ok", "Needs attention", "tag-attention");
      if (name === "browEyeDist") return choose(v, 0.15, 0.25, "Ideal", "tag-ideal", 0.12, 0.30, "Good", "tag-good", "OK", "tag-ok");
      if (name === "nasalWidth") return choose(v, 0.18, 0.25, "Ideal", "tag-ideal", 0.15, 0.30, "Good", "tag-good", "OK", "tag-ok");
      if (name === "nasalLength") return choose(v, 0.30, 0.40, "Ideal", "tag-ideal", 0.25, 0.45, "Good", "tag-good", "OK", "tag-ok");
      if (name === "mouthWidth") return choose(v, 0.50, 0.65, "Ideal", "tag-ideal", 0.45, 0.70, "Good", "tag-good", "OK", "tag-ok");
      if (name === "lipRatio") return choose(v, 0.80, 1.20, "Ideal", "tag-ideal", 0.60, 1.40, "Good", "tag-good", "OK", "tag-ok");
      if (name === "bizyBigonialRatio") return choose(v, 1.30, 1.60, "Ideal", "tag-ideal", 1.20, 1.70, "Good", "tag-good", "OK", "tag-ok");
      if (name === "jawlineSharpness") {
        if (v >= 0.75) return { tag: "Ideal", className: "tag-ideal" };
        if (v >= 0.60) return { tag: "Good", className: "tag-good" };
        if (v >= 0.45) return { tag: "OK", className: "tag-ok" };
        return { tag: "Needs attention", className: "tag-attention" };
      }
      if (name === "gonialAngle") return choose(v, 120, 130, "Ideal", "tag-ideal", 112, 140, "Good", "tag-good", "Needs attention", "tag-attention");
      if (name === "facialIndex") return choose(v, 1.10, 1.30, "Ideal", "tag-ideal", 1.00, 1.40, "Good", "tag-good", "OK", "tag-ok");
  
      return { tag: "OK", className: "tag-ok" };
    }
  
    function choose(v, a, b, tag1, cls1, c, d, tag2, cls2, tag3, cls3) {
      // primary window [a,b]
      if (v >= a && v <= b) return { tag: tag1, className: cls1 };
      // secondary window [c,d] (optional)
      if (typeof c === "number" && typeof d === "number" && typeof tag2 === "string" && typeof cls2 === "string") {
        if (v >= c && v <= d) return { tag: tag2, className: cls2 };
      }
      // fallback
      return { tag: (tag3 || "OK"), className: (cls3 || "tag-ok") };
    }
  
    function getNoteForMetric(name) {
      var notes = {
        ipd: "All ratios use IPD as scale.",
        icdRatio: "Centered spacing feel.",
        faceWidthRatio: "Broader values read wider.",
        faceHeightRatio: "Taller values read longer.",
        symmetryScore: "Lower is better; 0–5% looks balanced.",
        canthalTilt: "Slight positive tilt often reads lively.",
        browEyeDist: "Smaller = closer brows; larger = airier brow.",
        nasalWidth: "Width/length balance shapes midface.",
        nasalLength: "Width/length balance shapes midface.",
        mouthWidth: "Proportional width vs eyes.",
        lipRatio: "Fullness ratio near 1.0 looks balanced.",
        bizyBigonialRatio: "Cheek-to-jaw breadth balance.",
        chinHeight: "Projection adds definition.",
        chinWidth: "Projection adds definition.",
        chinProjection: "Projection adds definition.",
        jawlineSharpness: "Higher looks crisper.",
        gonialAngle: "Jaw corner openness.",
        ramusHeight: "Verticality near ear-jaw region.",
        facialThirds: "Even thirds read harmonious.",
        facialIndex: "Higher = longer; lower = broader.",
        facialConvexity: "Midface-to-chin curvature feel."
      };
      return notes[name] || "";
    }
  
  })();
  