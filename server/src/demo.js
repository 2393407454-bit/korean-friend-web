// 比赛演示剧本（Phase 12）
// 设计要点：
// - 助手文案为「预置剧本」，不依赖网络与 LLM（比赛现场零风险）
// - 但每一步的 state 都走与真实聊天完全一致的 applyStatePatch 管线：
//   定级 / 纠错落库 / 掌握闭环 / 质量评估 / 情景复盘 —— 评委看到的卡片是真实系统渲染
// - 演示归属独立档案（demo_ 前缀），与真实用户数据完全隔离
// - 全程 UI 显示「演示模式」标识

const STEPS = [
  // S0：开场 + 水平测试
  {
    user: '',
    reply: {
      display:
        '안녕하세요! 반가워요. (an-nyeong-ha-se-yo / 你好，很高兴认识你。)\n\n欢迎体验【AI 韩语教练 · 演示模式】。我们先花 30 秒做个小测试，让 AI 了解你的水平。\n\n이름이 뭐예요? 한국어를 얼마나 공부했어요? (i-reum-i mwo-ye-yo / 你叫什么名字？学韩语多久了？)',
      speech: '안녕하세요! 반가워요. 你好，很高兴认识你。欢迎体验 AI 韩语教练演示模式。이름이 뭐예요? 한국어를 얼마나 공부했어요? 你叫什么名字？学韩语多久了？',
      state: {}
    }
  },
  // S1：学生自介 → AI 定级
  {
    user: '저는 샤오밍이에요. 한국어를 두 달 공부했어요. 취미는 음악이에요.',
    reply: {
      display:
        '와, 두 달 공부했는데 이렇게 말하다니 대단해요! (wa, du dal gong-bu-haet-neun-de i-reo-ke mal-ha-da-ni dae-dan-hae-yo / 哇，才学了两个月就能说这么多，很棒！)\n\nAI 根据你的回答完成能力定级：\n🎯 TOPIK 2 · 基础词汇扎实，助词使用需加强\n\n平时你在哪里学习？试着用韩语说「我在学校学习」。',
      speech: '와, 두 달 공부했는데 이렇게 말하다니 대단해요! 哇，才学了两个月就能说这么多，很棒。AI 根据你的回答完成能力定级，TOPIK 2。',
      state: { level: 'TOPIK2', goal: 'hobby', interests: ['音乐'], quality: { fluency: 70, naturalness: 68 } }
    }
  },
  // S2：学生犯错 → 结构化纠错卡
  {
    user: '저는 학교에 공부해요.',
    reply: {
      display:
        '거의 맞았어요! 다만 장소를 말할 때는 조금 달라요. (geo-ui ma-ja-sseo-yo! da-man jang-so-reul mal-hal ttae-neun jo-geum dal-la-yo / 几乎全对！不过，表示动作发生的地点时要稍微换一种说法。)\n\n自然说法是「학교에서 공부해요」。\n학교에서 공부해요.\n我在学校学习。\n\n「에서」表示动作发生的地点。系统已记下这个知识点，之后会帮你复习。',
      speech: '거의 맞았어요! 다만 장소를 말할 때는 조금 달라요. 几乎全对！不过表示动作发生的地点时要稍微换一种说法。학교에서 공부해요. 我在学校学习。',
      state: {
        errors: [{ code: 'G', wrong: '학교에 공부해요', right: '학교에서 공부해요', note: '地点助词', point: '에/에서', severity: 'high', explain: '「에서」表示动作发生的地点；「에」表示存在的位置或目的地。' }],
        weak_points: ['에/에서']
      }
    }
  },
  // S3：学生用对 → 掌握闭环！
  {
    user: '저는 도서관에서 공부해요.',
    reply: {
      display:
        '정답이에요! (jeong-da-bi-e-yo / 答对了！) 🎉\n\n도서관에서 공부해요. (do-seo-gwan-e-seo / 我在图书馆学习。)\n\n你刚才正确使用了「에서」！系统记录了这个进步。',
      speech: '정답이에요! 答对了！도서관에서 공부해요. 我在图书馆学习。你刚才正确使用了 에서，这个知识点掌握得很好。',
      state: { errors_mastered: ['에/에서'], quality: { fluency: 76, naturalness: 75 } }
    }
  },
  // S4：进入情景对练
  {
    user: '네, 알겠어요!',
    reply: {
      display:
        '이제 배운 표현을 실전에서 써 볼까요? (i-je bae-un pyo-hyeo-neul sil-jeo-ne-seo sseo bol-kka-yo / 现在要不要把刚学的表达用在真实场景里？)\n\n进入情景对练：咖啡店点单 ☕\n我是店员，请用韩语点一杯你想喝的饮料。',
      speech: '이제 배운 표현을 실전에서 써 볼까요? 现在要不要把刚学的表达用在真实场景里？进入咖啡店点单情景，我是店员，请用韩语点一杯你想喝的饮料。',
      state: { mode: '情景模拟', scenario: { scene: '咖啡店', agent_role: '店员' } }
    }
  },
  // S5：情景对话 + 微纠错 + 复盘卡（report 由前端以系统卡片渲染）
  {
    user: '아이스 아메리카노 한 잔 주세요. 그리고 케이크도 주세요.',
    reply: {
      display:
        '좋아요! 맛있게 드세요. (jo-a-yo! ma-si-sse-ge deu-se-yo / 好的，请慢用。)\n\n点单时也可以说：\n아이스 아메리카노 한 잔이랑 케이크 하나 주세요.\n请给我一杯冰美式和一块蛋糕。\n这里的「-이랑」相当于“和”，能把两样东西自然地连起来。\n\n情景任务完成！AI 正在为你生成复盘…',
      speech: '좋아요! 맛있게 드세요. 好的，请慢用。아이스 아메리카노 한 잔이랑 케이크 하나 주세요. 请给我一杯冰美式和一块蛋糕。情景任务完成，AI 正在生成复盘。',
      state: {
        errors: [{ code: 'V', wrong: '그리고 케이크도 주세요', right: '케이크 하나도 주세요', note: '点单连续表达', point: '点单连词 -이랑', severity: 'low', explain: '口语点单用 -이랑 连接更自然流畅。' }],
        quality: { fluency: 82, naturalness: 78 }
      },
      report: {
        scene: 'cafe',
        scene_name: '咖啡店点单',
        score: 82,
        highlights: ['全程只用韩语完成点单任务', '「에서」用得完全正确，上次的错误没有复发'],
        improvements: ['点单时可用 -이랑 把两样东西连起来说', '注意 아이스 아메리카노 的连读'],
        summary: '真实语境中自信流畅，助词进步明显！'
      }
    }
  },
  // S6：结束页 —— 闭环总结
  {
    user: '（演示结束）',
    reply: {
      display:
        '오늘 훈련 완료! 수고했어요. (o-neul hun-ryeon wan-ryo! su-go-hae-sseo-yo / 今天的练习完成了！辛苦啦。)\n\n📈 今日学习报告（演示数据）：\n· 对话 6 轮 · 发现 1 个语法问题 → 练习后掌握\n· 能力变化示例：语法 61 → 72（真实训练后会显示你的实际数据）\n\n演示流程：测试 → 定级 → 纠错 → 练习 → 掌握 → 情景复盘 ✓\n\n退出演示后，AI 会根据你的真实练习记录继续陪你学习。화이팅!\n加油！',
      speech: '오늘 훈련 완료! 수고했어요. 今天的练习完成了，辛苦啦。演示闭环已经走完。화이팅! 加油！退出演示后，AI 会根据你的真实练习记录继续陪你学习。',
      state: {}
    }
  }
];

function total() {
  return STEPS.length;
}

function stepAt(i) {
  return STEPS[i] || null;
}

module.exports = { STEPS, total, stepAt };
