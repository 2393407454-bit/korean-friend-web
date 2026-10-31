// 韩语课程数据：A1 / A2 / B1 三个级别，每级 6 个单元，每单元 3 节课（共 18 单元 54 课）
// 每个单元内含四类练习素材：单词 6 条、语法 3 题、口语 2 句、听力 2 题
// 节课只决定「练哪几种模式」，素材仍来自所属单元，避免同一单元内容重复维护

export const MODES = ['vocab', 'grammar', 'speaking', 'listening'];

export const MODE_META = {
  vocab: { label: '单词记忆', icon: 'book', verb: '开始记忆', desc: '3D 闪卡 + 自评复习' },
  grammar: { label: '语法练习', icon: 'list', verb: '开始练习', desc: '句型选择 + 即时解析' },
  speaking: { label: '口语跟读', icon: 'mic', verb: '开始跟读', desc: '示范音 + 录音评分' },
  listening: { label: '听力训练', icon: 'headphones', verb: '开始听力', desc: '情境音频 + 理解题' }
};

const pick = (arr, i) => arr[i];

export const LEVELS = [
  {
    id: 'A1',
    title: '起步',
    desc: '熟悉韩语语序与敬语结尾，完成最初的自我介绍。',
    units: [
      {
        id: 'ko-a1-u1',
        title: '첫 만남',
        zh: '初次见面',
        blurb: '问候、介绍姓名与来历，用敬语留下得体的第一印象。',
        vocab: [
          { v: '안녕하세요', r: 'annyeonghaseyo', m: '你好', ex: '안녕하세요, 저는 리나입니다.', exZh: '你好，我是里娜。' },
          { v: '이름', r: 'ireum', m: '名字', ex: '이름이 뭐예요?', exZh: '你叫什么名字？' },
          { v: '학생', r: 'haksaeng', m: '学生', ex: '저는 학생이에요.', exZh: '我是学生。' },
          { v: '한국', r: 'hanguk', m: '韩国', ex: '한국에서 왔어요.', exZh: '我来自韩国。' },
          { v: '친구', r: 'chingu', m: '朋友', ex: '제 친구예요.', exZh: '这是我的朋友。' },
          { v: '감사합니다', r: 'gamsahamnida', m: '谢谢', ex: '도와주셔서 감사합니다.', exZh: '谢谢你的帮助。' }
        ],
        grammar: [
          { q: '저 ___ 학생이에요.', options: ['는', '가', '를', '에'], answer: 0, explain: '저는 中 는 是主题助词，表示“至于我”。' },
          { q: '한국 ___ 왔어요.', options: ['에서', '에', '를', '도'], answer: 0, explain: '来处的起点用 에서：한국에서 왔어요。' },
          { q: '만나서 반갑 ___.', options: ['습니다', '어요', '다', '고'], answer: 0, explain: '固定问候「반갑습니다」，使用正式敬语结尾。' }
        ],
        speaking: [
          { text: '안녕하세요, 저는 리나입니다. 만나서 반갑습니다.', zh: '你好，我是里娜，很高兴认识你。', tip: '「안녕하세요」语调平稳，结尾不要上扬太多。' },
          { text: '저는 학생이고, 한국에서 왔어요.', zh: '我是学生，来自韩国。', tip: '「이고」连接两个身份信息，语速放慢一点。' }
        ],
        listening: [
          { audio: '안녕하세요. 저는 민수입니다. 잘 부탁드립니다.', q: '这句话的意思是？', options: ['你好，我是民秀，请多关照。', '再见，我是民秀。', '你好，我是老师。'], answer: 0, zh: '你好，我是民秀，请多关照。' },
          { audio: '저는 리나예요. 한국에서 왔어요.', q: '리나는 어디에서 왔어요?', options: ['한국', '중국', '일본'], answer: 0, zh: '我是里娜，来自韩国。' }
        ]
      },
      {
        id: 'ko-a1-u2',
        title: '카페에서 주문',
        zh: '咖啡店点单',
        blurb: '点单、确认杯量与结账，掌握咖啡店里最常用的韩语。',
        vocab: [
          { v: '커피', r: 'keopi', m: '咖啡', ex: '커피 한 잔 주세요.', exZh: '请给我一杯咖啡。' },
          { v: '차', r: 'cha', m: '茶', ex: '차는 있어요?', exZh: '有茶吗？' },
          { v: '주세요', r: 'juseyo', m: '请给我', ex: '메뉴 주세요.', exZh: '请给我菜单。' },
          { v: '주문', r: 'jumun', m: '点单', ex: '주문하시겠어요?', exZh: '您要点单吗？' },
          { v: '사이즈', r: 'saijeu', m: '尺寸', ex: '사이즈는 어떻게 하시겠어요?', exZh: '您要什么尺寸？' },
          { v: '계산', r: 'gyesan', m: '结账', ex: '계산해 주세요.', exZh: '请结账。' }
        ],
        grammar: [
          { q: '커피 한 ___ 주세요.', options: ['잔', '개', '명', '권'], answer: 0, explain: '饮料的计量单位是「잔」（杯），「명」用于人。' },
          { q: '커피___ 주세요.', options: ['를', '가', '는', '에'], answer: 0, explain: '커피 是宾语，用宾格助词 를（有收音时用 을）。' },
          { q: '계산은 ___ 하시겠어요?', options: ['어떻게', '무엇', '누구', '언제'], answer: 0, explain: '询问方式用「어떻게」，这里问怎么结账。' }
        ],
        speaking: [
          { text: '저기요, 커피 한 잔 주세요.', zh: '你好，请给我一杯咖啡。', tip: '「저기요」用来招呼店员，语气轻而短。' },
          { text: '계산해 주세요.', zh: '请结账。', tip: '「주세요」清晰收尾，不要拖音。' }
        ],
        listening: [
          { audio: '네, 커피 한 잔이요. 4,500원입니다.', q: '커피는 얼마입니까?', options: ['4,500원', '5,400원', '4,000원'], answer: 0, zh: '好的，一杯咖啡，4500 韩元。' },
          { audio: '사이즈는 M과 L이 있어요. 어느 쪽으로 드릴까요?', q: '직원이 무엇을 묻고 있습니까?', options: ['사이즈', '이름', '결제 방법'], answer: 0, zh: '有 M 和 L 两种尺寸，您要哪一种？' }
        ]
      },
      {
        id: 'ko-a1-u3',
        title: '어디에 있어요?',
        zh: '问路与场所',
        blurb: '在街上找厕所、银行和便利店，用存在句说出位置。',
        vocab: [
          { v: '화장실', r: 'hwajangsil', m: '洗手间', ex: '화장실이 어디에 있어요?', exZh: '洗手间在哪里？' },
          { v: '은행', r: 'eunhaeng', m: '银行', ex: '은행은 편의점 옆에 있어요.', exZh: '银行在便利店旁边。' },
          { v: '편의점', r: 'pyeonuijeom', m: '便利店', ex: '편의점에서 물을 샀어요.', exZh: '在便利店买了水。' },
          { v: '근처', r: 'geuncheo', m: '附近', ex: '근처에 약국이 있어요.', exZh: '附近有药店。' },
          { v: '왼쪽', r: 'oenjjok', m: '左边', ex: '왼쪽으로 가세요.', exZh: '请往左走。' },
          { v: '오른쪽', r: 'oreunjjok', m: '右边', ex: '오른쪽에 있어요.', exZh: '在右边。' }
        ],
        grammar: [
          { q: '화장실 ___ 어디에 있어요?', options: ['이', '가', '를', '에'], answer: 0, explain: '询问某物在哪里时，主语用主格助词 이/가：화장실이 어디에 있어요?（有收音用 이）' },
          { q: '은행은 편의점 옆 ___ 있어요.', options: ['에', '에서', '을', '도'], answer: 0, explain: '存在的位置用 에：편의점 옆에 있어요（在便利店旁边）。' },
          { q: '역까지 ___ 가요?', options: ['어떻게', '무엇', '누구', '언제'], answer: 0, explain: '询问方式或路线用「어떻게 가요?」（怎么去？）。' }
        ],
        speaking: [
          { text: '실례합니다, 화장실이 어디에 있어요?', zh: '打扰一下，洗手间在哪里？', tip: '「실례합니다」用于向陌生人开口，语气要轻。' },
          { text: '은행은 편의점 옆에 있어요.', zh: '银行在便利店旁边。', tip: '「옆에」的 에 不要拖长，干净收住。' }
        ],
        listening: [
          { audio: '네, 편의점은 은행 옆에 있어요.', q: '편의점은 어디에 있습니까?', options: ['은행 옆', '화장실 앞', '역 안'], answer: 0, zh: '是的，便利店在银行旁边。' },
          { audio: '지하철역은 왼쪽에 있고, 은행은 오른쪽에 있어요.', q: '은행은 어느 쪽에 있습니까?', options: ['오른쪽', '왼쪽', '정면'], answer: 0, zh: '地铁站在左边，银行在右边。' }
        ]
      },
      {
        id: 'ko-a1-u4',
        title: '자기소개',
        zh: '自我介绍',
        blurb: '说清职业、身份与爱好，把个人信息连成一小段话。',
        vocab: [
          { v: '직업', r: 'jigeop', m: '职业', ex: '직업이 뭐예요?', exZh: '你的职业是什么？' },
          { v: '회사원', r: 'hoesawon', m: '公司职员', ex: '저는 회사원입니다.', exZh: '我是公司职员。' },
          { v: '대학생', r: 'daehaksaeng', m: '大学生', ex: '저는 대학생이에요.', exZh: '我是大学生。' },
          { v: '취미', r: 'chwimi', m: '爱好', ex: '취미는 영화 보기예요.', exZh: '爱好是看电影。' },
          { v: '운동', r: 'undong', m: '运动', ex: '주말에 운동을 해요.', exZh: '周末做运动。' },
          { v: '영화', r: 'yeonghwa', m: '电影', ex: '영화를 좋아해요.', exZh: '喜欢电影。' }
        ],
        grammar: [
          { q: '저는 회사원 ___ .', options: ['입니다', '이에요', '예요', '이요'], answer: 0, explain: '正式场合用「회사원입니다」；회사원 有收音，口语敬语用 회사원이에요。' },
          { q: '제 취미 ___ 영화 보기예요.', options: ['는', '를', '가', '에'], answer: 0, explain: '介绍主题时用 는：제 취미는 영화 보기예요。' },
          { q: '저는 운동 ___ 좋아해요.', options: ['을', '를', '이', '에'], answer: 0, explain: '운동 有收音，宾格助词用 을：운동을 좋아해요。' }
        ],
        speaking: [
          { text: '안녕하세요, 저는 왕밍입니다. 대학생이고 취미는 영화 보기예요.', zh: '你好，我是王明，是大学生，爱好是看电影。', tip: '「대학생이고」连接两个信息，and 的位置稍作停顿。' },
          { text: '제 직업은 회사원이고, 주말에는 운동을 해요.', zh: '我的职业是公司职员，周末会运动。', tip: '「주말에는」的 에는 表示“在周末”，重音落在 주말。' }
        ],
        listening: [
          { audio: '제 이름은 유진이고, 대학생이에요. 취미는 음악 듣기예요.', q: '유진의 취미는 무엇입니까?', options: ['음악 듣기', '영화 보기', '운동하기'], answer: 0, zh: '我叫유진，是大学生，爱好是听音乐。' },
          { audio: '저는 회사원입니다. 주말에는 등산을 좋아해요.', q: '이 사람의 직업은 무엇입니까?', options: ['회사원', '대학생', '선생님'], answer: 0, zh: '我是公司职员，周末喜欢登山。' }
        ]
      },
      {
        id: 'ko-a1-u5',
        title: '쇼핑',
        zh: '购物',
        blurb: '问价格、挑颜色与尺码，完成一次简单的购物对话。',
        vocab: [
          { v: '얼마', r: 'eolma', m: '多少钱', ex: '이거 얼마예요?', exZh: '这个多少钱？' },
          { v: '원', r: 'won', m: '韩元', ex: '삼만 원이에요.', exZh: '三万韩元。' },
          { v: '사이즈', r: 'saijeu', m: '尺码', ex: '더 큰 사이즈 있어요?', exZh: '有更大一码吗？' },
          { v: '색', r: 'saek', m: '颜色', ex: '다른 색도 있어요?', exZh: '还有别的颜色吗？' },
          { v: '입어 보다', r: 'ibeo boda', m: '试穿', ex: '입어 봐도 돼요?', exZh: '可以试穿吗？' },
          { v: '카드', r: 'kadeu', m: '银行卡', ex: '카드로 계산할게요.', exZh: '我刷卡结账。' }
        ],
        grammar: [
          { q: '이거 ___ 얼마예요?', options: ['는', '를', '이', '에'], answer: 0, explain: '把「这个」作为话题提出时用 는：이거는 얼마예요?（口语常缩成 이건）。' },
          { q: '빨간색 ___ 있어요?', options: ['도', '만', '를', '에'], answer: 0, explain: '询问“也有……吗”时用 도：빨간색도 있어요?（也有红色吗？）。' },
          { q: '카드 ___ 계산해 주세요.', options: ['로', '를', '에', '가'], answer: 0, explain: '表示手段、方式用 로/으로：카드로 계산해 주세요（请刷卡结账）。' }
        ],
        speaking: [
          { text: '이 옷 얼마예요?', zh: '这件衣服多少钱？', tip: '疑问句尾自然上扬，但不要过度夸张。' },
          { text: '조금 더 큰 사이즈로 보여 주세요.', zh: '请给我看稍微大一点的尺码。', tip: '「큰」的收音 ㄴ 收住，再接 사이즈로。' }
        ],
        listening: [
          { audio: '이 가방은 삼만 오천 원입니다.', q: '가방은 얼마입니까?', options: ['35,000원', '53,000원', '30,500원'], answer: 0, zh: '这个包是 35,000 韩元。' },
          { audio: '카드로 계산하시겠어요, 현금으로 하시겠어요?', q: '직원이 무엇을 묻고 있습니까?', options: ['결제 방법', '사이즈', '배송'], answer: 0, zh: '您要刷卡还是付现金？' }
        ]
      },
      {
        id: 'ko-a1-u6',
        title: '길 찾기',
        zh: '路线与交通',
        blurb: '问公交站、过马路、步行距离，用最简单的句子找到方向。',
        vocab: [
          { v: '길', r: 'gil', m: '路', ex: '이 길로 가세요.', exZh: '请走这条路。' },
          { v: '건너편', r: 'geonneopyeon', m: '对面', ex: '길 건너편에 있어요.', exZh: '在马路对面。' },
          { v: '신호등', r: 'sinhodeung', m: '红绿灯', ex: '신호등에서 건너세요.', exZh: '在红绿灯处过马路。' },
          { v: '버스', r: 'beoseu', m: '公交车', ex: '버스로 가요.', exZh: '坐公交去。' },
          { v: '정류장', r: 'jeongnyujang', m: '车站', ex: '버스 정류장은 저기예요.', exZh: '公交站在那边。' },
          { v: '걸어서', r: 'georeoseo', m: '步行', ex: '걸어서 십 분 걸려요.', exZh: '走路十分钟。' }
        ],
        grammar: [
          { q: '여기 ___ 어떻게 가요?', options: ['서', '에', '를', '도'], answer: 0, explain: '「여기서」表示“从这里”，서 是起点助词 에서 的缩略。' },
          { q: '버스 정류장은 길 ___ 있어요.', options: ['건너편에', '건너편을', '건너편이', '건너편으로'], answer: 0, explain: '位置用 에：길 건너편에 있어요（在马路对面）。' },
          { q: '여기서 똑바로 ___ 가세요.', options: ['걸어서', '걷고', '걸으면', '걸어도'], answer: 0, explain: '表示方式「走着去」用 걸어서：걸어서 가세요。' }
        ],
        speaking: [
          { text: '여기서 버스 정류장까지 걸어서 갈 수 있어요?', zh: '从这里能走到公交站吗？', tip: '「까지」表示到……为止，接在场所后面。' },
          { text: '신호등에서 오른쪽으로 가세요.', zh: '请在红绿灯处往右走。', tip: '「오른쪽으로」的方向助词 로 要读得清。' }
        ],
        listening: [
          { audio: '여기서 두 블록 걸어가면 오른쪽에 약국이 있어요.', q: '약국은 어디에 있습니까?', options: ['오른쪽', '왼쪽', '건너편'], answer: 0, zh: '从这里走两个街区，右边就是药店。' },
          { audio: '버스로 두 정거장 가세요.', q: '어떻게 가라고 합니까?', options: ['버스로', '지하철로', '걸어서'], answer: 0, zh: '请坐公交坐两站。' }
        ]
      }
    ]
  },
  {
    id: 'A2',
    title: '进阶',
    desc: '在城市与职场中说清方向、时间与安排。',
    units: [
      {
        id: 'ko-a2-u1',
        title: '도시 산책',
        zh: '城市漫游',
        blurb: '问路、换乘、看地图，用韩语在首尔的街头自由穿行。',
        vocab: [
          { v: '역', r: 'yeok', m: '车站', ex: '역은 어디에 있어요?', exZh: '车站在哪里？' },
          { v: '돌다', r: 'dolda', m: '转弯', ex: '오른쪽으로 도세요.', exZh: '请右转。' },
          { v: '직진', r: 'jikjin', m: '直走', ex: '이 길로 직진하세요.', exZh: '请沿这条路直走。' },
          { v: '모퉁이', r: 'motungi', m: '街角', ex: '두 번째 모퉁이에서 도세요.', exZh: '在第二个街角转弯。' },
          { v: '지하철', r: 'jihacheol', m: '地铁', ex: '지하철을 타세요.', exZh: '请坐地铁。' },
          { v: '지도', r: 'jido', m: '地图', ex: '지도를 보여 주세요.', exZh: '请给我看地图。' }
        ],
        grammar: [
          { q: '역은 ___ 있습니까?', options: ['어디에', '무엇을', '누구를', '언제'], answer: 0, explain: '询问地点用「어디에」，搭配 있다 表示“在哪里”。' },
          { q: '이 길로 쭉 ___ 주세요.', options: ['가', '가서', '가면', '갔'], answer: 0, explain: '「가 주세요」表示请对方做某事，用动词原形 가。' },
          { q: '두 번째 모퉁이 ___ 오른쪽으로 도세요.', options: ['에서', '를', '에', '으로'], answer: 0, explain: '动作发生的场所/起点用 에서：모퉁이에서 도세요。' }
        ],
        speaking: [
          { text: '실례합니다, 역에 어떻게 가요?', zh: '打扰一下，请问怎么去车站？', tip: '「실례합니다」适合向陌生人开口。' },
          { text: '이 길로 쭉 가서 두 번째 모퉁이에서 오른쪽으로 도세요.', zh: '沿这条路直走，在第二个街角右转。', tip: '数字「두 번째」要读清楚。' }
        ],
        listening: [
          { audio: '지하철을 타고 중앙역까지 가서 갈아타세요.', q: '어디에서 갈아탑니까?', options: ['중앙역', '녹색공원', '시청'], answer: 0, zh: '坐地铁到中央站，然后在那里换乘。' },
          { audio: '이 길로 직진하면 왼쪽에 큰 공원이 보입니다.', q: '공원은 어느 쪽에 있습니까?', options: ['왼쪽', '오른쪽', '정면'], answer: 0, zh: '沿这条路直走，左边会看到一个很大的公园。' }
        ]
      },
      {
        id: 'ko-a2-u2',
        title: '일과 일정',
        zh: '工作与日程',
        blurb: '调整会议、对齐截止日期，把职场沟通说得体面又明确。',
        vocab: [
          { v: '회의', r: 'hoeui', m: '会议', ex: '회의는 열 시에 시작합니다.', exZh: '会议十点开始。' },
          { v: '마감', r: 'magam', m: '截止', ex: '마감은 금요일입니다.', exZh: '截止日期是周五。' },
          { v: '일정', r: 'iljeong', m: '日程', ex: '오전에는 일정이 있어요.', exZh: '上午有安排。' },
          { v: '비어 있다', r: 'bieo itda', m: '有空', ex: '두 시 이후에는 비어 있어요.', exZh: '两点以后有空。' },
          { v: '업무', r: 'eommu', m: '工作；业务', ex: '업무를 마치고 갈게요.', exZh: '工作结束后去。' },
          { v: '팀', r: 'tim', m: '团队', ex: '팀과 상의할게요.', exZh: '我会和团队商量。' }
        ],
        grammar: [
          { q: '회의는 열 시 ___ 시작합니다.', options: ['에', '에서', '부터', '까지'], answer: 0, explain: '具体时间点用 에：열 시에 시작합니다。' },
          { q: '금요일로 회의를 ___ 수 있습니까?', options: ['옮길', '옮기', '옮겼', '옮긴'], answer: 0, explain: '「옮길 수 있다」表示“能挪动”，需要将来/可能义。' },
          { q: '오전에는 ___ , 오후에는 괜찮습니다.', options: ['비어 있어요', '비워 주세요', '비웠어요', '비우세요'], answer: 0, explain: '描述状态用「비어 있어요」；后面用「괜찮습니다」转折。' }
        ],
        speaking: [
          { text: '죄송하지만 회의를 금요일 오후로 옮길 수 있을까요?', zh: '不好意思，可以把会议挪到周五下午吗？', tip: '先道歉再请求，是韩语职场的常见礼貌。' },
          { text: '오전에는 일정이 있지만 두 시 이후에는 비어 있어요.', zh: '上午有安排，但两点以后有空。', tip: '「지만」转折，前句收得干脆一点。' }
        ],
        listening: [
          { audio: '마감일이 다음 주 수요일로 변경되었습니다.', q: '마감일은 언제로 바뀌었습니까?', options: ['다음 주 수요일', '이번 주 금요일', '다음 주 월요일'], answer: 0, zh: '截止日期改到了下周三。' },
          { audio: '회의는 금요일 오후 두 시로 바뀌었습니다. 목요일이 아닙니다.', q: '회의는 언제입니까?', options: ['금요일 오후', '목요일 오전', '월요일 아침'], answer: 0, zh: '会议改到周五下午两点，不是周四。' }
        ]
      },
      {
        id: 'ko-a2-u3',
        title: '병원과 약국',
        zh: '看病买药',
        blurb: '描述症状、说明服药方法，把身体不适当场讲清楚。',
        vocab: [
          { v: '아프다', r: 'apeuda', m: '疼；不舒服', ex: '머리가 아파요.', exZh: '头疼。' },
          { v: '열', r: 'yeol', m: '发烧；热度', ex: '열이 있습니다.', exZh: '发烧了。' },
          { v: '약', r: 'yak', m: '药', ex: '이 약을 드세요.', exZh: '请吃这个药。' },
          { v: '처방전', r: 'cheobangjeon', m: '处方', ex: '처방전이 필요해요.', exZh: '需要处方。' },
          { v: '증상', r: 'jeungsang', m: '症状', ex: '증상을 말씀해 주세요.', exZh: '请说说症状。' },
          { v: '하루에', r: 'harue', m: '每天', ex: '하루에 세 번 드세요.', exZh: '每天吃三次。' }
        ],
        grammar: [
          { q: '어제부터 머리 ___ 아파요.', options: ['가', '를', '에', '도'], answer: 0, explain: '身体部位作主语时用主格助词 가/이：머리가 아파요。' },
          { q: '이 약을 하루에 두 ___ 드세요.', options: ['번', '개', '명', '잔'], answer: 0, explain: '次数用「번」：두 번（两次），「개」用于物品个数。' },
          { q: '열이 있을 ___ 병원에 가세요.', options: ['때', '것', '수', '줄'], answer: 0, explain: '「-을 때」表示“在……的时候”：열이 있을 때。' }
        ],
        speaking: [
          { text: '어제부터 목이 아프고 열이 있어요.', zh: '从昨天开始嗓子疼，还发烧。', tip: '「아프고」把两个症状并列，语速保持均匀。' },
          { text: '이 약은 식후에 하루 세 번 드세요.', zh: '这个药请饭后每天吃三次。', tip: '「식후에」的 후 读得短，紧接着说次数。' }
        ],
        listening: [
          { audio: '약을 먹고 이틀 쉬세요.', q: '의사의 지시는 무엇입니까?', options: ['약을 먹고 이틀 쉬기', '바로 퇴원하기', '운동을 많이 하기'], answer: 0, zh: '请吃药并休息两天。' },
          { audio: '처방전이 있어야 약을 받을 수 있어요.', q: '약을 받으려면 무엇이 필요합니까?', options: ['처방전', '신분증', '보험증'], answer: 0, zh: '必须有处方才能拿药。' }
        ]
      },
      {
        id: 'ko-a2-u4',
        title: '여행 준비',
        zh: '旅行准备',
        blurb: '订酒店、看航班、换外币，把出发前的沟通一次说清。',
        vocab: [
          { v: '예약', r: 'yeyak', m: '预约', ex: '호텔을 예약했어요.', exZh: '订了酒店。' },
          { v: '항공권', r: 'hanggonggwon', m: '机票', ex: '항공권을 샀어요.', exZh: '买了机票。' },
          { v: '숙소', r: 'sukso', m: '住宿', ex: '숙소는 어디예요?', exZh: '住哪里？' },
          { v: '출발', r: 'chulbal', m: '出发', ex: '출발은 아홉 시예요.', exZh: '九点出发。' },
          { v: '짐', r: 'jim', m: '行李', ex: '짐이 너무 많아요.', exZh: '行李太多了。' },
          { v: '환전', r: 'hwanjeon', m: '换汇', ex: '공항에서 환전했어요.', exZh: '在机场换了钱。' }
        ],
        grammar: [
          { q: '호텔을 미리 ___ 주세요.', options: ['예약해', '예약하고', '예약하면', '예약해서'], answer: 0, explain: '「-아/어 주세요」表示请对方做某事：예약해 주세요。' },
          { q: '비행기는 몇 시 ___ 출발해요?', options: ['에', '에서', '까지', '부터'], answer: 0, explain: '具体时间点用 에：몇 시에 출발해요。' },
          { q: '짐이 ___ 많아서 택시를 탔어요.', options: ['너무', '별로', '전혀', '아직'], answer: 0, explain: '「너무」表示程度过高：짐이 너무 많아서…' }
        ],
        speaking: [
          { text: '내일 아침 비행기라서 일찍 공항에 가야 해요.', zh: '明天早上的飞机，所以要早点去机场。', tip: '「라서」表示原因，前句的 아침 读得平稳。' },
          { text: '숙소를 미리 예약해 두는 게 좋겠어요.', zh: '最好提前把住宿订好。', tip: '「해 두는 게」连读自然，表示提前做好。' }
        ],
        listening: [
          { audio: '출발이 두 시간 연착되었습니다.', q: '무슨 일이 일어났습니까?', options: ['출발이 연착되었다', '비행기가 취소되었다', '게이트가 바뀌었다'], answer: 0, zh: '起飞延迟了两个小时。' },
          { audio: '환전은 공항에서 하면 수수료가 더 비싸요.', q: '말하는 사람의 조언은?', options: ['공항 밖에서 환전하기', '환전하지 않기', '공항에서 환전하기'], answer: 0, zh: '在机场换汇手续费更贵。' }
        ]
      },
      {
        id: 'ko-a2-u5',
        title: '취미와 주말',
        zh: '爱好与周末',
        blurb: '聊周末安排、约朋友一起活动，让日常对话更自然。',
        vocab: [
          { v: '등산', r: 'deungsan', m: '登山', ex: '주말에 등산을 해요.', exZh: '周末去登山。' },
          { v: '영화관', r: 'yeonghwagwan', m: '电影院', ex: '영화관에서 만나요.', exZh: '在电影院见。' },
          { v: '자전거', r: 'jajeongeo', m: '自行车', ex: '자전거를 타요.', exZh: '骑自行车。' },
          { v: '주말', r: 'jumal', m: '周末', ex: '주말에는 쉬어요.', exZh: '周末休息。' },
          { v: '보통', r: 'botong', m: '通常', ex: '보통 집에서 쉬어요.', exZh: '通常在家休息。' },
          { v: '함께', r: 'hamkke', m: '一起', ex: '함께 가요.', exZh: '一起去吧。' }
        ],
        grammar: [
          { q: '주말에는 보통 ___ 해요?', options: ['뭐', '누구', '언제', '어디'], answer: 0, explain: '询问“做什么”用 뭐 해요?（做什么？）。' },
          { q: '같이 영화를 ___ ?', options: ['볼까요', '보세요', '봤어요', '보다가'], answer: 0, explain: '「-을까요?」用于提议或征求对方意见：같이 볼까요?（一起看吧？）' },
          { q: '저는 주말 ___ 등산을 해요.', options: ['에는', '에서', '를', '로'], answer: 0, explain: '「주말에는」表示“在周末这个时间”，에 是时间助词。' }
        ],
        speaking: [
          { text: '주말에 보통 뭐 해요?', zh: '周末通常做什么？', tip: '「뭐 해요」连读成 [뭐 해요]，不要逐字停顿。' },
          { text: '토요일에는 친구와 같이 영화를 볼까 해요.', zh: '周六打算和朋友一起看电影。', tip: '「볼까 해요」表示打算，语气比“我要”更柔和。' }
        ],
        listening: [
          { audio: '주말에는 보통 집에서 쉬고, 가끔 자전거를 타요.', q: '주말에 보통 무엇을 합니까?', options: ['집에서 쉬기', '등산하기', '영화 보기'], answer: 0, zh: '周末通常在家休息，偶尔骑自行车。' },
          { audio: '이번 주말에 같이 등산 갈래요?', q: '무엇을 제안하고 있습니까?', options: ['같이 등산 가기', '같이 영화 보기', '집에서 쉬기'], answer: 0, zh: '这个周末一起去登山吗？' }
        ]
      },
      {
        id: 'ko-a2-u6',
        title: '전화와 메시지',
        zh: '电话与消息',
        blurb: '打电话、留言、回消息，处理不在面对面时的沟通。',
        vocab: [
          { v: '전화', r: 'jeonhwa', m: '电话', ex: '나중에 전화할게요.', exZh: '我晚点打电话。' },
          { v: '메시지', r: 'mesiji', m: '消息', ex: '메시지를 보냈어요.', exZh: '发了消息。' },
          { v: '바쁘다', r: 'bappeuda', m: '忙', ex: '지금 바빠요.', exZh: '现在很忙。' },
          { v: '나중에', r: 'najunge', m: '稍后', ex: '나중에 다시 연락해요.', exZh: '稍后再联系。' },
          { v: '연락', r: 'yeollak', m: '联系', ex: '연락 주세요.', exZh: '请联系我。' },
          { v: '받다', r: 'batda', m: '收到；接', ex: '전화를 받았어요.', exZh: '接了电话。' }
        ],
        grammar: [
          { q: '지금 전화를 ___ 수 있어요?', options: ['받', '받고', '받아서', '받으면'], answer: 0, explain: '「받을 수 있다」表示“能接（电话）」，用动词原形 받。' },
          { q: '나중에 다시 ___ 주세요.', options: ['연락해', '연락하고', '연락하면', '연락해서'], answer: 0, explain: '「연락해 주세요」是“请联系我”的固定礼貌说法。' },
          { q: '___ 전에 메시지를 보냈어요.', options: ['한 시간', '하나 시간', '일 시간', '한 시'], answer: 0, explain: '“一小时”用「한 시간」；「한 시」表示“一点钟”。' }
        ],
        speaking: [
          { text: '지금 통화 괜찮으세요? 아니면 나중에 다시 걸게요.', zh: '现在通话方便吗？不然我稍后再打。', tip: '「괜찮으세요」上扬表示询问，后半句语速放慢。' },
          { text: '문자 확인하고 답장 주세요.', zh: '请查看短信后回复我。', tip: '「확인하고」连接两个动作，and 的位置稍作停顿。' }
        ],
        listening: [
          { audio: '지금 회의 중이라서 나중에 전화드릴게요.', q: '언제 다시 전화하겠습니까?', options: ['나중에', '지금 바로', '내일 아침'], answer: 0, zh: '现在在开会，稍后给您回电话。' },
          { audio: '메시지는 받았는데 아직 확인하지 못했어요.', q: '메시지 상태는?', options: ['받았지만 확인 전', '보내지 않았다', '이미 답장했다'], answer: 0, zh: '消息收到了，但还没看。' }
        ]
      }
    ]
  },
  {
    id: 'B1',
    title: '高阶',
    desc: '表达立场、补充依据，把旅行故事讲出画面与温度。',
    units: [
      {
        id: 'ko-b1-u1',
        title: '의견 말하기',
        zh: '表达观点',
        blurb: '先认可再转折，用依据与视角撑起自己的主张。',
        vocab: [
          { v: '찬성', r: 'chanseong', m: '赞成', ex: '저는 그 안에 찬성합니다.', exZh: '我赞成那个方案。' },
          { v: '의견', r: 'uigyeon', m: '意见', ex: '의견을 말씀해 주세요.', exZh: '请说说您的意见。' },
          { v: '근거', r: 'geungeo', m: '依据', ex: '근거가 부족합니다.', exZh: '依据不足。' },
          { v: '그러나', r: 'geureona', m: '然而', ex: '그러나 다른 관점도 있습니다.', exZh: '然而，也有不同的视角。' },
          { v: '관점', r: 'gwanjeom', m: '视角', ex: '다른 관점에서 생각해 봅시다.', exZh: '从另一个角度想一想。' },
          { v: '토론', r: 'toron', m: '讨论', ex: '토론을 계속합시다.', exZh: '继续讨论吧。' }
        ],
        grammar: [
          { q: '말씀은 이해합니다 ___, 제 생각은 다릅니다.', options: ['그러나', '그래서', '왜냐하면', '만약'], answer: 0, explain: '前后是转折关系，用 그러나（然而）。' },
          { q: '충분한 근거 ___ 필요합니다.', options: ['가', '를', '에', '로'], answer: 0, explain: '「근거가 필요합니다」中，必要的对象用主格助词 가。' },
          { q: '자료 ___ 바탕으로 토론합시다.', options: ['를', '에', '에서', '로'], answer: 0, explain: '固定表达「자료를 바탕으로」，表示“以资料为基础”。' }
        ],
        speaking: [
          { text: '말씀은 이해하지만, 제 관점에서는 조금 다릅니다.', zh: '我理解您说的，但从我的视角看略有不同。', tip: '先承接对方，再给出不同意见，语气更稳。' },
          { text: '결론을 내리기 전에 근거가 더 필요하다고 생각합니다.', zh: '我认为在下结论之前需要更多依据。', tip: '「생각합니다」让主张更柔和。' }
        ],
        listening: [
          { audio: '그러나 그 의견에는 충분한 근거가 있다고 보기 어렵습니다.', q: '말하는 사람의 생각은 무엇입니까?', options: ['근거가 부족하다', '전적으로 찬성한다', '토론을 그만두자'], answer: 0, zh: '然而，很难说那个意见有充分的依据。' },
          { audio: '관점을 바꾸면 같은 자료도 다르게 읽힐 수 있습니다.', q: '말하는 사람이 강조하는 것은?', options: ['관점에 따라 해석이 달라진다', '자료에는 의미가 없다', '분석을 중단해야 한다'], answer: 0, zh: '换个视角，同样的资料也可能有不同的解读。' }
        ]
      },
      {
        id: 'ko-b1-u2',
        title: '여행 이야기',
        zh: '旅行故事',
        blurb: '用进行、条件与感叹，把旅途中的瞬间讲得鲜活。',
        vocab: [
          { v: '여행', r: 'yeohaeng', m: '旅行', ex: '잊지 못할 여행이었습니다.', exZh: '这是一次难忘的旅行。' },
          { v: '내려다보다', r: 'naeryeodaboda', m: '俯瞰', ex: '언덕에서 마을을 내려다봤어요.', exZh: '从山坡俯瞰村庄。' },
          { v: '산책', r: 'sanchaek', m: '散步', ex: '강변을 산책했어요.', exZh: '沿着江边散步。' },
          { v: '만남', r: 'mannam', m: '相遇', ex: '작은 책방과의 만남.', exZh: '与小书店的相遇。' },
          { v: '기념품', r: 'ginyeompum', m: '纪念品', ex: '가족에게 기념품을 샀어요.', exZh: '给家人买了纪念品。' },
          { v: '선명하다', r: 'seonmyeonghada', m: '鲜明', ex: '기억이 선명하게 남아요.', exZh: '记忆鲜明地留存着。' }
        ],
        grammar: [
          { q: '옛 마을을 ___ 작은 책방을 만났습니다.', options: ['걷다가', '걷고', '걸어서', '걸으면'], answer: 0, explain: '「걷다가」表示在走路的过程中发生了另一件事。' },
          { q: '바다에 ___ 마을은 도자기로 유명합니다.', options: ['면한', '면하고', '면해서', '면하려'], answer: 0, explain: '「바다에 면한 마을」意为“面朝大海的村庄”，用冠形词形 면한。' },
          { q: '시간이 더 ___ 좋겠어요.', options: ['있었으면', '있어서', '있고', '있으니까'], answer: 0, explain: '「있었으면 좋겠어요」表示与现实相反的愿望。“要是有更多时间就好了。”' }
        ],
        speaking: [
          { text: '옛 마을을 산책하다가 작은 책방을 만났습니다.', zh: '在老城散步时，偶遇了一家小书店。', tip: '「산책하다가」连读自然，带出画面感。' },
          { text: '언덕에서 내려다본 풍경은 지금도 선명하게 기억나요.', zh: '从山坡俯瞰的风景，我至今记得很清楚。', tip: '「지금도」稍作强调，情感更自然。' }
        ],
        listening: [
          { audio: '첫날은 하루 종일 비가 왔지만, 다음 날 아침 마을은 빛나고 있었습니다.', q: '첫날 날씨는 어땠습니까?', options: ['비가 왔다', '맑았다', '눈이 왔다'], answer: 0, zh: '第一天下了一整天雨，但第二天早晨村庄闪闪发光。' },
          { audio: '계획은 바뀌었지만 덕분에 멋진 가게를 만났습니다.', q: '말하는 사람은 어떻게 느끼고 있습니까?', options: ['계획 변경을 긍정적으로 본다', '변경에 화가 났다', '여행을 그만두고 싶다'], answer: 0, zh: '计划虽然变了，但正因为如此才遇到了一家很棒的店。' }
        ]
      },
      {
        id: 'ko-b1-u3',
        title: '감정과 공감',
        zh: '情绪与共情',
        blurb: '听懂对方的情绪，回应、安慰并适度表达自己的感受。',
        vocab: [
          { v: '기쁘다', r: 'gippeuda', m: '高兴', ex: '좋은 소식을 듣고 기뻤어요.', exZh: '听到好消息很开心。' },
          { v: '속상하다', r: 'soksanghada', m: '难过；心烦', ex: '많이 속상하셨겠어요.', exZh: '您一定很难过吧。' },
          { v: '걱정되다', r: 'geokjeongdoeda', m: '担心', ex: '요즘 걱정되는 일이 있어요.', exZh: '最近有件担心的事。' },
          { v: '공감', r: 'gonggam', m: '共情', ex: '저도 공감해요.', exZh: '我也感同身受。' },
          { v: '위로', r: 'wiro', m: '安慰', ex: '위로가 되었어요.', exZh: '得到了安慰。' },
          { v: '솔직히', r: 'soljikhi', m: '坦白说', ex: '솔직히 말하면 저도 걱정돼요.', exZh: '坦白说我也担心。' }
        ],
        grammar: [
          { q: '그 소식을 듣고 정말 ___ .', options: ['기뻤어요', '기쁘고', '기쁘면', '기뻐서'], answer: 0, explain: '描述已经发生的心情用过去式「기뻤어요」。' },
          { q: '많이 ___ 것 같아요.', options: ['힘드신', '힘들', '힘들고', '힘들면'], answer: 0, explain: '推测对方感受时用敬语冠形词「힘드신 것 같아요」（看起来您很辛苦）。' },
          { q: '걱정하지 ___ 괜찮아요.', options: ['마세요', '않아요', '말고', '못해요'], answer: 0, explain: '「걱정하지 마세요」是“别担心”的固定说法。' }
        ],
        speaking: [
          { text: '많이 속상하셨겠어요. 제가 옆에 있을게요.', zh: '您一定很难过吧，我会陪在您身边。', tip: '「겠어요」表示推测与体谅，语气要放软。' },
          { text: '솔직히 말하면, 저도 그 일이 걱정돼요.', zh: '坦白说，我也担心那件事。', tip: '「솔직히 말하면」后停顿半拍，再说真心话。' }
        ],
        listening: [
          { audio: '괜찮아요. 다 잘 될 거예요.', q: '이 말은 어떤 기능을 합니까?', options: ['위로하기', '거절하기', '명령하기'], answer: 0, zh: '没关系的，一切都会好起来的。' },
          { audio: '요즘 일이 많아서 좀 지쳤어요.', q: '말하는 사람의 상태는?', options: ['지쳐 있다', '아주 신난다', '아무 감정이 없다'], answer: 0, zh: '最近工作很多，有点累了。' }
        ]
      },
      {
        id: 'ko-b1-u4',
        title: '문제 해결',
        zh: '问题与沟通',
        blurb: '说清问题、提出诉求、确认流程，把矛盾处理得体面。',
        vocab: [
          { v: '문제', r: 'munje', m: '问题', ex: '제품에 문제가 있어요.', exZh: '产品有问题。' },
          { v: '환불', r: 'hwanbul', m: '退款', ex: '환불하고 싶어요.', exZh: '我想退款。' },
          { v: '교환', r: 'gyohwan', m: '换货', ex: '교환이 가능합니까?', exZh: '可以换货吗？' },
          { v: '확인', r: 'hwagin', m: '确认', ex: '확인 후에 연락드릴게요.', exZh: '确认后再联系您。' },
          { v: '해결', r: 'haegyeol', m: '解决', ex: '문제가 해결되었어요.', exZh: '问题解决了。' },
          { v: '불편', r: 'bulpyeon', m: '不便', ex: '불편을 드려 죄송합니다.', exZh: '给您带来不便很抱歉。' }
        ],
        grammar: [
          { q: '제품에 문제 ___ 있어서 환불하고 싶어요.', options: ['가', '를', '에', '도'], answer: 0, explain: '「문제가 있다」是固定搭配，问题作主语用 가。' },
          { q: '교환이 ___ 환불이 가능합니다.', options: ['어려우면', '어려워서', '어려우니까', '어려웠더니'], answer: 0, explain: '「어려우면」表示条件：如果换货困难，可以退款。' },
          { q: '불편을 ___ 죄송합니다.', options: ['드려서', '들어서', '드리면', '드리고'], answer: 0, explain: '「불편을 드려서 죄송합니다」是客服固定道歉表达。' }
        ],
        speaking: [
          { text: '주문한 상품이 파손되어 왔어요. 교환할 수 있을까요?', zh: '收到的商品破损了，可以换货吗？', tip: '「파손되어」是书面说法，口语也可说 깨져서 왔어요。' },
          { text: '확인 후에 다시 연락드리겠습니다.', zh: '确认后再联系您。', tip: '「연락드리겠습니다」比 연락할게요 更正式。' }
        ],
        listening: [
          { audio: '영수증이 있으면 교환이 가능합니다.', q: '교환 조건은 무엇입니까?', options: ['영수증이 있어야 한다', '카드로 결제해야 한다', '포장을 뜯어야 한다'], answer: 0, zh: '有收据就可以换货。' },
          { audio: '시스템 오류로 결제가 두 번 되었습니다.', q: '어떤 문제가 발생했습니까?', options: ['중복 결제', '배송 지연', '상품 파손'], answer: 0, zh: '因系统错误，付款被扣了两次。' }
        ]
      },
      {
        id: 'ko-b1-u5',
        title: '미디어와 사회',
        zh: '媒体与社会',
        blurb: '讨论信息、广告与舆论的影响，练习有依据地评价。',
        vocab: [
          { v: '뉴스', r: 'nyuseu', m: '新闻', ex: '뉴스를 비판적으로 봐요.', exZh: '批判性地看新闻。' },
          { v: '영향', r: 'yeonghyang', m: '影响', ex: '광고는 선택에 영향을 줍니다.', exZh: '广告会影响选择。' },
          { v: '광고', r: 'gwanggo', m: '广告', ex: '광고가 너무 많아요.', exZh: '广告太多了。' },
          { v: '비판', r: 'bipan', m: '批评', ex: '비판적으로 읽어야 합니다.', exZh: '应该批判性地阅读。' },
          { v: '정보', r: 'jeongbo', m: '信息', ex: '정보를 비교해 보세요.', exZh: '请比较一下信息。' },
          { v: '신뢰', r: 'sinroe', m: '信任', ex: '신뢰할 수 있는 출처인지 확인하세요.', exZh: '请确认来源是否可信。' }
        ],
        grammar: [
          { q: '미디어는 우리 생각에 큰 영향 ___ 줍니다.', options: ['을', '를', '이', '에'], answer: 0, explain: '「영향을 주다」是固定搭配，影响作宾语用 을。' },
          { q: '정보 ___ 신뢰할 수 있는지 확인해야 합니다.', options: ['가', '를', '에', '로'], answer: 0, explain: '「정보가 신뢰할 수 있는지」中，信息作主语用 가。' },
          { q: '광고를 보고 사 ___ 경우가 많아요.', options: ['는', '고', '면', '서'], answer: 0, explain: '「사는 경우」是“购买的情况”，用冠形词形 는 修饰 경우。' }
        ],
        speaking: [
          { text: '미디어의 영향이 크기 때문에 비판적으로 읽어야 합니다.', zh: '因为媒体影响很大，所以应该批判性地阅读。', tip: '「크기 때문에」表示原因，语速在这里稍微放缓。' },
          { text: '광고만 보고 결정하기보다 여러 정보를 비교해 보세요.', zh: '与其只看广告决定，不如多比较几份信息。', tip: '「-기보다」表示比较，“与其……不如……”。' }
        ],
        listening: [
          { audio: '모든 정보가 사실은 아닙니다.', q: '말하는 사람의 요지는?', options: ['정보를 검증해야 한다', '정보를 모두 믿어야 한다', '정보는 필요 없다'], answer: 0, zh: '并非所有信息都是事实。' },
          { audio: '광고는 우리의 선택에 영향을 줍니다.', q: '무엇에 대한 이야기입니까?', options: ['광고의 영향', '뉴스의 속도', '정보의 가격'], answer: 0, zh: '广告会影响我们的选择。' }
        ]
      },
      {
        id: 'ko-b1-u6',
        title: '꿈과 계획',
        zh: '梦想与计划',
        blurb: '谈未来目标、经历与坚持，把长期计划说得具体。',
        vocab: [
          { v: '꿈', r: 'kkum', m: '梦想', ex: '제 꿈은 한국에서 일하는 것입니다.', exZh: '我的梦想是在韩国工作。' },
          { v: '목표', r: 'mokpyo', m: '目标', ex: '올해 목표를 세웠어요.', exZh: '定了今年的目标。' },
          { v: '계획', r: 'gyehoek', m: '计划', ex: '여행 계획이 있어요.', exZh: '有计划去旅行。' },
          { v: '도전', r: 'dojeon', m: '挑战', ex: '새로운 일에 도전해요.', exZh: '挑战新事物。' },
          { v: '노력', r: 'noryeok', m: '努力', ex: '꾸준히 노력하고 있어요.', exZh: '一直在坚持努力。' },
          { v: '경험', r: 'gyeongheom', m: '经验', ex: '좋은 경험이 되었어요.', exZh: '成了很好的经验。' }
        ],
        grammar: [
          { q: '앞으로 한국에서 ___ 계획이에요.', options: ['일할', '일하고', '일하면', '일해서'], answer: 0, explain: '「-을 계획이다」表示计划，用冠形词形 일할。' },
          { q: '목표를 ___ 노력하고 있어요.', options: ['위해', '때문에', '동안', '대로'], answer: 0, explain: '「-기 위해」表示目的：목표를 이루기 위해（为了实现目标）。' },
          { q: '힘들 ___ 계속 도전하고 싶어요.', options: ['어도', '어서', '으면', '지만'], answer: 0, explain: '「힘들어도」表示让步：即使辛苦也继续挑战。' }
        ],
        speaking: [
          { text: '제 꿈은 한국에서 경험을 쌓는 것입니다.', zh: '我的梦想是在韩国积累经验。', tip: '「쌓는 것입니다」书面而正式，句尾平稳收住。' },
          { text: '힘들어도 목표를 이루기 위해 계속 도전할 거예요.', zh: '即使辛苦，我也会为了实现目标继续挑战。', tip: '「힘들어도」的 어도 连读自然，重音放在 목표。' }
        ],
        listening: [
          { audio: '실패도 경험이라고 생각해요.', q: '말하는 사람의 생각은?', options: ['실패도 경험이다', '실패는 끝이다', '경험은 필요 없다'], answer: 0, zh: '我觉得失败也是一种经验。' },
          { audio: '올해 목표는 매일 삼십 분씩 공부하는 거예요.', q: '올해 목표는 무엇입니까?', options: ['매일 30분 공부', '매주 시험 보기', '한국에 가기'], answer: 0, zh: '今年的目标是每天学习三十分钟。' }
        ]
      }
    ]
  }
];

