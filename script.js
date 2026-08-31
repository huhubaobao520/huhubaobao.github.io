var utils = {
  $: function (sel, ctx) { return (ctx || document).querySelector(sel) },
  $$: function (sel, ctx) { return (ctx || document).querySelectorAll(sel) },
  on: function (el, ev, fn) { if (el) el.addEventListener(ev, fn) },

  debounce: function (fn, wait) {
    var timer = null
    return function () {
      var ctx = this, args = arguments
      clearTimeout(timer)
      timer = setTimeout(function () { fn.apply(ctx, args) }, wait)
    }
  },

  throttle: function (fn, interval) {
    var last = 0
    return function () {
      var now = Date.now()
      if (now - last >= interval) {
        last = now
        fn.apply(this, arguments)
      }
    }
  },

  safeJSON: function (str) {
    try { return JSON.parse(str) } catch (e) { return null }
  },

  css: function (el, props) {
    if (!el) return
    for (var k in props) { if (props.hasOwnProperty(k)) el.style[k] = props[k] }
  }
}

/* ========== 打字机 ========== */
;(function () {
  var phrases = [
    '没心没肺，快乐加倍',
    '开心快乐',
    '个人创作者',
  ]
  var el = document.getElementById('typewriter')
  if (!el) return

  var idx = 0, ci = 0, deleting = false

  function type() {
    var cur = phrases[idx]
    if (!cur) return
    if (deleting) {
      el.textContent = cur.substring(0, ci--)
      if (ci < 0) { deleting = false; idx = (idx + 1) % phrases.length; setTimeout(type, 500); return }
      setTimeout(type, 50)
    } else {
      el.textContent = cur.substring(0, ci++)
      if (ci > cur.length) { deleting = true; setTimeout(type, 1500); return }
      setTimeout(type, 100)
    }
  }
  type()
})()

/* ========== 页面切换 ========== */
;(function () {
  function switchTo(target) {
    var navs = utils.$$('.nav-entry')
    var pages = utils.$$('.stage')
    ;[].forEach.call(navs, function (n) { n.classList.remove('active') })
    ;[].forEach.call(pages, function (p) { p.classList.remove('active') })

    var btn = utils.$('.nav-entry[data-section="' + target + '"]')
    var page = document.getElementById('section-' + target)
    if (btn) btn.classList.add('active')
    if (page) page.classList.add('active')
    if (target === 'skills') animateSkillBars()
  }

  utils.on(utils.$('.page-nav'), 'click', function (e) {
    var btn = e.target.closest('.nav-entry')
    if (btn) switchTo(btn.dataset.section)
  })

  // CTA buttons
  utils.on(document.getElementById('learnMore'), 'click', function () {
    var btn = utils.$('.nav-entry[data-section="about"]')
    if (btn) btn.click()
  })
  utils.on(document.getElementById('contactMe'), 'click', function () {
    var btn = utils.$('.nav-entry[data-section="contact"]')
    if (btn) btn.click()
  })
})()

/* ========== 侧栏开关 ========== */
;(function () {
  var panel = document.getElementById('sidePanel')
  var toggle = document.getElementById('menuToggle')
  var overlay = document.getElementById('sidebarOverlay')
  if (!panel || !toggle) return

  function openMenu() {
    panel.classList.add('open')
    toggle.classList.add('open')
    if (overlay) overlay.classList.add('show')
    document.body.style.overflow = 'hidden'
  }
  function closeMenu() {
    panel.classList.remove('open')
    toggle.classList.remove('open')
    if (overlay) overlay.classList.remove('show')
    document.body.style.overflow = ''
  }

  toggle.addEventListener('click', function () {
    if (panel.classList.contains('open')) closeMenu()
    else openMenu()
  })

  if (overlay) overlay.addEventListener('click', closeMenu)

  // 点导航项后自动关（移动端）
  ;[].forEach.call(utils.$$('.nav-entry'), function (btn) {
    btn.addEventListener('click', function () {
      if (window.innerWidth <= 768) closeMenu()
    })
  })

  // 窗口 resize 恢复
  window.addEventListener('resize', function () {
    if (window.innerWidth > 768 && panel.classList.contains('open')) closeMenu()
  })
})()

/* ========== 技能条动画 ========== */
function animateSkillBars() {
  ;[].forEach.call(utils.$$('.skill-fill'), function (bar) {
    var w = bar.style.width
    bar.style.width = '0%'
    setTimeout(function () { bar.style.width = w }, 80)
  })
}

