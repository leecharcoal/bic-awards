const { Client } = require('@notionhq/client');
const fs = require('fs');
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const dbId = process.env.NOTION_DB_ID;

function getProp(page, name, type) {
  const prop = page.properties[name];
  if (!prop) return '';
  switch (type) {
    case 'title':    return prop.title?.[0]?.plain_text || '';
    case 'text':     return prop.rich_text?.[0]?.plain_text || '';
    case 'number':   return prop.number || 0;
    case 'select':   return prop.select?.name || '';
    case 'url':      return prop.url || '';
    case 'checkbox': return prop.checkbox || false;
    default:         return '';
  }
}

const CAT_MAP = {
  '그랑프리': 'grand-prix',
  '심사위원상(일반)': 'jury-general',
  '라이징스타': 'rising-star',
  '심사위원상(루키)': 'jury-rookie',
  '아트': 'art',
  '게임디자인': 'design',
  '실험성': 'experimental',
  '서사': 'narrative',
  '캐주얼': 'casual',
  '이스포츠': 'esports',
  '오디오': 'audio',
  '소셜임팩트': 'social',
  '액션': 'action',
  // 과거 부문
  '베스트 부스': 'booth',
  '베스트부스': 'booth',
  'best booth': 'booth',
  '관객심사': 'audience',
  '관객 심사': 'audience',
  'audience choice': 'audience',
};

const DIV_MAP = {
  '일반부문': 'general',
  '루키부문': 'rookie',
};

async function main() {
  console.log('Fetching Notion data...');
  const awards = [];
  let cursor = undefined;

  while (true) {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: {
        property: '공개여부',
        checkbox: { equals: true }
      },
      sorts: [{ property: '연도', direction: 'descending' }],
      ...(cursor ? { start_cursor: cursor } : {}),
      page_size: 100,
    });

    for (const page of res.results) {
      const catRaw = getProp(page, '수상부문', 'select');
      const divRaw = getProp(page, '전시부문', 'select');
      awards.push({
        id:       page.id,
        gameKo:   getProp(page, '게임명_KR', 'title'),
        gameEn:   getProp(page, '게임명_EN', 'text'),
        year:     getProp(page, '연도', 'number'),
        division: DIV_MAP[divRaw] || '',
        catId:    CAT_MAP[catRaw] || CAT_MAP[catRaw?.toLowerCase()] || '',
        catKo:    catRaw,
        type:     getProp(page, '카드타입', 'select'),
        studio:   getProp(page, '스튜디오_KR', 'text'),
        studioEn: getProp(page, '스튜디오_EN', 'text'),
        country:  getProp(page, '국가', 'text'),
        descKo:   getProp(page, '한줄평_KR', 'text'),
        descEn:   getProp(page, '한줄평_EN', 'text'),
        img:      getProp(page, '이미지_URL', 'url'),
        steam:    getProp(page, '스팀링크', 'url'),
      });
    }

    if (!res.has_more) break;
    cursor = res.next_cursor;
  }

  console.log(`Fetched ${awards.length} awards`);

  if (!fs.existsSync('public')) fs.mkdirSync('public');
  fs.writeFileSync(
    'public/data.json',
    JSON.stringify({ awards, updatedAt: new Date().toISOString() }, null, 2)
  );
  console.log('Saved to public/data.json');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