// —— 每单元固定三节课：语境输入 / 结构输出 / 综合实战 ——
const LESSON_TEMPLATE = [
  { key: 'l1', title: '语境输入', note: '先听懂，再模仿语感', modes: ['vocab', 'listening'], minutes: 8 },
  { key: 'l2', title: '结构输出', note: '把句型练成肌肉记忆', modes: ['grammar', 'speaking'], minutes: 9 },
  { key: 'l3', title: '综合实战', note: '四种练习串联，完成单元挑战', modes: ['vocab', 'grammar', 'speaking', 'listening'], minutes: 14 }
];

export const UNITS = [];
LEVELS.forEach((level) => {
  level.units.forEach((unit) => {
    unit.level = level.id;
    unit.levelTitle = level.title;
    unit.levelDesc = level.desc;
    unit.lessons = LESSON_TEMPLATE.map((t) => ({
      id: unit.id + '-' + t.key,
      key: t.key,
      title: t.title,
      note: t.note,
      modes: t.modes.slice(),
      minutes: t.minutes
    }));
    UNITS.push(unit);
  });
});

export const UNIT_MAP = UNITS.reduce((acc, u) => { acc[u.id] = u; return acc; }, {});

// 单元总练习数：l1(2) + l2(2) + l3(4) = 8 个模式
export const UNIT_MODE_TOTAL = 8;

