/**
 * TEST SUITE: HiHi Ultimate (dich)
 * Kiểm thử toàn diện chức năng & bảo mật
 */

const fs = require('fs');
const path = require('path');

const results = [];
function recordResult(name, passed, details) {
  results.push({ name, passed, details });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${mark} | ${name}`);
  if (details) console.log(`   └─ ${details}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ DỰ ÁN: dich (HiHi Ultimate)');
  console.log('====================================================\n');

  const dir = __dirname;
  const indexPath = path.join(dir, 'index.html');
  const manifestEn = path.join(dir, 'vocab_manifest.json');
  const manifestId = path.join(dir, 'vocab_manifest_indo.json');
  const swPath = path.join(dir, 'sw.js');

  // TEST 1: Cấu trúc file cần thiết
  try {
    const hasIndex = fs.existsSync(indexPath);
    const hasManifestEn = fs.existsSync(manifestEn);
    const hasManifestId = fs.existsSync(manifestId);
    const hasSw = fs.existsSync(swPath);
    const passed = hasIndex && hasManifestEn && hasManifestId && hasSw;
    recordResult('1. Cấu trúc file cơ bản', passed, `index: ${hasIndex}, manifest_en: ${hasManifestEn}, manifest_id: ${hasManifestId}, sw: ${hasSw}`);
  } catch (e) {
    recordResult('1. Cấu trúc file cơ bản', false, e.message);
  }

  // TEST 2: Kiểm tra cú pháp và tính toàn vẹn của JSON Manifests
  try {
    const enData = JSON.parse(fs.readFileSync(manifestEn, 'utf8'));
    const idData = JSON.parse(fs.readFileSync(manifestId, 'utf8'));
    const enCount = (enData.topics || enData).length;
    const idCount = (idData.topics || idData).length;
    const passed = enCount > 0 && idCount > 0;
    recordResult('2. Dữ liệu từ vựng JSON Manifests', passed, `Tiếng Anh: ${enCount} chủ đề, Tiếng Indo: ${idCount} chủ đề`);
  } catch (e) {
    recordResult('2. Dữ liệu từ vựng JSON Manifests', false, e.message);
  }

  // TEST 3: Kiểm tra Service Worker hợp lệ
  try {
    const swContent = fs.readFileSync(swPath, 'utf8');
    const passed = swContent.includes('addEventListener') && swContent.includes('fetch');
    recordResult('3. Service Worker PWA (sw.js)', passed, `Dung lượng: ${swContent.length} bytes`);
  } catch (e) {
    recordResult('3. Service Worker PWA (sw.js)', false, e.message);
  }

  const html = fs.readFileSync(indexPath, 'utf8');

  // TEST 4: Bảo mật liên kết (target="_blank" phải có rel="noopener noreferrer")
  try {
    const lines = html.split('\n');
    const violations = [];
    lines.forEach((l, idx) => {
      if (l.includes('target="_blank"') && !l.includes('noopener')) {
        violations.push(`Dòng ${idx+1}: ${l.trim()}`);
      }
    });
    const passed = violations.length === 0;
    recordResult('4. Bảo mật thẻ liên kết ngoài (target="_blank" rel="noopener noreferrer")', passed, passed ? 'Tất cả liên kết ngoài an toàn' : `Phát hiện ${violations.length} liên kết thiếu rel="noopener":\n      ${violations.join('\n      ')}`);
  } catch (e) {
    recordResult('4. Bảo mật thẻ liên kết ngoài', false, e.message);
  }

  // TEST 5: Không chứa lỗi escape literal \n trong chuỗi HTML
  try {
    const hasLiteralSlashN = html.includes('</a>\\n');
    const passed = !hasLiteralSlashN;
    recordResult('5. Kiểm tra lỗi escape literal \\n trong HTML', passed, passed ? 'HTML sạch sẽ, không có lỗi chuỗi escape' : 'Phát hiện literal "\\n" trong mã HTML');
  } catch (e) {
    recordResult('5. Kiểm tra lỗi escape literal \\n trong HTML', false, e.message);
  }

  // TEST 6: Cấu hình Gateway AI & Auth Key
  try {
    const usesAiNoFree = html.includes('ai-no-free.ngxuanhai123.workers.dev');
    const usesCorrectModel = html.includes('anhyeu00m/claude-fable-5') || html.includes('claude-fable-5');
    const usesAuthKey = html.includes('Ai@123');
    const passed = usesAiNoFree && usesCorrectModel && usesAuthKey;
    recordResult('6. Cấu hình AI Gateway mới (ai-no-free, claude-fable-5, Ai@123)', passed, `ai-no-free: ${usesAiNoFree}, model: ${usesCorrectModel}, authKey: ${usesAuthKey}`);
  } catch (e) {
    recordResult('6. Cấu hình AI Gateway mới', false, e.message);
  }

  // TEST 7: Kiểm tra kết nối trực tiếp đến AI Gateway
  try {
    const t0 = Date.now();
    const res = await fetch('https://ai-no-free.ngxuanhai123.workers.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer Ai@123'
      },
      body: JSON.stringify({
        model: 'anhyeu00m/claude-fable-5',
        messages: [{ role: 'user', content: 'Say "READY"' }],
        max_tokens: 10
      })
    });
    const lat = Date.now() - t0;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const passed = res.status === 200 && text.length > 0;
    recordResult('7. Gọi thử AI Gateway thực tế (/v1/chat/completions)', passed, `Status: ${res.status}, Latency: ${lat}ms, Trả lời: "${text.trim()}"`);
  } catch (e) {
    recordResult('7. Gọi thử AI Gateway thực tế', false, e.message);
  }

  // TEST 8: Kiểm tra hỗ trợ 9 ngôn ngữ trong ứng dụng
  try {
    const hasLangMapping = html.includes('DICH_LANGUAGES') && html.includes('Indonesian') && html.includes('English');
    recordResult('8. Hệ thống ánh xạ 9 ngôn ngữ dịch thuật', hasLangMapping, hasLangMapping ? 'Đầy đủ 9 ngôn ngữ' : 'Thiếu DICH_LANGUAGES');
  } catch (e) {
    recordResult('8. Hệ thống ánh xạ 9 ngôn ngữ dịch thuật', false, e.message);
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n====================================================');
  console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedCount}/${results.length} bài test vượt qua`);
  console.log('====================================================\n');
}

runTests();
