// Giao diện ống ngắm bắn tỉa (có vạch chia để ước lượng khoảng cách) và nhắc nhở khi đang canh ném lựu đạn.
// Vạch chia theo mil (mrad): với góc nhìn ống ngắm dọc 22°, mỗi vạch lớn = 20 mrad. Người cao 1,8 m chiếm 18 mrad ở 100 m,
// nên ước lượng khoảng cách (m) ≈ 1800 / số mrad người đó chiếm.

export const SCOPE_FOV = 22; // góc nhìn dọc khi nhìn qua ống ngắm (độ)
export const BASE_FOV = 75;

function reticleSvg() {
  const R = 46; // bán kính vùng nhìn (đơn vị SVG, 100 = 92% chiều cao nhỏ nhất của màn hình)
  const mradUnit = (100 / (0.92 * (2 * Math.tan((SCOPE_FOV * Math.PI) / 360) * 1000))); // đơn vị SVG trên 1 mrad
  let s = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">`;
  s += `<line x1="${50 - R}" y1="50" x2="${50 - 4}" y2="50" stroke="#000" stroke-width="0.12"/>`;
  s += `<line x1="${50 + 4}" y1="50" x2="${50 + R}" y2="50" stroke="#000" stroke-width="0.12"/>`;
  s += `<line x1="50" y1="${50 - R}" x2="50" y2="${50 - 4}" stroke="#000" stroke-width="0.12"/>`;
  s += `<line x1="50" y1="${50 + 4}" x2="50" y2="${50 + R}" stroke="#000" stroke-width="0.12"/>`;
  // Hai thanh dày ở rìa (kiểu duplex)
  s += `<line x1="${50 - R}" y1="50" x2="${50 - 18}" y2="50" stroke="#000" stroke-width="0.7"/>`;
  s += `<line x1="${50 + 18}" y1="50" x2="${50 + R}" y2="50" stroke="#000" stroke-width="0.7"/>`;
  s += `<line x1="50" y1="${50 + 18}" x2="50" y2="${50 + R}" stroke="#000" stroke-width="0.7"/>`;
  s += `<line x1="50" y1="${50 - R}" x2="50" y2="${50 - 18}" stroke="#000" stroke-width="0.7"/>`;
  // Vạch chia mil: nhỏ mỗi 10 mrad, lớn + số mỗi 20 mrad
  for (let m = 10; m * mradUnit < R - 2; m += 10) {
    const d = m * mradUnit;
    const major = m % 20 === 0;
    const tick = major ? 0.9 : 0.5;
    for (const sg of [-1, 1]) {
      s += `<line x1="${50 + sg * d}" y1="${50 - tick}" x2="${50 + sg * d}" y2="${50 + tick}" stroke="#000" stroke-width="0.12"/>`;
      s += `<line x1="${50 - tick}" y1="${50 + sg * d}" x2="${50 + tick}" y2="${50 + sg * d}" stroke="#000" stroke-width="0.12"/>`;
    }
    if (major) {
      s += `<text x="${50 + d}" y="${50 - 1.4}" font-size="1.4" text-anchor="middle" fill="#000">${m}</text>`;
      s += `<text x="${50 + 1.8}" y="${50 + d + 0.5}" font-size="1.4" fill="#000">${m}</text>`;
    }
  }
  s += `<circle cx="50" cy="50" r="0.18" fill="#d22"/>`;
  s += `</svg>`;
  return s;
}

export class ScopeOverlay {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'scope';
    this.el.innerHTML = `<div class="scope-ring"></div>${reticleSvg()}<div class="scope-note">Mỗi vạch 10 mrad · người cao 1,8 m: 1800 ÷ số mrad = khoảng cách (m)</div>`;
    document.body.appendChild(this.el);
    this.hint = document.createElement('div');
    this.hint.id = 'nadehint';
    document.body.appendChild(this.hint);
  }

  // k: mức thu phóng 0..1 (để mờ dần khi vào/ra ống ngắm)
  setZoom(k) {
    this.el.style.opacity = String(Math.max(0, Math.min(1, (k - 0.55) / 0.4)));
    this.el.style.display = k > 0.55 ? 'block' : 'none';
  }

  setNadeHint(text) {
    this.hint.textContent = text || '';
    this.hint.style.display = text ? 'block' : 'none';
  }
}