export function unitById(id) {
  return UNIT_MAP[id] || null;
}

export function levelIndexById(levelId) {
  return LEVELS.findIndex((l) => l.id === levelId);
}

export function levelProgress(progress, level) {
  if (!level.units.length) return 0;
  // unitCompletion 返回的已是 0-100 百分比，这里取各级单元的平均值即可
  const sum = level.units.reduce((acc, u) => acc + unitCompletion(progress, u), 0);
  return Math.round(sum / level.units.length);
}

export function unitCompletion(progress, unit) {
  const unitProg = (progress || {})[unit.id] || {};
  let done = 0;
  unit.lessons.forEach((lesson) => {
    const lessonProg = unitProg[lesson.id] || {};
    lesson.modes.forEach((mode) => {
      if (lessonProg[mode] && lessonProg[mode].completed) done += 1;
    });
  });
  return Math.round((done / UNIT_MODE_TOTAL) * 100);
}

export function lessonCompletion(progress, unit, lesson) {
  const lessonProg = ((progress || {})[unit.id] || {})[lesson.id] || {};
  const done = lesson.modes.filter((mode) => lessonProg[mode] && lessonProg[mode].completed).length;
  return { done, total: lesson.modes.length, pct: Math.round((done / lesson.modes.length) * 100) };
}

