(function () {
  "use strict";

  var reduceMotion =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ */
  /* Count-up (easeOutCubic) — chạy một lần khi thẻ vào khung nhìn       */
  /* ------------------------------------------------------------------ */
  var stats = Array.prototype.slice.call(document.querySelectorAll(".stat"));

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function format(value, decimals) {
    return value.toFixed(decimals);
  }

  function runCount(stat, index) {
    var num = stat.querySelector(".num");
    if (!num) return;
    var target = parseFloat(stat.getAttribute("data-target"));
    var decimals = parseInt(stat.getAttribute("data-decimals") || "0", 10);
    if (!isFinite(target)) return;

    if (reduceMotion) {
      num.textContent = format(target, decimals);
      return;
    }

    var duration = 1500 + index * 80;
    var offset = 480 + index * 90;
    num.textContent = format(0, decimals);

    window.setTimeout(function () {
      var start = null;
      function tick(now) {
        if (start === null) start = now;
        var progress = Math.min(1, (now - start) / duration);
        num.textContent = format(target * easeOutCubic(progress), decimals);
        if (progress < 1) {
          window.requestAnimationFrame(tick);
        } else {
          num.textContent = format(target, decimals);
        }
      }
      window.requestAnimationFrame(tick);
    }, offset);
  }

  if (!reduceMotion) {
    // Đặt về 0 trước khi thẻ hiện ra (thẻ có độ trễ 0.5s+ nên không bị nháy).
    stats.forEach(function (stat) {
      var num = stat.querySelector(".num");
      var decimals = parseInt(stat.getAttribute("data-decimals") || "0", 10);
      if (num) num.textContent = format(0, decimals);
    });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          runCount(entry.target, stats.indexOf(entry.target));
        });
      },
      { threshold: 0.25 }
    );
    stats.forEach(function (stat) {
      observer.observe(stat);
    });
  } else {
    stats.forEach(runCount);
  }

  /* ------------------------------------------------------------------ */
  /* Mobile menu (≤720px)                                                */
  /* ------------------------------------------------------------------ */
  var burger = document.querySelector(".burger");
  var overlay = document.querySelector(".overlay");
  var menu = document.getElementById("mobile-menu");

  if (burger && overlay && menu) {
    var setOpen = function (open) {
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      overlay.hidden = !open;
      menu.hidden = !open;
      document.body.classList.toggle("menu-open", open);
    };

    var isOpen = function () {
      return burger.getAttribute("aria-expanded") === "true";
    };

    burger.addEventListener("click", function () {
      setOpen(!isOpen());
    });

    overlay.addEventListener("click", function () {
      setOpen(false);
    });

    menu.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.closest && target.closest("a")) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isOpen()) {
        setOpen(false);
        burger.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 720 && isOpen()) {
        setOpen(false);
      }
    });
  }

  /* Khi trình duyệt chặn tự phát (tiết kiệm pin) thì thử lại ở lần chạm đầu tiên. */
  var video = document.querySelector(".bg-video");
  if (video && !reduceMotion) {
    var attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(function () {
        var resume = function () {
          video.play().catch(function () {});
          document.removeEventListener("pointerdown", resume);
        };
        document.addEventListener("pointerdown", resume, { once: true });
      });
    }
  } else if (video && reduceMotion) {
    video.removeAttribute("autoplay");
    video.pause();
  }
})();
