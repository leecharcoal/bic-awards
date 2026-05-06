const fs = require('fs');
const https = require('https');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = '353ba164001780d8afe3fe96fcf3049d';
const CSV_FILE = 'youtube_links.csv';

function notionRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.notion.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    if(data) req.write(data);
    req.end();
  });
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const result = [];
  for(let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const gameKo = parts[0]?.trim();
    const youtube = parts.slice(1).join(',').trim();
    if(gameKo && youtube) result.push({ gameKo, youtube });
  }
  return result;
}

function normalizeYoutube(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : url;
}

async function getAllPages() {
  const pages = [];
  let cursor = undefined;
  while(true) {
    const res = await notionRequest('POST', `/v1/databases/${DB_ID}/query`,
      cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 });
    pages.push(...res.results);
    if(!res.has_more) break;
    cursor = res.next_cursor;
  }
  return pages;
}

async function main() {
  console.log('CSV 읽는 중...');
  const csvData = parseCSV(fs.readFileSync(CSV_FILE, 'utf-8'));
  console.log(`${csvData.length}개 로드`);

  console.log('노션 DB 가져오는 중...');
  const pages = await getAllPages();
  console.log(`노션 ${pages.length}개 페이지 로드`);

  const pageMap = {};
  pages.forEach(page => {
    const gameKo = page.properties['게임명_KR']?.title?.[0]?.plain_text || '';
    if(gameKo) pageMap[gameKo] = page.id;
  });

  let success = 0, notFound = 0;
  for(const { gameKo, youtube } of csvData) {
    const pageId = pageMap[gameKo];
    if(!pageId) { console.log(`❌ 매칭 실패: "${gameKo}"`); notFound++; continue; }
    try {
      await notionRequest('PATCH', `/v1/pages/${pageId}`, {
        properties: { '유튜브링크': { url: normalizeYoutube(youtube) } }
      });
      console.log(`✅ "${gameKo}"`);
      success++;
      await new Promise(r => setTimeout(r, 350));
    } catch(e) {
      console.log(`⚠️ 오류: "${gameKo}"`);
    }
  }
  console.log(`\n완료 — 성공: ${success}, 매칭실패: ${notFound}`);
}

main().catch(err => { console.error(err); process.exit(1); });