/* ========== 一言 ========== */
;(function () {
  var bodyEl = document.getElementById('quoteBody')
  var srcEl = document.getElementById('quoteSource')
  if (!bodyEl) return

  var xhr = new XMLHttpRequest()
  xhr.timeout = 8000

  xhr.onload = function () {
    if (xhr.status !== 200) { bodyEl.textContent = '—'; return }
    var data = utils.safeJSON(xhr.responseText)
    if (data && data.content) {
      bodyEl.textContent = data.content
      if (srcEl) srcEl.textContent = data.author || '佚名'
    } else {
      bodyEl.textContent = '—'
    }
  }

  xhr.onerror = function () { bodyEl.textContent = '—' }
  xhr.ontimeout = function () { bodyEl.textContent = '—' }
  xhr.send()
})()

/* ========== 音乐播放 & 可视化 ========== */
;(function () {
  var audio = document.getElementById('backgroundMusic')
  var toggle = document.getElementById('playerToggle')
  var vizCanvas = document.getElementById('musicViz')
  var vizSwitcher = document.getElementById('vizSwitcher')

  if (!audio || !toggle) return

  var ctx = null, analyser = null, source = null
  var animId = null, vizHidden = false, started = false
  var useFallback = false

  function initAudioCtx() {
    if (ctx) return
    try {
      var AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      ctx = new AC()
      analyser = ctx.createAnalyser()
      analyser.fftSize = 128

      source = ctx.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(ctx.destination)
    } catch (e) {
      useFallback = true
    }
  }

  function startViz() {
    if (!vizCanvas || animId) return
    var vctx = vizCanvas.getContext('2d')
    if (!vctx) return
    var w = vizCanvas.width, h = vizCanvas.height
    var count = 40, bw = (w - (count - 1) * 3) / count

    // fallback: synthetic bars if analyser unavailable
    var fakeData = []
    for (var i = 0; i < count; i++) fakeData.push(Math.random() * 30 + 10)
    var time = 0

    function draw() {
      animId = requestAnimationFrame(draw)
      vctx.clearRect(0, 0, w, h)
      time += 0.05

      for (var i = 0; i < count; i++) {
                var bh
        if (useFallback || !analyser) {
          // smooth synthetic animation
          fakeData[i] += (Math.random() - 0.5) * 8
          fakeData[i] = Math.max(5, Math.min(h * 0.9, fakeData[i]))
          // subtle wave
          var wave = Math.sin(time + i * 0.4) * 8
          bh = fakeData[i] + wave
          bh = Math.max(3, Math.min(h - 2, bh))
        } else {
          // real analyser
          var bufLen = analyser.frequencyBinCount
          var step = Math.floor(bufLen / count)
          var data = new Uint8Array(bufLen)
          analyser.getByteFrequencyData(data)
          var sum = 0
          for (var j = 0; j < step; j++) sum += data[i * step + j] || 0
          bh = (sum / step / 255) * h * 0.9
        }

        var hue = 190 + (i / count) * 60
        var grad = vctx.createLinearGradient(0, h, 0, h - bh)
        grad.addColorStop(0, 'hsla(' + (hue + 20) + ',80%,60%,0.6)')
        grad.addColorStop(1, 'hsla(' + hue + ',80%,65%,0.9)')
        vctx.fillStyle = grad
        vctx.fillRect(i * (bw + 3), h - bh, bw, bh)
      }
    }
    draw()
  }

  function stopViz() {
    if (animId) { cancelAnimationFrame(animId); animId = null }
    if (vizCanvas) {
      var vctx = vizCanvas.getContext('2d')
      if (vctx) vctx.clearRect(0, 0, vizCanvas.width, vizCanvas.height)
    }
  }

  toggle.addEventListener('click', function () {
    if (!audio.paused) {
      audio.pause()
      toggle.classList.remove('playing')
      stopViz()
      return
    }

    if (!started) {
      initAudioCtx()
      if (!ctx) useFallback = true
      started = true
    }

    audio.play().catch(function () { /* autoplay blocked */ })
    toggle.classList.add('playing')
    startViz()
  })

  // viz toggle
  if (vizSwitcher && vizCanvas) {
    vizSwitcher.addEventListener('click', function () {
      vizHidden = !vizHidden
      vizSwitcher.classList.toggle('active')
      vizCanvas.classList.toggle('hidden')
    })
  }

  audio.addEventListener('ended', function () {
    toggle.classList.remove('playing')
    stopViz()
  })

  window.addEventListener('beforeunload', function () {
    stopViz()
    if (ctx && ctx.state !== 'closed') ctx.close()
  })
})()

