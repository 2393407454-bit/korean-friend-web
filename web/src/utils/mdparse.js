// 轻量富文本解析：把 AI 回复文本解析为可渲染的块数组（自小程序 utils/mdparse.js 移植）
// 支持：```代码块```（含语言标注）、**加粗**、`行内代码`、普通行
// 输出结构：
//   [{ type:'code', lang, segs:[{t,s}] }, { type:'line', segs:[{t,s}] }]
// seg.s 取值：'' 普通 / 'b' 加粗 / 'c' 行内代码 / 'k' 关键字 / 'str' 字符串 / 'cm' 注释

const CODE_KEYWORDS = /\b(def|class|if|else|for|while|return|import|from|const|let|var|function|print|true|false|null|None|True|False|new|await|async)\b/g;

function codeSegs(code) {
  // 逐行简单着色：注释 → 字符串 → 关键字（顺序处理，够用于教学场景）
  const segs = [];
  code.split('\n').forEach((line, li) => {
    if (li > 0) segs.push({ t: '\n', s: '' });
    const cm = line.indexOf('//');
    const hash = line.indexOf('#');
    const cut = cm >= 0 ? cm : hash >= 0 ? hash : -1;
    const codePart = cut >= 0 ? line.slice(0, cut) : line;
    const commentPart = cut >= 0 ? line.slice(cut) : '';

    // 字符串
    const re = /("[^"]*"|'[^']*')/g;
    let last = 0;
    for (const m of codePart.matchAll(re)) {
      if (m.index > last) pushWord(segs, codePart.slice(last, m.index));
      segs.push({ t: m[0], s: 'str' });
      last = m.index + m[0].length;
    }
    if (last < codePart.length) pushWord(segs, codePart.slice(last));
    if (commentPart) segs.push({ t: commentPart, s: 'cm' });
  });
  if (!segs.length) segs.push({ t: ' ', s: '' });
  return segs;
}

function pushWord(segs, text) {
  if (!text) return;
  let last = 0;
  const re = new RegExp(CODE_KEYWORDS.source, 'g');
  for (const m of text.matchAll(re)) {
    if (m.index > last) segs.push({ t: text.slice(last, m.index), s: '' });
    segs.push({ t: m[0], s: 'k' });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ t: text.slice(last), s: '' });
}

function parseInline(line) {
  const segs = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index > last) segs.push({ t: line.slice(last, m.index), s: '' });
    const tok = m[0];
    if (tok.startsWith('**')) segs.push({ t: tok.slice(2, -2), s: 'b' });
    else segs.push({ t: tok.slice(1, -1), s: 'c' });
    last = m.index + tok.length;
  }
  if (last < line.length) segs.push({ t: line.slice(last), s: '' });
  if (!segs.length) segs.push({ t: ' ', s: '' });
  return segs;
}

function parse(text) {
  const blocks = [];
  const parts = String(text || '').split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const lines = part.replace(/^\n+|\n+$/g, '').split('\n');
      const lang = /^\w+$/.test(lines[0] || '') ? lines.shift() : '';
      blocks.push({ type: 'code', lang: lang || '', segs: codeSegs(lines.join('\n')) });
    } else if (part.length) {
      part.split('\n').forEach((line) => {
        blocks.push({ type: 'line', segs: parseInline(line || ' ') });
      });
    }
  });
  if (!blocks.length) blocks.push({ type: 'line', segs: [{ t: ' ', s: '' }] });
  return blocks;
}

export { parse, parseInline, codeSegs };
