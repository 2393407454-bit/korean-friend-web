// 情景对练场景库（人工审核内容，比赛演示时没有 LLM 生成的随机性风险）
// 每个场景：场景介绍（intro 由 name/ai_role/user_task 构成）+ AI 角色 + 用户任务 + 对话目标 + 难度
const SCENARIOS = [
  {
    id: 'airport',
    icon: '✈️',
    name: '机场入关',
    name_ko: '공항 입국심사',
    category: '旅行',
    level: '入门',
    ai_role: '入境审查官（問你旅行目的、停留时间）',
    user_task: '用韩语回答审查官的提问，护照信息、来韩目的、住址、停留天数',
    goal: '完成入关问答，学会 여권/체류/관광 相关表达',
    opener: '여권 좀 보여 주세요. 한국에는 무슨 일로 오셨어요?'
  },
  {
    id: 'hotel',
    icon: '🏨',
    name: '酒店入住',
    name_ko: '호텔 체크인',
    category: '旅行',
    level: '入门',
    ai_role: '酒店前台职员',
    user_task: '办理入住：报预订姓名、问早餐时间、要 Wi-Fi 密码、问退房时间',
    goal: '完成入住办理并问清 3 个服务信息',
    opener: '안녕하세요! 예약하셨나요? 성함이 어떻게 되세요?'
  },
  {
    id: 'restaurant',
    icon: '🍜',
    name: '餐厅点餐',
    name_ko: '식당에서 주문하기',
    category: '旅行',
    level: '入门',
    ai_role: '餐厅服务员（推荐招牌菜）',
    user_task: '看菜单点 2 个菜和饮料，说明忌口（不能吃辣），要水和账单',
    goal: '完成点餐全流程，学会 주세요/맵지 않게 表达',
    opener: '어서 오세요! 몇 분이세요? 메뉴판 여기 있어요.'
  },
  {
    id: 'cafe',
    icon: '☕',
    name: '咖啡店点单',
    name_ko: '카페에서 주문하기',
    category: '旅行',
    level: '入门',
    ai_role: '咖啡店店员（问杯型/冷热/堂食外带）',
    user_task: '点一杯冰美式外带，再问有没有甜点推荐',
    goal: '完成点单并学会 아메리카노/테이크아웃 等高频词',
    opener: '안녕하세요! 주문 도와드릴까요?'
  },
  {
    id: 'store',
    icon: '🏪',
    name: '便利店购物',
    name_ko: '편의점에서',
    category: '旅行',
    level: '入门',
    ai_role: '便利店店员',
    user_task: '买交通卡并充值、问热食怎么付款、要不要袋子',
    goal: '学会 충전/봉투/카드 相关表达，完成结账',
    opener: '어서 오세요! 찾으시는 거 있으세요?'
  },
  {
    id: 'subway',
    icon: '🚇',
    name: '地铁出行',
    name_ko: '지하철 이용',
    category: '旅行',
    level: '日常',
    ai_role: '地铁站工作人员',
    user_task: '问去明洞坐几号线、哪里换乘、买一次性交通卡',
    goal: '听懂乘车路线指引并复述确认，学会 환승/몇 호선',
    opener: '안녕하세요! 어디로 가시는데요?'
  },
  {
    id: 'shopping',
    icon: '🛍️',
    name: '商场购物',
    name_ko: '쇼핑하기',
    category: '旅行',
    level: '日常',
    ai_role: '服装店店员（协助试穿、介绍尺码）',
    user_task: '找一件外套、问尺码和颜色、试穿、问价格并结账',
    goal: '完成试穿与结账，学会 사이즈/입어보다/얼마예요',
    opener: '어서 오세요! 편하게 구경하세요~'
  },
  {
    id: 'askway',
    icon: '🗺️',
    name: '街头问路',
    name_ko: '길 묻기',
    category: '旅行',
    level: '日常',
    ai_role: '路人（耐心指路，会问你要去哪里）',
    user_task: '问去景福宫怎么走，确认方向、距离、需要的时间',
    goal: '听懂指路并复述路线，学会 쪽/건너편/걸어서',
    opener: '저, 혹시 어디 찾으세요?'
  },
  {
    id: 'intro',
    icon: '👋',
    name: '初次自我介绍',
    name_ko: '자기소개',
    category: '日常生活',
    level: '入门',
    ai_role: '刚认识的韩国朋友（想了解你）',
    user_task: '介绍名字、国籍、职业/专业、爱好，学对方先说',
    goal: '流畅完成 4 句以上的自我介绍，学会 입니다/이에요 句型',
    opener: '안녕하세요! 처음 뵙겠어요. 저는 민준이라고 해요. 이름이 뭐예요?'
  },
  {
    id: 'friend_plan',
    icon: '🎬',
    name: '约朋友看电影',
    name_ko: '친구와 약속',
    category: '日常生活',
    level: '日常',
    ai_role: '你的韩国朋友（时间对不上，要协商）',
    user_task: '约周末看电影：提时间、商量场次、定见面地点',
    goal: '完成一次约定协商，学会 -ㄹ까요 提议句型与时间表达',
    opener: '야! 주말에 뭐 해? 같이 영화 볼래?'
  },
  {
    id: 'weather',
    icon: '⛅',
    name: '聊天气',
    name_ko: '날씨 이야기',
    category: '日常生活',
    level: '入门',
    ai_role: '韩国朋友（喜欢聊最近天气）',
    user_task: '聊今天天气、喜欢的季节、最近天气变化的感受',
    goal: '学会 덥다/춥다/비가 오다 等天气表达并完成 5 轮对话',
    opener: '요즘 날씨 진짜 좋지 않아? 너는 어떤 계절을 좋아해?'
  },
  {
    id: 'school',
    icon: '🎓',
    name: '学校生活',
    name_ko: '학교 생활',
    category: '日常生活',
    level: '日常',
    ai_role: '韩国同学（聊课业与社团）',
    user_task: '聊专业、喜欢的课、社团活动、最近忙什么',
    goal: '学会 전공/동아리 等校园词汇，完整表达近况',
    opener: '요즘 수업 어때? 어려운 과목 있어?'
  },
  {
    id: 'interview',
    icon: '💼',
    name: '求职面试',
    name_ko: '면접',
    category: '学习/工作',
    level: '进阶',
    ai_role: '韩国公司面试官（正式敬语 합쇼체）',
    user_task: '自我介绍、说优势、回答为什么想进这家公司、最后提问',
    goal: '用 합쇼체 完成面试问答，表达有条理',
    opener: '안녕하세요. 지원자님, 간단히 자기소개부터 부탁드립니다.'
  },
  {
    id: 'presentation',
    icon: '📢',
    name: '课堂发表',
    name_ko: '발표',
    category: '学习/工作',
    level: '进阶',
    ai_role: '韩国大学课堂里的教授与同学（发问环节）',
    user_task: '用韩语发表你的课题（内容自定），并回答同学提问',
    goal: '完成 1 分钟发表 + 应对 2 个提问，学会 발표 常用套话',
    opener: '다음 발표자 나와 주세요. 준비되셨나요?'
  }
];

function list() {
  return SCENARIOS.map((s) => ({
    id: s.id, icon: s.icon, name: s.name, name_ko: s.name_ko, category: s.category, level: s.level
  }));
}

function get(id) {
  return SCENARIOS.find((s) => s.id === id) || null;
}

module.exports = { SCENARIOS, list, get };