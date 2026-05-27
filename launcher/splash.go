package main

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
)

// splashHTML 是启动期 WebView2 显示的占位页面。
//
// 设计：
//   - 自包含（内联 CSS / 一个轮转 spinner 用 CSS animation），不引外部资源；
//   - 暗色，配合产品默认主题；
//   - 一段定时 setTimeout 把"长时间未就绪"的提示展示出来，让用户知道还在跑；
//
// 真正切到 backend URL 由 launcher 检测到 /health 200 后调 webview.Navigate 完成，
// 不需要 splash 自己跳。
const splashHTML = `<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Hermes AI</title>
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; height: 100%; }
    body {
      background: radial-gradient(80% 60% at 50% 35%, #20114a 0%, #0a0521 70%);
      color: #e9e4ff;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      display: grid;
      place-items: center;
      -webkit-user-select: none;
      user-select: none;
    }
    .card {
      text-align: center;
      max-width: 360px;
      padding: 32px 28px;
    }
    .logo {
      width: 96px;
      height: 96px;
      margin: 0 auto 20px;
    }
    .logo rect:nth-of-type(2),
    .logo rect:nth-of-type(3),
    .logo rect:nth-of-type(4) {
      filter: drop-shadow(0 0 12px #a78bfa55);
    }
    .title {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 13px;
      color: #b9adda;
    }
    .ring {
      margin: 28px auto 0;
      width: 38px;
      height: 38px;
      border: 3px solid #2d1d62;
      border-top-color: #a78bfa;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .slow {
      margin-top: 28px;
      font-size: 12px;
      color: #8a7eb6;
      opacity: 0;
      transition: opacity 1s;
    }
    .slow.visible { opacity: 1; }
  </style>
</head>
<body>
  <div class="card">
    <svg class="logo" viewBox="0 0 256 256" aria-hidden="true">
      <defs>
        <radialGradient id="bg" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#3b1f7a"/>
          <stop offset="60%" stop-color="#1a0c44"/>
          <stop offset="100%" stop-color="#0a0521"/>
        </radialGradient>
        <linearGradient id="mark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#a78bfa"/>
          <stop offset="100%" stop-color="#7c3aed"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="256" height="256" rx="56" fill="url(#bg)"/>
      <path d="M48 132 L96 100 L96 156 Z" fill="url(#mark)" opacity="0.85"/>
      <path d="M208 132 L160 100 L160 156 Z" fill="url(#mark)" opacity="0.85"/>
      <rect x="92" y="64" width="16" height="128" rx="6" fill="url(#mark)"/>
      <rect x="148" y="64" width="16" height="128" rx="6" fill="url(#mark)"/>
      <rect x="100" y="120" width="56" height="16" fill="url(#mark)"/>
      <circle cx="128" cy="80" r="6" fill="#f5d0fe" opacity="0.9"/>
    </svg>
    <div class="title">Hermes AI</div>
    <div class="subtitle">Starting research command center…</div>
    <div class="ring" role="progressbar" aria-label="Loading"></div>
    <div class="slow" id="slow">Still warming up. First run takes a few extra seconds.</div>
  </div>
  <script>
    setTimeout(function () { document.getElementById('slow').classList.add('visible'); }, 4000);
  </script>
</body>
</html>
`

// writeSplashFile 把 splash HTML 写到 SplashDir/index.html，返回它的 file:// URL。
//
// 用文件而不是 data:URL，因为 WebView2 对 data:URL 上的相对资源处理有些限制；
// 落到磁盘也方便 debug。
func writeSplashFile(dir string) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	p := filepath.Join(dir, "index.html")
	if err := os.WriteFile(p, []byte(splashHTML), 0o644); err != nil {
		return "", err
	}
	return fileURL(p), nil
}

func fileURL(p string) string {
	abs, err := filepath.Abs(p)
	if err != nil {
		abs = p
	}
	u := url.URL{Scheme: "file", Path: filepath.ToSlash(abs)}
	// Windows 绝对路径会变成 file:///C:/... 这样，url.URL 默认会少一个斜杠，手补一下。
	s := u.String()
	if filepath.IsAbs(abs) && len(s) > 7 && s[7] != '/' {
		s = "file:///" + s[len("file://"):]
	}
	return s
}

func splashFileURL(p *AppPaths) string {
	u, err := writeSplashFile(p.SplashDir)
	if err != nil {
		// 写不出来就 fallback 到一个 about:blank — 最差情况就是窗口空白几秒
		return fmt.Sprintf("about:blank#splash-write-failed-%s", url.QueryEscape(err.Error()))
	}
	return u
}
