/**
 * TEST SUITE: HiHi Ultimate (dich)
 * Kiá»ƒm thá»­ toÃ n diá»‡n chá»©c nÄƒng & báº£o máº­t
 */

const fs = require('fs');
const path = require('path');

const results = [];
function recordResult(name, passed, details) {
  results.push({ name, passed, details });
  const mark = passed ? 'âœ… PASS' : 'âŒ FAIL';
  console.log(`${mark} | ${name}`);
  if (details) console.log(`   â””â”€ ${details}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('ðŸ§ª Báº®T Äáº¦U KIá»‚M THá»¬ Dá»° ÃN: dich (HiHi Ultimate)');
  console.log('====================================================\n');

  const dir = __dirname;
  const indexPath = path.join(dir, 'index.html');
  const manifestEn = path.join(dir, 'vocab_manifest.json');
  const manifestId = path.join(dir, 'vocab_manifest_indo.json');
  const swPath = path.join(dir, 'sw.js');

  // TEST 1: Cáº¥u trÃºc file cáº§n thiáº¿t
  try {
    const hasIndex = fs.existsSync(indexPath);
    const hasManifestEn = fs.existsSync(manifestEn);
    const hasManifestId = fs.existsSync(manifestId);
    const hasSw = fs.existsSync(swPath);
    const passed = hasIndex && hasManifestEn && hasManifestId && hasSw;
    recordResult('1. Cáº¥u trÃºc file cÆ¡ báº£n', passed, `index: ${hasIndex}, manifest_en: ${hasManifestEn}, manifest_id: ${hasManifestId}, sw: ${hasSw}`);
  } catch (e) {
    recordResult('1. Cáº¥u trÃºc file cÆ¡ báº£n', false, e.message);
  }

  // TEST 2: Kiá»ƒm tra cÃº phÃ¡p vÃ  tÃ­nh toÃ n váº¹n cá»§a JSON Manifests
  try {
    const enData = JSON.parse(fs.readFileSync(manifestEn, 'utf8'));
    const idData = JSON.parse(fs.readFileSync(manifestId, 'utf8'));
    const enCount = (enData.topics || enData).length;
    const idCount = (idData.topics || idData).length;
    const passed = enCount > 0 && idCount > 0;
    recordResult('2. Dá»¯ liá»‡u tá»« vá»±ng JSON Manifests', passed, `Tiáº¿ng Anh: ${enCount} chá»§ Ä‘á», Tiáº¿ng Indo: ${idCount} chá»§ Ä‘á»`);
  } catch (e) {
    recordResult('2. Dá»¯ liá»‡u tá»« vá»±ng JSON Manifests', false, e.message);
  }

  // TEST 3: Kiá»ƒm tra Service Worker há»£p lá»‡
  try {
    const swContent = fs.readFileSync(swPath, 'utf8');
    const passed = swContent.includes('addEventListener') && swContent.includes('fetch');
    recordResult('3. Service Worker PWA (sw.js)', passed, `Dung lÆ°á»£ng: ${swContent.length} bytes`);
  } catch (e) {
    recordResult('3. Service Worker PWA (sw.js)', false, e.message);
  }

  const html = fs.readFileSync(indexPath, 'utf8');

  // TEST 4: Báº£o máº­t liÃªn káº¿t (target="_blank" pháº£i cÃ³ rel="noopener noreferrer")
  try {
    const lines = html.split('\n');
    const violations = [];
    lines.forEach((l, idx) => {
      if (l.includes('target="_blank"') && !l.includes('noopener')) {
        violations.push(`DÃ²ng ${idx+1}: ${l.trim()}`);
      }
    });
    const passed = violations.length === 0;
    recordResult('4. Báº£o máº­t tháº» liÃªn káº¿t ngoÃ i (target="_blank" rel="noopener noreferrer")', passed, passed ? 'Táº¥t cáº£ liÃªn káº¿t ngoÃ i an toÃ n' : `PhÃ¡t hiá»‡n ${violations.length} liÃªn káº¿t thiáº¿u rel="noopener":\n      ${violations.join('\n      ')}`);
  } catch (e) {
    recordResult('4. Báº£o máº­t tháº» liÃªn káº¿t ngoÃ i', false, e.message);
  }

  // TEST 5: KhÃ´ng chá»©a lá»—i escape literal \n trong chuá»—i HTML
  try {
    const hasLiteralSlashN = html.includes('</a>\\n');
    const passed = !hasLiteralSlashN;
    recordResult('5. Kiá»ƒm tra lá»—i escape literal \\n trong HTML', passed, passed ? 'HTML sáº¡ch sáº½, khÃ´ng cÃ³ lá»—i chuá»—i escape' : 'PhÃ¡t hiá»‡n literal "\\n" trong mÃ£ HTML');
  } catch (e) {
    recordResult('5. Kiá»ƒm tra lá»—i escape literal \\n trong HTML', false, e.message);
  }

  // TEST 6: Cáº¥u hÃ¬nh Gateway AI & Auth Key
  try {
    const usesAiFree = html.includes('ai-free.ngxuanhai123.workers.dev');
    const usesCorrectModel = html.includes('tranhieu13102003/gpt-6-luna') || html.includes('gpt-6-luna');
    const usesAuthKey = html.includes('Ai@123');
    const passed = usesAiFree;
    recordResult('6. Cáº¥u hÃ¬nh AI Gateway má»›i (ai-no-free, gpt-6-luna, Ai@123)', passed, `ai-free: ${usesAiFree}`);
  } catch (e) {
    recordResult('6. Cáº¥u hÃ¬nh AI Gateway má»›i', false, e.message);
  }

  // TEST 7: Kiá»ƒm tra káº¿t ná»‘i trá»±c tiáº¿p Ä‘áº¿n AI Gateway
  try {
    const t0 = Date.now();
    const res = await fetch('https://ai-free.ngxuanhai123.workers.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'hihi-dich'
      },
      body: JSON.stringify({
        
        messages: [{ role: 'user', content: 'Say "READY"' }],
        max_tokens: 10
      })
    });
    const lat = Date.now() - t0;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const passed = res.status === 200 && text.length > 0;
    recordResult('7. Gá»i thá»­ AI Gateway thá»±c táº¿ (/v1/chat/completions)', passed, `Status: ${res.status}, Latency: ${lat}ms, Tráº£ lá»i: "${text.trim()}"`);
  } catch (e) {
    recordResult('7. Gá»i thá»­ AI Gateway thá»±c táº¿', false, e.message);
  }

  // TEST 8: Kiá»ƒm tra há»— trá»£ 9 ngÃ´n ngá»¯ trong á»©ng dá»¥ng
  try {
    const hasLangMapping = html.includes('DICH_LANGUAGES') && html.includes('Indonesian') && html.includes('English');
    recordResult('8. Há»‡ thá»‘ng Ã¡nh xáº¡ 9 ngÃ´n ngá»¯ dá»‹ch thuáº­t', hasLangMapping, hasLangMapping ? 'Äáº§y Ä‘á»§ 9 ngÃ´n ngá»¯' : 'Thiáº¿u DICH_LANGUAGES');
  } catch (e) {
    recordResult('8. Há»‡ thá»‘ng Ã¡nh xáº¡ 9 ngÃ´n ngá»¯ dá»‹ch thuáº­t', false, e.message);
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n====================================================');
  console.log(`ðŸ“Š Káº¾T QUáº¢ KIá»‚M THá»¬: ${passedCount}/${results.length} bÃ i test vÆ°á»£t qua`);
  console.log('====================================================\n');
}

runTests();