/* ========== 头像交互 ========== */
;(function () {
  var frame = utils.$('.avatar-frame')
  if (!frame) return
  utils.on(frame, 'click', function () {
    frame.style.transform = 'scale(0.9)'
    setTimeout(function () { frame.style.transform = 'scale(1.08)' }, 150)
    setTimeout(function () { frame.style.transform = '' }, 450)
  })
})()

/* ========== 侧栏头像 → 首页 ========== */
;(function () {
  var avatar = utils.$('.panel-avatar')
  if (!avatar) return
  utils.on(avatar, 'click', function () {
    var home = utils.$('.nav-entry[data-section="home"]')
    if (home) home.click()
  })
})()

/* ========== 作品集 3D 效果 ========== */
;(function () {
  var cards = utils.$$('.project-entry')
  ;[].forEach.call(cards, function (card) {
    utils.on(card, 'mousemove', utils.throttle(function (e) {
      var rect = card.getBoundingClientRect()
      var x = (e.clientX - rect.left) / rect.width - 0.5
      var y = (e.clientY - rect.top) / rect.height - 0.5
      card.style.transform = 'perspective(600px) rotateX(' + (-y * 6) + 'deg) rotateY(' + (x * 6) + 'deg) translateY(-4px)'
    }, 30))
    utils.on(card, 'mouseleave', function () { card.style.transform = '' })
        })
})()

/* ========== 页面可见性恢复 ========== */
;(function () {
  utils.on(document, 'visibilitychange', function () {
    if (document.hidden) return
    var active = utils.$('.stage.active')
    if (!active) return
    active.style.animation = 'none'
    void active.offsetHeight
    active.style.animation = ''
  })
})()

/* ========== 欢迎弹窗 ========== */
;(function () {
  if (sessionStorage.getItem('welcome')) return
  setTimeout(function () {
    var toast = document.createElement('div')
    toast.textContent = '👋 欢迎来到我的个人主页！'
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);padding:12px 24px;border-radius:50px;color:#fff;font-size:0.95rem;z-index:100;opacity:0;transition:opacity 0.5s ease;pointer-events:none;border:1px solid rgba(255,255,255,0.1)'
    document.body.appendChild(toast)
    requestAnimationFrame(function () { toast.style.opacity = '1' })
    setTimeout(function () {
      toast.style.opacity = '0'
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast) }, 500)
    }, 3000)
    sessionStorage.setItem('welcome', '1')
  }, 1500)
})()
// 作品集卡片轮播 - 修复版
window.addEventListener('load', function(){
  setTimeout(function(){
    const carousels = document.querySelectorAll('.item-carousel');
    if(carousels.length === 0){
      console.log("未找到轮播容器.item-carousel");
      return;
    }
    carousels.forEach(car => {
      const track = car.querySelector('.item-track');
      const slides = car.querySelectorAll('.item-slide');
      const prev = car.querySelector('.item-car-prev');
      const next = car.querySelector('.item-car-next');
      const dotBox = car.querySelector('.item-dots');
      let idx = 0;
      const total = slides.length;
      let timer = null;
      // 清空圆点容器重新生成
      dotBox.innerHTML = '';
      // 生成圆点
      for(let i = 0; i < total; i++){
        const dot = document.createElement('span');
        dot.dataset.index = i;
        if(i === 0) dot.classList.add('active');
        dotBox.appendChild(dot);
        dot.onclick = function(){
          idx = Number(this.dataset.index);
          updateSlider();
          resetTimer();
        }
      }
      const dots = dotBox.querySelectorAll('span');
      // 更新滑动位置+圆点
      function updateSlider(){
        track.style.transform = `translateX(-${idx * 100}%)`;
        dots.forEach(d => d.classList.remove('active'));
        dots[idx].classList.add('active');
      }
      function nextImg(){
        idx = (idx + 1) % total;
        updateSlider();
      }
      function prevImg(){
        idx = (idx - 1 + total) % total;
        updateSlider();
      }
      // 自动轮播
      function autoPlay(){
        timer = setInterval(nextImg, 3500);
      }
      function stopPlay(){
        clearInterval(timer);
      }
      function resetTimer(){
        stopPlay();
        autoPlay();
      }
      // 按钮绑定
      next.onclick = function(){
        nextImg();
        resetTimer();
      }
      prev.onclick = function(){
        prevImg();
        resetTimer();
      }
      // 悬停暂停
      car.addEventListener('mouseenter', stopPlay);
      car.addEventListener('mouseleave', autoPlay);
      // 初始渲染
      updateSlider();
      autoPlay();
    })
  }, 300);
})
