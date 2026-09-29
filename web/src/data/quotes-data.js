// 韩剧名句精选库：简短台词引用 + 出处标注 + 教学注释（合理使用范畴）
// roman 一律按音节断句、用「-」连接；color 为该句氛围渐变色 [起, 止]
export const QUOTES = [
  // —— 请回答 1988 ——
  { id: 'q88-1', drama: '请回答1988', year: 2015, theme: '友情', level: '入门', color: ['#F6D365', '#FDA085'],
    ko: '우리는 어른이 되어서도 잊지 말자', roman: 'u-ri-neun eo-reu-ni doe-eo-seo it-ji mal-ja', zh: '就算长大成人，也不要忘记',
    grammar: '-아/어서도：表示「即使…也」，后面接否定，如 잊지 말자（别忘记）',
    vocab: [{ ko: '어른', zh: '大人' }, { ko: '잊다', zh: '忘记' }],
    similar: ['잊지 마요 (别忘记哦)', '기억할게 (我会记得)'] },
  { id: 'q88-2', drama: '请回答1988', year: 2015, theme: '爱情', level: '日常', color: ['#FFB6B9', '#FAE3D9'],
    ko: '좋아하는데 어떡해', roman: 'jo-a-ha-neun-de eo-tteok-hae', zh: '我喜欢你，可怎么办啊',
    grammar: '-는데：铺垫转折，「喜欢是喜欢，可是…」的心动又无奈感',
    vocab: [{ ko: '좋아하다', zh: '喜欢' }, { ko: '어떡하다', zh: '怎么办' }],
    similar: ['마음이 이상해 (心里怪怪的)', '네가 자꾸 생각나 (总想起你)'] },
  { id: 'q88-3', drama: '请回答1988', year: 2015, theme: '人生', level: '进阶', color: ['#FFD3A5', '#FD6585'],
    ko: '결국 우리가 늙는 것은 시간 때문이 아니라 포기 때문이다', roman: 'gyeol-guk u-ri-ga neung-neun geo-sun si-gan ttae-mun-i a-ni-ra po-gi ttae-mun-i-da', zh: '我们终会老去，不是因为我们时间流逝，而是因为放弃',
    grammar: '-기 때문이다：表示原因的书面表达，「是因为…」',
    vocab: [{ ko: '결국', zh: '最终' }, { ko: '포기', zh: '放弃' }],
    similar: ['늦지 않았어 (还不晚)', '지금부터 시작하자 (从现在开始吧)'] },

  // —— 鬼怪 ——
  { id: 'gob-1', drama: '鬼怪', year: 2016, theme: '爱情', level: '日常', color: ['#A6C1EE', '#FBC2EB'],
    ko: '당신의 첫사랑이 되어 주고 싶어', roman: 'dang-sin-ui cheot-sa-rang-i doe-eo ju-go si-peo', zh: '我想成为你的初恋',
    grammar: '-어 주다：为某人做某事，带有为对方付出的语气',
    vocab: [{ ko: '첫사랑', zh: '初恋' }, { ko: '당신', zh: '你（尊称）' }],
    similar: ['내 옆에 있어 줘 (留在我身边)', '사랑해 (我爱你)'] },
  { id: 'gob-2', drama: '鬼怪', year: 2016, theme: '人生', level: '日常', color: ['#89F7FE', '#66A6FF'],
    ko: '살아가면서 눈물도 참아야 해', roman: 'sa-ra-ga-myeon-seo nun-mul-do cham-a-ya hae', zh: '生活下去，也要忍住眼泪',
    grammar: '-(으)면서：表示「一边…一边」或「在…过程中」',
    vocab: [{ ko: '살아가다', zh: '生活下去' }, { ko: '눈물', zh: '眼泪' }],
    similar: ['괜찮아, 울어도 돼 (没关系，可以哭)', '힘내 (加油)'] },
  { id: 'gob-3', drama: '鬼怪', year: 2016, theme: '离别', level: '进阶', color: ['#C2A68C', '#C8B6A6'],
    ko: '그때 그 계절이 그리워질 때면 그곳으로 다시 돌아가', roman: 'geu-ttae geu gye-jeo-ri geu-ri-wo-jil ttae-myeon geu-go-seu-ro da-si dol-a-ga', zh: '当怀念起那个季节时，就回到那个地方去吧',
    grammar: '-(으)ㄹ 때면：表示「到了…的时候」，用于回忆与假设',
    vocab: [{ ko: '계절', zh: '季节' }, { ko: '그리워하다', zh: '怀念' }],
    similar: ['다시 돌아가고 싶어 (想回去)', '그 시절이 그립다 (怀念那时)'] },

  // —— 太阳的后裔 ——
  { id: 'desc-1', drama: '太阳的后裔', year: 2016, theme: '爱情', level: '入门', color: ['#FF9A8B', '#FF6A88'],
    ko: '사랑해. 다 신경 안 써', roman: 'sa-rang-hae. da sin-gyeong an sseo', zh: '我爱你，其他我都不在乎',
    grammar: '-아/어도：让步「即使…也」；신경 쓰다＝在意',
    vocab: [{ ko: '신경 쓰다', zh: '在意' }, { ko: '다', zh: '都' }],
    similar: ['모든 걸 다 줄게 (我给你一切)', '너만 있으면 돼 (有你就够了)'] },
  { id: 'desc-2', drama: '太阳的后裔', year: 2016, theme: '人生', level: '日常', color: ['#A8E063', '#56AB2F'],
    ko: '지키고 싶은 게 있으면 강해져야 해', roman: 'ji-ki-go si-peun ge i-sseu-myeon gang-hae-jyeo-ya hae', zh: '有想守护的东西，就必须变强',
    grammar: '-(으)면：条件「如果…就」；-아/어지다：变得…',
    vocab: [{ ko: '지키다', zh: '守护' }, { ko: '강해지다', zh: '变强' }],
    similar: ['너를 지킬게 (我会守护你)', '더 강해질게 (我会更强)'] },

  // —— 爱的迫降 ——
  { id: 'cloy-1', drama: '爱的迫降', year: 2019, theme: '爱情', level: '日常', color: ['#FBC7D4', '#9795EF'],
    ko: '내일 만나자. 약속해', roman: 'nae-il man-na-ja. yak-sok-hae', zh: '明天见吧，说好了',
    grammar: '-자：共动形，「一起…吧」，亲密的约定语气',
    vocab: [{ ko: '내일', zh: '明天' }, { ko: '약속', zh: '约定' }],
    similar: ['꼭 다시 만나 (一定要再见面)', '기다릴게 (我会等你)'] },

  // —— 来自星星的你 ——
  { id: 'star-1', drama: '来自星星的你', year: 2013, theme: '爱情', level: '入门', color: ['#4B79A1', '#283E51'],
    ko: '네 옆에 있을게', roman: 'ne yeo-pe i-sseul-ge', zh: '我会一直在你身边',
    grammar: '-(으)ㄹ게：主语为「我」的承诺语气，「我会…」',
    vocab: [{ ko: '옆', zh: '身边' }, { ko: '있다', zh: '在' }],
    similar: ['절대 안 떠날게 (绝不离开)', '함께 할게 (我会陪你一起)'] },

  // —— 鱿鱼游戏 ——
  { id: 'sqd-1', drama: '鱿鱼游戏', year: 2021, theme: '人生', level: '入门', color: ['#E94057', '#F27121'],
    ko: '우리 뭉쳐 있으면 살 수 있어', roman: 'u-ri mung-chyeo i-sseu-myeon sal su i-sseo', zh: '我们抱在一起就能活下去',
    grammar: '-(으)면：条件「如果…就」；뭉치다＝抱团',
    vocab: [{ ko: '뭉치다', zh: '抱团' }, { ko: '살다', zh: '活' }],
    similar: ['같이 하자 (一起吧)', '포기하지 마 (别放弃)'] },
  { id: 'sqd-2', drama: '鱿鱼游戏', year: 2021, theme: '人生', level: '日常', color: ['#C06C84', '#6C5B7B'],
    ko: '여기서 나가고 싶어', roman: 'yeo-gi-seo na-ga-go si-peo', zh: '我想离开这里',
    grammar: '-고 싶다：表示愿望「想…」，最基础的意愿表达',
    vocab: [{ ko: '나가다', zh: '出去' }, { ko: '여기', zh: '这里' }],
    similar: ['집에 가고 싶어 (想回家)', '자유롭고 싶어 (想自由)'] },

  // —— 我的解放日志 ——
  { id: 'lib-1', drama: '我的解放日志', year: 2022, theme: '治愈', level: '进阶', color: ['#D4FC79', '#96E6A1'],
    ko: '언젠가 우리가 기대지 않고도 웃을 수 있기를', roman: 'eon-jen-ga u-ri-ga gwi-de-ji an-ko-do u-seul su it-geu-reul', zh: '愿有一天我们不用强撑也能笑出来',
    grammar: '-기를：愿望句尾「希望…」，常与 바라다/기원하다 搭配',
    vocab: [{ ko: '기대다', zh: '强撑/寄望' }, { ko: '웃다', zh: '笑' }],
    similar: ['행복했으면 좋겠어 (希望你能幸福)', '응원할게 (我会为你加油)'] },
  { id: 'lib-2', drama: '我的解放日志', year: 2022, theme: '治愈', level: '日常', color: ['#E0C3FC', '#8EC5FC'],
    ko: '오늘 하루만큼은 나를 칭찬해', roman: 'o-neul ha-ru-man-keu-meun na-reul chin-chan-hae', zh: '就在今天，夸一夸自己吧',
    grammar: '만큼은：「就…（这一天）」限定强调',
    vocab: [{ ko: '칭찬하다', zh: '称赞' }, { ko: '하루', zh: '一天' }],
    similar: ['수고했어 (辛苦了)', '잘했어 (你做得很好)'] },

  // —— 非常律师禹英禑 ——
  { id: 'woo-1', drama: '非常律师禹英禑', year: 2022, theme: '成长', level: '日常', color: ['#8EC5FC', '#E0C3FC'],
    ko: '백 번을 물어도 괜찮아', roman: 'baek beo-neul mu-leo-do gwaen-chan-a', zh: '问一百次也没关系',
    grammar: '-아/어도：让步「即使…也」；백 번＝一百次（夸张强调）',
    vocab: [{ ko: '물어보다', zh: '问' }, { ko: '괜찮다', zh: '没关系' }],
    similar: ['모르면 물어봐 (不懂就问)', '천천히 해도 돼 (慢慢来也可以)'] },
  { id: 'woo-2', drama: '非常律师禹英禑', year: 2022, theme: '人生', level: '进阶', color: ['#FDCB6E', '#E17055'],
    ko: '너를 좋아하게 된 건 내 인생에서 가장 좋은 일이야', roman: 'neo-reul jo-a-ha-ge doen geon nae in-saeng-e-seo ga-jang jo-eun i-ri-ya', zh: '喜欢上你，是我人生中最美好的事',
    grammar: '-(으)ㄴ/ㄴ 것：动词名词化，「…这件事」',
    vocab: [{ ko: '인생', zh: '人生' }, { ko: '가장', zh: '最' }],
    similar: ['너라서 좋아 (因为是你所以喜欢)', '고마운 존재야 (你是我的恩人)'] },

  // —— 泪之女王 ——
  { id: 'qtq-1', drama: '泪之女王', year: 2024, theme: '爱情', level: '进阶', color: ['#F5B7D0', '#B8A9E8'],
    ko: '끝까지 함께하겠다고 약속했잖아', roman: 'kkeut-kka-ji ham-kke-ha-get-da-go yak-sok-haet-jan-a', zh: '不是说好了要陪到最后吗',
    grammar: '-잖아：提醒对方「不是…嘛」，带撒娇或责备语气',
    vocab: [{ ko: '끝까지', zh: '到最后' }, { ko: '함께하다', zh: '一起' }],
    similar: ['절대 떠나지 마 (绝对别走)', '곁에 있어 줘 (留在我身边)'] },

  // —— 黑暗荣耀 ——
  { id: 'glo-1', drama: '黑暗荣耀', year: 2022, theme: '成长', level: '进阶', color: ['#232526', '#414345'],
    ko: '나는 오늘도 조금씩 걸어갈 거야', roman: 'na-neun o-neul-do jo-geum-sik geo-reo-gal geo-ya', zh: '我今天也会一步一步走下去',
    grammar: '-(으)ㄹ 거야：将来意志「我会…」；조금씩＝一点一点地',
    vocab: [{ ko: '조금씩', zh: '一点一点' }, { ko: '걷다', zh: '走' }],
    similar: ['포기하지 않을 거야 (我不会放弃)', '계속 나아갈 거야 (我会继续前进)'] },

  // —— 通用暖心补充（ filler 保底，主题覆盖） ——
  { id: 'warm-1', drama: '韩剧通用', year: 0, theme: '友情', level: '入门', color: ['#FFE259', '#FFA751'],
    ko: '네 편이야', roman: 'ne pyeon-i-ya', zh: '我站在你这边',
    grammar: '네 편＝你的那一侧，「我挺你」的地道说法',
    vocab: [{ ko: '편', zh: '那边/一派' }],
    similar: ['같이 가자 (一起走吧)', '너만 믿어 (我只信你)'] },
  { id: 'warm-2', drama: '韩剧通用', year: 0, theme: '治愈', level: '入门', color: ['#A1FFCE', '#FAFFD1'],
    ko: '잘 자, 좋은 꿈 꿔', roman: 'jal ja, jo-eun kkum kkwo', zh: '晚安，做个好梦',
    grammar: '좋은 꿈 꾸다＝做好梦，睡前固定表达',
    vocab: [{ ko: '꿈', zh: '梦' }, { ko: '자다', zh: '睡' }],
    similar: ['푹 자 (睡个好觉)', '내일 봐 (明天见)'] },
  { id: 'warm-3', drama: '韩剧通用', year: 0, theme: '职场', level: '日常', color: ['#485563', '#29323C'],
    ko: '오늘도 수고 많았어', roman: 'o-neul-do su-go man-a-sseo', zh: '今天也辛苦了',
    grammar: '-도：「也」；수고하다 是职场最常用的慰问语',
    vocab: [{ ko: '수고', zh: '辛苦' }, { ko: '오늘도', zh: '今天也' }],
    similar: ['고생했어 (受累了)', '퇴근 후 잘 쉬어 (下班好好休息)'] },
  { id: 'warm-4', drama: '韩剧通用', year: 0, theme: '职场', level: '日常', color: ['#3A6073', '#16222A'],
    ko: '이번 일은 내가 책임질게', roman: 'i-beon i-reun nae-ga chaek-im-jil-ge', zh: '这件事我来负责',
    grammar: '-(으)ㄹ게：承诺语气「我来…」，职场担当表达',
    vocab: [{ ko: '책임지다', zh: '负责' }, { ko: '이번 일', zh: '这件事' }],
    similar: ['제가 할게요 (我来做)', '맡겨 주세요 (交给我)'] },
  { id: 'warm-5', drama: '韩剧通用', year: 0, theme: '离别', level: '入门', color: ['#C9D6FF', '#E2E2E2'],
    ko: '안녕, 잘 지내', roman: 'an-nyeong, jal ji-nae', zh: '再见，要好好过',
    grammar: '잘 지내다＝过得好，告别时的祝愿',
    vocab: [{ ko: '지내다', zh: '过活' }, { ko: '안녕', zh: '再见/你好' }],
    similar: ['행운을 빌어 (祝你好运)', '건강해야 해 (要健康啊)'] }
];

// 今日名句：按日期确定性选取（同一天所有人看到的相同，有「每日」仪式感）
export function dailyQuote() {
  const d = new Date();
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return QUOTES[seed % QUOTES.length];
}

// 主题/剧集/难度枚举（筛选器用）
export const THEMES = ['爱情', '友情', '人生', '成长', '离别', '治愈', '职场'];
export const LEVELS = ['入门', '日常', '进阶'];
export const DRAMAS = [...new Set(QUOTES.map((q) => q.drama))];