// 解锁规则：A1 默认开放；A2 需要 A1 至少 1 个单元达到 50%；B1 需要 A2 至少 2 个单元达到 50%
const UNLOCK_NEED = { 0: 0, 1: 1, 2: 2 };

export function levelUnlockInfo(progress, levelIndex) {
  if (levelIndex <= 0) return { unlocked: true, need: 0, done: 0 };
  const prev = LEVELS[levelIndex - 1];
  const need = UNLOCK_NEED[levelIndex] || 1;
  const done = prev.units.filter((u) => unitCompletion(progress, u) >= 50).length;
  return { unlocked: done >= need, need, done };
}

export function isLevelUnlocked(progress, levelId) {
  const index = levelIndexById(levelId);
  if (index < 0) return false;
  return levelUnlockInfo(progress, index).unlocked;
}

// 四项能力平均分：取每个模式的历史最佳分
export function skillAverages(progress) {
  const acc = { vocab: [], grammar: [], speaking: [], listening: [] };
  Object.values(progress || {}).forEach((unitProg) => {
    Object.values(unitProg || {}).forEach((lessonProg) => {
      MODES.forEach((mode) => {
        const st = lessonProg && lessonProg[mode];
        if (st && st.completed) acc[mode].push(st.best != null ? st.best : (st.score || 0));
      });
    });
  });
  const out = {};
  MODES.forEach((mode) => {
    out[mode] = acc[mode].length
      ? Math.round(acc[mode].reduce((a, b) => a + b, 0) / acc[mode].length)
      : 0;
  });
  out.total = MODES.reduce((sum, mode) => sum + out[mode], 0);
  out.count = MODES.filter((mode) => out[mode] > 0).length;
  return out;
}

