// 名句分享卡：Canvas 绘制 600x800 → PNG Blob（网页版改为触发下载；支持 Web Share 时可分享）
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function make(quote) {
  return new Promise((resolve) => {
    try {
      const W = 600, H = 800;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      // 背景渐变（该句氛围色）
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, (quote.color && quote.color[0]) || '#F6D365');
      grad.addColorStop(1, (quote.color && quote.color[1]) || '#FD6585');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 内层白卡
      const cardX = 40, cardY = 90, cardW = W - 80, cardH = H - 200;
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#0B0B0F';
      ctx.lineWidth = 5;
      roundRect(ctx, cardX, cardY, cardW, cardH, 28);
      ctx.fill();
      ctx.stroke();

      // 剧名 tag
      ctx.fillStyle = '#0C54E0';
      roundRect(ctx, cardX + 30, cardY - 18, 220, 44, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(quote.drama, cardX + 52, cardY + 12);

      // 韩文原文（自动换行）
      ctx.fillStyle = '#0B0B0F';
      ctx.font = 'bold 40px sans-serif';
      let y = cardY + 100;
      wrapText(ctx, quote.ko, cardW - 60).forEach((line) => {
        ctx.fillText(line, cardX + 30, y);
        y += 56;
      });

      // 罗马音
      ctx.font = '26px sans-serif';
      ctx.fillStyle = '#0836A8';
      wrapText(ctx, quote.roman, cardW - 60).forEach((line) => {
        ctx.fillText(line, cardX + 30, y + 6);
        y += 38;
      });

      // 中文
      ctx.font = '28px sans-serif';
      ctx.fillStyle = '#3E4C66';
      wrapText(ctx, quote.zh, cardW - 60).forEach((line) => {
        ctx.fillText(line, cardX + 30, y + 10);
        y += 42;
      });

      // 底部信息
      ctx.fillStyle = '#0B0B0F';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('한국어 친구 · 韩剧名句学习', cardX + 30, cardY + cardH - 34);
      ctx.font = '22px sans-serif';
      ctx.fillStyle = '#7A8BA8';
      ctx.fillText('保存卡片，一起练发音 →', cardX + cardW - 290, cardY + cardH - 34);

      canvas.toBlob((blob) => resolve(blob || null), 'image/png');
    } catch (e) {
      resolve(null);
    }
  });
}

// 生成并下载分享卡（Web Share 可用时优先调起系统分享）
export async function shareQuoteCard(quote) {
  const blob = await make(quote);
  if (!blob) return false;
  const file = new File([blob], 'korean-friend-quote.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: quote.drama });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return true; // 用户取消分享不算失败
      // 继续走下载兜底
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '한국어 친구 · ' + quote.drama + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
