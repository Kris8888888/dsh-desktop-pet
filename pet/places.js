/**
 * 22 travel destinations. Each card is drawn procedurally in a chunky pixel
 * style, so the pet can bring back a postcard without shipping image assets.
 */
export const PLACES = [
  {
    id: "kyoto", name: "京都", country: "日本", kind: "temple",
    palette: { sky: "#F7D9C4", sky2: "#F2B8A0", sun: "#FFE7B0", far: "#C98A7A", mid: "#8C5B57", near: "#5C3A3C", accent: "#E86A4A", water: "#9FC7C9" },
    note: "在鸭川边坐了很久。风把樱花吹到水面上，像一小片会漂的星星。给你带了一枚御守，放在日记里啦。",
  },
  {
    id: "hokkaido", name: "北海道", country: "日本", kind: "snow",
    palette: { sky: "#BFD9F2", sky2: "#E8F2FB", sun: "#FFF4CE", far: "#A9C3DA", mid: "#7E9BB5", near: "#4F6A84", accent: "#FFFFFF", water: "#D6E8F5" },
    note: "雪厚得能把我埋起来。踩下去会「咯吱」一声，我录了 7 秒，回来放给你听。",
  },
  {
    id: "iceland", name: "冰岛", country: "冰岛", kind: "aurora",
    palette: { sky: "#14263F", sky2: "#1E3D5C", sun: "#D8F5E6", far: "#2F6B62", mid: "#244F55", near: "#172F38", accent: "#6CF0C2", water: "#2B5866" },
    note: "极光像一条慢慢翻身的绿鲸鱼。我对着它许愿：希望你今天少改两版需求。",
  },
  {
    id: "sahara", name: "撒哈拉", country: "摩洛哥", kind: "desert",
    palette: { sky: "#FFCF8A", sky2: "#FF9E6B", sun: "#FFF0B8", far: "#D98B54", mid: "#B96C3F", near: "#8A4B2E", accent: "#FFE1A8", water: "#C98B58" },
    note: "沙子是暖的，风是干的。我把自己埋进沙里只露出眼睛，差点被一只甲虫当成石头。",
  },
  {
    id: "paris", name: "巴黎", country: "法国", kind: "tower",
    palette: { sky: "#DCE6F7", sky2: "#F4DDE2", sun: "#FFE9C2", far: "#A9B6CE", mid: "#7C88A6", near: "#4E5874", accent: "#E8B45A", water: "#AFC7DD" },
    note: "铁塔整点会闪。我在草坪上吃了一块可颂，掉了很多渣，鸽子比我吃得干净。",
  },
  {
    id: "santorini", name: "圣托里尼", country: "希腊", kind: "island",
    palette: { sky: "#BFE6FF", sky2: "#E9F7FF", sun: "#FFE38F", far: "#6FA8D6", mid: "#FFFFFF", near: "#3E7FB0", accent: "#3F7BD6", water: "#5DB7DE" },
    note: "白墙蓝顶，海风把晾着的床单吹成一面旗。我坐在台阶上看了半小时落日，什么都没想。",
  },
  {
    id: "venice", name: "威尼斯", country: "意大利", kind: "canal",
    palette: { sky: "#F6D9C8", sky2: "#F8C2A6", sun: "#FFE7B8", far: "#C98E79", mid: "#9C6157", near: "#6B3F42", accent: "#3E8E9E", water: "#6FAEB8" },
    note: "坐贡多拉的时候我有点晕。船夫唱歌，我跟着哼，调子跑到隔壁运河去了。",
  },
  {
    id: "swiss", name: "少女峰", country: "瑞士", kind: "mountain",
    palette: { sky: "#A8D4F0", sky2: "#E6F4FF", sun: "#FFF2C4", far: "#7EA6C4", mid: "#5C7E98", near: "#35505F", accent: "#FFFFFF", water: "#8FC0D8" },
    note: "山顶的云就在脚边。我对着山谷喊了一声，回声是「早点休息」。可能是你偷偷回的吧。",
  },
  {
    id: "lisbon", name: "里斯本", country: "葡萄牙", kind: "tram",
    palette: { sky: "#FFD9A8", sky2: "#FFB98A", sun: "#FFF0C0", far: "#D99266", mid: "#B56A4E", near: "#7C4438", accent: "#F2C14E", water: "#7FB3C8" },
    note: "28 路电车摇摇晃晃，像坐在一个铁皮摇篮里。我在终点站买了一枚蛋挞，烫到舌头。",
  },
  {
    id: "barcelona", name: "巴塞罗那", country: "西班牙", kind: "city",
    palette: { sky: "#BFE8F5", sky2: "#FDE9C8", sun: "#FFE08A", far: "#86AFC0", mid: "#C97E5A", near: "#6E4A44", accent: "#F06A4E", water: "#57B4C9" },
    note: "高迪的房子没有一条直线。我在屋顶上走了一圈，觉得自己也弯弯曲曲的。",
  },
  {
    id: "amsterdam", name: "阿姆斯特丹", country: "荷兰", kind: "canal",
    palette: { sky: "#CADCED", sky2: "#EDF3F8", sun: "#F7E9B8", far: "#8FA7B8", mid: "#7B5B4E", near: "#4E3A36", accent: "#D96A4A", water: "#6E9FB0" },
    note: "自行车比人多。我借了一辆，骑了三米就撞进花丛，郁金香替我挡了一下。",
  },
  {
    id: "berlin", name: "柏林", country: "德国", kind: "city",
    palette: { sky: "#C9D3DF", sky2: "#E9EEF2", sun: "#F2E7C8", far: "#8D98A6", mid: "#5F6A78", near: "#3E4650", accent: "#E05A4E", water: "#7E97A6" },
    note: "在墙边看了一下午的涂鸦。有一整面墙画着蓝色的鲸鱼，我假装那是我。",
  },
  {
    id: "newyork", name: "纽约", country: "美国", kind: "skyline",
    palette: { sky: "#F2B98E", sky2: "#C97A8C", sun: "#FFD98A", far: "#8B6E86", mid: "#5E5068", near: "#332E44", accent: "#FFD75E", water: "#4E6B86" },
    note: "楼高得看不到顶。我在中央公园的椅子上坐着，看松鼠抢热狗，比看夜景还认真。",
  },
  {
    id: "sanfrancisco", name: "旧金山", country: "美国", kind: "bridge",
    palette: { sky: "#F7C9A8", sky2: "#F2A38E", sun: "#FFE6B0", far: "#C27A6C", mid: "#8F5A58", near: "#5A3E48", accent: "#E04E3C", water: "#6E93A8" },
    note: "雾从桥洞里钻出来，像一大团棉花糖。我伸手抓了一把，什么也没有，但手心是凉的。",
  },
  {
    id: "vancouver", name: "温哥华", country: "加拿大", kind: "forest",
    palette: { sky: "#B9DCE8", sky2: "#E8F3F0", sun: "#FBE9B8", far: "#6E9E8A", mid: "#3F735F", near: "#255044", accent: "#E8C25A", water: "#4D8A8C" },
    note: "雨下得很细，像有人在天上筛面粉。我在杉树底下躲雨，顺便认识了 three 只松鼠。",
  },
  {
    id: "sydney", name: "悉尼", country: "澳大利亚", kind: "harbor",
    palette: { sky: "#B8E2FF", sky2: "#E7F6FF", sun: "#FFE28A", far: "#6FA8C9", mid: "#3D7C9E", near: "#2A566E", accent: "#F2F2F2", water: "#3F9AB8" },
    note: "歌剧院的屋顶像一排张开的贝壳。我在台阶上听街头艺人唱歌，他唱跑调了，但很好听。",
  },
  {
    id: "melbourne", name: "墨尔本", country: "澳大利亚", kind: "city",
    palette: { sky: "#D8D2E8", sky2: "#F2DDE8", sun: "#FFE6B0", far: "#A08FA8", mid: "#6E5E7A", near: "#443A52", accent: "#E06A8A", water: "#7E8FA8" },
    note: "巷子里的咖啡香得离谱。我点了一杯 flat white，店员问我「要画拉花吗」，我说要一只鲸鱼。",
  },
  {
    id: "singapore", name: "新加坡", country: "新加坡", kind: "skyline",
    palette: { sky: "#23304F", sky2: "#3D4E78", sun: "#FFE08A", far: "#3E4A6E", mid: "#2A3354", near: "#151B32", accent: "#59E0C0", water: "#1E3A4E" },
    note: "晚上十点还热得像中午。滨海湾的灯在水里抖，我买了一碗冰，吃到一半就化了。",
  },
  {
    id: "taipei", name: "台北", country: "中国台湾", kind: "city",
    palette: { sky: "#E8C9D8", sky2: "#F7DDE2", sun: "#FFE9B0", far: "#B08A9E", mid: "#7E5E72", near: "#4E3A4E", accent: "#E8B84E", water: "#7FA8B8" },
    note: "夜市人挤人。我吃了蚵仔煎、珍珠奶茶和一根烤香肠，最后被一块臭豆腐劝退。",
  },
  {
    id: "chengdu", name: "成都", country: "中国", kind: "bamboo",
    palette: { sky: "#D8E8D0", sky2: "#F2F4DE", sun: "#FFEBB0", far: "#8FAE7E", mid: "#5E8458", near: "#3A5A3E", accent: "#E8A84E", water: "#7FAE9E" },
    note: "在茶馆坐了一下午，竹椅吱呀吱呀。旁边的大爷教我认了三只熊猫，其实我一只都没分清。",
  },
  {
    id: "dali", name: "大理", country: "中国", kind: "lake",
    palette: { sky: "#BFE2F0", sky2: "#F7EFD8", sun: "#FFE6A8", far: "#8FB8C8", mid: "#5E8FA8", near: "#3E5E70", accent: "#F2C46A", water: "#6FAEC8" },
    note: "洱海的风把云吹得很低。我坐在客栈屋顶，看了一晚上星星，差点忘了回家。",
  },
  {
    id: "dunhuang", name: "敦煌", country: "中国", kind: "desert",
    palette: { sky: "#F2C98A", sky2: "#E89E6A", sun: "#FFF0C0", far: "#C98A5E", mid: "#A86648", near: "#7A4634", accent: "#E8C25A", water: "#B8845E" },
    note: "鸣沙山的沙子会响。我滚下去的时候，背包里掉出一枚硬币，也算给沙漠留了点纪念。",
  },
];

export function pickPlace(random = Math.random) {
  return PLACES[Math.floor(random() * PLACES.length)];
}

export function placeById(id) {
  return PLACES.find((place) => place.id === id) ?? PLACES[0];
}