export function firstUnfinishedLesson(progress, levelId) {
  const level = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
  for (const unit of level.units) {
    for (const lesson of unit.lessons) {
      const c = lessonCompletion(progress, unit, lesson);
      if (c.done < c.total) {
        const mode = lesson.modes.find((m) => {
          const lp = ((progress || {})[unit.id] || {})[lesson.id] || {};
          return !(lp[m] && lp[m].completed);
        }) || lesson.modes[0];
        return { unit, lesson, mode };
      }
    }
  }
  return null;
}

export const XP_PER_LEVEL = 500;
const LEVEL_TITLES = ['初来者', '晨读者', '行路人', '语感猎手', '街头讲述者', '多语行者', '故事收集家'];

export function levelInfo(xp) {
  const total = Math.max(0, Number(xp) || 0);
  const level = Math.floor(total / XP_PER_LEVEL) + 1;
  const cur = total % XP_PER_LEVEL;
  return {
    level,
    cur,
    need: XP_PER_LEVEL,
    pct: Math.round((cur / XP_PER_LEVEL) * 100),
    title: LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, level - 1)] || '多语行者'
  };
}

// 供课程页按级别取列表时复用
export function unitsOfLevel(levelId) {
  const level = LEVELS.find((l) => l.id === levelId);
  return level ? level.units : [];
}

export { pick };
